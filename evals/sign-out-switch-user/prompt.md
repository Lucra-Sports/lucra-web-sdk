---
description: >
  Signing out of the integrator's app leaves Lucra signed in as the previous user (CHA-995).
tags: [auth]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

When someone signs out of our app and a different person signs in on the same computer, the Lucra wallet still shows the first person's account. Fix it. Our sign-out is in src/main.ts.
