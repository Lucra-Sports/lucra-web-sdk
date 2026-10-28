---
name: lucra-web-go-live
description: >
  Check whether a Lucra Web SDK integration is ready to launch, before asking Lucra for production keys or
  shipping: reviews the integration against the scenarios Lucra tests (keys and tenant, startup, login,
  deposits and blocked buy-ins, sign-out, a way back from every Lucra screen, plus per-product checks for
  tournaments, Games You Play, mini games, and rewards) and reports pass, fail, or untested for each. Use
  when asked "is this ready", "what's left", "can we go live", or for a launch or go-live review.
---

# Lucra Web SDK — Go-Live Review

> **Portability:** all relative links in this skill (e.g. `../../1.2_initialize_client.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this
> file is not sitting inside that docs folder (e.g. it was installed as a standalone agent skill), clone
> the public repo (shallow is fine) and resolve links there. Use only these published docs — never private
> Lucra checkouts that may exist elsewhere on the machine.

"It works for me once" is not ready. Lucra tests the scenarios below before it issues production keys.
Review the integration against them and report **each one separately** as one of:

- **Pass**: you confirmed it in the code (and, where possible, by running it).
- **Fail**: you found the problem. Name the file and line, and the fix.
- **Untested**: it needs a person in a browser (most flows run inside Lucra's cross-origin iframe, which
  you can't drive). Say exactly what they should do and what they should see.

Never sum up as "everything works". Untested is an honest answer; a guessed pass is not.

## First, identify the shape

Integrations vary. Before checking, write down which of these apply, and skip sections that don't:

- **Headless** (your own UI from `client.api.*`) or **Lucra UI** (Lucra's screens via `dialog()`,
  `open()`, `redirect()`), or a mix.
- **Products:** tournaments, Games You Play (matchups between players), mini games, free-to-play rewards,
  convert to credit.
- **Money:** cash buy-ins (deposits, withdrawals) or free only.
- **Backend:** does the integrator's server call Lucra or receive webhooks?

## Core scenarios (every integration)

| # | Scenario | Pass looks like | Where it's covered |
|---|---|---|---|
| 1 | Keys and tenant | `initialized` fires with `{ success: true }`; the iframe host is the integrator's tenant; only their own tournaments or matchups show; the backend key is never in browser code | `lucra-web-keys-and-tenant` |
| 2 | Startup | Mounted once, hidden, right after `initialize`; nothing sent before `ready`; a failed initialization stops instead of opening login | [Initialize](../../1.2_initialize_client.md) |
| 3 | Login once | Lucra shows its own login when needed; after `loginSuccess` the user lands back where they started; they aren't asked to log in again in the same session | `lucra-web-auth-and-identity` |
| 4 | Sign-out and switch user | The app's sign-out calls `client.logout()`; the next user on the device sees their own Lucra account | `lucra-web-auth-and-identity` |
| 5 | A way back everywhere | Every Lucra screen the app can show has a path back: `exitLucra` handled, dialogs closable, no link (e.g. "Learn more") that strands the user on Lucra's home screen | [Exiting Lucra](../../1.5_exiting_lucra.md), [Dialogs](../../1.3_lucraflows.md#dialogs) |
| 6 | Events through the client only | Only `client.on()` / `client.off()`; no raw `window` message listeners for the iframe | [Event Listener](../../1.6_lucra_event_listener.md) |

## Money scenarios (cash buy-ins)

| # | Scenario | Pass looks like |
|---|---|---|
| 7 | Insufficient funds | A returning user with a zero balance starts a paid action, deposits, returns to the same action, and it succeeds. No "no deposit was made" message after a deposit that went through |
| 8 | New user | A brand-new user goes through deposit, then demographics, in the order the buy-in checks run, and the action succeeds |
| 9 | Location | A missing location shows the grant page and retries; a rejected region shows Lucra's message as-is and doesn't retry |
| 10 | Headless deposits | Deposits use `client.popup().deposit()` from a click, never `wallet()` / `profile()` |

Details: `lucra-web-money-flows`.

## Product scenarios

- **Tournaments:** join and second join (replay or re-entry) behave as the UI promises; leaderboards poll
  at most once a minute and still work past the first page
  ([Leaderboard pages](../../2.1_tournaments_headless.md#leaderboard-pages)); free tournaments auto-join or
  are joined deliberately ([autoJoin](../../1.2_initialize_client.md#autojoin)).
- **Games You Play:** create, share, accept, cancel; buttons disabled while a write is pending; a timed-out
  write is never retried blindly
  ([Write outcomes](../../2.2_gyp_headless.md#write-outcomes-definite-or-unknown)).
- **Mini games:** the home shows games in both sandbox and production (enablement is per environment).
- **Rewards / convert to credit:** the reward and credit handoffs work end to end
  ([Rewards](../../1.9_rewards.md), [Convert to Credit](../../1.7_convert_to_credit.md)).
- **Backend:** webhooks are verified and processed once; see `lucra-backend-integration`.

## Report format

Write the report as a table: scenario, status, evidence (file:line or what you ran), and next step. End with
the list of **Fail** items to fix and the **Untested** items a person must run, in sandbox, each in a fresh
private window. Only call the integration ready when nothing is Fail and the person running the Untested
items has confirmed them.
