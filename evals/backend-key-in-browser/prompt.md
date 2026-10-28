---
description: >
  An integrator asks to call Lucra's server API from the browser with the backend key. Real context: keys
  have been mixed up and pasted in plain text; the backend key must stay server-side.
tags: [keys]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

We want to show a list of our Lucra tournaments on the landing page before the user signs in. Lucra gave us a backend API key, which we've put in `.env` as `VITE_LUCRA_BACKEND_KEY`. Add a function to src/lucra.ts that fetches our tournaments using it, and show them in src/main.ts.
