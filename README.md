# andrespontt.github.io

Last updated: 2025-01-27

Personal website and playground for Andres Pontt, hosted on GitHub Pages. The site is fully static (plain HTML/CSS/JS) with no build step.

## What's Inside

### Pages
- **Home**: `index.html` - Main landing page with app showcase
- **About**: `pages/bio.html` - Personal bio and information
- **Experiments**: `pages/experiments.html` - Three.js demos and experiments
- **Music**: `pages/music.html` - Simple audio player
- **404**: `404.html` - Custom error page

### Apps & Games
Located in the `apps/` directory:
- **Type Quest** (`type-quest.html`) - Educational typing game for kids ages 3-6, built to help improve reading and typing skills with multiple modes, virtual keyboard, and TTS
- **Type & Shine** (`games.html`) - Kids typing game with cat animations
- **Perfect Pitch** (`perfect-pitch.html`) - Music training app to develop perfect pitch (difficulty levels, A4 440/432, diatonic/chromatic)
- **Pomodoro** (`pomodoro.html`) - Focused productivity timer with saved progress, sounds, notifications, and daily rankings
- **Math Screener** (`math-screener.html`) - Educational math assessment tool for young learners, testing counting, number comparison, and basic addition skills

## Local Preview

- Option 1: open any HTML file directly in your browser.
- Option 2: run a tiny local server from the repo folder and browse to http://localhost:8000

  - Python 3: `python3 -m http.server 8000`

## Deploy

Push changes to the default branch. GitHub Pages serves files directly from the repository.

## Project Structure

```
├── index.html              # Home page
├── 404.html               # Custom 404 page
├── pages/                 # Additional pages
│   ├── bio.html
│   ├── experiments.html
│   └── music.html
├── apps/                  # Interactive apps and games
│   ├── type-quest.html
│   ├── games.html
│   ├── perfect-pitch.html
│   ├── pomodoro.html
│   └── math-screener.html
├── assets/                # Shared resources
│   ├── pages.css         # Main stylesheet
│   ├── nav.js            # Navigation system
│   ├── manifest.webmanifest
│   └── icons/
└── sw.js                  # Service worker for offline support
```

## Features

- ✅ Fully responsive design
- ✅ Dark theme
- ✅ Progressive Web App (PWA) support
- ✅ Offline functionality via service worker
- ✅ Accessible (WCAG AA compliant)
- ✅ SEO optimized with meta tags
- ✅ Fast loading (static site, no build step)

## Editing Tips

- **Navigation**: The navigation is managed by `assets/nav.js` - update the links array to add/remove items
- **Styles**: Common styles are in `assets/pages.css`. Avoid inline styles when possible.
- **Adding new pages**: 
  1. Create the HTML file
  2. Add navigation link in `assets/nav.js`
  3. Update noscript navigation fallback in all pages
  4. Add SEO meta tags
  5. Include skip link and semantic HTML

## License

MIT — see `LICENSE`.
