---
description: >
  An integrator's startup code routes a failed initialization to login. Seen in a real launch: wrong
  production keys made `ready` reject with { success: false }, the app opened login anyway, and users
  waited 10+ seconds on "Connecting".
tags: [init, keys]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

Users say our app sits on "Connecting…" for 10+ seconds in production before Lucra's login shows up. In the browser console, `client.ready` rejects with `{ success: false }`, and our startup code in src/lucra.ts then opens Lucra's login screen. Sandbox works fine.

Fix our startup handling in src/lucra.ts, and tell me what's going on.
