// Name reused for the popup so a second popup() reuses the same window slot.
const POPUP_WINDOW_NAME = "lucrasports:deposit:popup";
const POPUP_WIDTH = 430;
const POPUP_HEIGHT = 800;
// Centered popup window features, mirroring lucra-web-app's openAddFundsPopup.
function popupFeatures() {
    const left = window.screenX + (window.innerWidth - POPUP_WIDTH) / 2;
    const top = window.screenY + (window.innerHeight - POPUP_HEIGHT) / 2;
    return `left=${left},top=${top},width=${POPUP_WIDTH},height=${POPUP_HEIGHT},resizable,scrollbars=yes,status=1`;
}
// Opens `url` in a real popup window and returns a handle. window.open returns
// null when the browser blocks the popup, which happens unless this runs inside
// a user gesture (e.g. a click handler) -- surface that as a clear error rather
// than silently doing nothing. The popup self-closes when the web app finishes a
// deposit; polling window.closed covers that and the user dismissing it. close()
// is idempotent; resolve() records a result then closes so onClose(result) fires.
// pollMs is overridable so tests can poll faster than the 500ms default.
export function createPopup(url, pollMs = 500) {
    const win = window.open(url, POPUP_WINDOW_NAME, popupFeatures());
    if (!win) {
        throw new Error("Unable to open the Lucra popup. Popups must be opened from a user gesture (e.g. a click handler) and may be blocked by the browser.");
    }
    const onCloseCallbacks = new Set();
    let closed = false;
    let result;
    let interval;
    const popup = {
        close: () => {
            if (closed)
                return;
            closed = true;
            if (interval)
                clearInterval(interval);
            try {
                win.close();
            }
            catch (e) {
                console.error("Error closing the Lucra popup", e);
            }
            onCloseCallbacks.forEach((callback) => callback(result));
            onCloseCallbacks.clear();
        },
        onClose: (callback) => {
            onCloseCallbacks.add(callback);
        },
        resolve: (value) => {
            result = value;
            popup.close();
        },
    };
    interval = setInterval(() => {
        if (win.closed)
            popup.close();
    }, pollMs);
    return popup;
}
