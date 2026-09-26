// Gltf3D per-view model cache: a stale container (asset unloaded behind the cache) must NOT
// be handed out again — building from it feeds destroyed meshes to the render queue (the
// 'reading impl' crash in ForwardRenderer.draw). Regression: load -> unload behind the cache
// -> load again must produce a FRESH asset and container; a failed load must not be cached.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

class FakeAsset {
    constructor(name, type, opts) {
        this.name = name; this.type = type; this.url = opts && opts.url;
        this.loaded = false; this.resource = null; this._cbs = {};
    }
    once(ev, fn) { (this._cbs[ev] || (this._cbs[ev] = [])).push(fn); }
    _fire(ev, arg) { for (const fn of this._cbs[ev] || []) fn(arg); }
}

function harness() {
    const page = loadScripts(['js/Constants.js', 'js/engine/Gltf3D.js'], {
        pc: { Asset: FakeAsset },
    });
    const Gltf3D = page.get('Gltf3D');
    Gltf3D._cache = new Map();                       // a clean slate per test
    const registry = {
        added: [],
        add(a) { this.added.push(a); },
        load(a) { a.resource = { animations: [] }; a.loaded = true; a._fire('load'); },
    };
    const view = { uid: 'v-test', _assets: [], world: { app: { assets: registry } } };
    return { Gltf3D, registry, view };
}

test('cache hands the same model out while the container asset is alive', async () => {
    const { Gltf3D, registry, view } = harness();
    const a = await Gltf3D.load('assets/models/character.glb', view);
    const b = await Gltf3D.load('assets/models/character.glb', view);
    assert.equal(a, b, 'the cached promise resolves to the same model');
    assert.equal(registry.added.length, 1, 'the file is loaded once per view');
    assert.ok(Gltf3D._alive(a), 'a fresh model is alive');
});

test('an unloaded container is not reused: the next load fetches a fresh asset', async () => {
    const { Gltf3D, registry, view } = harness();
    const url = 'assets/models/character.glb';
    const first = await Gltf3D.load(url, view);
    assert.equal(registry.added.length, 1);
    // The registry unloaded the asset behind the cache (meshes destroyed): exactly what a
    // scene transition used to reuse through the cached promise.
    first.asset.resource = null;
    first.asset.loaded = false;
    assert.ok(!Gltf3D._alive(first), 'the stale model is detected');
    const second = await Gltf3D.load(url, view);
    assert.notEqual(second, first, 'the stale model is not handed out');
    assert.equal(registry.added.length, 2, 'a fresh asset is created for the reload');
    assert.notEqual(second.container, first.container);
    assert.ok(Gltf3D._alive(second), 'the reloaded model is alive');
});

test('a failed load is not cached: the retry hits the registry again', async () => {
    const { Gltf3D, registry, view } = harness();
    const url = 'assets/models/missing.glb';
    // First attempt errors instead of loading.
    const realLoad = registry.load;
    registry.load = (a) => { a._fire('error', new Error('404')); };
    await assert.rejects(() => Gltf3D.load(url, view));
    registry.load = realLoad;
    const m = await Gltf3D.load(url, view);
    assert.equal(registry.added.length, 2, 'the error was not cached');
    assert.ok(Gltf3D._alive(m));
});
