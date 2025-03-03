import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraEnvironment,
  type LucraDestination,
  type LucraClientOnMessage,
  type LucraClientSendMessage,
  type SDKClientUser,
} from "./types";

export const LucraClientIframeId = "__lucrasports__";

function NoOp(data?: any) {
  console.log("Not implemented", data);
}

export class LucraClient {
  private iframe?: HTMLIFrameElement;
  private tenantId: string = "";
  private env: LucraEnvironment = "production";
  private url: string = "";
  private messages: string[] = [];
  private onMessage: LucraClientOnMessage = {
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
      default:
        console.log("Unrecognized LucraClientMessageType", event.data.type);
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
   * @param tenantId Your Lucra tenantId
   * @param env sandbox | production
   * @param onMessage Message Handler for messages from LucraClient
   */
  constructor({
    tenantId,
    env,
    onMessage,
  }: {
    tenantId: string;
    env: LucraEnvironment;
    onMessage: LucraClientOnMessage;
  }) {
    this.env = env;
    this.tenantId = tenantId;
    this.onMessage = onMessage;
  }

  /**
   * Open LucraSports in an iframe and start listening to messages
   * @param element parent element to contain the LucraSports iframe
   * @param destination home, profile, or create-matchup
   * @param matchupId if `destination` is `create-matchup`, you can supply a default matchupId to skip the matchup selection screen
   */
  open({
    element,
    destination,
    matchupId,
    __debugUrl,
  }: {
    element: HTMLElement;
    destination: LucraDestination;
    matchupId?: string;
    __debugUrl?: string;
  }) {
    const path =
      destination === "home"
        ? "app/home"
        : destination === "profile"
        ? "app/profile"
        : matchupId !== undefined
        ? `app/create-matchup/${matchupId}/wager`
        : "app/create-matchup";
    const params = new URLSearchParams();
    params.set("parentUrl", window.location.origin);

    this.url =
      `${__debugUrl}/${path}?${params.toString()}` ||
      `https://${this.tenantId}.${
        this.env === "sandbox" ? "sandbox." : ""
      }lucrasports.com/${path}?${params.toString()}`;
    this.setUpEventListener();

    try {
      this.iframeParentElement = element;
      const iframe = document.createElement("iframe");
      this.iframe = iframe;
      iframe.id = LucraClientIframeId;
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
  sendMessage: LucraClientSendMessage = {
    userUpdated: (data: SDKClientUser) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.clientUserInfo,
        body: data,
      });
    },
  };
}

export default LucraClient;
