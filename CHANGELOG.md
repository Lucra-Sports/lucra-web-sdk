### CHANGELOG

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
