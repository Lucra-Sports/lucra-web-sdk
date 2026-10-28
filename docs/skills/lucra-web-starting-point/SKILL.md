---
name: lucra-web-starting-point
description: >
  Start here for any Lucra Web/JavaScript SDK integration task — setting up the SDK, initializing
  LucraClient, logging users in, opening Lucra flows (profile, wallet, deposit, matchups,
  tournaments), listening to Lucra events, fetching data headlessly, or troubleshooting
  a web integration that won't initialize, won't log in, or silently does nothing. Routes you to
  the exact Lucra doc page or source file for your goal and gives verification checkpoints for
  each integration stage.
---

# Lucra Web SDK — Starting Point

> **Portability:** all relative links in this skill (e.g. `../../1.0_project_setup.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`.
> If this file is not sitting inside that docs folder (e.g. it was installed as a standalone agent
> skill), clone the public repo (shallow is fine) and resolve links there. Use only these published
> docs — never private Lucra checkouts that may exist elsewhere on the machine.

You are integrating Lucra's Web SDK (`lucra-web-sdk`): an iframe-embedding JavaScript library. Your app hosts a Lucra-provided iframe (`https://<tenant>.<env>.lucrasports.com`) and talks to it via the SDK's postMessage wrapper. Lucra owns everything inside the iframe — auth, KYC, payments, gameplay. Your app decides where the iframe lives and when to navigate it.

## Ground facts (verify, don't assume)

- The SDK is **not on npm**. Install from the GitHub tag: `"lucra-web-sdk": "github:Lucra-Sports/lucra-web-sdk#vX.Y.Z"` (pin the latest release tag). Repo: https://github.com/Lucra-Sports/lucra-web-sdk
- The machine-readable doc index is https://docs.lucrasports.com/llms.txt — every GitBook page has a raw `.md` variant (append `.md` to the page URL). Fetch raw pages instead of summarizing rendered ones; the pages are long and summarization loses important detail.
- The SDK repo's `docs/` folder mirrors the GitBook `javascript-web` section, and **the docs define the supported surface**. Use the TypeScript source (`types/types.ts`, `base.ts`, `v1.ts`) to confirm exact signatures and payload types of documented members — but a member that exists in the source and is absent from the docs is unsupported, not undocumented. Do not build on it; ask Lucra.
- **Talk to Lucra only through `LucraClient`.** Use `client.on()` / `client.off()` for events, `client.ready` for state, and `client.api.*` for data. Never add your own `window.addEventListener("message", …)` for the Lucra iframe's messages, or post messages into it yourself: that message format is internal and changes between versions, and handling it yourself bypasses the SDK's initialization and sequencing.
- API keys are per-platform, per-environment (see [Lucra API Keys](https://docs.lucrasports.com/lucra-sdk/readme/whats-included/lucra-api-keys.md)). A web client key gets 401s from server-to-server and Forge endpoints — that is expected, not a bug in your integration.
- **The SDK's flow names don't say which product they open**: `home()`, `createMatchup()`, and `matchupDetails()` open Games You Play (GYP, recreational matchups between players). GYP also has a headless surface ([Games You Play Headless](../../2.2_gyp_headless.md)); Tournaments have their own headless surface and detail flows. `profile()` opens the generic account profile, not a product-specific one. Don't assume "home" means the product you're integrating: verify the screen you land on.

## Route by goal

| You want to… | Go to |
|---|---|
| Install / project setup | [Project Setup](../../1.0_project_setup.md) |
| Initialize the client | [Initialize LucraClient](../../1.2_initialize_client.md) |
| Open Lucra screens (flows) | [Lucra Flows](../../1.3_lucraflows.md) |
| Deposit (Add Funds) | **Headless build, or any deposit in the middle of one of your own flows** (e.g. `INSUFFICIENT_FUNDS` on a join): `client.popup().deposit()` from a click handler, then retry on `popup.onClose(result)` with `result?.toastType === "success"` ([Popups](../../1.3_lucraflows.md#popups)). Do not send headless users to `wallet()` or `profile()` to deposit: that leaves them inside Lucra's screens with no path back to your flow. **Lucra-UI build**: open `wallet()` or `profile()` (e.g. `dialog().wallet()`), where the Lucra app opens Add Funds in a popup on its own. `deposit()` on `open()`, `redirect()`, and `dialog()` is deprecated |
| Deep links / matchup invites | [Deeplinks](../../1.4_deeplinks.md) |
| React to Lucra events | [Lucra Event Listener](../../1.6_lucra_event_listener.md) |
| Fetch Lucra data into your own UI (tournaments, leaderboards, achievements, GYP matchups), join tournaments, or create, accept, and cancel GYP matchups headlessly | [Headless on Web](../../2.0_headless.md), [Tournaments Headless](../../2.1_tournaments_headless.md), [Games You Play Headless](../../2.2_gyp_headless.md). Load the companion skill `lucra-web-headless` for the mental model first |
| Link/prefill your user's identity | [Updating Users](../../1.8_updating_users.md) |
| Rewards / convert-to-credit | [Rewards](../../1.9_rewards.md), [Convert to Credit](../../1.7_convert_to_credit.md) |
| What changed between versions | [Changelog](../../CHANGELOG.md) |
| Keys, environments, tenant switches, or empty-with-no-error content | Load the companion skill `lucra-web-keys-and-tenant` |
| Login, sign-out, switching users, linking your user to their Lucra user | Load the companion skill `lucra-web-auth-and-identity` |
| Deposits and blocked buy-ins (insufficient funds, demographics, location) | Load the companion skill `lucra-web-money-flows` |
| Server side: backend key, webhooks, score submission, rotating credentials | Load the companion skill `lucra-backend-integration` |
| Something isn't working and you need the cause | Load the companion skill `lucra-web-troubleshooting` |
| Checking whether the integration is ready to launch | Load the companion skill `lucra-web-go-live` |

## Checkpoints — confirm each stage before building the next

1. **Init and mount**: call `LucraClient.initialize({ apiKey, tenantId, env })`, then right away mount the iframe once, hidden, into a host element that lives for the whole app: `client.open(host, undefined, { hidden: true }).home()` (see [Mount the iframe at startup](../../1.2_initialize_client.md#mount-the-iframe-at-startup-recommended)). Confirm the `initialized` event fired with `{ success: true }` (or `client.isInitialized` is true). If it fired with `{ success: false }`, or `ready` rejected with that `{ success: false }` body, the `apiKey`, `tenantId`, and `env` don't belong together (keys are per tenant and per environment). (`LucraUserNotLoggedIn` means logged out, and `LucraClientNotOpen` means `close()` ran first: mount again and await the new `ready`.) **Stop and fix the configuration: never route around a failed initialization by opening login or continuing to other flows.** Login can appear to work, but everything after it runs against the wrong configuration. Then run the key checks in [If initialization fails, stop](../../1.2_initialize_client.md#if-initialization-fails-stop): the web key, `tenantId`, and the backend key your server uses must all come from the same tenant and environment.
2. **Iframe reachable**: the iframe loads `https://<tenantId>.<env>.lucrasports.com` (production omits the env segment). Curl that host yourself if the iframe stays blank.
3. **Login state**: gate on `client.ready` — it resolves only when initialized *and* logged in, and rejects with `LucraUserNotLoggedIn` otherwise. Listen for `loginSuccess` and `userInfo`. Do **not** navigate flows before init completes: navigation postMessages sent while the embedded app is still loading can be silently dropped. If a specific Lucra route is needed from the start, mount straight to it (e.g. `.tournamentDetails(id)` instead of `.home()`) rather than mounting and redirecting during boot. After the first mount, navigate with `redirect()` or `dialog()`: calling `open()` again does not move the iframe.
4. **Don't orchestrate auth yourself**: a `ready` rejection does NOT mean "force the login flow." Pre-login headless reads (e.g. `api.tournaments()`) are legitimate, and forcing a login navigation reloads the shared iframe and drops any in-flight request. Open the destination you actually want; Lucra's app gates it and shows login itself when needed.
5. **Re-assert your destination after login**: Lucra's post-login landing is *its own default screen*, not the route you originally requested. Remember the last destination your app asked for and re-issue that navigation (e.g. via `redirect()`) when `loginSuccess` fires.
6. **Round-trip**: `client.api.tournaments()` works pre-auth and proves the postMessage channel end-to-end. Note: reads run concurrently, but `joinTournament` and `autoJoinTournaments` are single-flight: a new call cancels the in-flight one, which rejects with `"Cancelled by new <name> request"`. Treat that specific rejection as benign, not an error. The GYP writes work the other way: a second call while one is pending rejects with `NOT_ALLOWED` and the first keeps going (see [Games You Play Headless](../../2.2_gyp_headless.md#functions)). Frameworks that double-invoke effects in development trigger both; the `lucra-web-headless` skill's framework notes cover the known cases.

## Before you call it done

"It works for me once" is not done. Lucra tests these scenarios before issuing production keys, so run them yourself first, in sandbox, each in a fresh private window. Report each one as pass or fail to whoever asked for the integration; don't summarize as "everything works".

1. **Keys**: the checks in [If initialization fails, stop](../../1.2_initialize_client.md#if-initialization-fails-stop) pass, and your app shows only your tenant's tournaments or matchups.
2. **Speed**: from tapping your "play for cash" (or equivalent) control to seeing Lucra's login or your next screen takes a couple of seconds, not 10. A long stall usually means a failed initialization being worked around (checkpoint 1).
3. **Login once**: a new user logs in once, lands back on the screen they started from (checkpoint 5), and is not asked to log in again later in the same session.
4. **Insufficient funds**: for a returning user with complete demographics and a zero balance, start a paid join or matchup, complete the deposit, and confirm it returns to the original action and succeeds. No "no deposit was made" message after a successful deposit, and no landing on Lucra's home screen.
5. **Missing demographics**: for a brand-new user (no balance, no demographics), start a paid join or matchup. Funds are checked before demographics, so expect `INSUFFICIENT_FUNDS` first: deposit and retry. On the `DEMOGRAPHIC_INFORMATION_MISSING` that follows, complete `dialog().demographic()` and retry again, then confirm the original action succeeds. Repeat with a free tournament, where only the demographics step applies.
6. **Second attempt**: join or play a second time (replays, re-entries, another matchup) and confirm the second buy-in behaves as your UI promises.
7. **Way back everywhere**: every Lucra screen your app can show (including links such as "Learn more", and screens reached after deposit or logout) has a path back to your app. Handle `exitLucra` (see [Exiting Lucra](../../1.5_exiting_lucra.md)).
8. **Logout and switch user**: sign out of your app, sign in as a different user, and confirm Lucra shows the new user.
9. **Leaderboards** (tournaments): poll at most once a minute, and check the screen still works once the leaderboard has more than one page.

If a scenario fails because of a missing SDK capability, stop and ask Lucra rather than building around it.

## Troubleshooting

- **Silent nothing** (no error, no event): usually a dropped postMessage (see checkpoint 3) or a request that ended in the SDK's request timeout (15s): see [Headless on Web → Request timeout](../../2.0_headless.md#request-timeout) for the cause table.
- **`LucraClientNotOpen`** (thrown, or rejected by `api.*`): a call that needs the iframe ran before `open()` or after `close()`. See [Headless on Web → Errors](../../2.0_headless.md#lucraclientnotopen).
- **401s** from non-SDK Lucra endpoints: key-class mismatch (web key vs server key) — expected; not fixable client-side.
- **Iframe blank**: verify the tenant host resolves for your env; verify the apiKey query param is present on the iframe src.
- **`api.*` calls hang, time out, or reject with typed errors**: load the companion skill `lucra-web-headless` and see [Headless on Web → Errors](../../2.0_headless.md#errors).
- **Automated testing caution (agents)**: the Lucra iframe is cross-origin — synthetic clicks/keystrokes and script injection cannot reach it, and in agent-piloted browser environments even *human* keystrokes into the pane may not register in the iframe. Verify login/flows via SDK events and `client.ready`, not by driving Lucra's UI. Working verification protocol: a human runs the authenticated flows in their own regular browser against your dev server and relays observations (screenshots, iframe `src` from devtools, matchup IDs); note their session is separate from yours — cookies and localStorage don't carry over, so device-local state must be checked in *their* browser.
- Setup problems → back to [Project Setup](../../1.0_project_setup.md); init problems → [Initialize LucraClient](../../1.2_initialize_client.md).
