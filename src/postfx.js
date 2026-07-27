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

const FRAG = `
  uniform sampler2D tDiffuse;
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
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      vig: { value: 0.5 }, grade: { value: 1 }, aberr: { value: 0 },
      tint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene2 = new THREE.Scene(); scene2.add(quad);
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let enabled = true, w = 0, h = 0;

  function resize() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    w = size.x; h = size.y;
    target.setSize(Math.max(1, w), Math.max(1, h));
  }

  return {
    /* speed 0..1, party 0..1, reduced = accessibility reduced-motion */
    set(speed01, party01, reduced) {
      const u = mat.uniforms;
      u.vig.value = reduced ? 0.18 : 0.34;
      u.grade.value = reduced ? 0.4 : 0.8;
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
      renderer.setRenderTarget(null);
      renderer.render(scene2, cam2);
    },
    dispose() { target.dispose(); mat.dispose(); quad.geometry.dispose(); },
  };
}
