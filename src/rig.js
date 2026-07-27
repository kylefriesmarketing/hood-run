/* HOOD RUN — rig.js
   The real skinned character: Quaternius "Animated Human" (CC0, poly.pizza),
   41-joint Mixamo-named skeleton, with authored Idle/Walk/Run/Jump/Punch/Death
   clips. This replaces the capsule humanoid for Jay and the officers.

   The model ships with UVs but NO texture, so the outfit system paints one:
   each triangle is assigned to a body region by the BONE that owns it (head
   and hands are skin, spine and arms are the top, hips and legs the pants,
   feet the shoes), and the region's colour is rasterised into a small canvas
   atlas along the mesh's own UV islands. That means the store's colour picks
   translate directly into per-pixel outfit paint, with no dependency on how
   the mesh was segmented at author time.

   Loading is async and the game must not wait for it: callers build their
   capsule fallback synchronously and hot-swap when ready() resolves. */

import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../lib/utils/SkeletonUtils.js';

let template = null;        // parsed gltf scene (never added to the world)
let clips = [];             // AnimationClips with the armature prefix stripped
let geoRef = null;          // skinned BufferGeometry, for atlas painting
let jointNames = [];        // skin joint index -> bone name
let normScale = 1;          // uniform scale that makes the model TARGET_H tall
const TARGET_H = 1.87;      // the capsule humanoid's height — keeps camera/anims honest
let loadPromise = null;

/* bone name -> outfit region */
function regionOf(name) {
  if (/Head|Neck|Hand|Thumb|Index/.test(name)) return 'skin';
  if (/Foot|Toe/.test(name)) return 'shoes';
  if (/UpLeg|Leg$|Hips/.test(name)) return 'pants';
  return 'top';             // Spine/Shoulder/Arm/ForeArm
}

export function loadRig() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise(resolve => {
    new GLTFLoader().load('./assets/rig/human.glb', gltf => {
      template = gltf.scene;
      clips = gltf.animations.map(c => { c = c.clone(); c.name = c.name.split('|').pop(); return c; });
      // de-index once: per-triangle flat colouring needs unshared verts
      template.traverse(o => { if (o.isSkinnedMesh) geoRef = o.geometry.toNonIndexed(); });
      const skinned = (() => { let s = null; template.traverse(o => { if (o.isSkinnedMesh) s = o; }); return s; })();
      jointNames = skinned.skeleton.bones.map(b => b.name);
      /* Normalize height by the SKELETON's world extent, not Box3: a skinned
         mesh's Box3 reads the unposed geometry, which here sits behind an
         armature node carrying FBX scale 69.18 — Box3 said 1.87 while the
         rendered figure stood 5.2 units tall. Bone world positions include
         every inherited scale, so they measure what actually renders. */
      template.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      let top = -Infinity, bot = Infinity;
      template.traverse(o => {
        if (o.isBone) { o.getWorldPosition(v); top = Math.max(top, v.y); bot = Math.min(bot, v.y); }
      });
      const rawH = top - bot;
      normScale = rawH > 0.01 ? TARGET_H / rawH : 1;
      resolve(true);
    }, undefined, () => resolve(false));   // missing/failed GLB -> capsules forever, no crash
  });
  return loadPromise;
}
export function rigReady() { return !!template; }

/* ---- outfit painting ----
   The model's UVs are auto-generated leftovers (it shipped untextured) and
   their islands OVERLAP — an atlas painted along them bled the torso colour
   onto the face. So the outfit is painted as PER-TRIANGLE VERTEX COLOURS
   instead: the template geometry is de-indexed once so every triangle owns
   its three verts exclusively, then each triangle takes its region's colour
   flat. Crisp region borders, no seams, no texture at all.
   Geometry variants are cached by colour set, so Jay and every officer with
   the same outfit share one buffer. */
const geoCache = {};
function geoFor(colors) {
  const key = ['skin', 'top', 'pants', 'shoes'].map(k => colors[k]).join('|');
  if (geoCache[key]) return geoCache[key];

  const geo = geoRef.clone();        // geoRef is already non-indexed (loadRig)
  const jt = geo.attributes.skinIndex, wt = geo.attributes.skinWeight;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();

  for (let t = 0; t < n; t += 3) {
    // dominant joint across the triangle's three verts decides the region
    const acc = {};
    for (let k = 0; k < 3; k++) for (let s = 0; s < 4; s++) {
      const j = jt.getComponent(t + k, s), w = wt.getComponent(t + k, s);
      if (w > 0) acc[j] = (acc[j] || 0) + w;
    }
    let bestJ = 0, bestW = -1;
    for (const j in acc) if (acc[j] > bestW) { bestW = acc[j]; bestJ = j; }
    c.set(colors[regionOf(jointNames[bestJ] || '')] ?? 0xff00ff);   // sRGB in, linear out
    for (let k = 0; k < 3; k++) { col[(t + k) * 3] = c.r; col[(t + k) * 3 + 1] = c.g; col[(t + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.__shared = true;               // session-cached; a prune sweep must not free it
  geoCache[key] = geo;
  return geo;
}

/* ---- character factory ----
   colors: { skin, top, pants, shoes } as hex numbers.
   Returns null until loadRig() has resolved — callers keep their capsule. */
export function createRigged(colors) {
  if (!template) return null;
  const root = SkeletonUtils.clone(template);
  root.scale.setScalar(normScale);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
  mat.__shared = true;
  const bones = {};
  root.traverse(o => {
    if (o.isSkinnedMesh) {
      o.geometry = geoFor(colors);
      o.material = mat; o.castShadow = true;
      // skinned bounds never track the pose; culling by the bind box blinks
      // the character out at screen edges
      o.frustumCulled = false;
    }
    if (o.isBone) bones[o.name] = o;
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const c of clips) actions[c.name] = mixer.clipAction(c);

  const group = new THREE.Group();
  group.add(root);
  const rig = { group, root, mixer, actions, bones };
  rig.setColors = next => root.traverse(o => { if (o.isSkinnedMesh) o.geometry = geoFor(next); });
  return rig;
}

/* Parent obj to a skeleton bone, cancelling the bone's inherited scale (the
   armature carries FBX scale ~69, so a naively-parented hat renders two
   storeys tall). worldOffset is expressed in game units. */
export function attachToBone(theRig, boneName, obj, worldOffset) {
  const bone = theRig.bones[boneName];
  if (!bone) return;
  const ws = new THREE.Vector3();
  theRig.group.updateMatrixWorld(true);
  bone.getWorldScale(ws);
  const inv = 1 / (ws.x || 1);
  const holder = new THREE.Group();
  holder.scale.setScalar(inv);                     // children render at world scale 1
  // holder.position is in bone-local units; world displacement = position * ws
  if (worldOffset) holder.position.copy(worldOffset).multiplyScalar(inv);
  holder.add(obj);
  bone.add(holder);
}

/* play helper: crossfade to a clip; one-shots freeze on their last frame */
export function play(rig, name, { fade = 0.16, once = false, timeScale = 1 } = {}) {
  const a = rig.actions[name];
  if (!a) return null;
  if (rig._cur === a && !once) { a.timeScale = timeScale; return a; }
  a.reset();
  a.timeScale = timeScale;
  if (once) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
  else a.setLoop(THREE.LoopRepeat);
  if (rig._cur && rig._cur !== a) { a.crossFadeFrom(rig._cur, fade, false); }
  a.play();
  rig._cur = a;
  return a;
}
