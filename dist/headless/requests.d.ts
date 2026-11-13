import { LucraClientMessageType, type MessageTypeToLucraClient } from "../types/types.js";
import { type RequestKind } from "./errors.js";
import type { InboundMessage, OutboundMessage } from "./frame.js";
export type RequestSpec<TResponse> = {
    type: MessageTypeToLucraClient;
    responseType: LucraClientMessageType;
    kind: RequestKind;
    unknownOnApiError?: boolean;
    interim?: (data: TResponse) => boolean;
    maxTimeoutMs?: number;
};
export type Requests = {
    send<TResponse>(spec: RequestSpec<TResponse>, body?: unknown): Promise<TResponse>;
    handle(message: InboundMessage): boolean;
    rejectAll(code: "CONNECTION_RESET" | "DESTROYED"): void;
    pendingCount(): number;
};
export declare function createRequests(options: {
    post: (message: OutboundMessage) => void;
    timeoutMs: number;
    onTimeout?: (type: MessageTypeToLucraClient, timeoutMs: number) => void;
}): Requests;
