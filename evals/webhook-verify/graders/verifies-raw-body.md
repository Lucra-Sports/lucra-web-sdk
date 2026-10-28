---
type: llm
focus: { source: file, path: server/server.ts }
---

Judge the webhook endpoint.

PASS when all of these hold:
- It computes an HMAC-SHA256 of the **raw request body bytes** with the shared secret, before parsing JSON. Re-serializing a parsed body (`JSON.stringify(JSON.parse(...))`) does not count.
- It compares the result with the `X-Lucra-Signature` header using a constant-time comparison.
- On a missing or invalid signature it responds with an error status (401 or 403) and does not record the event.
- Only after verification does it parse the body and record `FundsDeposited` events.

FAIL when any of these hold:
- The signature is not verified, or is verified over a re-serialized body.
- An invalid signature still records the event.
- The secret is hard-coded instead of read from `LUCRA_WEBHOOK_SECRET`.
