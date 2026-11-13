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
  // Creates the hidden frame and loads `url`. Safe to call before <body> exists.
  mount(url: string): void;
  // Loads `url` in the existing frame. The Lucra app starts over.
  reload(url: string): void;
  post(message: OutboundMessage): void;
  onMessage(listener: (message: InboundMessage) => void): () => void;
  // Shows the frame full screen with a Close button. `onUserClose` runs when the
  // user presses Close or Escape. It does not close the overlay: the caller
  // decides, then calls close().
  openOverlay(onUserClose: () => void): Overlay;
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
const BAR_CSS =
  "flex:0 0 auto;display:flex;justify-content:flex-end;padding:calc(4px + env(safe-area-inset-top, 0px)) 4px 4px;";
const CLOSE_CSS =
  "background:transparent;border:0;color:#fff;font:600 14px system-ui,sans-serif;padding:8px 12px;cursor:pointer;";
const IFRAME_CSS = "flex:1 1 auto;width:100%;height:100%;border:0;";

export function createDomFrame(origin: string): Frame {
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
    document.body.appendChild(host);
  };

  return {
    mount(url) {
      window.addEventListener("message", onWindowMessage);
      if (document.body) {
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

    openOverlay(onUserClose) {
      closeOverlay?.();
      if (!host || !iframe) return { close() {} };
      const overlayHost = host;
      const overlayFrame = iframe;
      const previousFocus = document.activeElement as HTMLElement | null;

      // Most Lucra screens have no exit of their own, so the SDK draws one.
      const bar = document.createElement("div");
      bar.style.cssText = BAR_CSS;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Close";
      button.setAttribute("aria-label", "Close");
      button.style.cssText = CLOSE_CSS;
      button.addEventListener("click", onUserClose);
      bar.appendChild(button);
      overlayHost.insertBefore(bar, overlayFrame);

      overlayHost.style.cssText = OVERLAY_CSS;
      overlayHost.setAttribute("role", "dialog");
      overlayHost.setAttribute("aria-modal", "true");
      overlayHost.setAttribute("aria-label", "Lucra");

      // Escape only reaches this listener while focus is outside the frame.
      // The Close button covers the other case.
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === "Escape") onUserClose();
      };
      document.addEventListener("keydown", onKeydown);
      overlayFrame.focus();

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (closeOverlay === close) closeOverlay = null;
        document.removeEventListener("keydown", onKeydown);
        bar.remove();
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
