import { SDK_VERSION } from "../version.js";
import { LucraError, LucraErrorCode } from "./errors.js";
// The blank Lucra route the hidden frame rests on.
export const HOME_PATH = "app/headless";
// A record, so adding a LucraEnvironment without listing it here fails the build.
const ENVIRONMENTS = {
    local: true,
    dev1: true,
    dev2: true,
    staging: true,
    sandbox: true,
    production: true,
};
const isCleanLucraOrigin = (origin) => {
    try {
        const url = new URL(origin);
        return url.origin === origin && url.hostname.endsWith(".lucrasports.com");
    }
    catch {
        return false;
    }
};
// Throws INVALID_CONFIG unless the config names a Lucra host. A tenantId holding
// "/", "#", "?" or "@" would otherwise send the frame, and the apiKey in its URL,
// to another site.
export function lucraOrigin(config) {
    if (!Object.keys(ENVIRONMENTS).includes(config.env)) {
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, `env must be one of ${Object.keys(ENVIRONMENTS).join(", ")}`);
    }
    if (config.env === "local")
        return "http://localhost:3000";
    const env = config.env !== "production" ? `${config.env}.` : "";
    const origin = `https://${config.tenantId.toLowerCase()}.${env}lucrasports.com`;
    if (!isCleanLucraOrigin(origin)) {
        throw new LucraError(LucraErrorCode.INVALID_CONFIG, "tenantId does not form a valid Lucra address");
    }
    return origin;
}
// A full URL the Lucra app can load, with the parameters it reads on startup.
export function buildUrl(context, path, params = {}) {
    const { config, parentOrigin } = context;
    const url = new URL(`${lucraOrigin(config)}/${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value)
            url.searchParams.set(key, value);
    }
    url.searchParams.set("apiKey", config.apiKey);
    if (config.locationId)
        url.searchParams.set("locationId", config.locationId);
    url.searchParams.set("autoJoin", String(config.autoJoin ?? true));
    url.searchParams.set("parentUrl", parentOrigin);
    url.searchParams.set("sdkVersion", SDK_VERSION);
    return url.toString();
}
// The `pathname` of a navigate message: a path inside the Lucra app. The app
// reads parentUrl from it, so it is repeated on every navigation.
export function navigateTarget(context, path) {
    const url = new URL(`${lucraOrigin(context.config)}/${path}`);
    url.searchParams.set("parentUrl", context.parentOrigin);
    return `${url.pathname}${url.search}`;
}
