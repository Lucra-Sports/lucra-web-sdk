---
type: llm
focus: last_message
---

PASS when the response tells the user that `{ success: false }` from initialization means the API key, tenant id, and environment don't belong together (for example a key from another tenant, or a sandbox key used with production), and that the fix is to correct those values rather than to route around the error.

FAIL when the response blames the network, Lucra's servers, or slow loading, or does not name the key, tenant, or environment configuration as the cause.
