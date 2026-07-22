# HOOD RUN

A browser endless runner built to `HOOD_RUN_DESIGN_BIBLE.md`. Jay bursts out of
City Trust Bank with the score, and the whole city becomes the getaway: three
lanes, real corner turns, alley shortcuts, a Style Chain, and Block Party mode —
all while the (strictly cartoon, strictly nonviolent) patrol jogs after you.

> Architecture note: this is the **modular** build the bible's §14 asks for —
> gameplay lives in `src/*.js`, not one giant inline script (§20 guardrail). An
> earlier single-file build is preserved in git history.

## Run it

No build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```powershell
# from the workspace root (serves everything, incl. /hood-run/)
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8402
# then open http://localhost:8402/hood-run/index.html
```

Desktop: arrows/WASD (turn at corners with ⬅➡), Space/W jump, S slide, Esc/P pause.
Mobile: swipe in the four directions, tap to jump.

## Architecture (bible §14)

```
index.html                shell, CSS, screen DOM
src/data.js               ALL tuning + hazard/district/mission/cosmetic content + daily seed
src/game.js               state machine, fixed-step (60 Hz) deterministic sim
src/segment-generator.js  seeded route + content gen, per-segment forked rng
src/collisions.js         lane-aware hitboxes, one-result rule, fairness validator
src/world.js              scene, lighting, district palettes, canvas textures, props
src/runner.js             Jay's mesh, cosmetics, poses, trail particles
src/vfx.js                pooled particle juice (coin/land/crash/party/near-miss/pow)
src/input.js              keyboard + swipe → abstract actions
src/progression.js        missions, coins/tokens, cosmetics
src/save.js               versioned save (v1), migration, corruption fallback
src/audio.js              synth: 3-layer street track + pooled SFX
src/ui.js                 screens/HUD only — owns no game rules
src/main.js               wiring, view/camera, render loop, adaptive quality, __hr
manifest.webmanifest, sw.js, icon.svg   installable offline PWA shell
```

Cash you collect (banded stacks of bills — Jay is carrying a bank score, not
loose change) is spent in two places: the **Corner Store** for one-run supplies
(Head Start, Fresh Start shield, Payday doubler) and permanent power-up
upgrades, and **Jay's Closet** for cosmetics. Consumables are deliberately NOT
spent on Daily Challenge runs, so that shared-seed board stays comparable.

Content: four districts (The Block → Market Mile → Downtown Cut → **Night
Market**, rotating every 850m), 25 hazards, two shortcut routes (**alley** and
the elevated **rooftop** run — jump-focused, unlocks past 600m, telegraphed by
a purple ROOFS gate), four power-ups, and 36 cosmetics across six slots
including **victory poses**.

Extras beyond the core loop: **Daily Challenge** (one seeded city per day,
shared by everyone, with a per-day best + day streak), **particle VFX** + speed
lines (all reduced-motion aware), a **debug overlay** (§14 — toggle with the
backtick `` ` `` key: seed, fps, tier, pool sizes, gap, upcoming hazards), a
**lifetime-stats** panel on the Missions screen, and **PWA install / offline**
support via a service worker.

Key invariants:

- **Determinism**: every gameplay roll comes from `makeRng(hash2(runSeed, segIndex))`.
  Same seed + same inputs ⇒ identical score (verified). `Math.random` is allowed
  only in view/audio/UI code.
- **Fixed step**: sim runs at 60 Hz via an accumulator; rendering never changes
  game speed. `window.__hrManual` (set by `__hr.tick`) detaches the loop for tests.
- **Split segments** build BOTH street and alley variants up front (dormant
  alley), so route choice never perturbs the rng stream.
- **Origin rebase** every ~420 m keeps float coords small on long runs.
- **One collision result** per step: clear / shield save / stumble / crash.
  Stumbles close the patrol `gap`; gap < 2 m ⇒ caught.

## Test it

Open the game, then in the console:

```js
__hrTest = true                    // let the sim run in a hidden tab
__hr.start(12345); __hr.skipTut()  // seeded run
__hr.tick(1/60, 600)               // step the sim manually
__hr.state()                       // full sim snapshot
__hr.obsAhead(5)                   // upcoming hazards
__hr.god(true)                     // no-death soak mode
__hr.save() / __hr.resetSave()
__hr.gl()                          // { scene, camera, renderer, THREE }
```

Acceptance battery this build passed: 100-seed × 40 s god soaks (0 errors,
bounded memory), 10-minute single run (16.6 km, arrays stay pruned), determinism
fingerprint, tutorial completion, shield/stumble/caught paths, mission
completion + rotation, cosmetics buy/equip, save round-trip + corrupted-JSON
recovery, single-award of run results, restart leak check, input mashing,
320×568 HUD fit.

## Tune it

Everything numeric lives in `src/data.js` (`TUNE`, `HAZARDS`, `DISTRICTS`,
`MISSIONS`, `COSMETICS`). Difficulty phases are `TUNE.phases`; pursuit feel is
`TUNE.gap*`; style/meter economy is `TUNE.styleGain` / `meterGain`.

## Deploy

Fully static — push the folder to any static host (GitHub Pages: repo →
Settings → Pages → main). `lib/three.module.js` (r160) ships locally; there are
no external requests. `npm run build` mirrors the runtime files into `dist/`.
