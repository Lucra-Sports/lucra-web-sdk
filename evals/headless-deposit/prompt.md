---
description: >
  A headless integrator adds deposits to a tournament join. Seen in real launches: deposits sent users
  into Lucra's screens with no way back, and the deposit popup was opened after an await, where
  browsers can block it.
tags: [deposit, headless]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

This is our web app. It uses the Lucra Web SDK (installed in node_modules/lucra-web-sdk) headlessly: we render Lucra tournaments in our own UI in src/main.ts, and src/lucra.ts sets up the client.

When a user who doesn't have enough balance taps Join, the join just fails. Make it so they can add funds and then the join goes through. Put your changes in src/main.ts.
