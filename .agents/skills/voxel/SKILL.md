---
name: voxel
description: Optional voxel volumes — js/Voxel3D.js and the Scene.voxel* facade: unit cubes in map space, hidden-face culling, one mesh per chunk over Mesh3D.build (toon, shadow, ink, outline as usual). Read before building terrain walls, dungeons, blocky props, destructible cover or anything out of cubes, and before editing Voxel3D.js.
---

# Voxel volumes (Voxel3D.js, Scene.voxel*)

## What it is

An OPT-IN module: nothing loads `js/Voxel3D.js` unless the game's `index.html` asks for it
(it is in `CODE_FILES` and the game script list; the editor does not load it). The kit's look
stays toon low-poly; voxels are a tool for the games that want blocks — dungeon walls,
terraces, destructible cover, a bridge the player builds.

```js
// The semantic facade (a default volume of the location, created on first use):
Scene.voxelFill(10, 10, 0, 14, 10, 3, '#8a8a8a');   // a wall: inclusive box, one color
Scene.voxelSet(12, 11, 4, 0x7a5230);                // one cube on top
Scene.voxelClear(12, 10, 1);                        // a doorway
Scene.voxelCount();                                 // cubes in the default volume
Scene.voxelClearAll();

// Several volumes or custom options — the module directly:
const vol = Voxel3D.create(app.location.view, { chunk: 16, name: 'dungeon' });
vol.fillBox(0, 0, 0, 31, 31, 0, '#555555');         // a floor slab
vol.rebuild();                                      // set/fill/clear only MARK chunks dirty
vol.dispose();
```

Color — `'#rrggbb'` | `0xRRGGBB` | `[r, g, b]` (0..1). Coordinates are MAP space like
everywhere: `x` right, `y` down, `z` (= `h`) up, one unit = one cube = 1 px of the map grid.
The mesh is baked into the mirrored world exactly once, inside the module — game logic never
mirrors by hand (the kit invariant, skill `world3d`).

## How it meshes

- The store is a Map `x,y,z -> color`; a chunk is `chunk³` cubes (16 by default).
- A face is emitted only where the neighbour cell is EMPTY (hidden-face culling): a solid
  16×16×16 chunk is 6·256 quads, not 6·4096. Interior cubes cost store memory only.
- One chunk = ONE mesh through `Mesh3D.build({ positions, normals, colors, keepWinding })`:
  per-voxel colors ride the COLOR semantic (a multi-colored volume is still one draw call per
  chunk), toon/ink/outline/shadow attach through `World3D.addObject` like any object.
  `keepWinding` is on because winding and normals are authored together here (cross(b-a, c-a)
  along the face normal — the lint convention) and an open surface has no centroid for the
  outward-safety flip.
- `rebuild()` re-meshes the dirty chunks AND their 26 neighbours (a new cube hides the
  neighbour's face), so a hole closes and a seam never leaks. Chunks that ended up empty drop
  their mesh.

## Cost model

- One `set` is cheap; the MESH is the cost — batch your edits and `rebuild()` once, not per
  cube (the `Scene.voxel*` facade rebuilds per call on purpose: agent edits are single ops).
- A chunk mesh grows with its EXPOSED surface: a 16×16×1 solid slab is fine, a 16×16×16
  sponge of single cubes is not. Fill interiors solid, carve the outside.
- Voxels are not location objects and not scatter copies: no `findByTag`, no editor rows, no
  per-cube picking (a click lands on the chunk mesh). Interactive blocks = your own logic over
  `vol.get(x, y, z)`.

## Pitfalls

- `Scene.voxel*` throws a readable error when `Voxel3D.js` is not in the page's script list —
  add `<script src="js/Voxel3D.js"></script>` before `js/SceneAPI.js` (the kit's `index.html`
  already has it; a scaffolded game from an older zip may not).
- Forgetting `rebuild()` on a direct `VoxelVolume`: the store changes, the picture does not.
- Fractional coordinates are floored (`set(1.7, …)` lands on cube 1) — snap once, outside.
- A volume lives in one `View3D`: after a location reload the old volume is gone with the
  view (`Scene.voxelVolume()` recreates the default one for the new view).

## Checklist

1. Cubes placed in map coordinates; no hand mirroring anywhere in game code.
2. Edits batched, one `rebuild()` per change group (direct API); the facade for single ops.
3. Interiors solid, surfaces carved — the exposed-face count is the frame cost.
4. `node tools/check.mjs` passes (meshing math — `tests/voxel.test.mjs`); looked at in the
   browser: the volume reads as one object, toon bands and outline on it like on everything.
