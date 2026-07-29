/* HOOD RUN — pbr.js
   Photographic material maps (CC0, ambientCG) for the surfaces that carry the
   city: brick, asphalt, paving stone, concrete.

   Two things load per material and they are used very differently:

   - the COLOUR map arrives as a plain Image and is never uploaded to the GPU as
     itself. Every big surface in this game paints gameplay-critical markings —
     lane lines, crosswalks, kerb seams, lit windows — into a canvas, and those
     have to stay readable at 20 m/s. So the photo is composited UNDER the
     drawn markings (see tex()'s `base` option in world.js) rather than
     replacing them. Photo for material, paint for legibility.

   - the NORMAL and ORM maps are uploaded and shared. Because they are pure
     high-frequency detail, their tiling never has to line up with the colour
     canvas, which means one shared texture at a fixed repeat serves every
     segment. That is what keeps this from re-introducing the per-segment
     texture leak: nothing here is ever cloned.

   ORM packs ambient occlusion in R, roughness in G, metalness in B — three.js
   samples aoMap.r / roughnessMap.g / metalnessMap.b, so ONE image feeds all
   three slots and a material costs 2 fetches instead of 4. */

import * as THREE from '../lib/three.module.js';

const DIR = './assets/tex/';
const NAMES = ['brick', 'asphalt', 'sidewalk', 'concrete'];

/* fixed tiling per surface role — see the note above on why these need not
   agree with the colour canvas's own repeat */
const PROFILES = {
  road:     { set: 'asphalt',  repeat: [2, 8],  normalScale: 0.55 },
  sidewalk: { set: 'sidewalk', repeat: [1, 12], normalScale: 0.70 },
  // must track the colour canvas's own 7 x 9 brick tiling, or the relief sits
  // at a different scale from the bricks it is meant to be lighting
  facade:   { set: 'brick',    repeat: [7, 9],  normalScale: 0.75 },
  wall:     { set: 'concrete', repeat: [2, 2],  normalScale: 0.55 },
  // building flanks + roofs: tint stays flat colour (they are usually in
  // shadow), but grain + AO stop them reading as untextured slabs
  sideWall: { set: 'brick',    repeat: [5, 6],  normalScale: 0.60 },
  roof:     { set: 'concrete', repeat: [3, 4],  normalScale: 0.50 },
};

const colorImages = {};        // name -> HTMLImageElement
const dataTex = {};            // "name|kind" -> THREE.Texture
const profileCache = {};       // profile key -> material patch
let waiters = [];
let state = 'idle';            // idle | loading | ready | failed
let maxAniso = 4;
let enabled = true;

function loadImage(src) {
  const im = new Image();
  im.decoding = 'async';
  im.src = src;
  return im;
}

function loadData(name, kind, loader) {
  const t = loader.load(`${DIR}${name}-${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  // normal + ORM are DATA, not colour: leaving these in sRGB would bend every
  // surface normal and wash the roughness out
  t.colorSpace = THREE.NoColorSpace;
  t.__shared = true;           // never freed by world.js's prune sweep
  return t;
}

export function initPBR(renderer) {
  if (state !== 'idle') return;
  state = 'loading';
  try { maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 4); } catch { maxAniso = 4; }

  const loader = new THREE.TextureLoader();
  let pending = NAMES.length;
  for (const n of NAMES) {
    dataTex[n + '|normal'] = loadData(n, 'normal', loader);
    dataTex[n + '|orm'] = loadData(n, 'orm', loader);

    const im = loadImage(`${DIR}${n}-color.jpg`);
    colorImages[n] = im;
    const done = () => {
      if (--pending <= 0) {
        state = 'ready';
        const w = waiters; waiters = [];
        for (const cb of w) { try { cb(); } catch { /* a bad repaint must not stall the rest */ } };
      }
    };
    im.addEventListener('load', done, { once: true });
    im.addEventListener('error', () => { colorImages[n] = null; done(); }, { once: true });
  }
}

export function pbrReady() { return state === 'ready'; }

/* run cb once the photo set is decoded (immediately if it already is), so
   canvas textures painted before the images arrived can repaint themselves */
export function onPBRReady(cb) {
  if (state === 'ready') cb(); else waiters.push(cb);
}

/* the decoded photo for canvas compositing, or null if it is not usable yet */
export function baseImage(name) {
  if (!enabled) return null;
  const im = colorImages[name];
  return (im && im.complete && im.naturalWidth > 0) ? im : null;
}

/* material properties for a surface role — spread straight into a
   MeshStandardMaterial ctor, or Object.assign'd onto an existing one */
export function pbrProfile(key) {
  if (!enabled) return null;
  const p = PROFILES[key];
  if (!p) return null;
  if (profileCache[key]) return profileCache[key];

  const nrm = dataTex[p.set + '|normal'];
  const orm = dataTex[p.set + '|orm'];
  if (!nrm || !orm) return null;

  // one texture object per ROLE, not per segment: clone so each role can hold
  // its own repeat while still sharing the single decoded image underneath
  const n2 = nrm.clone(); n2.repeat.set(p.repeat[0], p.repeat[1]); n2.needsUpdate = true; n2.__shared = true;
  const o2 = orm.clone(); o2.repeat.set(p.repeat[0], p.repeat[1]); o2.needsUpdate = true; o2.__shared = true;
  o2.channel = 0;              // aoMap defaults to uv1; our geometry only has uv0

  profileCache[key] = {
    normalMap: n2,
    normalScale: new THREE.Vector2(p.normalScale, p.normalScale),
    roughnessMap: o2,
    aoMap: o2,
    aoMapIntensity: 0.55,
    metalness: 0,
  };
  return profileCache[key];
}

/* apply a profile to a material already built by the old flat-colour path */
export function applyProfile(mat, key) {
  const p = pbrProfile(key);
  if (!p || !mat) return mat;
  Object.assign(mat, p);
  mat.needsUpdate = true;
  return mat;
}

/* quality lever — the adaptive tier in main.js drops detail maps before it
   starts cutting resolution */
export function setPBREnabled(v) {
  if (enabled === v) return;
  enabled = v;
  for (const k in profileCache) {
    const p = profileCache[k];
    p.normalMap.needsUpdate = true;
  }
}
export function pbrEnabled() { return enabled; }
