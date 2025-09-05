export var LucraClientMessageType;
(function (LucraClientMessageType) {
    LucraClientMessageType["activeMatchupStarted"] = "activeMatchupStarted";
    LucraClientMessageType["claimReward"] = "claimReward";
    LucraClientMessageType["convertToCredit"] = "convertToCredit";
    LucraClientMessageType["deepLink"] = "deepLink";
    LucraClientMessageType["exitLucra"] = "exitLucra";
    LucraClientMessageType["loginSuccess"] = "loginSuccess";
    LucraClientMessageType["matchupAccepted"] = "matchupAccepted";
    LucraClientMessageType["matchupCanceled"] = "matchupCanceled";
    LucraClientMessageType["matchupCreated"] = "matchupCreated";
    LucraClientMessageType["matchupStarted"] = "matchupStarted";
    LucraClientMessageType["navigationEvent"] = "navigationEvent";
    LucraClientMessageType["tournamentJoined"] = "tournamentJoined";
    LucraClientMessageType["userInfo"] = "userInfo";
})(LucraClientMessageType || (LucraClientMessageType = {}));
export var MessageTypeToLucraClient;
(function (MessageTypeToLucraClient) {
    MessageTypeToLucraClient["availableRewards"] = "availableRewards";
    MessageTypeToLucraClient["clientUserInfo"] = "clientUserInfo";
    MessageTypeToLucraClient["convertToCreditResponse"] = "convertToCreditResponse";
    MessageTypeToLucraClient["deepLinkResponse"] = "deepLinkResponse";
    MessageTypeToLucraClient["enableConvertToCredit"] = "enableConvertToCredit";
    MessageTypeToLucraClient["enableExitLucra"] = "enableExitLucra";
    MessageTypeToLucraClient["navigate"] = "navigate";
})(MessageTypeToLucraClient || (MessageTypeToLucraClient = {}));
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
