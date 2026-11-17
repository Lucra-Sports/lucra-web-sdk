import { describe, it, expect, mock, spyOn } from "bun:test";
import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
} from "../types/types.ts";
import { SDK_VERSION } from "../version.ts";
import { LucraError } from "./errors.ts";
import type { RequestSpec } from "./requests.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame } from "./testing.ts";

const URL = "https://test-tenant.sandbox.lucrasports.com/app/headless";

const READ: RequestSpec<{ n: number }> = {
  type: MessageTypeToLucraClient.tournamentRequest,
  responseType: LucraClientMessageType.tournamentResponse,
  kind: "read",
};
const WRITE: RequestSpec<{ n: number }> = {
  type: MessageTypeToLucraClient.joinTournamentRequest,
  responseType: LucraClientMessageType.joinTournamentResponse,
  kind: "write",
};

function setup(timeouts: Partial<Timeouts> = {}, unsupported = false) {
  const frame = createFakeFrame();
  const session = createSession({
    frame,
    url: URL,
    timeouts: { ...DEFAULT_TIMEOUTS, ...timeouts },
    unsupported,
  });
  return { frame, session };
}

const caught = (promise: Promise<unknown>): Promise<LucraError> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error) => error as LucraError
  );

describe("createSession", () => {
  it("loads the url and starts out connecting", () => {
    const { frame, session } = setup();
    expect(frame.urls).toEqual([URL]);
    expect(session.status()).toBe("connecting");
  });

  it("connects on initialized success", async () => {
    const { frame, session } = setup();
    const connected = session.whenConnected();
    frame.deliver("initialized", { success: true });
    await connected;
    expect(session.status()).toBe("connected");
    await session.whenConnected();
  });

  it("fails on initialized failure", async () => {
    const { frame, session } = setup();
    const waiting = caught(session.whenConnected());
    frame.deliver("initialized", { success: false });
    expect((await waiting).code).toBe("CONNECTION_FAILED");
    expect(session.status()).toBe("failed");
    expect((await caught(session.whenConnected())).code).toBe("CONNECTION_FAILED");
  });

  it("recovers when a later initialized succeeds", async () => {
    const { frame, session } = setup();
    frame.deliver("initialized", { success: false });
    frame.deliver("initialized", { success: true });
    await session.whenConnected();
    expect(session.status()).toBe("connected");
  });

  it("gives up one call after connectMs but keeps connecting", async () => {
    const { frame, session } = setup({ connectMs: 20 });
    expect((await caught(session.whenConnected())).code).toBe("CONNECTION_TIMEOUT");
    expect(session.status()).toBe("connecting");
    const next = session.whenConnected();
    frame.deliver("initialized", { success: true });
    await next;
  });

  it("runs onConnected listeners on every start", () => {
    const { frame, session } = setup();
    const listener = mock(() => {});
    const off = session.onConnected(listener);
    frame.deliver("initialized", { success: true });
    frame.deliver("initialized", { success: true });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    frame.deliver("initialized", { success: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps running listeners when one throws", () => {
    const { frame, session } = setup();
    const error = spyOn(console, "error").mockImplementation(() => {});
    const second = mock(() => {});
    session.onConnected(() => {
      throw new Error("listener failed");
    });
    session.onConnected(second);
    frame.deliver("initialized", { success: true });
    expect(second).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("sends a request and settles it by requestId", async () => {
    const { frame, session } = setup();
    frame.deliver("initialized", { success: true });
    const pending = session.request(READ, { matchupId: "t1" });
    expect(frame.lastPosted("tournamentRequest")?.body).toEqual({ matchupId: "t1" });
    frame.answer("tournamentRequest", "tournamentResponse", { n: 1 });
    expect(await pending).toEqual({ n: 1 });
  });

  it("rejects pending requests when Lucra starts again", async () => {
    const { frame, session } = setup();
    frame.deliver("initialized", { success: true });
    const read = caught(session.request(READ, {}));
    const write = caught(session.request(WRITE, {}));
    frame.deliver("initialized", { success: true });
    expect((await read).code).toBe("CONNECTION_RESET");
    expect((await read).outcomeUnknown).toBe(false);
    expect((await write).code).toBe("CONNECTION_RESET");
    expect((await write).outcomeUnknown).toBe(true);
  });

  it("rejects pending requests when Lucra starts again and fails", async () => {
    const { frame, session } = setup({ requestMs: 40 });
    frame.deliver("initialized", { success: true });
    const read = caught(session.request(READ, {}));
    const write = caught(session.request(WRITE, {}));
    frame.deliver("initialized", { success: false });
    expect((await read).code).toBe("CONNECTION_RESET");
    expect((await write).code).toBe("CONNECTION_RESET");
    expect((await write).outcomeUnknown).toBe(true);
    expect(session.status()).toBe("failed");
  });

  it("does not reject anything on the first initialized", async () => {
    const { frame, session } = setup();
    const pending = session.request(READ, {});
    frame.deliver("initialized", { success: true });
    frame.answer("tournamentRequest", "tournamentResponse", { n: 1 });
    expect(await pending).toEqual({ n: 1 });
  });

  it("restart loads the new url, rejects pending, and waits to connect again", async () => {
    const { frame, session } = setup();
    frame.deliver("initialized", { success: true });
    const pending = caught(session.request(READ, {}));
    session.restart("https://test-tenant.sandbox.lucrasports.com/?login=true");
    expect((await pending).code).toBe("CONNECTION_RESET");
    expect(frame.urls[1]).toBe("https://test-tenant.sandbox.lucrasports.com/?login=true");
    expect(session.status()).toBe("connecting");
    const connected = session.whenConnected();
    frame.deliver("initialized", { success: true });
    await connected;
  });

  it("delivers inbound messages to on() listeners by type", () => {
    const { frame, session } = setup();
    const listener = mock((_data: unknown) => {});
    const off = session.on("loginSuccess", listener);
    frame.deliver("loginSuccess", { id: "u1" });
    frame.deliver("userInfo", { id: "u1" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: "u1" });
    off();
    frame.deliver("loginSuccess", { id: "u1" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not pass an answer to a request on to on() listeners", async () => {
    const { frame, session } = setup();
    frame.deliver("initialized", { success: true });
    const listener = mock((_data: unknown) => {});
    session.on("autoJoinedTournaments", listener);
    // Lucra's own auto join carries no requestId, so it is an event.
    frame.deliver("autoJoinedTournaments", { matchupIds: ["t0"] });
    expect(listener).toHaveBeenCalledTimes(1);
    const autoJoin: RequestSpec<{ matchupIds: string[] }> = {
      type: MessageTypeToLucraClient.autoJoinTournamentsRequest,
      responseType: LucraClientMessageType.autoJoinedTournaments,
      kind: "write",
    };
    const pending = session.request(autoJoin);
    frame.answer("autoJoinTournamentsRequest", "autoJoinedTournaments", { matchupIds: ["t1"] });
    expect(await pending).toEqual({ matchupIds: ["t1"] });
    // The same message type, but this one answered a request.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("posts a message with no requestId", () => {
    const { frame, session } = setup();
    session.post(MessageTypeToLucraClient.enableExitLucra, true);
    expect<unknown>(frame.posted[0]).toEqual({ type: "enableExitLucra", body: true });
  });

  it("does not throw when a post fails, and logs only the type", () => {
    const { frame, session } = setup();
    const error = spyOn(console, "error").mockImplementation(() => {});
    frame.post = () => {
      throw new Error("frame gone");
    };
    session.post(MessageTypeToLucraClient.navigate, { pathname: "/secret" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls[0])).not.toContain("secret");
    error.mockRestore();
  });

  it("reports a timeout to Lucra with sdkDiagnostic", async () => {
    const { frame, session } = setup({ requestMs: 20 });
    frame.deliver("initialized", { success: true });
    expect((await caught(session.request(READ, {}))).code).toBe("TIMEOUT");
    expect(frame.lastPosted("sdkDiagnostic")?.body).toEqual({
      kind: "requestTimeout",
      requestType: "tournamentRequest",
      timeoutMs: 20,
      sdkVersion: SDK_VERSION,
    });
  });

  it("destroy rejects everything and stays destroyed", async () => {
    const { frame, session } = setup();
    const connecting = caught(session.whenConnected());
    const pending = caught(session.request(READ, {}));
    const listener = mock(() => {});
    session.on("loginSuccess", listener);
    session.destroy();
    session.destroy();
    expect((await connecting).code).toBe("DESTROYED");
    expect((await pending).code).toBe("DESTROYED");
    expect(session.status()).toBe("destroyed");
    expect(frame.destroyed).toBe(true);
    expect((await caught(session.whenConnected())).code).toBe("DESTROYED");
    expect((await caught(session.request(READ, {}))).code).toBe("DESTROYED");
    const before = frame.posted.length;
    session.post(MessageTypeToLucraClient.enableExitLucra, true);
    session.restart("https://example.test/");
    expect(frame.posted.length).toBe(before);
    expect(frame.urls.length).toBe(1);
  });

  it("never connects where there is no browser", async () => {
    const { frame, session } = setup({}, true);
    expect(frame.urls).toEqual([]);
    expect(session.status()).toBe("failed");
    expect((await caught(session.whenConnected())).code).toBe("UNSUPPORTED_ENVIRONMENT");
  });
});
