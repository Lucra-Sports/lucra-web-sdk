import {
  LucraClientMessageType,
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
  type LucraMatchup,
  type LucraMatchupDetails,
  type LucraCreateRecreationalGameInput,
  type LucraAcceptRecreationalGameBody,
  type LucraCancelRecreationalGameResult,
  type LucraRecreationalGameResult,
  type LucraApiErrorBody,
  type LucraIsLoggedInRequestBody,
  type LucraIsLoggedInResponse,
  type LucraPage,
  type LucraReward,
  type SDKLucraUser,
  type LucraMinigamesTriggerInput,
  type LucraStartMinigamesSessionResponse,
  type LucraInitializedBody,
  type LucraSdkDiagnosticBody,
  type LucraDialog,
  type LucraPopup,
  type LucraPopupResult,
} from "./types/types.js";
import { LucraClientIframeId, States } from "./constants.js";
import { SDK_VERSION } from "./version.js";
import {
  addDefinedSearchParams,
  validatePhoneNumber,
  validateMetadata,
} from "./utils.js";
import { cancelReason, createApiRequest, type ApiRequest } from "./api-request.js";
import { createDialog } from "./dialog.js";
import { createPopup, type LucraPopupHandle } from "./popup.js";
import { LucraUserNotLoggedIn, LucraClientNotOpen, LucraApiError } from "./errors.js";

// Reason the in-flight isLoggedIn request is rejected with when a newer one
// supersedes it (e.g. `loginSuccess` rebuilds `ready`). This is an internal
// single-flight cancellation, not an auth failure, so `_createReadyPromise`
// swallows it and defers to the rebuilt promise rather than surfacing it.
const ISLOGGEDIN_CANCELLED = cancelReason("isLoggedIn");

// What close() rejects pending requests and `ready` with. Hosts check a rejected
// write's outcome before retrying (see the docs); the message stays neutral so it reads
// correctly for reads too.
const CLOSED_WHILE_PENDING = "LucraClient was closed while the request was pending.";

// How long `logout()` lets `ready` wait for `logoutComplete` before asking the Lucra app
// about the auth state anyway. The event is the signal; this bound is only there so an
// app build that predates it leaves `ready` settling late instead of never. It is not an
// estimate of how long a sign-out takes: a Lucra app that sends the event releases the
// wait the moment the sign-out is really done, however long that took.
const LOGOUT_COMPLETE_TIMEOUT_MS = 15_000;

const MATCHUP_DETAILS_SUBSCRIPTION_CANCELLED =
  "Cancelled by cancelMatchupDetailsSubscription";

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
  login: (options?: { autoClose?: boolean }) => LucraClientBase;
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
  // Every api.* request, so the router can settle one by its response or request type.
  // Declared before the request fields below, which register themselves on creation.
  private _apiRequests: ApiRequest<any, any>[] = [];
  private _achievementsRequest = this._request<LucraAchievementsResponse>(
    MessageTypeToLucraClient.achievementsRequest,
    LucraClientMessageType.achievementsResponse,
    "achievements"
  );
  private _tournamentsRequest = this._request<LucraTournamentsResponse>(
    MessageTypeToLucraClient.tournamentsRequest,
    LucraClientMessageType.tournamentsResponse,
    "tournaments"
  );
  private _tournamentRequest = this._request<
    LucraTournamentResponse,
    { matchupId: string }
  >(
    MessageTypeToLucraClient.tournamentRequest,
    LucraClientMessageType.tournamentResponse,
    "tournament"
  );
  private _tournamentLeaderboardRequest = this._request<
    LucraTournamentLeaderboardResponse,
    LucraTournamentLeaderboardInput
  >(
    MessageTypeToLucraClient.tournamentLeaderboardRequest,
    LucraClientMessageType.tournamentLeaderboardResponse,
    "tournamentLeaderboard"
  );
  private _matchupRequest = this._request<LucraMatchup, { matchupId: string }>(
    MessageTypeToLucraClient.matchupRequest,
    LucraClientMessageType.matchupResponse,
    "matchup"
  );
  private _matchupDetailsRequest = this._request<
    LucraMatchupDetails,
    { matchupId: string }
  >(
    MessageTypeToLucraClient.matchupDetailsRequest,
    LucraClientMessageType.matchupDetailsResponse,
    "matchupDetails"
  );
  private _subscribeMatchupDetailsRequest = this._request<
    LucraMatchupDetails,
    { matchupId: string }
  >(
    MessageTypeToLucraClient.subscribeMatchupDetailsRequest,
    LucraClientMessageType.subscribeMatchupDetailsResponse,
    "subscribeToMatchupDetails",
    { singleFlight: true }
  );
  // The matchup whose matchupDetailsUpdated events reach listeners, and a counter that
  // every subscribe, cancel, and close() bumps so a superseded subscribe never activates.
  private _matchupDetailsSubscriptionId: string | null = null;
  private _matchupDetailsGeneration = 0;
  private _createRecreationalGameRequest = this._request<
    LucraRecreationalGameResult,
    LucraCreateRecreationalGameInput
  >(
    MessageTypeToLucraClient.createRecreationalGameRequest,
    LucraClientMessageType.createRecreationalGameResponse,
    "createRecreationalGame",
    { rejectWhilePending: true }
  );
  // Shared with the free-for-all accept, so both accepts use one in-flight slot.
  private _acceptRecreationalGameRequest = this._request<
    LucraRecreationalGameResult,
    LucraAcceptRecreationalGameBody
  >(
    MessageTypeToLucraClient.acceptRecreationalGameRequest,
    LucraClientMessageType.acceptRecreationalGameResponse,
    "acceptRecreationalGame",
    { rejectWhilePending: true }
  );
  private _cancelRecreationalGameRequest = this._request<
    LucraCancelRecreationalGameResult,
    { matchupId: string }
  >(
    MessageTypeToLucraClient.cancelRecreationalGameRequest,
    LucraClientMessageType.cancelRecreationalGameResponse,
    "cancelRecreationalGame",
    { rejectWhilePending: true }
  );
  private _joinTournamentRequest = this._request<
    LucraJoinTournamentResponse,
    { matchupId: string }
  >(
    MessageTypeToLucraClient.joinTournamentRequest,
    LucraClientMessageType.joinTournamentResponse,
    "joinTournament",
    { singleFlight: true }
  );
  private _autoJoinTournamentsRequest =
    this._request<LucraAutoJoinedTournamentsBody>(
      MessageTypeToLucraClient.autoJoinTournamentsRequest,
      LucraClientMessageType.autoJoinedTournaments,
      "autoJoinTournaments",
      { singleFlight: true }
    );
  private _isLoggedInRequest = this._request<
    LucraIsLoggedInResponse,
    LucraIsLoggedInRequestBody
  >(
    MessageTypeToLucraClient.isLoggedInRequest,
    LucraClientMessageType.isLoggedInResponse,
    "isLoggedIn",
    // A real auth round trip is sub-second, and 60s is far past any genuine session
    // restore, so the absolute deadline only ever fires on a responder stuck reporting
    // `pending`. It is there to guarantee `ready` settles, not to be fast.
    {
      singleFlight: true,
      interim: (data) => data.pending === true,
      maxTimeoutMs: 60_000,
    }
  );
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
  // Open while a sign-out requested through `logout()` has not been reported finished.
  // `_createReadyPromise` holds the login check behind it; see `logout()`.
  private _logoutGate: {
    promise: Promise<void>;
    settle: (reason?: unknown) => void;
  } | null = null;
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
    // A sign-out in flight holds the login check back until the Lucra app reports it
    // finished: asking before then is answered from the session being torn down.
    const gate = this._logoutGate;
    const start = gate
      ? this._initializedPromise.then(() => gate.promise)
      : this._initializedPromise;
    const promise: Promise<void> = start
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
    // `awaitsPending` tells the web-app this SDK can wait, so it answers `pending` while
    // auth is still settling instead of a transient `isLoggedIn: false`. Only the final
    // answer settles the request, so a restorable session no longer rejects `ready` and
    // sends an already-signed-in user to the login screen our docs tell hosts to present.
    const { isLoggedIn } = await this._isLoggedInRequest.send({ awaitsPending: true });
    if (!isLoggedIn) {
      throw new LucraUserNotLoggedIn();
    }
  }

  // Opens the wait `ready` sits behind until the Lucra app reports the sign-out finished.
  private _openLogoutGate(): void {
    let settle!: (reason?: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      // No `logoutComplete` came back. Fall through to the login check rather than wait
      // forever on an app build that does not send the event: by then the sign-out has
      // long since finished or failed, and the app's own answer -- including an interim
      // `pending` while it is still settling -- is better evidence than any assumption
      // the SDK could make here.
      const timer = setTimeout(() => this._closeLogoutGate(), LOGOUT_COMPLETE_TIMEOUT_MS);
      settle = (reason?: unknown) => {
        clearTimeout(timer);
        if (reason === undefined) resolve();
        else reject(reason);
      };
    });
    // The `ready` chain built right after this adopts the gate, except when initialization
    // rejects first and the chain never reaches it. Mark it handled so a `close()` that
    // fails the gate in that window is not an unhandled rejection.
    promise.catch(() => {});
    this._logoutGate = { promise, settle };
  }

  // Releases the wait, or fails it with `reason`. A no-op when no sign-out is in flight.
  private _closeLogoutGate(reason?: unknown): void {
    const gate = this._logoutGate;
    this._logoutGate = null;
    gate?.settle(reason);
  }

  get ready(): Promise<void> {
    return this._readyPromise;
  }

  /**
   * Resolves `true` when a Lucra user is signed in and `false` when none is, so auth can
   * be checked without awaiting `ready` and catching `LucraUserNotLoggedIn`. Rejects with
   * `LucraClientNotOpen` before `open()` or after `close()` (there is no Lucra session to
   * ask about), and with the initialization failure body if initialization failed.
   *
   * Like `ready`, it waits out an auth state that has not settled yet and a sign-out in
   * flight, so it answers about the session the user will actually have, not the one
   * being restored or torn down.
   */
  async isLoggedIn(): Promise<boolean> {
    this._assertOpen("call isLoggedIn()");
    // Answers from `ready` rather than sending a second isLoggedIn request. That request is
    // single-flight, so a concurrent one would cancel the one `ready` is waiting on; going
    // through `ready` also means this and `ready` can never disagree, and it inherits the
    // interim `pending` protocol and the sign-out gate for free.
    return this._readyPromise.then(
      () => true,
      (reason: unknown) => {
        if (reason instanceof LucraUserNotLoggedIn) return false;
        throw reason;
      }
    );
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
    url.searchParams.set("sdkVersion", SDK_VERSION);

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

  /**
   * Sends the Lucra iframe through Lucra's sign-out and invalidates the SDK's cached auth
   * state. Returns the client for chaining; the sign-out itself finishes asynchronously
   * and reports back as the `logoutComplete` event, which is what to await before
   * `destroy()` or `close()`.
   */
  logout(): LucraClientBase {
    // Navigate first. `_redirect` throws LucraClientNotOpen before an iframe exists, and a
    // sign-out that was never requested must not leave `ready` waiting on one.
    const client = this._redirect("logout");
    // The cached user is stale the moment a sign-out is asked for.
    this._user = null;
    // Rebuild `ready` so a later `await ready` reflects the sign-out instead of handing
    // back the resolution cached from before it. The rebuilt promise deliberately does
    // NOT ask the app whether anyone is logged in yet: the app answers from its own auth
    // state, which has not flipped at the instant this navigation is posted, so asking
    // now can be answered `isLoggedIn: true` from the very session being torn down and
    // re-resolve `ready` from exactly the state the rebuild exists to discard. Instead it
    // waits behind `_logoutGate`, which `logoutComplete` releases once the app really has
    // signed the user out, and only then runs the login check.
    //
    // A second logout() while one is in flight is the same sign-out: keep the open gate
    // rather than strand whoever is awaiting the promise built behind it.
    if (!this._logoutGate) {
      this._openLogoutGate();
      this._readyPromise = this._createReadyPromise();
    }
    return client;
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
      login: (options?: { autoClose?: boolean }) => {
        const params = addDefinedSearchParams({ phoneNumber });
        params.set("login", "true");
        // Tells the Lucra app to report the login and then stay where it is, rather than
        // carrying the user on into the app. Without it a headless host has no moment to hide
        // the iframe in: the app has already navigated and rendered by the time loginSuccess
        // reaches the host. A Lucra app that predates this ignores the param and behaves as it
        // always has, so sending it is safe against any deployed build.
        if (options?.autoClose) params.set("autoClose", "true");
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
    this._resetMatchupDetailsSubscription();
    // Pending api requests and a `ready` still waiting for init would otherwise time out
    // or hang. The reject is a no-op once initialization settled.
    this._readyReject(new LucraClientNotOpen(CLOSED_WHILE_PENDING));
    // A `ready` already past init and waiting on a sign-out that can no longer be
    // reported finished fails the same way, instead of hanging until the gate's bound.
    this._closeLogoutGate(new LucraClientNotOpen(CLOSED_WHILE_PENDING));
    for (const request of this._apiRequests) {
      request.rejectAll(new LucraClientNotOpen(CLOSED_WHILE_PENDING));
    }
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
      // An api request (it carries a requestId) rejects its promise with the error
      // instead of timing out; every other message is fire-and-forget.
      if (message?.requestId !== undefined) throw e;
      console.error("Unable to send message to LucraClient iframe", e);
    }
    return this;
  }

  // A timed-out api.* request otherwise only rejects in the host page, where Lucra never
  // sees it. Posted like any fire-and-forget message: it reaches nothing if the iframe is
  // gone, and a web app older than this message type ignores it.
  private _reportDiagnostic(body: Omit<LucraSdkDiagnosticBody, "sdkVersion">) {
    this._sendMessage({
      type: MessageTypeToLucraClient.sdkDiagnostic,
      body: { ...body, sdkVersion: SDK_VERSION },
    });
  }

  protected _matchupInviteUrlResponse(data: LucraDeepLinkResponse) {
    this._sendMessage({
      type: MessageTypeToLucraClient.matchupInviteUrlResponse,
      body: data,
    });
  }

  private _request<TResponse, TBody = void>(
    type: MessageTypeToLucraClient,
    responseType: LucraClientMessageType,
    name: string,
    options: {
      singleFlight?: boolean;
      rejectWhilePending?: boolean;
      interim?: (data: TResponse) => boolean;
      maxTimeoutMs?: number;
    } = {}
  ): ApiRequest<TResponse, TBody> {
    const request = createApiRequest<TResponse, TBody>({
      type,
      responseType,
      name,
      sendMessage: (message) => this._sendMessage(message),
      onTimeout: (timeoutMs) =>
        this._reportDiagnostic({ kind: "requestTimeout", requestType: type, timeoutMs }),
      ...options,
    });
    this._apiRequests.push(request);
    return request;
  }

  // Settles the api.* request answered by `responseType`. Returns false when the message
  // is not an api.* response, so the router can treat it as an event. A response that
  // matches no pending request (e.g. the automatic auto-join) is a no-op.
  protected _settleApiResponse(
    responseType: string,
    data: unknown,
    requestId?: string
  ): boolean {
    const request = this._apiRequests.find((r) => r.responseType === responseType);
    if (!request) return false;
    request.resolve(data, requestId);
    return true;
  }

  protected _rejectApiRequest(
    requestType: string,
    body: LucraApiErrorBody,
    requestId?: string
  ): void {
    this._apiRequests
      .find((r) => r.type === requestType)
      ?.reject(new LucraApiError(body.code, body.message), requestId);
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
    // Someone is signed in, so a sign-out still waiting to be reported finished is moot.
    // Fail its gate rather than release it: releasing would let the promise waiting behind
    // it run a login check of its own, which single-flight would make cancel the one the
    // promise being built right below is about to send. The cancellation sentinel is the
    // same one that case already uses, so the gated promise defers to the rebuilt one
    // instead of sending anything. Without this the gate outlives the login and holds
    // `ready` back until its bound expires.
    this._closeLogoutGate(ISLOGGEDIN_CANCELLED);
    this._readyPromise = this._createReadyPromise();
  }

  // The Lucra app finished signing the user out. Drop the cached user and put `ready`
  // back into an unsettled state so a re-await reflects the signed-out session instead of
  // a cached resolution, mirroring what `_handleLoginSuccess` does on the way in.
  //
  // When `logout()` opened a gate, releasing it is the rebuild: the promise waiting behind
  // it runs its login check now, against an auth state that has actually flipped. A
  // sign-out the user started inside Lucra's own UI never went through `logout()` and has
  // no gate, so rebuild here instead.
  protected _handleLogoutComplete() {
    this._user = null;
    if (this._logoutGate) {
      this._closeLogoutGate();
    } else {
      this._readyPromise = this._createReadyPromise();
    }
  }

  // Stops delivering matchupDetailsUpdated and supersedes any subscribe in progress.
  private _resetMatchupDetailsSubscription(): number {
    this._matchupDetailsSubscriptionId = null;
    return ++this._matchupDetailsGeneration;
  }

  protected _isActiveMatchupDetailsUpdate(details: any): boolean {
    const matchupId = this._matchupDetailsSubscriptionId;
    return matchupId !== null && details?.matchup?.id === matchupId;
  }

  // An iframe reload (login src reload, moveTo) drops the Lucra app's subscription and
  // re-sends `initialized`, so subscribe again to the active matchup once it succeeds.
  protected _resumeMatchupDetailsSubscription(): void {
    const matchupId = this._matchupDetailsSubscriptionId;
    if (!this._isInitialized || !matchupId || this._subscribeMatchupDetailsRequest.hasPending()) {
      return;
    }
    this._subscribeMatchupDetailsRequest.send({ matchupId }).catch(() => {});
  }

  api = {
    achievements: async (): Promise<LucraAchievementsResponse> => {
      this._assertOpen("call api.achievements");
      return this._achievementsRequest.send();
    },
    // Every request needs an open iframe and rejects with LucraClientNotOpen
    // without one. Reads that work before auth await `_initializedPromise` (not
    // `ready`, which also asserts login); the others need auth (called after `ready`).
    // Note: if `close()` runs while this is still awaiting init, the call rejects
    // with LucraClientNotOpen (`close()` rejects the pending init promise).
    tournaments: async (): Promise<LucraTournamentsResponse> => {
      this._assertOpen("call api.tournaments");
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
    matchup: async (matchupId: string): Promise<LucraMatchup> => {
      this._assertOpen("call api.matchup");
      await this._initializedPromise;
      return this._matchupRequest.send({ matchupId });
    },
    matchupDetails: async (matchupId: string): Promise<LucraMatchupDetails> => {
      this._assertOpen("call api.matchupDetails");
      await this._initializedPromise;
      return this._matchupDetailsRequest.send({ matchupId });
    },
    createRecreationalGame: async (
      input: LucraCreateRecreationalGameInput
    ): Promise<LucraRecreationalGameResult> => {
      this._assertOpen("call api.createRecreationalGame");
      return this._createRecreationalGameRequest.send(input);
    },
    acceptVersusRecreationalGame: async (
      matchupId: string,
      teamId: string
    ): Promise<LucraRecreationalGameResult> => {
      this._assertOpen("call api.acceptVersusRecreationalGame");
      return this._acceptRecreationalGameRequest.send({
        matchupId,
        playStyle: "GROUP_VS_GROUP",
        teamId,
      });
    },
    acceptFreeForAllRecreationalGame: async (
      matchupId: string
    ): Promise<LucraRecreationalGameResult> => {
      this._assertOpen("call api.acceptFreeForAllRecreationalGame");
      return this._acceptRecreationalGameRequest.send({
        matchupId,
        playStyle: "FREE_FOR_ALL",
      });
    },
    cancelRecreationalGame: async (
      matchupId: string
    ): Promise<LucraCancelRecreationalGameResult> => {
      this._assertOpen("call api.cancelRecreationalGame");
      return this._cancelRecreationalGameRequest.send({ matchupId });
    },
    // Resolves with the current details, then delivers each change as a
    // matchupDetailsUpdated event until cancelled, close(), or the next subscribe.
    subscribeToMatchupDetails: async (
      matchupId: string
    ): Promise<LucraMatchupDetails> => {
      this._assertOpen("call api.subscribeToMatchupDetails");
      const generation = this._resetMatchupDetailsSubscription();
      await this._initializedPromise;
      // Cancelled or superseded while waiting for init: never post the request.
      if (generation !== this._matchupDetailsGeneration) {
        throw MATCHUP_DETAILS_SUBSCRIPTION_CANCELLED;
      }
      const details = await this._subscribeMatchupDetailsRequest.send({ matchupId });
      if (generation === this._matchupDetailsGeneration) {
        // The id the Lucra app resolved, which is what its updates carry.
        this._matchupDetailsSubscriptionId = details.matchup.id;
      }
      return details;
    },
    // Never throws, so it is safe in effect cleanup before open() or after close().
    cancelMatchupDetailsSubscription: (): void => {
      this._resetMatchupDetailsSubscription();
      this._subscribeMatchupDetailsRequest.reject(MATCHUP_DETAILS_SUBSCRIPTION_CANCELLED);
      if (this.iframe) {
        this._sendMessage({
          type: MessageTypeToLucraClient.cancelMatchupDetailsSubscription,
          body: null,
        });
      }
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
