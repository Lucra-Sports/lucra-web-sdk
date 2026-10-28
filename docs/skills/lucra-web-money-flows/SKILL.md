---
name: lucra-web-money-flows
description: >
  Build deposits and the fixes for blocked buy-ins in a Lucra web integration: insufficient funds, missing
  demographics, and location on tournament joins and Games You Play matchups, opening Add Funds as a popup
  from a click, retrying after a successful deposit, and keeping users in the app instead of stranding them
  on Lucra's home screen. Use when a paid join or matchup fails for lack of balance or information, when
  wiring an "Add funds" or wallet button, or when deposits don't return users to where they were.
---

# Lucra Web SDK — Deposits and Blocked Buy-ins

> **Portability:** all relative links in this skill (e.g. `../../2.0_headless.md`) resolve against the
> `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this file is not
> sitting inside that docs folder (e.g. it was installed as a standalone agent skill), clone the public
> repo (shallow is fine) and resolve links there. Use only these published docs — never private Lucra
> checkouts that may exist elsewhere on the machine.

## The buy-in loop

Buy-ins (`joinTournament`, `autoJoinTournaments` for free tournaments, and the Games You Play create and
accepts) check, in order: **funds** (cash only), then **demographics** (always), then **location**. There
is no KYC check at buy-in; identity verification moves to withdrawals.

A failed check rejects with a `LucraApiError` whose `code` names what the **user** is missing. Don't fix it
yourself: present Lucra's flow for it, wait for its completion signal, and retry. A brand-new user can hit
several in a row, so the loop repeats until the call succeeds or hits a code you shouldn't retry.

| `code` | Present | Wait for | Retry |
|---|---|---|---|
| `INSUFFICIENT_FUNDS` | `client.popup().deposit()`, **from a click** | `popup.onClose(result)` with `result?.toastType === "success"` | Yes, on success |
| `DEMOGRAPHIC_INFORMATION_MISSING` | `client.dialog().demographic()` | `demographicComplete` event | Yes |
| `LOCATION_NEEDED` | `client.dialog().locationGrant()` | `locationGranted` event | Yes |
| `LOCATION_ERROR` | Show `error.message` as-is | — | No for a rejected region; yes once a browser-side failure is fixed |
| Anything else | Show `error.message` | — | See [Errors](../../2.0_headless.md#lucraapierror-by-code) |

Remove each completion listener with `off()` once it fires, or repeated failures stack retries. Worked
example: [Joining a tournament](../../2.1_tournaments_headless.md#joining-a-tournament).

## Deposits: the rules that matter

1. **Deposits run in a real popup**, because Apple Pay doesn't run in a cross-origin iframe.
2. **Open the popup from a click.** Browsers block popups that aren't opened from a user gesture, and the
   code after `await joinTournament(...)` is no longer inside one. On `INSUFFICIENT_FUNDS`, show your own
   "Add funds" button, and call `popup().deposit()` in its click handler. `popup().deposit()` throws if the
   browser blocks it: catch that and settle your flow.
3. **Retry only after a successful close.** `onClose` gets `undefined` when the user closed the popup
   without depositing.
4. **Headless builds: never send users to `wallet()` or `profile()` to deposit.** That leaves them inside
   Lucra's screens with no path back to your flow.
5. **Lucra-UI builds** can open `wallet()` or `profile()` (e.g. `dialog().wallet()`); the Lucra app opens
   Add Funds in a popup itself. `deposit()` on `open()` / `redirect()` / `dialog()` is deprecated.

Reference: [Popups](../../1.3_lucraflows.md#popups).

## Writes and timeouts

- `joinTournament` and `autoJoinTournaments`: a new call cancels the pending one, which rejects with
  `"Cancelled by new <name> request"`. That's benign.
- Games You Play writes: a second call while one is pending rejects with `NOT_ALLOWED`. Disable the button
  while a call is pending.
- A write that times out may still have completed. **Never retry a write automatically**; read the state
  first ([Write outcomes](../../2.2_gyp_headless.md#write-outcomes-definite-or-unknown)).

## Withdrawals

Withdrawals run in Lucra's UI (`withdraw()`), and that's where identity verification (KYC) happens. Don't
rebuild them headlessly.

## Test each user state

Before calling it done, run a paid action for each, and confirm it returns to the original action and
succeeds:

- a returning user with complete details and a zero balance (deposit only)
- a brand-new user (deposit, then demographics)
- a user without location granted (grant, then retry)
- a free tournament (demographics and location only, no deposit)
