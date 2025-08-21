export type LucraEnvironment =
  | "local"
  | "dev1"
  | "dev2"
  | "staging"
  | "sandbox"
  | "production";

export enum LucraClientMessageType {
  userInfo = "userInfo",
  matchupCreated = "matchupCreated",
  matchupStarted = "matchupStarted",
  matchupCanceled = "matchupCanceled",
  matchupAccepted = "matchupAccepted",
  tournamentJoined = "tournamentJoined",
  convertToCredit = "convertToCredit",
  deepLink = "deepLink",
  navigationEvent = "navigationEvent",
  claimReward = "claimReward",
  loginSuccess = "loginSuccess",
}

export enum MessageTypeToLucraClient {
  clientUserInfo = "clientUserInfo",
  convertToCreditResponse = "convertToCreditResponse",
  enableConvertToCredit = "enableConvertToCredit",
  deepLinkResponse = "deepLinkResponse",
  navigate = "navigate",
  availableRewards = "availableRewards",
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
export type LucraNavigateRequest = {
  pathname: string;
};

export type LucraAvailableRewards = {
  rewards: LucraReward[];
};

export type LucraUserInfoBody = SDKLucraUser;
export type LucraMatchupStartedBody = { matchupId: string };
export type LucraMatchupCreatedBody = { matchupId: string };
export type LucraMatchupCanceledBody = { matchupId: string };
export type LucraMatchupAcceptedBody = { matchupId: string };
export type LucraTournamentJoinedBody = { matchupId: string };
export type LucraConvertToCreditBody = { amount: number };
export type LucraDeepLinkBody = { url: string };
export type LucraNavigationEventBody = { url: string; page?: LucraPage };
export type LucraClaimRewardBody = { reward: LucraReward };
export type LucraLoginSuccessBody = SDKLucraUser;

export type LucraClientConstructor = {
  tenantId: string;
  env: LucraEnvironment;
  onMessage: LucraClientOnMessage;
  /** @deprecated This is no longer utilized and will be removed in the next version */
  useTestUsers?: boolean;
  locationId?: string;
};

export type LucraClientOnMessage = {
  userInfo: (data: LucraUserInfoBody) => void;
  matchupCreated: (data: LucraMatchupCreatedBody) => void;
  matchupStarted: (data: LucraMatchupStartedBody) => void;
  matchupAccepted: (data: LucraMatchupAcceptedBody) => void;
  matchupCanceled: (data: LucraMatchupCanceledBody) => void;
  convertToCredit: (data: LucraConvertToCreditBody) => void;
  tournamentJoined: (data: LucraTournamentJoinedBody) => void;
  deepLink: (data: LucraDeepLinkBody) => void;
  navigationEvent: (data: LucraNavigationEventBody) => void;
  claimReward: (data: LucraClaimRewardBody) => void;
  loginSuccess: (data: LucraLoginSuccessBody) => void;
};

export type LucraClientSendMessage = {
  userUpdated: (data: SDKClientUser) => void;
  convertToCreditResponse: (data: LucraConvertToCreditResponse) => void;
  enableConvertToCredit: () => void;
  deepLinkResponse: (data: LucraDeepLinkResponse) => void;
  navigate: (data: LucraNavigateRequest) => void;
  availableRewards: (data: LucraAvailableRewards) => void;
};

export type LucraClientMessage = (body: {
  type: LucraClientMessageType;
  data: any;
}) => void;

export type LucraPage =
  | "add-funds"
  | "create-matchup"
  | "home"
  | "id-scan-complete"
  | "kyc"
  | "logout"
  | "matchup-details"
  | "profile"
  | "search"
  | "tournament-details"
  | "transactions"
  | "withdraw-funds";

export type StateFull =
  | "Alaska"
  | "Alabama"
  | "Arkansas"
  | "Arizona"
  | "California"
  | "Colorado"
  | "Connecticut"
  | "District of Columbia"
  | "Delaware"
  | "Florida"
  | "Georgia"
  | "Hawaii"
  | "Iowa"
  | "Idaho"
  | "Illinois"
  | "Indiana"
  | "Kansas"
  | "Kentucky"
  | "Louisiana"
  | "Massachusetts"
  | "Maryland"
  | "Maine"
  | "Michigan"
  | "Minnesota"
  | "Missouri"
  | "Mississippi"
  | "Montana"
  | "North Carolina"
  | "North Dakota"
  | "Nebraska"
  | "New Hampshire"
  | "New Jersey"
  | "New Mexico"
  | "Nevada"
  | "New York"
  | "Ohio"
  | "Oklahoma"
  | "Oregon"
  | "Pennsylvania"
  | "Rhode Island"
  | "South Carolina"
  | "South Dakota"
  | "Tennessee"
  | "Texas"
  | "Utah"
  | "Virginia"
  | "Vermont"
  | "Washington"
  | "Wisconsin"
  | "West Virginia"
  | "Wyoming";

export type StateCode =
  | "AK"
  | "AL"
  | "AR"
  | "AZ"
  | "CA"
  | "CO"
  | "CT"
  | "DC"
  | "DE"
  | "FL"
  | "GA"
  | "HI"
  | "IA"
  | "ID"
  | "IL"
  | "IN"
  | "KS"
  | "KY"
  | "LA"
  | "MA"
  | "MD"
  | "ME"
  | "MI"
  | "MN"
  | "MO"
  | "MS"
  | "MT"
  | "NC"
  | "ND"
  | "NE"
  | "NH"
  | "NJ"
  | "NM"
  | "NV"
  | "NY"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VA"
  | "VT"
  | "WA"
  | "WI"
  | "WV"
  | "WY";

enum account_status_types_enum {
  // For free to play sports, a status that indicates they have passed an age assurance check and are verified to play.
  AGE_ASSURED_VERIFIED = "AGE_ASSURED_VERIFIED",
  // User blocked by an admin
  BLOCKED = "BLOCKED",
  // User account has been closed
  CLOSED = "CLOSED",
  // User account has been marked to be closed once contests complete
  CLOSED_PENDING = "CLOSED_PENDING",
  // User should be hidden from any client services
  HIDDEN = "HIDDEN",
  // User suspended by an admin
  SUSPENDED = "SUSPENDED",
  // User has not attempted verification or needs to re-verify
  UNVERIFIED = "UNVERIFIED",
  // User needs to scan his/her ID for verification
  USER_SCAN_REQUIRED = "USER_SCAN_REQUIRED",
  // There was an error when attempting to verify user
  VERIFICATION_ERROR = "VERIFICATION_ERROR",
  // User has attempted verification and failed
  VERIFICATION_FAILED = "VERIFICATION_FAILED",
  // User is awaiting a KYC user scan result
  VERIFICATION_SCAN_PENDING = "VERIFICATION_SCAN_PENDING",
  // User has been verified
  VERIFIED = "VERIFIED",
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

export type LucraReward = {
  rewardId: string;
  title: string;
  descriptor: string;
  iconUrl: string;
  bannerIconUrl: string;
  disclaimer: string;
  metadata: unknown;
};
