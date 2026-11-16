import { createPopup, type LucraPopupHandle } from "../popup.js";
import {
  LUCRA_POPUP_MESSAGE_TYPE,
  type MessageTypeToLucraClient,
} from "../types/types.js";

// A message the SDK sends to the Lucra app.
export type OutboundMessage = {
  type: MessageTypeToLucraClient;
  body: unknown;
  requestId?: string;
};

// A message the Lucra app sends to the SDK.
export type InboundMessage = {
  type: string;
  data: unknown;
  requestId?: string;
};

export type Overlay = { close(): void };

// Everything the client needs from the page. This file implements it with the
// DOM. Tests use the fake in testing.ts. No other file may touch the DOM.
export type Frame = {
  // Creates the hidden frame, in the app's container or the body, and loads
  // `url`. Safe to call before <body> exists.
  mount(url: string): void;
  // Loads `url` in the existing frame. The Lucra app starts over.
  reload(url: string): void;
  post(message: OutboundMessage): void;
  onMessage(listener: (message: InboundMessage) => void): () => void;
  // Shows the frame full screen, or filling the app's container. It draws no
  // exit: Lucra shows its own, and the app can call present.dismiss().
  openOverlay(): Overlay;
  // Opens a real popup window. Throws when the browser blocks it.
  openPopup(url: string): LucraPopupHandle;
  destroy(): void;
};

// True when there is a page to work with. False on a server.
export function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

// The origin of the page that embeds Lucra.
export function pageOrigin(): string {
  return window.location.origin;
}

// Stands in for the frame where there is no page. It does nothing.
export function createNullFrame(): Frame {
  return {
    mount() {},
    reload() {},
    post() {},
    onMessage: () => () => {},
    openOverlay: () => ({ close() {} }),
    openPopup() {
      throw new Error("No browser");
    },
    destroy() {},
  };
}

const HOST_ID = "lucra-headless-host";
// Same permissions the existing client grants its frame.
const FRAME_ALLOW =
  "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment;";
const HIDDEN_CSS = "display:none;";
const OVERLAY_CSS =
  "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:#000;";
const CONTAINED_CSS = "display:block;width:100%;height:100%;";
// Block, so an inline frame's baseline gap cannot overflow the container.
const IFRAME_CSS = "display:block;flex:1 1 auto;width:100%;height:100%;border:0;";

// With a container, the frame lives and shows there. Without one, it lives in
// the body and shows full screen.
export function createDomFrame(origin: string, container?: HTMLElement): Frame {
  let host: HTMLDivElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let destroyed = false;
  let closeOverlay: (() => void) | null = null;
  const listeners = new Set<(message: InboundMessage) => void>();

  const onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== origin) return;
    const data = event.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;

    let message: InboundMessage;
    if (data.type === LUCRA_POPUP_MESSAGE_TYPE) {
      // The Add Funds popup posts a flat envelope from its own window.
      message = {
        type: data.type,
        data: { toastType: data.toastType, message: data.message },
      };
    } else {
      // Everything else must come from our own frame, not from another Lucra
      // frame or window on the page.
      if (!iframe || event.source !== iframe.contentWindow) return;
      message = {
        type: data.type,
        data: data.data,
        requestId: typeof data.requestId === "string" ? data.requestId : undefined,
      };
    }
    for (const listener of [...listeners]) listener(message);
  };

  const attach = (url: string) => {
    if (destroyed || host) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = HIDDEN_CSS;
    iframe = document.createElement("iframe");
    iframe.title = "Lucra";
    iframe.allow = FRAME_ALLOW;
    iframe.style.cssText = IFRAME_CSS;
    iframe.src = url;
    host.appendChild(iframe);
    (container ?? document.body).appendChild(host);
  };

  return {
    mount(url) {
      window.addEventListener("message", onWindowMessage);
      if (container || document.body) {
        attach(url);
      } else {
        document.addEventListener("DOMContentLoaded", () => attach(url), {
          once: true,
        });
      }
    },

    reload(url) {
      if (iframe) iframe.src = url;
    },

    post(message) {
      iframe?.contentWindow?.postMessage(message, origin);
    },

    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    openOverlay() {
      closeOverlay?.();
      if (!host || !iframe) return { close() {} };
      const overlayHost = host;
      const previousFocus = document.activeElement as HTMLElement | null;

      if (container) {
        overlayHost.style.cssText = CONTAINED_CSS;
      } else {
        // Full screen covers the page, so it is a modal dialog.
        overlayHost.style.cssText = OVERLAY_CSS;
        overlayHost.setAttribute("role", "dialog");
        overlayHost.setAttribute("aria-modal", "true");
      }
      overlayHost.setAttribute("aria-label", "Lucra");
      iframe.focus();

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (closeOverlay === close) closeOverlay = null;
        overlayHost.style.cssText = HIDDEN_CSS;
        overlayHost.removeAttribute("role");
        overlayHost.removeAttribute("aria-modal");
        overlayHost.removeAttribute("aria-label");
        previousFocus?.focus?.();
      };
      closeOverlay = close;
      return { close };
    },

    openPopup(url) {
      return createPopup(url);
    },

    destroy() {
      destroyed = true;
      closeOverlay?.();
      window.removeEventListener("message", onWindowMessage);
      listeners.clear();
      host?.remove();
      host = null;
      iframe = null;
    },
  };
}
