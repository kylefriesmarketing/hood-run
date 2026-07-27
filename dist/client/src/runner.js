/* HOOD RUN — runner.js
   Jay the runner: mesh, cosmetics, animation poses, trail particles.
   Pure view — all gameplay state lives in game.js. */

import * as THREE from '../lib/three.module.js';
import { COSMETICS } from './data.js';
import { scene, box, blobShadow, cmat } from './world.js';
import { buildHumanoid } from './character.js';

let mesh = null, parts = null, trailPool = [], trailKind = 'none', trailT = 0, poseKind = 'cheer';

function cosmeticById(slot, id) {
  return COSMETICS[slot].find(c => c.id === id) || COSMETICS[slot][0];
}

/* Build a standalone Jay from an equipped set. Returns { group, parts } and
   touches no scene, so the closet can render its own preview copy. */
export function makeRunner(equipped) {
  const outfit = cosmeticById('outfit', equipped.outfit).color;
  const shoes = cosmeticById('shoes', equipped.shoes).color;
  const hat = cosmeticById('hat', equipped.hat);
  const skin = cosmeticById('skin', equipped.skin).color;

  /* articulated body from the shared humanoid; cosmetics layer on top */
  const built = buildHumanoid({ skin, outfit, shoes, pants: 0x2a3038, build: 'runner', hood: true });
  const mesh = built.group, parts = built.parts, body = parts.body;
  const HY = parts.headY;          // hats key off the real head height

  // the City Trust money bag, slung cross-body (cartoon sack)
  const strap = box(0.09, 0.66, 0.42, 0x6a4a2c, 0.13, 1.24, 0); strap.rotation.z = 0.52; body.add(strap);
  /* satchel at the hip. It was nearly head-sized before, which read as luggage
     and swamped his silhouette; this is a bag he could actually run with. */
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.92 }));
  sack.scale.set(1, 1.15, 0.72); sack.position.set(-0.235, 1.03, -0.19); body.add(sack);
  body.add(box(0.07, 0.05, 0.07, 0xa8885c, -0.235, 1.18, -0.19));        // tied neck
  const dollar = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: dollarTex(), transparent: true, side: THREE.DoubleSide }));
  dollar.position.set(-0.3, 1.03, -0.19); dollar.rotation.y = -Math.PI / 2; body.add(dollar);

  /* headwear, placed relative to the skull rather than hard-coded heights, and
     rounded to match it — a flat slab cap on a shaped head looks stuck on */
  const dome = (col, ry, sy) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }));
    m.scale.set(0.225, sy, 0.222); m.position.y = ry; return m;
  };
  if (hat.kind === 'cap') {
    body.add(dome(hat.color, HY + 0.02, 0.2));
    body.add(box(0.34, 0.045, 0.2, hat.color, 0, HY + 0.05, 0.22));       // peak
  } else if (hat.kind === 'beanie') {
    // dome sits ON the crown with the band wrapping just below it; the band was
    // above the dome before, which punched the hat apart into floating slabs
    body.add(dome(hat.color, HY - 0.02, 0.26));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12),
      new THREE.MeshStandardMaterial({ color: hat.color, roughness: 0.9 }));
    band.scale.set(0.235, 0.075, 0.232); band.position.y = HY + 0.02; body.add(band);
  } else if (hat.kind === 'bucket') {
    body.add(dome(hat.color, HY + 0.01, 0.19));
    body.add(box(0.56, 0.045, 0.56, hat.color, 0, HY + 0.05, 0));         // all-round brim
  } else if (hat.kind === 'visor') {
    body.add(box(0.4, 0.06, 0.4, hat.color, 0, HY + 0.1, 0));
    body.add(box(0.34, 0.04, 0.2, hat.color, 0, HY + 0.09, 0.22));
  } else if (hat.kind === 'phones') {
    body.add(box(0.42, 0.05, 0.13, hat.color, 0, HY + 0.21, 0));          // headband
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshStandardMaterial({ color: hat.color, roughness: 0.6 }));
      cup.scale.set(0.055, 0.085, 0.085); cup.position.set(s * 0.21, HY - 0.02, 0.01);
      body.add(cup);
    }
  }
  // (no hat: the humanoid's own hair cap already covers the crown)
  // the real cast shadow does the grounding now; the blob is just a soft
  // contact darkening underneath so he never looks detached at a bad sun angle
  const blob = blobShadow(0.85); blob.material = blob.material.clone();
  blob.material.opacity = 0.18; mesh.add(blob);
  mesh.traverse(o => { if (o.isMesh && o !== blob) o.castShadow = true; });
  return { group: mesh, parts };
}

/* The in-world Jay: build one and own it as the module singleton. */
export function buildRunner(equipped) {
  if (mesh) scene.remove(mesh);
  const built = makeRunner(equipped);
  mesh = built.group; parts = built.parts;
  trailKind = cosmeticById('trail', equipped.trail).kind;
  poseKind = cosmeticById('pose', equipped.pose).kind;
  scene.add(mesh);

  // trail pool
  for (const p of trailPool) scene.remove(p.m);
  trailPool = [];
  if (trailKind !== 'none') {
    for (let i = 0; i < 14; i++) {
      let m;
      if (trailKind === 'spark') {
        m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0 }));
      } else if (trailKind === 'coins') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0xffd86a, transparent: true, opacity: 0 }));
        m.rotation.x = Math.PI / 2;
      } else if (trailKind === 'petal') {
        m = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), new THREE.MeshBasicMaterial({ color: 0xff9ec6, transparent: true, opacity: 0, side: THREE.DoubleSide }));
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
    b.legL.rotation.x = 0; b.legR.rotation.x = 0; b.body.rotation.x = 0;
    const t = p.time;
    if (poseKind === 'flex') {                       // both arms curled up, slow bounce
      b.body.position.y = Math.abs(Math.sin(t * 3)) * 0.06;
      b.armL.rotation.x = -1.5; b.armR.rotation.x = -1.5;
      b.armL.rotation.z = 1.1; b.armR.rotation.z = -1.1;
    } else if (poseKind === 'bow') {                 // deep bow, arms swept back
      const dip = (Math.sin(t * 2) * 0.5 + 0.5) * 0.5;
      b.body.rotation.x = 0.5 + dip; b.body.position.y = -0.1;
      b.armL.rotation.x = 0.9; b.armR.rotation.x = 0.9;
      b.armL.rotation.z = 0.4; b.armR.rotation.z = -0.4;
    } else if (poseKind === 'point') {               // one arm out, other on hip
      b.body.position.y = Math.abs(Math.sin(t * 4)) * 0.1;
      b.armL.rotation.x = -0.4; b.armL.rotation.z = 0.9;
      b.armR.rotation.x = -1.6; b.armR.rotation.z = -0.25;
    } else {                                         // cheer — hands up
      b.body.position.y = Math.abs(Math.sin(t * 6)) * 0.22;
      b.armL.rotation.x = -2.8; b.armR.rotation.x = -2.8;
      b.armL.rotation.z = 0; b.armR.rotation.z = 0;
    }
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
