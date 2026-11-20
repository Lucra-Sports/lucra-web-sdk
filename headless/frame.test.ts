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
  // The window width media query. `matches` is true on a wide window. Each
  // list matchMedia returned keeps its own listeners, as in a browser.
  media: { matches: boolean; lists: Listeners[] };
  matchMedia: ReturnType<typeof mock>;
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
  const media = { matches: true, lists: [] as Listeners[] };
  const matchMedia = mock((_query: string) => {
    const listeners: Listeners = new Map();
    media.lists.push(listeners);
    return {
      get matches() {
        return media.matches;
      },
      addEventListener: add(listeners),
      removeEventListener: remove(listeners),
    };
  });
  (globalThis as { window?: unknown }).window = {
    location: { origin: "https://host.example" },
    addEventListener: add(windowListeners),
    removeEventListener: remove(windowListeners),
    matchMedia,
  };
  (globalThis as { document?: unknown }).document = document;
  dom = { body, focused, windowListeners, documentListeners, document, media, matchMedia };
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
    // For games shown inside Lucra.
    expect(iframe().allow).toContain("fullscreen *");
    expect(iframe().allow).toContain("autoplay *");
    expect(iframe().allow).toContain("encrypted-media *");
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

describe("createDomFrame: modal and sheet", () => {
  const SAFE_AREA =
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
  const FULL_SCREEN = {
    host:
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:#000;" +
      SAFE_AREA +
      "box-sizing:border-box;",
    iframe: "display:block;flex:1 1 auto;width:100%;height:100%;border:0;",
  };
  const BACKDROP =
    "position:fixed;inset:0;z-index:2147483647;display:flex;box-sizing:border-box;background:rgba(0,0,0,.5);";
  const PANEL = "display:block;flex:none;border:0;background:#000;";
  const MODAL_WIDE = {
    host: BACKDROP + SAFE_AREA + "align-items:center;justify-content:center;",
    iframe: PANEL + "width:min(430px,100%);height:min(800px,100%);",
  };
  const SHEET_WIDE = {
    host: BACKDROP + "justify-content:flex-end;",
    iframe:
      PANEL +
      "box-sizing:border-box;width:min(430px,100%);height:100%;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) 0;",
  };
  const SHEET_NARROW = {
    host:
      BACKDROP +
      "flex-direction:column;justify-content:flex-end;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);",
    iframe:
      PANEL +
      "box-sizing:border-box;width:100%;height:calc(100% - 96px);padding-bottom:env(safe-area-inset-bottom);",
  };
  const HIDDEN = { host: "display:none;", iframe: FULL_SCREEN.iframe };

  const styles = () => ({ host: host().style.cssText, iframe: iframe().style.cssText });
  const resize = (wide: boolean) => {
    dom.media.matches = wide;
    for (const list of dom.media.lists) fire(list, "change", { matches: wide });
  };
  const changeListeners = () =>
    dom.media.lists.reduce((sum, list) => sum + (list.get("change")?.size ?? 0), 0);
  const mounted = (presentation: "fullScreen" | "modal" | "sheet") => {
    const frame = createDomFrame(ORIGIN, undefined, presentation);
    frame.mount(URL_1);
    return frame;
  };

  for (const [presentation, wide, narrow] of [
    ["modal", MODAL_WIDE, FULL_SCREEN],
    ["sheet", SHEET_WIDE, SHEET_NARROW],
  ] as const) {
    it(`shows a ${presentation} as a dialog that follows the window width`, () => {
      mounted(presentation).openOverlay();
      expect(dom.matchMedia).toHaveBeenCalledWith("(min-width: 640px)");
      expect(host().attributes.role).toBe("dialog");
      expect(host().attributes["aria-modal"]).toBe("true");
      expect(styles()).toEqual(wide);
      resize(false);
      expect(styles()).toEqual(narrow);
      resize(true);
      expect(styles()).toEqual(wide);
    });

    it(`opens a ${presentation} on a narrow window in its narrow shape`, () => {
      dom.media.matches = false;
      mounted(presentation).openOverlay();
      expect(styles()).toEqual(narrow);
    });
  }

  it("stops following the window once it closes", () => {
    const overlay = mounted("sheet").openOverlay();
    expect(changeListeners()).toBe(1);
    overlay.close();
    expect(changeListeners()).toBe(0);
    resize(false);
    expect(styles()).toEqual(HIDDEN);
  });

  it("stops following the window on destroy", () => {
    const frame = mounted("modal");
    frame.openOverlay();
    frame.destroy();
    expect(changeListeners()).toBe(0);
  });

  it("never moves or reloads the frame", () => {
    const frame = mounted("sheet");
    const firstHost = host();
    const firstFrame = iframe();
    const check = () => {
      expect(dom.body.children).toEqual([firstHost]);
      expect(firstHost.parent).toBe(dom.body);
      expect(firstHost.children).toEqual([firstFrame]);
      expect(firstFrame.parent).toBe(firstHost);
      expect(firstFrame.src).toBe(URL_1);
      expect(firstFrame.contentWindow?.location.replace).toHaveBeenCalledTimes(0);
    };
    const overlay = frame.openOverlay();
    check();
    resize(false);
    check();
    resize(true);
    check();
    overlay.close();
    check();
    frame.openOverlay();
    check();
  });

  it("a late close of an older overlay leaves the newer one showing", () => {
    const frame = mounted("modal");
    const first = frame.openOverlay();
    frame.openOverlay();
    expect(changeListeners()).toBe(1);
    first.close();
    expect(styles()).toEqual(MODAL_WIDE);
    expect(changeListeners()).toBe(1);
    resize(false);
    expect(styles()).toEqual(FULL_SCREEN);
  });

  it("full screen and a container never ask for the window width", () => {
    mounted("fullScreen").openOverlay();
    expect(styles()).toEqual(FULL_SCREEN);
    const contained = createDomFrame(ORIGIN, makeElement("section") as unknown as HTMLElement);
    contained.mount(URL_1);
    contained.openOverlay();
    expect(dom.matchMedia).toHaveBeenCalledTimes(0);
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

describe("createDomFrame: openPopup", () => {
  const fakeWindow = () => ({ closed: false, close: mock(() => {}), focus: mock(() => {}) });
  const page = () =>
    (globalThis as unknown as { window: Record<string, unknown> }).window;

  it("opens the Add Funds window and brings it forward on focus()", () => {
    const win = fakeWindow();
    const open = mock((..._args: unknown[]) => win);
    Object.assign(page(), { open, screenX: 0, screenY: 0, innerWidth: 1430, innerHeight: 1800 });
    const popup = createDomFrame(ORIGIN).openPopup(URL_1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(URL_1);
    expect(open.mock.calls[0][1]).toBe("lucrasports:deposit:popup");
    expect(String(open.mock.calls[0][2])).toContain("left=500,top=500,width=430,height=800");
    expect(popup.focus()).toBe(true);
    expect(win.focus).toHaveBeenCalledTimes(1);
    const onClose = mock((_result?: unknown) => {});
    popup.onClose(onClose);
    popup.resolve({ toastType: "success", message: "ok" });
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ toastType: "success", message: "ok" });
  });

  it("closes the handle instead of focusing a window the user already closed", () => {
    const win = fakeWindow();
    Object.assign(page(), { open: () => win, screenX: 0, screenY: 0, innerWidth: 0, innerHeight: 0 });
    const popup = createDomFrame(ORIGIN).openPopup(URL_1);
    const onClose = mock((_result?: unknown) => {});
    popup.onClose(onClose);
    // Closed by the user before the next poll.
    win.closed = true;
    expect(popup.focus()).toBe(false);
    expect(win.focus).toHaveBeenCalledTimes(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(undefined);
  });

  it("throws when the browser blocks it", () => {
    Object.assign(page(), { open: () => null, screenX: 0, screenY: 0, innerWidth: 0, innerHeight: 0 });
    expect(() => createDomFrame(ORIGIN).openPopup(URL_1)).toThrow();
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
