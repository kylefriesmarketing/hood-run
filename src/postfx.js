/* HOOD RUN — postfx.js
   A single cheap fullscreen pass: vignette, colour grade, speed-driven
   chromatic aberration, and a Block-Party warm push.

   three.module.js here is the CORE build — there is no EffectComposer — so this
   is hand-rolled: render the scene into a target, then draw one screen quad.
   createPostFX(renderer) is per-renderer on purpose, so the offscreen capture
   path can run the identical chain instead of seeing an ungraded image. */

import * as THREE from '../lib/three.module.js';

const VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* bright-pass: keep only what should glow */
const FRAG_BRIGHT = `
  uniform sampler2D tDiffuse; uniform float thresh;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float k = smoothstep(thresh, thresh + 0.35, l);
    gl_FragColor = vec4(c * k, 1.0);
  }`;

/* separable gaussian — run once horizontally, once vertically */
const FRAG_BLUR = `
  uniform sampler2D tDiffuse; uniform vec2 dir;
  varying vec2 vUv;
  void main(){
    vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    s += texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb * 0.3162162162;
    s += texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb * 0.3162162162;
    s += texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb * 0.0702702703;
    s += texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(s, 1.0);
  }`;

const FRAG = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform float bloomAmt;
  uniform float vig;       // vignette strength
  uniform float grade;     // contrast + saturation push
  uniform float aberr;     // chromatic aberration (rises with speed)
  uniform vec3  tint;      // warm push during Block Party
  varying vec2 vUv;

  /* The target is tagged sRGB, so the GPU stores it as an sRGB texture and
     sampling HARDWARE-DECODES it back to linear. Writing that straight to the
     canvas renders the frame at ~6% brightness, so we must re-encode on output.
     Grading happens after the encode, in display space, where the contrast and
     saturation constants behave the way they look. */
  vec3 toSRGB(vec3 c){
    return mix(c * 12.92,
               1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
               step(vec3(0.0031308), c));
  }

  void main(){
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);

    vec3 col;
    if (aberr > 0.0005) {
      // split the channels outward from centre — reads as speed, not as blur
      vec2 off = c * aberr * (0.35 + r2);
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
    } else {
      col = texture2D(tDiffuse, vUv).rgb;
    }
    // add the glow while still linear — that is what makes neon bleed into the
    // air around it instead of just brightening the sign itself
    col += texture2D(tBloom, vUv).rgb * bloomAmt;
    col = toSRGB(col);

    // gentle S-curve + saturation so the flat Lambert shading gets some depth
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.0 + grade * 0.30);
    col = clamp((col - 0.5) * (1.0 + grade * 0.20) + 0.5, 0.0, 1.0);
    col *= tint;

    // vignette — pulled in hard enough to frame the runner, never to crush edges
    col *= clamp(1.0 - vig * r2 * 1.45, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
  }`;

export function createPostFX(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
  });
  /* Colour space matters here. Three only applies the linear->sRGB output
     conversion for a render target if the target's texture says it is sRGB, and
     a raw ShaderMaterial gets no automatic decode/encode at all. Tagging the
     target sRGB makes the scene pass write display-ready values and the blit a
     clean pass-through. Without this the whole frame renders crushed and dark. */
  target.texture.colorSpace = THREE.SRGBColorSpace;
  /* half-res ping-pong pair for the glow; linear (NOT sRGB) because the bloom
     is summed with the still-linear scene colour before the output encode */
  const mkRT = () => {
    const t = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    });
    return t;
  };
  const rtA = mkRT(), rtB = mkRT();
  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: target.texture }, thresh: { value: 0.72 } },
    vertexShader: VERT, fragmentShader: FRAG_BRIGHT, depthTest: false, depthWrite: false,
  });
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
    vertexShader: VERT, fragmentShader: FRAG_BLUR, depthTest: false, depthWrite: false,
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      tBloom: { value: rtB.texture }, bloomAmt: { value: 0.85 },
      vig: { value: 0.5 }, grade: { value: 1 }, aberr: { value: 0 },
      tint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene2 = new THREE.Scene(); scene2.add(quad);
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let enabled = true, bloomOn = true, w = 0, h = 0;

  function resize() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    w = size.x; h = size.y;
    target.setSize(Math.max(1, w), Math.max(1, h));
    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    rtA.setSize(bw, bh); rtB.setSize(bw, bh);
  }
  /* bright-pass then one H and one V blur, at half res */
  function bloomPass() {
    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    quad.material = brightMat;
    renderer.setRenderTarget(rtA); renderer.render(scene2, cam2);
    quad.material = blurMat;
    blurMat.uniforms.tDiffuse.value = rtA.texture;
    blurMat.uniforms.dir.value.set(1 / bw, 0);
    renderer.setRenderTarget(rtB); renderer.render(scene2, cam2);
    blurMat.uniforms.tDiffuse.value = rtB.texture;
    blurMat.uniforms.dir.value.set(0, 1 / bh);
    renderer.setRenderTarget(rtA); renderer.render(scene2, cam2);
    mat.uniforms.tBloom.value = rtA.texture;
    quad.material = mat;
  }

  return {
    /* speed 0..1, party 0..1, reduced = accessibility reduced-motion */
    set(speed01, party01, reduced) {
      const u = mat.uniforms;
      u.vig.value = reduced ? 0.18 : 0.34;
      u.grade.value = reduced ? 0.4 : 0.8;
      u.bloomAmt.value = bloomOn ? (reduced ? 0.5 : 0.85) : 0;
      u.aberr.value = reduced ? 0 : Math.max(0, speed01) * 0.006;
      const p = Math.max(0, Math.min(1, party01));
      u.tint.value.setRGB(1 + p * 0.10, 1 + p * 0.02, 1 - p * 0.05);
    },
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },
    render(scene, camera) {
      if (!enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      resize();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      if (bloomOn) bloomPass();
      mat.uniforms.bloomAmt.value = bloomOn ? 0.85 : 0;
      renderer.setRenderTarget(null);
      renderer.render(scene2, cam2);
    },
    setBloom(v) { bloomOn = v; },
    hasBloom() { return bloomOn; },
    dispose() {
      target.dispose(); rtA.dispose(); rtB.dispose();
      mat.dispose(); brightMat.dispose(); blurMat.dispose(); quad.geometry.dispose();
    },
  };
}
