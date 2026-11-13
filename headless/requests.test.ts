import { describe, it, expect, mock } from "bun:test";
import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
} from "../types/types.ts";
import { LucraError } from "./errors.ts";
import type { OutboundMessage } from "./frame.ts";
import { createRequests, type RequestSpec } from "./requests.ts";

const READ: RequestSpec<{ n: number }> = {
  type: MessageTypeToLucraClient.tournamentRequest,
  responseType: LucraClientMessageType.tournamentResponse,
  kind: "read",
};
const WRITE: RequestSpec<{ n: number }> = {
  type: MessageTypeToLucraClient.createRecreationalGameRequest,
  responseType: LucraClientMessageType.createRecreationalGameResponse,
  kind: "write",
  unknownOnApiError: true,
};

function setup(timeoutMs = 60_000) {
  const posted: OutboundMessage[] = [];
  const onTimeout = mock((_type: MessageTypeToLucraClient, _ms: number) => {});
  const requests = createRequests({
    post: (message) => posted.push(message),
    timeoutMs,
    onTimeout,
  });
  const id = (index: number) => posted[index].requestId as string;
  return { requests, posted, onTimeout, id };
}

const caught = (promise: Promise<unknown>): Promise<LucraError> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error) => error as LucraError
  );

// Resolves with "pending" if the promise has not settled within a macrotask.
const settled = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      (value) => ({ value }),
      (reason) => ({ reason })
    ),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
  ]);

describe("createRequests", () => {
  it("posts the type, the body, and a string requestId", () => {
    const { requests, posted } = setup();
    requests.send(READ, { matchupId: "abc" }).catch(() => {});
    expect<unknown>(posted[0]).toEqual({
      type: "tournamentRequest",
      body: { matchupId: "abc" },
      requestId: expect.any(String),
    });
    expect(requests.pendingCount()).toBe(1);
  });

  it("sends body null when there is no body", () => {
    const { requests, posted } = setup();
    requests.send(READ).catch(() => {});
    expect(posted[0].body).toBeNull();
  });

  it("settles concurrent requests answered in reverse order with their own data", async () => {
    const { requests, id } = setup();
    const first = requests.send(READ, { matchupId: "a" });
    const second = requests.send(READ, { matchupId: "b" });
    expect(id(0)).not.toBe(id(1));
    requests.handle({ type: "tournamentResponse", data: { n: 2 }, requestId: id(1) });
    requests.handle({ type: "tournamentResponse", data: { n: 1 }, requestId: id(0) });
    expect(await first).toEqual({ n: 1 });
    expect(await second).toEqual({ n: 2 });
    expect(requests.pendingCount()).toBe(0);
  });

  it("ignores an answer with no requestId, an unknown id, or the wrong type", async () => {
    const { requests, id } = setup();
    const pending = requests.send(READ, { matchupId: "a" });
    requests.handle({ type: "tournamentResponse", data: { n: 1 } });
    requests.handle({ type: "tournamentResponse", data: { n: 1 }, requestId: "nope" });
    requests.handle({ type: "matchupResponse", data: { n: 1 }, requestId: id(0) });
    expect(await settled(pending)).toBe("pending");
    expect(requests.pendingCount()).toBe(1);
  });

  it("says whether a message answered a pending request", () => {
    const { requests, id } = setup();
    requests.send(READ, {}).catch(() => {});
    requests.send(READ, {}).catch(() => {});
    expect(requests.handle({ type: "tournamentResponse", data: {} })).toBe(false);
    expect(requests.handle({ type: "tournamentResponse", data: {}, requestId: "nope" })).toBe(false);
    expect(requests.handle({ type: "matchupResponse", data: {}, requestId: id(0) })).toBe(false);
    expect(requests.handle({ type: "tournamentResponse", data: { n: 1 }, requestId: id(0) })).toBe(true);
    // Already settled, so the same answer again is not one any more.
    expect(requests.handle({ type: "tournamentResponse", data: { n: 1 }, requestId: id(0) })).toBe(false);
    expect(
      requests.handle({ type: "apiRequestError", data: { code: "API_ERROR" }, requestId: id(1) })
    ).toBe(true);
  });

  it("rejects with the code from apiRequestError", async () => {
    const { requests, id } = setup();
    const pending = caught(requests.send(READ, { matchupId: "a" }));
    requests.handle({
      type: "apiRequestError",
      data: { code: "LOCATION_NEEDED", message: "m", requestType: "tournamentRequest" },
      requestId: id(0),
    });
    const error = await pending;
    expect(error).toBeInstanceOf(LucraError);
    expect(error.code).toBe("LOCATION_NEEDED");
    expect(error.message).toBe("m");
    expect(error.remediation).toBe("locationGrant");
  });

  it("rejects from joinTournamentError and autoJoinTournamentsError too", async () => {
    const { requests, id } = setup();
    const join = caught(requests.send(READ));
    const auto = caught(requests.send(READ));
    requests.handle({ type: "joinTournamentError", data: { code: "INSUFFICIENT_FUNDS" }, requestId: id(0) });
    requests.handle({ type: "autoJoinTournamentsError", data: { code: "API_ERROR", message: "Auto-join skipped: off" }, requestId: id(1) });
    expect((await join).code).toBe("INSUFFICIENT_FUNDS");
    expect((await auto).code).toBe("API_ERROR");
    expect((await auto).message).toBe("Auto-join skipped: off");
  });

  it("marks a write's API_ERROR as outcome unknown, but not a read's", async () => {
    const { requests, id } = setup();
    const write = caught(requests.send(WRITE, {}));
    const read = caught(requests.send(READ, {}));
    requests.handle({ type: "apiRequestError", data: { code: "API_ERROR", message: "boom" }, requestId: id(0) });
    requests.handle({ type: "apiRequestError", data: { code: "API_ERROR", message: "boom" }, requestId: id(1) });
    expect((await write).outcomeUnknown).toBe(true);
    expect((await read).outcomeUnknown).toBe(false);
  });

  it("times out with TIMEOUT and calls onTimeout once", async () => {
    const { requests, onTimeout } = setup(20);
    const read = await caught(requests.send(READ, {}));
    expect(read.code).toBe("TIMEOUT");
    expect(read.outcomeUnknown).toBe(false);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith("tournamentRequest", 20);
    const write = await caught(requests.send(WRITE, {}));
    expect(write.outcomeUnknown).toBe(true);
    expect(requests.pendingCount()).toBe(0);
  });

  it("still rejects when onTimeout throws", async () => {
    const posted: OutboundMessage[] = [];
    const requests = createRequests({
      post: (message) => posted.push(message),
      timeoutMs: 20,
      onTimeout: () => {
        throw new Error("reporting failed");
      },
    });
    expect((await caught(requests.send(READ, {}))).code).toBe("TIMEOUT");
  });

  it("ignores an answer that arrives after the timeout", async () => {
    const { requests, id } = setup(20);
    const error = await caught(requests.send(READ, {}));
    expect(error.code).toBe("TIMEOUT");
    requests.handle({ type: "tournamentResponse", data: { n: 1 }, requestId: id(0) });
    expect(requests.pendingCount()).toBe(0);
  });

  it("rejects with INVALID_ARGUMENT when the message cannot be posted", async () => {
    const requests = createRequests({
      post: () => {
        throw new Error("could not be cloned");
      },
      timeoutMs: 60_000,
    });
    const error = await caught(requests.send(READ, {}));
    expect(error.code).toBe("INVALID_ARGUMENT");
    expect(requests.pendingCount()).toBe(0);
  });

  it("keeps a request pending through an interim answer and restarts its timer", async () => {
    const { requests, id } = setup(60);
    const spec: RequestSpec<{ pending?: boolean; ok: boolean }> = {
      ...READ,
      interim: (data) => data.pending === true,
      maxTimeoutMs: 10_000,
    };
    const pending = requests.send(spec, {});
    await new Promise((resolve) => setTimeout(resolve, 40));
    requests.handle({ type: "tournamentResponse", data: { pending: true, ok: false }, requestId: id(0) });
    // 40ms more would be past the original 60ms timer, but the interim restarted it.
    await new Promise((resolve) => setTimeout(resolve, 40));
    requests.handle({ type: "tournamentResponse", data: { ok: true }, requestId: id(0) });
    expect(await pending).toEqual({ ok: true });
  });

  it("stops extending past maxTimeoutMs", async () => {
    const { requests, id } = setup(40);
    const spec: RequestSpec<{ pending?: boolean }> = {
      ...READ,
      interim: (data) => data.pending === true,
      maxTimeoutMs: 10,
    };
    const pending = caught(requests.send(spec, {}));
    await new Promise((resolve) => setTimeout(resolve, 25));
    // Past the 10ms deadline: this interim must not restart the 40ms timer.
    requests.handle({ type: "tournamentResponse", data: { pending: true }, requestId: id(0) });
    const started = Date.now();
    expect((await pending).code).toBe("TIMEOUT");
    expect(Date.now() - started).toBeLessThan(35);
  });

  it("rejectAll rejects everything pending with the given code", async () => {
    const { requests } = setup();
    const read = caught(requests.send(READ, {}));
    const write = caught(requests.send(WRITE, {}));
    requests.rejectAll("CONNECTION_RESET");
    expect((await read).code).toBe("CONNECTION_RESET");
    expect((await read).outcomeUnknown).toBe(false);
    expect((await write).code).toBe("CONNECTION_RESET");
    expect((await write).outcomeUnknown).toBe(true);
    expect(requests.pendingCount()).toBe(0);
    const destroyed = caught(requests.send(READ, {}));
    requests.rejectAll("DESTROYED");
    expect((await destroyed).code).toBe("DESTROYED");
  });
});
