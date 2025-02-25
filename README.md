# lucra-web-sdk

## Integrating with lucra-web-sdk

### Installing the SDK

```
bun install Lucra-Sports/lucra-web-sdk
```

`bun` is shown but installing from Github should be supported by any node package manager you're using

### Typescript

The SDK was developed with Typescript in mind. If you are using Typescript, everything should be typed including the class constructor and the available methods and arguments on the LucraSports class.

### Create an instance of LucraSports

```
const lucraSports = new LucraSports({
  tenantId: "<your Lucra tenant id>",
  env: "sandbox" | "production",
  hostUrl: "<url origin of your website that will be hosting the iframe>",
  onMessage: {
    // callback functions for the messages sent to the SDK from Lucra Sports, documented below
  }
})
```

### Open LucraSports

```
const lucraSports = new LucraSports(...)
lucraSports.open({
  element: <HTMLElement that will contain the iframe for LucraSports>,
  destination: "create-matchup" | "profile" | "home",
  matchupId: "<optional matchupId to skip the matchup selection screen when destination is create-matchup>"
})
```

### Messages from LucraSports

`userInfo` - whenever an update happens to the user, the callback to this function will receive the newest version of that user
`matchupCreated` - the user successfully created a matchup, and contains the id of that matchup
`matchupAccepted` - the user successfully jointed someone else's matchup, and contains the id of that matchup
`matchupCanceled` - the user successfully canceled the matchup, and contains the id of that matchup

### Messages you can send to LucraSports

_Note:_ the `hostUrl` must be correct, otherwise LucraSports will ignore the message

`userUpdated` - update the LucraSports user with known information about the current user. This information will be persisted to LucraSports and will be used to pre-fill forms the user will have to fill out for things like Identity Verification

### Sending a message to LucraSports

```
const lucraSports = new LucraSports(...)
lucraSports.sendMessage.userUpdated(...)
```

## Local Development

To install dependencies:

```bash
bun install
```
