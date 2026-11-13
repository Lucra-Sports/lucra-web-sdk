import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
} from "../types/types.js";
import { SDK_VERSION } from "../version.js";
import { LucraError, LucraErrorCode } from "./errors.js";
import { createEmitter } from "./events.js";
import type { Frame, InboundMessage } from "./frame.js";
import { createRequests, type RequestSpec } from "./requests.js";

export type Timeouts = {
  // How long one request waits for its answer.
  requestMs: number;
  // How long a call waits for Lucra to start.
  connectMs: number;
  // How long "not yet" answers may extend the login check.
  authCheckMaxMs: number;
  // How long to wait for loginSuccess after Lucra says a user is logged in.
  authReadyMs: number;
  // How long to wait for Lucra to confirm a logout.
  logoutMs: number;
};

export const DEFAULT_TIMEOUTS: Timeouts = {
  requestMs: 15_000,
  connectMs: 30_000,
  authCheckMaxMs: 60_000,
  authReadyMs: 15_000,
  logoutMs: 15_000,
};

export type SessionStatus = "connecting" | "connected" | "failed" | "destroyed";

// The live link to the Lucra app: connection state, requests, and inbound messages.
export type Session = {
  status(): SessionStatus;
  // Resolves once Lucra has started. Rejects when it cannot.
  whenConnected(): Promise<void>;
  // Runs every time Lucra starts, including after it restarts.
  onConnected(listener: () => void): () => void;
  // Sends a request now. Callers wait for the connection first.
  request<TResponse>(spec: RequestSpec<TResponse>, body?: unknown): Promise<TResponse>;
  // Sends a message that has no answer.
  post(type: MessageTypeToLucraClient, body: unknown): void;
  // Listens for a message from Lucra by its wire type. Answers to requests are
  // not included: they settle the request's promise instead.
  on(type: string, listener: (data: unknown) => void): () => void;
  // Loads `url` in the frame. Lucra starts over and pending requests are rejected.
  restart(url: string): void;
  destroy(): void;
};

type Waiter = {
  resolve: () => void;
  reject: (error: LucraError) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function createSession(options: {
  frame: Frame;
  url: string;
  timeouts: Timeouts;
  // True when there is no browser. The session never connects.
  unsupported?: boolean;
}): Session {
  const { frame, timeouts } = options;
  let status: SessionStatus = options.unsupported ? "failed" : "connecting";
  let failure: LucraError | null = options.unsupported
    ? new LucraError(LucraErrorCode.UNSUPPORTED_ENVIRONMENT)
    : null;
  let connectedOnce = false;
  const waiters = new Set<Waiter>();
  const connectedListeners = new Set<() => void>();
  const inbound = createEmitter<Record<string, unknown>>();

  const post = (type: MessageTypeToLucraClient, body: unknown) => {
    try {
      frame.post({ type, body });
    } catch {
      // Log the type only. A message body can hold user data.
      console.error(`Lucra could not send a ${type} message`);
    }
  };

  const requests = createRequests({
    post: (message) => frame.post(message),
    timeoutMs: timeouts.requestMs,
    // A timeout otherwise only shows up in the host page, where Lucra never sees it.
    onTimeout: (type, timeoutMs) =>
      post(MessageTypeToLucraClient.sdkDiagnostic, {
        kind: "requestTimeout",
        requestType: type,
        timeoutMs,
        sdkVersion: SDK_VERSION,
      }),
  });

  const settleWaiters = (error?: LucraError) => {
    for (const waiter of [...waiters]) {
      clearTimeout(waiter.timer);
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
    waiters.clear();
  };

  const onInitialized = (data: unknown) => {
    const success = (data as { success?: unknown } | null)?.success === true;
    if (!success) {
      status = "failed";
      failure = new LucraError(LucraErrorCode.CONNECTION_FAILED);
      settleWaiters(failure);
      return;
    }
    // Lucra posts this once per page load. A second one means its page loaded
    // again, so nothing sent to the old page will ever be answered.
    if (connectedOnce) requests.rejectAll("CONNECTION_RESET");
    connectedOnce = true;
    status = "connected";
    failure = null;
    settleWaiters();
    for (const listener of [...connectedListeners]) {
      try {
        listener();
      } catch (e) {
        console.error("Lucra connection listener threw an error", e);
      }
    }
  };

  const route = (message: InboundMessage) => {
    if (status === "destroyed") return;
    if (message.type === LucraClientMessageType.initialized) {
      onInitialized(message.data);
    }
    // An answer to one of our own requests is not also passed on as an event.
    if (requests.handle(message)) return;
    inbound.emit(message.type, message.data);
  };

  if (!options.unsupported) {
    frame.onMessage(route);
    frame.mount(options.url);
  }

  return {
    status: () => status,

    whenConnected() {
      if (status === "destroyed") {
        return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
      }
      if (status === "connected") return Promise.resolve();
      if (status === "failed") {
        return Promise.reject(
          failure ?? new LucraError(LucraErrorCode.CONNECTION_FAILED)
        );
      }
      return new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          // Only this call gives up. The connection keeps trying.
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new LucraError(LucraErrorCode.CONNECTION_TIMEOUT));
          }, timeouts.connectMs),
        };
        waiters.add(waiter);
      });
    },

    onConnected(listener) {
      connectedListeners.add(listener);
      return () => {
        connectedListeners.delete(listener);
      };
    },

    request(spec, body) {
      if (status === "destroyed") {
        return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
      }
      return requests.send(spec, body);
    },

    post(type, body) {
      if (status === "destroyed") return;
      post(type, body);
    },

    on(type, listener) {
      return inbound.on(type, listener);
    },

    restart(url) {
      if (status === "destroyed" || options.unsupported) return;
      requests.rejectAll("CONNECTION_RESET");
      status = "connecting";
      failure = null;
      frame.reload(url);
    },

    destroy() {
      if (status === "destroyed") return;
      status = "destroyed";
      requests.rejectAll("DESTROYED");
      settleWaiters(new LucraError(LucraErrorCode.DESTROYED));
      connectedListeners.clear();
      inbound.clear();
      frame.destroy();
    },
  };
}
