/* HOOD RUN — game.js
   The deterministic core: state machine, fixed-step simulation, scoring,
   style chain, Crosstown meter, difficulty, run lifecycle.
   No DOM, no THREE — pure logic + callbacks. */

import { TUNE, LANE_W, HAZARDS, CALLOUTS, CRASH_LINES, DISTRICTS, ROOF_H, HEADSTART_M, makeRng, hash2, dateKey, dailySeed } from './data.js';
import { nextSegDescriptor, populateSegment, districtAt, phaseAt } from './segment-generator.js';
import { checkCollisions, updateMovers } from './collisions.js';
import { loadSave, commitSave } from './save.js';
import { missionEvent, addCoins, addTokens, initMissions, powDurations, takeConsumables } from './progression.js';

export const STATES = { BOOT: 'boot', HOME: 'home', COUNTDOWN: 'countdown', RUNNING: 'running', PAUSED: 'paused', CRASHED: 'crashed', RESULTS: 'results' };
let state = STATES.BOOT;
export let G = null;

const cb = { state: null, callout: null, hud: null, tutorial: null, district: null, results: null, mesh: null, meshSwap: null, prune: null, sfx: null, fx: null };
function fx(kind, data) { cb.fx && cb.fx(kind, data); }
export function setCallbacks(c) { Object.assign(cb, c); }
export function getState() { return state; }
function setState(s) { state = s; window.__hrPlaying = (s === STATES.RUNNING || s === STATES.COUNTDOWN); cb.state && cb.state(s); }
export function toHome() { setState(STATES.HOME); }

/* ---------------- run lifecycle ---------------- */
export function startRun(seed, daily) {
  initMissions();                          // idempotent: refills to 3 active
  if (G) for (const seg of G.segs) cb.prune && cb.prune(seg);   // clear the previous run's world
  const save = loadSave();
  if (daily) seed = dailySeed();
  G = {
    seed: (seed >>> 0) || ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0),
    time: 0, dist: 0, speed: TUNE.speed0,
    lane: 0, laneX: 0, py: 0, vy: 0, sliding: 0,
    jumpBuf: 0, slideBuf: 0, coyote: 0, queueSlide: false,
    jumpStartD: undefined, slideStartD: undefined,
    stumbleT: 0, invuln: 0, puddleT: 0, shake: 0, runPhase: 0,
    segs: [], segIdx: 0, turned: false, lastSplitIndex: -10,
    obs: [], coins: [], tokens: [], letters: [], powsList: [],
    lettersGot: [], lettersPlaced: [], lettersOut: 0,
    nextPow: TUNE.powEveryMin * 0.6, nextToken: TUNE.tokenEveryMin * 0.7, nextLetter: TUNE.letterEveryMin,
    pows: { boost: 0, magnet: 0, doublestyle: 0, shield: 0 },
    style: { level: 0, lastT: -99, repeats: {}, max: 1 },
    meter: 0, partyT: 0, partyCount: 0,
    score: { dist: 0, coins: 0, style: 0, route: 0, letters: 0 },
    run: { coins: 0, tokens: 0, pslide: 0, pjump: 0, nearmiss: 0, shortcut: 0, hood: 0, nopowT: 0, maxNopowT: 0 },
    laneChanges: [],                       // timestamps for weave detection
    weaveCd: 0, gap: TUNE.gapStart,        // metres between Jay and the patrol
    crashCause: '', dieT: 0, resultsApplied: false,
    district: 'block',
    tutorial: !save.tutorialDone, tutStep: 0, tutDone: false,
    countdownT: TUNE.introDur,
    groupsSinceRecovery: 0, speedForValidation: 22,
    lastRebase: 0, god: false, daily: !!daily,
    powDur: powDurations(),          // store upgrades folded in
    cashMult: 1, usedItems: null,
  };
  genAhead();
  if (G.tutorial) placeTutorial();

  /* store consumables (never on Daily — that board must stay comparable) */
  const use = takeConsumables(!!daily || G.tutorial);
  G.usedItems = use;
  if (use.doubler) G.cashMult = 2;
  if (use.shield) G.pows.shield = G.powDur.shield;
  if (use.headstart) {
    // You paid to skip the warm-up, so skip the bank cinematic too — otherwise
    // it would drive G.dist back down the street and wipe the head start.
    applyHeadStart();
    G.introSkip = true;
    G.countdownT = 1.1;
  } else {
    G.dist = TUNE.introStart;      // start the very first frame at the doors
  }
  setState(STATES.COUNTDOWN);
  cb.hud && cb.hud(G, true);
}

/* jump the runner forward past the warm-up, retiring everything skipped */
function applyHeadStart() {
  G.dist = HEADSTART_M;
  while (G.segs[G.segIdx] && G.dist > G.segs[G.segIdx].start + G.segs[G.segIdx].len) {
    G.segIdx++; G.turned = false;
    const ns = G.segs[G.segIdx];
    if (ns && ns.alleyPending) resolveSplit(ns);
  }
  genAhead();
  for (const o of G.obs) if (o.d < G.dist + 2) o.done = true;
  for (const c of G.coins) if (c.d < G.dist + 2) c.taken = true;
  for (const arr of [G.tokens, G.letters, G.powsList]) for (const it of arr) if (it.d < G.dist + 2) it.taken = true;
  pruneBehind();
  G.score.dist = 0;                // the skipped metres are not earned score
}

function finishRun() {
  if (G.resultsApplied) return;
  G.resultsApplied = true;
  const s = loadSave();
  const total = totalScore();
  const newHigh = total > s.high;
  if (newHigh) s.high = total;
  if (G.dist > s.bestDist) s.bestDist = Math.floor(G.dist);
  s.lifetime.dist += Math.floor(G.dist);
  s.lifetime.runs += 1;
  s.lifetime.pslide += G.run.pslide; s.lifetime.pjump += G.run.pjump;
  s.lifetime.nearmiss += G.run.nearmiss; s.lifetime.shortcut += G.run.shortcut;
  s.lifetime.party += G.partyCount; s.lifetime.hood += G.run.hood;
  addCoins(G.run.coins); addTokens(G.run.tokens);
  // lifetime-stat missions get their per-run deltas now
  missionEvent('dist', Math.floor(G.dist));
  missionEvent('coins', G.run.coins);
  missionEvent('tokens', G.run.tokens);
  missionEvent('rundist', Math.floor(G.dist));
  missionEvent('nopow', Math.floor(Math.max(G.run.maxNopowT, G.run.nopowT)));
  // Daily Challenge bookkeeping
  let dailyBest = false, dailyToday = 0;
  if (G.daily) {
    const key = dateKey();
    if (s.daily.date !== key) { // first daily of a new day
      const prevKey = dateKey(new Date(Date.now() - 86400000));
      s.daily.streak = (s.daily.date === prevKey) ? (s.daily.streak + 1) : 1;
      s.daily.date = key; s.daily.best = 0; s.daily.playedToday = true;
    }
    s.daily.playedToday = true;
    if (total > s.daily.best) { s.daily.best = total; dailyBest = true; }
    dailyToday = s.daily.best;
  }
  commitSave();
  cb.results && cb.results({
    total, newHigh, dist: Math.floor(G.dist), coins: G.run.coins, tokens: G.run.tokens,
    parts: { ...G.score }, styleMax: G.style.max, cause: crashLine(G.crashCause),
    daily: G.daily, dailyBest, dailyToday, dailyStreak: s.daily.streak,
  });
}
export function totalScore() {
  const p = G.score;
  return Math.floor(p.dist + p.coins + p.style + p.route + p.letters);
}
function crashLine(cause) {
  const pool = CRASH_LINES[cause] || CRASH_LINES.generic;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------------- segments ---------------- */
function pathEnd() { const s = G.segs[G.segs.length - 1]; return s ? s.start + s.len : 0; }
function genAhead() {
  let added = false;
  while (pathEnd() < G.dist + 300) {
    const seg = nextSegDescriptor(G);
    G.segs.push(seg);
    G.speedForValidation = Math.max(18, G.speed + 4);
    cb.mesh && cb.mesh('segment', seg);          // build street geometry
    if (!(G.tutorial && seg.index <= 1)) {
      populateSegment(G, seg, cb.mesh, { variant: 0, active: !seg.alleyPending || true });
      if (seg.alleyPending) {
        // dormant shortcut variant, activated if the player takes the gate
        populateSegment(G, seg, cb.mesh, { variant: 1, active: false });
        cb.mesh && cb.mesh('alleyGroup', seg);   // build hidden shortcut dressing
      }
      added = true;
    }
  }
  // The shortcut variant is appended after the street variant but restarts at
  // the segment's near end, so the lists must be re-sorted: collision,
  // pickup and prune loops all early-exit on the first item past the player.
  if (added) {
    const byD = (a, b) => a.d - b.d;
    G.obs.sort(byD); G.coins.sort(byD);
    G.tokens.sort(byD); G.letters.sort(byD); G.powsList.sort(byD);
  }
}
function pruneBehind() {
  while (G.segs.length > 2 && G.segs[0].start + G.segs[0].len < G.dist - 45) {
    const old = G.segs.shift();
    cb.prune && cb.prune(old);
    G.segIdx--;
  }
  const cut = G.dist - 12;
  while (G.obs.length && (G.obs[0].d < cut || G.obs[0].done && G.obs[0].d < G.dist - 4)) G.obs.shift();
  while (G.coins.length && (G.coins[0].taken || G.coins[0].d < G.dist - 8)) G.coins.shift();
  while (G.tokens.length && (G.tokens[0].taken || G.tokens[0].d < G.dist - 8)) G.tokens.shift();
  while (G.powsList.length && (G.powsList[0].taken || G.powsList[0].d < G.dist - 8)) G.powsList.shift();
  for (let i = G.letters.length - 1; i >= 0; i--) {
    const l = G.letters[i];
    if (!l.taken && l.d < G.dist - 8) {          // missed letter goes back in the pool
      G.lettersPlaced = G.lettersPlaced.filter(x => x !== l.idx);
      G.lettersOut--;
      G.letters.splice(i, 1);
    } else if (l.taken) G.letters.splice(i, 1);
  }
}
export function findSeg(d) {
  for (let i = Math.max(0, G.segIdx - 1); i < G.segs.length; i++) {
    const s = G.segs[i];
    if (d < s.start + s.len || i === G.segs.length - 1) return s;
  }
  return G.segs[G.segs.length - 1];
}
export function worldPos(d, laneX, y, out) {
  const s = findSeg(d), t = d - s.start;
  out.x = s.ox + laneX * s.cos - t * s.sin;
  out.y = y + (s.baseY || 0);          // rooftop route rides above the street
  out.z = s.oz - laneX * s.sin - t * s.cos;
  return out;
}

/* ---------------- tutorial ---------------- */
const TUT_STEPS = [
  { d: 40, type: 'left',  msg: '⬅ Swipe or press LEFT' },
  { d: 62, type: 'right', msg: '➡ Now RIGHT' },
  { d: 86, type: 'jump',  msg: '⬆ JUMP the barrier!' },
  { d: 112, type: 'slide', msg: '⬇ SLIDE under!' },
  { d: 134, type: 'coins', msg: '💰 Grab the coins!' },
];
function placeTutorial() {
  const seg0 = G.segs[0];
  const mk = (kind, lanes, d) => {
    const def = HAZARDS[kind];
    const o = { d, kind, clear: def.clear ?? null, h: def.h || 0, depth: def.depth, strict: !!def.strict,
      stumble: !!def.stumble, safe: !!def.safe, move: 0, active: true, segIndex: seg0.index, variant: 0, done: false, mesh: null, lanes };
    G.obs.push(o); cb.mesh && cb.mesh('hazard', o, seg0);
  };
  mk('parkedcar', [0, 1], 46);         // forces left
  mk('parkedcar', [-1, 0], 68);        // forces right
  mk('fence', [-1, 0, 1], 92);         // forces jump
  mk('scaffold', [-1, 0, 1], 118);     // forces slide
  for (let i = 0; i < 6; i++) G.coins.push({ d: 138 + i * 1.7, lane: 0, y: 0.9, air: false, taken: false, mesh: null, segIndex: seg0.index, active: true, variant: 0 });
  for (const c of G.coins) cb.mesh && cb.mesh('coin', c, seg0);
}
function tutorialUpdate() {
  if (!G.tutorial || G.tutDone) return;
  const step = TUT_STEPS[G.tutStep];
  if (!step) {
    G.tutDone = true;
    const s = loadSave(); s.tutorialDone = true; commitSave();
    cb.tutorial && cb.tutorial(null, 'You got this! GO!');
    return;
  }
  if (G.dist > step.d - 26 && G.dist < step.d) cb.tutorial && cb.tutorial(step.msg);
  if (G.dist >= step.d) { G.tutStep++; cb.tutorial && cb.tutorial(null); }
}
export function skipTutorial() {
  if (!G || !G.tutorial) return;
  G.tutorial = false; G.tutDone = true;
  const s = loadSave(); s.tutorialDone = true; commitSave();
  cb.tutorial && cb.tutorial(null);
}

/* ---------------- style / meter ---------------- */
function addStyle(type) {
  const st = G.style;
  const reps = st.repeats[type] || 0;
  const mult2 = G.pows.doublestyle > 0 ? 2 : 1;
  const gain = (TUNE.styleGain[type] || 1) * Math.pow(TUNE.styleRepeatFalloff, reps) * mult2;
  st.repeats[type] = reps + 1;
  for (const k in st.repeats) if (k !== type) st.repeats[k] = Math.max(0, st.repeats[k] - 0.34);
  st.level = Math.min(TUNE.styleCap, st.level + gain * 0.5);
  st.lastT = G.time;
  st.max = Math.max(st.max, multiplier());
  G.score.style += gain * 25 * multiplier();
  addMeter(TUNE.meterGain[type] || 0.05);
  missionEvent('stylemax', st.max);
  if (CALLOUTS[type]) cb.callout && cb.callout(CALLOUTS[type], type);
}
export function multiplier() {
  return 1 + Math.floor(G.style.level) + (G.partyT > 0 ? TUNE.partyMultBonus : 0);
}
function addMeter(v) {
  if (G.partyT > 0) return;
  G.meter = Math.min(1, G.meter + v);
  if (G.meter >= 1) {
    G.partyT = TUNE.partyDur; G.partyCount++; G.meter = 1;
    missionEvent('party', 1);
    cb.callout && cb.callout(CALLOUTS.party, 'party');
    cb.sfx && cb.sfx('party');
    fx('party');
  }
}
function styleReset() { G.style.level = 0; G.style.repeats = {}; }

/* ---------------- input actions ---------------- */
export function act(k) {
  if (state === STATES.COUNTDOWN && (k === 'up' || k === 'tap')) return;
  if (state !== STATES.RUNNING) return;
  if (k === 'left' || k === 'right') {
    const s = G.segs[G.segIdx], jd = s.start + s.len;
    const win = Math.max(TUNE.turnWinBase, G.speed * TUNE.turnWinSpeed);
    const wants = (s.exit === 'L' && k === 'left') || (s.exit === 'R' && k === 'right');
    if (s.exit !== 'S' && !G.turned && wants && jd - G.dist < win) { G.turned = true; cb.sfx && cb.sfx('turn'); return; }
    const nl = Math.max(-1, Math.min(1, G.lane + (k === 'left' ? -1 : 1)));
    if (nl !== G.lane) {
      G.lane = nl; cb.sfx && cb.sfx('lane');
      G.laneChanges.push(G.time);
      G.laneChanges = G.laneChanges.filter(t => G.time - t < 2.5);
      if (G.laneChanges.length >= 3 && G.weaveCd <= 0) { G.weaveCd = 4; addStyle('weave'); }
    }
  } else if (k === 'up' || k === 'tap') {
    if (G.py <= 0.02 || G.coyote > 0) doJump();
    else G.jumpBuf = TUNE.jumpBuffer;
  } else if (k === 'down') {
    if (G.py > 0.1) { G.vy = TUNE.fastFallV; G.queueSlide = true; }
    else doSlide();
  }
}
function doJump() {
  G.vy = TUNE.jumpV; G.sliding = 0; G.coyote = 0; G.jumpBuf = 0;
  G.jumpStartD = G.dist;
  cb.sfx && cb.sfx('jump');
}
function doSlide() {
  G.sliding = TUNE.slideT; G.slideStartD = G.dist;
  cb.sfx && cb.sfx('slide');
}
export function pauseGame() {
  if (state === STATES.RUNNING) setState(STATES.PAUSED);
  else if (state === STATES.PAUSED) setState(STATES.RUNNING);
}
export function resumeGame() { if (state === STATES.PAUSED) setState(STATES.RUNNING); }

/* ---------------- crash / stumble ---------------- */
function crash(cause, force) {
  if (G.god) return;
  if (G.invuln > 0 && !force) return;
  if (G.pows.shield > 0) {
    G.pows.shield = 0;
    G.usedShield = true;
    G.invuln = TUNE.invulnT; G.stumbleT = TUNE.shieldRecover; G.shake = 0.4;
    cb.callout && cb.callout('🛡️ FRESH START!', 'shield');
    cb.sfx && cb.sfx('shieldSave');
    return;
  }
  G.crashCause = cause; G.dieT = 0; G.shake = 0.55;
  setState(STATES.CRASHED);
  cb.sfx && cb.sfx('crash');
  fx('crash');
}
function stumble() {
  if (G.god || G.invuln > 0) return;
  styleReset();
  G.gap -= TUNE.gapStumble;
  cb.sfx && cb.sfx('stumble');
  if (G.gap < TUNE.gapCaught) { crash('caught', true); return; }   // force past the invuln guard
  G.stumbleT = TUNE.stumbleT; G.invuln = TUNE.invulnT; G.shake = 0.3;
  cb.callout && cb.callout('STUMBLE — THEY\'RE CLOSING IN!', 'stumble');
}

/* ---------------- fixed step ---------------- */
export function stepFixed(dt) {
  if (!G) return;
  if (state === STATES.COUNTDOWN) {
    /* Opening cinematic: Jay sprints out of the bank doors to the kerb. He is
       really moving down the track (negative distance sits behind the start
       line, on the steps), so the hand-off at GO is seamless — no teleport. */
    G.countdownT -= dt;
    if (!G.introSkip) {
      const p = 1 - Math.max(0, Math.min(1, G.countdownT / TUNE.introDur));
      const eased = p * p * (3 - 2 * p);
      G.dist = TUNE.introStart * (1 - eased);
    }
    if (G.countdownT <= 0) {
      if (!G.introSkip) G.dist = 0;
      setState(STATES.RUNNING);
    }
    return;
  }
  if (state === STATES.CRASHED) {
    G.dieT += dt;
    G.gap = Math.max(0.5, G.gap - dt * 9);   // the patrol converges
    if (G.dieT > 1.15) { finishRun(); setState(STATES.RESULTS); }
    return;
  }
  if (state !== STATES.RUNNING) return;

  G.time += dt;
  /* speed & modifiers */
  const phase = phaseAt(G.time);
  let target = Math.min(TUNE.speedMax, TUNE.speed0 + G.dist * TUNE.speedRamp);
  if (G.tutorial && !G.tutDone) target = Math.min(target, 12);
  G.speed = target;
  let speedNow = G.speed;
  if (G.pows.boost > 0) speedNow *= TUNE.boostSpeed;
  if (G.stumbleT > 0) speedNow *= TUNE.stumbleSlow;
  if (G.puddleT > 0) speedNow *= TUNE.puddleSlow;

  G.stumbleT = Math.max(0, G.stumbleT - dt);
  G.invuln = Math.max(0, G.invuln - dt);
  G.puddleT = Math.max(0, G.puddleT - dt);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  G.weaveCd = Math.max(0, G.weaveCd - dt);

  /* junction check before moving */
  const s = G.segs[G.segIdx], jd = s.start + s.len;
  if (s.exit !== 'S' && !G.turned && G.dist + speedNow * dt > jd - 0.4) {
    if (G.god) G.turned = true;
    else { G.dist = jd - 0.4; crash('wall'); return; }
  }
  const prevDist = G.dist;
  G.dist += speedNow * dt;
  G.score.dist += speedNow * dt * multiplier() * 0.5;

  /* crossing segments (turn or straight or split choice) */
  while (G.dist > G.segs[G.segIdx].start + G.segs[G.segIdx].len) {
    G.segIdx++; G.turned = false;
    const ns = G.segs[G.segIdx];
    if (ns && ns.alleyPending) resolveSplit(ns);
  }

  genAhead(); pruneBehind();

  /* origin rebase for float safety */
  if (G.dist - G.lastRebase > TUNE.rebaseEvery) {
    G.lastRebase = G.dist;
    const p = worldPos(G.dist, 0, 0, { x: 0, y: 0, z: 0 });
    for (const seg of G.segs) { seg.ox -= p.x; seg.oz -= p.z; }
    cb.meshSwap && cb.meshSwap('rebase', { dx: -p.x, dz: -p.z });
  }

  /* lanes */
  const targetX = G.lane * LANE_W;
  const dx = targetX - G.laneX;
  const maxStep = TUNE.laneSnap * dt;
  G.laneX += Math.max(-maxStep, Math.min(maxStep, dx));

  /* vertical */
  const wasAir = G.py > 0;
  if (G.py > 0 || G.vy > 0) {
    G.vy -= TUNE.gravity * dt; G.py += G.vy * dt;
    if (G.py <= 0) {
      G.py = 0; G.vy = 0;
      cb.sfx && cb.sfx('land'); fx('land');
      if (G.queueSlide) { G.sliding = TUNE.slideT * 0.7; G.queueSlide = false; G.slideStartD = G.dist; cb.sfx && cb.sfx('slide'); }
      else if (G.jumpBuf > 0) doJump();
    }
  } else if (wasAir) G.coyote = TUNE.coyote;
  G.jumpBuf = Math.max(0, G.jumpBuf - dt);
  G.coyote = Math.max(0, G.coyote - dt);
  G.sliding = Math.max(0, G.sliding - dt);

  /* power-up timers */
  for (const k of ['boost', 'magnet', 'doublestyle']) G.pows[k] = Math.max(0, G.pows[k] - dt);
  const anyPow = G.pows.boost > 0 || G.pows.magnet > 0 || G.pows.doublestyle > 0 || G.pows.shield > 0;
  if (anyPow) { G.run.maxNopowT = Math.max(G.run.maxNopowT, G.run.nopowT); G.run.nopowT = 0; }
  else G.run.nopowT += dt;

  /* moving-hazard telegraph: bell/bark once as a mover comes into view (§5 fairness) */
  for (const o of G.obs) {
    if (!o.move || o.done || o.warned) continue;
    const rel = o.d - G.dist;
    if (rel < G.speed * 1.3 && rel > 0) {
      o.warned = true;
      cb.sfx && cb.sfx(o.kind === 'bball' ? 'bounce' : 'bell');
    }
  }

  /* movers + collisions */
  updateMovers(G.obs, G.dist, G.time);
  const events = checkCollisions(G);
  for (const ev of events) {
    if (ev.type === 'crash') { crash(ev.obs.kind); return; }
    if (ev.type === 'stumble') stumble();
    else if (ev.type === 'puddle') { G.puddleT = TUNE.puddleT; styleReset(); cb.sfx && cb.sfx('splash'); }
    else if (ev.type === 'smash') { G.shake = Math.max(G.shake, 0.2); cb.sfx && cb.sfx('stumble'); }
    else if (ev.type === 'perfectJump') { G.run.pjump++; missionEvent('pjump', 1); addStyle('perfectJump'); }
    else if (ev.type === 'perfectSlide') { G.run.pslide++; missionEvent('pslide', 1); addStyle('perfectSlide'); }
    else if (ev.type === 'nearMiss') { G.run.nearmiss++; missionEvent('nearmiss', 1); addStyle('nearMiss'); fx('nearMiss', { lanes: ev.obs.lanes }); }
  }

  /* style decay */
  if (G.time - G.style.lastT > TUNE.styleQuiet && G.style.level > 0) {
    G.style.level = Math.max(0, G.style.level - TUNE.styleDecay * dt);
  }

  /* party timer */
  if (G.partyT > 0) { G.partyT -= dt; G.meter = Math.max(0, G.partyT / TUNE.partyDur); }

  /* the patrol falls back while you run clean */
  G.gap = Math.min(TUNE.gapMax, G.gap + TUNE.gapRegen * dt);

  /* pickups */
  collectPickups(dt);

  tutorialUpdate();
  cb.hud && cb.hud(G);
}

function resolveSplit(seg) {
  const side = seg.splitSide;
  const took = side !== 0 && G.lane === side;
  seg.alley = took;                                   // "on the shortcut variant"
  seg.baseY = (took && seg.splitKind === 'rooftop') ? ROOF_H : 0;
  const activeVariant = took ? 1 : 0;
  // tokens/letters/power-ups only ever exist on the street variant, so taking a
  // shortcut must retire them — their meshes ride the hidden street group and
  // they'd otherwise be collectible while invisible.
  for (const arr of [G.obs, G.coins, G.tokens, G.letters, G.powsList]) {
    for (const it of arr) if (it.segIndex === seg.index) it.active = (it.variant === activeVariant);
  }
  cb.meshSwap && cb.meshSwap('split', { seg, alley: took, kind: seg.splitKind });
  if (took) {
    G.run.shortcut++; missionEvent('shortcut', 1);
    G.score.route += TUNE.shortcutBonus;
    addStyle('shortcut');
    fx('shortcut');
    cb.callout && cb.callout(seg.splitKind === 'rooftop' ? '🏙️ ROOFTOPS!' : '🧺 ALLEY!', 'shortcut');
  }
}

function collectPickups(dt) {
  const magnet = G.pows.magnet > 0 || G.partyT > 0;
  const magR = TUNE.magnetR;
  const laneC = l => l * LANE_W;
  let got = 0;
  for (const c of G.coins) {
    if (c.taken || !c.active) continue;
    if (c.d - G.dist > (magnet ? magR + 2 : 3)) break;
    const near = Math.abs(c.d - G.dist) < (magnet ? magR : 1.5);
    const laneOk = magnet || (Math.abs(G.laneX - laneC(c.lane)) < 1.15 && Math.abs((G.py + 1.0) - c.y) < 1.35);
    if (near && laneOk) {
      c.taken = true; if (c.mesh) c.mesh.visible = false;
      got++;
      if (c.air && G.py > 0.4) addStyle('airCoin');
    }
  }
  if (got) {
    G.comboN = (G.comboT > 0) ? (G.comboN || 0) + got : got;
    G.comboT = 1.6;
    const gain = got * G.cashMult;
    G.run.coins += gain;
    G.score.coins += gain * TUNE.coinScore;
    cb.sfx && cb.sfx('coin', G.comboN);
    fx('coin');
    if ((G.comboN % 6) === 0) addStyle('coinLine');
  }
  G.comboT = Math.max(0, (G.comboT || 0) - dt);

  for (const t of G.tokens) {
    if (t.taken || !t.active) continue;
    if (t.d - G.dist > 3) break;
    if (Math.abs(t.d - G.dist) < 1.6 && Math.abs(G.laneX - laneC(t.lane)) < 1.15) {
      t.taken = true; if (t.mesh) t.mesh.visible = false;
      G.run.tokens++; G.score.route += TUNE.tokenScore;
      cb.sfx && cb.sfx('token');
      cb.callout && cb.callout('🔷 CROSSTOWN TOKEN', 'token');
    }
  }
  for (const l of G.letters) {
    if (l.taken || !l.active) continue;
    if (l.d - G.dist > 3) break;
    if (Math.abs(l.d - G.dist) < 1.6 && Math.abs(G.laneX - laneC(l.lane)) < 1.15) {
      l.taken = true; if (l.mesh) l.mesh.visible = false;
      G.lettersGot.push(l.idx); G.lettersOut--;
      cb.sfx && cb.sfx('letter');
      addStyle('letter');
      cb.callout && cb.callout('HOOD'.split('').map((ch, i) => G.lettersGot.includes(i) ? ch : '·').join(' '), 'letter');
      if (G.lettersGot.length === 4) {
        G.score.letters += TUNE.letterBonus;
        G.run.hood++; missionEvent('hood', 1);
        G.lettersGot = []; G.lettersPlaced = []; G.lettersOut = 0;
        cb.callout && cb.callout(CALLOUTS.hood, 'hood');
        cb.sfx && cb.sfx('hood');
      }
    }
  }
  for (const p of G.powsList) {
    if (p.taken || !p.active) continue;
    if (p.d - G.dist > 3) break;
    if (Math.abs(p.d - G.dist) < 1.6 && Math.abs(G.laneX - laneC(p.lane)) < 1.15) {
      p.taken = true; if (p.mesh) p.mesh.visible = false;
      G.pows[p.kind] = G.powDur[p.kind];
      cb.sfx && cb.sfx('pow');
      fx('pow', { kind: p.kind });
    }
  }
}

/* district of the player's current position (drives lighting + banner) */
export function currentDistrict() {
  const s = G && G.segs[G.segIdx];
  return s ? (s.alley ? (s.splitKind || 'alley') : s.district) : 'block';
}
export function districtLabel(name) { return DISTRICTS[name]?.label || name; }
