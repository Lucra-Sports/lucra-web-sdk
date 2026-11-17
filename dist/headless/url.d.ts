import type { LucraClientConfig } from "./types.js";
export declare const HOME_PATH = "app/headless";
export type UrlContext = {
    config: LucraClientConfig;
    parentOrigin: string;
};
export declare function lucraOrigin(config: Pick<LucraClientConfig, "tenantId" | "env">): string;
export declare function buildUrl(context: UrlContext, path: string, params?: Record<string, string | undefined>): string;
export declare function navigateTarget(context: UrlContext, path: string): string;
