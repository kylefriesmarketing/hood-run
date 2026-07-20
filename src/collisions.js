/* HOOD RUN — collisions.js
   Pure, deterministic collision + style-event detection over the sim state.
   One result per hazard: clear | shieldSave | stumble | crash (bible §14).
   Also detects: near miss, perfect jump/slide, puddle splash. */

import { HAZARDS, LANE_W, TUNE } from './data.js';

const laneCenter = l => l * LANE_W;

/* update mover lateral positions (sim-side, deterministic) */
export function updateMovers(obs, dist, time) {
  for (const o of obs) {
    if (!o.move || o.done) continue;
    if (o.d - dist > 45) continue;
    if (o.moveT0 === undefined) { o.moveT0 = time; }        // starts rolling when near
    const t = time - o.moveT0;
    o.curX = o.startX + o.moveDir * o.move * LANE_W * t;
    if (Math.abs(o.curX) > 4.4) o.done = true;              // rolled off the road
  }
}

/* returns events: [{type:'crash'|'stumble'|'puddle', obs}] and mutates obs flags.
   clearedEvents: [{type:'perfectJump'|'perfectSlide'|'nearMiss', obs}] */
export function checkCollisions(G) {
  const events = [];
  const pxL = G.laneX - 0.42, pxR = G.laneX + 0.42;
  for (const o of G.obs) {
    if (o.done || !o.active) continue;
    const rel = o.d - G.dist;
    if (rel > 5) break;

    const def = HAZARDS[o.kind];
    const halfDepth = (o.depth * (def.hit ?? 1)) / 2;

    /* ----- passed cleanly: score style events once ----- */
    if (rel < -halfDepth - 0.6) {
      o.done = true;
      if (!o.wasHit) {
        // near miss: player was in an occupied lane's neighbourhood while passing
        const margin = TUNE.nearMissMargin;
        let near = false;
        for (const c of occupiedCenters(o)) {
          const dx = Math.abs(G.laneX - c);
          if (dx > 1.05 && dx < 1.05 + margin) near = true;
        }
        if (o.passAction === 'jump') events.push({ type: 'perfectJump', obs: o });
        else if (o.passAction === 'slide') events.push({ type: 'perfectSlide', obs: o });
        else if (near && !def.safe) events.push({ type: 'nearMiss', obs: o });
      }
      continue;
    }

    /* ----- overlapping window ----- */
    if (Math.abs(rel) < halfDepth + 0.45) {
      let occupied = false;
      for (const c of occupiedCenters(o)) {
        if (pxR > c - 1.05 && pxL < c + 1.05) { occupied = true; break; }
      }
      if (!occupied) continue;

      if (def.safe) {                                        // puddle
        if (!o.splashed && G.py < 0.15) { o.splashed = true; events.push({ type: 'puddle', obs: o }); }
        continue;
      }
      let cleared = false, action = null;
      if (o.clear === 'jump') { if (G.py > o.h) { cleared = true; action = 'jump'; } }
      else if (o.clear === 'slide') {
        if (G.sliding > 0 && G.py < 0.3) { cleared = true; action = 'slide'; }
        else if (!o.strict && G.py > 1.35) { cleared = true; action = 'jump'; }
      }
      if (cleared) {
        // perfect if the action happened close to the hazard (tight timing)
        if (action === 'jump' && G.jumpStartD !== undefined && (o.d - G.jumpStartD) < G.speed * 0.45 && !o.passScored) { o.passAction = 'jump'; o.passScored = true; }
        if (action === 'slide' && G.slideStartD !== undefined && (o.d - G.slideStartD) < G.speed * 0.45 && !o.passScored) { o.passAction = 'slide'; o.passScored = true; }
        continue;
      }
      // boost smashes minor clutter (stumble-class hazards)
      if (G.pows.boost > 0 && (def.stumble || o.kind === 'boxes')) {
        o.done = true; o.smashed = true; events.push({ type: 'smash', obs: o }); continue;
      }
      o.wasHit = true; o.done = true;
      events.push({ type: def.stumble ? 'stumble' : 'crash', obs: o });
      return events;                                         // one lethal result per step
    }
  }
  return events;
}

function occupiedCenters(o) {
  if (o.move) return [o.curX ?? laneCenter(o.lanes[0])];
  return o.lanes.map(laneCenter);
}

/* ---------- generation-time fairness validation ----------
   Given the rolling obstacle list (sorted by d), verify at least one lane
   survives every lethal event chain, assuming lane changes take
   TUNE.laneChangeTime * speed metres and jumps/slides are always available. */
export function validatePlacement(obstacles, speed) {
  let lanes = new Set([-1, 0, 1]);
  let lastD = -Infinity;
  for (const o of obstacles) {
    const def = HAZARDS[o.kind];
    if (def.safe || def.stumble || o.clear) continue;        // survivable in place
    // lethal lane-blockers only
    const reach = Math.max(1, Math.floor((o.d - lastD) / (speed * TUNE.laneChangeTime) + 0.001));
    const next = new Set();
    for (const l of [-1, 0, 1]) {
      if (o.lanes.includes(l)) continue;
      for (const from of lanes) if (Math.abs(l - from) <= reach) { next.add(l); break; }
    }
    if (next.size === 0) return false;
    lanes = next; lastD = o.d;
  }
  return true;
}
