---
name: scatter
description: Many static copies of one geometry — Scene.scatter (the semantic API) and Instances3D (the bake, js/Instances3D.js). Forests, rocks, fence posts, grass tufts, rubble, fields of crates. Read before placing more than a couple of hundred copies of the same thing, before editing Instances3D.js, and when a frame budget breaks on draw calls.
---

# Scatter: many copies, one draw call (Scene.scatter, Instances3D)

## The rule

**More than a couple of hundred copies of ONE thing are a scatter, not entities.** Every
`Scene.spawn` object costs the CPU per frame (cull check, transform, material bind, a draw
call — and in this kit every mesh is drawn again for the shadow map, the outline hull and the
ink edges). A scatter bakes all copies into a few big meshes: one draw call per batch, with
the usual toon, shadow, ink and outline working on the batch as a whole.

```js
// A forest on seeded randomness (Scene.seed makes it reproducible per session):
const forest = Scene.scatter({
    kind: 'tree', count: 400,
    area: { x: 1000, y: 800, w: 1600, h: 1200 },   // a rect centered at the point
    scale: [0.8, 1.5], heading: 'random',          // per-copy randomness
    seed: 7,                                       // its own stream; absent — Scene.random
});
forest.count;  forest.setAll(items2);  forest.removeAll();
Scene.queryScatter();        // [{ name, source, count, batches, seed }]
```

Placement — exactly ONE of:

| Field | Meaning |
|---|---|
| `at: { x, y, r }` | a circle of radius `r` around the point (uniform: `sqrt` of the draw) |
| `area: { x, y, w, h }` | a rect CENTERED at the point |
| `grid: { x, y, w, h, cols, rows, jitter }` | a centered lattice; `jitter` 0..1 of a cell — fence posts stay a lattice, a meadow does not |

Source — `kind: 'box' | 'crate' | 'tree' | 'rock' | 'pole'` (Procedural3D, skill
`render-conventions`) or `geometry: { positions, color? }` of your own (model-local space,
+Y up, non-indexed — the shape `Procedural3D.geometry` returns). The rest of `def`:
`scale` — a number or `[min, max]` per copy; `heading` — radians or `'random'`;
`align: 'terrain'` (default — every copy stands on the ground) or `'flat'` (`h` for all);
`group: 'prop'` (default) or `'actor'`; `name`; `ink`, `outline`, `castShadow`,
`receiveShadows` — the `World3D.addObject` flags of the baked batches.

## Static by design

A bake is a rebuild. That is right for scenery and wrong for movers:

- **Static scatter** (the common case): forests, rocks, posts, rubble, a field of crates —
  `Scene.scatter` once at level build.
- **An occasional change** (a harvested rock, a built wall segment): `handle.setAll(items)`
  or `Instances3D.set(i, item)` + `flush()` — a re-bake; fine a few times a second at most,
  never every frame.
- **Per-frame movers** (bullets, a walking crowd, a car): entities — `Scene.spawn`. PlayCanvas 2
  has no thin-instance buffer API, so the kit bakes instead of instancing; a mover that
  re-bakes 60 times a second is the one thing this module must not be used for.

## The bake (js/Instances3D.js)

`Instances3D.scatterPoints(def, rnd)` — the pure placement stream: the draw order per copy is
fixed (spot, scale, heading), so one seed always gives the same forest. `h` is NOT set there —
`Scene.scatter` aligns copies to the location's terrain.

`Instances3D.bake(geo, items)` — the pure merge: every copy gets scale `[map-x, height,
map-y]`, a yaw by `heading` (rad) and the place `(-x, h, y)` — the SAME transform chain
`World3D.rotQuat(0, -heading, 0)` + the mirror give a `Scene.spawn` object with
`rot: [0, heading°, 0]`, so a scattered copy and a spawned object of the same model stand
identically. Normals go through the inverse scale and the same rotation, renormalized —
lighting stays honest on flattened and stretched copies. Batches split at
`Instances3D.MAX_BATCH_VERTS` (262144) vertices each.

`new Instances3D(view, source, kind, items, opts)` — the scene-side wrapper:
`setAll` / `set`+`flush` / `dispose` (hull, ink and shadow go with the meshes). Merged batches
build with `Mesh3D.build({ …, keepWinding: true })`: many shapes in one mesh have no meaningful
common centroid for the outward-safety flip, and the per-copy normals are already consistent
with the per-copy winding.

Game code and agents use `Scene.scatter`; `Instances3D` directly is for a custom pipeline
(e.g. copies along a spline — build `items` yourself and hand them to the constructor).

## Pitfalls

- Scatter copies are NOT location objects: `Scene.query()` does not list them, the editor
  does not show them, `findByTag`/`setHidden` do not reach them. They are level geometry with
  a lifetime — `Scene.inspect().scatters` and `Scene.queryScatter()` are their registry, and
  `Scene.remove(name)` disposes a scatter too.
- No per-copy picking: a click lands on the whole batch. An interactive prop (a chest the
  player opens) is an entity, not a scatter copy.
- One material color per source geometry (Procedural3D merges colors to the first): a
  multi-colored thing is several scatters, one per color.
- Ink edges and the outline hull are built per BATCH: a batch of 400 trees gets the tree
  creases 400 times over in one line mesh — that is the point (one pass), but `ink: false`
  or `outline: false` is a legitimate frame-budget lever on huge scatters.
- A scatter with `seed` does not consume the session stream (`Scene.random`): the level looks
  the same on every run, and re-rolling it means changing the seed, not the stream.

## Checklist

1. Hundreds of the same thing — `Scene.scatter`, not a loop of `Scene.spawn`.
2. Placement via `at` / `area` / `grid` + `seed` — a level is reproducible.
3. Copies stand on the ground (`align: 'terrain'`) unless the design says otherwise.
4. Movers stayed entities; an occasional change goes through `setAll`, not a per-frame re-bake.
5. `node tools/check.mjs` passes (the bake math — `tests/instances.test.mjs`); the frame holds
   its budget in the target scene (`Scene.inspect()` — triangles, fps).
