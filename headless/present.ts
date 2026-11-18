import {
  LUCRA_POPUP_MESSAGE_TYPE,
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraPresentMinigameBody,
  type LucraPresentMinigameResponse,
} from "../types/types.js";
import type { Activity } from "./api.js";
import type { Auth } from "./auth.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { createEmitter } from "./events.js";
import type { Frame, Overlay, Popup } from "./frame.js";
import type { Session } from "./session.js";
import type {
  LucraAddFundsResult,
  LucraDismissReason,
  LucraLoginOptions,
  LucraLoginResult,
  LucraMinigameInput,
  LucraMinigameResult,
  LucraPresentOptions,
  LucraPresentResult,
  LucraUser,
} from "./types.js";
import { HOME_PATH, buildUrl, navigateTarget, type UrlContext } from "./url.js";

export type Present = {
  login(options?: LucraLoginOptions): Promise<LucraLoginResult>;
  addFunds(): Promise<LucraAddFundsResult>;
  minigame(input: LucraMinigameInput): Promise<LucraMinigameResult>;
  demographics(options?: LucraPresentOptions): Promise<LucraPresentResult>;
  kyc(options?: LucraPresentOptions): Promise<LucraPresentResult>;
  locationGrant(options?: LucraPresentOptions): Promise<LucraPresentResult>;
  withdraw(options?: LucraPresentOptions): Promise<LucraPresentResult>;
  profile(options?: LucraPresentOptions): Promise<LucraPresentResult>;
  wallet(options?: LucraPresentOptions): Promise<LucraPresentResult>;
  dismiss(): void;
  // The current state. The same object is returned until something changes.
  getState(): LucraPresentState;
  // Calls the listener now with the current state, then on every change.
  subscribe(listener: (state: LucraPresentState) => void): () => void;
  destroy(): void;
};

// The lucra.present screens that show in the page and need no input, so
// lucra.present[screen]() works for each. Add Funds opens its own window.
export type LucraScreen = Exclude<
  keyof Present,
  "addFunds" | "minigame" | "dismiss" | "getState" | "subscribe" | "destroy"
>;

// The screen on show in the page, or null. A screen still waiting to show,
// and the Add Funds window, are never reported.
export type LucraPresentState = { readonly screen: LucraScreen | "minigame" | null };

type Dismissed = { status: "dismissed"; reason: LucraDismissReason };

type Screen<TResult> = {
  name: NonNullable<LucraPresentState["screen"]>;
  needsLogin: boolean;
  // Resolves with a result to skip the screen entirely, or null to show it.
  skip?: () => Promise<TResult | null>;
  // A change that puts the screen on Lucra's page. It runs once the waits are
  // over, while nothing shows, and the screen opens once it resolves. Dismissed
  // while it runs, the call still waits for it, because it may have changed
  // something. Then it rejects with its error, or resolves dismissed.
  start?: () => Promise<void>;
  // Tells Lucra which screen to show. Runs once the overlay is visible.
  show?: () => void;
  // The Lucra message that means this screen finished, and the result it gives,
  // or null when the message is for something else.
  completeOn?: LucraClientMessageType;
  completed?: (data: unknown) => TResult | null;
  // Send Lucra back to its blank home route when the screen closes.
  goHomeAfter: boolean;
};

const PHONE_NUMBER = /^[0-9]{10}$/;
const MINIGAME_MODES: readonly unknown[] = ["practice", "1v1", "free_for_all", "tournament"];

const invalid = (hint: string) =>
  Promise.reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, undefined, { hint }));

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

export function createPresent(options: {
  session: Session;
  auth: Auth;
  frame: Frame;
  urls: UrlContext;
  activity: Activity;
  whenWriteSettled: () => Promise<void>;
  // Sends the minigame start through the one write slot.
  startMinigame: (body: LucraPresentMinigameBody) => Promise<LucraPresentMinigameResponse>;
}): Present {
  const { session, auth, frame, urls, activity, whenWriteSettled, startMinigame } = options;
  // The overlay screen on show, if any. Only one at a time.
  let current: { dismiss: (reason: LucraDismissReason) => void } | null = null;
  // The Add Funds window, while it is open.
  let popup: Popup | null = null;
  let destroyed = false;
  let state: LucraPresentState = { screen: null };
  const changes = createEmitter<{ change: LucraPresentState }>();

  const setScreen = (screen: LucraPresentState["screen"]) => {
    if (state.screen === screen) return;
    state = { screen };
    changes.emit("change", state);
  };

  const navigate = (path: string) =>
    session.post(MessageTypeToLucraClient.navigate, {
      pathname: navigateTarget(urls, path),
    });

  const present = <TResult>(
    screen: Screen<TResult>,
    signal: AbortSignal | undefined
  ): Promise<TResult | Dismissed> => {
    if (destroyed) return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
    // Checked before anything changes, so a bad value cannot leave a screen
    // marked open. Not instanceof: the signal can come from another window.
    if (
      signal != null &&
      (typeof signal.addEventListener !== "function" ||
        typeof signal.removeEventListener !== "function" ||
        typeof signal.aborted !== "boolean")
    ) {
      return Promise.reject(
        new LucraError(LucraErrorCode.INVALID_ARGUMENT, undefined, {
          hint: "signal must be an AbortSignal.",
        })
      );
    }
    // Aborted already: show nothing, and leave any screen on show alone.
    if (signal?.aborted) {
      return Promise.resolve({ status: "dismissed", reason: "aborted" });
    }
    // A new screen replaces the one on show. A loop, because a state listener
    // told the old screen closed may start another screen.
    while (current) current.dismiss("replaced");
    // Set before the first await, so a write started right after is refused.
    activity.screenOpen = true;

    return new Promise<TResult | Dismissed>((resolve, reject) => {
      let overlay: Overlay | null = null;
      let done = false;
      // True while screen.start runs. A dismissal then waits for its answer.
      let starting = false;
      let dismissedWhileStarting: LucraDismissReason | null = null;
      const cleanups: (() => void)[] = [];

      const finish = (
        outcome: { result: TResult | Dismissed } | { error: unknown }
      ) => {
        if (done) return;
        done = true;
        for (const cleanup of cleanups) cleanup();
        if (current === handle) {
          current = null;
          activity.screenOpen = false;
        }
        if (overlay) {
          overlay.close();
          setScreen(null);
          if (screen.goHomeAfter && session.status() === "connected") {
            navigate(HOME_PATH);
          }
        }
        // Only a dismissal can end the call while it starts. The start's
        // answer settles it.
        if (starting) return;
        if ("error" in outcome) reject(outcome.error);
        else resolve(outcome.result);
      };

      const handle = {
        dismiss: (reason: LucraDismissReason) => {
          if (starting && !done) dismissedWhileStarting = reason;
          finish({ result: { status: "dismissed", reason } });
        },
      };
      current = handle;

      // The signal ends only this call. Once it has finished, for example
      // because another screen replaced it, the listener is gone.
      if (signal) {
        const onAbort = () => handle.dismiss("aborted");
        signal.addEventListener("abort", onAbort);
        cleanups.push(() => signal.removeEventListener("abort", onAbort));
        // A state listener may have aborted it while the old screen closed,
        // before the listener above was added.
        if (signal.aborted) handle.dismiss("aborted");
      }

      (async () => {
        await session.whenConnected();
        if (screen.needsLogin) await auth.whenLoggedIn();
        const skipped = screen.skip ? await screen.skip() : null;
        if (skipped !== null) {
          finish({ result: skipped });
          return;
        }
        // A pending write is navigating Lucra. Showing a screen navigates it too.
        await whenWriteSettled();
        // Dismissed, replaced, or aborted while waiting.
        if (done) return;

        if (screen.start) {
          starting = true;
          try {
            await screen.start();
          } catch (error) {
            starting = false;
            if (dismissedWhileStarting === null) throw error;
            reject(error);
            return;
          }
          starting = false;
          const reason = dismissedWhileStarting;
          if (reason !== null) {
            // Lucra put the screen on its page after all. Take it down, unless
            // another screen replaced this one: that screen navigates Lucra itself.
            if (screen.goHomeAfter && reason !== "replaced" && session.status() === "connected") {
              navigate(HOME_PATH);
            }
            resolve({ status: "dismissed", reason });
            return;
          }
        }

        overlay = frame.openOverlay();
        setScreen(screen.name);
        // A listener told about the screen may have closed it already.
        if (done) return;
        // The SDK draws no exit. The user leaves with Lucra's own control.
        cleanups.push(
          session.on(LucraClientMessageType.exitLucra, () => handle.dismiss("exit"))
        );
        if (screen.needsLogin) {
          // The user signed out from inside the screen.
          cleanups.push(
            session.on(LucraClientMessageType.logoutComplete, () =>
              handle.dismiss("loggedOut")
            )
          );
        }
        const { completeOn, completed } = screen;
        if (completeOn && completed) {
          cleanups.push(
            session.on(completeOn, (data) => {
              const result = completed(data);
              if (result !== null) finish({ result });
            })
          );
        }
        // Lucra forgets this setting each time it restarts.
        const enableExit = () =>
          session.post(MessageTypeToLucraClient.enableExitLucra, true);
        cleanups.push(session.onConnected(enableExit));
        enableExit();
        // Lucra may start over while the screen shows: login always does, and
        // the page can reload itself. If it cannot start again, the screen
        // will never come back, so close it with the reason. finish does
        // nothing once this screen is done, so a late failure cannot touch it.
        const closeIfLucraFails = () => {
          session.whenConnected().catch((error: unknown) => finish({ error }));
        };
        cleanups.push(
          session.on(LucraClientMessageType.initialized, closeIfLucraFails)
        );
        screen.show?.();
        closeIfLucraFails();
      })().catch((error: unknown) => finish({ error }));
    });
  };

  const page =
    (name: LucraScreen, path: string, completeOn?: LucraClientMessageType) =>
    (pageOptions?: LucraPresentOptions): Promise<LucraPresentResult> =>
      present<LucraPresentResult>(
        {
          name,
          needsLogin: true,
          show: () => navigate(path),
          completeOn,
          completed: () => ({ status: "completed" }),
          goHomeAfter: true,
        },
        pageOptions?.signal
      );

  const unsubscribePopup = session.on(LUCRA_POPUP_MESSAGE_TYPE, (data) => {
    const result = data as { toastType?: unknown; message?: unknown } | null;
    if (
      (result?.toastType === "success" || result?.toastType === "error") &&
      typeof result.message === "string"
    ) {
      popup?.resolve({ toastType: result.toastType, message: result.message });
    }
  });

  return {
    login(loginOptions) {
      const phoneNumber = loginOptions?.phoneNumber;
      if (phoneNumber !== undefined && !PHONE_NUMBER.test(phoneNumber)) {
        return Promise.reject(
          new LucraError(LucraErrorCode.INVALID_ARGUMENT, "The phone number must be 10 digits", {
            hint: "phoneNumber must be exactly 10 digits. Omit it when you have none.",
          })
        );
      }
      return present<LucraLoginResult>({
        name: "login",
        needsLogin: false,
        // Already logged in: there is nothing to show.
        skip: async () => {
          try {
            await auth.whenLoggedIn();
          } catch (error) {
            if (isLucraError(error) && error.code === LucraErrorCode.NOT_LOGGED_IN) {
              return null;
            }
            throw error;
          }
          return {
            status: "completed",
            user: (auth.getState().user ?? {}) as LucraUser,
          };
        },
        // Loading the login screen restarts Lucra. `loginOnly` makes it return
        // to its blank home route after the login instead of its own home screen.
        show: () =>
          session.restart(
            buildUrl(urls, "", {
              login: "true",
              loginOnly: "true",
              loginHint: phoneNumber,
            })
          ),
        completeOn: LucraClientMessageType.loginSuccess,
        completed: (data) => ({
          status: "completed",
          user: (data ?? {}) as LucraUser,
        }),
        goHomeAfter: false,
      }, loginOptions?.signal);
    },

    addFunds() {
      // No await before the popup opens: the browser only allows a popup
      // during the click that asked for it.
      if (destroyed) return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
      if (session.status() === "failed" || session.status() === "destroyed") {
        // Always rejects here, with CONNECTION_FAILED, UNSUPPORTED_ENVIRONMENT,
        // or DESTROYED, so the .then never runs.
        return session.whenConnected().then(() => ({ status: "dismissed" as const }));
      }
      if (auth.getState().status === "loggedOut") {
        return Promise.reject(new LucraError(LucraErrorCode.NOT_LOGGED_IN));
      }
      // The window is already open. Bring it forward instead of opening another:
      // closing it and opening another right away can hand back the window that
      // is closing. The first call alone reports the deposit. A window the user
      // closed since the last poll is not open: focus() closes its handle, which
      // ends the first call, and a new window opens below.
      if (popup?.focus()) return Promise.resolve({ status: "alreadyOpen" });
      let handle: Popup;
      try {
        handle = frame.openPopup(buildUrl(urls, "app/add-funds"));
      } catch (cause) {
        return Promise.reject(
          new LucraError(LucraErrorCode.POPUP_BLOCKED, undefined, { cause })
        );
      }
      const result = new Promise<LucraAddFundsResult>((resolve) => {
        handle.onClose((closed) => {
          if (popup === handle) popup = null;
          if (!closed) resolve({ status: "dismissed" });
          else if (closed.toastType === "success") {
            resolve({ status: "completed", message: closed.message });
          } else {
            resolve({ status: "failed", message: closed.message });
          }
        });
      });
      popup = handle;
      return result;
    },

    minigame(input) {
      // Checked before anything changes, so a bad value leaves the screen on
      // show alone. The signal is checked with the other screens'.
      if (typeof input !== "object" || input === null) {
        return invalid("lucra.present.minigame() takes { gameId, mode }.");
      }
      const { gameId, mode, amount, matchupId, signal } = input;
      if (!isText(gameId)) return invalid("gameId must be a non empty string.");
      if (!MINIGAME_MODES.includes(mode)) {
        return invalid('mode must be "practice", "1v1", "free_for_all", or "tournament".');
      }
      if (
        amount !== undefined &&
        !(typeof amount === "number" && Number.isFinite(amount) && amount >= 0)
      ) {
        return invalid("amount must be a number of 0 or more. Leave it out for practice.");
      }
      if (matchupId !== undefined && !isText(matchupId)) {
        return invalid("matchupId must be a non empty string. Leave it out when you have none.");
      }
      // Only the fields given. The signal is not sent.
      const body: LucraPresentMinigameBody = { gameId, mode };
      if (amount !== undefined) body.amount = amount;
      if (matchupId !== undefined) body.matchupId = matchupId;

      let started: LucraPresentMinigameResponse | null = null;
      return present<Extract<LucraMinigameResult, { status: "completed" }>>(
        {
          name: "minigame",
          needsLogin: true,
          // Lucra starts the session and puts the game on its page.
          start: async () => {
            started = await startMinigame(body);
          },
          completeOn: LucraClientMessageType.minigameClosed,
          completed: (data) => {
            const sessionId = (data as { sessionId?: unknown } | null)?.sessionId;
            if (!started || sessionId !== started.sessionId) return null;
            return { status: "completed", sessionId, matchupId: started.matchupId };
          },
          // So the game does not keep running out of sight.
          goHomeAfter: true,
        },
        signal
      ).then((result): LucraMinigameResult => {
        if (result.status === "completed") return result;
        const ids = started as LucraPresentMinigameResponse | null;
        return {
          ...result,
          sessionId: ids?.sessionId ?? null,
          matchupId: ids?.matchupId ?? null,
        };
      });
    },

    demographics: page(
      "demographics",
      "app/demographicform",
      LucraClientMessageType.demographicComplete
    ),
    kyc: page("kyc", "app/kyc", LucraClientMessageType.kycComplete),
    locationGrant: page(
      "locationGrant",
      "app/location-grant",
      LucraClientMessageType.locationGranted
    ),
    withdraw: page("withdraw", "app/withdraw-funds"),
    profile: page("profile", "app/profile"),
    wallet: page("wallet", "app/wallet"),

    dismiss() {
      current?.dismiss("dismissed");
    },

    getState: () => state,

    subscribe(listener) {
      // Always the current state: a listener can change it while others are
      // still being told about the change before.
      const unsubscribe = changes.on("change", () => listener(state));
      try {
        listener(state);
      } catch (e) {
        console.error("Lucra present listener threw an error", e);
      }
      return unsubscribe;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Closing the screen on show takes the state back to null first.
      current?.dismiss("destroyed");
      popup?.close();
      unsubscribePopup();
      changes.clear();
    },
  };
}
