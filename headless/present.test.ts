import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createApi, type Activity } from "./api.ts";
import { createAuth } from "./auth.ts";
import { LucraError } from "./errors.ts";
import { createPresent } from "./present.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";
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
        expect(await shown).toEqual({ status: "dismissed" });
      }
    }
  });

  it("resolves dismissed on exitLucra and dismiss()", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const a = present.kyc();
    await tick();
    frame.deliver("exitLucra", true);
    expect(await a).toEqual({ status: "dismissed" });
    const b = present.profile();
    await tick();
    present.dismiss();
    expect(await b).toEqual({ status: "dismissed" });
    expect(frame.overlayOpen).toBe(false);
    present.dismiss();
  });

  it("replaces the screen on show with the new one", async () => {
    const { frame, activity, present } = setup();
    await connectLoggedIn(frame);
    const first = present.profile();
    await tick();
    const second = present.wallet();
    expect(await first).toEqual({ status: "dismissed" });
    expect(activity.screenOpen).toBe(true);
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect(frame.overlaysOpened).toBe(2);
    frame.deliver("exitLucra", true);
    expect(await second).toEqual({ status: "dismissed" });
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
    expect(await shown).toEqual({ status: "dismissed" });
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
    expect(await shown).toEqual({ status: "dismissed" });
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
    expect(await first).toEqual({ status: "dismissed" });
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

  it("gives a second call the same result while the window is open", async () => {
    const { frame, present } = setup();
    await connectLoggedIn(frame);
    const first = present.addFunds();
    const second = present.addFunds();
    expect(second).toBe(first);
    expect(frame.popups.length).toBe(1);
    frame.deliver("LucraPopupMessage", { toastType: "success", message: "ok" });
    expect(await second).toEqual({ status: "completed", message: "ok" });
    // Once it has ended, a new call opens a new window.
    present.addFunds().catch(() => {});
    expect(frame.popups.length).toBe(2);
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
    expect(await shown).toEqual({ status: "dismissed" });
    expect(await funded).toEqual({ status: "dismissed" });
    expect(frame.overlayOpen).toBe(false);
    expect(frame.popups[0].closed).toBe(true);
    expect((await caught(present.kyc())).code).toBe("DESTROYED");
    expect((await caught(present.login())).code).toBe("DESTROYED");
    expect((await caught(present.addFunds())).code).toBe("DESTROYED");
  });
});
