import { LucraApiErrorCode } from "./types/types.js";
export declare class LucraUserNotLoggedIn extends Error {
    constructor(message?: string);
}
export declare class LucraClientNotOpen extends Error {
    constructor(message?: string);
}
export declare class LucraApiError extends Error {
    readonly code: LucraApiErrorCode;
    constructor(code: LucraApiErrorCode, message?: string);
}
export declare class LucraMinigamesTriggerTimeout extends Error {
    constructor(message?: string);
}
export declare class LucraMinigamesTriggerCanceled extends Error {
    constructor(message?: string);
}
