import { createApi, type Activity, type Api } from "./api.js";
import { createAuth } from "./auth.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { createEmitter } from "./events.js";
import {
  createDomFrame,
  createNullFrame,
  hasDom,
  pageOrigin,
  type Frame,
} from "./frame.js";
import { createPresent, type Present } from "./present.js";
import { createWithRemediation } from "./remediate.js";
import { DEFAULT_TIMEOUTS, createSession, type Timeouts } from "./session.js";
import type {
  LucraAuthState,
  LucraClientConfig,
  LucraHeadlessEventMap,
  LucraMatchupWatch,
  LucraMatchupWatchHandlers,
} from "./types.js";
import { HOME_PATH, buildUrl, lucraOrigin, type UrlContext } from "./url.js";
import { createWatch } from "./watch.js";

export type LucraHeadlessClient = {
  auth: {
    // The current state. The same object is returned until something changes.
    getState(): LucraAuthState;
    // Calls the listener now with the current state, then on every change.
    subscribe(listener: (state: LucraAuthState) => void): () => void;
    isLoggedIn(): Promise<boolean>;
    logout(): Promise<void>;
  };
  tournaments: Api["tournaments"];
  matchups: Api["matchups"] & {
    watch(matchupId: string, handlers: LucraMatchupWatchHandlers): LucraMatchupWatch;
  };
  achievements: Api["achievements"];
  rewards: Api["rewards"];
  present: Omit<Present, "destroy">;
  on<K extends keyof LucraHeadlessEventMap>(
    event: K,
    listener: (data: LucraHeadlessEventMap[K]) => void
  ): () => void;
  whenConnected(): Promise<void>;
  // Runs `call`. When it fails with an error the user can fix in Lucra, Lucra
  // shows what the user needs, then `call` runs again. Settles with the call's
  // own result, or with the error that asked for the fix.
  withRemediation<T>(call: () => Promise<T>): Promise<T>;
  destroy(): void;
};

// Lucra messages that are passed on to lucra.on listeners unchanged.
const EVENTS: (keyof LucraHeadlessEventMap)[] = [
  "matchupCreated",
  "matchupAccepted",
  "matchupStarted",
  "matchupCanceled",
  "activeMatchupStarted",
  "tournamentJoined",
  "autoJoinedTournaments",
];

// Builds a client on top of the given frame. Tests call this with a fake frame.
export function createClient(
  config: LucraClientConfig,
  deps: {
    frame: Frame;
    parentOrigin: string;
    timeouts?: Partial<Timeouts>;
    unsupported?: boolean;
    onDestroy?: () => void;
  }
): LucraHeadlessClient {
  const urls: UrlContext = { config, parentOrigin: deps.parentOrigin };
  const timeouts: Timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };
  const session = createSession({
    frame: deps.frame,
    url: buildUrl(urls, HOME_PATH),
    timeouts,
    unsupported: deps.unsupported,
  });
  const auth = createAuth({ session, urls, timeouts });
  const activity: Activity = { screenOpen: false };
  const api = createApi({ session, auth, activity, requestMs: timeouts.requestMs });
  const watch = createWatch({ session });
  const present = createPresent({
    session,
    auth,
    frame: deps.frame,
    urls,
    activity,
    whenWriteSettled: api.whenWriteSettled,
  });
  const events = createEmitter<LucraHeadlessEventMap>();
  for (const type of EVENTS) {
    session.on(type, (data) => events.emit(type, data as never));
  }
  let destroyed = false;

  return {
    auth: {
      getState: auth.getState,
      subscribe: auth.subscribe,
      isLoggedIn: auth.isLoggedIn,
      logout: auth.logout,
    },
    tournaments: api.tournaments,
    matchups: { ...api.matchups, watch: watch.watch },
    achievements: api.achievements,
    rewards: api.rewards,
    present: {
      login: present.login,
      addFunds: present.addFunds,
      demographics: present.demographics,
      kyc: present.kyc,
      locationGrant: present.locationGrant,
      withdraw: present.withdraw,
      profile: present.profile,
      wallet: present.wallet,
      dismiss: present.dismiss,
      getState: present.getState,
      subscribe: present.subscribe,
    },
    on: events.on,
    whenConnected: session.whenConnected,
    withRemediation: createWithRemediation(present),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      present.destroy();
      watch.destroy();
      auth.destroy();
      events.clear();
      session.destroy();
      deps.onDestroy?.();
    },
  };
}

// The one live client on this page, and the config it was made with.
let live: {
  key: string;
  container: HTMLElement | undefined;
  client: LucraHeadlessClient;
} | null = null;

export function createLucraClient(config: LucraClientConfig): LucraHeadlessClient {
  try {
    return createLiveClient(config);
  } catch (error) {
    // `message` is written for users, so an uncaught error would say nothing
    // useful in the console. The hint says why. Hints hold no config values.
    if (isLucraError(error) && error.hint) {
      console.error(`Lucra ${error.code}: ${error.hint}`);
    }
    throw error;
  }
}

function createLiveClient(config: LucraClientConfig): LucraHeadlessClient {
  if (!config || !config.apiKey || !config.tenantId || !config.env) {
    throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
      hint: "apiKey, tenantId, and env are required.",
    });
  }
  const { container } = config;
  if (container !== undefined) {
    // 1 is an element node. Unlike instanceof, this also works for an element
    // from another window, such as a same origin iframe.
    if ((container as { nodeType?: unknown } | null)?.nodeType !== 1) {
      throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
        hint: "container must be an HTML element.",
      });
    }
    if (container.isConnected !== true) {
      throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
        hint: "container must be in the page.",
      });
    }
  }
  // Throws INVALID_CONFIG before anything is added to the page.
  const origin = lucraOrigin(config);
  // The container is compared on its own: an element turns into {} as JSON.
  const key = JSON.stringify([
    config.apiKey,
    config.tenantId,
    config.env,
    config.locationId ?? null,
    config.autoJoin ?? true,
  ]);
  if (live) {
    // The same config again returns the same client, so a hot reload or a
    // second import does not start a second Lucra session.
    if (live.key === key && live.container === container) return live.client;
    throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
      hint: "A Lucra client already exists with a different configuration. Call destroy() on it first.",
    });
  }

  const supported = hasDom();
  const client = createClient(config, {
    frame: supported ? createDomFrame(origin, container) : createNullFrame(),
    parentOrigin: supported ? pageOrigin() : "",
    unsupported: !supported,
    onDestroy: () => {
      if (live?.client === client) live = null;
    },
  });
  // A client made where there is no page is inert, so it is not remembered.
  if (supported) live = { key, container, client };
  return client;
}
