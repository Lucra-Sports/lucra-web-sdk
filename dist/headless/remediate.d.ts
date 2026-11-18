import type { Present } from "./present.js";
declare const FIXES: readonly ["login", "demographics", "locationGrant", "kyc"];
type Fix = (typeof FIXES)[number];
export declare function createWithRemediation(present: Pick<Present, Fix>): <T>(call: () => Promise<T>) => Promise<T>;
export {};
