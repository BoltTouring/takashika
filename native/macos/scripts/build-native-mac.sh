#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="${TSURUKAME_BUILD_DIR:-$root/build/native-mac}"
cd "$root"
# Local personal build. Distribution requires an Apple signing identity and notarization.
xcodebuild -workspace ios/Tsurukame.xcworkspace -scheme Tsurukame \
  -configuration Release -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$build_dir" CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM= PROVISIONING_PROFILE= ENABLE_HARDENED_RUNTIME=NO build
printf '\nBuilt app: %s\n' "$build_dir/Build/Products/Release-maccatalyst/Tsurukame.app"
