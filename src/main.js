/* HOOD RUN — main.js
   Boot + wiring: world view, mesh lifecycle, render loop (fixed-step sim,
   interpolation-free render), adaptive quality, district transitions,
   Block Party effects, and the __hr test harness. */

import * as THREE from '../lib/three.module.js';
import { LANE_W, HALF, HAZARDS, DISTRICTS, TUNE } from './data.js';
import { loadSave, commitSave, resetSave } from './save.js';
import * as W from './world.js';
import * as GAME from './game.js';
import { STATES } from './game.js';
import { buildRunner, runnerMesh, poseRunner, updateTrail } from './runner.js';
import * as VFX from './vfx.js';
import { initMissions } from './progression.js';
import { attachInput, onAction } from './input.js';
import { audioInit, audioResume, musicStart, musicStop, musicLayers, sfx } from './audio.js';
import * as UI from './ui.js';

/* ---------------- boot ---------------- */
const canvas = document.getElementById('gl');
W.initWorld(canvas);
initMissions();
const save0 = loadSave();
buildRunner(save0.unlocks.equipped);
VFX.initVfx();
VFX.setReducedMotion(save0.settings.reducedMotion);
W.applyDistrict('block', true);

let decorDensity = 1;                       // adaptive quality knob
const laneC = l => l * LANE_W;

/* ---------------- mesh lifecycle callbacks ---------------- */
function segOpts(seg, first) {
  return { district: seg.district, first, decorDensity, contrast: UI.highContrast() };
}
function meshCb(kind, item, seg, vinfo) {
  const G = GAME.G;
  if (kind === 'segment') {
    W.buildSegment(item, segOpts(item, item.index === 0));
    return;
  }
  if (kind === 'alleyGroup') {
    const roof = item.splitKind === 'rooftop';
    const shadow = Object.assign({}, item, { alley: true, group: null });
    W.buildSegment(shadow, Object.assign(segOpts(item, false), { roof }));
    item.alleyGroup = shadow.group;
    item.alleyGroup.visible = false;
    return;
  }
  const targetSeg = G.segs.find(s => s.index === item.segIndex) || seg;
  if (!targetSeg) return;
  const parent = (item.variant === 1) ? targetSeg.alleyGroup : targetSeg.group;
  if (!parent) return;
  const lz = -(item.d - targetSeg.start);
  let m = null;
  if (kind === 'hazard') {
    m = W.mkHazardMesh(item.kind);
    const def = HAZARDS[item.kind];
    let x = 0;
    if (item.move) x = item.startX;
    else if (def.lanes === 1) x = laneC(item.lanes[0]);
    else if (def.lanes === 2) x = (laneC(item.lanes[0]) + laneC(item.lanes[1])) / 2;
    m.position.set(x, 0.02, lz);
    if (item.kind === 'parkedcar') m.rotation.y = Math.PI / 2;
    if (UI.highContrast() && !def.safe && !def.stumble) {
      const wSpan = def.lanes === 3 ? 7.4 : def.lanes === 2 ? 4.4 : 2.0;
      const y = def.clear === 'slide' ? (def.h - 0.06) : Math.max(def.h || 0, 1.0) + 0.15;
      m.add(W.box(wSpan, 0.09, 0.09, 0, 0, y, 0, new THREE.MeshBasicMaterial({ color: 0xff7a00 })));
    }
  } else if (kind === 'coin') { m = W.mkCoin(); m.position.set(laneC(item.lane), item.y, lz); }
  else if (kind === 'token') { m = W.mkToken(); m.position.set(laneC(item.lane), 1.0, lz); }
  else if (kind === 'letter') { m = W.mkLetter(item.ch); m.position.set(laneC(item.lane), 1.1, lz); }
  else if (kind === 'pow') { m = W.mkPowerup(item.kind); m.position.set(laneC(item.lane), 1.1, lz); }
  if (m) { item.mesh = m; parent.add(m); }
}
function meshSwapCb(kind, data) {
  if (kind === 'split') {
    const { seg, alley } = data;
    if (alley && seg.alleyGroup) { seg.group.visible = false; seg.alleyGroup.visible = true; }
  } else if (kind === 'rebase') {
    const { dx, dz } = data;
    for (const seg of GAME.G.segs) {
      if (seg.group) { seg.group.position.x += dx; seg.group.position.z += dz; }
      if (seg.alleyGroup) { seg.alleyGroup.position.x += dx; seg.alleyGroup.position.z += dz; }
    }
    W.camera.position.x += dx; W.camera.position.z += dz;
    if (dogCameo) { dogCameo.position.x += dx; dogCameo.position.z += dz; }
  }
}
function pruneCb(seg) {
  if (seg.group) { W.scene.remove(seg.group); W.disposeGroup(seg.group); }
  if (seg.alleyGroup) { W.scene.remove(seg.alleyGroup); W.disposeGroup(seg.alleyGroup); }
}

/* ---------------- district watcher ---------------- */
let lastDistrict = 'block';
function watchDistrict() {
  const d = GAME.currentDistrict();
  if (d === 'alley' || d === lastDistrict) return;
  lastDistrict = d;
  W.applyDistrict(d, false);
  const s = loadSave();
  s.discovered = s.discovered || ['block'];
  const isNew = !s.discovered.includes(d);
  if (isNew) { s.discovered.push(d); commitSave(); }
  UI.showDistrictBanner((isNew ? 'NEW DISTRICT<br>' : '') + DISTRICTS[d].label, DISTRICTS[d].icon);
}

/* ---------------- game callbacks ---------------- */
GAME.setCallbacks({
  state: onState,
  callout: (text, kind) => UI.showCallout(text, kind),
  hud: (G, force) => UI.updateHud(G, force, GAME.multiplier(), GAME.totalScore()),
  tutorial: (msg, done) => UI.showTutorial(msg, done),
  results: r => { UI.showResults(r); UI.refreshHome(); },
  mesh: meshCb, meshSwap: meshSwapCb, prune: pruneCb,
  sfx: (name, arg) => sfx[name] && sfx[name](arg),
  fx: fxCb,
});

const fxPos = new THREE.Vector3();
function fxCb(kind, data) {
  const G = GAME.G; if (!G) return;
  GAME.worldPos(G.dist, G.laneX, G.py, fxPos);
  if (kind === 'coin') VFX.coinPop(fxPos.x, fxPos.y + 1.0, fxPos.z);
  else if (kind === 'land') VFX.landDust(fxPos.x, fxPos.z);
  else if (kind === 'crash') VFX.crashBurst(fxPos.x, fxPos.y, fxPos.z);
  else if (kind === 'shortcut') VFX.shortcutStreak(fxPos.x, fxPos.y, fxPos.z);
  else if (kind === 'party') VFX.partyConfetti(fxPos.x, fxPos.y, fxPos.z);
  else if (kind === 'pow') VFX.powBurst(fxPos.x, fxPos.y, fxPos.z, colorFor(data && data.kind));
  else if (kind === 'nearMiss') {
    const side = (data && data.lanes && data.lanes[0] < 0) ? 1 : -1;
    VFX.nearMissWhoosh(fxPos.x, fxPos.y, fxPos.z, side);
  }
}
function colorFor(k) { return ({ boost: 0xffd23c, magnet: 0x3bd6c6, doublestyle: 0xff4f9a, shield: 0x7bff5e })[k] || 0xffffff; }

function onState(s) {
  document.body.classList.toggle('playing', s === STATES.RUNNING || s === STATES.COUNTDOWN);
  if (s === STATES.RUNNING) { musicStart(); UI.hideScreens(); }
  else if (s === STATES.PAUSED) { musicStop(); UI.showScreen('paused'); }
  else if (s === STATES.CRASHED) { musicStop(); }
  else if (s === STATES.COUNTDOWN) { UI.hideScreens(); introT = 1.9; baseYView = 0; }
  else if (s === STATES.HOME) { musicStop(); }
  if (s !== STATES.COUNTDOWN) UI.showCountdown(null);
}

/* ---------------- input wiring ---------------- */
attachInput();
onAction(a => {
  const st = GAME.getState();
  if (a === 'pause') {
    if (st === STATES.RUNNING) { GAME.pauseGame(); }
    else if (st === STATES.PAUSED) { GAME.resumeGame(); UI.hideScreens(); }
    return;
  }
  if (a === 'confirm') {
    if (document.getElementById('home').classList.contains('show') && document.activeElement?.tagName !== 'BUTTON') startRunFlow();
    return;
  }
  if (st === STATES.RUNNING || st === STATES.COUNTDOWN) {
    audioResume();
    GAME.act(a === 'tap' ? 'up' : a);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !window.__hrTest && GAME.getState() === STATES.RUNNING) GAME.pauseGame();
});

/* ---------------- flows ---------------- */
function startRunFlow(seed, daily) {
  audioInit(); audioResume();
  lastDistrict = 'block';
  W.applyDistrict('block', true);
  GAME.startRun(seed, daily);
  sfx.alarm();
}
UI.initUI({
  startRun: (daily) => startRunFlow(undefined, daily),
  toHome: () => { GAME.toHome(); UI.refreshHome(); },
  resume: () => { GAME.resumeGame(); UI.hideScreens(); },
  pause: () => GAME.pauseGame(),
  skipTutorial: () => GAME.skipTutorial(),
  rebuildRunner: () => buildRunner(loadSave().unlocks.equipped),
  replayTutorial: () => { const s = loadSave(); s.tutorialDone = false; commitSave(); UI.showToast('Tutorial will replay on your next run.'); },
});

/* ---------------- view ---------------- */
let camAng = 0, playerAng = 0, viewTime = 0, whistleT = 3, partyFxT = 0, introT = 0, baseYView = 0;
const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3(), pPos = new THREE.Vector3(), oPos = new THREE.Vector3();
const introPos = new THREE.Vector3(), introLook = new THREE.Vector3();
const smooth = t => t * t * (3 - 2 * t);
const dogCameo = W.mkDogCameo(); W.scene.add(dogCameo); dogCameo.visible = false;
const speedLinesEl = document.getElementById('speed-lines');
const debugEl = document.getElementById('debug');
let debugOn = false, fpsAvg = 60;
addEventListener('keydown', e => {
  if (e.key === '`' || e.key === '~') { debugOn = !debugOn; debugEl.classList.toggle('show', debugOn); }
});
function updateDebug(dt) {
  if (!debugOn) return;
  fpsAvg = fpsAvg * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1;
  const G = GAME.G;
  if (!G) { debugEl.textContent = `state ${GAME.getState()}\nfps  ${fpsAvg.toFixed(0)}`; return; }
  const s = G.segs[G.segIdx];
  const tier = (() => { let t = 0; for (const p of TUNE.phases) if (G.time >= p.t) t = p.tier; return t; })();
  const obsAhead = G.obs.filter(o => !o.done && o.active && o.d > G.dist).slice(0, 4)
    .map(o => `  ${o.kind}@${(o.d - G.dist).toFixed(0)} [${o.lanes ? o.lanes.join('') : 'mv'}] ${o.clear || (o.safe ? 'safe' : '×')}`).join('\n');
  debugEl.textContent =
    `seed  ${G.seed}${G.daily ? ' (DAILY)' : ''}\n` +
    `fps   ${fpsAvg.toFixed(0)}   dpr ${W.renderer.getPixelRatio().toFixed(2)}\n` +
    `dist  ${G.dist.toFixed(0)}m  spd ${G.speed.toFixed(1)}  tier ${tier}\n` +
    `seg   #${s.index} ${s.alley ? 'ALLEY' : s.district} exit:${s.exit} ${(s.start + s.len - G.dist).toFixed(0)}m→jct\n` +
    `pool  segs ${G.segs.length}  obs ${G.obs.length}  coins ${G.coins.length}\n` +
    `chase gap ${G.gap.toFixed(1)}m  style×${GAME.multiplier()}  meter ${(G.meter * 100).toFixed(0)}%\n` +
    `pows  ${Object.entries(G.pows).filter(([, v]) => v > 0).map(([k, v]) => k + ':' + v.toFixed(1)).join(' ') || '—'}\n` +
    `next:\n${obsAhead || '  —'}`;
}
const officers = [W.mkOfficer(), W.mkOfficer(), W.mkOfficer()];
for (const o of officers) { W.scene.add(o); o.visible = false; }

function updateView(dt) {
  const G = GAME.G, st = GAME.getState();
  viewTime += dt;
  if (!G) return;
  const rm = document.body.classList.contains('reduced-motion');
  VFX.setReducedMotion(rm);

  const s = GAME.findSeg(G.dist);
  let targetAng = s.ang;
  if (G.turned) {
    const next = G.segs[G.segs.indexOf(s) + 1];
    if (next && (s.start + s.len - G.dist) < 6) targetAng = next.ang;
  }
  camAng = lerpAngle(camAng, targetAng, 1 - Math.exp(-dt * 5));
  playerAng = lerpAngle(playerAng, targetAng, 1 - Math.exp(-dt * 10));

  GAME.worldPos(G.dist, G.laneX, 0, pPos);
  // smooth the climb/drop between street level and the rooftop route
  baseYView += (pPos.y - baseYView) * (1 - Math.exp(-dt * 6));
  if (Math.abs(pPos.y - baseYView) < 0.02) baseYView = pPos.y;
  pPos.y = baseYView;
  const mesh = runnerMesh();
  mesh.position.set(pPos.x, pPos.y + G.py, pPos.z);
  mesh.rotation.y = playerAng;

  /* pose */
  if (st === STATES.CRASHED) poseRunner({ mode: 'crash', dt, time: viewTime, stumble: 0 });
  else if (st === STATES.RESULTS) poseRunner({ mode: 'celebrate', time: viewTime, stumble: 0 });
  else if (st === STATES.HOME || st === STATES.COUNTDOWN) poseRunner({ mode: 'idle', time: viewTime, stumble: 0 });
  else {
    G.runPhase += dt * G.speed * 0.9;
    const mode = G.py > 0.02 ? 'jump' : (G.sliding > 0 ? 'slide' : 'run');
    poseRunner({ mode, phase: G.runPhase, time: viewTime, stumble: G.stumbleT, lean: rm ? 0 : (G.lane * LANE_W - G.laneX) });
  }
  mesh.visible = !(G.invuln > 0 && st === STATES.RUNNING && (Math.floor(viewTime * 14) % 2) === 1);

  /* trail */
  updateTrail(dt, st === STATES.RUNNING && (G.speed > 16 || G.partyT > 0), pPos, viewTime);

  /* movers + pickups animation */
  for (const o of G.obs) {
    if (!o.mesh) continue;
    if (o.move && !o.done) { o.mesh.position.x = o.curX; o.mesh.rotation.z -= dt * 6 * o.moveDir; }
    if (o.smashed) { o.mesh.position.y -= dt * 3; o.mesh.rotation.x += dt * 8; }
  }
  for (const c of G.coins) if (c.mesh && !c.taken) c.mesh.rotation.y += dt * 3.4;
  for (const t of G.tokens) if (t.mesh && !t.taken) { t.mesh.rotation.y += dt * 2.4; t.mesh.position.y = 1.0 + Math.sin(viewTime * 3 + t.d) * 0.14; }
  for (const l of G.letters) if (l.mesh && !l.taken) { l.mesh.rotation.y += dt * 2; l.mesh.position.y = 1.1 + Math.sin(viewTime * 3 + l.d) * 0.14; }
  for (const p of G.powsList) if (p.mesh && !p.taken) { p.mesh.rotation.y += dt * 2; p.mesh.position.y = 1.1 + Math.sin(viewTime * 3 + p.d) * 0.14; }

  /* decor animation + party pulse */
  W.animateSegments(G.segs, viewTime, G.partyT > 0 && !rm);
  document.body.classList.toggle('party', G.partyT > 0);

  /* particles + continuous party confetti */
  VFX.updateVfx(dt);
  if (G.partyT > 0 && st === STATES.RUNNING && !rm) {
    partyFxT -= dt;
    if (partyFxT <= 0) { partyFxT = 0.28; VFX.partyConfetti(pPos.x, pPos.y, pPos.z); }
  }

  /* the patrol — visible whenever the gap is short enough to be seen */
  const chasing = st === STATES.RUNNING || st === STATES.CRASHED;
  for (let i = 0; i < officers.length; i++) {
    const om = officers[i];
    om.visible = chasing;
    if (!chasing) continue;
    const od = G.dist - G.gap - i * 1.5;
    const tLX = G.laneX + (i - 1) * 0.85;
    om.userData.lx = lerpNum(om.userData.lx ?? tLX, tLX, 1 - Math.exp(-dt * 4));
    GAME.worldPos(od, Math.max(-3, Math.min(3, om.userData.lx)), 0, oPos);
    om.position.copy(oPos);
    om.rotation.y = playerAng;
    const b = om.userData, ph = viewTime * 13 + i * 1.9;
    b.legL.rotation.x = Math.sin(ph) * 1.05; b.legR.rotation.x = Math.sin(ph + Math.PI) * 1.05;
    b.armL.rotation.x = Math.sin(ph + Math.PI) * 0.9 - 0.2; b.armR.rotation.x = Math.sin(ph) * 0.9 - 0.2;
    b.body.position.y = Math.abs(Math.sin(ph)) * 0.06;
    if (st === STATES.CRASHED && G.dieT > 0.5) b.body.rotation.x = 0.35; else b.body.rotation.x = 0.16;
  }
  if (st === STATES.RUNNING) {
    whistleT -= dt;
    if (whistleT < 0) { if (G.gap < 7) sfx.whistle(); whistleT = 3 + Math.random() * 3; }
  }

  /* dog cameo during Block Party */
  if (G.partyT > 0 && st === STATES.RUNNING) {
    dogCameo.visible = true;
    GAME.worldPos(G.dist - 1.2, HALF + 1.3, 0, camPos);
    dogCameo.position.set(camPos.x, 0.24, camPos.z);
    dogCameo.rotation.y = playerAng;
    const legs = dogCameo.userData.legs, ph = viewTime * 14;
    legs[0].rotation.x = Math.sin(ph) * 0.9; legs[1].rotation.x = Math.sin(ph) * 0.9;
    legs[2].rotation.x = Math.sin(ph + Math.PI) * 0.9; legs[3].rotation.x = Math.sin(ph + Math.PI) * 0.9;
  } else dogCameo.visible = false;

  /* camera — normal chase framing */
  const fx = -Math.sin(camAng), fz = -Math.cos(camAng);
  camPos.set(pPos.x - fx * 6.8, pPos.y + 3.3 + G.py * 0.35, pPos.z - fz * 6.8);
  lookAt.set(pPos.x + fx * 9, pPos.y + 1.4 + G.py * 0.5, pPos.z + fz * 9);

  /* opening beat: burst out of the bank. Camera sits ahead of Jay looking
     back at him + the bank, then swings to the chase cam as the run begins. */
  introT = Math.max(0, introT - dt);
  const introK = smooth(Math.min(1, Math.max(0, (introT - 0.5) / 1.4)));
  if (introK > 0.001) {
    // ahead of Jay and up high, looking back over him at the City Trust facade
    introPos.set(pPos.x + fx * 10, pPos.y + 5.0, pPos.z + fz * 10);
    introLook.set(pPos.x - fx * 13, pPos.y + 6.5, pPos.z - fz * 13);
    camPos.lerp(introPos, introK);
    lookAt.lerp(introLook, introK);
  }
  if (G.shake > 0 && !rm) { camPos.x += (Math.random() - 0.5) * G.shake * 0.7; camPos.y += (Math.random() - 0.5) * G.shake * 0.6; }
  W.camera.position.lerp(camPos, 1 - Math.exp(-dt * (introK > 0.05 ? 9 : 14)));
  W.camera.lookAt(lookAt);
  const fovKick = rm ? 0.25 : 0.7;
  W.camera.fov = 60 + Math.max(0, G.speed - TUNE.speed0) * fovKick; W.camera.updateProjectionMatrix();

  /* speed lines ramp in past ~70% top speed (view-only) */
  if (speedLinesEl) {
    const frac = st === STATES.RUNNING ? Math.max(0, (G.speed - 22) / (TUNE.speedMax - 22)) : 0;
    speedLinesEl.style.opacity = rm ? 0 : (frac * (G.pows.boost > 0 ? 1 : 0.7)).toFixed(2);
  }

  W.trackView(pPos.x, pPos.z);
  W.updateLights(dt);
  watchDistrict();

  /* music layers */
  musicLayers(Math.max(0, Math.min(1, (G.speed - 13) / 8)), G.partyT > 0 ? 1 : 0);

  /* countdown digits */
  if (st === STATES.COUNTDOWN) {
    const n = Math.ceil(G.countdownT / 0.433);
    UI.showCountdown(n > 0 ? n : 'GO');
  }
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function lerpNum(a, b, t) { return a + (b - a) * t; }

/* ---------------- main loop: fixed-step sim ---------------- */
const FIXED = 1 / TUNE.simHz;
let last = performance.now(), acc = 0;
let frameAvg = 16, adaptT = 0, dprStep = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;                      // tab stall clamp
  frameAvg = frameAvg * 0.95 + (dt * 1000) * 0.05;

  if (!document.hidden || window.__hrTest) {
    if (!window.__hrManual) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED && steps < 6) { GAME.stepFixed(FIXED); acc -= FIXED; steps++; }
      if (steps === 6) acc = 0;
    }
    updateView(dt);
  }
  updateDebug(dt);
  W.renderer.render(W.scene, W.camera);

  /* adaptive quality: sustained slow frames step DPR + decor down */
  adaptT += dt;
  if (adaptT > 3) {
    adaptT = 0;
    if (frameAvg > 24 && dprStep < 3) {
      dprStep++;
      const dprs = [Math.min(devicePixelRatio, 2), 1.5, 1.25, 1];
      W.renderer.setPixelRatio(dprs[dprStep]);
      decorDensity = [1, 0.8, 0.6, 0.5][dprStep];
    }
  }
}
requestAnimationFrame(frame);
GAME.toHome();
document.getElementById('loading').classList.add('hide');

/* ---------------- test harness ---------------- */
window.__hr = {
  start: seed => startRunFlow(seed),
  act: k => GAME.act(k),
  god: v => { if (GAME.G) GAME.G.god = v; },
  skipTut: () => GAME.skipTutorial(),
  tick(dt, n = 1) { window.__hrManual = true; for (let i = 0; i < n; i++) GAME.stepFixed(dt); },
  view(dt) { updateView(dt || 1 / 60); },
  state() {
    const G = GAME.G;
    if (!G) return { state: GAME.getState() };
    const s = G.segs[G.segIdx];
    return {
      state: GAME.getState(), seed: G.seed, dist: +G.dist.toFixed(1), total: GAME.totalScore(),
      mult: GAME.multiplier(), style: +G.style.level.toFixed(2), meter: +G.meter.toFixed(2),
      party: +G.partyT.toFixed(1), coins: G.run.coins, tokens: G.run.tokens,
      lane: G.lane, laneX: +G.laneX.toFixed(2), py: +G.py.toFixed(2), sliding: G.sliding > 0, gap: +G.gap.toFixed(2),
      speed: +G.speed.toFixed(1), segIdx: G.segIdx, segs: G.segs.length, obs: G.obs.length,
      coinsLeft: G.coins.length, exit: s?.exit, toJunction: s ? +(s.start + s.len - G.dist).toFixed(1) : 0,
      turned: G.turned, district: GAME.currentDistrict(), cause: G.crashCause,
      pows: { ...G.pows }, letters: [...G.lettersGot], tutorial: G.tutorial && !G.tutDone,
      run: { ...G.run }, score: { ...G.score }, ox: +(G.segs[0]?.ox ?? 0).toFixed(1),
    };
  },
  obsAhead(n = 5) {
    const G = GAME.G; if (!G) return [];
    return G.obs.filter(o => !o.done && o.active && o.d > G.dist).slice(0, n)
      .map(o => ({ kind: o.kind, d: +(o.d - G.dist).toFixed(1), lanes: o.lanes, clear: o.clear, move: o.move, curX: o.curX, safe: o.safe, stumble: o.stumble }));
  },
  G: () => GAME.G,
  save: () => loadSave(), commitSave, resetSave,
  gl: () => ({ scene: W.scene, camera: W.camera, renderer: W.renderer, THREE }),
};
