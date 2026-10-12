import type { LucraClientMessageType, MessageTypeToLucraClient } from "./types/types.js";
export type ApiRequest<TResponse, TBody = void> = {
    readonly type: MessageTypeToLucraClient;
    readonly responseType: LucraClientMessageType;
    send: (body: TBody) => Promise<TResponse>;
    resolve: (data: TResponse, requestId?: string) => void;
    reject: (reason: unknown, requestId?: string) => void;
};
/**
 * Creates a request/response pair backed by promises. Each `send` posts the message with
 * a fresh `requestId`, which the web-app echoes on its response so concurrent calls settle
 * independently. Every request times out on its own after `timeoutMs`. With `singleFlight`
 * a new `send` cancels any pending request with `cancelReason` instead.
 */
export declare function createApiRequest<TResponse, TBody = void>({ type, responseType, cancelReason, sendMessage, singleFlight, timeoutMs, }: {
    type: MessageTypeToLucraClient;
    responseType: LucraClientMessageType;
    cancelReason: string;
    sendMessage: (message: unknown) => void;
    singleFlight?: boolean;
    timeoutMs?: number;
}): ApiRequest<TResponse, TBody>;
