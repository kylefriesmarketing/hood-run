/* HOOD RUN — world.js
   Scene, lighting, district palettes, canvas textures, prop factories,
   segment geometry, origin rebase. View-only randomness uses Math.random. */

import * as THREE from '../lib/three.module.js';
import { LANE_W, ROAD_W, HALF, SIDE_W, WALL_X, DISTRICTS, ROOF_H } from './data.js';

export let scene, camera, renderer;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const irand = (a, b) => Math.floor(rand(a, b + 1));

/* ---------------- boot ---------------- */
let hemi, sun, skyGroup, groundPlane;
export function initWorld(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc7e8);
  scene.fog = new THREE.Fog(0xb8d8ec, 40, 175);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  hemi = new THREE.HemisphereLight(0xcfe3f5, 0x77875f, 1.05); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1cf, 0.95); sun.position.set(-24, 38, 14); scene.add(sun);

  skyGroup = new THREE.Group(); scene.add(skyGroup);
  { // sun disc + drifting clouds
    const disc = new THREE.Mesh(new THREE.CircleGeometry(10, 24), new THREE.MeshBasicMaterial({ color: 0xfff8e0, fog: false }));
    disc.position.set(70, 95, -150); disc.lookAt(0, 0, 0); skyGroup.add(disc);
    for (let i = 0; i < 7; i++) {
      const cl = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(rand(6, 11), 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.85 }));
        p.position.set(j * 8 - 8 + rand(-2, 2), rand(-1, 2), rand(-2, 2)); p.scale.y = 0.45; cl.add(p);
      }
      const a = rand(0, Math.PI * 2), r = rand(140, 220);
      cl.position.set(Math.cos(a) * r, rand(55, 90), Math.sin(a) * r);
      skyGroup.add(cl);
    }
  }
  groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshLambertMaterial({ color: 0x6b7a5f }));
  groundPlane.rotation.x = -Math.PI / 2; groundPlane.position.y = -0.06; scene.add(groundPlane);
  return { scene, camera, renderer };
}
export function trackView(px, pz) {
  groundPlane.position.set(px, -0.06, pz);
  skyGroup.position.set(px, 0, pz);
}

/* ---------------- district lighting transitions ---------------- */
const lightLerp = { t: 1, from: null, to: null };
export function applyDistrict(name, immediate) {
  const d = DISTRICTS[name]; if (!d || !d.sky) return;
  const to = {
    sky: new THREE.Color(d.sky), fog: new THREE.Color(d.fog[0]), fogNear: d.fog[1], fogFar: d.fog[2],
    hemiSky: new THREE.Color(d.hemi[0]), hemiGnd: new THREE.Color(d.hemi[1]), hemiI: d.hemi[2],
    sunC: new THREE.Color(d.sun[0]), sunI: d.sun[1], ground: new THREE.Color(d.side).multiplyScalar(0.55),
  };
  if (immediate) { setLights(to); lightLerp.t = 1; lightLerp.to = to; return; }
  lightLerp.from = snapLights(); lightLerp.to = to; lightLerp.t = 0;
}
function snapLights() {
  return { sky: scene.background.clone(), fog: scene.fog.color.clone(), fogNear: scene.fog.near, fogFar: scene.fog.far,
    hemiSky: hemi.color.clone(), hemiGnd: hemi.groundColor.clone(), hemiI: hemi.intensity,
    sunC: sun.color.clone(), sunI: sun.intensity, ground: groundPlane.material.color.clone() };
}
function setLights(v) {
  scene.background.copy(v.sky); scene.fog.color.copy(v.fog); scene.fog.near = v.fogNear; scene.fog.far = v.fogFar;
  hemi.color.copy(v.hemiSky); hemi.groundColor.copy(v.hemiGnd); hemi.intensity = v.hemiI;
  sun.color.copy(v.sunC); sun.intensity = v.sunI; groundPlane.material.color.copy(v.ground);
}
export function updateLights(dt) {
  if (lightLerp.t >= 1 || !lightLerp.to) return;
  lightLerp.t = Math.min(1, lightLerp.t + dt / 2.5);
  const a = lightLerp.from, b = lightLerp.to, t = lightLerp.t, out = {};
  for (const k of ['sky', 'fog', 'hemiSky', 'hemiGnd', 'sunC', 'ground']) out[k] = a[k].clone().lerp(b[k], t);
  for (const k of ['fogNear', 'fogFar', 'hemiI', 'sunI']) out[k] = a[k] + (b[k] - a[k]) * t;
  setLights(out);
}

/* ---------------- texture factory ---------------- */
export function tex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function noise(g, w, h, n, alpha, light) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${light ? 255 : 0},${light ? 255 : 0},${light ? 255 : 0},${alpha * Math.random()})`;
    g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
  }
}

const texCache = {};
function roadTex(color) {
  const key = 'road' + color;
  if (!texCache[key]) texCache[key] = tex(128, 256, (g, w, h) => {
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h);
    noise(g, w, h, 650, 0.13, false); noise(g, w, h, 220, 0.06, true);
    g.fillStyle = '#c8a23c'; g.fillRect(2, 0, 3, h); g.fillRect(w - 5, 0, 3, h);
    g.fillStyle = '#d8d8dc';
    const x1 = Math.round(w * (-1.1 / ROAD_W + 0.5)), x2 = Math.round(w * (1.1 / ROAD_W + 0.5));
    g.fillRect(x1 - 2, 20, 4, 92); g.fillRect(x2 - 2, 20, 4, 92);
  }, { repeat: true });
  return texCache[key];
}
function interTex(color) {
  const key = 'inter' + color;
  if (!texCache[key]) texCache[key] = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h);
    noise(g, w, h, 800, 0.13, false);
    g.fillStyle = '#e2e2e6';
    for (let i = 0; i < 8; i++) { const p = 18 + i * 28; g.fillRect(p, 4, 16, 34); g.fillRect(p, h - 38, 16, 34); g.fillRect(4, p, 34, 16); g.fillRect(w - 38, p, 34, 16); }
  });
  return texCache[key];
}
function sideTex(color, chalk) {
  const key = 'side' + color + (chalk ? 'c' : '');
  if (!texCache[key]) texCache[key] = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h);
    noise(g, w, h, 380, 0.1, false); noise(g, w, h, 140, 0.07, true);
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h / 2); g.strokeRect(0, h / 2, w, h / 2);
  }, { repeat: true });
  return texCache[key];
}

const buildingTexCache = {};
export function buildingTexes(dname) {
  if (buildingTexCache[dname]) return buildingTexCache[dname];
  const d = DISTRICTS[dname];
  const arr = [];
  for (let i = 0; i < 8; i++) arr.push(makeBuildingTex(d));
  buildingTexCache[dname] = arr;
  return arr;
}
function makeBuildingTex(d) {
  const brick = pick(d.brickset), store = Math.random() < (d.decor.glass ? 0.3 : 0.55);
  const glass = d.decor.glass && Math.random() < 0.55;
  return tex(256, 384, (g, w, h) => {
    if (glass) { // downtown glass tower face
      g.fillStyle = brick; g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 60; y += 34) for (let x = 10; x < w - 20; x += 30) {
        const lit = Math.random() < d.windowLit;
        g.fillStyle = lit ? '#ffe9b0' : (Math.random() < 0.5 ? '#a8c4de' : '#8fb0d0');
        g.fillRect(x, y, 24, 28);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y, 24, 6);
      }
      g.fillStyle = '#2c3038'; g.fillRect(0, h - 58, w, 58);
      g.fillStyle = '#cfe3f0'; g.fillRect(14, h - 50, w - 28, 40);
      g.fillStyle = 'rgba(0,0,0,.3)'; for (let x = 14; x < w - 28; x += 22) g.fillRect(x, h - 50, 4, 40);
      return;
    }
    g.fillStyle = brick; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
    for (let y = 0; y < h; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 * 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 10); g.stroke(); }
    noise(g, w, h, 420, 0.09, false);
    const cols = irand(3, 4), gY = h - 86;
    for (let f = 0; f < 4; f++) {
      const wy = 26 + f * ((gY - 40) / 4);
      for (let c = 0; c < cols; c++) {
        const wx = 24 + c * ((w - 48) / (cols - 1 || 1)) - 14;
        const lit = Math.random() < d.windowLit;
        g.fillStyle = lit ? '#ffe9b0' : '#cfe0ee';
        g.fillRect(wx, wy, 28, 40);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(wx, wy, 28, 10);
        g.strokeStyle = '#3a3026'; g.lineWidth = 3; g.strokeRect(wx, wy, 28, 40);
        if (Math.random() < 0.25) { g.fillStyle = '#3f7a3a'; g.fillRect(wx + 2, wy + 34, 24, 8); // window plants
          g.fillStyle = '#5aa050'; for (let p = 0; p < 4; p++) g.fillRect(wx + 3 + p * 6, wy + 28, 3, 7); }
        if (Math.random() < 0.15) { g.fillStyle = '#8b8f99'; g.fillRect(wx + 4, wy + 30, 20, 12); }
      }
    }
    if (store) {
      const col = pick(['#c0392b', '#1f8a4c', '#c07820', '#28648f', '#8e44ad', '#c94f7c']);
      g.fillStyle = '#241c18'; g.fillRect(8, gY, w - 16, h - gY - 6);
      g.fillStyle = '#ffedb8'; g.fillRect(20, gY + 26, w - 40, 44);
      g.fillStyle = 'rgba(0,0,0,.3)'; for (let x = 20; x < w - 40; x += 16) g.fillRect(x, gY + 26, 4, 44);
      g.fillStyle = col; g.fillRect(8, gY, w - 16, 22);
      g.fillStyle = '#fff'; g.font = 'bold 17px Arial'; g.textAlign = 'center'; g.fillText(pick(d.signs), w / 2, gY + 17);
      for (let x = 8; x < w - 8; x += 20) { g.fillStyle = (x / 20) % 2 < 1 ? col : '#f4ead8'; g.fillRect(x, gY - 8, 20, 10); }
    } else {
      g.fillStyle = '#2a2018'; g.fillRect(w / 2 - 22, h - 70, 44, 64);
      g.fillStyle = '#4a3a2c'; g.fillRect(w / 2 - 18, h - 66, 36, 44);
      g.fillStyle = '#8a8a90'; g.fillRect(12, h - 14, w - 24, 8);
    }
  });
}

const MURAL_THEMES = ['sun', 'bird', 'hands', 'wave'];
function muralTex() {
  const key = 'mural' + irand(0, 3);
  if (!texCache[key]) texCache[key] = tex(256, 128, (g, w, h) => {
    const bg = pick(['#2a6a8e', '#8e4a2a', '#4a7a3a', '#7a3a6e']);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const theme = pick(MURAL_THEMES);
    const cols = ['#ffd23c', '#ff8c42', '#3bd6c6', '#f0f0e8', '#e8604c'];
    if (theme === 'sun') { g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(w / 2, h, 46, Math.PI, 0); g.fill();
      g.strokeStyle = '#ffb03c'; g.lineWidth = 6;
      for (let i = 0; i < 7; i++) { const a = Math.PI + i * Math.PI / 6; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 54, h + Math.sin(a) * 54); g.lineTo(w / 2 + Math.cos(a) * 70, h + Math.sin(a) * 70); g.stroke(); } }
    else if (theme === 'bird') { g.fillStyle = pick(cols); g.beginPath(); g.ellipse(w / 2, h / 2, 40, 22, 0.2, 0, 7); g.fill();
      g.fillStyle = '#f0f0e8'; g.beginPath(); g.moveTo(w / 2 - 10, h / 2); g.quadraticCurveTo(w / 2 - 50, h / 2 - 40, w / 2 - 66, h / 2 - 8); g.quadraticCurveTo(w / 2 - 40, h / 2 + 4, w / 2 - 10, h / 2); g.fill(); }
    else if (theme === 'hands') { for (let i = 0; i < 5; i++) { g.fillStyle = cols[i % cols.length];
      g.save(); g.translate(30 + i * 46, h - 20); g.rotate(rand(-0.2, 0.2)); g.fillRect(-8, -50, 16, 50);
      for (let f2 = 0; f2 < 4; f2++) g.fillRect(-8 + f2 * 5, -66, 4, 18); g.restore(); } }
    else { g.strokeStyle = pick(cols); g.lineWidth = 10;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 30 + i * 26);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, 30 + i * 26 + Math.sin(x / 20 + i) * 12); g.stroke(); g.strokeStyle = pick(cols); } }
    // frame
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8);
  });
  return texCache[key];
}

function posterTex() {
  const key = 'poster' + irand(0, 2);
  if (!texCache[key]) texCache[key] = tex(96, 128, (g, w, h) => {
    g.fillStyle = pick(['#f4ead8', '#ffd23c', '#3bd6c6']); g.fillRect(0, 0, w, h);
    g.fillStyle = '#241c18'; g.font = 'bold 15px Arial'; g.textAlign = 'center';
    const lines = pick([['CROSSTOWN', 'DASH', 'SAT 9AM'], ['BLOCK', 'PARTY', 'FRI NITE'], ['OPEN MIC', 'CAFÉ SOL', 'TUES']]);
    lines.forEach((l, i) => g.fillText(l, w / 2, 34 + i * 24));
    g.strokeStyle = '#241c18'; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
  });
  return texCache[key];
}

function chalkTex() {
  if (!texCache.chalk) texCache.chalk = tex(96, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3;
    let y = h - 16;
    for (let i = 0; i < 7; i++) { const dbl = i === 3 || i === 6;
      if (dbl) { g.strokeRect(w / 2 - 34, y - 24, 32, 24); g.strokeRect(w / 2 + 2, y - 24, 32, 24); }
      else g.strokeRect(w / 2 - 17, y - 24, 34, 24);
      y -= 26; }
  });
  return texCache.chalk;
}

function arrowTexD(dir, color) { // 'L'|'R'|'T'
  const key = 'arr' + dir + color;
  if (!texCache[key]) texCache[key] = tex(256, 128, (g, w, h) => {
    g.fillStyle = '#241c2e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = color;
    const chev = (cx, flip) => { g.save(); g.translate(cx, h / 2); g.scale(flip ? -1 : 1, 1); g.beginPath();
      g.moveTo(18, 0); g.lineTo(-8, -30); g.lineTo(-8, -12); g.lineTo(-26, -12); g.lineTo(-26, 12); g.lineTo(-8, 12); g.lineTo(-8, 30); g.closePath(); g.fill(); g.restore(); };
    if (dir === 'L') { chev(w / 2 - 34, true); chev(w / 2 + 34, true); }
    else if (dir === 'R') { chev(w / 2 - 34, false); chev(w / 2 + 34, false); }
    else { chev(w / 2 - 44, true); chev(w / 2 + 44, false); }
  });
  return texCache[key];
}
function alleyArrowTex(kind) {
  const roof = kind === 'rooftop';
  const key = roof ? 'roofArr' : 'alleyArr';
  if (!texCache[key]) texCache[key] = tex(128, 128, (g, w, h) => {
    g.fillStyle = roof ? '#3a2a5e' : '#124a44'; g.fillRect(0, 0, w, h);
    const col = roof ? '#c9a4ff' : '#3bd6c6';
    g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = col; g.font = 'bold 24px Arial'; g.textAlign = 'center';
    g.fillText(roof ? 'ROOFS' : 'ALLEY', w / 2, 42);
    if (roof) {   // up-arrow: you climb
      g.beginPath(); g.moveTo(w / 2, h - 78); g.lineTo(w / 2 - 22, h - 46); g.lineTo(w / 2 - 8, h - 46);
      g.lineTo(w / 2 - 8, h - 22); g.lineTo(w / 2 + 8, h - 22); g.lineTo(w / 2 + 8, h - 46);
      g.lineTo(w / 2 + 22, h - 46); g.closePath(); g.fill();
    } else {
      g.beginPath(); g.moveTo(w / 2, h - 20); g.lineTo(w / 2 - 22, h - 52); g.lineTo(w / 2 - 8, h - 52);
      g.lineTo(w / 2 - 8, h - 72); g.lineTo(w / 2 + 8, h - 72); g.lineTo(w / 2 + 8, h - 52);
      g.lineTo(w / 2 + 22, h - 52); g.closePath(); g.fill();
    }
  });
  return texCache[key];
}
const chainTex = () => {
  if (!texCache.chain) texCache.chain = tex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(190,195,205,.9)'; g.lineWidth = 2;
    for (let i = -1; i < 5; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 64, 64); g.stroke();
      g.beginPath(); g.moveTo(i * 16 + 64, 0); g.lineTo(i * 16, 64); g.stroke(); }
  }, { repeat: true });
  return texCache.chain;
};
function stripeTex(c1, c2) {
  const key = 'str' + c1 + c2;
  if (!texCache[key]) texCache[key] = tex(64, 16, (g) => {
    for (let x = 0; x < 64; x += 16) { g.fillStyle = (x / 16) % 2 ? c1 : c2; g.fillRect(x, 0, 16, 16); }
  }, { repeat: true });
  return texCache[key];
}

/* ---------------- shared geometry & materials ---------------- */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
const matCache = {};
export function cmat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return matCache[key];
}
export function box(w, h, d, color, x = 0, y = 0, z = 0, m) {
  const b = new THREE.Mesh(BOX, m || cmat(color)); b.scale.set(w, h, d); b.position.set(x, y, z); return b;
}
const shadowGeo = new THREE.CircleGeometry(0.6, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
export function blobShadow(scale = 1) {
  const s = new THREE.Mesh(shadowGeo, shadowMat); s.rotation.x = -Math.PI / 2; s.position.y = 0.032; s.scale.setScalar(scale); return s;
}
export function disposeGroup(g) { g.traverse(o => { if (o.userData.ownGeo) o.geometry.dispose(); }); }

/* ---------------- prop factories ---------------- */
function mkTree() {
  const g = new THREE.Group();
  g.add(box(0.22, 1.6, 0.22, 0x6a4a2c, 0, 0.8, 0));
  const fol = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), cmat(pick([0x4a8a3a, 0x5a9a42, 0x3f7a34])));
  fol.position.y = 2.3; fol.scale.y = 0.9; fol.userData.sway = 0.05; g.add(fol);
  return g;
}
function mkStreetlight() {
  const g = new THREE.Group();
  g.add(box(0.12, 5.2, 0.12, 0x3a4048, 0, 2.6, 0));
  g.add(box(1.4, 0.1, 0.12, 0x3a4048, -0.65, 5.15, 0));
  g.add(box(0.5, 0.16, 0.3, 0, -1.25, 5.05, 0, new THREE.MeshBasicMaterial({ color: 0xf2ede0 })));
  return g;
}
function mkHydrant() {
  const g = new THREE.Group(); const m = cmat(0xd23c3c);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.62, 10), m); body.position.y = 0.31; g.add(body);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m); top.position.y = 0.64; g.add(top);
  g.add(box(0.5, 0.1, 0.14, 0xd23c3c, 0, 0.42, 0));
  return g;
}
function mkStoop() {
  const g = new THREE.Group(); const c = 0x9a9aa2;
  for (let i = 0; i < 3; i++) g.add(box(1.6, 0.22, 0.5, c, 0, 0.11 + i * 0.22, -i * 0.4));
  for (const s of [-0.85, 0.85]) g.add(box(0.14, 0.9, 1.6, 0x5a5a64, s, 0.45, -0.4));
  return g;
}
function mkHoop() {
  const g = new THREE.Group();
  g.add(box(0.12, 3.4, 0.12, 0x4a5058, 0, 1.7, 0));
  g.add(box(1.4, 1.0, 0.08, 0xe8e8ec, 0, 3.3, 0.12));
  g.add(box(0.5, 0.35, 0.05, 0xe8604c, 0, 3.12, 0.15));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 14), cmat(0xe07020));
  rim.rotation.x = Math.PI / 2; rim.position.set(0, 2.95, 0.42); g.add(rim);
  return g;
}
function mkBench() {
  const g = new THREE.Group();
  g.add(box(1.7, 0.08, 0.5, 0x8a5a2c, 0, 0.5, 0));
  g.add(box(1.7, 0.4, 0.08, 0x8a5a2c, 0, 0.85, -0.24));
  for (const s of [-0.7, 0.7]) g.add(box(0.08, 0.5, 0.45, 0x3a4048, s, 0.25, 0));
  return g;
}
function mkParkedCar() {
  const g = new THREE.Group();
  const col = pick([0x3bd6c6, 0xd23c50, 0x2a5f9e, 0xe0a020, 0x8899aa, 0x8e44ad]);
  g.add(box(1.8, 0.5, 4.2, col, 0, 0.52, 0));
  g.add(box(1.6, 0.45, 2.2, col, 0, 0.95, -0.1));
  g.add(box(1.62, 0.34, 2.0, 0x1a2634, 0, 0.98, -0.1, cmat(0x1a2634)));
  const wm = cmat(0x14141a);
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), wm);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w);
  }
  return g;
}
function mkStand() { // market produce stand
  const g = new THREE.Group();
  g.add(box(2.2, 0.7, 1.2, 0x8a5a2c, 0, 0.45, 0));
  const aw = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: stripeTex(pick(['#c0392b', '#1f8a4c', '#28648f']), '#f4ead8') }));
  aw.scale.set(2.4, 0.06, 1.5); aw.position.set(0, 1.8, 0.1); aw.rotation.x = -0.15; g.add(aw);
  for (const s of [-1, 1]) g.add(box(0.08, 1.7, 0.08, 0x6a4a2c, s * 1.05, 0.85, 0.5));
  const fruits = [0xe8604c, 0xe0a020, 0x5aa050, 0xffd23c];
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), cmat(pick(fruits)));
    f.position.set(rand(-0.9, 0.9), 0.88, rand(-0.4, 0.4)); g.add(f);
  }
  return g;
}
function mkCafeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), cmat(0xf4ead8)); top.position.y = 0.72; g.add(top);
  g.add(box(0.08, 0.72, 0.08, 0x3a4048, 0, 0.36, 0));
  for (const a of [0, 2.1, 4.2]) {
    const ch = box(0.36, 0.06, 0.36, 0x3a4048, Math.cos(a) * 0.8, 0.42, Math.sin(a) * 0.8); g.add(ch);
  }
  return g;
}
function mkScaffoldSide() { // decorative sidewalk scaffolding tower
  const g = new THREE.Group(); const m = cmat(0x8a6a3a);
  for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) g.add(box(0.12, 4.4, 0.12, 0x8a6a3a, x, 2.2, z, m));
  g.add(box(1.9, 0.1, 1.9, 0x7a5a3a, 0, 4.4, 0));
  g.add(box(1.9, 0.1, 1.9, 0x7a5a3a, 0, 2.2, 0));
  return g;
}
function mkSubwayEntrance() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.15, 3.2, 0x3a4048, 0, 1.5, 0));
  for (const s of [-1.1, 1.1]) g.add(box(0.12, 1.5, 3.2, 0x2a6a4e, s, 0.75, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({
    map: tex(128, 40, (g2, w, h) => { g2.fillStyle = '#1a5a3e'; g2.fillRect(0, 0, w, h);
      g2.fillStyle = '#fff'; g2.font = 'bold 22px Arial'; g2.textAlign = 'center'; g2.fillText('M  E  T  R  O', w / 2, 28); }) }));
  sign.position.set(0, 1.95, 0); g.add(sign);
  return g;
}
function mkFireEscape() {
  const g = new THREE.Group(); const m = cmat(0x2a2e36);
  for (let f = 0; f < 3; f++) {
    g.add(box(2.4, 0.08, 0.9, 0x2a2e36, 0, 2.2 + f * 2.0, 0, m));
    g.add(box(2.4, 0.5, 0.05, 0x2a2e36, 0, 2.5 + f * 2.0, 0.45, m));
    const stair = box(0.5, 0.06, 2.0, 0x2a2e36, 0.8, 3.1 + f * 2.0, 0, m); stair.rotation.x = 0.5; g.add(stair);
  }
  return g;
}
function mkNeighbor() { // simple sidewalk person (waving loop handled by view)
  const g = new THREE.Group();
  const skin = pick([0x8d5a3b, 0x6b4226, 0xc79a6b, 0xa06a44]);
  const shirt = pick([0x3bd6c6, 0xe8604c, 0xe0a020, 0x8e44ad, 0x2a5f9e]);
  g.add(box(0.6, 0.7, 0.36, shirt, 0, 1.0, 0));
  g.add(box(0.38, 0.38, 0.38, skin, 0, 1.6, 0));
  g.add(box(0.22, 0.6, 0.22, 0x2a2e36, -0.15, 0.35, 0));
  g.add(box(0.22, 0.6, 0.22, 0x2a2e36, 0.15, 0.35, 0));
  g.add(box(0.16, 0.55, 0.16, shirt, -0.4, 1.0, 0));
  const wave = new THREE.Group(); wave.position.set(0.4, 1.3, 0);
  wave.add(box(0.16, 0.55, 0.16, shirt, 0, 0.2, 0));
  wave.userData.waveArm = true; g.add(wave);
  g.userData.anim = wave;
  g.add(blobShadow(0.7));
  return g;
}
/* patrol officer — cartoon beat cop, strictly nonviolent chaser */
export function mkOfficer() {
  const g = new THREE.Group();
  const skin = pick([0x8d5a3b, 0x6b4226, 0xc79a6b, 0xa06a44]);
  const navy = 0x2a3a6e;
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  body.add(box(0.72, 0.78, 0.44, navy, 0, 1.08, 0));
  body.add(box(0.44, 0.44, 0.44, skin, 0, 1.74, 0));
  body.add(box(0.5, 0.15, 0.5, navy, 0, 1.99, 0));                       // cap
  body.add(box(0.5, 0.06, 0.26, navy, 0, 1.93, 0.32));                   // brim
  body.add(box(0.12, 0.12, 0.02, 0xffd23c, -0.18, 1.2, 0.23, new THREE.MeshBasicMaterial({ color: 0xffd23c }))); // badge
  body.add(box(0.74, 0.14, 0.46, 0x1a2440, 0, 0.74, 0));                 // belt
  const mkArm = s => { const a = new THREE.Group(); a.position.set(0.46 * s, 1.42, 0);
    a.add(box(0.2, 0.66, 0.2, navy, 0, -0.3, 0)); a.add(box(0.16, 0.16, 0.16, skin, 0, -0.68, 0)); body.add(a); return a; };
  const mkLeg = s => { const l = new THREE.Group(); l.position.set(0.18 * s, 0.78, 0);
    l.add(box(0.24, 0.7, 0.26, 0x1c2440, 0, -0.34, 0));
    l.add(box(0.26, 0.14, 0.4, 0x14141a, 0, -0.72, 0.06)); body.add(l); return l; };
  g.userData.armL = mkArm(-1); g.userData.armR = mkArm(1);
  g.userData.legL = mkLeg(-1); g.userData.legR = mkLeg(1);
  g.add(blobShadow(1.0));
  return g;
}

/* City Trust Bank facade — the run's starting point */
export function mkBankFacade() {
  const g = new THREE.Group();
  const stone = 0xb8ad98;
  g.add(box(26, 14, 8, stone, 0, 7, 3));                                  // main mass
  for (let i = 0; i < 5; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 8.4, 10), cmat(0xd0c6b0));
    col.position.set(-8 + i * 4, 4.2, -1.6); g.add(col);
  }
  const ped = box(24, 2.6, 1.2, 0xd0c6b0, 0, 9.6, -1.4); ped.rotation.x = 0.0; g.add(ped);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), new THREE.MeshBasicMaterial({
    map: tex(384, 52, (g2, w, h) => {
      g2.fillStyle = '#4a4032'; g2.fillRect(0, 0, w, h);
      g2.fillStyle = '#ffd23c'; g2.font = 'bold 34px Georgia'; g2.textAlign = 'center';
      g2.fillText('CITY TRUST BANK', w / 2, 38);
    }) }));
  sign.position.set(0, 9.6, -2.05); sign.rotation.y = Math.PI; g.add(sign);   // face the street (the intro camera)
  for (let i = 0; i < 3; i++) g.add(box(22 - i * 1.6, 0.3, 1.2, 0x9a9082, 0, 0.15 + i * 0.3, -2.4 - i * 0.5));
  const lamp = box(0.4, 0.4, 0.4, 0, -9, 11.5, -1.6, new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  lamp.userData.alarmLamp = true; g.add(lamp);                            // silent-alarm beacon
  const doors = box(4.4, 5.2, 0.4, 0x3a3026, 0, 2.6, -1.8); g.add(doors);
  // scattered escaped bills on the steps
  for (let i = 0; i < 7; i++) {
    const bill = box(0.5, 0.02, 0.26, 0x7ac47a, rand(-4, 4), 0.1, rand(-3.4, -5.4));
    bill.rotation.y = rand(0, 3); g.add(bill);
  }
  return g;
}

export function mkDogCameo() {
  const g = new THREE.Group();
  const col = pick([0x8a6a44, 0x6b6b74, 0xa8825c]);
  g.add(box(0.8, 0.44, 0.4, col, 0, 0.5, 0));
  g.add(box(0.4, 0.36, 0.36, col, 0, 0.68, 0.45));
  g.add(box(0.26, 0.2, 0.22, 0x4a3826, 0, 0.58, 0.66));
  g.add(box(0.09, 0.15, 0.06, col, -0.12, 0.9, 0.42));
  g.add(box(0.09, 0.15, 0.06, col, 0.12, 0.9, 0.42));
  const tail = box(0.07, 0.07, 0.36, col, 0, 0.62, -0.52); tail.rotation.x = 0.7; tail.userData.tail = true; g.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.26, 0.28], [0.26, 0.28], [-0.26, -0.28], [0.26, -0.28]]) {
    const l = new THREE.Group(); l.position.set(x, 0.36, z); l.add(box(0.12, 0.42, 0.12, col)); l.children[0].position.y = -0.18; g.add(l); legs.push(l);
  }
  g.userData.legs = legs;
  g.add(blobShadow(0.8));
  return g;
}

/* ---------------- hazard meshes ---------------- */
export function mkHazardMesh(kind) {
  switch (kind) {
    case 'pothole': { const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), new THREE.MeshBasicMaterial({ color: 0x0c0c10 }));
      hole.rotation.x = -Math.PI / 2; hole.position.y = 0.03; g.add(hole);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 14), cmat(0x2a2a30));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; g.add(rim);
      return g; }
    case 'cones': { const g = new THREE.Group();
      for (const dx of [-0.35, 0.35]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 10), cmat(0xe07020));
        c.position.set(dx, 0.32, dx * 0.4); g.add(c);
        const band = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.16, 10), cmat(0xf0f0f0)); band.position.set(dx, 0.42, dx * 0.4); g.add(band); }
      return g; }
    case 'planter': { const g = new THREE.Group();
      g.add(box(1.4, 0.55, 0.7, 0x8a5a3c, 0, 0.28, 0));
      for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), cmat(pick([0xe8604c, 0xffd23c, 0xd23c8e])));
        f.position.set(-0.5 + i * 0.33, 0.66, rand(-0.15, 0.15)); g.add(f); }
      g.add(box(1.3, 0.18, 0.6, 0x4a8a3a, 0, 0.6, 0));
      return g; }
    case 'boxes': { const g = new THREE.Group();
      g.add(box(0.8, 0.6, 0.7, 0xb8894c, -0.25, 0.3, 0));
      g.add(box(0.6, 0.5, 0.6, 0xa87a40, 0.4, 0.25, 0.1));
      g.add(box(0.55, 0.45, 0.5, 0xc89a5c, 0.05, 0.82, -0.05));
      return g; }
    case 'grate': { const g = new THREE.Group();
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshBasicMaterial({
        map: tex(64, 80, (g2, w, h) => { g2.fillStyle = '#08080c'; g2.fillRect(0, 0, w, h);
          g2.strokeStyle = '#3a3a44'; g2.lineWidth = 4; for (let x = 6; x < w; x += 12) { g2.beginPath(); g2.moveTo(x, 4); g2.lineTo(x, h - 4); g2.stroke(); } g2.strokeRect(2, 2, w - 4, h - 4); }) }));
      gr.rotation.x = -Math.PI / 2; gr.position.y = 0.035; g.add(gr);
      const lid = box(1.4, 0.06, 0.3, 0x5a5a64, 0, 0.06, -1.0); lid.rotation.z = 0.15; g.add(lid);
      return g; }
    case 'bikerack': { const g = new THREE.Group(); const m = cmat(0x4a5058);
      for (const z of [-0.25, 0.25]) { const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 12, Math.PI), m);
        arc.position.set(0, 0.45, z); g.add(arc); }
      const bike = box(1.1, 0.5, 0.1, 0xd23c50, 0.1, 0.5, 0); bike.rotation.z = 0.08; g.add(bike);
      for (const x of [-0.4, 0.5]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 6, 12), cmat(0x14141a)); wh.position.set(x, 0.3, 0); g.add(wh); }
      return g; }
    case 'barrier': { const g = new THREE.Group();
      for (const s of [-0.8, 0.8]) g.add(box(0.12, 0.95, 0.34, 0x8a6a3a, s, 0.48, 0));
      const bar = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: stripeTex('#e07020', '#f0f0f0') }));
      bar.scale.set(1.9, 0.3, 0.1); bar.position.y = 0.8; g.add(bar);
      const bar2 = bar.clone(); bar2.position.y = 0.4; g.add(bar2);
      return g; }
    case 'hydrant': return mkHydrant();
    case 'cart': { const g = new THREE.Group();
      g.add(box(3.0, 1.0, 1.3, 0xd8d8de, 0, 0.75, 0));
      g.add(box(3.0, 0.2, 1.3, 0x28648f, 0, 1.35, 0));
      g.add(box(0.1, 1.0, 0.1, 0x3a4048, -1.6, 0.6, 0));
      for (const s of [-1.1, 1.1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), cmat(0x14141a));
        w.rotation.z = Math.PI / 2; w.position.set(s, 0.22, 0.5); g.add(w); }
      for (let i = 0; i < 4; i++) g.add(box(0.5, 0.4, 0.5, 0xb8894c, -1.0 + i * 0.7, 1.6, 0));
      return g; }
    case 'table': { const g = mkCafeTable(); const um = box(0.06, 1.4, 0.06, 0x8a6a3a, 0, 1.4, 0); g.add(um);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.5, 8), new THREE.MeshLambertMaterial({ map: stripeTex('#c0392b', '#f4ead8') }));
      umb.position.y = 2.2; g.add(umb); return g; }
    case 'stand': return mkStand();
    case 'parkedcar': return mkParkedCar();
    case 'dumpster': { const g = new THREE.Group();
      g.add(box(3.2, 1.15, 1.5, 0x2f6e46, 0, 0.68, 0));
      const lid = box(3.2, 0.1, 1.5, 0x27593a, 0, 1.3, 0); lid.rotation.x = -0.12; g.add(lid);
      g.add(box(3.3, 0.16, 1.55, 0x244d34, 0, 0.2, 0));
      return g; }
    case 'scaffold': { const g = new THREE.Group();
      for (const x of [-HALF + 0.5, HALF - 0.5]) { g.add(box(0.14, 1.5, 0.14, 0x9a6a2f, x, 0.75, -0.5)); g.add(box(0.14, 1.5, 0.14, 0x9a6a2f, x, 0.75, 0.5)); }
      g.add(box(ROAD_W - 0.6, 0.12, 1.6, 0x7a5a3a, 0, 1.42, 0));
      const b = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: stripeTex('#e07020', '#f0f0f0') }));
      b.scale.set(ROAD_W - 0.6, 0.3, 0.06); b.position.set(0, 1.2, 0.8); g.add(b);
      return g; }
    case 'awning': { const g = new THREE.Group();
      const aw = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: stripeTex('#c0392b', '#f4ead8') }));
      aw.scale.set(4.2, 0.1, 1.2); aw.position.y = 1.32; aw.rotation.z = 0.06; g.add(aw);
      for (const s of [-1.9, 1.9]) g.add(box(0.1, 1.32, 0.1, 0x8a6a3a, s, 0.66, 0.4));
      return g; }
    case 'clothesline': { const g = new THREE.Group();
      g.add(box(ROAD_W - 0.4, 0.04, 0.04, 0xd8d8de, 0, 1.42, 0));
      const cols = [0xe8604c, 0x3bd6c6, 0xffd23c, 0xf0f0f0, 0x8e44ad];
      for (let i = 0; i < 5; i++) { const sh = box(0.55, 0.7, 0.04, pick(cols), -2.6 + i * 1.3, 1.05, 0); sh.userData.sway = 0.12; g.add(sh); }
      return g; }
    case 'gatebar': { const g = new THREE.Group();
      for (const s of [-HALF + 0.4, HALF - 0.4]) g.add(box(0.16, 1.5, 0.16, 0x4a5058, s, 0.75, 0));
      const bar = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: stripeTex('#e0c020', '#2a2e36') }));
      bar.scale.set(ROAD_W - 0.6, 0.22, 0.14); bar.position.y = 1.36; g.add(bar);
      return g; }
    case 'fence': { const g = new THREE.Group(); const m = cmat(0x8a8f99);
      for (const x of [-HALF + 0.4, 0, HALF - 0.4]) g.add(box(0.08, 0.95, 0.08, 0x8a8f99, x, 0.48, 0, m));
      g.add(box(ROAD_W - 0.6, 0.06, 0.06, 0x8a8f99, 0, 0.94, 0, m));
      const link = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W - 0.7, 0.9),
        new THREE.MeshBasicMaterial({ map: chainTex(), transparent: true, side: THREE.DoubleSide }));
      link.material.map.repeat.set(6, 1); link.position.y = 0.47; g.add(link);
      return g; }
    case 'puddle': { const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14), new THREE.MeshBasicMaterial({ color: 0x7fb0d8, transparent: true, opacity: 0.75 }));
      p.rotation.x = -Math.PI / 2; p.position.y = 0.028; p.scale.x = 1.3; g.add(p);
      return g; }
    case 'rollbin': { const g = new THREE.Group();
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.0, 12), cmat(0x28648f));
      bin.rotation.z = Math.PI / 2; bin.position.y = 0.42; g.add(bin);
      g.add(box(0.5, 0.06, 0.9, 0x1a4a70, 0, 0.42, 0));
      return g; }
    case 'bball': { const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), cmat(0xe07020));
      b.position.y = 0.32; g.add(b);
      const line = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 6, 16), cmat(0x1a1a20)); line.position.y = 0.32; g.add(line);
      return g; }
    case 'acunit': { const g = new THREE.Group();
      g.add(box(1.5, 0.8, 1.3, 0xb0b4ba, 0, 0.42, 0));
      g.add(box(1.55, 0.12, 1.35, 0x8a8f96, 0, 0.86, 0));
      const fan = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 14), cmat(0x5a5f66));
      fan.rotation.x = Math.PI / 2; fan.position.y = 0.9; g.add(fan);
      for (const s of [-1, 1]) g.add(box(0.1, 0.3, 1.2, 0x7a7f86, s * 0.72, 0.2, 0));
      return g; }
    case 'skylight': { const g = new THREE.Group();
      g.add(box(1.7, 0.22, 1.9, 0x6a6560, 0, 0.11, 0));                    // curb
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.6),
        new THREE.MeshLambertMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.75 }));
      glass.position.y = 0.34; g.add(glass);
      g.add(box(0.08, 0.34, 1.6, 0x4a5058, 0, 0.36, 0));
      return g; }
    case 'roofgap': { const g = new THREE.Group();
      // a void between roofs — dark drop with lit windows in the shaft walls
      const void_ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 3, 2.0), new THREE.MeshBasicMaterial({ color: 0x14161c }));
      void_.rotation.x = -Math.PI / 2; void_.position.y = -0.02; void_.userData.ownGeo = true; g.add(void_);
      for (const s of [-1, 1]) g.add(box(ROAD_W + 3, 0.24, 0.22, 0xa39a8e, 0, 0.12, s * 1.0));  // lip edges
      for (let i = 0; i < 5; i++) g.add(box(0.4, 0.5, 0.04, 0xffe9b0, -3 + i * 1.5, -1.6, 0.9,
        new THREE.MeshBasicMaterial({ color: 0xffe9b0 })));
      return g; }
    case 'ducts': { const g = new THREE.Group();
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, ROAD_W + 2, 12), cmat(0xb0b4ba));
      duct.rotation.z = Math.PI / 2; duct.position.y = 1.55; g.add(duct);
      for (const s of [-1, 1]) g.add(box(0.24, 1.55, 0.24, 0x8a8f96, s * (HALF - 0.4), 0.78, 0));
      for (let i = -2; i <= 2; i++) g.add(box(0.1, 0.95, 0.95, 0x9aa0a8, i * 1.6, 1.55, 0));
      return g; }
    case 'chimney': { const g = new THREE.Group();
      g.add(box(1.5, 1.9, 1.5, 0x8a4a34, 0, 0.95, 0));
      g.add(box(1.75, 0.22, 1.75, 0x6a3a28, 0, 1.98, 0));
      g.add(box(0.5, 0.3, 0.5, 0x2a2a30, 0, 2.2, 0));
      return g; }
    case 'robot': { const g = new THREE.Group();
      g.add(box(0.7, 0.6, 0.9, 0xe8e8ec, 0, 0.55, 0));
      g.add(box(0.72, 0.14, 0.92, 0x3bd6c6, 0, 0.9, 0));
      g.add(box(0.16, 0.1, 0.04, 0x14141a, -0.15, 0.7, 0.46));
      g.add(box(0.16, 0.1, 0.04, 0x14141a, 0.15, 0.7, 0.46));
      const flag = box(0.04, 0.7, 0.04, 0x3a4048, 0.25, 1.2, -0.3); g.add(flag);
      g.add(box(0.24, 0.16, 0.02, 0xe8604c, 0.25, 1.5, -0.3));
      for (const [x, z] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8), cmat(0x14141a));
        w.rotation.z = Math.PI / 2; w.position.set(x, 0.14, z); g.add(w);
      }
      return g; }
  }
  return box(1, 1, 1, 0xff00ff);
}

/* ---------------- pickups ---------------- */
export function mkCoin() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14), cmat(0xe8b83c));
  c.rotation.x = Math.PI / 2; g.add(c);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), cmat(0xffd86a));
  inner.rotation.x = Math.PI / 2; g.add(inner);
  g.add(box(0.08, 0.3, 0.11, 0x3bd6c6, 0, 0, 0));
  return g;
}
export function mkToken() {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), cmat(0x3bd6c6, { emissive: 0x1a6a62 }));
  g.add(t);
  return g;
}
export function mkLetter(ch) {
  const g = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({
    map: tex(64, 64, (g2, w, h) => {
      g2.fillStyle = '#ff4f9a'; g2.beginPath(); g2.arc(w / 2, h / 2, 30, 0, 7); g2.fill();
      g2.fillStyle = '#fff'; g2.font = 'bold 40px Arial'; g2.textAlign = 'center'; g2.fillText(ch, w / 2, h / 2 + 14);
    }), transparent: true, side: THREE.DoubleSide }));
  g.add(plane);
  return g;
}
export function mkPowerup(kind) {
  const g = new THREE.Group();
  if (kind === 'boost') { g.add(box(0.62, 0.2, 0.3, 0xffd23c, 0, -0.05, 0)); g.add(box(0.34, 0.24, 0.28, 0xf0f0f0, -0.12, 0.1, 0));
    g.add(box(0.64, 0.08, 0.32, 0xe07020, 0, -0.17, 0)); }
  else if (kind === 'magnet') { const m = cmat(0xd23c50);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 8, 14, Math.PI), m); arc.rotation.z = Math.PI; g.add(arc);
    g.add(box(0.12, 0.24, 0.12, 0xf0f0f0, -0.32, 0.24, 0)); g.add(box(0.12, 0.24, 0.12, 0xf0f0f0, 0.32, 0.24, 0)); }
  else if (kind === 'doublestyle') { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), cmat(0xff4f9a, { emissive: 0x8a1a4e })); g.add(s);
    const s2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), cmat(0xffd23c, { emissive: 0x8a6a1a })); s2.position.set(0.3, 0.3, 0); g.add(s2); }
  else if (kind === 'shield') { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshLambertMaterial({ color: 0x7bff5e, transparent: true, opacity: 0.5 })); g.add(sh);
    g.add(box(0.3, 0.4, 0.1, 0x2f8a52, 0, 0, 0)); }
  return g;
}

/* ---------------- segment construction ---------------- */
export function buildSegment(seg, opts) {
  // opts: { district, first, alley, split, contrast, decorDensity }
  const dname = seg.alley ? seg.baseDistrict : seg.district;
  const d = DISTRICTS[dname] || DISTRICTS.block;
  const isRoof = opts.roof;
  const g = new THREE.Group();
  g.position.set(seg.ox, isRoof ? ROOF_H : 0, seg.oz);
  g.rotation.y = seg.ang;
  const L = seg.len;
  const dd = opts.decorDensity ?? 1;

  if (!isRoof) {
    // road
    const roadGeo = new THREE.PlaneGeometry(ROAD_W, L - 8);
    const rt = roadTex(d.road).clone(); rt.needsUpdate = true; rt.repeat.set(1, (L - 8) / 8);
    const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ map: rt }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -L / 2); road.userData.ownGeo = true;
    g.add(road);

    // bus lane paint (downtown)
    if (d.decor?.buslane && !seg.alley) {
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.3, L - 12), new THREE.MeshBasicMaterial({ color: 0x8a3030, transparent: true, opacity: 0.35 }));
      bl.rotation.x = -Math.PI / 2; bl.position.set(LANE_W, 0.015, -L / 2); bl.userData.ownGeo = true; g.add(bl);
    }

    // intersection patch at exit
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_W), new THREE.MeshLambertMaterial({ map: interTex(d.road) }));
    patch.rotation.x = -Math.PI / 2; patch.position.set(0, 0.012, -L); patch.userData.ownGeo = true;
    g.add(patch);
    if (opts.first) {
      const p0 = patch.clone(); p0.position.set(0, 0.012, 0); g.add(p0);
      const bank = mkBankFacade(); bank.position.set(0, 0, 13); g.add(bank);
    }
  }

  if (isRoof) buildRooftopDressing(g, seg, d, opts);
  else if (seg.alley) buildAlleyDressing(g, seg, d, opts);
  else buildStreetDressing(g, seg, d, opts, dd);

  // junction dressing at exit
  const accent = d.accent || '#ffd23c';
  if (seg.exit !== 'S') {
    if (isRoof) {   // a parapet you turn along, not a brick wall
      g.add(box(30, 1.3, 1.0, 0x8a8076, 0, 0.65, -L - 3));
      g.add(box(30, 0.18, 1.3, 0xa39a8e, 0, 1.35, -L - 3));
    } else {
      g.add(box(30, 15, 10, 0x8a7050, 0, 7.5, -L - 4 - 5));
    }
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map: arrowTexD(seg.exit, accent) }));
    arrow.position.set(0, 2.6, -L - 3.9); g.add(arrow);
    if (!isRoof) {
      const blockSide = seg.exit === 'L' ? 1 : -1;
      g.add(box(12, 12, 12, 0x7a6448, blockSide * (HALF + SIDE_W + 6), 6, -L));
    }
  } else if (isRoof) {
    // straight roof exit: nothing to draw, the deck just runs on
  } else {
    for (const s of [-1, 1]) {
      const stub = new THREE.Mesh(new THREE.PlaneGeometry(12, ROAD_W), new THREE.MeshLambertMaterial({ color: d.road }));
      stub.rotation.x = -Math.PI / 2; stub.position.set(s * 10, 0.008, -L); stub.userData.ownGeo = true; g.add(stub);
      g.add(box(12, 13, 12, 0x7a6448, s * 13, 6.5, -L - 11));
    }
  }
  // alley gate telegraph on the segment BEFORE a split
  if (seg.splitNext) {
    const side = seg.splitNext; // -1 or 1
    const roof = seg.splitKindNext === 'rooftop';
    const post = roof ? 0x6a4a9a : 0x1f8a7a, beam = roof ? 0xc9a4ff : 0x3bd6c6;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: alleyArrowTex(seg.splitKindNext) }));
    sign.position.set(side * (HALF - 1.0), 2.2, -L + 5.2); g.add(sign);
    const arch = new THREE.Group();
    arch.add(box(0.3, 3.4, 0.3, post, side * (HALF - 2.2), 1.7, 0));
    arch.add(box(0.3, 3.4, 0.3, post, side * (HALF + 0.6), 1.7, 0));
    arch.add(box(3.2, 0.3, 0.3, beam, side * (HALF - 0.8), 3.4, 0));
    arch.position.z = -L + 2; g.add(arch);
    if (roof) {   // a fire escape you vault up
      const fe = mkFireEscape(); fe.position.set(side * (HALF + 1.6), 0.2, -L + 3); fe.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(fe);
      for (let i = 0; i < 5; i++) g.add(box(1.6, 0.12, 0.4, 0x4a5058, side * (HALF - 0.6), 0.6 + i * 0.8, -L + 5 - i * 0.9));
    }
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.6, 10), new THREE.MeshBasicMaterial({ color: beam, transparent: true, opacity: 0.3 }));
    paint.rotation.x = -Math.PI / 2; paint.position.set(side * LANE_W, 0.02, -L + 9); paint.userData.ownGeo = true; g.add(paint);
  }
  scene.add(g);
  seg.group = g;
  return g;
}

function buildStreetDressing(g, seg, d, opts, dd) {
  const L = seg.len;
  // The next segment's road turns into the INSIDE corner of this junction, so
  // keep that side clear near the exit or buildings/props poke into the street.
  const turnSide = seg.exit === 'R' ? 1 : seg.exit === 'L' ? -1 : 0;
  const CORNER_CLEAR = 15;
  const sideEnd = side => (side === turnSide) ? (L - CORNER_CLEAR) : (L - 6);
  // sidewalks
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: sideTex(d.side) }));
    const t2 = sideTex(d.side).clone(); t2.needsUpdate = true; t2.repeat.set(1, (L - 8) / 3); sw.material.map = t2;
    sw.scale.set(SIDE_W, 0.24, L - 8); sw.position.set(s * (HALF + SIDE_W / 2), 0.12, -L / 2);
    g.add(sw);
  }
  // chalk hopscotch (block)
  if (d.decor?.chalk && Math.random() < 0.4 * dd) {
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), new THREE.MeshBasicMaterial({ map: chalkTex(), transparent: true }));
    ch.rotation.x = -Math.PI / 2; ch.rotation.z = Math.random() < 0.5 ? 0.2 : -0.2;
    ch.position.set(pick([-1, 1]) * (HALF + 1.4), 0.25, -rand(L * 0.3, L * 0.7)); g.add(ch);
  }
  // buildings
  for (const side of [-1, 1]) {
    let dpos = 5;
    const endD = sideEnd(side);
    const texes = buildingTexes(seg.district);
    while (dpos < endD) {
      const w = rand(9, 15);
      const roll = Math.random();
      if (dpos + w > endD) break;                                    // no partial building over the corner
      if (roll < 0.1 * dd && dpos + 8 < endD && d.decor?.murals) {   // mural lot
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), new THREE.MeshLambertMaterial({ map: muralTex() }));
        wall.position.set(side * (WALL_X + 0.28), 1.7, -(dpos + 4));
        wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        wall.userData.ownGeo = true; g.add(wall);
        g.add(box(0.5, 3.5, 8.2, 0x9a8468, side * (WALL_X + 0.6), 1.75, -(dpos + 4)));
        if (d.decor?.court && Math.random() < 0.5) { const hoop = mkHoop(); hoop.position.set(side * (WALL_X + 2.4), 0.24, -(dpos + 6)); hoop.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(hoop); }
        dpos += 9;
      } else {
        const [h0, h1] = d.buildingH, h = rand(h0, h1), depth = 10;
        const roofM = cmat(0x8a7a68);
        const bld = new THREE.Mesh(BOX, [roofM, roofM, roofM, roofM, new THREE.MeshLambertMaterial({ map: pick(texes) }), roofM]);
        bld.position.set(side * (WALL_X + depth / 2), h / 2, -(dpos + w / 2));
        bld.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        bld.scale.set(depth, h, w);
        g.add(bld);
        if (Math.random() < 0.25 * dd && !d.decor?.glass) { const fe = mkFireEscape(); fe.position.set(side * (WALL_X - 0.5), 0, -(dpos + w / 2)); fe.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(fe); }
        if (d.decor?.stoops && Math.random() < 0.35 * dd) { const st = mkStoop(); st.position.set(side * (WALL_X - 0.9), 0.24, -(dpos + w / 2)); st.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(st); }
        if (d.decor?.posters && Math.random() < 0.5 * dd) {
          const po = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ map: posterTex() }));
          po.position.set(side * (WALL_X + 0.22), 1.6, -(dpos + rand(2, w - 2)));
          po.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; po.userData.ownGeo = true; g.add(po);
        }
        dpos += w + rand(0, 2);
      }
    }
    // streetlights + sidewalk props (clear the turn corner too)
    const propEnd = Math.min(L - 8, sideEnd(side));
    for (let d2 = 10 + (side > 0 ? 8 : 0); d2 < propEnd; d2 += 17) {
      const sl = mkStreetlight(); sl.position.set(side * (HALF + 0.9), 0.24, -d2); sl.rotation.y = side > 0 ? 0 : Math.PI; g.add(sl);
    }
    for (let d2 = rand(8, 20); d2 < propEnd; d2 += rand(13, 24) / dd) {
      const roll = Math.random();
      if (d.decor?.trees && roll < 0.3) { const t = mkTree(); t.position.set(side * (HALF + 1.7), 0.24, -d2); g.add(t); }
      else if (d.decor?.stands && roll < 0.35) { const st = mkStand(); st.position.set(side * (HALF + 1.8), 0.24, -d2); st.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(st); }
      else if (d.decor?.tables && roll < 0.5) { const tb = mkCafeTable(); tb.position.set(side * (HALF + 1.6), 0.24, -d2); g.add(tb); }
      else if (d.decor?.hydrants && roll < 0.45) { const hy = mkHydrant(); hy.position.set(side * (HALF + 0.9), 0.24, -d2); g.add(hy); }
      else if (d.decor?.scaffolds && roll < 0.5) { const sc = mkScaffoldSide(); sc.position.set(side * (HALF + 1.8), 0.24, -d2); g.add(sc); }
      else if (d.decor?.subway && roll < 0.58 && Math.random() < 0.3) { const su = mkSubwayEntrance(); su.position.set(side * (HALF + 1.8), 0.24, -d2); su.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(su); }
      else if (roll < 0.62) { const car = mkParkedCar(); car.position.set(side * (HALF + 1.9), 0.06, -d2); car.rotation.y = (side > 0 ? 0 : Math.PI) + rand(-0.04, 0.04); g.add(car); }
      else if (roll < 0.72) { const be = mkBench(); be.position.set(side * (HALF + 1.7), 0.24, -d2); be.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(be); }
      else if (roll < 0.82) { const n = mkNeighbor(); n.position.set(side * (HALF + rand(1.2, 2.2)), 0.24, -d2); n.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.userData.neighbors = g.userData.neighbors || []; g.userData.neighbors.push(n); g.add(n); }
    }
  }
  // string lights (market)
  if (d.stringLights && Math.random() < 0.6 * dd) {
    const zd = -rand(L * 0.3, L * 0.7);
    const cols = [0xffd23c, 0xff8c42, 0x3bd6c6, 0xff4f9a];
    const bulbs = [];
    for (let i = 0; i < 9; i++) {
      const x = -HALF - 0.5 + (i / 8) * (ROAD_W + 1);
      const sag = 5.4 - Math.sin((i / 8) * Math.PI) * 0.7;
      const b = box(0.1, 0.1, 0.1, 0, x, sag, zd, new THREE.MeshBasicMaterial({ color: pick(cols) }));
      g.add(b); bulbs.push(b);
    }
    g.userData.bulbs = bulbs;
  }
}

/* rooftop route: tar-and-gravel deck, parapets, water tower, skyline below */
function buildRooftopDressing(g, seg, d, opts) {
  const L = seg.len;
  // deck surface (replaces the road look)
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 3, L - 6), new THREE.MeshLambertMaterial({
    map: tex(128, 128, (g2, w, h) => {
      g2.fillStyle = '#3a3a40'; g2.fillRect(0, 0, w, h);
      noise(g2, w, h, 900, 0.2, false); noise(g2, w, h, 500, 0.12, true);
      g2.strokeStyle = 'rgba(20,20,26,.6)'; g2.lineWidth = 3;          // tar seams
      for (let y = 16; y < h; y += 32) { g2.beginPath(); g2.moveTo(0, y); g2.lineTo(w, y); g2.stroke(); }
    }, { repeat: true }) }));
  const dt = deck.material.map; dt.repeat.set(1, (L - 6) / 10);
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.02, -L / 2); deck.userData.ownGeo = true;
  g.add(deck);

  // parapet walls both sides — the safety edge you run between
  for (const s of [-1, 1]) {
    g.add(box(0.5, 1.1, L - 6, 0x8a8076, s * (HALF + 1.4), 0.55, -L / 2));
    g.add(box(0.7, 0.16, L - 6, 0xa39a8e, s * (HALF + 1.4), 1.16, -L / 2));   // coping stone
  }

  // the city BELOW — lower rooftops flanking, so the height reads instantly
  for (const s of [-1, 1]) {
    for (let dpos = 4; dpos < L - 4; dpos += rand(11, 18)) {
      const h = rand(2.5, 7.5), w = rand(8, 14);
      g.add(box(11, h, w, 0x6a6560, s * (HALF + 9), -ROOF_H + h / 2, -dpos));   // roof slab below
      if (Math.random() < 0.5) g.add(box(1.4, 0.9, 1.4, 0x55504b, s * (HALF + 7.5), -ROOF_H + h + 0.45, -dpos));
    }
  }
  // distant skyline silhouettes
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const h = rand(6, 20);
      g.add(box(rand(6, 12), h, rand(6, 12), 0x7d8593, s * rand(26, 46), -ROOF_H + h / 2, -rand(6, L - 6)));
    }
  }

  // rooftop furniture
  for (let dpos = rand(8, 16); dpos < L - 10; dpos += rand(14, 24)) {
    const s = Math.random() < 0.5 ? -1 : 1;
    const roll = Math.random();
    if (roll < 0.3) {                                     // water tower
      const t = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 12), cmat(0x8a6a44));
      barrel.position.y = 3.4; t.add(barrel);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 12), cmat(0x6a4a2c));
      cone.position.y = 5.0; t.add(cone);
      for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]])
        t.add(box(0.16, 2.2, 0.16, 0x5a4a3a, lx, 1.1, lz));
      t.position.set(s * (HALF + 3.4), 0, -dpos); g.add(t);
    } else if (roll < 0.6) {                              // roof hatch + pigeons
      g.add(box(1.4, 0.5, 1.4, 0x6a5a4a, s * (HALF + 2.6), 0.25, -dpos));
      for (let p = 0; p < 3; p++) {
        const pg = box(0.22, 0.2, 0.32, 0x9aa0aa, s * (HALF + 2.2) + rand(-0.6, 0.6), 0.62, -dpos + rand(-0.8, 0.8));
        g.add(pg);
      }
    } else {                                              // antenna cluster
      g.add(box(0.1, rand(2, 3.6), 0.1, 0x4a5058, s * (HALF + 2.8), 1.6, -dpos));
      g.add(box(1.2, 0.08, 0.08, 0x4a5058, s * (HALF + 2.8), 2.8, -dpos));
      g.add(box(0.08, 0.08, 1.0, 0x4a5058, s * (HALF + 2.8), 2.5, -dpos));
    }
  }
  // strung laundry lines overhead for silhouette
  for (let dpos = rand(12, 22); dpos < L - 10; dpos += rand(18, 30)) {
    g.add(box(ROAD_W + 2, 0.04, 0.04, 0xd8d8de, 0, 4.4, -dpos));
    const cols = [0xe8604c, 0x3bd6c6, 0xffd23c, 0xf0f0f0];
    for (let i = 0; i < 4; i++) { const sh = box(0.5, 0.62, 0.04, pick(cols), -2.6 + i * 1.7, 4.05, -dpos); sh.userData.sway = 0.12; g.add(sh); }
  }
}

function buildAlleyDressing(g, seg, d, opts) {
  const L = seg.len;
  // tight brick walls both sides, right at the road edge
  const texes = buildingTexes(seg.baseDistrict || 'block');
  for (const side of [-1, 1]) {
    let dpos = 2;
    while (dpos < L - 4) {
      const w = rand(8, 13), h = rand(7, 12);
      const roofM = cmat(0x6a5a48);
      const bld = new THREE.Mesh(BOX, [roofM, roofM, roofM, roofM, new THREE.MeshLambertMaterial({ map: pick(texes) }), roofM]);
      bld.position.set(side * (HALF + 5 - 1.2), h / 2, -(dpos + w / 2));
      bld.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      bld.scale.set(10, h, w);
      g.add(bld);
      if (Math.random() < 0.5) { const fe = mkFireEscape(); fe.position.set(side * (HALF - 0.4), 0, -(dpos + w / 2)); fe.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(fe); }
      dpos += w;
    }
    // dumpsters/crates against walls
    for (let d2 = rand(6, 14); d2 < L - 6; d2 += rand(10, 18)) {
      if (Math.random() < 0.5) { const dm = mkHazardMesh('dumpster'); dm.scale.setScalar(0.7); dm.position.set(side * (HALF - 0.9), 0.02, -d2); dm.rotation.y = Math.PI / 2; g.add(dm); }
      else g.add(box(0.7, 0.6, 0.7, 0xb8894c, side * (HALF - 0.7), 0.32, -d2));
    }
  }
  // overhead clotheslines decor (visual, above play height)
  for (let d2 = rand(8, 16); d2 < L - 8; d2 += rand(12, 20)) {
    g.add(box(ROAD_W, 0.04, 0.04, 0xd8d8de, 0, 4.6, -d2));
    const cols = [0xe8604c, 0x3bd6c6, 0xffd23c, 0xf0f0f0];
    for (let i = 0; i < 4; i++) { const sh = box(0.5, 0.65, 0.04, pick(cols), -2.4 + i * 1.6, 4.25, -d2); sh.userData.sway = 0.12; g.add(sh); }
  }
  // exit arch back to the street
  g.add(box(0.3, 3.4, 0.3, 0x1f8a7a, -(HALF - 0.4), 1.7, -L + 2));
  g.add(box(0.3, 3.4, 0.3, 0x1f8a7a, HALF - 0.4, 1.7, -L + 2));
  g.add(box(ROAD_W, 0.3, 0.3, 0x3bd6c6, 0, 3.4, -L + 2));
}

/* view-time animation of per-segment decor */
export function animateSegments(segs, time, party) {
  for (const seg of segs) {
    const g = seg.group; if (!g) continue;
    if (g.userData.neighbors) for (const n of g.userData.neighbors) {
      n.userData.anim.rotation.z = Math.sin(time * 5 + n.position.z) * 0.5 - 0.4;
    }
    if (g.userData.bulbs) for (let i = 0; i < g.userData.bulbs.length; i++) {
      const b = g.userData.bulbs[i];
      const s = party ? 1 + 0.5 * Math.max(0, Math.sin(time * 6 + i * 1.3)) : 1;
      b.scale.setScalar(s);
    }
    g.traverse?.call?.(g, () => {});                 // no-op guard
  }
}

/* origin rebase — shift the whole world by (dx,dz) to keep floats small */
export function rebaseWorld(segs, dx, dz) {
  for (const seg of segs) {
    seg.ox += dx; seg.oz += dz;
    if (seg.group) { seg.group.position.x += dx; seg.group.position.z += dz; }
  }
  camera.position.x += dx; camera.position.z += dz;
}
