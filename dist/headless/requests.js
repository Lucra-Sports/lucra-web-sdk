import { LucraClientMessageType, } from "../types/types.js";
import { LucraError, LucraErrorCode, fromApiError, } from "./errors.js";
// Lucra reports a failed request with one of these instead of the response.
const ERROR_TYPES = new Set([
    LucraClientMessageType.apiRequestError,
    LucraClientMessageType.joinTournamentError,
    LucraClientMessageType.autoJoinTournamentsError,
]);
// Unique per page load. crypto.randomUUID needs a secure context, so a counter it is.
let lastRequestId = 0;
export function createRequests(options) {
    const pending = new Map();
    const take = (requestId) => {
        const entry = pending.get(requestId);
        if (entry) {
            clearTimeout(entry.timer);
            pending.delete(requestId);
        }
        return entry;
    };
    const startTimer = (requestId, timeoutMs) => setTimeout(() => {
        const entry = take(requestId);
        if (!entry)
            return;
        try {
            options.onTimeout?.(entry.spec.type, entry.timeoutMs);
        }
        catch {
            // Reporting is best effort. The request must still reject.
        }
        entry.reject(new LucraError(LucraErrorCode.TIMEOUT, undefined, {
            outcomeUnknown: entry.spec.kind === "write",
        }));
    }, timeoutMs);
    return {
        send(spec, body, timeoutMs = options.timeoutMs) {
            const requestId = String(++lastRequestId);
            return new Promise((resolve, reject) => {
                pending.set(requestId, {
                    spec: spec,
                    resolve: resolve,
                    reject,
                    timer: startTimer(requestId, timeoutMs),
                    timeoutMs,
                    sentAt: Date.now(),
                });
                try {
                    options.post({ type: spec.type, body: body ?? null, requestId });
                }
                catch (cause) {
                    // For example a body that cannot be cloned. Nothing was sent.
                    take(requestId);
                    reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, undefined, {
                        cause,
                        hint: "The request could not be sent to Lucra. Pass only plain data.",
                    }));
                }
            });
        },
        handle(message) {
            // Lucra copies the requestId onto its answer. An answer with no id, or an
            // id that is no longer pending, belongs to nothing we are waiting for.
            if (message.requestId === undefined)
                return false;
            const entry = pending.get(message.requestId);
            if (!entry)
                return false;
            if (ERROR_TYPES.has(message.type)) {
                take(message.requestId);
                entry.reject(fromApiError(message.data, entry.spec));
                return true;
            }
            if (message.type !== entry.spec.responseType)
                return false;
            if (entry.spec.interim?.(message.data)) {
                // "Not yet": keep waiting and restart the clock, but only until the
                // absolute deadline, so a responder stuck saying "not yet" still times out.
                if (entry.spec.maxTimeoutMs === undefined ||
                    Date.now() - entry.sentAt < entry.spec.maxTimeoutMs) {
                    clearTimeout(entry.timer);
                    entry.timer = startTimer(message.requestId, entry.timeoutMs);
                }
                return true;
            }
            take(message.requestId);
            entry.resolve(message.data);
            return true;
        },
        rejectAll(code) {
            for (const requestId of [...pending.keys()]) {
                const entry = take(requestId);
                entry?.reject(new LucraError(code, undefined, {
                    outcomeUnknown: entry.spec.kind === "write",
                }));
            }
        },
        pendingCount() {
            return pending.size;
        },
    };
}
