#!/bin/bash

set -euo pipefail

echo "Takashika deployment helper"
echo "==========================="

if ! command -v git >/dev/null 2>&1; then
    echo "Git is required."
    exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Run this from inside the repository."
    exit 1
fi

required_files=(
    "index.html"
    "styles.css"
    "app.js"
    "manifest.json"
    "sw.js"
    "js/reviewer.js"
    "js/answer-checker.js"
    "js/audio-manager.js"
    "js/review-queue.js"
    "js/wanikani-client.js"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Missing required file: $file"
        exit 1
    fi
done

echo "Repository looks complete."
echo
echo "Recommended next steps:"
echo "1. Run tests: npm test"
echo "2. Commit changes: git add . && git commit -m 'Update Takashika'"
echo "3. Push to GitHub: git push origin main"
echo "4. Publish the repo root with GitHub Pages or another static host"
echo "5. Install the deployed site as a desktop or mobile web app"
