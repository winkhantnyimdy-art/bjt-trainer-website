#!/usr/bin/env bash
#
# OPTIONAL helper: materialize ./app/ from the pinned BJT Trainer Web/PWA ZIP.
#
# This script is NOT part of the Netlify build any more. The build command in
# netlify.toml publishes the ./app/ that was staged locally and verified by
# tools/qa.js, and it never calls this file.
#
# Why it was removed from the build: it pinned one specific release ZIP, then
# ran `rm -rf app` and unzipped over it. When the pin was left behind on an
# older build, running it silently replaced a correctly staged ./app/ with
# stale files — including a Flutter build whose text theme still fell back to
# Roboto and needed a network font fetch. Keeping the script reachable but out
# of the build means a stale ZIP can no longer damage a staged payload by
# accident.
#
# Use it only when you deliberately want ./app/ to come from the release ZIP
# instead of a local Flutter build, and only after confirming that asset exists
# and that the SHA-256 below is the one you expect. curl -f fails loudly on a
# missing asset rather than deploying something unexpected.
#
# Requirements in the build environment: curl, sha256sum, unzip, mktemp.
#
# Local use:  bash tools/fetch-pwa.sh
#
# WARNING: this OVERWRITES ./app/ completely.
set -euo pipefail

# Pinned release asset for the 1.0.0 web build (root-content ZIP, no wrapper
# directory). PWA_SHA256 is the SHA-256 of that asset.
PWA_VERSION="1.0.0"
PWA_ZIP_URL="https://github.com/winkhantnyimdy-art/bjt-trainer-website/releases/download/v1.0.0/bjt-trainer-web-1.0.0.zip"
PWA_SHA256="d5d71184c57e9c74b002ae3972c4ee8ddcc59641fe78abb7fd1585014561d9ad"
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
