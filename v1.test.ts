import { describe, it, expect, afterEach, mock } from "bun:test";
import { LucraClient } from "./v1.ts";
import { LucraUserNotLoggedIn } from "./errors.ts";
import type { LucraV1ClientConstructor } from "./types/types.ts";

const baseConfig: LucraV1ClientConstructor = {
  apiKey: "test-api-key",
  tenantId: "test-tenant",
  env: "sandbox",
};

afterEach(() => {
  LucraClient.destroy();
});

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
});

describe("LucraClient.api.tournaments", () => {
  it("posts a tournamentsRequest message to the iframe", () => {
    const client = LucraClient.initialize(baseConfig);
    const sendMessage = mock(() => {});
    (client as any)._sendMessage = sendMessage;

    client.api.tournaments().catch(() => {});

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "tournamentsRequest",
      body: null,
    });
  });

  it("resolves with the data when a tournamentsResponse message arrives", async () => {
    const client = LucraClient.initialize(baseConfig);
    const promise = client.api.tournaments();
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
    const first = client.api.tournaments();
    client.api.tournaments().catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new tournaments request");
  });
});

describe("LucraClient.api.joinTournament", () => {
  it("posts a joinTournamentRequest message to the iframe", () => {
    const client = LucraClient.initialize(baseConfig);
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
    const client = LucraClient.initialize(baseConfig);
    const promise = client.api.joinTournament("some-id");
    const data = { matchupId: "some-id" };

    await (client as any)._eventListener({
      origin: "https://test-tenant.sandbox.lucrasports.com",
      data: { type: "joinTournamentResponse", data },
    });

    expect(await promise).toEqual(data);
  });

  it("rejects an in-flight request when a new request is made", async () => {
    const client = LucraClient.initialize(baseConfig);
    const first = client.api.joinTournament("some-id");
    client.api.joinTournament("some-id").catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new joinTournament request");
  });
});

describe("LucraClient.api.tournament", () => {
  it("posts a tournamentRequest message with the matchupId", () => {
    const client = LucraClient.initialize(baseConfig);
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
    const client = LucraClient.initialize(baseConfig);
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
    const client = LucraClient.initialize(baseConfig);
    const first = client.api.tournament("abc");
    client.api.tournament("def").catch(() => {});

    await expect(first).rejects.toBe("Cancelled by new tournament request");
  });
});

describe("LucraClient.api.tournamentLeaderboard", () => {
  it("posts a tournamentLeaderboardRequest message with the matchupId and pagination", () => {
    const client = LucraClient.initialize(baseConfig);
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
    const client = LucraClient.initialize(baseConfig);
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
    const client = LucraClient.initialize(baseConfig);
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
