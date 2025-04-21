import { LucraClientMessageType, MessageTypeToLucraClient, } from "./types/index";
export const LucraClientIframeId = "__lucrasports__";
function NoOp(data) {
    console.log("Not implemented", data);
}
export class LucraClient {
    iframe;
    tenantId = "";
    env = "production";
    urlOrigin = "";
    url = "";
    messages = [];
    onMessage = {
        userInfo: NoOp,
        matchupCreated: NoOp,
        matchupCanceled: NoOp,
        matchupAccepted: NoOp,
        convertToCredit: NoOp,
        deepLink: NoOp,
    };
    controller = new AbortController();
    iframeParentElement;
    iframeUrlOrigin() {
        return new URL(this.url).origin;
    }
    _eventListener = (event) => {
        if (event.origin !== this.iframeUrlOrigin())
            return;
        this.messages.push(event.data);
        switch (event.data.type) {
            case LucraClientMessageType.matchupCreated:
                this.onMessage.matchupCreated(event.data.data);
                break;
            case LucraClientMessageType.userInfo:
                this.onMessage.userInfo(event.data.data);
                break;
            case LucraClientMessageType.matchupCanceled:
                this.onMessage.matchupCanceled(event.data.data);
                break;
            case LucraClientMessageType.matchupAccepted:
                this.onMessage.matchupAccepted(event.data.data);
                break;
            case LucraClientMessageType.convertToCredit:
                this.onMessage.convertToCredit(event.data.data);
                break;
            case LucraClientMessageType.deepLink:
                this.onMessage.deepLink(event.data.data);
                break;
            default:
                console.log("Unrecognized LucraClientMessageType", event.data.type);
                break;
        }
    };
    setUpEventListener() {
        window.addEventListener("message", this._eventListener, {
            signal: this.controller.signal,
        });
        return null;
    }
    /**
     * Create a new instance of LucraClient
     * @param tenantId Your Lucra tenantId
     * @param env sandbox | production
     * @param onMessage Message Handler for messages from LucraClient
     */
    constructor({ tenantId, env, onMessage, }) {
        this.env = env;
        this.tenantId = tenantId;
        this.onMessage = onMessage;
        this.urlOrigin =
            this.env === "local"
                ? `http://localhost:3000`
                : `https://${this.tenantId.toLowerCase()}.${this.env !== "production" ? `${this.env}.` : ""}lucrasports.com`;
    }
    set deepLinkHandler(handlerFn) {
        this.onMessage.deepLink = handlerFn;
    }
    set userInfoHandler(handlerFn) {
        this.onMessage.userInfo = handlerFn;
    }
    set matchupCreatedHandler(handlerFn) {
        this.onMessage.matchupCreated = handlerFn;
    }
    set matchupAcceptedHandler(handlerFn) {
        this.onMessage.matchupAccepted = handlerFn;
    }
    set matchupCanceledHandler(handlerFn) {
        this.onMessage.matchupCanceled = handlerFn;
    }
    set convertToCreditHandler(handlerFn) {
        this.onMessage.convertToCredit = handlerFn;
    }
    _open(element, path, params = new URLSearchParams(), deepLinkUrl) {
        const url = new URL(deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`);
        url.searchParams.set("parentUrl", window.location.origin);
        this.url = url.toString();
        this.setUpEventListener();
        try {
            this.iframeParentElement = element;
            const iframe = document.createElement("iframe");
            this.iframe = iframe;
            iframe.id = LucraClientIframeId;
            iframe.src = this.url;
            iframe.style.height = "100%";
            iframe.style.width = "100%";
            iframe.allow =
                "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *;";
            element.appendChild(iframe);
        }
        catch (e) {
            console.error("Error opening up LucraSports", e);
        }
        finally {
            return this;
        }
    }
    /**
     * Open Lucra in an iframe
     * @param element parent element to contain the LucraClient iframe
     */
    open(element) {
        return {
            profile: () => this._open(element, "app/profile"),
            home: () => this._open(element, "app/home"),
            deposit: () => this._open(element, "app/add-funds"),
            withdraw: () => this._open(element, "app/withdraw-funds"),
            createMatchup: (gameId) => {
                const params = new URLSearchParams();
                if (gameId !== undefined) {
                    params.set("hideNavigation", "1");
                }
                return this._open(element, "app/create-matchup" +
                    (gameId !== undefined ? `/${gameId}/wager` : ""), params);
            },
            matchupDetails: (matchupId, teamInvitedId) => {
                const params = new URLSearchParams();
                if (teamInvitedId) {
                    params.set("teamIdToJoin", teamInvitedId);
                }
                return this._open(element, `app/matchups/${matchupId}`, params);
            },
            deepLink: (url) => {
                if (this.urlOrigin === "" || url.indexOf(this.urlOrigin) !== 0) {
                    throw new Error("Cannot open a url not associated with this tenant");
                }
                return this._open(element, "", undefined, url);
            },
        };
    }
    /**
     * Close iframe and stop listening to any messages sent from LucraClient
     */
    close() {
        this.controller.abort("Closing LucraClient");
        if (this.iframeParentElement) {
            this.iframeParentElement.innerHTML = "";
        }
    }
    _sendMessage(message) {
        try {
            this.iframe?.contentWindow?.postMessage(message, this.iframeUrlOrigin());
        }
        catch (e) {
            console.error("Unable to send message to LucraClient iframe", e);
            throw e;
        }
        finally {
            return this;
        }
    }
    /**
     * Send a message to LucraClient
     */
    sendMessage = {
        /**
         * Update the user in Lucra
         * @param data SDKClientUser
         */
        userUpdated: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.clientUserInfo,
                body: data,
            });
        },
        /**
         * Call this method after receiving a `convertToCredit` request message
         * @param data LucraConvertToCreditResponse
         */
        convertToCreditResponse: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.convertToCreditResponse,
                body: data,
            });
        },
        /**
         * Let Lucra know there's a credit option for withdrawing funds
         */
        enableConvertToCredit: () => {
            this._sendMessage({
                type: MessageTypeToLucraClient.enableConvertToCredit,
                body: null,
            });
        },
        /**
         * Call this method after receiving a `deepLink` request message
         * @param data LucraDeepLinkResponse
         */
        deepLinkResponse: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.deepLinkResponse,
                body: data,
            });
        },
    };
}
export default LucraClient;
