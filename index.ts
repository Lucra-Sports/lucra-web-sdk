import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraEnvironment,
  type LucraClientOnMessage,
  type LucraClientSendMessage,
  type SDKClientUser,
  type LucraConvertToCreditResponse,
  type LucraDeepLinkResponse,
  type LucraDeepLinkBody,
  type LucraUserInfoBody,
  type LucraMatchupCreatedBody,
  type LucraMatchupAcceptedBody,
  type LucraMatchupCanceledBody,
  type LucraConvertToCreditBody,
} from "./types";

export const LucraClientIframeId = "__lucrasports__";

function NoOp(data?: any) {
  console.log("Not implemented", data);
}

export class LucraClient {
  private iframe?: HTMLIFrameElement;
  private tenantId: string = "";
  private env: LucraEnvironment = "production";
  private urlOrigin: string = "";
  private url: string = "";
  private messages: string[] = [];
  private onMessage: LucraClientOnMessage = {
    userInfo: NoOp,
    matchupCreated: NoOp,
    matchupCanceled: NoOp,
    matchupAccepted: NoOp,
    convertToCredit: NoOp,
    deepLink: NoOp,
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
      case LucraClientMessageType.deepLink:
        this.onMessage.deepLink(event.data.data);
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
    this.urlOrigin =
      this.env === "local"
        ? `http://localhost:3000`
        : `https://${this.tenantId.toLowerCase()}.${
            this.env !== "production" ? `${this.env}.` : ""
          }lucrasports.com`;
  }

  set deepLinkHandler(handlerFn: (data: LucraDeepLinkBody) => void) {
    this.onMessage.deepLink = handlerFn;
  }
  set userInfoHandler(handlerFn: (data: LucraUserInfoBody) => void) {
    this.onMessage.userInfo = handlerFn;
  }
  set matchupCreatedHandler(
    handlerFn: (data: LucraMatchupCreatedBody) => void
  ) {
    this.onMessage.matchupCreated = handlerFn;
  }
  set matchupAcceptedHandler(
    handlerFn: (data: LucraMatchupAcceptedBody) => void
  ) {
    this.onMessage.matchupAccepted = handlerFn;
  }
  set matchupCanceledHandler(
    handlerFn: (data: LucraMatchupCanceledBody) => void
  ) {
    this.onMessage.matchupCanceled = handlerFn;
  }
  set convertToCreditHandler(
    handlerFn: (data: LucraConvertToCreditBody) => void
  ) {
    this.onMessage.convertToCredit = handlerFn;
  }

  private _open(
    element: HTMLElement,
    path: string,
    params: URLSearchParams = new URLSearchParams(),
    deepLinkUrl?: string
  ) {
    params.set("parentUrl", window.location.origin);

    this.url = deepLinkUrl
      ? deepLinkUrl
      : `${this.urlOrigin}/${path}?${params.toString()}`;
    this.setUpEventListener();

    try {
      this.iframeParentElement = element;
      const iframe = document.createElement("iframe");
      this.iframe = iframe;
      iframe.id = LucraClientIframeId;
      iframe.src = this.url;
      iframe.style.height = "100%";
      iframe.style.width = "100%";
      iframe.allow = "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *;";
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
    /**
     * Open directly to the deep link
     * @param url deepLink url
     */
    deepLink: (url: string) => LucraClient;
  } {
    return {
      profile: () => this._open(element, "app/profile"),
      home: () => this._open(element, "app/home"),
      deposit: () => this._open(element, "app/add-funds"),
      withdraw: () => this._open(element, "app/withdraw-funds"),
      createMatchup: (gameId?: string) => {
        const params = new URLSearchParams();
        if (gameId !== undefined) {
          params.set("hideNavigation", "1");
        }

        return this._open(
          element,
          "app/create-matchup" +
            (gameId !== undefined ? `/${gameId}/wager` : ""),
          params
        );
      },
      matchupDetails: (matchupId: string, teamInvitedId?: string) => {
        const params = new URLSearchParams();
        if (teamInvitedId) {
          params.set("teamIdToJoin", teamInvitedId);
        }

        return this._open(element, `app/matchups/${matchupId}`, params);
      },
      deepLink: (url: string) => {
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
    /**
     * Call this method after receiving a `deepLink` request message
     * @param data LucraDeepLinkResponse
     */
    deepLinkResponse: (data: LucraDeepLinkResponse) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.deepLinkResponse,
        body: data,
      });
    },
  };
}

export default LucraClient;
