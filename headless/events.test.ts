import { describe, it, expect, mock, spyOn } from "bun:test";
import { createEmitter } from "./events.ts";

type Events = { a: { n: number }; b: string };

describe("createEmitter", () => {
  it("gives a listener the emitted data", () => {
    const emitter = createEmitter<Events>();
    const listener = mock((_data: { n: number }) => {});
    emitter.on("a", listener);
    emitter.emit("a", { n: 1 });
    expect(listener).toHaveBeenCalledWith({ n: 1 });
  });

  it("runs every listener of a type, and only that type", () => {
    const emitter = createEmitter<Events>();
    const first = mock(() => {});
    const second = mock(() => {});
    const other = mock(() => {});
    emitter.on("a", first);
    emitter.on("a", second);
    emitter.on("b", other);
    emitter.emit("a", { n: 1 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(0);
  });

  it("removes a listener with the returned function, safely twice", () => {
    const emitter = createEmitter<Events>();
    const listener = mock(() => {});
    const off = emitter.on("a", listener);
    off();
    off();
    emitter.emit("a", { n: 1 });
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it("runs a function added twice only once", () => {
    const emitter = createEmitter<Events>();
    const listener = mock(() => {});
    emitter.on("a", listener);
    emitter.on("a", listener);
    emitter.emit("a", { n: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a listener throws", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const emitter = createEmitter<Events>();
    const second = mock(() => {});
    emitter.on("a", () => {
      throw new Error("listener failed");
    });
    emitter.on("a", second);
    emitter.emit("a", { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("still runs the next listener when one removes itself during emit", () => {
    const emitter = createEmitter<Events>();
    const second = mock(() => {});
    const off = emitter.on("a", () => off());
    emitter.on("a", second);
    emitter.emit("a", { n: 1 });
    emitter.emit("a", { n: 2 });
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("does nothing when a type has no listeners, or after clear", () => {
    const emitter = createEmitter<Events>();
    emitter.emit("b", "x");
    const listener = mock(() => {});
    emitter.on("a", listener);
    emitter.clear();
    emitter.emit("a", { n: 1 });
    expect(listener).toHaveBeenCalledTimes(0);
  });
});
