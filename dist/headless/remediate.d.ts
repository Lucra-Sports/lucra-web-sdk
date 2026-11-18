import { type LucraRemediation } from "./errors.js";
import type { Present } from "./present.js";
type Fix = Exclude<LucraRemediation, "addFunds">;
export declare function createWithRemediation(present: Pick<Present, Fix>): <T>(call: () => Promise<T>) => Promise<T>;
export {};
