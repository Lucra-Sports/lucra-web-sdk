export var LucraClientMessageType;
(function (LucraClientMessageType) {
    LucraClientMessageType["achievementsResponse"] = "achievementsResponse";
    LucraClientMessageType["activeMatchupStarted"] = "activeMatchupStarted";
    LucraClientMessageType["claimReward"] = "claimReward";
    LucraClientMessageType["convertToCredit"] = "convertToCredit";
    LucraClientMessageType["deepLink"] = "deepLink";
    LucraClientMessageType["demographicComplete"] = "demographicComplete";
    LucraClientMessageType["exitLucra"] = "exitLucra";
    LucraClientMessageType["kycComplete"] = "kycComplete";
    LucraClientMessageType["loginSuccess"] = "loginSuccess";
    LucraClientMessageType["matchupAccepted"] = "matchupAccepted";
    LucraClientMessageType["matchupCanceled"] = "matchupCanceled";
    LucraClientMessageType["matchupCreated"] = "matchupCreated";
    LucraClientMessageType["matchupInviteUrl"] = "matchupInviteUrl";
    LucraClientMessageType["matchupStarted"] = "matchupStarted";
    LucraClientMessageType["navigationEvent"] = "navigationEvent";
    LucraClientMessageType["startMinigamesSessionResponse"] = "startMinigamesSessionResponse";
    LucraClientMessageType["tournamentJoined"] = "tournamentJoined";
    LucraClientMessageType["tournamentsResponse"] = "tournamentsResponse";
    LucraClientMessageType["tournamentResponse"] = "tournamentResponse";
    LucraClientMessageType["tournamentLeaderboardResponse"] = "tournamentLeaderboardResponse";
    LucraClientMessageType["joinTournamentResponse"] = "joinTournamentResponse";
    LucraClientMessageType["joinTournamentError"] = "joinTournamentError";
    LucraClientMessageType["userInfo"] = "userInfo";
    LucraClientMessageType["initialized"] = "initialized";
    LucraClientMessageType["isLoggedInResponse"] = "isLoggedInResponse";
})(LucraClientMessageType || (LucraClientMessageType = {}));
export var MessageTypeToLucraClient;
(function (MessageTypeToLucraClient) {
    MessageTypeToLucraClient["achievementsRequest"] = "achievementsRequest";
    MessageTypeToLucraClient["availableRewards"] = "availableRewards";
    MessageTypeToLucraClient["clientUserInfo"] = "clientUserInfo";
    MessageTypeToLucraClient["convertToCreditResponse"] = "convertToCreditResponse";
    MessageTypeToLucraClient["deepLinkResponse"] = "deepLinkResponse";
    MessageTypeToLucraClient["matchupInviteUrlResponse"] = "matchupInviteUrlResponse";
    MessageTypeToLucraClient["enableConvertToCredit"] = "enableConvertToCredit";
    MessageTypeToLucraClient["enableExitLucra"] = "enableExitLucra";
    MessageTypeToLucraClient["navigate"] = "navigate";
    MessageTypeToLucraClient["tournamentsRequest"] = "tournamentsRequest";
    MessageTypeToLucraClient["tournamentRequest"] = "tournamentRequest";
    MessageTypeToLucraClient["tournamentLeaderboardRequest"] = "tournamentLeaderboardRequest";
    MessageTypeToLucraClient["joinTournamentRequest"] = "joinTournamentRequest";
    MessageTypeToLucraClient["isLoggedInRequest"] = "isLoggedInRequest";
})(MessageTypeToLucraClient || (MessageTypeToLucraClient = {}));
// Message the Lucra web app posts to the opener when a deposit finishes in a
// popup (see client.popup()). The envelope is flat (no nested `data`).
export const LUCRA_POPUP_MESSAGE_TYPE = "LucraPopupMessage";
var account_status_types_enum;
(function (account_status_types_enum) {
    // For free to play sports, a status that indicates they have passed an age assurance check and are verified to play.
    account_status_types_enum["AGE_ASSURED_VERIFIED"] = "AGE_ASSURED_VERIFIED";
    // User blocked by an admin
    account_status_types_enum["BLOCKED"] = "BLOCKED";
    // User account has been closed
    account_status_types_enum["CLOSED"] = "CLOSED";
    // User account has been marked to be closed once contests complete
    account_status_types_enum["CLOSED_PENDING"] = "CLOSED_PENDING";
    // User should be hidden from any client services
    account_status_types_enum["HIDDEN"] = "HIDDEN";
    // User suspended by an admin
    account_status_types_enum["SUSPENDED"] = "SUSPENDED";
    // User has not attempted verification or needs to re-verify
    account_status_types_enum["UNVERIFIED"] = "UNVERIFIED";
    // User needs to scan his/her ID for verification
    account_status_types_enum["USER_SCAN_REQUIRED"] = "USER_SCAN_REQUIRED";
    // There was an error when attempting to verify user
    account_status_types_enum["VERIFICATION_ERROR"] = "VERIFICATION_ERROR";
    // User has attempted verification and failed
    account_status_types_enum["VERIFICATION_FAILED"] = "VERIFICATION_FAILED";
    // User is awaiting a KYC user scan result
    account_status_types_enum["VERIFICATION_SCAN_PENDING"] = "VERIFICATION_SCAN_PENDING";
    // User has been verified
    account_status_types_enum["VERIFIED"] = "VERIFIED";
})(account_status_types_enum || (account_status_types_enum = {}));
// Error codes the web-app can surface for a failed API call. The web-app posts
// an error message carrying one of these codes and the SDK rejects the matching
// API promise with a LucraApiError so clients can react to the specific failure.
// Currently only api.joinTournament throws these, but the codes are not specific
// to it and other API calls may surface them in the future.
export var LucraApiErrorCode;
(function (LucraApiErrorCode) {
    LucraApiErrorCode["unverified"] = "UNVERIFIED";
    LucraApiErrorCode["insufficientFunds"] = "INSUFFICIENT_FUNDS";
    LucraApiErrorCode["demographicInformationMissing"] = "DEMOGRAPHIC_INFORMATION_MISSING";
    LucraApiErrorCode["locationError"] = "LOCATION_ERROR";
})(LucraApiErrorCode || (LucraApiErrorCode = {}));
