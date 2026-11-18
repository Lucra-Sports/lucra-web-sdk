import { LucraApiErrorCode } from "../types/types.js";

// Every failure the headless client reports is a LucraError. `code` says what
// happened. `message` is for the user, and `hint` is for the developer.
// `source` says whether Lucra reported it or the SDK raised it. `remediation`
// names the lucra.present method that fixes it, or null. `outcomeUnknown` is
// true only when a write may have completed anyway.
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
} as const;

export type LucraErrorCode = (typeof LucraErrorCode)[keyof typeof LucraErrorCode];

// The lucra.present method that resolves an error.
export type LucraRemediation =
  | "login"
  | "addFunds"
  | "demographics"
  | "locationGrant"
  | "kyc";

// Who raised an error. "lucra": Lucra reported it for a request, and `message`
// is Lucra's own text. "sdk": the SDK raised it itself.
export type LucraErrorSource = "lucra" | "sdk";

const REMEDIATION: Partial<Record<LucraErrorCode, LucraRemediation>> = {
  NOT_LOGGED_IN: "login",
  INSUFFICIENT_FUNDS: "addFunds",
  DEMOGRAPHIC_INFORMATION_MISSING: "demographics",
  LOCATION_NEEDED: "locationGrant",
  UNVERIFIED: "kyc",
};

// Written for the end user, so it is safe to show as it is. For an error
// Lucra reported, Lucra's own message is used instead when it sends one.
const DEFAULT_MESSAGE: Record<LucraErrorCode, string> = {
  UNVERIFIED: "Your identity needs to be verified",
  INSUFFICIENT_FUNDS: "Your balance is too low for this",
  DEMOGRAPHIC_INFORMATION_MISSING: "A few more profile details are needed",
  LOCATION_ERROR: "Your location could not be confirmed",
  LOCATION_NEEDED: "Location access is needed for this",
  NOT_ALLOWED: "This is not available right now",
  INVALID_AT_STAKE: "The amount is not valid",
  INVALID_REWARD_TYPE: "The reward is not valid",
  INVALID_PLAY_STYLE: "The game format is not valid",
  API_ERROR: "Something went wrong",
  NOT_LOGGED_IN: "Please log in to continue",
  NOT_FOUND: "This could not be found",
  IN_PROGRESS: "Another action is still in progress",
  TIMEOUT: "This is taking longer than expected",
  CANCELLED: "This was stopped",
  CONNECTION_FAILED: "This is not available right now",
  CONNECTION_TIMEOUT: "Could not connect right now",
  CONNECTION_RESET: "The connection was interrupted",
  DESTROYED: "This is no longer available",
  POPUP_BLOCKED: "The window could not be opened",
  SCREEN_OPEN: "Please finish or close the open screen first",
  LOGOUT_FAILED: "Logging out did not finish",
  INVALID_ARGUMENT: "Something went wrong",
  INVALID_CONFIG: "Something went wrong",
  UNSUPPORTED_ENVIRONMENT: "This is not available here",
};

// Guidance for the developer. Never show it to users. Only errors the SDK
// raised have one: an error Lucra reported never does.
const DEFAULT_HINT: Partial<Record<LucraErrorCode, string>> = {
  NOT_LOGGED_IN: "This call needs a logged in user. Show lucra.present.login(), then try again.",
  IN_PROGRESS: "Another write is pending. Wait for it to settle before you start the next one.",
  TIMEOUT:
    "Lucra did not answer within 15 seconds. When outcomeUnknown is true, read back before you retry.",
  CONNECTION_FAILED: "Lucra could not start. Check apiKey, tenantId, and env.",
  CONNECTION_TIMEOUT:
    "Lucra did not start within 30 seconds. Check that your Content-Security-Policy allows your Lucra address under frame-src.",
  CONNECTION_RESET:
    "Lucra restarted while the call was waiting. A read is safe to repeat. Read back after a write.",
  DESTROYED: "lucra.destroy() was called. Create a new client to continue.",
  POPUP_BLOCKED:
    "The browser blocked the Add Funds window. Call lucra.present.addFunds() first in a click handler, with no await before it.",
  SCREEN_OPEN: "A lucra.present screen is showing or opening. Await its result before the next write.",
  LOGOUT_FAILED: "Lucra did not confirm the logout.",
  INVALID_ARGUMENT: "A call was given an argument it cannot use.",
  INVALID_CONFIG: "createLucraClient was given a config it cannot use.",
  UNSUPPORTED_ENVIRONMENT:
    "The client needs a browser. Create it in browser code, not during server rendering.",
};

export class LucraError extends Error {
  readonly code: LucraErrorCode;
  readonly remediation: LucraRemediation | null;
  readonly outcomeUnknown: boolean;
  readonly source: LucraErrorSource;
  readonly hint: string | null;

  constructor(
    code: LucraErrorCode,
    message?: string,
    options: {
      outcomeUnknown?: boolean;
      cause?: unknown;
      hint?: string;
      source?: LucraErrorSource;
    } = {}
  ) {
    super(message || DEFAULT_MESSAGE[code]);
    this.name = "LucraError";
    this.code = code;
    this.remediation = REMEDIATION[code] ?? null;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
    this.source = options.source ?? "sdk";
    this.hint =
      this.source === "lucra" ? null : (options.hint ?? DEFAULT_HINT[code] ?? null);
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, LucraError.prototype);
  }
}

// Works across bundles, where `instanceof` can fail for a duplicated module.
export function isLucraError(value: unknown): value is LucraError {
  if (value instanceof LucraError) return true;
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; code?: unknown };
  return candidate.name === "LucraError" && typeof candidate.code === "string";
}

// Whether a request reads data or changes something. Only writes can have an
// unknown outcome.
export type RequestKind = "read" | "write";

// What an API_ERROR means for a write. Lucra uses API_ERROR as a catch-all, so for
// most writes it leaves the outcome unknown. These messages are the exceptions:
// nothing was created, joined, or canceled. ("Not found" is not listed because
// it becomes NOT_FOUND before this list is read.)
const DEFINITE_API_ERROR_MESSAGES = ["gameTypeId is required"];

const NOT_FOUND_MESSAGE = "Recreational game matchup not found";
const IN_PROGRESS_MESSAGE = /^Another .+ request is already in progress$/;

const WIRE_CODES = new Set<string>(Object.values(LucraApiErrorCode));

// Turns an error Lucra reported for a request into a LucraError. This is the
// only place an error gets source "lucra".
// `unknownOnApiError` is set by writes whose plain API_ERROR may still have run.
export function fromApiError(
  body: { code?: string; message?: string } | null | undefined,
  request: { kind: RequestKind; unknownOnApiError?: boolean }
): LucraError {
  const message = body?.message;
  const source = "lucra";
  const code: LucraErrorCode =
    body?.code !== undefined && WIRE_CODES.has(body.code)
      ? (body.code as LucraErrorCode)
      : LucraErrorCode.API_ERROR;

  if (code === LucraErrorCode.API_ERROR && message === NOT_FOUND_MESSAGE) {
    return new LucraError(LucraErrorCode.NOT_FOUND, message, { source });
  }
  if (
    code === LucraErrorCode.NOT_ALLOWED &&
    message !== undefined &&
    IN_PROGRESS_MESSAGE.test(message)
  ) {
    return new LucraError(LucraErrorCode.IN_PROGRESS, message, { source });
  }
  const outcomeUnknown =
    code === LucraErrorCode.API_ERROR &&
    request.kind === "write" &&
    request.unknownOnApiError === true &&
    !(message !== undefined && DEFINITE_API_ERROR_MESSAGES.includes(message));
  return new LucraError(code, message, { outcomeUnknown, source });
}
