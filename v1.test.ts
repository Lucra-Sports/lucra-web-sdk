import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { LucraClient } from "./v1.ts";
import { createPopup } from "./popup.ts";
import { LucraUserNotLoggedIn, LucraClientNotOpen, LucraApiError } from "./errors.ts";
import { LucraApiErrorCode } from "./types/types.ts";
import type { LucraV1ClientConstructor } from "./types/types.ts";

const baseConfig: LucraV1ClientConstructor = {
  apiKey: "test-api-key",
  tenantId: "test-tenant",
  env: "sandbox",
};

// Silence deprecation warnings (e.g. moveTo) and let tests assert on them.
let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  LucraClient.destroy();
});

// The tournament read methods await `_initializedPromise` before sending so they
// work before auth. Resolve it directly to let those reads proceed without
// triggering the login chain.
function markInitialized(client: LucraClient) {
  (client as any)._initializedPromise = Promise.resolve();
}

// Guarded methods need an iframe. bun test has no DOM, so stub one.
function markOpen(client: LucraClient) {
  (client as any).iframe = { remove: mock(() => {}), style: {} };
  return client;
}

// Yield a macrotask so the awaited `_initializedPromise` settles and the
// init-gated send fires.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

  it("delivers a locationGranted message to a registered listener with no payload", async () => {
    const client = LucraClient.initialize(baseConfig);
    const handler = mock(() => {});

    client.on("locationGranted", handler);
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "locationGranted", data: undefined },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0] ?? undefined).toBeUndefined();
  });

  const enableExitCalls = (sendMessage: any) =>
    sendMessage.mock.calls.filter(([m]: any[]) => m.type === "enableExitLucra");

  const initialized = (client: LucraClient) =>
    (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });

  it("re-enables exitLucra when the iframe initializes, for a listener registered before open", async () => {
    const client = LucraClient.initialize(baseConfig);
    expect(() => client.on("exitLucra", () => {})).not.toThrow();
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    await initialized(client);

    expect(enableExitCalls(sendMessage)).toEqual([
      [{ type: "enableExitLucra", body: true }],
    ]);
  });

  it("re-enables exitLucra on each initialize, so it survives an iframe reload", async () => {
    const client = LucraClient.initialize(baseConfig);
    client.on("exitLucra", () => {});
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    await initialized(client);
    await initialized(client);

    expect(enableExitCalls(sendMessage)).toHaveLength(2);
  });

  it("does not send enableExitLucra on initialize without an exitLucra listener", async () => {
    const client = LucraClient.initialize(baseConfig);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    await initialized(client);

    expect(enableExitCalls(sendMessage)).toHaveLength(0);
  });

  it("does not send enableExitLucra on initialize after the listener is removed", async () => {
    const client = LucraClient.initialize(baseConfig);
    const handler = () => {};
    client.on("exitLucra", handler);
    client.off("exitLucra", handler);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    await initialized(client);

    expect(enableExitCalls(sendMessage)).toHaveLength(0);
  });
});

describe("LucraClient.api.tournaments", () => {
  it("posts a tournamentsRequest message to the iframe", async () => {
    const client = LucraClient.initialize(baseConfig);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;
    markInitialized(client);

    client.api.tournaments().catch(() => {});
    await flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "tournamentsRequest",
      body: null,
    });
  });

  it("resolves with the data when a tournamentsResponse message arrives", async () => {
    const client = LucraClient.initialize(baseConfig);
    markInitialized(client);
    const promise = client.api.tournaments();
    await flush();
    const data = {
      tournaments: [
        {
          matchupId: "abc",
          canJoinTournament: true,
          matchup: {
            starts_at: "2026-06-23T12:00:00Z",
            expires_at: "2026-06-24T12:00:00Z",
            pool_tournament_details: {
              game_id: "game-1",
              title: "Daily Showdown",
              buy_in_amount: 5,
              icon_url: "https://example.com/icon.png",
              type: "CASH_FIXED",
            },
            pool_payout_reward_structures: [
              { place: 1, value: 100, type: "CASH_FIXED" },
            ],
            pool_tournament_leaderboard_aggregate: {
              aggregate: { count: 42 },
            },
          },
        },
      ],
    };

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "tournamentsResponse", data },
    });

    expect(await promise).toEqual(data);
  });

  it("rejects an in-flight request when a new request is made", async () => {
    const client = LucraClient.initialize(baseConfig);
    markInitialized(client);
    const first = client.api.tournaments();
    client.api.tournaments().catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new tournaments request");
  });

  it("fetches tournaments without a logged-in user once the iframe is initialized", async () => {
    const client = LucraClient.initialize(baseConfig);
    // A pre-auth consumer never awaits `ready`; the internal guard in
    // `_createReadyPromise` keeps its logged-out rejection from going unhandled.
    const promise = client.api.tournaments();

    // The embedded app finishes initializing, but the user is not logged in.
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "isLoggedInResponse", data: { isLoggedIn: false } },
    });

    const data = { tournaments: [] };
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "tournamentsResponse", data },
    });

    expect(await promise).toEqual(data);
  });

  it("rejects when the iframe fails to initialize", async () => {
    const client = LucraClient.initialize(baseConfig);
    const promise = client.api.tournaments();

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: false } },
    });

    await expect(promise).rejects.toEqual({ success: false });
  });
});

describe("LucraClient.api.joinTournament", () => {
  it("posts a joinTournamentRequest message to the iframe", () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    client.api.joinTournament("some-id").catch(() => {});

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "joinTournamentRequest",
      body: { matchupId: "some-id" },
    });
  });

  it("resolves with the data when a joinTournamentResponse message arrives", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.joinTournament("some-id");
    const data = { matchupId: "some-id" };

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "joinTournamentResponse", data },
    });

    expect(await promise).toEqual(data);
  });

  it("rejects an in-flight request when a new request is made", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const first = client.api.joinTournament("some-id");
    client.api.joinTournament("some-id").catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new joinTournament request");
  });

  it("rejects with a typed LucraApiError when a joinTournamentError message arrives", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.joinTournament("some-id");

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: {
        type: "joinTournamentError",
        data: { code: "INSUFFICIENT_FUNDS", message: "Not enough funds" },
      },
    });

    let caught: unknown;
    await promise.catch((e) => {
      caught = e;
    });
    expect(caught).toBeInstanceOf(LucraApiError);
    expect((caught as LucraApiError).code).toBe(
      LucraApiErrorCode.insufficientFunds
    );
    expect((caught as LucraApiError).message).toBe("Not enough funds");
  });

  it("surfaces each error code with a default message when none is provided", async () => {
    const codes = [
      LucraApiErrorCode.unverified,
      LucraApiErrorCode.insufficientFunds,
      LucraApiErrorCode.demographicInformationMissing,
      LucraApiErrorCode.locationError,
      LucraApiErrorCode.locationNeeded,
      LucraApiErrorCode.apiError,
    ];

    for (const code of codes) {
      const client = markOpen(LucraClient.initialize(baseConfig));
      const promise = client.api.joinTournament("some-id");

      await (client as any)._eventListener({
        origin: "https://test-tenant.sandbox.lucrasports.com",
        data: { type: "joinTournamentError", data: { code } },
      });

      let caught: any;
      await promise.catch((e) => {
        caught = e;
      });
      expect(caught).toBeInstanceOf(LucraApiError);
      expect(caught.code).toBe(code);
      expect(typeof caught.message).toBe("string");
      expect(caught.message.length).toBeGreaterThan(0);

      LucraClient.destroy();
    }
  });
});

describe("LucraClient autoJoin", () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("declares autoJoin=true on the iframe url by default", () => {
    restore = installFakeWindow().restore;
    const client = LucraClient.initialize(baseConfig);
    const url = (client as any)._buildIframeUrl({});

    expect(url.searchParams.get("autoJoin")).toBe("true");
  });

  it("passes autoJoin=false to the embedded app when opted out", () => {
    restore = installFakeWindow().restore;
    const client = LucraClient.initialize({ ...baseConfig, autoJoin: false });
    const url = (client as any)._buildIframeUrl({});

    expect(url.searchParams.get("autoJoin")).toBe("false");
  });
});

describe("LucraClient.api.autoJoinTournaments", () => {
  it("posts an autoJoinTournamentsRequest message to the iframe", () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    client.api.autoJoinTournaments().catch(() => {});

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "autoJoinTournamentsRequest",
      body: null,
    });
  });

  it("resolves with the tournament ids when an autoJoinedTournaments message arrives", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.autoJoinTournaments();
    const data = { matchupIds: ["a", "b"] };

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "autoJoinedTournaments", data },
    });

    expect(await promise).toEqual(data);
  });

  it("resolves with an empty list, which is not an error", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.autoJoinTournaments();

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "autoJoinedTournaments", data: { matchupIds: [] } },
    });

    expect(await promise).toEqual({ matchupIds: [] });
  });

  it("fires the autoJoinedTournaments listener as well as resolving the request", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const listener = mock(() => {});
    client.on("autoJoinedTournaments", listener);
    const promise = client.api.autoJoinTournaments();

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "autoJoinedTournaments", data: { matchupIds: ["a"] } },
    });

    await promise;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ matchupIds: ["a"] });
  });

  it("rejects with a typed LucraApiError when an autoJoinTournamentsError arrives", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.autoJoinTournaments();

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: {
        type: "autoJoinTournamentsError",
        data: { code: "LOCATION_NEEDED", message: "Location not granted" },
      },
    });

    let caught: unknown;
    await promise.catch((e) => {
      caught = e;
    });
    expect(caught).toBeInstanceOf(LucraApiError);
    expect((caught as LucraApiError).code).toBe(LucraApiErrorCode.locationNeeded);
    expect((caught as LucraApiError).message).toBe("Location not granted");
  });

  it("does not fire the autoJoinedTournaments listener on an error message", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const listener = mock(() => {});
    client.on("autoJoinedTournaments", listener);
    client.api.autoJoinTournaments().catch(() => {});

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "autoJoinTournamentsError", data: { code: "API_ERROR" } },
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("fires the listener for the automatic trigger, with no request pending", async () => {
    const client = LucraClient.initialize(baseConfig);
    const listener = mock(() => {});
    client.on("autoJoinedTournaments", listener);

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "autoJoinedTournaments", data: { matchupIds: ["a"] } },
    });

    expect(listener).toHaveBeenCalledWith({ matchupIds: ["a"] });
  });
});

describe("LucraClient.api.tournament", () => {
  it("posts a tournamentRequest message with the matchupId", () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    client.api.tournament("abc").catch(() => {});

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "tournamentRequest",
      body: { matchupId: "abc" },
    });
  });

  it("resolves with the data when a tournamentResponse message arrives", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.tournament("abc");
    const data = {
      tournament: {
        title: "Daily Showdown",
        status: "active",
        buy_in_amount: 5,
        free_buy_in: false,
        is_completed: false,
        is_expired: false,
        is_not_started: false,
        is_private: false,
        total_participants: 11,
        earned_rewards: [],
        notices: [],
        terms: [],
        payout_structure: {
          title: "Prize Pool",
          description: "",
          no_payout: false,
          is_percentage_payout: false,
          show_amount: true,
          jackpot_amount: "1000",
          rewards: [{ place: 1, value: 100 }],
        },
      },
    };

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "tournamentResponse", data },
    });

    expect(await promise).toEqual(data);
  });

  it("rejects an in-flight request when a new request is made", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const first = client.api.tournament("abc");
    client.api.tournament("def").catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new tournament request");
  });
});

describe("LucraClient.api.tournamentLeaderboard", () => {
  it("posts a tournamentLeaderboardRequest message with the matchupId and pagination", () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    client.api.tournamentLeaderboard("abc", { limit: 20, offset: 40 }).catch(() => {});

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "tournamentLeaderboardRequest",
      body: { matchupId: "abc", limit: 20, offset: 40 },
    });
  });

  it("resolves with the page when a tournamentLeaderboardResponse message arrives", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const promise = client.api.tournamentLeaderboard("abc", { limit: 2, offset: 0 });
    const data = {
      ui_tournament_details: {
        title: "Daily Showdown",
        status: "active",
        free_buy_in: false,
        is_completed: false,
        is_expired: false,
        is_not_started: false,
        is_private: false,
        earned_rewards: [],
        notices: [],
        terms: [],
        leaderboard: {
          columns: [
            { name: "rank", label: "Rank" },
            { name: "points", label: "Points" },
          ],
          rows: [
            { userId: "u1", rank: 1, name: "Jason I", points: "6", payout: "$50" },
            { userId: "u2", rank: 2, name: "Sara R", points: "4", payout: "$30" },
          ],
          pagination: { limit: 2, offset: 0, total_count: 11 },
        },
        user_leaderboard_row: {
          userId: "u2",
          rank: 2,
          name: "Sara R",
          points: "4",
          payout: "$30",
        },
      },
    };

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "tournamentLeaderboardResponse", data },
    });

    expect(await promise).toEqual(data);
  });

  it("rejects an in-flight request when a new request is made", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const first = client.api.tournamentLeaderboard("abc", { offset: 0 });
    client.api.tournamentLeaderboard("abc", { offset: 20 }).catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new tournamentLeaderboard request");
  });
});

describe("LucraClient.ready", () => {
  it("sends an isLoggedInRequest once initialization succeeds", async () => {
    const client = LucraClient.initialize(baseConfig);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;
    client.ready.catch(() => {});

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: "isLoggedInRequest",
      body: null,
    });
  });

  it("resolves when initialized and the user is logged in", async () => {
    const client = LucraClient.initialize(baseConfig);
    const ready = client.ready;

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "isLoggedInResponse", data: { isLoggedIn: true } },
    });

    await expect(ready).resolves.toBeUndefined();
  });

  it("rejects with LucraUserNotLoggedIn when the user is not logged in", async () => {
    const client = LucraClient.initialize(baseConfig);
    const ready = client.ready;

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "isLoggedInResponse", data: { isLoggedIn: false } },
    });

    await expect(ready).rejects.toBeInstanceOf(LucraUserNotLoggedIn);
  });

  it("rejects when initialization fails", async () => {
    const client = LucraClient.initialize(baseConfig);
    const ready = client.ready;

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: false } },
    });

    await expect(ready).rejects.toEqual({ success: false });
  });

  it("resolves after loginSuccess when the user was previously logged out", async () => {
    const client = LucraClient.initialize(baseConfig);
    const initial = client.ready;

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "isLoggedInResponse", data: { isLoggedIn: false } },
    });

    await expect(initial).rejects.toBeInstanceOf(LucraUserNotLoggedIn);

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "loginSuccess", data: {} },
    });

    const afterLogin = client.ready;

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "isLoggedInResponse", data: { isLoggedIn: true } },
    });

    await expect(afterLogin).resolves.toBeUndefined();
  });

  it("does not surface the cancellation when loginSuccess supersedes an in-flight isLoggedIn request", async () => {
    const client = LucraClient.initialize(baseConfig);
    const initial = client.ready;

    // Initialization completes, kicking off the first isLoggedIn request.
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "initialized", data: { success: true } },
    });

    // Before it responds, loginSuccess rebuilds `ready`, issuing a new
    // isLoggedIn request that cancels the in-flight one.
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "loginSuccess", data: {} },
    });

    // The authenticated response arrives for the superseding request.
    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "isLoggedInResponse", data: { isLoggedIn: true } },
    });

    // The originally-awaited promise reflects the real result, not the
    // transient cancellation.
    await expect(initial).resolves.toBeUndefined();
  });
});

const LUCRA_ORIGIN = "https://test-tenant.sandbox.lucrasports.com";

type FakeWin = { closed: boolean; close: ReturnType<typeof mock> };

// bun test has no DOM, so stub the globals popup() touches: window.open (returns
// a fake popup window, or null to simulate a blocked popup), location.origin
// (the parentUrl the SDK posts), screen/inner sizing, and add/removeEventListener.
function installFakeWindow(opts: { blocked?: boolean } = {}) {
  const fakeWin: FakeWin = {
    closed: false,
    close: mock(() => {
      fakeWin.closed = true;
    }),
  };
  const open = mock(() => (opts.blocked ? null : fakeWin));
  const original = (globalThis as any).window;
  (globalThis as any).window = {
    open,
    location: { origin: "https://client.example.com" },
    screenX: 0,
    screenY: 0,
    innerWidth: 1000,
    innerHeight: 1000,
    addEventListener: mock(() => {}),
    removeEventListener: mock(() => {}),
  };
  return {
    fakeWin,
    open,
    restore: () => {
      (globalThis as any).window = original;
    },
  };
}

describe("LucraClient.popup().deposit", () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("opens a popup window to the add-funds URL carrying apiKey and parentUrl", () => {
    const w = installFakeWindow();
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    client.popup().deposit();

    expect(w.open).toHaveBeenCalledTimes(1);
    const url = new URL(w.open.mock.calls[0][0] as string);
    expect(url.origin).toBe(LUCRA_ORIGIN);
    expect(url.pathname).toBe("/app/add-funds");
    expect(url.searchParams.get("apiKey")).toBe("test-api-key");
    expect(url.searchParams.get("parentUrl")).toBe("https://client.example.com");
  });

  it("throws when the browser blocks the popup", () => {
    const w = installFakeWindow({ blocked: true });
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    expect(() => client.popup().deposit()).toThrow("Unable to open the Lucra popup");
  });

  it("close() closes the opened window and fires onClose", () => {
    const w = installFakeWindow();
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    const popup = client.popup().deposit();
    const onClose = mock(() => {});
    popup.onClose(onClose);

    popup.close();

    expect(w.fakeWin.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(undefined);
  });

  it("routes a LucraPopupMessage to onClose with the result and closes the window", async () => {
    const w = installFakeWindow();
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    const popup = client.popup().deposit();
    const onClose = mock(() => {});
    popup.onClose(onClose);

    await (client as any)._eventListener({
      origin: LUCRA_ORIGIN,
      data: {
        type: "LucraPopupMessage",
        toastType: "success",
        message: "Funds deposit successful",
      },
    });

    expect(w.fakeWin.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({
      toastType: "success",
      message: "Funds deposit successful",
    });
  });

  it("ignores a LucraPopupMessage from a foreign origin", async () => {
    const w = installFakeWindow();
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    const popup = client.popup().deposit();
    const onClose = mock(() => {});
    popup.onClose(onClose);

    await (client as any)._eventListener({
      origin: "https://evil.example.com",
      data: { type: "LucraPopupMessage", toastType: "success", message: "x" },
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(w.fakeWin.close).not.toHaveBeenCalled();
  });

  it("ignores a malformed LucraPopupMessage (no valid toastType)", async () => {
    const w = installFakeWindow();
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    const popup = client.popup().deposit();
    const onClose = mock(() => {});
    popup.onClose(onClose);

    await (client as any)._eventListener({
      origin: LUCRA_ORIGIN,
      data: { type: "LucraPopupMessage", message: "Funds deposit successful" },
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(w.fakeWin.close).not.toHaveBeenCalled();
  });
});

describe("LucraClient location grant navigation", () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  // Navigation happens by message against an already-open iframe. bun test has no
  // DOM, so stub the iframe to pass the open guard and capture the sent message.
  function openedClient() {
    const client = LucraClient.initialize(baseConfig);
    (client as any).iframe = { remove: mock(() => {}) };
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;
    return { client, sendMessage };
  }

  function navigatedPathname(sendMessage: any) {
    const message = sendMessage.mock.calls[0][0];
    expect(message.type).toBe("navigate");
    return new URL(message.body.pathname, LUCRA_ORIGIN).pathname;
  }

  it("redirect().locationGrant() navigates the iframe to app/location-grant", () => {
    const w = installFakeWindow();
    restore = w.restore;
    const { client, sendMessage } = openedClient();

    client.redirect().locationGrant();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(navigatedPathname(sendMessage)).toBe("/app/location-grant");
  });

  it("dialog().locationGrant() presents a dialog and navigates to app/location-grant", () => {
    const w = installFakeWindow();
    restore = w.restore;
    const { client, sendMessage } = openedClient();
    const handle = { close: mock(() => {}), onClose: mock(() => {}) };
    // Presenting styles the host element, which needs a DOM; run the navigation
    // the dialog would perform and hand back a stub handle.
    (client as any)._presentDialog = mock((navigate: () => unknown) => {
      navigate();
      return handle;
    });

    const dialog = client.dialog().locationGrant();

    expect(dialog).toBe(handle);
    expect(navigatedPathname(sendMessage)).toBe("/app/location-grant");
  });

  it("redirect().locationGrant() throws when the client is not open", () => {
    const w = installFakeWindow();
    restore = w.restore;
    const client = LucraClient.initialize(baseConfig);

    expect(() => client.redirect().locationGrant()).toThrow(
      "Cannot redirect. LucraClient is not open."
    );
    expect(() => client.redirect().locationGrant()).toThrow(LucraClientNotOpen);
  });
});

describe("LucraClientNotOpen", () => {
  it("is a named Error with a default message", () => {
    const error = new LucraClientNotOpen();
    expect(error.name).toBe("LucraClientNotOpen");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LucraClientNotOpen);
    expect(error.message).toBe(
      "LucraClient is not open. Call client.open(element) first."
    );
  });

  it("each guarded sendMessage.* throws before open and posts nothing", () => {
    const client = LucraClient.initialize(baseConfig);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;
    const calls: Array<() => void> = [
      () => client.sendMessage.userUpdated({} as any),
      () => client.sendMessage.enableConvertToCredit(),
      () => client.sendMessage.navigate({ pathname: "/app/home" }),
      () => client.sendMessage.availableRewards({ rewards: [] }),
    ];

    for (const call of calls) {
      expect(call).toThrow(LucraClientNotOpen);
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reply sendMessage.* methods do not throw when not open", () => {
    const client = LucraClient.initialize(baseConfig);

    expect(() =>
      client.sendMessage.deepLinkResponse({ url: "https://x.test" })
    ).not.toThrow();
    expect(() =>
      client.sendMessage.convertToCreditResponse({} as any)
    ).not.toThrow();
  });

  it("hide(), show(), and moveTo() throw before open", () => {
    const client = LucraClient.initialize(baseConfig);
    const element = { appendChild: mock(() => {}) } as any;

    expect(() => client.hide()).toThrow(LucraClientNotOpen);
    expect(() => client.show()).toThrow(LucraClientNotOpen);
    expect(() => client.moveTo(element)).toThrow(LucraClientNotOpen);
    expect(element.appendChild).not.toHaveBeenCalled();
  });

  it("hide(), show(), and moveTo() act on the iframe when open", () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const iframe = (client as any).iframe;
    const element = { appendChild: mock(() => {}) } as any;

    client.hide();
    expect(iframe.style.display).toBe("none");
    client.show();
    expect(iframe.style.display).toBe("block");
    expect(client.moveTo(element)).toBe(client);
    expect(element.appendChild).toHaveBeenCalledWith(iframe);
  });

  it("each guarded api.* rejects before open and posts nothing", async () => {
    const client = LucraClient.initialize(baseConfig);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;
    const calls: Array<() => Promise<unknown>> = [
      () => client.api.achievements(),
      () => client.api.tournament("abc"),
      () => client.api.tournamentLeaderboard("abc"),
      () => client.api.joinTournament("abc"),
      () => client.api.autoJoinTournaments(),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(LucraClientNotOpen);
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("logout() and dialog() throw before open, with the open() hint", () => {
    const client = LucraClient.initialize(baseConfig);

    expect(() => client.logout()).toThrow(LucraClientNotOpen);
    expect(() => client.logout()).toThrow(
      "Cannot redirect. LucraClient is not open. Call client.open(element) first."
    );
    expect(() => client.dialog().home()).toThrow(LucraClientNotOpen);
    expect(() => client.dialog().home()).toThrow(
      "Cannot open a dialog. LucraClient is not open. Call client.open(element) first."
    );
  });

  it("guarded methods throw or reject after close()", async () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    client.close();

    expect(() => client.hide()).toThrow(LucraClientNotOpen);
    expect(() => client.sendMessage.navigate({ pathname: "/app/home" })).toThrow(
      LucraClientNotOpen
    );
    await expect(client.api.joinTournament("abc")).rejects.toBeInstanceOf(
      LucraClientNotOpen
    );
  });
});

describe("LucraClient deprecations", () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  function openedClient() {
    restore = installFakeWindow().restore;
    const client = markOpen(LucraClient.initialize(baseConfig));
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;
    return { client, sendMessage };
  }

  const navigatedPathname = (sendMessage: any) =>
    new URL(sendMessage.mock.calls[0][0].body.pathname, LUCRA_ORIGIN).pathname;

  it("moveTo() still re-parents the iframe and warns once", () => {
    const client = markOpen(LucraClient.initialize(baseConfig));
    const element = { appendChild: mock(() => {}) } as any;

    client.moveTo(element);
    client.moveTo(element);

    expect(element.appendChild).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("moveTo() is deprecated");
  });

  it("redirect().deposit() still navigates to app/add-funds and warns once", () => {
    const { client, sendMessage } = openedClient();

    client.redirect().deposit();
    client.redirect().deposit();

    expect(navigatedPathname(sendMessage)).toBe("/app/add-funds");
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      "deposit() on open(), redirect(), and dialog() is deprecated"
    );
  });

  it("open().deposit() on an open client navigates to app/add-funds and warns", () => {
    const { client, sendMessage } = openedClient();

    client.open({} as HTMLElement).deposit();

    expect(navigatedPathname(sendMessage)).toBe("/app/add-funds");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("dialog().deposit() warns and shares the deposit key with redirect()", () => {
    const { client, sendMessage } = openedClient();
    // Presenting styles the host element, which needs a DOM; run the navigation
    // the dialog would perform and hand back a stub handle.
    (client as any)._presentDialog = mock((navigate: () => unknown) => {
      navigate();
      return { close: mock(() => {}), onClose: mock(() => {}) };
    });

    client.dialog().deposit();
    expect(warn).toHaveBeenCalledTimes(1);

    client.redirect().deposit();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn for non-deprecated calls", () => {
    const { client } = openedClient();

    client.redirect().wallet();
    client.hide();
    client.popup().deposit();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createPopup", () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("fires onClose(undefined) when the user closes the window (polling)", async () => {
    const w = installFakeWindow();
    restore = w.restore;

    const popup = createPopup("https://test-tenant.sandbox.lucrasports.com/app/add-funds", 5);
    const onClose = mock(() => {});
    popup.onClose(onClose);

    // User closes the popup; polling should observe it and fire onClose.
    w.fakeWin.closed = true;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(undefined);
  });
});
