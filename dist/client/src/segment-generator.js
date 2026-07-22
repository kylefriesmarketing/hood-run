/* HOOD RUN — segment-generator.js
   Seeded, rule-driven route + content generation.
   Each segment's content comes from an rng forked from (runSeed, segIndex),
   so generation is deterministic regardless of build timing or route choice. */

import { LANE_W, HAZARDS, TUNE, DISTRICT_ORDER, DISTRICT_LEN, ROOF_MIN_DIST, makeRng, hash2 } from './data.js';
import { validatePlacement } from './collisions.js';

export function districtAt(dist) {
  const i = Math.floor(dist / DISTRICT_LEN) % DISTRICT_ORDER.length;
  return DISTRICT_ORDER[Math.max(0, i)];
}

export function phaseAt(runTime) {
  let p = TUNE.phases[0];
  for (const ph of TUNE.phases) if (runTime >= ph.t) p = ph;
  return p;
}

/* create the next segment descriptor (geometry pose + junction + split flag) */
export function nextSegDescriptor(G) {
  const prev = G.segs[G.segs.length - 1];
  let ang, ox, oz, start, index;
  if (!prev) { ang = 0; ox = 0; oz = 0; start = 0; index = 0; }
  else {
    ang = prev.ang + (prev.exit === 'L' ? Math.PI / 2 : prev.exit === 'R' ? -Math.PI / 2 : 0);
    ox = prev.ox + prev.dx * prev.len; oz = prev.oz + prev.dz * prev.len;
    start = prev.start + prev.len; index = prev.index + 1;
  }
  const rng = makeRng(hash2(G.seed, index));
  const dx = -Math.sin(ang), dz = -Math.cos(ang);
  const first = index === 0;
  const len = first ? 160 : 48 + rng() * 34;

  let exit;
  if (first) exit = 'S';                     // gentle warm-up: no turn demand on junction one
  else if (rng() < 0.16 && index > 2) exit = 'S';
  else {
    const lastTurn = prev ? prev.exit : null;
    if (lastTurn === 'L') exit = rng() < 0.62 ? 'R' : 'L';
    else if (lastTurn === 'R') exit = rng() < 0.62 ? 'L' : 'R';
    else exit = rng() < 0.5 ? 'L' : 'R';
  }

  // shortcut split offer: this segment tells the NEXT one to be a split candidate
  let splitNext = 0, splitKindNext = 'alley';
  const sinceSplit = index - (G.lastSplitIndex ?? -10);
  if (!first && !prev?.splitNext && !prev?.alleyPending && sinceSplit >= TUNE.shortcutEvery[0] &&
      (sinceSplit >= TUNE.shortcutEvery[1] || rng() < 0.35) && exit !== 'S' && index > 2) {
    splitNext = rng() < 0.5 ? -1 : 1;
    // rooftops unlock deeper into the run, then alternate with alleys
    splitKindNext = (start > ROOF_MIN_DIST && rng() < 0.5) ? 'rooftop' : 'alley';
    G.lastSplitIndex = index;
  }

  const district = districtAt(start);
  return {
    index, ang, ox, oz, dx, dz, cos: Math.cos(ang), sin: Math.sin(ang),
    len, start, exit, district, baseDistrict: district,
    splitNext,                      // this segment shows a shortcut gate near its exit
    splitKindNext,                  // 'alley' | 'rooftop' — what that gate leads to
    alley: false,                   // set by game when the player takes the gate
    alleyPending: !!(prev && prev.splitNext), // next seg is the split segment
    splitSide: prev ? prev.splitNext : 0,
    splitKind: prev ? prev.splitKindNext : 'alley',
    baseY: 0,                       // elevated for the rooftop variant
    group: null, rngSeed: hash2(G.seed, index),
  };
}

/* populate a segment with hazards + pickups. Content differs for alley variant.
   Appends to G.obs / G.coins / G.letters / G.tokens / G.powsList.
   Everything rolled from the segment's forked rng (+ a variant salt). */
export function populateSegment(G, seg, buildMeshCb, vinfo) {
  vinfo = vinfo || { variant: 0, active: true };
  const variant = vinfo.variant;
  const isShortcut = variant === 1;
  const kind = seg.splitKind || 'alley';
  const rng = makeRng(hash2(seg.rngSeed, 7777 + variant));
  const phase = phaseAt(G.time);
  const tier = isShortcut ? Math.min(4, phase.tier + 1) : phase.tier;
  const density = phase.density * (isShortcut ? 1.15 : 1);
  const dname = isShortcut ? kind : seg.district;
  const isAlley = isShortcut;   // both shortcut variants get the richer coin payout

  const pool = Object.keys(HAZARDS).filter(k => {
    const h = HAZARDS[k];
    return h.tier <= tier && h.districts.includes(dname);
  });
  const movers = pool.filter(k => HAZARDS[k].move);
  const statics = pool.filter(k => !HAZARDS[k].move);

  const startD = seg.start + (seg.index === 0 ? 30 : 9);
  const endD = seg.start + seg.len - 13;
  let d = startD;
  const placed = [];
  let groupsSinceRecovery = G.groupsSinceRecovery || 0;

  const minSp = Math.max(9, (16 - tier * 1.6)) / density;

  while (d < endD) {
    // recovery beat: a stretch of pure coins after several hazard groups
    const recoveryDue = groupsSinceRecovery >= TUNE.recoveryEvery[0] + rng() * (TUNE.recoveryEvery[1] - TUNE.recoveryEvery[0]);
    // power-up / token / letter turns (street variant only, so splits never dupe them)
    if (variant === 0) {
      if (d > G.nextPow) { addPow(G, seg, d, Math.floor(rng() * 3) - 1, rng, buildMeshCb, vinfo); G.nextPow = d + TUNE.powEveryMin + rng() * (TUNE.powEveryMax - TUNE.powEveryMin); d += 8; continue; }
      if (d > G.nextToken) { addToken(G, seg, d, Math.floor(rng() * 3) - 1, buildMeshCb, vinfo); G.nextToken = d + TUNE.tokenEveryMin + rng() * (TUNE.tokenEveryMax - TUNE.tokenEveryMin); d += 6; continue; }
      if (d > G.nextLetter && G.lettersGot.length + G.lettersOut < 4) {
        addLetter(G, seg, d, Math.floor(rng() * 3) - 1, buildMeshCb, vinfo);
        G.nextLetter = d + TUNE.letterEveryMin + rng() * (TUNE.letterEveryMax - TUNE.letterEveryMin); d += 6; continue;
      }
    }

    const r = rng();
    if (recoveryDue || r < 0.16) {                      // coin stretch
      const lane = Math.floor(rng() * 3) - 1;
      const zig = rng() < 0.4;
      const mult = isAlley ? 2 : 1;
      for (let i = 0; i < 6 * mult; i++) {
        const l = zig ? [(lane), (lane), 0, 0, (-lane), (-lane)][i % 6] : lane;
        addCoin(G, seg, d + i * 1.7, l, 0.9, buildMeshCb, vinfo, false);
      }
      d += 6 * mult * 1.7 + 4;
      groupsSinceRecovery = recoveryDue ? 0 : groupsSinceRecovery;
      continue;
    }

    // pick a hazard
    let kind;
    const wantMover = movers.length && rng() < phase.movers && !isAlley;
    if (wantMover) kind = movers[Math.floor(rng() * movers.length)];
    else kind = statics[Math.floor(rng() * statics.length)];
    const def = HAZARDS[kind];

    const o = { d, kind, clear: def.clear ?? null, h: def.h || 0, depth: def.depth,
      strict: !!def.strict, stumble: !!def.stumble, safe: !!def.safe,
      move: def.move || 0, active: vinfo.active,
      segIndex: seg.index, variant, done: false, mesh: null };

    if (def.lanes === 3) o.lanes = [-1, 0, 1];
    else if (def.lanes === 2) { const open = Math.floor(rng() * 3) - 1; o.lanes = [-1, 0, 1].filter(l => l !== open); }
    else o.lanes = [Math.floor(rng() * 3) - 1];
    if (o.move) {
      o.moveDir = rng() < 0.5 ? -1 : 1;
      o.startX = -o.moveDir * 3.6;                     // enters from one side
      o.curX = o.startX;
      o.lanes = [0];                                   // lanes unused for movers
    }

    // fairness: validate against recent lethal placements; push back if impossible
    const recent = placed.filter(p => p.d > d - 60).concat([o]).sort((a, b) => a.d - b.d);
    if (!validatePlacement(recent, G.speedForValidation || 22)) { d += 6; continue; }

    placed.push(o);
    G.obs.push(o);
    buildMeshCb && buildMeshCb('hazard', o, seg);

    // coin arc over jumpables sometimes
    if (o.clear === 'jump' && def.lanes === 1 && rng() < 0.5) {
      for (let i = 0; i < 5; i++) addCoin(G, seg, d - 3 + i * 1.5, o.lanes[0], 0.9 + Math.sin((i / 4) * Math.PI) * 1.15, buildMeshCb, vinfo, true);
    }
    // guide coins through the open lane of blockers
    if (def.lanes === 2 && rng() < 0.6) {
      const open = [-1, 0, 1].find(l => !o.lanes.includes(l));
      for (let i = 0; i < 4; i++) addCoin(G, seg, d - 2 + i * 1.6, open, 0.9, buildMeshCb, vinfo, false);
    }
    groupsSinceRecovery++;
    d += minSp + rng() * 8;
  }
  if (variant === 0) G.groupsSinceRecovery = groupsSinceRecovery;
}

function addCoin(G, seg, d, lane, y, cb, vinfo, air) {
  const c = { d, lane, y, air: !!air, taken: false, mesh: null, segIndex: seg.index,
    active: vinfo.active, variant: vinfo.variant };
  G.coins.push(c); cb && cb('coin', c, seg, vinfo);
}
function addToken(G, seg, d, lane, cb, vinfo) {
  const t = { d, lane, taken: false, mesh: null, segIndex: seg.index, active: true, variant: 0 };
  G.tokens.push(t); cb && cb('token', t, seg, vinfo);
}
function addLetter(G, seg, d, lane, cb, vinfo) {
  const idx = 'HOOD'.split('').findIndex((ch, i) => !G.lettersGot.includes(i) && !G.lettersPlaced.includes(i));
  if (idx < 0) return;
  G.lettersPlaced.push(idx);
  G.lettersOut++;
  const l = { d, lane, ch: 'HOOD'[idx], idx, taken: false, mesh: null, segIndex: seg.index, active: true, variant: 0 };
  G.letters.push(l); cb && cb('letter', l, seg, vinfo);
}
function addPow(G, seg, d, lane, rng, cb, vinfo) {
  const kinds = ['boost', 'magnet', 'doublestyle', 'shield'];
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const p = { d, lane, kind, taken: false, mesh: null, segIndex: seg.index, active: true, variant: 0 };
  G.powsList.push(p); cb && cb('pow', p, seg, vinfo);
}
