import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { createApi, type Activity } from "./api.ts";
import { createAuth } from "./auth.ts";
import { LucraError } from "./errors.ts";
import { createPresent, type LucraScreen } from "./present.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";
import type { LucraDismissReason } from "./types.ts";
import { HOME_PATH, buildUrl } from "./url.ts";

const urls = {
  config: { apiKey: "key-1", tenantId: "test-tenant", env: "sandbox" as const },
  parentOrigin: "https://host.example",
};
const USER = { id: "u1", username: "pat", balance: 25 };
const PARENT = "parentUrl=https%3A%2F%2Fhost.example";

function setup(overrides: Partial<Timeouts> = {}) {
  const frame = createFakeFrame();
  const timeouts = { ...DEFAULT_TIMEOUTS, ...overrides };
  const session = createSession({ frame, url: buildUrl(urls, HOME_PATH), timeouts });
  const auth = createAuth({ session, urls, timeouts });
  const activity: Activity = { screenOpen: false };
  const api = createApi({ session, auth, activity });
  const present = createPresent({
    session,
    auth,
    frame,
    urls,
    activity,
    whenWriteSettled: api.whenWriteSettled,
  });
  return { frame, session, auth, activity, api, present };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const count = (frame: FakeFrame, type: string) =>
  frame.posted.filter((message) => message.type === type).length;
const caught = (promise: Promise<unknown>): Promise<LucraError> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error) => error as LucraError
  );

async function connectLoggedOut(frame: FakeFrame) {
  frame.deliver("initialized", { success: true });
  frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
  await tick();
}
async function connectLoggedIn(frame: FakeFrame) {
  frame.deliver("initialized", { success: true });
  frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: true });
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

describe("createPresent: screens", () => {
  it("shows a screen, completes on Lucra's message, and sends Lucra home", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const shown = present.demographics();
    expect(activity.screenOpen).toBe(true);
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect(frame.lastPosted("enableExitLucra")?.body).toBe(true);
    expect(frame.lastPosted("navigate")?.body).toEqual({
      pathname: `/app/demographicform?${PARENT}`,
    });
    frame.deliver("demographicComplete", null);
    expect(await shown).toEqual({ status: "completed" });
    expect(frame.overlayOpen).toBe(false);
    expect(activity.screenOpen).toBe(false);
    expect(frame.lastPosted("navigate")?.body).toEqual({
      pathname: `/app/headless?${PARENT}`,
    });
  });

  it("uses the right path and completion message for each screen", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const cases: [() => Promise<unknown>, string, string | null][] = [
      [present.demographics, "app/demographicform", "demographicComplete"],
      [present.kyc, "app/kyc", "kycComplete"],
      [present.locationGrant, "app/location-grant", "locationGranted"],
      [present.withdraw, "app/withdraw-funds", null],
      [present.profile, "app/profile", null],
      [present.wallet, "app/wallet", null],
    ];
    for (const [show, path, completeOn] of cases) {
      const shown = show();
      await tick();
      const navigations = frame.posted.filter((message) => message.type === "navigate");
      expect(navigations[navigations.length - 1].body).toEqual({
        pathname: `/${path}?${PARENT}`,
      });
      if (completeOn) {
        frame.deliver(completeOn, null);
        expect(await shown).toEqual({ status: "completed" });
      } else {
        // These screens have no "finished" message. Others' messages do not end them.
        frame.deliver("kycComplete", null);
        frame.deliver("demographicComplete", null);
        expect(frame.overlayOpen).toBe(true);
        frame.deliver("exitLucra", true);
        expect(await shown).toEqual({ status: "dismissed", reason: "exit" });
      }
    }
  });

  it("resolves dismissed on exitLucra and dismiss()", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const a = present.kyc();
    await tick();
    frame.deliver("exitLucra", true);
    expect(await a).toEqual({ status: "dismissed", reason: "exit" });
    const b = present.profile();
    await tick();
    present.dismiss();
    expect(await b).toEqual({ status: "dismissed", reason: "dismissed" });
    expect(frame.overlayOpen).toBe(false);
    present.dismiss();
  });

  it("replaces the screen on show with the new one", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const first = present.profile();
    await tick();
    const second = present.wallet();
    expect(await first).toEqual({ status: "dismissed", reason: "replaced" });
    expect(activity.screenOpen).toBe(true);
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect(frame.overlaysOpened).toBe(2);
    frame.deliver("exitLucra", true);
    expect(await second).toEqual({ status: "dismissed", reason: "exit" });
    expect(activity.screenOpen).toBe(false);
  });

  it("refuses a screen that needs login when logged out, and clears the flag", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    const error = await caught(present.kyc());
    expect(error.code).toBe("NOT_LOGGED_IN");
    expect(error.remediation).toBe("login");
    expect(frame.overlaysOpened).toBe(0);
    expect(activity.screenOpen).toBe(false);
  });

  it("waits for a pending write before showing, and blocks writes while showing", async () => {
    const { frame, api, present } = setup();
    await connectLoggedIn(frame);
    const join = api.tournaments.join("t1");
    await tick();
    const shown = present.demographics();
    await tick();
    expect(frame.overlayOpen).toBe(false);
    expect(count(frame, "navigate")).toBe(0);
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect((await caught(api.tournaments.join("t2"))).code).toBe("SCREEN_OPEN");
    present.dismiss();
    await shown;
    const again = api.tournaments.join("t2");
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t2" });
    await again;
  });

  it("never opens a screen dismissed while it was waiting", async () => {
    const { frame, present } = setup();
    const shown = present.kyc();
    present.dismiss();
    expect(await shown).toEqual({ status: "dismissed", reason: "dismissed" });
    await connectLoggedIn(frame);
    await tick();
    expect(frame.overlaysOpened).toBe(0);
    expect(count(frame, "navigate")).toBe(0);
  });

  it("closes a screen when the user signs out inside it", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const shown = present.profile();
    await tick();
    frame.deliver("logoutComplete", null);
    expect(await shown).toEqual({ status: "dismissed", reason: "loggedOut" });
    expect(frame.overlayOpen).toBe(false);
  });

  it("turns the exit control on again after Lucra restarts", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const shown = present.wallet();
    await tick();
    expect(count(frame, "enableExitLucra")).toBe(1);
    frame.deliver("initialized", { success: true });
    expect(count(frame, "enableExitLucra")).toBe(2);
    frame.deliver("exitLucra", true);
    await shown;
    frame.deliver("initialized", { success: true });
    expect(count(frame, "enableExitLucra")).toBe(2);
  });

  it("closes a screen with the error when Lucra restarts and cannot start", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const shown = caught(present.profile());
    await tick();
    expect(frame.overlayOpen).toBe(true);
    frame.deliver("initialized", { success: false });
    expect((await shown).code).toBe("CONNECTION_FAILED");
    expect(frame.overlayOpen).toBe(false);
    expect(activity.screenOpen).toBe(false);
  });

  it("rejects when Lucra cannot start", async () => {
    const { frame, activity, present } = setup();
    const shown = caught(present.kyc());
    frame.deliver("initialized", { success: false });
    expect((await shown).code).toBe("CONNECTION_FAILED");
    expect(activity.screenOpen).toBe(false);
  });
});

describe("createPresent: login", () => {
  it("restarts Lucra at its login screen and completes on loginSuccess", async () => {
    const { frame, auth, present } = setup();
    await connectLoggedOut(frame);
    const login = present.login({ phoneNumber: "5551234567" });
    await tick();
    expect(frame.overlayOpen).toBe(true);
    const url = new URL(frame.urls[frame.urls.length - 1]);
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("login")).toBe("true");
    expect(url.searchParams.get("loginOnly")).toBe("true");
    expect(url.searchParams.get("loginHint")).toBe("5551234567");
    expect(url.searchParams.get("apiKey")).toBe("key-1");
    const exits = count(frame, "enableExitLucra");
    frame.deliver("initialized", { success: true });
    expect(count(frame, "enableExitLucra")).toBe(exits + 1);
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
    await tick();
    expect(frame.overlayOpen).toBe(true);
    frame.deliver("loginSuccess", USER);
    expect(await login).toEqual({ status: "completed", user: USER });
    expect(frame.overlayOpen).toBe(false);
    expect(auth.getState().status).toBe("loggedIn");
    // Lucra parks itself on its blank home route after a login. No navigate needed.
    expect(count(frame, "navigate")).toBe(0);
  });

  it("sends no loginHint without a phone number", async () => {
    const { frame, present } = setup();
    await connectLoggedOut(frame);
    present.login().catch(() => {});
    await tick();
    const url = new URL(frame.urls[frame.urls.length - 1]);
    expect(url.searchParams.has("loginHint")).toBe(false);
    expect(url.searchParams.has("phoneNumber")).toBe(false);
  });

  it("skips the screen when already logged in", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    expect(await present.login()).toEqual({ status: "completed", user: USER });
    expect(frame.overlaysOpened).toBe(0);
    expect(frame.urls.length).toBe(1);
    expect(activity.screenOpen).toBe(false);
  });

  it("rejects a phone number that is not 10 digits, before doing anything", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    for (const phoneNumber of ["123", "555-123-4567", "55512345678", ""]) {
      const error = await caught(present.login({ phoneNumber }));
      expect(error.code).toBe("INVALID_ARGUMENT");
      expect(error.message).toBe("The phone number must be 10 digits");
      expect(error.hint).toContain("phoneNumber must be exactly 10 digits");
    }
    expect(frame.urls.length).toBe(1);
    expect(activity.screenOpen).toBe(false);
  });

  it("resolves dismissed when the user exits it, and can be shown again", async () => {
    const { frame, present } = setup();
    await connectLoggedOut(frame);
    const first = present.login();
    await tick();
    frame.deliver("exitLucra", true);
    expect(await first).toEqual({ status: "dismissed", reason: "exit" });
    expect(frame.overlayOpen).toBe(false);
    // Lucra finishes loading its login page, still logged out.
    frame.deliver("initialized", { success: true });
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
    await tick();
    const second = present.login();
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect(frame.urls.length).toBe(3);
    frame.deliver("loginSuccess", USER);
    expect((await second).status).toBe("completed");
  });

  it("closes with the error when the login screen never starts", async () => {
    const { frame, activity, present } = setup({ connectMs: 20 });
    await connectLoggedOut(frame);
    const login = caught(present.login());
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect((await login).code).toBe("CONNECTION_TIMEOUT");
    expect(frame.overlayOpen).toBe(false);
    expect(activity.screenOpen).toBe(false);
  });

  it("closes with the error when the login screen cannot start", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    const login = caught(present.login());
    await tick();
    frame.deliver("initialized", { success: false });
    expect((await login).code).toBe("CONNECTION_FAILED");
    expect(frame.overlayOpen).toBe(false);
    expect(activity.screenOpen).toBe(false);
  });

  it("rejects pending reads with CONNECTION_RESET when login restarts Lucra", async () => {
    const { frame, api, present } = setup();
    await connectLoggedOut(frame);
    const list = caught(api.tournaments.list());
    await tick();
    present.login().catch(() => {});
    await tick();
    expect((await list).code).toBe("CONNECTION_RESET");
  });
});

describe("createPresent: addFunds", () => {
  it("opens the popup before any await and reports how it ended", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const funded = present.addFunds();
    // Already open: the browser only allows a popup during the click itself.
    expect(frame.popups.length).toBe(1);
    const url = new URL(frame.popups[0].url);
    expect(url.pathname).toBe("/app/add-funds");
    expect(url.searchParams.get("apiKey")).toBe("key-1");
    expect(url.searchParams.get("parentUrl")).toBe("https://host.example");
    frame.deliver("LucraPopupMessage", { toastType: "success", message: "Funds deposit successful" });
    expect(await funded).toEqual({ status: "completed", message: "Funds deposit successful" });
    expect(frame.popups[0].closed).toBe(true);

    const failed = present.addFunds();
    frame.deliver("LucraPopupMessage", { toastType: "error", message: "declined" });
    expect(await failed).toEqual({ status: "failed", message: "declined" });

    const closed = present.addFunds();
    frame.popups[2].userClose();
    expect(await closed).toEqual({ status: "dismissed" });
  });

  it("ignores a malformed popup message", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const funded = present.addFunds();
    frame.deliver("LucraPopupMessage", { toastType: "maybe", message: "x" });
    frame.deliver("LucraPopupMessage", { toastType: "success" });
    frame.deliver("LucraPopupMessage", null);
    expect(frame.popups[0].closed).toBe(false);
    frame.popups[0].userClose();
    expect(await funded).toEqual({ status: "dismissed" });
  });

  it("answers a second call alreadyOpen at once and brings the window forward", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    let firstResult: unknown = null;
    const first = present.addFunds().then((result) => (firstResult = result));
    expect(frame.popups[0].focused).toBe(0);
    expect(await present.addFunds()).toEqual({ status: "alreadyOpen" });
    expect(frame.popups.length).toBe(1);
    expect(frame.popups[0].focused).toBe(1);
    expect(frame.popups[0].closed).toBe(false);
    // The first call is still waiting for the window.
    await tick();
    expect(firstResult).toBeNull();
    frame.deliver("LucraPopupMessage", { toastType: "success", message: "ok" });
    await first;
    expect(firstResult).toEqual({ status: "completed", message: "ok" });
    // Once it has closed, a new call opens a new window.
    present.addFunds().catch(() => {});
    expect(frame.popups.length).toBe(2);
    expect(frame.popups[0].focused).toBe(1);
  });

  it("opens a new window when the user closed the last one before it was noticed", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const first = present.addFunds();
    // The user closed it, and the poll has not seen that yet.
    frame.popups[0].windowClosed = true;
    let secondResult: unknown = null;
    const second = present.addFunds().then((result) => (secondResult = result));
    expect(await first).toEqual({ status: "dismissed" });
    expect(frame.popups.length).toBe(2);
    expect(frame.popups[1].closed).toBe(false);
    await tick();
    expect(secondResult).toBeNull();
    frame.deliver("LucraPopupMessage", { toastType: "success", message: "ok" });
    await second;
    expect(secondResult).toEqual({ status: "completed", message: "ok" });
  });

  it("rejects with POPUP_BLOCKED when the browser blocks it", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    frame.blockPopups = true;
    const error = await caught(present.addFunds());
    expect(error.code).toBe("POPUP_BLOCKED");
  });

  it("refuses when logged out, but opens while auth is still loading", async () => {
    const out = setup();
    await connectLoggedOut(out.frame);
    expect((await caught(out.present.addFunds())).code).toBe("NOT_LOGGED_IN");
    expect(out.frame.popups.length).toBe(0);

    const loading = setup();
    loading.present.addFunds().catch(() => {});
    expect(loading.frame.popups.length).toBe(1);
  });

  it("does not count as an open screen: writes still go through", async () => {
    const { frame, api, present } = setup();
    await connectLoggedIn(frame);
    present.addFunds().catch(() => {});
    const join = api.tournaments.join("t1");
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
  });
});

describe("createPresent: destroy", () => {
  it("closes the screen and the popup, then refuses everything", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const shown = present.profile();
    const funded = present.addFunds();
    await tick();
    present.destroy();
    present.destroy();
    expect(await shown).toEqual({ status: "dismissed", reason: "destroyed" });
    expect(await funded).toEqual({ status: "dismissed" });
    expect(frame.overlayOpen).toBe(false);
    expect(frame.popups[0].closed).toBe(true);
    expect((await caught(present.kyc())).code).toBe("DESTROYED");
    expect((await caught(present.login())).code).toBe("DESTROYED");
    expect((await caught(present.addFunds())).code).toBe("DESTROYED");
  });
});

describe("createPresent: signal", () => {
  it("closes the screen with reason aborted when the signal aborts", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const controller = new AbortController();
    const shown = present.wallet({ signal: controller.signal });
    await tick();
    expect(frame.overlayOpen).toBe(true);
    controller.abort();
    expect(await shown).toEqual({ status: "dismissed", reason: "aborted" });
    expect(frame.overlayOpen).toBe(false);
    expect(activity.screenOpen).toBe(false);
    expect(frame.lastPosted("navigate")?.body).toEqual({ pathname: `/app/headless?${PARENT}` });
  });

  it("does not close a screen that replaced the aborted call's screen", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const controller = new AbortController();
    const first = present.profile({ signal: controller.signal });
    await tick();
    let secondResult: unknown = null;
    const second = present.wallet().then((result) => (secondResult = result));
    expect(await first).toEqual({ status: "dismissed", reason: "replaced" });
    await tick();
    expect(frame.overlaysOpened).toBe(2);
    // The first screen's route unmounts and aborts. The replacement stays.
    controller.abort();
    await tick();
    expect(secondResult).toBeNull();
    expect(frame.overlayOpen).toBe(true);
    expect(activity.screenOpen).toBe(true);
    frame.deliver("exitLucra", true);
    await second;
    expect(secondResult).toEqual({ status: "dismissed", reason: "exit" });
  });

  it("ends a call still waiting to show, and never shows it", async () => {
    const { frame, activity, present } = setup();
    const controller = new AbortController();
    const shown = present.kyc({ signal: controller.signal });
    controller.abort();
    expect(await shown).toEqual({ status: "dismissed", reason: "aborted" });
    expect(activity.screenOpen).toBe(false);
    await connectLoggedIn(frame);
    await tick();
    expect(frame.overlaysOpened).toBe(0);
    expect(count(frame, "navigate")).toBe(0);
  });

  it("ends a call waiting for a pending write, and never shows it", async () => {
    const { frame, api, present } = setup();
    await connectLoggedIn(frame);
    const join = api.tournaments.join("t1");
    await tick();
    const controller = new AbortController();
    const shown = present.demographics({ signal: controller.signal });
    await tick();
    controller.abort();
    expect(await shown).toEqual({ status: "dismissed", reason: "aborted" });
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
    await tick();
    expect(frame.overlaysOpened).toBe(0);
    expect(count(frame, "navigate")).toBe(0);
  });

  it("with a signal aborted already, shows, sends, and restarts nothing", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    const signal = AbortSignal.abort();
    const urls = frame.urls.length;
    const posted = frame.posted.length;
    expect(await present.login({ signal })).toEqual({ status: "dismissed", reason: "aborted" });
    expect(await present.kyc({ signal })).toEqual({ status: "dismissed", reason: "aborted" });
    expect(frame.urls.length).toBe(urls);
    expect(frame.posted.length).toBe(posted);
    expect(frame.overlaysOpened).toBe(0);
    expect(activity.screenOpen).toBe(false);
  });

  it("leaves a screen on show alone when the new call's signal is aborted already", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    let result: unknown = null;
    const shown = present.wallet().then((value) => (result = value));
    await tick();
    await present.profile({ signal: AbortSignal.abort() });
    await tick();
    expect(result).toBeNull();
    expect(frame.overlayOpen).toBe(true);
    present.dismiss();
    await shown;
  });

  it("does nothing when aborted after the screen finished", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const controller = new AbortController();
    const first = present.demographics({ signal: controller.signal });
    await tick();
    frame.deliver("demographicComplete", null);
    expect(await first).toEqual({ status: "completed" });
    let result: unknown = null;
    const next = present.wallet().then((value) => (result = value));
    await tick();
    controller.abort();
    await tick();
    expect(result).toBeNull();
    expect(frame.overlayOpen).toBe(true);
    present.dismiss();
    await next;
  });

  it("rejects a signal that is not an AbortSignal, and leaves the screen on show alone", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    let result: unknown = null;
    const shown = present.wallet().then((value) => (result = value));
    await tick();
    for (const signal of [{}, "stop", 1, { aborted: false }]) {
      const error = await caught(present.kyc({ signal } as never));
      expect(error.code).toBe("INVALID_ARGUMENT");
      expect(error.hint).toBe("signal must be an AbortSignal.");
      expect((await caught(present.login({ signal } as never))).code).toBe("INVALID_ARGUMENT");
    }
    await tick();
    expect(result).toBeNull();
    expect(present.getState()).toEqual({ screen: "wallet" });
    expect(activity.screenOpen).toBe(true);
    present.dismiss();
    await shown;
    expect(activity.screenOpen).toBe(false);
    // A later screen still works.
    const next = present.profile();
    await tick();
    expect(present.getState()).toEqual({ screen: "profile" });
    frame.deliver("exitLucra", true);
    expect(await next).toEqual({ status: "dismissed", reason: "exit" });
  });

  it("removes its abort listener when the screen finishes", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const controller = new AbortController();
    const add = spyOn(controller.signal, "addEventListener");
    const remove = spyOn(controller.signal, "removeEventListener");
    const shown = present.wallet({ signal: controller.signal });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(0);
    await tick();
    frame.deliver("exitLucra", true);
    await shown;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
  });
});

describe("createPresent: state", () => {
  const screenOf = (present: { getState(): { screen: unknown } }) => present.getState().screen;

  it("is null at first, and stays null while a screen waits to show", async () => {
    const { frame, present } = setup();
    expect(present.getState()).toEqual({ screen: null });
    const shown = present.profile();
    expect(screenOf(present)).toBeNull();
    frame.deliver("initialized", { success: true });
    await tick();
    // Connected, but still waiting to hear who is logged in.
    expect(screenOf(present)).toBeNull();
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: true });
    frame.deliver("loginSuccess", USER);
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect(screenOf(present)).toBe("profile");
    present.dismiss();
    await shown;
    expect(screenOf(present)).toBeNull();
  });

  it("stays null while a screen waits for a pending write", async () => {
    const { frame, api, present } = setup();
    await connectLoggedIn(frame);
    const join = api.tournaments.join("t1");
    await tick();
    const shown = present.kyc();
    await tick();
    expect(screenOf(present)).toBeNull();
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
    await tick();
    expect(screenOf(present)).toBe("kyc");
    present.dismiss();
    await shown;
  });

  it("names each screen while it shows", async () => {
    for (const screen of ["demographics", "kyc", "locationGrant", "withdraw", "profile", "wallet"] as const) {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const shown = present[screen]();
      await tick();
      expect(screenOf(present)).toBe(screen);
      present.dismiss();
      await shown;
    }
    const { frame, present } = setup();
    await connectLoggedOut(frame);
    const login = present.login();
    await tick();
    expect(screenOf(present)).toBe("login");
    frame.deliver("loginSuccess", USER);
    await login;
    expect(screenOf(present)).toBeNull();
  });

  it("goes back to null on exit, dismiss, abort, a logout inside, and destroy, with the reason", async () => {
    const closers: [LucraDismissReason, (frame: FakeFrame, present: ReturnType<typeof setup>["present"], abort: () => void) => void][] = [
      ["exit", (frame) => frame.deliver("exitLucra", true)],
      ["dismissed", (_frame, present) => present.dismiss()],
      ["aborted", (_frame, _present, abort) => abort()],
      ["loggedOut", (frame) => frame.deliver("logoutComplete", null)],
      ["destroyed", (_frame, present) => present.destroy()],
    ];
    for (const [reason, close] of closers) {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const controller = new AbortController();
      const shown = present.wallet({ signal: controller.signal });
      await tick();
      expect(screenOf(present)).toBe("wallet");
      close(frame, present, () => controller.abort());
      expect(await shown).toEqual({ status: "dismissed", reason });
      expect(present.getState().screen).toBeNull();
    }
  });

  it("never reports Add Funds", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const changes: unknown[] = [];
    present.subscribe((state) => changes.push(state.screen));
    present.addFunds().catch(() => {});
    expect(frame.popups.length).toBe(1);
    expect(changes).toEqual([null]);
  });

  it("hides the first screen, then shows the one that replaced it", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const changes: unknown[] = [];
    present.subscribe((state) => changes.push(state.screen));
    const first = present.profile();
    await tick();
    const second = present.wallet();
    // The first screen hides as soon as it is replaced. The second shows once
    // its own waits are over.
    expect(changes).toEqual([null, "profile", null]);
    expect(await first).toEqual({ status: "dismissed", reason: "replaced" });
    // With nothing to wait for, the second shows within the same task.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(changes).toEqual([null, "profile", null, "wallet"]);
    frame.deliver("exitLucra", true);
    await second;
    expect(changes).toEqual([null, "profile", null, "wallet", null]);
  });

  it("calls a listener now, then once per change, and not after unsubscribe", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const listener = mock((_state: unknown) => {});
    const stop = present.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ screen: null });
    const shown = present.wallet();
    await tick();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ screen: "wallet" });
    // Lucra restarting does not change what is on show.
    frame.deliver("initialized", { success: true });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    present.dismiss();
    await shown;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(present.getState()).toEqual({ screen: null });
  });

  it("returns the same object until the state changes", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const before = present.getState();
    expect(present.getState()).toBe(before);
    const shown = present.wallet();
    expect(present.getState()).toBe(before);
    await tick();
    const during = present.getState();
    expect(during).not.toBe(before);
    expect(present.getState()).toBe(during);
    present.dismiss();
    await shown;
    expect(present.getState()).not.toBe(during);
  });

  it("keeps a listener that throws from stopping the others", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const error = spyOn(console, "error").mockImplementation(() => {});
    present.subscribe(() => {
      throw new Error("boom");
    });
    const other = mock((_state: unknown) => {});
    present.subscribe(other);
    const shown = present.wallet();
    await tick();
    expect(other).toHaveBeenLastCalledWith({ screen: "wallet" });
    present.dismiss();
    await shown;
    error.mockRestore();
  });

  it("reports null to listeners on destroy, then stops calling them", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const listener = mock((_state: unknown) => {});
    present.subscribe(listener);
    const shown = present.wallet();
    await tick();
    present.destroy();
    await shown;
    expect(listener).toHaveBeenLastCalledWith({ screen: null });
    const calls = listener.mock.calls.length;
    present.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(calls + 1);
    expect(present.getState()).toEqual({ screen: null });
  });
});

describe("createPresent: a listener that acts as a screen shows", () => {
  const kycPath = { pathname: `/app/kyc?${PARENT}` };
  const navigatedTo = (frame: FakeFrame, body: unknown) =>
    frame.posted.some(
      (message) => message.type === "navigate" && JSON.stringify(message.body) === JSON.stringify(body)
    );
  async function reconnect(frame: FakeFrame) {
    frame.deliver("initialized", { success: true });
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: true });
    await tick();
  }

  it("dismissing it ends the call, and nothing more is sent or shown", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    let mark = -1;
    present.subscribe((state) => {
      if (state.screen !== "kyc") return;
      present.dismiss();
      mark = frame.posted.length;
    });
    expect(await present.kyc()).toEqual({ status: "dismissed", reason: "dismissed" });
    await tick();
    expect(frame.posted.slice(mark)).toEqual([]);
    expect(navigatedTo(frame, kycPath)).toBe(false);
    expect(frame.overlayOpen).toBe(false);
    expect(activity.screenOpen).toBe(false);
    expect(present.getState()).toEqual({ screen: null });
    await reconnect(frame);
    expect(count(frame, "enableExitLucra")).toBe(0);
  });

  it("dismissing login does not restart Lucra at its login screen", async () => {
    const { frame, present } = setup();
    await connectLoggedOut(frame);
    present.subscribe((state) => {
      if (state.screen === "login") present.dismiss();
    });
    expect(await present.login()).toEqual({ status: "dismissed", reason: "dismissed" });
    await tick();
    expect(frame.urls.length).toBe(1);
    expect(count(frame, "enableExitLucra")).toBe(0);
  });

  it("aborting the call's own signal ends it, and nothing more is sent or shown", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const controller = new AbortController();
    let mark = -1;
    present.subscribe((state) => {
      if (state.screen !== "kyc") return;
      controller.abort();
      mark = frame.posted.length;
    });
    expect(await present.kyc({ signal: controller.signal })).toEqual({
      status: "dismissed",
      reason: "aborted",
    });
    await tick();
    expect(frame.posted.slice(mark)).toEqual([]);
    expect(navigatedTo(frame, kycPath)).toBe(false);
    await reconnect(frame);
    expect(count(frame, "enableExitLucra")).toBe(0);
  });

  it("showing another screen replaces it, and the first call leaves nothing behind", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    let second: Promise<unknown> | null = null;
    present.subscribe((state) => {
      if (state.screen === "kyc" && !second) second = present.profile();
    });
    let secondResult: unknown = null;
    expect(await present.kyc()).toEqual({ status: "dismissed", reason: "replaced" });
    second!.then((result) => (secondResult = result));
    await tick();
    expect(present.getState()).toEqual({ screen: "profile" });
    expect(frame.overlayOpen).toBe(true);
    expect(navigatedTo(frame, kycPath)).toBe(false);
    expect(count(frame, "enableExitLucra")).toBe(1);
    // Only the second call is listening now.
    await reconnect(frame);
    expect(count(frame, "enableExitLucra")).toBe(2);
    frame.deliver("exitLucra", true);
    await tick();
    expect(secondResult).toEqual({ status: "dismissed", reason: "exit" });
    expect(present.getState()).toEqual({ screen: null });
    await reconnect(frame);
    expect(count(frame, "enableExitLucra")).toBe(2);
  });

  it("a later listener is only ever handed the current state", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    let once = true;
    present.subscribe((state) => {
      if (state.screen === "kyc" && once) {
        once = false;
        present.dismiss();
      }
    });
    const seen: unknown[] = [];
    const stale: unknown[] = [];
    present.subscribe((state) => {
      seen.push(state.screen);
      if (state !== present.getState()) stale.push(state.screen);
    });
    await present.kyc();
    expect(stale).toEqual([]);
    expect(seen[seen.length - 1]).toBe(present.getState().screen);
    expect(present.getState()).toEqual({ screen: null });
  });
});

describe("LucraScreen", () => {
  // A Record, so a screen missing here or a name that is not one fails to compile.
  const SCREENS: Record<LucraScreen, true> = {
    login: true,
    demographics: true,
    kyc: true,
    locationGrant: true,
    withdraw: true,
    profile: true,
    wallet: true,
  };

  it("names every present call that shows in the page", () => {
    const { present } = setup();
    const notScreens = ["addFunds", "dismiss", "getState", "subscribe", "destroy"];
    const screens = Object.keys(present).filter((key) => !notScreens.includes(key));
    expect(Object.keys(SCREENS).sort()).toEqual(screens.sort());
  });
});
