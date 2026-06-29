import { LucraApiErrorCode } from "./types/types.js";
export declare class LucraUserNotLoggedIn extends Error {
    constructor(message?: string);
}
export declare class LucraApiError extends Error {
    readonly code: LucraApiErrorCode;
    constructor(code: LucraApiErrorCode, message?: string);
}
