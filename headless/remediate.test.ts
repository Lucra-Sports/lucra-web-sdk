import { describe, it, expect, mock } from "bun:test";
import { LucraError, type LucraErrorCode } from "./errors.ts";
import { createWithRemediation } from "./remediate.ts";
import type { LucraPresentResult } from "./types.ts";

const COMPLETED: LucraPresentResult = { status: "completed" };

function setup(result: () => Promise<LucraPresentResult> = async () => COMPLETED) {
  const shown: string[] = [];
  const screen = (name: string) =>
    mock(() => {
      shown.push(name);
      return result();
    });
  const present = {
    login: screen("login"),
    demographics: screen("demographics"),
    kyc: screen("kyc"),
    locationGrant: screen("locationGrant"),
    addFunds: mock(async () => ({ status: "completed" as const, message: "ok" })),
  };
  const withRemediation = createWithRemediation(present as never);
  return { present, shown, withRemediation };
}

// A call that fails with these codes in turn, then resolves with "done".
function failing(...codes: LucraErrorCode[]) {
  const errors = codes.map((code) => new LucraError(code));
  const call = mock(async () => {
    const error = errors[call.mock.calls.length - 1];
    if (error) throw error;
    return "done";
  });
  return { call, errors };
}

const caught = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error) => error
  );

describe("createWithRemediation", () => {
  it("resolves with the call's value and shows nothing when the call succeeds", async () => {
    const { shown, withRemediation } = setup();
    expect(await withRemediation(async () => 42)).toBe(42);
    expect(shown).toEqual([]);
  });

  it("shows login for NOT_LOGGED_IN, then runs the call again", async () => {
    const { shown, withRemediation } = setup();
    const { call } = failing("NOT_LOGGED_IN");
    expect(await withRemediation(call)).toBe("done");
    expect(shown).toEqual(["login"]);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("shows each different fix in the order the errors ask for them", async () => {
    const { shown, withRemediation } = setup();
    const { call } = failing("NOT_LOGGED_IN", "DEMOGRAPHIC_INFORMATION_MISSING", "LOCATION_NEEDED");
    expect(await withRemediation(call)).toBe("done");
    expect(shown).toEqual(["login", "demographics", "locationGrant"]);
    expect(call).toHaveBeenCalledTimes(4);
  });

  it("rejects when the same fix is asked for twice, and shows it only once", async () => {
    const { shown, withRemediation } = setup();
    const { call, errors } = failing("LOCATION_NEEDED", "LOCATION_NEEDED");
    expect(await caught(withRemediation(call))).toBe(errors[1]);
    expect(shown).toEqual(["locationGrant"]);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("rejects with the asking error when the user leaves the screen", async () => {
    const { shown, withRemediation } = setup(async () => ({ status: "dismissed", reason: "exit" }));
    const { call, errors } = failing("UNVERIFIED");
    expect(await caught(withRemediation(call))).toBe(errors[0]);
    expect(shown).toEqual(["kyc"]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("rejects with the asking error when the screen fails", async () => {
    const { withRemediation } = setup(async () => {
      throw new LucraError("CONNECTION_FAILED");
    });
    const { call, errors } = failing("NOT_LOGGED_IN");
    expect(await caught(withRemediation(call))).toBe(errors[0]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("passes INSUFFICIENT_FUNDS through and opens no Add Funds window", async () => {
    const { present, shown, withRemediation } = setup();
    const { call, errors } = failing("INSUFFICIENT_FUNDS");
    expect(await caught(withRemediation(call))).toBe(errors[0]);
    expect(shown).toEqual([]);
    expect(present.addFunds).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("never runs a call again when its outcome is unknown", async () => {
    const { shown, withRemediation } = setup();
    const error = new LucraError("LOCATION_NEEDED", undefined, { outcomeUnknown: true });
    const call = mock(async () => {
      throw error;
    });
    expect(await caught(withRemediation(call))).toBe(error);
    expect(shown).toEqual([]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("passes an error with no fix, and a non Lucra error, through as they are", async () => {
    const { shown, withRemediation } = setup();
    const lucra = new LucraError("API_ERROR");
    expect(await caught(withRemediation(() => Promise.reject(lucra)))).toBe(lucra);
    const other = new TypeError("boom");
    expect(await caught(withRemediation(() => Promise.reject(other)))).toBe(other);
    expect(shown).toEqual([]);
  });

  it("treats a call that throws at once as a rejection", async () => {
    const { shown, withRemediation } = setup();
    const error = new LucraError("NOT_LOGGED_IN");
    let runs = 0;
    const call = () => {
      runs += 1;
      if (runs === 1) throw error;
      return Promise.resolve("done");
    };
    expect(await withRemediation(call)).toBe("done");
    expect(shown).toEqual(["login"]);
  });

  it("rejects INVALID_ARGUMENT when call is not a function", async () => {
    const { shown, withRemediation } = setup();
    const error = (await caught(withRemediation("join" as never))) as LucraError;
    expect(error.code).toBe("INVALID_ARGUMENT");
    expect(error.hint).toContain("function");
    expect(shown).toEqual([]);
  });
});
