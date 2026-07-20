/* HOOD RUN — runner.js
   Jay the runner: mesh, cosmetics, animation poses, trail particles.
   Pure view — all gameplay state lives in game.js. */

import * as THREE from '../lib/three.module.js';
import { COSMETICS } from './data.js';
import { scene, box, blobShadow, cmat } from './world.js';

let mesh = null, parts = null, trailPool = [], trailKind = 'none', trailT = 0;

function cosmeticById(slot, id) {
  return COSMETICS[slot].find(c => c.id === id) || COSMETICS[slot][0];
}

export function buildRunner(equipped) {
  if (mesh) { scene.remove(mesh); }
  const outfit = cosmeticById('outfit', equipped.outfit).color;
  const shoes = cosmeticById('shoes', equipped.shoes).color;
  const hat = cosmeticById('hat', equipped.hat);
  const skin = cosmeticById('skin', equipped.skin).color;
  trailKind = cosmeticById('trail', equipped.trail).kind;

  mesh = new THREE.Group();
  const body = new THREE.Group(); mesh.add(body);
  parts = { body };
  body.add(box(0.7, 0.75, 0.42, outfit, 0, 1.08, 0));
  body.add(box(0.74, 0.18, 0.46, outfit, 0, 1.42, -0.02));
  body.add(box(0.42, 0.42, 0.42, skin, 0, 1.72, 0));
  // the City Trust money bag, slung cross-body (cartoon sack)
  const strap = box(0.1, 0.7, 0.46, 0x6a4a2c, 0.15, 1.15, 0); strap.rotation.z = 0.5; body.add(strap);
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8b878 }));
  sack.scale.set(1, 1.15, 0.8); sack.position.set(-0.34, 0.92, -0.26); body.add(sack);
  body.add(box(0.14, 0.1, 0.14, 0xa8885c, -0.34, 1.22, -0.26));          // tied neck
  const dollar = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: dollarTex(), transparent: true }));
  dollar.position.set(-0.34, 0.92, -0.02); body.add(dollar);
  if (hat.kind === 'cap') {
    body.add(box(0.46, 0.16, 0.46, hat.color, 0, 1.94, 0));
    body.add(box(0.46, 0.06, 0.24, hat.color, 0, 1.88, 0.3));
  } else if (hat.kind === 'beanie') {
    body.add(box(0.46, 0.2, 0.46, hat.color, 0, 1.93, 0));
    body.add(box(0.14, 0.14, 0.14, hat.color, 0, 2.06, 0));
  } else {
    body.add(box(0.44, 0.14, 0.44, 0x1c1410, 0, 1.95, 0)); // hair
  }
  body.add(box(0.5, 0.28, 0.2, outfit, 0, 0.78, 0));
  const mkArm = s => { const a = new THREE.Group(); a.position.set(0.44 * s, 1.4, 0);
    a.add(box(0.2, 0.66, 0.2, outfit, 0, -0.3, 0)); a.add(box(0.16, 0.16, 0.16, skin, 0, -0.68, 0)); body.add(a); return a; };
  const mkLeg = s => { const l = new THREE.Group(); l.position.set(0.18 * s, 0.78, 0);
    l.add(box(0.24, 0.7, 0.26, 0x2a3038, 0, -0.34, 0));
    l.add(box(0.26, 0.14, 0.4, shoes, 0, -0.72, 0.06)); body.add(l); return l; };
  parts.armL = mkArm(-1); parts.armR = mkArm(1);
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);
  mesh.add(blobShadow(1.05));
  scene.add(mesh);

  // trail pool
  for (const p of trailPool) scene.remove(p.m);
  trailPool = [];
  if (trailKind !== 'none') {
    for (let i = 0; i < 14; i++) {
      let m;
      if (trailKind === 'spark') {
        m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0 }));
      } else {
        m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({
          map: noteTex(), transparent: true, opacity: 0, side: THREE.DoubleSide }));
      }
      scene.add(m); trailPool.push({ m, life: 0 });
    }
  }
  return mesh;
}
let _dollarTex = null;
function dollarTex() {
  if (_dollarTex) return _dollarTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#3a5a2a'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.fillText('$', 16, 26);
  _dollarTex = new THREE.CanvasTexture(c); _dollarTex.colorSpace = THREE.SRGBColorSpace;
  return _dollarTex;
}
let _noteTex = null;
function noteTex() {
  if (_noteTex) return _noteTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ff4f9a'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('♪', 16, 26);
  _noteTex = new THREE.CanvasTexture(c); _noteTex.colorSpace = THREE.SRGBColorSpace;
  return _noteTex;
}

export function runnerMesh() { return mesh; }

/* pose: { mode:'run'|'jump'|'slide'|'crash'|'idle'|'celebrate', phase, py, stumble, lean, time } */
export function poseRunner(p) {
  if (!parts) return;
  const b = parts;
  if (p.mode === 'jump') {
    b.legL.rotation.x = -1.1; b.legR.rotation.x = -0.5;
    b.armL.rotation.x = -2.4; b.armR.rotation.x = -2.0;
    b.body.rotation.x = 0.1; b.body.position.y = 0;
  } else if (p.mode === 'slide') {
    b.body.rotation.x = -1.15; b.body.position.y = -0.55;
    b.legL.rotation.x = 0.3; b.legR.rotation.x = 0.15;
    b.armL.rotation.x = 0.4; b.armR.rotation.x = 0.5;
  } else if (p.mode === 'crash') {
    b.body.rotation.x = Math.min(1.45, (b.body.rotation.x || 0) + p.dt * 6);
    b.body.position.y = Math.max(-0.7, b.body.position.y - p.dt * 1.4);
  } else if (p.mode === 'idle') {
    b.body.rotation.x = 0; b.body.position.y = Math.sin(p.time * 2) * 0.03;
    b.legL.rotation.x = 0; b.legR.rotation.x = 0;
    b.armL.rotation.x = Math.sin(p.time * 2) * 0.08; b.armR.rotation.x = -Math.sin(p.time * 2) * 0.08;
  } else if (p.mode === 'celebrate') {
    b.body.rotation.x = 0; b.body.position.y = Math.abs(Math.sin(p.time * 6)) * 0.22;
    b.armL.rotation.x = -2.8; b.armR.rotation.x = -2.8;
    b.legL.rotation.x = 0; b.legR.rotation.x = 0;
  } else { // run
    const sw = Math.sin(p.phase), swA = Math.sin(p.phase + Math.PI);
    b.body.rotation.x = 0.16; b.body.position.y = Math.abs(Math.sin(p.phase)) * 0.07;
    b.legL.rotation.x = sw * 1.05; b.legR.rotation.x = swA * 1.05;
    b.armL.rotation.x = swA * 0.9 - 0.2; b.armR.rotation.x = sw * 0.9 - 0.2;
  }
  b.body.rotation.z = p.stumble ? Math.sin(p.time * 30) * 0.18 * p.stumble : 0;
  mesh.rotation.z = (p.lean || 0) * -0.1;
}

export function updateTrail(dt, active, pos, time) {
  if (trailKind === 'none' || !trailPool.length) return;
  trailT -= dt;
  if (active && trailT <= 0) {
    trailT = 0.07;
    const p = trailPool.find(x => x.life <= 0);
    if (p) {
      p.life = 0.6;
      p.m.position.set(pos.x + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 0.5);
      p.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    }
  }
  for (const p of trailPool) {
    if (p.life > 0) {
      p.life -= dt;
      p.m.position.y += dt * 1.2;
      p.m.rotation.y += dt * 4;
      p.m.material.opacity = Math.max(0, p.life / 0.6);
    } else p.m.material.opacity = 0;
  }
}
