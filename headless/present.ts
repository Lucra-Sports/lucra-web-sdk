import type { LucraPopupHandle } from "../popup.js";
import {
  LUCRA_POPUP_MESSAGE_TYPE,
  LucraClientMessageType,
  MessageTypeToLucraClient,
} from "../types/types.js";
import type { Activity } from "./api.js";
import type { Auth } from "./auth.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import type { Frame, Overlay } from "./frame.js";
import type { Session } from "./session.js";
import type {
  LucraAddFundsResult,
  LucraLoginResult,
  LucraPresentResult,
  LucraUser,
} from "./types.js";
import { HOME_PATH, buildUrl, navigateTarget, type UrlContext } from "./url.js";

export type Present = {
  login(options?: { phoneNumber?: string }): Promise<LucraLoginResult>;
  addFunds(): Promise<LucraAddFundsResult>;
  demographics(): Promise<LucraPresentResult>;
  kyc(): Promise<LucraPresentResult>;
  locationGrant(): Promise<LucraPresentResult>;
  withdraw(): Promise<LucraPresentResult>;
  profile(): Promise<LucraPresentResult>;
  wallet(): Promise<LucraPresentResult>;
  dismiss(): void;
  destroy(): void;
};

// The lucra.present screens that show in the page. Add Funds opens its own window.
export type LucraScreen = Exclude<keyof Present, "addFunds" | "dismiss" | "destroy">;

type Dismissed = { status: "dismissed" };

type Screen<TResult> = {
  needsLogin: boolean;
  // Resolves with a result to skip the screen entirely, or null to show it.
  skip?: () => Promise<TResult | null>;
  // Tells Lucra which screen to show. Runs once the overlay is visible.
  show: () => void;
  // The Lucra message that means this screen finished, and the result it gives.
  completeOn?: LucraClientMessageType;
  completed?: (data: unknown) => TResult;
  // Send Lucra back to its blank home route when the screen closes.
  goHomeAfter: boolean;
};

const PHONE_NUMBER = /^[0-9]{10}$/;

export function createPresent(options: {
  session: Session;
  auth: Auth;
  frame: Frame;
  urls: UrlContext;
  activity: Activity;
  whenWriteSettled: () => Promise<void>;
}): Present {
  const { session, auth, frame, urls, activity, whenWriteSettled } = options;
  // The overlay screen on show, if any. Only one at a time.
  let current: { dismiss: () => void } | null = null;
  // The Add Funds window, while it is open, and the result it will give.
  let popup: { handle: LucraPopupHandle; result: Promise<LucraAddFundsResult> } | null =
    null;
  let destroyed = false;

  const navigate = (path: string) =>
    session.post(MessageTypeToLucraClient.navigate, {
      pathname: navigateTarget(urls, path),
    });

  const present = <TResult>(screen: Screen<TResult>): Promise<TResult | Dismissed> => {
    if (destroyed) return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
    // A new screen replaces the one on show.
    current?.dismiss();
    // Set before the first await, so a write started right after is refused.
    activity.screenOpen = true;

    return new Promise<TResult | Dismissed>((resolve, reject) => {
      let overlay: Overlay | null = null;
      let done = false;
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
          if (screen.goHomeAfter && session.status() === "connected") {
            navigate(HOME_PATH);
          }
        }
        if ("error" in outcome) reject(outcome.error);
        else resolve(outcome.result);
      };

      const handle = { dismiss: () => finish({ result: { status: "dismissed" } }) };
      current = handle;

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
        // Dismissed or replaced while waiting.
        if (done) return;

        overlay = frame.openOverlay();
        // The SDK draws no exit. The user leaves with Lucra's own control.
        cleanups.push(session.on(LucraClientMessageType.exitLucra, handle.dismiss));
        if (screen.needsLogin) {
          // The user signed out from inside the screen.
          cleanups.push(
            session.on(LucraClientMessageType.logoutComplete, handle.dismiss)
          );
        }
        const { completeOn, completed } = screen;
        if (completeOn && completed) {
          cleanups.push(
            session.on(completeOn, (data) => finish({ result: completed(data) }))
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
        screen.show();
        closeIfLucraFails();
      })().catch((error: unknown) => finish({ error }));
    });
  };

  const page = (
    path: string,
    completeOn?: LucraClientMessageType
  ): Promise<LucraPresentResult> =>
    present<LucraPresentResult>({
      needsLogin: true,
      show: () => navigate(path),
      completeOn,
      completed: () => ({ status: "completed" }),
      goHomeAfter: true,
    });

  const unsubscribePopup = session.on(LUCRA_POPUP_MESSAGE_TYPE, (data) => {
    const result = data as { toastType?: unknown; message?: unknown } | null;
    if (
      (result?.toastType === "success" || result?.toastType === "error") &&
      typeof result.message === "string"
    ) {
      popup?.handle.resolve({ toastType: result.toastType, message: result.message });
    }
  });

  return {
    login(loginOptions) {
      const phoneNumber = loginOptions?.phoneNumber;
      if (phoneNumber !== undefined && !PHONE_NUMBER.test(phoneNumber)) {
        return Promise.reject(
          new LucraError(
            LucraErrorCode.INVALID_ARGUMENT,
            "phoneNumber must be exactly 10 digits"
          )
        );
      }
      return present<LucraLoginResult>({
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
      });
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
      // The window is already open: one deposit, one result. Closing it and
      // opening another right away can hand back the window that is closing.
      if (popup) return popup.result;
      let handle: LucraPopupHandle;
      try {
        handle = frame.openPopup(buildUrl(urls, "app/add-funds"));
      } catch (cause) {
        return Promise.reject(
          new LucraError(LucraErrorCode.POPUP_BLOCKED, undefined, { cause })
        );
      }
      const result = new Promise<LucraAddFundsResult>((resolve) => {
        handle.onClose((closed) => {
          if (popup?.handle === handle) popup = null;
          if (!closed) resolve({ status: "dismissed" });
          else if (closed.toastType === "success") {
            resolve({ status: "completed", message: closed.message });
          } else {
            resolve({ status: "failed", message: closed.message });
          }
        });
      });
      popup = { handle, result };
      return result;
    },

    demographics: () => page("app/demographicform", LucraClientMessageType.demographicComplete),
    kyc: () => page("app/kyc", LucraClientMessageType.kycComplete),
    locationGrant: () => page("app/location-grant", LucraClientMessageType.locationGranted),
    withdraw: () => page("app/withdraw-funds"),
    profile: () => page("app/profile"),
    wallet: () => page("app/wallet"),

    dismiss() {
      current?.dismiss();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      current?.dismiss();
      popup?.handle.close();
      unsubscribePopup();
    },
  };
}
