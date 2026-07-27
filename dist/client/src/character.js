/* HOOD RUN — character.js
   One articulated humanoid shared by Jay, the patrol officers and the people on
   the sidewalk, so everybody in the city is built to the same standard.

   Built from ORGANIC forms, not stacked primitives: the torso is a lathed
   profile (broad chest tapering to a waist), limbs are capsules whose round
   caps double as shoulders/elbows/knees so there are no visible seams, and the
   head is a shaped skull with a jaw, nose and ears. At chase-cam distance what
   sells a character is silhouette and proportion, so those got the attention.

   Returns { group, parts } with the SAME part names the pose code drives
   (body, armL, armR, legL, legR). */

import * as THREE from '../lib/three.module.js';

/* Everything here is session-lived and reused by every character, so it is
   marked __shared: world.js's prune sweep frees anything NOT so marked, and
   disposing these would blank every character built afterwards. */
const matCache = {};
function mat(color, rough = 0.8) {
  const k = color + '|' + rough;
  if (!matCache[k]) {
    matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
    matCache[k].__shared = true;
  }
  return matCache[k];
}
const geoCache = {};
function shared(key, make) {
  if (!geoCache[key]) { geoCache[key] = make(); geoCache[key].__shared = true; }
  return geoCache[key];
}
const SPHERE = () => shared('sph', () => new THREE.SphereGeometry(1, 10, 8));
const BOX = () => shared('box', () => new THREE.BoxGeometry(1, 1, 1));
/* capsule whose cylinder spans length, caps bulging radius past each end */
const CAP = (r, len) => shared(`cap${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 8));

function put(geo, m, sx, sy, sz, x, y, z) {
  const o = new THREE.Mesh(geo, m);
  o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  return o;
}
/* a limb segment hanging from the group origin down -y */
function seg(m, r, len, y) {
  const o = new THREE.Mesh(CAP(r, len), m);
  o.position.y = y - len / 2;
  return o;
}

/* torso as a lathed profile: hips -> waist -> chest -> shoulders, then
   flattened on z so it reads as a body rather than a barrel */
function torsoGeo() {
  return shared('torso', () => {
    const pts = [];
    const profile = [
      [0.00, 0.235], [0.10, 0.250], [0.24, 0.258], [0.40, 0.276],
      [0.55, 0.300], [0.66, 0.303], [0.75, 0.286], [0.82, 0.225], [0.86, 0.10],
    ];
    for (const [y, r] of profile) pts.push(new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 12);
  });
}

/* opts: { skin, outfit, pants, shoes, accent, hood:bool, build } */
export function buildHumanoid(opts) {
  const skinM = mat(opts.skin, 0.7);
  const topM = mat(opts.outfit, 0.88);
  const pantM = mat(opts.pants ?? 0x2a3038, 0.9);
  const shoeM = mat(opts.shoes ?? 0xf0f0f0, 0.55);
  const hairM = mat(0x241a14, 0.95);

  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body);
  const parts = { body };

  const HIP = 0.84;                       // leg pivot height
  const SHO = HIP + 0.72;                 // shoulder height

  /* torso */
  const torso = new THREE.Mesh(torsoGeo(), topM);
  torso.position.y = HIP; torso.scale.set(1, 1, 0.74);
  body.add(torso);
  body.add(put(SPHERE(), topM, 0.30, 0.13, 0.23, 0, HIP + 0.03, 0));   // hips fill

  /* neck + head — a shaped skull, not a cube */
  body.add(put(CAP(0.075, 0.1), skinM, 1, 1, 1, 0, SHO + 0.03, 0));
  const headY = SHO + 0.26;
  body.add(put(SPHERE(), skinM, 0.205, 0.225, 0.20, 0, headY, 0));      // cranium
  body.add(put(BOX(), skinM, 0.27, 0.16, 0.26, 0, headY - 0.12, 0.012)); // jaw
  body.add(put(SPHERE(), skinM, 0.135, 0.075, 0.055, 0, headY - 0.185, 0.05)); // chin
  body.add(put(BOX(), skinM, 0.045, 0.05, 0.05, 0, headY - 0.045, 0.185));     // nose
  for (const s of [-1, 1]) {
    body.add(put(SPHERE(), skinM, 0.035, 0.055, 0.03, s * 0.2, headY - 0.02, 0.01));  // ears
    body.add(put(SPHERE(), mat(0x15161c, 0.35), 0.032, 0.04, 0.02, s * 0.082, headY + 0.005, 0.175)); // eyes
    body.add(put(BOX(), hairM, 0.075, 0.022, 0.03, s * 0.082, headY + 0.072, 0.17)); // brows
  }
  body.add(put(SPHERE(), hairM, 0.212, 0.2, 0.208, 0, headY + 0.035, -0.012)); // hair cap
  parts.headY = headY;

  /* hoodie hood bunched behind the neck — the strongest silhouette cue Jay has */
  if (opts.hood) {
    // a hood bunched at the nape — at the previous size it towered over the
    // shoulders and read as a pillow strapped to his back
    body.add(put(SPHERE(), topM, 0.155, 0.105, 0.10, 0, SHO - 0.03, -0.145));
    body.add(put(SPHERE(), topM, 0.13, 0.08, 0.075, 0, SHO - 0.13, -0.155));
  }

  /* arms: upper + fore + a hand, capsule caps forming shoulder and elbow */
  const mkArm = s => {
    const a = new THREE.Group(); a.position.set(0.275 * s, SHO - 0.06, 0);
    // sleeve runs past the elbow: an even split read as one long bare arm
    a.add(seg(topM, 0.085, 0.36, 0));
    a.add(seg(skinM, 0.068, 0.18, -0.38));
    a.add(put(SPHERE(), skinM, 0.072, 0.088, 0.055, 0, -0.60, 0));        // hand
    body.add(a); return a;
  };
  /* legs: thigh + shin + a sneaker with a sole and toe box */
  const mkLeg = s => {
    const l = new THREE.Group(); l.position.set(0.135 * s, HIP, 0);
    l.add(seg(pantM, 0.118, 0.34, 0));
    l.add(seg(pantM, 0.093, 0.30, -0.37));
    l.add(put(BOX(), shoeM, 0.175, 0.075, 0.30, 0, -0.775, 0.045));      // sole
    l.add(put(SPHERE(), shoeM, 0.09, 0.075, 0.115, 0, -0.735, -0.005));  // heel/upper
    l.add(put(BOX(), shoeM, 0.16, 0.085, 0.12, 0, -0.735, 0.135));       // toe cap
    body.add(l); return l;
  };
  parts.armL = mkArm(-1); parts.armR = mkArm(1);
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  if (opts.build === 'officer') {
    body.add(put(BOX(), mat(0x1a2440, 0.7), 0.56, 0.09, 0.42, 0, HIP + 0.28, 0));       // duty belt
    body.add(put(BOX(), mat(0xffd23c, 0.3), 0.075, 0.075, 0.02, -0.13, SHO - 0.22, 0.2)); // badge
    body.add(put(SPHERE(), mat(opts.accent ?? 0x2a3a6e, 0.8), 0.215, 0.115, 0.215, 0, headY + 0.14, 0));
    body.add(put(BOX(), mat(opts.accent ?? 0x2a3a6e, 0.8), 0.38, 0.035, 0.19, 0, headY + 0.10, 0.2));
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
