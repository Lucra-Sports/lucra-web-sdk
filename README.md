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
  },
  locationId?: "<locationId>" // set the locationId without having to navigate to `home` with the `locationId`
})
```

### Registering `onMessage` functions

If you need to register a handler function for any of the `onMessage` callbacks, you can do so after instantiation like so:

```typescript
const lucraClient = new LucraClient(...)
lucraClient.userInfoHandler = handleUserInfo;
```

### Configuring Matchup Invite URL Generation

When users want to share or invite others to a matchup, you need to configure how invite URLs are generated. Use the `matchupDeepLinkHandler`:

```typescript
const lucraClient = new LucraClient({
  tenantId: "your-tenant-id",
  env: "production",
  onMessage: {
    /* ... */
  },
});

// Configure the transformer to generate invite URLs
lucraClient.matchupDeepLinkHandler = (matchupId) => {
  return Promise.resolve(`${window.location.origin}?matchupId=${matchupId}`);
};
```

**How it works:**

1. **Lucra requests an invite URL** - When a user shares a matchup, Lucra calls your handler with the `matchupId`
2. **Your handler generates a shareable URL** - Create a URL that can be shared via social media, messaging, etc.
3. **Receiver opens the URL** - When someone clicks the link, it opens your application
4. **Your app detects the matchupId** - On launch, check URL parameters and navigate to the matchup:

```typescript
// On app initialization, check for invite parameters
const urlParams = new URLSearchParams(window.location.search);
const matchupId = urlParams.get("matchupId");

if (matchupId) {
  // Open Lucra to the home screen first then navigate to matchup details
  lucraClient.open(containerElement).matchupDetails(matchupId);
}
```

#### Migration from deprecated `deepLinkHandler` for matchup invitations

**Key Differences:**

| Old (`deepLinkHandler`)        | New (`matchupDeepLinkHandler`)       |
| ------------------------------ | ------------------------------------ |
| Received full Lucra URL        | Receives clean `matchupId` string    |
| Required manual URL parsing    | No parsing needed                    |
| Manual `deepLinkResponse` call | Returns URL directly (auto-responds) |
| Generic for all deep links     | Specific to matchup invites          |

**Migration Example:**

```typescript
// OLD APPROACH
lucraClient.deepLinkHandler = ({ url }) => {
  // Had to parse the Lucra URL to extract matchupId
  const lucraUrl = new URL(url);
  const matchupId = lucraUrl.pathname.split("/").pop();

  const shareUrl = `${window.location.origin}?matchupId=${matchupId}`;
  lucraClient.sendMessage.deepLinkResponse({ url: shareUrl });
};

// NEW APPROACH (Recommended)
lucraClient.matchupDeepLinkHandler = (matchupId) => {
  // Receive matchupId directly, just return the URL
  return Promise.resolve(`${window.location.origin}?matchupId=${matchupId}`);
};
```

### Registering `exitLucraHandler` function

To determine when a user has attempted to exit the Lucra experience, you may register a handler function after successful login like so:

```typescript
// Register the exit lucra handler after we are subscribed
lucraClient.exitLucraHandler = () => {
  console.log("User attempted to exit Lucra!");
};
```

An example of where to register this would be in the `loginSuccessHandler` (or after the login event has fired) to ensure the user's Lucra experience is fully ready.

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
  .matchupDetails(matchupId: string)
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
  .matchupDetails(matchupId: string)
  .tournamentDetails(matchupId: string)
  .deepLink(url: string)
```

### Messages from LucraClient

- `loginSuccess` - the user has logged into Lucra
- `userInfo` - whenever an update happens to the user, the callback to this function will receive the newest version of that user
- `matchupCreated` - the user successfully created a matchup, and contains the id of that matchup
- `matchupStarted` - the matchup owner started the matchup, and contains the id of that matchup
- `matchupAccepted` - the user successfully joined someone else's matchup, and contains the id of that matchup
- `matchupCanceled` - the user successfully canceled the matchup, and contains the id of that matchup
- `matchupInviteUrl` - Lucra is requesting an invite URL for a specific matchup. Use `matchupDeepLinkHandler` to handle this. Your handler receives the `matchupId` and must call `sendMessage.deepLinkResponse()` with the generated URL.
- `convertToCredit` - if Convert to Credit is enabled, Lucra will call this method with the desired amount to convert to credit. Respond with a `convertToCreditResponse` message defined below
- `deepLink` - Lucra is requesting a url that the user of the SDK will open to then open up the LucraClient at where the deepLink url is linking to. For matchup invitations, use `matchupDeepLinkHandler`.
- `tournamentJoined` - the user successfully joined a tournament, and contains the id of the tournament
- `navigationEvent` - the user has navigated somewhere in Lucra, contains the full url that you can use later when doing `.open().deepLink(url)`
- `claimReward` - the user is redeeming a Free To Play reward

### Messages you can send to LucraClient

`userUpdated` - update the LucraClient user with known information about the current user. This information will be persisted to LucraSports and will be used to pre-fill forms the user will have to fill out for things like Identity Verification

You may optionally include a `metadata` property as valid JSON related to the Lucra user. _Note_: On the `metadata` object, the `external_id` property will be used to index, if provided. Passing in metadata in this way will be used to link client users with the Lucra user for autosettlement identification purposes.

### Sending a message to LucraClient

```
const lucraClient = new LucraClient(...)
lucraClient.sendMessage.userUpdated(...)
lucraClient.sendMessage.convertToCreditResponse(...)
lucraClient.sendMessage.enableConvertToCredit()
lucraClient.sendMessage.deepLinkResponse(...)
lucraClient.sendMessage.availableRewards(...)
```

## Local Development

To install dependencies:

```bash
bun install
```
