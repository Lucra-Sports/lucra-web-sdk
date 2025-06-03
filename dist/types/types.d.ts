export type LucraEnvironment = "local" | "dev1" | "dev2" | "staging" | "sandbox" | "production";
export declare enum LucraClientMessageType {
    userInfo = "userInfo",
    matchupCreated = "matchupCreated",
    matchupCanceled = "matchupCanceled",
    matchupAccepted = "matchupAccepted",
    tournamentJoined = "tournamentJoined",
    convertToCredit = "convertToCredit",
    deepLink = "deepLink",
    navigationEvent = "navigationEvent"
}
export declare enum MessageTypeToLucraClient {
    clientUserInfo = "clientUserInfo",
    convertToCreditResponse = "convertToCreditResponse",
    enableConvertToCredit = "enableConvertToCredit",
    deepLinkResponse = "deepLinkResponse"
}
export type LucraConvertToCreditResponse = {
    id: string;
    title: string;
    iconUrl?: string;
    theme?: {
        cardColor: string;
        cardTextColor: string;
        pillColor: string;
        pillTextColor: string;
    };
    conversionTerms: string;
    convertedAmount: number;
    convertedDisplayAmount: string;
    shortDescription: string;
    longDescription: string;
    metaData?: Record<string, string>;
};
export type LucraDeepLinkResponse = {
    url: string;
};
export type LucraUserInfoBody = SDKLucraUser;
export type LucraMatchupCreatedBody = {
    matchupId: string;
};
export type LucraMatchupCanceledBody = {
    matchupId: string;
};
export type LucraMatchupAcceptedBody = {
    matchupId: string;
};
export type LucraTournamentJoinedBody = {
    matchupId: string;
};
export type LucraConvertToCreditBody = {
    amount: number;
};
export type LucraDeepLinkBody = {
    url: string;
};
export type LucraNavigationEventBody = {
    url: string;
};
export type LucraClientOnMessage = {
    userInfo: (data: LucraUserInfoBody) => void;
    matchupCreated: (data: LucraMatchupCreatedBody) => void;
    matchupAccepted: (data: LucraMatchupAcceptedBody) => void;
    matchupCanceled: (data: LucraMatchupCanceledBody) => void;
    convertToCredit: (data: LucraConvertToCreditBody) => void;
    tournamentJoined: (data: LucraTournamentJoinedBody) => void;
    deepLink: (data: LucraDeepLinkBody) => void;
    navigationEvent: (data: LucraNavigationEventBody) => void;
};
export type LucraClientSendMessage = {
    userUpdated: (data: SDKClientUser) => void;
    convertToCreditResponse: (data: LucraConvertToCreditResponse) => void;
    enableConvertToCredit: () => void;
    deepLinkResponse: (data: LucraDeepLinkResponse) => void;
};
export type LucraClientMessage = (body: {
    type: LucraClientMessageType;
    data: any;
}) => void;
export type StateFull = "Alaska" | "Alabama" | "Arkansas" | "Arizona" | "California" | "Colorado" | "Connecticut" | "District of Columbia" | "Delaware" | "Florida" | "Georgia" | "Hawaii" | "Iowa" | "Idaho" | "Illinois" | "Indiana" | "Kansas" | "Kentucky" | "Louisiana" | "Massachusetts" | "Maryland" | "Maine" | "Michigan" | "Minnesota" | "Missouri" | "Mississippi" | "Montana" | "North Carolina" | "North Dakota" | "Nebraska" | "New Hampshire" | "New Jersey" | "New Mexico" | "Nevada" | "New York" | "Ohio" | "Oklahoma" | "Oregon" | "Pennsylvania" | "Rhode Island" | "South Carolina" | "South Dakota" | "Tennessee" | "Texas" | "Utah" | "Virginia" | "Vermont" | "Washington" | "Wisconsin" | "West Virginia" | "Wyoming";
export type StateCode = "AK" | "AL" | "AR" | "AZ" | "CA" | "CO" | "CT" | "DC" | "DE" | "FL" | "GA" | "HI" | "IA" | "ID" | "IL" | "IN" | "KS" | "KY" | "LA" | "MA" | "MD" | "ME" | "MI" | "MN" | "MO" | "MS" | "MT" | "NC" | "ND" | "NE" | "NH" | "NJ" | "NM" | "NV" | "NY" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC" | "SD" | "TN" | "TX" | "UT" | "VA" | "VT" | "WA" | "WI" | "WV" | "WY";
declare enum account_status_types_enum {
    AGE_ASSURED_VERIFIED = "AGE_ASSURED_VERIFIED",
    BLOCKED = "BLOCKED",
    CLOSED = "CLOSED",
    CLOSED_PENDING = "CLOSED_PENDING",
    HIDDEN = "HIDDEN",
    SUSPENDED = "SUSPENDED",
    UNVERIFIED = "UNVERIFIED",
    USER_SCAN_REQUIRED = "USER_SCAN_REQUIRED",
    VERIFICATION_ERROR = "VERIFICATION_ERROR",
    VERIFICATION_FAILED = "VERIFICATION_FAILED",
    VERIFICATION_SCAN_PENDING = "VERIFICATION_SCAN_PENDING",
    VERIFIED = "VERIFIED"
}
export type SDKLucraAddress = {
    address?: string;
    addressCont?: string;
    city?: string;
    state?: StateCode;
    zip?: string;
};
export type SDKLucraUser = {
    id?: string;
    username?: string;
    avatarURL?: string;
    phoneNumber?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    address?: SDKLucraAddress;
    balance?: number;
    accountStatus?: account_status_types_enum;
};
export type SDKClientUser = {
    username?: string;
    avatarURL?: string;
    phoneNumber?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    address?: SDKLucraAddress;
};
export {};
