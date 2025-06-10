import { LucraClientMessageType, MessageTypeToLucraClient, } from "./types/types.js";
export const LucraClientIframeId = "__lucrasports__";
export const States = [
    { state: "Alaska", code: "AK" },
    { state: "Alabama", code: "AL" },
    { state: "Arkansas", code: "AR" },
    { state: "Arizona", code: "AZ" },
    { state: "California", code: "CA" },
    { state: "Colorado", code: "CO" },
    { state: "Connecticut", code: "CT" },
    { state: "District of Columbia", code: "DC" },
    { state: "Delaware", code: "DE" },
    { state: "Florida", code: "FL" },
    { state: "Georgia", code: "GA" },
    { state: "Hawaii", code: "HI" },
    { state: "Iowa", code: "IA" },
    { state: "Idaho", code: "ID" },
    { state: "Illinois", code: "IL" },
    { state: "Indiana", code: "IN" },
    { state: "Kansas", code: "KS" },
    { state: "Kentucky", code: "KY" },
    { state: "Louisiana", code: "LA" },
    { state: "Massachusetts", code: "MA" },
    { state: "Maryland", code: "MD" },
    { state: "Maine", code: "ME" },
    { state: "Michigan", code: "MI" },
    { state: "Minnesota", code: "MN" },
    { state: "Missouri", code: "MO" },
    { state: "Mississippi", code: "MS" },
    { state: "Montana", code: "MT" },
    { state: "North Carolina", code: "NC" },
    { state: "North Dakota", code: "ND" },
    { state: "Nebraska", code: "NE" },
    { state: "New Hampshire", code: "NH" },
    { state: "New Jersey", code: "NJ" },
    { state: "New Mexico", code: "NM" },
    { state: "Nevada", code: "NV" },
    { state: "New York", code: "NY" },
    { state: "Ohio", code: "OH" },
    { state: "Oklahoma", code: "OK" },
    { state: "Oregon", code: "OR" },
    { state: "Pennsylvania", code: "PA" },
    { state: "Rhode Island", code: "RI" },
    { state: "South Carolina", code: "SC" },
    { state: "South Dakota", code: "SD" },
    { state: "Tennessee", code: "TN" },
    { state: "Texas", code: "TX" },
    { state: "Utah", code: "UT" },
    { state: "Virginia", code: "VA" },
    { state: "Vermont", code: "VT" },
    { state: "Washington", code: "WA" },
    { state: "Wisconsin", code: "WI" },
    { state: "West Virginia", code: "WV" },
    { state: "Wyoming", code: "WY" },
];
function addDefinedSearchParams(params) {
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        // Require both to be set to avoid setting undefined values
        if (key && value) {
            urlParams.set(key, value);
        }
    }
    return urlParams;
}
function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) {
        return undefined;
    }
    // Regex for exactly 10 digits
    const phoneNumberRegex = /^[0-9]{10}$/;
    if (!phoneNumberRegex.test(phoneNumber)) {
        console.error("Phone number not valid, must be exactly 10 digits", phoneNumber);
        return undefined;
    }
    return phoneNumber;
}
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
        tournamentJoined: NoOp,
        convertToCredit: NoOp,
        deepLink: NoOp,
        navigationEvent: NoOp,
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
            case LucraClientMessageType.tournamentJoined:
                this.onMessage.tournamentJoined(event.data.data);
                break;
            case LucraClientMessageType.convertToCredit:
                this.onMessage.convertToCredit(event.data.data);
                break;
            case LucraClientMessageType.deepLink:
                this.onMessage.deepLink(event.data.data);
                break;
            case LucraClientMessageType.navigationEvent:
                this.onMessage.navigationEvent(event.data.data);
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
    constructor({ tenantId, env, onMessage }) {
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
    set tournamentJoinedHandler(handlerFn) {
        this.onMessage.tournamentJoined = handlerFn;
    }
    set navigationEventHandler(handlerFn) {
        this.onMessage.navigationEvent = handlerFn;
    }
    set convertToCreditHandler(handlerFn) {
        this.onMessage.convertToCredit = handlerFn;
    }
    _open({ element, path = "", params = new URLSearchParams(), deepLinkUrl, }) {
        const url = new URL(deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`);
        const validatedPhoneNumber = validatePhoneNumber(params.get("phoneNumber"));
        if (validatedPhoneNumber) {
            url.searchParams.set("loginHint", validatedPhoneNumber);
        }
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
    _redirect(path, params = new URLSearchParams(), deepLinkUrl) {
        if (!this.iframe) {
            throw new Error("Cannot redirect. LucraSports is not open.");
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
    /**
     * Redirect an open LucraClient
     */
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
                    params.set("hideNavigation", "1");
                }
                return this._redirect("app/create-matchup" +
                    (gameId !== undefined ? `/${gameId}/wager` : ""), params);
            },
            matchupDetails: (matchupId, teamInvitedId) => {
                const params = new URLSearchParams();
                if (teamInvitedId) {
                    params.set("teamIdToJoin", teamInvitedId);
                }
                return this._redirect(`app/matchups/${matchupId}`, params);
            },
            tournamentDetails: (matchupId) => this._redirect(`app/tournaments/${matchupId}`),
            deepLink: (url) => {
                if (this.urlOrigin === "" || url.indexOf(this.urlOrigin) !== 0) {
                    throw new Error("Cannot open a url not associated with this tenant");
                }
                return this._redirect("", undefined, url);
            },
        };
    }
    /**
     * Open Lucra in an iframe
     * @param element parent element to contain the LucraClient iframe
     * @param phoneNumber optional phone number to prefill and auto-send verification SMS
     */
    open(element, phoneNumber) {
        return {
            profile: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({ element, path: "app/profile", params });
            },
            home: (locationId) => {
                const params = addDefinedSearchParams({
                    locationId,
                    phoneNumber,
                });
                return this._open({ element, path: "app/home", params });
            },
            deposit: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({
                    element,
                    path: "app/add-funds",
                    params,
                });
            },
            withdraw: () => {
                const params = addDefinedSearchParams({ phoneNumber });
                return this._open({
                    element,
                    path: "app/withdraw-funds",
                    params,
                });
            },
            createMatchup: (gameId) => {
                const params = addDefinedSearchParams({
                    hideNavigation: gameId !== undefined ? "1" : undefined,
                    phoneNumber,
                });
                return this._open({
                    element,
                    path: "app/create-matchup" +
                        (gameId !== undefined ? `/${gameId}/wager` : ""),
                    params,
                });
            },
            matchupDetails: (matchupId, teamIdToJoin) => {
                const params = addDefinedSearchParams({
                    teamIdToJoin,
                    phoneNumber,
                });
                return this._open({
                    element,
                    path: `app/matchups/${matchupId}`,
                    params,
                });
            },
            tournamentDetails: (matchupId) => {
                const params = addDefinedSearchParams({
                    phoneNumber,
                });
                return this._open({
                    element,
                    path: `app/tournaments/${matchupId}`,
                    params,
                });
            },
            deepLink: (url) => {
                if (this.urlOrigin === "" || url.indexOf(this.urlOrigin) !== 0) {
                    throw new Error("Cannot open a url not associated with this tenant");
                }
                return this._open({
                    element,
                    deepLinkUrl: url,
                    params: addDefinedSearchParams({
                        phoneNumber,
                    }),
                });
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
        /**
         * Call this method to navigate Lucra to a new page
         * @param data LucraNavigateRequest
         */
        navigate: (data) => {
            this._sendMessage({
                type: MessageTypeToLucraClient.navigate,
                body: data,
            });
        },
    };
}
export default LucraClient;
