import type { MessageTypeToLucraClient } from "./types/types.js";
export type ApiRequest<TResponse, TBody = void> = {
    send: (body: TBody) => Promise<TResponse>;
    resolve: (data: TResponse) => void;
};
/**
 * Creates a single-flight request/response pair backed by a promise.
 * A new `send` cancels any in-flight request, times out after 15s, and the
 * matching `resolve` (called from the iframe message listener) settles it.
 */
export declare function createApiRequest<TResponse, TBody = void>({ type, cancelReason, sendMessage, }: {
    type: MessageTypeToLucraClient;
    cancelReason: string;
    sendMessage: (message: unknown) => void;
}): ApiRequest<TResponse, TBody>;
