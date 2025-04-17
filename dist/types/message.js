export var LucraClientMessageType;
(function (LucraClientMessageType) {
    LucraClientMessageType["userInfo"] = "userInfo";
    LucraClientMessageType["matchupCreated"] = "matchupCreated";
    LucraClientMessageType["matchupCanceled"] = "matchupCanceled";
    LucraClientMessageType["matchupAccepted"] = "matchupAccepted";
    LucraClientMessageType["convertToCredit"] = "convertToCredit";
    LucraClientMessageType["deepLink"] = "deepLink";
})(LucraClientMessageType || (LucraClientMessageType = {}));
export var MessageTypeToLucraClient;
(function (MessageTypeToLucraClient) {
    MessageTypeToLucraClient["clientUserInfo"] = "clientUserInfo";
    MessageTypeToLucraClient["convertToCreditResponse"] = "convertToCreditResponse";
    MessageTypeToLucraClient["enableConvertToCredit"] = "enableConvertToCredit";
    MessageTypeToLucraClient["deepLinkResponse"] = "deepLinkResponse";
})(MessageTypeToLucraClient || (MessageTypeToLucraClient = {}));
