import type { Session, Timeouts } from "./session.js";
import type { LucraAuthState } from "./types.js";
import { type UrlContext } from "./url.js";
export type Auth = {
    getState(): LucraAuthState;
    subscribe(listener: (state: LucraAuthState) => void): () => void;
    isLoggedIn(): Promise<boolean>;
    logout(): Promise<void>;
    whenLoggedIn(): Promise<void>;
    destroy(): void;
};
export declare function createAuth(options: {
    session: Session;
    urls: UrlContext;
    timeouts: Timeouts;
}): Auth;
