import type { UserInfo } from "./user-info";

export enum LucraSportsMessageType {
  login = "login",
  userInfo = "userInfo",
  matchupCreated = "matchupCreated",
}

export type LucraSportsOnMessage = {
  login: (successful: boolean) => void;
  userInfo: (data: UserInfo) => void;
  matchupCreated: (data: { matchupId: string }) => void;
};

export type LucraSportsSendMessage = {
  userInfo: (data: UserInfo) => void;
};

export type LucraSportsMessage = (body: {
  type: LucraSportsMessageType;
  data: any;
}) => void;
