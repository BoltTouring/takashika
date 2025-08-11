# WaniKani Review PWA

A Progressive Web App for reviewing WaniKani items with support for excluded items (items marked with `#tsurukameExclude` in Tsurukame).

## Features

- ✅ **Exclusion Support**: Automatically filters out items you've excluded in Tsurukame
- ✅ **Progressive Web App**: Can be installed on any device
- ✅ **Offline Support**: Works offline with cached data
- ✅ **Clean Interface**: Modern, mobile-friendly design
- ✅ **Real-time Progress**: Sends progress to WaniKani API
- ✅ **Statistics**: Track your review performance

## Setup

### 1. Get Your WaniKani API Token

1. Go to [WaniKani Settings](https://www.wanikani.com/settings/personal_access_tokens)
2. Create a new API token
3. Copy the token (you'll need it to log in)

### 2. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Upload all files from the `www` folder to the repository
3. Go to Settings → Pages
4. Set source to "Deploy from a branch"
5. Select "main" branch and "/ (root)" folder
6. Click "Save"

Your app will be available at `https://yourusername.github.io/your-repo-name`

### 3. Install on Your Device

#### Android (GrapheneOS)
1. Open the app URL in your browser
2. Tap the menu button (⋮)
3. Select "Add to Home screen" or "Install app"
4. The app will now appear on your home screen

#### iOS
1. Open the app URL in Safari
2. Tap the share button
3. Select "Add to Home Screen"
4. The app will now appear on your home screen

## How It Works

### Exclusion System
The app reads your study materials from WaniKani and looks for items with `#tsurukameExclude` in the meaning note. These items are automatically filtered out of your review queue.

### Review Process
1. **Login**: Enter your WaniKani API token
2. **Load Data**: The app fetches your assignments, subjects, and study materials
3. **Filter**: Excluded items are removed from the review queue
4. **Review**: Answer meaning or reading questions
5. **Progress**: Your answers are sent to WaniKani

### Task Types
- **Radicals**: Always meaning questions
- **Kanji**: Primarily reading questions
- **Vocabulary**: Primarily reading questions

## File Structure

```
www/
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── app.js              # Main JavaScript application
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── README.md          # This file
└── icons/             # App icons (you'll need to create these)
```

## Creating Icons

You'll need to create app icons in various sizes. You can use any image editor or online tool to create:

- 72x72.png
- 96x96.png
- 128x128.png
- 144x144.png
- 152x152.png
- 192x192.png
- 384x384.png
- 512x512.png

Place them in an `icons` folder.

## Customization

### Changing Colors
Edit the CSS variables in `styles.css`:
```css
:root {
  --primary-color: #4A90E2;
  --background-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### Adding Features
The main logic is in `app.js`. You can extend the `WaniKaniReviewer` class to add:
- Different review modes
- Custom answer checking
- Additional statistics
- Sound effects

## Troubleshooting

### API Token Issues
- Make sure your API token is correct
- Check that your WaniKani account is active
- Verify the token has the necessary permissions

### No Reviews Available
- Check if you have any reviews due
- Verify that excluded items aren't filtering out all your reviews
- Try refreshing the app

### Installation Issues
- Make sure you're using HTTPS (required for PWA)
- Clear browser cache and try again
- Check that the manifest.json is accessible

## Security

- Your API token is stored locally in your browser
- The app only makes requests to the official WaniKani API
- No data is sent to any third-party servers

## License

This project is based on the Tsurukame exclusion system and is subject to the same Apache 2.0 license.
