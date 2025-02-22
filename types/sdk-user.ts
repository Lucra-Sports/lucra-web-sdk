import type { StateCode } from "./states";

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
