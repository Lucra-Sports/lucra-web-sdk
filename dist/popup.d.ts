import type { LucraPopup, LucraPopupResult } from "./types/types.js";
export type LucraPopupHandle = LucraPopup & {
    resolve: (result: LucraPopupResult) => void;
};
export declare function createPopup(url: string, pollMs?: number): LucraPopupHandle;
