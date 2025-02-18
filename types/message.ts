import type { UserInfo } from "./user-info";

export enum LucraSportsMessageType {
  login = "login",
  userInfo = "userInfo",
  matchupCreated = "matchupCreated",
  matchupCanceled = "matchupCanceled",
  matchupCompleted = "matchupCompleted",
}

export type LucraLoginBody = string;
export type LucraUserInfoBody = UserInfo;
export type LucraMatchupCreatedBody = { matchupId: string };
export type LucraMatchupCanceledBody = { matchupId: string; userId: string };
export type LucraMatchupCompletedBody = {
  matchupId: string;
  result: "won" | "lost" | "tied";
};

export type LucraSportsOnMessage = {
  login: (lucraUserId: LucraLoginBody) => void;
  userInfo: (data: LucraUserInfoBody) => void;
  matchupCreated: (data: LucraMatchupCreatedBody) => void;
  matchupCanceled: (data: LucraMatchupCanceledBody) => void;
  matchupCompleted: (data: LucraMatchupCompletedBody) => void;
};

export type LucraSportsSendMessage = {
  userInfo: (data: UserInfo) => void;
};

export type LucraSportsMessage = (body: {
  type: LucraSportsMessageType;
  data: any;
}) => void;
