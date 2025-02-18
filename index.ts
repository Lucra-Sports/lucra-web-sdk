import {
  LucraSportsMessageType,
  type LucraSportsOnMessage,
  type LucraSportsSendMessage,
  type UserInfo,
} from "./types";

export const LucraSportsIframeId = "__lucrasports__";

function NoOp(data?: any) {
  console.log("Not implemented", data);
}

export class LucraSports {
  private userInfo?: UserInfo;
  private iframe?: HTMLIFrameElement;
  private url?: string;
  private messages: string[] = [];
  private onMessage: LucraSportsOnMessage = {
    login: NoOp,
    userInfo: NoOp,
    matchupCreated: NoOp,
    matchupCanceled: NoOp,
    matchupCompleted: NoOp,
  };
  private controller: AbortController = new AbortController();
  private iframeParentElement?: HTMLElement;

  private _eventListener = (event: MessageEvent<any>) => {
    const iframeUrl = new URL(this.url ?? "");
    if (event.origin !== iframeUrl.origin) return;
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
      case LucraSportsMessageType.matchupCanceled:
        this.onMessage.matchupCanceled(event.data.data);
        break;
      case LucraSportsMessageType.matchupCompleted:
        this.onMessage.matchupCompleted(event.data.data);
        break;
      default:
        console.log("Unrecognized LucraSportsMessageType", event.data.type);
        break;
    }
  };

  private setUpEventListener() {
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
   * @param matchupId if `destination` is `home`, you can supply a default matchupId to skip the matchup selection screen
   */
  constructor({
    url,
    onMessage,
    destination,
    matchupId,
    userInfo,
  }: {
    url: string;
    onMessage: LucraSportsOnMessage;
    destination: "home" | "profile" | "create-matchup";
    matchupId?: string;
    userInfo?: UserInfo;
  }) {
    const params = new URLSearchParams();
    params.set("iframed", "true");
    const path =
      destination === "home"
        ? "app/home"
        : destination === "profile"
        ? "app/profile"
        : matchupId !== undefined
        ? `app/create-matchup/${matchupId}/wager`
        : "app/create-matchup";

    this.url = `${url}/${path}?${params.toString()}`;
    this.userInfo = userInfo;
    this.onMessage = onMessage;
    this.setUpEventListener();
  }

  /**
   * Open LucraSports in an iframe and start listening to messages
   * @param element parent element to contain the LucraSports iframe
   */
  open(element: HTMLElement) {
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
    } catch (e) {
      console.error("Error opening up LucraSports", e);
    } finally {
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

  private _sendMessage(message: any) {
    try {
      this.iframe?.contentWindow?.postMessage(message);
    } catch (e) {
      console.error("Unable to send message to LucraSports iframe", e);
      throw e;
    } finally {
      return this;
    }
  }

  /**
   * Send a message to LucraSports
   */
  sendMessage: LucraSportsSendMessage = {
    userInfo: (data: UserInfo) => this._sendMessage(data),
  };
}

export default LucraSports;
