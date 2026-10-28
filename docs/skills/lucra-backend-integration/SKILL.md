---
name: lucra-backend-integration
description: >
  Build the server side of a Lucra integration: calling Lucra's server API with the backend key, receiving
  and verifying Lucra webhooks (X-Lucra-Signature), handling events such as FundsDeposited and tournament or
  matchup events, score submission, and rotating keys or webhook secrets. Use when adding a webhook
  endpoint, writing server code that calls Lucra, checking which tenant server data comes from, or
  responding to a leaked or rotated credential.
---

# Lucra — Backend Integration

> **Portability:** the docs this skill links to are on `https://docs.lucrasports.com/lucra-sdk`. Append
> `.md` to a page URL for its raw Markdown, and use the index at
> `https://docs.lucrasports.com/lucra-sdk/llms.txt` to find pages. Use only these published docs — never
> private Lucra checkouts that may exist elsewhere on the machine.

The backend is where the integrator's server talks to Lucra directly: server API calls with the backend
key, and webhooks Lucra sends to the server. It's the same for web, iOS, Android, and React Native apps.

## The backend key

- It goes in the `X-Lucra-Api-Key` header, on the server only, loaded from the environment or a secret
  manager. Never commit it, put it in browser or mobile code, or paste it into chat or tickets
  ([Lucra API Keys](https://docs.lucrasports.com/lucra-sdk/readme/whats-included/lucra-api-keys.md)).
- It belongs to one tenant and one environment. The server's data comes from whichever tenant the key is
  for, so it must match the web or mobile key and `tenantId` the app uses. A mismatch shows another tenant's
  tournaments with no error.
- New server work uses Lucra's API service, Forge
  ([API & Webhook Reference](https://docs.lucrasports.com/lucra-sdk/sdks-and-apis/api-reference.md)). Some
  guides still link to legacy API pages; prefer Forge where both exist.

## Webhooks

Subscriptions are managed through the webhook subscriptions API
([Webhook Subscriptions](https://docs.lucrasports.com/lucra-sdk/server-to-server/webhook-subscriptions.md)).
A tenant can have up to 5 configs, and some transactional events can live in only one config.

**Verify every request** ([Request Verification](https://docs.lucrasports.com/lucra-sdk/server-to-server/webhook-subscriptions/request-verification.md)):

1. Read the `X-Lucra-Signature` header. Reject the request if it's missing.
2. Compute an HMAC of the **raw request body bytes** with the webhook's shared secret. Read the raw body
   before any JSON parsing; parsing and re-serializing changes the bytes and breaks the signature.
3. Compare with a constant-time function (`crypto.timingSafeEqual` in Node).
4. On a mismatch, respond 401 or 403 and don't process the event.
5. Only then parse the JSON and handle the event.

The shared secret comes from the Lucra representative through a one-time link. Load it from the
environment, never hard-code it. Follow the docs' example for the exact header format, and confirm the
algorithm with Lucra if the docs and the header you receive disagree.

**Process events safely.** Make handlers safe to run twice for the same event (key on the event's ids, such
as a `transactionId`), so a repeated delivery or your own retry can't double-count. Respond quickly and do
slow work afterwards. Events include `FundsDeposited`,
`UserSignedUp`, `UserKYCVerified`, tournament events, and Games You Play events
([General Events](https://docs.lucrasports.com/lucra-sdk/server-to-server/webhook-subscriptions/general-events.md)).

## Scores and products

- **Tournaments:** create and manage tournaments, receive tournament webhooks, and submit scores, including
  metadata-driven score submission
  ([Headless Tournaments Backend Integration](https://docs.lucrasports.com/lucra-sdk/tournaments/headless-tournaments/headless-tournaments-backend-integration.md),
  [Backend Metadata Driven Score Submission](https://docs.lucrasports.com/lucra-sdk/tournaments/headless-tournaments/metadata-driven-score-submission.md)).
  Scores are submitted for a Lucra user, so keep the mapping from your user to their Lucra user.
- **Free to play:** [Free to Play Backend Integration](https://docs.lucrasports.com/lucra-sdk/games-you-play-gyp/free-to-play/free-to-play-backend-integration.md).
- **Convert to credit:** [Convert to Credit Backend Integration](https://docs.lucrasports.com/lucra-sdk/convert-to-credit/convert-to-credit-backend-integration.md).

## Rotating credentials

If a key or webhook secret may be exposed (a leaked repo, a hosting provider incident):

- **Backend key:** ask Lucra for a new key. Both can stay active while you deploy; then ask Lucra to revoke
  the old one.
- **Webhook secret:** a config has one secret, so rotation means a **new webhook config** with a new
  secret. Keep it inactive until your server accepts the new secret, switch over, then delete the old
  config.

Coordinate both with the Lucra contact, and confirm each step before revoking anything.
