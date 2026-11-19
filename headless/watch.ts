import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraMatchupDetails,
} from "../types/types.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import type { RequestSpec } from "./requests.js";
import type { Session } from "./session.js";
import type { LucraMatchupWatch, LucraMatchupWatchHandlers } from "./types.js";

export type Watch = {
  watch(matchupId: string, handlers: LucraMatchupWatchHandlers): LucraMatchupWatch;
  destroy(): void;
};

const SUBSCRIBE: RequestSpec<LucraMatchupDetails> = {
  type: MessageTypeToLucraClient.subscribeMatchupDetailsRequest,
  responseType: LucraClientMessageType.subscribeMatchupDetailsResponse,
  kind: "read",
};

// One entry per watch() call, so two callers can pass the same handlers object.
type Listener = { handlers: LucraMatchupWatchHandlers };

type Active = {
  // The id the app asked for.
  requestedId: string;
  // The id Lucra resolved. Its updates carry this one.
  resolvedId: string | null;
  listeners: Set<Listener>;
  latest: LucraMatchupDetails | null;
};

export function createWatch(options: { session: Session }): Watch {
  const { session } = options;
  // Lucra keeps one subscription at a time, so the client does too.
  let active: Active | null = null;
  // Bumped on every subscribe and cancel, so a superseded subscribe never activates.
  let generation = 0;
  let destroyed = false;

  const update = (listener: Listener, details: LucraMatchupDetails) => {
    try {
      listener.handlers.onUpdate(details);
    } catch (e) {
      console.error("Lucra watch listener threw an error", e);
    }
  };

  const deliver = (target: Active, details: LucraMatchupDetails) => {
    target.latest = details;
    for (const listener of [...target.listeners]) update(listener, details);
  };

  // Ends the watch for everyone listening to it.
  const fail = (target: Active, error: LucraError) => {
    const listeners = [...target.listeners];
    target.listeners.clear();
    if (active === target) active = null;
    for (const listener of listeners) {
      try {
        listener.handlers.onError?.(error);
      } catch (e) {
        console.error("Lucra watch listener threw an error", e);
      }
    }
  };

  const subscribe = (target: Active) => {
    const mine = ++generation;
    const stale = () => destroyed || mine !== generation || active !== target;
    session
      .whenConnected()
      .then(() => {
        if (stale()) return undefined;
        return session
          .request(SUBSCRIBE, { matchupId: target.requestedId })
          .then((details) => {
            if (stale()) return;
            target.resolvedId = details.matchup.id;
            deliver(target, details);
          });
      })
      .catch((error: unknown) => {
        if (stale()) return;
        // Lucra restarted while subscribing. The connected listener below
        // subscribes again.
        if (isLucraError(error) && error.code === LucraErrorCode.CONNECTION_RESET) {
          return;
        }
        // A subscribe that failed or timed out can still take hold inside Lucra.
        // Nothing newer has subscribed, and this goes out before onError can
        // start another watch, so it cancels only this one.
        session.post(MessageTypeToLucraClient.cancelMatchupDetailsSubscription, null);
        fail(
          target,
          isLucraError(error)
            ? error
            : new LucraError(LucraErrorCode.API_ERROR, undefined, { cause: error })
        );
      });
  };

  const unsubscribes = [
    // A restart drops Lucra's subscription, so ask again.
    session.onConnected(() => {
      if (active) subscribe(active);
    }),
    // If Lucra cannot start again, nothing will subscribe again, so end the watch.
    session.on(LucraClientMessageType.initialized, () => {
      session.whenConnected().catch((error: LucraError) => {
        if (active) fail(active, error);
      });
    }),
    session.on(LucraClientMessageType.matchupDetailsUpdated, (data) => {
      const details = data as LucraMatchupDetails | null;
      // Only the active watch's updates count. Ones for a replaced or stopped
      // matchup can still arrive for a moment.
      if (!active || active.resolvedId === null) return;
      if (details?.matchup?.id !== active.resolvedId) return;
      deliver(active, details);
    }),
  ];

  return {
    watch(matchupId, handlers) {
      const listener: Listener = { handlers };
      if (destroyed || session.status() === "destroyed") {
        queueMicrotask(() =>
          handlers.onError?.(new LucraError(LucraErrorCode.DESTROYED))
        );
        return { stop() {} };
      }

      let target: Active;
      if (active && active.requestedId === matchupId) {
        // Same matchup: share the subscription and catch the newcomer up.
        target = active;
        target.listeners.add(listener);
        const latest = target.latest;
        if (latest) {
          queueMicrotask(() => {
            if (target.listeners.has(listener)) update(listener, latest);
          });
        }
      } else {
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
          fail(
            previous,
            new LucraError(LucraErrorCode.CANCELLED, undefined, {
              hint: "A watch on another matchup replaced this one.",
            })
          );
        }
      }

      return {
        stop() {
          target.listeners.delete(listener);
          if (target.listeners.size > 0 || active !== target) return;
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
      for (const unsubscribe of unsubscribes) unsubscribe();
    },
  };
}
