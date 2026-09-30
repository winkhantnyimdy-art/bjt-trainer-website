#!/usr/bin/env bash
#
# Fetch the verified BJT Trainer Web/PWA build into ./app/ at deploy time.
#
# The production Flutter Web artifact (~141 MB of generated files) is never
# committed to this repository — the same policy that keeps the 153 MB APK
# out of git (see .gitignore). It ships as a versioned GitHub Release asset
# instead, and this script materializes it during every Netlify build, so a
# fresh Git deploy can never accidentally delete or skew /app/.
#
# Determinism: the exact release asset URL and its SHA-256 are pinned below.
# Any mismatch (wrong file, truncated download, silent replacement) fails
# the build instead of deploying a broken /app/.
#
# Requirements in the build environment: curl, sha256sum, unzip, mktemp.
# (All present in the Netlify Ubuntu build image.)
#
# Local use (also what Netlify runs):  bash tools/fetch-pwa.sh
# The result, ./app/, is gitignored. Manual/CLI deploys must run this first.
set -euo pipefail

PWA_VERSION="1.0.1"
PWA_ZIP_URL="https://github.com/winkhantnyimdy-art/bjt-trainer-website/releases/download/v1.0.0/bjt-trainer-web-1.0.1.zip"
PWA_SHA256="2db8d51da68133527dcd6587065aeabf3cde0b68f2227cd4fdbebe951474051d"
PWA_DIR="app"
PWA_TMP="$(mktemp /tmp/bjt-pwa.XXXXXX.zip)"

cleanup() { rm -f "$PWA_TMP"; }
trap cleanup EXIT

echo "fetch-pwa: downloading BJT Trainer web ${PWA_VERSION} ..."
curl -fL --retry 3 --retry-delay 5 -o "$PWA_TMP" "$PWA_ZIP_URL"

echo "fetch-pwa: verifying SHA-256 ..."
echo "${PWA_SHA256}  ${PWA_TMP}" | sha256sum -c -

rm -rf "$PWA_DIR"
mkdir -p "$PWA_DIR"
unzip -q -o "$PWA_TMP" -d "$PWA_DIR"

# The ZIP must contain the site files at its root (no wrapper directory),
# otherwise /app/ would 404 after an apparently successful deploy.
test -f "$PWA_DIR/index.html" || { echo "fetch-pwa: $PWA_DIR/index.html missing after unzip" >&2; exit 1; }
test -f "$PWA_DIR/manifest.json" || { echo "fetch-pwa: $PWA_DIR/manifest.json missing after unzip" >&2; exit 1; }
test -f "$PWA_DIR/bjt-trainer-sw.js" || { echo "fetch-pwa: $PWA_DIR/bjt-trainer-sw.js missing after unzip" >&2; exit 1; }
test -f "$PWA_DIR/main.dart.js" || { echo "fetch-pwa: $PWA_DIR/main.dart.js missing after unzip" >&2; exit 1; }

echo "fetch-pwa: BJT Trainer web ${PWA_VERSION} staged in ./${PWA_DIR}/"
