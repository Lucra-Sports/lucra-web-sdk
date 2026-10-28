---
name: lucra-web-auth-and-identity
description: >
  Handle Lucra login, sessions, and user identity in a web integration: letting Lucra show its own login,
  returning users to where they were after login, signing users out of Lucra when they sign out of the app,
  switching users on a shared device, double logins, and linking the app's user to their Lucra user
  (userUpdated, externalId). Use when users see the wrong account, are asked to log in twice, land on the
  wrong screen after login, or when wiring sign-in and sign-out.
---

# Lucra Web SDK — Auth and Identity

> **Portability:** all relative links in this skill (e.g. `../../1.2_initialize_client.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this
> file is not sitting inside that docs folder (e.g. it was installed as a standalone agent skill), clone
> the public repo (shallow is fine) and resolve links there. Use only these published docs — never private
> Lucra checkouts that may exist elsewhere on the machine.

Lucra keeps **its own session** inside its iframe, separate from the integrator's app session. Most auth
bugs come from treating the two as one.

## Login: let Lucra drive it

- **Don't force login.** Open the destination the user wants (e.g. `dialog().tournamentDetails(id)`);
  Lucra gates it and shows its own login when needed. Calling `open(host).login()` reloads the shared
  iframe and drops in-flight requests.
- **A `ready` rejection is not "go to login".** Only `LucraUserNotLoggedIn` means logged out, and pre-auth
  reads (`api.tournaments()`) still work. A `{ success: false }` rejection is a configuration error: see
  `lucra-web-keys-and-tenant`.
- **Return the user to where they were.** After login Lucra lands on its own default screen, not the one
  you asked for. Remember the last destination your app requested and re-issue it (e.g. with `redirect()`)
  when `loginSuccess` fires.
- **Gate writes on `ready`.** A headless write sent while logged out is never answered and times out
  ([Lifecycle and gating](../../2.0_headless.md#lifecycle-and-gating)).

## Sign-out and switching users

Signing out of the integrator's app does **not** sign the user out of Lucra. Without this step, the next
person to sign in on that device opens Lucra as the previous user.

- In the app's own sign-out, call `client.logout()` while Lucra is open
  ([Initializing the LucraClient](../../1.2_initialize_client.md)). It throws `LucraClientNotOpen` if Lucra
  isn't open.
- `logout()` has no completion event, so **don't call `destroy()` or `close()` in the same step**: removing
  the iframe straight away can cut the sign-out short. Navigating away afterwards is fine.
- `LucraClient.destroy()` alone does not sign the user out of Lucra.

## Linking your user to their Lucra user

- Send what you know about the user with `sendMessage.userUpdated(...)` so Lucra can pre-fill forms, and
  put your own user id in `metadata.externalId` ([Updating Users](../../1.8_updating_users.md)). `state`
  must be a 2-letter code.
- Listen for `loginSuccess` and `userInfo` to learn the Lucra user, and keep the mapping on your side if
  your server needs it (scores, webhooks: see `lucra-backend-integration`).

## Double login checklist

When users report logging in twice, check in this order:

1. Your code forces `login()` somewhere (on a `ready` rejection, or before a deposit). Remove it.
2. You re-mount or reload the iframe on navigation (`moveTo()`, a new `open()` per route, a router removing
   the host element). Mount once at startup and keep the host alive
   ([Mount the iframe at startup](../../1.2_initialize_client.md#mount-the-iframe-at-startup-recommended)).
3. The browser is in private mode or blocks third-party storage, so Lucra's session can't persist. Test in
   a normal window first.
4. If none apply, report it to Lucra with the steps, browser, and SDK version (`SDK_VERSION`).

Your app's own verification steps (email codes, and so on) stack on top of Lucra's phone verification.
Keep yours to what you actually need.
