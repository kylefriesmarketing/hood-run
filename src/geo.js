/* HOOD RUN — geo.js
   A tiny geometry merger. three's BufferGeometryUtils is an addon and this is
   the CORE build, so we roll our own: accumulate boxes with a per-box colour,
   then emit ONE indexed BufferGeometry carrying a vertex-colour attribute.

   Why it matters: a building can now have a cornice, ledges, a parapet, a water
   tower and a dozen roof units and still cost a single draw call, because all
   of it shares one vertex-coloured material. */

import * as THREE from '../lib/three.module.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1);

export function makeBuilder() {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();

  const api = {
    /* box(width, height, depth, x, y, z, colorHex, {rx,ry,rz}) */
    box(w, h, d, x, y, z, color, rot) {
      const g = UNIT.clone();
      e.set(rot?.rx || 0, rot?.ry || 0, rot?.rz || 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
      g.applyMatrix4(m);
      parts.push({ g, color });
      return api;
    },
    /* a horizontal band wrapping all four sides — cornices, ledges, parapets */
    band(w, d, y, thickness, overhang, color) {
      return api.box(w + overhang, thickness, d + overhang, 0, y, 0, color);
    },
    count() { return parts.length; },
    build() {
      if (!parts.length) return null;
      let vTotal = 0, iTotal = 0;
      for (const p of parts) { vTotal += p.g.attributes.position.count; iTotal += p.g.index.count; }

      const pos = new Float32Array(vTotal * 3);
      const nrm = new Float32Array(vTotal * 3);
      const uv = new Float32Array(vTotal * 2);
      const clr = new Float32Array(vTotal * 3);
      const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);

      let vo = 0, io = 0;
      for (const p of parts) {
        const g = p.g, n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3);
        nrm.set(g.attributes.normal.array, vo * 3);
        uv.set(g.attributes.uv.array, vo * 2);
        col.set(p.color);
        for (let i = 0; i < n; i++) {
          clr[(vo + i) * 3] = col.r; clr[(vo + i) * 3 + 1] = col.g; clr[(vo + i) * 3 + 2] = col.b;
        }
        const gi = g.index.array;
        for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
        vo += n; io += gi.length;
        g.dispose();
      }

      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.setAttribute('color', new THREE.BufferAttribute(clr, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      parts.length = 0;
      return out;
    },
  };
  return api;
}

/* one shared material for every merged detail mesh in the game */
let detailMat = null;
export function detailMaterial() {
  if (!detailMat) {
    detailMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.86, metalness: 0.04,
    });
  }
  return detailMat;
}
