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
    const startTimer = (requestId) => setTimeout(() => {
        const entry = take(requestId);
        if (!entry)
            return;
        try {
            options.onTimeout?.(entry.type, options.timeoutMs);
        }
        catch {
            // Reporting is best effort. The request must still reject.
        }
        entry.reject(new LucraError(LucraErrorCode.TIMEOUT, undefined, {
            outcomeUnknown: entry.kind === "write",
        }));
    }, options.timeoutMs);
    return {
        send(spec, body) {
            const requestId = String(++lastRequestId);
            return new Promise((resolve, reject) => {
                pending.set(requestId, {
                    type: spec.type,
                    responseType: spec.responseType,
                    kind: spec.kind,
                    unknownOnApiError: spec.unknownOnApiError === true,
                    interim: spec.interim,
                    maxTimeoutMs: spec.maxTimeoutMs,
                    resolve: resolve,
                    reject,
                    timer: startTimer(requestId),
                    sentAt: Date.now(),
                });
                try {
                    options.post({ type: spec.type, body: body ?? null, requestId });
                }
                catch (cause) {
                    // For example a body that cannot be cloned. Nothing was sent.
                    take(requestId);
                    reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, "The request could not be sent", { cause }));
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
                entry.reject(fromApiError(message.data, {
                    kind: entry.kind,
                    unknownOnApiError: entry.unknownOnApiError,
                }));
                return true;
            }
            if (message.type !== entry.responseType)
                return false;
            if (entry.interim?.(message.data)) {
                // "Not yet": keep waiting and restart the clock, but only until the
                // absolute deadline, so a responder stuck saying "not yet" still times out.
                if (entry.maxTimeoutMs === undefined ||
                    Date.now() - entry.sentAt < entry.maxTimeoutMs) {
                    clearTimeout(entry.timer);
                    entry.timer = startTimer(message.requestId);
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
                    outcomeUnknown: entry.kind === "write",
                }));
            }
        },
        pendingCount() {
            return pending.size;
        },
    };
}
