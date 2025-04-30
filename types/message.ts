import type { SDKClientUser, SDKLucraUser } from "./sdk-user";

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
  matchupCanceled = "matchupCanceled",
  matchupAccepted = "matchupAccepted",
  tournamentJoined = "tournamentJoined",
  convertToCredit = "convertToCredit",
  deepLink = "deepLink",
}

export enum MessageTypeToLucraClient {
  clientUserInfo = "clientUserInfo",
  convertToCreditResponse = "convertToCreditResponse",
  enableConvertToCredit = "enableConvertToCredit",
  deepLinkResponse = "deepLinkResponse",
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
export type LucraMatchupCreatedBody = { matchupId: string };
export type LucraMatchupCanceledBody = { matchupId: string };
export type LucraMatchupAcceptedBody = { matchupId: string };
export type LucraTournamentJoinedBody = { matchupId: string };
export type LucraConvertToCreditBody = { amount: number };
export type LucraDeepLinkBody = { url: string };

export type LucraClientOnMessage = {
  userInfo: (data: LucraUserInfoBody) => void;
  matchupCreated: (data: LucraMatchupCreatedBody) => void;
  matchupAccepted: (data: LucraMatchupAcceptedBody) => void;
  matchupCanceled: (data: LucraMatchupCanceledBody) => void;
  convertToCredit: (data: LucraConvertToCreditBody) => void;
  tournamentJoined: (data: LucraTournamentJoinedBody) => void;
  deepLink: (data: LucraDeepLinkBody) => void;
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
