---
name: lucra-web-keys-and-tenant
description: >
  Set up and check Lucra API keys, tenant id, and environment for a web integration, and diagnose content
  that is empty, missing, or belongs to another tenant. Use when adding or switching Lucra keys, moving from
  sandbox to production or between tenants, when `initialized` fires with `{ success: false }` or `ready`
  rejects with that body, when someone wants to call Lucra's API with a backend key from the browser, or
  when tournaments, mini games, or features show up empty with no error.
---

# Lucra Web SDK — Keys, Environment, and Tenant

> **Portability:** all relative links in this skill (e.g. `../../1.2_initialize_client.md`) resolve
> against the `docs/` folder of the public repo `https://github.com/Lucra-Sports/lucra-web-sdk`. If this
> file is not sitting inside that docs folder (e.g. it was installed as a standalone agent skill), clone
> the public repo (shallow is fine) and resolve links there. Use only these published docs — never private
> Lucra checkouts that may exist elsewhere on the machine.

Every Lucra value an integration uses comes from **one tenant and one environment**. Most "Lucra is slow"
or "Lucra shows the wrong thing" reports trace back to values that don't belong together.

## The three values

| Value | Where it goes | Never |
|---|---|---|
| `tenantId` | `LucraClient.initialize` in the browser | — |
| Web API key | `LucraClient.initialize` in the browser | Use it for server calls: it gets 401s there, which is expected |
| Backend API key | The integrator's **server only**, in the `X-Lucra-Api-Key` header, loaded from secret storage | Put it in browser code or in any variable a bundler exposes (`VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*`): anything in the bundle is public |

Keys are issued by Lucra per platform and per environment ([Lucra API Keys](https://docs.lucrasports.com/lucra-sdk/readme/whats-included/lucra-api-keys.md)).
Never commit them, and never paste them into chat or tickets.

**If someone asks to use the backend key in the browser**, don't. To show Lucra data before sign-in, use
`client.api.tournaments()`, which works logged-out
([Tournaments Headless](../../2.1_tournaments_headless.md#listing-tournaments)). For anything else, add an
endpoint on their own server that calls Lucra with the backend key and returns only what the page needs.

## A failed initialization is a configuration error

`initialized` with `{ success: false }`, or `ready` rejecting with that body, means the key, `tenantId`, and
`env` don't belong together. **Stop and fix the configuration.** Never route around it by opening login or
continuing to other flows: login can appear to work, but everything after it runs against the wrong
configuration, and users wait on long loading states. `LucraUserNotLoggedIn` is the only rejection that
means "logged out". Full handling and example:
[If initialization fails, stop](../../1.2_initialize_client.md#if-initialization-fails-stop).

## Check the keys before building further

Run [the three checks](../../1.2_initialize_client.md#check-your-keys-before-building-further) in each
environment: `initialized` succeeds, the iframe host is `https://<tenantId>.<env>.lucrasports.com`
(production has no `<env>`), and a tournament from `client.api.tournaments()` is the same one the
integrator's server finds with its backend key. If any check fails, ask the Lucra contact which tenant each
key belongs to.

## Switching environment or tenant

Replace **all three values together**. Then:

- Point webhooks at the new tenant and get the new webhook secrets (see `lucra-backend-integration`).
- Have Lucra create Console accounts for the new tenant.
- Confirm the provisioning below for the new tenant **and** environment: enablement does not carry over.

## Empty with no error: provisioning, not code

A Lucra feature that renders empty or is missing, with no error, is usually a tenant setting Lucra
controls. Rule out the integration first, then ask Lucra.

| Symptom | Check in the integration first | Then ask Lucra to |
|---|---|---|
| Another tenant's tournaments or matchups appear | Browser and server use keys from the same tenant | Confirm which tenant each key belongs to |
| Tournament list is empty | `initialized` succeeded; you're on the expected environment | Create or recommend tournaments for the tenant in this environment |
| Mini games home is blank | Same as above | Enable the mini games for this tenant **in this environment** |
| Cash buy-ins, deposits, or a payment method are missing | — | Enable real-money actions and the payment methods |
| A feature works in sandbox but not production | The production values are a matching set | Enable it in production too |

When contacting Lucra, give the tenant id, the environment, the SDK version (`SDK_VERSION`), and the
symptom. Never send the keys themselves.
