// Fullscreen overlay applied to the iframe's host element while a dialog is open.
const DIALOG_HOST_CSS = "position:fixed;inset:0;z-index:2147483647;display:block;background:#000;";
// Presents `host` as a fullscreen overlay and returns a handle. `present` runs
// the open side effects (e.g. show the iframe, navigate); `dismiss` runs the
// close side effects (e.g. hide the iframe). Escape and the returned close()
// both tear the dialog down and restore the host's prior inline styles. close()
// is idempotent.
export function createDialog(host, present, dismiss) {
    const previousCss = host.style.cssText;
    host.style.cssText = DIALOG_HOST_CSS;
    // If `present` throws (e.g. redirect().deepLink() rejects a bad URL), restore
    // the host and undo the partial open before rethrowing — no handle is returned
    // on throw, so there would otherwise be no way to dismiss the overlay.
    try {
        present();
    }
    catch (error) {
        host.style.cssText = previousCss;
        dismiss();
        throw error;
    }
    const controller = new AbortController();
    const onCloseCallbacks = new Set();
    let closed = false;
    const dialog = {
        close: () => {
            if (closed)
                return;
            closed = true;
            controller.abort();
            host.style.cssText = previousCss;
            dismiss();
            onCloseCallbacks.forEach((callback) => callback());
            onCloseCallbacks.clear();
        },
        onClose: (callback) => {
            onCloseCallbacks.add(callback);
        },
    };
    // Escape on the parent document. It does not fire while focus is inside the
    // (cross-origin) iframe, which receives its own key events; the in-app close
    // control covers that case. Removed via controller.signal when the dialog closes.
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape")
            dialog.close();
    }, { signal: controller.signal });
    return dialog;
}
