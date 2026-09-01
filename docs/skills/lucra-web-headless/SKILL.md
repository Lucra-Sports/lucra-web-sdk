---
name: lucra-web-headless
description: >
  Understand Lucra's headless surface on Web before writing code against it — fetching tournaments,
  leaderboards, or achievements into your own UI, joining tournaments programmatically, or debugging
  api.* calls that time out, hang, reject with LucraUserNotLoggedIn / LucraApiError, or silently do
  nothing. Teaches the mental model (headless is still an invisible iframe), the async postMessage
  contract, which calls need auth, and the call → typed error → remediation flow → retry loop.
  The reference is in the docs this skill points to; load lucra-web-starting-point first if the SDK
  isn't set up yet.
---

# Lucra Web — Understanding Headless

> **Portability:** all relative links in this skill (e.g. `../../2.0_headless.md`) resolve against
> the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this
> file is not sitting inside that docs folder (e.g. it was installed as a standalone agent skill),
> clone the public repo (shallow is fine) and resolve links there. Use only these published docs —
> never private Lucra checkouts that may exist elsewhere on the machine.

This skill is the mental model. The reference — every signature, payload shape, and error table —
is [Headless on Web](../../2.0_headless.md) and [Tournaments Headless](../../2.1_tournaments_headless.md).
Do not write headless code from memory of other Lucra SDKs: Web's model differs from the mobile
SDKs, and code ported from them without adjustment will not work.

Prerequisite: an initialized, working SDK integration. If `LucraClient` isn't set up yet, load
`lucra-web-starting-point` first.

## 1. There is no "no iframe" — headless is an invisible iframe

On Android/iOS, headless calls run in-process. On Web, **every** headless call is served by the
full Lucra web app running inside an iframe your page hosts. "Headless" only means *you* choose
not to show it: `client.open(element, undefined, { hidden: true })` mounts an invisible iframe
that exists solely to run the Lucra app and post results back.

Everything else about Web headless follows from this:

- **Nothing works until the iframe is mounted and its app has booted.** Calls posted earlier are
  silently dropped (no error — the message just lands nowhere) and surface 15 seconds later as a
  timeout. Sequence behind the lifecycle gates: the `initialized` event / `client.ready`.
- **Headless and UI share the one iframe.** The hidden frame answering your `api.*` calls is the
  same frame `show()`, `redirect()`, and `dialog()` present. Navigating or reloading it — forcing
  `open(...).login()`, or re-parenting it with `moveTo()` — kills any in-flight request. Dialogs
  present Lucra UI without a reload.
- **Deposits are the exception**: `client.popup().deposit()` opens a real popup window because
  Apple Pay won't run in a cross-origin iframe. Never try to route deposits through the iframe.
- **You can't reach inside.** The iframe is cross-origin: synthetic clicks, script injection, and
  (in agent-piloted browsers) even typed keystrokes don't reach it. Verify behavior via SDK events
  and promises, not by driving Lucra's UI.

## 2. The contract is async postMessage request/response

An `api.*` call is: SDK posts a request message into the iframe → Lucra app does the work → app
posts a response message back → SDK resolves your Promise. Three properties matter:

- **Single-flight per function.** A new call to the same function cancels the in-flight one, which
  rejects with the string `"Cancelled by new <name> request"`. React StrictMode's double-fired dev
  effects hit this constantly — that rejection is benign, never surface it as an error.
- **15-second timeout, rejected as the string `"Timeout"`.** A timeout usually means the
  request was never received or never answered (not-yet-initialized iframe, logged-out session on
  a gated call, no iframe at all, mid-request reload) — treat it as a sequencing bug first, a
  Lucra outage last. The cause table: [Headless on Web → Request timeout](../../2.0_headless.md#request-timeout).
- **Typed errors vs strings.** `LucraUserNotLoggedIn` and `LucraApiError` are real Error classes —
  check with `instanceof`. Timeouts and cancellations are plain strings. Anything you can't
  classify with `instanceof` is one of the strings.

## 3. Auth: exactly one call works logged-out

`api.tournaments()` is the only pre-auth call — it also awaits initialization internally, making it
the best end-to-end probe that the postMessage channel works at all. Everything else
(`achievements`, `tournament`, `tournamentLeaderboard`, `joinTournament`, `autoJoinTournaments`)
needs a logged-in user and should be sequenced after `await client.ready`.

Two points to note:

- Auth gating is enforced by the Lucra app *not answering*, not by a typed rejection — a gated
  call issued logged-out just times out. `ready` is how you find out about auth, not the call.
- A `ready` rejection (`LucraUserNotLoggedIn`) does **not** mean "immediately force the login
  flow." Pre-auth reads are legitimate, and forcing login reloads the shared iframe. Open the
  destination you actually want; Lucra gates it and shows login itself when needed.

## 4. The loop that defines headless on Web: call → typed error → remediation flow → retry

Joins — `joinTournament`, and `autoJoinTournaments` for free tournaments — fail with a
`LucraApiError` whose `code` names the *user's* missing prerequisite, not a bug. Your job is never to fix the condition yourself — you present the
matching Lucra flow, wait for its completion event, and retry:

| `code` | Present | Completion signal | Retry? |
| --- | --- | --- | --- |
| `UNVERIFIED` | `dialog().kyc()` | `kycComplete` event | Yes |
| `DEMOGRAPHIC_INFORMATION_MISSING` | `dialog().demographic()` | `demographicComplete` event | Yes |
| `INSUFFICIENT_FUNDS` | `popup().deposit()` — popup, not iframe | `popup.onClose(result)` | Yes, on success |
| `LOCATION_NEEDED` | `dialog().locationGrant()` | `locationGranted` event | Yes |
| `LOCATION_ERROR` | nothing — show a location-unavailable state; `message` says whether Lucra rejected the region or the browser's geolocation failed | — | **No** for a rejected region; yes once a browser-side failure is fixed |
| `API_ERROR` | nothing — surface `message` | — | Yes (transient) |

Remove each completion listener with `off()` once it fires, or repeated failures stack duplicate
retries. A complete join example is in [Tournaments Headless → Joining a tournament](../../2.1_tournaments_headless.md#joining-a-tournament).
The authoritative error table: [Headless on Web → Errors](../../2.0_headless.md#errors).

## 5. When headless is the wrong choice

Use a [Lucra flow](../../1.3_lucraflows.md) instead when the step *is* Lucra's UI:

- **Login, KYC, demographics, deposits/withdrawals, location grant** — compliance and payment
  surfaces; they cannot be rebuilt headlessly and the SDK offers no headless equivalents.
- **Matchup creation and gameplay** — `createMatchup()` and the game screens run in Lucra's UI.
- **Anything with no `api.*` function.** The surface is deliberately small — six reads/actions
  ([the table](../../2.0_headless.md#api-functions)). If the data you want isn't there, the
  answer is a flow, an event listener ([Lucra Event Listener](../../1.6_lucra_event_listener.md)),
  or a feature request to Lucra — not scraping or probing undocumented routes.

In short: headless renders *your* screens from Lucra data; flows run *Lucra's* screens.
Compose them — headless list, flow for the interactive step, headless retry after.

## Recipes

- **Pre-auth tournament list**: mount hidden → `api.tournaments()` → render your cards → on tap,
  either your own detail view (`api.tournament` after `ready`) or hand off to
  `dialog().tournamentDetails(matchupId)`.
- **Gated join from your own button**: `await client.ready` (login on `LucraUserNotLoggedIn`) →
  `api.joinTournament(id)` → remediation loop above → `tournamentJoined` event confirms, same as
  UI-path joins.
- **Custom achievements screen**: `await client.ready` → `api.achievements()` → render;
  achievements is a single call documented inline in [Headless on Web](../../2.0_headless.md#achievements).
