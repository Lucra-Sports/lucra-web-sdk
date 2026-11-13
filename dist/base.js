import { LucraApiErrorCode, LucraClientMessageType, MessageTypeToLucraClient, } from "./types/types.js";
import { LucraClientIframeId, States } from "./constants.js";
import { SDK_VERSION } from "./version.js";
import { addDefinedSearchParams, validatePhoneNumber, validateMetadata, } from "./utils.js";
import { cancelReason, createApiRequest } from "./api-request.js";
import { createDialog } from "./dialog.js";
import { createPopup } from "./popup.js";
import { LucraUserNotLoggedIn, LucraClientNotOpen, LucraApiError, LucraMinigamesTriggerTimeout, LucraMinigamesTriggerCanceled, } from "./errors.js";
// Reason the in-flight isLoggedIn request is rejected with when a newer one
// supersedes it (e.g. `loginSuccess` rebuilds `ready`). This is an internal
// single-flight cancellation, not an auth failure, so `_createReadyPromise`
// swallows it and defers to the rebuilt promise rather than surfacing it.
const ISLOGGEDIN_CANCELLED = cancelReason("isLoggedIn");
// What close() rejects pending requests and `ready` with. Hosts check a rejected
// write's outcome before retrying (see the docs); the message stays neutral so it reads
// correctly for reads too.
const CLOSED_WHILE_PENDING = "LucraClient was closed while the request was pending.";
// How long `logout()` lets `ready` wait for `logoutComplete` before asking the Lucra app
// about the auth state anyway. The event is the signal; this bound is only there so an
// app build that predates it leaves `ready` settling late instead of never. It is not an
// estimate of how long a sign-out takes: a Lucra app that sends the event releases the
// wait the moment the sign-out is really done, however long that took.
const LOGOUT_COMPLETE_TIMEOUT_MS = 15_000;
const MATCHUP_DETAILS_SUBSCRIPTION_CANCELLED = "Cancelled by cancelMatchupDetailsSubscription";
// minigamesTrigger gives up after this long unless the host passes timeoutMs.
const MINIGAMES_TRIGGER_TIMEOUT_MS = 120_000;
// Final statuses: matchupSettled fires once when the subscribed matchup reaches one.
const SETTLED_STATUSES = new Set([
    "CLOSED",
    "CLOSED_TIE",
    "CANCELED_BY_OWNER",
    "CANCELED_DISPUTE",
    "CANCELED_GAME_CANCELED",
    "CANCELED_NOT_ACCEPTED",
    "CANCELED_PLAYER_INACTIVE",
    "CANCELED_THROUGH_API",
    "CANCELED_TIMEOUT",
]);
// Shared by open(), redirect(), and dialog() deposit (dialog routes through
// redirect), so one key warns once for all three.
const DEPOSIT_DEPRECATION = "deposit() on open(), redirect(), and dialog() is deprecated and will be removed in a future major version. Add Funds must run in a popup: open wallet() or profile() instead, where the Lucra app opens Add Funds in a popup on its own.";
export class LucraClientBase extends EventTarget {
    iframe;
    apiKey = "";
    tenantId = "";
    env = "production";
    urlOrigin = "";
    url = "";
    messages = [];
    locationId = "";
    autoJoin = true;
    controller = new AbortController();
    // Every api.* request, so the router can settle one by its response or request type.
    // Declared before the request fields below, which register themselves on creation.
    _apiRequests = [];
    _achievementsRequest = this._request(MessageTypeToLucraClient.achievementsRequest, LucraClientMessageType.achievementsResponse, "achievements");
    _tournamentsRequest = this._request(MessageTypeToLucraClient.tournamentsRequest, LucraClientMessageType.tournamentsResponse, "tournaments");
    _tournamentRequest = this._request(MessageTypeToLucraClient.tournamentRequest, LucraClientMessageType.tournamentResponse, "tournament");
    _tournamentLeaderboardRequest = this._request(MessageTypeToLucraClient.tournamentLeaderboardRequest, LucraClientMessageType.tournamentLeaderboardResponse, "tournamentLeaderboard");
    _matchupRequest = this._request(MessageTypeToLucraClient.matchupRequest, LucraClientMessageType.matchupResponse, "matchup");
    _matchupDetailsRequest = this._request(MessageTypeToLucraClient.matchupDetailsRequest, LucraClientMessageType.matchupDetailsResponse, "matchupDetails");
    _subscribeMatchupDetailsRequest = this._request(MessageTypeToLucraClient.subscribeMatchupDetailsRequest, LucraClientMessageType.subscribeMatchupDetailsResponse, "subscribeToMatchupDetails", { singleFlight: true });
    // The matchup whose matchupDetailsUpdated events reach listeners, and a counter that
    // every subscribe, cancel, and close() bumps so a superseded subscribe never activates.
    _matchupDetailsSubscriptionId = null;
    _matchupDetailsGeneration = 0;
    _createRecreationalGameRequest = this._request(MessageTypeToLucraClient.createRecreationalGameRequest, LucraClientMessageType.createRecreationalGameResponse, "createRecreationalGame", { rejectWhilePending: true });
    // Shared with the free-for-all accept, so both accepts use one in-flight slot.
    _acceptRecreationalGameRequest = this._request(MessageTypeToLucraClient.acceptRecreationalGameRequest, LucraClientMessageType.acceptRecreationalGameResponse, "acceptRecreationalGame", { rejectWhilePending: true });
    _cancelRecreationalGameRequest = this._request(MessageTypeToLucraClient.cancelRecreationalGameRequest, LucraClientMessageType.cancelRecreationalGameResponse, "cancelRecreationalGame", { rejectWhilePending: true });
    _joinTournamentRequest = this._request(MessageTypeToLucraClient.joinTournamentRequest, LucraClientMessageType.joinTournamentResponse, "joinTournament", { singleFlight: true });
    _autoJoinTournamentsRequest = this._request(MessageTypeToLucraClient.autoJoinTournamentsRequest, LucraClientMessageType.autoJoinedTournaments, "autoJoinTournaments", { singleFlight: true });
    _gameTypesRequest = this._request(MessageTypeToLucraClient.gameTypesRequest, LucraClientMessageType.gameTypesResponse, "gameTypes");
    _minigamesRequest = this._request(MessageTypeToLucraClient.minigamesRequest, LucraClientMessageType.minigamesResponse, "minigames");
    _userMatchupsRequest = this._request(MessageTypeToLucraClient.userMatchupsRequest, LucraClientMessageType.userMatchupsResponse, "userMatchups");
    _submitTournamentScoreRequest = this._request(MessageTypeToLucraClient.submitTournamentScoreRequest, LucraClientMessageType.submitTournamentScoreResponse, "submitTournamentScore", { rejectWhilePending: true });
    _enterRecreationalGameOutcomeRequest = this._request(MessageTypeToLucraClient.enterRecreationalGameOutcomeRequest, LucraClientMessageType.enterRecreationalGameOutcomeResponse, "enterRecreationalGameOutcome", { rejectWhilePending: true });
    _startRecreationalGameRequest = this._request(MessageTypeToLucraClient.startRecreationalGameRequest, LucraClientMessageType.startRecreationalGameResponse, "startRecreationalGame", { rejectWhilePending: true });
    // Last details seen for the subscribed matchup, to derive matchupJoined/matchupSettled.
    _lastMatchupDetails = null;
    _isLoggedInRequest = this._request(MessageTypeToLucraClient.isLoggedInRequest, LucraClientMessageType.isLoggedInResponse, "isLoggedIn", 
    // A real auth round trip is sub-second, and 60s is far past any genuine session
    // restore, so the absolute deadline only ever fires on a responder stuck reporting
    // `pending`. It is there to guarantee `ready` settles, not to be fast.
    {
        singleFlight: true,
        interim: (data) => data.pending === true,
        maxTimeoutMs: 60_000,
    });
    triggerFrames = new Map();
    _user = null;
    _isInitialized = false;
    // The element the iframe currently lives in, as designated by open()/moveTo().
    _host = null;
    _activeDialog = null;
    _activePopup = null;
    _warnedDeprecations = new Set();
    _readyResolve;
    _readyReject;
    // Open while a sign-out requested through `logout()` has not been reported finished.
    // `_createReadyPromise` holds the login check behind it; see `logout()`.
    _logoutGate = null;
    _initializedPromise = this._createInitializedPromise();
    _readyPromise = this._createReadyPromise();
    _createInitializedPromise() {
        return new Promise((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });
    }
    // `ready` resolves once the iframe has initialized and the user is logged in.
    // It rejects with the initialization failure body if initialization fails, or
    // with LucraUserNotLoggedIn if the user is not logged in.
    _createReadyPromise() {
        // A sign-out in flight holds the login check back until the Lucra app reports it
        // finished: asking before then is answered from the session being torn down.
        const gate = this._logoutGate;
        const start = gate
            ? this._initializedPromise.then(() => gate.promise)
            : this._initializedPromise;
        const promise = start
            .then(() => this._assertLoggedIn())
            .catch((reason) => {
            // A newer isLoggedIn request superseded ours (e.g. `loginSuccess`
            // rebuilt `ready`), cancelling the in-flight one. That is not an auth
            // failure, so defer to the current promise -- which reflects the latest
            // login state -- instead of surfacing the cancellation to callers still
            // awaiting this now-superseded promise.
            if (reason === ISLOGGEDIN_CANCELLED && this._readyPromise !== promise) {
                return this._readyPromise;
            }
            throw reason;
        });
        // Mark the rejection handled so a pre-auth consumer who never awaits
        // `ready` (e.g. one that only fetches tournaments while logged out) does
        // not trigger an unhandled rejection. `get ready()` still returns
        // `promise`, so callers that do await it still observe the rejection.
        promise.catch(() => { });
        return promise;
    }
    async _assertLoggedIn() {
        // `awaitsPending` tells the web-app this SDK can wait, so it answers `pending` while
        // auth is still settling instead of a transient `isLoggedIn: false`. Only the final
        // answer settles the request, so a restorable session no longer rejects `ready` and
        // sends an already-signed-in user to the login screen our docs tell hosts to present.
        const { isLoggedIn } = await this._isLoggedInRequest.send({ awaitsPending: true });
        if (!isLoggedIn) {
            throw new LucraUserNotLoggedIn();
        }
    }
    // Opens the wait `ready` sits behind until the Lucra app reports the sign-out finished.
    _openLogoutGate() {
        let settle;
        const promise = new Promise((resolve, reject) => {
            // No `logoutComplete` came back. Fall through to the login check rather than wait
            // forever on an app build that does not send the event: by then the sign-out has
            // long since finished or failed, and the app's own answer -- including an interim
            // `pending` while it is still settling -- is better evidence than any assumption
            // the SDK could make here.
            const timer = setTimeout(() => this._closeLogoutGate(), LOGOUT_COMPLETE_TIMEOUT_MS);
            settle = (reason) => {
                clearTimeout(timer);
                if (reason === undefined)
                    resolve();
                else
                    reject(reason);
            };
        });
        // The `ready` chain built right after this adopts the gate, except when initialization
        // rejects first and the chain never reaches it. Mark it handled so a `close()` that
        // fails the gate in that window is not an unhandled rejection.
        promise.catch(() => { });
        this._logoutGate = { promise, settle };
    }
    // Releases the wait, or fails it with `reason`. A no-op when no sign-out is in flight.
    _closeLogoutGate(reason) {
        const gate = this._logoutGate;
        this._logoutGate = null;
        gate?.settle(reason);
    }
    get ready() {
        return this._readyPromise;
    }
    /**
     * Resolves `true` when a Lucra user is signed in and `false` when none is, so auth can
     * be checked without awaiting `ready` and catching `LucraUserNotLoggedIn`. Rejects with
     * `LucraClientNotOpen` before `open()` or after `close()` (there is no Lucra session to
     * ask about), and with the initialization failure body if initialization failed.
     *
     * Like `ready`, it waits out an auth state that has not settled yet and a sign-out in
     * flight, so it answers about the session the user will actually have, not the one
     * being restored or torn down.
     *
     * It answers from `ready`, so every rejection `ready` can produce reaches the caller
     * except `LucraUserNotLoggedIn`, which is what `false` means here. That includes the
     * plain string `"Timeout"` when the login check expires, which is not an Error, so a
     * caller branching on `instanceof` needs a fallback.
     */
    async isLoggedIn() {
        this._assertOpen("call isLoggedIn()");
        // Answers from `ready` rather than sending a second isLoggedIn request. That request is
        // single-flight, so a concurrent one would cancel the one `ready` is waiting on; going
        // through `ready` also means this and `ready` can never disagree, and it inherits the
        // interim `pending` protocol and the sign-out gate for free.
        return this._readyPromise.then(() => true, (reason) => {
            if (reason instanceof LucraUserNotLoggedIn)
                return false;
            throw reason;
        });
    }
    get isInitialized() {
        return this._isInitialized;
    }
    get user() {
        return this._user;
    }
    iframeUrlOrigin() {
        return new URL(this.url).origin;
    }
    _eventListener = async (_event) => { };
    setUpEventListener() {
        window.addEventListener("message", this._eventListener, {
            signal: this.controller.signal,
        });
        return null;
    }
    constructor({ apiKey, tenantId, env, locationId, autoJoin, }) {
        super();
        if (!apiKey || !tenantId) {
            throw new Error("Both apiKey and tenantId must be provided to create LucraClient");
        }
        this.env = env;
        this.locationId = locationId ?? "";
        this.autoJoin = autoJoin ?? true;
        this.apiKey = apiKey;
        this.tenantId = tenantId;
        this.urlOrigin =
            this.env === "local"
                ? `http://localhost:3000`
                : `https://${this.tenantId.toLowerCase()}.${this.env !== "production" ? `${this.env}.` : ""}lucrasports.com`;
    }
    _buildIframeUrl({ path = "", params = new URLSearchParams(), deepLinkUrl, }) {
        const url = new URL(deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`);
        url.searchParams.set("apiKey", this.apiKey);
        const validatedPhoneNumber = validatePhoneNumber(params.get("phoneNumber"));
        if (validatedPhoneNumber) {
            url.searchParams.set("loginHint", validatedPhoneNumber);
        }
        if (this.locationId && !params.get("locationId")) {
            url.searchParams.set("locationId", this.locationId);
        }
        url.searchParams.set("autoJoin", String(this.autoJoin));
        url.searchParams.set("parentUrl", window.location.origin);
        url.searchParams.set("sdkVersion", SDK_VERSION);
        return url;
    }
    _open({ element, path = "", params = new URLSearchParams(), deepLinkUrl, hidden, }) {
        if (this.iframe) {
            return this._redirect(path, params, deepLinkUrl);
        }
        const url = this._buildIframeUrl({ path, params, deepLinkUrl });
        this.url = url.toString();
        this.setUpEventListener();
        try {
            const iframe = document.createElement("iframe");
            this.iframe = iframe;
            iframe.id = LucraClientIframeId;
            iframe.src = this.url;
            iframe.style.height = "100%";
            iframe.style.width = "100%";
            iframe.allow =
                "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment;";
            element.appendChild(iframe);
            this._host = element;
            if (hidden) {
                iframe.style.display = "none";
            }
        }
        catch (e) {
            console.error("Error opening up LucraSports", e);
        }
        return this;
    }
    _minigamesTrigger(element, input, options = {}) {
        const timeoutMs = options.timeoutMs ?? MINIGAMES_TRIGGER_TIMEOUT_MS;
        return new Promise((outerResolve, outerReject) => {
            // Before 1.16 a trigger whose session never started (the Start overlay unmounted,
            // the user walked away) left this promise pending forever. Both exits remove the
            // overlay, so the host can show its own UI again.
            let timer;
            let finished = false;
            let fail = outerReject;
            const onAbort = () => fail(new LucraMinigamesTriggerCanceled());
            const cleanup = () => {
                finished = true;
                if (timer)
                    clearTimeout(timer);
                options.signal?.removeEventListener("abort", onAbort);
            };
            const resolve = (data) => {
                if (finished)
                    return;
                cleanup();
                outerResolve(data);
            };
            const reject = (reason) => {
                if (finished)
                    return;
                cleanup();
                outerReject(reason);
            };
            if (options.signal?.aborted) {
                reject(new LucraMinigamesTriggerCanceled());
                return;
            }
            try {
                this.setUpEventListener();
                const params = new URLSearchParams();
                params.set("game_mode", input.game_mode);
                if (input.amount !== undefined) {
                    params.set("amount", String(input.amount));
                }
                if (input.matchup_id) {
                    params.set("matchup_id", input.matchup_id);
                }
                const path = `minigames/headless/${encodeURIComponent(input.game_id)}`;
                const url = this._buildIframeUrl({ path, params });
                const iframe = document.createElement("iframe");
                iframe.src = url.toString();
                iframe.style.height = "100%";
                iframe.style.width = "100%";
                iframe.style.border = "none";
                iframe.style.background = "transparent";
                iframe.allow =
                    "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment;";
                const register = () => {
                    const win = iframe.contentWindow;
                    if (!win) {
                        reject(new Error("Trigger iframe contentWindow unavailable"));
                        return;
                    }
                    this.triggerFrames.set(win, {
                        iframe,
                        resolve: (data) => {
                            try {
                                iframe.remove();
                            }
                            catch (e) {
                                console.error("Error removing trigger iframe", e);
                            }
                            resolve(data);
                        },
                        reject: (reason) => {
                            try {
                                iframe.remove();
                            }
                            catch (e) {
                                console.error("Error removing trigger iframe", e);
                            }
                            reject(reason);
                        },
                    });
                };
                element.appendChild(iframe);
                // Tears the overlay down and forgets it, then rejects.
                fail = (reason) => {
                    const win = iframe.contentWindow;
                    if (win)
                        this.triggerFrames.delete(win);
                    try {
                        iframe.remove();
                    }
                    catch (e) {
                        console.error("Error removing trigger iframe", e);
                    }
                    reject(reason);
                };
                options.signal?.addEventListener("abort", onAbort, { once: true });
                if (timeoutMs > 0) {
                    timer = setTimeout(() => fail(new LucraMinigamesTriggerTimeout()), timeoutMs);
                }
                if (iframe.contentWindow) {
                    register();
                }
                else {
                    iframe.addEventListener("load", register, { once: true });
                }
            }
            catch (e) {
                reject(e);
            }
        });
    }
    // Fails loudly when there is no iframe to act on, instead of the call silently
    // doing nothing before open() or after close().
    _assertOpen(action) {
        if (!this.iframe) {
            throw new LucraClientNotOpen(`Cannot ${action}. LucraClient is not open. Call client.open(element) first.`);
        }
        return this.iframe;
    }
    // Warns once per key per client so a deprecated call in a render loop or
    // effect does not flood the console.
    _warnDeprecated(key, message) {
        if (this._warnedDeprecations.has(key))
            return;
        this._warnedDeprecations.add(key);
        console.warn(`LucraClient: ${message}`);
    }
    _redirect(path, params = new URLSearchParams(), deepLinkUrl) {
        this._assertOpen("redirect");
        const url = new URL(deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`);
        url.searchParams.set("parentUrl", window.location.origin);
        this.url = url.toString();
        try {
            this.sendMessage.navigate({
                pathname: `${url.pathname}${url.search}`,
            });
        }
        catch (e) {
            console.error("Error redirecting LucraSports", e);
        }
        finally {
            return this;
        }
    }
    /**
     * Sends the Lucra iframe through Lucra's sign-out and invalidates the SDK's cached auth
     * state. Returns the client for chaining; the sign-out itself finishes asynchronously
     * and reports back as the `logoutComplete` event, which is what to await before
     * `destroy()` or `close()`.
     */
    logout() {
        // Navigate first. `_redirect` throws LucraClientNotOpen before an iframe exists, and a
        // sign-out that was never requested must not leave `ready` waiting on one.
        const client = this._redirect("logout");
        // The cached user is stale the moment a sign-out is asked for.
        this._user = null;
        // Rebuild `ready` so a later `await ready` reflects the sign-out instead of handing
        // back the resolution cached from before it. The rebuilt promise deliberately does
        // NOT ask the app whether anyone is logged in yet: the app answers from its own auth
        // state, which has not flipped at the instant this navigation is posted, so asking
        // now can be answered `isLoggedIn: true` from the very session being torn down and
        // re-resolve `ready` from exactly the state the rebuild exists to discard. Instead it
        // waits behind `_logoutGate`, which `logoutComplete` releases once the app really has
        // signed the user out, and only then runs the login check.
        //
        // A second logout() while one is in flight is the same sign-out: keep the open gate
        // rather than strand whoever is awaiting the promise built behind it.
        if (!this._logoutGate) {
            this._openLogoutGate();
            this._readyPromise = this._createReadyPromise();
        }
        return client;
    }
    redirect() {
        return {
            profile: () => this._redirect("app/profile"),
            wallet: () => this._redirect("app/wallet"),
            home: (locationId) => {
                const params = new URLSearchParams();
                if (locationId !== undefined) {
                    params.set("locationId", locationId);
                }
                return this._redirect("app/home", params);
            },
            deposit: () => {
                this._warnDeprecated("deposit", DEPOSIT_DEPRECATION);
                return this._redirect("app/add-funds");
            },
            withdraw: () => this._redirect("app/withdraw-funds"),
            createMatchup: (gameId) => {
                const params = new URLSearchParams();
                if (gameId !== undefined) {
                    params.set("openGameId", gameId);
                }
                return this._redirect("app/home", params);
            },
            matchupDetails: (matchupId) => this._redirect(`app/matchups/${matchupId}`),
            tournamentDetails: (matchupId) => this._redirect(`app/tournaments/${matchupId}`),
            deepLink: (url) => {
                if (this.urlOrigin === "" || new URL(url).origin !== this.urlOrigin) {
                    throw new Error("Cannot open a url not associated with this tenant");
                }
                return this._redirect("", undefined, url);
            },
            kyc: () => this._redirect("app/kyc"),
            demographic: () => this._redirect("app/demographicform"),
            locationGrant: () => this._redirect("app/location-grant"),
            terms: () => this._redirect("app/terms")
        };
    }
    // Opens any route as a dialog. Reuses redirect()'s in-place navigation (no
    // re-parenting, so no reload) and presents the iframe's host as an overlay.
    dialog() {
        const nav = this.redirect();
        const present = (navigate) => this._presentDialog(navigate);
        return {
            profile: () => present(() => nav.profile()),
            wallet: () => present(() => nav.wallet()),
            home: (locationId) => present(() => nav.home(locationId)),
            deposit: () => present(() => nav.deposit()),
            withdraw: () => present(() => nav.withdraw()),
            createMatchup: (gameId) => present(() => nav.createMatchup(gameId)),
            matchupDetails: (matchupId) => present(() => nav.matchupDetails(matchupId)),
            tournamentDetails: (matchupId) => present(() => nav.tournamentDetails(matchupId)),
            deepLink: (url) => present(() => nav.deepLink(url)),
            kyc: () => present(() => nav.kyc()),
            demographic: () => present(() => nav.demographic()),
            locationGrant: () => present(() => nav.locationGrant()),
            terms: () => present(() => nav.terms())
        };
    }
    // Presents the iframe's host as a dialog: shows the iframe, enables the in-app
    // close (X), and navigates in place (no re-parenting, so no reload). Tracks the
    // open dialog so exitLucra, Escape, and close() all dismiss it.
    _presentDialog(navigate) {
        const host = this._host;
        if (!this.iframe || !host) {
            throw new LucraClientNotOpen("Cannot open a dialog. LucraClient is not open. Call client.open(element) first.");
        }
        this._activeDialog?.close();
        const dialog = createDialog(host, () => {
            this.show();
            this._sendMessage({
                type: MessageTypeToLucraClient.enableExitLucra,
                body: true,
            });
            navigate();
        }, () => this.hide());
        dialog.onClose(() => {
            if (this._activeDialog === dialog)
                this._activeDialog = null;
        });
        this._activeDialog = dialog;
        return dialog;
    }
    // Closes an open dialog when the in-app close (exitLucra) fires. Returns true
    // when a dialog handled it, so callers can avoid surfacing exitLucra further.
    _closeActiveDialog() {
        if (!this._activeDialog)
            return false;
        this._activeDialog.close();
        return true;
    }
    // Opens the deposit flow in a real popup window. Unlike dialog()/open(), this
    // is a top-level browsing context (not an iframe), which Apple Pay requires.
    // Scoped to deposit only. Must be called from a user gesture or the browser
    // blocks the popup. Does not require open() first -- the popup is standalone.
    popup() {
        return {
            deposit: (options) => {
                const amount = options?.amount;
                if (amount !== undefined && !(Number.isFinite(amount) && amount > 0)) {
                    throw new Error("popup().deposit: amount must be a positive number of dollars");
                }
                const params = addDefinedSearchParams({
                    amount: amount === undefined ? undefined : amount.toFixed(2),
                });
                return this._presentPopup("app/add-funds", params);
            },
        };
    }
    // Tracks the popup so a deposit result and close() can be routed to it, and
    // re-attaches the message listener so the result is received even when no
    // iframe was ever opened.
    _presentPopup(path, params) {
        this.setUpEventListener();
        const url = this._buildIframeUrl({ path, params });
        this._activePopup?.close();
        const popup = createPopup(url.toString());
        popup.onClose(() => {
            if (this._activePopup === popup)
                this._activePopup = null;
            // The iframe's user (balance) is otherwise stale until something else refetches it.
            if (this.iframe) {
                this._sendMessage({ type: MessageTypeToLucraClient.refreshUser, body: null });
            }
        });
        this._activePopup = popup;
        return popup;
    }
    _resolveActivePopup(result) {
        this._activePopup?.resolve(result);
    }
    open(element, phoneNumber, options) {
        return {
            profile: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/profile", params, hidden: options?.hidden });
            },
            wallet: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/wallet", params, hidden: options?.hidden });
            },
            home: (locationId) => {
                const params = addDefinedSearchParams({ locationId, phoneNumber });
                return this._open({ element, path: "app/home", params, hidden: options?.hidden });
            },
            deposit: () => {
                this._warnDeprecated("deposit", DEPOSIT_DEPRECATION);
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/add-funds", params, hidden: options?.hidden });
            },
            withdraw: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/withdraw-funds", params, hidden: options?.hidden });
            },
            createMatchup: (gameId) => {
                const params = addDefinedSearchParams({ openGameId: gameId, phoneNumber });
                return this._open({ element, path: "app/home", params, hidden: options?.hidden });
            },
            matchupDetails: (matchupId) => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: `app/matchups/${matchupId}`, params, hidden: options?.hidden });
            },
            tournamentDetails: (matchupId) => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: `app/tournaments/${matchupId}`, params, hidden: options?.hidden });
            },
            deepLink: (url) => {
                if (this.urlOrigin === "" || new URL(url).origin !== this.urlOrigin) {
                    throw new Error("Cannot open a url not associated with this tenant");
                }
                return this._open({
                    element,
                    deepLinkUrl: url,
                    params: addDefinedSearchParams({ phoneNumber }),
                    hidden: options?.hidden,
                });
            },
            login: (options) => {
                const params = addDefinedSearchParams({ phoneNumber });
                params.set("login", "true");
                // Tells the Lucra app to report the login and then stay where it is, rather than
                // carrying the user on into the app. Without it a headless host has no moment to hide
                // the iframe in: the app has already navigated and rendered by the time loginSuccess
                // reaches the host. A Lucra app that predates this ignores the param and behaves as it
                // always has, so sending it is safe against any deployed build.
                if (options?.loginOnly)
                    params.set("loginOnly", "true");
                // When the user is not logged in the in-app navigate listener isn't subscribed yet,
                // so a navigate message would be dropped; reload src to reliably reach the login screen.
                if (this.iframe) {
                    this.url = this._buildIframeUrl({ path: "", params }).toString();
                    this.iframe.src = this.url;
                    return this.show();
                }
                return this._open({ element, path: "", params });
            },
            minigamesTrigger: (input, triggerOptions) => this._minigamesTrigger(element, input, triggerOptions),
            kyc: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/kyc", params, hidden: options?.hidden });
            },
            demographic: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/demographicform", params, hidden: options?.hidden });
            },
            locationGrant: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/location-grant", params, hidden: options?.hidden });
            },
            terms: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/terms", params, hidden: options?.hidden });
            }
        };
    }
    close() {
        this.controller.abort("Closing LucraClient");
        this.controller = new AbortController();
        this._activeDialog?.close();
        this._activePopup?.close();
        this._host = null;
        this.iframe?.remove();
        this.iframe = undefined;
        this._user = null;
        this._isInitialized = false;
        this._resetMatchupDetailsSubscription();
        // Pending api requests and a `ready` still waiting for init would otherwise time out
        // or hang. The reject is a no-op once initialization settled.
        this._readyReject(new LucraClientNotOpen(CLOSED_WHILE_PENDING));
        // A `ready` already past init and waiting on a sign-out that can no longer be
        // reported finished fails the same way, instead of hanging until the gate's bound.
        this._closeLogoutGate(new LucraClientNotOpen(CLOSED_WHILE_PENDING));
        for (const request of this._apiRequests) {
            request.rejectAll(new LucraClientNotOpen(CLOSED_WHILE_PENDING));
        }
        this._initializedPromise = this._createInitializedPromise();
        this._readyPromise = this._createReadyPromise();
    }
    /**
     * @deprecated Re-parenting the iframe reloads it, losing page state and any
     * in-flight request. Keep it in one container and use show()/hide(), or dialog().
     */
    moveTo(element) {
        this._warnDeprecated("moveTo", "moveTo() is deprecated and will be removed in a future major version. Re-parenting the iframe reloads it: keep it in one container and use show()/hide(), or dialog().");
        element.appendChild(this._assertOpen("moveTo"));
        this._host = element;
        return this;
    }
    hide() {
        this._assertOpen("hide").style.display = "none";
        return this;
    }
    show() {
        this._assertOpen("show").style.display = "block";
        return this;
    }
    _sendMessage(message) {
        try {
            this.iframe?.contentWindow?.postMessage(message, this.urlOrigin);
        }
        catch (e) {
            // An api request (it carries a requestId) rejects its promise with the error
            // instead of timing out; every other message is fire-and-forget.
            if (message?.requestId !== undefined)
                throw e;
            console.error("Unable to send message to LucraClient iframe", e);
        }
        return this;
    }
    // A timed-out api.* request otherwise only rejects in the host page, where Lucra never
    // sees it. Posted like any fire-and-forget message: it reaches nothing if the iframe is
    // gone, and a web app older than this message type ignores it.
    _reportDiagnostic(body) {
        this._sendMessage({
            type: MessageTypeToLucraClient.sdkDiagnostic,
            body: { ...body, sdkVersion: SDK_VERSION },
        });
    }
    _matchupInviteUrlResponse(data) {
        this._sendMessage({
            type: MessageTypeToLucraClient.matchupInviteUrlResponse,
            body: data,
        });
    }
    _request(type, responseType, name, options = {}) {
        const request = createApiRequest({
            type,
            responseType,
            name,
            sendMessage: (message) => this._sendMessage(message),
            onTimeout: (timeoutMs) => this._reportDiagnostic({ kind: "requestTimeout", requestType: type, timeoutMs }),
            ...options,
        });
        this._apiRequests.push(request);
        return request;
    }
    // Settles the api.* request answered by `responseType`. Returns false when the message
    // is not an api.* response, so the router can treat it as an event. A response that
    // matches no pending request (e.g. the automatic auto-join) is a no-op.
    _settleApiResponse(responseType, data, requestId) {
        const request = this._apiRequests.find((r) => r.responseType === responseType);
        if (!request)
            return false;
        request.resolve(data, requestId);
        return true;
    }
    _rejectApiRequest(requestType, body, requestId) {
        this._apiRequests
            .find((r) => r.type === requestType)
            ?.reject(new LucraApiError(body.code, body.message), requestId);
    }
    _resolveTrigger(win, data) {
        const handle = this.triggerFrames.get(win);
        if (!handle)
            return false;
        this.triggerFrames.delete(win);
        handle.resolve(data);
        return true;
    }
    _handleInitialized(body) {
        if (body.success) {
            this._isInitialized = true;
            this._readyResolve();
        }
        else {
            this._isInitialized = false;
            this._readyReject(body);
        }
    }
    _handleUserInfo(body) {
        this._user = body;
    }
    // A logged-out user makes `ready` reject with LucraUserNotLoggedIn, and that
    // rejection is cached on `_readyPromise`. Once the user logs in, rebuild the
    // promise so it re-runs `_assertLoggedIn` against the now-authenticated session.
    _handleLoginSuccess() {
        // Someone is signed in, so a sign-out still waiting to be reported finished is moot.
        // Fail its gate rather than release it: releasing would let the promise waiting behind
        // it run a login check of its own, which single-flight would make cancel the one the
        // promise being built right below is about to send. The cancellation sentinel is the
        // same one that case already uses, so the gated promise defers to the rebuilt one
        // instead of sending anything. Without this the gate outlives the login and holds
        // `ready` back until its bound expires.
        this._closeLogoutGate(ISLOGGEDIN_CANCELLED);
        this._readyPromise = this._createReadyPromise();
    }
    // The Lucra app finished signing the user out. Drop the cached user and put `ready`
    // back into an unsettled state so a re-await reflects the signed-out session instead of
    // a cached resolution, mirroring what `_handleLoginSuccess` does on the way in.
    //
    // When `logout()` opened a gate, releasing it is the rebuild: the promise waiting behind
    // it runs its login check now, against an auth state that has actually flipped. A
    // sign-out the user started inside Lucra's own UI never went through `logout()` and has
    // no gate, so rebuild here instead.
    _handleLogoutComplete() {
        this._user = null;
        if (this._logoutGate) {
            this._closeLogoutGate();
        }
        else {
            this._readyPromise = this._createReadyPromise();
        }
    }
    // Stops delivering matchupDetailsUpdated and supersedes any subscribe in progress.
    _resetMatchupDetailsSubscription() {
        this._matchupDetailsSubscriptionId = null;
        this._lastMatchupDetails = null;
        return ++this._matchupDetailsGeneration;
    }
    _isActiveMatchupDetailsUpdate(details) {
        const matchupId = this._matchupDetailsSubscriptionId;
        return matchupId !== null && details?.matchup?.id === matchupId;
    }
    // The events one matchupDetailsUpdated implies, compared with the previous details for
    // the same subscription: a matchupJoined per new user, and one matchupSettled when the
    // status first becomes final. Records `next` as the new baseline.
    _deriveMatchupEvents(next) {
        const prev = this._lastMatchupDetails;
        this._lastMatchupDetails = next;
        const events = [];
        const matchupId = next.matchup.id;
        const seen = new Set((prev?.matchup.participantGroups ?? []).flatMap((g) => g.userIds));
        for (const group of next.matchup.participantGroups ?? []) {
            for (const userId of group.userIds) {
                if (prev && !seen.has(userId)) {
                    events.push({ type: "matchupJoined", detail: { matchupId, userId, groupId: group.id } });
                }
            }
        }
        const status = next.matchup.status;
        const wasFinal = prev ? SETTLED_STATUSES.has(prev.matchup.status) : false;
        if (SETTLED_STATUSES.has(status) && !wasFinal) {
            const winningGroupIds = status.startsWith("CANCELED")
                ? []
                : next.groups.filter((g) => g.outcome === "WIN" || g.outcome === "TIE").map((g) => g.id);
            if (!winningGroupIds.length && next.matchup.winningGroupId && !status.startsWith("CANCELED")) {
                winningGroupIds.push(next.matchup.winningGroupId);
            }
            events.push({ type: "matchupSettled", detail: { matchupId, status, winningGroupIds } });
        }
        return events;
    }
    // An iframe reload (login src reload, moveTo) drops the Lucra app's subscription and
    // re-sends `initialized`, so subscribe again to the active matchup once it succeeds.
    _resumeMatchupDetailsSubscription() {
        const matchupId = this._matchupDetailsSubscriptionId;
        if (!this._isInitialized || !matchupId || this._subscribeMatchupDetailsRequest.hasPending()) {
            return;
        }
        this._subscribeMatchupDetailsRequest.send({ matchupId }).catch(() => { });
    }
    api = {
        achievements: async () => {
            this._assertOpen("call api.achievements");
            return this._achievementsRequest.send();
        },
        // Every request needs an open iframe and rejects with LucraClientNotOpen
        // without one. Reads that work before auth await `_initializedPromise` (not
        // `ready`, which also asserts login); the others need auth (called after `ready`).
        // Note: if `close()` runs while this is still awaiting init, the call rejects
        // with LucraClientNotOpen (`close()` rejects the pending init promise).
        tournaments: async () => {
            this._assertOpen("call api.tournaments");
            await this._initializedPromise;
            return this._tournamentsRequest.send();
        },
        tournament: async (matchupId) => {
            this._assertOpen("call api.tournament");
            return this._tournamentRequest.send({ matchupId });
        },
        tournamentLeaderboard: async (matchupId, pagination) => {
            this._assertOpen("call api.tournamentLeaderboard");
            return this._tournamentLeaderboardRequest.send({
                matchupId,
                limit: pagination?.limit,
                offset: pagination?.offset,
            });
        },
        joinTournament: async (tournamentId) => {
            this._assertOpen("call api.joinTournament");
            return this._joinTournamentRequest.send({ matchupId: tournamentId });
        },
        autoJoinTournaments: async () => {
            this._assertOpen("call api.autoJoinTournaments");
            return this._autoJoinTournamentsRequest.send();
        },
        matchup: async (matchupId) => {
            this._assertOpen("call api.matchup");
            await this._initializedPromise;
            return this._matchupRequest.send({ matchupId });
        },
        matchupDetails: async (matchupId) => {
            this._assertOpen("call api.matchupDetails");
            await this._initializedPromise;
            return this._matchupDetailsRequest.send({ matchupId });
        },
        createRecreationalGame: async (input) => {
            this._assertOpen("call api.createRecreationalGame");
            return this._createRecreationalGameRequest.send(input);
        },
        acceptVersusRecreationalGame: async (matchupId, teamId) => {
            this._assertOpen("call api.acceptVersusRecreationalGame");
            return this._acceptRecreationalGameRequest.send({
                matchupId,
                playStyle: "GROUP_VS_GROUP",
                teamId,
            });
        },
        acceptFreeForAllRecreationalGame: async (matchupId) => {
            this._assertOpen("call api.acceptFreeForAllRecreationalGame");
            return this._acceptRecreationalGameRequest.send({
                matchupId,
                playStyle: "FREE_FOR_ALL",
            });
        },
        cancelRecreationalGame: async (matchupId) => {
            this._assertOpen("call api.cancelRecreationalGame");
            return this._cancelRecreationalGameRequest.send({ matchupId });
        },
        // Joins a 1v1 (GROUP_VS_GROUP) as the opponent: reads the matchup and accepts into
        // the first group with nobody in it. For free for all, use
        // acceptFreeForAllRecreationalGame. Rejects NOT_ALLOWED when no group is open.
        acceptVersusRecreationalGameAsOpponent: async (matchupId) => {
            this._assertOpen("call api.acceptVersusRecreationalGameAsOpponent");
            await this._initializedPromise;
            const { matchup } = await this._matchupDetailsRequest.send({ matchupId });
            if (matchup.playStyle !== "GROUP_VS_GROUP") {
                throw new LucraApiError(LucraApiErrorCode.invalidPlayStyle, "This matchup is free for all: use acceptFreeForAllRecreationalGame");
            }
            const open = matchup.participantGroups.find((g) => g.userIds.length === 0);
            if (!open) {
                throw new LucraApiError(LucraApiErrorCode.notAllowed, "This matchup has no open team");
            }
            return this._acceptRecreationalGameRequest.send({
                matchupId: matchup.id,
                playStyle: "GROUP_VS_GROUP",
                teamId: open.id,
            });
        },
        // The tenant's GYP game types: the gameTypeId createRecreationalGame takes, how a
        // game is won, and whether it settles itself from posted scores. Works before login.
        gameTypes: async () => {
            this._assertOpen("call api.gameTypes");
            await this._initializedPromise;
            return this._gameTypesRequest.send();
        },
        // The tenant's Lucra minigames with their modes and entry amounts, for minigamesTrigger.
        minigames: async () => {
            this._assertOpen("call api.minigames");
            await this._initializedPromise;
            return this._minigamesRequest.send();
        },
        // The signed-in user's recreational matchups, newest first.
        userMatchups: async (input = {}) => {
            this._assertOpen("call api.userMatchups");
            return this._userMatchupsRequest.send(input);
        },
        // Submits the user's score to a tournament they joined. Needs location (as joins do).
        submitTournamentScore: async (input) => {
            this._assertOpen("call api.submitTournamentScore");
            return this._submitTournamentScoreRequest.send(input);
        },
        // Reports the result of a MANUAL game type (see api.gameTypes). AUTOMATED game types
        // settle from scores your server posts to Lucra's tenant API instead.
        enterRecreationalGameOutcome: async (input) => {
            this._assertOpen("call api.enterRecreationalGameOutcome");
            return this._enterRecreationalGameOutcomeRequest.send(input);
        },
        // Creator only: starts an OPEN recreational game, so nobody else can join. A free for all
        // that settles from scores then settles once every player has a final score.
        startRecreationalGame: async (matchupId) => {
            this._assertOpen("call api.startRecreationalGame");
            return this._startRecreationalGameRequest.send({ matchupId });
        },
        // Resolves with the current details, then delivers each change as a
        // matchupDetailsUpdated event until cancelled, close(), or the next subscribe.
        subscribeToMatchupDetails: async (matchupId) => {
            this._assertOpen("call api.subscribeToMatchupDetails");
            const generation = this._resetMatchupDetailsSubscription();
            await this._initializedPromise;
            // Cancelled or superseded while waiting for init: never post the request.
            if (generation !== this._matchupDetailsGeneration) {
                throw MATCHUP_DETAILS_SUBSCRIPTION_CANCELLED;
            }
            const details = await this._subscribeMatchupDetailsRequest.send({ matchupId });
            if (generation === this._matchupDetailsGeneration) {
                // The id the Lucra app resolved, which is what its updates carry.
                this._matchupDetailsSubscriptionId = details.matchup.id;
                this._lastMatchupDetails = details;
            }
            return details;
        },
        // Never throws, so it is safe in effect cleanup before open() or after close().
        cancelMatchupDetailsSubscription: () => {
            this._resetMatchupDetailsSubscription();
            this._subscribeMatchupDetailsRequest.reject(MATCHUP_DETAILS_SUBSCRIPTION_CANCELLED);
            if (this.iframe) {
                this._sendMessage({
                    type: MessageTypeToLucraClient.cancelMatchupDetailsSubscription,
                    body: null,
                });
            }
        },
    };
    sendMessage = {
        userUpdated: (data) => {
            this._assertOpen("call sendMessage.userUpdated");
            if (!validateMetadata(data.metadata)) {
                throw new Error("Invalid metadata: must be an object with string keys and string values, or null");
            }
            this._sendMessage({
                type: MessageTypeToLucraClient.clientUserInfo,
                body: data,
            });
        },
        // convertToCreditResponse and deepLinkResponse reply to iframe-initiated
        // requests, so they stay unguarded like _matchupInviteUrlResponse: a
        // delayed reply after close() is dropped rather than throwing.
        convertToCreditResponse: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.convertToCreditResponse,
                body: data,
            });
        },
        enableConvertToCredit: () => {
            this._assertOpen("call sendMessage.enableConvertToCredit");
            this._sendMessage({
                type: MessageTypeToLucraClient.enableConvertToCredit,
                body: null,
            });
        },
        deepLinkResponse: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.deepLinkResponse,
                body: data,
            });
        },
        navigate: (data) => {
            this._assertOpen("call sendMessage.navigate");
            this._sendMessage({
                type: MessageTypeToLucraClient.navigate,
                body: data,
            });
        },
        availableRewards: (data) => {
            this._assertOpen("call sendMessage.availableRewards");
            this._sendMessage({
                type: MessageTypeToLucraClient.availableRewards,
                body: data,
            });
        },
    };
}
