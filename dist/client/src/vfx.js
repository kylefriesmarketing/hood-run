/* HOOD RUN — vfx.js
   Pooled particle juice: coin sparkles, land dust, crash debris, near-miss
   whoosh, Block-Party confetti, shortcut streaks. Pure view — unseeded
   Math.random is fine (bible §14: visual-only particles may be unseeded).
   Honours reduced-motion by scaling counts to zero. */

import * as THREE from '../lib/three.module.js';
import { scene } from './world.js';

const POOL = 220;
let sparks = [], reduced = false, active = 0;

/* one shared additive sprite texture (soft dot) */
function dotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let confettiGeo = null;

export function initVfx() {
  const tex = dotTex();
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    m.scale.setScalar(0.3); m.visible = false;
    scene.add(m);
    sparks.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, spin: 0, size: 0.3, add: true });
  }
  // confetti uses flat quads (non-additive) — reuse the same sprites via a flag
  confettiGeo = true;
}
export function setReducedMotion(v) { reduced = v; }

function grab() {
  for (let i = 0; i < sparks.length; i++) {
    const idx = (active + i) % sparks.length;
    if (sparks[idx].life <= 0) { active = idx; return sparks[idx]; }
  }
  return sparks[(active++) % sparks.length];
}
function emit(x, y, z, opts) {
  const p = grab();
  p.life = p.max = opts.life;
  p.vx = opts.vx; p.vy = opts.vy; p.vz = opts.vz; p.grav = opts.grav || 0;
  p.size = opts.size; p.add = opts.add !== false;
  const m = p.m;
  m.position.set(x, y, z);
  m.material.color.setHex(opts.color);
  m.material.blending = p.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  m.material.opacity = 1;
  m.scale.setScalar(opts.size);
  m.visible = true;
}

/* ---- public burst API ---- */
export function coinPop(x, y, z) {
  if (reduced) return;
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2;
    emit(x, y, z, { life: 0.4 + Math.random() * 0.2, vx: Math.cos(a) * s, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * s * 0.4 - 2,
      grav: -8, size: 0.18 + Math.random() * 0.1, color: 0xffe27a });
  }
}
export function landDust(x, z) {
  if (reduced) return;
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    emit(x + Math.cos(a) * 0.3, 0.1, z + Math.sin(a) * 0.3, { life: 0.35, vx: Math.cos(a) * 1.4, vy: 0.4, vz: Math.sin(a) * 1.4,
      grav: -1, size: 0.32, color: 0xc8c2b4, add: false });
  }
}
export function nearMissWhoosh(x, y, z, side) {
  if (reduced) return;
  for (let i = 0; i < 5; i++) {
    emit(x + side * 0.8, y + 0.6 + i * 0.2, z, { life: 0.3, vx: side * 3, vy: 0.3, vz: 3 + Math.random() * 2,
      grav: 0, size: 0.22, color: 0xffffff });
  }
}
export function shortcutStreak(x, y, z) {
  if (reduced) return;
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
    emit(x, y + 0.5, z, { life: 0.5 + Math.random() * 0.3, vx: Math.cos(a) * s, vy: Math.random() * 3, vz: Math.sin(a) * s,
      grav: -4, size: 0.2, color: 0x3bd6c6 });
  }
}
export function crashBurst(x, y, z) {
  if (reduced) return;
  const cols = [0xffd23c, 0xe8604c, 0x3bd6c6, 0xffffff];
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
    emit(x, y + 0.8, z, { life: 0.6 + Math.random() * 0.5, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s - 2,
      grav: -9, size: 0.2 + Math.random() * 0.16, color: cols[i % cols.length], add: false });
  }
}
export function powBurst(x, y, z, color) {
  if (reduced) return;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, s = 2.5;
    emit(x, y + 0.6, z, { life: 0.5, vx: Math.cos(a) * s, vy: 1.5, vz: Math.sin(a) * s, grav: -3, size: 0.22, color });
  }
}
export function partyConfetti(x, y, z) {
  if (reduced) return;
  const cols = [0xffd23c, 0xe8604c, 0x3bd6c6, 0xff4f9a, 0x7bff5e];
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
    emit(x + (Math.random() - 0.5) * 6, y + 4 + Math.random() * 2, z + (Math.random() - 0.5) * 4,
      { life: 1.2 + Math.random(), vx: Math.cos(a) * s, vy: -0.5 - Math.random(), vz: Math.sin(a) * s,
        grav: -2, size: 0.16 + Math.random() * 0.12, color: cols[i % cols.length], add: false });
  }
}

export function updateVfx(dt) {
  for (const p of sparks) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vy += p.grav * dt;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    const t = p.life / p.max;
    p.m.material.opacity = p.add ? t : Math.min(1, t * 1.6);
    p.m.scale.setScalar(p.size * (p.add ? (0.4 + t * 0.6) : 1));
  }
}
