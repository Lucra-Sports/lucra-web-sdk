import { openPopupWindow, trackPopup } from "../popup.js";
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
const HOST_ID = "lucra-headless-host";
// Same permissions the existing client grants its frame. The last three are for
// games shown inside Lucra.
const FRAME_ALLOW = "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment; " +
    "fullscreen *; autoplay *; encrypted-media *;";
const HIDDEN_CSS = "display:none;";
// Padded so iOS bars and the notch do not cover Lucra's own controls.
const OVERLAY_CSS = "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:#000;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box;";
const CONTAINED_CSS = "display:block;width:100%;height:100%;";
// Block, so an inline frame's baseline gap cannot overflow the container.
const IFRAME_CSS = "display:block;flex:1 1 auto;width:100%;height:100%;border:0;";
// With a container, the frame lives and shows there. Without one, it lives in
// the body and shows full screen.
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
        openOverlay() {
            closeOverlay?.();
            if (!host || !iframe)
                return { close() { } };
            const overlayHost = host;
            const previousFocus = document.activeElement;
            if (container) {
                // A div with no role cannot be named. The frame's own title names it.
                overlayHost.style.cssText = CONTAINED_CSS;
            }
            else {
                // Full screen covers the page, so it is a modal dialog.
                overlayHost.style.cssText = OVERLAY_CSS;
                overlayHost.setAttribute("role", "dialog");
                overlayHost.setAttribute("aria-modal", "true");
                overlayHost.setAttribute("aria-label", "Lucra");
            }
            iframe.focus();
            const close = () => {
                // Only the overlay on show can close. A late close of an older one does nothing.
                if (closeOverlay !== close)
                    return;
                closeOverlay = null;
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
