import type { Activity } from "./api.js";
import type { Auth } from "./auth.js";
import type { Frame } from "./frame.js";
import type { Session } from "./session.js";
import type { LucraAddFundsResult, LucraLoginOptions, LucraLoginResult, LucraPresentOptions, LucraPresentResult } from "./types.js";
import { type UrlContext } from "./url.js";
export type Present = {
    login(options?: LucraLoginOptions): Promise<LucraLoginResult>;
    addFunds(): Promise<LucraAddFundsResult>;
    demographics(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    kyc(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    locationGrant(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    withdraw(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    profile(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    wallet(options?: LucraPresentOptions): Promise<LucraPresentResult>;
    dismiss(): void;
    destroy(): void;
};
export type LucraScreen = Exclude<keyof Present, "addFunds" | "dismiss" | "destroy">;
export declare function createPresent(options: {
    session: Session;
    auth: Auth;
    frame: Frame;
    urls: UrlContext;
    activity: Activity;
    whenWriteSettled: () => Promise<void>;
}): Present;
