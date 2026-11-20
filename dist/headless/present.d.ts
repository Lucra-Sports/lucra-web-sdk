import { type LucraPresentMinigameBody, type LucraPresentMinigameResponse } from "../types/types.js";
import type { Activity } from "./api.js";
import type { Auth } from "./auth.js";
import { type Frame } from "./frame.js";
import type { Session } from "./session.js";
import type { LucraAddFundsResult, LucraLoginOptions, LucraLoginResult, LucraMinigameInput, LucraMinigameResult, LucraPresentOptions, LucraPresentResult, LucraPresentation } from "./types.js";
import { type UrlContext } from "./url.js";
export type Present = {
    login(options?: LucraLoginOptions): Promise<LucraLoginResult>;
    addFunds(): Promise<LucraAddFundsResult>;
    minigame(input: LucraMinigameInput): Promise<LucraMinigameResult>;
    demographics(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    kyc(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    locationGrant(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    withdraw(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    profile(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    wallet(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    dismiss(): void;
    getState(): LucraPresentState;
    subscribe(listener: (state: LucraPresentState) => void): () => void;
    destroy(): void;
};
export type LucraScreen = Exclude<keyof Present, "addFunds" | "minigame" | "dismiss" | "getState" | "subscribe" | "destroy">;
export type LucraPresentState = {
    readonly screen: LucraScreen | "minigame" | null;
};
export declare function createPresent(options: {
    session: Session;
    auth: Auth;
    frame: Frame;
    urls: UrlContext;
    activity: Activity;
    whenWriteSettled: () => Promise<void>;
    startMinigame: (body: LucraPresentMinigameBody) => Promise<LucraPresentMinigameResponse>;
    presentation: LucraPresentation;
}): Present;
