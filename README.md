# andrespontt.github.io

Last updated: 2026-04-24

Personal website and playground for Andres Pontt, hosted on GitHub Pages. The site is fully static (plain HTML/CSS/JS) with no build step.

## What's Inside

### Pages
- **Home**: `index.html` - Main landing page with app showcase
- **Experiments**: `pages/experiments.html` - Three.js demos and experiments
- **404**: `404.html` - Custom error page
- **Offline**: `offline.html` - Offline fallback page for the root service worker

### Apps & Games
Located in the `apps/` directory:
- **ABC Learning** (`abc.html`) - Interactive alphabet practice for young learners
- **Bridge Math** (`bridge-math.html`) - Equation game where correct answers rebuild a bridge
- **Chromatic Keyboard** (`keyboard.html`) - Browser keyboard with octave controls
- **Coding Hero** (`coding_hero.html`) - Typing practice for coding characters
- **Count Cats** (`count-cats.html`) - Counting game for kids
- **Flag Millionaire** (`flag-millionaire.html`) - Flag quiz game with PWA support
- **Hacker News** (`hnews.html`, `hnews_view_comment.html`) - Simple Hacker News reader
- **Perfect Pitch** (`perfect-pitch.html`) - Music training app for pitch recognition
- **Pomodoro** (`pomodoro.html`) - Productivity timer with saved progress, sounds, notifications, and daily rankings
- **PWA Test** (`pwa.html`) - Progressive Web App capability demo
- **Shape Trace** (`shape-trace.html`) - Shape and letter tracing game
- **Toddler Puzzle** (`puzzle.html`) - Touch-friendly drag-and-drop shape puzzle
- **Type Quest** (`type-quest.html`) - Educational typing game for kids ages 3-6, built to help improve reading and typing skills with multiple modes, virtual keyboard, and TTS
- **Type & Shine** (`games.html`) - Kids typing game with cat animations
- **Math Screener** (`math-screener.html`) - Educational math assessment tool for young learners
- **World Clock** (`clock.html`) - Multi-timezone world clock

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
│   └── experiments.html
├── apps/                  # Interactive apps and games
│   ├── abc.html
│   ├── bridge-math.html
│   ├── clock.html
│   ├── count-cats.html
│   ├── flag-millionaire.html
│   ├── hnews.html
│   ├── keyboard.html
│   ├── math-screener.html
│   ├── pomodoro.html
│   ├── puzzle.html
│   ├── shape-trace.html
│   ├── type-quest.html
│   └── ...
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
  3. Update noscript navigation fallback in relevant pages
  4. Add SEO meta tags
  5. Include skip link and semantic HTML

## License

MIT — see `LICENSE`.
