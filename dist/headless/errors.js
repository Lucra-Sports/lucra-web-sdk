import { LucraApiErrorCode } from "../types/types.js";
// Every failure the headless client reports is a LucraError. `code` says what
// happened. `remediation` names the lucra.present method that fixes it, or null.
// `outcomeUnknown` is true only when a write may have completed anyway.
export const LucraErrorCode = {
    // Reported by Lucra for a request. Same values as the wire LucraApiErrorCode.
    UNVERIFIED: "UNVERIFIED",
    INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
    DEMOGRAPHIC_INFORMATION_MISSING: "DEMOGRAPHIC_INFORMATION_MISSING",
    LOCATION_ERROR: "LOCATION_ERROR",
    LOCATION_NEEDED: "LOCATION_NEEDED",
    NOT_ALLOWED: "NOT_ALLOWED",
    INVALID_AT_STAKE: "INVALID_AT_STAKE",
    INVALID_REWARD_TYPE: "INVALID_REWARD_TYPE",
    INVALID_PLAY_STYLE: "INVALID_PLAY_STYLE",
    API_ERROR: "API_ERROR",
    // Raised by the SDK itself.
    NOT_LOGGED_IN: "NOT_LOGGED_IN",
    NOT_FOUND: "NOT_FOUND",
    IN_PROGRESS: "IN_PROGRESS",
    TIMEOUT: "TIMEOUT",
    CANCELLED: "CANCELLED",
    CONNECTION_FAILED: "CONNECTION_FAILED",
    CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
    CONNECTION_RESET: "CONNECTION_RESET",
    DESTROYED: "DESTROYED",
    POPUP_BLOCKED: "POPUP_BLOCKED",
    SCREEN_OPEN: "SCREEN_OPEN",
    LOGOUT_FAILED: "LOGOUT_FAILED",
    INVALID_ARGUMENT: "INVALID_ARGUMENT",
    INVALID_CONFIG: "INVALID_CONFIG",
    UNSUPPORTED_ENVIRONMENT: "UNSUPPORTED_ENVIRONMENT",
};
const REMEDIATION = {
    NOT_LOGGED_IN: "login",
    INSUFFICIENT_FUNDS: "addFunds",
    DEMOGRAPHIC_INFORMATION_MISSING: "demographics",
    LOCATION_NEEDED: "locationGrant",
    UNVERIFIED: "kyc",
};
const DEFAULT_MESSAGE = {
    UNVERIFIED: "User is not verified",
    INSUFFICIENT_FUNDS: "User has insufficient funds",
    DEMOGRAPHIC_INFORMATION_MISSING: "Required demographic information is missing",
    LOCATION_ERROR: "User location could not be verified",
    LOCATION_NEEDED: "User location has not been granted",
    NOT_ALLOWED: "This action is not allowed for this user or matchup",
    INVALID_AT_STAKE: "The stake is invalid",
    INVALID_REWARD_TYPE: "The reward type is invalid",
    INVALID_PLAY_STYLE: "The play style is invalid",
    API_ERROR: "The request could not be completed",
    NOT_LOGGED_IN: "No Lucra user is logged in",
    NOT_FOUND: "Not found",
    IN_PROGRESS: "Another write is still in progress",
    TIMEOUT: "Lucra did not answer in time",
    CANCELLED: "Cancelled",
    CONNECTION_FAILED: "Lucra could not start. Check apiKey, tenantId, and env",
    CONNECTION_TIMEOUT: "Lucra did not start in time",
    CONNECTION_RESET: "The Lucra session restarted while the request was pending",
    DESTROYED: "The Lucra client was destroyed",
    POPUP_BLOCKED: "The browser blocked the popup. Call this from a click handler",
    SCREEN_OPEN: "A Lucra screen is open. Wait for it to close",
    LOGOUT_FAILED: "Lucra did not confirm the logout",
    INVALID_ARGUMENT: "Invalid argument",
    INVALID_CONFIG: "Invalid configuration",
    UNSUPPORTED_ENVIRONMENT: "The Lucra client needs a browser",
};
export class LucraError extends Error {
    code;
    remediation;
    outcomeUnknown;
    constructor(code, message, options = {}) {
        super(message || DEFAULT_MESSAGE[code]);
        this.name = "LucraError";
        this.code = code;
        this.remediation = REMEDIATION[code] ?? null;
        this.outcomeUnknown = options.outcomeUnknown ?? false;
        if (options.cause !== undefined) {
            this.cause = options.cause;
        }
        Object.setPrototypeOf(this, LucraError.prototype);
    }
}
// Works across bundles, where `instanceof` can fail for a duplicated module.
export function isLucraError(value) {
    if (value instanceof LucraError)
        return true;
    if (typeof value !== "object" || value === null)
        return false;
    const candidate = value;
    return candidate.name === "LucraError" && typeof candidate.code === "string";
}
// What an API_ERROR means for a write. Lucra uses API_ERROR as a catch-all, so for
// most writes it leaves the outcome unknown. These messages are the exceptions:
// nothing was created, joined, or canceled. ("Not found" is not listed because
// it becomes NOT_FOUND before this list is read.)
const DEFINITE_API_ERROR_MESSAGES = ["gameTypeId is required"];
const NOT_FOUND_MESSAGE = "Recreational game matchup not found";
const IN_PROGRESS_MESSAGE = /^Another .+ request is already in progress$/;
const WIRE_CODES = new Set(Object.values(LucraApiErrorCode));
// Turns an error Lucra reported for a request into a LucraError.
// `unknownOnApiError` is set by writes whose plain API_ERROR may still have run.
export function fromApiError(body, request) {
    const message = body?.message;
    const code = body?.code !== undefined && WIRE_CODES.has(body.code)
        ? body.code
        : LucraErrorCode.API_ERROR;
    if (code === LucraErrorCode.API_ERROR && message === NOT_FOUND_MESSAGE) {
        return new LucraError(LucraErrorCode.NOT_FOUND, message);
    }
    if (code === LucraErrorCode.NOT_ALLOWED &&
        message !== undefined &&
        IN_PROGRESS_MESSAGE.test(message)) {
        return new LucraError(LucraErrorCode.IN_PROGRESS, message);
    }
    const outcomeUnknown = code === LucraErrorCode.API_ERROR &&
        request.kind === "write" &&
        request.unknownOnApiError === true &&
        !(message !== undefined && DEFINITE_API_ERROR_MESSAGES.includes(message));
    return new LucraError(code, message, { outcomeUnknown });
}
