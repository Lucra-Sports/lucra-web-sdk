import { LUCRA_POPUP_MESSAGE_TYPE, LucraClientMessageType, MessageTypeToLucraClient, } from "../types/types.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { createEmitter } from "./events.js";
import { HOME_PATH, buildUrl, navigateTarget } from "./url.js";
const PHONE_NUMBER = /^[0-9]{10}$/;
export function createPresent(options) {
    const { session, auth, frame, urls, activity, whenWriteSettled } = options;
    // The overlay screen on show, if any. Only one at a time.
    let current = null;
    // The Add Funds window, while it is open.
    let popup = null;
    let destroyed = false;
    let state = { screen: null };
    const changes = createEmitter();
    const setScreen = (screen) => {
        if (state.screen === screen)
            return;
        state = { screen };
        changes.emit("change", state);
    };
    const navigate = (path) => session.post(MessageTypeToLucraClient.navigate, {
        pathname: navigateTarget(urls, path),
    });
    const present = (screen, signal) => {
        if (destroyed)
            return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
        // Checked before anything changes, so a bad value cannot leave a screen
        // marked open. Not instanceof: the signal can come from another window.
        if (signal != null &&
            (typeof signal.addEventListener !== "function" ||
                typeof signal.removeEventListener !== "function" ||
                typeof signal.aborted !== "boolean")) {
            return Promise.reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, undefined, {
                hint: "signal must be an AbortSignal.",
            }));
        }
        // Aborted already: show nothing, and leave any screen on show alone.
        if (signal?.aborted) {
            return Promise.resolve({ status: "dismissed", reason: "aborted" });
        }
        // A new screen replaces the one on show. A loop, because a state listener
        // told the old screen closed may start another screen.
        while (current)
            current.dismiss("replaced");
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
                    setScreen(null);
                    if (screen.goHomeAfter && session.status() === "connected") {
                        navigate(HOME_PATH);
                    }
                }
                if ("error" in outcome)
                    reject(outcome.error);
                else
                    resolve(outcome.result);
            };
            const handle = {
                dismiss: (reason) => finish({ result: { status: "dismissed", reason } }),
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
                if (signal.aborted)
                    handle.dismiss("aborted");
            }
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
                // Dismissed, replaced, or aborted while waiting.
                if (done)
                    return;
                overlay = frame.openOverlay();
                setScreen(screen.name);
                // A listener told about the screen may have closed it already.
                if (done)
                    return;
                // The SDK draws no exit. The user leaves with Lucra's own control.
                cleanups.push(session.on(LucraClientMessageType.exitLucra, () => handle.dismiss("exit")));
                if (screen.needsLogin) {
                    // The user signed out from inside the screen.
                    cleanups.push(session.on(LucraClientMessageType.logoutComplete, () => handle.dismiss("loggedOut")));
                }
                const { completeOn, completed } = screen;
                if (completeOn && completed) {
                    cleanups.push(session.on(completeOn, (data) => finish({ result: completed(data) })));
                }
                // Lucra forgets this setting each time it restarts.
                const enableExit = () => session.post(MessageTypeToLucraClient.enableExitLucra, true);
                cleanups.push(session.onConnected(enableExit));
                enableExit();
                // Lucra may start over while the screen shows: login always does, and
                // the page can reload itself. If it cannot start again, the screen
                // will never come back, so close it with the reason. finish does
                // nothing once this screen is done, so a late failure cannot touch it.
                const closeIfLucraFails = () => {
                    session.whenConnected().catch((error) => finish({ error }));
                };
                cleanups.push(session.on(LucraClientMessageType.initialized, closeIfLucraFails));
                screen.show();
                closeIfLucraFails();
            })().catch((error) => finish({ error }));
        });
    };
    const page = (name, path, completeOn) => (pageOptions) => present({
        name,
        needsLogin: true,
        show: () => navigate(path),
        completeOn,
        completed: () => ({ status: "completed" }),
        goHomeAfter: true,
    }, pageOptions?.signal);
    const unsubscribePopup = session.on(LUCRA_POPUP_MESSAGE_TYPE, (data) => {
        const result = data;
        if ((result?.toastType === "success" || result?.toastType === "error") &&
            typeof result.message === "string") {
            popup?.resolve({ toastType: result.toastType, message: result.message });
        }
    });
    return {
        login(loginOptions) {
            const phoneNumber = loginOptions?.phoneNumber;
            if (phoneNumber !== undefined && !PHONE_NUMBER.test(phoneNumber)) {
                return Promise.reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, "The phone number must be 10 digits", {
                    hint: "phoneNumber must be exactly 10 digits. Omit it when you have none.",
                }));
            }
            return present({
                name: "login",
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
            }, loginOptions?.signal);
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
            // The window is already open. Bring it forward instead of opening another:
            // closing it and opening another right away can hand back the window that
            // is closing. The first call alone reports the deposit. A window the user
            // closed since the last poll is not open: focus() closes its handle, which
            // ends the first call, and a new window opens below.
            if (popup?.focus())
                return Promise.resolve({ status: "alreadyOpen" });
            let handle;
            try {
                handle = frame.openPopup(buildUrl(urls, "app/add-funds"));
            }
            catch (cause) {
                return Promise.reject(new LucraError(LucraErrorCode.POPUP_BLOCKED, undefined, { cause }));
            }
            const result = new Promise((resolve) => {
                handle.onClose((closed) => {
                    if (popup === handle)
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
            popup = handle;
            return result;
        },
        demographics: page("demographics", "app/demographicform", LucraClientMessageType.demographicComplete),
        kyc: page("kyc", "app/kyc", LucraClientMessageType.kycComplete),
        locationGrant: page("locationGrant", "app/location-grant", LucraClientMessageType.locationGranted),
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
            }
            catch (e) {
                console.error("Lucra present listener threw an error", e);
            }
            return unsubscribe;
        },
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            // Closing the screen on show takes the state back to null first.
            current?.dismiss("destroyed");
            popup?.close();
            unsubscribePopup();
            changes.clear();
        },
    };
}
