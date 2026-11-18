import { MessageTypeToLucraClient } from "../types/types.js";
import type { Frame } from "./frame.js";
import { type RequestSpec } from "./requests.js";
export type Timeouts = {
    requestMs: number;
    connectMs: number;
    authCheckMaxMs: number;
    authReadyMs: number;
    logoutMs: number;
};
export declare const DEFAULT_TIMEOUTS: Timeouts;
export type SessionStatus = "connecting" | "connected" | "failed" | "destroyed";
export type Session = {
    status(): SessionStatus;
    whenConnected(): Promise<void>;
    onConnected(listener: () => void): () => void;
    request<TResponse>(spec: RequestSpec<TResponse>, body?: unknown, timeoutMs?: number): Promise<TResponse>;
    post(type: MessageTypeToLucraClient, body: unknown): void;
    on(type: string, listener: (data: unknown) => void): () => void;
    restart(url: string): void;
    destroy(): void;
};
export declare function createSession(options: {
    frame: Frame;
    url: string;
    timeouts: Timeouts;
    unsupported?: boolean;
}): Session;
