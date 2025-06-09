# lucra-web-sdk

## Integrating with lucra-web-sdk

### Installing the SDK

```
bun install Lucra-Sports/lucra-web-sdk
```

`bun` is shown but installing from Github should be supported by any node package manager you're using

### Typescript

The SDK was developed with Typescript in mind. If you are using Typescript, everything should be typed including the class constructor and the available methods and arguments on the LucraClient class.

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

### Registering `onMessage` functions

If you need to register a handler function for any of the `onMessage` callbacks, you can do so after instantiation likeso

```
const lucraClient = new LucraClient(...)
lucraClient.deepLinkHandler = handleDeepLinkRequest;
```

The `deepLink` handler is an example of where you might want to do this since the handler of the function probably needs the instance of `LucraClient` to respond. For example, consider this handler function

```
function generateDeepLink({ matchupId, teamInviteId }: LucraDeepLinkBody) {
  const searchParams = new URLSearchParams({
    matchupId: matchupId,
    teamInviteId: teamInviteId ?? "",
  });
  const shareUrl = `${window.location.origin}?${searchParams.toString()}`;
  lucraClient?.sendMessage.deepLinkResponse({
    url: shareUrl,
  });
}
```

Note that when you register this function at instantiation, `lucraClient` will be `undefined`. You can later in your code, when `lucraClient` is no longer `undefined`, do:

```
if (lucraClient) {
  lucraClient.deepLinkHandler = generateDeepLink;
}
```

### Open Lucra

```
const lucraClient = new LucraClient(...)
lucraClient.open(element: <HTMLElement that will contain the iframe for Lucra>, phoneNumber?: string)
  // and one of the below
  .profile()
  .home(locationId?: string)
  .deposit()
  .withdraw()
  .createMatchup(gameId?: string)
  .matchupDetails(matchupId: string, teamInviteId?: string)
  .tournamentDetails(matchupId: string)
  .deepLink(url: string)
```

Where phone number (if valid) will automatically send the SMS verification code, skipping the step where the user must enter phone number manually.

### Redirect Lucra

```
// use an existing LucraClient that's open
lucraClient.redirect()
  // and one of the below
  .profile()
  .home(locationId?: string)
  .deposit()
  .withdraw()
  .createMatchup(gameId?: string)
  .matchupDetails(matchupId: string, teamInviteId?: string)
  .tournamentDetails(matchupId: string)
  .deepLink(url: string)
```

### Messages from LucraClient

`userInfo` - whenever an update happens to the user, the callback to this function will receive the newest version of that user
`matchupCreated` - the user successfully created a matchup, and contains the id of that matchup
`matchupAccepted` - the user successfully joined someone else's matchup, and contains the id of that matchup
`matchupCanceled` - the user successfully canceled the matchup, and contains the id of that matchup
`convertToCredit` - if Convert to Credit is enabled, Lucra will call this method with the desired amount to convert to credit. Respond with a `convertToCreditResponse` message defined below
`deepLink` - Lucra is requesting a url that the user of the SDK will open to then open up the LucraClient at where the deepLink url is linking to
`tournamentJoined` - the user successfully joined a tournament, and contains the id of the tournament
`navigationEvent` - the user has navigated somewhere in Lucra, contains the full url that you can use later when doing `.open().deepLink(url)`

### Messages you can send to LucraClient

`userUpdated` - update the LucraClient user with known information about the current user. This information will be persisted to LucraSports and will be used to pre-fill forms the user will have to fill out for things like Identity Verification

### Sending a message to LucraClient

```
const lucraClient = new LucraClient(...)
lucraClient.sendMessage.userUpdated(...)
lucraClient.sendMessage.convertToCreditResponse(...)
lucraClient.sendMessage.enableConvertToCredit()
lucraClient.sendMessage.deepLinkResponse(...)
```

## Local Development

To install dependencies:

```bash
bun install
```
