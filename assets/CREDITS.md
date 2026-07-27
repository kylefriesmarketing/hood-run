# Third-party assets

## Material textures — `assets/tex/`

Source: **ambientCG** (https://ambientcg.com)
Licence: **CC0 1.0 Universal** (public domain dedication) —
https://creativecommons.org/publicdomain/zero/1.0/

No attribution is legally required under CC0. This file exists so the provenance
of every shipped asset is recorded, which matters if the game is ever sold.

| File prefix | ambientCG asset | Used for |
|---|---|---|
| `brick-`    | Bricks075A      | building facades |
| `asphalt-`  | Asphalt025A     | road surface |
| `sidewalk-` | PavingStones131 | sidewalks |
| `concrete-` | Concrete034     | walls (reserved) |

### Processing applied
Downloaded as 1K JPG sets, then locally:
- resized to **512×512** (colour q82, normal q90 — normals band badly when
  over-compressed)
- **AO + Roughness + Metalness packed into one `-orm` image** (R/G/B
  respectively), because three.js samples `aoMap.r`, `roughnessMap.g` and
  `metalnessMap.b`, so a single file drives all three slots

Raw sets totalled ~27 MB; the shipped set is ~613 KB.

## Character rig — `assets/rig/human.glb`

Source: **"Animated Human" by Quaternius** (via poly.pizza,
https://poly.pizza/m/c3Ibh9I3udk)
Licence: **CC0 1.0 Universal**

41-joint Mixamo-named skeleton with authored Idle / Walk / Run / Jump /
Punch / Death clips. Shipped unmodified; the game paints outfits at runtime
as per-triangle vertex colours (the file's own UVs overlap and carry no
texture), and normalises the FBX-derived armature scale (~69x) by measuring
the skeleton's world extent at load.

## Library code — `lib/`

- `three.module.js` — three.js r160, MIT
- `loaders/GLTFLoader.js`, `utils/BufferGeometryUtils.js` — three.js r160
  addons, MIT. Vendored **unmodified**; their bare `three` import is resolved by
  the import map in `index.html` so they can be swapped for a newer revision
  without hand edits.
