#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
# Compile production logic against API doubles; UIKit integration needs the Xcode test target.
sed '/^import WaniKaniAPI$/d' "$root/ios/ReviewItem.swift" > "$scratch/ReviewItem.swift"
sed '/^import WaniKaniAPI$/d' "$root/ios/ReviewSession.swift" > "$scratch/ReviewSession.swift"
swiftc -module-cache-path "$scratch/module-cache"   "$root/tests/NativeReviewStubs.swift" "$scratch/ReviewItem.swift" "$scratch/ReviewSession.swift"   "$root/tests/NativeReviewChecks.swift" -o "$scratch/checks"
"$scratch/checks"
