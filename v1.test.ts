import { describe, it, expect, afterEach, mock } from "bun:test";
import { LucraClient } from "./v1.ts";
import type { LucraV1ClientConstructor } from "./types/types.ts";

const baseConfig: LucraV1ClientConstructor = {
  apiKey: "test-api-key",
  tenantId: "test-tenant",
  env: "sandbox",
};

afterEach(() => {
  LucraClient.destroy();
});

describe("LucraClient.initialize", () => {
  it("returns an instance on first call", () => {
    const client = LucraClient.initialize(baseConfig);
    expect(client).toBeInstanceOf(LucraClient);
  });

  it("throws if called a second time without destroy", () => {
    LucraClient.initialize(baseConfig);
    expect(() => LucraClient.initialize(baseConfig)).toThrow(
      "LucraClient is already initialized"
    );
  });

  it("throws if apiKey is missing", () => {
    expect(() =>
      LucraClient.initialize({ ...baseConfig, apiKey: "" })
    ).toThrow("Both apiKey and tenantId must be provided");
  });

  it("throws if tenantId is missing", () => {
    expect(() =>
      LucraClient.initialize({ ...baseConfig, tenantId: "" })
    ).toThrow("Both apiKey and tenantId must be provided");
  });
});

describe("LucraClient.getInstance", () => {
  it("throws if called before initialize", () => {
    expect(() => LucraClient.getInstance()).toThrow(
      "LucraClient has not been initialized"
    );
  });

  it("returns the same instance as initialize", () => {
    const initialized = LucraClient.initialize(baseConfig);
    const retrieved = LucraClient.getInstance();
    expect(retrieved).toBe(initialized);
  });

  it("returns the same instance on repeated calls", () => {
    LucraClient.initialize(baseConfig);
    expect(LucraClient.getInstance()).toBe(LucraClient.getInstance());
  });
});

describe("LucraClient.destroy", () => {
  it("clears the instance so getInstance throws", () => {
    LucraClient.initialize(baseConfig);
    LucraClient.destroy();
    expect(() => LucraClient.getInstance()).toThrow(
      "LucraClient has not been initialized"
    );
  });

  it("allows initialize to be called again after destroy", () => {
    LucraClient.initialize(baseConfig);
    LucraClient.destroy();
    expect(() => LucraClient.initialize(baseConfig)).not.toThrow();
  });

  it("does not throw if called when no instance exists", () => {
    expect(() => LucraClient.destroy()).not.toThrow();
  });
});

describe("LucraClient.on / off", () => {
  it("calls a registered listener when the event is dispatched", () => {
    const client = LucraClient.initialize(baseConfig);
    const handler = mock(() => {});

    client.on("matchupCreated", handler);
    client.dispatchEvent(
      new CustomEvent("matchupCreated", { detail: { matchupId: "abc" } })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ matchupId: "abc" });
  });

  it("calls multiple listeners for the same event", () => {
    const client = LucraClient.initialize(baseConfig);
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});

    client.on("loginSuccess", handler1);
    client.on("loginSuccess", handler2);
    client.dispatchEvent(new CustomEvent("loginSuccess", { detail: {} }));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("does not call a listener after off is called", () => {
    const client = LucraClient.initialize(baseConfig);
    const handler = mock(() => {});

    client.on("userInfo", handler);
    client.off("userInfo", handler);
    client.dispatchEvent(new CustomEvent("userInfo", { detail: {} }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("only removes the specific listener passed to off", () => {
    const client = LucraClient.initialize(baseConfig);
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});

    client.on("matchupCanceled", handler1);
    client.on("matchupCanceled", handler2);
    client.off("matchupCanceled", handler1);
    client.dispatchEvent(new CustomEvent("matchupCanceled", { detail: { matchupId: "xyz" } }));

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("off is a no-op for a listener that was never registered", () => {
    const client = LucraClient.initialize(baseConfig);
    const handler = mock(() => {});
    expect(() => client.off("userInfo", handler)).not.toThrow();
  });
});
