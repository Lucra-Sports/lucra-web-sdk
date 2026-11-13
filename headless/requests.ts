import {
  LucraClientMessageType,
  type MessageTypeToLucraClient,
} from "../types/types.js";
import {
  LucraError,
  LucraErrorCode,
  fromApiError,
  type RequestKind,
} from "./errors.js";
import type { InboundMessage, OutboundMessage } from "./frame.js";

// Describes one kind of request to the Lucra app.
export type RequestSpec<TResponse> = {
  type: MessageTypeToLucraClient;
  responseType: LucraClientMessageType;
  kind: RequestKind;
  // Writes only: a plain API_ERROR may still have gone through.
  unknownOnApiError?: boolean;
  // Returns true for an answer that means "not yet". The request stays pending
  // for the real answer Lucra sends on the same requestId.
  interim?: (data: TResponse) => boolean;
  // How long interim answers may keep extending the request, from when it was sent.
  maxTimeoutMs?: number;
};

export type Requests = {
  send<TResponse>(spec: RequestSpec<TResponse>, body?: unknown): Promise<TResponse>;
  // Settles the pending request this message answers. Returns true when the
  // message was an answer to one, so the caller does not also treat it as an event.
  handle(message: InboundMessage): boolean;
  rejectAll(code: "CONNECTION_RESET" | "DESTROYED"): void;
  pendingCount(): number;
};

type Pending = {
  type: MessageTypeToLucraClient;
  responseType: LucraClientMessageType;
  kind: RequestKind;
  unknownOnApiError: boolean;
  interim?: (data: unknown) => boolean;
  maxTimeoutMs?: number;
  resolve: (data: unknown) => void;
  reject: (error: LucraError) => void;
  timer: ReturnType<typeof setTimeout>;
  sentAt: number;
};

// Lucra reports a failed request with one of these instead of the response.
const ERROR_TYPES = new Set<string>([
  LucraClientMessageType.apiRequestError,
  LucraClientMessageType.joinTournamentError,
  LucraClientMessageType.autoJoinTournamentsError,
]);

// Unique per page load. crypto.randomUUID needs a secure context, so a counter it is.
let lastRequestId = 0;

export function createRequests(options: {
  post: (message: OutboundMessage) => void;
  timeoutMs: number;
  onTimeout?: (type: MessageTypeToLucraClient, timeoutMs: number) => void;
}): Requests {
  const pending = new Map<string, Pending>();

  const take = (requestId: string) => {
    const entry = pending.get(requestId);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(requestId);
    }
    return entry;
  };

  const startTimer = (requestId: string) =>
    setTimeout(() => {
      const entry = take(requestId);
      if (!entry) return;
      try {
        options.onTimeout?.(entry.type, options.timeoutMs);
      } catch {
        // Reporting is best effort. The request must still reject.
      }
      entry.reject(
        new LucraError(LucraErrorCode.TIMEOUT, undefined, {
          outcomeUnknown: entry.kind === "write",
        })
      );
    }, options.timeoutMs);

  return {
    send<TResponse>(spec: RequestSpec<TResponse>, body?: unknown) {
      const requestId = String(++lastRequestId);
      return new Promise<TResponse>((resolve, reject) => {
        pending.set(requestId, {
          type: spec.type,
          responseType: spec.responseType,
          kind: spec.kind,
          unknownOnApiError: spec.unknownOnApiError === true,
          interim: spec.interim as ((data: unknown) => boolean) | undefined,
          maxTimeoutMs: spec.maxTimeoutMs,
          resolve: resolve as (data: unknown) => void,
          reject,
          timer: startTimer(requestId),
          sentAt: Date.now(),
        });
        try {
          options.post({ type: spec.type, body: body ?? null, requestId });
        } catch (cause) {
          // For example a body that cannot be cloned. Nothing was sent.
          take(requestId);
          reject(
            new LucraError(
              LucraErrorCode.INVALID_ARGUMENT,
              "The request could not be sent",
              { cause }
            )
          );
        }
      });
    },

    handle(message) {
      // Lucra copies the requestId onto its answer. An answer with no id, or an
      // id that is no longer pending, belongs to nothing we are waiting for.
      if (message.requestId === undefined) return false;
      const entry = pending.get(message.requestId);
      if (!entry) return false;

      if (ERROR_TYPES.has(message.type)) {
        take(message.requestId);
        entry.reject(
          fromApiError(message.data as { code?: string; message?: string } | null, {
            kind: entry.kind,
            unknownOnApiError: entry.unknownOnApiError,
          })
        );
        return true;
      }
      if (message.type !== entry.responseType) return false;

      if (entry.interim?.(message.data)) {
        // "Not yet": keep waiting and restart the clock, but only until the
        // absolute deadline, so a responder stuck saying "not yet" still times out.
        if (
          entry.maxTimeoutMs === undefined ||
          Date.now() - entry.sentAt < entry.maxTimeoutMs
        ) {
          clearTimeout(entry.timer);
          entry.timer = startTimer(message.requestId);
        }
        return true;
      }
      take(message.requestId);
      entry.resolve(message.data);
      return true;
    },

    rejectAll(code) {
      for (const requestId of [...pending.keys()]) {
        const entry = take(requestId);
        entry?.reject(
          new LucraError(code, undefined, {
            outcomeUnknown: entry.kind === "write",
          })
        );
      }
    },

    pendingCount() {
      return pending.size;
    },
  };
}
