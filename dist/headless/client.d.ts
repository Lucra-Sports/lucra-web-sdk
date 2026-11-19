import { type Api } from "./api.js";
import { type Frame } from "./frame.js";
import { type Present } from "./present.js";
import { type Timeouts } from "./session.js";
import type { LucraAuthState, LucraClientConfig, LucraHeadlessEventMap, LucraMatchupWatch, LucraMatchupWatchHandlers } from "./types.js";
export type LucraHeadlessClient = {
    auth: {
        getState(): LucraAuthState;
        subscribe(listener: (state: LucraAuthState) => void): () => void;
        isLoggedIn(): Promise<boolean>;
        logout(): Promise<void>;
    } & Api["auth"];
    tournaments: Api["tournaments"];
    matchups: Api["matchups"] & {
        watch(matchupId: string, handlers: LucraMatchupWatchHandlers): LucraMatchupWatch;
    };
    achievements: Api["achievements"];
    rewards: Api["rewards"];
    present: Omit<Present, "destroy">;
    on<K extends keyof LucraHeadlessEventMap>(event: K, listener: (data: LucraHeadlessEventMap[K]) => void): () => void;
    whenConnected(): Promise<void>;
    withRemediation<T>(call: () => Promise<T>): Promise<T>;
    destroy(): void;
};
export declare function createClient(config: LucraClientConfig, deps: {
    frame: Frame;
    parentOrigin: string;
    timeouts?: Partial<Timeouts>;
    unsupported?: boolean;
    onDestroy?: () => void;
}): LucraHeadlessClient;
export declare function createLucraClient(config: LucraClientConfig): LucraHeadlessClient;
