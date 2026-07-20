# Hood Run

Hood Run is an original, three-lane endless city runner. Burst out of City Trust Bank, lose the pursuing officers, follow intersection arrows, dodge city hazards, collect coins, chain stylish moves, and fill the Crosstown meter to trigger Block Party.

## Play locally

Serve this folder with any static web server, then open `index.html` through that server. The game uses JavaScript modules, so opening the file directly from disk is not supported by every browser.

## Controls

- Left/Right Arrow or A/D: change lanes and turn at intersections
- Up Arrow, W, or Space: jump
- Down Arrow or S: slide
- Escape or P: pause
- Mobile: swipe in the matching direction

## Included in this build

- Self-avoiding procedural 3D city blocks and turning streets
- Opening bank escape and two-officer pursuit
- Three visual districts: The Block, Market Mile, and Downtown Cut
- Jump, slide, lane-change, turn, stumble, crash, and restart states
- Coins, four power-ups, Style multiplier, and Block Party meter
- Persistent high scores, lifetime stats, and three starter missions
- Synthesized music and sound effects with a mute control
- Desktop and touch input
- Fixed-step gameplay simulation and lightweight object recycling
- Built-in test/debug handle at `window.__hr`
- Generation stress test covering 500 seeds and 90,000 blocks

## Test handle

The browser console exposes `window.__hr` with helpers to start a run, send actions, advance the simulation, inspect state, and enable collision immunity. This is intended for repeatable smoke and soak checks.

## Project guide

The full product direction, expansion plan, acceptance criteria, and content rules live in `HOOD_RUN_DESIGN_BIBLE.md`.
