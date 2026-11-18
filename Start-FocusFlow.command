#!/bin/sh
set -eu

# Finder can start a .command file in any working directory.
unset CDPATH
cd "$(dirname "$0")"

if [ "$#" -eq 0 ]; then
  set -- start -- --personal
elif [ "$1" = "--review" ] && [ "$#" -le 2 ]; then
  name=${2-local}
  case "$name" in
    ''|-*|*[!a-zA-Z0-9-]*) echo "Use a review name made of letters, numbers and hyphens." >&2; exit 2 ;;
  esac
  if [ "${#name}" -gt 48 ]; then echo "Use a review name of up to 48 characters." >&2; exit 2; fi
  set -- run review -- "$name"
else
  echo "Usage: ./Start-FocusFlow.command [--review NAME]" >&2
  exit 2
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null ||
   ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 24 && minor >= 12 ? 0 : 1)'; then
  echo "Install Node.js 24.12 or a later 24.x version with npm, then reopen FocusFlow." >&2
  exit 1
fi

# Refresh pinned dependencies on first launch, after a lockfile change or when switching architecture.
stamp=node_modules/.focusflow-mac-dependencies
expected=$(node -e 'const hash = require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync("package-lock.json")).digest("hex"); console.log([process.platform, process.arch, hash].join("-"))')
if [ "$(cat "$stamp" 2>/dev/null || true)" != "$expected" ] ||
   ! node -e 'for (const name of ["typescript","electron","esbuild","react","react-dom","motion","@fontsource-variable/inter"]) require.resolve(name)' >/dev/null 2>&1; then
  npm ci --include=dev --include=optional --no-audit --no-fund
  printf '%s\n' "$expected" > "$stamp"
fi

node node_modules/electron/install.js
if [ "$1" != "start" ]; then
  # Review and preview launches stay in this window, which reports when the app is ready.
  exec npm "$@"
fi
npm run build
electron=$(node -e 'process.stdout.write(require("electron"))')
# Start the everyday app on its own, so this Terminal window can close while FocusFlow keeps
# running in the menu bar.
"$electron" . --personal >/dev/null 2>&1 &
