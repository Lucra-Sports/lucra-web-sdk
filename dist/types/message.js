export var LucraClientMessageType;
(function (LucraClientMessageType) {
    LucraClientMessageType["userInfo"] = "userInfo";
    LucraClientMessageType["matchupCreated"] = "matchupCreated";
    LucraClientMessageType["matchupCanceled"] = "matchupCanceled";
    LucraClientMessageType["matchupAccepted"] = "matchupAccepted";
    LucraClientMessageType["tournamentJoined"] = "tournamentJoined";
    LucraClientMessageType["convertToCredit"] = "convertToCredit";
    LucraClientMessageType["deepLink"] = "deepLink";
    LucraClientMessageType["navigationEvent"] = "navigationEvent";
})(LucraClientMessageType || (LucraClientMessageType = {}));
export var MessageTypeToLucraClient;
(function (MessageTypeToLucraClient) {
    MessageTypeToLucraClient["clientUserInfo"] = "clientUserInfo";
    MessageTypeToLucraClient["convertToCreditResponse"] = "convertToCreditResponse";
    MessageTypeToLucraClient["enableConvertToCredit"] = "enableConvertToCredit";
    MessageTypeToLucraClient["deepLinkResponse"] = "deepLinkResponse";
})(MessageTypeToLucraClient || (MessageTypeToLucraClient = {}));
