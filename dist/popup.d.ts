import type { LucraPopup, LucraPopupResult } from "./types/types.js";
export type LucraPopupHandle = LucraPopup & {
    resolve: (result: LucraPopupResult) => void;
};
export declare const POPUP_WIDTH = 430;
export declare const POPUP_HEIGHT = 800;
export declare function createPopup(url: string, pollMs?: number): LucraPopupHandle;
export declare function openPopupWindow(url: string): Window;
export declare function trackPopup(win: Window, pollMs?: number): LucraPopupHandle;
