# HOOD RUN
## Build Bible and Master Implementation Prompt for Claude Fable 5

**Document purpose:** This is the single source of truth for designing and building **Hood Run**, an original, browser-based, third-person endless runner set in a lively modern city neighborhood.

**Working title:** Hood Run  
**Genre:** Three-lane endless runner / arcade action  
**Platform:** Desktop and mobile web  
**Audience:** Ages 10+; broad casual audience  
**Session length:** 2–8 minutes per run  
**Business model:** None in the first release; no ads, purchases, gambling, or dark patterns  
**Primary goal:** Deliver a polished, instantly understandable game that feels joyful, fast, replayable, and distinctly urban without copying another game's protected characters, world, art, sounds, or exact presentation.

---

# 1. THE MASTER DIRECTIVE

Claude Fable 5: build the complete playable game described in this bible. Make sensible implementation decisions without repeatedly asking for approval. Work in small, verifiable phases, keep the game playable after every phase, and favor a polished core loop over feature sprawl.

The result must be an **original game**, not a reskin or clone. “Temple Run style” describes only the broad genre language: a character automatically runs forward, the player dodges hazards, collects pickups, and tries to survive for a high score. Hood Run must have its own identity, setting, route logic, visual language, characters, UI, progression, and signature systems.

If a requested detail is technically expensive, build a convincing lightweight version first. Never leave the project in a broken state. Never claim a feature works without testing it.

## Non-negotiable outcome

On first load, a player can:

1. Press or tap **Run**.
2. Understand the controls within seconds.
3. Move between three lanes, jump, and slide.
4. Avoid varied city hazards.
5. Collect coins and build a combo.
6. Experience speed and difficulty escalation.
7. Lose fairly, see a score summary, and restart immediately.
8. Retain local high scores, coins, settings, missions, and unlocks after refreshing.

---

# 2. CREATIVE NORTH STAR

## One-sentence pitch

**Sprint through a city that remixes itself block by block, chaining stylish moves, neighborhood shortcuts, and near misses to become the fastest legend on the block.**

## Player fantasy

The player is not fleeing police, committing crimes, or escaping a monster. They are participating in **The Crosstown Dash**, an unofficial citywide running challenge organized through flyers, group chats, and community rivalry. The fantasy is athletic flow: reading the street, finding rhythm, taking daring shortcuts, and turning familiar city spaces into a playground.

## Tone

- Bright, playful, kinetic, warm, witty, and aspirational.
- The neighborhood should feel inhabited and cared for.
- Humor comes from timing, signage, visual surprises, and exaggerated obstacles.
- Avoid poverty tourism, gang stereotypes, racial caricatures, weapons, drugs, police chases, and treating residents as scenery to ridicule.
- Graffiti appears as colorful murals and commissioned street art, not shorthand for danger.

## The five design pillars

1. **Flow over friction:** Inputs respond immediately and animation never makes controls feel sluggish.
2. **Readable speed:** The game becomes fast without becoming visually confusing.
3. **City personality:** Every block contains recognizable neighborhood life and environmental storytelling.
4. **Fair challenge:** Failure should feel caused by a readable decision, not surprise geometry.
5. **One more run:** Fast restarts, short missions, unlocks, and meaningful high-score chasing create replayability.

---

# 3. GAMEPLAY OVERVIEW

## Core loop

**Start run → read upcoming route → dodge and collect → build combo → choose risky or safe paths → speed increases → fail or finish a daily challenge → earn coins and mission progress → unlock cosmetics → restart.**

## Camera and movement

- Third-person camera, elevated behind the runner.
- The runner advances automatically.
- The playable route has three logical lanes: left, center, right.
- Horizontal lane changes are quick, eased, and cancellable by a new input.
- Jump clears low and ground-level hazards.
- Slide passes under overhead hazards.
- Optional turns occur at clearly marked intersections.
- The camera subtly leans during lane changes and turns but never rolls enough to disorient.
- Field of view expands slightly as speed increases.

## Desktop controls

| Action | Primary | Alternate |
|---|---|---|
| Move left | Left Arrow | A |
| Move right | Right Arrow | D |
| Jump | Up Arrow | W / Space |
| Slide | Down Arrow | S |
| Turn at intersection | Left/Right Arrow | A/D |
| Pause | Escape | P |

## Touch controls

- Swipe left/right: change lane or turn at an intersection.
- Swipe up: jump.
- Swipe down: slide.
- Tap pause icon: pause.
- Detect gestures by direction and minimum distance, not exact screen coordinates.
- Prevent page scrolling and browser pull-to-refresh only while actively playing.

## Input rules

- Buffer jump and slide inputs briefly so near-correct timing still works.
- Support a small amount of “coyote time” at obstacle edges.
- Do not queue multiple lane changes more than one move ahead.
- A swipe used to turn at an intersection must not also trigger a lane change.
- Keyboard and touch controls can coexist without changing settings.

---

# 4. SIGNATURE SYSTEMS

## 4.1 Block Remix

The city is assembled from authored block segments rather than generated as arbitrary noise. Each segment carries metadata:

- Entry and exit connector.
- Length and lane occupancy timeline.
- Allowed speed range.
- Difficulty rating.
- District tag.
- Hazard tags.
- Pickup patterns.
- Optional intersection or shortcut.
- Required predecessor or forbidden neighbor tags.

The generator chooses compatible segments from a seeded random stream. It must guarantee a traversable path and reject impossible obstacle combinations.

## 4.2 Style Chain

The score multiplier grows when the player performs varied actions without a crash:

- Coin line completion.
- Near miss.
- Perfect jump.
- Perfect slide.
- Lane weave through a hazard group.
- Shortcut taken.
- Air pickup collected.

Repeating the same move gives less style value. The chain decays after a short quiet window. This rewards active, expressive play instead of passive survival.

## 4.3 Neighborhood Shortcuts

Occasional route splits let the player choose:

- **Street route:** safer, wider, standard rewards.
- **Alley route:** tighter timing, more coins, delivery carts, fire escapes, clotheslines.
- **Rooftop route:** introduced later; jump-focused and visually dramatic.
- **Transit route:** station platform or bus-lane segment with faster patterns.

Route choices must be telegraphed early with color, arrows, and visible geometry. A shortcut is optional; missing it must continue onto a valid route.

## 4.4 The Crosstown Meter

Stylish play fills a meter. When full, activate **Block Party** automatically for a short period:

- Music gains an extra layer.
- Coins magnetize within a modest radius.
- Score multiplier receives a temporary boost.
- Murals, windows, and street decorations pulse subtly to the beat.
- The player is not invincible; hazards still matter.

This is Hood Run’s major audiovisual reward loop.

---

# 5. OBSTACLES AND INTERACTIONS

## Ground hazards

- Pothole: jump or change lanes.
- Traffic cone cluster: change lane; advanced versions can be jumped.
- Puddle: safe but slows the runner briefly and breaks perfect-flow bonuses.
- Low planter: jump.
- Stacked boxes: jump or avoid.
- Open sidewalk grate: jump.

## Mid-height hazards

- Parked delivery cart: lane change.
- Rolling trash bin: moving lateral hazard, slow and well telegraphed.
- Construction barrier: jump.
- Folding market table: lane change.
- Bike rack: jump or avoid.

## Overhead hazards

- Scaffolding crossbar: slide.
- Low awning: slide.
- Clothesline on alley routes: slide.
- Raised delivery gate: slide.

## Moving hazards

- City bus crossing at an intersection.
- Cyclist crossing one lane with a bell warning.
- Delivery robot moving slowly between lanes.
- Rolling basketball entering from a stoop or court.
- Sprinkler spray that temporarily obscures a narrow portion of the view but remains passable.

## Fairness rules

- At least one valid response must exist for every hazard pattern.
- Never require a lane change and opposite turn inside an unfair reaction window.
- Moving hazards announce themselves with sound and visible anticipation.
- Avoid placing essential cues behind UI, particles, or foreground props.
- Reuse patterns only after enough spacing to prevent obvious repetition.
- Collision boxes should be slightly more forgiving than visible meshes.

---

# 6. PICKUPS AND POWER-UPS

## Standard pickups

- **Coins:** primary earned currency and score ingredient.
- **Crosstown tokens:** rarer mission or unlock collectibles.
- **Letter set:** occasionally spell H-O-O-D across a run for a large bonus.

## Power-ups

1. **Sneaker Boost:** brief controlled speed burst; automatically clears minor ground clutter but not major barriers.
2. **Coin Magnet:** attracts nearby coins.
3. **Double Style:** doubles style-chain gain, not base distance score.
4. **Fresh Start:** one-use shield that saves the player from a collision, then causes a short recovery slowdown.

## Power-up constraints

- Use unique silhouettes and colors.
- Show remaining duration around the icon.
- Do not stack the same timer infinitely; refresh only to a capped duration.
- Power-ups help but do not replace skill.

---

# 7. DIFFICULTY AND PACING

## Run phases

| Phase | Approx. time | Purpose |
|---|---:|---|
| Warm-up | 0–30 sec | Teach movement through generous patterns |
| Groove | 30–90 sec | Mix core hazards and introduce chains |
| Rush hour | 90–180 sec | Faster segments, route choices, moving hazards |
| Crosstown | 3–5 min | District changes, layered patterns, shorter gaps |
| Legend pace | 5+ min | High speed with fair authored challenge pools |

## Escalation variables

- Forward speed.
- Segment difficulty pool.
- Obstacle density.
- Moving-hazard frequency.
- Coin-line risk.
- Shortcut frequency.
- Style decay pressure.

Do not increase every variable at once. Speed should rise along a smooth curve with soft caps. Difficulty comes from pattern complexity more than raw speed.

## Recovery beats

After a hard cluster, provide a short readable stretch with coins, scenery, and low pressure. These beats improve pacing and let players appreciate the city.

---

# 8. DISTRICTS

The run transitions between districts without loading screens. The first release should include at least three visually distinct districts using shared modular geometry.

## The Block

- Brick row buildings, stoops, corner stores, murals, basketball court, hydrants, trees.
- Warm afternoon palette.
- Introductory hazard pool.

## Market Mile

- Produce stands, awnings, café seating, signs, delivery carts, string lights.
- Dense visual energy and lane-changing patterns.
- More coin zigzags and moving carts.

## Downtown Cut

- Taller buildings, bus lanes, scaffolding, glass reflections, subway entrance.
- Cooler palette and faster rhythm.
- More slides, crossing traffic, and transit-route opportunities.

## Future districts

- Riverwalk.
- Rooftop gardens.
- Night market.
- Snow-day block.
- Summer festival.

District changes affect presentation and pattern pools, not fundamental controls.

---

# 9. CHARACTERS AND CUSTOMIZATION

## Launch runner

**Name:** Jay  
**Role:** A quick, optimistic neighborhood regular joining the Crosstown Dash.  
**Design:** Highly readable silhouette, colorful jacket or hoodie, running shoes, small cross-body bag, expressive but efficient animation.  
**Personality:** Competitive, friendly, amused by the city’s chaos.

Allow the player to select among several inclusive appearance presets at no gameplay cost. Do not tie ability or personality to race, gender, body type, or neighborhood stereotypes.

## Cosmetic slots

- Outfit.
- Shoes.
- Hat/hair accessory.
- Trail effect.
- Victory pose.

Cosmetics are earned with coins and missions. No loot boxes. No stat advantages in the first release.

## Animation set

- Run cycle with speed blend.
- Left/right lane step.
- Jump rise, apex, and landing.
- Slide start, loop, and recover.
- Stumble and crash.
- Shortcut vault.
- Menu idle.
- Score-screen celebration.

Animation timing follows gameplay state; gameplay must never wait for animation completion.

---

# 10. SCORE, ECONOMY, AND PROGRESSION

## Score formula

Score combines:

- Distance score.
- Coins collected.
- Current multiplier.
- Style actions.
- Near misses.
- Route bonuses.
- Mission completion bonus.

Display the formula clearly on the results screen. Avoid hidden penalties.

## Missions

Show three active missions. Examples:

- Run 1,000 meters total.
- Complete three perfect slides.
- Collect 150 coins.
- Take two alley shortcuts.
- Reach a 5× style multiplier.
- Survive 90 seconds without a power-up.

Mission tracking must persist across runs. When completed, replace a mission from a deterministic or rotating local pool.

## Unlock cadence

- Early unlock in the first 2–3 runs.
- A meaningful cosmetic or feature tease every few runs.
- Districts are discovered by lifetime distance, not purchased.
- Cosmetics use coins.
- Advanced mission pages use Crosstown tokens.

## Local persistence

Store a versioned save containing:

- High score.
- Longest distance.
- Lifetime coins and current coins.
- Settings.
- Mission state.
- Unlocks and equipped cosmetics.
- Tutorial completion.
- Lightweight run statistics.

Handle missing, old, or corrupted save data gracefully. Never make the game unplayable because storage is unavailable.

---

# 11. USER EXPERIENCE

## Screen flow

1. Loading screen.
2. Title screen with **Run**, Runner, Missions, Settings.
3. Optional one-screen first-run tutorial.
4. Gameplay HUD.
5. Pause overlay.
6. Results screen.
7. Instant restart or return home.

## HUD

- Top left: score and multiplier.
- Top center: distance.
- Top right: pause.
- Side area: active power-up timers.
- Near bottom: Crosstown meter, kept clear of swipe zones.
- Temporary center callouts: “Perfect Jump,” “Close Call,” “Shortcut.”

## Tutorial

Teach through play using safe, forced patterns:

1. Swipe/move left.
2. Swipe/move right.
3. Jump a low barrier.
4. Slide under an awning.
5. Collect a coin line.

Each prompt disappears immediately after success. The tutorial can be replayed from settings and skipped after the first successful completion.

## Accessibility

- Reduced motion mode: weaker camera lean, no speed-line flashes, reduced environmental pulse.
- High-contrast obstacle outlines.
- Independent music and sound volume.
- Mute toggle always accessible.
- Keyboard-only navigation for menus.
- Visible focus states.
- Do not encode power-up identity by color alone.
- Offer left-handed HUD placement on touch devices if practical.
- Pause automatically when the tab loses focus, unless doing so would corrupt a deterministic test.

---

# 12. ART DIRECTION

## Visual target

Stylized 3D with chunky, readable forms, hand-painted color, soft shadows, and graphic signage. Aim for the charm of a premium animated toy city rather than realism. Geometry should be efficient enough for mid-range phones.

## Shape language

- Buildings: simplified blocks with bold trim and varied rooflines.
- Obstacles: exaggerated silhouettes with clean negative space.
- Characters: slightly oversized hands, shoes, and head for animation readability.
- Pickups: bright, floating, rotating, with soft emissive accents.

## Palette

- Base: brick red, warm concrete, asphalt blue-gray, leafy green.
- Accent: electric teal, sunflower yellow, coral, violet.
- Hazard language: orange and white stripes, strong edge contrast.
- Pickups: gold with teal highlights.

## Environmental storytelling

- Chalk art.
- Community bulletin boards.
- Window plants.
- Local event posters.
- Murals.
- Laundry and rooftop gardens.
- People safely behind the active route, reacting with simple loops.
- Fictional shop names and signage; do not use real brands without permission.

## Performance art rules

- Prefer instancing for repeated props and pickups.
- Use texture atlases where helpful.
- Keep transparent materials limited.
- Use baked or blob shadows on low settings.
- Provide low/medium/high quality presets or automatic adaptation.

---

# 13. AUDIO DIRECTION

## Music

Original upbeat instrumental combining percussion, bass, melodic chops, and city ambience. Do not imitate or sample copyrighted songs. Music layers intensify with speed and Block Party mode.

## Sound effects

- Clear lane-change foot scuff.
- Jump effort and landing impact.
- Slide fabric/ground sound.
- Coin pickup pitched in short musical sequences.
- Unique power-up stingers.
- Traffic and cyclist warnings before visual conflict.
- Soft crowd reactions and neighborhood ambience.
- Distinct crash, shield-save, mission-complete, and high-score sounds.

## Audio behavior

- Start audio only after user interaction.
- Pool frequently played sounds.
- Limit simultaneous coin voices.
- Lower music briefly for important warnings.
- Respect mute and volume settings immediately.

---

# 14. TECHNICAL ARCHITECTURE

## Recommended stack

- HTML5, CSS, and modern JavaScript modules.
- Three.js for 3D rendering.
- No build step unless the existing workspace already requires one.
- No server required for the first release.
- LocalStorage for versioned persistence.
- Web Audio API or lightweight audio wrapper.
- Installable PWA support is optional after the core game is stable.

## Suggested project structure

```text
hood-run/
  index.html
  README.md
  src/
    main.js
    game.js
    runner.js
    input.js
    world.js
    segment-generator.js
    collisions.js
    progression.js
    save.js
    audio.js
    ui.js
    data.js
  assets/
    models/
    textures/
    audio/
    ui/
  tests/
```

## Separation of concerns

- `data.js`: tuning constants, obstacle definitions, segment metadata, mission content.
- `game.js`: state machine, fixed-step simulation, scoring, difficulty, run lifecycle.
- `world.js`: scene, lighting, segment pooling, environment transitions.
- `segment-generator.js`: seeded, rule-driven route selection and validation.
- `runner.js`: runner state, lane position, jump/slide motion, collisions.
- `input.js`: keyboard, touch gestures, input buffering.
- `progression.js`: missions, economy, unlocks.
- `save.js`: schema, migration, validation, storage fallback.
- `ui.js`: screens and HUD; UI should not own game rules.

## Game states

Use an explicit state machine:

```text
BOOT → HOME → TUTORIAL/COUNTDOWN → RUNNING → PAUSED → CRASHED → RESULTS
```

State transitions must be centralized. Inputs invalid for the current state are ignored.

## Simulation

- Use a fixed simulation timestep, with rendering interpolated or updated independently.
- Clamp large frame deltas after tab stalls.
- Seed all gameplay-relevant random choices.
- Visual-only particles may use unseeded randomness.
- Keep forward distance numerically stable by recycling the world around the player rather than moving forever from the origin.

## Object pooling

Pool:

- City segments.
- Coins.
- Obstacles.
- Particles.
- Decoration clusters.
- Repeated audio voices where appropriate.

Avoid allocating large numbers of objects during active play.

## Collision model

- Use simple lane-aware boxes or capsules, not full mesh collision.
- Separate visible model dimensions from forgiving gameplay hitboxes.
- Resolve pickup overlap before lethal collision only if both occur at the exact same step and this cannot grant an unfair rescue.
- A collision produces one result only: clear, shield save, stumble, or crash.

## Segment validation contract

Every generated segment must expose a logical timeline of lane occupancy. Before accepting the next segment, validate that at least one reachable lane path exists under the current speed and action timings. Maintain a debug overlay that can display:

- Segment ID.
- Seed.
- Speed tier.
- Lane blockers.
- Valid path.
- Active hitboxes.

---

# 15. RESPONSIVE AND PERFORMANCE REQUIREMENTS

## Supported layouts

- Mobile portrait is the primary touch layout.
- Mobile landscape is supported.
- Desktop scales to common laptop and monitor sizes.
- Gameplay canvas fills the available viewport without stretching.
- Respect safe-area insets on notched devices.

## Targets

- Aim for 60 FPS on a mid-range desktop and recent phone.
- Gracefully reduce toward 30 FPS on slower devices without changing game speed.
- Initial playable load should be small; lazy-load later district assets.
- Avoid long main-thread stalls during a run.
- Cap device pixel ratio on high-density screens.

## Adaptive quality

If sustained frame time is poor, reduce in this order:

1. Particle count.
2. Shadow resolution or dynamic shadows.
3. Decoration density.
4. Render pixel ratio.
5. Distant geometry detail.

Never change collision timing or simulation speed as a quality adjustment.

---

# 16. CONTENT DATA EXAMPLES

Use data-driven definitions resembling these shapes; adjust exact syntax to the chosen architecture.

```js
const OBSTACLES = {
  pothole: {
    response: ["jump", "lane"],
    minTier: 0,
    telegraph: 1.2,
    hitboxScale: 0.82
  },
  awning: {
    response: ["slide"],
    minTier: 1,
    telegraph: 1.5,
    hitboxScale: 0.88
  }
};

const SEGMENTS = {
  stoop_intro_01: {
    district: "block",
    difficulty: 0,
    length: 42,
    tags: ["straight", "tutorial-safe"],
    obstacles: [],
    pickups: [{ pattern: "center_line", start: 8, count: 12 }]
  }
};
```

Keep tuning values centralized and documented. Do not scatter magic numbers across rendering and UI code.

---

# 17. BUILD PHASES FOR CLAUDE FABLE 5

## Phase 0 — Audit and plan

- Inspect the workspace and preserve unrelated projects.
- Confirm the exact launch command or no-build entry point.
- Create a short implementation checklist.
- Establish a smoke-test method before adding features.

**Exit condition:** A minimal page loads without errors and the implementation path is clear.

## Phase 1 — Gray-box runner

- Build the scene, camera, road, three lanes, auto-run illusion, keyboard/touch input.
- Implement lane changes, jump, slide, pause, crash, restart.
- Use primitive geometry only.

**Exit condition:** The complete run/fail/restart loop works on desktop and touch emulation.

## Phase 2 — Segment engine

- Add pooled city segments and seeded generation.
- Add logical obstacle timelines and path validation.
- Implement six core obstacles and coin patterns.
- Add debug seed and hitbox display.

**Exit condition:** Ten-minute seeded soaks generate no impossible path or runtime error.

## Phase 3 — Scoring and juice

- Add distance, coins, multiplier, Style Chain, near misses, Crosstown meter, Block Party.
- Add camera feedback, particles, UI callouts, and placeholder audio.

**Exit condition:** Scoring is deterministic for the same seed and scripted inputs.

## Phase 4 — City identity

- Build The Block, Market Mile, and Downtown Cut.
- Add route transitions and at least one alley shortcut.
- Replace critical gray-box assets with styled originals.

**Exit condition:** Districts are immediately distinguishable and obstacle readability remains strong.

## Phase 5 — Progression and accessibility

- Add missions, coins, cosmetics, local save, settings, tutorial, reduced motion, contrast option.
- Add safe save migration and corruption recovery.

**Exit condition:** Refreshing preserves valid progress; clearing or corrupting storage does not break launch.

## Phase 6 — Polish and release QA

- Profile performance and add adaptive quality.
- Tune difficulty curves using repeatable seeded runs.
- Test viewport sizes, focus loss, rapid input, repeated restarts, and audio lifecycle.
- Remove debug UI from the player build while keeping it available behind a flag.

**Exit condition:** All acceptance tests pass and the game is ready to deploy.

---

# 18. ACCEPTANCE TESTS

## Core function

- Game loads from the documented entry point with no console errors.
- Start, pause, resume, crash, results, restart, and home navigation all work.
- Keyboard and touch gestures trigger the correct actions.
- Repeated fast inputs never place the player between invalid lanes.
- Jump and slide hitboxes match visible action timing.
- A run can continue for at least ten minutes without exhausting segments or leaking obvious memory.

## Generation and fairness

- At least 100 fixed seeds can be simulated or inspected without an impossible segment.
- Every forced action has adequate telegraph time at its allowed speed tier.
- Route splits always have a safe continuation.
- The same seed and scripted inputs produce the same gameplay outcome and score.

## Persistence

- High score, currency, missions, cosmetics, and settings survive reload.
- Missing storage starts a fresh profile.
- Invalid JSON or old schema migrates or resets safely with a friendly notice.
- Starting a new run does not double-award results from the previous run.

## Responsive UI

- No essential HUD is cut off at 320×568 CSS pixels.
- Safe-area insets are respected.
- Menus are usable by keyboard.
- Touch gameplay does not scroll the page.
- Reduced-motion mode noticeably reduces camera and screen effects.

## Performance

- No unbounded growth in segments, pickups, obstacles, particles, or audio nodes.
- Game speed remains consistent at 30, 60, and 120 Hz rendering.
- Losing focus and returning does not teleport the runner or instantly cause a crash.
- Repeated restarts do not duplicate listeners or animation loops.

---

# 19. DEFINITION OF DONE

Hood Run is done for version 1 when:

- The complete loop is fun with placeholder-free core visuals.
- Three districts, twelve or more hazards/variations, four power-ups, route choices, Style Chain, and Block Party work.
- The tutorial, missions, local progression, cosmetics, accessibility settings, audio, and responsive layouts work.
- Automated or repeatable deterministic tests cover generator fairness, save behavior, and core state transitions.
- A human can play for ten minutes without a soft lock, invisible hazard, impossible path, broken UI, or severe performance decline.
- The README explains how to run, test, tune, and deploy the game.
- No third-party copyrighted characters, logos, music, code, or ripped assets are included.

---

# 20. GUARDRAILS: WHAT NOT TO BUILD

- Do not copy Temple Run maps, characters, UI, audio, logo treatment, narrative, or exact obstacle sequences.
- Do not center the premise on police pursuit, gangs, guns, drugs, theft, or urban misery.
- Do not add multiplayer, accounts, a backend, ads, purchases, loot boxes, or live services to version 1.
- Do not use procedural generation that can create unverified impossible patterns.
- Do not make visuals so detailed that mobile readability or performance suffers.
- Do not make a single giant script if modular files are possible.
- Do not bind simulation speed directly to render frame rate.
- Do not hide core tuning in animation code.
- Do not ship placeholder labels, debug controls, broken buttons, or unlicensed assets.

---

# 21. FINAL INSTRUCTION TO THE BUILDER

Begin with the smallest complete playable loop. Test it. Then add one system at a time in the phase order above. After every material change:

1. Load the game from a clean state.
2. Check the console.
3. Run the relevant deterministic or interaction test.
4. Play through the changed behavior.
5. Confirm mobile and desktop input still work.
6. Update the README and checklist when behavior or architecture changes.

When a choice is not specified, choose the option that best supports responsiveness, readability, fairness, warmth, and replayability. The final game should feel like an affectionate celebration of a living city neighborhood and a runner who knows how to turn every block into momentum.

