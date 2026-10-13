import { LucraApiError } from "./errors.js";
import { LucraApiErrorCode, } from "./types/types.js";
const API_REQUEST_TIMEOUT_MS = 15_000;
// Unique per page load. crypto.randomUUID needs a secure context, so a counter it is.
let lastRequestId = 0;
// Reason a single-flight request is rejected with when a newer one supersedes it.
export const cancelReason = (name) => `Cancelled by new ${name} request`;
/**
 * Creates a request/response pair backed by promises. Each `send` posts the message with
 * a fresh `requestId`, which the web-app echoes on its response so concurrent calls settle
 * independently. Every request times out on its own after `timeoutMs`. With `singleFlight`
 * a new `send` cancels any pending request instead. With `rejectWhilePending` a new `send`
 * is refused with `NOT_ALLOWED` and posts nothing, so a write already running is never
 * duplicated. A `sendMessage` that throws (e.g. a payload that cannot be cloned) rejects
 * that request at once instead of leaving it to time out.
 */
export function createApiRequest({ type, responseType, name, sendMessage, singleFlight = false, rejectWhilePending = false, timeoutMs = API_REQUEST_TIMEOUT_MS, }) {
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
                take()?.reject(cancelReason(name));
            if (rejectWhilePending && pending.size > 0) {
                return Promise.reject(new LucraApiError(LucraApiErrorCode.notAllowed, `Another ${name} request is already in progress`));
            }
            const requestId = String(++lastRequestId);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => take(requestId)?.reject("Timeout"), timeoutMs);
                pending.set(requestId, { resolve, reject, timer });
                try {
                    sendMessage({ type, body: body ?? null, requestId });
                }
                catch (e) {
                    take(requestId)?.reject(e);
                }
            });
        },
        resolve: (data, requestId) => take(requestId)?.resolve(data),
        reject: (reason, requestId) => take(requestId)?.reject(reason),
        rejectAll: (reason) => {
            while (pending.size > 0)
                take()?.reject(reason);
        },
        hasPending: () => pending.size > 0,
    };
}
