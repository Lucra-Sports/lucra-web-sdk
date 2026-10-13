import { type LucraClientMessageType, type MessageTypeToLucraClient } from "./types/types.js";
export type ApiRequest<TResponse, TBody = void> = {
    readonly type: MessageTypeToLucraClient;
    readonly responseType: LucraClientMessageType;
    send: (body: TBody) => Promise<TResponse>;
    resolve: (data: TResponse, requestId?: string) => void;
    reject: (reason: unknown, requestId?: string) => void;
    rejectAll: (reason: unknown) => void;
    hasPending: () => boolean;
};
export declare const cancelReason: (name: string) => string;
/**
 * Creates a request/response pair backed by promises. Each `send` posts the message with
 * a fresh `requestId`, which the web-app echoes on its response so concurrent calls settle
 * independently. Every request times out on its own after `timeoutMs`. With `singleFlight`
 * a new `send` cancels any pending request instead. With `rejectWhilePending` a new `send`
 * is refused with `NOT_ALLOWED` and posts nothing, so a write already running is never
 * duplicated. A `sendMessage` that throws (e.g. a payload that cannot be cloned) rejects
 * that request at once instead of leaving it to time out.
 */
export declare function createApiRequest<TResponse, TBody = void>({ type, responseType, name, sendMessage, singleFlight, rejectWhilePending, timeoutMs, }: {
    type: MessageTypeToLucraClient;
    responseType: LucraClientMessageType;
    name: string;
    sendMessage: (message: unknown) => void;
    singleFlight?: boolean;
    rejectWhilePending?: boolean;
    timeoutMs?: number;
}): ApiRequest<TResponse, TBody>;
