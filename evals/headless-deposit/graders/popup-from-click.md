---
type: llm
focus: { source: file, path: src/main.ts }
---

Judge only where `popup().deposit()` is called in this file and what happens after it.

PASS when all of these hold:
- Every `popup().deposit()` call runs synchronously inside a click (or other user-gesture) handler, with no `await` before it inside that handler. A handler on a button the code shows after the failed join counts.
- After the popup closes with a successful result (`onClose` with `toastType === "success"`, or equivalent), the code retries the tournament join.

FAIL when any of these hold:
- `popup().deposit()` is called after an `await` in the same function, for example inside the `catch` of an awaited `joinTournament`.
- There is no retry of the join after a successful deposit.
- The file has no `popup().deposit()` call at all.
