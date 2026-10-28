# Skill evals

Agent evals for the Web SDK skills in `docs/skills/`. Each case gives a fresh Claude Code agent a small
Vite + TypeScript app that already uses the SDK, asks for a change an integrator would ask for, and grades
the code it writes. Every case runs twice, with our skills loaded and without them, so the report shows
what the skills add.

The cases come from real integration failures. See CHA-1017 in Linear.

## Run locally

Needs Claude Code 2.1.269 or later, signed in. Runs use your own Claude Code login.

```sh
bun run build   # the fixture app installs this checkout's dist/ and docs/

# Iterate on one case: one run, skills only
claude plugin eval . --trust-plugin --scaffold --allow-tools Write Edit \
  --case headless-deposit --runs 1 --ablation none --model sonnet --no-publish

# Full suite, with the no-skills baseline
claude plugin eval . --trust-plugin --scaffold --allow-tools Write Edit \
  --model sonnet -j 4 --no-publish --max-cost-usd 5
```

`--scaffold` runs each case's `fixture.sh` as you, outside the sandbox. It only copies this checkout into a
temporary workspace. Results and the HTML report go to `evals/results/`, which is gitignored because it
contains transcripts.

## Layout

- `.claude-plugin/plugin.json` (repo root) packages `docs/skills/` as a plugin, so the evals load the skills
  exactly where they live. Nothing under `docs/` changes, and `evals/` stays out of the GitBook sync.
- `fixtures/scaffold-app.sh` builds the workspace: the app, plus `node_modules/lucra-web-sdk` copied from
  this checkout (`dist/`, `docs/`, `package.json`, `README.md`), which is what installing from the GitHub tag
  gives an integrator. `fixtures/<variant>/` holds each variant's `src/` files.
- `<case>/prompt.md` is the request, `<case>/case.yaml` points at its fixture, and `<case>/graders/` holds
  the checks.

## Writing a case

- Base it on a real integration failure, and write the prompt the way an integrator would ask: describe the
  symptom, not the fix.
- Grade the file the agent changes with `regex` graders where a pattern is enough, and keep `llm` graders
  for judgments a pattern can't make, with concrete PASS and FAIL conditions.
- Add a `tool_used: Skill` grader so the report shows whether our skill fired.
- Make sure the fixture compiles: `tsc -p .` in a scaffolded copy.

Reference: https://code.claude.com/docs/en/plugin-evals
