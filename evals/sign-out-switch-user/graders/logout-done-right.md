---
type: llm
focus: { source: file, path: src/main.ts }
---

Judge the app's `signOut()` function.

PASS when all of these hold:
- It calls `client.logout()` (Lucra's sign-out) as part of signing out, while the Lucra client is still open.
- It does not call `LucraClient.destroy()` or `client.close()` immediately after `logout()` in the same step. Navigating away afterwards (for example `location.href = "/login"`) is fine.

FAIL when any of these hold:
- There is no `logout()` call.
- `logout()` is followed straight away by `destroy()` or `close()`, which can cut Lucra's sign-out short.
- The fix only clears local storage or cookies by hand instead of calling `logout()`.
