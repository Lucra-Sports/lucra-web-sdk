const API_REQUEST_TIMEOUT_MS = 15_000;
/**
 * Creates a single-flight request/response pair backed by a promise.
 * A new `send` cancels any in-flight request, times out after 15s, and the
 * matching `resolve` (called from the iframe message listener) settles it.
 */
export function createApiRequest({ type, cancelReason, sendMessage, }) {
    let pendingResolve;
    let pendingReject;
    let timer;
    const clear = () => {
        if (timer) {
            clearTimeout(timer);
        }
        pendingResolve = undefined;
        pendingReject = undefined;
        timer = undefined;
    };
    return {
        send: (body) => {
            pendingReject?.(cancelReason);
            clear();
            const promise = new Promise((resolve, reject) => {
                pendingResolve = resolve;
                pendingReject = reject;
                sendMessage({ type, body: body ?? null });
            });
            timer = setTimeout(() => {
                pendingReject?.("Timeout");
                clear();
            }, API_REQUEST_TIMEOUT_MS);
            return promise;
        },
        resolve: (data) => {
            pendingResolve?.(data);
            clear();
        },
    };
}
