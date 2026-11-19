// lucra.withRemediation(call): when the call fails with an error the user can
// fix in Lucra, Lucra shows what the user needs, then the call runs again,
// possibly more than once. It resolves with the call's result, or rejects with
// the error the call failed with, usually a LucraError. Which screens show, in
// what order, how many, and which error comes back is not part of the contract.
import { LucraError, LucraErrorCode, isLucraError, } from "./errors.js";
// The fixes this version can show. Add Funds is left out: its window must open
// from a click.
const FIXES = [
    "login",
    "demographics",
    "locationGrant",
    "kyc",
];
export function createWithRemediation(present) {
    return async function withRemediation(call) {
        if (typeof call !== "function") {
            throw new LucraError(LucraErrorCode.INVALID_ARGUMENT, undefined, {
                hint: "lucra.withRemediation() takes a function that makes the call, for example () => lucra.tournaments.join(id).",
            });
        }
        const shown = new Set();
        for (;;) {
            try {
                return await call();
            }
            catch (error) {
                const fix = fixFor(error);
                if (!fix || shown.has(fix))
                    throw error;
                shown.add(fix);
                // A screen that fails leaves the caller with the error from the call.
                const result = await present[fix]().catch(() => null);
                if (result?.status === "completed")
                    continue;
                if (result?.status === "dismissed" && result.reason === "destroyed") {
                    throw new LucraError(LucraErrorCode.DESTROYED);
                }
                throw error;
            }
        }
    };
}
// The screen to show for this error, or null to pass the error on. A call
// whose outcome is unknown is never run again. Only a fix this version knows
// is shown, whatever `remediation` holds.
function fixFor(error) {
    if (!isLucraError(error) || error.outcomeUnknown)
        return null;
    const { remediation } = error;
    return FIXES.find((fix) => fix === remediation) ?? null;
}
