import { afterEach, describe, expect, it, mock } from "bun:test";
import { LucraClient } from "./v1.ts";
import { LucraApiError } from "./errors.ts";
import { LucraApiErrorCode } from "./types/types.ts";
import type {
  LucraMatchupDetails,
  LucraMatchupStatus,
  LucraV1ClientConstructor,
} from "./types/types.ts";

const baseConfig: LucraV1ClientConstructor = {
  apiKey: "test-api-key",
  tenantId: "test-tenant",
  env: "sandbox",
};

afterEach(() => LucraClient.destroy());

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function openClient() {
  const client = LucraClient.initialize(baseConfig);
  (client as any).iframe = { remove: mock(() => {}), style: {} };
  (client as any)._initializedPromise = Promise.resolve();
  const sendMessage = mock((_message: any) => {});
  (client as any)._sendMessage = sendMessage;
  return { client, sendMessage };
}

const deliver = (client: LucraClient, data: Record<string, unknown>) =>
  (client as any)._eventListener({
    origin: "https://test-tenant.sandbox.lucrasports.com",
    data,
  });

function details(
  status: LucraMatchupStatus,
  groups: Array<{ id: string; userIds: string[]; outcome?: "WIN" | "LOSS" | "TIE" }>,
  playStyle: "GROUP_VS_GROUP" | "FREE_FOR_ALL" = "GROUP_VS_GROUP"
): LucraMatchupDetails {
  return {
    matchup: {
      id: "m1",
      status,
      playStyle,
      isPublic: false,
      creatorId: "u1",
      game: { gameId: "g", name: "Game" },
      atStake: { type: "CASH", amount: 1 },
      participantGroups: groups.map(({ id, userIds }) => ({ id, userIds })),
    },
    groups: groups.map(({ id, outcome }) => ({ id, outcome, participants: [] })),
    participantScores: [],
  };
}

describe("matchupJoined and matchupSettled", () => {
  async function subscribed() {
    const { client, sendMessage } = openClient();
    const joined: unknown[] = [];
    const settled: unknown[] = [];
    client.on("matchupJoined", (e) => joined.push(e));
    client.on("matchupSettled", (e) => settled.push(e));
    const promise = client.api.subscribeToMatchupDetails("m1");
    await flush();
    await deliver(client, {
      type: "subscribeMatchupDetailsResponse",
      data: details("OPEN", [
        { id: "g1", userIds: ["u1"] },
        { id: "g2", userIds: [] },
      ]),
      requestId: sendMessage.mock.calls[0][0].requestId,
    });
    await promise;
    const update = (d: LucraMatchupDetails) =>
      deliver(client, { type: "matchupDetailsUpdated", data: d });
    return { joined, settled, update };
  }

  it("fires matchupJoined once per new user, not for the users in the first details", async () => {
    const { joined, update } = await subscribed();
    await update(details("OPEN", [{ id: "g1", userIds: ["u1"] }, { id: "g2", userIds: ["u2"] }]));
    await update(details("OPEN", [{ id: "g1", userIds: ["u1"] }, { id: "g2", userIds: ["u2"] }]));
    expect(joined).toEqual([{ matchupId: "m1", userId: "u2", groupId: "g2" }]);
  });

  it("fires matchupSettled once with the winning group", async () => {
    const { settled, update } = await subscribed();
    const done = details("CLOSED", [
      { id: "g1", userIds: ["u1"], outcome: "WIN" },
      { id: "g2", userIds: ["u2"], outcome: "LOSS" },
    ]);
    await update(done);
    await update(done);
    expect(settled).toEqual([{ matchupId: "m1", status: "CLOSED", winningGroupIds: ["g1"] }]);
  });

  it("reports a cancel as settled with no winners", async () => {
    const { settled, update } = await subscribed();
    await update(details("CANCELED_TIMEOUT", [{ id: "g1", userIds: ["u1"] }]));
    expect(settled).toEqual([
      { matchupId: "m1", status: "CANCELED_TIMEOUT", winningGroupIds: [] },
    ]);
  });
});

describe("api.acceptVersusRecreationalGameAsOpponent", () => {
  async function run(d: LucraMatchupDetails) {
    const { client, sendMessage } = openClient();
    const call = client.api.acceptVersusRecreationalGameAsOpponent("m1");
    // Attached now: the rejecting cases reject before the test awaits.
    const promise = call.then((v) => v, (e) => Promise.reject(e));
    promise.catch(() => {});
    call.catch(() => {});
    await flush();
    const read = sendMessage.mock.calls[0][0];
    expect(read.type).toBe("matchupDetailsRequest");
    await deliver(client, { type: "matchupDetailsResponse", data: d, requestId: read.requestId });
    await flush();
    return { promise, sendMessage };
  }

  it("accepts into the first empty group", async () => {
    const { sendMessage } = await run(
      details("OPEN", [{ id: "g1", userIds: ["u1"] }, { id: "g2", userIds: [] }])
    );
    const accept = sendMessage.mock.calls[1][0];
    expect(accept.type).toBe("acceptRecreationalGameRequest");
    expect(accept.body).toEqual({ matchupId: "m1", playStyle: "GROUP_VS_GROUP", teamId: "g2" });
  });

  it("rejects NOT_ALLOWED when every group is taken", async () => {
    const { promise } = await run(
      details("OPEN", [{ id: "g1", userIds: ["u1"] }, { id: "g2", userIds: ["u2"] }])
    );
    const error = await promise.catch((e) => e);
    expect(error).toBeInstanceOf(LucraApiError);
    expect(error.code).toBe(LucraApiErrorCode.notAllowed);
  });

  it("rejects INVALID_PLAY_STYLE for free for all", async () => {
    const { promise } = await run(details("OPEN", [{ id: "g1", userIds: ["u1"] }], "FREE_FOR_ALL"));
    const error = await promise.catch((e) => e);
    expect(error.code).toBe(LucraApiErrorCode.invalidPlayStyle);
  });
});

describe("new reads and writes", () => {
  const cases: Array<[string, (c: LucraClient) => Promise<unknown>, string, string, unknown]> = [
    ["gameTypes", (c) => c.api.gameTypes(), "gameTypesRequest", "gameTypesResponse", undefined],
    ["minigames", (c) => c.api.minigames(), "minigamesRequest", "minigamesResponse", undefined],
    [
      "userMatchups",
      (c) => c.api.userMatchups({ filter: "ALL", limit: 5 }),
      "userMatchupsRequest",
      "userMatchupsResponse",
      { filter: "ALL", limit: 5 },
    ],
    [
      "submitTournamentScore",
      (c) => c.api.submitTournamentScore({ matchupId: "t1", score: 42 }),
      "submitTournamentScoreRequest",
      "submitTournamentScoreResponse",
      { matchupId: "t1", score: 42 },
    ],
    [
      "enterRecreationalGameOutcome",
      (c) => c.api.enterRecreationalGameOutcome({ matchupId: "m1", winningGroupId: "g1" }),
      "enterRecreationalGameOutcomeRequest",
      "enterRecreationalGameOutcomeResponse",
      { matchupId: "m1", winningGroupId: "g1" },
    ],
  ];

  for (const [name, call, requestType, responseType, body] of cases) {
    it(`${name} posts ${requestType} and resolves with ${responseType}`, async () => {
      const { client, sendMessage } = openClient();
      const promise = call(client);
      await flush();
      const message = sendMessage.mock.calls[0][0];
      expect(message.type).toBe(requestType);
      if (body !== undefined) expect(message.body).toEqual(body);
      await deliver(client, { type: responseType, data: { ok: name }, requestId: message.requestId });
      expect(await promise).toEqual({ ok: name });
    });
  }

  it("rejects a write with TERMS_NOT_ACCEPTED when the web app reports it", async () => {
    const { client, sendMessage } = openClient();
    const promise = client.api.submitTournamentScore({ matchupId: "t1", score: 1 });
    await flush();
    await deliver(client, {
      type: "apiRequestError",
      data: { code: "TERMS_NOT_ACCEPTED", requestType: "submitTournamentScoreRequest" },
      requestId: sendMessage.mock.calls[0][0].requestId,
    });
    const error = await promise.catch((e) => e);
    expect(error.code).toBe(LucraApiErrorCode.termsNotAccepted);
  });
});

describe("popup().deposit amount", () => {
  it("passes the amount to add-funds with two decimals", () => {
    const client = LucraClient.initialize(baseConfig);
    const present = mock((_path: string, _params?: URLSearchParams) => ({}) as any);
    (client as any)._presentPopup = present;
    client.popup().deposit({ amount: 3.5 });
    expect(present.mock.calls[0][0]).toBe("app/add-funds");
    expect(present.mock.calls[0][1]?.get("amount")).toBe("3.50");
  });

  it("rejects a non-positive amount before opening anything", () => {
    const client = LucraClient.initialize(baseConfig);
    const present = mock(() => ({}) as any);
    (client as any)._presentPopup = present;
    expect(() => client.popup().deposit({ amount: 0 })).toThrow();
    expect(present).not.toHaveBeenCalled();
  });
});
