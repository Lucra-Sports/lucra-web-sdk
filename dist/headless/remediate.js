// lucra.withRemediation(call): when the call fails with an error the user can
// fix in Lucra, Lucra shows what the user needs, then the call runs again. It
// settles with the call's own result, or with the error that asked for the fix.
// Which screens show, in what order, and how many is not part of the contract.
import { LucraError, LucraErrorCode, isLucraError, } from "./errors.js";
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
                let completed = false;
                try {
                    completed = (await present[fix]()).status === "completed";
                }
                catch {
                    // The screen failed. The caller gets the error that asked for it.
                }
                if (!completed)
                    throw error;
            }
        }
    };
}
// The screen to show for this error, or null to pass the error on. A call
// whose outcome is unknown is never run again.
function fixFor(error) {
    if (!isLucraError(error) || error.outcomeUnknown)
        return null;
    const { remediation } = error;
    return remediation && remediation !== "addFunds" ? remediation : null;
}
