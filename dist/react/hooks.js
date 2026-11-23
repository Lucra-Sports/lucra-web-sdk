import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useLucra } from "./provider.js";
// The server renders these, and hydration must render the same.
const LOADING = { status: "loading", user: null };
const NO_SCREEN = { screen: null };
// The auth state. The component renders again when it changes.
export function useLucraAuth() {
    const { auth } = useLucra();
    return useSyncExternalStore(auth.subscribe, auth.getState, () => LOADING);
}
// The screen on show. The component renders again when it changes.
export function useLucraPresentState() {
    const { present } = useLucra();
    return useSyncExternalStore(present.subscribe, present.getState, () => NO_SCREEN);
}
export function useLucraScreen(screen, options = {}) {
    const { present } = useLucra();
    const { presentation, phoneNumber } = options;
    // The latest callbacks, so new functions on each render do not show the screen again.
    const callbacks = useRef(options);
    useEffect(() => {
        callbacks.current = options;
    });
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        // Screens other than login ignore phoneNumber.
        const shown = present[screen]({
            signal,
            presentation,
            phoneNumber,
        });
        shown.then((result) => {
            if (!signal.aborted)
                callbacks.current.onClose?.(result);
        }, (error) => {
            if (signal.aborted)
                return;
            const { onError } = callbacks.current;
            if (!onError)
                throw error;
            onError(error);
        });
        return () => controller.abort();
    }, [present, screen, presentation, phoneNumber]);
}
const WAITING = { details: null, error: null };
// Watches a matchup while the component is mounted.
export function useMatchupWatch(matchupId, options = {}) {
    const { matchups } = useLucra();
    // The latest callbacks, so new functions on each render do not start the watch again.
    const callbacks = useRef(options);
    useEffect(() => {
        callbacks.current = options;
    });
    const store = useMemo(() => {
        let state = WAITING;
        return {
            getSnapshot: () => state,
            subscribe(onChange) {
                const watch = matchups.watch(matchupId, {
                    onUpdate(details) {
                        state = { details, error: null };
                        onChange();
                        callbacks.current.onUpdate?.(details);
                    },
                    onError(error) {
                        state = { details: state.details, error };
                        onChange();
                        callbacks.current.onError?.(error);
                    },
                });
                return () => watch.stop();
            },
        };
    }, [matchups, matchupId]);
    return useSyncExternalStore(store.subscribe, store.getSnapshot, () => WAITING);
}
