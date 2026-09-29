// Diagnostics.js — one honest snapshot of what the running build actually is.
//
// Kit-level diagnostics for ANY game on ArcEngine: the in-game diagnostics screen and the
// headless gates (tools/headless-gate.mjs, a game's deploy probe) read the SAME functions,
// which makes their agreement structural instead of a promise. This canon was distilled from
// porting a real game (Wanderburg): the game-side copy of this file and its gates produced
// every rule below the hard way, and the kit now ships them so the next game does not
// reinvent (or re-mythologize) them.
//
// Layering: presentation/engine level — knows the runtime, the scene layers and the renderer
// counters; knows NOTHING about a game's saves, entities or rules.
//
// Three load-bearing rules:
//   1. Silence is a bug — an unavailable counter is reported as null, never as 0. A zero
//      reads as "measured, and it is nothing" when the truth is "not measured".
//   2. A counter must reset or be a delta — the renderer's pass counters are CUMULATIVE and
//      nothing resets them without profiling, so per-frame cost is a DELTA between two
//      consecutive 'postrender' events (exactly one rendered frame apart). Reading the raw
//      counter is how "4-8k draws/frame" myths are born.
//   3. Read the renderer's decisions, do not recompute them — a frustum metric recomputed
//      game-side (a naive pc.Frustum over one camera matrix over AABBs) produced plausible
//      garbage ("2102 of 2115 instances culled" next to ~1300 real draws/frame) because the
//      render pass does not cull with that matrix. The documented truth is
//      MeshInstance.visibleThisFrame, sampled on the scene's 'postcull' event (EVENT_POSTCULL:
//      "mesh instance visibility ... is up to date when this fires") — the renderer's own
//      per-camera decision. The engine's _numDrawCallsCulled counter is dead in the vendored
//      build (assigned, never incremented) and must not be trusted even when it exists.
//
//     const snap = await PlayArcDiagnostics.snapshot();   // engine side, full picture
//     PlayArcDiagnostics.census();                        // unique enabled mesh instances
//     await PlayArcDiagnostics.frameDraws();              // per-frame GL draws, as deltas
//     await PlayArcDiagnostics.culled();                  // drawn vs frustum-culled, per camera pass

const PlayArcDiagnostics = {
    /**
     * Resolve the PlayCanvas application. The game object handed to a page is NOT the engine:
     * the engine app hangs off the location view (`app.location.view.app`) — the same path the
     * headless gates measure through, which is what makes the two agree.
     * @param {any} [app]
     * @returns {any|null}
     */
    _engineApp(app) {
        const g = app || (typeof window !== 'undefined' ? window.app : null);
        if (!g) return null;
        const view = g.location && g.location.view;
        const eng = (view && view.app) || null;
        // accept an engine app passed directly (it has graphicsDevice/scene of its own)
        if (eng && (eng.graphicsDevice || eng.scene)) return eng;
        if (g.graphicsDevice || g.scene) return g;
        return eng || null;
    },

    /**
     * Renderer pass counters, or null where the build does not expose one (never 0).
     * @param {any} [app] the PlayCanvas application
     */
    _counters(app) {
        const a = PlayArcDiagnostics._engineApp(app);
        const rt = (a && a.renderer) || {};
        const dev = (a && a.graphicsDevice) || {};
        const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
        return {
            forward: num(rt._forwardDrawCalls),
            shadow: num(rt._shadowDrawCalls),
            depth: num(rt._depthDrawCalls),
            culled: num(rt._numDrawCallsCulled),
            device: num(dev._drawCallsPerFrame)
        };
    },

    /**
     * Walk the world/actor/overlay layers and collect the UNIQUE enabled mesh instances.
     * One instance sits in several layers at once (world pass, ink-edge pass, actor pass), so
     * a per-layer sum would count the same hull three times.
     * @param {any} a the engine app
     * @returns {{set:Set<any>, byLayer:Object}|null}
     */
    _walk(a) {
        const scene = a && a.scene;
        if (!scene || !scene.layers) return null;
        const set = new Set();
        const byLayer = {};
        for (const layer of scene.layers.layerList) {
            if (!layer.enabled || layer.id > 12) continue;          // world/actor/overlay, not ui
            const list = (layer.instances && layer.instances.meshInstances) || layer.meshInstances || [];
            let n = 0;
            for (const mi of list) {
                if (!mi.mesh || !mi.node || !mi.node.enabled) continue;
                set.add(mi);
                n++;
            }
            if (n || layer.enabled) byLayer[layer.id + ':' + (layer.name || '?')] = n;
        }
        return { set: set, byLayer: byLayer };
    },

    /**
     * Count what COULD draw: UNIQUE enabled mesh instances of the world/actor/overlay layers.
     * Frustum culling only ever lowers the real per-frame number, so this is an upper bound,
     * not the frame cost (the frame cost is frameDraws(); the culling split is culled()).
     * @param {any} [app] the PlayCanvas application
     * @returns {{instances:number, base:number, ink:number, byLayer:Object}|null}
     */
    census(app) {
        const a = PlayArcDiagnostics._engineApp(app);
        const w = PlayArcDiagnostics._walk(a);
        if (!w) return null;
        // The ink registry lives on the game's location view, not on the engine app — reading
        // it from the wrong object would fold every ink ribbon into `base` and report a wrong
        // split with no sign of anything being wrong. The caller may hand us the game object
        // (the in-game page) or the engine app (a headless gate). Search BOTH worlds for the
        // registry, so the ink/base split is the same either way.
        const game = (typeof window !== 'undefined' ? window.app : null) || null;
        const view = game && game.location && game.location.view;
        let inkHost = null;
        // The registry has lived on different hosts across kit versions, so every plausible
        // carrier is probed; the cast keeps the probe list honest without inventing types.
        const v = /** @type {any} */ (view);
        const g = /** @type {any} */ (game);
        const e = /** @type {any} */ (a);
        const carriers = [app, a, g, v, v && v.view, v && v.world, v && v.worldView,
            e && e.location, e && e.arcView, g && g.arcView];
        for (const c of carriers.filter(Boolean)) {
            if (c && c._inks instanceof Map && (!inkHost || c._inks.size > inkHost._inks.size)) inkHost = c;
        }
        const inkSet = new Set();
        if (inkHost) for (const ink of inkHost._inks.values()) if (ink && ink.mi) inkSet.add(ink.mi);
        let base = 0;
        for (const mi of w.set) if (!inkSet.has(mi)) base++;
        return { instances: w.set.size, base: base, ink: w.set.size - base, byLayer: w.byLayer };
    },

    /**
     * The honest frustum-culling split, sampled from the renderer's OWN decisions: the scene
     * fires 'postcull' per camera after visibility culling, and MeshInstance.visibleThisFrame
     * is up to date at that moment (vendored playcanvas.d.ts, Scene.EVENT_POSTCULL). One
     * sample = one camera's culling pass (a single-camera game yields one sample per frame);
     * camera === null marks internal culling (shadow casters) and is skipped.
     *
     * Honest about pools: instances an entity pool "parks" outside the frustum are counted as
     * culled — that IS the renderer's decision about them. A game that wants "parked" told
     * apart from scene content subtracts its own pool registry; the kit does not guess.
     *
     * Never invents numbers: no postcull within the timeout, or a build where instances do not
     * carry a boolean visibleThisFrame, resolves { ok: false, reason } (rule 1).
     *
     * @param {any} [app] the PlayCanvas application
     * @param {number} [frames] how many camera passes to sample (default 3)
     * @param {number} [timeoutMs] give up and report ok:false rather than hang (default 8000)
     * @returns {Promise<{ok:boolean, reason?:?string, samples:Array<{drawn:number, culled:number, unknown:number, total:number, camera:?string}>}|null>}
     */
    culled(app, frames, timeoutMs) {
        const a = PlayArcDiagnostics._engineApp(app);
        const scene = a && a.scene;
        if (!scene || typeof scene.on !== 'function') return Promise.resolve(null);
        const want = Math.max(1, frames || 3);
        const limit = timeoutMs || 8000;
        return new Promise((resolve) => {
            const out = [];
            let unsupported = false;
            const done = (v) => { scene.off('postcull', h); clearTimeout(timer); resolve(v); };
            const h = (camera) => {
                if (!camera) return;                    // internal culling (shadow casters)
                const w = PlayArcDiagnostics._walk(a);
                if (!w) { done({ ok: false, reason: 'no layers', samples: out }); return; }
                let drawn = 0, unknown = 0;
                for (const mi of w.set) {
                    if (typeof mi.visibleThisFrame !== 'boolean') { unknown++; continue; }
                    if (mi.visibleThisFrame) drawn++;
                }
                if (unknown > 0 && drawn === 0 && unknown === w.set.size && w.set.size > 0) {
                    unsupported = true;                 // this build does not expose the flag
                    done({ ok: false, reason: 'no visibleThisFrame', samples: out });
                    return;
                }
                out.push({
                    drawn: drawn, culled: w.set.size - drawn - unknown, unknown: unknown,
                    total: w.set.size, camera: (camera.entity && camera.entity.name) || null
                });
                if (out.length >= want) done({ ok: true, samples: out });
            };
            const timer = setTimeout(() => {
                done(out.length
                    ? { ok: true, samples: out }
                    : { ok: false, reason: unsupported ? 'no visibleThisFrame' : 'timeout', samples: [] });
            }, limit);
            scene.on('postcull', h);
        });
    },

    /**
     * Per-frame GL draws as DELTAS between consecutive 'postrender' events.
     * @param {any} [app] the PlayCanvas application
     * @param {number} [frames] how many frame deltas to sample (default 3)
     * @param {number} [timeoutMs] give up and report ok:false rather than hang (default 8000)
     */
    frameDraws(app, frames, timeoutMs) {
        const a = PlayArcDiagnostics._engineApp(app);
        if (!a || typeof a.on !== 'function') return Promise.resolve(null);
        const want = Math.max(1, frames || 3);
        const limit = timeoutMs || 8000;
        return new Promise((resolve) => {
            const out = [];
            let last = PlayArcDiagnostics._counters(a);
            const done = (v) => { a.off('postrender', h); clearTimeout(timer); resolve(v); };
            const h = () => {
                const s = PlayArcDiagnostics._counters(a);
                const d = {};
                let any = false;
                for (const k of Object.keys(s)) {
                    if (s[k] == null || last[k] == null) { d[k] = null; continue; }
                    d[k] = s[k] - last[k];
                    any = true;
                }
                out.push(d);
                last = s;
                if (!any) { done({ ok: false, reason: 'no counters', samples: out }); return; }
                if (out.length >= want) done({ ok: true, samples: out });
            };
            const timer = setTimeout(() => {
                done(out.length ? { ok: true, samples: out } : { ok: false, reason: 'timeout', samples: [] });
            }, limit);
            a.on('postrender', h);
        });
    },

    /**
     * WebGL version and renderer string, or null fields where the context will not say.
     * @param {any} [app] the PlayCanvas application
     */
    webgl(app) {
        const a = PlayArcDiagnostics._engineApp(app);
        const gl = a && a.graphicsDevice && a.graphicsDevice.gl;
        if (!gl) return { version: null, renderer: null, vendor: null };
        let renderer = null, vendor = null;
        try {
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) {
                renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
            }
        } catch (e) { renderer = null; }
        let version = null;
        try { version = gl.getParameter(gl.VERSION); } catch (e) { version = null; }
        return { version: version, renderer: renderer, vendor: vendor };
    },

    /**
     * Is this adapter a SOFTWARE renderer? Under headless swiftshader rAF degrades to 1-8 fps
     * while the JS phases of a frame still total ~25 ms, so an fps readout LOOKS like a frame
     * budget and is not one — the bottleneck is the page's compositing, not the game. Reading
     * the renderer string is not enough: it has to be interpreted, or a diagnostics screen
     * shows «адаптер: SwiftShader» next to an FPS figure with nothing connecting the two.
     *
     * Deliberately a DENYLIST of named software stacks, not "anything unfamiliar": an unknown
     * real GPU must never be told its numbers are worthless. An adapter that will not name
     * itself is reported as unknown, and `software` stays false — unknown is not software, and
     * claiming otherwise would be the same silence-in-reverse rule 1 forbids.
     *
     * @param {any} [app] the PlayCanvas application
     * @param {{version?:?string, renderer?:?string, vendor?:?string}} [info] pre-read adapter
     *        info; pass it to classify without a GL context (that is how the case tests it).
     * @returns {{software:boolean, renderer:?string, note:?string}}
     */
    glTrust(app, info) {
        const w = info || PlayArcDiagnostics.webgl(app);
        const r = (w && typeof w.renderer === 'string' && w.renderer) ? w.renderer : null;
        if (!r) {
            return { software: false, renderer: null, note: 'адаптер не сообщается — вывод о темпе невозможен' };
        }
        const hay = (r + ' ' + ((w && w.vendor) || '')).toLowerCase();
        // 'software' берём голым словом: так рапортует WARP («Software Adapter») — настоящий
        // программный растеризатор в CI и виртуалках. Ложное срабатывание на имени реального GPU
        // тут практически невозможно, а пропуск стоил бы доверия к цифре FPS.
        const SOFTWARE = ['swiftshader', 'llvmpipe', 'softpipe', 'software',
            'basic render driver', 'microsoft basic', 'mesa offscreen', 'virgl', 'virtualbox', 'vmware svga'];
        const hit = SOFTWARE.filter((k) => hay.indexOf(k) >= 0);
        return {
            software: hit.length > 0,
            renderer: r,
            note: hit.length
                ? 'программный рендер (' + hit[0] + ') — FPS здесь скорость эмуляции, а не темп игры; темп измеряют на живом GPU'
                : null
        };
    },

    /**
     * The whole engine-side picture in one call. Every field is either a real value or null —
     * this object is meant to be read by a human (or an agent) who is trying to fix something.
     * @param {any} [app] the PlayCanvas application
     */
    async snapshot(app) {
        const a = PlayArcDiagnostics._engineApp(app);
        const ctx = (typeof PlayArcRuntime !== 'undefined' && PlayArcRuntime.context)
            ? PlayArcRuntime.context() : null;
        const draws = await PlayArcDiagnostics.frameDraws(a);
        const cul = await PlayArcDiagnostics.culled(a);
        const samples = (draws && draws.samples) || [];
        const peak = (key) => {
            let m = null;
            for (const s of samples) {
                if (s[key] == null) continue;
                if (m == null || s[key] > m) m = s[key];
            }
            return m;
        };
        // median over camera-pass samples: a single pass can catch a culling trough or a spike
        const cmed = (key) => {
            const vals = ((cul && cul.samples) || []).map((s) => s[key]).filter((v) => v != null).sort((x, y) => x - y);
            return vals.length ? vals[vals.length >> 1] : null;
        };
        return {
            variant: ctx ? ctx.variant : null,
            profile: ctx ? ctx.profile : null,
            instance: ctx ? ctx.instance : null,
            contractHash: ctx ? ctx.contractHash : null,
            gameplayHash: ctx ? ctx.gameplayHash : null,
            saveSchemaHash: ctx ? ctx.saveSchemaHash : null,
            headless: ctx ? ctx.headless : null,
            webgl: PlayArcDiagnostics.webgl(a),
            glTrust: PlayArcDiagnostics.glTrust(a),
            draws: {
                ok: !!(draws && draws.ok),
                reason: draws && draws.reason ? draws.reason : null,
                // peak over the sampled frames: a single frame can catch a culling trough
                forward: peak('forward'),
                shadow: peak('shadow'),
                depth: peak('depth'),
                device: peak('device')
            },
            culled: {
                ok: !!(cul && cul.ok),
                reason: cul && cul.reason ? cul.reason : null,
                drawn: cmed('drawn'),
                culled: cmed('culled'),
                total: cmed('total')
            },
            census: PlayArcDiagnostics.census(a)
        };
    }
};
