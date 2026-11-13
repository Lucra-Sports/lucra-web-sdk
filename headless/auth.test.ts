import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { createAuth } from "./auth.ts";
import { LucraError } from "./errors.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";
import type { LucraAuthState } from "./types.ts";
import { HOME_PATH, buildUrl } from "./url.ts";

const urls = {
  config: { apiKey: "key-1", tenantId: "test-tenant", env: "sandbox" as const },
  parentOrigin: "https://host.example",
};
const USER = { id: "u1", username: "pat", balance: 25 };

function setup(overrides: Partial<Timeouts> = {}) {
  const frame = createFakeFrame();
  const timeouts = { ...DEFAULT_TIMEOUTS, ...overrides };
  const session = createSession({ frame, url: buildUrl(urls, HOME_PATH), timeouts });
  const auth = createAuth({ session, urls, timeouts });
  return { frame, session, auth };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const count = (frame: FakeFrame, type: string) =>
  frame.posted.filter((message) => message.type === type).length;
const caught = (promise: Promise<unknown>): Promise<LucraError> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error) => error as LucraError
  );

const answerLoginCheck = (frame: FakeFrame, data: { isLoggedIn: boolean; pending?: boolean }) =>
  frame.answer("isLoggedInRequest", "isLoggedInResponse", data);

async function connectLoggedOut(frame: FakeFrame) {
  frame.deliver("initialized", { success: true });
  answerLoginCheck(frame, { isLoggedIn: false });
  await tick();
}
async function connectLoggedIn(frame: FakeFrame) {
  frame.deliver("initialized", { success: true });
  answerLoginCheck(frame, { isLoggedIn: true });
  frame.deliver("loginSuccess", USER);
  await tick();
}

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("createAuth: state", () => {
  it("starts loading with no user and sends nothing before connecting", () => {
    const { frame, auth } = setup();
    expect(auth.getState()).toEqual({ status: "loading", user: null });
    expect(count(frame, "isLoggedInRequest")).toBe(0);
  });

  it("asks Lucra on connect and becomes loggedOut on a no", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: true });
    expect(frame.lastPosted("isLoggedInRequest")?.body).toEqual({ awaitsPending: true });
    answerLoginCheck(frame, { isLoggedIn: false });
    await tick();
    expect(auth.getState()).toEqual({ status: "loggedOut", user: null });
  });

  it("stays loading after a yes until loginSuccess arrives", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: true });
    answerLoginCheck(frame, { isLoggedIn: true });
    await tick();
    expect(auth.getState().status).toBe("loading");
    frame.deliver("loginSuccess", USER);
    expect(auth.getState()).toEqual({ status: "loggedIn", user: USER });
  });

  it("becomes loggedIn when loginSuccess arrives before the answer", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: true });
    frame.deliver("loginSuccess", USER);
    answerLoginCheck(frame, { isLoggedIn: false });
    await tick();
    expect(auth.getState().status).toBe("loggedIn");
  });

  it("keeps waiting through an interim pending answer", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: true });
    answerLoginCheck(frame, { isLoggedIn: false, pending: true });
    await tick();
    expect(auth.getState().status).toBe("loading");
    answerLoginCheck(frame, { isLoggedIn: false });
    await tick();
    expect(auth.getState().status).toBe("loggedOut");
  });

  it("treats a failed login check as logged out", async () => {
    const { frame, auth } = setup({ requestMs: 20 });
    frame.deliver("initialized", { success: true });
    await wait(40);
    expect(auth.getState().status).toBe("loggedOut");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("updates the user from userInfo with a new state object", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    const before = auth.getState();
    expect(auth.getState()).toBe(before);
    frame.deliver("userInfo", { ...USER, balance: 40 });
    expect(auth.getState().user?.balance).toBe(40);
    expect(auth.getState().status).toBe("loggedIn");
    expect(auth.getState()).not.toBe(before);
  });

  it("ignores userInfo while logged out", async () => {
    const { frame, auth } = setup();
    await connectLoggedOut(frame);
    frame.deliver("userInfo", USER);
    expect(auth.getState()).toEqual({ status: "loggedOut", user: null });
  });

  it("becomes loggedOut on logoutComplete", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    frame.deliver("logoutComplete", null);
    expect(auth.getState()).toEqual({ status: "loggedOut", user: null });
  });

  it("goes back to loading when Lucra restarts, keeping the user", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    frame.deliver("initialized", { success: true });
    expect(auth.getState()).toEqual({ status: "loading", user: USER });
    expect(count(frame, "isLoggedInRequest")).toBe(2);
    frame.deliver("loginSuccess", USER);
    expect(auth.getState().status).toBe("loggedIn");
  });

  it("stays loggedOut across a restart until Lucra says otherwise", async () => {
    const { frame, session, auth } = setup();
    await connectLoggedOut(frame);
    session.restart("https://test-tenant.sandbox.lucrasports.com/?login=true");
    await tick();
    expect(auth.getState().status).toBe("loggedOut");
    frame.deliver("initialized", { success: true });
    answerLoginCheck(frame, { isLoggedIn: false });
    await tick();
    expect(auth.getState().status).toBe("loggedOut");
    expect(warn).toHaveBeenCalledTimes(0);
  });
});

describe("createAuth: subscribe", () => {
  it("calls the listener now, then on every change", async () => {
    const { frame, auth } = setup();
    const seen: LucraAuthState[] = [];
    const off = auth.subscribe((state) => seen.push(state));
    expect(seen.map((s) => s.status)).toEqual(["loading"]);
    await connectLoggedIn(frame);
    expect(seen.map((s) => s.status)).toEqual(["loading", "loggedIn"]);
    off();
    frame.deliver("logoutComplete", null);
    expect(seen.length).toBe(2);
  });

  it("does not call listeners when nothing changed", async () => {
    const { frame, auth } = setup();
    await connectLoggedOut(frame);
    const listener = mock(() => {});
    auth.subscribe(listener);
    frame.deliver("logoutComplete", null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a listener throws", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const { frame, auth } = setup();
    const second = mock(() => {});
    auth.subscribe(() => {
      throw new Error("listener failed");
    });
    auth.subscribe(second);
    await connectLoggedOut(frame);
    expect(second).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("createAuth: whenLoggedIn and isLoggedIn", () => {
  it("resolves when logged in and rejects NOT_LOGGED_IN when logged out", async () => {
    const a = setup();
    await connectLoggedIn(a.frame);
    await a.auth.whenLoggedIn();
    expect(await a.auth.isLoggedIn()).toBe(true);

    const b = setup();
    await connectLoggedOut(b.frame);
    const error = await caught(b.auth.whenLoggedIn());
    expect(error.code).toBe("NOT_LOGGED_IN");
    expect(error.remediation).toBe("login");
    expect(await b.auth.isLoggedIn()).toBe(false);
  });

  it("waits while loading, then settles", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: true });
    const waiting = auth.whenLoggedIn();
    const asking = auth.isLoggedIn();
    answerLoginCheck(frame, { isLoggedIn: true });
    await tick();
    frame.deliver("loginSuccess", USER);
    await waiting;
    expect(await asking).toBe(true);
  });

  it("times out when loginSuccess never comes, then recovers", async () => {
    const { frame, auth } = setup({ authReadyMs: 20 });
    frame.deliver("initialized", { success: true });
    answerLoginCheck(frame, { isLoggedIn: true });
    const first = await caught(auth.whenLoggedIn());
    expect(first.code).toBe("TIMEOUT");
    expect(auth.getState().status).toBe("loading");
    // Later calls fail fast instead of hanging.
    expect((await caught(auth.whenLoggedIn())).code).toBe("TIMEOUT");
    expect((await caught(auth.isLoggedIn())).code).toBe("TIMEOUT");
    frame.deliver("loginSuccess", USER);
    await auth.whenLoggedIn();
  });

  it("isLoggedIn rejects when Lucra cannot start", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: false });
    expect((await caught(auth.isLoggedIn())).code).toBe("CONNECTION_FAILED");
  });
});

describe("createAuth: logout", () => {
  it("navigates to logout, clears the user, and resolves on logoutComplete", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    const logout = auth.logout();
    const again = auth.logout();
    expect(again).toBe(logout);
    await tick();
    expect(frame.lastPosted("navigate")?.body).toEqual({
      pathname: "/logout?parentUrl=https%3A%2F%2Fhost.example",
    });
    expect(count(frame, "navigate")).toBe(1);
    expect(auth.getState()).toEqual({ status: "loading", user: null });
    // Lucra is not asked yet: it would answer from the session being torn down.
    expect(count(frame, "isLoggedInRequest")).toBe(1);
    frame.deliver("logoutComplete", null);
    await logout;
    expect(auth.getState()).toEqual({ status: "loggedOut", user: null });
  });

  it("resolves when Lucra restarts logged out before logoutComplete", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    const logout = auth.logout();
    await tick();
    frame.deliver("initialized", { success: true });
    answerLoginCheck(frame, { isLoggedIn: false });
    await logout;
    expect(auth.getState().status).toBe("loggedOut");
  });

  it("asks Lucra when logoutComplete never comes", async () => {
    const { frame, auth } = setup({ logoutMs: 20 });
    await connectLoggedIn(frame);
    const logout = auth.logout();
    await wait(40);
    expect(count(frame, "isLoggedInRequest")).toBe(2);
    answerLoginCheck(frame, { isLoggedIn: false });
    await logout;
    expect(auth.getState().status).toBe("loggedOut");
  });

  it("rejects with LOGOUT_FAILED when Lucra still has a user", async () => {
    const { frame, auth } = setup({ logoutMs: 20 });
    await connectLoggedIn(frame);
    const logout = caught(auth.logout());
    await wait(40);
    answerLoginCheck(frame, { isLoggedIn: true });
    expect((await logout).code).toBe("LOGOUT_FAILED");
    // Lucra never restarted, so the user it sent before still stands.
    expect(auth.getState()).toEqual({ status: "loggedIn", user: USER });
    await auth.whenLoggedIn();
  });

  it("does not fail the logout when Lucra restarts and still says yes", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    let settled = false;
    const logout = auth.logout().then(() => {
      settled = true;
    });
    await tick();
    frame.deliver("initialized", { success: true });
    answerLoginCheck(frame, { isLoggedIn: true });
    await tick();
    expect(settled).toBe(false);
    expect(auth.getState()).toEqual({ status: "loading", user: null });
    frame.deliver("logoutComplete", null);
    await logout;
    expect(auth.getState().status).toBe("loggedOut");
  });

  it("ignores userInfo while a logout is pending", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    const logout = auth.logout();
    await tick();
    frame.deliver("userInfo", { ...USER, balance: 99 });
    expect(auth.getState()).toEqual({ status: "loading", user: null });
    frame.deliver("logoutComplete", null);
    await logout;
  });

  it("resolves at once when already logged out, sending nothing", async () => {
    const { frame, auth } = setup();
    await connectLoggedOut(frame);
    await auth.logout();
    expect(count(frame, "navigate")).toBe(0);
  });

  it("makes waiting calls reject NOT_LOGGED_IN once logged out", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    const logout = auth.logout();
    await tick();
    const waiting = caught(auth.whenLoggedIn());
    frame.deliver("logoutComplete", null);
    await logout;
    expect((await waiting).code).toBe("NOT_LOGGED_IN");
  });

  it("rejects when Lucra cannot start", async () => {
    const { frame, auth } = setup();
    frame.deliver("initialized", { success: false });
    expect((await caught(auth.logout())).code).toBe("CONNECTION_FAILED");
  });
});

describe("createAuth: destroy", () => {
  it("rejects waiters and a pending logout, and stops listening", async () => {
    const { frame, auth } = setup();
    await connectLoggedIn(frame);
    const logout = caught(auth.logout());
    await tick();
    const waiting = caught(auth.whenLoggedIn());
    const listener = mock(() => {});
    auth.subscribe(listener);
    auth.destroy();
    auth.destroy();
    expect((await logout).code).toBe("DESTROYED");
    expect((await waiting).code).toBe("DESTROYED");
    expect((await caught(auth.whenLoggedIn())).code).toBe("DESTROYED");
    expect((await caught(auth.logout())).code).toBe("DESTROYED");
    frame.deliver("loginSuccess", USER);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
