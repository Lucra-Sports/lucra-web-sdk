import { describe, it, expect, mock } from "bun:test";
import { createApiRequest } from "./api-request.ts";
import { LucraClientMessageType, MessageTypeToLucraClient } from "./types/types.ts";

function setup(options: { singleFlight?: boolean; timeoutMs?: number } = {}) {
  const sendMessage = mock((_message: unknown) => {});
  const request = createApiRequest<string, { matchupId: string }>({
    type: MessageTypeToLucraClient.tournamentRequest,
    responseType: LucraClientMessageType.tournamentResponse,
    cancelReason: "Cancelled by new tournament request",
    sendMessage,
    ...options,
  });
  const sentId = (call: number) =>
    (sendMessage.mock.calls[call][0] as { requestId: string }).requestId;
  return { request, sendMessage, sentId };
}

// Resolves with "pending" if the promise has not settled within a macrotask.
const settledValue = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      (value) => ({ value }),
      (reason) => ({ reason })
    ),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
  ]);

describe("createApiRequest", () => {
  it("posts the type, body, and a string requestId", () => {
    const { request, sendMessage, sentId } = setup();

    request.send({ matchupId: "abc" }).catch(() => {});

    expect(sendMessage).toHaveBeenCalledWith({
      type: "tournamentRequest",
      body: { matchupId: "abc" },
      requestId: expect.any(String),
    });
    expect(sentId(0).length).toBeGreaterThan(0);
  });

  it("settles concurrent requests answered in reverse order with their own data", async () => {
    const { request, sentId } = setup();
    const first = request.send({ matchupId: "a" });
    const second = request.send({ matchupId: "b" });

    expect(sentId(0)).not.toBe(sentId(1));
    request.resolve("data-b", sentId(1));
    request.resolve("data-a", sentId(0));

    expect(await first).toBe("data-a");
    expect(await second).toBe("data-b");
  });

  it("ignores a response whose requestId matches no pending request", async () => {
    const { request } = setup();
    const promise = request.send({ matchupId: "a" });

    request.resolve("stale", "no-such-id");

    expect(await settledValue(promise)).toBe("pending");
    request.reject("cleanup");
    await promise.catch(() => {});
  });

  it("settles the oldest pending request when the response has no requestId", async () => {
    const { request, sentId } = setup();
    const first = request.send({ matchupId: "a" });
    const second = request.send({ matchupId: "b" });

    request.resolve("data");

    expect(await first).toBe("data");
    expect(await settledValue(second)).toBe("pending");
    request.reject("cleanup", sentId(1));
    await second.catch(() => {});
  });

  it("single-flight: a new send cancels the pending one, and its late response is ignored", async () => {
    const { request, sentId } = setup({ singleFlight: true });
    const first = request.send({ matchupId: "a" });
    const second = request.send({ matchupId: "b" });

    await expect(first).rejects.toBe("Cancelled by new tournament request");
    request.resolve("late", sentId(0));
    expect(await settledValue(second)).toBe("pending");

    request.resolve("fresh", sentId(1));
    expect(await second).toBe("fresh");
  });

  it("times out only the expired request", async () => {
    // The second request expires 100ms after the first, so it is still pending when
    // resolved right after the first times out.
    const { request, sentId } = setup({ timeoutMs: 200 });
    const first = request.send({ matchupId: "a" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = request.send({ matchupId: "b" });

    await expect(first).rejects.toBe("Timeout");
    request.resolve("data", sentId(1));
    expect(await second).toBe("data");
  });

  it("rejects the request targeted by requestId", async () => {
    const { request, sentId } = setup();
    const first = request.send({ matchupId: "a" });
    const second = request.send({ matchupId: "b" });

    request.reject("boom", sentId(1));

    await expect(second).rejects.toBe("boom");
    expect(await settledValue(first)).toBe("pending");
    request.resolve("data", sentId(0));
    expect(await first).toBe("data");
  });

  it("hasPending reports whether any request is still pending", async () => {
    const { request, sentId } = setup();
    expect(request.hasPending()).toBe(false);

    const promise = request.send({ matchupId: "a" });
    expect(request.hasPending()).toBe(true);

    request.resolve("data", sentId(0));
    await promise;
    expect(request.hasPending()).toBe(false);
  });
});
