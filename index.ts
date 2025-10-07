import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraClientOnMessage,
  type LucraClientSendMessage,
  type LucraConvertToCreditBody,
  type LucraConvertToCreditResponse,
  type LucraDeepLinkBody,
  type LucraDeepLinkResponse,
  type LucraEnvironment,
  type LucraMatchupAcceptedBody,
  type LucraMatchupCanceledBody,
  type LucraMatchupCreatedBody,
  type LucraNavigateRequest,
  type LucraNavigationEventBody,
  type LucraTournamentJoinedBody,
  type LucraUserInfoBody,
  type SDKClientUser,
  type StateCode,
  type StateFull,
  type LucraClientConstructor,
  type LucraClaimRewardBody,
  type LucraAvailableRewards,
  type LucraMatchupStartedBody,
  type LucraLoginSuccessBody,
  type LucraActiveMatchupStartedBody,
  type MatchupInviteUrlTransformer,
} from "./types/types.js";

export const LucraClientIframeId = "__lucrasports__";

export const States: {
  state: StateFull;
  code: StateCode;
}[] = [
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
] as const;

function addDefinedSearchParams(
  params: Record<string, string | undefined>
): URLSearchParams {
  const urlParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    // Require both to be set to avoid setting undefined values
    if (key && value) {
      urlParams.set(key, value);
    }
  }
  return urlParams;
}

function validatePhoneNumber(phoneNumber: string | null): string | undefined {
  if (!phoneNumber) {
    return undefined;
  }

  // Regex for exactly 10 digits
  const phoneNumberRegex = /^[0-9]{10}$/;

  if (!phoneNumberRegex.test(phoneNumber)) {
    console.error(
      "Phone number not valid, must be exactly 10 digits",
      phoneNumber
    );
    return undefined;
  }

  return phoneNumber;
}

function NoOp(data?: any): undefined {
  console.log("Not implemented", data);
  return undefined;
}

type LucraNavigation = {
  /**
   * Open directly to the user's profile page
   */
  profile: () => LucraClient;
  /**
   * Open to the home page
   */
  home: (locationId?: string) => LucraClient;
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
  matchupDetails: (matchupId: string) => LucraClient;
  /**
   * Open directly to a tournament where the user can join.
   */
  tournamentDetails: (matchupId: string) => LucraClient;
  /**
   * Open directly to the deep link
   * @param url deepLink url
   */
  deepLink: (url: string) => LucraClient;
};

export class LucraClient {
  private iframe?: HTMLIFrameElement;
  private tenantId: string = "";
  private env: LucraEnvironment = "production";
  private urlOrigin: string = "";
  private url: string = "";
  private messages: string[] = [];
  private locationId: string = "";
  private onExitLucra: () => void = NoOp;
  private onMessage: LucraClientOnMessage = {
    userInfo: NoOp,
    matchupCreated: NoOp,
    activeMatchupStarted: NoOp,
    matchupStarted: NoOp,
    matchupCanceled: NoOp,
    matchupAccepted: NoOp,
    tournamentJoined: NoOp,
    convertToCredit: NoOp,
    deepLink: NoOp,
    matchupInviteUrl: async () => NoOp(),
    navigationEvent: NoOp,
    claimReward: NoOp,
    loginSuccess: NoOp,
  };
  private controller: AbortController = new AbortController();
  private iframeParentElement?: HTMLElement;
  private iframeUrlOrigin() {
    return new URL(this.url).origin;
  }

  private _eventListener = async (event: MessageEvent<any>) => {
    if (event.origin !== this.iframeUrlOrigin()) return;

    this.messages.push(event.data);
    switch (event.data.type) {
      case LucraClientMessageType.matchupCreated:
        this.onMessage.matchupCreated(event.data.data);
        break;
      case LucraClientMessageType.activeMatchupStarted:
        this.onMessage.activeMatchupStarted(event.data.data);
        break;
      case LucraClientMessageType.matchupStarted:
        this.onMessage.matchupStarted(event.data.data);
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
      case LucraClientMessageType.matchupInviteUrl:
        const urlResult = await this.onMessage.matchupInviteUrl(
          event.data.data.matchupId
        );
        if (!urlResult || urlResult.trim() === "") {
          console.warn(
            "matchupDeepLinkHandler not configured or returned empty, falling back to deepLink"
          );
          break;
        }

        this._matchupInviteUrlResponse({
          url: urlResult,
        });
        break;
      case LucraClientMessageType.navigationEvent:
        this.onMessage.navigationEvent(event.data.data);
        break;
      case LucraClientMessageType.claimReward:
        this.onMessage.claimReward(event.data.data);
        break;
      case LucraClientMessageType.loginSuccess:
        this.onMessage.loginSuccess(event.data.data);
        break;
      case LucraClientMessageType.exitLucra:
        this.onExitLucra();
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
    env,
    locationId,
    onMessage,
    tenantId,
  }: LucraClientConstructor) {
    this.env = env;
    this.locationId = locationId ?? "";
    this.onExitLucra = NoOp;
    this.onMessage = onMessage;
    this.tenantId = tenantId;
    this.urlOrigin =
      this.env === "local"
        ? `http://localhost:3000`
        : `https://${this.tenantId.toLowerCase()}.${
            this.env !== "production" ? `${this.env}.` : ""
          }lucrasports.com`;
  }

  set loginSuccessHandler(handlerFn: (data: LucraLoginSuccessBody) => void) {
    this.onMessage.loginSuccess = handlerFn;
  }

  /**
   * @deprecated Use matchupDeepLinkHandler instead.
   * The deepLinkHandler method is being phased out in favor of the more specific
   * matchupDeepLinkHandler which provides better clarity for matchup invitations.
   */
  set deepLinkHandler(handlerFn: (data: LucraDeepLinkBody) => void) {
    this.onMessage.deepLink = handlerFn;
  }
  set matchupDeepLinkHandler(transformer: MatchupInviteUrlTransformer) {
    this.onMessage.matchupInviteUrl = transformer;
  }
  set userInfoHandler(handlerFn: (data: LucraUserInfoBody) => void) {
    this.onMessage.userInfo = handlerFn;
  }
  set matchupCreatedHandler(
    handlerFn: (data: LucraMatchupCreatedBody) => void
  ) {
    this.onMessage.matchupCreated = handlerFn;
  }
  set activeMatchupStartedHandler(
    handlerFn: (data: LucraActiveMatchupStartedBody) => void
  ) {
    this.onMessage.activeMatchupStarted = handlerFn;
  }
  set matchupStartedHandler(
    handlerFn: (data: LucraMatchupStartedBody) => void
  ) {
    this.onMessage.matchupStarted = handlerFn;
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
  set tournamentJoinedHandler(
    handlerFn: (data: LucraTournamentJoinedBody) => void
  ) {
    this.onMessage.tournamentJoined = handlerFn;
  }
  set navigationEventHandler(
    handlerFn: (data: LucraNavigationEventBody) => void
  ) {
    this.onMessage.navigationEvent = handlerFn;
  }
  set convertToCreditHandler(
    handlerFn: (data: LucraConvertToCreditBody) => void
  ) {
    this.onMessage.convertToCredit = handlerFn;
  }
  set claimReward(handlerFn: (data: LucraClaimRewardBody) => void) {
    this.onMessage.claimReward = handlerFn;
  }
  set exitLucraHandler(handlerFn: () => void) {
    this.onExitLucra = handlerFn;
    this._sendMessage({
      type: MessageTypeToLucraClient.enableExitLucra,
      body: true,
    });
  }

  private _open({
    element,
    path = "",
    params = new URLSearchParams(),
    deepLinkUrl,
  }: {
    element: HTMLElement;
    path?: string;
    params?: URLSearchParams;
    deepLinkUrl?: string;
  }) {
    // .open() is being called again but the iframe is already there so just redirect
    if (this.iframe) {
      return this._redirect(path, params, deepLinkUrl);
    }

    const url = new URL(
      deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`
    );

    const validatedPhoneNumber = validatePhoneNumber(params.get("phoneNumber"));

    if (validatedPhoneNumber) {
      url.searchParams.set("loginHint", validatedPhoneNumber);
    }

    // locationId was passed into the constructor, but if locationId was passed into the `home` method, use that one
    if (this.locationId && !params.get("locationId")) {
      url.searchParams.set("locationId", this.locationId);
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
        "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment;";
      element.appendChild(iframe);
    } catch (e) {
      console.error("Error opening up LucraSports", e);
    } finally {
      return this;
    }
  }

  private _redirect(
    path: string,
    params: URLSearchParams = new URLSearchParams(),
    deepLinkUrl?: string
  ) {
    if (!this.iframe) {
      throw new Error("Cannot redirect. LucraClient is not open.");
    }

    const url = new URL(
      deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`
    );
    url.searchParams.set("parentUrl", window.location.origin);

    this.url = url.toString();

    try {
      this.sendMessage.navigate({
        pathname: `${url.pathname}${url.search}`,
      });
    } catch (e) {
      console.error("Error redirecting LucraSports", e);
    } finally {
      return this;
    }
  }

  /**
   * Force a user to logout
   */
  logout(): LucraClient {
    return this._redirect("logout");
  }

  /**
   * Redirect an open LucraClient
   */
  redirect(): LucraNavigation {
    return {
      profile: () => this._redirect("app/profile"),
      home: (locationId?: string) => {
        const params = new URLSearchParams();
        if (locationId !== undefined) {
          params.set("locationId", locationId);
        }

        return this._redirect("app/home", params);
      },
      deposit: () => this._redirect("app/add-funds"),
      withdraw: () => this._redirect("app/withdraw-funds"),
      createMatchup: (gameId?: string) => {
        const params = new URLSearchParams();
        if (gameId !== undefined) {
          params.set("hideNavigation", "1");
        }

        return this._redirect(
          "app/create-matchup" +
            (gameId !== undefined ? `/${gameId}/wager` : ""),
          params
        );
      },
      matchupDetails: (matchupId: string) => {
        return this._redirect(`app/matchups/${matchupId}`);
      },
      tournamentDetails: (matchupId: string) =>
        this._redirect(`app/tournaments/${matchupId}`),
      deepLink: (url: string) => {
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
  open(element: HTMLElement, phoneNumber?: string): LucraNavigation {
    return {
      profile: () => {
        const params = addDefinedSearchParams({ phoneNumber });

        return this._open({ element, path: "app/profile", params });
      },
      home: (locationId?: string) => {
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
      createMatchup: (gameId?: string) => {
        const params = addDefinedSearchParams({
          hideNavigation: gameId !== undefined ? "1" : undefined,
          phoneNumber,
        });

        return this._open({
          element,
          path:
            "app/create-matchup" +
            (gameId !== undefined ? `/${gameId}/wager` : ""),
          params,
        });
      },
      matchupDetails: (matchupId: string) => {
        const params = addDefinedSearchParams({
          phoneNumber,
        });

        return this._open({
          element,
          path: `app/matchups/${matchupId}`,
          params,
        });
      },
      tournamentDetails: (matchupId: string) => {
        const params = addDefinedSearchParams({
          phoneNumber,
        });

        return this._open({
          element,
          path: `app/tournaments/${matchupId}`,
          params,
        });
      },
      deepLink: (url: string) => {
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

  private _matchupInviteUrlResponse(data: LucraDeepLinkResponse) {
    this._sendMessage({
      type: MessageTypeToLucraClient.matchupInviteUrlResponse,
      body: data,
    });
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
     * @deprecated Use matchupInviteUrlResponse for new matchup invite flows
     */
    deepLinkResponse: (data: LucraDeepLinkResponse) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.deepLinkResponse,
        body: data,
      });
    },
    /**
     * Call this method to navigate Lucra to a new page
     * @param data LucraNavigateRequest
     */
    navigate: (data: LucraNavigateRequest) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.navigate,
        body: data,
      });
    },
    /**
     * If free to play is enabled, call this method to show the tenant reward options to the user
     * @param data LucraAvailableRewards
     */
    availableRewards: (data: LucraAvailableRewards) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.availableRewards,
        body: data,
      });
    },
  };
}

export default LucraClient;
