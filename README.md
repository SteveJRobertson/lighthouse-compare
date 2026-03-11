# lighthouse-compare

A client-side webapp to compare two <a href="https://developer.chrome.com/docs/lighthouse/overview/" target="_blank" rel="noopener noreferrer">Lighthouse</a> JSON reports and display the differences in a visual manner.

## Features

- **Drag-and-drop** or click-to-browse upload of two Lighthouse JSON report files
- **Category score gauges** — side-by-side SVG gauge charts for Performance, Accessibility, Best Practices, SEO, and PWA
- **Score delta indicators** — colour-coded deltas (🟢 green for improvements, 🔴 red for regressions, ⚪ grey for unchanged)
- **Summary bar** — at-a-glance counts of improved / unchanged / regressed audits
- **Audit comparison table** — full audit-level diff with display values from both reports
- **Filter & search** — quickly narrow the audit table by delta status or audit name

## Live Demo

The app is deployed to GitHub Pages: <a href="https://stevejrobertson.github.io/lighthouse-compare/" target="_blank" rel="noopener noreferrer">https://stevejrobertson.github.io/lighthouse-compare/</a>

## Usage

1. Visit the <a href="https://stevejrobertson.github.io/lighthouse-compare/" target="_blank" rel="noopener noreferrer">live demo</a> or open `index.html` locally in any modern browser (no build step required).
2. Drop or select your **Report A** Lighthouse JSON file.
3. Drop or select your **Report B** Lighthouse JSON file.
4. Click **Compare reports**.

> **Tip:** Export a Lighthouse report as JSON from Chrome DevTools → Lighthouse tab → ⋮ → *Save as JSON*.

## Development

```bash
npm install       # install dev dependencies (Jest)
npm test          # run the 30 unit tests
```

All comparison logic lives in `src/app.js` as pure, testable functions. The browser bootstrap code (file reading, DOM rendering) is guarded behind `typeof window !== 'undefined'` so it never runs during tests.

## Screenshot

![Lighthouse Compare screenshot](https://github.com/user-attachments/assets/1e9e75e7-756d-4701-a86b-0e6cda5bc38d)
