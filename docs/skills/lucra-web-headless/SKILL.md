---
name: lucra-web-headless
description: >
  Understand Lucra's headless surface on Web before writing code against it: fetching tournaments,
  leaderboards, achievements, or Games You Play (GYP) matchups into your own UI, joining tournaments
  or creating, accepting, and canceling GYP matchups programmatically, or debugging api.* calls
  that time out, hang, reject with LucraUserNotLoggedIn / LucraClientNotOpen / LucraApiError, or
  silently do nothing. Teaches the mental model (headless is still an invisible iframe), the async
  postMessage contract, which reads work before login and which calls need auth, and the call,
  typed error, remediation flow, retry loop. The reference is in the docs this skill points to;
  load lucra-web-starting-point first if the SDK isn't set up yet.
---

# Lucra Web — Understanding Headless

> **Portability:** all relative links in this skill (e.g. `../../2.0_headless.md`) resolve against
> the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this
> file is not sitting inside that docs folder (e.g. it was installed as a standalone agent skill),
> clone the public repo (shallow is fine) and resolve links there. Use only these published docs —
> never private Lucra checkouts that may exist elsewhere on the machine.

This skill is the mental model. The reference — every signature, payload shape, and error table —
is [Headless on Web](../../2.0_headless.md), [Tournaments Headless](../../2.1_tournaments_headless.md),
and [Games You Play Headless](../../2.2_gyp_headless.md).
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

- **Nothing works until the iframe is mounted and its app has booted.** Calls made before `open()`
  (or after `close()`) fail fast with `LucraClientNotOpen`. Calls posted after `open()` but before
  the app has booted are silently dropped (no error: the message just lands nowhere) and surface
  later as a timeout. Sequence behind the lifecycle gates: the `initialized` event /
  `client.ready`. Mount once at startup, right after `initialize`, so the boot starts as early as
  possible: see
  [Mount the iframe at startup](../../1.2_initialize_client.md#mount-the-iframe-at-startup-recommended).
- **Headless and UI share the one iframe.** The hidden frame answering your `api.*` calls is the
  same frame `show()`, `redirect()`, and `dialog()` present. Navigating or reloading it (forcing
  `open(...).login()`, or re-parenting it with the deprecated `moveTo()`) kills any in-flight
  request. Dialogs present Lucra UI without a reload.
- **Deposits complete in a real popup window**, because Apple Pay won't run in a cross-origin
  iframe. `client.popup().deposit()` opens that popup directly and is the path to use from a
  headless remediation. Navigating the user to the Wallet or Profile screen in the iframe also
  works: the Lucra app detects that it is in an iframe and opens Add Funds in a popup itself.
- **You can't reach inside.** The iframe is cross-origin: synthetic clicks, script injection, and
  (in agent-piloted browsers) even typed keystrokes don't reach it. Verify behavior via SDK events
  and promises, not by driving Lucra's UI.

## 2. The contract is async postMessage request/response

An `api.*` call is: SDK posts a request message into the iframe → Lucra app does the work → app
posts a response message back → SDK resolves your Promise. Three properties matter:

- **Reads run concurrently; writes keep one call pending.** Each request carries its own id, so
  concurrent calls to a read (`achievements`, `tournaments`, `tournament`, `tournamentLeaderboard`,
  `matchup`, `matchupDetails`) each settle with their own response. Two kinds of
  calls keep one in flight, in opposite ways:
  - `joinTournament`, `autoJoinTournaments`, and `subscribeToMatchupDetails`: a new call cancels the
    in-flight one, which rejects with a string starting with `"Cancelled by"`. That rejection is
    benign: never surface it as an error.
  - The GYP writes (`createRecreationalGame`, `acceptVersusRecreationalGame`,
    `acceptFreeForAllRecreationalGame`, `cancelRecreationalGame`): a new call while one is pending
    rejects at once with `NOT_ALLOWED` and posts nothing; the first keeps going. The two accepts
    share one slot. Disable the button while a call is pending.

  Development-mode behavior in some frameworks triggers both; see [Framework notes](#framework-notes).
- **Per-request timeout, rejected as the string `"Timeout"`**: 15 seconds. A
  timeout usually means the request was never received or never answered (not-yet-initialized
  iframe, a write from a logged-out session, a mid-request reload): treat it as a sequencing bug
  first, a Lucra outage last. A timed-out write may still have completed, so never retry it
  automatically. `close()` does not cause timeouts: it rejects pending calls with
  `LucraClientNotOpen`. The cause table: [Headless on Web: Request timeout](../../2.0_headless.md#request-timeout).
- **Typed errors vs strings.** `LucraUserNotLoggedIn`, `LucraClientNotOpen`, and `LucraApiError`
  are real Error classes: check with `instanceof`. A failed iframe initialization rejects
  `client.ready` and the pre-auth reads with the body `{ success: false }`; handle it separately.
  Timeouts and cancellations are plain strings, and anything else is one of them.

## 3. Auth: only the pre-auth reads work logged-out

Several reads work before login: `api.tournaments()`, `api.matchup()`, `api.matchupDetails()`,
and `api.subscribeToMatchupDetails()`. All await initialization
internally, so they need no `await client.ready`. `api.tournaments()` is the best end-to-end probe
that the postMessage channel works at all. Everything else (`achievements`, `tournament`,
`tournamentLeaderboard`, `joinTournament`, `autoJoinTournaments`, and the GYP writes
`createRecreationalGame`, `acceptVersusRecreationalGame`, `acceptFreeForAllRecreationalGame`,
`cancelRecreationalGame`) needs a logged-in user and should be sequenced after `await client.ready`.

Two points to note:

- Auth gating is enforced by the Lucra app, never by a typed rejection: a write issued logged-out
  is never answered and times out, and a gated read resolves empty. `ready` is how you find out
  about auth, not the call.
- A `ready` rejection (`LucraUserNotLoggedIn`) does **not** mean "immediately force the login
  flow." Pre-auth reads are legitimate, and forcing login reloads the shared iframe. Open the
  destination you actually want; Lucra gates it and shows login itself when needed.

## 4. The loop that defines headless on Web: call → typed error → remediation flow → retry

Buy-ins (`joinTournament`, `autoJoinTournaments` for free tournaments, and the GYP create and
accepts) check funds (cash only), then demographics (always required), then location. There is no
KYC check. A failed check rejects with a `LucraApiError` whose `code` names the *user's* missing
prerequisite, not a bug. Your job is never to fix the condition yourself: present the matching
Lucra flow, wait for its completion event, and retry:

| `code` | Present | Completion signal | Retry? |
| --- | --- | --- | --- |
| `UNVERIFIED` | nothing: not returned by these headless prechecks (KYC moves to withdrawal flows); the code stays in `LucraApiErrorCode` for compatibility | none | No |
| `DEMOGRAPHIC_INFORMATION_MISSING` | `dialog().demographic()` (always required by these prechecks) | `demographicComplete` event | Yes |
| `INSUFFICIENT_FUNDS` | `popup().deposit()` — popup, not iframe | `popup.onClose(result)` | Yes, on success |
| `LOCATION_NEEDED` | `dialog().locationGrant()` | `locationGranted` event | Yes |
| `LOCATION_ERROR` | show `error.message` to the user as-is — it is a curated message carrying the geocompliance information they need; it also says whether Lucra rejected the region or the browser's geolocation failed | — | **No** for a rejected region; yes once a browser-side failure is fixed |
| `NOT_ALLOWED` | nothing: show `message` (blocked account, matchup not `OPEN`, already joined, not the creator, or another GYP write of the same kind pending) | none | **No**, except `"Another <name> request is already in progress"`: retry once the pending call settles (read the matchup first if your app had none pending) |
| `INVALID_AT_STAKE`, `INVALID_REWARD_TYPE`, `INVALID_PLAY_STYLE` | nothing: GYP create input is invalid; `message` names the field | none | Only with fixed input |
| `API_ERROR` | nothing: surface `message` | none | Reads: yes (transient). GYP writes: **never automatically**, the outcome may be unknown |

Remove each completion listener with `off()` once it fires, or repeated failures stack duplicate
retries. A complete join example is in [Tournaments Headless: Joining a tournament](../../2.1_tournaments_headless.md#joining-a-tournament).
The authoritative error table: [Headless on Web: Errors](../../2.0_headless.md#errors). Which GYP
write rejections are definite and which leave the outcome unknown:
[Write outcomes](../../2.2_gyp_headless.md#write-outcomes-definite-or-unknown).

## 5. When headless is the wrong choice

Use a [Lucra flow](../../1.3_lucraflows.md) instead when the step *is* Lucra's UI:

- **Login, KYC, demographics, deposits/withdrawals, location grant** — compliance and payment
  surfaces; they cannot be rebuilt headlessly and the SDK offers no headless equivalents.
- **Gameplay**: the game screens run in Lucra's UI (`dialog().matchupDetails(matchupId)`). GYP
  matchups can be created, accepted, and canceled headlessly, but they are played in Lucra.
- **Anything with no `api.*` function.** The surface is deliberately small
  ([the table](../../2.0_headless.md#api-functions)). If the data you want isn't there, the
  answer is a flow, an event listener ([Lucra Event Listener](../../1.6_lucra_event_listener.md)),
  or a feature request to Lucra — not scraping or probing undocumented routes.

In short: headless renders *your* screens from Lucra data; flows run *Lucra's* screens.
Compose them — headless list, flow for the interactive step, headless retry after.

## Framework notes

The SDK is plain TypeScript with no framework dependency — there is no React code in it, and it
does not know about components, effects, or routers. The issues below come from how frameworks
drive the SDK, not from the SDK itself.

- **React StrictMode (development only)** double-invokes effects. An effect that issues an `api.*`
  call fires twice. Reads run concurrently, so both calls settle with a result. For a write
  (`joinTournament`, `autoJoinTournaments`) the second call cancels the first, which rejects with
  `"Cancelled by new <name> request"`. Treat that rejection as benign. An effect that subscribes with
  `subscribeToMatchupDetails` and cancels in cleanup also gets a benign `"Cancelled by"` rejection
  from the first mount; ignore it. A GYP write in an effect runs once and its second call rejects
  with `NOT_ALLOWED`; issue GYP writes from event handlers instead. Production builds do not
  double-invoke, so do not add workarounds that change behavior.
- **Effect cleanup that calls `client.close()`** runs, then the effect re-runs under StrictMode.
  The iframe is removed and mounted again, so expect one extra iframe load in development and
  gate on `initialized` / `ready` again after the remount. Calls that need the iframe and run
  between `close()` and the remount throw or reject with `LucraClientNotOpen`.
- **Module re-execution (hot reload, dev servers)**: `LucraClient.initialize()` throws if the
  client already exists. Call it once at your app's entry point, not inside a component or a
  module that hot-reloads, and use `LucraClient.getInstance()` everywhere else.
- **Route changes that move the iframe**: `moveTo()` (deprecated) re-parents and therefore reloads
  the iframe (see [Lucra Flows](../../1.3_lucraflows.md#visibility-and-placement)). A router that
  mounts a new container per route and calls `moveTo()` reloads Lucra on every navigation and
  drops any in-flight request. `open(newContainer)` does not move it either: once the iframe
  exists, `open()` navigates in place, and if the router removes the original container the iframe
  goes with it. Keep one host element alive across routes, mounted once at startup, and present
  Lucra UI with a dialog: see
  [Mount the iframe at startup](../../1.2_initialize_client.md#mount-the-iframe-at-startup-recommended).

## Recipes

- **Pre-auth tournament list**: mount hidden at startup → `api.tournaments()` → render your
  cards → on tap, either your own detail view (`api.tournament` after `ready`) or hand off to
  `dialog().tournamentDetails(matchupId)`.
- **Gated join from your own button**: `await client.ready` (login on `LucraUserNotLoggedIn`) →
  `api.joinTournament(id)` → remediation loop above → `tournamentJoined` event confirms, same as
  UI-path joins.
- **Custom achievements screen**: `await client.ready` → `api.achievements()` → render;
  achievements is a single call documented inline in [Headless on Web](../../2.0_headless.md#achievements).
- **GYP matchup from your own UI**: creator calls `api.createRecreationalGame(input)` after
  `ready` and shares the `matchupId` through your own link. Your matchup page renders before login
  with `api.subscribeToMatchupDetails(id)` plus a `matchupDetailsUpdated` listener (remove it and
  call `api.cancelMatchupDetailsSubscription()` on unmount). The second user joins after `ready`
  with `acceptVersusRecreationalGame(id, teamId)` or `acceptFreeForAllRecreationalGame(id)` per
  `matchup.playStyle`; the creator may `cancelRecreationalGame(id)` while `OPEN`. Play hands off to
  `dialog().matchupDetails(id)`. Never log participant ids, usernames, or avatars. Full flow:
  [Games You Play Headless](../../2.2_gyp_headless.md#end-to-end-flow).
