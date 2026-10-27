# CHANGELOG

## [Unreleased]

### Changed

- Docs: [Initializing the LucraClient](1.2_initialize_client.md#when-your-user-signs-out) now says to call `client.logout()` when your user signs out of your app. `destroy()`, which the guide used to suggest on logout, does not sign the user out of Lucra, so the next user on that device opened Lucra as the previous one. [Headless on Web](2.0_headless.md#lifecycle-and-gating) lists `client.logout()`. No API change.

## [v1.15.0]

### Added

- `SDK_VERSION`, the running SDK version, exported from the package entry point so an integration can log which SDK it ships. Every Lucra iframe URL now carries it as an `sdkVersion` query param, which the Lucra app attaches to its error reports, so a support request can be matched to the SDK version that produced it. Additive: no breaking API change.
- Docs: [If initialization fails, stop](1.2_initialize_client.md#if-initialization-fails-stop), which covers treating `initialized` `{ success: false }` as a configuration error and checking that the web key, `tenantId`, and backend key come from one tenant and environment. Headless deposit examples now open `popup().deposit()` from a click handler. The starting-point skill adds a "Before you call it done" self-test and says to use only `LucraClient` for events. No API change.

## [v1.14.0]

### Added

- `LucraApiErrorCode` members for recreational game matchups: `notAllowed` (`NOT_ALLOWED`), rejected when the user or the matchup's state does not permit the action, and `invalidAtStake` (`INVALID_AT_STAKE`), `invalidRewardType` (`INVALID_REWARD_TYPE`), `invalidPlayStyle` (`INVALID_PLAY_STYLE`), rejected when create input fails validation. All four are terminal: show `message`, do not retry. See [Headless on Web: Errors](2.0_headless.md#lucraapierror-by-code).
- Request correlation: every `api.*` request carries a `requestId` that the Lucra app echoes on its response, so each call settles with its own response. No API change. See [API functions](2.0_headless.md#api-functions).
- A failed read (`api.achievements/tournaments/tournament/tournamentLeaderboard`) now rejects with a typed `LucraApiError` (`API_ERROR`, `message` carries the detail) instead of the 15s `"Timeout"`. See [Headless on Web: Errors](2.0_headless.md#lucraapierror-by-code).
- `api.matchup(matchupId)`, which resolves with a Games You Play (recreational game) matchup as a `LucraMatchup` (status, play style, game, stake, participant group ids), with the new exported types `LucraMatchup`, `LucraMatchupStatus`, `LucraPlayStyle`, `LucraAtStake`, `LucraRecreationalGame`, and `LucraMatchupParticipantGroup`. Works before login: like `api.tournaments()`, it awaits initialization internally. An unknown id rejects with `LucraApiError` (`API_ERROR`, `"Recreational game matchup not found"`). See [Games You Play Headless](2.2_gyp_headless.md#reading-a-matchup).
- `api.matchupDetails(matchupId)`, which resolves with a Games You Play matchup's `LucraMatchupDetails`: the `LucraMatchup`, every group with its standing, score, and participants (including what each user receives if their group wins), and per-player scores ordered by place. Adds the exported types `LucraMatchupDetails`, `LucraMatchupGroup`, `LucraMatchupParticipant`, and `LucraMatchupParticipantScore`. Works before login and rejects an unknown id like `api.matchup`. Participant fields are other users' data: do not log them. See [Games You Play Headless](2.2_gyp_headless.md#matchup-details).
- `api.subscribeToMatchupDetails(matchupId)`, which resolves with a Games You Play matchup's current `LucraMatchupDetails` and then delivers each change as a `matchupDetailsUpdated` event (typed in `LucraEventMap`), and `api.cancelMatchupDetailsSubscription()`, which stops it and never throws. One subscription at a time: subscribing again replaces it, and a pending subscribe rejects with a benign `"Cancelled by ..."` string when replaced or cancelled. Works before login, ends on `close()`, and resubscribes on its own after an iframe reload. See [Games You Play Headless](2.2_gyp_headless.md#live-details).
- `api.createRecreationalGame(input)`, which creates a Games You Play matchup for the logged-in user and resolves with `{ matchupId, matchup }`, with the new exported types `LucraCreateRecreationalGameInput`, `LucraCashStake`, and `LucraRecreationalGameResult`. The stake is cash only: `atStake` is `{ type: "CASH", amount }`, and any other type rejects with `INVALID_REWARD_TYPE`. `matchup` is `null` when the read after a successful create failed: the matchup exists, do not retry. Needs a login (call after `await client.ready`) and has the standard 15s timeout. While one create is pending, a second call rejects at once with `NOT_ALLOWED` (`"Another createRecreationalGame request is already in progress"`) and posts nothing, so disable your create button while a call is pending. `"Timeout"` and most `API_ERROR`s mean the outcome is unknown ([Games You Play Headless](2.2_gyp_headless.md#write-outcomes-definite-or-unknown) lists the definite ones): never retry automatically. No headless call lists a user's matchups, so ask the user before creating again. The buy-in prechecks run funds (cash), then demographics (always required), then location, with no KYC check. Rejects with `LucraApiError` (`INSUFFICIENT_FUNDS`, `DEMOGRAPHIC_INFORMATION_MISSING`, `LOCATION_NEEDED`, `LOCATION_ERROR`, `NOT_ALLOWED`, `INVALID_*`, `API_ERROR`). See [Games You Play Headless](2.2_gyp_headless.md#creating-a-game).
- `api.acceptVersusRecreationalGame(matchupId, teamId)`, which joins the logged-in user to one team of a Games You Play versus matchup and resolves with `{ matchupId, matchup }` (`LucraRecreationalGameResult`). `teamId` comes from `matchup.participantGroups[].id` or `details.groups[].id`. `matchup` is `null` when the read after a successful accept failed: the user joined, do not retry. Needs a login (call after `await client.ready`) and has the standard 15s timeout. While one accept is pending, a second call rejects at once with `NOT_ALLOWED` (`"Another acceptRecreationalGame request is already in progress"`) and posts nothing. `"Timeout"` and most `API_ERROR`s mean the outcome is unknown ([Games You Play Headless](2.2_gyp_headless.md#write-outcomes-definite-or-unknown) lists the definite ones): never retry automatically, read the matchup first. The buy-in prechecks match create: funds (cash), then demographics (always required), then location, with no KYC check. Rejects with `LucraApiError` (`INSUFFICIENT_FUNDS`, `DEMOGRAPHIC_INFORMATION_MISSING`, `LOCATION_NEEDED`, `LOCATION_ERROR`, `NOT_ALLOWED`, `API_ERROR`). See [Games You Play Headless](2.2_gyp_headless.md#accepting-a-versus-game).
- `api.acceptFreeForAllRecreationalGame(matchupId)`, which joins the logged-in user to a Games You Play free-for-all matchup and resolves with `{ matchupId, matchup }` (`LucraRecreationalGameResult`). It has no team argument. Calling it on a versus matchup rejects with `NOT_ALLOWED`, and `acceptVersusRecreationalGame` rejects the same way on a free-for-all matchup. It shares the versus accept's in-flight slot, so while either accept is pending the other rejects at once with `NOT_ALLOWED` (`"Another acceptRecreationalGame request is already in progress"`) and posts nothing. Needs a login (call after `await client.ready`) and has the standard 15s timeout. Everything else matches the versus accept. See [Games You Play Headless](2.2_gyp_headless.md#accepting-a-free-for-all-game).
- `api.cancelRecreationalGame(matchupId)`, which cancels a Games You Play matchup the logged-in user created, while its `status` is `OPEN`, and resolves with `{ matchupId }` (the new exported type `LucraCancelRecreationalGameResult`). Only the creator can cancel, and canceling refunds the stakes. It rejects with `NOT_ALLOWED` for a non-creator or a matchup that is not `OPEN`, and with `API_ERROR` (`"Recreational game matchup not found"`) for an unknown id. Needs a login (call after `await client.ready`) and has the standard 15s timeout. A second cancel while one is pending rejects at once with `NOT_ALLOWED`. A `"Timeout"`, any other `API_ERROR`, or a close while pending has an unknown outcome: read the matchup's status with `api.matchup` before retrying. See [Games You Play Headless](2.2_gyp_headless.md#canceling-a-game).
- Docs: [Games You Play Headless](2.2_gyp_headless.md), a guide to rendering, creating, accepting, and canceling GYP matchups headlessly, with the auth model, timeouts and concurrency, error codes and remediation, which write rejections leave the outcome unknown, and an end-to-end create, share, accept, watch, and cancel flow. [Headless on Web](2.0_headless.md#when-to-use-headless-vs-lucra-flows) no longer lists matchup creation as Lucra-UI only; gameplay still runs in Lucra UI.

### Changed

- `api.joinTournament()`'s precheck now requires demographic information instead of identity verification: it no longer rejects with `UNVERIFIED`. The checks run funds (paid tournaments), then demographics (always required, `DEMOGRAPHIC_INFORMATION_MISSING`, remediate with `client.dialog().demographic()`), then location. `UNVERIFIED` stays in `LucraApiErrorCode` for compatibility but is not returned by the headless prechecks: KYC moves to withdrawal flows. See [Headless on Web: Errors](2.0_headless.md#lucraapierror-by-code).
- `close()` now rejects every pending `api.*` request, and a `ready` still pending, with `LucraClientNotOpen` instead of leaving them to time out or hang. The message says the client was closed while the request was pending. A write that was already running may still complete in the Lucra app, so check before retrying a write.
- An `api.*` message that cannot be posted to the iframe (for example a payload that cannot be cloned) now rejects that call with the error at once instead of timing out.
- Reads (`api.achievements/tournaments/tournament/tournamentLeaderboard`) run concurrently and no longer cancel each other: a second call no longer rejects the first with `"Cancelled by new <name> request"`, and each call has its own 15s timeout. The writes (`joinTournament`, `autoJoinTournaments`) stay single-flight. See [Cancellation](2.0_headless.md#cancellation).

## [v1.13.0]

### Added

- `currentValue` and `targetValue` on `LucraAchievement`, the raw progress toward an achievement and its goal (e.g. `261` of `700`). Render `currentValue / targetValue` as text; `currentProgress` stays the floored percentage for progress bar fill. See [Achievements](2.0_headless.md#achievements).
- `LucraClientNotOpen` error (exported), for methods that need the Lucra iframe but run before `open()` or after `close()`. See [Headless on Web: Errors](2.0_headless.md#lucraclientnotopen).

### Breaking

- `hide()`, `show()`, `moveTo()`, and `sendMessage.userUpdated/navigate/enableConvertToCredit/availableRewards` now throw `LucraClientNotOpen` before `open()` or after `close()` instead of silently doing nothing. The replies `sendMessage.deepLinkResponse/convertToCreditResponse` stay lenient.
- The methods returned by `redirect()` and `dialog()`, and `logout()`, now throw `LucraClientNotOpen` instead of `Error`. The message keeps its prefix and `instanceof Error` is still true.
- `api.achievements/tournament/tournamentLeaderboard/joinTournament/autoJoinTournaments` reject with `LucraClientNotOpen` immediately instead of the 15s `"Timeout"`, and `api.tournaments()` rejects with it instead of waiting indefinitely when there is no iframe. See [Headless on Web](2.0_headless.md#api-functions).

### Deprecated

- `moveTo()`: re-parenting the iframe reloads it, losing page state and any in-flight request. Keep the iframe in one persistent container ([mounted at startup](1.2_initialize_client.md#mount-the-iframe-at-startup-recommended)) and use `show()`/`hide()`, or present routes with `dialog()`. It keeps working, logs a one-time console warning, and will be removed in a future major version. See [Visibility and Placement](1.3_lucraflows.md#visibility-and-placement).
- `deposit()` on `open()`, `redirect()`, and `dialog()`: Add Funds must run in a top-level popup because Apple Pay does not run in a cross-origin iframe. Open `wallet()` or `profile()` instead: from there the Lucra app opens Add Funds in a popup on its own. It keeps working, logs a one-time console warning, and will be removed in a future major version. See [Lucra Flows](1.3_lucraflows.md#open-lucra).

### Fixed

- `on('exitLucra')` now enables the in-app exit control whenever it is registered: before `open()`, before the Lucra app finished loading, or across an iframe reload. The SDK re-sends it each time the iframe reports `initialized` or `loginSuccess`, so it also survives Auth0 popup login. Hosts that registered it before `open()` or before the Lucra app loaded now actually see the exit control (the back arrow, and the wallet X exits instead of going home), which previously never appeared. See [Exiting Lucra](1.5_exiting_lucra.md).

## [v1.12.0]

### Added

- `autoJoinedTournaments` event (payload `{ matchupIds: string[] }`), fired after Lucra enrolls the user in the free tournaments they were eligible for but not already in. An empty list is a normal result, not an error. It does not fire when the enrollment was skipped or failed. See [Lucra Event Listener](1.6_lucra_event_listener.md#available-events).
- `autoJoin` constructor property (default `true`). Lucra enrolls an authenticated user in eligible free tournaments automatically, once per sign-in. Pass `autoJoin: false` to turn that off and choose the moment yourself. See [autoJoin](1.2_initialize_client.md#autojoin).
- `api.autoJoinTournaments()`, which enrolls the user on demand and resolves with `{ matchupIds }`. Reports through the same `autoJoinedTournaments` event as the automatic trigger. A skipped or failed call rejects with a typed `LucraApiError` (`LOCATION_NEEDED`, `DEMOGRAPHIC_INFORMATION_MISSING`, `LOCATION_ERROR`, `API_ERROR`) instead of timing out. See [Async API](1.6_lucra_event_listener.md#async-api).

## [v1.11.0]

### Added

- `LucraApiErrorCode.apiError` (`API_ERROR`), a catch-all code for a failure with no more specific reason. The web-app now reports every failed `api.joinTournament()` with a typed `LucraApiError`; previously only geolocation failures were reported, so an API error left the call to reject with the 15s timeout string instead. `message` carries the underlying detail. See [Handling join errors](1.6_lucra_event_listener.md#handling-join-errors).

## [v1.10.0]

### Added

- `locationGrant()` navigation on `open()`, `redirect()`, and `dialog()` that opens the `app/location-grant` page: `client.dialog().locationGrant()`. The page asks the user to allow location access, which browsers only grant an iframe from a user gesture inside it.
- `LOCATION_NEEDED` `LucraApiErrorCode` (`LucraApiErrorCode.locationNeeded`), rejected when Lucra has no location for the user yet. Present the location page with `client.dialog().locationGrant()`, then retry. See [Handling join errors](1.6_lucra_event_listener.md#handling-join-errors).
- `locationGranted` event (payload `void`) fired once Lucra has the user's location. It carries no location detail: `client.on('locationGranted', () => dialog.close())`. See [Lucra Event Listener](1.6_lucra_event_listener.md).

## [v1.9.0]

### Changed

- `api.tournaments()` can now be called before the user is logged in. It awaits iframe initialization internally (instead of requiring `await client.ready`, which also asserts login) and resolves with the tournament list for logged-out users. The detail and leaderboard reads (`api.tournament()`, `api.tournamentLeaderboard()`) still require a logged-in user. See [Async API](1.6_lucra_event_listener.md#async-api).

## [v1.8.0]

### Added

- `demographic()` navigation on `open()`, `redirect()`, and `dialog()` that opens the `app/demographicform` demographic-collection flow: `client.open(element).demographic()`, `client.dialog().demographic()`.
- `demographicComplete` event (payload `void`) fired when the user finishes the demographic collection flow. Lucra does not navigate away on completion, so the embedding app reacts — typically by closing the dialog it opened the flow in: `client.on('demographicComplete', () => dialog.close())`. See [Lucra Event Listener](1.6_lucra_event_listener.md).

## [v1.7.0]

### Added

- `kyc()` navigation on `open()`, `redirect()`, and `dialog()` that opens the `app/kyc` identity-verification flow: `client.open(element).kyc()`, `client.dialog().kyc()`.
- `kycComplete` event (payload `void`) fired when the user finishes the KYC flow. Lucra does not navigate away on completion, so the embedding app reacts — typically by closing the dialog it opened KYC in: `client.on('kycComplete', () => dialog.close())`. See [Lucra Event Listener](1.6_lucra_event_listener.md).

## [v1.6.0]

### Added

- `popup()` navigation that opens the deposit flow in a real browser popup window instead of an iframe, required because Apple Pay does not run inside a cross-origin iframe. Scoped to deposit only: `client.popup().deposit()`. Must be called from a user gesture. Returns a `LucraPopup` handle (`close()`, `onClose(result?)`) whose `onClose` receives a `LucraPopupResult` (`{ toastType, message }`) when the deposit reports an outcome, or `undefined` when dismissed. See [Popups](1.3_lucraflows.md#popups). New types: `LucraPopup`, `LucraPopupResult`

## [v1.5.0]

### Added

- `api.joinTournament()` now rejects with a typed `LucraApiError` when a join is blocked, so client apps can react to the reason. `LucraApiError` carries a `code` (`LucraApiErrorCode`): `UNVERIFIED`, `INSUFFICIENT_FUNDS`, `DEMOGRAPHIC_INFORMATION_MISSING`, or `LOCATION_ERROR`. See [Handling join errors](1.6_lucra_event_listener.md#handling-join-errors).
- New exports: `LucraApiError`, `LucraApiErrorCode`, `LucraApiErrorBody`

## [v1.4.0]

### Added

- `dialog()` navigation that opens any route as a fullscreen overlay without reloading the iframe (it styles the host element in place and navigates via message). Returns a `LucraDialog` handle (`close()`, `onClose(cb)`) and closes on the in-app close, `Escape`, or `close()`. New type: `LucraDialog`
- `wallet()` navigation method on `open()`, `redirect()`, and `dialog()` for the `app/wallet` route

## [v1.3.0]

### Added

- `api.tournaments()` method returning recommended pool tournaments
- `api.tournament(matchupId)` method returning a single tournament's full detail
- `api.tournamentLeaderboard(matchupId, pagination?)` method returning a paginated leaderboard page
- `api.joinTournament(tournamentId)` method to join a tournament by id
- New tournament types: `LucraTournament`, `LucraTournamentDetail`, `LucraTournamentResponse`, `LucraTournamentLeaderboard`, `LucraTournamentLeaderboardInput`, `LucraTournamentLeaderboardResponse`, `LucraLeaderboardRow`, `LucraLeaderboardColumn`, `LucraLeaderboardPagination`, `LucraTournamentPayoutStructure`, `LucraTournamentPayoutReward`, `LucraTournamentCatalogReward`, `LucraTournamentEarnedReward`, `LucraTournamentAttemptData`, `LucraTournamentAttemptScores`, `LucraTournamentTimer`, `LucraTournamentGame`, `LucraTournamentHowToPlayStep`, `LucraTournamentConfirmationTerm`, `LucraTournamentNotice`, `LucraJoinTournamentResponse`

## [v1.2.0]

### Added

- `api.achievements()` method returning the current user's achievements
- `initialized` event fired when the Lucra iframe finishes initializing
- `ready` Promise, `isInitialized` boolean, and `user` getter on the client
- Type: `LucraAchievement`

## [v1.1.0]

### Added

- `hide()` method to make the Lucra iframe invisible without removing it from the DOM
- `show()` method to restore the Lucra iframe to visible
- `moveTo(element)` method to move the Lucra iframe to a different parent element without reloading
  - Correction (v1.4.0): re-parenting an iframe reloads its contents, so `moveTo` reloads the Lucra page. Use [`dialog()`](1.3_lucraflows.md#dialogs) to present a route as an overlay without reloading.
- `open()` now accepts an optional third argument `options?: { hidden?: boolean }` to start the experience in a hidden state

## [v1.0.0]

### Added

- `LucraClient` is now a singleton managed via `LucraClient.initialize(config)`, `LucraClient.getInstance()`, and `LucraClient.destroy()`
- Event-based listener API via `on(type, listener)` and `off(type, listener)` replaces the callback-based `onMessage` constructor option
- Simplified constructor type `LucraV1ClientConstructor` (`apiKey`, `tenantId`, `env`, `locationId`) with no `onMessage` required
- `setMatchupDeepLinkHandler(transformer)` method to configure matchup invite URL generation

**Migration guide:**

```typescript
// Before
import { LucraClient } from "lucra-web-sdk";
const client = new LucraClient({
  apiKey: "...",
  tenantId: "...",
  env: "production",
  onMessage: {
    matchupCreated: (data) => {},
    // ...all handlers required
  },
});

// After
import { LucraClient } from "lucra-web-sdk";
const client = LucraClient.initialize({ apiKey: "...", tenantId: "...", env: "production" });
client.on("matchupCreated", (data) => {});
client.on("exitLucra", () => {});
```

## [v0.21.1]

- `createMatchup` updated for a better flow

## [v0.21.0]

- `apiKey` is a new required parameter used for SDK initialization
- `tenantId` remains a required parameter; both must be provided when instantiating `LucraClient`
- Corrected reference from `external_id` to `externalId` in README.md as it relates to metadata

## [v0.20.2]

Added validation for metadata to ensure key/value pairs are of type string.

## [v0.20.1]

Removed deprecation warning for `deepLinkHandler`

## [v0.20.0]

### Added

- New `matchupDeepLinkHandler` setter to configure how matchup invite URLs are generated for sharing. This provides a cleaner API specifically for matchup invitations.
- New `matchupInviteUrl` message type in `LucraClientMessageType` enum for specific matchup invitation handling
- New `LucraMatchupInviteUrlBody` type containing the `matchupId` for invite URL generation

- `deepLinkHandler` setter is not preferred for matchup invitations. Please migrate to `matchupDeepLinkHandler` for better clarity when handling matchup invitations. The old method will continue to work but matchup invitations should be handled with the new approach.

### Matchup Invitation - Migration Guide

**Before:**

```typescript
lucraClient.deepLinkHandler = ({ url }) => {
  // Had to parse the Lucra URL to extract matchupId
  const lucraUrl = new URL(url);
  const matchupId = lucraUrl.pathname.split("/").pop();

  const shareUrl = `${window.location.origin}?matchupId=${matchupId}`;
  lucraClient.sendMessage.deepLinkResponse({ url: shareUrl });
};
```

**After (Recommended):**

```typescript
lucraClient.matchupDeepLinkHandler = (matchupId) => {
  // Receive matchupId directly, just return the URL
  return Promise.resolve(`${window.location.origin}?matchupId=${matchupId}`);
};
```

**Key Benefits:**

- Receive `matchupId` string directly without URL parsing
- Simply return the URL string - response sent automatically
- No need to manually call `deepLinkResponse()`
- More explicit method name for matchup invitations
- Cleaner, more maintainable code
- Better TypeScript support

See README.md for complete migration guide and usage examples.

## [v0.19.0]

### Updated

- The `sendMessage.userUpdated` method can now include valid JSON as part of the `metadata` property on the payload. This `metadata` will be returned on the user object (see SDKLucraUser/SDKClientUser types).

## [v0.18.0]

### Updated

- LucraClient now allows registering a custom `activeMatchupStarted` handler to know when (non-creator) matchup participants have seen the matchup start in real time while viewing the matchup details page

## [v0.17.0]

### Updated

- LucraClient now allows registering a custom `exitLucraHandler` to know when a user has attempted to exit the Lucra experience

## [v0.16.0]

### Updated

- LucraClient constructor now accepts `locationId` to set the location without having to navigate to `home`
- LucraClient constructor has deprecated `useTestUsers` as its now no longer needed to log in with test users
- Calling `.open` on the LucraClient when it's already open will perform a `redirect` instead of incorrectly adding another iframe
- New `loginSuccess` callback that receives the user info. Wait for this callback to fire before sending any messages to LucraClient

## [v0.15.1]

### Updated

- allow payment on iframe

## [v0.15.0]

### Updated

- `matchupStarted` new onMessage event that fires when the matchup owner starts a GYP matchup

## [v0.14.0]

### Updated

- `logout` method now available on the LucraClient

## [v0.13.1]

#### Updated

- `LucraClientConstructor` now allows for using test users via `useTestUsers` property

## [v0.13.0]

### Updated

- `availableRewards` message to send to Lucra if Free To Play is enabled
- `claimReward` message from Lucra if a user is redeeming a Free To Play reward
- `matchupDetails` navigation method no longers accepts a `teamInviteId` as the updated models allow for the user to select their team

## [v0.12.3]

- add support for passing a 10-digit phone number to prefill and auto-send verification SMS

## [v0.12.1]

### Updated

- `redirect` method to redirect an already opened LucraClient

## [v0.12.0]

### Updated

- `home` now accepts a `locationId` parameter to skip the location picker
- all types now come from `/types/types.js`

## [v0.11.2]

### Updated

- `navigationEvent` event with the full url that can be used in the future for deepLinking

## [v0.11.1]

### Updated

- `tournamentJoined` event
- `tournamentDetails` open method

## [v0.11.0]

### Updated

- Fixed imports for non-Bun packages

## [v0.10.13]

### Updated

- Update to `exports`

## [v0.10.12]

### Updated

- Update to `exports`

## [v0.10.11]

### Updated

- Update to `exports`

## [v0.10.10]

### Updated

- Update to `exports`

## [v0.10.9]

### Updated

- Update to `exports`

## [v0.10.8]

### Updated

- `exports` in package.json

## [v0.10.7]

### Updated

- Expose typescript types

## [v0.10.6]

### Updated

- Expose typescript types

## [v0.10.5]

### Updated

- Update the `dist` folder

## [v0.10.4]

### Updated

- Deep linking not setting the `parentUrl`

## [v0.10.3]

### Added

- Updated iframe permissions to allow accelerometer, bluetooth, and gyroscope access

## [v0.10.2]

### Added

- `hideNavigation` param if there is a `gameId` present when calling the LucraClient's `createMatchup` method

## [v0.10.1]

### Updated

- `deepLink` body is now a full URL that can should be passed into the `open.deepLink` method

## [v0.10.0]

### Updated

- New `set` methods for registering handler functions after instantiation of LucraClient
- iframe now allows for `web-share`

## [v0.9.0]

### Updated

- `deepLink` message now accepted

## [v0.8.3]

### Updated

- `theme` optional on `LucraConvertToCreditResponse`

## [v0.8.2]

### Updated

- `LucraConvertToCreditResponse` updated

## [v0.8.1]

### Updated

- new `matchupDetails` method to navigate to an existing matchup to accept

## [v0.8.0]

### Updated

- updates to the `.open` method

## [v0.7.3]

### Updated

- new `enableConvertToCredit` message to send to Lucra

## [v0.7.2]

### Updated

- new `convertToCredit` messages that support withdrawing funds as credit
- `open` now has typed methods for where to open Lucra

## [v0.6.1]

### Updated

- fix typo

## [v0.6.0]

### Updated

- LucraSports -> LucraClient

## [v0.5.2]

### Updated

- remove hostUrl from the constructor

## [v0.5.1]

### Updated

- remove need for hostUrl in the constructor
- fix too early of setting up event listener

## [0.5.0]

### Updated

- `.open` method now contains the `destination` instead of the constructor, allowing you to determine where to open LucraSports at a later time

## [0.4.0]

### Changed

- updated to all the supported events and bugfixes

## [0.3.0]

### Changed

- constructor takes new parameters for Lucra url

## [v0.2.4]

### Added

- `matchupCanceled` and `matchupCompleted` events

## [v0.2.3]

### Added

- default `matchupId` parameter to navigate directly to the wager page

### Fixed

- `login` event should the Lucra User Id as the parameter

## [v0.2.2]

### Fixed

- Include dist folder for releases

## [v0.2.1]

### Fixed

- Include dist folder for releases

## [v0.2.0]

### Fixed

- Include dist folder for releases

## [v0.1.0]

### Added

### Fixed

### Updated

## [v0.0.1]

### Added

- Initial package

### Fixed

### Updated
