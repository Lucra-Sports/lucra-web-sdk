import { MessageTypeToLucraClient, } from "./types/types.js";
import { LucraClientIframeId, States } from "./constants.js";
import { addDefinedSearchParams, validatePhoneNumber, validateMetadata, } from "./utils.js";
export class LucraClientBase extends EventTarget {
    iframe;
    apiKey = "";
    tenantId = "";
    env = "production";
    urlOrigin = "";
    url = "";
    messages = [];
    locationId = "";
    controller = new AbortController();
    achievementsResolve;
    achievementsReject;
    achievementsTimer;
    triggerFrames = new Map();
    _user = null;
    _isInitialized = false;
    _readyResolve;
    _readyReject;
    _readyPromise = this._createReadyPromise();
    _createReadyPromise() {
        return new Promise((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });
    }
    get ready() {
        return this._readyPromise;
    }
    get isInitialized() {
        return this._isInitialized;
    }
    get user() {
        return this._user;
    }
    iframeUrlOrigin() {
        //console.log('iframeUrlOrigin', this.url)
        return new URL(this.url).origin;
    }
    _eventListener = async (_event) => { };
    setUpEventListener() {
        window.addEventListener("message", this._eventListener, {
            signal: this.controller.signal,
        });
        return null;
    }
    constructor({ apiKey, tenantId, env, locationId, }) {
        super();
        if (!apiKey || !tenantId) {
            throw new Error("Both apiKey and tenantId must be provided to create LucraClient");
        }
        this.env = env;
        this.locationId = locationId ?? "";
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
        url.searchParams.set("parentUrl", window.location.origin);
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
            if (hidden) {
                iframe.style.display = "none";
            }
        }
        catch (e) {
            console.error("Error opening up LucraSports", e);
        }
        return this;
    }
    _minigamesTrigger(element, input) {
        return new Promise((resolve, reject) => {
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
                const path = `app/headless/minigames/${encodeURIComponent(input.game_id)}`;
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
    _redirect(path, params = new URLSearchParams(), deepLinkUrl) {
        if (!this.iframe) {
            throw new Error("Cannot redirect. LucraClient is not open.");
        }
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
    logout() {
        return this._redirect("logout");
    }
    redirect() {
        return {
            profile: () => this._redirect("app/profile"),
            home: (locationId) => {
                const params = new URLSearchParams();
                if (locationId !== undefined) {
                    params.set("locationId", locationId);
                }
                return this._redirect("app/home", params);
            },
            deposit: () => this._redirect("app/add-funds"),
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
        };
    }
    open(element, phoneNumber, options) {
        return {
            profile: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/profile", params, hidden: options?.hidden });
            },
            home: (locationId) => {
                const params = addDefinedSearchParams({ locationId, phoneNumber });
                return this._open({ element, path: "app/home", params, hidden: options?.hidden });
            },
            deposit: () => {
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
            // minigamesTrigger: (input: LucraMinigamesTriggerInput) =>
            //   this._minigamesTrigger(element, input),
        };
    }
    close() {
        this.controller.abort("Closing LucraClient");
        this.controller = new AbortController();
        this.iframe?.remove();
        this.iframe = undefined;
        this._user = null;
        this._isInitialized = false;
        this._readyPromise = this._createReadyPromise();
    }
    moveTo(element) {
        if (this.iframe) {
            element.appendChild(this.iframe);
        }
        return this;
    }
    hide() {
        if (this.iframe) {
            this.iframe.style.display = "none";
        }
        return this;
    }
    show() {
        if (this.iframe) {
            this.iframe.style.display = "block";
        }
        return this;
    }
    _sendMessage(message) {
        try {
            this.iframe?.contentWindow?.postMessage(message, this.urlOrigin);
        }
        catch (e) {
            console.error("Unable to send message to LucraClient iframe", e);
        }
        return this;
    }
    _matchupInviteUrlResponse(data) {
        this._sendMessage({
            type: MessageTypeToLucraClient.matchupInviteUrlResponse,
            body: data,
        });
    }
    _resolveAchievements(data) {
        clearTimeout(this.achievementsTimer);
        this.achievementsResolve?.(data);
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
    api = {
        achievements: () => {
            const promise = new Promise((resolve, reject) => {
                this._sendMessage({
                    type: MessageTypeToLucraClient.achievementsRequest,
                    body: null,
                });
                this.achievementsResolve = resolve;
                this.achievementsReject = reject;
            });
            const timer = setTimeout(() => {
                this.achievementsReject?.("Timeout");
            }, 15_000);
            this.achievementsTimer = timer;
            return promise;
        },
    };
    sendMessage = {
        userUpdated: (data) => {
            if (!validateMetadata(data.metadata)) {
                throw new Error("Invalid metadata: must be an object with string keys and string values, or null");
            }
            this._sendMessage({
                type: MessageTypeToLucraClient.clientUserInfo,
                body: data,
            });
        },
        convertToCreditResponse: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.convertToCreditResponse,
                body: data,
            });
        },
        enableConvertToCredit: () => {
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
            this._sendMessage({
                type: MessageTypeToLucraClient.navigate,
                body: data,
            });
        },
        availableRewards: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.availableRewards,
                body: data,
            });
        },
    };
}
