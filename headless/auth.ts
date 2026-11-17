import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraIsLoggedInResponse,
} from "../types/types.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { createEmitter } from "./events.js";
import type { RequestSpec } from "./requests.js";
import type { Session, Timeouts } from "./session.js";
import type { LucraAuthState, LucraAuthStatus, LucraUser } from "./types.js";
import { navigateTarget, type UrlContext } from "./url.js";

export type Auth = {
  getState(): LucraAuthState;
  subscribe(listener: (state: LucraAuthState) => void): () => void;
  isLoggedIn(): Promise<boolean>;
  logout(): Promise<void>;
  // Resolves once a user is logged in and Lucra is ready for logged in calls.
  // Rejects with NOT_LOGGED_IN when nobody is. Call after session.whenConnected().
  whenLoggedIn(): Promise<void>;
  destroy(): void;
};

type Waiter = { resolve: () => void; reject: (error: LucraError) => void };

type PendingLogout = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: LucraError) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

const NOT_READY_MESSAGE = "Lucra did not finish signing the user in";

export function createAuth(options: {
  session: Session;
  urls: UrlContext;
  timeouts: Timeouts;
}): Auth {
  const { session, urls, timeouts } = options;

  const loginCheck: RequestSpec<LucraIsLoggedInResponse> = {
    type: MessageTypeToLucraClient.isLoggedInRequest,
    responseType: LucraClientMessageType.isLoggedInResponse,
    kind: "read",
    // `pending` means Lucra is still restoring a session and will answer again.
    interim: (data) => data?.pending === true,
    maxTimeoutMs: timeouts.authCheckMaxMs,
  };

  let state: LucraAuthState = { status: "loading", user: null };
  const changes = createEmitter<{ change: LucraAuthState }>();
  // Calls waiting for "loading" to end.
  const waiters = new Set<Waiter>();
  // True once Lucra has posted loginSuccess since it last started. Only then do
  // its handlers for logged in calls exist. It posts loginSuccess once per start.
  let ready = false;
  // The user Lucra last sent since it last started.
  let knownUser: LucraUser | null = null;
  // Bumped whenever a login check in flight should no longer be believed.
  let checkGeneration = 0;
  // Runs while Lucra says "logged in" but has not posted loginSuccess yet.
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  // True after that wait ran out. Later calls fail fast instead of hanging.
  let stalled = false;
  let pendingLogout: PendingLogout | null = null;
  let destroyed = false;

  const settleWaiters = (error?: LucraError) => {
    for (const waiter of [...waiters]) {
      if (error) waiter.reject(error);
      else if (state.status === "loggedIn") waiter.resolve();
      else waiter.reject(new LucraError(LucraErrorCode.NOT_LOGGED_IN));
    }
    waiters.clear();
  };

  const setState = (status: LucraAuthStatus, user: LucraUser | null) => {
    if (state.status === status && state.user === user) return;
    state = { status, user };
    changes.emit("change", state);
    if (status !== "loading") settleWaiters();
  };

  const setLoggedOut = () => {
    ready = false;
    knownUser = null;
    setState("loggedOut", null);
  };

  const clearReadyTimer = () => {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = null;
    stalled = false;
  };

  const settleLogout = (error?: LucraError) => {
    const logout = pendingLogout;
    if (!logout) return;
    pendingLogout = null;
    if (logout.timer) clearTimeout(logout.timer);
    if (error) logout.reject(error);
    else logout.resolve();
  };

  // `decidesLogout` is true for the check that runs when a logout was never
  // confirmed. Only that check may fail the logout.
  const runLoginCheck = (decidesLogout: boolean) => {
    const generation = ++checkGeneration;
    clearReadyTimer();
    session.request(loginCheck, { awaitsPending: true }).then(
      (answer) => {
        if (destroyed || generation !== checkGeneration) return;
        // An answer with no body has no user in it.
        if (!answer?.isLoggedIn) {
          setLoggedOut();
          settleLogout();
          return;
        }
        if (decidesLogout) {
          settleLogout(new LucraError(LucraErrorCode.LOGOUT_FAILED));
        }
        if (ready) {
          // Lucra never restarted, so the user it sent earlier still stands.
          setState("loggedIn", knownUser);
          return;
        }
        // Lucra says a user is logged in, but its handlers for logged in calls
        // only exist once it posts loginSuccess. Until then a read comes back
        // empty and a write is never answered, so stay "loading".
        setState("loading", state.user);
        readyTimer = setTimeout(() => {
          readyTimer = null;
          stalled = true;
          settleWaiters(new LucraError(LucraErrorCode.TIMEOUT, NOT_READY_MESSAGE));
        }, timeouts.authReadyMs);
      },
      (error: unknown) => {
        if (destroyed || generation !== checkGeneration) return;
        // Lucra restarted or the client was destroyed. The next connection
        // runs its own check.
        if (
          isLucraError(error) &&
          (error.code === LucraErrorCode.CONNECTION_RESET ||
            error.code === LucraErrorCode.DESTROYED)
        ) {
          return;
        }
        console.warn("Lucra login check failed. Treating the user as logged out.");
        setLoggedOut();
        settleLogout();
      }
    );
  };

  const unsubscribes = [
    session.onConnected(() => {
      // A fresh Lucra page has not posted loginSuccess yet, so a user who was
      // logged in is not ready for logged in calls until it does.
      ready = false;
      knownUser = null;
      if (state.status === "loggedIn") setState("loading", state.user);
      // A logout whose wait already ran out was being decided by a check this
      // restart cut short, so this check decides it instead.
      runLoginCheck(pendingLogout !== null && pendingLogout.timer === null);
    }),
    session.on(LucraClientMessageType.loginSuccess, (data) => {
      ready = true;
      knownUser = (data ?? {}) as LucraUser;
      checkGeneration += 1;
      clearReadyTimer();
      settleLogout(new LucraError(LucraErrorCode.LOGOUT_FAILED));
      setState("loggedIn", knownUser);
    }),
    session.on(LucraClientMessageType.userInfo, (data) => {
      if (state.status === "loggedOut") return;
      knownUser = (data ?? {}) as LucraUser;
      // During a logout the app has already been told the user is leaving.
      if (pendingLogout) return;
      setState(state.status, knownUser);
    }),
    session.on(LucraClientMessageType.logoutComplete, () => {
      checkGeneration += 1;
      clearReadyTimer();
      setLoggedOut();
      settleLogout();
    }),
    // A reload cut the login check short. If Lucra cannot start again, no
    // connection follows to check again, so fail the calls waiting on it.
    session.on(LucraClientMessageType.initialized, () => {
      session.whenConnected().catch((error: LucraError) => settleWaiters(error));
    }),
  ];

  const whenLoggedIn = () => {
    if (destroyed) return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
    if (state.status === "loggedIn") return Promise.resolve();
    if (state.status === "loggedOut") {
      return Promise.reject(new LucraError(LucraErrorCode.NOT_LOGGED_IN));
    }
    if (stalled) {
      return Promise.reject(new LucraError(LucraErrorCode.TIMEOUT, NOT_READY_MESSAGE));
    }
    return new Promise<void>((resolve, reject) => {
      waiters.add({ resolve, reject });
    });
  };

  return {
    getState: () => state,

    subscribe(listener) {
      const unsubscribe = changes.on("change", listener);
      try {
        listener(state);
      } catch (e) {
        console.error("Lucra auth listener threw an error", e);
      }
      return unsubscribe;
    },

    async isLoggedIn() {
      await session.whenConnected();
      try {
        await whenLoggedIn();
        return true;
      } catch (error) {
        if (isLucraError(error) && error.code === LucraErrorCode.NOT_LOGGED_IN) {
          return false;
        }
        throw error;
      }
    },

    logout() {
      if (destroyed) return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
      // A second call while one is in flight is the same logout.
      if (pendingLogout) return pendingLogout.promise;

      let resolve!: () => void;
      let reject!: (error: LucraError) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const logout: PendingLogout = { promise, resolve, reject, timer: null };
      pendingLogout = logout;

      session.whenConnected().then(
        () => {
          if (pendingLogout !== logout) return;
          if (state.status === "loggedOut") {
            settleLogout();
            return;
          }
          session.post(MessageTypeToLucraClient.navigate, {
            pathname: navigateTarget(urls, "logout"),
          });
          // The cached user is stale the moment a logout is asked for. Do not
          // ask Lucra yet: it would answer from the session it is tearing down.
          checkGeneration += 1;
          clearReadyTimer();
          setState("loading", null);
          // Lucra confirms with logoutComplete. If that never comes, ask.
          logout.timer = setTimeout(() => {
            logout.timer = null;
            if (pendingLogout === logout) runLoginCheck(true);
          }, timeouts.logoutMs);
        },
        (error: LucraError) => {
          if (pendingLogout === logout) settleLogout(error);
        }
      );
      return promise;
    },

    whenLoggedIn,

    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearReadyTimer();
      for (const unsubscribe of unsubscribes) unsubscribe();
      changes.clear();
      const error = new LucraError(LucraErrorCode.DESTROYED);
      settleWaiters(error);
      settleLogout(error);
    },
  };
}
