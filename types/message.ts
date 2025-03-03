import type { SDKClientUser, SDKLucraUser } from "./sdk-user";

export type LucraDestination = "home" | "profile" | "create-matchup";
export type LucraEnvironment = "sandbox" | "production";

export enum LucraClientMessageType {
  userInfo = "userInfo",
  matchupCreated = "matchupCreated",
  matchupCanceled = "matchupCanceled",
  matchupAccepted = "matchupAccepted",
}

export enum MessageTypeToLucraClient {
  clientUserInfo = "clientUserInfo",
}

export type LucraUserInfoBody = SDKLucraUser;
export type LucraMatchupCreatedBody = { matchupId: string };
export type LucraMatchupCanceledBody = { matchupId: string };
export type LucraMatchupAcceptedBody = { matchupId: string };

export type LucraClientOnMessage = {
  userInfo: (data: LucraUserInfoBody) => void;
  matchupCreated: (data: LucraMatchupCreatedBody) => void;
  matchupAccepted: (data: LucraMatchupAcceptedBody) => void;
  matchupCanceled: (data: LucraMatchupCanceledBody) => void;
};

export type LucraClientSendMessage = {
  userUpdated: (data: SDKClientUser) => void;
};

export type LucraClientessage = (body: {
  type: LucraClientMessageType;
  data: any;
}) => void;
