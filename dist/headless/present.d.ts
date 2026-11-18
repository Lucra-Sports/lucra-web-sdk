import type { Activity } from "./api.js";
import type { Auth } from "./auth.js";
import type { Frame } from "./frame.js";
import type { Session } from "./session.js";
import type { LucraAddFundsResult, LucraLoginResult, LucraPresentResult } from "./types.js";
import { type UrlContext } from "./url.js";
export type Present = {
    login(options?: {
        phoneNumber?: string;
    }): Promise<LucraLoginResult>;
    addFunds(): Promise<LucraAddFundsResult>;
    demographics(): Promise<LucraPresentResult>;
    kyc(): Promise<LucraPresentResult>;
    locationGrant(): Promise<LucraPresentResult>;
    withdraw(): Promise<LucraPresentResult>;
    profile(): Promise<LucraPresentResult>;
    wallet(): Promise<LucraPresentResult>;
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
