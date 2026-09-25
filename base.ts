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
  type LucraAchievementsResponse,
  type LucraTournamentsResponse,
  type LucraTournamentResponse,
  type LucraTournamentLeaderboardInput,
  type LucraTournamentLeaderboardResponse,
  type LucraAutoJoinedTournamentsBody,
  type LucraJoinTournamentResponse,
  type LucraApiErrorBody,
  type LucraIsLoggedInResponse,
  type LucraPage,
  type LucraReward,
  type SDKLucraUser,
  type LucraMinigamesTriggerInput,
  type LucraStartMinigamesSessionResponse,
  type LucraInitializedBody,
  type LucraDialog,
  type LucraPopup,
  type LucraPopupResult,
} from "./types/types.js";
import { LucraClientIframeId, States } from "./constants.js";
import {
  addDefinedSearchParams,
  validatePhoneNumber,
  validateMetadata,
} from "./utils.js";
import { createApiRequest } from "./api-request.js";
import { createDialog } from "./dialog.js";
import { createPopup, type LucraPopupHandle } from "./popup.js";
import { LucraUserNotLoggedIn, LucraClientNotOpen, LucraApiError } from "./errors.js";

// Reason the in-flight isLoggedIn request is rejected with when a newer one
// supersedes it (e.g. `loginSuccess` rebuilds `ready`). This is an internal
// single-flight cancellation, not an auth failure, so `_createReadyPromise`
// swallows it and defers to the rebuilt promise rather than surfacing it.
const ISLOGGEDIN_CANCELLED = "Cancelled by new isLoggedIn request";

// Shared by open(), redirect(), and dialog() deposit (dialog routes through
// redirect), so one key warns once for all three.
const DEPOSIT_DEPRECATION =
  "deposit() on open(), redirect(), and dialog() is deprecated and will be removed in a future major version. Add Funds must run in a popup: open wallet() or profile() instead, where the Lucra app opens Add Funds in a popup on its own.";

type LucraNavigation = {
  profile: () => LucraClientBase;
  wallet: () => LucraClientBase;
  home: (locationId?: string) => LucraClientBase;
  /**
   * @deprecated Add Funds must run in a popup (Apple Pay does not run in a
   * cross-origin iframe). Open wallet() or profile() instead: from there the
   * Lucra app opens Add Funds in a popup on its own.
   */
  deposit: () => LucraClientBase;
  withdraw: () => LucraClientBase;
  createMatchup: (gameId?: string) => LucraClientBase;
  matchupDetails: (matchupId: string) => LucraClientBase;
  tournamentDetails: (matchupId: string) => LucraClientBase;
  deepLink: (url: string) => LucraClientBase;
  kyc: () => LucraClientBase;
  demographic: () => LucraClientBase;
  locationGrant: () => LucraClientBase;
};

type LucraOpenNavigation = LucraNavigation & {
  minigamesTrigger: (
    input: LucraMinigamesTriggerInput
  ) => Promise<LucraStartMinigamesSessionResponse>;
  login: () => LucraClientBase;
};

type LucraDialogNavigation = {
  profile: () => LucraDialog;
  wallet: () => LucraDialog;
  home: (locationId?: string) => LucraDialog;
  /**
   * @deprecated Add Funds must run in a popup (Apple Pay does not run in a
   * cross-origin iframe). Open wallet() or profile() instead: from there the
   * Lucra app opens Add Funds in a popup on its own.
   */
  deposit: () => LucraDialog;
  withdraw: () => LucraDialog;
  createMatchup: (gameId?: string) => LucraDialog;
  matchupDetails: (matchupId: string) => LucraDialog;
  tournamentDetails: (matchupId: string) => LucraDialog;
  deepLink: (url: string) => LucraDialog;
  kyc: () => LucraDialog;
  demographic: () => LucraDialog;
  locationGrant: () => LucraDialog;
};

type LucraPopupNavigation = {
  deposit: () => LucraPopup;
};

type TriggerHandle = {
  iframe: HTMLIFrameElement;
  resolve: (response: LucraStartMinigamesSessionResponse) => void;
  reject: (reason?: unknown) => void;
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
  private autoJoin: boolean = true;
  private controller: AbortController = new AbortController();
  private _achievementsRequest = createApiRequest<LucraAchievementsResponse>({
    type: MessageTypeToLucraClient.achievementsRequest,
    cancelReason: "Cancelled by new achievements request",
    sendMessage: (message) => this._sendMessage(message),
  });
  private _tournamentsRequest = createApiRequest<LucraTournamentsResponse>({
    type: MessageTypeToLucraClient.tournamentsRequest,
    cancelReason: "Cancelled by new tournaments request",
    sendMessage: (message) => this._sendMessage(message),
  });
  private _tournamentRequest = createApiRequest<
    LucraTournamentResponse,
    { matchupId: string }
  >({
    type: MessageTypeToLucraClient.tournamentRequest,
    cancelReason: "Cancelled by new tournament request",
    sendMessage: (message) => this._sendMessage(message),
  });
  private _tournamentLeaderboardRequest = createApiRequest<
    LucraTournamentLeaderboardResponse,
    LucraTournamentLeaderboardInput
  >({
    type: MessageTypeToLucraClient.tournamentLeaderboardRequest,
    cancelReason: "Cancelled by new tournamentLeaderboard request",
    sendMessage: (message) => this._sendMessage(message),
  });
  private _joinTournamentRequest = createApiRequest<
    LucraJoinTournamentResponse,
    { matchupId: string }
  >({
    type: MessageTypeToLucraClient.joinTournamentRequest,
    cancelReason: "Cancelled by new joinTournament request",
    sendMessage: (message) => this._sendMessage(message),
  });
  private _autoJoinTournamentsRequest =
    createApiRequest<LucraAutoJoinedTournamentsBody>({
      type: MessageTypeToLucraClient.autoJoinTournamentsRequest,
      cancelReason: "Cancelled by new autoJoinTournaments request",
      sendMessage: (message) => this._sendMessage(message),
    });
  private _isLoggedInRequest = createApiRequest<LucraIsLoggedInResponse>({
    type: MessageTypeToLucraClient.isLoggedInRequest,
    cancelReason: ISLOGGEDIN_CANCELLED,
    sendMessage: (message) => this._sendMessage(message),
  });
  protected triggerFrames: Map<Window, TriggerHandle> = new Map();
  protected _user: SDKLucraUser | null = null;
  protected _isInitialized: boolean = false;
  // The element the iframe currently lives in, as designated by open()/moveTo().
  private _host: HTMLElement | null = null;
  private _activeDialog: LucraDialog | null = null;
  private _activePopup: LucraPopupHandle | null = null;
  private _warnedDeprecations = new Set<string>();
  private _readyResolve!: () => void;
  private _readyReject!: (reason?: unknown) => void;
  private _initializedPromise: Promise<void> = this._createInitializedPromise();
  private _readyPromise: Promise<void> = this._createReadyPromise();

  private _createInitializedPromise(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
  }

  // `ready` resolves once the iframe has initialized and the user is logged in.
  // It rejects with the initialization failure body if initialization fails, or
  // with LucraUserNotLoggedIn if the user is not logged in.
  private _createReadyPromise(): Promise<void> {
    const promise: Promise<void> = this._initializedPromise
      .then(() => this._assertLoggedIn())
      .catch((reason: unknown) => {
        // A newer isLoggedIn request superseded ours (e.g. `loginSuccess`
        // rebuilt `ready`), cancelling the in-flight one. That is not an auth
        // failure, so defer to the current promise -- which reflects the latest
        // login state -- instead of surfacing the cancellation to callers still
        // awaiting this now-superseded promise.
        if (reason === ISLOGGEDIN_CANCELLED && this._readyPromise !== promise) {
          return this._readyPromise;
        }
        throw reason;
      });
    // Mark the rejection handled so a pre-auth consumer who never awaits
    // `ready` (e.g. one that only fetches tournaments while logged out) does
    // not trigger an unhandled rejection. `get ready()` still returns
    // `promise`, so callers that do await it still observe the rejection.
    promise.catch(() => {});
    return promise;
  }

  private async _assertLoggedIn(): Promise<void> {
    const { isLoggedIn } = await this._isLoggedInRequest.send();
    if (!isLoggedIn) {
      throw new LucraUserNotLoggedIn();
    }
  }

  get ready(): Promise<void> {
    return this._readyPromise;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get user(): SDKLucraUser | null {
    return this._user;
  }

  private iframeUrlOrigin() {
    return new URL(this.url).origin;
  }

  protected _eventListener = async (_event: MessageEvent<any>) => { };

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
    autoJoin,
  }: LucraClientConstructor) {
    super();
    if (!apiKey || !tenantId) {
      throw new Error(
        "Both apiKey and tenantId must be provided to create LucraClient"
      );
    }

    this.env = env;
    this.locationId = locationId ?? "";
    this.autoJoin = autoJoin ?? true;
    this.apiKey = apiKey;
    this.tenantId = tenantId;
    this.urlOrigin =
      this.env === "local"
        ? `http://localhost:3000`
        : `https://${this.tenantId.toLowerCase()}.${this.env !== "production" ? `${this.env}.` : ""
        }lucrasports.com`;
  }

  private _buildIframeUrl({
    path = "",
    params = new URLSearchParams(),
    deepLinkUrl,
  }: {
    path?: string;
    params?: URLSearchParams;
    deepLinkUrl?: string;
  }): URL {
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

    url.searchParams.set("autoJoin", String(this.autoJoin));
    url.searchParams.set("parentUrl", window.location.origin);

    return url;
  }

  private _open({
    element,
    path = "",
    params = new URLSearchParams(),
    deepLinkUrl,
    hidden,
  }: {
    element: HTMLElement;
    path?: string;
    params?: URLSearchParams;
    deepLinkUrl?: string;
    hidden?: boolean;
  }) {
    if (this.iframe) {
      return this._redirect(path, params, deepLinkUrl);
    }

    const url = this._buildIframeUrl({ path, params, deepLinkUrl });

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
      this._host = element;
      if (hidden) {
        iframe.style.display = "none";
      }
    } catch (e) {
      console.error("Error opening up LucraSports", e);
    }
    return this;
  }

  private _minigamesTrigger(
    element: HTMLElement,
    input: LucraMinigamesTriggerInput
  ): Promise<LucraStartMinigamesSessionResponse> {
    return new Promise<LucraStartMinigamesSessionResponse>((resolve, reject) => {
      try {
        this.setUpEventListener();

        const params = new URLSearchParams();
        params.set("game_mode", input.game_mode);
        if (input.amount !== undefined) {
          params.set("amount", String(input.amount));
        }
        if (input.matchup_id) {
          params.set("matchup_id", input.matchup_id);
        }

        const path = `app/headless/minigames/${encodeURIComponent(input.game_id)}`;
        const url = this._buildIframeUrl({ path, params });

        const iframe = document.createElement("iframe");
        iframe.src = url.toString();
        iframe.style.height = "100%";
        iframe.style.width = "100%";
        iframe.style.border = "none";
        iframe.style.background = "transparent";
        iframe.allow =
          "geolocation *; web-share; accelerometer *; bluetooth *; gyroscope *; clipboard-write *; payment;";

        const register = () => {
          const win = iframe.contentWindow;
          if (!win) {
            reject(new Error("Trigger iframe contentWindow unavailable"));
            return;
          }
          this.triggerFrames.set(win, {
            iframe,
            resolve: (data) => {
              try {
                iframe.remove();
              } catch (e) {
                console.error("Error removing trigger iframe", e);
              }
              resolve(data);
            },
            reject: (reason) => {
              try {
                iframe.remove();
              } catch (e) {
                console.error("Error removing trigger iframe", e);
              }
              reject(reason);
            },
          });
        };

        element.appendChild(iframe);

        if (iframe.contentWindow) {
          register();
        } else {
          iframe.addEventListener("load", register, { once: true });
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  // Fails loudly when there is no iframe to act on, instead of the call silently
  // doing nothing before open() or after close().
  private _assertOpen(action: string): HTMLIFrameElement {
    if (!this.iframe) {
      throw new LucraClientNotOpen(
        `Cannot ${action}. LucraClient is not open. Call client.open(element) first.`
      );
    }
    return this.iframe;
  }

  // Warns once per key per client so a deprecated call in a render loop or
  // effect does not flood the console.
  private _warnDeprecated(key: string, message: string): void {
    if (this._warnedDeprecations.has(key)) return;
    this._warnedDeprecations.add(key);
    console.warn(`LucraClient: ${message}`);
  }

  private _redirect(
    path: string,
    params: URLSearchParams = new URLSearchParams(),
    deepLinkUrl?: string
  ) {
    this._assertOpen("redirect");

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
      wallet: () => this._redirect("app/wallet"),
      home: (locationId?: string) => {
        const params = new URLSearchParams();
        if (locationId !== undefined) {
          params.set("locationId", locationId);
        }
        return this._redirect("app/home", params);
      },
      deposit: () => {
        this._warnDeprecated("deposit", DEPOSIT_DEPRECATION);
        return this._redirect("app/add-funds");
      },
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
      kyc: () => this._redirect("app/kyc"),
      demographic: () => this._redirect("app/demographicform"),
      locationGrant: () => this._redirect("app/location-grant")
    };
  }

  // Opens any route as a dialog. Reuses redirect()'s in-place navigation (no
  // re-parenting, so no reload) and presents the iframe's host as an overlay.
  dialog(): LucraDialogNavigation {
    const nav = this.redirect();
    const present = (navigate: () => LucraClientBase) =>
      this._presentDialog(navigate);
    return {
      profile: () => present(() => nav.profile()),
      wallet: () => present(() => nav.wallet()),
      home: (locationId?: string) => present(() => nav.home(locationId)),
      deposit: () => present(() => nav.deposit()),
      withdraw: () => present(() => nav.withdraw()),
      createMatchup: (gameId?: string) =>
        present(() => nav.createMatchup(gameId)),
      matchupDetails: (matchupId: string) =>
        present(() => nav.matchupDetails(matchupId)),
      tournamentDetails: (matchupId: string) =>
        present(() => nav.tournamentDetails(matchupId)),
      deepLink: (url: string) => present(() => nav.deepLink(url)),
      kyc: () => present(() => nav.kyc()),
      demographic: () => present(() => nav.demographic()),
      locationGrant: () => present(() => nav.locationGrant())
    };
  }

  // Presents the iframe's host as a dialog: shows the iframe, enables the in-app
  // close (X), and navigates in place (no re-parenting, so no reload). Tracks the
  // open dialog so exitLucra, Escape, and close() all dismiss it.
  private _presentDialog(navigate: () => LucraClientBase): LucraDialog {
    const host = this._host;
    if (!this.iframe || !host) {
      throw new LucraClientNotOpen(
        "Cannot open a dialog. LucraClient is not open. Call client.open(element) first."
      );
    }

    this._activeDialog?.close();

    const dialog = createDialog(
      host,
      () => {
        this.show();
        this._sendMessage({
          type: MessageTypeToLucraClient.enableExitLucra,
          body: true,
        });
        navigate();
      },
      () => this.hide()
    );
    dialog.onClose(() => {
      if (this._activeDialog === dialog) this._activeDialog = null;
    });
    this._activeDialog = dialog;
    return dialog;
  }

  // Closes an open dialog when the in-app close (exitLucra) fires. Returns true
  // when a dialog handled it, so callers can avoid surfacing exitLucra further.
  protected _closeActiveDialog(): boolean {
    if (!this._activeDialog) return false;
    this._activeDialog.close();
    return true;
  }

  // Opens the deposit flow in a real popup window. Unlike dialog()/open(), this
  // is a top-level browsing context (not an iframe), which Apple Pay requires.
  // Scoped to deposit only. Must be called from a user gesture or the browser
  // blocks the popup. Does not require open() first -- the popup is standalone.
  popup(): LucraPopupNavigation {
    return {
      deposit: () => this._presentPopup("app/add-funds"),
    };
  }

  // Tracks the popup so a deposit result and close() can be routed to it, and
  // re-attaches the message listener so the result is received even when no
  // iframe was ever opened.
  private _presentPopup(path: string): LucraPopup {
    this.setUpEventListener();
    const url = this._buildIframeUrl({ path });

    this._activePopup?.close();

    const popup = createPopup(url.toString());
    popup.onClose(() => {
      if (this._activePopup === popup) this._activePopup = null;
    });
    this._activePopup = popup;
    return popup;
  }

  protected _resolveActivePopup(result: LucraPopupResult): void {
    this._activePopup?.resolve(result);
  }

  open(element: HTMLElement, phoneNumber?: string, options?: { hidden?: boolean }): LucraOpenNavigation {
    return {
      profile: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/profile", params, hidden: options?.hidden });
      },
      wallet: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/wallet", params, hidden: options?.hidden });
      },
      home: (locationId?: string) => {
        const params = addDefinedSearchParams({ locationId, phoneNumber });
        return this._open({ element, path: "app/home", params, hidden: options?.hidden });
      },
      deposit: () => {
        this._warnDeprecated("deposit", DEPOSIT_DEPRECATION);
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/add-funds", params, hidden: options?.hidden });
      },
      withdraw: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: "app/withdraw-funds", params, hidden: options?.hidden });
      },
      createMatchup: (gameId?: string) => {
        const params = addDefinedSearchParams({ openGameId: gameId, phoneNumber });
        return this._open({ element, path: "app/home", params, hidden: options?.hidden });
      },
      matchupDetails: (matchupId: string) => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: `app/matchups/${matchupId}`, params, hidden: options?.hidden });
      },
      tournamentDetails: (matchupId: string) => {
        const params = addDefinedSearchParams({ phoneNumber });
        return this._open({ element, path: `app/tournaments/${matchupId}`, params, hidden: options?.hidden });
      },
      deepLink: (url: string) => {
        if (this.urlOrigin === "" || new URL(url).origin !== this.urlOrigin) {
          throw new Error("Cannot open a url not associated with this tenant");
        }
        return this._open({
          element,
          deepLinkUrl: url,
          params: addDefinedSearchParams({ phoneNumber }),
          hidden: options?.hidden,
        });
      },
      login: () => {
        const params = addDefinedSearchParams({ phoneNumber });
        params.set("login", "true");
        // When the user is not logged in the in-app navigate listener isn't subscribed yet,
        // so a navigate message would be dropped; reload src to reliably reach the login screen.
        if (this.iframe) {
          this.url = this._buildIframeUrl({ path: "", params }).toString();
          this.iframe.src = this.url;
          return this.show();
        }
        return this._open({ element, path: "", params });
      },
      minigamesTrigger: (input: LucraMinigamesTriggerInput) =>
        this._minigamesTrigger(element, input),

      kyc: () => {
        const params = addDefinedSearchParams({ phoneNumber })
        return this._open({ element, path: "app/kyc", params, hidden: options?.hidden })
      },

      demographic: () => {
        const params = addDefinedSearchParams({ phoneNumber })
        return this._open({ element, path: "app/demographicform", params, hidden: options?.hidden })
      },

      locationGrant: () => {
        const params = addDefinedSearchParams({ phoneNumber })
        return this._open({ element, path: "app/location-grant", params, hidden: options?.hidden })
      }
    };
  }

  close() {
    this.controller.abort("Closing LucraClient");
    this.controller = new AbortController();
    this._activeDialog?.close();
    this._activePopup?.close();
    this._host = null;
    this.iframe?.remove();
    this.iframe = undefined;
    this._user = null;
    this._isInitialized = false;
    this._initializedPromise = this._createInitializedPromise();
    this._readyPromise = this._createReadyPromise();
  }

  /**
   * @deprecated Re-parenting the iframe reloads it, losing page state and any
   * in-flight request. Keep it in one container and use show()/hide(), or dialog().
   */
  moveTo(element: HTMLElement): LucraClientBase {
    this._warnDeprecated(
      "moveTo",
      "moveTo() is deprecated and will be removed in a future major version. Re-parenting the iframe reloads it: keep it in one container and use show()/hide(), or dialog()."
    );
    element.appendChild(this._assertOpen("moveTo"));
    this._host = element;
    return this;
  }

  hide(): LucraClientBase {
    this._assertOpen("hide").style.display = "none";
    return this;
  }

  show(): LucraClientBase {
    this._assertOpen("show").style.display = "block";
    return this;
  }

  protected _sendMessage(message: any) {
    try {
      this.iframe?.contentWindow?.postMessage(message, this.urlOrigin);
    } catch (e) {
      console.error("Unable to send message to LucraClient iframe", e);
    }
    return this;
  }

  protected _matchupInviteUrlResponse(data: LucraDeepLinkResponse) {
    this._sendMessage({
      type: MessageTypeToLucraClient.matchupInviteUrlResponse,
      body: data,
    });
  }

  protected _resolveAchievements(data: LucraAchievementsResponse) {
    this._achievementsRequest.resolve(data);
  }

  protected _resolveTournaments(data: LucraTournamentsResponse) {
    this._tournamentsRequest.resolve(data);
  }

  protected _resolveTournament(data: LucraTournamentResponse) {
    this._tournamentRequest.resolve(data);
  }

  protected _resolveTournamentLeaderboard(data: LucraTournamentLeaderboardResponse) {
    this._tournamentLeaderboardRequest.resolve(data);
  }

  protected _resolveJoinTournament(data: LucraJoinTournamentResponse) {
    this._joinTournamentRequest.resolve(data);
  }

  protected _rejectJoinTournament(body: LucraApiErrorBody) {
    this._joinTournamentRequest.reject(
      new LucraApiError(body.code, body.message)
    );
  }

  // Settles a pending manual autoJoinTournaments() call. The embedded app emits the
  // same autoJoinedTournaments message for the automatic trigger, where no request is
  // pending and this is a no-op.
  protected _resolveAutoJoinTournaments(data: LucraAutoJoinedTournamentsBody) {
    this._autoJoinTournamentsRequest.resolve(data);
  }

  protected _rejectAutoJoinTournaments(body: LucraApiErrorBody) {
    this._autoJoinTournamentsRequest.reject(
      new LucraApiError(body.code, body.message)
    );
  }

  protected _resolveIsLoggedIn(data: LucraIsLoggedInResponse) {
    this._isLoggedInRequest.resolve(data);
  }

  protected _resolveTrigger(
    win: Window,
    data: LucraStartMinigamesSessionResponse
  ): boolean {
    const handle = this.triggerFrames.get(win);
    if (!handle) return false;
    this.triggerFrames.delete(win);
    handle.resolve(data);
    return true;
  }

  protected _handleInitialized(body: LucraInitializedBody) {
    if (body.success) {
      this._isInitialized = true;
      this._readyResolve();
    } else {
      this._isInitialized = false;
      this._readyReject(body);
    }
  }

  protected _handleUserInfo(body: SDKLucraUser) {
    this._user = body;
  }

  // A logged-out user makes `ready` reject with LucraUserNotLoggedIn, and that
  // rejection is cached on `_readyPromise`. Once the user logs in, rebuild the
  // promise so it re-runs `_assertLoggedIn` against the now-authenticated session.
  protected _handleLoginSuccess() {
    this._readyPromise = this._createReadyPromise();
  }

  api = {
    achievements: async (): Promise<LucraAchievementsResponse> => {
      this._assertOpen("call api.achievements");
      return this._achievementsRequest.send();
    },
    // Fetching all tournaments is allowed before auth, so it only waits for the
    // embedded app to be initialized (not `ready`, which also asserts login).
    // Awaiting init also keeps the request from racing initialization -- it is
    // sent once the iframe is ready to receive it. The others need auth (called
    // after `ready`) and an open iframe; without one they reject with
    // LucraClientNotOpen.
    // Note: if `close()` runs while this is still awaiting a not-yet-resolved
    // init, the captured promise never settles and this call stays pending --
    // an accepted edge given the narrow window.
    tournaments: async (): Promise<LucraTournamentsResponse> => {
      await this._initializedPromise;
      return this._tournamentsRequest.send();
    },
    tournament: async (matchupId: string): Promise<LucraTournamentResponse> => {
      this._assertOpen("call api.tournament");
      return this._tournamentRequest.send({ matchupId });
    },
    tournamentLeaderboard: async (
      matchupId: string,
      pagination?: { limit?: number; offset?: number }
    ): Promise<LucraTournamentLeaderboardResponse> => {
      this._assertOpen("call api.tournamentLeaderboard");
      return this._tournamentLeaderboardRequest.send({
        matchupId,
        limit: pagination?.limit,
        offset: pagination?.offset,
      });
    },
    joinTournament: async (tournamentId: string): Promise<LucraJoinTournamentResponse> => {
      this._assertOpen("call api.joinTournament");
      return this._joinTournamentRequest.send({ matchupId: tournamentId });
    },
    autoJoinTournaments: async (): Promise<LucraAutoJoinedTournamentsBody> => {
      this._assertOpen("call api.autoJoinTournaments");
      return this._autoJoinTournamentsRequest.send();
    },
  };

  sendMessage: LucraClientSendMessage = {
    userUpdated: (data: SDKClientUser) => {
      this._assertOpen("call sendMessage.userUpdated");
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
    // convertToCreditResponse and deepLinkResponse reply to iframe-initiated
    // requests, so they stay unguarded like _matchupInviteUrlResponse: a
    // delayed reply after close() is dropped rather than throwing.
    convertToCreditResponse: (data: LucraConvertToCreditResponse) => {
      this._sendMessage({
        type: MessageTypeToLucraClient.convertToCreditResponse,
        body: data,
      });
    },
    enableConvertToCredit: () => {
      this._assertOpen("call sendMessage.enableConvertToCredit");
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
      this._assertOpen("call sendMessage.navigate");
      this._sendMessage({
        type: MessageTypeToLucraClient.navigate,
        body: data,
      });
    },
    availableRewards: (data: LucraAvailableRewards) => {
      this._assertOpen("call sendMessage.availableRewards");
      this._sendMessage({
        type: MessageTypeToLucraClient.availableRewards,
        body: data,
      });
    },
  };
}
