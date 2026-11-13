import { describe, it, expect } from "bun:test";
import { LucraApiErrorCode } from "../types/types.ts";
import { LucraError, LucraErrorCode, fromApiError, isLucraError } from "./errors.ts";

describe("LucraError", () => {
  it("is an Error with a code, a default message, and safe defaults", () => {
    const error = new LucraError("TIMEOUT");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LucraError);
    expect(error.name).toBe("LucraError");
    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toBe("Lucra did not answer in time");
    expect(error.remediation).toBeNull();
    expect(error.outcomeUnknown).toBe(false);
  });

  it("uses the given message, outcomeUnknown, and cause", () => {
    const cause = new Error("inner");
    const error = new LucraError("API_ERROR", "boom", { outcomeUnknown: true, cause });
    expect(error.message).toBe("boom");
    expect(error.outcomeUnknown).toBe(true);
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it("falls back to the default message for an empty one", () => {
    expect(new LucraError("NOT_FOUND", "").message).toBe("Not found");
  });

  it("names the screen that fixes each fixable code", () => {
    expect(new LucraError("NOT_LOGGED_IN").remediation).toBe("login");
    expect(new LucraError("INSUFFICIENT_FUNDS").remediation).toBe("addFunds");
    expect(new LucraError("DEMOGRAPHIC_INFORMATION_MISSING").remediation).toBe("demographics");
    expect(new LucraError("LOCATION_NEEDED").remediation).toBe("locationGrant");
    expect(new LucraError("UNVERIFIED").remediation).toBe("kyc");
    expect(new LucraError("LOCATION_ERROR").remediation).toBeNull();
    expect(new LucraError("NOT_ALLOWED").remediation).toBeNull();
  });

  it("has a value equal to its key and a message for every code", () => {
    for (const [key, value] of Object.entries(LucraErrorCode)) {
      expect(value).toBe(key as typeof value);
      expect(new LucraError(value).message.length).toBeGreaterThan(0);
    }
  });

  it("covers every code Lucra can send", () => {
    const codes = new Set<string>(Object.values(LucraErrorCode));
    for (const wire of Object.values(LucraApiErrorCode)) {
      expect(codes.has(wire)).toBe(true);
    }
  });
});

describe("isLucraError", () => {
  it("accepts a LucraError and a look-alike from another bundle", () => {
    expect(isLucraError(new LucraError("TIMEOUT"))).toBe(true);
    expect(isLucraError({ name: "LucraError", code: "TIMEOUT" })).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isLucraError(new Error("x"))).toBe(false);
    expect(isLucraError("Timeout")).toBe(false);
    expect(isLucraError(null)).toBe(false);
    expect(isLucraError(undefined)).toBe(false);
    expect(isLucraError({ name: "LucraError" })).toBe(false);
  });
});

describe("fromApiError", () => {
  const write = { kind: "write" as const, unknownOnApiError: true };

  it("keeps Lucra's code and message", () => {
    const error = fromApiError({ code: "INSUFFICIENT_FUNDS", message: "m" }, write);
    expect(error.code).toBe("INSUFFICIENT_FUNDS");
    expect(error.message).toBe("m");
    expect(error.remediation).toBe("addFunds");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("turns the not found message into NOT_FOUND", () => {
    const error = fromApiError(
      { code: "API_ERROR", message: "Recreational game matchup not found" },
      write
    );
    expect(error.code).toBe("NOT_FOUND");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("turns the in progress message into IN_PROGRESS, and leaves other NOT_ALLOWED alone", () => {
    const busy = fromApiError(
      { code: "NOT_ALLOWED", message: "Another createRecreationalGame request is already in progress" },
      write
    );
    expect(busy.code).toBe("IN_PROGRESS");
    expect(busy.outcomeUnknown).toBe(false);
    expect(fromApiError({ code: "NOT_ALLOWED", message: "Matchup is not open" }, write).code).toBe("NOT_ALLOWED");
    expect(fromApiError({ code: "NOT_ALLOWED" }, write).code).toBe("NOT_ALLOWED");
  });

  it("marks API_ERROR as outcome unknown only for a write that asks for it", () => {
    const body = { code: "API_ERROR", message: "The join was not confirmed" };
    expect(fromApiError(body, write).outcomeUnknown).toBe(true);
    expect(fromApiError({ code: "API_ERROR" }, write).outcomeUnknown).toBe(true);
    expect(fromApiError(body, { kind: "write" }).outcomeUnknown).toBe(false);
    expect(fromApiError(body, { kind: "read", unknownOnApiError: true }).outcomeUnknown).toBe(false);
  });

  it("knows the API_ERROR messages that mean nothing happened", () => {
    const error = fromApiError({ code: "API_ERROR", message: "gameTypeId is required" }, write);
    expect(error.code).toBe("API_ERROR");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("treats an unknown code or a missing body as API_ERROR", () => {
    const unknown = fromApiError({ code: "SOMETHING_NEW", message: "x" }, { kind: "read" });
    expect(unknown.code).toBe("API_ERROR");
    expect(unknown.message).toBe("x");
    expect(fromApiError(undefined, { kind: "read" }).code).toBe("API_ERROR");
    expect(fromApiError(null, { kind: "read" }).message).toBe("The request could not be completed");
  });

  it("never passes an SDK only code through from Lucra", () => {
    expect(fromApiError({ code: "DESTROYED" }, { kind: "read" }).code).toBe("API_ERROR");
  });
});
