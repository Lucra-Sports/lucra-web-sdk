import {
  POPUP_HEIGHT,
  POPUP_WIDTH,
  openPopupWindow,
  trackPopup,
  type LucraPopupHandle,
} from "../popup.js";
import { LUCRA_POPUP_MESSAGE_TYPE, type MessageTypeToLucraClient } from "../types/types.js";
import type { LucraPresentation } from "./types.js";

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

export type Overlay = {
  close(): void;
  // Sizes a bottom sheet to Lucra's content, `height` CSS pixels without the
  // safe area, and shows it. Other presentations ignore it.
  setContentHeight(height: number): void;
};

// An open popup window. `focus` brings it in front of the page and returns
// true. When the window is already closed, it closes the handle and returns false.
export type Popup = LucraPopupHandle & { focus(): boolean };

// Everything the client needs from the page. This file implements it with the
// DOM. Tests use the fake in testing.ts. No other file may touch the DOM.
export type Frame = {
  // Creates the hidden frame in the body and loads `url`. Safe to call before
  // <body> exists.
  mount(url: string): void;
  // Loads `url` in the existing frame. The Lucra app starts over.
  reload(url: string): void;
  post(message: OutboundMessage): void;
  onMessage(listener: (message: InboundMessage) => void): () => void;
  // Shows the frame over the page in `presentation`. It draws no exit: Lucra
  // shows its own, and the app can call present.dismiss().
  openOverlay(presentation: LucraPresentation): Overlay;
  // Opens a real popup window. Throws when the browser blocks it.
  openPopup(url: string): Popup;
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

// An overlay that shows nothing.
const NO_OVERLAY: Overlay = { close() {}, setContentHeight() {} };

// Stands in for the frame where there is no page. It does nothing.
export function createNullFrame(): Frame {
  return {
    mount() {},
    reload() {},
    post() {},
    onMessage: () => () => {},
    openOverlay: () => NO_OVERLAY,
    openPopup() {
      throw new Error("No browser");
    },
    destroy() {},
  };
}

// Every LucraPresentation, to check a value at run time.
export const PRESENTATIONS: readonly LucraPresentation[] = [
  "fullScreen",
  "modal",
  "sheet",
  "bottomSheet",
];
// How long a bottom sheet stays hidden waiting for Lucra's height. A screen or
// a Lucra app that never sends one still shows, at the full height of a sheet.
const CONTENT_HEIGHT_FALLBACK_MS = 1000;

const HOST_ID = "lucra-headless-host";
// Same permissions the existing client grants its frame. The last three are for
// games shown inside Lucra.
const FRAME_ALLOW =
  "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment; " +
  "fullscreen *; autoplay *; encrypted-media *;";
const HIDDEN_CSS = "display:none;";
// Above everything on the host page.
const COVER_CSS = "position:fixed;inset:0;z-index:2147483647;display:flex;";
// Padded so iOS bars and the notch do not cover Lucra's own controls.
const SAFE_AREA_CSS =
  "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
const OVERLAY_CSS =
  COVER_CSS + "flex-direction:column;background:#000;" + SAFE_AREA_CSS + "box-sizing:border-box;";
// Fills the full screen host, a flex column.
const IFRAME_CSS = "display:block;flex:1 1 auto;width:100%;height:100%;border:0;";

// 640px is Tailwind's sm, where Lucra's web app switches its own dialogs.
const WIDE_QUERY = "(min-width: 640px)";
// Half black, the backdrop of the drawer in Lucra's web app (bg-black/50).
const BACKDROP_CSS = COVER_CSS + "box-sizing:border-box;background:rgba(0,0,0,.5);";
// Black like full screen, so the dimmed page never shows through the panel.
const PANEL_CSS = "display:block;flex:none;border:0;background:#000;";
// The width of the Add Funds window, a size Lucra screens already show at.
const PANEL_WIDTH = `width:min(${POPUP_WIDTH}px,100%);`;
// A panel up from the bottom reaches the bottom edge. Its own padding keeps
// Lucra above the iOS home indicator.
const BOTTOM_HOST_CSS = BACKDROP_CSS + "flex-direction:column;justify-content:flex-end;";
const BOTTOM_HOST_PADDING =
  "padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);";
// 96px is the gap the bottom drawer in Lucra's web app leaves above it (6rem
// there). Pixels, because rem would follow the host page's font size.
const SHEET_HEIGHT = "calc(100% - 96px)";

// The host and frame styles for a presentation on a wide or a narrow window.
function layout(presentation: Exclude<LucraPresentation, "bottomSheet">, wide: boolean) {
  if (presentation === "modal" && wide) {
    return {
      host: BACKDROP_CSS + SAFE_AREA_CSS + "align-items:center;justify-content:center;",
      // The height of the Add Funds window.
      iframe: PANEL_CSS + PANEL_WIDTH + `height:min(${POPUP_HEIGHT}px,100%);`,
    };
  }
  if (presentation === "sheet" && wide) {
    // The panel reaches the top, right, and bottom edges. Its own padding keeps
    // Lucra clear of the notch and the iOS home indicator.
    return {
      host: BACKDROP_CSS + "justify-content:flex-end;",
      iframe:
        PANEL_CSS +
        "box-sizing:border-box;" +
        PANEL_WIDTH +
        "height:100%;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) 0;",
    };
  }
  if (presentation === "sheet") {
    return {
      host: BOTTOM_HOST_CSS + BOTTOM_HOST_PADDING,
      iframe:
        PANEL_CSS +
        `box-sizing:border-box;width:100%;height:${SHEET_HEIGHT};` +
        "padding-bottom:env(safe-area-inset-bottom);",
    };
  }
  // Full screen, and a modal on a narrow window.
  return { host: OVERLAY_CSS, iframe: IFRAME_CSS };
}

// The bottom sheet's height: Lucra's content height in CSS pixels, "fallback"
// when Lucra never sent one, or null while it waits for one.
type SheetHeight = number | "fallback" | null;

// The bottom sheet is the same at every width: up from the bottom, as wide as
// the Add Funds window, and no taller than a sheet.
function bottomSheetLayout(height: SheetHeight) {
  let heightCss: string;
  if (height === null) {
    // Laid out at its real width so Lucra can measure itself, but not painted.
    heightCss = `height:${SHEET_HEIGHT};visibility:hidden;`;
  } else if (height === "fallback") {
    heightCss = `height:${SHEET_HEIGHT};`;
  } else {
    // The padding below Lucra's content adds the safe area.
    heightCss = `height:calc(${height}px + env(safe-area-inset-bottom));`;
  }
  return {
    host: BOTTOM_HOST_CSS + "align-items:center;" + BOTTOM_HOST_PADDING,
    iframe:
      PANEL_CSS +
      "box-sizing:border-box;" +
      PANEL_WIDTH +
      `max-height:${SHEET_HEIGHT};` +
      "padding-bottom:env(safe-area-inset-bottom);border-radius:24px 24px 0 0;" +
      heightCss,
  };
}

// The frame lives in the body. Each screen shows full screen, or as a modal, a
// sheet, or a bottom sheet over the dimmed page. Only styles change, never
// where the frame is, since moving it would reload Lucra. Tests pass a short
// `fallbackMs`.
export function createDomFrame(
  origin: string,
  fallbackMs = CONTENT_HEIGHT_FALLBACK_MS
): Frame {
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
      if (!iframe) return;
      // Setting src on a loaded frame adds a browser history entry, so Back
      // would first rewind the hidden frame. Replacing the location does not.
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.location.replace(url);
          return;
        }
      } catch {
        // Fall back to src below.
      }
      iframe.src = url;
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

    openOverlay(presentation) {
      closeOverlay?.();
      if (!host || !iframe) return NO_OVERLAY;
      const overlayHost = host;
      const overlayFrame = iframe;
      const previousFocus = document.activeElement as HTMLElement | null;
      const bottomSheet = presentation === "bottomSheet";
      // A modal and a sheet change shape with the window width. Full screen and
      // the bottom sheet do not.
      const media =
        presentation === "fullScreen" || bottomSheet ? null : window.matchMedia(WIDE_QUERY);
      let height: SheetHeight = null;
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      const fit = () => {
        const css = bottomSheet
          ? bottomSheetLayout(height)
          : layout(presentation, media?.matches === true);
        overlayHost.style.cssText = css.host;
        overlayFrame.style.cssText = css.iframe;
      };
      // Shows a bottom sheet at `next`. A hidden frame cannot take focus, so it
      // takes it now.
      const resize = (next: number | "fallback") => {
        const hidden = height === null;
        height = next;
        clearTimeout(fallbackTimer);
        fit();
        if (hidden) overlayFrame.focus();
      };

      // It covers the page, or dims it behind a panel, so it is a modal dialog.
      fit();
      media?.addEventListener("change", fit);
      overlayHost.setAttribute("role", "dialog");
      overlayHost.setAttribute("aria-modal", "true");
      overlayHost.setAttribute("aria-label", "Lucra");
      if (bottomSheet) fallbackTimer = setTimeout(() => resize("fallback"), fallbackMs);
      else overlayFrame.focus();

      const close = () => {
        // Only the overlay on show can close. A late close of an older one does nothing.
        if (closeOverlay !== close) return;
        closeOverlay = null;
        clearTimeout(fallbackTimer);
        media?.removeEventListener("change", fit);
        overlayHost.style.cssText = HIDDEN_CSS;
        overlayFrame.style.cssText = IFRAME_CSS;
        overlayHost.removeAttribute("role");
        overlayHost.removeAttribute("aria-modal");
        overlayHost.removeAttribute("aria-label");
        previousFocus?.focus?.();
      };
      closeOverlay = close;
      return {
        close,
        setContentHeight(contentHeight) {
          if (bottomSheet && closeOverlay === close) resize(contentHeight);
        },
      };
    },

    openPopup(url) {
      const win = openPopupWindow(url);
      const popup = trackPopup(win);
      return {
        ...popup,
        focus() {
          // The user may have closed it since the last poll.
          if (win.closed) {
            popup.close();
            return false;
          }
          try {
            win.focus();
          } catch {
            // Some browsers refuse. The window stays open either way.
          }
          return true;
        },
      };
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
