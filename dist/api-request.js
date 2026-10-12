const API_REQUEST_TIMEOUT_MS = 15_000;
// Unique per page load. crypto.randomUUID needs a secure context, so a counter it is.
let lastRequestId = 0;
/**
 * Creates a request/response pair backed by promises. Each `send` posts the message with
 * a fresh `requestId`, which the web-app echoes on its response so concurrent calls settle
 * independently. Every request times out on its own after `timeoutMs`. With `singleFlight`
 * a new `send` cancels any pending request with `cancelReason` instead.
 */
export function createApiRequest({ type, responseType, cancelReason, sendMessage, singleFlight = false, timeoutMs = API_REQUEST_TIMEOUT_MS, }) {
    // Insertion order is send order, which the id-less fallback relies on.
    const pending = new Map();
    const take = (requestId) => {
        const id = requestId ?? pending.keys().next().value;
        if (id === undefined)
            return undefined;
        const entry = pending.get(id);
        if (entry) {
            clearTimeout(entry.timer);
            pending.delete(id);
        }
        return entry;
    };
    return {
        type,
        responseType,
        send: (body) => {
            // Single-flight keeps at most one request pending, so cancelling the oldest is enough.
            if (singleFlight)
                take()?.reject(cancelReason);
            const requestId = String(++lastRequestId);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => take(requestId)?.reject("Timeout"), timeoutMs);
                pending.set(requestId, { resolve, reject, timer });
                sendMessage({ type, body: body ?? null, requestId });
            });
        },
        resolve: (data, requestId) => take(requestId)?.resolve(data),
        reject: (reason, requestId) => take(requestId)?.reject(reason),
    };
}
