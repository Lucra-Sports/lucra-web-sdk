---
description: >
  A join from a deep link times out on page load and the integrator blames Lucra. Real context: symptoms were
  debugged by hand across long threads; a write sent before the user is logged in is never answered and
  times out, and retrying a write blindly can double-submit.
tags: [troubleshooting]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

When users open our join link (/join?tournament=…), they wait about 45 seconds and then see "Lucra is down, try again later". The console shows "join attempt N failed Timeout" three times. If they click Join later from inside the app, it works. Is Lucra down? What's going on? The code is in src/main.ts.
