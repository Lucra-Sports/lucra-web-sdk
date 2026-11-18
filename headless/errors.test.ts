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
    expect(error.message).toBe("This is taking longer than expected");
    expect(error.remediation).toBeNull();
    expect(error.outcomeUnknown).toBe(false);
    expect(error.source).toBe("sdk");
    expect(error.hint).toContain("15 seconds");
  });

  it("uses the given message, outcomeUnknown, and cause", () => {
    const cause = new Error("inner");
    const error = new LucraError("API_ERROR", "boom", { outcomeUnknown: true, cause });
    expect(error.message).toBe("boom");
    expect(error.outcomeUnknown).toBe(true);
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it("falls back to the default message for an empty one", () => {
    expect(new LucraError("NOT_FOUND", "").message).toBe("This could not be found");
  });

  it("is raised by the SDK unless it was made from Lucra's answer", () => {
    for (const code of Object.values(LucraErrorCode)) {
      expect(new LucraError(code).source).toBe("sdk");
    }
  });

  it("uses a given hint over the default one", () => {
    expect(new LucraError("INVALID_CONFIG", undefined, { hint: "h" }).hint).toBe("h");
    expect(new LucraError("INVALID_CONFIG").hint).toContain("config");
  });

  it("gives these hints, and none for codes only Lucra reports", () => {
    const hints: [LucraErrorCode, string][] = [
      ["NOT_LOGGED_IN", "lucra.present.login()"],
      ["IN_PROGRESS", "Another write is pending"],
      ["TIMEOUT", "outcomeUnknown"],
      ["CONNECTION_FAILED", "apiKey, tenantId, and env"],
      ["CONNECTION_TIMEOUT", "frame-src"],
      ["CONNECTION_RESET", "Lucra restarted"],
      ["DESTROYED", "lucra.destroy()"],
      ["POPUP_BLOCKED", "click handler"],
      ["SCREEN_OPEN", "lucra.present screen"],
      ["LOGOUT_FAILED", "logout"],
      ["INVALID_ARGUMENT", "argument"],
      ["INVALID_CONFIG", "config"],
      ["UNSUPPORTED_ENVIRONMENT", "browser"],
    ];
    for (const [code, text] of hints) {
      expect(new LucraError(code).hint).toContain(text);
    }
    for (const code of [
      "UNVERIFIED",
      "INSUFFICIENT_FUNDS",
      "DEMOGRAPHIC_INFORMATION_MISSING",
      "LOCATION_ERROR",
      "LOCATION_NEEDED",
      "NOT_ALLOWED",
      "INVALID_AT_STAKE",
      "INVALID_REWARD_TYPE",
      "INVALID_PLAY_STYLE",
      "API_ERROR",
      "NOT_FOUND",
      "CANCELLED",
    ] as const) {
      expect(new LucraError(code).hint).toBeNull();
    }
  });

  it("has a default message for every code that is safe to show a user", () => {
    // Words that address a developer. A default message must never use them.
    const banned = [
      /apiKey/i,
      /tenantId/i,
      /\benv\b/i,
      /click handler/i,
      /\bwrites?\b/i,
      /destroy/i,
      /config/i,
      /argument/i,
      /request/i,
      /\bcall\b/i,
      /lucra\./i,
      /\(\)/,
      /the user/i,
      /\bSDK\b/,
    ];
    for (const code of Object.values(LucraErrorCode)) {
      const message = new LucraError(code).message;
      expect(message.length).toBeGreaterThan(0);
      for (const word of banned) {
        if (word.test(message)) throw new Error(`${code}: "${message}" matches ${word}`);
      }
    }
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

  it("marks every error it makes as from Lucra, with no hint", () => {
    const errors = [
      fromApiError({ code: "INSUFFICIENT_FUNDS", message: "m" }, write),
      fromApiError({ code: "API_ERROR", message: "Recreational game matchup not found" }, write),
      fromApiError(
        { code: "NOT_ALLOWED", message: "Another createRecreationalGame request is already in progress" },
        write
      ),
      fromApiError({ code: "API_ERROR" }, write),
      fromApiError(null, { kind: "read" }),
    ];
    expect(errors.map((error) => error.code)).toEqual([
      "INSUFFICIENT_FUNDS",
      "NOT_FOUND",
      "IN_PROGRESS",
      "API_ERROR",
      "API_ERROR",
    ]);
    for (const error of errors) {
      expect(error.source).toBe("lucra");
      expect(error.hint).toBeNull();
    }
    // Lucra's own text, exactly as it sent it.
    expect(errors[1].message).toBe("Recreational game matchup not found");
    expect(errors[2].message).toBe("Another createRecreationalGame request is already in progress");
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
    expect(fromApiError(null, { kind: "read" }).message).toBe("Something went wrong");
  });

  it("never passes an SDK only code through from Lucra", () => {
    expect(fromApiError({ code: "DESTROYED" }, { kind: "read" }).code).toBe("API_ERROR");
  });
});
