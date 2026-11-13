import { describe, it, expect } from "bun:test";
import { SDK_VERSION } from "../version.ts";
import { HOME_PATH, buildUrl, lucraOrigin, navigateTarget, type UrlContext } from "./url.ts";

const context: UrlContext = {
  config: { apiKey: "key-1", tenantId: "Test-Tenant", env: "sandbox" },
  parentOrigin: "https://host.example",
};

describe("lucraOrigin", () => {
  it("builds the tenant's origin for each environment", () => {
    expect(lucraOrigin({ tenantId: "Test-Tenant", env: "sandbox" })).toBe(
      "https://test-tenant.sandbox.lucrasports.com"
    );
    expect(lucraOrigin({ tenantId: "Test-Tenant", env: "production" })).toBe(
      "https://test-tenant.lucrasports.com"
    );
    expect(lucraOrigin({ tenantId: "x", env: "local" })).toBe("http://localhost:3000");
  });
});

describe("buildUrl", () => {
  it("adds the parameters Lucra reads on startup", () => {
    const url = new URL(buildUrl(context, HOME_PATH));
    expect(url.origin).toBe("https://test-tenant.sandbox.lucrasports.com");
    expect(url.pathname).toBe("/app/headless");
    expect(url.searchParams.get("apiKey")).toBe("key-1");
    expect(url.searchParams.get("autoJoin")).toBe("true");
    expect(url.searchParams.get("parentUrl")).toBe("https://host.example");
    expect(url.searchParams.get("sdkVersion")).toBe(SDK_VERSION);
    expect(url.searchParams.has("locationId")).toBe(false);
    expect(url.searchParams.has("phoneNumber")).toBe(false);
  });

  it("passes autoJoin false and a locationId through", () => {
    const url = new URL(
      buildUrl(
        { ...context, config: { ...context.config, autoJoin: false, locationId: "loc-9" } },
        HOME_PATH
      )
    );
    expect(url.searchParams.get("autoJoin")).toBe("false");
    expect(url.searchParams.get("locationId")).toBe("loc-9");
  });

  it("adds extra parameters and skips undefined or empty ones", () => {
    const url = new URL(
      buildUrl(context, "", { login: "true", loginOnly: "true", loginHint: undefined, other: "" })
    );
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("login")).toBe("true");
    expect(url.searchParams.get("loginOnly")).toBe("true");
    expect(url.searchParams.has("loginHint")).toBe(false);
    expect(url.searchParams.has("other")).toBe(false);
    expect(
      new URL(buildUrl(context, "", { loginHint: "5551234567" })).searchParams.get("loginHint")
    ).toBe("5551234567");
  });

  it("does not let an extra parameter replace a required one", () => {
    const url = new URL(buildUrl(context, HOME_PATH, { apiKey: "other", parentUrl: "https://evil.example" }));
    expect(url.searchParams.get("apiKey")).toBe("key-1");
    expect(url.searchParams.get("parentUrl")).toBe("https://host.example");
  });
});

describe("navigateTarget", () => {
  it("returns a path inside Lucra that repeats parentUrl", () => {
    expect(navigateTarget(context, "app/kyc")).toBe(
      "/app/kyc?parentUrl=https%3A%2F%2Fhost.example"
    );
    expect(navigateTarget(context, "logout")).toBe(
      "/logout?parentUrl=https%3A%2F%2Fhost.example"
    );
  });
});
