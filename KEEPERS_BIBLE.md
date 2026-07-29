# HOOD RUN — The Keeper's Bible

Written by Claude (Fable 5) for Kyle Fries, 2026-07-27. This is the ENGINEERING
continuity document: everything a future session — or a rebuild from nothing —
needs to take over where we left off. The DESIGN intent lives in
`HOOD_RUN_DESIGN_BIBLE.md` (Kyle's doc, the authority on premise and feel);
this file is the authority on how the code actually works and every trap we
paid for. Trust this file; verify only where the code visibly disagrees.

## What this is

A Temple Run-style 3-lane endless runner: **Jay sprints out of the City Trust
Bank with the money sack and the patrol chases him across four districts.**
Playful, nonviolent arcade fiction (design bible §20: no weapons, no brutality;
the officers are cartoon pursuit). Pure browser tech — three.js r160 CORE (no
addons except what we vendored), no build step required to run, PWA-installable.

- **Live**: https://kylefriesmarketing.github.io/hood-run
- **Repo**: `kylefriesmarketing/hood-run`, public. Pages serves from **master**
  root. Deploy = `git push origin master` (wait ~60s for Pages, then verify
  `curl .../sw.js | grep hood-run-v`).
- **Local dev**: root `serve.ps1` in the parent workspace, port 8402
  (`.claude/launch.json` name "hood-run"). No file:// — ES modules.
- **This folder is its own git repo.** The surrounding "New folder" workspace
  has NO usable git — the deploy repo is the only undo.

## Architecture (one screen)

```
index.html      app shell: all CSS, overlay DOM, import map ("three" -> lib/)
sw.js           service worker; BUMP const CACHE per deploy or clients stay stale
lib/            three.module.js r160 CORE + vendored addons (UNMODIFIED):
                loaders/GLTFLoader.js, utils/BufferGeometryUtils.js,
                utils/SkeletonUtils.js  — resolved via the import map
src/
  main.js       boot, view loop, chase cam, officers, closet preview, __hr harness
  game.js       THE SIM. Deterministic 60Hz fixed step. State machine
                boot->home->countdown->running->paused->crashed->results
  segment-generator.js  procedural city path; 90° junctions; split shortcuts
  collisions.js one collision result per step: clear/shieldSave/stumble/crash
  data.js       ALL tuning: TUNE, DISTRICTS, HAZARDS, COSMETICS, missions
  world.js      scene/lighting/districts/canvas textures/props/segments/prune
  runner.js     Jay: build, cosmetics, pose routing, trail
  rig.js        skinned character system (see below)
  character.js  capsule humanoid — the synchronous FALLBACK, do not delete
  pbr.js        photo material sets (assets/tex), profiles, repaint queue
  geo.js        hand-rolled box-merger with vertex colours (~1 draw call/block)
  postfx.js     vignette/grade/CA/bloom chain (per-renderer)
  progression.js / save.js / audio.js / ui.js / input.js / vfx.js
assets/tex/     CC0 PBR sets, 512px, ORM-packed (ambientCG) — see CREDITS.md
assets/rig/human.glb  CC0 Quaternius "Animated Human" — see CREDITS.md
```

## The iron invariants

1. **Determinism**: every gameplay roll comes from `makeRng(hash2(runSeed,
   segIndex))`. `Math.random` is allowed ONLY in view/audio/UI. Same seed +
   same save-derived inputs => identical run. Segments build BOTH street and
   shortcut variants up front so route choice never shifts the rng stream.
2. **Determinism tests must pin ALL save-derived inputs**: `tutorialDone=true`,
   zero `store.stock`, fixed `store.upgrades` — stock is consumed at startRun
   and upgrades change power-up durations, so run 1 vs run 2 legitimately differ.
3. **Characters are modelled facing +z; the track runs toward −z at ang 0.**
   Every track-aligned body needs `rotation.y = ang + Math.PI` (Jay, chase
   officers, dog). Static placements aim +z at a target via `atan2(dx,dz)` or
   ±π/2 and need NO flip. Getting this wrong had the whole cast running
   backwards for a day — check `dot(modelForward, travel)` is +1, not by eye.
4. **`worldPos(dist, laneX, y, out)` maps path-space -> world**; `seg.baseY`
   (ROOF_H 9) elevates the rooftop route while the sim stays flat 2D.
   Origin rebases every ~420m — never cache world positions across frames.
5. **The countdown is ~2.6s** and the intro drives G.dist from −12 (inside the
   bank lobby). Harnesses must loop `until state==='running'`, never tick a
   fixed count — a fixed warm-up leaves the bot in countdown and reports a
   FALSE GREEN.
6. **`__hr.act` keys are 'up'/'down'/'left'/'right'/'tap'.** 'jump'/'slide'
   are silently ignored (cost us a whole false-passing battery — the bot
   "survived" 281m steering only; 512m once the keys were right).
7. **Prune discipline**: `disposeGroup` frees geometry + materials + the
   map/alphaMap/emissiveMap/bumpMap slots unless marked `__shared`. Anything
   session-lived (cached textures, rig geometry variants, shared materials)
   MUST be marked `__shared` or characters/segments blank out after a prune.
   Anything per-segment must NOT be marked or it leaks (~34km test: textures
   must plateau, not climb).

## The skinned character system (rig.js) — hard-won

Model: `assets/rig/human.glb` — Quaternius "Animated Human" (CC0, poly.pizza
m/c3Ibh9I3udk). 41 Mixamo-named joints, 1578 tris, clips: Idle/Walk/Run/Jump/
Punch/Death/Working.

- **Outfits are PER-TRIANGLE VERTEX COLOURS, not textures.** The GLB ships
  untextured and its auto-UV islands OVERLAP — an atlas painted along them bled
  torso colour onto the face. `geoFor(colors)` de-indexes once, then colours
  each triangle by its dominant bone: Head/Neck/Hand* = skin, Spine*/Arm* =
  top, Hips/Leg* = pants, Foot/Toe* = shoes. Variants cached by colour key —
  keep outfit pools SMALL (NEIGHBOR_FITS is 8 combos on purpose; a free
  cross-product would quietly cache 180 geometry buffers).
- **Height is normalised from the SKELETON's world extent, not Box3.** The
  armature carries FBX scale ~69×; Box3 reads unposed geometry and reported
  1.87 while the render stood 5.2 tall.
- **`attachToBone(rig, bone, obj, worldOffset)` cancels inherited bone scale**
  (holder scale 1/ws; offset divided by ws). Hats ride 'Head' at +0.24 — at
  0.14 the cap band cut the brow. Naively-parented props render two storeys tall.
- **Slide/stumble/pointing are post-mixer layers**: mixer.update first (clips
  own the bones), then add root drops / spine bends / arm raises on top. Same
  pattern as melee lunges riding attack clips.
- **Async contract**: `loadRig()` resolves late; every consumer builds the
  capsule fallback synchronously and hot-swaps (runner rebuilds itself; main.js
  rebuilds officers; mkNeighbor/mkOfficer check `rigReady()` per call).
  `frustumCulled = false` on skinned meshes — the bind-pose box blinks them out.
- Chase officers play Run (offset `action.time` per officer or they march in
  lockstep); the lead officer plays **Punch when Jay is caught — the arrest.**
  Bystanders play Idle or Working; some idle ones POINT at Jay (post-mixer
  RightArm raise — started as a wave, reads better as "there he goes!").

## The painted-facade system (world.js)

- `makeBuildingTex(d)` **pre-rolls every random decision into
  `tex.userData.layout`** (windows, plants, ACs, store, sign, blade). The draw
  callback is a pure function of layout. Two consumers depend on that: the
  photo-decode REPAINT (rolling inside draw() teleported windows when the
  photo landed) and `addFacadeRelief`, which builds real sills/lintels/ACs/
  planters/awnings/blade signs/door stoops/glass mullions exactly where the
  paint says. Change the canvas mapping and the relief together or not at all
  (canvas 256×384, flipY: world y = h·(1 − y_c/384); zOf() encodes the ±π/2 yaw).
- **Photo composites UNDER painted markings** (paintBase): lane lines,
  crosswalks, kerb seams, lit windows must stay readable at 20 m/s. Photo for
  material, paint for legibility. Brick tiles 7×9 (a full-facade stretch reads
  as camouflage); blend is OVERLAY (multiply crushed dark districts to
  blotches); pale paving stone is the exception and multiplies.
- **Facade relief lighting is a bump map derived from each facade's own
  finished canvas** (makeBumpTarget, half-res). A shared tiled normal map
  embossed brick over the window glass.
- Merged detail via `geo.js makeBuilder()` — whole block ≈ 1 draw call. After
  a building's yaw the FRONTAGE runs along world z: plinth/cornice wraps had
  w/depth swapped for a while and jutted 2.5 into the street.
- Junction blockers (the most stared-at wall in the game) are three real
  facades; corner blocks wear a facade toward the road.

## Environment systems

- **Skyline ring**: 26 merged slabs r95–130, translates with the camera (zero
  parallax = far), never rotates. Emissive window map; intensity follows
  `DISTRICTS.windowLit` through the light lerp. Sits inside the fog band on
  purpose — the haze does the depth work.
- **Per-district sun** `DISTRICTS.sunOff [dx,dy,dz]` lerped through
  applyDistrict; followCam reads `curSunOff` live. **KEEP dx/dy steep** —
  shadow reach across the road is h·dx/dy and lanes must stay readable
  (documented gameplay rule, not taste). `wet` (downtown .45, nightmarket .9)
  lowers road roughness — it MULTIPLIES the ORM roughness channel so the
  asphalt keeps its variation.
- **Utility poles + sagging wires** (left kerb, merged): a box's +z under rx
  maps to (0,−sin,cos), so wire tilt = atan2(−dy, dz).
- **Traffic lights**: `mkTrafficLight(dir)` builds the arm direction IN —
  rotating the group flips the lamp face away from the runner. Green toward
  Jay always ("he has never once stopped").
- **Pigeons** peck (head-bob) and scatter when Jay is within 7m — burst
  velocity away from him, wings hammering, face the flee direction (+z
  convention again). `animateSegments(segs, time, party, runnerPos)` — the
  runner position is transformed into each segment's LOCAL frame.
- **Steam grates** (sprite wisps), kerb clutter (mailbox/trash bags/news box),
  fire escapes, stoops, neon, posters, murals, lantern strings, string lights.
- Districts: block / market / downtown / nightmarket, cycling every ~850m;
  alley + rooftop shortcut micro-districts. Alley walls prefer WALK-UP facades
  (a storefront tiled sideways repeated its sign six times down the corridor).

## Asset pipeline + provenance

Everything third-party is CC0 and recorded in `assets/CREDITS.md` (source,
licence, processing) — kept clean deliberately for a commercial release path.
- Textures: ambientCG 1K JPG → resized 512 → **AO/Rough/Metal packed into one
  ORM image** (three.js samples aoMap.r/roughnessMap.g/metalnessMap.b; one
  file drives three slots). ~27MB of sets ships as 613KB.
- Character: poly.pizza direct GLB (Quaternius). KayKit's GitHub repos have
  GLBs too but are chibi-fantasy — the WRONG direction for this game's look.
  Mixamo requires an Adobe login (not automatable — Kyle must do it himself
  if ever wanted).
- **Never read binary assets into context.** Parse GLB headers with a node
  one-liner (JSON chunk at offset 20) — bone names, clips, tri counts, bbox.

## Testing & verification recipes

- Harness: `window.__hrTest=true` then `__hr.start(seed)/.tick(1/60)/.view(dt)/
  .act(k)/.god(v)/.state()/.obsAhead()/.gl()/.G()`. `__hr.view` drives the view
  layer manually — the Browser pane suspends rAF, so NOTHING view-side runs
  unless you call it.
- Standard battery: 5–8 seeds, bot steers/jumps ('up')/slides ('down')/turns,
  console.error hook + window 'error' listener, `renderer.info.memory`
  textures/geometries must plateau. Expect ~510–560m per seed post-fix.
- **Screenshots**: the pane never composites this WebGL page, so screenshot
  tools time out. The page photographs itself: render + `toDataURL` in the
  SAME synchronous task → POST to the shot receiver (parent workspace
  `tools-shot-receiver.mjs`, port 8399). ⚠️ CONCURRENT sessions run their own
  receiver with a different outDir — after POSTing, verify where the file
  actually LANDED before trusting "receiver started".
- DOM/UI screenshots: XMLSerializer → SVG foreignObject trick (escape only
  `&` and `<`; kill animations with a `*{animation:none}` style).
- Determinism: pin save inputs (invariant 2), compare `total|dist|coins`.
- Officers/pedestrians rigged? traverse for `isSkinnedMesh`; facing via
  `dot(quaternion·(0,0,1), travel)`.

## State at handover (2026-07-27)

All shipped & live (sw `hood-run-v17`+, commits through `3db51a9`+):
modular bible build, store/economy, missions, cosmetics ×36, daily challenge,
PWA, 4 districts, alley+rooftop shortcuts, PBR city, facade relief, per-district
sun/wet/skyline, poles/wires/signals, pigeons/steam/clutter, rigged Jay +
officers + bystanders (bank cops + sidewalk crowd), arrest animation, closet
turntable. Zero known console errors; memory flat.

City ambience SHIPPED (v19): per-district traffic-rumble bed (LFO-breathed
brown noise) + crowd murmur (market/nightmarket) + distant horns/siren;
`sfx.flap` on pigeon scatter (voice-capped — a flock is ONE flap) and
`sfx.steam` passing grates, distance-attenuated. AMB tracks every node and
timer and tears down on ambientSet/ambientStop — untracked beds STACK across
district changes into a drone. `ambientDebug()` is the test hook. Mix levels
are conservative and untuned by ear — Kyle had not heard them at handover.

Open threads, in rough priority:
1. **Human playtest tuning** — difficulty ramp, turn window, chase pressure,
   AND the ambience mix levels. Only Kyle can do this; the bot's survival
   distances are not a difficulty read.
2. **Black pyramid artifact** on the horizon — pre-existing, invisible from
   all gameplay cameras, only from elevated free cams. Parked as a task chip;
   matters only for aerial/trailer shots. Raycast passes through it.
3. The dog cameo is still the box-dog (charming; low priority).
4. Store could sell outfit COLOURS for the rig (the vertex-colour system makes
   any palette free).
5. Render cost roughly doubled across the visual passes (backgrounded-tab
   relative measurement); the adaptive quality ladder covers weak devices,
   but pull this thread first if the game ever feels heavy on a phone.

## How to recreate from nothing

Clone `kylefriesmarketing/hood-run` — the repo IS the game, no build step
(scripts/build.mjs only mirrors to dist/). If the repo is gone: this file +
`HOOD_RUN_DESIGN_BIBLE.md` + the asset recipes above are sufficient to rebuild;
every third-party input is CC0 and re-downloadable (ambientCG set names and the
poly.pizza model id are in CREDITS.md). Give both bibles to a fresh Claude
session and say "continue" — that is exactly what they are for.

— Fable. Green light all the way down.
