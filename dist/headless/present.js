import { LUCRA_POPUP_MESSAGE_TYPE, LucraClientMessageType, MessageTypeToLucraClient, } from "../types/types.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { createEmitter } from "./events.js";
import { HOME_PATH, buildUrl, navigateTarget } from "./url.js";
const PHONE_NUMBER = /^[0-9]{10}$/;
const MINIGAME_MODES = ["practice", "1v1", "free_for_all", "tournament"];
const invalid = (hint) => Promise.reject(new LucraError(LucraErrorCode.INVALID_ARGUMENT, undefined, { hint }));
const isText = (value) => typeof value === "string" && value !== "";
export function createPresent(options) {
    const { session, auth, frame, urls, activity, whenWriteSettled, startMinigame } = options;
    // The overlay screen on show, if any. Only one at a time.
    let current = null;
    // The Add Funds window, while it is open.
    let popup = null;
    let destroyed = false;
    let state = { screen: null };
    // A game may be on Lucra's page with nothing showing it.
    let gameOutOfSight = false;
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
    const goHome = () => {
        if (session.status() === "connected")
            navigate(HOME_PATH);
    };
    // Sends Lucra home so a game nobody can see does not keep running. Not while
    // a call is current: that call navigates Lucra itself, and a home navigation
    // would land after it. If that call ends without showing, it runs this again.
    const hideGame = () => {
        if (!gameOutOfSight || current || session.status() !== "connected")
            return;
        gameOutOfSight = false;
        navigate(HOME_PATH);
    };
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
            // True while screen.start runs. A dismissal then waits for its answer.
            let starting = false;
            let dismissedWhileStarting = null;
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
                    if (screen.goHomeAfter)
                        goHome();
                }
                else {
                    hideGame();
                }
                // Only a dismissal can end the call while it starts. The start's
                // answer settles it.
                if (starting)
                    return;
                if ("error" in outcome)
                    reject(outcome.error);
                else
                    resolve(outcome.result);
            };
            const handle = {
                dismiss: (reason) => {
                    // The first reason wins.
                    if (starting)
                        dismissedWhileStarting ??= reason;
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
                if (screen.start) {
                    starting = true;
                    try {
                        await screen.start();
                    }
                    catch (error) {
                        starting = false;
                        if (dismissedWhileStarting === null)
                            throw error;
                        hideGame();
                        reject(error);
                        return;
                    }
                    starting = false;
                    const reason = dismissedWhileStarting;
                    if (reason !== null) {
                        // Lucra put the screen on its page after all, with nothing showing it.
                        gameOutOfSight = true;
                        hideGame();
                        resolve({ status: "dismissed", reason });
                        return;
                    }
                }
                overlay = frame.openOverlay();
                // This screen takes over Lucra's page.
                gameOutOfSight = false;
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
                    cleanups.push(session.on(completeOn, (data) => {
                        const result = completed(data);
                        if (result !== null)
                            finish({ result });
                    }));
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
                cleanups.push(session.on(LucraClientMessageType.initialized, () => {
                    if (screen.endsOnRestart)
                        handle.dismiss("restarted");
                    else
                        closeIfLucraFails();
                }));
                screen.show?.();
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
    // An answer to a start that no longer waits for it, for example after a
    // timeout. The game it started shows nowhere.
    const unsubscribeLateStart = session.on(LucraClientMessageType.presentMinigameResponse, () => {
        gameOutOfSight = true;
        hideGame();
    });
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
        minigame(input) {
            // Checked before anything changes, so a bad value leaves the screen on
            // show alone. The signal is checked with the other screens'.
            if (typeof input !== "object" || input === null) {
                return invalid("lucra.present.minigame() takes { gameId, mode }.");
            }
            const { gameId, mode, amount, matchupId, signal } = input;
            if (!isText(gameId))
                return invalid("gameId must be a non empty string.");
            if (!MINIGAME_MODES.includes(mode)) {
                return invalid('mode must be "practice", "1v1", "free_for_all", or "tournament".');
            }
            if (amount !== undefined &&
                !(typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) {
                return invalid("amount must be a number of 0 or more. Leave it out for practice.");
            }
            if (matchupId !== undefined && !isText(matchupId)) {
                return invalid("matchupId must be a non empty string. Leave it out when you have none.");
            }
            // Only the fields given. The signal is not sent.
            const body = { gameId, mode };
            if (amount !== undefined)
                body.amount = amount;
            if (matchupId !== undefined)
                body.matchupId = matchupId;
            let started;
            return present({
                name: "minigame",
                needsLogin: true,
                // Lucra starts the session and puts the game on its page.
                start: async () => {
                    try {
                        const answer = (await startMinigame(body));
                        if (!isText(answer?.sessionId)) {
                            throw new LucraError(LucraErrorCode.API_ERROR, undefined, {
                                outcomeUnknown: true,
                                hint: "Lucra's answer had no sessionId. Read lucra.matchups.list() before you try again.",
                            });
                        }
                        started = {
                            sessionId: answer.sessionId,
                            matchupId: isText(answer.matchupId) ? answer.matchupId : null,
                        };
                    }
                    catch (error) {
                        // The game may be on Lucra's page all the same.
                        if (isLucraError(error) && error.outcomeUnknown)
                            gameOutOfSight = true;
                        throw error;
                    }
                },
                endsOnRestart: true,
                completeOn: LucraClientMessageType.minigameClosed,
                completed: (data) => {
                    const sessionId = data?.sessionId;
                    if (!started || sessionId !== started.sessionId)
                        return null;
                    return { status: "completed", sessionId, matchupId: started.matchupId };
                },
                // So the game does not keep running out of sight.
                goHomeAfter: true,
            }, signal).then((result) => {
                if (result.status === "completed")
                    return result;
                return {
                    ...result,
                    sessionId: started?.sessionId ?? null,
                    matchupId: started?.matchupId ?? null,
                };
            });
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
            unsubscribeLateStart();
            changes.clear();
        },
    };
}
