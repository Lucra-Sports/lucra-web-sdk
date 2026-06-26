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
    present();
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
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape")
            dialog.close();
    }, { signal: controller.signal });
    return dialog;
}
