import { describe, it, expect, mock, spyOn } from "bun:test";
import type { LucraError } from "./errors.ts";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.ts";
import { createFakeFrame, type FakeFrame } from "./testing.ts";
import { createWatch } from "./watch.ts";

const URL = "https://test-tenant.sandbox.lucrasports.com/app/headless";

function setup(overrides: Partial<Timeouts> = {}) {
  const frame = createFakeFrame();
  const session = createSession({
    frame,
    url: URL,
    timeouts: { ...DEFAULT_TIMEOUTS, ...overrides },
  });
  const watch = createWatch({ session });
  return { frame, session, watch };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const count = (frame: FakeFrame, type: string) =>
  frame.posted.filter((message) => message.type === type).length;
const details = (id: string, status = "OPEN") => ({
  matchup: { id, status },
  groups: [],
  participantScores: [],
});
const answerSubscribe = (frame: FakeFrame, id: string) =>
  frame.answer(
    "subscribeMatchupDetailsRequest",
    "subscribeMatchupDetailsResponse",
    details(id)
  );

describe("createWatch", () => {
  it("delivers the current details first, then each change", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock((_details: unknown) => {});
    watch.watch("m1", { onUpdate });
    await tick();
    expect(frame.lastPosted("subscribeMatchupDetailsRequest")?.body).toEqual({ matchupId: "m1" });
    answerSubscribe(frame, "m1");
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toEqual(details("m1"));
    frame.deliver("matchupDetailsUpdated", details("m1", "CONFIRMED"));
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[1][0]).toEqual(details("m1", "CONFIRMED"));
  });

  it("ignores updates for another matchup and updates before the snapshot", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    watch.watch("m1", { onUpdate });
    await tick();
    frame.deliver("matchupDetailsUpdated", details("m1"));
    expect(onUpdate).toHaveBeenCalledTimes(0);
    answerSubscribe(frame, "m1");
    await tick();
    frame.deliver("matchupDetailsUpdated", details("other"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("uses the id Lucra resolved to match updates", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    watch.watch("short-code", { onUpdate });
    await tick();
    answerSubscribe(frame, "full-id");
    await tick();
    frame.deliver("matchupDetailsUpdated", details("full-id"));
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("stop cancels once, never throws, and ends the updates", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    const handle = watch.watch("m1", { onUpdate });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    handle.stop();
    handle.stop();
    expect(count(frame, "cancelMatchupDetailsSubscription")).toBe(1);
    expect(frame.lastPosted("cancelMatchupDetailsSubscription")?.body).toBeNull();
    frame.deliver("matchupDetailsUpdated", details("m1"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("subscribes once when watch is called before connecting", async () => {
    const { frame, watch } = setup();
    watch.watch("m1", { onUpdate: () => {} });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(0);
    frame.deliver("initialized", { success: true });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(1);
  });

  it("never sends a subscribe that was stopped before connecting", async () => {
    const { frame, watch } = setup();
    const onError = mock(() => {});
    watch.watch("m1", { onUpdate: () => {}, onError }).stop();
    frame.deliver("initialized", { success: true });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(0);
    expect(onError).toHaveBeenCalledTimes(0);
  });

  it("shares a watch on the same matchup and catches the newcomer up", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const first = mock(() => {});
    const second = mock(() => {});
    const a = watch.watch("m1", { onUpdate: first });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    const b = watch.watch("m1", { onUpdate: second });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(1);
    expect(second).toHaveBeenCalledTimes(1);
    a.stop();
    expect(count(frame, "cancelMatchupDetailsSubscription")).toBe(0);
    frame.deliver("matchupDetailsUpdated", details("m1"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    b.stop();
    expect(count(frame, "cancelMatchupDetailsSubscription")).toBe(1);
  });

  it("treats two calls with the same handlers object as two listeners", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const handlers = { onUpdate: mock(() => {}) };
    const a = watch.watch("m1", handlers);
    watch.watch("m1", handlers);
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    expect(handlers.onUpdate).toHaveBeenCalledTimes(2);
    a.stop();
    frame.deliver("matchupDetailsUpdated", details("m1"));
    expect(handlers.onUpdate).toHaveBeenCalledTimes(3);
  });

  it("replaces a watch on another matchup and tells the old listeners", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onError = mock((_error: LucraError) => {});
    const oldUpdate = mock(() => {});
    const old = watch.watch("m1", { onUpdate: oldUpdate, onError });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    const onUpdate = mock(() => {});
    watch.watch("m2", { onUpdate });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe("CANCELLED");
    await tick();
    answerSubscribe(frame, "m2");
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    // The old matchup's updates no longer reach anyone, and its stop is harmless.
    frame.deliver("matchupDetailsUpdated", details("m1"));
    expect(oldUpdate).toHaveBeenCalledTimes(1);
    old.stop();
    expect(count(frame, "cancelMatchupDetailsSubscription")).toBe(0);
  });

  it("reports a failed subscribe once and stops", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onError = mock((_error: LucraError) => {});
    const onUpdate = mock(() => {});
    watch.watch("m1", { onUpdate, onError });
    await tick();
    frame.answer("subscribeMatchupDetailsRequest", "apiRequestError", {
      code: "API_ERROR",
      message: "Recreational game matchup not found",
    });
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe("NOT_FOUND");
    // A new watch on the same matchup starts over.
    watch.watch("m1", { onUpdate });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(2);
  });

  it("reports a subscribe that times out", async () => {
    const { frame, watch } = setup({ requestMs: 20 });
    frame.deliver("initialized", { success: true });
    const onError = mock((_error: LucraError) => {});
    watch.watch("m1", { onUpdate: () => {}, onError });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(onError.mock.calls[0][0].code).toBe("TIMEOUT");
  });

  it("cancels the subscription inside Lucra when subscribing fails", async () => {
    const { frame, watch } = setup({ requestMs: 20 });
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    // The app retries on the same matchup from onError.
    watch.watch("m1", {
      onUpdate: () => {},
      onError: () => {
        watch.watch("m1", { onUpdate });
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const types: string[] = frame.posted.map((message) => message.type);
    expect(count(frame, "cancelMatchupDetailsSubscription")).toBe(1);
    expect(frame.lastPosted("cancelMatchupDetailsSubscription")?.body).toBeNull();
    // The cancel goes out before the retry subscribes, so it cannot end the retry.
    expect(types.indexOf("cancelMatchupDetailsSubscription")).toBeLessThan(
      types.lastIndexOf("subscribeMatchupDetailsRequest")
    );
    answerSubscribe(frame, "m1");
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a newer watch when a replaced subscribe fails late", async () => {
    const { frame, watch } = setup({ requestMs: 20 });
    frame.deliver("initialized", { success: true });
    watch.watch("m1", { onUpdate: () => {} }).stop();
    const onUpdate = mock(() => {});
    const onError = mock(() => {});
    watch.watch("m1", { onUpdate, onError });
    await tick();
    answerSubscribe(frame, "m1");
    // The first subscribe was never answered and times out now.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(count(frame, "cancelMatchupDetailsSubscription")).toBe(1);
    expect(onError).toHaveBeenCalledTimes(0);
    frame.deliver("matchupDetailsUpdated", details("m1", "CONFIRMED"));
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("works without an onError handler", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    watch.watch("m1", { onUpdate: () => {} });
    await tick();
    frame.answer("subscribeMatchupDetailsRequest", "apiRequestError", { code: "API_ERROR" });
    await tick();
  });

  it("subscribes again after Lucra restarts, without an error", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    const onError = mock(() => {});
    watch.watch("m1", { onUpdate, onError });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    frame.deliver("initialized", { success: true });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(2);
    answerSubscribe(frame, "m1");
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(0);
  });

  it("subscribes again when a restart interrupts the first subscribe", async () => {
    const { frame, session, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    const onError = mock(() => {});
    watch.watch("m1", { onUpdate, onError });
    await tick();
    session.restart("https://test-tenant.sandbox.lucrasports.com/?login=true");
    await tick();
    expect(onError).toHaveBeenCalledTimes(0);
    frame.deliver("initialized", { success: true });
    await tick();
    expect(count(frame, "subscribeMatchupDetailsRequest")).toBe(2);
    answerSubscribe(frame, "m1");
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("reports the failure when Lucra reloads and cannot start", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    const failed = new Promise<LucraError>((resolve) => {
      watch.watch("m1", { onUpdate, onError: resolve });
    });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    frame.deliver("initialized", { success: false });
    expect((await failed).code).toBe("CONNECTION_FAILED");
    // The watch is over, so its updates no longer arrive.
    frame.deliver("matchupDetailsUpdated", details("m1", "CONFIRMED"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  }, 500);

  it("reports the failure when Lucra reloads mid subscribe and cannot start", async () => {
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const failed = new Promise<LucraError>((resolve) => {
      watch.watch("m1", { onUpdate: () => {}, onError: resolve });
    });
    await tick();
    frame.deliver("initialized", { success: false });
    expect((await failed).code).toBe("CONNECTION_FAILED");
  }, 500);

  it("keeps going when a listener throws", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const { frame, watch } = setup();
    frame.deliver("initialized", { success: true });
    const second = mock(() => {});
    watch.watch("m1", {
      onUpdate: () => {
        throw new Error("listener failed");
      },
    });
    watch.watch("m1", { onUpdate: second });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    expect(second).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("stops quietly on destroy and reports DESTROYED to a later watch", async () => {
    const { frame, session, watch } = setup();
    frame.deliver("initialized", { success: true });
    const onUpdate = mock(() => {});
    const onError = mock((_error: LucraError) => {});
    const handle = watch.watch("m1", { onUpdate, onError });
    await tick();
    answerSubscribe(frame, "m1");
    await tick();
    watch.destroy();
    session.destroy();
    expect(onError).toHaveBeenCalledTimes(0);
    handle.stop();
    const late = mock((_error: LucraError) => {});
    watch.watch("m1", { onUpdate, onError: late }).stop();
    await tick();
    expect(late.mock.calls[0][0].code).toBe("DESTROYED");
  });
});
