import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { MessageTypeToLucraClient } from "../types/types.ts";
import { createDomFrame, createNullFrame, hasDom, pageOrigin } from "./frame.ts";

const ORIGIN = "https://t.sandbox.lucrasports.com";
const URL_1 = `${ORIGIN}/app/headless?apiKey=k`;

// bun test has no DOM. These fakes implement only what frame.ts uses.
type FakeElement = {
  tag: string;
  id: string;
  title: string;
  allow: string;
  src: string;
  type: string;
  textContent: string;
  style: { cssText: string };
  attributes: Record<string, string>;
  children: FakeElement[];
  parent: FakeElement | null;
  listeners: Record<string, ((event?: unknown) => void)[]>;
  contentWindow?: { postMessage: ReturnType<typeof mock> };
  focus: ReturnType<typeof mock>;
  appendChild(child: FakeElement): void;
  insertBefore(child: FakeElement, before: FakeElement): void;
  remove(): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event?: unknown) => void): void;
};

function makeElement(tag: string): FakeElement {
  const element: FakeElement = {
    tag,
    id: "",
    title: "",
    allow: "",
    src: "",
    type: "",
    textContent: "",
    style: { cssText: "" },
    attributes: {},
    children: [],
    parent: null,
    listeners: {},
    focus: mock(() => {}),
    appendChild(child) {
      child.parent = element;
      element.children.push(child);
    },
    insertBefore(child, before) {
      child.parent = element;
      element.children.splice(element.children.indexOf(before), 0, child);
    },
    remove() {
      if (!element.parent) return;
      const siblings = element.parent.children;
      siblings.splice(siblings.indexOf(element), 1);
      element.parent = null;
    },
    setAttribute(name, value) {
      element.attributes[name] = value;
    },
    removeAttribute(name) {
      delete element.attributes[name];
    },
    addEventListener(type, listener) {
      (element.listeners[type] ??= []).push(listener);
    },
  };
  if (tag === "iframe") element.contentWindow = { postMessage: mock(() => {}) };
  return element;
}

type Listeners = Map<string, Set<(event: unknown) => void>>;
const add = (map: Listeners) => (type: string, listener: (event: unknown) => void) => {
  if (!map.has(type)) map.set(type, new Set());
  map.get(type)?.add(listener);
};
const remove = (map: Listeners) => (type: string, listener: (event: unknown) => void) => {
  map.get(type)?.delete(listener);
};
const fire = (map: Listeners, type: string, event: unknown) => {
  for (const listener of [...(map.get(type) ?? [])]) listener(event);
};

type FakeDom = {
  body: FakeElement;
  focused: FakeElement;
  windowListeners: Listeners;
  documentListeners: Listeners;
  document: { body: FakeElement | null; activeElement: FakeElement };
};

const saved = {
  window: (globalThis as { window?: unknown }).window,
  document: (globalThis as { document?: unknown }).document,
};
let dom: FakeDom;

beforeEach(() => {
  const body = makeElement("body");
  const focused = makeElement("button");
  const windowListeners: Listeners = new Map();
  const documentListeners: Listeners = new Map();
  const document = {
    body: body as FakeElement | null,
    activeElement: focused,
    createElement: makeElement,
    addEventListener: add(documentListeners),
    removeEventListener: remove(documentListeners),
  };
  (globalThis as { window?: unknown }).window = {
    location: { origin: "https://host.example" },
    addEventListener: add(windowListeners),
    removeEventListener: remove(windowListeners),
  };
  (globalThis as { document?: unknown }).document = document;
  dom = { body, focused, windowListeners, documentListeners, document };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = saved.window;
  (globalThis as { document?: unknown }).document = saved.document;
});

const host = () => dom.body.children[0];
const iframe = () => host().children.find((child) => child.tag === "iframe") as FakeElement;
const bar = () => host().children.find((child) => child.tag === "div");
const message = (data: unknown, overrides: { origin?: string; source?: unknown } = {}) =>
  fire(dom.windowListeners, "message", {
    origin: overrides.origin ?? ORIGIN,
    source: "source" in overrides ? overrides.source : iframe().contentWindow,
    data,
  });

describe("createDomFrame: mount and messages", () => {
  it("adds one hidden host holding the frame", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    frame.mount(URL_1);
    expect(dom.body.children.length).toBe(1);
    expect(host().style.cssText).toBe("display:none;");
    expect(iframe().src).toBe(URL_1);
    expect(iframe().title).toBe("Lucra");
    expect(iframe().allow).toContain("geolocation");
    expect(iframe().allow).toContain("payment");
  });

  it("waits for the body when it does not exist yet", () => {
    dom.document.body = null;
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    expect(dom.body.children.length).toBe(0);
    dom.document.body = dom.body;
    fire(dom.documentListeners, "DOMContentLoaded", {});
    expect(dom.body.children.length).toBe(1);
  });

  it("posts to the frame with Lucra's origin", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const outbound = { type: MessageTypeToLucraClient.enableExitLucra, body: true };
    frame.post(outbound);
    expect(iframe().contentWindow?.postMessage).toHaveBeenCalledWith(outbound, ORIGIN);
  });

  it("reloads the frame at a new url", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    frame.reload(`${ORIGIN}/?login=true`);
    expect(iframe().src).toBe(`${ORIGIN}/?login=true`);
  });

  it("passes on messages from its own frame", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock((_message: unknown) => {});
    frame.onMessage(listener);
    message({ type: "initialized", data: { success: true } });
    expect(listener).toHaveBeenCalledWith({
      type: "initialized",
      data: { success: true },
      requestId: undefined,
    });
    message({ type: "tournamentsResponse", data: { tournaments: [] }, requestId: "7" });
    expect(listener.mock.calls[1][0]).toEqual({
      type: "tournamentsResponse",
      data: { tournaments: [] },
      requestId: "7",
    });
  });

  it("drops a requestId that is not a string", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock((_message: { requestId?: string }) => {});
    frame.onMessage(listener);
    message({ type: "tournamentsResponse", data: {}, requestId: 7 });
    expect(listener.mock.calls[0][0].requestId).toBeUndefined();
  });

  it("ignores messages from another origin, another window, or with no type", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock(() => {});
    frame.onMessage(listener);
    message({ type: "initialized", data: {} }, { origin: "https://evil.example" });
    message({ type: "initialized", data: {} }, { source: { other: true } });
    message("hello");
    message({});
    message(null);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it("accepts the popup's flat message from any window on Lucra's origin", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock((_message: unknown) => {});
    frame.onMessage(listener);
    message(
      { type: "LucraPopupMessage", toastType: "success", message: "ok" },
      { source: { popup: true } }
    );
    expect(listener).toHaveBeenCalledWith({
      type: "LucraPopupMessage",
      data: { toastType: "success", message: "ok" },
    });
  });

  it("stops calling a listener once it is removed", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock(() => {});
    const off = frame.onMessage(listener);
    off();
    message({ type: "initialized", data: {} });
    expect(listener).toHaveBeenCalledTimes(0);
  });
});

describe("createDomFrame: overlay", () => {
  it("shows the host full screen with a Close button above the frame", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    frame.openOverlay(() => {});
    expect(host().style.cssText).toContain("position:fixed");
    expect(host().attributes.role).toBe("dialog");
    expect(host().attributes["aria-modal"]).toBe("true");
    expect(host().children.indexOf(bar() as FakeElement)).toBe(0);
    const button = (bar() as FakeElement).children[0];
    expect(button.textContent).toBe("Close");
    expect(button.type).toBe("button");
    expect(iframe().focus).toHaveBeenCalledTimes(1);
  });

  it("reports Close and Escape without closing by itself", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const onUserClose = mock(() => {});
    frame.openOverlay(onUserClose);
    (bar() as FakeElement).children[0].listeners.click[0]();
    expect(onUserClose).toHaveBeenCalledTimes(1);
    fire(dom.documentListeners, "keydown", { key: "a" });
    expect(onUserClose).toHaveBeenCalledTimes(1);
    fire(dom.documentListeners, "keydown", { key: "Escape" });
    expect(onUserClose).toHaveBeenCalledTimes(2);
    expect(host().style.cssText).toContain("position:fixed");
  });

  it("hides again on close and gives focus back", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const onUserClose = mock(() => {});
    const overlay = frame.openOverlay(onUserClose);
    overlay.close();
    overlay.close();
    expect(host().style.cssText).toBe("display:none;");
    expect(host().attributes.role).toBeUndefined();
    expect(bar()).toBeUndefined();
    expect(dom.focused.focus).toHaveBeenCalledTimes(1);
    fire(dom.documentListeners, "keydown", { key: "Escape" });
    expect(onUserClose).toHaveBeenCalledTimes(0);
  });

  it("closes the first overlay when a second one opens", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const first = mock(() => {});
    frame.openOverlay(first);
    frame.openOverlay(() => {});
    expect(host().children.filter((child) => child.tag === "div").length).toBe(1);
    fire(dom.documentListeners, "keydown", { key: "Escape" });
    expect(first).toHaveBeenCalledTimes(0);
  });

  it("does nothing before the frame is mounted", () => {
    const frame = createDomFrame(ORIGIN);
    frame.openOverlay(() => {}).close();
    expect(dom.body.children.length).toBe(0);
  });
});

describe("createDomFrame: destroy", () => {
  it("removes the host, closes the overlay, and stops listening", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock(() => {});
    frame.onMessage(listener);
    frame.openOverlay(() => {});
    const frameWindow = iframe().contentWindow;
    frame.destroy();
    expect(dom.body.children.length).toBe(0);
    fire(dom.windowListeners, "message", {
      origin: ORIGIN,
      source: frameWindow,
      data: { type: "initialized", data: {} },
    });
    expect(listener).toHaveBeenCalledTimes(0);
    frame.post({ type: MessageTypeToLucraClient.enableExitLucra, body: true });
    frame.reload(URL_1);
    frame.mount(URL_1);
    expect(dom.body.children.length).toBe(0);
  });
});

describe("page helpers", () => {
  it("hasDom is true with a page and false without one", () => {
    expect(hasDom()).toBe(true);
    (globalThis as { window?: unknown }).window = undefined;
    expect(hasDom()).toBe(false);
  });

  it("pageOrigin returns the page's origin", () => {
    expect(pageOrigin()).toBe("https://host.example");
  });

  it("createNullFrame does nothing and never throws, except for popups", () => {
    const frame = createNullFrame();
    frame.mount(URL_1);
    frame.reload(URL_1);
    frame.post({ type: MessageTypeToLucraClient.enableExitLucra, body: true });
    frame.onMessage(() => {})();
    frame.openOverlay(() => {}).close();
    frame.destroy();
    expect(() => frame.openPopup(URL_1)).toThrow();
  });
});
