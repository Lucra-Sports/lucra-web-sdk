import { LucraApiErrorCode } from "./types/types.js";

export class LucraUserNotLoggedIn extends Error {
  constructor(message = "Lucra user is not logged in") {
    super(message);
    this.name = "LucraUserNotLoggedIn";
    Object.setPrototypeOf(this, LucraUserNotLoggedIn.prototype);
  }
}

const API_ERROR_MESSAGES: Record<LucraApiErrorCode, string> = {
  [LucraApiErrorCode.unverified]: "User is not verified",
  [LucraApiErrorCode.insufficientFunds]: "User has insufficient funds",
  [LucraApiErrorCode.demographicInformationMissing]:
    "Required demographic information is missing",
  [LucraApiErrorCode.locationError]: "User location could not be verified",
};

// Thrown (as a promise rejection) by Lucra API calls when the web-app reports a
// known failure. Currently only api.joinTournament rejects with it. Inspect
// `code` to react to the specific reason.
export class LucraApiError extends Error {
  readonly code: LucraApiErrorCode;

  constructor(code: LucraApiErrorCode, message?: string) {
    super(message ?? API_ERROR_MESSAGES[code] ?? code);
    this.name = "LucraApiError";
    this.code = code;
    Object.setPrototypeOf(this, LucraApiError.prototype);
  }
}
