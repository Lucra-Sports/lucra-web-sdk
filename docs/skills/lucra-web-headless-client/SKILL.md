---
name: lucra-web-headless-client
description: >
  Use for any work with Lucra's preview headless client: code that imports createLucraClient
  from lucra-web-sdk/headless, uses its client (lucra.auth, lucra.tournaments, lucra.matchups,
  lucra.present, LucraError), or migrates LucraClient code to it. Covers the preview status,
  setup and config, how calls wait and fail, showing Lucra screens full screen, as a modal or
  sheet, or in your own container, Add Funds, Games You Play create, accept, and cancel, React usage, and
  troubleshooting codes such as INVALID_CONFIG, CONNECTION_TIMEOUT, NOT_LOGGED_IN, IN_PROGRESS,
  SCREEN_OPEN, POPUP_BLOCKED, and TIMEOUT. Not for LucraClient (LucraClient.initialize,
  client.open, client.ready, client.api.*): load lucra-web-starting-point or lucra-web-headless
  for that.
---

# Lucra Web: Headless Client (preview)

> **Portability:** all relative links in this skill (e.g. `../../3.0_headless_client.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`,
> at the tag or commit you install the SDK from. If this file is not sitting inside that docs
> folder (e.g. it was installed as a standalone agent skill), clone the public repo (shallow is
> fine) and resolve links there. Use only these published docs, never private Lucra checkouts
> that may exist elsewhere on the machine.

This skill is the mental model for the preview headless client, `createLucraClient` from
`lucra-web-sdk/headless`. The reference is
[Headless client (preview)](../../3.0_headless_client.md). For a new integration, use
`LucraClient` unless the user asks for the preview headless client. This skill stands alone: do
not load the `LucraClient` skills or reuse `LucraClient` patterns (`initialize`, `open()`,
`ready`, `dialog()`, `client.api.*`). To migrate, follow
[Coming from LucraClient](../../3.0_headless_client.md#coming-from-lucraclient) and remove every
`LucraClient` call: the two cannot share a page. `LucraClient`, the root `lucra-web-sdk` export,
is unchanged by the preview.

## 1. It is a preview

- Its API can still change while it is a preview.
- The SDK is not on npm. Install it from GitHub, pinned to a tag or commit that includes
  `lucra-web-sdk/headless`: `"lucra-web-sdk": "github:Lucra-Sports/lucra-web-sdk#<tag or commit>"`.
- Before building, ask your Lucra contact to confirm your Lucra environment supports the
  headless client.

## 2. Mental model

- **Create once, then call.** `createLucraClient(config)` returns at once and connects in the
  background. There is no `ready` and no init event: every call waits for Lucra on its own.
- **Do not gate calls on auth.** A call that needs a user waits out `"loading"`, then rejects
  with `NOT_LOGGED_IN` if nobody is logged in. `auth.updateUser()` is the exception: gate it on
  `"loggedIn"`.
- **Lucra stays hidden until `lucra.present.*`.** Everything else returns data for your own UI.
- **Prefer a container with your own close button.** Some Lucra screens have no exit control
  yet. Without a container, a screen covers or dims your page (full screen, modal, or sheet), so
  one without an exit leaves the user no way out. Show screens in a `container`, next to your
  own close button that calls `lucra.present.dismiss()`.
- **Every failure is a `LucraError`.** For a change the user started, prefer
  `lucra.withRemediation()`, unless the app handles these steps itself: Lucra shows what the user
  needs, then the call runs again. Pass it one Lucra call. What still rejects goes to your own UI.
  `outcomeUnknown: true` means a write may have gone through: never retry it automatically,
  read back first.
- **One write at a time, and none while a `present.*` call is pending** (Add Funds aside). A
  refused write sends nothing, so a double click cannot send it twice.
- **`present.addFunds()` runs first in a click handler**, with no `await` before it. Never call
  it from a `catch` or an effect.

## 3. Setup

`import { createLucraClient, isLucraError } from "lucra-web-sdk/headless";`

| Option | Notes |
| --- | --- |
| `apiKey` | Required |
| `tenantId` | Required. Must form a Lucra address: `https://<tenantId>.<env>.lucrasports.com`, or `https://<tenantId>.lucrasports.com` in production |
| `env` | Required. `"sandbox"` or `"production"`, or another environment your Lucra contact names. Any other value throws `INVALID_CONFIG` |
| `locationId` | Optional |
| `autoJoin` | Optional, defaults to `true`. See [autoJoin](../../1.2_initialize_client.md#autojoin) |
| `container` | Optional element that Lucra screens show inside. See [section 6](#6-screens) |
| `presentation` | Optional. `"fullScreen"` (default), `"modal"`, or `"sheet"`: how screens show without a `container`. Not allowed with `container`. See [section 6](#6-screens) |

- `createLucraClient` **throws `INVALID_CONFIG` synchronously**, before it adds anything to the
  page, for a missing `apiKey`, `tenantId`, or `env`, an unknown `env`, a `tenantId` that does
  not form a Lucra address, a `container` that is not an element in the page, an unknown
  `presentation` or one passed with `container`, or a different config while a client exists.
- The same config and the same container return the same client, so hot reload, repeated
  imports, and repeated calls are safe. An omitted `autoJoin` counts as `true`, and an omitted
  `presentation` as `"fullScreen"`.
- To change the config or the container, call `lucra.destroy()`, then create it again.
- Where there is no browser (server rendering) it returns an inert client whose calls reject
  with `UNSUPPORTED_ENVIRONMENT`. Create it in browser code.

**Checkpoint:** `await lucra.whenConnected()` resolves. It rejects with the reason, for example
`CONNECTION_FAILED`. Then `await lucra.tournaments.list()` returns an array. Neither needs a
login.

## 4. Auth

`lucra.auth.getState()` returns `{ status, user }`:

| `status` | Meaning |
| --- | --- |
| `"loading"` | Lucra has not answered yet, a logout is pending, or Lucra reported a user and has not finished signing them in. It never leaves `"loading"` if the client cannot connect |
| `"loggedOut"` | Nobody is logged in |
| `"loggedIn"` | Lucra confirmed the login, so calls that need a user will work. `user` can still be `null` for a moment. `user.balance` stays current |

- `lucra.auth.subscribe(listener)` calls the listener now, then on every change, and returns a
  function that stops it. `getState()` returns the same object until something changes.
- `await lucra.auth.isLoggedIn()` waits out `"loading"`, then resolves `true` or `false`. It
  rejects with `TIMEOUT`, `DESTROYED`, or the connection error.
- `await lucra.auth.logout()` signs the user out of Lucra. Call it when your user signs out of
  your app. `lucra.destroy()` does not sign anyone out.

| Works logged out | Needs a logged in user |
| --- | --- |
| `tournaments.list()`, `matchups.get()`, `matchups.getDetails()`, `matchups.watch()`, `present.login()` | `tournaments.get()`, `tournaments.leaderboard()`, `matchups.searchByMetadata()`, `matchups.list()`, `matchups.listByTypeStatus()`, `achievements.list()`, `achievements.markViewed()`, `auth.updateUser()`, `rewards.list()`, every write, every other `present.*` screen |

`present.addFunds()` cannot wait out `"loading"`, so it rejects with `NOT_LOGGED_IN` only when
the status is already `"loggedOut"`. `auth.updateUser()` does not wait either, and rejects with
`NOT_LOGGED_IN` unless the status is already `"loggedIn"`.

**Checkpoint:** after `await lucra.present.login()` resolves `"completed"`,
`getState().status` is `"loggedIn"` and `lucra.tournaments.get(tournamentId)` resolves.

## 5. Writes and errors

Writes are what the guide calls changes
([Changing things](../../3.0_headless_client.md#changing-things)): `tournaments.join()`,
`tournaments.autoJoin()`, `matchups.create()`, `matchups.accept()`, `matchups.cancel()`,
`rewards.claim()`, and `achievements.claim()`.

- **One at a time, of any kind.** While one is pending, another rejects with `IN_PROGRESS`.
  Disable the button while a call is pending.
- **Not while a screen shows or is opening.** From the moment you call a `present.*` screen
  (any but `addFunds()`) until its promise settles, writes reject with `SCREEN_OPEN`. Await the
  screen's result before the next write. A screen asked for while a write is pending waits for
  that write to finish.

**Prefer `lucra.withRemediation()` for a change the user started**, unless the app handles these
steps itself. When the call fails with something the user can fix in Lucra, Lucra shows what the
user needs, then the call runs again. It resolves with the call's result, or rejects with the
error the call failed with, usually a `LucraError`, for your own UI. If the user leaves without
finishing, it rejects with a `LucraError`.

**Pass a function that makes one Lucra call.** Everything in it may run again, possibly more
than once, so a second call in it would be repeated.

```typescript
const result = await lucra.withRemediation(() => lucra.tournaments.join(tournamentId));
```

- What Lucra shows can change between releases.
- The promise stays pending while the user is in a Lucra screen. Keep the button disabled.
- Some errors still reach you, such as `INSUFFICIENT_FUNDS` today. For that one, offer your own
  button that calls `lucra.present.addFunds()`.
- A call whose outcome is unknown is never run again.
- `lucra.present.dismiss()` ends a fix that is showing, and the call then rejects.
- Run one `lucra.withRemediation()` at a time: a second one that needs a screen takes the first
  one's place.
- Close your own modal dialogs first: a Lucra screen under one cannot be reached.
- It also works for a read that needs a logged in user.
- To handle it yourself instead, show `lucra.present[error.remediation]()` and decide when to
  try again.

Check with `isLucraError(error)`.

- **`message` is for the user.** `source` says who raised the error: `"sdk"` when the SDK raised
  it (timeouts, connection problems, `NOT_LOGGED_IN`, `IN_PROGRESS`, `SCREEN_OPEN`, and so on),
  and its `message` is written for end users; `"lucra"` when Lucra reported it for the call, and
  `message` is then Lucra's own text. `API_ERROR` is a catch-all, so its text can be technical.
  `hint` is guidance for the developer: log it, never show it. It is always `null` for
  `source: "lucra"`.

- **`remediation`** names the `lucra.present` call that fixes it, for when you handle it
  yourself instead of with `lucra.withRemediation()`. Try the call again once if it resolves
  `"completed"`, and send a second failure to your own UI: for `demographics()` and `kyc()`,
  `"completed"` only means the screen closed. `"addFunds"` needs a click, so show your own Add
  Funds button instead of calling it from a `catch`.
- **`outcomeUnknown: true` means read back before retrying.** It is set on some failures of a
  write already sent to Lucra, such as a `TIMEOUT` or a `CONNECTION_RESET`. Branch on the flag,
  not on `code`. Never retry it automatically: read the matchup (or `claimedAt` after a claim),
  or ask the user. A second create makes a second matchup with a second buy in. Reads never set
  it and are safe to repeat. One caveat: `rewards.list()` marks unviewed rewards as viewed, so a
  repeat with `viewed: false` may not return them again. `achievements.markViewed()` changes
  state but is not a write: it is safe to repeat and never sets it. The same goes for
  `auth.updateUser()`, which also works while a screen shows. The SDK does not send it again
  after a restart, so on `CONNECTION_RESET` call it again.
- **A read waiting when Lucra restarts is sent again once by the SDK**, within the same 15
  seconds. Do not repeat it yourself. So `CONNECTION_RESET` mostly means a write: read back
  before you try again. A read gets it only when a second restart interrupts it.
  `auth.updateUser()` is the exception above.

Every code: [Errors](../../3.0_headless_client.md#errors).

## 6. Screens

| Call | Resolves `"completed"` when |
| --- | --- |
| `present.login()` | The user logs in. The result carries `user`. Already logged in, it resolves at once and shows nothing |
| `present.demographics()` | The form closes. That does not promise the user filled it in: try your call again to find out |
| `present.kyc()` | The identity check closes. Same caveat |
| `present.locationGrant()` | The user shares their location |
| `present.addFunds()` | The deposit goes through. It can also resolve `"failed"`, `"dismissed"`, or `"alreadyOpen"`. See [Add Funds](#add-funds) |
| `present.withdraw()`, `present.profile()`, `present.wallet()` | Never. They resolve `"dismissed"` when closed |
| `present.minigame(input)` | The game closes itself. See [Minigames](#minigames) |

- **Where it shows.** Without `container`, a screen covers the whole page. With
  `presentation: "modal"` it is a panel up to 430 by 800px in the middle of the dimmed page, and
  with `"sheet"` a panel up to 430px wide at the right edge. Under 640px wide a modal covers the
  page and a sheet comes up from the bottom, leaving 96px of the page above it. The dimmed page
  takes no clicks, and neither a click on it nor Escape closes the screen. With `container`, it
  fills that element. Lucra is hidden before a screen shows and after it ends. See
  [As a modal or a sheet](../../3.0_headless_client.md#as-a-modal-or-a-sheet).
- **Container rules.** Use an empty element with a real height (`height`, not only
  `min-height`, or a flex or grid item that stretches). It must be in the page when you create
  the client and stay there: removed, calls time out and an open screen keeps waiting; moved,
  Lucra reloads and an open screen is not shown again. Call `lucra.destroy()` before you remove
  it.
- **Show your own wrapper from state, not by wrapping calls.** `lucra.present.getState()` returns
  `{ screen }`, the `LucraScreen` on show, `"minigame"` while a game shows, or `null`, and
  `lucra.present.subscribe(listener)` calls the listener now and on every change. They behave
  like `lucra.auth.getState()` and `subscribe()`. `screen` is set only while a screen is on
  show: not while it waits to connect, for a login, or for a write, and never for Add Funds. A
  replacement goes to `null` and then to the new screen, in the same task when nothing has to
  wait. Do not count open screens.
- **The SDK draws no close control.** A screen ends with Lucra's own exit control,
  `lucra.present.dismiss()`, another `present.*` call other than `addFunds()` replacing it, the
  user logging out inside it, `lucra.destroy()`, its own `signal` being aborted, Lucra
  restarting while a game shows, or by completing. All but completing resolve
  `{ status: "dismissed", reason }`, where `reason` is `"exit"`, `"dismissed"`, `"replaced"`,
  `"loggedOut"`, `"destroyed"`, `"aborted"`, or `"restarted"`. Assume any screen may lack
  Lucra's exit control.
- **Tie a screen to a route or component with `signal`.** Every screen takes
  `{ signal?: AbortSignal }`. Abort it in that route's or component's cleanup: it closes only the
  screen that call opened, and does nothing once the call has finished or another screen
  replaced it. `lucra.present.dismiss()` closes whatever screen shows, so it is wrong for that
  cleanup. A signal aborted already resolves `"aborted"` at once and shows nothing. A value
  that is not an `AbortSignal` rejects with `INVALID_ARGUMENT` and leaves any screen alone.
- `login({ phoneNumber, signal })` fills in the form. `phoneNumber` must be exactly 10 digits:
  omit it when you have none, since `""` rejects with `INVALID_ARGUMENT`. That error's `message`,
  "The phone number must be 10 digits", is safe to show next to a number the user typed.
- Showing the login screen restarts Lucra. Calls still waiting follow the restart rule in
  Errors above. If Lucra cannot start again while any screen shows, the screen closes and
  rejects with `CONNECTION_FAILED` or `CONNECTION_TIMEOUT`. A game closes on any restart, with
  `"restarted"`.
- **Events:** `lucra.on(event, listener)` reports what the user did inside a Lucra screen, for
  example `matchupCreated`. It never fires for your own calls: the resolved promise is your
  signal.

**Checkpoint:** `lucra.present.profile()` fills your container, and your close button resolves it
`{ status: "dismissed", reason: "dismissed" }`. Lucra's screens run on Lucra's own site, so an
automated or agent driven browser cannot click or type in them. Verify through promise results
and `lucra.auth`, and have a human run login and Add Funds.

### Add Funds

- Browsers only allow a new window during the click that asked for it, so a call anywhere but
  first in a click handler rejects with `POPUP_BLOCKED`.
- It opens its own window. It resolves `{ status: "completed", message }`,
  `{ status: "failed", message }`, or `{ status: "dismissed" }` when closed without finishing.
- Calling it again while the window is open tries to bring the window to the front (browsers
  may ignore it) and resolves `{ status: "alreadyOpen" }` at once. Only the first call reports
  the deposit, so show a success message from that call alone. If the user just closed the
  window, the first call resolves `"dismissed"` and a new window opens. `dismiss()` does not
  close the window.
- `message` is text from Lucra: show it as text, never as HTML. Read the new balance from
  `lucra.auth`.

### Minigames

- `lucra.present.minigame({ gameId, mode, amount, matchupId, signal })` starts a minigame
  session, and Lucra shows the game in its own frame. `mode` is `"practice"`, `"1v1"`,
  `"free_for_all"`, or `"tournament"`. Before it sends anything, the SDK checks the
  shape and types: `gameId`, `mode`, an `amount` that is a number of 0 or more, a non empty
  `matchupId` that is present for tournament mode and absent for the others, and `signal`. A
  failed check rejects with `INVALID_ARGUMENT`. Lucra checks the rest, such as whether the amount
  is one of the game's wager amounts, and refuses with one of the codes below, for example
  `INVALID_AT_STAKE`. Nothing shows until the game has started.
- **Tournament mode joins the tournament and takes its buy in. Never also call
  `lucra.tournaments.join()` for that play: the user would pay twice.** `matchupId` is the
  tournament id, required for `"tournament"` and refused with any other mode.
- `"practice"` has no stake. `"1v1"` and `"free_for_all"` need an `amount` above 0 that is one
  of the game's wager amounts. Tournament ignores `amount`.
- A refusal can carry `INSUFFICIENT_FUNDS`, `UNVERIFIED`, `DEMOGRAPHIC_INFORMATION_MISSING`,
  `LOCATION_NEEDED`, `INVALID_AT_STAKE`, `INVALID_PLAY_STYLE`, or `NOT_ALLOWED`.
- It resolves `{ status: "completed", sessionId, matchupId }` when the game closes itself. That
  does not mean the user won: for a paid game, read `lucra.matchups.get(matchupId)`. Any other
  close resolves `"dismissed"` with `reason`, `"restarted"` when Lucra restarted while it
  showed, and the same ids, which are `null` when no session was started.
- **Starting is a change that needs a logged in user**, and works inside
  `lucra.withRemediation()`. An error with `outcomeUnknown: true` means a game may have started
  and a stake may have been placed (in tournament mode, the buy in may be taken): unless Lucra restarted, which removes the game itself, the SDK sends Lucra home so the game does not keep running.
  Read `lucra.matchups.list()` before you try again. Never retry automatically.
- Dismissing it while the game starts waits for Lucra's answer, then resolves `"dismissed"`
  with the ids if the game started. The game never shows.
- It needs a Lucra environment that answers it. Until then, it rejects with `TIMEOUT`, which
  has `outcomeUnknown: true` although nothing started, and `dismiss()` cannot end it early.

## 7. Games You Play

- **Create:** `lucra.matchups.create(input)`, where `input` is
  `{ gameTypeId, atStake: { type: "CASH", amount }, playStyle }` and `playStyle` is
  `"GROUP_VS_GROUP"` or `"FREE_FOR_ALL"`. Cash is the only stake it takes. Bad input rejects
  with `INVALID_AT_STAKE`, `INVALID_REWARD_TYPE`, or `INVALID_PLAY_STYLE`, and `message` names
  the field. A missing `gameTypeId` rejects with `API_ERROR`, message
  `"gameTypeId is required"`, and `outcomeUnknown: false`.
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
  `onError` with `CANCELLED`. Never call `watch()` once per card in a list: only the last one
  stays live.
- Matchup data names other users, and `lucra.auth` holds the user's own personal details. Do not
  log either or send it to analytics.

Field meanings are in [Games You Play Headless](../../2.2_gyp_headless.md) and
[Tournaments Headless](../../2.1_tournaments_headless.md). Use them for the data shapes only:
their calls are `LucraClient` calls.

## 8. React

- **Read auth with `useSyncExternalStore`.** For a client created at module scope, define these
  at module scope too:
  `const subscribeAuth = (onChange: () => void) => lucra.auth.subscribe(onChange);` and
  `const getAuth = () => lucra.auth.getState();`. Then call
  `useSyncExternalStore(subscribeAuth, getAuth, getAuth)`, where the third argument serves server
  rendering and hydration. Keep the wrappers: `subscribe` and `getState` are typed as methods,
  so the `@typescript-eslint/unbound-method` lint rule flags passing them bare.
- **Read the screen on show the same way**, with module scope wrappers around
  `lucra.present.subscribe` and `lucra.present.getState`. Show your wrapper while `screen` is not
  `null`.
- **Tie a screen to a component with `signal`**: create an `AbortController` in the effect that
  calls `lucra.present.*`, and abort it in the cleanup.
- **Where to create the client.** Without a container, at module scope. With one, once the
  element is in the page, for example in a `useLayoutEffect` that reads `ref.current`. Never
  during render. Keep the client in a ref, and in that effect's cleanup call `destroy()` and set
  the ref to `null`, since Fast Refresh reruns layout effects. Do not use a `useEffect` cleanup:
  it runs after React has removed the element.
- **StrictMode** runs effects twice in development. That is safe: the same config and container
  return the same client, and a destroyed client can be created again.
- **Start writes from event handlers**, not effects. An effect that runs twice sends the write
  once, and the second call rejects with `IN_PROGRESS`.

## Troubleshooting

| Code or symptom | Cause | Fix |
| --- | --- | --- |
| `INVALID_CONFIG` thrown by `createLucraClient`, or `INVALID_ARGUMENT` | A config or argument it refuses. See [section 3](#3-setup). `message` is usually generic | Read `error.hint`, which `createLucraClient` also logs to the console. Fix the config or argument, or `destroy()` the existing client first |
| `CONNECTION_FAILED` | Lucra refused the config | Check `apiKey`, `tenantId`, and `env` together |
| `CONNECTION_TIMEOUT` | Lucra did not start within 30 seconds. Usually a `Content-Security-Policy` that does not allow your Lucra address under `frame-src`, or a Lucra address that does not load | Allow `https://<tenantId>.<env>.lucrasports.com` under `frame-src`, or `https://<tenantId>.lucrasports.com` in production, with `tenantId` in lowercase. Only that call gave up: the client keeps waiting |
| `lucra.auth` stays `"loading"` | The client never connected, or Lucra reported a user it never confirmed. In the second case calls that need a user reject with `TIMEOUT` | `await lucra.whenConnected()` to get the connection error |
| `IN_PROGRESS` | Another write is pending | Wait for it. If your app had none pending, Lucra is still running an earlier one: read back before retrying |
| `SCREEN_OPEN` | A write while a screen shows or is opening | Await the screen's result first |
| `POPUP_BLOCKED` | `addFunds()` ran outside the click | Call it first in the click handler, with no `await` before it |
| `TIMEOUT` | Lucra did not answer, or did not confirm a login, within 15 seconds | Check `outcomeUnknown`: when `true`, read back before retrying. A read is safe to repeat. A `hint` that says Lucra did not finish signing them in means Lucra reported a user it never confirmed, and nothing was sent |
| `CONNECTION_RESET` | Lucra restarted while the call waited. A read gets it only after a second restart | Read back after a write |
| `UNSUPPORTED_ENVIRONMENT` | Created with no browser, for example during server rendering | Create it in browser code |
| `onError` called with `CANCELLED` | A watch on another matchup replaced this one | Watch one matchup at a time |
| The user is stuck on a Lucra screen shown without a container | That screen has no exit control, and without a container it covers or dims your page (full screen, modal, or sheet) | Show screens in a `container` with your own close button that calls `lucra.present.dismiss()` |
| A screen does not fill your container | The container has only `min-height`. A screen takes 100% of its `height` | Give it a `height`, or make it a flex or grid item that stretches |
| `lucra.on(...)` never fires after your call | Events report what the user did inside a Lucra screen, never your own calls | Use the resolved promise |
| `lucra-web-sdk/headless` cannot be resolved | The installed tag or commit predates the headless client, or the bundler does not read the `exports` field (webpack 4, for example) | Pin a tag or commit that includes it. For the bundler, alias `lucra-web-sdk/headless` to `lucra-web-sdk/dist/headless/index.js` |
| Old behavior after installing a new preview build | The dev server still serves its cached copy of the old build | Restart the dev server with its dependency cache cleared (for Vite, `--force`, or delete `node_modules/.vite`) |

## Reference

- [Setup](../../3.0_headless_client.md#setup)
- [Who is logged in](../../3.0_headless_client.md#who-is-logged-in)
- [Reading data](../../3.0_headless_client.md#reading-data)
- [Showing a Lucra screen](../../3.0_headless_client.md#showing-a-lucra-screen)
- [In your own container](../../3.0_headless_client.md#in-your-own-container)
- [Add Funds](../../3.0_headless_client.md#add-funds)
- [Watching a matchup](../../3.0_headless_client.md#watching-a-matchup)
- [Events](../../3.0_headless_client.md#events)
- [Cleaning up](../../3.0_headless_client.md#cleaning-up)
- [Limits of the preview](../../3.0_headless_client.md#limits-of-the-preview)
