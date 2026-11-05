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
 * that request at once instead of leaving it to time out. `onTimeout` runs once per request
 * that times out, before its promise rejects. With `interim` a response the predicate
 * accepts is treated as "not the answer yet": it leaves the request pending for the real
 * response the web-app will send on the same `requestId`. `maxTimeoutMs` bounds that from
 * the original `send`: past it an interim no longer extends the request, so a responder
 * stuck answering "not yet" still times out instead of hanging the caller's promise.
 */
export function createApiRequest({ type, responseType, name, sendMessage, singleFlight = false, rejectWhilePending = false, timeoutMs = API_REQUEST_TIMEOUT_MS, onTimeout, interim, maxTimeoutMs, }) {
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
    const startTimer = (requestId) => setTimeout(() => {
        const entry = take(requestId);
        if (!entry)
            return;
        try {
            onTimeout?.(timeoutMs);
        }
        catch {
            // Reporting is best-effort; the request must still reject.
        }
        entry.reject("Timeout");
    }, timeoutMs);
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
                pending.set(requestId, {
                    resolve,
                    reject,
                    timer: startTimer(requestId),
                    sentAt: Date.now(),
                });
                try {
                    sendMessage({ type, body: body ?? null, requestId });
                }
                catch (e) {
                    take(requestId)?.reject(e);
                }
            });
        },
        resolve: (data, requestId) => {
            const id = requestId ?? pending.keys().next().value;
            if (id === undefined)
                return;
            const entry = pending.get(id);
            if (!entry)
                return;
            if (interim?.(data)) {
                // An interim answer says the responder is still working and will answer again on
                // this id, so the request stays pending. The clock restarts from the interim
                // answer rather than running from the send: a slow but progressing responder
                // should not reject with "Timeout", which tells a host nothing it can act on.
                // Only until the absolute deadline, though. A responder that latches "not yet"
                // would otherwise extend the wait forever and leave the caller's promise hanging
                // with nothing to show the user, which is worse than the timeout it replaced.
                // Past the deadline the interim is ignored and the running timer rejects as usual.
                if (maxTimeoutMs === undefined || Date.now() - entry.sentAt < maxTimeoutMs) {
                    clearTimeout(entry.timer);
                    entry.timer = startTimer(id);
                }
                return;
            }
            take(id)?.resolve(data);
        },
        reject: (reason, requestId) => take(requestId)?.reject(reason),
        rejectAll: (reason) => {
            while (pending.size > 0)
                take()?.reject(reason);
        },
        hasPending: () => pending.size > 0,
    };
}
