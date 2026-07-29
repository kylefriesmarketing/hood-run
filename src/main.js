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
import { buildRunner, runnerMesh, poseRunner, updateTrail, makeRunner } from './runner.js';
import * as RIG from './rig.js';
import * as VFX from './vfx.js';
import { createPostFX } from './postfx.js';
import { initMissions } from './progression.js';
import { attachInput, onAction } from './input.js';
import { audioInit, audioResume, musicStart, musicStop, musicLayers, sfx, sirenStart, sirenStop, sirenPass, ambientSet, ambientStop, chopperStart, chopperStop } from './audio.js';
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
const postfx = createPostFX(W.renderer);
const laneC = l => l * LANE_W;

/* ---------------- mesh lifecycle callbacks ---------------- */
function segOpts(seg, first) {
  // segs: the live path, so decor placement can refuse to stand on ANY leg of
  // it — the generator loops the path around city blocks, and a junction's
  // backdrop can otherwise end up in the middle of a later street
  return { district: seg.district, first, decorDensity, contrast: UI.highContrast(), segs: GAME.G ? GAME.G.segs : null };
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
  ambientSet(d);                        // the city's own sound follows the look
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
  results: r => {
    const d = DISTRICTS[GAME.currentDistrict()];
    r.newsDistrict = d && d.label ? d.label : null;   // "…chase through Market Mile"
    UI.showResults(r); UI.refreshHome();
  },
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
  document.body.classList.toggle('intro', s === STATES.COUNTDOWN);
  if (s === STATES.RUNNING) {
    musicStart(); UI.hideScreens();
    ambientSet(lastDistrict);
    setTimeout(() => sirenStop(1.4), 900);      // wail into the getaway, then fade under music
  } else if (s === STATES.PAUSED) {
    musicStop(); ambientStop(); UI.showScreen('paused');
  } else if (s === STATES.CRASHED) {
    musicStop(); sirenStop(0.4); ambientStop();
  } else if (s === STATES.HOME) {
    musicStop(); sirenStop(0.4); ambientStop();
  } else if (s === STATES.COUNTDOWN) {
    UI.hideScreens(); introT = TUNE.introDur; baseYView = 0; doorBurst = false;
    // timers still fire when rAF is starved, so this guarantees the hand-off
    clearTimeout(introFailsafe);
    introFailsafe = setTimeout(() => {
      if (GAME.forceStartIfStuck()) console.warn('[hood-run] intro stalled — handed off via failsafe');
    }, (TUNE.introDur + 1.2) * 1000);
  }
  if (s !== STATES.COUNTDOWN) { clearTimeout(introFailsafe); UI.showCountdown(null); document.body.classList.remove('intro'); }
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

/* ---------------- closet preview ----------------
   A second tiny renderer so you can see what you're buying before you buy it.
   Built lazily the first time the closet opens; only drawn while it's visible. */
const preview = { renderer: null, scene: null, camera: null, rig: null, parts: null, phase: 0 };
function ensurePreview() {
  if (preview.renderer) return true;
  const canvas = document.getElementById('runner-preview');
  if (!canvas) return false;
  try {
    preview.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch { return false; }                     // no spare GL context — skip the preview
  preview.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // match the world's response, or Jay looks like a different character in here
  preview.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  preview.renderer.toneMappingExposure = 1.25;
  preview.scene = new THREE.Scene();
  preview.scene.environment = W.scene.environment;
  preview.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  preview.scene.add(new THREE.HemisphereLight(0xdCE6FF, 0x2a3050, 1.25));
  const key = new THREE.DirectionalLight(0xfff2d8, 1.0); key.position.set(-3, 5, 4); preview.scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 0.5); rim.position.set(4, 2, -3); preview.scene.add(rim);
  preview.rig = new THREE.Group(); preview.scene.add(preview.rig);
  return true;
}
export function refreshPreview() {
  if (!ensurePreview()) return;
  preview.scene.environment = W.scene.environment;    // follows the current district
  preview.rig.clear();
  const built = makeRunner(loadSave().unlocks.equipped);
  built.group.position.y = -1.15;               // centre the body in frame
  preview.rig.add(built.group);
  preview.parts = built.parts;
  preview.charRig = built.rig;                  // skinned path: closet drives the mixer
  if (built.rig) { RIG.play(built.rig, 'Walk'); }
}
function drawPreview(dt) {
  if (!preview.renderer || !document.getElementById('runner').classList.contains('show')) return;
  const canvas = preview.renderer.domElement;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * preview.renderer.getPixelRatio() || canvas.height !== h * preview.renderer.getPixelRatio()) {
    preview.renderer.setSize(w, h, false);
    preview.camera.aspect = w / h; preview.camera.updateProjectionMatrix();
  }
  preview.camera.position.set(0, 0.35, 4.6);
  preview.camera.lookAt(0, 0.05, 0);
  // slow turntable + a gentle jog so shoes, trail colours and hats all read
  preview.rig.rotation.y += dt * 0.55;
  if (preview.charRig) preview.charRig.mixer.update(dt);
  const p = preview.parts;
  if (p) {
    preview.phase += dt * 6.5;
    const sw = Math.sin(preview.phase), swA = Math.sin(preview.phase + Math.PI);
    p.body.rotation.x = 0.1; p.body.position.y = Math.abs(Math.sin(preview.phase)) * 0.05;
    p.legL.rotation.x = sw * 0.75; p.legR.rotation.x = swA * 0.75;
    p.armL.rotation.x = swA * 0.65 - 0.15; p.armR.rotation.x = sw * 0.65 - 0.15;
  }
  preview.renderer.render(preview.scene, preview.camera);
}

/* ---------------- flows ---------------- */
function startRunFlow(seed, daily) {
  audioInit(); audioResume();
  lastDistrict = 'block';
  W.applyDistrict('block', true);
  GAME.startRun(seed, daily);
  sfx.alarm();
  sirenStart();                 // wailing squad cars during the run-out
}
UI.initUI({
  startRun: (daily) => startRunFlow(undefined, daily),
  toHome: () => { GAME.toHome(); UI.refreshHome(); },
  resume: () => { GAME.resumeGame(); UI.hideScreens(); },
  pause: () => GAME.pauseGame(),
  skipTutorial: () => GAME.skipTutorial(),
  rebuildRunner: () => { buildRunner(loadSave().unlocks.equipped); refreshPreview(); },
  refreshPreview,
  replayTutorial: () => { const s = loadSave(); s.tutorialDone = false; commitSave(); UI.showToast('Tutorial will replay on your next run.'); },
});

/* ---------------- view ---------------- */
let camAng = 0, playerAng = 0, viewTime = 0, whistleT = 3, partyFxT = 0, introT = 0, baseYView = 0, doorBurst = false;
let introFailsafe = null;
const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3(), pPos = new THREE.Vector3(), oPos = new THREE.Vector3();
const smooth = t => t * t * (3 - 2 * t);
const dogCameo = W.mkDogCameo(); W.scene.add(dogCameo); dogCameo.visible = false;

/* ---------------- downtown drizzle ----------------
   The downtown roads already carry a wet sheen (DISTRICTS.wet 0.45); this is
   the rain that explains it. ~170 falling streaks kept in a box that wraps
   around the camera, fading in and out with the district. View-only. */
const RAIN_N = 170, RAIN_BOX = [30, 22, 34];
let rain = null, rainVel = null, rainOp = 0;
function ensureRain() {
  if (rain) return;
  const pos = new Float32Array(RAIN_N * 6);
  rainVel = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    rainVel[i] = 17 + Math.random() * 8;
    pos[i * 6] = (Math.random() - 0.5) * RAIN_BOX[0];
    pos[i * 6 + 1] = Math.random() * RAIN_BOX[1];
    pos[i * 6 + 2] = (Math.random() - 0.5) * RAIN_BOX[2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xb8c4d6, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false;
  W.scene.add(rain);
}
function updateRain(dt, st) {
  const want = (GAME.currentDistrict() === 'downtown' &&
    (st === STATES.RUNNING || st === STATES.CRASHED)) ? 0.38 : 0;
  rainOp += (want - rainOp) * (1 - Math.exp(-dt * 1.2));
  if (!rain && rainOp < 0.01) return;
  ensureRain();
  rain.material.opacity = rainOp;
  rain.visible = rainOp > 0.01;
  if (!rain.visible) return;
  const p = rain.geometry.attributes.position.array;
  const cx = W.camera.position.x, cy = Math.max(6, W.camera.position.y), cz = W.camera.position.z;
  const wrap = (v, c, size) => c + ((((v - c + size / 2) % size) + size) % size) - size / 2;
  for (let i = 0; i < RAIN_N; i++) {
    let x = p[i * 6], y = p[i * 6 + 1] - rainVel[i] * dt, z = p[i * 6 + 2];
    x = wrap(x + dt * 1.2, cx, RAIN_BOX[0]);                       // a touch of wind
    if (y < cy - RAIN_BOX[1] / 2) y += RAIN_BOX[1];
    y = Math.min(y, cy + RAIN_BOX[1] / 2);
    z = wrap(z, cz, RAIN_BOX[2]);
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.05; p[i * 6 + 4] = y - 0.75; p[i * 6 + 5] = z;
  }
  rain.geometry.attributes.position.needsUpdate = true;
}

/* ---------------- the NEWS 7 chopper ----------------
   Pure view spectacle: once the chase has run long enough to make the evening
   broadcast, a news helicopter flies in and ORBITS Jay with its nose camera on
   him. In the dark districts its searchlight hunts the road around his feet.
   It hovers to film the arrest if he goes down. The sim never knows. */
const CHOPPER_AT = 750;                 // metres of chase before the press shows up
const chopper = W.mkNewsChopper(); W.scene.add(chopper); chopper.visible = false;
// beam + ground pool live in the SCENE: world-space aiming is a two-liner,
// aiming a child cone in the banking chopper's local frame was not
chopper.remove(chopper.userData.beam);
W.scene.add(chopper.userData.beam); chopper.userData.beam.visible = false;
chopper.userData.spot.visible = false; W.scene.add(chopper.userData.spot);
const chop = { on: false, ang: 0, arriveT: 0 };
const chopPos = new THREE.Vector3(), chopAim = new THREE.Vector3(), beamDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function updateChopper(dt, st, pPos) {
  const G = GAME.G;
  const active = G && (st === STATES.RUNNING || st === STATES.CRASHED) && G.dist > CHOPPER_AT;
  if (active && !chop.on) {
    chop.on = true; chop.ang = Math.PI * 0.75; chop.arriveT = 2.2;
    chopper.visible = true;
    chopperStart();
    UI.showCallout('📺 NEWS CHOPPER OVERHEAD!', 'shortcut');
  } else if (!active && chop.on) {
    chop.on = false;
    chopper.visible = false;
    chopper.userData.spot.visible = false; chopper.userData.beam.visible = false;
    chopperStop(0.9);
  }
  if (!chop.on) return;

  // orbit: slow circle around Jay; while crashed it holds a steady hover
  chop.arriveT = Math.max(0, chop.arriveT - dt);
  if (st === STATES.RUNNING) chop.ang += dt * 0.22;
  const R = 17 + Math.sin(viewTime * 0.23) * 4;
  const alt = 19 + Math.sin(viewTime * 0.31) * 1.6 + chop.arriveT * 10;   // flies DOWN into position
  chopPos.set(
    pPos.x + Math.cos(chop.ang) * (R + chop.arriveT * 14),
    pPos.y + alt,
    pPos.z + Math.sin(chop.ang) * (R + chop.arriveT * 14),
  );
  chopper.position.lerp(chopPos, 1 - Math.exp(-dt * 2.5));
  // nose (and camera ball) on Jay; bank into the orbit
  chopAim.set(pPos.x, pPos.y + 1, pPos.z);
  chopper.lookAt(chopAim);
  chopper.rotateZ(Math.sin(viewTime * 0.9) * 0.05 + (st === STATES.RUNNING ? 0.16 : 0.02));
  const u = chopper.userData;
  u.mainRotor.rotation.y += dt * 38;
  u.tailRotor.rotation.x += dt * 55;
  const blink = Math.floor(viewTime * 2.4) % 2 === 0;
  u.strobeL.visible = blink; u.strobeR.visible = !blink;
  // searchlight only when the district is dark enough to need one
  const dk = DISTRICTS[GAME.currentDistrict()];
  const dark = dk && dk.sun && dk.sun[1] < 0.5;
  u.beam.visible = dark; u.spot.visible = dark;
  if (dark) {
    // the cameraman hunts: the pool wanders around Jay, catching him sometimes
    u.spot.position.set(
      pPos.x + Math.sin(viewTime * 0.7) * 2.4,
      pPos.y + 0.06,
      pPos.z + Math.cos(viewTime * 0.53) * 2.8 - 1);
    // world-space cone from the belly to the pool: midpoint, stretch, aim
    // (cone local +y is its narrow end, so +y points ground -> chopper)
    beamDir.copy(chopper.position).sub(u.spot.position);
    const len = beamDir.length();
    u.beam.position.copy(u.spot.position).addScaledVector(beamDir, 0.5);
    u.beam.scale.set(1, len, 1);
    u.beam.quaternion.setFromUnitVectors(_up, beamDir.normalize());
  }
}
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

/* Once the skinned character lands, the capsule officers are replaced by
   rigged ones — navy uniform, duty cap, real run cycle. The array slots are
   swapped in place so the chase loop below never notices. */
function mkRiggedOfficer(i) {
  const r = RIG.createRigged({ skin: [0x9a6a4a, 0x7a4a2f, 0xb98a63][i % 3], top: 0x1a2440, pants: 0x161c2c, shoes: 0x22252c });
  const capG = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2a3a6e, roughness: 0.8 }));
  dome.scale.set(0.145, 0.085, 0.155); dome.position.y = 0.03; capG.add(dome);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.13),
    new THREE.MeshStandardMaterial({ color: 0x1c2947, roughness: 0.7 }));
  peak.position.set(0, 0.015, 0.15); capG.add(peak);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xffd23c, roughness: 0.3, metalness: 0.4 }));
  badge.position.set(0, 0.02, 0.145); capG.add(badge);
  RIG.attachToBone(r, 'Head', capG, new THREE.Vector3(0, 0.24, 0));
  const g = r.group;
  g.add(W.blobShadow(0.8));
  g.userData.rig = r;
  RIG.play(r, 'Run');
  r.actions.Run.time = i * 0.37;         // desync the strides or they march in lockstep
  return g;
}
RIG.loadRig().then(ok => {
  if (!ok) return;
  for (let i = 0; i < officers.length; i++) {
    const old = officers[i];
    W.scene.remove(old);
    const nu = mkRiggedOfficer(i);
    nu.visible = false;
    W.scene.add(nu);
    officers[i] = nu;
  }
});

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
  // Characters are modelled facing local +z (face, lean and arm bias all assume
  // it) but the track runs toward -z at ang 0, so every track-aligned body needs
  // the half turn. Without it they sprint down the street backwards.
  mesh.rotation.y = playerAng + Math.PI;

  /* pose */
  if (st === STATES.CRASHED) poseRunner({ mode: 'crash', dt, time: viewTime, stumble: 0 });
  else if (st === STATES.RESULTS) poseRunner({ mode: 'celebrate', time: viewTime, stumble: 0 });
  else if (st === STATES.COUNTDOWN) {           // sprinting out of the bank
    // stride rate follows his real speed as he accelerates, so no windmilling
    const introV = TUNE.speed0 * (1 - Math.max(0, G.countdownT) / TUNE.introDur);
    G.runPhase += dt * (4 + introV * 0.9);
    poseRunner({ mode: 'run', phase: G.runPhase, time: viewTime, stumble: 0, lean: 0 });
    // burst of loose bills the moment he crosses the doorway plane (dist -8)
    if (!doorBurst && G.dist > -8) {
      doorBurst = true;
      VFX.cashBurst(pPos.x, pPos.y, pPos.z);
      if (!rm) G.shake = Math.max(G.shake, 0.35);
    }
  }
  else if (st === STATES.HOME) poseRunner({ mode: 'idle', time: viewTime, stumble: 0 });
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

  /* decor animation + party pulse (runner position feeds the pigeon scatter) */
  W.animateSegments(G.segs, viewTime, G.partyT > 0 && !rm, pPos);
  document.body.classList.toggle('party', G.partyT > 0);

  /* particles + continuous party confetti */
  VFX.updateVfx(dt);
  if (G.partyT > 0 && st === STATES.RUNNING && !rm) {
    partyFxT -= dt;
    if (partyFxT <= 0) { partyFxT = 0.28; VFX.partyConfetti(pPos.x, pPos.y, pPos.z); }
  }

  /* the patrol — visible whenever the gap is short enough to be seen */
  // Hidden during the opening: the camera is behind Jay, so officers behind him
  // would sit between camera and runner and fill the screen. They pour out after.
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
    om.rotation.y = playerAng + Math.PI;
    if (om.userData.rig) {
      const r = om.userData.rig;
      // the arrest: when Jay is down and they've closed in, the lead officer
      // throws the cuff-grab (Punch reads perfectly at chase distance)
      if (st === STATES.CRASHED && G.dieT > 0.5) RIG.play(r, i === 0 ? 'Punch' : 'Idle');
      else RIG.play(r, 'Run', { timeScale: 1.05 + i * 0.06 });
      r.mixer.update(dt);
    } else {
      const b = om.userData, ph = viewTime * 13 + i * 1.9;
      b.legL.rotation.x = Math.sin(ph) * 1.05; b.legR.rotation.x = Math.sin(ph + Math.PI) * 1.05;
      b.armL.rotation.x = Math.sin(ph + Math.PI) * 0.9 - 0.2; b.armR.rotation.x = Math.sin(ph) * 0.9 - 0.2;
      b.body.position.y = Math.abs(Math.sin(ph)) * 0.06;
      if (st === STATES.CRASHED && G.dieT > 0.5) b.body.rotation.x = 0.35; else b.body.rotation.x = 0.16;
    }
  }
  if (st === STATES.RUNNING) {
    whistleT -= dt;
    if (whistleT < 0) {
      // the closer the patrol, the more it's a siren pass vs a lone whistle
      if (G.gap < 4.5) sirenPass();
      else if (G.gap < 7) sfx.whistle();
      whistleT = 3 + Math.random() * 3;
    }
  }

  /* dog cameo during Block Party */
  if (G.partyT > 0 && st === STATES.RUNNING) {
    dogCameo.visible = true;
    GAME.worldPos(G.dist - 1.2, HALF + 1.3, 0, camPos);
    dogCameo.position.set(camPos.x, 0.24, camPos.z);
    dogCameo.rotation.y = playerAng + Math.PI;
    const legs = dogCameo.userData.legs, ph = viewTime * 14;
    legs[0].rotation.x = Math.sin(ph) * 0.9; legs[1].rotation.x = Math.sin(ph) * 0.9;
    legs[2].rotation.x = Math.sin(ph + Math.PI) * 0.9; legs[3].rotation.x = Math.sin(ph + Math.PI) * 0.9;
  } else dogCameo.visible = false;

  /* the press, once the chase is newsworthy */
  updateChopper(dt, st, pPos);

  /* the rain that explains downtown's wet roads */
  updateRain(dt, st);

  /* camera — normal chase framing. During the opening it starts tighter and
     lower (over-the-shoulder, inside the lobby) and dollies out to the chase
     offset, resolving to exactly 0 at the hand-off so it's position-continuous
     with the run — no snap. */
  const fx = -Math.sin(camAng), fz = -Math.cos(camAng);
  const ik = st === STATES.COUNTDOWN ? Math.max(0, Math.min(1, G.countdownT / TUNE.introDur)) : 0;
  // Pull BACK and up at the start so the doorway + lobby walls frame him, then
  // settle forward into the chase. (Pulling closer got the camera so near the
  // wide doorway that the walls fell outside the FOV and the framing vanished.)
  const back = 6.8 + 1.9 * ik;              // 8.7 deep-in-lobby → 6.8 chase
  const high = 3.3 + 0.9 * ik;              // 4.2 → 3.3 chase
  camPos.set(pPos.x - fx * back, pPos.y + high + G.py * 0.35, pPos.z - fz * back);
  lookAt.set(pPos.x + fx * 9, pPos.y + 1.4 + G.py * 0.5, pPos.z + fz * 9);

  /* the arrest deserves a camera: a slow orbit around Jay while the officers
     close in and the chopper films from overhead. Starts exactly at the chase
     position (a = camAng is "behind him"), so there is no cut — the camera
     just begins to circle. The position lerp below does the smoothing. */
  if (st === STATES.CRASHED) {
    // the crashed window is 1.15s (game.js dieT), so the whole move must live
    // inside it — an ease-out sweep that has done most of its arc by halfway
    const t = Math.min(1, G.dieT / 1.1);
    const e = 1 - (1 - t) * (1 - t);
    const a = camAng + e * 1.25;                    // ~70° around the scene
    const r = 6.4 - e * 1.7;                        // dollying gently in
    camPos.set(pPos.x + Math.sin(a) * r, pPos.y + 2.7 - e * 1.0, pPos.z + Math.cos(a) * r);
    lookAt.set(pPos.x, pPos.y + 0.9, pPos.z);
  }

  /* The opening uses the ORDINARY chase camera — behind Jay, facing the way he
     runs. A front-facing cinematic made him read as running backwards and
     needed a swing at the end that felt like a snap. */
  introT = Math.max(0, introT - dt);
  if (G.shake > 0 && !rm) { camPos.x += (Math.random() - 0.5) * G.shake * 0.7; camPos.y += (Math.random() - 0.5) * G.shake * 0.6; }
  // snap on the opening frame so we don't glide in from the last camera pose
  if (introT > TUNE.introDur - 0.06) W.camera.position.copy(camPos);
  else W.camera.position.lerp(camPos, 1 - Math.exp(-dt * 14));
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
    // counts across the whole run-out so it lands exactly as control passes over
    UI.showCountdown(Math.max(1, Math.ceil(G.countdownT / (TUNE.introDur / 3))));
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

  // The opening must keep advancing even in a hidden/throttled tab, or the
  // hand-off never happens and the player is stranded inside the bank.
  const visible = !document.hidden || window.__hrTest;
  if (visible || GAME.getState() === STATES.COUNTDOWN) {
    if (!window.__hrManual) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED && steps < 6) { GAME.stepFixed(FIXED); acc -= FIXED; steps++; }
      if (steps === 6) acc = 0;
    }
    if (visible) updateView(dt);
  }
  updateDebug(dt);
  {
    const G = GAME.G, rm = document.body.classList.contains('reduced-motion');
    const spd = G ? Math.max(0, (G.speed - 18) / (TUNE.speedMax - 18)) : 0;
    postfx.set(GAME.getState() === STATES.RUNNING ? spd : 0, G ? (G.partyT > 0 ? 1 : 0) : 0, rm);
    postfx.render(W.scene, W.camera);
  }
  drawPreview(dt);

  /* adaptive quality: sustained slow frames shed the expensive extras first —
     shadows, then the post pass, then DPR + decor (bible §15 order) */
  adaptT += dt;
  if (adaptT > 3) {
    adaptT = 0;
    if (frameAvg > 24 && postfx.hasBloom()) { postfx.setBloom(false); }
    else if (frameAvg > 24 && W.shadowsEnabled()) { W.setShadowsEnabled(false); }
    else if (frameAvg > 24 && postfx.isEnabled()) { postfx.setEnabled(false); }
    else if (frameAvg > 24 && dprStep < 3) {
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
  postfx: () => postfx,
  createPostFX,
};
