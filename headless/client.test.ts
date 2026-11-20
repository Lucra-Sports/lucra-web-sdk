import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { createClient, createLucraClient } from "./client.ts";
import { LucraError } from "./errors.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";

const config = { apiKey: "key-1", tenantId: "test-tenant", env: "sandbox" as const };
const USER = { id: "u1", username: "pat", balance: 25 };

function setup() {
  const frame = createFakeFrame();
  const onDestroy = mock(() => {});
  const client = createClient(config, {
    frame,
    parentOrigin: "https://host.example",
    onDestroy,
  });
  return { frame, client, onDestroy };
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
const thrown = (run: () => unknown): LucraError => {
  try {
    run();
  } catch (error) {
    return error as LucraError;
  }
  throw new Error("expected a throw");
};

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

describe("createClient", () => {
  it("loads Lucra's blank home route with the launch parameters", () => {
    const { frame } = setup();
    const url = new URL(frame.urls[0]);
    expect(url.origin).toBe("https://test-tenant.sandbox.lucrasports.com");
    expect(url.pathname).toBe("/app/headless");
    expect(url.searchParams.get("apiKey")).toBe("key-1");
    expect(url.searchParams.get("parentUrl")).toBe("https://host.example");
    expect(url.searchParams.get("autoJoin")).toBe("true");
  });

  it("exposes exactly the public surface", () => {
    const { client } = setup();
    expect(Object.keys(client).sort()).toEqual(
      ["achievements", "auth", "destroy", "matchups", "on", "present", "rewards", "tournaments", "whenConnected", "withRemediation"]
    );
    expect(Object.keys(client.auth).sort()).toEqual(["getState", "isLoggedIn", "logout", "subscribe", "updateUser"]);
    expect(Object.keys(client.tournaments).sort()).toEqual(["autoJoin", "get", "join", "leaderboard", "list"]);
    expect(Object.keys(client.matchups).sort()).toEqual(["accept", "cancel", "create", "get", "getDetails", "list", "listByTypeStatus", "searchByMetadata", "watch"]);
    expect(Object.keys(client.achievements).sort()).toEqual(["claim", "list", "markViewed"]);
    expect(Object.keys(client.rewards).sort()).toEqual(["claim", "list"]);
    expect(Object.keys(client.present).sort()).toEqual(
      ["addFunds", "demographics", "dismiss", "getState", "kyc", "locationGrant", "login", "minigame", "profile", "subscribe", "wallet", "withdraw"]
    );
  });

  it("withRemediation shows the location screen, then sends the write again", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const joined = client.withRemediation(() => client.tournaments.join("t1"));
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentError", { code: "LOCATION_NEEDED" });
    await tick();
    expect(client.present.getState().screen).toBe("locationGrant");
    frame.deliver("locationGranted", null);
    await tick();
    const joins = frame.posted.filter((message) => message.type === "joinTournamentRequest");
    expect(joins.length).toBe(2);
    expect(joins[1].requestId).not.toBe(joins[0].requestId);
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    expect(await joined).toEqual({ matchupId: "t1" });
  });

  it("withRemediation shows login, then sends the write once after the login", async () => {
    const { frame, client } = setup();
    frame.deliver("initialized", { success: true });
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
    await tick();
    const joined = client.withRemediation(() => client.tournaments.join("t1"));
    await tick();
    expect(client.present.getState().screen).toBe("login");
    // Loading the login screen restarts Lucra.
    expect(frame.urls.length).toBe(2);
    frame.deliver("initialized", { success: true });
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
    await tick();
    expect(count(frame, "joinTournamentRequest")).toBe(0);
    frame.deliver("loginSuccess", USER);
    await tick();
    expect(count(frame, "joinTournamentRequest")).toBe(1);
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    expect(await joined).toEqual({ matchupId: "t1" });
    expect(count(frame, "joinTournamentRequest")).toBe(1);
  });

  it("withRemediation rejects with the call's error when the user leaves the fix", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const joined = caught(client.withRemediation(() => client.tournaments.join("t1")));
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentError", { code: "LOCATION_NEEDED" });
    await tick();
    expect(client.present.getState().screen).toBe("locationGrant");
    frame.deliver("exitLucra", true);
    const error = await joined;
    expect(error).toBeInstanceOf(LucraError);
    expect(error.code).toBe("LOCATION_NEEDED");
    expect(count(frame, "joinTournamentRequest")).toBe(1);
  });

  it("withRemediation rejects DESTROYED when the client is destroyed during a fix", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const joined = caught(client.withRemediation(() => client.tournaments.join("t1")));
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentError", { code: "LOCATION_NEEDED" });
    await tick();
    expect(client.present.getState().screen).toBe("locationGrant");
    client.destroy();
    expect((await joined).code).toBe("DESTROYED");
    expect(count(frame, "joinTournamentRequest")).toBe(1);
  });

  it("withRemediation shows the fix for a refused minigame, then starts the game", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const game = client.withRemediation(() =>
      client.present.minigame({ gameId: "g1", mode: "1v1", amount: 5 })
    );
    await tick();
    frame.answer("presentMinigameRequest", "apiRequestError", { code: "LOCATION_NEEDED" });
    await tick();
    expect(client.present.getState().screen).toBe("locationGrant");
    frame.deliver("locationGranted", null);
    await tick();
    const starts = frame.posted.filter((message) => message.type === "presentMinigameRequest");
    expect(starts.length).toBe(2);
    expect(starts[1].requestId).not.toBe(starts[0].requestId);
    expect(starts[1].body).toEqual({ gameId: "g1", mode: "1v1", amount: 5 });
    frame.answer("presentMinigameRequest", "presentMinigameResponse", { sessionId: "s1", matchupId: "m1" });
    await tick();
    expect(client.present.getState().screen).toBe("minigame");
    frame.deliver("minigameClosed", { sessionId: "s1" });
    expect(await game).toEqual({ status: "completed", sessionId: "s1", matchupId: "m1" });
  });

  it("destroy while a minigame starts rejects DESTROYED with an unknown outcome", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const game = caught(client.present.minigame({ gameId: "g1", mode: "practice" }));
    await tick();
    expect(count(frame, "presentMinigameRequest")).toBe(1);
    client.destroy();
    const error = await game;
    expect(error.code).toBe("DESTROYED");
    expect(error.outcomeUnknown).toBe(true);
    expect(frame.overlaysOpened).toBe(0);
  });

  it("destroy while a minigame shows resolves dismissed with the ids", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const game = client.present.minigame({ gameId: "g1", mode: "practice" });
    await tick();
    frame.answer("presentMinigameRequest", "presentMinigameResponse", { sessionId: "s1", matchupId: null });
    await tick();
    expect(frame.overlayOpen).toBe(true);
    client.destroy();
    expect(await game).toEqual({ status: "dismissed", reason: "destroyed", sessionId: "s1", matchupId: null });
    expect(frame.overlayOpen).toBe(false);
  });

  it("types minigame as needing its input", () => {
    // Only type checked, never run.
    const check = (client: ReturnType<typeof setup>["client"]) => {
      // @ts-expect-error minigame needs { gameId, mode }.
      void client.present.minigame();
      // @ts-expect-error mode is required.
      void client.present.minigame({ gameId: "g1" });
      void client.present.minigame({ gameId: "g1", mode: "practice" });
    };
    expect(typeof check).toBe("function");
  });

  it("wires auth, data calls, watch, and screens together", async () => {
    const { frame, client } = setup();
    const connected = client.whenConnected();
    await connectLoggedIn(frame);
    await connected;
    expect(client.auth.getState()).toEqual({ status: "loggedIn", user: USER });

    const list = client.tournaments.list();
    await tick();
    frame.answer("tournamentsRequest", "tournamentsResponse", { tournaments: [] });
    expect(await list).toEqual([]);

    const onUpdate = mock(() => {});
    const watch = client.matchups.watch("m1", { onUpdate });
    await tick();
    frame.answer("subscribeMatchupDetailsRequest", "subscribeMatchupDetailsResponse", {
      matchup: { id: "m1" },
      groups: [],
      participantScores: [],
    });
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    watch.stop();

    const shown = client.present.profile();
    await tick();
    expect(frame.overlayOpen).toBe(true);
    expect((await caught(client.tournaments.join("t1"))).code).toBe("SCREEN_OPEN");
    client.present.dismiss();
    expect(await shown).toEqual({ status: "dismissed", reason: "dismissed" });
  });

  it("passes Lucra's events to lucra.on listeners", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const events = [
      "matchupCreated",
      "matchupAccepted",
      "matchupStarted",
      "matchupCanceled",
      "activeMatchupStarted",
      "tournamentJoined",
    ] as const;
    for (const event of events) {
      const listener = mock(() => {});
      const off = client.on(event, listener);
      frame.deliver(event, { matchupId: "m1" });
      expect(listener).toHaveBeenCalledWith({ matchupId: "m1" });
      off();
      frame.deliver(event, { matchupId: "m2" });
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });

  it("does not pass on messages that are not public events", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const listener = mock(() => {});
    client.on("userInfo" as never, listener);
    client.on("exitLucra" as never, listener);
    frame.deliver("userInfo", USER);
    frame.deliver("exitLucra", true);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it("emits autoJoinedTournaments for Lucra's own auto join, not for the app's own call", async () => {
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const listener = mock(() => {});
    client.on("autoJoinedTournaments", listener);
    frame.deliver("autoJoinedTournaments", { matchupIds: ["t0"] });
    expect(listener).toHaveBeenCalledTimes(1);
    const manual = client.tournaments.autoJoin();
    await tick();
    frame.answer("autoJoinTournamentsRequest", "autoJoinedTournaments", { matchupIds: ["t1"] });
    expect(await manual).toEqual({ matchupIds: ["t1"] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("destroy rejects pending calls, closes screens, and stays destroyed", async () => {
    const { frame, client, onDestroy } = setup();
    await connectLoggedIn(frame);
    const read = caught(client.tournaments.list());
    const shown = client.present.profile();
    const listener = mock(() => {});
    client.on("matchupCreated", listener);
    await tick();
    client.destroy();
    client.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect((await read).code).toBe("DESTROYED");
    expect(await shown).toEqual({ status: "dismissed", reason: "destroyed" });
    expect(frame.destroyed).toBe(true);
    expect(frame.overlayOpen).toBe(false);
    expect((await caught(client.whenConnected())).code).toBe("DESTROYED");
    expect((await caught(client.tournaments.list())).code).toBe("DESTROYED");
    expect((await caught(client.tournaments.join("t"))).code).toBe("DESTROYED");
    expect((await caught(client.present.kyc())).code).toBe("DESTROYED");
    expect((await caught(client.present.addFunds())).code).toBe("DESTROYED");
    expect((await caught(client.auth.logout())).code).toBe("DESTROYED");
    expect((await caught(client.auth.isLoggedIn())).code).toBe("DESTROYED");
    frame.deliver("matchupCreated", { matchupId: "m1" });
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it("is inert where there is no browser", async () => {
    const frame = createFakeFrame();
    const client = createClient(config, { frame, parentOrigin: "", unsupported: true });
    expect(frame.urls.length).toBe(0);
    expect(client.auth.getState()).toEqual({ status: "loading", user: null });
    expect((await caught(client.whenConnected())).code).toBe("UNSUPPORTED_ENVIRONMENT");
    expect((await caught(client.tournaments.list())).code).toBe("UNSUPPORTED_ENVIRONMENT");
    expect((await caught(client.tournaments.join("t"))).code).toBe("UNSUPPORTED_ENVIRONMENT");
    expect((await caught(client.auth.isLoggedIn())).code).toBe("UNSUPPORTED_ENVIRONMENT");
    expect((await caught(client.present.login())).code).toBe("UNSUPPORTED_ENVIRONMENT");
    expect((await caught(client.present.addFunds())).code).toBe("UNSUPPORTED_ENVIRONMENT");
    client.matchups.watch("m1", { onUpdate: () => {} }).stop();
    client.destroy();
  });
});

describe("createLucraClient", () => {
  // createLucraClient logs why it threw. Kept quiet here, and checked below.
  let error: ReturnType<typeof spyOn>;
  beforeEach(() => {
    error = spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    error.mockRestore();
  });

  it("logs the code and the hint once when it throws, then throws the same error", () => {
    let thrownError: unknown = null;
    try {
      createLucraClient({ ...config, apiKey: "" });
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeInstanceOf(LucraError);
    expect((thrownError as LucraError).message).toBe("Something went wrong");
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      "Lucra INVALID_CONFIG: apiKey, tenantId, and env are required."
    );
  });

  it("logs nothing when it makes a client", () => {
    createLucraClient(config).destroy();
    expect(error).toHaveBeenCalledTimes(0);
  });

  it("throws INVALID_CONFIG when apiKey, tenantId, or env is missing", () => {
    for (const bad of [
      { ...config, apiKey: "" },
      { ...config, tenantId: "" },
      { ...config, env: undefined },
      undefined,
    ]) {
      const error = thrown(() => createLucraClient(bad as never));
      expect(error).toBeInstanceOf(LucraError);
      expect(error.code).toBe("INVALID_CONFIG");
    }
  });

  it("throws INVALID_CONFIG for a tenantId or env that is not a Lucra address", () => {
    for (const bad of [
      { ...config, tenantId: "evil.example/" },
      { ...config, tenantId: "evil.example#" },
      { ...config, tenantId: "evil.example?" },
      { ...config, tenantId: "x@evil.example/" },
      { ...config, env: "x.evil.example/" },
    ]) {
      const error = thrown(() => createLucraClient(bad as never));
      expect(error).toBeInstanceOf(LucraError);
      expect(error.code).toBe("INVALID_CONFIG");
    }
  });

  it("throws INVALID_CONFIG for a container that is not an element", () => {
    for (const container of [{}, "app", 1, null]) {
      const error = thrown(() => createLucraClient({ ...config, container } as never));
      expect(error).toBeInstanceOf(LucraError);
      expect(error.code).toBe("INVALID_CONFIG");
    }
  });

  it("returns an inert client where there is no browser, and does not remember it", async () => {
    // bun test has no window or document, so this is the no browser path.
    const first = createLucraClient(config);
    const second = createLucraClient({ ...config, tenantId: "other" });
    expect(second).not.toBe(first);
    expect((await caught(first.tournaments.list())).code).toBe("UNSUPPORTED_ENVIRONMENT");
    first.destroy();
    second.destroy();
  });

  describe("in a browser", () => {
    const saved = {
      window: (globalThis as { window?: unknown }).window,
      document: (globalThis as { document?: unknown }).document,
    };
    const element = () => ({
      nodeType: 1,
      isConnected: true,
      style: { cssText: "" },
      appendChild() {},
      remove() {},
      contentWindow: { postMessage() {} },
    });

    // Just enough page for the real frame to mount.
    beforeEach(() => {
      (globalThis as { window?: unknown }).window = {
        location: { origin: "https://host.example" },
        addEventListener() {},
        removeEventListener() {},
      };
      (globalThis as { document?: unknown }).document = {
        body: element(),
        createElement: element,
      };
    });
    afterEach(() => {
      (globalThis as { window?: unknown }).window = saved.window;
      (globalThis as { document?: unknown }).document = saved.document;
    });

    it("returns the same client for the same config", () => {
      const first = createLucraClient(config);
      expect(createLucraClient({ ...config })).toBe(first);
      expect(createLucraClient({ ...config, autoJoin: true })).toBe(first);
      first.destroy();
    });

    it("throws INVALID_CONFIG for a different config while a client exists", () => {
      const first = createLucraClient(config);
      for (const other of [
        { ...config, tenantId: "other" },
        { ...config, apiKey: "key-2" },
        { ...config, env: "production" as const },
        { ...config, locationId: "loc-1" },
        { ...config, autoJoin: false },
        { ...config, container: element() as unknown as HTMLElement },
      ]) {
        expect(thrown(() => createLucraClient(other)).code).toBe("INVALID_CONFIG");
      }
      first.destroy();
    });

    it("returns the same client for the same container, and throws for another", () => {
      const container = element() as unknown as HTMLElement;
      const first = createLucraClient({ ...config, container });
      expect(createLucraClient({ ...config, container })).toBe(first);
      expect(thrown(() => createLucraClient(config)).code).toBe("INVALID_CONFIG");
      const other = element() as unknown as HTMLElement;
      expect(thrown(() => createLucraClient({ ...config, container: other })).code).toBe(
        "INVALID_CONFIG"
      );
      first.destroy();
    });

    it("throws INVALID_CONFIG for an unknown presentation, or one with a container", () => {
      for (const [bad, hint] of [
        [{ ...config, presentation: "popup" }, "presentation must be"],
        [{ ...config, presentation: null }, "presentation must be"],
        [{ ...config, presentation: "modal", container: element() }, "container"],
        // A screen fills the container, so even the default is refused.
        [{ ...config, presentation: "fullScreen", container: element() }, "container"],
      ] as const) {
        const error = thrown(() => createLucraClient(bad as never));
        expect(error.code).toBe("INVALID_CONFIG");
        expect(error.hint).toContain(hint);
        expect(error.hint).not.toContain("popup");
      }
      // Nothing was remembered, so a good config still makes a client.
      createLucraClient(config).destroy();
    });

    it("returns the same client for the same presentation, and throws for another", () => {
      const first = createLucraClient({ ...config, presentation: "sheet" });
      expect(createLucraClient({ ...config, presentation: "sheet" })).toBe(first);
      for (const other of [
        config,
        { ...config, presentation: "fullScreen" as const },
        { ...config, presentation: "modal" as const },
      ]) {
        expect(thrown(() => createLucraClient(other)).code).toBe("INVALID_CONFIG");
      }
      first.destroy();
    });

    it("counts an omitted presentation as fullScreen", () => {
      const first = createLucraClient(config);
      expect(createLucraClient({ ...config, presentation: "fullScreen" })).toBe(first);
      first.destroy();
    });

    it("puts Lucra in the container instead of the body", () => {
      const added = { body: 0, container: 0 };
      const doc = (globalThis as unknown as { document: { body: { appendChild(): void } } })
        .document;
      doc.body.appendChild = () => {
        added.body += 1;
      };
      const container = {
        ...element(),
        appendChild() {
          added.container += 1;
        },
      };
      const client = createLucraClient({
        ...config,
        container: container as unknown as HTMLElement,
      });
      expect(added).toEqual({ body: 0, container: 1 });
      client.destroy();
    });

    it("adds nothing to the page for a config that is not a Lucra address", () => {
      const created: unknown[] = [];
      const doc = (globalThis as unknown as { document: { createElement: () => unknown } })
        .document;
      const original = doc.createElement;
      doc.createElement = () => {
        const made = original();
        created.push(made);
        return made;
      };
      const error = thrown(() => createLucraClient({ ...config, tenantId: "evil.example/" }));
      expect(error.code).toBe("INVALID_CONFIG");
      expect(created).toHaveLength(0);
      // Nothing was remembered, so a good config still makes a client.
      const client = createLucraClient({ ...config, tenantId: "Test-Tenant" });
      expect(created.length).toBeGreaterThan(0);
      client.destroy();
    });

    it("refuses a container that is not an element in the page, and adds nothing", () => {
      const added: string[] = [];
      const page = globalThis as unknown as {
        window: { addEventListener: (type: string) => void };
        document: { createElement: () => unknown };
      };
      page.window.addEventListener = (type) => added.push(`listener:${type}`);
      const original = page.document.createElement;
      page.document.createElement = () => {
        added.push("element");
        return original();
      };
      for (const [container, message] of [
        [{ ...element(), nodeType: 3 }, "element"], // a text node
        [{ ...element(), nodeType: 9 }, "element"], // a document
        [{ ...element(), isConnected: false }, "in the page"],
      ] as const) {
        const error = thrown(() => createLucraClient({ ...config, container } as never));
        expect(error.code).toBe("INVALID_CONFIG");
        // The detail is for the developer, so it is in the hint, not the message.
        expect(error.hint).toContain(message);
      }
      expect(added).toEqual([]);
      // Nothing was remembered, so a good config still makes a client.
      createLucraClient(config).destroy();
    });

    it("makes a new client after destroy", () => {
      const first = createLucraClient(config);
      first.destroy();
      const second = createLucraClient({ ...config, tenantId: "other" });
      expect(second).not.toBe(first);
      second.destroy();
      const third = createLucraClient(config);
      expect(third).not.toBe(first);
      third.destroy();
    });
  });
});
