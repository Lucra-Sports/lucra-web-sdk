import { LucraClientMessageType, MessageTypeToLucraClient, } from "../types/types.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
const SUBSCRIBE = {
    type: MessageTypeToLucraClient.subscribeMatchupDetailsRequest,
    responseType: LucraClientMessageType.subscribeMatchupDetailsResponse,
    kind: "read",
};
export function createWatch(options) {
    const { session } = options;
    // Lucra keeps one subscription at a time, so the client does too.
    let active = null;
    // Bumped on every subscribe and cancel, so a superseded subscribe never activates.
    let generation = 0;
    let destroyed = false;
    const update = (listener, details) => {
        try {
            listener.handlers.onUpdate(details);
        }
        catch (e) {
            console.error("Lucra watch listener threw an error", e);
        }
    };
    const deliver = (target, details) => {
        target.latest = details;
        for (const listener of [...target.listeners])
            update(listener, details);
    };
    // Ends the watch for everyone listening to it.
    const fail = (target, error) => {
        const listeners = [...target.listeners];
        target.listeners.clear();
        if (active === target)
            active = null;
        for (const listener of listeners) {
            try {
                listener.handlers.onError?.(error);
            }
            catch (e) {
                console.error("Lucra watch listener threw an error", e);
            }
        }
    };
    const subscribe = (target) => {
        const mine = ++generation;
        const stale = () => destroyed || mine !== generation || active !== target;
        session
            .whenConnected()
            .then(() => {
            if (stale())
                return undefined;
            return session
                .request(SUBSCRIBE, { matchupId: target.requestedId })
                .then((details) => {
                if (stale())
                    return;
                target.resolvedId = details.matchup.id;
                deliver(target, details);
            });
        })
            .catch((error) => {
            if (stale())
                return;
            // Lucra restarted while subscribing. The connected listener below
            // subscribes again.
            if (isLucraError(error) && error.code === LucraErrorCode.CONNECTION_RESET) {
                return;
            }
            // A subscribe that failed or timed out can still take hold inside Lucra.
            // Nothing newer has subscribed, and this goes out before onError can
            // start another watch, so it cancels only this one.
            session.post(MessageTypeToLucraClient.cancelMatchupDetailsSubscription, null);
            fail(target, isLucraError(error)
                ? error
                : new LucraError(LucraErrorCode.API_ERROR, undefined, { cause: error }));
        });
    };
    const unsubscribes = [
        // A restart drops Lucra's subscription, so ask again.
        session.onConnected(() => {
            if (active)
                subscribe(active);
        }),
        session.on(LucraClientMessageType.matchupDetailsUpdated, (data) => {
            const details = data;
            // Only the active watch's updates count. Ones for a replaced or stopped
            // matchup can still arrive for a moment.
            if (!active || active.resolvedId === null)
                return;
            if (details?.matchup?.id !== active.resolvedId)
                return;
            deliver(active, details);
        }),
    ];
    return {
        watch(matchupId, handlers) {
            const listener = { handlers };
            if (destroyed || session.status() === "destroyed") {
                queueMicrotask(() => handlers.onError?.(new LucraError(LucraErrorCode.DESTROYED)));
                return { stop() { } };
            }
            let target;
            if (active && active.requestedId === matchupId) {
                // Same matchup: share the subscription and catch the newcomer up.
                target = active;
                target.listeners.add(listener);
                const latest = target.latest;
                if (latest) {
                    queueMicrotask(() => {
                        if (target.listeners.has(listener))
                            update(listener, latest);
                    });
                }
            }
            else {
                const previous = active;
                target = {
                    requestedId: matchupId,
                    resolvedId: null,
                    listeners: new Set([listener]),
                    latest: null,
                };
                active = target;
                // Subscribing replaces the old subscription inside Lucra too.
                subscribe(target);
                if (previous) {
                    fail(previous, new LucraError(LucraErrorCode.CANCELLED, "Replaced by a watch on another matchup"));
                }
            }
            return {
                stop() {
                    target.listeners.delete(listener);
                    if (target.listeners.size > 0 || active !== target)
                        return;
                    active = null;
                    generation += 1;
                    session.post(MessageTypeToLucraClient.cancelMatchupDetailsSubscription, null);
                },
            };
        },
        destroy() {
            destroyed = true;
            active = null;
            generation += 1;
            for (const unsubscribe of unsubscribes)
                unsubscribe();
        },
    };
}
