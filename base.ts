import {
  MessageTypeToLucraClient,
  type LucraClientSendMessage,
  type LucraConvertToCreditResponse,
  type LucraDeepLinkResponse,
  type LucraEnvironment,
  type LucraNavigateRequest,
  type SDKClientUser,
  type LucraClientConstructor,
  type LucraAvailableRewards,
  type LucraPage,
  type LucraReward,
  type SDKLucraUser,
} from "./types/types.js";
import { LucraClientIframeId, States } from "./constants.js";
import {
  addDefinedSearchParams,
  validatePhoneNumber,
  validateMetadata,
} from "./utils.js";

type LucraNavigation = {
  profile: () => LucraClientBase;
  home: (locationId?: string) => LucraClientBase;
  deposit: () => LucraClientBase;
  withdraw: () => LucraClientBase;
  createMatchup: (gameId?: string) => LucraClientBase;
  matchupDetails: (matchupId: string) => LucraClientBase;
  tournamentDetails: (matchupId: string) => LucraClientBase;
  deepLink: (url: string) => LucraClientBase;
};

export class LucraClientBase extends EventTarget {
  private iframe?: HTMLIFrameElement;
  private apiKey: string = "";
  private tenantId: string = "";
  private env: LucraEnvironment = "production";
  protected urlOrigin: string = "";
  private url: string = "";
  private messages: string[] = [];
  private locationId: string = "";
  private controller: AbortController = new AbortController();

  private iframeUrlOrigin() {
    return new URL(this.url).origin;
  }

  protected _eventListener = async (_event: MessageEvent<any>) => {};

  private setUpEventListener() {
    window.addEventListener("message", this._eventListener, {
      signal: this.controller.signal,
    });
    return null;
  }

  constructor({
    apiKey,
    tenantId,
    env,
    locationId,
  }: LucraClientConstructor) {
    super();
    if (!apiKey || !tenantId) {
      throw new Error(
        "Both apiKey and tenantId must be provided to create LucraClient"
      );
    }

    this.env = env;
    this.locationId = locationId ?? "";
    this.apiKey = apiKey;
    this.tenantId = tenantId;
    this.urlOrigin =
      this.env === "local"
        ? `http://localhost:3000`
        : `https://${this.tenantId.toLowerCase()}.${
            this.env !== "production" ? `${this.env}.` : ""
          }lucrasports.com`;
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
    if (this.iframe) {
      return this._redirect(path, params, deepLinkUrl);
    }

    const url = new URL(
      deepLinkUrl || `${this.urlOrigin}/${path}?${params.toString()}`
    );

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

  logout(): LucraClientBase {
    return this._redirect("logout");
  }

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
          params.set("openGameId", gameId);
        }
        return this._redirect("app/home", params);
      },
      matchupDetails: (matchupId: string) =>
        this._redirect(`app/matchups/${matchupId}`),
      tournamentDetails: (matchupId: string) =>
        this._redirect(`app/tournaments/${matchupId}`),
      deepLink: (url: string) => {
        if (this.urlOrigin === "" || new URL(url).origin !== this.urlOrigin) {
          throw new Error("Cannot open a url not associated with this tenant");
        }
        return this._redirect("", undefined, url);
      },
    };
  }

  open(element: HTMLElement, phoneNumber?: string): LucraNavigation {
    return {
      profile: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/profile", params });
      },
      home: (locationId?: string) => {
        const params = addDefinedSearchParams({ locationId, phoneNumber });
        return this._open({ element, path: "app/home", params });
      },
      deposit: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/add-funds", params });
      },
      withdraw: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/withdraw-funds", params });
      },
      createMatchup: (gameId?: string) => {
        const params = addDefinedSearchParams({ openGameId: gameId, phoneNumber });
        return this._open({ element, path: "app/home", params });
      },
      matchupDetails: (matchupId: string) => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: `app/matchups/${matchupId}`, params });
      },
      tournamentDetails: (matchupId: string) => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: `app/tournaments/${matchupId}`, params });
      },
      deepLink: (url: string) => {
        if (this.urlOrigin === "" || new URL(url).origin !== this.urlOrigin) {
          throw new Error("Cannot open a url not associated with this tenant");
        }
        return this._open({
          element,
          deepLinkUrl: url,
          params: addDefinedSearchParams({ phoneNumber }),
        });
      },
    };
  }

  close() {
    this.controller.abort("Closing LucraClient");
    this.iframe?.remove();
    this.iframe = undefined;
  }

  protected _sendMessage(message: any) {
    try {
      this.iframe?.contentWindow?.postMessage(message, this.iframeUrlOrigin());
    } catch (e) {
      console.error("Unable to send message to LucraClient iframe", e);
    } finally {
      return this;
    }
  }

  protected _matchupInviteUrlResponse(data: LucraDeepLinkResponse) {
    this._sendMessage({
      type: MessageTypeToLucraClient.matchupInviteUrlResponse,
      body: data,
    });
  }

  sendMessage: LucraClientSendMessage = {
    userUpdated: (data: SDKClientUser) => {
      if (!validateMetadata(data.metadata)) {
        throw new Error(
          "Invalid metadata: must be an object with string keys and string values, or null"
        );
      }
      this._sendMessage({
        type: MessageTypeToLucraClient.clientUserInfo,
        body: data,
      });
    },
    convertToCreditResponse: (data: LucraConvertToCreditResponse) => {
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
    deepLinkResponse: (data: LucraDeepLinkResponse) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.deepLinkResponse,
        body: data,
      });
    },
    navigate: (data: LucraNavigateRequest) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.navigate,
        body: data,
      });
    },
    availableRewards: (data: LucraAvailableRewards) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.availableRewards,
        body: data,
      });
    },
  };
}
