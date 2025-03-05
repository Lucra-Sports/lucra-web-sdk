# lucra-web-sdk

## Integrating with lucra-web-sdk

### Installing the SDK

```
bun install Lucra-Sports/lucra-web-sdk
```

`bun` is shown but installing from Github should be supported by any node package manager you're using

### Typescript

The SDK was developed with Typescript in mind. If you are using Typescript, everything should be typed including the class constructor and the available methods and arguments on the LucraSports class.

### Create an instance of LucraClient

```
const lucraClient = new LucraClient({
  tenantId: "<your Lucra tenant id>",
  env: "sandbox" | "production",
  onMessage: {
    // callback functions for the messages sent to the SDK from Lucra, documented below
  }
})
```

### Open Lucra

```
const lucraClient = new LucraClient(...)
lucraSports.open(element: <HTMLElement that will contain the iframe for Lucra>)
  // and one of the below
  .profile()
  .home()
  .deposit()
  .withdraw()
  .createMatchup(gameId?: string)
  .matchupDetails(matchupId: string, teamInviteId?: string)
```

### Messages from LucraClient

`userInfo` - whenever an update happens to the user, the callback to this function will receive the newest version of that user
`matchupCreated` - the user successfully created a matchup, and contains the id of that matchup
`matchupAccepted` - the user successfully jointed someone else's matchup, and contains the id of that matchup
`matchupCanceled` - the user successfully canceled the matchup, and contains the id of that matchup
`convertToCredit` - if Convert to Credit is enabled, Lucra will call this method with the desired amount to convert to credit. Respond with a `convertToCreditResponse` message defined below

### Messages you can send to LucraClient

`userUpdated` - update the LucraClient user with known information about the current user. This information will be persisted to LucraSports and will be used to pre-fill forms the user will have to fill out for things like Identity Verification

### Sending a message to LucraClient

```
const lucraClient = new LucraClient(...)
lucraClient.sendMessage.userUpdated(...)
lucraClient.convertToCreditResponse(...)
lucraClient.enableConvertToCredit()
```

## Local Development

To install dependencies:

```bash
bun install
```
