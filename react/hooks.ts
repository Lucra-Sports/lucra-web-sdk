import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  LucraAuthState,
  LucraError,
  LucraLoginResult,
  LucraMatchupDetails,
  LucraMatchupWatchHandlers,
  LucraPresentation,
  LucraPresentResult,
  LucraPresentState,
  LucraScreen,
} from "../headless/index.js";
import { useLucra } from "./provider.js";

// The server renders these, and hydration must render the same.
const LOADING: LucraAuthState = { status: "loading", user: null };
const NO_SCREEN: LucraPresentState = { screen: null };

// The auth state. The component renders again when it changes.
export function useLucraAuth(): LucraAuthState {
  const { auth } = useLucra();
  return useSyncExternalStore(auth.subscribe, auth.getState, () => LOADING);
}

// The screen on show. The component renders again when it changes.
export function useLucraPresentState(): LucraPresentState {
  const { present } = useLucra();
  return useSyncExternalStore(present.subscribe, present.getState, () => NO_SCREEN);
}

export type LucraScreenOptions<TResult> = {
  presentation?: LucraPresentation;
  // Called when the screen closes, unless the component unmounted or the
  // screen changed first.
  onClose?: (result: TResult) => void;
  // Called when the screen fails, with the same exception. Without it the
  // rejection is left unhandled, as it would be for a direct call.
  onError?: (error: unknown) => void;
};

// Shows a Lucra screen while the component is mounted. Unmounting, or a new
// screen, presentation, or phoneNumber, closes it.
export function useLucraScreen(
  screen: "login",
  options?: LucraScreenOptions<LucraLoginResult> & { phoneNumber?: string }
): void;
export function useLucraScreen(
  screen: Exclude<LucraScreen, "login">,
  options?: LucraScreenOptions<LucraPresentResult>
): void;
export function useLucraScreen(
  screen: LucraScreen,
  options?: LucraScreenOptions<LucraLoginResult | LucraPresentResult>
): void;
export function useLucraScreen(
  screen: LucraScreen,
  options: LucraScreenOptions<never> & { phoneNumber?: string } = {}
): void {
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
    const shown: Promise<LucraLoginResult | LucraPresentResult> = present[screen]({
      signal,
      presentation,
      phoneNumber,
    });
    shown.then(
      (result) => {
        if (!signal.aborted) callbacks.current.onClose?.(result as never);
      },
      (error: unknown) => {
        if (signal.aborted) return;
        const { onError } = callbacks.current;
        if (!onError) throw error;
        onError(error);
      }
    );
    return () => controller.abort();
  }, [present, screen, presentation, phoneNumber]);
}

export type LucraMatchupWatchState = {
  // The latest details, or null until the first arrive.
  readonly details: LucraMatchupDetails | null;
  // Set if the watch fails. The watch has stopped then, and details keeps the last ones.
  readonly error: LucraError | null;
};

const WAITING: LucraMatchupWatchState = { details: null, error: null };

// The watch's handlers. They run after the hook's state changes.
export type LucraMatchupWatchOptions = Partial<LucraMatchupWatchHandlers>;

// Watches a matchup while the component is mounted.
export function useMatchupWatch(
  matchupId: string,
  options: LucraMatchupWatchOptions = {}
): LucraMatchupWatchState {
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
      subscribe(onChange: () => void) {
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
