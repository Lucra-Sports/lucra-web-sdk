---
type: regex
target: { source: file, path: src/lucra.ts }
# Any of the ways to tell a failed initialization from a logged-out user.
pattern: 'instanceof\s+LucraUserNotLoggedIn|\.success\s*===\s*false|isInitialized'
---
