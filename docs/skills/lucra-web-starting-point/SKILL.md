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
- API keys are per-platform, per-environment (see [Lucra API Keys](https://docs.lucrasports.com/lucra-sdk/readme/whats-included/lucra-api-keys.md)). A web client key gets 401s from server-to-server and Forge endpoints — that is expected, not a bug in your integration.
- **The SDK's flow names don't say which product they open**: `home()`, `createMatchup()`, and `matchupDetails()` open Games You Play (GYP — 1v1 matchups); Tournaments have their own headless surface and detail flows. `profile()` opens the generic account profile, not a product-specific one. Don't assume "home" means the product you're integrating — verify the screen you land on.

## Route by goal

| You want to… | Go to |
|---|---|
| Install / project setup | [Project Setup](../../1.0_project_setup.md) |
| Initialize the client | [Initialize LucraClient](../../1.2_initialize_client.md) |
| Open Lucra screens (flows) | [Lucra Flows](../../1.3_lucraflows.md) |
| Deep links / matchup invites | [Deeplinks](../../1.4_deeplinks.md) |
| React to Lucra events | [Lucra Event Listener](../../1.6_lucra_event_listener.md) |
| Fetch Lucra data into your own UI (tournaments, leaderboards, achievements) or join headlessly | [Headless on Web](../../2.0_headless.md), [Tournaments Headless](../../2.1_tournaments_headless.md) — load the companion skill `lucra-web-headless` for the mental model first |
| Link/prefill your user's identity | [Updating Users](../../1.8_updating_users.md) |
| Rewards / convert-to-credit | [Rewards](../../1.9_rewards.md), [Convert to Credit](../../1.7_convert_to_credit.md) |
| What changed between versions | [Changelog](../../CHANGELOG.md) |

## Checkpoints — confirm each stage before building the next

1. **Init**: `LucraClient.initialize({ apiKey, tenantId, env })` succeeded and the `initialized` event fired (or `client.isInitialized` is true). If not: wrong apiKey/env pairing is the usual cause — keys are per-environment.
2. **Iframe reachable**: the iframe loads `https://<tenantId>.<env>.lucrasports.com` (production omits the env segment). Curl that host yourself if the iframe stays blank.
3. **Login state**: gate on `client.ready` — it resolves only when initialized *and* logged in, and rejects with `LucraUserNotLoggedIn` otherwise. Listen for `loginSuccess` and `userInfo`. Do **not** navigate flows before init completes: navigation postMessages sent while the embedded app is still loading can be silently dropped. Make your first-rendered screen decide the initial iframe destination instead of boot-then-redirect.
4. **Don't orchestrate auth yourself**: a `ready` rejection does NOT mean "force the login flow." Pre-login headless reads (e.g. `api.tournaments()`) are legitimate, and forcing a login navigation reloads the shared iframe and drops any in-flight request. Open the destination you actually want; Lucra's app gates it and shows login itself when needed.
5. **Re-assert your destination after login**: Lucra's post-login landing is *its own default screen*, not the route you originally requested. Remember the last destination your app asked for and re-issue that navigation (e.g. via `redirect()`) when `loginSuccess` fires.
6. **Round-trip**: `client.api.tournaments()` works pre-auth and proves the postMessage channel end-to-end. Note: `api.*` requests are single-flight — issuing a new call cancels the in-flight one, which rejects with `"Cancelled by new <name> request"`. Treat that specific rejection as benign, not an error. Frameworks that double-invoke effects in development trigger it constantly; the `lucra-web-headless` skill's framework notes cover the known cases.

## Troubleshooting

- **Silent nothing** (no error, no event): usually a dropped postMessage (see checkpoint 3) or a request that ended in the SDK's 15s timeout — see [Headless on Web → Request timeout](../../2.0_headless.md#request-timeout) for the cause table.
- **401s** from non-SDK Lucra endpoints: key-class mismatch (web key vs server key) — expected; not fixable client-side.
- **Iframe blank**: verify the tenant host resolves for your env; verify the apiKey query param is present on the iframe src.
- **`api.*` calls hang, time out, or reject with typed errors**: load the companion skill `lucra-web-headless` and see [Headless on Web → Errors](../../2.0_headless.md#errors).
- **Automated testing caution (agents)**: the Lucra iframe is cross-origin — synthetic clicks/keystrokes and script injection cannot reach it, and in agent-piloted browser environments even *human* keystrokes into the pane may not register in the iframe. Verify login/flows via SDK events and `client.ready`, not by driving Lucra's UI. Working verification protocol: a human runs the authenticated flows in their own regular browser against your dev server and relays observations (screenshots, iframe `src` from devtools, matchup IDs); note their session is separate from yours — cookies and localStorage don't carry over, so device-local state must be checked in *their* browser.
- Setup problems → back to [Project Setup](../../1.0_project_setup.md); init problems → [Initialize LucraClient](../../1.2_initialize_client.md).
