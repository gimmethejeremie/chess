# Project: Chess Playground (personal, non-commercial, for fun with 2-3 friends)
Static site deployed on GitHub Pages. No custom backend. Online play uses Firebase (free Spark plan).

## Stack
- Vite + Vanilla JS (ES modules), HTML, CSS. No UI framework.
- chess.js for rules (never write chess rules from scratch).
- Custom board renderer using Pointer Events (works for mouse AND touch). No HTML5 drag&drop API.
- Vitest for unit tests.
- Firebase JS SDK (modular v9+) for online mode: Realtime Database + Anonymous Auth.
- Vite `base` set to the repo name; relative asset paths; GitHub Actions workflow at .github/workflows/deploy.yml that builds and deploys to Pages.

## Modes (home screen with 3 cards)
1. Standard: rule-enforced chess.
2. Sandbox: free manual board, no rules, drag any piece anywhere, delete pieces, clear board.
3. Multiplayer: local hot-seat + online via Firebase, with chess clocks.

## Structure
/src/modes/{standard,sandbox,multiplayer}
/src/core/{board,clock,store,i18n,sounds,storage}
/src/net/ (Firebase layer behind an interface)
/public/assets/{pieces,sounds}

## Assets
Free/open-licensed only (e.g. Lichess open-source piece sets like cburnett/merida/alpha as SVG, CC0 sounds). Download into /public/assets (no runtime CDN dependency). Maintain ATTRIBUTIONS.md listing each asset, source URL, license.

## UI rules
Mobile-first responsive, touch-friendly. Light/dark theme. UI English by default with a Vietnamese toggle (simple JSON i18n). Settings persisted in localStorage.

## Working rules
- Keep modules small and commented.
- After each task: run the app, verify in browser (desktop + mobile viewport), fix console errors, give me a short summary.
- Ask me only if truly blocked; otherwise state assumptions.
