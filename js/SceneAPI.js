// SceneAPI.js — the semantic AI-facing layer over the kit (ROADMAP phase B).
//
// Agents (and game code that prefers declarations over engine calls) drive the scene
// through this namespace instead of pc.* / World3D.*: every method takes and returns
// plain JSON-able data, validates it against SCENE_SCHEMA (js/SceneSchema.js, generated
// by tools/manifest.mjs) and fails with a readable Error instead of a broken frame.
//
//   Scene.spawn('assets/models/mill.fbx', { kind: 'prop', x: 800, y: 900, heading: 30 })
//   Scene.move('mill-2', { x: 820, clip: 'idle' })
//   Scene.query({ kind: 'actor' })          -> snapshots
//   await Scene.inspect()                   -> { objects, loaded, errors, triangles, fps, findings }
//
// The canon stays where it was: records live in Location3D.objects (def objects of
// Objects.js), the editor edits the same defs, and nothing here bypasses
// World3D.addObject / placeObject — this file only adds validation and a stable surface.

/** @satisfies {Record<string, any>} */
const Scene = {
    // --- context ---------------------------------------------------------------

    _location() {
        const app = /** @type {any} */ (window).app;
        const loc = app && app.location;
        if (!loc) throw new Error('Scene: the game is not booted yet (window.app.location is missing)');
        return loc;
    },

    manifest() {
        return typeof SCENE_SCHEMA !== 'undefined' ? SCENE_SCHEMA : null;
    },

    // --- validation ------------------------------------------------------------

    _num(v, what) {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Scene: ' + what + ' must be a finite number, got ' + JSON.stringify(v));
        return v;
    },

    _defFrom(model, opts) {
        const o = opts || {};
        const kind = o.kind != null ? o.kind : 'prop';
        if (kind !== 'prop' && kind !== 'actor') throw new Error("Scene: kind must be 'prop' or 'actor', got " + JSON.stringify(kind));
        if (typeof model !== 'string' || !/^assets\//.test(model)) {
            throw new Error('Scene: model must be a literal path from the game root (the assets/ directory, like in Objects.js), got ' + JSON.stringify(model));
        }
        const scale = o.scale != null ? o.scale : [1, 1, 1];
        if (!Array.isArray(scale) || scale.length !== 3) throw new Error('Scene: scale must be [x, y, z], got ' + JSON.stringify(scale));
        scale.forEach((v, i) => {
            const n = this._num(v, 'scale[' + i + ']');
            if (n <= 0) throw new Error('Scene: scale[' + i + '] must be > 0, got ' + n);
        });
        const rot = o.rot != null ? o.rot : [0, o.heading != null ? this._num(o.heading, 'heading') : 0, 0];
        if (!Array.isArray(rot) || rot.length !== 3) throw new Error('Scene: rot must be [x, y, z] degrees, got ' + JSON.stringify(rot));
        rot.forEach((v, i) => this._num(v, 'rot[' + i + ']'));
        const def = {
            name: typeof o.name === 'string' && o.name ? o.name : this._unique(String(model).replace(/^.*\//, '').replace(/\.[a-z]+$/i, '')),
            model: model,
            kind: kind,
            x: this._num(o.x != null ? o.x : 0, 'x'),
            y: this._num(o.y != null ? o.y : 0, 'y'),
            h: this._num(o.h != null ? o.h : 0, 'h'),
            rot: rot.map(Number),
            scale: scale.map(Number)
        };
        if (o.clip != null) {
            if (typeof o.clip !== 'string') throw new Error('Scene: clip must be a string, got ' + JSON.stringify(o.clip));
            def.clip = o.clip;
        }
        if (o.anim != null) def.anim = o.anim;
        return def;
    },

    _unique(base) {
        const names = new Set(this._location().objects.map(r => r.def.name));
        const stem = String(base || 'object').replace(/-\d+$/, '');
        if (!names.has(stem)) return stem;
        for (let i = 2; ; i++) if (!names.has(stem + '-' + i)) return stem + '-' + i;
    },

    _rec(name) {
        const rec = this._location().objects.find(r => r.def.name === name);
        if (!rec) throw new Error('Scene: no object named ' + JSON.stringify(name) + ' (Scene.query() lists the scene)');
        return rec;
    },

    // --- commands --------------------------------------------------------------

    // model — a literal path from the game root (the assets/ directory); opts — { name?, kind?, x?, y?, h?, heading?, rot?,
    // scale?, clip?, anim? }. The object appears when the file loads (handle.loaded).
    spawn(model, opts) {
        const loc = this._location();
        const def = this._defFrom(model, opts);
        if (loc.objects.some(r => r.def.name === def.name)) throw new Error('Scene: an object named ' + JSON.stringify(def.name) + ' already exists');
        const rec = loc.addObject(def);
        return { name: def.name, def: def, loaded: rec.loaded };
    },

    // patch — any of { x, y, h, heading, rot, scale, clip, kind, name }: the def is edited
    // in place and re-placed, exactly like an editor field edit.
    move(name, patch) {
        const rec = this._rec(name);
        const p = patch || {}, d = rec.def;
        for (const k of ['x', 'y', 'h']) if (p[k] != null) d[k] = this._num(p[k], k);
        if (p.heading != null) d.rot = [d.rot[0], this._num(p.heading, 'heading'), d.rot[2]];
        if (p.rot != null) {
            if (!Array.isArray(p.rot) || p.rot.length !== 3) throw new Error('Scene: rot must be [x, y, z] degrees');
            d.rot = p.rot.map((v, i) => this._num(v, 'rot[' + i + ']'));
        }
        if (p.scale != null) {
            if (!Array.isArray(p.scale) || p.scale.length !== 3) throw new Error('Scene: scale must be [x, y, z]');
            d.scale = p.scale.map((v, i) => {
                const n = this._num(v, 'scale[' + i + ']');
                if (n <= 0) throw new Error('Scene: scale[' + i + '] must be > 0');
                return n;
            });
        }
        if (p.kind != null && p.kind !== d.kind) {
            if (p.kind !== 'prop' && p.kind !== 'actor') throw new Error("Scene: kind must be 'prop' or 'actor'");
            d.kind = p.kind;
        }
        if (p.clip !== undefined) {
            if (p.clip === null || p.clip === '') delete d.clip;
            else if (typeof p.clip === 'string') d.clip = p.clip;
            else throw new Error('Scene: clip must be a string or null');
        }
        this._location().placeObject(rec);
        return this.snapshot(rec);
    },

    remove(name) {
        const loc = this._location();
        const rec = loc.objects.find(r => r.def.name === name);
        if (!rec) return false;
        loc.removeObject(rec);
        return true;
    },

    follow(name) {
        const app = /** @type {any} */ (window).app;
        if (!app || !app.camera) throw new Error('Scene: the camera is not ready yet');
        if (name == null) { app.camera.follow(null); return null; }
        const rec = this._rec(name);
        // follow reads x/y every frame: hand it a live view of the def
        app.camera.follow({ get x() { return rec.def.x; }, get y() { return rec.def.y; } });
        return rec.def.name;
    },

    // --- queries ---------------------------------------------------------------

    snapshot(rec) {
        const d = rec.def;
        return {
            name: d.name, model: d.model, kind: d.kind,
            x: d.x, y: d.y, h: d.h, rot: d.rot.slice(), scale: d.scale.slice(),
            clip: d.clip != null ? d.clip : null,
            loaded: !!rec.mesh, error: rec.error
        };
    },

    // filter — { kind? , model? , name? } or a predicate; none — the whole scene.
    query(filter) {
        let recs = this._location().objects;
        if (typeof filter === 'function') recs = recs.filter(filter);
        else if (filter) recs = recs.filter(r =>
            (filter.kind == null || r.def.kind === filter.kind) &&
            (filter.model == null || r.def.model === filter.model) &&
            (filter.name == null || r.def.name === filter.name));
        return recs.map(r => this.snapshot(r));
    },

    // The agent's self-check: scene totals + the kit's lint, silent and frame-free.
    async inspect() {
        const loc = this._location();
        const snaps = this.query();
        const view = /** @type {any} */ (window).World3D ? /** @type {any} */ (window).World3D.view : null;
        let findings = [];
        let triangles = 0;
        if (view && /** @type {any} */ (window).Debug3D) {
            const r = await /** @type {any} */ (window).Debug3D.lint(view, { silent: true, frame: false });
            findings = r.findings;
            triangles = r.stats ? r.stats.triangles : 0;
        }
        return {
            objects: snaps.length,
            loaded: snaps.filter(s => s.loaded).length,
            errors: snaps.filter(s => s.error).map(s => ({ name: s.name, error: s.error })),
            triangles: triangles,
            fps: /** @type {any} */ (window).World3D ? Math.round(/** @type {any} */ (window).World3D.fps()) : 0,
            findings: findings
        };
    }
};
