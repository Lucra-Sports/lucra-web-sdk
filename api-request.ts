import type { LucraClientMessageType, MessageTypeToLucraClient } from "./types/types.js";

const API_REQUEST_TIMEOUT_MS = 15_000;

// Unique per page load. crypto.randomUUID needs a secure context, so a counter it is.
let lastRequestId = 0;

type Pending<TResponse> = {
  resolve: (data: TResponse) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type ApiRequest<TResponse, TBody = void> = {
  readonly type: MessageTypeToLucraClient;
  readonly responseType: LucraClientMessageType;
  send: (body: TBody) => Promise<TResponse>;
  // Settle the pending request whose id matches. Without an id (a web-app build that does
  // not echo ids, or an app-initiated message such as automatic auto-join) settle the oldest.
  // An id that matches nothing is ignored: it belongs to a superseded or timed-out request.
  resolve: (data: TResponse, requestId?: string) => void;
  reject: (reason: unknown, requestId?: string) => void;
};

/**
 * Creates a request/response pair backed by promises. Each `send` posts the message with
 * a fresh `requestId`, which the web-app echoes on its response so concurrent calls settle
 * independently. Every request times out on its own after `timeoutMs`. With `singleFlight`
 * a new `send` cancels any pending request with `cancelReason` instead.
 */
export function createApiRequest<TResponse, TBody = void>({
  type,
  responseType,
  cancelReason,
  sendMessage,
  singleFlight = false,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
}: {
  type: MessageTypeToLucraClient;
  responseType: LucraClientMessageType;
  cancelReason: string;
  sendMessage: (message: unknown) => void;
  singleFlight?: boolean;
  timeoutMs?: number;
}): ApiRequest<TResponse, TBody> {
  // Insertion order is send order, which the id-less fallback relies on.
  const pending = new Map<string, Pending<TResponse>>();

  const take = (requestId?: string) => {
    const id = requestId ?? pending.keys().next().value;
    if (id === undefined) return undefined;
    const entry = pending.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(id);
    }
    return entry;
  };

  return {
    type,
    responseType,
    send: (body) => {
      // Single-flight keeps at most one request pending, so cancelling the oldest is enough.
      if (singleFlight) take()?.reject(cancelReason);
      const requestId = String(++lastRequestId);
      return new Promise<TResponse>((resolve, reject) => {
        const timer = setTimeout(() => take(requestId)?.reject("Timeout"), timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        sendMessage({ type, body: body ?? null, requestId });
      });
    },
    resolve: (data, requestId) => take(requestId)?.resolve(data),
    reject: (reason, requestId) => take(requestId)?.reject(reason),
  };
}
