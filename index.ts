import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraEnvironment,
  type LucraClientOnMessage,
  type LucraClientSendMessage,
  type SDKClientUser,
  type LucraConvertToCreditResponse,
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
    convertToCredit: NoOp,
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
      case LucraClientMessageType.convertToCredit:
        this.onMessage.convertToCredit(event.data.data);
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
   * Create a new instance of LucraClient
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

  private _open(
    element: HTMLElement,
    path: string,
    params: URLSearchParams = new URLSearchParams()
  ) {
    params.set("parentUrl", window.location.origin);

    this.url =
      this.env === "local"
        ? `http://localhost:3000/${path}?${params.toString()}`
        : `https://${this.tenantId.toLowerCase()}.${
            this.env !== "production" ? `${this.env}.` : ""
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
   * Open Lucra in an iframe
   * @param element parent element to contain the LucraClient iframe
   */
  open(element: HTMLElement): {
    /**
     * Open directly to the user's profile page
     */
    profile: () => LucraClient;
    /**
     * Open to the home page
     */
    home: () => LucraClient;
    /**
     * Open directly into add funds
     */
    deposit: () => LucraClient;
    /**
     * Open directly into withdraw funds
     */
    withdraw: () => LucraClient;
    /**
     * Open directly into create matchup flow. If gameId is provided, the game selection screen will be skipped.
     */
    createMatchup: (gameId?: string) => LucraClient;
    /**
     * Open directly to a matchup where the user can accept, cancel, or wager on the matchup.
     */
    matchupDetails: (matchupId: string, teamInvitedId?: string) => LucraClient;
  } {
    return {
      profile: () => this._open(element, "app/profile"),
      home: () => this._open(element, "app/home"),
      deposit: () => this._open(element, "app/add-funds"),
      withdraw: () => this._open(element, "app/withdraw-funds"),
      createMatchup: (gameId?: string) =>
        this._open(
          element,
          "app/create-matchup" +
            (gameId !== undefined ? `/${gameId}/wager` : "")
        ),
      matchupDetails: (matchupId: string, teamInvitedId?: string) => {
        const params = new URLSearchParams();
        if (teamInvitedId) {
          params.set("teamIdToJoin", teamInvitedId);
        }

        return this._open(element, `app/matchups/${matchupId}`, params);
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

  private _sendMessage(message: any) {
    try {
      this.iframe?.contentWindow?.postMessage(message, this.iframeUrlOrigin());
    } catch (e) {
      console.error("Unable to send message to LucraClient iframe", e);
      throw e;
    } finally {
      return this;
    }
  }

  /**
   * Send a message to LucraClient
   */
  sendMessage: LucraClientSendMessage = {
    /**
     * Update the user in Lucra
     * @param data SDKClientUser
     */
    userUpdated: (data: SDKClientUser) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.clientUserInfo,
        body: data,
      });
    },
    /**
     * Call this method after receiving a `convertToCredit` request message
     * @param data LucraConvertToCreditResponse
     */
    convertToCreditResponse: (data: LucraConvertToCreditResponse) => {
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
  };
}

export default LucraClient;
