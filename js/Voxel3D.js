// Voxel3D.js — OPTIONAL voxel volumes: a chunked store of unit cubes meshed with hidden-face
// culling over the kit's own Mesh3D.build (toon, shadow, ink and outline apply as usual).
//
//   const vol = Voxel3D.create(view, { chunk: 16 });
//   vol.set(10, 4, 0, '#7a5230');            // one cube at map (x, y) and height level z
//   vol.fillBox(8, 2, 0, 13, 7, 3, 0x8a8a8a);
//   vol.clear(11, 5, 2);
//   vol.rebuild();                            // re-mesh the dirty chunks (set/fill do NOT mesh)
//   vol.dispose();
//
// Game code and agents should prefer the semantic facade: Scene.voxelSet / voxelFill /
// voxelClear / voxelRebuild (a default volume is created on first use).
//
// Coordinates are MAP space like everything else in the kit: x right, y down, z (= h) up in
// unit cubes; the mesh is baked straight into the mirrored world (a cube at (x, y, z) owns
// world X ∈ [-(x+1), -x], Y ∈ [z, z+1], Z ∈ [y, y+1]) — mirroring happens ONCE, here, and
// game logic stays in map space.
//
// Meshing: a face is emitted only where the neighbour cell is empty (hidden-face culling —
// a solid 16×16×16 chunk is 6·256 faces, not 6·4096). Faces of one chunk go into ONE mesh
// (positions + normals + per-voxel vertex colors), built with keepWinding: the winding and
// the normals are authored together here (cross(b-a, c-a) along the face normal — the lint
// convention), and an open surface (a cliff, a floor) has no meaningful centroid for the
// outward-safety flip.
//
// This module is a TOOL, not the kit's look: the toon low-poly style stays the default, and
// nothing loads Voxel3D.js unless the game's index.html asks for it (it is in CODE_FILES and
// the game script list; the editor does not load it).

/** @satisfies {Record<string, any>} */
const Voxel3D = {
    DEFAULT_CHUNK: 16,

    // The six faces: world normal, the neighbour's map offset, the quad's base corner and its
    // two tangent steps (cross(u, v) === the normal — the winding follows).
    FACES: [
        { n: [1, 0, 0], d: [-1, 0, 0], base: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },   // world +X = map -x
        { n: [-1, 0, 0], d: [1, 0, 0], base: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        { n: [0, 1, 0], d: [0, 0, 1], base: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },   // up
        { n: [0, -1, 0], d: [0, 0, -1], base: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, 0, 1], d: [0, 1, 0], base: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },   // world +Z = map +y
        { n: [0, 0, -1], d: [0, -1, 0], base: [0, 0, 0], u: [0, 1, 0], v: [1, 0, 0] }
    ],

    /** '#rrggbb' | 0xRRGGBB | [r, g, b] (0..1) -> [r, g, b]; garbage -> null. */
    color(v) {
        if (Array.isArray(v)) {
            return v.length === 3 && v.every(n => Number.isFinite(n)) ? [Number(v[0]), Number(v[1]), Number(v[2])] : null;
        }
        if (typeof v === 'number' && Number.isFinite(v)) {
            const h = v >>> 0;
            return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
        }
        const m = /^#?([0-9a-f]{6})$/i.exec(String(v || '').trim());
        if (!m) return null;
        const h = parseInt(m[1], 16);
        return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    },

    key(x, y, z) { return x + ',' + y + ',' + z; },

    // --- Volume ----------------------------------------------------------------------

    /**
     * @param {View3D} view
     * @param {{ chunk?: number, name?: string, kind?: string, ink?: boolean, outline?: boolean }} [opts]
     */
    create(view, opts) {
        return new VoxelVolume(view, opts || {});
    },

    // --- Pure meshing (tests/voxel.test.mjs) ------------------------------------------

    // store (Map key -> [r,g,b]) -> per-chunk geoms in WORLD space:
    // [{ key: 'i,j,k', positions, normals, colors }]. Faces touch only where the neighbour
    // cell is absent from the store; colors ride the vertices (Mesh3D.build -> COLOR semantic).
    meshChunks(store, chunk) {
        const C = Math.max(1, Math.floor(chunk) || Voxel3D.DEFAULT_CHUNK);
        const byChunk = new Map();
        for (const [key, col] of store) {
            const p = key.split(',');
            const x = Number(p[0]), y = Number(p[1]), z = Number(p[2]);
            const ck = Math.floor(x / C) + ',' + Math.floor(y / C) + ',' + Math.floor(z / C);
            let list = byChunk.get(ck);
            if (!list) byChunk.set(ck, (list = []));
            list.push([x, y, z, col]);
        }
        const out = [];
        for (const [ck, voxels] of byChunk) {
            const positions = [], normals = [], colors = [];
            for (const [x, y, z, col] of voxels) {
                // World box of the cube: X from -(x+1) to -x, Y from z to z+1, Z from y to y+1.
                const X0 = -(x + 1), Y0 = z, Z0 = y;
                for (const f of Voxel3D.FACES) {
                    if (store.has(Voxel3D.key(x + f.d[0], y + f.d[1], z + f.d[2]))) continue;   // hidden
                    const bx = X0 + f.base[0], by = Y0 + f.base[1], bz = Z0 + f.base[2];
                    const quad = [
                        [bx, by, bz],
                        [bx + f.u[0], by + f.u[1], bz + f.u[2]],
                        [bx + f.u[0] + f.v[0], by + f.u[1] + f.v[1], bz + f.u[2] + f.v[2]],
                        [bx + f.v[0], by + f.v[1], bz + f.v[2]]
                    ];
                    const idx = [0, 1, 2, 0, 2, 3];
                    for (const i of idx) {
                        positions.push(quad[i][0], quad[i][1], quad[i][2]);
                        normals.push(f.n[0], f.n[1], f.n[2]);
                        colors.push(col[0], col[1], col[2]);
                    }
                }
            }
            if (positions.length) out.push({ key: ck, positions, normals, colors });
        }
        return out;
    }
};

// One volume: the store, the dirty set and one mesh per chunk in the scene.
class VoxelVolume {
    constructor(view, opts) {
        this.view = view;
        this.chunk = Math.max(1, Math.floor(Number(opts.chunk) || Voxel3D.DEFAULT_CHUNK));
        this.name = opts.name || 'voxel';
        this.opts = opts;
        /** @type {Map<string, number[]>} */
        this.store = new Map();
        /** @type {Map<string, any>} */
        this.nodes = new Map();      // chunk key -> entity
        this._dirty = new Set();
    }

    get count() { return this.store.size; }

    /** @returns {number[] | null} the voxel's color triple, or null when empty. */
    get(x, y, z) {
        const c = this.store.get(Voxel3D.key(x, y, z));
        return c ? c.slice() : null;
    }

    /** Place one cube; color — '#rrggbb' | 0xRRGGBB | [r,g,b]. Marks the chunk dirty. */
    set(x, y, z, color) {
        const c = Voxel3D.color(color == null ? 0x808080 : color);
        if (!c) throw new Error('Voxel3D: bad color ' + JSON.stringify(color));
        const xi = Math.floor(Number(x)), yi = Math.floor(Number(y)), zi = Math.floor(Number(z));
        if (![xi, yi, zi].every(Number.isFinite)) throw new Error('Voxel3D: coordinates must be finite numbers');
        this.store.set(Voxel3D.key(xi, yi, zi), c);
        this._dirty.add(Math.floor(xi / this.chunk) + ',' + Math.floor(yi / this.chunk) + ',' + Math.floor(zi / this.chunk));
        return this;
    }

    /** Inclusive box of cubes, one color. */
    fillBox(x0, y0, z0, x1, y1, z1, color) {
        const [a, b, c, d, e, f] = [x0, x1, y0, y1, z0, z1].map(v => Math.floor(Number(v)));
        for (let x = Math.min(a, b); x <= Math.max(a, b); x++)
            for (let y = Math.min(c, d); y <= Math.max(c, d); y++)
                for (let z = Math.min(e, f); z <= Math.max(e, f); z++) this.set(x, y, z, color);
        return this;
    }

    /** Remove a cube (a missing one is not an error). */
    clear(x, y, z) {
        const xi = Math.floor(Number(x)), yi = Math.floor(Number(y)), zi = Math.floor(Number(z));
        if (!this.store.delete(Voxel3D.key(xi, yi, zi))) return this;
        this._dirty.add(Math.floor(xi / this.chunk) + ',' + Math.floor(yi / this.chunk) + ',' + Math.floor(zi / this.chunk));
        return this;
    }

    /** Forget everything and drop the meshes. */
    clearAll() {
        for (const key of [...this.store.keys()]) {
            const p = key.split(',');
            this.clear(Number(p[0]), Number(p[1]), Number(p[2]));
        }
        this.rebuild();
        return this;
    }

    // Re-mesh the dirty chunks (and the chunks of removed voxels, so a hole closes).
    rebuild() {
        if (!this.view) return this;
        const dirty = [...this._dirty];
        this._dirty.clear();
        if (!dirty.length) return this;
        // A rebuilt chunk needs the neighbouring voxels too: culling looks across the border.
        const need = new Map();
        for (const ck of dirty) {
            const p = ck.split(',').map(Number);
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
                const key = (p[0] + i) + ',' + (p[1] + j) + ',' + (p[2] + k);
                if (!need.has(key)) need.set(key, []);
            }
        }
        for (const [key, voxels] of need) {
            const p = key.split(',').map(Number);
            for (const [k, col] of this.store) {
                const q = k.split(',').map(Number);
                if (Math.floor(q[0] / this.chunk) === p[0] && Math.floor(q[1] / this.chunk) === p[1] &&
                    Math.floor(q[2] / this.chunk) === p[2]) voxels.push([q[0], q[1], q[2], col]);
            }
        }
        const geoms = Voxel3D.meshChunks(new Map([...need].flatMap(([, v]) => v.map(vv => [Voxel3D.key(vv[0], vv[1], vv[2]), vv[3]]))), this.chunk)
            .filter(g => dirty.includes(g.key) || need.has(g.key));
        const seen = new Set();
        for (const g of geoms) {
            seen.add(g.key);
            this._dropChunk(g.key);
            const node = Mesh3D.build(this.view, this.name + '-' + g.key.replace(/,/g, '_'),
                { positions: g.positions, normals: g.normals, colors: g.colors, keepWinding: true });
            World3D.addObject(this.view, node, this.opts.kind === 'actor' ? 'actor' : 'prop', this.opts);
            this.nodes.set(g.key, node);
        }
        // Dirty chunks that ended up EMPTY (everything cleared): drop their mesh.
        for (const ck of dirty) if (!seen.has(ck)) this._dropChunk(ck);
        return this;
    }

    /** Out of the scene for good. */
    dispose() {
        for (const key of [...this.nodes.keys()]) this._dropChunk(key);
        this.store.clear();
        this._dirty.clear();
        this.view = null;
    }

    _dropChunk(key) {
        const node = this.nodes.get(key);
        if (node) World3D.removeObject(this.view, node);
        this.nodes.delete(key);
    }
}
