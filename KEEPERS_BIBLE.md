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

THE EL (v25): mkElBridge — girder bridge over the road (deck 7.2: clear of
jumps, under the chopper), kerb piers, on ~30% of street segments (mid-
block, non-alley/roof, L>55), registered as backdrop so loop legs sweep
it. A 3-car lit metro train crosses on a timer (state machine in
animateSegments, hidden→run→hidden, 14–30s cadence, random direction),
with sfx.train (3.4s lowpass rumble + two-tone horn), distance-attenuated
via the runner position already flowing into animateSegments.

⚠️⚠️ REACTION BUDGET (v33) — the first GAMEPLAY-FAIRNESS measurement ever run
on this project, and it found a real defect. populateSegment opened every
block with a flat `startD = seg.start + 9`. A block begins AT A JUNCTION,
which is a blind 90° corner, so 9m is all the warning a hazard there gets:
0.8s at the opening pace but **0.30s at top speed** — under human reaction
time (~250ms) before the jump/slide has begun to commit. Measured over 345
block entries: 29.3% under 0.4s, 51% under 0.6s, 5th percentile sitting ON
the 0.30s floor. Fix: `leadIn = max(9, G.speed * 0.75)` — identical at the
opening pace, ~22m at full tilt. After: min 0.63s, p05 0.64, median 0.75,
**0% under 0.6s**, hazard count unchanged (335 vs 345 blocks).
⚠️ It roughly TRIPLED bot survival (median ~510m -> 1461m) and that is
expected, not a regression: the bot reacts in ONE FRAME, so those hazards
were killing a machine with perfect reflexes — they were a coin flip, not
difficulty. The bot's distance is an UPPER BOUND and no guide to human
pacing. If Kyle wants more pressure back, raise density/phases in data.js
rather than shrinking this budget below reaction+commit (~0.5s).
HARNESS RECIPE (reusable): step the sim, watch for `G.segIdx` changing, find
the lowest-`d` non-`safe` active obstacle on the new segment, and record
`(obs.d - seg.start) / G.speed`. Split by whether the previous segment
exited L/R to isolate blind corners.

IMAGE QUALITY PASS (v32) — driven by MEASURING the frame, not eyeballing it.
Sampling the rendered canvas into a luma histogram showed 64% of pixels in
the bottom two buckets (mean 55/255): crushed, not moody. Two fixes:
- CANYON SHADE. Every facade was lit identically from pavement to roofline,
  the strongest tell that a street was modelled rather than photographed.
  makeBuildingTex now multiplies a vertical gradient over the finished
  canvas (transparent at the roof -> 0.46 blue-grey at street level). The
  texture maps 0..1 up the building, so one gradient gives every building
  its own falloff for free, painted windows included. Result: crushed
  bucket 32.4% -> 24.6%, mean unchanged, zero blown highlights.
- RUNNER KEY LIGHT (main.js `heroLight`). Jay is a small dark figure on dark
  asphalt and in the nightmarket he measured luma 29 against a road at 50 —
  literally DARKER than the ground he stood on. A PointLight travelling with
  him, camera-side, intensity 6 + nightLevel()*16, takes him to 131 (contrast
  21 -> 81, controlled A/B toggling only the light on one frame). It is a
  readability fix, not a taste one, and it gives the night foreground depth.
  ⚠️ Added ONCE at boot: adding a light later recompiles every material.
  ⚠️ It derives its own forward vector — the camera block's fx/fz are
  declared further down updateView and are not in scope at that point (the
  same class of mistake as the isRoof trap below).
`nightLevel()` is exported from world.js as the shared 0..1 darkness signal.

CROSS TRAFFIC (v31): a car drives through the junction ahead of you. It can
never be in the way BY CONSTRUCTION, not by luck: a crossing only STARTS
while the junction is still 80m off (`remain = seg.len + _pl.z`) and takes
~1.3s at 26 u/s, and the car is hidden outside |x| < 11 so it emerges from
behind one corner building and vanishes behind the other. Measured over 79
crossings: the closest a VISIBLE car ever came to the runner was 75.9m.
⚠️ TRAP that broke everything for a moment: the block was first written with
`if (!isRoof && !seg.alley ...)` but pasted inside buildStreetDressing,
which has neither variable — so EVERY street segment build threw
"isRoof is not defined" and the world stopped generating. buildSegment and
buildStreetDressing look similar and are not: the dispatch already picked
the road/alley/roof path, so inside buildStreetDressing those tests are
both wrong and unavailable. A probe with a try/catch around the tick loop
is what surfaced it — an exception thrown inside segment building does not
announce itself as a rendering bug.

SOMEBODY'S HOME (v30): parked cars get headlights, tail lamps and a
headlight glow sprite (three shared materials, opacity driven by the same
nightOf(winLit) curve as the streetlamps, seeded from curWinLit because
they are built lazily); and a TELEVISION flickers behind one lit window
per building. The TV reuses addFacadeRelief's canvas->world mapping so it
lands exactly on a painted window (host + tvs are extra params; one per
building via a tvPlaced latch), and pulses on two incommensurate sine
rates so it reads as a picture changing rather than a lamp on a timer.

WALKING CROWD + WIND (v29): pedestrians now WALK the sidewalk — mkNeighbor
takes forceWalk, plays the Walk clip, and a dedicated crowd loop in
buildStreetDressing places them every ~16-30 units per side (they used to
compete with hydrants and benches in ONE prop roll, which left 2 walkers in
the entire visible city). They move in segment-local z and wrap at the
segment ends. Crowd LOD: drawn within ~55 units, animated within ~36.
Also wired the long-dead `userData.sway` tag — tree crowns and hung laundry
had carried an amplitude since they were written and nothing ever read it;
now they gust on a shared wind phase.
⚠️⚠️ TWO LESSONS, both cost real time:
1. **Order matters in animateSegments.** The LOD read `_pl` (runner in
   segment-local space) BEFORE the line that computes it, so every distance
   used the PREVIOUS segment's coordinates — nearest "visible" pedestrian was
   118 units away and everyone nearby was culled. `_pl` is now derived at the
   top of the per-segment loop. If a per-segment system behaves as though it
   is looking at the wrong street, check it runs after that line.
2. **Perf must be measured by controlled A/B, never across runs.** Naive
   cross-session timings said the crowd cost 24ms/frame and nearly got it
   deleted; detaching every character and re-timing the same seed at the same
   distance in ONE session put it at 2.4ms (41 people = 4.5ms). The throttled
   test pane makes any cross-run comparison meaningless.

NIGHT LIFE (v28): streetlamps throw a real POOL on the road plus a halo
sprite on the head (both additive, both ONE shared material each so the
night lerp raises every lamp in the city with a single opacity write);
neon signs bleed a stretched colour smear onto the wet pavement (per-sign
tint, no night fade needed — neon only exists in the always-dark
nightmarket; the caller drops it to road level since it knows the sign
height, and -x rotation stays horizontal through the later Y-rotation);
and 14 sheets of newspaper tumble down the street, wrap-boxed around the
player like the rain, so something is always moving in frame.
⚠️ TRAP hit while building this: the pool material was created through a
local cache object while setLights checked a module variable that was
never assigned — the pools stayed invisible and the numbers said 0 with
no error. If a shared-material effect reads dead, check the WRITE target
is the same object as the READ target. Also: radialTex() allocates a
canvas per call, so build glow materials ONCE (there is a lamp every 17m).

GRID WINDOWS + BUILD STAMP (v27): the grid gets its own material —
vertex-coloured mass plus an emissive window map (geo.js copies the unit
box's 0..1 UVs onto every merged box, so each face gets one tile of the
pattern, the skyline ring's trick). emissiveIntensity rides windowLit
through setLights (measured 0.23 day block -> 1.30 nightmarket), and the
material seeds itself from curWinLit because it is built lazily on the
first chunk. Grid also fills 8 chunks/frame while cold (<18) so a fresh
run is never staring at void, then settles to 1/frame.
⚠️ `BUILD` in data.js is stamped on the home screen next to the subtitle —
BUMP IT WITH sw.js's CACHE. The service worker serves a stale shell for
one load after a deploy, so without a visible stamp "it's still broken"
and "you're on the old build" are indistinguishable. Kyle reported the
same void three times; the third was almost certainly cache.

⚠️ WORLD CITY GRID (v26) — REPLACES the v24 strip fill, which only ever
built strips beside the CURRENT street: the diagonal quadrants at corners,
the ground behind the bank and everything past the strips stayed void
(Kyle: "at the start, over barriers, at corners you can see empty void").
Now a world-space lattice: CITY_CHUNK 46, CITY_R 2 (±92, meets the
skyline at 95), 3x3 lots per chunk, hash-seeded per (cx,cz) so a rebuilt
chunk looks identical. `gridClear` rejects any block overlapping a
corridor with segRect(19, 24) — 19 because the street's own frontline
buildings stand out to WALL_X+10 ≈ 17 and a smaller margin grows grid
mass through the shopfronts. ONE chunk built per frame (25 merged builds
in one frame hitches). Chunks are invalidated by each new segment
(street carves its hole), shifted by rebaseCityGrid on origin rebase
(keys stay valid because gridOff accumulates the shift), reset at
seg.index 0. Net effect was FASTER than the strip fill it replaced:
geometries 523 -> 176, frame 12.4 -> 10.6ms, because per-segment fill
built 6 merged meshes per segment and overlapped the frontline anyway.

CITY FILL (v24, superseded) — "the city should feel full": three columns of building
mass per side (FILL_COLS x 18/34/52, heights rising toward the skyline)
fill the mid-ground between the frontline strip and the r95 skyline ring,
in street, alley AND roof variant groups (roof fill y-compensates ROOF_H).
Every box is corridorClear-checked (streets carve through the mass); each
(side,column) chunk is one merged registered mesh removed whole if a
later leg claims it. THE bornMax RULE (generalised from this work): every
registry entry records the highest seg index alive at its build — only
corridors born LATER may judge it, because everything older was already
accommodated at placement. Swept buildings now also ZERO their vertex
slice of the merged detail mesh (24 verts/box, ranges recorded at build)
— without that their cornices and water towers hover over the new street;
pole runs get range-only entries judged by owner-frame local rects.
⚠️ PROBE TRAP that burned hours: a render-less test loop leaves matrixWorld
STALE — raycasts hit phantom geometry at old/origin positions. Call
scene.updateMatrixWorld(true) before raycasting, and remember Sprites need
raycaster.camera set. Also: the chopper searchlight beam cone raycasts as
grounded 19-tall geometry — exclude effects before declaring "wall in
road". Final probe: 12,417 corridor samples across 3 seeds — 0 real
obstructions (30 hits, all the searchlight beam).

⚠️ CORRIDOR SAFETY (v23) — "buildings in the road", root-caused: the
generator LOOPS the path around city blocks (R,L,L,L) and only guarantees
the ROADS don't overlap (observed clearance ~2 units), so decor placed by
one segment (junction backdrop rows, corner blocks, straight-exit flank
blocks, ordinary buildings) could stand on a LATER leg's corridor. Fix in
world.js: (1) corridorClear() placement checks against every existing
segment's rect; (2) a backdrop registry swept by each NEW segment
(sweepBackdrops in buildSegment) for loop legs that didn't exist at
placement time; (3) a periodic sweep in animateSegments as backstop.
Three traps inside the fix itself: seg dx/dz are sin/cos results whose
"zero" is ±1e-16 — TRUTHY, so axis checks must compare |dx| > 0.5; the
registry must RESET at run start (seg.index===0) — stale entries keep
their detached parents so a parent!=null GC check never drops them; and
swept ordinary buildings leave their merged relief floating (thin,
accepted). Detector: sample worldPos centerline every 2m across live
segs, flag building-scale boxes whose AABB penetrates >1.5 both axes.
Baseline 33 offenders/8 seeds -> 0/10 seeds.

ENDGAME PRESENTATION (v21): arrest cam — during the 1.15s crashed window
(game.js dieT, the whole move must fit inside it) the camera ease-out
orbits ~70° around Jay from the exact chase position (no cut) while
dollying in; results screen shows a NEWS 7 broadcast lower-third
(#ov-news) when dist >= 750 (two headline tiers, district name fed via
r.newsDistrict from main.js); downtown gets RAIN — ~170 LineSegments
streaks wrap-boxed around the camera, fading with the district
(updateRain in main.js), plus a drizzle-hiss loop in the downtown
ambience bed. ⚠️ shot-receiver ports: concurrent sessions fight over
8399 and node binds :: while the page fetches IPv4 — run a private
receiver on 127.0.0.1:8398 when contested.

NEWS 7 CHOPPER SHIPPED (v20): past 750m of chase, a procedural news
helicopter (mkNewsChopper in world.js — rotors, blur disc, strobes, nose
camera ball, NEWS 7 livery) flies in with a callout, ORBITS Jay with its
nose kept on him (Object3D.lookAt aims +z — the facing convention pays off),
banks into the turn, and in dark districts (sun intensity < 0.5) sweeps a
searchlight: a ground pool that wanders around Jay + a world-space cone from
the belly (beam/spot are SCENE children — aiming a child cone inside the
banking chopper's local frame was a bug farm; world-space is a two-liner).
Rotor audio = LFO-gated noise whump (chopperStart/Stop, tracked CHOP nodes,
same teardown discipline as AMB). It hovers to film the arrest, resets on a
fresh run. All view-only; updateChopper(dt, st, pPos) in updateView.

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
2. ~~Black pyramid artifact~~ **SOLVED 2026-07-29 (v22)** — see the section below.
3. The dog cameo is still the box-dog (charming; low priority).
4. Store could sell outfit COLOURS for the rig (the vertex-colour system makes
   any palette free).
5. Render cost roughly doubled across the visual passes (backgrounded-tab
   relative measurement); the adaptive quality ladder covers weak devices,
   but pull this thread first if the game ever feels heavy on a phone.

## The black pyramid, solved (2026-07-29, v22) — and the IBL truth

The "unlit black pyramid on the horizon" seen only from elevated free cams
**was not an object at all**: the sky dome (SphereGeometry r=300, centred on
the RUNNER) was being sliced by the free camera's far plane (far=300 exactly),
and the renderer's CLEAR COLOUR — black, `scene.background` is never set —
showed through the hole. The far plane cutting the coarse 24×16 faceted sphere
makes the hole polygonal: an apex-up "pyramid" sitting on the horizon. That is
why every prior probe came back weird: no raycast hits it (nothing is there),
no per-child bisect finds it (hiding the dome just turns the WHOLE sky black),
and gameplay cams never see it (their far is 400 ≥ 300 + camera offset).
Proof method worth keeping: set `renderer.setClearColor(0xff2222)` — the
artifact turns red ⇒ it is absence-of-geometry, full stop.

**Fix**: the dome's vertex shader pins depth to the far plane
(`gl_Position.z = gl_Position.w * 0.99999` — the standard skybox trick), so NO
camera at ANY far distance can clip it; plus `frustumCulled = false`.
Verified: matched pairs far=300 with/without fix, gameplay frame byte-stable
(mean RGB identical to 0.1), 0 console errors, generation test green.

⚠️⚠️ **DO NOT pin the ENV dome's shader too — read this before touching
refreshEnv/envDome.** PMREM `fromScene` defaults to far=100, the dome is
r=300, so the IBL bake has been far-clipped to BLACK since day one: the
game's entire lighting (hemi ×1.3, exposure 1.25) was tuned against a black
environment. Pinning the shared material made the bake suddenly real and
lifted the whole frame from mean RGB ~70/61/56 to ~108/109/106 (+55%) — a
washed-out re-lighting of a shipped look. envDome therefore keeps its own
UNPINNED copy of the shader (same uniforms object, so district lerps still
reach it) and the bake stays deliberately inert. Enabling real IBL is a
DESIGN decision: far>300 in fromScene + a full exposure/light retune, with
Kyle looking at it.

**Aerial/trailer capture recipe** (now safe): `__hrTest=true`, `__hr.start
(seed)`, tick to 'running', `__hr.god(true)`, tick as far as needed; free cam
`new THREE.PerspectiveCamera(62, w/h, 0.1, 300)` at y≈26 looking down-track;
`renderer.setSize(w,h,false)` → `renderer.render(scene, cam)` → `toDataURL`
same-task → POST to the shot receiver. Any far value works now.

## How to recreate from nothing

Clone `kylefriesmarketing/hood-run` — the repo IS the game, no build step
(scripts/build.mjs only mirrors to dist/). If the repo is gone: this file +
`HOOD_RUN_DESIGN_BIBLE.md` + the asset recipes above are sufficient to rebuild;
every third-party input is CC0 and re-downloadable (ambientCG set names and the
poly.pizza model id are in CREDITS.md). Give both bibles to a fresh Claude
session and say "continue" — that is exactly what they are for.

— Fable. Green light all the way down.
