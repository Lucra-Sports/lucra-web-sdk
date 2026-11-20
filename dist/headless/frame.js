import { POPUP_HEIGHT, POPUP_WIDTH, openPopupWindow, trackPopup, } from "../popup.js";
import { LUCRA_POPUP_MESSAGE_TYPE } from "../types/types.js";
// True when there is a page to work with. False on a server.
export function hasDom() {
    return typeof window !== "undefined" && typeof document !== "undefined";
}
// The origin of the page that embeds Lucra.
export function pageOrigin() {
    return window.location.origin;
}
// Stands in for the frame where there is no page. It does nothing.
export function createNullFrame() {
    return {
        mount() { },
        reload() { },
        post() { },
        onMessage: () => () => { },
        openOverlay: () => ({ close() { } }),
        openPopup() {
            throw new Error("No browser");
        },
        destroy() { },
    };
}
// Every LucraPresentation, to check a value at run time.
export const PRESENTATIONS = ["fullScreen", "modal", "sheet"];
const HOST_ID = "lucra-headless-host";
// Same permissions the existing client grants its frame. The last three are for
// games shown inside Lucra.
const FRAME_ALLOW = "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment; " +
    "fullscreen *; autoplay *; encrypted-media *;";
const HIDDEN_CSS = "display:none;";
// Above everything on the host page.
const COVER_CSS = "position:fixed;inset:0;z-index:2147483647;display:flex;";
// Padded so iOS bars and the notch do not cover Lucra's own controls.
const SAFE_AREA_CSS = "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
const OVERLAY_CSS = COVER_CSS + "flex-direction:column;background:#000;" + SAFE_AREA_CSS + "box-sizing:border-box;";
const CONTAINED_CSS = "display:block;width:100%;height:100%;";
// Block, so an inline frame's baseline gap cannot overflow the container.
const IFRAME_CSS = "display:block;flex:1 1 auto;width:100%;height:100%;border:0;";
// 640px is Tailwind's sm, where Lucra's web app switches its own dialogs.
const WIDE_QUERY = "(min-width: 640px)";
// Half black, the backdrop of the drawer in Lucra's web app (bg-black/50).
const BACKDROP_CSS = COVER_CSS + "box-sizing:border-box;background:rgba(0,0,0,.5);";
// Black like full screen, so the dimmed page never shows through the panel.
const PANEL_CSS = "display:block;flex:none;border:0;background:#000;";
// The width of the Add Funds window, a size Lucra screens already show at.
const PANEL_WIDTH = `width:min(${POPUP_WIDTH}px,100%);`;
// The host and frame styles for a presentation on a wide or a narrow window.
function layout(presentation, wide) {
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
            iframe: PANEL_CSS +
                "box-sizing:border-box;" +
                PANEL_WIDTH +
                "height:100%;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) 0;",
        };
    }
    if (presentation === "sheet") {
        // The panel reaches the bottom edge. Its own padding keeps Lucra above the
        // iOS home indicator.
        return {
            host: BACKDROP_CSS +
                "flex-direction:column;justify-content:flex-end;" +
                "padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);",
            iframe: PANEL_CSS +
                // 96px is the gap the bottom drawer in Lucra's web app leaves above it
                // (6rem there). Pixels, because rem would follow the host page's font size.
                "box-sizing:border-box;width:100%;height:calc(100% - 96px);" +
                "padding-bottom:env(safe-area-inset-bottom);",
        };
    }
    // Full screen, and a modal on a narrow window.
    return { host: OVERLAY_CSS, iframe: IFRAME_CSS };
}
// With a container, the frame lives and shows there. Without one, it lives in
// the body and each screen shows full screen, or as a modal or sheet over the
// dimmed page. Only styles change, never where the frame is, since moving it
// would reload Lucra.
export function createDomFrame(origin, container) {
    let host = null;
    let iframe = null;
    let destroyed = false;
    let closeOverlay = null;
    const listeners = new Set();
    const onWindowMessage = (event) => {
        if (event.origin !== origin)
            return;
        const data = event.data;
        if (!data || typeof data !== "object" || typeof data.type !== "string")
            return;
        let message;
        if (data.type === LUCRA_POPUP_MESSAGE_TYPE) {
            // The Add Funds popup posts a flat envelope from its own window.
            message = {
                type: data.type,
                data: { toastType: data.toastType, message: data.message },
            };
        }
        else {
            // Everything else must come from our own frame, not from another Lucra
            // frame or window on the page.
            if (!iframe || event.source !== iframe.contentWindow)
                return;
            message = {
                type: data.type,
                data: data.data,
                requestId: typeof data.requestId === "string" ? data.requestId : undefined,
            };
        }
        for (const listener of [...listeners])
            listener(message);
    };
    const attach = (url) => {
        if (destroyed || host)
            return;
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
            }
            else {
                document.addEventListener("DOMContentLoaded", () => attach(url), {
                    once: true,
                });
            }
        },
        reload(url) {
            if (!iframe)
                return;
            // Setting src on a loaded frame adds a browser history entry, so Back
            // would first rewind the hidden frame. Replacing the location does not.
            try {
                if (iframe.contentWindow) {
                    iframe.contentWindow.location.replace(url);
                    return;
                }
            }
            catch {
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
        openOverlay(presentation = "fullScreen") {
            closeOverlay?.();
            if (!host || !iframe)
                return { close() { } };
            const overlayHost = host;
            const overlayFrame = iframe;
            const previousFocus = document.activeElement;
            // A modal and a sheet change shape with the window width. Full screen and
            // a container do not.
            const media = container || presentation === "fullScreen" ? null : window.matchMedia(WIDE_QUERY);
            const fit = () => {
                const css = layout(presentation, media?.matches === true);
                overlayHost.style.cssText = css.host;
                overlayFrame.style.cssText = css.iframe;
            };
            if (container) {
                // A div with no role cannot be named. The frame's own title names it.
                overlayHost.style.cssText = CONTAINED_CSS;
            }
            else {
                // It covers the page, or dims it behind a panel, so it is a modal dialog.
                fit();
                media?.addEventListener("change", fit);
                overlayHost.setAttribute("role", "dialog");
                overlayHost.setAttribute("aria-modal", "true");
                overlayHost.setAttribute("aria-label", "Lucra");
            }
            overlayFrame.focus();
            const close = () => {
                // Only the overlay on show can close. A late close of an older one does nothing.
                if (closeOverlay !== close)
                    return;
                closeOverlay = null;
                media?.removeEventListener("change", fit);
                overlayHost.style.cssText = HIDDEN_CSS;
                overlayFrame.style.cssText = IFRAME_CSS;
                overlayHost.removeAttribute("role");
                overlayHost.removeAttribute("aria-modal");
                overlayHost.removeAttribute("aria-label");
                previousFocus?.focus?.();
            };
            closeOverlay = close;
            return { close };
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
                    }
                    catch {
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
