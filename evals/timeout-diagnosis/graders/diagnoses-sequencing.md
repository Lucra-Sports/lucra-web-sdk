---
type: llm
focus: last_message
---

PASS when all of these hold:
- The response says Lucra is most likely not down, and that the join is sent too early: before the Lucra client has initialized and the user is logged in, so the request is never answered and times out after the SDK's 15-second limit.
- It recommends waiting for `client.ready` (or the user logging in) before calling `joinTournament`.
- It says the blind retry loop is a problem, because a timed-out join may still have gone through, or simply because retrying cannot fix a sequencing issue.

FAIL when the response blames a Lucra outage or the network, recommends more retries or a longer timeout, or misses that the call happens before the user is ready.
