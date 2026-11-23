---
name: lucra-web-react
description: >
  Use for any React app on Lucra's preview headless client: code that imports from
  lucra-web-sdk/react, uses LucraProvider, useLucra, useLucraAuth, useLucraPresentState,
  useLucraScreen, or useMatchupWatch, or a React app built on createLucraClient. Covers the
  preview status, the React 19 peer dependency, setup with one module scope client and
  LucraProvider, each hook, screens tied to routes, live matchup details in a data library,
  reads and writes, server rendering and hydration, and troubleshooting such as a hook outside
  the provider, ERESOLVE, CANCELLED, POPUP_BLOCKED, and IN_PROGRESS. Not for LucraClient in a
  React app: load lucra-web-starting-point for that. The client's own calls, errors, and screens
  are in lucra-web-headless-client.
---

# Lucra Web: React (preview)

> **Portability:** all relative links in this skill (e.g. `../../3.1_headless_react.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`,
> at the tag or commit you install the SDK from. If this file is not sitting inside that docs
> folder (e.g. it was installed as a standalone agent skill), clone the public repo (shallow is
> fine) and resolve links there. Use only these published docs, never private Lucra checkouts
> that may exist elsewhere on the machine.

This skill covers `lucra-web-sdk/react`, a provider and hooks for the preview headless client.
The reference is [React (preview)](../../3.1_headless_react.md). Load `lucra-web-headless-client`
too for the client's calls, errors, and screens.

## 1. It is a preview

- Built on the [headless client](../../3.0_headless_client.md), also a preview: both can still
  change.
- Needs React 19 or later.
- Install from GitHub, pinned to v1.24.0 or later. Older tags lack the exports and options below.

## 2. Setup

- **One client, at module scope.** Never during render or in an effect.
- **One import path.** `lucra-web-sdk/react` also exports everything `lucra-web-sdk/headless`
  does, with the same client and the same `LucraError`, so import from it across the app, route
  loaders included. React Server Components code, such as a Next.js server component or server
  action, keeps `lucra-web-sdk/headless`: `lucra-web-sdk/react` uses React APIs that server
  components do not have.
- **Wrap the app in `<LucraProvider client={lucra}>`.** The provider never creates or destroys
  the client.

```tsx
import { createLucraClient, LucraProvider } from "lucra-web-sdk/react";
import type { ReactNode } from "react";

export const lucra = createLucraClient({ apiKey, tenantId, env: "sandbox" });

export function App({ children }: { children: ReactNode }) {
  return <LucraProvider client={lucra}>{children}</LucraProvider>;
}
```

## 3. Hooks

- **`useLucra()`** returns the client. Call it in the component body and use the client in event
  handlers: a hook cannot run inside a handler.
- **`useLucraAuth()`** returns `{ status, user }`. `user` can be `null` for a moment after
  `status` becomes `"loggedIn"`, so read `user?.id`.
- **`useLucraPresentState()`** returns `{ screen }`: the screen on show, `"minigame"` while a game
  shows, or `null`. Add Funds is never reported.
- **`useLucraScreen(screen, { presentation, phoneNumber, onClose, onError })`** shows a Lucra
  screen while the component is mounted, for example a route that is the login or profile screen.
  - `onClose(result)` gets what the `lucra.present` call resolves. A route that only shows the
    screen navigates away from there.
  - **Pass `onError`.** Without it the rejection is unhandled, for example `NOT_LOGGED_IN` for any
    screen but `login`.
  - Unmounting, or a new `screen`, `presentation`, or `phoneNumber`, closes the screen without
    calling `onClose`. New `onClose` or `onError` functions on each render do not show it again.
    Safe in StrictMode.
  - Mount one at a time. A second screen closes the first, whose `onClose` gets
    `reason: "replaced"`.
  - **Not for `addFunds` or `minigame`.** Call them on the client from `useLucra()` in an event
    handler, `addFunds()` first in the click with no `await` before it.
- **`useMatchupWatch(matchupId, { onUpdate, onError })`** returns `{ details, error }` and watches
  the matchup while the component is mounted.
  - `details` is `null` until the first details arrive. `error` is a `LucraError` once the watch
    fails. The watch has stopped then, and `details` keeps the last ones.
  - **One matchup at a time across the app.** A watch on another matchup replaces it, and the old
    one fails with `CANCELLED`. Never one per card in a list: only the last one stays live.
  - **Feed the app's data library from `onUpdate`.** It gets the first details, then every change.
    Write them into the cache the page reads, filled with `lucra.matchups.getDetails(matchupId)`,
    so there is one copy. See
    [Keeping the details in your data library](../../3.1_headless_react.md#keeping-the-details-in-your-data-library).
  - **Key the cache by the `matchupId` you passed.** `details.matchup.id` can differ.
  - **No refetch after `lucra.matchups.accept()` or `cancel()` while the watch is live.** They
    arrive as updates.
  - Unmounting stops the watch without calling `onError`. A new `matchupId` starts over with
    `details: null`. New `onUpdate` or `onError` functions on each render do not start it again.

## 4. Data and writes

- **No data hooks, on purpose.** Read through the client: `useLucra()` in a component, or the
  module scope `lucra` inside the app's data library, such as query functions and route loaders.
- **Start writes from event handlers, never effects.** An effect that runs twice, as in
  StrictMode, sends the write once, and the second call rejects with `IN_PROGRESS`.
- Writes keep the client's rules. See
  [Changing things](../../3.0_headless_client.md#changing-things).

## 5. Server rendering and hydration

- On the server, `createLucraClient` returns a client that does nothing. Its calls reject with
  `UNSUPPORTED_ENVIRONMENT`, so call Lucra from code that runs in the browser.
- On the server and while hydrating, the hooks render `"loading"` for auth, a `null` screen, and
  `null` details, then the browser's state. `useLucraScreen` and `useMatchupWatch` start after
  hydration. Read auth and the screen on show through the hooks, not `getState()` during render,
  so hydration matches the server.

## Troubleshooting

| Code or symptom | Cause | Fix |
| --- | --- | --- |
| `useLucra must be used inside <LucraProvider>.` thrown | A hook ran outside `<LucraProvider>`. Every hook throws this message, not only `useLucra` | Wrap the app in `<LucraProvider client={lucra}>`, above every component that uses a hook |
| `ERESOLVE` peer dependency conflict on install | npm, with React 18 or older installed. `react` is a peer dependency, 19 or later | Upgrade React to 19 or later |
| `error` or `onError` with `CANCELLED` | A watch on another matchup replaced this one, for example one `useMatchupWatch` per list card | Watch one matchup at a time across the app |
| The page does not update from the watch | `onUpdate` writes under a key the page does not read, for example one built from `details.matchup.id` | Write under the `matchupId` you passed, the key the page's query uses |
| `lucra-web-sdk/react` cannot be resolved, or does not export `createLucraClient` | The installed tag predates v1.24.0, or the bundler does not read the `exports` field (webpack 4, for example) | Pin v1.24.0 or later. For the bundler, alias `lucra-web-sdk/react` to `lucra-web-sdk/dist/react/index.js` |

## Reference

- [Who is logged in](../../3.0_headless_client.md#who-is-logged-in)
- [Errors](../../3.0_headless_client.md#errors)
- [Showing a Lucra screen](../../3.0_headless_client.md#showing-a-lucra-screen)
- [Add Funds](../../3.0_headless_client.md#add-funds)
- [Watching a matchup](../../3.0_headless_client.md#watching-a-matchup)
