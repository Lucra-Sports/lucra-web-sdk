import type { MessageTypeToLucraClient } from "./types/types.js";

const API_REQUEST_TIMEOUT_MS = 15_000;

export type ApiRequest<TResponse, TBody = void> = {
  send: (body: TBody) => Promise<TResponse>;
  resolve: (data: TResponse) => void;
};

/**
 * Creates a single-flight request/response pair backed by a promise.
 * A new `send` cancels any in-flight request, times out after 15s, and the
 * matching `resolve` (called from the iframe message listener) settles it.
 */
export function createApiRequest<TResponse, TBody = void>({
  type,
  cancelReason,
  sendMessage,
}: {
  type: MessageTypeToLucraClient;
  cancelReason: string;
  sendMessage: (message: unknown) => void;
}): ApiRequest<TResponse, TBody> {
  let pendingResolve: ((data: TResponse) => void) | undefined;
  let pendingReject: ((reason?: string) => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
    }
    pendingResolve = undefined;
    pendingReject = undefined;
    timer = undefined;
  };

  return {
    send: (body) => {
      pendingReject?.(cancelReason);
      clear();

      const promise = new Promise<TResponse>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        sendMessage({ type, body: body ?? null });
      });
      timer = setTimeout(() => {
        pendingReject?.("Timeout");
        clear();
      }, API_REQUEST_TIMEOUT_MS);
      return promise;
    },
    resolve: (data: TResponse) => {
      pendingResolve?.(data);
      clear();
    },
  };
}
