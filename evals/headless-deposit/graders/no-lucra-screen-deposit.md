---
type: regex
target: { source: file, path: src/main.ts }
match: not_contains
pattern: '\.(dialog|redirect|open)\([^)]*\)\s*\.(wallet|profile|deposit)\(\)'
---
