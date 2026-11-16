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
      ["achievements", "auth", "destroy", "matchups", "on", "present", "tournaments", "whenConnected"]
    );
    expect(Object.keys(client.auth).sort()).toEqual(["getState", "isLoggedIn", "logout", "subscribe"]);
    expect(Object.keys(client.tournaments).sort()).toEqual(["autoJoin", "get", "join", "leaderboard", "list"]);
    expect(Object.keys(client.matchups).sort()).toEqual(["accept", "cancel", "create", "get", "getDetails", "watch"]);
    expect(Object.keys(client.achievements)).toEqual(["list"]);
    expect(Object.keys(client.present).sort()).toEqual(
      ["addFunds", "demographics", "dismiss", "kyc", "locationGrant", "login", "profile", "wallet", "withdraw"]
    );
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
    expect(await shown).toEqual({ status: "dismissed" });
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
    expect(await shown).toEqual({ status: "dismissed" });
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
      style: { cssText: "" },
      appendChild() {},
      remove() {},
      setAttribute() {},
      removeAttribute() {},
      focus() {},
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
        activeElement: null,
        createElement: element,
        addEventListener() {},
        removeEventListener() {},
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
      const doc = (globalThis as { document: { createElement: () => unknown } }).document;
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
