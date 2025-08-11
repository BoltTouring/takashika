#!/bin/bash

# WaniKani Review PWA Deployment Script
# This script helps you deploy the PWA to GitHub Pages

echo "🚀 WaniKani Review PWA Deployment Script"
echo "========================================"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install git first."
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a git repository. Please run this script from a git repository."
    exit 1
fi

echo "✅ Git repository found"

# Check if we have the required files
required_files=("index.html" "styles.css" "app.js" "manifest.json" "sw.js")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
done

echo "✅ All required files found"

# Check if icons directory exists
if [ ! -d "icons" ]; then
    echo "⚠️  Warning: icons directory not found. Creating placeholder..."
    mkdir -p icons
    echo "Please add PWA icons to the icons/ directory"
fi

# Check if we're on main branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    echo "⚠️  Warning: Not on main branch. Current branch: $current_branch"
    echo "GitHub Pages typically uses the main branch."
fi

echo ""
echo "📋 Next steps:"
echo "1. Add all files to git:"
echo "   git add ."
echo ""
echo "2. Commit your changes:"
echo "   git commit -m 'Add WaniKani Review PWA'"
echo ""
echo "3. Push to GitHub:"
echo "   git push origin main"
echo ""
echo "4. Enable GitHub Pages:"
echo "   - Go to your repository on GitHub"
echo "   - Click Settings → Pages"
echo "   - Set source to 'Deploy from a branch'"
echo "   - Select 'main' branch and '/' folder"
echo "   - Click Save"
echo ""
echo "5. Your app will be available at:"
echo "   https://yourusername.github.io/your-repo-name"
echo ""
echo "6. Install on your device:"
echo "   - Open the URL in your browser"
echo "   - Tap the menu button (⋮)"
echo "   - Select 'Add to Home screen' or 'Install app'"
echo ""
echo "�� Happy reviewing!"
