export declare const LucraErrorCode: {
    readonly UNVERIFIED: "UNVERIFIED";
    readonly INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS";
    readonly DEMOGRAPHIC_INFORMATION_MISSING: "DEMOGRAPHIC_INFORMATION_MISSING";
    readonly LOCATION_ERROR: "LOCATION_ERROR";
    readonly LOCATION_NEEDED: "LOCATION_NEEDED";
    readonly NOT_ALLOWED: "NOT_ALLOWED";
    readonly INVALID_AT_STAKE: "INVALID_AT_STAKE";
    readonly INVALID_REWARD_TYPE: "INVALID_REWARD_TYPE";
    readonly INVALID_PLAY_STYLE: "INVALID_PLAY_STYLE";
    readonly API_ERROR: "API_ERROR";
    readonly NOT_LOGGED_IN: "NOT_LOGGED_IN";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly TIMEOUT: "TIMEOUT";
    readonly CANCELLED: "CANCELLED";
    readonly CONNECTION_FAILED: "CONNECTION_FAILED";
    readonly CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT";
    readonly CONNECTION_RESET: "CONNECTION_RESET";
    readonly DESTROYED: "DESTROYED";
    readonly POPUP_BLOCKED: "POPUP_BLOCKED";
    readonly SCREEN_OPEN: "SCREEN_OPEN";
    readonly LOGOUT_FAILED: "LOGOUT_FAILED";
    readonly INVALID_ARGUMENT: "INVALID_ARGUMENT";
    readonly INVALID_CONFIG: "INVALID_CONFIG";
    readonly UNSUPPORTED_ENVIRONMENT: "UNSUPPORTED_ENVIRONMENT";
};
export type LucraErrorCode = (typeof LucraErrorCode)[keyof typeof LucraErrorCode];
export type LucraRemediation = "login" | "addFunds" | "demographics" | "locationGrant" | "kyc";
export type LucraErrorSource = "lucra" | "sdk";
export declare class LucraError extends Error {
    readonly code: LucraErrorCode;
    readonly remediation: LucraRemediation | null;
    readonly outcomeUnknown: boolean;
    readonly source: LucraErrorSource;
    readonly hint: string | null;
    constructor(code: LucraErrorCode, message?: string, options?: {
        outcomeUnknown?: boolean;
        cause?: unknown;
        hint?: string;
        source?: LucraErrorSource;
    });
}
export declare function isLucraError(value: unknown): value is LucraError;
export type RequestKind = "read" | "write";
export declare function fromApiError(body: {
    code?: string;
    message?: string;
} | null | undefined, request: {
    kind: RequestKind;
    unknownOnApiError?: boolean;
}): LucraError;
