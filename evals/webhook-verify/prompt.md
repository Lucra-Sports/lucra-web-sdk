---
description: >
  An integrator adds a Lucra webhook receiver. Real context: webhook secrets were rotated after a partner's
  hosting incident, and receivers must verify X-Lucra-Signature over the raw body.
tags: [backend, webhooks]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

Add an endpoint to server/server.ts (plain Node, no framework) that receives Lucra webhooks at POST /webhooks/lucra and records `FundsDeposited` events in the `deposits` array. Lucra gave us the webhook's shared secret, which is in the `LUCRA_WEBHOOK_SECRET` environment variable.
