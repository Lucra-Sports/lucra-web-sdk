import { LUCRA_POPUP_MESSAGE_TYPE, LucraClientMessageType, MessageTypeToLucraClient, } from "../types/types.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { HOME_PATH, buildUrl, navigateTarget } from "./url.js";
const PHONE_NUMBER = /^[0-9]{10}$/;
export function createPresent(options) {
    const { session, auth, frame, urls, activity, whenWriteSettled } = options;
    // The overlay screen on show, if any. Only one at a time.
    let current = null;
    // The Add Funds window, while it is open, and the result it will give.
    let popup = null;
    let destroyed = false;
    const navigate = (path) => session.post(MessageTypeToLucraClient.navigate, {
        pathname: navigateTarget(urls, path),
    });
    const present = (screen) => {
        if (destroyed)
            return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
        // A new screen replaces the one on show.
        current?.dismiss();
        // Set before the first await, so a write started right after is refused.
        activity.screenOpen = true;
        return new Promise((resolve, reject) => {
            let overlay = null;
            let done = false;
            const cleanups = [];
            const finish = (outcome) => {
                if (done)
                    return;
                done = true;
                for (const cleanup of cleanups)
                    cleanup();
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
                if ("error" in outcome)
                    reject(outcome.error);
                else
                    resolve(outcome.result);
            };
            const handle = { dismiss: () => finish({ result: { status: "dismissed" } }) };
            current = handle;
            (async () => {
                await session.whenConnected();
                if (screen.needsLogin)
                    await auth.whenLoggedIn();
                const skipped = screen.skip ? await screen.skip() : null;
                if (skipped !== null) {
                    finish({ result: skipped });
                    return;
                }
                // A pending write is navigating Lucra. Showing a screen navigates it too.
                await whenWriteSettled();
                // Dismissed or replaced while waiting.
                if (done)
                    return;
                overlay = frame.openOverlay();
                // The SDK draws no exit. The user leaves with Lucra's own control.
                cleanups.push(session.on(LucraClientMessageType.exitLucra, handle.dismiss));
                if (screen.needsLogin) {
                    // The user signed out from inside the screen.
                    cleanups.push(session.on(LucraClientMessageType.logoutComplete, handle.dismiss));
                }
                const { completeOn, completed } = screen;
                if (completeOn && completed) {
                    cleanups.push(session.on(completeOn, (data) => finish({ result: completed(data) })));
                }
                // Lucra forgets this setting each time it restarts.
                const enableExit = () => session.post(MessageTypeToLucraClient.enableExitLucra, true);
                cleanups.push(session.onConnected(enableExit));
                enableExit();
                screen.show();
            })().catch((error) => finish({ error }));
        });
    };
    const page = (path, completeOn) => present({
        needsLogin: true,
        show: () => navigate(path),
        completeOn,
        completed: () => ({ status: "completed" }),
        goHomeAfter: true,
    });
    const unsubscribePopup = session.on(LUCRA_POPUP_MESSAGE_TYPE, (data) => {
        const result = data;
        if ((result?.toastType === "success" || result?.toastType === "error") &&
            typeof result.message === "string") {
            popup?.handle.resolve({ toastType: result.toastType, message: result.message });
        }
    });
    return {
        login(loginOptions) {
            const phoneNumber = loginOptions?.phoneNumber;
            if (phoneNumber !== undefined && !PHONE_NUMBER.test(phoneNumber)) {
                return Promise.reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, "phoneNumber must be exactly 10 digits"));
            }
            return present({
                needsLogin: false,
                // Already logged in: there is nothing to show.
                skip: async () => {
                    try {
                        await auth.whenLoggedIn();
                    }
                    catch (error) {
                        if (isLucraError(error) && error.code === LucraErrorCode.NOT_LOGGED_IN) {
                            return null;
                        }
                        throw error;
                    }
                    return {
                        status: "completed",
                        user: (auth.getState().user ?? {}),
                    };
                },
                // Loading the login screen restarts Lucra. `loginOnly` makes it return
                // to its blank home route after the login instead of its own home screen.
                show: () => session.restart(buildUrl(urls, "", {
                    login: "true",
                    loginOnly: "true",
                    loginHint: phoneNumber,
                })),
                completeOn: LucraClientMessageType.loginSuccess,
                completed: (data) => ({
                    status: "completed",
                    user: (data ?? {}),
                }),
                goHomeAfter: false,
            });
        },
        addFunds() {
            // No await before the popup opens: the browser only allows a popup
            // during the click that asked for it.
            if (destroyed)
                return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
            if (session.status() === "failed" || session.status() === "destroyed") {
                // Always rejects here, with CONNECTION_FAILED, UNSUPPORTED_ENVIRONMENT,
                // or DESTROYED, so the .then never runs.
                return session.whenConnected().then(() => ({ status: "dismissed" }));
            }
            if (auth.getState().status === "loggedOut") {
                return Promise.reject(new LucraError(LucraErrorCode.NOT_LOGGED_IN));
            }
            // The window is already open: one deposit, one result. Closing it and
            // opening another right away can hand back the window that is closing.
            if (popup)
                return popup.result;
            let handle;
            try {
                handle = frame.openPopup(buildUrl(urls, "app/add-funds"));
            }
            catch (cause) {
                return Promise.reject(new LucraError(LucraErrorCode.POPUP_BLOCKED, undefined, { cause }));
            }
            const result = new Promise((resolve) => {
                handle.onClose((closed) => {
                    if (popup?.handle === handle)
                        popup = null;
                    if (!closed)
                        resolve({ status: "dismissed" });
                    else if (closed.toastType === "success") {
                        resolve({ status: "completed", message: closed.message });
                    }
                    else {
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
            if (destroyed)
                return;
            destroyed = true;
            current?.dismiss();
            popup?.handle.close();
            unsubscribePopup();
        },
    };
}
