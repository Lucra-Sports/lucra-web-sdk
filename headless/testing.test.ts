import { describe, it, expect, mock } from "bun:test";
import { MessageTypeToLucraClient } from "../types/types.ts";
import { createFakeFrame } from "./testing.ts";

describe("createFakeFrame", () => {
  it("records every url it is asked to load, in order", () => {
    const frame = createFakeFrame();
    frame.mount("https://a.example/");
    frame.reload("https://b.example/");
    expect(frame.urls).toEqual(["https://a.example/", "https://b.example/"]);
  });

  it("records posted messages and finds the newest of a type", () => {
    const frame = createFakeFrame();
    expect(frame.lastPosted("navigate")).toBeUndefined();
    frame.post({ type: MessageTypeToLucraClient.navigate, body: { pathname: "/a" } });
    frame.post({ type: MessageTypeToLucraClient.enableExitLucra, body: true });
    frame.post({ type: MessageTypeToLucraClient.navigate, body: { pathname: "/b" } });
    expect(frame.posted.length).toBe(3);
    expect(frame.lastPosted("navigate")?.body).toEqual({ pathname: "/b" });
  });

  it("delivers a message to listeners until they are removed", () => {
    const frame = createFakeFrame();
    const listener = mock((_message: unknown) => {});
    const off = frame.onMessage(listener);
    frame.deliver("x", { a: 1 }, "3");
    expect(listener).toHaveBeenCalledWith({ type: "x", data: { a: 1 }, requestId: "3" });
    off();
    frame.deliver("x");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("answers the newest request of a type with its requestId", () => {
    const frame = createFakeFrame();
    const listener = mock((_message: unknown) => {});
    frame.onMessage(listener);
    expect(() => frame.answer("tournamentsRequest", "tournamentsResponse", {})).toThrow();
    frame.post({ type: MessageTypeToLucraClient.tournamentsRequest, body: null, requestId: "1" });
    frame.post({ type: MessageTypeToLucraClient.tournamentsRequest, body: null, requestId: "2" });
    frame.answer("tournamentsRequest", "tournamentsResponse", { tournaments: [] });
    expect(listener).toHaveBeenCalledWith({
      type: "tournamentsResponse",
      data: { tournaments: [] },
      requestId: "2",
    });
  });

  it("tracks whether the overlay is open", () => {
    const frame = createFakeFrame();
    const overlay = frame.openOverlay();
    expect(frame.overlayOpen).toBe(true);
    expect(frame.overlaysOpened).toBe(1);
    overlay.close();
    overlay.close();
    expect(frame.overlayOpen).toBe(false);
  });

  it("keeps the newer overlay open when an older one is closed late", () => {
    const frame = createFakeFrame();
    const older = frame.openOverlay();
    frame.openOverlay();
    older.close();
    expect(frame.overlayOpen).toBe(true);
    expect(frame.overlaysOpened).toBe(2);
  });

  it("records popups and how each one ends", () => {
    const frame = createFakeFrame();
    const first = frame.openPopup("https://a.example/");
    const onFirstClose = mock((_result: unknown) => {});
    first.onClose(onFirstClose);
    first.resolve({ toastType: "success", message: "ok" });
    expect(onFirstClose).toHaveBeenCalledWith({ toastType: "success", message: "ok" });
    expect(frame.popups[0]).toMatchObject({ url: "https://a.example/", closed: true });

    const second = frame.openPopup("https://b.example/");
    const onSecondClose = mock((_result: unknown) => {});
    second.onClose(onSecondClose);
    frame.popups[1].userClose();
    frame.popups[1].userClose();
    expect(onSecondClose).toHaveBeenCalledTimes(1);
    expect(onSecondClose).toHaveBeenCalledWith(undefined);
  });

  it("throws from openPopup when popups are blocked", () => {
    const frame = createFakeFrame();
    frame.blockPopups = true;
    expect(() => frame.openPopup("https://a.example/")).toThrow();
    expect(frame.popups.length).toBe(0);
  });

  it("marks itself destroyed and stops delivering", () => {
    const frame = createFakeFrame();
    const listener = mock(() => {});
    frame.onMessage(listener);
    frame.openOverlay();
    frame.destroy();
    expect(frame.destroyed).toBe(true);
    expect(frame.overlayOpen).toBe(false);
    frame.deliver("x");
    expect(listener).toHaveBeenCalledTimes(0);
  });
});
