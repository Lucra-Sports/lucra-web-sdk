import { SDK_VERSION } from "../version.js";
// The blank Lucra route the hidden frame rests on.
export const HOME_PATH = "app/headless";
export function lucraOrigin(config) {
    if (config.env === "local")
        return "http://localhost:3000";
    const env = config.env !== "production" ? `${config.env}.` : "";
    return `https://${config.tenantId.toLowerCase()}.${env}lucrasports.com`;
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
