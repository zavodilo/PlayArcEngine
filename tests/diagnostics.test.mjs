// E-1 — the kit's diagnostics canon is under contract.
// Why a file of its own: these functions are the single source BOTH the in-game diagnostics
// screen and the headless gates read, so their agreement is structural — and three failure
// classes born in a real port (Wanderburg) must stay dead:
//
//   * a cumulative counter read as a per-frame cost (the "4-8k draws/frame" myth) — frameDraws
//     must be a DELTA between consecutive 'postrender' events;
//   * an unavailable counter reported as 0 instead of null ("measured, and it is nothing" vs
//     "not measured") — every counter path asserts null discipline;
//   * a frustum metric recomputed game-side (naive pc.Frustum over one camera matrix) that
//     produced plausible garbage — culled() must sample the renderer's OWN decision
//     (visibleThisFrame on the documented 'postcull' event) and REFUSE to invent numbers when
//     the build does not expose it (ok:false + reason, never a fabricated split).
//
// Everything runs on pure fakes (scene/layers/event emitters) — no browser, no PlayCanvas.
// Cross-realm note: loadScripts runs the file in a vm context, so Maps/Sets/objects created
// THERE fail local `instanceof` and deepEqual prototype checks — the ink-registry fake is
// built with the vm realm's own Map (get('Map')), and results are compared through JSON.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

// The vm context has no timers of its own — Diagnostics' promise guards (setTimeout) need the
// host ones injected, exactly like a page would have them.
const boot = loadScripts(['js/presentation/Diagnostics.js'], { setTimeout, clearTimeout });
const { ctx, get } = boot;
const D = get('PlayArcDiagnostics');
const VMMap = get('Map');
const json = (v) => JSON.parse(JSON.stringify(v));

function emitter() {
    const hs = {};
    return {
        on(ev, fn) { (hs[ev] = hs[ev] || []).push(fn); },
        off(ev, fn) { hs[ev] = (hs[ev] || []).filter((f) => f !== fn); },
        emit(ev, arg) { for (const f of (hs[ev] || []).slice()) f(arg); },
        _hs: hs
    };
}

const mi = (visible, enabled) => ({ mesh: {}, node: { enabled: enabled !== false }, visibleThisFrame: visible });

function fakeApp(layers, counters) {
    const scene = Object.assign(emitter(), { layers: { layerList: layers } });
    return Object.assign(emitter(), { scene, graphicsDevice: {}, renderer: counters });
}

const world = (list) => ({ enabled: true, id: 0, name: 'World', meshInstances: list });

test('census: unique enabled instances across layers, disabled and UI-layer ones skipped', () => {
    const shared = mi(true), solo = mi(true), off = mi(true, false);
    const app = fakeApp([
        world([shared, solo, off]),
        { enabled: true, id: 11, name: 'overlay', meshInstances: [shared] },   // same instance, second layer
        { enabled: true, id: 13, name: 'UI', meshInstances: [mi(true)] },       // id > 12 — skipped
        { enabled: false, id: 1, name: 'Skybox', meshInstances: [mi(true)] }    // disabled layer — skipped
    ]);
    const c = json(D.census(app));
    assert.equal(c.instances, 2, 'shared counted once, disabled node skipped');
    assert.equal(c.base, 2);
    assert.equal(c.ink, 0);
    assert.deepEqual(c.byLayer, { '0:World': 2, '11:overlay': 1 }, 'per-layer counts, UI/absent layers not listed');
});

test('census: the ink registry splits base/ink whichever world the caller comes from', () => {
    // The registry lives on the game view; census must find it via window.app even when the
    // caller passes the ENGINE app (the headless-gate path) — otherwise ink silently folds
    // into base and the split lies with no sign of anything being wrong.
    const inkMi = mi(true), baseMi = mi(true);
    const app = fakeApp([world([inkMi, baseMi])]);
    // window.app := the game object whose location view carries the registry (ctx IS window)
    ctx.app = { location: { view: Object.assign({ app }, { _inks: new VMMap([['k', { mi: inkMi }]]) }) } };
    try {
        const c = json(D.census(app));
        assert.equal(c.instances, 2);
        assert.equal(c.ink, 1, 'ink ribbon recognized');
        assert.equal(c.base, 1);
    } finally {
        delete ctx.app;   // other cases must see a page without a game object
    }
});

test('census: no layers — null, never a zero-shaped object', () => {
    assert.equal(D.census({ scene: {}, graphicsDevice: {} }), null);
    assert.equal(D.census(null), null);
});

test('frameDraws: deltas between consecutive postrender events, not the cumulative counter', () => {
    const app = fakeApp([world([mi(true)])], { _forwardDrawCalls: 1000, _shadowDrawCalls: 10, _depthDrawCalls: 0 });
    const p = D.frameDraws(app, 3, 5000);
    app.renderer._forwardDrawCalls = 1670; app.emit('postrender');           // +670
    app.renderer._forwardDrawCalls = 2350; app.renderer._shadowDrawCalls = 12; app.emit('postrender'); // +680, shadow +2
    app.renderer._forwardDrawCalls = 3000; app.emit('postrender');           // +650
    return p.then((r) => {
        assert.equal(r.ok, true);
        assert.deepEqual(json(r.samples).map((s) => s.forward), [670, 680, 650], 'per-frame deltas');
        assert.equal(json(r.samples)[1].shadow, 2);
        assert.ok(json(r.samples)[0].culled == null || typeof json(r.samples)[0].culled === 'number');
    });
});

test('frameDraws: counters absent — ok:false "no counters", never zeros', () => {
    const app = fakeApp([world([])], undefined);
    const p = D.frameDraws(app, 2, 5000);
    app.emit('postrender');
    return p.then((r) => {
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'no counters');
        const s = json(r.samples)[0];
        assert.equal(s.forward, null, 'null, not 0');
    });
});

test('frameDraws: nothing renders — timeout with ok:false, not a hang', async () => {
    const app = fakeApp([world([])], { _forwardDrawCalls: 5 });
    const r = await D.frameDraws(app, 3, 60);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'timeout');
});

test('culled: samples the renderer decision (visibleThisFrame) on postcull per camera', async () => {
    const vis = [mi(true), mi(true), mi(false), mi(false), mi(false)];
    const app = fakeApp([world(vis)]);
    const cam = { entity: { name: 'main' } };
    const p = D.culled(app, 2, 5000);
    app.scene.emit('postcull', null);      // internal culling (shadow casters) — not a sample
    app.scene.emit('postcull', cam);
    vis[4].visibleThisFrame = true;        // the camera turned: one more instance visible
    app.scene.emit('postcull', cam);
    const r = json(await p);
    assert.equal(r.ok, true);
    assert.equal(r.samples.length, 2, 'null-camera pass did not consume a sample');
    assert.deepEqual(r.samples[0], { drawn: 2, culled: 3, unknown: 0, total: 5, camera: 'main' });
    assert.deepEqual(r.samples[1], { drawn: 3, culled: 2, unknown: 0, total: 5, camera: 'main' });
    for (const s of r.samples) assert.equal(s.drawn + s.culled + s.unknown, s.total, 'the split is exhaustive');
});

test('culled: build without visibleThisFrame — refusal with a reason, never a fabricated split', async () => {
    const noFlag = [{ mesh: {}, node: { enabled: true } }];
    const app = fakeApp([world(noFlag)]);
    const p = D.culled(app, 1, 5000);
    app.scene.emit('postcull', { entity: { name: 'main' } });
    const r = json(await p);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no visibleThisFrame');
    assert.equal(r.samples.length, 0, 'no numbers invented');
});

test('culled: no postcull at all — timeout with ok:false; no scene — null', async () => {
    const app = fakeApp([world([mi(true)])]);
    const r = json(await D.culled(app, 1, 60));
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'timeout');
    assert.equal(await D.culled({ scene: {}, graphicsDevice: {} }), null);
});

test('counters: every missing counter is null, never 0 (silence is a bug)', () => {
    const c = json(D._counters({ scene: { layers: { layerList: [] } }, graphicsDevice: {} }));
    assert.deepEqual(c, { forward: null, shadow: null, depth: null, culled: null, device: null });
});

test('glTrust: named software stacks are software, unknown adapters are NOT, silence says so', () => {
    const swift = json(D.glTrust(null, { renderer: 'Google SwiftShader', vendor: 'Google Inc.' }));
    assert.equal(swift.software, true);
    assert.ok(swift.note && swift.note.indexOf('программный рендер') === 0, 'note names the class');
    const warp = json(D.glTrust(null, { renderer: 'Software Adapter', vendor: 'Microsoft' }));
    assert.equal(warp.software, true, 'WARP reports with the bare word "Software"');
    const gpu = json(D.glTrust(null, { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', vendor: 'Google Inc.' }));
    assert.equal(gpu.software, false);
    assert.equal(gpu.note, null, 'a real GPU gets no scary note');
    const unknown = json(D.glTrust(null, { renderer: null, vendor: null }));
    assert.equal(unknown.software, false, 'unknown is not software — silence in reverse is forbidden too');
    assert.ok(unknown.note && unknown.note.indexOf('адаптер не сообщается') === 0);
});

test('snapshot: one call — context, adapter trust, draw deltas, culled split, census together', async () => {
    const app = fakeApp([world([mi(true), mi(true), mi(false)])], { _forwardDrawCalls: 100, _shadowDrawCalls: 0, _depthDrawCalls: 0 });
    const cam = { entity: { name: 'main' } };
    const p = D.snapshot(app);
    app.renderer._forwardDrawCalls = 240; app.emit('postrender');
    app.renderer._forwardDrawCalls = 390; app.emit('postrender');
    app.renderer._forwardDrawCalls = 520; app.emit('postrender');
    await new Promise((r) => setTimeout(r, 20));     // culled subscribes after frameDraws resolves
    app.scene.emit('postcull', cam);
    app.scene.emit('postcull', cam);
    app.scene.emit('postcull', cam);
    const s = json(await p);
    assert.equal(s.draws.ok, true);
    assert.equal(s.draws.forward, 150, 'peak delta over the sampled frames (140/150/130)');
    assert.equal(s.culled.ok, true);
    assert.equal(s.culled.drawn, 2);
    assert.equal(s.culled.culled, 1);
    assert.equal(s.culled.total, 3);
    assert.equal(s.census.instances, 3);
    assert.equal(s.variant, null, 'no PlayArcRuntime on the page — nulls, not invented strings');
    assert.ok(s.glTrust && typeof s.glTrust.software === 'boolean');
    assert.ok(s.webgl && s.webgl.renderer === null, 'no GL context in fakes — null fields');
});
