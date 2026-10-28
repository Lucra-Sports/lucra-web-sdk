---
type: regex
target: { source: file, path: src/lucra.ts }
match: not_contains
pattern: 'BACKEND_KEY|X-Lucra-Api-Key'
flags: i
---
