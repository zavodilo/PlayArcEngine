// Instances3D.js — many copies of ONE geometry in ONE draw call per batch.
//
// WHY. Every separate entity costs the CPU per frame: the cull check, the world transform,
// the material bind and a draw call — and in this kit every mesh is drawn again for the
// shadow map, the outline hull and the ink edges. A forest, identical props, fence posts,
// grass tufts, rubble — more than a couple of hundred copies of one thing belong here, not
// in Scene.spawn.
//
// PlayCanvas 2 has no thin-instance buffer API, so the kit bakes instead: scatter math
// places the copies, and every copy's vertices are merged into a few big meshes (a batch
// each) that go through the usual Mesh3D.build → World3D.addObject pipeline. Toon, shadow,
// ink edges and the silhouette hull all work on a batch exactly as on a single object —
// once per batch, not once per copy. The price: a bake is a rebuild. That is fine for
// STATIC scatter (the common case); moving copies (bullets, a walking crowd) are entities
// (Scene.spawn), and an occasional change is setAll()/set()+flush() — a re-bake, not a
// per-frame call.
//
//     const trees = new Instances3D(view, 'tree', 'prop', [
//         { x: 300, y: 420, h: terrain.heightAt(300, 420), heading: 1.2, scale: 1.4 }, …
//     ]);
//     trees.setAll(items2);        // replace all (re-bake; the count may change)
//     trees.set(7, { x, y, h });   trees.flush();   // an occasional move — also a re-bake
//     trees.dispose();
//
// Game code and agents should prefer the semantic wrapper: Scene.scatter(def) — it owns the
// registry, the terrain alignment and the deterministic RNG (Scene.seed).
//
// source — a procedural kind ('box', 'crate', 'tree', 'rock', 'pole') or a raw geometry
// { positions, color? } in model-local space (the shape Procedural3D.geometry returns:
// +Y up, non-indexed, one material color).
// item — { x, y: map px; h: height of the copy's origin, px (the helper does NOT ask the
// terrain); heading: rad, like everywhere (the nose along +X turns to atan2(vy, vx));
// scale: a number or [map-x, height, map-y]; 1 by default }.
// The bake matches what a single object would look like: the same map→world mirror
// (-(x), h, y) and the same rotation as World3D.rotQuat(0, -heading, 0) — a scattered copy
// and a Scene.spawn object with rot [0, heading°, 0] stand identically.
// opts (the World3D.addObject ones pass through): { seed, castShadow, receiveShadows, ink,
// outline, maxBatchVerts }.

class Instances3D {
    // Vertices per baked mesh; a bigger scatter is split into several batches.
    static MAX_BATCH_VERTS = 262144;

    /**
     * @param {View3D} view
     * @param {string | { positions: ArrayLike<number> | number[], normals?: ArrayLike<number> | number[], colors?: ArrayLike<number> | number[], color?: number[] }} source
     * @param {string} kind 'prop' | 'actor'
     * @param {Array<{ x?: number, y?: number, h?: number, heading?: number, scale?: number | number[] }>} items
     * @param {Record<string, any>} [opts]
     */
    constructor(view, source, kind, items, opts) {
        const o = opts || {};
        this.view = view;
        this.group = kind === 'actor' ? 'actor' : 'prop';
        this.opts = o;
        this.name = o.name || 'instances';
        /** @type {{ positions: ArrayLike<number> | number[], normals?: ArrayLike<number> | number[], colors?: ArrayLike<number> | number[], color?: number[] } | null} */
        this.geo = typeof source === 'string'
            ? (typeof Procedural3D !== 'undefined' ? Procedural3D.geometry(source, o.seed) : null)
            : source;
        this.ok = !!(this.geo && this.geo.positions && this.geo.positions.length >= 9 &&
            this.geo.positions.length % 3 === 0);
        /** @type {any[]} */
        this.nodes = [];
        /** @type {Array<Record<string, any>>} */
        this.items = [];
        if (!this.ok) {
            console.warn('Instances3D: no geometry to instance (' + (typeof source === 'string' ? source : 'empty') + ')');
            return;
        }
        // Local-space normals, computed once: every copy rotates/scales them with itself.
        const src = Float32Array.from(this.geo.positions);
        this._normals = this.geo.normals ? Float32Array.from(this.geo.normals)
            : Mesh3D.normals(src, Instances3D._identity(src.length / 3));
        this.setAll(items || []);
    }

    get count() { return this.items.length; }

    // --- Scatter placement (pure math — tests/instances.test.mjs) ------------------

    // Where the copies stand. opts: { count, and ONE of
    //   at:   { x, y, r }                — a circle of radius r around the point;
    //   area: { x, y, w, h }             — a rect centered at the point;
    //   grid: { x, y, w, h, cols, rows, jitter } — a centered lattice, jitter 0..1 of a cell;
    // scale: a number, or [min, max] — a uniform scale randomized per copy;
    // heading: radians, or 'random' }. rnd — a () => [0,1) stream (Scene.random or a seeded
    // one). The draw order per copy is fixed (spot, scale, heading), so one seed always
    // gives the same forest. h is NOT set here — the caller aligns copies to its terrain.
    /** @returns {Array<{ x: number, y: number, h: number, heading: number, scale: number }>} */
    static scatterPoints(opts, rnd) {
        const o = opts || {}, random = typeof rnd === 'function' ? rnd : Math.random;
        const n = Math.max(0, Math.floor(Number(o.count) || 0));
        const items = [];
        const [smin, smax] = Array.isArray(o.scale) ? [Number(o.scale[0]), Number(o.scale[1])] : [null, null];
        const sfix = smin == null ? (o.scale == null ? 1 : Number(o.scale) || 1) : 1;
        const headingRandom = o.heading === 'random';
        const headingFix = headingRandom ? 0 : Number(o.heading) || 0;
        for (let i = 0; i < n; i++) {
            let x = 0, y = 0;
            if (o.at) {
                // Uniform in a circle: sqrt keeps the density even.
                const a = random() * Math.PI * 2, r = Math.sqrt(random()) * (Number(o.at.r) || 0);
                x = (Number(o.at.x) || 0) + Math.cos(a) * r;
                y = (Number(o.at.y) || 0) + Math.sin(a) * r;
            } else if (o.grid) {
                const g = o.grid, cols = Math.max(1, Math.floor(Number(g.cols) || 1)), rows = Math.max(1, Math.floor(Number(g.rows) || 1));
                const cw = (Number(g.w) || 0) / cols, ch = (Number(g.h) || 0) / rows;
                const cx = (Number(g.x) || 0) - (Number(g.w) || 0) / 2, cy = (Number(g.y) || 0) - (Number(g.h) || 0) / 2;
                const col = i % cols, row = Math.floor(i / cols) % rows;
                const j = Math.max(0, Math.min(1, Number(g.jitter) || 0));
                x = cx + cw * (col + 0.5 + (random() - 0.5) * j);
                y = cy + ch * (row + 0.5 + (random() - 0.5) * j);
            } else {
                const a = o.area || { x: 0, y: 0, w: 0, h: 0 };
                x = (Number(a.x) || 0) + (random() - 0.5) * (Number(a.w) || 0);
                y = (Number(a.y) || 0) + (random() - 0.5) * (Number(a.h) || 0);
            }
            const scale = smin == null ? sfix : smin + (smax - smin) * random();
            const heading = headingRandom ? random() * Math.PI * 2 : headingFix;
            items.push({ x, y, h: 0, heading, scale });
        }
        return items;
    }

    // --- The bake (pure math — tests/instances.test.mjs) ---------------------------

    // The procedural geoms are non-indexed: every vertex is its own triangle corner.
    static _identity(n) {
        const idx = new Uint32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        return idx;
    }

    // geo { positions, normals? } + items -> an array of batches { positions, normals,
    // color }, world (pc) space, non-indexed, ready for Mesh3D.build({ keepWinding: true }).
    /**
     * @param {{ positions: ArrayLike<number> | number[], normals?: ArrayLike<number> | number[], colors?: ArrayLike<number> | number[], color?: number[] }} geo
     * @param {Array<Record<string, any>>} items
     * @param {ArrayLike<number> | null} [normals]
     * @param {number} [maxBatchVerts]
     */
    static bake(geo, items, normals, maxBatchVerts) {
        const src = geo.positions, nV = src.length / 3;
        const nrm = normals || (geo.normals ? geo.normals
            : Mesh3D.normals(Float32Array.from(src), Instances3D._identity(nV)));
        const limit = Math.max(nV, Number(maxBatchVerts) || Instances3D.MAX_BATCH_VERTS);
        const perBatch = Math.max(1, Math.floor(limit / nV));
        const batches = [];
        for (let start = 0; start < items.length; start += perBatch) {
            const chunk = items.slice(start, start + perBatch);
            const positions = new Float32Array(chunk.length * nV * 3);
            const nout = new Float32Array(positions.length);
            const srcC = geo.colors ? Float32Array.from(geo.colors) : null;
            const cout = srcC ? new Float32Array(positions.length) : null;
            for (let c = 0; c < chunk.length; c++) {
                const it = chunk[c] || {};
                const s = it.scale == null ? 1 : it.scale;
                const sx = (Array.isArray(s) ? Number(s[0]) : Number(s)) || 1;
                const sy = (Array.isArray(s) ? Number(s[1]) : Number(s)) || 1;
                const sz = (Array.isArray(s) ? Number(s[2]) : Number(s)) || 1;
                const th = Number(it.heading) || 0, ct = Math.cos(th), st = Math.sin(th);
                const tx = -(Number(it.x) || 0), ty = Number(it.h) || 0, tz = Number(it.y) || 0;
                const po = c * nV * 3;
                for (let v = 0; v < nV; v++) {
                    const i3 = v * 3, k = po + i3;
                    // Scale in local space, yaw by the heading (the map convention, equal to
                    // World3D.rotQuat(0, -heading, 0) in the mirrored world), then the copy's
                    // place: world (-x, h, y).
                    if (cout) { cout[k] = srcC[i3]; cout[k + 1] = srcC[i3 + 1]; cout[k + 2] = srcC[i3 + 2]; }
                    const lx = src[i3] * sx, ly = src[i3 + 1] * sy, lz = src[i3 + 2] * sz;
                    positions[k] = ct * lx + st * lz + tx;
                    positions[k + 1] = ly + ty;
                    positions[k + 2] = -st * lx + ct * lz + tz;
                    // Normals: the inverse scale (a flatten must not tilt them wrong), the
                    // same rotation, renormalized. The mirror lives in the rotation already
                    // (a proper matrix, det +1), so the winding stays consistent.
                    const ax = nrm[i3] / sx, ay = nrm[i3 + 1] / sy, az = nrm[i3 + 2] / sz;
                    let nx = ct * ax + st * az, ny = ay, nz = -st * ax + ct * az;
                    const l = Math.hypot(nx, ny, nz) || 1;
                    nout[k] = nx / l; nout[k + 1] = ny / l; nout[k + 2] = nz / l;
                }
            }
            batches.push({ positions, normals: nout, colors: cout || undefined, color: geo.color || [0.6, 0.6, 0.6] });
        }
        return batches;
    }

    // --- The scene side -------------------------------------------------------------

    // Replace all copies (re-bake). An empty list removes the meshes.
    setAll(items) {
        if (!this.ok) return;
        this.items = (items || []).slice();
        this._dropNodes();
        if (!this.items.length) return;
        const batches = Instances3D.bake(this.geo, this.items, this._normals, this.opts.maxBatchVerts);
        for (let i = 0; i < batches.length; i++) {
            const node = Mesh3D.build(this.view, this.name + (batches.length > 1 ? '-' + i : ''),
                { positions: batches[i].positions, normals: batches[i].normals, colors: batches[i].colors, color: batches[i].color, keepWinding: true });
            World3D.addObject(this.view, node, this.group, this.opts);
            this.nodes.push(node);
        }
    }

    // One copy; flush() re-bakes after the last set() of the change (baking is not free —
    // this pair is for occasional edits, not for every-frame motion).
    set(i, item) {
        if (i >= 0 && i < this.items.length && item) this.items[i] = Object.assign({}, this.items[i], item);
    }

    flush() { if (this.ok && this.items.length) this.setAll(this.items); }

    // Out of the scene: hull, ink, shadow and the meshes of every batch.
    dispose() {
        this._dropNodes();
        this.items = [];
        this.ok = false;
    }

    _dropNodes() {
        for (const node of this.nodes) World3D.removeObject(this.view, node);
        this.nodes = [];
    }
}
