# andrespontt.github.io

Personal website and playground for Andres Pontt, hosted on GitHub Pages. The site is fully static (plain HTML/CSS/JS) with no build step.

## What’s Inside

- Home: `index.html`
- About: `bio.html`
- Experiments (Three.js demos): `experiments.html`
- Music (simple audio player): `music.html`
- Games:
  - `games.html` – Type & Shine (kids typing game)
  - `type-quest.html` – Type Quest (modes, virtual keyboard, TTS)

## Local Preview

- Option 1: open any HTML file directly in your browser.
- Option 2: run a tiny local server from the repo folder and browse to http://localhost:8000

  - Python 3: `python3 -m http.server 8000`

## Deploy

Push changes to the default branch. GitHub Pages serves files directly from the repository.

## Editing Tips

- The navigation bar is duplicated across pages. When adding a new page, update links in each file to keep the menu consistent.
- Keep styles inline per page for now to stay simple; consider extracting common CSS if reuse grows.

## License

MIT — see `LICENSE`.
