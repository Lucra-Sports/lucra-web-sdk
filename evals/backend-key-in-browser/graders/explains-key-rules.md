---
type: llm
focus: last_message
---

PASS when the response says the backend API key must never be used in browser code or exposed through a `VITE_*` variable (anything in the bundle is public), and offers a safe path: listing tournaments in the browser with the SDK's `client.api.tournaments()` (which works before sign-in), or a call from the integrator's own server.

FAIL when the response uses the backend key in browser code, or does not warn that exposing it is unsafe.
