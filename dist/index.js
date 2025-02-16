import { LucraSportsMessageType, } from "./types";
export const LucraSportsIframeId = "__lucrasports__";
function NoOp(data) {
    console.log("Not implemented", data);
}
export class LucraSports {
    userInfo;
    iframe;
    url;
    messages = [];
    onMessage = {
        login: NoOp,
        userInfo: NoOp,
        matchupCreated: NoOp,
    };
    controller = new AbortController();
    iframeParentElement;
    _eventListener = (event) => {
        const iframeUrl = new URL(this.url ?? "");
        if (event.origin !== iframeUrl.origin)
            return;
        this.messages.push(event.data);
        switch (event.data.type) {
            case LucraSportsMessageType.login:
                this.onMessage.login(event.data.data);
                break;
            case LucraSportsMessageType.matchupCreated:
                this.onMessage.matchupCreated(event.data.data);
                break;
            case LucraSportsMessageType.userInfo:
                this.onMessage.userInfo(event.data.data);
                break;
            default:
                console.log("Unrecognized LucraSportsMessageType", event.data.type);
                break;
        }
    };
    setUpEventListener() {
        console.log("addEventListener");
        window.addEventListener("message", this._eventListener, {
            signal: this.controller.signal,
        });
        return null;
    }
    /**
     * Create a new instance of LucraSports
     * @param url Url for LucraSports - https://app.lucrasports.com/<tenantId>
     * @param onMessage Message Handler for messages from LucraSports
     * @param userInfo User information for pre-populating KYC flow
     * @param destination home, profile, or create-matchup
     */
    constructor({ url, onMessage, destination, userInfo, }) {
        const params = new URLSearchParams();
        params.set("iframed", "true");
        params.set("redirect", destination === "home"
            ? "/app/home"
            : destination === "profile"
                ? "/app/profile"
                : "/app/create-matchup");
        this.url = `${url}?${params.toString()}`;
        this.userInfo = userInfo;
        this.onMessage = onMessage;
        this.setUpEventListener();
    }
    /**
     * Open LucraSports in an iframe and start listening to messages
     * @param element parent element to contain the LucraSports iframe
     */
    open(element) {
        try {
            this.iframeParentElement = element;
            const searchStateParam = this.userInfo
                ? `?appState=${btoa(JSON.stringify(this.userInfo))}`
                : "";
            const iframe = document.createElement("iframe");
            this.iframe = iframe;
            iframe.id = LucraSportsIframeId;
            iframe.src = this.url + searchStateParam;
            iframe.style.height = "100%";
            iframe.style.width = "100%";
            iframe.allow = "geolocation *";
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
     * Close iframe and stop listening to any messages sent from LucraSports
     */
    close() {
        this.controller.abort("Closing LucraSports");
        if (this.iframeParentElement) {
            this.iframeParentElement.innerHTML = "";
        }
    }
    _sendMessage(message) {
        try {
            this.iframe?.contentWindow?.postMessage(message);
        }
        catch (e) {
            console.error("Unable to send message to LucraSports iframe", e);
            throw e;
        }
        finally {
            return this;
        }
    }
    /**
     * Send a message to LucraSports
     */
    sendMessage = {
        userInfo: (data) => this._sendMessage(data),
    };
}
export default LucraSports;
