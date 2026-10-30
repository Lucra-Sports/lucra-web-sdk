#!/usr/bin/env bash
# Builds the workspace every case starts from: a small Vite + TypeScript app that already mounts the
# Lucra Web SDK, the way an integrator's app looks partway through an integration.
# lucra-web-sdk is copied into node_modules from this checkout (dist/, docs/, package.json, README),
# which is what installing from the GitHub tag gives an integrator. No network is needed.
# Usage (from a case's fixture.sh): bash "$FIXTURES/scaffold-app.sh" <variant>
set -euo pipefail

fixtures="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$fixtures/../.." && pwd)"
variant="${1:-base}"

mkdir -p src node_modules/lucra-web-sdk
cp -R "$repo/dist" "$repo/docs" "$repo/package.json" "$repo/README.md" node_modules/lucra-web-sdk/

cat > package.json <<'EOF'
{
  "name": "arcade-app",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "tsc && vite build" },
  "dependencies": { "lucra-web-sdk": "github:Lucra-Sports/lucra-web-sdk#v1.14.0" },
  "devDependencies": { "typescript": "^5.6.0", "vite": "^6.0.0" }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
EOF

cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <div id="lucra-host"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
EOF

cp "$fixtures/$variant/lucra.ts" src/lucra.ts
cp "$fixtures/$variant/main.ts" src/main.ts

# Vite apps ship this; without it import.meta.env doesn't type-check.
cat > src/vite-env.d.ts <<'TS'
interface ImportMeta {
  readonly env: Record<string, string>;
}
TS
