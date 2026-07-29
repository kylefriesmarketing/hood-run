/* HOOD RUN — world.js
   Scene, lighting, district palettes, canvas textures, prop factories,
   segment geometry, origin rebase. View-only randomness uses Math.random. */

import * as THREE from '../lib/three.module.js';
import { LANE_W, ROAD_W, HALF, SIDE_W, WALL_X, DISTRICTS, ROOF_H } from './data.js';
import { makeBuilder, detailMaterial } from './geo.js';
import { buildHumanoid } from './character.js';
import { initPBR, onPBRReady, baseImage, pbrProfile } from './pbr.js';
import { rigReady, createRigged, play, attachToBone } from './rig.js';

export let scene, camera, renderer;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const irand = (a, b) => Math.floor(rand(a, b + 1));

/* ---------------- boot ---------------- */
let hemi, sun, skyGroup, groundPlane, skyDome, pmrem, envScene, envDome, envRT = null;
let skyline = null, skylineMat = null;   // distant tower ring, tinted per district

/* rebake the environment from the current sky gradient */
function refreshEnv() {
  if (!pmrem) return;
  const prev = envRT;
  envRT = pmrem.fromScene(envScene, 0.05);
  scene.environment = envRT.texture;
  if (prev) prev.dispose();               // the old cube target would leak otherwise
}
export function initWorld(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  initPBR(renderer);                    // photo material maps stream in behind the first frames
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* Filmic response instead of a raw clamp: highlights roll off rather than
     blowing to flat white, which is what made the old Lambert look plasticky. */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb8d8ec, 40, 175);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  hemi = new THREE.HemisphereLight(0xcfe3f5, 0x77875f, 1.05); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1cf, 0.95); sun.position.set(-24, 38, 14); scene.add(sun);

  /* Real sun shadows. The runner used to float on a blob decal; a cast shadow
     grounds him and throws long building shadows across the road. The frustum
     is deliberately tight and follows the player, so the shadow pass only ever
     draws the block you are actually on. */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0016;
  sun.shadow.normalBias = 0.035;
  scene.add(sun.target);

  /* Gradient sky dome. A flat background colour was the single most obviously
     "cheap" thing on screen; this gives a real horizon falloff plus a sun glow,
     and its uniforms are lerped by the same district transition as the lights. */
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x5f9fd8) },
      bottom: { value: new THREE.Color(0xcfe6f5) },
      sunCol: { value: new THREE.Color(0xfff3d0) },
      sunDir: { value: new THREE.Vector3(70, 95, -150).normalize() },
    },
    vertexShader: `
      varying vec3 vW;
      void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir;
      varying vec3 vW;
      void main(){
        vec3 d = normalize(vW);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottom, top, pow(h, 0.9));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * pow(s, 40.0) * 0.45;          // tight sun bloom (a disc mesh sits here too)
        col += sunCol * pow(s, 5.0) * 0.10;           // broad atmospheric haze
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  skyDome.renderOrder = -1000;
  scene.add(skyDome);

  /* Image-based lighting. Standard materials only really come alive with an
     environment to reflect, so bake one straight off the sky dome: glass picks
     up the sky, chrome and paintwork get a soft falloff, and everything gains
     the ambient bounce a single hemisphere light can't fake. Regenerated only
     when a district transition finishes — it is far too costly per frame. */
  pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  envScene = new THREE.Scene();
  envDome = new THREE.Mesh(skyDome.geometry, skyDome.material);
  envScene.add(envDome);
  refreshEnv();

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
  groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ color: 0x6b7a5f }));
  groundPlane.rotation.x = -Math.PI / 2; groundPlane.position.y = -0.06;
  groundPlane.receiveShadow = true; scene.add(groundPlane);

  /* ---- distant skyline ring ----
     A ring of tower silhouettes at r 95–130 — inside the fog band, so each
     district's haze half-swallows them. Translates WITH the camera (zero
     parallax = reads as miles away) and never rotates. One merged mesh.
     Lit windows come from an emissive map so setLights can turn the city's
     lights up as the districts get darker. */
  {
    const wc = document.createElement('canvas'); wc.width = 48; wc.height = 64;
    const wg = wc.getContext('2d');
    wg.fillStyle = '#000'; wg.fillRect(0, 0, 48, 64);
    wg.fillStyle = '#fff';
    for (let y = 4; y < 60; y += 6) for (let x = 4; x < 44; x += 6)
      if (Math.random() < 0.34) wg.fillRect(x, y, 3, 3);
    const wtex = markShared(new THREE.CanvasTexture(wc));
    skylineMat = new THREE.MeshStandardMaterial({
      color: 0x3a4050, vertexColors: true, roughness: 0.95, metalness: 0,
      emissive: 0xffd9a0, emissiveMap: markShared(wtex), emissiveIntensity: 0.15,
    });
    skylineMat.__shared = true;
    const B = makeBuilder();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand(-0.06, 0.06);
      const r = rand(95, 130);
      const w = rand(9, 19), h = rand(16, 44), dp = rand(7, 12);
      const shade = 0.82 + Math.random() * 0.36;      // slab-to-slab variance
      const col = new THREE.Color(0xffffff).multiplyScalar(shade).getHex();
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      B.box(w, h, dp, x, h / 2, z, col, { ry: -a + Math.PI / 2 });
      B.box(w * 0.8, 0.8, dp * 0.8, x, h + 0.4, z, col, { ry: -a + Math.PI / 2 });  // parapet cap
      if (Math.random() < 0.4)                        // rooftop tank / bulkhead
        B.box(2.2, rand(1.5, 3), 2.2, x + rand(-2, 2), h + 1.4, z + rand(-2, 2), col);
    }
    skyline = new THREE.Mesh(B.build(), skylineMat);
    scene.add(skyline);
  }
  return { scene, camera, renderer };
}
export function trackView(px, pz) {
  groundPlane.position.set(px, -0.06, pz);
  skyGroup.position.set(px, 0, pz);
  skyDome.position.set(px, 0, pz);        // dome is infinite — keep it centred on the view
  if (skyline) skyline.position.set(px, 0, pz);  // translate only: zero parallax = far away
  /* Carry the sun (and its shadow frustum) along with the player. The offset is
     deliberately steep: shadow length is height * (xOffset/yOffset), so a low
     sun threw 15-tall buildings clear across the road and put the whole play
     area — and every hazard on it — in shade. At 12/46 the same building lands
     its shadow on the sidewalk, keeping the lanes lit and readable. */
  sun.position.set(px + curSunOff.x, curSunOff.y, pz + curSunOff.z);
  sun.target.position.set(px, 0, pz);
  sun.target.updateMatrixWorld();
}
/* shadows are the first thing adaptive quality drops on a slow device */
export function setShadowsEnabled(on) {
  if (renderer.shadowMap.enabled === on) return;
  renderer.shadowMap.enabled = on;
  scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
}
export function shadowsEnabled() { return renderer.shadowMap.enabled; }

/* ---------------- district lighting transitions ---------------- */
const lightLerp = { t: 1, from: null, to: null };
export function applyDistrict(name, immediate) {
  const d = DISTRICTS[name]; if (!d || !d.sky) return;
  const to = {
    sky: new THREE.Color(d.sky), fog: new THREE.Color(d.fog[0]), fogNear: d.fog[1], fogFar: d.fog[2],
    hemiSky: new THREE.Color(d.hemi[0]), hemiGnd: new THREE.Color(d.hemi[1]), hemiI: d.hemi[2],
    sunC: new THREE.Color(d.sun[0]), sunI: d.sun[1], ground: new THREE.Color(d.side).multiplyScalar(0.55),
    sunOff: new THREE.Vector3(...(d.sunOff || [-12, 46, 15])),
    winLit: d.windowLit ?? 0.1,
  };
  if (immediate) { setLights(to); lightLerp.t = 1; lightLerp.to = to; refreshEnv(); return; }
  lightLerp.from = snapLights(); lightLerp.to = to; lightLerp.t = 0;
}
const curSky = new THREE.Color(0x9fc7e8);      // drives the dome gradient
const curSunOff = new THREE.Vector3(-12, 46, 15);  // read every frame by followCam
let curWinLit = 0.1;
function snapLights() {
  return { sky: curSky.clone(), fog: scene.fog.color.clone(), fogNear: scene.fog.near, fogFar: scene.fog.far,
    hemiSky: hemi.color.clone(), hemiGnd: hemi.groundColor.clone(), hemiI: hemi.intensity,
    sunC: sun.color.clone(), sunI: sun.intensity, ground: groundPlane.material.color.clone(),
    sunOff: curSunOff.clone(), winLit: curWinLit };
}
function setLights(v) {
  curSky.copy(v.sky);
  if (v.sunOff) curSunOff.copy(v.sunOff);
  if (skylineMat && v.winLit !== undefined) {
    curWinLit = v.winLit;
    // silhouettes a shade darker than the fog they stand in, windows brighter
    // as the district darkens — nightmarket glows, midday block barely shows
    skylineMat.color.copy(v.fog).multiplyScalar(0.62);
    skylineMat.emissiveIntensity = 0.1 + curWinLit * 1.6;
  }
  scene.fog.color.copy(v.fog); scene.fog.near = v.fogNear; scene.fog.far = v.fogFar;
  // shadowed surfaces are lit by the hemisphere alone, so lift it to stop the
  // street canyon going muddy now that buildings actually cast
  hemi.color.copy(v.hemiSky); hemi.groundColor.copy(v.hemiGnd); hemi.intensity = v.hemiI * 1.3;
  sun.color.copy(v.sunC); sun.intensity = v.sunI; groundPlane.material.color.copy(v.ground);
  // derive the dome gradient from the district's sky + fog: deeper at zenith,
  // hazier at the horizon where it meets the fog the buildings fade into
  const u = skyDome.material.uniforms;
  u.top.value.copy(v.sky).multiplyScalar(0.68);
  u.bottom.value.copy(v.sky).lerp(v.fog, 0.55);
  u.sunCol.value.copy(v.sunC);
}
export function updateLights(dt) {
  if (lightLerp.t >= 1 || !lightLerp.to) return;
  lightLerp.t = Math.min(1, lightLerp.t + dt / 2.5);
  const a = lightLerp.from, b = lightLerp.to, t = lightLerp.t, out = {};
  for (const k of ['sky', 'fog', 'hemiSky', 'hemiGnd', 'sunC', 'ground']) out[k] = a[k].clone().lerp(b[k], t);
  for (const k of ['fogNear', 'fogFar', 'hemiI', 'sunI', 'winLit']) out[k] = a[k] + (b[k] - a[k]) * t;
  out.sunOff = a.sunOff.clone().lerp(b.sunOff, t);
  setLights(out);
  if (lightLerp.t >= 1) refreshEnv();     // rebake IBL once the new sky settles
}

/* ---------------- texture factory ---------------- */
/* Textures that composite a photo under their painted detail register here, so
   any that were painted before the image finished decoding can repaint once it
   lands. Without this the first few segments of a cold load would keep their
   flat-colour base forever while later ones came out photographic. */
const repaintQueue = [];
let pbrHooked = false;

export function tex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  if (opts.onPaint) opts.onPaint(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;

  if (opts.base) {
    repaintQueue.push(() => {
      ctx.clearRect(0, 0, w, h); draw(ctx, w, h);
      if (opts.onPaint) opts.onPaint(c);      // keep derived maps in step with the repaint
      t.needsUpdate = true;
    });
    if (!pbrHooked) {
      pbrHooked = true;
      onPBRReady(() => { for (const fn of repaintQueue) fn(); repaintQueue.length = 0; });
    }
  }
  return t;
}

/* Lay a photographic base coat, tinted to the district's colour, and fall back
   to the flat fill until the image is decoded. Multiply keeps the photo's grain
   and mortar shadows while the district still drives the hue, so a red-brick
   block and a sandstone block share one image without looking like the same
   wall painted twice. */
const patCache = {};
/* the photo pre-scaled to one tile, so a facade gets brick at brick size rather
   than one brick stretched across three storeys */
function tilePattern(g, img, setName, tw, th) {
  const key = `${setName}|${tw}x${th}`;
  if (!patCache[key]) {
    const oc = document.createElement('canvas'); oc.width = tw; oc.height = th;
    oc.getContext('2d').drawImage(img, 0, 0, tw, th);
    patCache[key] = oc;
  }
  return g.createPattern(patCache[key], 'repeat');
}

/* Lay a photographic base coat under the painted detail.
   `tiles` is how many times the photo repeats across the canvas — get this
   wrong and a 20 cm brick renders two metres tall, which reads as camouflage
   rather than masonry.
   Blend defaults to OVERLAY, not multiply: overlay contributes the photo's
   light-and-shade (mortar lines, chips, grain) while leaving the district's
   own colour driving the hue. Multiply looked right on the pale paving stone
   and turned every brick block into dark blotches, because the district
   colours are already dark and multiplying two dark values compounds. */
function paintBase(g, w, h, color, setName, opts = {}) {
  const hex = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
  g.fillStyle = hex; g.fillRect(0, 0, w, h);

  const img = baseImage(setName);
  if (!img) return false;

  const [tx, ty] = opts.tiles || [1, 1];
  g.save();
  g.globalCompositeOperation = opts.mode || 'overlay';
  g.globalAlpha = opts.alpha ?? 0.8;
  if (tx === 1 && ty === 1) g.drawImage(img, 0, 0, w, h);
  else {
    g.fillStyle = tilePattern(g, img, setName, Math.max(8, Math.round(w / tx)), Math.max(8, Math.round(h / ty)));
    g.fillRect(0, 0, w, h);
  }
  g.restore();
  return true;
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
  if (!texCache[key]) texCache[key] = tex(256, 512, (g, w, h) => {
    // gentle: the road is the darkest surface on screen and the district's own
    // near-black is doing the work — the photo is here for grain, not colour
    const photo = paintBase(g, w, h, color, 'asphalt', { tiles: [2, 4], alpha: 0.5 });
    // the hand-drawn grain is what SOLD asphalt before; with a real photo under
    // it, keep only a whisper or the surface turns to static
    noise(g, w, h, photo ? 180 : 650, photo ? 0.06 : 0.13, false);
    noise(g, w, h, photo ? 70 : 220, 0.06, true);
    const s = w / 128;                       // markings were authored at 128px wide
    g.fillStyle = '#c8a23c'; g.fillRect(2 * s, 0, 3 * s, h); g.fillRect(w - 5 * s, 0, 3 * s, h);
    g.fillStyle = '#d8d8dc';
    const x1 = Math.round(w * (-1.1 / ROAD_W + 0.5)), x2 = Math.round(w * (1.1 / ROAD_W + 0.5));
    g.fillRect(x1 - 2 * s, 40 * s, 4 * s, 184 * s); g.fillRect(x2 - 2 * s, 40 * s, 4 * s, 184 * s);
  }, { repeat: true, base: 'asphalt' });
  return markShared(texCache[key]);
}
function interTex(color) {
  const key = 'inter' + color;
  if (!texCache[key]) texCache[key] = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h);
    noise(g, w, h, 800, 0.13, false);
    g.fillStyle = '#e2e2e6';
    for (let i = 0; i < 8; i++) { const p = 18 + i * 28; g.fillRect(p, 4, 16, 34); g.fillRect(p, h - 38, 16, 34); g.fillRect(4, p, 34, 16); g.fillRect(w - 38, p, 34, 16); }
  });
  return markShared(texCache[key]);
}
function sideTex(color, chalk) {
  const key = 'side' + color + (chalk ? 'c' : '');
  if (!texCache[key]) texCache[key] = tex(256, 256, (g, w, h) => {
    // paving stone is pale enough that multiply reads correctly here, and it
    // keeps the stones' own colour variation rather than flattening it
    const photo = paintBase(g, w, h, color, 'sidewalk', { mode: 'multiply', alpha: 0.85 });
    noise(g, w, h, photo ? 110 : 380, photo ? 0.05 : 0.1, false);
    noise(g, w, h, photo ? 40 : 140, 0.07, true);
    // the slab seams are a distance cue for how fast you are moving — keep them
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 6;
    g.strokeRect(0, 0, w, h / 2); g.strokeRect(0, h / 2, w, h / 2);
  }, { repeat: true, base: 'sidewalk' });
  return markShared(texCache[key]);
}

const buildingTexCache = {};
export function buildingTexes(dname) {
  if (buildingTexCache[dname]) return buildingTexCache[dname];
  const d = DISTRICTS[dname];
  const arr = [];
  for (let i = 0; i < 8; i++) arr.push(makeBuildingTex(d));
  arr.forEach(markShared);
  buildingTexCache[dname] = arr;
  return arr;
}
/* Relief derived from the facade's OWN finished canvas rather than from a tiled
   photo. A shared brick normal map cannot know where the windows are, so it
   embossed masonry across the glass and every pane came out looking like split
   rock. Deriving from the composite means the brick gets its relief, the
   painted glass and signage stay flat, and the scale matches by construction.
   Grayscale height + bumpMap, so three.js differentiates it in the shader and
   we never have to author tangent-space normals here. */
function makeBumpTarget(w, h) {
  const bc = document.createElement('canvas'); bc.width = w; bc.height = h;
  const bctx = bc.getContext('2d');
  const t = new THREE.CanvasTexture(bc);
  t.colorSpace = THREE.NoColorSpace;         // height data, not colour
  t.anisotropy = 4;
  return {
    texture: t,
    refresh(src) {
      bctx.clearRect(0, 0, w, h);
      bctx.filter = 'grayscale(1) contrast(1.35)';
      bctx.drawImage(src, 0, 0, w, h);     // scales: the bump target is half-res
      bctx.filter = 'none';
      t.needsUpdate = true;
    },
  };
}

function makeBuildingTex(d) {
  const brick = pick(d.brickset), store = Math.random() < (d.decor.glass ? 0.3 : 0.55);
  const glass = d.decor.glass && Math.random() < 0.55;

  /* Every random decision is rolled HERE, once, into a layout the draw call
     merely reads. Two consumers depend on that: the repaint pass (the brick
     photo lands after first paint, and rolling inside draw() would teleport
     every window on repaint) and addFacadeRelief, which builds real sills,
     awnings and AC boxes that must land exactly where the paint says. */
  const layout = { glass, store, brick };
  if (glass) {
    layout.panes = [];
    for (let y = 8; y < 384 - 60; y += 34) for (let x = 10; x < 256 - 20; x += 30)
      layout.panes.push({ x, y, lit: Math.random() < d.windowLit, cool: Math.random() < 0.5 });
  } else {
    const cols = irand(3, 4), gY = 384 - 86;
    layout.cols = cols; layout.gY = gY; layout.windows = [];
    for (let f = 0; f < 4; f++) {
      const wy = 26 + f * ((gY - 40) / 4);
      for (let c = 0; c < cols; c++) {
        const wx = 24 + c * ((256 - 48) / (cols - 1 || 1)) - 14;
        layout.windows.push({ x: wx, y: wy, lit: Math.random() < d.windowLit,
          plant: Math.random() < 0.25, ac: Math.random() < 0.15 });
      }
    }
    if (store) {
      layout.storeCol = pick(['#c0392b', '#1f8a4c', '#c07820', '#28648f', '#8e44ad', '#c94f7c']);
      layout.sign = pick(d.signs);
      layout.blade = Math.random() < 0.55;
      layout.bladeU = pick([0.16, 0.84]);
    }
  }

  // half the colour map's resolution: relief is low-frequency, and at full size
  // this doubled the per-district facade texture budget for no visible gain
  const bump = makeBumpTarget(128, 192);
  const t = tex(256, 384, (g, w, h) => {
    if (glass) { // downtown glass tower face
      g.fillStyle = brick; g.fillRect(0, 0, w, h);
      for (const p of layout.panes) {
        g.fillStyle = p.lit ? '#ffe9b0' : (p.cool ? '#a8c4de' : '#8fb0d0');
        g.fillRect(p.x, p.y, 24, 28);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(p.x, p.y, 24, 6);
      }
      g.fillStyle = '#2c3038'; g.fillRect(0, h - 58, w, 58);
      g.fillStyle = '#cfe3f0'; g.fillRect(14, h - 50, w - 28, 40);
      g.fillStyle = 'rgba(0,0,0,.3)'; for (let x = 14; x < w - 28; x += 22) g.fillRect(x, h - 50, 4, 40);
      return;
    }
    // ~7 x 9 puts a brick course at roughly its real size on a 12 m frontage
    const photo = paintBase(g, w, h, brick, 'brick', { tiles: [7, 9], alpha: 0.9 });
    if (!photo) {
      // fallback course lines, only while the photo has yet to decode — drawing
      // these OVER real brick would give every wall two conflicting bonds
      g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
      for (let y = 0; y < h; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 * 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 10); g.stroke(); }
    }
    noise(g, w, h, photo ? 120 : 420, photo ? 0.05 : 0.09, false);
    for (const wn of layout.windows) {
      const wx = wn.x, wy = wn.y;
      g.fillStyle = wn.lit ? '#ffe9b0' : '#cfe0ee';
      g.fillRect(wx, wy, 28, 40);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(wx, wy, 28, 10);
      g.strokeStyle = '#3a3026'; g.lineWidth = 3; g.strokeRect(wx, wy, 28, 40);
      if (wn.plant) { g.fillStyle = '#3f7a3a'; g.fillRect(wx + 2, wy + 34, 24, 8); // window plants
        g.fillStyle = '#5aa050'; for (let p = 0; p < 4; p++) g.fillRect(wx + 3 + p * 6, wy + 28, 3, 7); }
      if (wn.ac) { g.fillStyle = '#8b8f99'; g.fillRect(wx + 4, wy + 30, 20, 12); }
    }
    const gY = layout.gY;
    if (store) {
      const col = layout.storeCol;
      g.fillStyle = '#241c18'; g.fillRect(8, gY, w - 16, h - gY - 6);
      g.fillStyle = '#ffedb8'; g.fillRect(20, gY + 26, w - 40, 44);
      g.fillStyle = 'rgba(0,0,0,.3)'; for (let x = 20; x < w - 40; x += 16) g.fillRect(x, gY + 26, 4, 44);
      g.fillStyle = col; g.fillRect(8, gY, w - 16, 22);
      g.fillStyle = '#fff'; g.font = 'bold 17px Arial'; g.textAlign = 'center'; g.fillText(layout.sign, w / 2, gY + 17);
      for (let x = 8; x < w - 8; x += 20) { g.fillStyle = (x / 20) % 2 < 1 ? col : '#f4ead8'; g.fillRect(x, gY - 8, 20, 10); }
    } else {
      g.fillStyle = '#2a2018'; g.fillRect(w / 2 - 22, h - 70, 44, 64);
      g.fillStyle = '#4a3a2c'; g.fillRect(w / 2 - 18, h - 66, 36, 44);
      g.fillStyle = '#8a8a90'; g.fillRect(12, h - 14, w - 24, 8);
    }
  }, { base: 'brick', onPaint: c => bump.refresh(c) });
  t.userData.bump = bump.texture;
  t.userData.layout = layout;
  markShared(bump.texture);        // lives as long as its colour map does
  return t;
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
  return markShared(texCache[key]);
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
  return markShared(texCache[key]);
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
  return markShared(texCache.chalk);
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
  return markShared(texCache[key]);
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
  return markShared(texCache[key]);
}
const chainTex = () => {
  if (!texCache.chain) texCache.chain = tex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(190,195,205,.9)'; g.lineWidth = 2;
    for (let i = -1; i < 5; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 64, 64); g.stroke();
      g.beginPath(); g.moveTo(i * 16 + 64, 0); g.lineTo(i * 16, 64); g.stroke(); }
  }, { repeat: true });
  return markShared(texCache.chain);
};
function stripeTex(c1, c2) {
  const key = 'str' + c1 + c2;
  if (!texCache[key]) texCache[key] = tex(64, 16, (g) => {
    for (let x = 0; x < 64; x += 16) { g.fillStyle = (x / 16) % 2 ? c1 : c2; g.fillRect(x, 0, 16, 16); }
  }, { repeat: true });
  return markShared(texCache[key]);
}

/* ---------------- shared geometry & materials ---------------- */
export const BOX = markShared(new THREE.BoxGeometry(1, 1, 1));
const matCache = {};
export function cmat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  // painted/plastic-ish default: mostly rough with a hint of sheen, so the
  // environment map reads on curved props without turning the city into chrome
  if (!matCache[key]) matCache[key] = markShared(new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06, ...opts }));
  return matCache[key];
}
export function box(w, h, d, color, x = 0, y = 0, z = 0, m) {
  const b = new THREE.Mesh(BOX, m || cmat(color)); b.scale.set(w, h, d); b.position.set(x, y, z); return b;
}
/* Flat-tint materials that additionally carry a photo grain profile — building
   flanks, roofs, alley walls. Separate cache from cmat on purpose: cmat serves
   hundreds of small props where a brick normal map would be nonsense. */
const grainMatCache = {};
export function grainMat(color, profileKey) {
  const key = color + '|' + profileKey;
  if (!grainMatCache[key]) grainMatCache[key] = markShared(new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.02, ...(pbrProfile(profileKey) || {}),
  }));
  return grainMatCache[key];
}
/* Soft AO disc instead of a hard black circle: the falloff is what makes a
   character read as STANDING on the ground rather than wearing a sticker.
   Texture is black with the falloff in ALPHA, so drive material.opacity —
   tinting a black texture multiplies to black and does nothing. */
const shadowTex = markShared((() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,.6)'); grad.addColorStop(0.55, 'rgba(0,0,0,.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})());
const shadowGeo = markShared(new THREE.PlaneGeometry(1.6, 1.6));
const shadowMat = markShared(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
export function blobShadow(scale = 1) {
  const s = new THREE.Mesh(shadowGeo, shadowMat); s.rotation.x = -Math.PI / 2; s.position.y = 0.032; s.scale.setScalar(scale); return s;
}
/* Resources that live for the whole session and must NEVER be disposed when a
   segment is pruned: the unit box, cached materials, cached textures. Anything
   not marked is assumed unique to the segment that owns it. */
export function markShared(x) { if (x) x.__shared = true; return x; }

/* Free everything a pruned block owns. This used to dispose only geometries
   carrying an explicit ownGeo flag, and never touched materials or textures at
   all — so every per-prop geometry (tree canopies, hydrants, wheels) and every
   per-segment texture CLONE (road, both sidewalks, alley brick) leaked. Over a
   long run geometry counts climbed without plateauing. */
export function disposeGroup(g) {
  g.traverse(o => {
    if (!o.isMesh && !o.isSprite) return;
    if (o.geometry && !o.geometry.__shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.__shared) continue;
      for (const slot of ['map', 'alphaMap', 'emissiveMap', 'bumpMap']) {
        const t = m[slot];
        if (t && !t.__shared) t.dispose();
      }
      m.dispose();
    }
  });
}

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
/* corner signal: pole + arm reaching over the kerb, head facing the runner.
   The light is ALWAYS green in his direction — Jay has never once stopped. */
function mkTrafficLight(dir = -1) {
  // dir: which local-x way the arm reaches (toward the road); the lamp face
  // always looks +z at the oncoming runner, so no yaw is ever needed
  const g = new THREE.Group();
  g.add(box(0.14, 5.4, 0.14, 0x2c3036, 0, 2.7, 0));
  g.add(box(2.6, 0.12, 0.12, 0x2c3036, dir * 1.25, 5.3, 0));
  const head = new THREE.Group(); head.position.set(dir * 2.45, 4.85, 0);
  head.add(box(0.34, 0.95, 0.3, 0x22262c, 0, 0, 0));
  const lamp = (col, y, lit) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10),
      new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(0, y, 0.16); if (!lit) m.material.color.multiplyScalar(0.22);
    head.add(m);
  };
  lamp(0xff4444, 0.3, false); lamp(0xffc23c, 0, false); lamp(0x51ff6a, -0.3, true);
  g.add(head);
  return g;
}
/* utility pole with a crossarm; wires are strung by the caller, span-aware */
function addUtilityPole(B, x, z) {
  const wood = 0x5c4a38, dk = 0x3a3026;
  B.box(0.2, 7.4, 0.2, x, 3.7, z, wood);
  B.box(1.5, 0.14, 0.14, x, 6.9, z, dk);
  B.box(0.06, 0.14, 0.06, x - 0.55, 7.03, z, 0x8a8f96);   // insulators
  B.box(0.06, 0.14, 0.06, x, 7.03, z, 0x8a8f96);
  B.box(0.06, 0.14, 0.06, x + 0.55, 7.03, z, 0x8a8f96);
}
/* one sagging wire between two poles as four tilted thin boxes on a parabola */
function addWireSpan(B, x, y, z0, z1) {
  const n = 4, sag = 0.55, col = 0x1c1f24;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
    const ya = y - sag * Math.sin(Math.PI * t0), yb = y - sag * Math.sin(Math.PI * t1);
    const len = Math.hypot(zb - za, yb - ya);
    // box +z after rx θ points to (0, -sinθ, cosθ), so θ = atan2(-dy, dz)
    B.box(0.035, 0.035, len, x, (ya + yb) / 2, (za + zb) / 2, col, { rx: Math.atan2(-(yb - ya), zb - za) });
  }
}
/* city pigeon, modelled facing +z like every other creature here */
function mkPigeon() {
  const g = new THREE.Group();
  const grey = cmat(0x8f939c), dk = cmat(0x5c6068);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), grey);
  body.scale.set(0.9, 0.8, 1.25); body.position.y = 0.12; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dk);
  head.position.set(0, 0.24, 0.09); g.add(head);
  g.add(box(0.025, 0.02, 0.05, 0xe0a03c, 0, 0.235, 0.15));            // beak
  const tail = box(0.09, 0.02, 0.12, 0x6c7078, 0, 0.14, -0.16);
  tail.rotation.x = -0.5; g.add(tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = box(0.16, 0.015, 0.14, 0x7c8088, s * 0.1, 0.16, -0.01);
    w.rotation.z = s * 0.15; g.add(w); wings.push(w);
  }
  g.userData = { head, wings };
  return g;
}
/* steam grate: dark grill in the gutter + three rising wisps */
let wispTex = null;
function mkSteamGrate() {
  if (!wispTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g2 = c.getContext('2d');
    const grad = g2.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 32, 32);
    wispTex = markShared(new THREE.CanvasTexture(c));
  }
  const g = new THREE.Group();
  const grate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({
    map: markShared(texCache.grate || (texCache.grate = tex(32, 22, (gg, w, h) => {
      gg.fillStyle = '#26282e'; gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#101216'; for (let x = 3; x < w; x += 5) gg.fillRect(x, 2, 2, h - 4);
    }))), roughness: 0.9 }));
  grate.rotation.x = -Math.PI / 2; grate.position.y = 0.02; g.add(grate);
  const wisps = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: wispTex, transparent: true, opacity: 0, depthWrite: false }));
    m.scale.setScalar(0.7); m.position.y = 0.3; g.add(m);
    wisps.push({ m, t: i / 3 });                 // staggered phases
  }
  g.userData.wisps = wisps;
  return g;
}
function mkMailbox() {
  const g = new THREE.Group(), blue = cmat(0x2a4a8e);
  g.add(box(0.5, 0.5, 0.4, 0x2a4a8e, 0, 0.62, 0));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10, 1, false, 0, Math.PI), blue);
  top.rotation.z = Math.PI / 2; top.position.y = 0.87; g.add(top);
  g.add(box(0.34, 0.05, 0.02, 0x1a2f5e, 0, 0.78, 0.21));              // slot
  g.add(box(0.4, 0.38, 0.3, 0x233c74, 0, 0.19, 0));                   // pedestal
  return g;
}
function mkTrashBags() {
  const g = new THREE.Group(), bag = cmat(0x2c2e34, { roughness: 0.45 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.22, 0.3), 8, 6), bag);
    b.scale.y = 0.85; b.position.set(rand(-0.35, 0.35), 0.2, rand(-0.3, 0.3));
    g.add(b);
    g.add(box(0.08, 0.1, 0.08, 0x44464c, b.position.x, 0.44, b.position.z)); // tied knot
  }
  return g;
}
function mkNewsBox() {
  const g = new THREE.Group();
  const col = pick([0xd23c3c, 0x2a6a8e, 0xd0aa2a]);
  g.add(box(0.44, 0.6, 0.4, col, 0, 0.56, 0));
  g.add(box(0.34, 0.3, 0.02, 0xdce4ea, 0, 0.64, 0.21));               // window
  g.add(box(0.44, 0.08, 0.4, new THREE.Color(col).multiplyScalar(0.7).getHex(), 0, 0.9, 0));
  for (const s of [-1, 1]) g.add(box(0.06, 0.26, 0.06, 0x3a3e44, s * 0.16, 0.13, 0));
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
  const aw = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ map: stripeTex(pick(['#c0392b', '#1f8a4c', '#28648f']), '#f4ead8') }));
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
function mkLanternString(span) {   // paper lanterns strung across the night market
  const g = new THREE.Group();
  const cols = [0xff4f4f, 0xff9a3c, 0xffd23c, 0xff6ab0];
  g.add(box(span, 0.04, 0.04, 0x2a2430, 0, 0, 0));
  const n = Math.max(4, Math.round(span / 1.6));
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + (i + 0.5) * (span / n);
    const sag = -Math.sin((i + 0.5) / n * Math.PI) * 0.5;
    const col = cols[i % cols.length];
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: col }));
    lan.scale.set(1, 0.82, 1); lan.position.set(x, sag - 0.36, 0); g.add(lan);
    g.add(box(0.1, 0.1, 0.1, 0x3a2a20, x, sag - 0.62, 0));
  }
  return g;
}
function mkNeonSign() {
  const words = ['NOODLES', 'OPEN', '24H', 'RAMEN', 'BAO', 'TEA', 'GRILL'];
  const cols = ['#ff4f9a', '#3be8ff', '#7bff5e', '#ffd23c'];
  const col = pick(cols);
  const t = tex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(10,6,20,.85)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
    g.shadowColor = col; g.shadowBlur = 14;
    g.fillStyle = col; g.font = 'bold 26px Arial'; g.textAlign = 'center';
    g.fillText(pick(words), w / 2, h / 2 + 9);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  return m;
}
/* Fixed outfit combos, NOT a free cross-product: every combo bakes a coloured
   geometry variant in rig.js's cache, so the pool must stay small. Eight reads
   as a crowd; a hundred and eighty would quietly hold 40MB of buffers. */
const NEIGHBOR_FITS = [
  { skin: 0x8d5a3b, top: 0x3bd6c6, pants: 0x2a2e36, shoes: 0xf0f0f0 },
  { skin: 0x6b4226, top: 0xe8604c, pants: 0x3a4250, shoes: 0x2a2e36 },
  { skin: 0xc79a6b, top: 0xe0a020, pants: 0x5a4a3a, shoes: 0xd23c3c },
  { skin: 0xa06a44, top: 0x8e44ad, pants: 0x2a2e36, shoes: 0xf0f0f0 },
  { skin: 0x8d5a3b, top: 0x2a5f9e, pants: 0x3a4250, shoes: 0xf0f0f0 },
  { skin: 0x6b4226, top: 0x1f8a4c, pants: 0x2a2e36, shoes: 0x2a2e36 },
  { skin: 0xc79a6b, top: 0xc94f7c, pants: 0x5a4a3a, shoes: 0xf0f0f0 },
  { skin: 0xa06a44, top: 0xf0e6d8, pants: 0x2a2e36, shoes: 0xd23c3c },
];
function mkNeighbor() { // sidewalk person; animation is driven by the view
  if (rigReady()) {
    const r = createRigged(pick(NEIGHBOR_FITS));
    const g = r.group;
    const working = Math.random() < 0.35;      // kneeling, busy with something
    play(r, working ? 'Working' : 'Idle');
    r._cur.time = rand(0, 2);                  // desync the loop phases
    r.mixer.update(0);
    g.userData.rig = r;
    // the raised arm reads as POINTING at the fleeing robber ("there he goes!")
    // — a happier fit for the fiction than the wave it started as
    g.userData.wave = !working && Math.random() < 0.5;
    g.add(blobShadow(0.7));
    return g;
  }
  const built = buildHumanoid({
    skin: pick([0x8d5a3b, 0x6b4226, 0xc79a6b, 0xa06a44]),
    outfit: pick([0x3bd6c6, 0xe8604c, 0xe0a020, 0x8e44ad, 0x2a5f9e]),
    pants: pick([0x2a2e36, 0x3a4250, 0x5a4a3a]),
    shoes: pick([0xf0f0f0, 0x2a2e36, 0xd23c3c]),
    build: 'civilian',
  });
  const g = built.group;
  built.parts.armR.rotation.z = -0.5;         // one arm raised, ready to wave
  g.userData.anim = built.parts.armR;
  g.userData.parts = built.parts;
  g.add(blobShadow(0.7));
  return g;
}
/* squad car — black-and-white with a strobing light bar. userData.lights is
   picked up by animateSegments so the bar flashes red/blue. */
export function mkPoliceCar() {
  const g = new THREE.Group();
  const white = 0xe8ecf2, navy = 0x1e2a4a;
  g.add(box(1.85, 0.52, 4.3, white, 0, 0.52, 0));                 // body
  g.add(box(1.87, 0.42, 1.5, navy, 0, 0.5, 0.35));                // door panel
  g.add(box(1.62, 0.46, 2.1, white, 0, 0.96, -0.15));             // cabin
  g.add(box(1.64, 0.34, 1.9, 0x1a2634, 0, 0.99, -0.15, cmat(0x1a2634)));
  const wm = cmat(0x14141a);
  for (const [x, z] of [[-0.87, 1.4], [0.87, 1.4], [-0.87, -1.4], [0.87, -1.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), wm);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.31, z); g.add(w);
  }
  // light bar
  g.add(box(1.2, 0.1, 0.28, 0x2a2e36, 0, 1.24, -0.15));
  const red = box(0.5, 0.18, 0.3, 0, -0.3, 1.33, -0.15, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  const blue = box(0.5, 0.18, 0.3, 0, 0.3, 1.33, -0.15, new THREE.MeshBasicMaterial({ color: 0x3a6aff }));
  g.add(red); g.add(blue);
  g.userData.lights = { red, blue };
  // livery + headlights
  g.add(box(0.9, 0.22, 0.02, 0x2a3a6e, 0, 0.62, 2.16));
  for (const s of [-1, 1]) g.add(box(0.3, 0.1, 0.1, 0, s * 0.6, 0.6, 2.17, new THREE.MeshBasicMaterial({ color: 0xffeec0 })));
  return g;
}

/* patrol officer — cartoon beat cop, strictly nonviolent chaser */
export function mkOfficer() {
  if (rigReady()) {
    // rigged like the chase squad, so the bank-scene cops match them
    const r = createRigged({ skin: pick([0x9a6a4a, 0x7a4a2f, 0xb98a63]), top: 0x1a2440, pants: 0x161c2c, shoes: 0x22252c });
    const capG = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2a3a6e, roughness: 0.8 }));
    dome.scale.set(0.145, 0.085, 0.155); dome.position.y = 0.03; capG.add(dome);
    capG.add(box(0.22, 0.025, 0.13, 0x1c2947, 0, 0.015, 0.15));
    capG.add(box(0.05, 0.05, 0.012, 0xffd23c, 0, 0.02, 0.145));
    attachToBone(r, 'Head', capG, new THREE.Vector3(0, 0.24, 0));
    const g = r.group;
    play(r, 'Idle');
    r._cur.time = rand(0, 2);
    r.mixer.update(0);
    g.userData.rig = r;
    g.add(blobShadow(1.0));
    return g;
  }
  const built = buildHumanoid({
    skin: pick([0x8d5a3b, 0x6b4226, 0xc79a6b, 0xa06a44]),
    outfit: 0x2a3a6e, pants: 0x1c2440, shoes: 0x14141a,
    accent: 0x2a3a6e, build: 'officer',
  });
  const g = built.group;
  // the chase view drives these by name, so keep the old userData contract
  Object.assign(g.userData, built.parts);
  g.add(blobShadow(1.0));
  return g;
}

/* City Trust Bank — an open-fronted LOBBY, not a slab. The run opens with the
   chase camera behind Jay inside this room, so it has to be hollow: doors
   already open, walls and ceiling around him, and enough depth that the camera
   (~7 behind him) is still indoors. Local z 0 is the doorway plane; +z is
   deeper inside. */
export const BANK_DOOR_W = 7, BANK_DEPTH = 20;
export function mkBankFacade() {
  const g = new THREE.Group();
  const stone = 0xb8ad98, inner = 0x9d9482, trim = 0xd0c6b0;
  const W = 26, H = 13, D = BANK_DEPTH, halfDoor = BANK_DOOR_W / 2;

  /* ---- front wall, split around an already-open doorway ---- */
  const jamb = (W - BANK_DOOR_W) / 2;
  for (const s of [-1, 1]) g.add(box(jamb, H, 1.2, stone, s * (halfDoor + jamb / 2), H / 2, 0));
  g.add(box(BANK_DOOR_W, H - 7, 1.2, stone, 0, 7 + (H - 7) / 2, 0));            // lintel
  for (const s of [-1, 1]) {                                                    // open glass door leaves
    const leaf = box(0.16, 6.6, 2.6, 0x4a6a70, s * (halfDoor - 0.1), 3.3, 1.4);
    leaf.rotation.y = s * 0.42; g.add(leaf);
  }

  /* ---- the lobby itself ---- */
  g.add(box(W, 0.2, D, 0x8a8272, 0, 0.02, D / 2));                              // floor
  g.add(box(W, 0.6, D, inner, 0, H, D / 2));                                    // ceiling
  for (const s of [-1, 1]) g.add(box(1.0, H, D, inner, s * (W / 2 - 0.5), H / 2, D / 2));
  g.add(box(W, H, 1.0, inner, 0, H / 2, D));                                    // back wall
  // vault door on the back wall — the reason he's in a hurry
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.6, 20), cmat(0x6a7079));
  vault.rotation.x = Math.PI / 2; vault.position.set(0, 4.2, D - 0.8); g.add(vault);
  g.add(box(1.0, 1.0, 0.7, 0x9aa2ab, 0, 4.2, D - 1.1));
  for (const s of [-1, 1]) g.add(box(5.5, 1.2, 1.6, trim, s * 7, 1.4, D * 0.45)); // teller counters
  for (let i = 0; i < 4; i++)                                                   // ceiling lights
    g.add(box(3.2, 0.16, 0.7, 0, 0, H - 0.5, 3 + i * 4.5, new THREE.MeshBasicMaterial({ color: 0xfff3d0 })));

  /* ---- street side: columns, sign, steps, spilled cash ---- */
  // flanking only — a column in the middle would sit dead-centre in the doorway
  // and block the view straight down the street during the opening
  for (const x of [-10.5, -6.2, 6.2, 10.5]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 8.4, 10), cmat(trim));
    col.position.set(x, 4.2, -1.6); g.add(col);
  }
  g.add(box(24, 2.6, 1.2, trim, 0, 9.6, -1.4));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), new THREE.MeshBasicMaterial({
    map: tex(384, 52, (g2, w, h) => {
      g2.fillStyle = '#4a4032'; g2.fillRect(0, 0, w, h);
      g2.fillStyle = '#ffd23c'; g2.font = 'bold 34px Georgia'; g2.textAlign = 'center';
      g2.fillText('CITY TRUST BANK', w / 2, 38);
    }) }));
  sign.position.set(0, 9.6, -2.05); sign.rotation.y = Math.PI; g.add(sign);
  const lamp = box(0.4, 0.4, 0.4, 0, -9, 10.8, -1.6, new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  lamp.userData.alarmLamp = true; g.add(lamp);
  for (let i = 0; i < 9; i++) {                                                 // spilled bills
    const bill = box(0.5, 0.02, 0.26, 0x7ac47a, rand(-5, 5), 0.1, rand(-5.4, 3));
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
      const bar = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ map: stripeTex('#e07020', '#f0f0f0') }));
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
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.5, 8), new THREE.MeshStandardMaterial({ map: stripeTex('#c0392b', '#f4ead8') }));
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
      const b = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ map: stripeTex('#e07020', '#f0f0f0') }));
      b.scale.set(ROAD_W - 0.6, 0.3, 0.06); b.position.set(0, 1.2, 0.8); g.add(b);
      return g; }
    case 'awning': { const g = new THREE.Group();
      const aw = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ map: stripeTex('#c0392b', '#f4ead8') }));
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
      const bar = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ map: stripeTex('#e0c020', '#2a2e36') }));
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
        new THREE.MeshStandardMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.75 }));
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
/* a banded stack of bills — Jay is carrying a bank score, not loose change */
let _billTex = null;
function billTex() {
  if (_billTex) return _billTex;
  _billTex = tex(64, 32, (g, w, h) => {
    g.fillStyle = '#5fa86a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3f7d4c'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#dff3e2'; g.beginPath(); g.arc(w / 2, h / 2, 7, 0, 7); g.fill();
    g.fillStyle = '#3f7d4c'; g.font = 'bold 11px Georgia'; g.textAlign = 'center';
    g.fillText('$', w / 2, h / 2 + 4);
  });
  return markShared(_billTex);
}
export function mkCash() {
  const g = new THREE.Group();
  const billMat = new THREE.MeshStandardMaterial({ map: billTex() });
  const edgeMat = cmat(0xcfe8d2);
  // four bills fanned very slightly so the stack reads at speed
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(BOX, i === 3 ? billMat : edgeMat);
    b.scale.set(0.62, 0.05, 0.34);
    b.position.set(0, -0.06 + i * 0.05, 0);
    b.rotation.y = (i - 1.5) * 0.05;
    g.add(b);
  }
  // paper band across the middle
  g.add(box(0.16, 0.23, 0.36, 0xe8604c, 0, 0, 0));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12),
    new THREE.MeshBasicMaterial({ color: 0x7fe89a, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.34; g.add(glow);
  return g;
}
export const mkCoin = mkCash;      // pickup call sites still say "coin"
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
  else if (kind === 'shield') { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshStandardMaterial({ color: 0x7bff5e, transparent: true, opacity: 0.5 })); g.add(sh);
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
    // wet: material.roughness MULTIPLIES the ORM's roughness channel, so the
    // sheen keeps the asphalt's own variation instead of going uniform mirror
    const wet = d.wet || 0;
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
      map: rt, roughness: wet ? (1 - wet * 0.62) : 0.95,
      envMapIntensity: 1 + wet * 1.1, ...(pbrProfile('road') || {}),
    }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -L / 2); road.userData.ownGeo = true;
    g.add(road);

    // bus lane paint (downtown)
    if (d.decor?.buslane && !seg.alley) {
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.3, L - 12), new THREE.MeshBasicMaterial({ color: 0x8a3030, transparent: true, opacity: 0.35 }));
      bl.rotation.x = -Math.PI / 2; bl.position.set(LANE_W, 0.015, -L / 2); bl.userData.ownGeo = true; g.add(bl);
    }

    // intersection patch at exit
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_W), new THREE.MeshStandardMaterial({ map: interTex(d.road) }));
    patch.rotation.x = -Math.PI / 2; patch.position.set(0, 0.012, -L); patch.userData.ownGeo = true;
    g.add(patch);
    if (opts.first) {
      const p0 = patch.clone(); p0.position.set(0, 0.012, 0); g.add(p0);
      // doorway plane just behind the start line; the lobby runs back from there
      const bank = mkBankFacade(); bank.position.set(0, 0, 8); g.add(bank);

      /* Response outside the bank. Everything stays clear of |x| < 5 because the
         runner's path down the middle (and the three lanes) must never be
         blocked — this is set dressing for the opening, not an obstacle. */
      const lights = [];
      // all z < 7 — the lobby front wall sits at z 7.4..8.6, so anything deeper
      // than that would be parked INSIDE the bank
      // Two flanking the doors, two pulled up kerbside down the street so he
      // sprints past them. Negative z is forward along the run.
      const squads = [
        { x: -7.0, z: 2.4, r: 0.42 }, { x: 7.2, z: 4.6, r: -0.5 },
        { x: -6.1, z: -7, r: 0.34 }, { x: 6.2, z: -16, r: -0.3 },
      ];
      for (const s of squads) {
        const car = mkPoliceCar();
        car.position.set(s.x, 0, s.z); car.rotation.y = s.r;
        g.add(car);
        if (car.userData.lights) lights.push(car.userData.lights);
      }
      // officers taking cover behind the cars, facing the doors
      // |x| >= 5.6 keeps every figure clear of the outer lane (lane centre 2.2
      // plus the runner's half width), so he never clips through one
      for (const o of [{ x: -5.7, z: 3.2 }, { x: 5.8, z: 5.6 }, { x: -5.7, z: -9.5 }, { x: 5.9, z: -13.5 }]) {
        const cop = mkOfficer();
        cop.position.set(o.x, 0, o.z);
        cop.rotation.y = Math.atan2(0 - o.x, 5 - o.z);          // turn toward the entrance
        if (cop.userData.rig) (g.userData.rigs = g.userData.rigs || []).push(cop.userData.rig);
        g.add(cop);
      }
      g.userData.policeLights = lights;
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
      /* The wall you run TOWARD on every turn used to be one featureless brown
         slab — the most-stared-at surface in the game. Now it's a row of three
         real facades with cornices, like the cross street it pretends to be. */
      const texes = buildingTexes(seg.district);
      const sideT = grainMat(new THREE.Color(d.brickset[0]).multiplyScalar(0.8).getHex(), 'sideWall');
      const roofT = grainMat(new THREE.Color(d.brickset[0]).multiplyScalar(0.6).getHex(), 'roof');
      const JB = makeBuilder();
      for (let bi = 0; bi < 3; bi++) {
        const bw = 10, bh = [13, 16, 12][bi], bx = (bi - 1) * 10;
        const ft = pick(texes);
        const fm = new THREE.MeshStandardMaterial({
          map: ft, roughness: 0.92, bumpMap: ft.userData.bump || null, bumpScale: 1.4 });
        const bld = new THREE.Mesh(BOX, [sideT, sideT, roofT, roofT, fm, sideT]);
        bld.scale.set(bw, bh, 10); bld.position.set(bx, bh / 2, -L - 9);
        g.add(bld);
        const trim = new THREE.Color(d.brickset[0]).lerp(new THREE.Color(0xffffff), 0.2).getHex();
        JB.box(bw + 0.6, 0.55, 10.5, bx, bh - 0.28, -L - 9, trim);         // cornice
        JB.box(bw + 0.2, 1.0, 10.2, bx, bh + 0.5, -L - 9, new THREE.Color(d.brickset[0]).multiplyScalar(0.72).getHex());
      }
      const jm = new THREE.Mesh(JB.build(), detailMaterial());
      jm.userData.ownGeo = true; g.add(jm);
    }
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map: arrowTexD(seg.exit, accent) }));
    arrow.position.set(0, 2.6, -L - 3.9); g.add(arrow);
    if (!isRoof) {
      const blockSide = seg.exit === 'L' ? 1 : -1;
      // corner block wears a facade toward the road instead of flat mustard
      const texes = buildingTexes(seg.district);
      const cf = pick(texes);
      const cfm = new THREE.MeshStandardMaterial({
        map: cf, roughness: 0.92, bumpMap: cf.userData.bump || null, bumpScale: 1.4 });
      const cside = grainMat(new THREE.Color(d.brickset[0]).multiplyScalar(0.78).getHex(), 'sideWall');
      const cb = new THREE.Mesh(BOX, [cside, cside, cside, cside, cfm, cside]);
      cb.scale.set(12, 12, 12);
      cb.position.set(blockSide * (HALF + SIDE_W + 6), 6, -L);
      cb.rotation.y = blockSide > 0 ? -Math.PI / 2 : Math.PI / 2;   // face the road
      g.add(cb);
    }
  } else if (isRoof) {
    // straight roof exit: nothing to draw, the deck just runs on
  } else {
    for (const s of [-1, 1]) {
      const stub = new THREE.Mesh(new THREE.PlaneGeometry(12, ROAD_W), new THREE.MeshStandardMaterial({ color: d.road }));
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
  /* Shadow flags for the whole block. Flat ground-hugging planes (road, paint,
     decals) only receive — letting them cast produces z-fighting acne on the
     surface they are lying on. Everything with height does both. */
  g.traverse(o => {
    if (!o.isMesh) return;
    const flat = o.geometry && o.geometry.type === 'PlaneGeometry';
    o.castShadow = !flat;
    o.receiveShadow = true;
  });
  scene.add(g);
  seg.group = g;
  return g;
}

/* Architectural detail for one building, accumulated into a shared builder so a
   whole block's cornices, ledges, parapets and roof clutter cost ONE draw call.
   Local axes here are segment space: x is across the street, z is along it. */
function addBuildingDetail(B, side, dpos, w, h, depth, d, layout) {
  const cx = side * (WALL_X + depth / 2);
  const cz = -(dpos + w / 2);
  const brick = new THREE.Color(d.brickset[0]);
  // only a little lighter than the brick: at 0.42 the bands read as bright
  // shelves bolted to the facade rather than stonework belonging to it
  const trim = brick.clone().lerp(new THREE.Color(0xffffff), 0.2).getHex();
  const trimDark = brick.clone().multiplyScalar(0.72).getHex();
  const deck = brick.clone().multiplyScalar(0.5).getHex();
  const metal = 0x9aa2ab, dark = 0x44484f, wood = 0x8a6a44;

  /* After the building's ±π/2 yaw the FRONTAGE (w) runs along world z and the
     depth along world x. The wraps below had them swapped, so any frontage
     wider than the 10-unit depth pushed its plinth/cornice up to 2.5 units
     into the street; narrower ones fell short of their own corners. */
  B.box(depth + 0.4, 1.0, w + 0.5, cx, 0.5, cz, trimDark);            // plinth
  if (layout && layout.windows) {
    // courses in the real gaps between painted window rows, not a blind 4.6
    // step that sliced straight through the glass
    for (let f = 0; f < 3; f++) {
      const y = h * (1 - (78.25 + 64.5 * f) / 384);
      if (y > 2.2 && y < h - 2.4) B.box(depth + 0.18, 0.2, w + 0.22, cx, y, cz, trim);
    }
  } else if (!layout || !layout.glass) {
    for (let y = 4.4; y < h - 2.4; y += 4.6)                           // string courses
      B.box(depth + 0.18, 0.2, w + 0.22, cx, y, cz, trim);
  }
  B.box(depth + 0.65, 0.6, w + 0.75, cx, h - 0.3, cz, trim);           // cornice

  // parapet as four thin walls, so roof clutter still reads behind it
  const pt = 0.32, py = h + 0.55;
  B.box(depth + 0.2, 1.1, pt, cx, py, cz + w / 2, trimDark);
  B.box(depth + 0.2, 1.1, pt, cx, py, cz - w / 2, trimDark);
  B.box(pt, 1.1, w + 0.2, cx + depth / 2, py, cz, trimDark);
  B.box(pt, 1.1, w + 0.2, cx - depth / 2, py, cz, trimDark);
  B.box(depth, 0.16, w, cx, h + 0.08, cz, deck);                       // roof deck

  // roof clutter — the thing that actually breaks up a flat skyline
  const rx = () => cx + (Math.random() - 0.5) * (depth - 3.2);
  const rz = () => cz + (Math.random() - 0.5) * (w - 3.2);
  if (Math.random() < 0.55) {                                          // water tower
    const tx = rx(), tz = rz();
    for (const [ox, oz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]])
      B.box(0.16, 1.8, 0.16, tx + ox, h + 1.0, tz + oz, dark);
    B.box(2.1, 2.3, 2.1, tx, h + 3.0, tz, wood);
    B.box(2.3, 0.2, 2.3, tx, h + 4.2, tz, trimDark);
    B.box(1.1, 0.7, 1.1, tx, h + 4.6, tz, wood);
  }
  const acs = 1 + Math.floor(Math.random() * 3);                       // AC / vent units
  for (let i = 0; i < acs; i++) {
    const ax = rx(), az = rz();
    B.box(1.5, 0.85, 1.3, ax, h + 0.55, az, metal);
    B.box(1.55, 0.12, 1.35, ax, h + 1.02, az, dark);
  }
  if (Math.random() < 0.5) B.box(1.6, 1.5, 1.5, rx(), h + 0.9, rz(), trimDark);  // roof access
  if (Math.random() < 0.45) {                                          // antenna mast
    const ax = rx(), az = rz();
    B.box(0.12, 3.4, 0.12, ax, h + 1.8, az, dark);
    B.box(1.1, 0.08, 0.08, ax, h + 3.1, az, dark);
    B.box(0.08, 0.08, 0.9, ax, h + 2.8, az, dark);
  }
}

/* Real geometry matched to the painted facade: a sill and lintel on every
   window, AC boxes and planters exactly where the paint put them, an awning
   and blade sign on storefronts, a door surround on walk-ups, mullion fins on
   glass towers. All of it lands in the block's ONE merged detail mesh, so a
   street of relief costs no extra draw calls.

   Mapping contract (change makeBuildingTex and this together or not at all):
   the facade canvas is 256x384 with flipY, so canvas y_c sits at world
   y = h*(1 - y_c/384); canvas u runs along the frontage in the direction of
   the face's local +x after the ±π/2 yaw, which is what zOf() encodes. */
function addFacadeRelief(B, layout, side, dpos, w, h) {
  if (!layout) return;
  const TH = 384, TW = 256;
  const yOf = yc => h * (1 - yc / TH);
  const zOf = u => side > 0 ? -(dpos + w * (1 - u)) : -(dpos + u * w);
  const xAt = (p, t) => side * (WALL_X - p + t / 2);   // protrude p from the face, box thickness t
  const zw = cw => cw / TW * w;                        // canvas width -> world width

  const brickC = new THREE.Color(layout.brick);
  const trim = brickC.clone().lerp(new THREE.Color(0xffffff), 0.32).getHex();
  const dark = brickC.clone().multiplyScalar(0.55).getHex();
  const metal = 0x9aa2ab, metalDark = 0x565b63;

  if (layout.glass) {
    // mullion fins in the pane gaps + a band per storey — the two cues that
    // turn a painted curtain wall into a curtain wall
    const finBot = yOf(TH - 58), finTop = h - 0.35;
    for (let x = 40; x < TW - 20; x += 30)
      B.box(0.34, finTop - finBot, 0.15, xAt(0.16, 0.34), (finBot + finTop) / 2, zOf((x - 3) / TW), dark);
    for (let k = 1; k < 10; k++) {
      const yc = 8 + k * 34 - 3;
      if (yc > TH - 66) break;
      B.box(0.26, 0.14, zw(TW - 14), xAt(0.12, 0.26), yOf(yc), zOf(0.5), dark);
    }
    B.box(1.1, 0.12, zw(TW - 60), xAt(1.0, 1.1), yOf(TH - 56), zOf(0.5), metalDark);  // lobby canopy
    return;
  }

  for (const wn of layout.windows) {
    const zC = zOf((wn.x + 14) / TW);
    B.box(0.3, 0.13, zw(36), xAt(0.17, 0.3), yOf(wn.y + 40) - 0.02, zC, trim);   // sill
    B.box(0.24, 0.11, zw(32), xAt(0.11, 0.24), yOf(wn.y) + 0.04, zC, trim);      // lintel
    if (wn.ac) {                                                  // window AC unit
      const acY = yOf(wn.y + 36);
      B.box(0.62, 0.34, zw(20), xAt(0.5, 0.62), acY, zC, metal);
      B.box(0.5, 0.06, zw(21), xAt(0.52, 0.5), acY + 0.2, zC, metalDark);
    }
    if (wn.plant)                                                 // planter box
      B.box(0.3, 0.16, zw(24), xAt(0.24, 0.3), yOf(wn.y + 38), zC, 0x3f7a3a);
  }

  if (layout.store) {
    const col = new THREE.Color(layout.storeCol).getHex();
    const ay = yOf(layout.gY - 2);
    // awning: slab tilted about the along-street axis so the outer edge drops
    B.box(1.15, 0.09, zw(TW - 20), xAt(1.0, 1.15), ay + 0.16, zOf(0.5), col, { rz: side * 0.3 });
    B.box(0.1, 0.22, zw(TW - 24), xAt(0.98, 0.1), ay - 0.1, zOf(0.5), col);      // hanging valance
    if (layout.blade) {                                           // perpendicular blade sign
      const bz = zOf(layout.bladeU), by = ay + 1.15;
      B.box(1.05, 0.62, 0.12, xAt(1.1, 1.05), by, bz, col);
      B.box(0.85, 0.42, 0.16, xAt(1.08, 0.85), by, bz, 0xf4ead8);
      B.box(0.9, 0.07, 0.07, xAt(1.15, 0.9), by + 0.38, bz, 0x2a2e34);           // bracket
    }
  } else {
    // door surround + steps where the paint puts the doorway
    const zC = zOf(0.5), doorTop = yOf(TH - 70);
    B.box(0.22, doorTop + 0.1, zw(6), xAt(0.12, 0.22), (doorTop + 0.1) / 2, zOf((TW / 2 - 25) / TW), trim);
    B.box(0.22, doorTop + 0.1, zw(6), xAt(0.12, 0.22), (doorTop + 0.1) / 2, zOf((TW / 2 + 25) / TW), trim);
    B.box(0.26, 0.16, zw(56), xAt(0.14, 0.26), doorTop + 0.12, zC, trim);        // header
    B.box(0.55, 0.11, zw(50), xAt(0.5, 0.55), 0.055, zC, 0x8a8a90);              // step
    B.box(0.35, 0.11, zw(46), xAt(0.32, 0.35), 0.165, zC, 0x9a9aa0);             // upper step
  }
}

function buildStreetDressing(g, seg, d, opts, dd) {
  const L = seg.len;
  const B = makeBuilder();          // one merged detail mesh for the whole block
  // The next segment's road turns into the INSIDE corner of this junction, so
  // keep that side clear near the exit or buildings/props poke into the street.
  const turnSide = seg.exit === 'R' ? 1 : seg.exit === 'L' ? -1 : 0;
  const CORNER_CLEAR = 15;
  const sideEnd = side => (side === turnSide) ? (L - CORNER_CLEAR) : (L - 6);
  // sidewalks
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ map: sideTex(d.side), roughness: 0.9, ...(pbrProfile('sidewalk') || {}) }));
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
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), new THREE.MeshStandardMaterial({ map: muralTex() }));
        wall.position.set(side * (WALL_X + 0.28), 1.7, -(dpos + 4));
        wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        wall.userData.ownGeo = true; g.add(wall);
        g.add(box(0.5, 3.5, 8.2, 0x9a8468, side * (WALL_X + 0.6), 1.75, -(dpos + 4)));
        if (d.decor?.court && Math.random() < 0.5) { const hoop = mkHoop(); hoop.position.set(side * (WALL_X + 2.4), 0.24, -(dpos + 6)); hoop.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(hoop); }
        dpos += 9;
      } else {
        const [h0, h1] = d.buildingH, h = rand(h0, h1), depth = 10;
        /* Only the road-facing face (+z) carries the storefront texture. The
           other five used one universal mustard, so standing beside a building
           filled the screen with a flat beige slab. Tint them from the
           district's own brick palette instead — reads as the same building,
           costs nothing, and the cmat cache keeps it to one material each. */
        // kept fairly light: these faces are usually in shadow, and on the dark
        // districts a heavier multiplier crushed them to pure black on screen
        const sideM = grainMat(new THREE.Color(d.brickset[0]).multiplyScalar(0.82).getHex(), 'sideWall');
        const roofM = grainMat(new THREE.Color(d.brickset[0]).multiplyScalar(0.6).getHex(), 'roof');
        const faceTex = pick(texes);
        const faceM = new THREE.MeshStandardMaterial({
          map: faceTex, roughness: 0.92, metalness: 0,
          // derived from this facade's own canvas — see makeBumpTarget
          bumpMap: faceTex.userData.bump || null, bumpScale: 1.4,
        });
        const bld = new THREE.Mesh(BOX, [sideM, sideM, roofM, roofM, faceM, sideM]);
        bld.position.set(side * (WALL_X + depth / 2), h / 2, -(dpos + w / 2));
        bld.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        /* After the Y-rotation local x runs ALONG the street, so scale.x is the
           frontage and scale.z the depth away from the road. This was
           (depth,h,w) — pinning every frontage to 10 while the loop advanced by
           w (9..15), which left ragged gaps between neighbours. */
        bld.scale.set(w, h, depth);
        g.add(bld);
        addBuildingDetail(B, side, dpos, w, h, depth, d, faceTex.userData.layout);
        addFacadeRelief(B, faceTex.userData.layout, side, dpos, w, h);
        if (Math.random() < 0.25 * dd && !d.decor?.glass) { const fe = mkFireEscape(); fe.position.set(side * (WALL_X - 0.5), 0, -(dpos + w / 2)); fe.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(fe); }
        if (d.decor?.stoops && Math.random() < 0.35 * dd) { const st = mkStoop(); st.position.set(side * (WALL_X - 0.9), 0.24, -(dpos + w / 2)); st.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(st); }
        if (d.decor?.neon && Math.random() < 0.6 * dd) {          // glowing shopfront neon
          const ns = mkNeonSign();
          ns.position.set(side * (WALL_X - 0.15), rand(2.4, 3.6), -(dpos + rand(2, Math.max(2.2, w - 2))));
          ns.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; ns.userData.ownGeo = true; g.add(ns);
        }
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
    // utility poles + power lines on the left kerb, interleaved between the
    // streetlights — the sagging wires are half the reason a street reads urban
    if (side < 0 && !d.decor?.glass) {
      const px2 = side * (HALF + SIDE_W - 0.35);
      const poleZ = [];
      for (let d2 = 18; d2 < propEnd; d2 += 17) { addUtilityPole(B, px2, -d2); poleZ.push(-d2); }
      for (let i = 0; i + 1 < poleZ.length; i++)
        for (const xo of [-0.55, 0, 0.55])
          addWireSpan(B, px2 + xo, 6.95, poleZ[i], poleZ[i + 1]);
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
      else if (roll < 0.86) {   // widened once the people became worth looking at
        const n = mkNeighbor(); n.position.set(side * (HALF + rand(1.2, 2.2)), 0.24, -d2);
        n.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (n.userData.rig) {
          (g.userData.rigs = g.userData.rigs || []).push(n.userData.rig);
          if (n.userData.wave) (g.userData.wavers = g.userData.wavers || []).push(n.userData.rig);
        } else { g.userData.neighbors = g.userData.neighbors || []; g.userData.neighbors.push(n); }
        g.add(n);
      }
      else if (roll < 0.96) {  // kerb clutter in the band that used to be empty
        const c = pick([mkMailbox, mkTrashBags, mkNewsBox])();
        c.position.set(side * (HALF + rand(1.1, 1.8)), 0.24, -d2);
        c.rotation.y = rand(0, Math.PI * 2);
        g.add(c);
      }
    }
    // a flock pecking on the sidewalk — scatters when Jay closes in
    if (side < 0 && Math.random() < 0.55 * dd) {
      const flock = [];
      const fz = -rand(L * 0.25, L * 0.75), fx = side * (HALF + rand(0.8, 1.8));
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const p = mkPigeon();
        p.position.set(fx + rand(-0.9, 0.9), 0.24, fz + rand(-0.9, 0.9));
        p.rotation.y = rand(0, Math.PI * 2);
        p.userData.state = 'peck'; p.userData.vel = null; p.userData.ph = rand(0, 9);
        g.add(p); flock.push(p);
      }
      g.userData.pigeons = flock;
    }
    // steam grate in the gutter (skip the sunny market — it reads wrong there)
    if (side > 0 && seg.district !== 'market' && Math.random() < 0.45 * dd) {
      const sg = mkSteamGrate();
      sg.position.set(side * (HALF - 0.7), 0.02, -rand(L * 0.3, L * 0.7));
      g.add(sg);
      (g.userData.grates = g.userData.grates || []).push(sg);
    }
  }
  // paper lanterns strung across the night market
  if (d.decor?.lanterns) {
    const lanterns = [];
    for (let dpos = rand(10, 20); dpos < L - 10; dpos += rand(11, 18)) {
      const ls = mkLanternString(ROAD_W + 3);
      ls.position.set(0, rand(4.6, 5.4), -dpos); g.add(ls);
      lanterns.push(ls);
    }
    g.userData.lanterns = lanterns;
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

  // traffic signals where the street meets the junction, arms over the kerb
  if (!seg.alley) {
    for (const s of (seg.exit === 'S' ? [-1, 1] : [seg.exit === 'L' ? 1 : -1])) {
      const tl = mkTrafficLight(-s);        // arm reaches over the road
      tl.position.set(s * (HALF + 0.7), 0.24, -(L - 4));
      g.add(tl);
    }
  }

  // emit the whole block's architectural detail as a single mesh
  const detailGeo = B.build();
  if (detailGeo) {
    const dm = new THREE.Mesh(detailGeo, detailMaterial());
    dm.userData.ownGeo = true;
    g.add(dm);
  }
}

/* rooftop route: tar-and-gravel deck, parapets, water tower, skyline below */
function buildRooftopDressing(g, seg, d, opts) {
  const L = seg.len;
  // deck surface (replaces the road look)
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 3, L - 6), new THREE.MeshStandardMaterial({
    map: tex(128, 128, (g2, w, h) => {
      g2.fillStyle = '#3a3a40'; g2.fillRect(0, 0, w, h);
      noise(g2, w, h, 900, 0.2, false); noise(g2, w, h, 500, 0.12, true);
      g2.strokeStyle = 'rgba(20,20,26,.6)'; g2.lineWidth = 3;          // tar seams
      for (let y = 16; y < h; y += 32) { g2.beginPath(); g2.moveTo(0, y); g2.lineTo(w, y); g2.stroke(); }
    }, { repeat: true }), ...(pbrProfile('roof') || {}) }));
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
  // The corridor walls must run ALONG the alley and clear the drivable lanes:
  // lane centres are 0/±2.2 and the runner reaches ±2.62, so the wall inner face
  // sits at ALLEY_WALL_X (3.4) — tight but always passable. (The old version
  // placed chunky rotated buildings whose 8–13-unit width jutted into the road,
  // so the runner and the trailing camera clipped straight through them.)
  const ALLEY_WALL_X = 3.4, WALL_TH = 3.0, WALL_H = 12;
  // prefer a walk-up facade: a STOREFRONT tiled sideways repeats its sign six
  // times down the corridor ("CROWN FRIED CROWN FRIED..."), and an alley should
  // read as tenement backs anyway
  const texes = buildingTexes(seg.baseDistrict || 'block');
  const walkups = texes.filter(t => !t.userData.layout?.store && !t.userData.layout?.glass);
  const brickTex = pick(walkups.length ? walkups : texes);
  const plain = grainMat(0x7a6a52, 'wall');
  for (const side of [-1, 1]) {
    // one long wall the length of the segment, no rotation, brick on the face
    // that points at the road: -x (index 1) for the right wall, +x (0) for left.
    // Tile the texture down the alley so it doesn't stretch into a smear.
    const face = new THREE.MeshStandardMaterial({ map: brickTex.clone() });
    face.map.wrapS = face.map.wrapT = THREE.RepeatWrapping; face.map.repeat.set(L / 10, 1); face.map.needsUpdate = true;
    // the facade's own derived bump, tiled in step with the colour — a bump
    // whose repeat differs from its map slides the relief off the bricks
    if (brickTex.userData.bump) {
      const bm = brickTex.userData.bump.clone();
      bm.wrapS = bm.wrapT = THREE.RepeatWrapping; bm.repeat.copy(face.map.repeat); bm.needsUpdate = true;
      face.bumpMap = bm; face.bumpScale = 1.2;
    }
    const mats = side > 0 ? [plain, face, plain, plain, plain, plain] : [face, plain, plain, plain, plain, plain];
    const wall = new THREE.Mesh(BOX, mats);
    wall.scale.set(WALL_TH, WALL_H, L);
    wall.position.set(side * (ALLEY_WALL_X + WALL_TH / 2), WALL_H / 2, -L / 2);
    g.add(wall);
    // fire escapes flush to the wall, above head height so they never block a lane
    for (let dpos = rand(6, 12); dpos < L - 6; dpos += rand(12, 20)) {
      const fe = mkFireEscape();
      fe.position.set(side * (ALLEY_WALL_X + 0.05), 1.6, -dpos);
      fe.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; fe.scale.setScalar(0.8); g.add(fe);
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
const _pl = new THREE.Vector3();   // runner in segment-local space, reused
let _lastAnimT = 0;
export function animateSegments(segs, time, party, runnerPos) {
  const dt = Math.max(0, Math.min(0.1, time - _lastAnimT)); _lastAnimT = time;
  for (const seg of segs) {
    const g = seg.group; if (!g) continue;
    if (g.userData.neighbors) for (const n of g.userData.neighbors) {
      n.userData.anim.rotation.z = Math.sin(time * 5 + n.position.z) * 0.5 - 0.4;
    }
    // skinned bystanders: clips first, then the pointing arm layered over the
    // clip — same post-mixer trick the runner uses for slides
    if (g.userData.rigs) for (const r of g.userData.rigs) r.mixer.update(dt);
    if (g.userData.wavers) for (const r of g.userData.wavers) {
      const b = r.bones.RightArm;
      if (b) b.rotation.z -= 1.7 + Math.sin(time * 6) * 0.4;
    }
    if (g.userData.pigeons && runnerPos) {
      _pl.copy(runnerPos); g.worldToLocal(_pl);
      for (const p of g.userData.pigeons) {
        const u = p.userData;
        if (u.state === 'peck') {
          u.head.position.y = 0.24 - Math.max(0, Math.sin(time * 6 + u.ph)) * 0.1;   // pecking bob
          const dx = _pl.x - p.position.x, dz = _pl.z - p.position.z;
          if (dx * dx + dz * dz < 49) {                    // Jay within 7 — burst!
            u.state = 'fly';
            const a = Math.atan2(-dx, -dz) + rand(-0.5, 0.5);
            u.vel = new THREE.Vector3(Math.sin(a) * rand(3, 5), rand(4.5, 6.5), Math.cos(a) * rand(3, 5));
            p.rotation.y = a + Math.PI;                    // face the way it flees (+z forward)
          }
        } else if (u.state === 'fly') {
          p.position.addScaledVector(u.vel, dt);
          u.vel.y += 2.2 * dt;                             // climbing away, not ballistic
          for (const w of u.wings) w.rotation.z = Math.sign(w.position.x) * (0.2 + Math.sin(time * 40 + u.ph) * 0.9);
          if (p.position.y > 14) { p.visible = false; u.state = 'gone'; }
        }
      }
    }
    if (g.userData.grates) for (const sg of g.userData.grates) {
      for (const w of sg.userData.wisps) {
        w.t += dt * 0.45; if (w.t > 1) w.t -= 1;
        w.m.position.y = 0.2 + w.t * 2.4;
        w.m.position.x = Math.sin((w.t + time * 0.1) * 5) * 0.25;
        w.m.scale.setScalar(0.5 + w.t * 1.1);
        w.m.material.opacity = 0.3 * Math.sin(Math.PI * w.t);
      }
    }
    if (g.userData.bulbs) for (let i = 0; i < g.userData.bulbs.length; i++) {
      const b = g.userData.bulbs[i];
      const s = party ? 1 + 0.5 * Math.max(0, Math.sin(time * 6 + i * 1.3)) : 1;
      b.scale.setScalar(s);
    }
    if (g.userData.policeLights) {
      // alternating red/blue strobe, offset per car so they don't pulse in unison
      for (let i = 0; i < g.userData.policeLights.length; i++) {
        const L = g.userData.policeLights[i];
        const phase = Math.sin(time * 9 + i * 1.7) > 0;
        L.red.scale.setScalar(phase ? 1.35 : 0.7);
        L.blue.scale.setScalar(phase ? 0.7 : 1.35);
        L.red.material.color.setHex(phase ? 0xff5555 : 0x7a1010);
        L.blue.material.color.setHex(phase ? 0x16307a : 0x6a92ff);
      }
    }
    if (g.userData.lanterns) for (let i = 0; i < g.userData.lanterns.length; i++) {
      const ls = g.userData.lanterns[i];
      ls.rotation.z = Math.sin(time * 0.9 + i) * 0.035;            // gentle sway
      const s = party ? 1 + 0.35 * Math.max(0, Math.sin(time * 7 + i * 0.9)) : 1;
      ls.scale.set(1, s, s);
    }
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
