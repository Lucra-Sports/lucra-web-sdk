import { createApi } from "./api.js";
import { createAuth } from "./auth.js";
import { LucraError, LucraErrorCode, isLucraError } from "./errors.js";
import { createEmitter } from "./events.js";
import { PRESENTATIONS, createDomFrame, createNullFrame, hasDom, pageOrigin, } from "./frame.js";
import { createPresent } from "./present.js";
import { createWithRemediation } from "./remediate.js";
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
    const api = createApi({ session, auth, activity, requestMs: timeouts.requestMs });
    const watch = createWatch({ session });
    const present = createPresent({
        session,
        auth,
        frame: deps.frame,
        urls,
        activity,
        whenWriteSettled: api.whenWriteSettled,
        startMinigame: api.startMinigame,
        presentation: config.presentation ?? "fullScreen",
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
            updateUser: api.auth.updateUser,
        },
        tournaments: api.tournaments,
        matchups: { ...api.matchups, watch: watch.watch },
        achievements: api.achievements,
        rewards: api.rewards,
        present: {
            login: present.login,
            addFunds: present.addFunds,
            minigame: present.minigame,
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
    try {
        return createLiveClient(config);
    }
    catch (error) {
        // `message` is written for users, so an uncaught error would say nothing
        // useful in the console. The hint says why. Hints hold no config values.
        if (isLucraError(error) && error.hint) {
            console.error(`Lucra ${error.code}: ${error.hint}`);
        }
        throw error;
    }
}
function createLiveClient(config) {
    if (!config || !config.apiKey || !config.tenantId || !config.env) {
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
            hint: "apiKey, tenantId, and env are required.",
        });
    }
    const { presentation } = config;
    if (presentation !== undefined && !PRESENTATIONS.includes(presentation)) {
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
            hint: 'presentation must be "fullScreen", "modal", or "sheet".',
        });
    }
    // Throws INVALID_CONFIG before anything is added to the page.
    const origin = lucraOrigin(config);
    const key = JSON.stringify([
        config.apiKey,
        config.tenantId,
        config.env,
        config.locationId ?? null,
        config.autoJoin ?? true,
        presentation ?? "fullScreen",
    ]);
    if (live) {
        // The same config again returns the same client, so a hot reload or a
        // second import does not start a second Lucra session.
        if (live.key === key)
            return live.client;
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, undefined, {
            hint: "A Lucra client already exists with a different configuration. Call destroy() on it first.",
        });
    }
    const supported = hasDom();
    const client = createClient(config, {
        frame: supported ? createDomFrame(origin) : createNullFrame(),
        parentOrigin: supported ? pageOrigin() : "",
        unsupported: !supported,
        onDestroy: () => {
            if (live?.client === client)
                live = null;
        },
    });
    // A client made where there is no page is inert, so it is not remembered.
    if (supported)
        live = { key, client };
    return client;
}
