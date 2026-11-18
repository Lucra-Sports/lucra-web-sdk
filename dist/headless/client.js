import { createApi } from "./api.js";
import { createAuth } from "./auth.js";
import { LucraError, LucraErrorCode } from "./errors.js";
import { createEmitter } from "./events.js";
import { createDomFrame, createNullFrame, hasDom, pageOrigin, } from "./frame.js";
import { createPresent } from "./present.js";
import { DEFAULT_TIMEOUTS, createSession } from "./session.js";
import { HOME_PATH, buildUrl, lucraOrigin } from "./url.js";
import { createWatch } from "./watch.js";
// Lucra messages that are passed on to lucra.on listeners unchanged.
const EVENTS = [
    "matchupCreated",
    "matchupAccepted",
    "matchupStarted",
    "matchupCanceled",
    "activeMatchupStarted",
    "tournamentJoined",
    "autoJoinedTournaments",
];
// Builds a client on top of the given frame. Tests call this with a fake frame.
export function createClient(config, deps) {
    const urls = { config, parentOrigin: deps.parentOrigin };
    const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };
    const session = createSession({
        frame: deps.frame,
        url: buildUrl(urls, HOME_PATH),
        timeouts,
        unsupported: deps.unsupported,
    });
    const auth = createAuth({ session, urls, timeouts });
    const activity = { screenOpen: false };
    const api = createApi({ session, auth, activity });
    const watch = createWatch({ session });
    const present = createPresent({
        session,
        auth,
        frame: deps.frame,
        urls,
        activity,
        whenWriteSettled: api.whenWriteSettled,
    });
    const events = createEmitter();
    for (const type of EVENTS) {
        session.on(type, (data) => events.emit(type, data));
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
        },
        on: events.on,
        whenConnected: session.whenConnected,
        destroy() {
            if (destroyed)
                return;
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
let live = null;
export function createLucraClient(config) {
    if (!config || !config.apiKey || !config.tenantId || !config.env) {
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, "apiKey, tenantId, and env are required");
    }
    const { container } = config;
    if (container !== undefined) {
        // 1 is an element node. Unlike instanceof, this also works for an element
        // from another window, such as a same origin iframe.
        if (container?.nodeType !== 1) {
            throw new LucraError(LucraErrorCode.INVALID_CONFIG, "container must be an HTML element");
        }
        if (container.isConnected !== true) {
            throw new LucraError(LucraErrorCode.INVALID_CONFIG, "container must be in the page");
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
        if (live.key === key && live.container === container)
            return live.client;
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, "A Lucra client already exists with a different configuration. Call destroy() on it first.");
    }
    const supported = hasDom();
    const client = createClient(config, {
        frame: supported ? createDomFrame(origin, container) : createNullFrame(),
        parentOrigin: supported ? pageOrigin() : "",
        unsupported: !supported,
        onDestroy: () => {
            if (live?.client === client)
                live = null;
        },
    });
    // A client made where there is no page is inert, so it is not remembered.
    if (supported)
        live = { key, container, client };
    return client;
}
