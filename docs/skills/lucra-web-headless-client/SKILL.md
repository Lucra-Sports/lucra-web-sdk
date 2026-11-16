---
name: lucra-web-headless-client
description: >
  Use for any work with Lucra's preview headless client: code that imports createLucraClient
  from lucra-web-sdk/headless, or uses its client (lucra.auth, lucra.tournaments, lucra.matchups,
  lucra.present, LucraError). Covers the preview status, setup and config, how calls wait and
  fail, showing Lucra screens full screen or in your own container, Add Funds, Games You Play
  create, accept, and cancel, React usage, and troubleshooting codes such as INVALID_CONFIG,
  CONNECTION_TIMEOUT, NOT_LOGGED_IN, IN_PROGRESS, SCREEN_OPEN, POPUP_BLOCKED, and TIMEOUT. Not
  for LucraClient (LucraClient.initialize, client.open, client.ready, client.api.*): load
  lucra-web-starting-point or lucra-web-headless for that.
---

# Lucra Web: Headless Client (preview)

> **Portability:** all relative links in this skill (e.g. `../../3.0_headless_client.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`,
> at the tag or branch you install the SDK from. If this file is not sitting inside that docs
> folder (e.g. it was installed as a standalone agent skill), clone the public repo (shallow is
> fine) and resolve links there. Use only these published docs, never private Lucra checkouts
> that may exist elsewhere on the machine.

This skill is the mental model for `createLucraClient` from `lucra-web-sdk/headless`. The
reference is [Headless client (preview)](../../3.0_headless_client.md). It stands alone: do not
load the `LucraClient` skills, and do not port code from the `LucraClient` docs (`initialize`,
`open()`, `ready`, `dialog()`, `client.api.*`). None of it applies here.

## 0. It is a preview

- Its API can still change before it becomes version 2.0.0 of the SDK. Pin the exact tag or
  commit you install.
- Before building, ask the Lucra contact to confirm the Lucra environment supports the headless
  client.
- `LucraClient`, the root `lucra-web-sdk` export, is unchanged and stays the supported client.
- Use one or the other on a page, never both.

## 1. Mental model

- **Create once, never wait.** `createLucraClient(config)` returns at once and connects in the
  background. Every call waits for Lucra on its own. There is no `ready` and no init event.
- **Lucra stays hidden until you ask.** `lucra.present.*` is the only thing that shows a Lucra
  screen. Everything else returns data for your own UI.
- **Every failure is a `LucraError`** with a `code`. `remediation` names the `lucra.present`
  screen that fixes it. `outcomeUnknown` says a write may have gone through anyway.
- **`loggedIn` means Lucra confirmed the login.** Calls that need a user wait while auth is
  `"loading"`.
- **Writes are one at a time, and never while a screen shows.** A refused write sends nothing.

## 2. Setup

`import { createLucraClient, isLucraError } from "lucra-web-sdk/headless";`

| Option | Notes |
| --- | --- |
| `apiKey` | Required |
| `tenantId` | Required. Must form a Lucra address: `https://<tenantId>.<env>.lucrasports.com`, or `https://<tenantId>.lucrasports.com` in production |
| `env` | Required. Exactly one of `"local"`, `"dev1"`, `"dev2"`, `"staging"`, `"sandbox"`, `"production"` |
| `locationId` | Optional |
| `autoJoin` | Optional, defaults to `true`. See [autoJoin](../../1.2_initialize_client.md#autojoin) |
| `container` | Optional element that Lucra screens show inside. See [section 5](#5-screens) |

- `createLucraClient` **throws `INVALID_CONFIG` synchronously**, before it adds anything to the
  page, when `apiKey`, `tenantId`, or `env` is missing, `env` is not in the list above,
  `tenantId` does not form a Lucra address, `container` is not an element in the page, or a
  client already exists with a different config or container.
- The same config and the same container return the same client, so hot reload, repeated
  imports, and repeated calls are safe. An omitted `autoJoin` counts as `true`.
- To change the config or the container, call `lucra.destroy()`, then create it again.
- Where there is no browser (server rendering) it returns an inert client whose calls reject
  with `UNSUPPORTED_ENVIRONMENT`. Create it in browser code.
- A bundler that does not read the `exports` field (webpack 4, for example) needs an alias from
  `lucra-web-sdk/headless` to `lucra-web-sdk/dist/headless/index.js`.

**Checkpoint:** `await lucra.whenConnected()` resolves. It rejects with the reason, for example
`CONNECTION_FAILED`. Then `await lucra.tournaments.list()` returns an array. Neither needs a login.

## 3. Auth

`lucra.auth.getState()` returns `{ status, user }`:

| `status` | Meaning |
| --- | --- |
| `"loading"` | Lucra has not answered yet, or it reported a user and has not finished signing them in. It never leaves `"loading"` if the client cannot connect |
| `"loggedOut"` | Nobody is logged in |
| `"loggedIn"` | Lucra confirmed the login, so calls that need a user will work. `user` can still be `null` for a moment. `user.balance` stays current |

- `lucra.auth.subscribe(listener)` calls the listener now, then on every change, and returns a
  function that stops it. `getState()` returns the same object until something changes.
- `await lucra.auth.isLoggedIn()` waits out `"loading"`, then resolves `true` or `false`.
- `await lucra.auth.logout()` signs the user out of Lucra. Call it when your user signs out of
  your app. `lucra.destroy()` does not sign anyone out.

| Works logged out | Needs a logged in user |
| --- | --- |
| `tournaments.list()`, `matchups.get()`, `matchups.getDetails()`, `matchups.watch()`, `present.login()` | `tournaments.get()`, `tournaments.leaderboard()`, `achievements.list()`, every write, every other `present.*` screen |

A call that needs a user waits while the status is `"loading"`, then rejects with `NOT_LOGGED_IN`
if nobody is logged in. `present.addFunds()` cannot wait (see [Add Funds](#add-funds)), so it
rejects only when the status is already `"loggedOut"`.

## 4. Writes and errors

The writes are `tournaments.join()`, `tournaments.autoJoin()`, `matchups.create()`,
`matchups.accept()`, and `matchups.cancel()`.

- **One at a time, of any kind.** While one is pending, another rejects with `IN_PROGRESS` and
  nothing is sent. Disable the button while a call is pending.
- **Not while a screen shows or is opening.** From the moment you call a `present.*` screen
  (any but `addFunds()`) until its promise settles, writes reject with `SCREEN_OPEN`. Await the screen's result before the
  next write. A screen asked for while a write is pending waits for that write to finish.
- Both checks run before anything is sent, so a double click cannot send a write twice.

Check for an error with `isLucraError(error)`. It has `code`, `message` (text you can show),
`remediation`, and `outcomeUnknown`.

- **`remediation`** names the screen to show, then try the call again if it resolves
  `"completed"`: `NOT_LOGGED_IN` is `"login"`, `INSUFFICIENT_FUNDS` is `"addFunds"`,
  `DEMOGRAPHIC_INFORMATION_MISSING` is `"demographics"`, `LOCATION_NEEDED` is `"locationGrant"`,
  and `UNVERIFIED` is `"kyc"`. Everything else is `null`. `"addFunds"` must start from a click,
  so show your own Add Funds button for it instead of calling it from a `catch`.
- **`outcomeUnknown: true` means read back before retrying.** It is set when a pending write ends
  with `TIMEOUT`, `CONNECTION_RESET`, or `DESTROYED`, and on most plain `API_ERROR`s from a
  matchup create, accept, or cancel. Never retry it automatically: read the matchup, or ask the
  user. A second create makes a second matchup with a second buy in. Reads never set it and are
  safe to repeat.

The remediation loop in code: [Changing things](../../3.0_headless_client.md#changing-things).
Every code: [Errors](../../3.0_headless_client.md#errors).

## 5. Screens

| Call | Resolves `"completed"` when |
| --- | --- |
| `present.login()` | The user logs in. The result carries `user`. Already logged in, it resolves at once and shows nothing |
| `present.demographics()` | The form closes. That does not promise the user filled it in: try your call again to find out |
| `present.kyc()` | The identity check closes. Same caveat |
| `present.locationGrant()` | The user shares their location |
| `present.addFunds()` | The deposit goes through. It can also resolve `"failed"`. See [Add Funds](#add-funds) |
| `present.withdraw()`, `present.profile()`, `present.wallet()` | Never. They resolve `"dismissed"` when closed |

- **Where it shows.** Without `container`, a screen covers the whole page. With `container`, it
  fills that element. Lucra is hidden before a screen shows and after it ends.
- **Container rules.** Use an empty element with a real height (`height`, not only
  `min-height`, or a flex or grid item that stretches). It must be in the page when you create
  the client and stay there: removed, calls time out and an open screen keeps waiting; moved,
  Lucra reloads and an open screen is not shown again. Call `lucra.destroy()` before you remove
  it.
- **The SDK draws no close control.** A screen ends with Lucra's own exit control,
  `lucra.present.dismiss()`, another `present.*` call replacing it, the user logging out inside
  it, `lucra.destroy()`, or by completing. All but completing resolve `{ status: "dismissed" }`.
- **Prefer a container with your own close.** During the preview some Lucra screens have no exit
  control yet. Full screen covers your whole page, so your UI cannot offer a way out. Show
  screens in a `container`, with your own close button beside it that calls
  `lucra.present.dismiss()`.
- `login({ phoneNumber })` fills in the form. `phoneNumber` must be exactly 10 digits: omit it
  when you have none, since `""` rejects with `INVALID_ARGUMENT`.
- Showing the login screen restarts Lucra. Reads still waiting reject with `CONNECTION_RESET` and
  are safe to repeat. If Lucra cannot start again while any screen shows, the screen closes and
  rejects with `CONNECTION_FAILED` or `CONNECTION_TIMEOUT`.

### Add Funds

- Call `lucra.present.addFunds()` directly inside a click handler, with no `await` before it.
  Browsers only allow a new window during the click. Otherwise it rejects with `POPUP_BLOCKED`.
- It opens its own window. It resolves `{ status: "completed", message }`,
  `{ status: "failed", message }`, or `{ status: "dismissed" }` when closed without finishing. Calling it
  again while the window is open returns the same result. `dismiss()` does not close it.
- `message` is text from Lucra: show it as text, never as HTML. Read the new balance from
  `lucra.auth`.

## 6. Games You Play

- **Create:** `lucra.matchups.create({ gameTypeId, atStake: { type: "CASH", amount }, playStyle })`
  with `playStyle` set to `"GROUP_VS_GROUP"` or `"FREE_FOR_ALL"`. Cash is the only stake it
  takes. Bad input rejects with `INVALID_AT_STAKE`, `INVALID_REWARD_TYPE`, or
  `INVALID_PLAY_STYLE`, and `message` names the field.
- **Accept:** check `matchup.playStyle` first. For `"GROUP_VS_GROUP"`, call
  `lucra.matchups.accept(matchupId, { groupId })` with `groupId` set to one of the matchup's
  `participantGroups[].id`, picked by the user. For `"FREE_FOR_ALL"`, call
  `lucra.matchups.accept(matchupId)` and omit `groupId`. Never pass `groupId: ""`: any string is
  sent as a group join.
- **Cancel:** `lucra.matchups.cancel(matchupId)` resolves `{ matchupId }`. Only the creator can
  cancel. Anyone else gets `NOT_ALLOWED`.
- Create and accept resolve `{ matchupId, matchup }`. `matchup: null` means the write succeeded
  and only the read after it failed: keep `matchupId`, read it with `lucra.matchups.get()`, and
  do not write again.
- **Live updates:** `lucra.matchups.watch(matchupId, { onUpdate, onError })` returns `{ stop }`.
  It watches one matchup at a time: a watch on another matchup replaces it, and the old one gets
  `onError` with `CANCELLED`.
- Matchup data names other users, and `lucra.auth` holds the user's own personal details. Do not
  log either or send it to analytics.

Field meanings are in [Games You Play Headless](../../2.2_gyp_headless.md) and
[Tournaments Headless](../../2.1_tournaments_headless.md). Use them for the data shapes only:
their calls are `LucraClient` calls.

## 7. React

- **Read auth with `useSyncExternalStore`:**
  `useSyncExternalStore((onChange) => lucra.auth.subscribe(onChange), () => lucra.auth.getState())`.
  Keep the arrow functions: `subscribe` and `getState` are typed as methods, so the
  `@typescript-eslint/unbound-method` lint rule flags passing them bare.
- **Create the client at module scope or in a click handler**, not during render.
- **With a container:** keep the element rendered, and create the client in the click handler
  from `ref.current`: by then the element is in the page. Keep the client in a ref and destroy it
  in a `useLayoutEffect` cleanup of the component that renders the element. A `useEffect`
  cleanup runs after React has removed the element.
- **StrictMode** runs effects twice in development. That is safe: the same config and container
  return the same client, and a destroyed client can be created again.
- **Start writes from event handlers**, not effects. An effect that runs twice sends the write
  once, and the second call rejects with `IN_PROGRESS`.
- **Add Funds:** call `lucra.present.addFunds()` first in `onClick`, before any `await`.

## Troubleshooting

| Code or symptom | Cause | Fix |
| --- | --- | --- |
| `INVALID_CONFIG` thrown by `createLucraClient` | A missing field, an `env` not in the list, a `tenantId` that does not form a Lucra address, a `container` that is not an element in the page, or a different config while a client exists | Fix the config, or `destroy()` the existing client first |
| `CONNECTION_FAILED` | Lucra refused the config | Check `apiKey`, `tenantId`, and `env` together |
| `CONNECTION_TIMEOUT` | Lucra did not start within 30 seconds. Usually a `Content-Security-Policy` that does not allow your Lucra address under `frame-src`, or a Lucra address that does not load | Allow `https://<tenantId>.<env>.lucrasports.com` under `frame-src`, or `https://<tenantId>.lucrasports.com` in production, with `tenantId` in lowercase. Only that call gave up: the client keeps trying |
| `lucra.auth` stays `"loading"` | The client never connected | `await lucra.whenConnected()` to get the reason |
| `NOT_LOGGED_IN` | Nobody is logged in | `await lucra.present.login()`, then try again if it resolves `"completed"` |
| `IN_PROGRESS` | Another write is pending | Wait for it. If your app had none pending, Lucra is still running an earlier one: read back before retrying |
| `SCREEN_OPEN` | A write while a screen shows or is opening | Await the screen's result first |
| `POPUP_BLOCKED` | `addFunds()` ran outside the click | Call it directly in the click handler, with no `await` before it |
| `TIMEOUT` | Lucra did not answer within 15 seconds | A write has `outcomeUnknown: true`: read back before retrying. A read is safe to repeat. The message `"Lucra did not finish signing the user in"` means Lucra reported a user it never confirmed |
| `CONNECTION_RESET` | Lucra restarted while the call waited, for example for `present.login()` | Repeat a read. Read back after a write |
| `UNSUPPORTED_ENVIRONMENT` | Created with no browser, for example during server rendering | Create it in browser code |
| Old behavior after installing a new preview build | The dev server's dependency cache still serves the old build, because the version number does not change | Restart the dev server with its dependency cache cleared (for Vite, `--force`) |

## Reference

- [Setup](../../3.0_headless_client.md#setup), [Who is logged in](../../3.0_headless_client.md#who-is-logged-in), [Reading data](../../3.0_headless_client.md#reading-data)
- [Showing a Lucra screen](../../3.0_headless_client.md#showing-a-lucra-screen), [In your own container](../../3.0_headless_client.md#in-your-own-container), [Add Funds](../../3.0_headless_client.md#add-funds)
- [Watching a matchup](../../3.0_headless_client.md#watching-a-matchup), [Events](../../3.0_headless_client.md#events), [Cleaning up](../../3.0_headless_client.md#cleaning-up)
- [Limits of the preview](../../3.0_headless_client.md#limits-of-the-preview), [Coming from LucraClient](../../3.0_headless_client.md#coming-from-lucraclient)
