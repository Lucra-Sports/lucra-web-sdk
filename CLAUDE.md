# Repo rules

## Build & test

- Build: `bun run build` (runs `tsc`). Test: `bun test`.

## Committed `dist/`

- `dist/` is checked in and is the published artifact — the package is installed from a GitHub tag, not built on install. After any source change, run `bun run build` and commit the regenerated `dist/` together with the source. Stale `dist/` ships broken code to consumers.

## Wire contract with lucra-web-app

- The message enums/types in `types/types.ts` are the postMessage contract shared with `lucra-web-app` (which consumes this package via a pinned GitHub tag) and with the embedding client app. A new message type/field only works end-to-end after a release and after the consumer bumps its dependency — so a change can look broken until it's released and consumers upgrade.

## Releases & versioning

- **Never edit the `version` field in `package.json`.** The version is bumped by a manual GitHub Action that owns releases. Leave it untouched even when adding CHANGELOG entries or new features.
- Document public-facing changes in `docs/CHANGELOG.md` under the next version heading (the heading may precede the automated version bump), and update the relevant `docs/*.md` when changing the public API.
- Releases are mirrored into the Linear **Web SDK** pipeline. Merges to `main` attach their issues to an open, unversioned release named **Next release**; merging the `Release:` PR stamps that same release with the tag and marks it **Released**. Work merged while a release PR is open still ships in that version — the tag lands on `main` after the release PR merges — so it belongs to that release and no reconciliation is needed.
- Linear finds issues through the **pull request**, not the commit message: merge commits carry `Merge pull request #N`, and Linear maps that back to whatever issue is linked to the PR. Branch names and commit subjects here rarely carry an identifier, so **a PR with no Linear issue linked to it is invisible to release tracking**.
