---
name: verify
description: Build/launch/drive recipe for verifying Spherescue changes end-to-end in a headless browser.
---

# Verifying Spherescue

Static site, no build step. Serve and drive with Playwright + system Chromium.

## Launch

```sh
python3 -m http.server 8811 --bind 127.0.0.1 &   # from the repo root
```

Drive with `playwright-core` (npm-install it in a scratch dir) pointing at the
preinstalled browser, e.g. `chromium.launch({ executablePath:
'/opt/pw-browsers/chromium-*/chrome-linux/chrome', args:
['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] })`.

## Handles

- `window.__game` is the debug hook (main.js): `state`, `hearts`, `timeLeft`,
  `board.realPieceCount()`, `progress`, `input.queue`, `audio`, `heldShape()`.
- Menus are real DOM: `button[data-mode="rescue"|"puzzle"|...]`,
  `#puzzle-grid button`, `#pause button[data-quit]`, `#save-in`, `#load-code`.
- Gameplay input goes through `page.keyboard` (Space drop, arrows, Shift grab,
  KeyR reset, KeyM music, Escape pause) — this exercises the real input path.

## Flows worth driving

- Solve puzzle 1: start it, `waitForFunction(() => __game.heldShape() === 'O4')`,
  press Space, expect `state === 'win'` and "SOLVED!" in `#msg` after ~2.5s.
  **Gotcha:** puzzle drops are wild (morphing) — dropping without waiting for
  the right shape legitimately fails to combo.
- Time Trial lose/retry: set `__game.timeLeft = 0.05`, wait for TIME UP,
  press Space, expect a fresh run (`timeLeft ≈ 300`, `score 0`).
- Watch `page.on('console'/'pageerror')` for the whole session — the game
  should be error-free.
- Audio needs a user gesture; any keydown unlocks it. Check
  `__game.audio.ctx.state === 'running'` before asserting audio behavior.
