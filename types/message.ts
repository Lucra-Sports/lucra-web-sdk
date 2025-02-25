import type { SDKClientUser, SDKLucraUser } from "./sdk-user";

export type LucraSportsDestination = "home" | "profile" | "create-matchup";
export type LucraSportsEnvironment = "sandbox" | "production";

export enum LucraSportsMessageType {
  userInfo = "userInfo",
  matchupCreated = "matchupCreated",
  matchupCanceled = "matchupCanceled",
  matchupAccepted = "matchupAccepted",
}

export enum MessageTypeToLucraSports {
  clientUserInfo = "clientUserInfo",
}

export type LucraUserInfoBody = SDKLucraUser;
export type LucraMatchupCreatedBody = { matchupId: string };
export type LucraMatchupCanceledBody = { matchupId: string };
export type LucraMatchupAcceptedBody = { matchupId: string };

export type LucraSportsOnMessage = {
  userInfo: (data: LucraUserInfoBody) => void;
  matchupCreated: (data: LucraMatchupCreatedBody) => void;
  matchupAccepted: (data: LucraMatchupAcceptedBody) => void;
  matchupCanceled: (data: LucraMatchupCanceledBody) => void;
};

export type LucraSportsSendMessage = {
  userUpdated: (data: SDKClientUser) => void;
};

export type LucraSportsMessage = (body: {
  type: LucraSportsMessageType;
  data: any;
}) => void;
