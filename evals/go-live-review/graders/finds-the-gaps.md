---
type: llm
focus: last_message
---

The app under review has these gaps:
1. On insufficient funds in a headless join, it opens `client.dialog().wallet()` instead of a deposit popup (`popup().deposit()` from a click) followed by a retry of the join.
2. Its `signOut()` doesn't sign the user out of Lucra (`client.logout()`), so the next person on the device opens Lucra as the previous user.
3. Nothing handles the user leaving a Lucra screen (no `exitLucra` listener, no way back to the app).

PASS when the response identifies at least two of these three gaps and says the integration is not ready to launch yet.

FAIL when the response says the integration is ready, finds fewer than two of the gaps, or gives only generic advice without pointing to the code.
