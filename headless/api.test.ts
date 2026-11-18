import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createApi, type Activity } from "./api.ts";
import { createAuth } from "./auth.ts";
import { LucraError } from "./errors.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";
import { HOME_PATH, buildUrl } from "./url.ts";

const urls = {
  config: { apiKey: "key-1", tenantId: "test-tenant", env: "sandbox" as const },
  parentOrigin: "https://host.example",
};
const USER = { id: "u1", username: "pat", balance: 25 };
const CREATE_INPUT = {
  gameTypeId: "game-1",
  atStake: { type: "CASH" as const, amount: 5 },
  playStyle: "FREE_FOR_ALL" as const,
};

function setup(overrides: Partial<Timeouts> = {}) {
  const frame = createFakeFrame();
  const timeouts = { ...DEFAULT_TIMEOUTS, ...overrides };
  const session = createSession({ frame, url: buildUrl(urls, HOME_PATH), timeouts });
  const auth = createAuth({ session, urls, timeouts });
  const activity: Activity = { screenOpen: false };
  const api = createApi({ session, auth, activity });
  return { frame, session, auth, activity, api };
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

describe("createApi: reads", () => {
  it("holds a call until connected, then sends it", async () => {
    const { frame, api } = setup();
    const list = api.tournaments.list();
    await tick();
    expect(count(frame, "tournamentsRequest")).toBe(0);
    await connectLoggedOut(frame);
    expect(frame.lastPosted("tournamentsRequest")?.body).toBeNull();
    frame.answer("tournamentsRequest", "tournamentsResponse", {
      tournaments: [{ matchupId: "t1" }],
    });
    expect(await list).toEqual([{ matchupId: "t1" }]);
  });

  it("lets public reads through while logged out", async () => {
    const { frame, api } = setup();
    await connectLoggedOut(frame);
    const matchup = api.matchups.get("m1");
    const details = api.matchups.getDetails("m1");
    await tick();
    expect(frame.lastPosted("matchupRequest")?.body).toEqual({ matchupId: "m1" });
    expect(frame.lastPosted("matchupDetailsRequest")?.body).toEqual({ matchupId: "m1" });
    frame.answer("matchupRequest", "matchupResponse", { id: "m1" });
    frame.answer("matchupDetailsRequest", "matchupDetailsResponse", { matchup: { id: "m1" } });
    expect<unknown>(await matchup).toEqual({ id: "m1" });
    expect<unknown>(await details).toEqual({ matchup: { id: "m1" } });
  });

  it("rejects reads that need login with NOT_LOGGED_IN and sends nothing", async () => {
    const { frame, api } = setup();
    await connectLoggedOut(frame);
    for (const call of [
      () => api.tournaments.get("t1"),
      () => api.tournaments.leaderboard("t1"),
      () => api.achievements.list(),
      () => api.matchups.searchByMetadata({}),
      () => api.rewards.list(),
      () => api.matchups.listMine({ limit: 5 }),
      () => api.matchups.listMineByTypeStatus({ type: "GAMES", status: "RESULTS", limit: 10, offset: 20 }),
    ]) {
      const error = await caught(call());
      expect(error.code).toBe("NOT_LOGGED_IN");
      expect(error.remediation).toBe("login");
    }
    expect(count(frame, "tournamentRequest")).toBe(0);
    expect(count(frame, "tournamentLeaderboardRequest")).toBe(0);
    expect(count(frame, "achievementsRequest")).toBe(0);
    expect(count(frame, "searchMatchupsByMetadataRequest")).toBe(0);
    expect(count(frame, "userTournamentRewardsRequest")).toBe(0);
    expect(count(frame, "userMatchupsRequest")).toBe(0);
    expect(count(frame, "userMatchupsByTypeStatusRequest")).toBe(0);
  });

  it("holds a read that needs login until loginSuccess, not just a yes", async () => {
    const { frame, api } = setup();
    frame.deliver("initialized", { success: true });
    frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: true });
    const get = api.tournaments.get("t1");
    await tick();
    expect(count(frame, "tournamentRequest")).toBe(0);
    frame.deliver("loginSuccess", USER);
    await tick();
    expect(frame.lastPosted("tournamentRequest")?.body).toEqual({ matchupId: "t1" });
    frame.answer("tournamentRequest", "tournamentResponse", { tournament: null });
    expect(await get).toBeNull();
  });

  it("unwraps tournament, leaderboard, and achievements answers", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const get = api.tournaments.get("t1");
    const board = api.tournaments.leaderboard("t1", { limit: 10, offset: 20 });
    const achievements = api.achievements.list();
    await tick();
    expect(frame.lastPosted("tournamentLeaderboardRequest")?.body).toEqual({
      matchupId: "t1",
      limit: 10,
      offset: 20,
    });
    expect(frame.lastPosted("achievementsRequest")?.body).toBeNull();
    frame.answer("tournamentRequest", "tournamentResponse", { tournament: { title: "Cup" } });
    frame.answer("tournamentLeaderboardRequest", "tournamentLeaderboardResponse", {
      ui_tournament_details: { title: "Cup", leaderboard: { rows: [] } },
    });
    frame.answer("achievementsRequest", "achievementsResponse", { achievements: [{ id: "a1" }] });
    expect<unknown>(await get).toEqual({ title: "Cup" });
    expect<unknown>(await board).toEqual({ title: "Cup", leaderboard: { rows: [] } });
    expect<unknown>(await achievements).toEqual([{ id: "a1" }]);
  });

  it("runs reads side by side, even during a write", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const join = api.tournaments.join("t1");
    const first = api.matchups.get("m1");
    const second = api.matchups.get("m2");
    await tick();
    expect(count(frame, "matchupRequest")).toBe(2);
    const [a, b] = frame.posted.filter((message) => message.type === "matchupRequest");
    frame.deliver("matchupResponse", { id: "m2" }, b.requestId);
    frame.deliver("matchupResponse", { id: "m1" }, a.requestId);
    expect<unknown>(await first).toEqual({ id: "m1" });
    expect<unknown>(await second).toEqual({ id: "m2" });
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
  });

  it("searches matchups by metadata and returns the ids", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const filters = {
      gameId: "g1",
      locationId: "l1",
      matchupId: "m1",
      matchupMetadata: { table: 4 },
    };
    const search = api.matchups.searchByMetadata(filters);
    await tick();
    expect(frame.lastPosted("searchMatchupsByMetadataRequest")?.body).toEqual(filters);
    frame.answer("searchMatchupsByMetadataRequest", "searchMatchupsByMetadataResponse", {
      matchupIds: ["m1", "m2"],
    });
    expect(await search).toEqual(["m1", "m2"]);
  });

  it("lists rewards, sending tournamentId as matchupId", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const filtered = api.rewards.list({ tournamentId: "t1", viewed: false, claimed: true });
    await tick();
    expect(frame.lastPosted("userTournamentRewardsRequest")?.body).toEqual({
      matchupId: "t1",
      viewed: false,
      claimed: true,
    });
    frame.answer("userTournamentRewardsRequest", "userTournamentRewardsResponse", {
      rewards: [{ rewardId: "r1" }],
    });
    expect<unknown>(await filtered).toEqual([{ rewardId: "r1" }]);
    const all = api.rewards.list();
    await tick();
    expect(frame.lastPosted("userTournamentRewardsRequest")?.body).toEqual({
      matchupId: undefined,
      viewed: undefined,
      claimed: undefined,
    });
    frame.answer("userTournamentRewardsRequest", "userTournamentRewardsResponse", { rewards: [] });
    expect(await all).toEqual([]);
  });

  it("lists the user's matchups and returns the answer as is", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const mine = api.matchups.listMine({ limit: 5 });
    await tick();
    expect(frame.lastPosted("userMatchupsRequest")?.body).toEqual({ limit: 5 });
    const answer = {
      matchup_types: [{ type: "GAMES", label: "Games" }],
      total_matchups_played: 2,
      total_matchups_won: 1,
      total_money_won: 10,
      user_matchups_by_type_status: [
        { type: "GAMES", status: "RESULTS", matchups: [{ id: "m1", name: "Test game" }] },
      ],
    };
    frame.answer("userMatchupsRequest", "userMatchupsResponse", answer);
    expect<unknown>(await mine).toEqual(answer);
  });

  it("lists one page of the user's matchups and returns the answer as is", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const options = { type: "GAMES" as const, status: "RESULTS" as const, limit: 10, offset: 20 };
    const page = api.matchups.listMineByTypeStatus(options);
    await tick();
    expect(frame.lastPosted("userMatchupsByTypeStatusRequest")?.body).toEqual(options);
    const answer = { type: "GAMES", status: "RESULTS", total_matchups: 21, matchups: [{ id: "m1" }] };
    frame.answer("userMatchupsByTypeStatusRequest", "userMatchupsByTypeStatusResponse", answer);
    expect<unknown>(await page).toEqual(answer);
  });

  it("rejects with CONNECTION_FAILED when Lucra refuses the config", async () => {
    const { frame, api } = setup();
    const list = caught(api.tournaments.list());
    frame.deliver("initialized", { success: false });
    expect((await list).code).toBe("CONNECTION_FAILED");
  });
});

describe("createApi: writes", () => {
  it("sends one write at a time across kinds, and frees the slot when it settles", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const join = api.tournaments.join("t1");
    const second = await caught(api.matchups.cancel("m1"));
    expect(second.code).toBe("IN_PROGRESS");
    expect(second.outcomeUnknown).toBe(false);
    await tick();
    expect(frame.lastPosted("joinTournamentRequest")?.body).toEqual({ matchupId: "t1" });
    expect(count(frame, "cancelRecreationalGameRequest")).toBe(0);
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    expect(await join).toEqual({ matchupId: "t1" });
    // Free as soon as the first write settles: no tick needed in between.
    const cancel = api.matchups.cancel("m1");
    await tick();
    expect(frame.lastPosted("cancelRecreationalGameRequest")?.body).toEqual({ matchupId: "m1" });
    frame.answer("cancelRecreationalGameRequest", "cancelRecreationalGameResponse", { matchupId: "m1" });
    expect(await cancel).toEqual({ matchupId: "m1" });
  });

  it("refuses a second write synchronously, before anything is sent", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const first = api.matchups.create(CREATE_INPUT);
    const second = api.matchups.create(CREATE_INPUT);
    expect((await caught(second)).code).toBe("IN_PROGRESS");
    await tick();
    expect(count(frame, "createRecreationalGameRequest")).toBe(1);
    expect(frame.lastPosted("createRecreationalGameRequest")?.body).toEqual(CREATE_INPUT);
    frame.answer("createRecreationalGameRequest", "createRecreationalGameResponse", {
      matchupId: "m1",
      matchup: null,
    });
    expect(await first).toEqual({ matchupId: "m1", matchup: null });
  });

  it("frees the slot when a gate rejects the write", async () => {
    const { frame, api } = setup();
    await connectLoggedOut(frame);
    expect((await caught(api.tournaments.join("t1"))).code).toBe("NOT_LOGGED_IN");
    expect((await caught(api.tournaments.join("t1"))).code).toBe("NOT_LOGGED_IN");
    expect(count(frame, "joinTournamentRequest")).toBe(0);
  });

  it("refuses a write while a screen is open", async () => {
    const { frame, activity, api } = setup();
    await connectLoggedIn(frame);
    activity.screenOpen = true;
    const error = await caught(api.tournaments.join("t1"));
    expect(error.code).toBe("SCREEN_OPEN");
    expect(error.outcomeUnknown).toBe(false);
    expect(count(frame, "joinTournamentRequest")).toBe(0);
    activity.screenOpen = false;
    const join = api.tournaments.join("t1");
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
    await join;
  });

  it("maps accept to the wire body", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const versus = api.matchups.accept("m1", { groupId: "g1" });
    await tick();
    expect(frame.lastPosted("acceptRecreationalGameRequest")?.body).toEqual({
      matchupId: "m1",
      playStyle: "GROUP_VS_GROUP",
      teamId: "g1",
    });
    frame.answer("acceptRecreationalGameRequest", "acceptRecreationalGameResponse", {
      matchupId: "m1",
      matchup: null,
    });
    await versus;
    const freeForAll = api.matchups.accept("m2");
    await tick();
    expect(frame.lastPosted("acceptRecreationalGameRequest")?.body).toEqual({
      matchupId: "m2",
      playStyle: "FREE_FOR_ALL",
    });
    frame.answer("acceptRecreationalGameRequest", "acceptRecreationalGameResponse", {
      matchupId: "m2",
      matchup: null,
    });
    await freeForAll;
  });

  it("sends autoJoin with a null body and returns the answer", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const autoJoin = api.tournaments.autoJoin();
    await tick();
    expect(frame.lastPosted("autoJoinTournamentsRequest")?.body).toBeNull();
    frame.answer("autoJoinTournamentsRequest", "autoJoinedTournaments", { matchupIds: ["t1"] });
    expect(await autoJoin).toEqual({ matchupIds: ["t1"] });
  });

  it("sends a claim, holds the write slot until it settles, and resolves with nothing", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const cases: [() => Promise<void>, string, string, object][] = [
      [() => api.rewards.claim("r1"), "claimTournamentRewardRequest", "claimTournamentRewardResponse", { rewardId: "r1" }],
      [() => api.achievements.claim("a1"), "claimAchievementRequest", "claimAchievementResponse", { userAchievementId: "a1" }],
    ];
    for (const [call, requestType, responseType, body] of cases) {
      const claim = call();
      expect((await caught(call())).code).toBe("IN_PROGRESS");
      await tick();
      expect(count(frame, requestType)).toBe(1);
      expect(frame.lastPosted(requestType)?.body).toEqual(body);
      frame.answer(requestType, responseType, body);
      expect(await claim).toBeUndefined();
      const join = api.tournaments.join("t1");
      await tick();
      frame.answer("joinTournamentRequest", "joinTournamentResponse", { matchupId: "t1" });
      await join;
    }
  });

  it("turns joinTournamentError into a LucraError that names the fix", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const join = caught(api.tournaments.join("t1"));
    await tick();
    frame.answer("joinTournamentRequest", "joinTournamentError", { code: "INSUFFICIENT_FUNDS" });
    const error = await join;
    expect(error.code).toBe("INSUFFICIENT_FUNDS");
    expect(error.remediation).toBe("addFunds");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("marks API_ERROR as outcome unknown on create, accept, cancel, but not on join, autoJoin, or a claim", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const cases: [() => Promise<unknown>, string, string, boolean][] = [
      [() => api.matchups.create(CREATE_INPUT), "createRecreationalGameRequest", "apiRequestError", true],
      [() => api.matchups.accept("m1"), "acceptRecreationalGameRequest", "apiRequestError", true],
      [() => api.matchups.cancel("m1"), "cancelRecreationalGameRequest", "apiRequestError", true],
      [() => api.tournaments.join("t1"), "joinTournamentRequest", "joinTournamentError", false],
      [() => api.tournaments.autoJoin(), "autoJoinTournamentsRequest", "autoJoinTournamentsError", false],
      [() => api.rewards.claim("r1"), "claimTournamentRewardRequest", "apiRequestError", false],
      [() => api.achievements.claim("a1"), "claimAchievementRequest", "apiRequestError", false],
    ];
    for (const [call, requestType, errorType, unknown] of cases) {
      const pending = caught(call());
      await tick();
      frame.answer(requestType, errorType, { code: "API_ERROR", message: "boom" });
      const error = await pending;
      expect(error.code).toBe("API_ERROR");
      expect(error.outcomeUnknown).toBe(unknown);
    }
  });

  it("reports NOT_FOUND and IN_PROGRESS from Lucra with a known outcome", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const cancel = caught(api.matchups.cancel("nope"));
    await tick();
    frame.answer("cancelRecreationalGameRequest", "apiRequestError", {
      code: "API_ERROR",
      message: "Recreational game matchup not found",
    });
    expect((await cancel).code).toBe("NOT_FOUND");
    expect((await cancel).outcomeUnknown).toBe(false);
    const create = caught(api.matchups.create(CREATE_INPUT));
    await tick();
    frame.answer("createRecreationalGameRequest", "apiRequestError", {
      code: "NOT_ALLOWED",
      message: "Another createRecreationalGame request is already in progress",
    });
    expect((await create).code).toBe("IN_PROGRESS");
  });

  it("times out a write with outcome unknown", async () => {
    const { frame, api } = setup({ requestMs: 20 });
    await connectLoggedIn(frame);
    const error = await caught(api.tournaments.join("t1"));
    expect(error.code).toBe("TIMEOUT");
    expect(error.outcomeUnknown).toBe(true);
    expect(frame.lastPosted("sdkDiagnostic")).toBeDefined();
  });

  it("rejects pending calls with CONNECTION_RESET when Lucra restarts", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    const read = caught(api.tournaments.list());
    const write = caught(api.tournaments.join("t1"));
    await tick();
    frame.deliver("initialized", { success: true });
    expect((await read).code).toBe("CONNECTION_RESET");
    expect((await read).outcomeUnknown).toBe(false);
    expect((await write).code).toBe("CONNECTION_RESET");
    expect((await write).outcomeUnknown).toBe(true);
  });

  it("whenWriteSettled resolves once the pending write is done, and never rejects", async () => {
    const { frame, api } = setup();
    await connectLoggedIn(frame);
    await api.whenWriteSettled();
    const join = caught(api.tournaments.join("t1"));
    let settled = false;
    const waiting = api.whenWriteSettled().then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false);
    frame.answer("joinTournamentRequest", "joinTournamentError", { code: "NOT_ALLOWED" });
    await join;
    await waiting;
    expect(settled).toBe(true);
  });

  it("rejects with DESTROYED after the session is destroyed", async () => {
    const { frame, session, api } = setup();
    await connectLoggedIn(frame);
    session.destroy();
    expect((await caught(api.tournaments.list())).code).toBe("DESTROYED");
    expect((await caught(api.tournaments.join("t1"))).code).toBe("DESTROYED");
  });
});
