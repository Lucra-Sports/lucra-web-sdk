import type { Session } from "./session.js";
import type { LucraMatchupWatch, LucraMatchupWatchHandlers } from "./types.js";
export type Watch = {
    watch(matchupId: string, handlers: LucraMatchupWatchHandlers): LucraMatchupWatch;
    destroy(): void;
};
export declare function createWatch(options: {
    session: Session;
}): Watch;
