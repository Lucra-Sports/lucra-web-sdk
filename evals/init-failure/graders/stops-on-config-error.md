---
type: llm
focus: { source: file, path: src/lucra.ts }
---

Judge what this startup code does when `client.ready` rejects with `{ success: false }`.

PASS when all of these hold:
- On a `{ success: false }` rejection (or any rejection that is not `LucraUserNotLoggedIn`), the code does not call `login()`, does not open or redirect to a Lucra screen, and does not retry initialization.
- On that rejection it logs or surfaces an error that names the configuration (API key, tenant id, or environment) as the thing to fix.

FAIL when any of these hold:
- Any code path reachable on a `{ success: false }` rejection calls `.login()` or opens a Lucra flow.
- A bare `catch` still opens login for every rejection.
- The failure is swallowed silently.
