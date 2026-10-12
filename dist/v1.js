import { LucraClientBase } from "./base.js";
import { LucraClientMessageType, MessageTypeToLucraClient, LUCRA_POPUP_MESSAGE_TYPE, } from "./types/types.js";
export class LucraClient extends LucraClientBase {
    static instance = null;
    listenerMap = new Map();
    matchupInviteUrlTransformer;
    constructor(config) {
        super(config);
    }
    _eventListener = async (event) => {
        if (!this.urlOrigin || event.origin !== this.urlOrigin)
            return;
        if (!event.data || typeof event.data !== 'object')
            return;
        // The popup deposit flow reports its result with a flat envelope (no nested
        // `data`). Ignore a malformed message -- the popup still closes via its
        // window.closed poll, firing onClose with no result.
        if (event.data.type === LUCRA_POPUP_MESSAGE_TYPE) {
            const { toastType, message } = event.data;
            if ((toastType === "success" || toastType === "error") &&
                typeof message === "string") {
                this._resolveActivePopup({ toastType, message });
            }
            return;
        }
        if (event.data.type === LucraClientMessageType.matchupInviteUrl) {
            if (!this.matchupInviteUrlTransformer) {
                console.warn("matchupDeepLinkHandler not configured, falling back to deepLink");
                return;
            }
            try {
                const urlResult = await this.matchupInviteUrlTransformer(event.data.data.matchupId);
                if (!urlResult || urlResult.trim() === "") {
                    console.warn("matchupDeepLinkHandler returned empty, falling back to deepLink");
                    return;
                }
                this._matchupInviteUrlResponse({ url: urlResult });
            }
            catch (e) {
                console.error("matchupDeepLinkHandler threw an error", e);
            }
            return;
        }
        const requestId = typeof event.data.requestId === "string" ? event.data.requestId : undefined;
        const body = event.data.data;
        const hasErrorCode = typeof body?.code === "string";
        if (event.data.type === LucraClientMessageType.apiRequestError) {
            if (hasErrorCode)
                this._rejectApiRequest(body.requestType, body, requestId);
            return;
        }
        // Per-call error messages that predate apiRequestError; the web-app still sends them.
        if (event.data.type === LucraClientMessageType.joinTournamentError) {
            if (hasErrorCode) {
                this._rejectApiRequest(MessageTypeToLucraClient.joinTournamentRequest, body, requestId);
            }
            return;
        }
        if (event.data.type === LucraClientMessageType.autoJoinTournamentsError) {
            if (hasErrorCode) {
                this._rejectApiRequest(MessageTypeToLucraClient.autoJoinTournamentsRequest, body, requestId);
            }
            return;
        }
        // Only the active subscription's updates reach listeners: drop those for a
        // superseded or cancelled matchup, and any arriving after close().
        if (event.data.type === LucraClientMessageType.matchupDetailsUpdated &&
            !this._isActiveMatchupDetailsUpdate(body)) {
            return;
        }
        const settled = this._settleApiResponse(event.data.type, body, requestId);
        // No return for autoJoinedTournaments, unlike other responses: it also falls through
        // to dispatchEvent so manual and automatic triggers report through the same event.
        if (settled && event.data.type !== LucraClientMessageType.autoJoinedTournaments) {
            return;
        }
        if (event.data.type === LucraClientMessageType.startMinigamesSessionResponse) {
            const sourceWindow = event.source;
            if (sourceWindow) {
                this._resolveTrigger(sourceWindow, event.data.data);
            }
            return;
        }
        if (event.data.type === LucraClientMessageType.userInfo) {
            this._handleUserInfo(event.data.data);
        }
        if (event.data.type === LucraClientMessageType.initialized) {
            this._handleInitialized(event.data.data);
            this._replayEnableExitLucra();
            this._resumeMatchupDetailsSubscription();
        }
        if (event.data.type === LucraClientMessageType.loginSuccess) {
            this._handleLoginSuccess();
            this._replayEnableExitLucra();
        }
        if (event.data.type === LucraClientMessageType.exitLucra &&
            this._closeActiveDialog()) {
            return;
        }
        this.dispatchEvent(new CustomEvent(event.data.type, { detail: event.data.data }));
    };
    // The Lucra app drops messages sent before it initializes, and a reload or the
    // remount during popup login resets it, so replay the exit control enable for
    // existing listeners on initialized and on loginSuccess.
    _replayEnableExitLucra() {
        if (this.listenerMap.get("exitLucra")?.size) {
            this._sendMessage({
                type: MessageTypeToLucraClient.enableExitLucra,
                body: true,
            });
        }
    }
    on(type, listener) {
        const wrapped = (e) => listener(e.detail);
        if (!this.listenerMap.has(type)) {
            this.listenerMap.set(type, new Map());
        }
        this.listenerMap.get(type).set(listener, wrapped);
        this.addEventListener(type, wrapped);
        if (type === "exitLucra") {
            this._sendMessage({
                type: MessageTypeToLucraClient.enableExitLucra,
                body: true,
            });
        }
        if (type === "userInfo" && this._user) {
            listener(this._user);
        }
    }
    off(type, listener) {
        const wrapped = this.listenerMap.get(type)?.get(listener);
        if (wrapped) {
            this.removeEventListener(type, wrapped);
            this.listenerMap.get(type)?.delete(listener);
        }
    }
    setMatchupDeepLinkHandler(transformer) {
        this.matchupInviteUrlTransformer = transformer;
    }
    static initialize(config) {
        if (LucraClient.instance) {
            throw new Error("LucraClient is already initialized. Call LucraClient.getInstance() to retrieve the existing instance.");
        }
        LucraClient.instance = new LucraClient(config);
        return LucraClient.instance;
    }
    static getInstance() {
        if (!LucraClient.instance) {
            throw new Error("LucraClient has not been initialized. Call LucraClient.initialize(config) first.");
        }
        return LucraClient.instance;
    }
    static destroy() {
        if (LucraClient.instance) {
            LucraClient.instance.listenerMap.forEach((listeners, type) => {
                listeners.forEach((wrapped) => {
                    LucraClient.instance.removeEventListener(type, wrapped);
                });
            });
            LucraClient.instance.listenerMap.clear();
            LucraClient.instance.close();
            LucraClient.instance = null;
        }
    }
}
