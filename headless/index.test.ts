import { describe, it, expect } from "bun:test";
import * as headless from "./index.ts";

describe("lucra-web-sdk/headless exports", () => {
  it("exports the error API", () => {
    expect(typeof headless.LucraError).toBe("function");
    expect(typeof headless.isLucraError).toBe("function");
    expect(headless.LucraErrorCode.TIMEOUT).toBe("TIMEOUT");
  });

  it("exports createLucraClient and nothing internal", () => {
    expect(typeof headless.createLucraClient).toBe("function");
    expect(Object.keys(headless).sort()).toEqual([
      "LucraError",
      "LucraErrorCode",
      "createLucraClient",
      "isLucraError",
    ]);
  });
});
