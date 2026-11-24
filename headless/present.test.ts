import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { createApi, type Activity } from "./api.ts";
import { createAuth } from "./auth.ts";
import { LucraError } from "./errors.ts";
import { PRESENTATION_HINT } from "./frame.ts";
import { createPresent, type LucraScreen } from "./present.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";
import type { LucraDismissReason, LucraPresentation } from "./types.ts";
import { HOME_PATH, buildUrl } from "./url.ts";

const urls = {
  config: { apiKey: "key-1", tenantId: "test-tenant", env: "sandbox" as const },
  parentOrigin: "https://host.example",
};
const USER = { id: "u1", username: "pat", balance: 25 };
const PARENT = "parentUrl=https%3A%2F%2Fhost.example";

function setup(
  overrides: Partial<Timeouts> = {},
  client: { presentation?: LucraPresentation } = {}
) {
  const frame = createFakeFrame();
  const timeouts = { ...DEFAULT_TIMEOUTS, ...overrides };
  const session = createSession({ frame, url: buildUrl(urls, HOME_PATH), timeouts });
  const auth = createAuth({ session, urls, timeouts });
  const activity: Activity = { screenOpen: false };
  const api = createApi({ session, auth, activity, requestMs: timeouts.requestMs });
  const present = createPresent({
    session,
    auth,
    frame,
    urls,
    activity,
    whenWriteSettled: api.whenWriteSettled,
    startMinigame: api.startMinigame,
    presentation: client.presentation ?? "fullScreen",
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
  it("restarts Lucra at its login screen, shows it once Lucra starts there, and completes on loginSuccess", async () => {
    const { frame, auth, present } = setup();
    await connectLoggedOut(frame);
    const login = present.login({ phoneNumber: "5551234567" });
    await tick();
    const url = new URL(frame.urls[frame.urls.length - 1]);
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("login")).toBe("true");
    expect(url.searchParams.get("loginOnly")).toBe("true");
    expect(url.searchParams.get("loginHint")).toBe("5551234567");
    expect(url.searchParams.get("apiKey")).toBe("key-1");
    // Nothing shows while Lucra reloads.
    expect(frame.overlaysOpened).toBe(0);
    expect(present.getState().screen).toBeNull();
    await connectLoggedOut(frame);
    expect(frame.overlayOpen).toBe(true);
    expect(present.getState().screen).toBe("login");
    expect(count(frame, "enableExitLucra")).toBe(1);
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
    await connectLoggedOut(frame);
    frame.deliver("exitLucra", true);
    expect(await first).toEqual({ status: "dismissed", reason: "exit" });
    expect(frame.overlayOpen).toBe(false);
    const second = present.login();
    await tick();
    expect(frame.urls.length).toBe(3);
    await connectLoggedOut(frame);
    expect(frame.overlayOpen).toBe(true);
    frame.deliver("loginSuccess", USER);
    expect((await second).status).toBe("completed");
  });

  it("opens nothing until the reloaded page starts, then opens once", async () => {
    const { frame, present } = setup();
    await connectLoggedOut(frame);
    const changes: unknown[] = [];
    present.subscribe((state) => changes.push(state.screen));
    const login = present.login({ phoneNumber: "5551234567" });
    await tick();
    expect(frame.urls.length).toBe(2);
    await tick();
    expect(frame.overlaysOpened).toBe(0);
    expect(changes).toEqual([null]);
    frame.deliver("initialized", { success: true });
    await tick();
    expect(frame.overlaysOpened).toBe(1);
    expect(changes).toEqual([null, "login"]);
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
    await tick();
    expect(frame.overlaysOpened).toBe(1);
    frame.deliver("loginSuccess", USER);
    expect(await login).toEqual({ status: "completed", user: USER });
  });

  for (const how of ["dismiss()", "the signal"] as const) {
    it(`ended by ${how} while Lucra reloads: resolves at once and never shows`, async () => {
      const { frame, activity, present } = setup();
      await connectLoggedOut(frame);
      const controller = new AbortController();
      let result: unknown = null;
      const login = present.login({ signal: controller.signal }).then((value) => (result = value));
      await tick();
      expect(frame.urls.length).toBe(2);
      if (how === "dismiss()") present.dismiss();
      else controller.abort();
      await tick();
      // Before the page has started.
      expect(result).toEqual({
        status: "dismissed",
        reason: how === "dismiss()" ? "dismissed" : "aborted",
      });
      expect(activity.screenOpen).toBe(false);
      await connectLoggedOut(frame);
      await login;
      expect(frame.overlaysOpened).toBe(0);
      expect(present.getState().screen).toBeNull();
      expect(count(frame, "navigate")).toBe(0);
      expect(count(frame, "enableExitLucra")).toBe(0);
    });
  }

  it("replaced while Lucra reloads: never shows, and the new login shows once its page starts", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    const first = present.login({ phoneNumber: "5551234567", presentation: "sheet" });
    await tick();
    const second = present.login({ phoneNumber: "5559876543", presentation: "modal" });
    expect(await first).toEqual({ status: "dismissed", reason: "replaced" });
    expect(activity.screenOpen).toBe(true);
    // The first page starts. The second call loads its own.
    await connectLoggedOut(frame);
    expect(frame.overlaysOpened).toBe(0);
    expect(frame.urls.length).toBe(3);
    const url = new URL(frame.urls[frame.urls.length - 1]);
    expect(url.searchParams.get("loginHint")).toBe("5559876543");
    await connectLoggedOut(frame);
    expect(frame.presentations).toEqual(["modal"]);
    expect(present.getState().screen).toBe("login");
    expect(count(frame, "enableExitLucra")).toBe(1);
    frame.deliver("loginSuccess", USER);
    expect(await second).toEqual({ status: "completed", user: USER });
  });

  it("restarts nothing when dismissed before the waits are over", async () => {
    const { frame, present } = setup();
    await connectLoggedOut(frame);
    const login = present.login();
    present.dismiss();
    expect(await login).toEqual({ status: "dismissed", reason: "dismissed" });
    await tick();
    expect(frame.urls.length).toBe(1);
    expect(frame.overlaysOpened).toBe(0);
    expect(count(frame, "enableExitLucra")).toBe(0);
  });

  it("rejects without showing when Lucra never loads its login page", async () => {
    const { frame, activity, present } = setup({ connectMs: 20 });
    await connectLoggedOut(frame);
    const login = caught(present.login());
    await tick();
    expect(frame.urls.length).toBe(2);
    expect((await login).code).toBe("CONNECTION_TIMEOUT");
    expect(frame.overlaysOpened).toBe(0);
    expect(activity.screenOpen).toBe(false);
    expect(present.getState().screen).toBeNull();
  });

  it("rejects without showing when Lucra cannot load its login page", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    const login = caught(present.login());
    await tick();
    frame.deliver("initialized", { success: false });
    expect((await login).code).toBe("CONNECTION_FAILED");
    expect(frame.overlaysOpened).toBe(0);
    expect(activity.screenOpen).toBe(false);
    expect(present.getState().screen).toBeNull();
  });

  it("sends a pending read again once login has restarted Lucra", async () => {
    const { frame, api, present } = setup();
    await connectLoggedOut(frame);
    const list = api.tournaments.list();
    await tick();
    present.login().catch(() => {});
    await tick();
    expect(frame.urls.length).toBe(2);
    expect(count(frame, "tournamentsRequest")).toBe(1);
    await connectLoggedOut(frame);
    expect(count(frame, "tournamentsRequest")).toBe(2);
    frame.answer("tournamentsRequest", "tournamentsResponse", {
      tournaments: [{ matchupId: "t1" }],
    });
    expect(await list).toEqual([{ matchupId: "t1" }]);
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
    const noAborted = { addEventListener() {}, removeEventListener() {} };
    for (const signal of [{}, "stop", 1, { aborted: false }, noAborted, new EventTarget()]) {
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

describe("createPresent: presentation", () => {
  it("opens each screen in the client's presentation unless the call passes its own", async () => {
    const { frame, present } = setup({}, { presentation: "modal" });
    await connectLoggedIn(frame);
    const screens = [present.wallet()];
    await tick();
    // Replaces the wallet, in its own presentation.
    screens.push(present.profile({ presentation: "sheet" }));
    await tick();
    screens.push(present.kyc());
    await tick();
    expect(frame.presentations).toEqual(["modal", "sheet", "modal"]);
    present.dismiss();
    await Promise.all(screens);
    // Add Funds opens its own window, never an overlay.
    void present.addFunds();
    expect(frame.popups.length).toBe(1);
    expect(frame.presentations.length).toBe(3);
  });

  it("login and minigame take it too, and the game's request does not carry it", async () => {
    const loggedOut = setup();
    await connectLoggedOut(loggedOut.frame);
    const login = loggedOut.present.login({ presentation: "sheet" });
    await tick();
    await connectLoggedOut(loggedOut.frame);
    expect(loggedOut.frame.presentations).toEqual(["sheet"]);
    loggedOut.present.dismiss();
    await login;

    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const game = present.minigame({ gameId: "g1", mode: "practice", presentation: "modal" });
    await tick();
    expect(frame.lastPosted("presentMinigameRequest")?.body).toEqual({ gameId: "g1", mode: "practice" });
    frame.answer("presentMinigameRequest", "presentMinigameResponse", { sessionId: "s1", matchupId: null });
    await tick();
    expect(frame.presentations).toEqual(["modal"]);
    present.dismiss();
    await game;
  });

  it("tells Lucra how each screen shows once it opens, before it navigates", async () => {
    const { frame, present } = setup({}, { presentation: "bottomSheet" });
    await connectLoggedIn(frame);
    const shown: Promise<unknown>[] = [];
    for (const presentation of ["fullScreen", "modal", "sheet", "bottomSheet", undefined] as const) {
      frame.posted.length = 0;
      shown.push(present.profile({ presentation }));
      await tick();
      // The screen it replaced may have sent Lucra home first.
      const types: string[] = frame.posted.map((message) => message.type);
      expect(types.slice(-3)).toEqual(["presentation", "enableExitLucra", "navigate"]);
      expect(frame.lastPosted("navigate")?.body).toEqual({ pathname: `/app/profile?${PARENT}` });
      expect(count(frame, "presentation")).toBe(1);
      // Without its own, the client's.
      expect(frame.lastPosted("presentation")?.body).toEqual({
        presentation: presentation ?? "bottomSheet",
      });
    }
    present.dismiss();
    await Promise.all(shown);
    expect(count(frame, "presentation")).toBe(1);
  });

  it("tells Lucra again after it restarts while the screen shows", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const shown = present.wallet({ presentation: "bottomSheet" });
    await tick();
    expect(count(frame, "presentation")).toBe(1);
    frame.deliver("initialized", { success: true });
    expect(count(frame, "presentation")).toBe(2);
    expect(frame.lastPosted("presentation")?.body).toEqual({ presentation: "bottomSheet" });
    frame.deliver("exitLucra", true);
    await shown;
    frame.deliver("initialized", { success: true });
    expect(count(frame, "presentation")).toBe(2);
  });

  it("tells a restarted Lucra again while a bottom sheet waits for its height, then sizes it", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const shown = present.profile({ presentation: "bottomSheet" });
    await tick();
    frame.deliver("initialized", { success: true });
    expect(count(frame, "presentation")).toBe(2);
    expect(frame.lastPosted("presentation")?.body).toEqual({ presentation: "bottomSheet" });
    frame.deliver("contentHeight", { height: 412 });
    expect(frame.contentHeights).toEqual([412]);
    present.dismiss();
    await shown;
  });

  it("tells Lucra for a login and a minigame too, and the login page's URL is unchanged", async () => {
    const loggedOut = setup();
    await connectLoggedOut(loggedOut.frame);
    const login = loggedOut.present.login({ phoneNumber: "5551234567", presentation: "bottomSheet" });
    await tick();
    expect(loggedOut.frame.urls[loggedOut.frame.urls.length - 1]).toBe(
      buildUrl(urls, "", { login: "true", loginOnly: "true", loginHint: "5551234567" })
    );
    // Nothing shows while Lucra loads its login page.
    expect(count(loggedOut.frame, "presentation")).toBe(0);
    await connectLoggedOut(loggedOut.frame);
    expect(loggedOut.frame.presentations).toEqual(["bottomSheet"]);
    expect(loggedOut.frame.lastPosted("presentation")?.body).toEqual({
      presentation: "bottomSheet",
    });
    loggedOut.present.dismiss();
    await login;

    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const game = present.minigame({ gameId: "g1", mode: "practice", presentation: "bottomSheet" });
    await tick();
    // Before the game starts, so Lucra lays it out for a bottom sheet.
    const types: string[] = frame.posted.map((message) => message.type);
    expect(types.indexOf("presentation")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("presentation")).toBeLessThan(types.indexOf("presentMinigameRequest"));
    expect(frame.lastPosted("presentation")?.body).toEqual({ presentation: "bottomSheet" });
    frame.answer("presentMinigameRequest", "presentMinigameResponse", { sessionId: "s1", matchupId: null });
    await tick();
    // And again once it shows.
    expect(frame.presentations).toEqual(["bottomSheet"]);
    expect(count(frame, "presentation")).toBe(2);
    expect(frame.lastPosted("presentation")?.body).toEqual({ presentation: "bottomSheet" });
    present.dismiss();
    await game;
  });

  const INVALID_HEIGHTS = [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "400", null, undefined];

  for (const name of ["profile", "login"] as const) {
    it(`sizes a ${name} bottom sheet to each valid height Lucra sends while it shows`, async () => {
      const { frame, present } = setup();
      if (name === "login") await connectLoggedOut(frame);
      else await connectLoggedIn(frame);
      const shown = present[name]({ presentation: "bottomSheet" });
      // Before it shows, a height is not for it.
      frame.deliver("contentHeight", { height: 300 });
      await tick();
      if (name === "login") await connectLoggedOut(frame);
      expect(frame.overlayOpen).toBe(true);
      expect(frame.contentHeights).toEqual([]);
      frame.deliver("contentHeight", { height: 412 });
      for (const height of INVALID_HEIGHTS) frame.deliver("contentHeight", { height });
      frame.deliver("contentHeight", null);
      frame.deliver("contentHeight", 412);
      frame.deliver("contentHeight", { height: 500.5 });
      expect(frame.contentHeights).toEqual([412, 500.5]);
      frame.deliver("exitLucra", true);
      await shown;
      // Closed: no longer listening.
      frame.deliver("contentHeight", { height: 600 });
      expect(frame.contentHeights).toEqual([412, 500.5]);
    });
  }

  for (const presentation of ["popup", null]) {
    it(`rejects ${presentation}, and leaves the screen on show alone`, async () => {
      const { frame, activity, present } = setup();
      await connectLoggedIn(frame);
      const wallet = present.wallet();
      await tick();
      const options = { presentation } as never;
      for (const call of [
        () => present.kyc(options),
        () => present.login(options),
        () => present.minigame({ gameId: "g1", mode: "practice", ...(options as object) }),
      ]) {
        const error = await caught(call());
        expect(error.code).toBe("INVALID_ARGUMENT");
        expect(error.hint).toBe(PRESENTATION_HINT);
      }
      await tick();
      expect(present.getState()).toEqual({ screen: "wallet" });
      expect(frame.overlaysOpened).toBe(1);
      present.dismiss();
      expect(await wallet).toEqual({ status: "dismissed", reason: "dismissed" });
      expect(activity.screenOpen).toBe(false);
    });
  }
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
    // Null while Lucra reloads at its login page.
    expect(screenOf(present)).toBeNull();
    await connectLoggedOut(frame);
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

  it("a screen started while the one on show closes is replaced too, and only the newest shows", async () => {
    const { frame, activity, api, present } = setup();
    await connectLoggedIn(frame);
    const wallet = present.wallet();
    await tick();
    let armed = false;
    let profile: Promise<unknown> | null = null;
    present.subscribe((state) => {
      if (armed && state.screen === null && !profile) profile = present.profile();
    });
    armed = true;
    let kycResult: unknown = null;
    const kyc = present.kyc().then((result) => (kycResult = result));
    expect(await wallet).toEqual({ status: "dismissed", reason: "replaced" });
    let profileResult: unknown = null;
    profile!.then((result) => (profileResult = result));
    await tick();
    expect(profileResult).toEqual({ status: "dismissed", reason: "replaced" });
    expect(present.getState()).toEqual({ screen: "kyc" });
    expect(frame.overlayOpen).toBe(true);
    // The wallet and kyc overlays. The profile call never opened one.
    expect(frame.overlaysOpened).toBe(2);
    expect(activity.screenOpen).toBe(true);
    frame.deliver("exitLucra", true);
    await kyc;
    expect(kycResult).toEqual({ status: "dismissed", reason: "exit" });
    expect(present.getState()).toEqual({ screen: null });
    expect(activity.screenOpen).toBe(false);
    const join = api.tournaments.join("t1");
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
  });

  it("an abort while the screen on show closes ends the call, and nothing is sent or shown", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const wallet = present.wallet();
    await tick();
    const controller = new AbortController();
    let armed = false;
    present.subscribe((state) => {
      if (armed && state.screen === null) controller.abort();
    });
    armed = true;
    let kycResult: unknown = null;
    const kyc = present.kyc({ signal: controller.signal }).then((result) => (kycResult = result));
    expect(await wallet).toEqual({ status: "dismissed", reason: "replaced" });
    await tick();
    expect(kycResult).toEqual({ status: "dismissed", reason: "aborted" });
    expect(frame.overlaysOpened).toBe(1);
    expect(navigatedTo(frame, kycPath)).toBe(false);
    expect(present.getState()).toEqual({ screen: null });
    expect(activity.screenOpen).toBe(false);
    await kyc;
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
    // minigame() needs an input, so lucra.present[screen]() could not call it.
    const notScreens = ["addFunds", "minigame", "dismiss", "getState", "subscribe", "destroy"];
    const screens = Object.keys(present).filter((key) => !notScreens.includes(key));
    expect(Object.keys(SCREENS).sort()).toEqual(screens.sort());
  });
});

describe("createPresent: minigame", () => {
  const GAME = { gameId: "g1", mode: "1v1" as const, amount: 5 };
  const STARTED = { sessionId: "s1", matchupId: "m1" };
  const HOME = { pathname: `/app/headless?${PARENT}` };
  const WALLET = { pathname: `/app/wallet?${PARENT}` };
  const starts = (frame: FakeFrame) => count(frame, "presentMinigameRequest");
  const answer = (frame: FakeFrame, data: unknown = STARTED) =>
    frame.answer("presentMinigameRequest", "presentMinigameResponse", data);
  const refuse = (frame: FakeFrame, code: string) =>
    frame.answer("presentMinigameRequest", "apiRequestError", { code });
  const navigations = (frame: FakeFrame) =>
    frame.posted.filter((message) => message.type === "navigate").map((message) => message.body);
  // Records how a promise settled, so a test can check it is still pending.
  const track = (promise: Promise<unknown>) => {
    const seen: { settled: boolean; value?: unknown; error?: LucraError } = { settled: false };
    promise.then(
      (value) => Object.assign(seen, { settled: true, value }),
      (error) => Object.assign(seen, { settled: true, error })
    );
    return seen;
  };

  // Starts the game and waits until it shows.
  async function showGame(
    present: ReturnType<typeof setup>["present"],
    frame: FakeFrame,
    signal?: AbortSignal
  ) {
    const game = present.minigame({ ...GAME, signal });
    await tick();
    answer(frame);
    await tick();
    expect(present.getState()).toEqual({ screen: "minigame" });
    // Wrapped, so awaiting this helper does not wait for the game to end.
    return { game };
  }

  it("rejects an invalid input with INVALID_ARGUMENT, sends nothing, and leaves the screen on show", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const wallet = track(present.wallet());
    await tick();
    const posted = frame.posted.length;
    for (const input of [
      undefined,
      null,
      "g1",
      {},
      { mode: "1v1" },
      { gameId: "", mode: "1v1" },
      { gameId: 1, mode: "1v1" },
      { gameId: "g1" },
      { gameId: "g1", mode: "duel" },
      { gameId: "g1", mode: "1v1", amount: -1 },
      { gameId: "g1", mode: "1v1", amount: Number.NaN },
      { gameId: "g1", mode: "1v1", amount: Number.POSITIVE_INFINITY },
      { gameId: "g1", mode: "1v1", amount: "5" },
      { gameId: "g1", mode: "tournament", matchupId: "" },
      { gameId: "g1", mode: "tournament", matchupId: 7 },
      { gameId: "g1", mode: "tournament" },
      { gameId: "g1", mode: "1v1", matchupId: "t1" },
      { gameId: "g1", mode: "practice", matchupId: "t1" },
      { gameId: "g1", mode: "free_for_all", amount: 5, matchupId: "t1" },
      { gameId: "g1", mode: "1v1", signal: {} },
    ]) {
      const error = await caught(present.minigame(input as never));
      expect(error.code).toBe("INVALID_ARGUMENT");
      expect(error.hint).toBeTruthy();
    }
    await tick();
    expect(frame.posted.length).toBe(posted);
    expect(wallet.settled).toBe(false);
    expect(present.getState()).toEqual({ screen: "wallet" });
    expect(activity.screenOpen).toBe(true);
    present.dismiss();
  });

  it("refuses when logged out and sends nothing", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedOut(frame);
    const error = await caught(present.minigame(GAME));
    expect(error.code).toBe("NOT_LOGGED_IN");
    expect(starts(frame)).toBe(0);
    expect(frame.overlaysOpened).toBe(0);
    expect(activity.screenOpen).toBe(false);
  });

  it("starts the game, shows it once Lucra answers, and completes when it closes", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const game = track(present.minigame(GAME));
    expect(activity.screenOpen).toBe(true);
    await tick();
    expect(starts(frame)).toBe(1);
    const request = frame.lastPosted("presentMinigameRequest")!;
    expect(request.body).toEqual({ gameId: "g1", mode: "1v1", amount: 5 });
    expect(typeof request.requestId).toBe("string");
    // Nothing shows until the game has started.
    expect(frame.overlayOpen).toBe(false);
    expect(present.getState()).toEqual({ screen: null });
    expect(count(frame, "enableExitLucra")).toBe(0);
    answer(frame);
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect(present.getState()).toEqual({ screen: "minigame" });
    expect(frame.lastPosted("enableExitLucra")?.body).toBe(true);
    // Lucra already shows the game: the SDK does not navigate it.
    expect(count(frame, "navigate")).toBe(0);
    frame.deliver("minigameClosed", { sessionId: "other" });
    await tick();
    expect(game.settled).toBe(false);
    expect(frame.overlayOpen).toBe(true);
    frame.deliver("minigameClosed", { sessionId: "s1" });
    await tick();
    expect(game.value).toEqual({ status: "completed", sessionId: "s1", matchupId: "m1" });
    expect(frame.overlayOpen).toBe(false);
    expect(present.getState()).toEqual({ screen: null });
    expect(activity.screenOpen).toBe(false);
    expect(navigations(frame)).toEqual([HOME]);
    expect(starts(frame)).toBe(1);
  });

  it("leaves out the optional fields and the signal", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const game = present.minigame({
      gameId: "g2",
      mode: "practice",
      signal: new AbortController().signal,
    });
    await tick();
    expect(frame.lastPosted("presentMinigameRequest")?.body).toEqual({ gameId: "g2", mode: "practice" });
    answer(frame, { sessionId: "s2", matchupId: null });
    await tick();
    frame.deliver("minigameClosed", { sessionId: "s2" });
    expect(await game).toEqual({ status: "completed", sessionId: "s2", matchupId: null });
    const free = present.minigame({ gameId: "g3", mode: "tournament", amount: 0, matchupId: "t1" });
    await tick();
    expect(frame.lastPosted("presentMinigameRequest")?.body).toEqual({
      gameId: "g3",
      mode: "tournament",
      amount: 0,
      matchupId: "t1",
    });
    present.dismiss();
    answer(frame, { sessionId: "s3", matchupId: "t1" });
    await free;
  });

  it("rejects with Lucra's refusal and its remediation, shows nothing, and leaves no screen open", async () => {
    const { frame, activity, api, present } = setup();
    await connectLoggedIn(frame);
    const game = caught(present.minigame(GAME));
    await tick();
    refuse(frame, "LOCATION_NEEDED");
    const error = await game;
    expect(error).toBeInstanceOf(LucraError);
    expect(error.code).toBe("LOCATION_NEEDED");
    expect(error.remediation).toBe("locationGrant");
    expect(error.outcomeUnknown).toBe(false);
    expect(frame.overlaysOpened).toBe(0);
    expect(present.getState()).toEqual({ screen: null });
    expect(activity.screenOpen).toBe(false);
    // Nothing started, so Lucra is not sent home.
    expect(navigations(frame)).toEqual([]);
    const join = api.tournaments.join("t1");
    await tick();
    expect(count(frame, "joinTournamentRequest")).toBe(1);
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
  });

  it("rejects with outcomeUnknown on API_ERROR and a timeout, and sends Lucra home", async () => {
    const apiError = setup();
    await connectLoggedIn(apiError.frame);
    const failed = caught(apiError.present.minigame(GAME));
    await tick();
    refuse(apiError.frame, "API_ERROR");
    expect((await failed).code).toBe("API_ERROR");
    expect((await failed).outcomeUnknown).toBe(true);
    expect(navigations(apiError.frame)).toEqual([HOME]);

    const timeout = setup({ requestMs: 20 });
    await connectLoggedIn(timeout.frame);
    const late = await caught(timeout.present.minigame(GAME));
    expect(late.code).toBe("TIMEOUT");
    expect(late.outcomeUnknown).toBe(true);
    expect(timeout.frame.overlaysOpened).toBe(0);
    expect(timeout.activity.screenOpen).toBe(false);
    expect(navigations(timeout.frame)).toEqual([HOME]);
  });

  it("rejects with outcomeUnknown on a restart and sends Lucra nowhere, now or after a later call that shows nothing", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const reset = caught(present.minigame(GAME));
    await tick();
    frame.deliver("initialized", { success: true });
    const error = await reset;
    expect(error.code).toBe("CONNECTION_RESET");
    expect(error.outcomeUnknown).toBe(true);
    expect(starts(frame)).toBe(1);
    expect(navigations(frame)).toEqual([]);
    // Lucra is connected again. The restart took any game with it.
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: true });
    frame.deliver("loginSuccess", USER);
    await tick();
    const wallet = track(present.wallet());
    present.dismiss();
    await tick();
    expect(wallet.value).toEqual({ status: "dismissed", reason: "dismissed" });
    expect(frame.overlaysOpened).toBe(0);
    expect(navigations(frame)).toEqual([]);
  });

  it("a restart clears a game left out of sight by a late answer", async () => {
    const { frame, api, present } = setup({ requestMs: 20 });
    await connectLoggedIn(frame);
    await caught(present.minigame(GAME));
    expect(navigations(frame)).toEqual([HOME]);
    // A pending change holds the wallet back, so it is current and not showing.
    const join = caught(api.tournaments.join("t1"));
    await tick();
    const wallet = track(present.wallet());
    await tick();
    answer(frame);
    await tick();
    expect(navigations(frame)).toEqual([HOME]);
    // The wallet ends without showing, before anything else can change.
    frame.deliver("initialized", { success: true });
    present.dismiss();
    await tick();
    expect(wallet.value).toEqual({ status: "dismissed", reason: "dismissed" });
    expect(frame.overlaysOpened).toBe(0);
    expect(navigations(frame)).toEqual([HOME]);
    await join;
  });

  it("refuses other changes while it starts and while it shows, and waits for one pending before", async () => {
    const { frame, api, present } = setup();
    await connectLoggedIn(frame);
    const join = api.tournaments.join("t1");
    await tick();
    const game = present.minigame(GAME);
    await tick();
    // The join is still pending, so the game is not started yet.
    expect(starts(frame)).toBe(0);
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
    await tick();
    expect(starts(frame)).toBe(1);
    expect((await caught(api.tournaments.join("t2"))).code).toBe("SCREEN_OPEN");
    answer(frame);
    await tick();
    expect((await caught(api.matchups.cancel("m1"))).code).toBe("SCREEN_OPEN");
    present.dismiss();
    expect(await game).toEqual({ status: "dismissed", reason: "dismissed", ...STARTED });
  });

  it("resolves dismissed with the ids for each way the game can close, and sends Lucra home", async () => {
    type Close = (
      frame: FakeFrame,
      present: ReturnType<typeof setup>["present"],
      abort: () => void
    ) => void;
    const closers: [LucraDismissReason, Close][] = [
      ["exit", (frame) => frame.deliver("exitLucra", true)],
      ["dismissed", (_frame, present) => present.dismiss()],
      ["aborted", (_frame, _present, abort) => abort()],
      ["loggedOut", (frame) => frame.deliver("logoutComplete", null)],
      ["destroyed", (_frame, present) => present.destroy()],
      ["replaced", (_frame, present) => void present.wallet().catch(() => {})],
    ];
    for (const [reason, close] of closers) {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const controller = new AbortController();
      const { game } = await showGame(present, frame, controller.signal);
      close(frame, present, () => controller.abort());
      expect(await game).toEqual({ status: "dismissed", reason, ...STARTED });
      // The game is not left running out of sight.
      expect(navigations(frame)[0]).toEqual(HOME);
      if (reason !== "replaced") expect(frame.overlayOpen).toBe(false);
    }
  });

  it("settles at once with no ids when dismissed before the request is sent, and sends nothing", async () => {
    const connecting = setup();
    const early = connecting.present.minigame(GAME);
    connecting.present.dismiss();
    expect(await early).toEqual({
      status: "dismissed",
      reason: "dismissed",
      sessionId: null,
      matchupId: null,
    });
    await connectLoggedIn(connecting.frame);
    await tick();
    expect(starts(connecting.frame)).toBe(0);

    const aborted = setup();
    await connectLoggedIn(aborted.frame);
    expect(await aborted.present.minigame({ ...GAME, signal: AbortSignal.abort() })).toEqual({
      status: "dismissed",
      reason: "aborted",
      sessionId: null,
      matchupId: null,
    });
    expect(starts(aborted.frame)).toBe(0);
    expect(aborted.activity.screenOpen).toBe(false);

    const waiting = setup();
    await connectLoggedIn(waiting.frame);
    const join = waiting.api.tournaments.join("t1");
    await tick();
    const controller = new AbortController();
    const game = waiting.present.minigame({ ...GAME, signal: controller.signal });
    await tick();
    controller.abort();
    expect(await game).toEqual({
      status: "dismissed",
      reason: "aborted",
      sessionId: null,
      matchupId: null,
    });
    waiting.frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
    await tick();
    expect(starts(waiting.frame)).toBe(0);
  });

  describe("dismissed while the request is in flight", () => {
    for (const [reason, how] of [
      ["dismissed", "dismiss()"],
      ["aborted", "the signal"],
    ] as const) {
      it(`by ${how}: waits for Lucra, then resolves with the ids and sends Lucra home`, async () => {
        const { frame, activity, api, present } = setup();
        await connectLoggedIn(frame);
        const screens: unknown[] = [];
        present.subscribe((state) => screens.push(state.screen));
        const controller = new AbortController();
        const game = track(present.minigame({ ...GAME, signal: controller.signal }));
        await tick();
        expect(starts(frame)).toBe(1);
        if (reason === "dismissed") present.dismiss();
        else controller.abort();
        await tick();
        // A stake may be placed, so the call waits for Lucra's answer.
        expect(game.settled).toBe(false);
        expect(activity.screenOpen).toBe(false);
        // The start is still a pending change.
        expect((await caught(api.tournaments.join("t1"))).code).toBe("IN_PROGRESS");
        answer(frame);
        await tick();
        expect(game.value).toEqual({ status: "dismissed", reason, ...STARTED });
        expect(frame.overlaysOpened).toBe(0);
        expect(screens).toEqual([null]);
        expect(navigations(frame)).toEqual([HOME]);
      });
    }

    it("by another screen: the new screen waits for Lucra's answer, then shows on its own page", async () => {
      const { frame, activity, present } = setup();
      await connectLoggedIn(frame);
      const game = track(present.minigame(GAME));
      await tick();
      const wallet = track(present.wallet());
      await tick();
      expect(game.settled).toBe(false);
      expect(activity.screenOpen).toBe(true);
      expect(frame.overlaysOpened).toBe(0);
      expect(present.getState()).toEqual({ screen: null });
      expect(navigations(frame)).toEqual([]);
      answer(frame);
      await tick();
      expect(game.value).toEqual({ status: "dismissed", reason: "replaced", ...STARTED });
      // No home navigation: the wallet navigates Lucra itself.
      expect(navigations(frame)).toEqual([WALLET]);
      expect(frame.overlaysOpened).toBe(1);
      expect(present.getState()).toEqual({ screen: "wallet" });
      expect(wallet.settled).toBe(false);
      present.dismiss();
      await tick();
      expect(wallet.value).toEqual({ status: "dismissed", reason: "dismissed" });
    });

    it("rejects with Lucra's refusal", async () => {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const game = caught(present.minigame(GAME));
      await tick();
      present.dismiss();
      refuse(frame, "LOCATION_NEEDED");
      const error = await game;
      expect(error.code).toBe("LOCATION_NEEDED");
      expect(error.remediation).toBe("locationGrant");
      expect(navigations(frame)).toEqual([]);
    });

    it("rejects with outcomeUnknown on a timeout", async () => {
      const { frame, present } = setup({ requestMs: 20 });
      await connectLoggedIn(frame);
      const game = caught(present.minigame(GAME));
      await tick();
      present.dismiss();
      const error = await game;
      expect(error.code).toBe("TIMEOUT");
      expect(error.outcomeUnknown).toBe(true);
      expect(frame.overlaysOpened).toBe(0);
      expect(navigations(frame)).toEqual([HOME]);
    });

    it("by present.destroy(): waits for Lucra, then resolves destroyed with the ids", async () => {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const game = track(present.minigame(GAME));
      await tick();
      present.destroy();
      await tick();
      expect(game.settled).toBe(false);
      answer(frame);
      await tick();
      expect(game.value).toEqual({ status: "dismissed", reason: "destroyed", ...STARTED });
      expect(frame.overlaysOpened).toBe(0);
    });
  });

  it("a second minigame while the first starts waits for it, then starts its own", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const first = track(present.minigame(GAME));
    await tick();
    const second = track(present.minigame({ gameId: "g2", mode: "practice" }));
    await tick();
    expect(starts(frame)).toBe(1);
    answer(frame);
    await tick();
    expect(first.value).toEqual({ status: "dismissed", reason: "replaced", ...STARTED });
    expect(starts(frame)).toBe(2);
    expect(frame.lastPosted("presentMinigameRequest")?.body).toEqual({ gameId: "g2", mode: "practice" });
    expect(frame.overlaysOpened).toBe(0);
    answer(frame, { sessionId: "s2", matchupId: null });
    await tick();
    expect(present.getState()).toEqual({ screen: "minigame" });
    frame.deliver("minigameClosed", { sessionId: "s2" });
    await tick();
    expect(second.value).toEqual({ status: "completed", sessionId: "s2", matchupId: null });
    expect(navigations(frame)).toEqual([HOME]);
  });

  it("a second minigame while the first shows replaces it", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const { game: first } = await showGame(present, frame);
    const second = present.minigame({ gameId: "g2", mode: "practice" });
    expect(await first).toEqual({ status: "dismissed", reason: "replaced", ...STARTED });
    expect(present.getState()).toEqual({ screen: null });
    await tick();
    expect(starts(frame)).toBe(2);
    answer(frame, { sessionId: "s2", matchupId: null });
    await tick();
    expect(present.getState()).toEqual({ screen: "minigame" });
    // A message for the first game does not close the second.
    frame.deliver("minigameClosed", { sessionId: "s1" });
    await tick();
    expect(frame.overlayOpen).toBe(true);
    frame.deliver("exitLucra", true);
    expect(await second).toEqual({
      status: "dismissed",
      reason: "exit",
      sessionId: "s2",
      matchupId: null,
    });
  });

  describe("a game that may run where nothing shows it", () => {
    for (const how of ["dismiss()", "the signal"] as const) {
      it(`replaced by a screen that ends by ${how} before it shows: sends Lucra home once the game starts`, async () => {
        const { frame, present } = setup();
        await connectLoggedIn(frame);
        const game = track(present.minigame(GAME));
        await tick();
        const controller = new AbortController();
        const wallet = track(present.wallet({ signal: controller.signal }));
        await tick();
        if (how === "dismiss()") present.dismiss();
        else controller.abort();
        await tick();
        expect(wallet.value).toEqual({
          status: "dismissed",
          reason: how === "dismiss()" ? "dismissed" : "aborted",
        });
        expect(navigations(frame)).toEqual([]);
        answer(frame);
        await tick();
        expect(game.value).toEqual({ status: "dismissed", reason: "replaced", ...STARTED });
        expect(navigations(frame)).toEqual([HOME]);
        expect(frame.overlaysOpened).toBe(0);
        expect(present.getState()).toEqual({ screen: null });
      });
    }

    it("replaced by a login with nothing to show: sends Lucra home once the game starts", async () => {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const game = track(present.minigame(GAME));
      await tick();
      const login = track(present.login());
      await tick();
      expect(login.value).toEqual({ status: "completed", user: USER });
      answer(frame);
      await tick();
      expect(game.value).toEqual({ status: "dismissed", reason: "replaced", ...STARTED });
      expect(navigations(frame)).toEqual([HOME]);
      expect(frame.overlaysOpened).toBe(0);
      expect(present.getState()).toEqual({ screen: null });
    });

    it("replaced by a second minigame that Lucra refuses: sends Lucra home after the refusal", async () => {
      const { frame, activity, present } = setup();
      await connectLoggedIn(frame);
      const first = track(present.minigame(GAME));
      await tick();
      const second = track(present.minigame({ gameId: "g2", mode: "practice" }));
      await tick();
      answer(frame);
      await tick();
      expect(first.value).toEqual({ status: "dismissed", reason: "replaced", ...STARTED });
      // The second call is current, so Lucra is not sent home under it.
      expect(navigations(frame)).toEqual([]);
      expect(starts(frame)).toBe(2);
      refuse(frame, "LOCATION_NEEDED");
      await tick();
      expect(second.error?.code).toBe("LOCATION_NEEDED");
      expect(navigations(frame)).toEqual([HOME]);
      expect(frame.overlaysOpened).toBe(0);
      expect(present.getState()).toEqual({ screen: null });
      expect(activity.screenOpen).toBe(false);
    });

    for (const how of ["dismiss()", "the signal"] as const) {
      it(`ended by ${how} while it starts, then a screen: the screen shows its own page`, async () => {
        const { frame, present } = setup();
        await connectLoggedIn(frame);
        const controller = new AbortController();
        const game = track(present.minigame({ ...GAME, signal: controller.signal }));
        await tick();
        if (how === "dismiss()") present.dismiss();
        else controller.abort();
        const wallet = track(present.wallet());
        await tick();
        answer(frame);
        await tick();
        expect(game.value).toEqual({
          status: "dismissed",
          reason: how === "dismiss()" ? "dismissed" : "aborted",
          ...STARTED,
        });
        expect(navigations(frame)).toEqual([WALLET]);
        expect(frame.overlayOpen).toBe(true);
        expect(present.getState()).toEqual({ screen: "wallet" });
        expect(wallet.settled).toBe(false);
        present.dismiss();
        await tick();
        expect(wallet.value).toEqual({ status: "dismissed", reason: "dismissed" });
        expect(navigations(frame)).toEqual([WALLET, HOME]);
      });
    }

    it("sends Lucra home on a timeout, and again when the answer comes late", async () => {
      const { frame, activity, present } = setup({ requestMs: 20 });
      await connectLoggedIn(frame);
      const error = await caught(present.minigame(GAME));
      expect(error.code).toBe("TIMEOUT");
      expect(error.outcomeUnknown).toBe(true);
      expect(navigations(frame)).toEqual([HOME]);
      answer(frame);
      await tick();
      expect(navigations(frame)).toEqual([HOME, HOME]);
      expect(frame.overlaysOpened).toBe(0);
      expect(present.getState()).toEqual({ screen: null });
      expect(activity.screenOpen).toBe(false);
    });

    it("a late answer while a screen shows leaves it alone", async () => {
      const { frame, present } = setup({ requestMs: 20 });
      await connectLoggedIn(frame);
      await caught(present.minigame(GAME));
      const wallet = track(present.wallet());
      await tick();
      expect(navigations(frame)).toEqual([HOME, WALLET]);
      answer(frame);
      await tick();
      expect(navigations(frame)).toEqual([HOME, WALLET]);
      expect(present.getState()).toEqual({ screen: "wallet" });
      present.dismiss();
      await tick();
      expect(wallet.value).toEqual({ status: "dismissed", reason: "dismissed" });
      expect(navigations(frame)).toEqual([HOME, WALLET, HOME]);
    });

    it("a late answer while a screen waits sends Lucra home once that screen ends without showing", async () => {
      const { frame, api, present } = setup({ requestMs: 20 });
      await connectLoggedIn(frame);
      await caught(present.minigame(GAME));
      // A pending change holds the wallet back.
      const join = api.tournaments.join("t1");
      await tick();
      const wallet = track(present.wallet());
      await tick();
      answer(frame);
      await tick();
      expect(navigations(frame)).toEqual([HOME]);
      present.dismiss();
      await tick();
      expect(wallet.value).toEqual({ status: "dismissed", reason: "dismissed" });
      expect(navigations(frame)).toEqual([HOME, HOME]);
      frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
      await join;
    });

    it("stops listening for late answers once destroyed", async () => {
      const { frame, present } = setup({ requestMs: 20 });
      await connectLoggedIn(frame);
      await caught(present.minigame(GAME));
      present.destroy();
      answer(frame);
      await tick();
      expect(navigations(frame)).toEqual([HOME]);
    });

    it("does not send Lucra home when Lucra refuses the start", async () => {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const game = caught(present.minigame(GAME));
      await tick();
      refuse(frame, "INSUFFICIENT_FUNDS");
      const error = await game;
      expect(error.code).toBe("INSUFFICIENT_FUNDS");
      expect(error.outcomeUnknown).toBe(false);
      await tick();
      expect(navigations(frame)).toEqual([]);
    });
  });

  describe("Lucra restarts while the game shows", () => {
    for (const success of [true, false]) {
      it(`closes it with "restarted" and the ids${success ? "" : " when Lucra cannot start again"}`, async () => {
        const { frame, activity, present } = setup();
        await connectLoggedIn(frame);
        const { game } = await showGame(present, frame);
        const result = track(game);
        frame.deliver("initialized", { success });
        await tick();
        expect(result.value).toEqual({ status: "dismissed", reason: "restarted", ...STARTED });
        expect(frame.overlayOpen).toBe(false);
        expect(present.getState()).toEqual({ screen: null });
        expect(activity.screenOpen).toBe(false);
        const sent = navigations(frame);
        expect(sent).toEqual(success ? [HOME] : []);
        // The old game's close message changes nothing.
        frame.deliver("minigameClosed", { sessionId: "s1" });
        await tick();
        expect(result.value).toEqual({ status: "dismissed", reason: "restarted", ...STARTED });
        expect(navigations(frame)).toEqual(sent);
        expect(frame.overlaysOpened).toBe(1);
      });
    }

    it("leaves a page screen and the login screen showing", async () => {
      const page = setup();
      await connectLoggedIn(page.frame);
      const wallet = track(page.present.wallet());
      await tick();
      page.frame.deliver("initialized", { success: true });
      await tick();
      expect(wallet.settled).toBe(false);
      expect(page.present.getState()).toEqual({ screen: "wallet" });
      expect(page.frame.overlayOpen).toBe(true);
      page.present.dismiss();

      const login = setup();
      await connectLoggedOut(login.frame);
      const shown = track(login.present.login());
      await tick();
      await connectLoggedOut(login.frame);
      expect(login.present.getState()).toEqual({ screen: "login" });
      login.frame.deliver("initialized", { success: true });
      await tick();
      expect(shown.settled).toBe(false);
      expect(login.present.getState()).toEqual({ screen: "login" });
      login.frame.deliver("loginSuccess", USER);
      await tick();
      expect(shown.value).toEqual({ status: "completed", user: USER });
      expect(login.present.getState()).toEqual({ screen: null });
    });
  });

  describe("checks Lucra's answer", () => {
    for (const data of [null, {}, { matchupId: "m1" }, { sessionId: "" }, { sessionId: 7 }]) {
      it(`rejects ${JSON.stringify(data)} with API_ERROR, outcome unknown, and sends Lucra home`, async () => {
        const { frame, activity, present } = setup();
        await connectLoggedIn(frame);
        const game = caught(present.minigame(GAME));
        await tick();
        answer(frame, data);
        const error = await game;
        expect(error.code).toBe("API_ERROR");
        expect(error.outcomeUnknown).toBe(true);
        expect(frame.overlaysOpened).toBe(0);
        expect(present.getState()).toEqual({ screen: null });
        expect(activity.screenOpen).toBe(false);
        expect(navigations(frame)).toEqual([HOME]);
      });
    }

    it("rejects a bad answer that comes after a dismissal the same way", async () => {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const game = caught(present.minigame(GAME));
      await tick();
      present.dismiss();
      answer(frame, { matchupId: "m1" });
      const error = await game;
      expect(error.code).toBe("API_ERROR");
      expect(error.outcomeUnknown).toBe(true);
      expect(navigations(frame)).toEqual([HOME]);
    });

    it("reports a missing matchupId as null", async () => {
      const { frame, present } = setup();
      await connectLoggedIn(frame);
      const game = present.minigame(GAME);
      await tick();
      answer(frame, { sessionId: "s1" });
      await tick();
      frame.deliver("minigameClosed", { sessionId: "s1" });
      expect(await game).toEqual({ status: "completed", sessionId: "s1", matchupId: null });

      const other = present.minigame(GAME);
      await tick();
      answer(frame, { sessionId: "s2" });
      await tick();
      present.dismiss();
      expect(await other).toEqual({
        status: "dismissed",
        reason: "dismissed",
        sessionId: "s2",
        matchupId: null,
      });
    });
  });
});
