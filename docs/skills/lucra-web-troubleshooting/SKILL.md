---
name: lucra-web-troubleshooting
description: >
  Diagnose a misbehaving Lucra Web SDK integration from its symptom: stuck on "Connecting" or slow to start,
  blank iframe, api.* calls timing out or rejecting, LucraClientNotOpen, "Cancelled by" rejections, a
  deposit popup that doesn't open, empty lists, another tenant's content, or events that never arrive. Use
  before concluding Lucra is down, and to prepare what to send Lucra support.
---

# Lucra Web SDK — Troubleshooting

> **Portability:** all relative links in this skill (e.g. `../../2.0_headless.md`) resolve against the
> `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this file is not
> sitting inside that docs folder (e.g. it was installed as a standalone agent skill), clone the public
> repo (shallow is fine) and resolve links there. Use only these published docs — never private Lucra
> checkouts that may exist elsewhere on the machine.

Almost every symptom below comes from how and when the integration talks to Lucra, not from an outage.
Check the integration first. Never "fix" a symptom with longer timeouts or automatic retries of writes.

## Symptom → cause → fix

| Symptom | Most likely causes, in order | Fix |
|---|---|---|
| Stuck on "Connecting" or slow first load (seconds, with a quiet network tab) | A failed initialization being routed around (`{ success: false }`, then login); the iframe mounted late; navigation sent before boot and dropped | Treat `{ success: false }` as a key/tenant/env error (`lucra-web-keys-and-tenant`); mount once at startup; wait for `ready` |
| Blank iframe | The tenant host doesn't resolve for this environment; the `apiKey` query param is missing from the iframe `src` | Check the iframe `src` in devtools; curl the host |
| `api.*` rejects with `"Timeout"` after 15 seconds | Sent before initialization; a write sent while logged out; the iframe reloaded mid-request; a blocked account | Gate on `client.ready`; don't navigate or reload the iframe during a request. See [Request timeout](../../2.0_headless.md#request-timeout) |
| `LucraClientNotOpen` | A call before `open()` or after `close()` | Mount at startup; see [LucraClientNotOpen](../../2.0_headless.md#lucraclientnotopen) |
| Rejection string starting with `"Cancelled by"` | A newer call replaced the pending one, often a double-invoked effect (React StrictMode in development) | Benign: ignore it |
| `NOT_ALLOWED` on a Games You Play write | A second write of the same kind while one is pending, or the matchup's state | Disable the button while pending; show `error.message` |
| Deposit popup doesn't open | Not called from a click (e.g. called after an `await`); blocked by the browser | Call `popup().deposit()` inside the click handler (`lucra-web-money-flows`) |
| User lands on Lucra's home screen after deposit or login | A headless deposit through `wallet()` / `profile()`; destination not re-issued after `loginSuccess` | `lucra-web-money-flows`, `lucra-web-auth-and-identity` |
| Asked to log in twice | Forced `login()`; the iframe re-mounted per route; a private window | `lucra-web-auth-and-identity` |
| Wrong user after switching accounts | The app's sign-out doesn't call `client.logout()` | `lucra-web-auth-and-identity` |
| Empty list or blank home, no error | Tenant provisioning, or the wrong environment | `lucra-web-keys-and-tenant` |
| Another tenant's content | Browser and server keys from different tenants | `lucra-web-keys-and-tenant` |
| Events never fire | Listening to raw `window` messages instead of `client.on()`; the listener removed too early | Use `client.on()` only ([Event Listener](../../1.6_lucra_event_listener.md)) |

## A timed-out write

A write that timed out (`joinTournament`, Games You Play create, accept, or cancel) may still have
completed. Don't retry it in a loop: read the current state first, and ask the user before trying again
([Write outcomes](../../2.2_gyp_headless.md#write-outcomes-definite-or-unknown)). A retry loop around a
call that was sent too early only multiplies the wait; fix the sequencing instead.

## What to send Lucra

When the integration checks out and the problem remains, send:

- the SDK version (`SDK_VERSION`, exported from `lucra-web-sdk`)
- the environment and tenant id, and the iframe `src` **host** (never the API key)
- the time it happened, the browser, and whether it reproduces in a normal (not private) window
- exact steps to reproduce, and the error or rejection value
- a screen recording if it's a UI flow

Never include API keys, webhook secrets, or other users' personal data.
