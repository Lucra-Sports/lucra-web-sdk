import { LucraApiErrorCode } from "./types/types.js";

export class LucraUserNotLoggedIn extends Error {
  constructor(message = "Lucra user is not logged in") {
    super(message);
    this.name = "LucraUserNotLoggedIn";
    Object.setPrototypeOf(this, LucraUserNotLoggedIn.prototype);
  }
}

// Thrown (rejected with, for api.* calls) when a method that needs the Lucra
// iframe runs before open() or after close().
export class LucraClientNotOpen extends Error {
  constructor(message = "LucraClient is not open. Call client.open(element) first.") {
    super(message);
    this.name = "LucraClientNotOpen";
    Object.setPrototypeOf(this, LucraClientNotOpen.prototype);
  }
}

const API_ERROR_MESSAGES: Record<LucraApiErrorCode, string> = {
  [LucraApiErrorCode.unverified]: "User is not verified",
  [LucraApiErrorCode.insufficientFunds]: "User has insufficient funds",
  [LucraApiErrorCode.demographicInformationMissing]:
    "Required demographic information is missing",
  [LucraApiErrorCode.locationError]: "User location could not be verified",
  [LucraApiErrorCode.locationNeeded]: "User location has not been granted",
  [LucraApiErrorCode.notAllowed]:
    "This action is not allowed for this user or matchup",
  [LucraApiErrorCode.invalidAtStake]: "The stake is invalid",
  [LucraApiErrorCode.invalidRewardType]: "The reward type is invalid",
  [LucraApiErrorCode.invalidPlayStyle]: "The play style is invalid",
  [LucraApiErrorCode.termsNotAccepted]: "The user has not accepted Lucra's terms",
  [LucraApiErrorCode.apiError]: "The request could not be completed",
};

// Thrown (as a promise rejection) by Lucra API calls when the web-app reports a
// known failure. Inspect `code` to react to the specific reason;
// docs/2.0_headless.md lists which calls reject with it.
export class LucraApiError extends Error {
  readonly code: LucraApiErrorCode;

  constructor(code: LucraApiErrorCode, message?: string) {
    super(message ?? API_ERROR_MESSAGES[code] ?? code);
    this.name = "LucraApiError";
    this.code = code;
    Object.setPrototypeOf(this, LucraApiError.prototype);
  }
}

// minigamesTrigger: no session started within `timeoutMs`. The Start overlay is removed.
export class LucraMinigamesTriggerTimeout extends Error {
  constructor(message = "The minigame session did not start in time") {
    super(message);
    this.name = "LucraMinigamesTriggerTimeout";
    Object.setPrototypeOf(this, LucraMinigamesTriggerTimeout.prototype);
  }
}

// minigamesTrigger: the host aborted the `signal`. The Start overlay is removed.
export class LucraMinigamesTriggerCanceled extends Error {
  constructor(message = "The minigame session was canceled") {
    super(message);
    this.name = "LucraMinigamesTriggerCanceled";
    Object.setPrototypeOf(this, LucraMinigamesTriggerCanceled.prototype);
  }
}
