---
description: >
  An integrator asks whether their integration is ready to launch. Seen in a real launch: the partner said
  "everything works" while deposits stranded headless users in Lucra's screens, so production keys were
  held back. The fixture has three gaps: a headless deposit through dialog().wallet(), sign-out that doesn't
  sign the user out of Lucra, and no exitLucra handling.
tags: [go-live]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We think our Lucra integration is done and we'd like to ask Lucra for production keys. Can you check whether it's ready to launch and tell us what's left? The app is in src/.
