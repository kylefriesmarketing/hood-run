/* HOOD RUN — character.js
   One articulated humanoid shared by Jay, the patrol officers and the people on
   the sidewalk, so everybody in the city is built to the same standard.

   Shape language (bible §12): chunky and readable, but no longer a stack of
   hard boxes — limbs are tapered cylinders, joints are spheres, and the torso
   carries real shoulders. Returns { group, parts } with the SAME part names the
   existing pose code drives (body, armL, armR, legL, legR). */

import * as THREE from '../lib/three.module.js';

/* Everything here is session-lived and reused by every character, so it is
   marked __shared: world.js's prune sweep frees anything NOT so marked, and
   disposing these would blank every character built afterwards. */
const cache = {};
function mat(color, rough = 0.8) {
  const k = color + '|' + rough;
  if (!cache[k]) {
    cache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
    cache[k].__shared = true;
  }
  return cache[k];
}
const GEO = {
  limb: new THREE.CylinderGeometry(1, 1, 1, 8),
  joint: new THREE.SphereGeometry(1, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
};
for (const k in GEO) GEO[k].__shared = true;
function piece(geo, m, sx, sy, sz, x, y, z) {
  const o = new THREE.Mesh(geo, m);
  o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  return o;
}
/* a tapered limb segment: rTop/rBot radii, length along -y from the origin */
function taper(m, rTop, rBot, len, x, y, z) {
  const g = new THREE.CylinderGeometry(rTop, rBot, 1, 8);
  const o = new THREE.Mesh(g, m);
  o.scale.set(1, len, 1); o.position.set(x, y - len / 2, z);
  o.userData.ownGeo = true;
  return o;
}

/* opts: { skin, outfit, pants, shoes, accent, build:'runner'|'officer'|'civilian' } */
export function buildHumanoid(opts) {
  const skinM = mat(opts.skin, 0.72);
  const topM = mat(opts.outfit, 0.86);
  const pantM = mat(opts.pants ?? 0x2a3038, 0.88);
  const shoeM = mat(opts.shoes ?? 0xf0f0f0, 0.6);

  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body);
  const parts = { body };

  /* torso: chest block with real shoulders, tapering to a narrower waist */
  body.add(piece(GEO.box, topM, 0.62, 0.46, 0.38, 0, 1.30, 0));        // chest
  body.add(piece(GEO.box, topM, 0.52, 0.34, 0.34, 0, 0.99, 0));        // waist
  body.add(piece(GEO.joint, topM, 0.155, 0.145, 0.16, -0.31, 1.44, 0));  // shoulder caps
  body.add(piece(GEO.joint, topM, 0.155, 0.145, 0.16, 0.31, 1.44, 0));
  body.add(piece(GEO.box, topM, 0.56, 0.16, 0.4, 0, 0.83, 0));         // jacket hem

  /* neck + head — the neck is what stops him reading as a head on a crate */
  body.add(piece(GEO.limb, skinM, 0.11, 0.14, 0.11, 0, 1.58, 0));
  body.add(piece(GEO.box, skinM, 0.38, 0.4, 0.36, 0, 1.80, 0));        // head
  body.add(piece(GEO.box, mat(0x2a2018, 0.9), 0.31, 0.09, 0.05, 0, 1.83, 0.19)); // brow
  for (const s of [-1, 1])                                              // eyes
    body.add(piece(GEO.box, mat(0x15161c, 0.5), 0.07, 0.08, 0.03, s * 0.09, 1.79, 0.19));

  /* arms: upper + forearm + a real hand */
  const mkArm = s => {
    const a = new THREE.Group(); a.position.set(0.34 * s, 1.42, 0);
    a.add(taper(topM, 0.115, 0.098, 0.36, 0, 0, 0));
    a.add(piece(GEO.joint, topM, 0.1, 0.1, 0.1, 0, -0.36, 0));          // elbow
    a.add(taper(skinM, 0.095, 0.082, 0.32, 0, -0.36, 0));
    a.add(piece(GEO.box, skinM, 0.15, 0.17, 0.12, 0, -0.76, 0));        // hand
    body.add(a); return a;
  };
  /* legs: thigh + shin + a shoe with a toe */
  const mkLeg = s => {
    const l = new THREE.Group(); l.position.set(0.16 * s, 0.86, 0);
    l.add(taper(pantM, 0.145, 0.115, 0.44, 0, 0, 0));
    l.add(piece(GEO.joint, pantM, 0.12, 0.12, 0.12, 0, -0.44, 0));      // knee
    l.add(taper(pantM, 0.115, 0.095, 0.4, 0, -0.44, 0));
    l.add(piece(GEO.box, shoeM, 0.2, 0.11, 0.26, 0, -0.89, 0.03));      // shoe
    l.add(piece(GEO.box, shoeM, 0.19, 0.08, 0.12, 0, -0.9, 0.19));      // toe
    body.add(l); return l;
  };
  parts.armL = mkArm(-1); parts.armR = mkArm(1);
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  if (opts.build === 'officer') {
    body.add(piece(GEO.box, mat(0x1a2440, 0.7), 0.66, 0.1, 0.4, 0, 0.95, 0));      // duty belt
    body.add(piece(GEO.box, mat(0xffd23c, 0.35), 0.09, 0.09, 0.02, -0.16, 1.34, 0.2)); // badge
    body.add(piece(GEO.box, mat(opts.accent ?? 0x2a3a6e, 0.8), 0.42, 0.13, 0.42, 0, 2.02, 0));
    body.add(piece(GEO.box, mat(opts.accent ?? 0x2a3a6e, 0.8), 0.42, 0.05, 0.2, 0, 1.98, 0.27));
  }
  return { group, parts };
}

/* drive a walk/run cycle on a humanoid built above */
export function poseHumanoid(parts, phase, lean = 0.16, amp = 1) {
  const sw = Math.sin(phase), swA = Math.sin(phase + Math.PI);
  parts.body.rotation.x = lean;
  parts.body.position.y = Math.abs(Math.sin(phase)) * 0.06 * amp;
  parts.legL.rotation.x = sw * 1.0 * amp; parts.legR.rotation.x = swA * 1.0 * amp;
  parts.armL.rotation.x = swA * 0.85 * amp - 0.15; parts.armR.rotation.x = sw * 0.85 * amp - 0.15;
}
