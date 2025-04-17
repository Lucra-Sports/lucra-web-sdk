import type { StateCode } from "./states";
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
type Address = {
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
    address?: Address;
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
    address?: Address;
};
export {};
