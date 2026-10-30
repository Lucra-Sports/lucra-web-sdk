---
type: llm
focus: { source: file, path: src/lucra.ts }
---

Judge what this startup code does when `client.ready` rejects. It can reject in two ways: with `{ success: false }` when initialization failed (wrong API key, tenant id, or environment), or with `LucraUserNotLoggedIn` when the user simply isn't logged in yet. Any way of telling them apart counts, such as `instanceof LucraUserNotLoggedIn`, `error.success === false`, or `client.isInitialized`.

PASS when all of these hold:
- On a failed initialization, the code does not call `login()`, does not open or redirect to a Lucra screen, and does not retry initialization. It logs, shows, or throws an error that names the configuration (API key, tenant id, or environment) as the thing to fix. Throwing or rethrowing on this path is fine.
- On the logged-out path only (`LucraUserNotLoggedIn`, or `isInitialized` true), the code does not throw, reject, or log an error, so the rest of the app keeps working.

FAIL when any of these hold:
- Any path reachable on a failed initialization calls `.login()` or opens a Lucra flow.
- Every rejection is handled the same way, so either a failed initialization still opens login, or a logged-out user is thrown, rejected, or logged as an error.
- The failure is swallowed silently.
