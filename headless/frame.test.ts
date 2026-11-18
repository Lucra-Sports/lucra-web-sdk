import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { MessageTypeToLucraClient } from "../types/types.ts";
import { createDomFrame, createNullFrame, hasDom, openPopupWindow, pageOrigin } from "./frame.ts";

const ORIGIN = "https://t.sandbox.lucrasports.com";
const URL_1 = `${ORIGIN}/app/headless?apiKey=k`;

// bun test has no DOM. These fakes implement only what frame.ts uses.
type FakeElement = {
  tag: string;
  id: string;
  title: string;
  allow: string;
  src: string;
  style: { cssText: string };
  attributes: Record<string, string>;
  children: FakeElement[];
  parent: FakeElement | null;
  contentWindow?: {
    postMessage: ReturnType<typeof mock>;
    location: { replace: ReturnType<typeof mock> };
  };
  focus: ReturnType<typeof mock>;
  appendChild(child: FakeElement): void;
  remove(): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

function makeElement(tag: string): FakeElement {
  const element: FakeElement = {
    tag,
    id: "",
    title: "",
    allow: "",
    src: "",
    style: { cssText: "" },
    attributes: {},
    children: [],
    parent: null,
    focus: mock(() => {}),
    appendChild(child) {
      child.parent = element;
      element.children.push(child);
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
  };
  if (tag === "iframe") {
    element.contentWindow = {
      postMessage: mock(() => {}),
      location: { replace: mock((_url: string) => {}) },
    };
  }
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

  it("reloads the frame in place, so the browser history does not grow", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    frame.reload(`${ORIGIN}/?login=true`);
    expect(iframe().contentWindow?.location.replace).toHaveBeenCalledWith(
      `${ORIGIN}/?login=true`
    );
    expect(iframe().src).toBe(URL_1);
  });

  it("reloads through src when the frame has no window", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    iframe().contentWindow = undefined;
    frame.reload(`${ORIGIN}/?login=true`);
    expect(iframe().src).toBe(`${ORIGIN}/?login=true`);
  });

  it("reloads through src when replacing the location throws", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const replace = iframe().contentWindow?.location.replace;
    replace?.mockImplementation(() => {
      throw new Error("blocked");
    });
    frame.reload(`${ORIGIN}/?login=true`);
    expect(replace).toHaveBeenCalledTimes(1);
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
  it("shows the host full screen with nothing drawn over the frame", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    frame.openOverlay();
    // Padded so iOS bars and the notch do not cover Lucra's own controls.
    expect(host().style.cssText).toBe(
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:#000;" +
        "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box;"
    );
    expect(host().attributes).toEqual({
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Lucra",
    });
    expect(host().children.map((child) => child.tag)).toEqual(["iframe"]);
    expect(dom.documentListeners.get("keydown")?.size ?? 0).toBe(0);
    expect(iframe().focus).toHaveBeenCalledTimes(1);
  });

  it("hides again on close and gives focus back", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const overlay = frame.openOverlay();
    overlay.close();
    overlay.close();
    expect(host().style.cssText).toBe("display:none;");
    expect(host().attributes).toEqual({});
    expect(dom.focused.focus).toHaveBeenCalledTimes(1);
  });

  it("closes the first overlay when a second one opens", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const first = frame.openOverlay();
    frame.openOverlay();
    expect(dom.focused.focus).toHaveBeenCalledTimes(1);
    // A late close of the first one leaves the second one showing.
    first.close();
    expect(host().style.cssText).toContain("position:fixed");
  });

  it("does nothing before the frame is mounted", () => {
    const frame = createDomFrame(ORIGIN);
    frame.openOverlay().close();
    expect(dom.body.children.length).toBe(0);
  });
});

describe("createDomFrame: in a container", () => {
  let container: FakeElement;
  beforeEach(() => {
    container = makeElement("section");
  });
  const inContainer = () => createDomFrame(ORIGIN, container as unknown as HTMLElement);
  const wrapper = () => container.children[0];

  it("adds the hidden host to the container, not the body", () => {
    const frame = inContainer();
    frame.mount(URL_1);
    frame.mount(URL_1);
    expect(dom.body.children.length).toBe(0);
    expect(container.children.length).toBe(1);
    expect(wrapper().style.cssText).toBe("display:none;");
    expect(wrapper().children.map((child) => child.tag)).toEqual(["iframe"]);
    expect(wrapper().children[0].src).toBe(URL_1);
  });

  it("adds it at once, without waiting for the body", () => {
    dom.document.body = null;
    const frame = inContainer();
    frame.mount(URL_1);
    expect(container.children.length).toBe(1);
    expect(dom.documentListeners.get("DOMContentLoaded")?.size ?? 0).toBe(0);
  });

  it("fills the container while a screen shows, then hides again", () => {
    const frame = inContainer();
    frame.mount(URL_1);
    const overlay = frame.openOverlay();
    expect(wrapper().style.cssText).toBe("display:block;width:100%;height:100%;");
    // A div with no role cannot be named. The frame's own title names it.
    expect(wrapper().attributes).toEqual({});
    expect(wrapper().children.map((child) => child.tag)).toEqual(["iframe"]);
    expect(dom.documentListeners.get("keydown")?.size ?? 0).toBe(0);
    expect(wrapper().children[0].focus).toHaveBeenCalledTimes(1);
    overlay.close();
    expect(wrapper().style.cssText).toBe("display:none;");
    expect(wrapper().attributes).toEqual({});
    expect(dom.focused.focus).toHaveBeenCalledTimes(1);
  });

  it("removes the host from the container on destroy", () => {
    const frame = inContainer();
    frame.mount(URL_1);
    frame.openOverlay();
    expect(container.children.length).toBe(1);
    frame.destroy();
    expect(container.children.length).toBe(0);
  });
});

describe("createDomFrame: destroy", () => {
  it("removes the host, closes the overlay, and stops listening", () => {
    const frame = createDomFrame(ORIGIN);
    frame.mount(URL_1);
    const listener = mock(() => {});
    frame.onMessage(listener);
    frame.openOverlay();
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

describe("openPopupWindow", () => {
  const fakeWindow = () => ({ closed: false, close: mock(() => {}), focus: mock(() => {}) });
  const page = () =>
    (globalThis as unknown as { window: Record<string, unknown> }).window;

  it("opens a named, centered window and brings it forward on focus()", () => {
    const win = fakeWindow();
    const open = mock((..._args: unknown[]) => win);
    Object.assign(page(), { open, screenX: 0, screenY: 0, innerWidth: 1430, innerHeight: 1800 });
    const popup = openPopupWindow(URL_1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(URL_1);
    expect(open.mock.calls[0][1]).toBe("lucrasports:deposit:popup");
    expect(String(open.mock.calls[0][2])).toContain("left=500,top=500,width=430,height=800");
    popup.focus();
    expect(win.focus).toHaveBeenCalledTimes(1);
    const onClose = mock((_result?: unknown) => {});
    popup.onClose(onClose);
    popup.resolve({ toastType: "success", message: "ok" });
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ toastType: "success", message: "ok" });
    // Closed: focus and close do nothing more.
    popup.focus();
    popup.close();
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("throws when the browser blocks it", () => {
    Object.assign(page(), { open: () => null, screenX: 0, screenY: 0, innerWidth: 0, innerHeight: 0 });
    expect(() => openPopupWindow(URL_1)).toThrow();
  });

  it("reports a window the user closed, with no result", async () => {
    const win = fakeWindow();
    Object.assign(page(), { open: () => win, screenX: 0, screenY: 0, innerWidth: 0, innerHeight: 0 });
    const popup = openPopupWindow(URL_1, 1);
    const closed = new Promise((resolve) => popup.onClose(resolve));
    win.closed = true;
    expect(await closed).toBeUndefined();
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
    frame.openOverlay().close();
    frame.destroy();
    expect(() => frame.openPopup(URL_1)).toThrow();
  });
});
