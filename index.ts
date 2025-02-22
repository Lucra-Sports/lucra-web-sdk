import {
  LucraSportsMessageType,
  MessageTypeToLucraSports,
  type LucraSportsOnMessage,
  type LucraSportsSendMessage,
  type SDKClientUser,
} from "./types";

export const LucraSportsIframeId = "__lucrasports__";

function NoOp(data?: any) {
  console.log("Not implemented", data);
}

export class LucraSports {
  private iframe?: HTMLIFrameElement;
  private url: string = "";
  private messages: string[] = [];
  private onMessage: LucraSportsOnMessage = {
    userInfo: NoOp,
    matchupCreated: NoOp,
    matchupCanceled: NoOp,
    matchupAccepted: NoOp,
  };
  private controller: AbortController = new AbortController();
  private iframeParentElement?: HTMLElement;

  private iframeUrlOrigin() {
    return new URL(this.url).origin;
  }

  private _eventListener = (event: MessageEvent<any>) => {
    if (event.origin !== this.iframeUrlOrigin()) return;
    this.messages.push(event.data);
    switch (event.data.type) {
      case LucraSportsMessageType.matchupCreated:
        this.onMessage.matchupCreated(event.data.data);
        break;
      case LucraSportsMessageType.userInfo:
        this.onMessage.userInfo(event.data.data);
        break;
      case LucraSportsMessageType.matchupCanceled:
        this.onMessage.matchupCanceled(event.data.data);
        break;
      case LucraSportsMessageType.matchupAccepted:
        this.onMessage.matchupAccepted(event.data.data);
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
   * @param tenantId Your LucraSports tenantId
   * @param env sandbox | production
   * @param hostUrl What URL is hosting LucraSports? Necessary to do `.postMessage` securely
   * @param onMessage Message Handler for messages from LucraSports
   * @param destination home, profile, or create-matchup
   * @param matchupId if `destination` is `create-matchup`, you can supply a default matchupId to skip the matchup selection screen
   */
  constructor({
    tenantId,
    env,
    hostUrl,
    onMessage,
    destination,
    matchupId,
    __debugUrl,
  }: {
    tenantId: string;
    env: "sandbox" | "production";
    hostUrl: string;
    onMessage: LucraSportsOnMessage;
    destination: "home" | "profile" | "create-matchup";
    matchupId?: string;
    __debugUrl?: string;
  }) {
    const params = new URLSearchParams();
    params.set("parentUrl", hostUrl);
    const path =
      destination === "home"
        ? "app/home"
        : destination === "profile"
        ? "app/profile"
        : matchupId !== undefined
        ? `app/create-matchup/${matchupId}/wager`
        : "app/create-matchup";

    this.url =
      `${__debugUrl}/${path}?${params.toString()}` ||
      `https://${tenantId}.${
        env === "sandbox" ? "sandbox." : ""
      }lucrasports.com/${path}?${params.toString()}`;
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
      const iframe = document.createElement("iframe");
      this.iframe = iframe;
      iframe.id = LucraSportsIframeId;
      iframe.src = this.url;
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
      this.iframe?.contentWindow?.postMessage(message, this.iframeUrlOrigin());
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
    userUpdated: (data: SDKClientUser) => {
      this._sendMessage({
        type: MessageTypeToLucraSports.clientUserInfo,
        body: data,
      });
    },
  };
}

export default LucraSports;
