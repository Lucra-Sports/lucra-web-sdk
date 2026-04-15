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
    _open({ element, path = "", params = new URLSearchParams(), deepLinkUrl, hidden, }) {
        if (this.iframe) {
            return this._redirect(path, params, deepLinkUrl);
        }
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
        };
    }
    close() {
        this.controller.abort("Closing LucraClient");
        this.controller = new AbortController();
        this.iframe?.remove();
        this.iframe = undefined;
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
            this.iframe?.contentWindow?.postMessage(message, this.iframeUrlOrigin());
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
