// SceneAPI: the semantic layer validates and drives the location without 3D.
// PlayCanvas/World3D/Debug3D are stubs; the location is a fake record store — the
// contract (validation errors, snapshots, def edits) is what is tested.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts, stub } from './browser-scripts.mjs';

function makeScene() {
    const page = loadScripts(['js/Constants.js', 'js/SceneSchema.js', 'js/SceneAPI.js'],
        { pc: stub(), World3D: stub(), Debug3D: { lint: async () => ({ findings: [], stats: { triangles: 0 } }) } });
    const loc = {
        objects: [],
        addObject(def) {
            const rec = { def, mesh: null, error: null, loaded: Promise.resolve(null) };
            this.objects.push(rec);
            return rec;
        },
        placeObject() { this.placed = (this.placed || 0) + 1; },
        removeObject(rec) { this.objects.splice(this.objects.indexOf(rec), 1); }
    };
    page.ctx.app = { location: loc, camera: { follow() {} } };
    page.ctx.World3D = { view: {}, fps: () => 60 };
    return { Scene: page.get('Scene'), loc };
}

test('манифест доступен агенту: константы с диапазонами, поля объекта, API', () => {
    const { Scene } = makeScene();
    const m = Scene.manifest();
    assert.ok(m.constants.length > 50);
    const fov = m.constants.find(c => c.name === 'CAMERA_FOV_DEG');
    assert.equal(fov.min, 20);
    assert.equal(fov.value, 52);
    assert.equal(m.object.fields.kind.enum.join(','), 'prop,actor');
    assert.ok(m.api.spawn.includes('Scene.spawn'));
});

test('spawn: валидация до записи в сцену — kind, model, scale, rot', () => {
    const { Scene, loc } = makeScene();
    assert.throws(() => Scene.spawn('assets/m.fbx', { kind: 'boss' }), /kind must be/);
    assert.throws(() => Scene.spawn('models/m.fbx'), /literal path/);
    assert.throws(() => Scene.spawn('assets/m.fbx', { scale: [1, -1, 1] }), /scale\[1\] must be > 0/);
    assert.throws(() => Scene.spawn('assets/m.fbx', { x: NaN }), /finite number/);
    assert.throws(() => Scene.spawn('assets/m.fbx', { rot: [0, 0] }), /rot must be/);
    assert.equal(loc.objects.length, 0, 'ничего не записано после ошибок');
    const h = Scene.spawn('assets/models/mill.fbx', { x: 10, y: 20, heading: 90 });
    assert.equal(h.def.rot[1], 90);
    assert.equal(h.def.kind, 'prop');
    assert.equal(h.name, h.def.name);
    assert.equal(loc.objects.length, 1);
    // имена уникальны
    const h2 = Scene.spawn('assets/models/mill.fbx', {});
    assert.notEqual(h2.name, h.name);
    assert.throws(() => Scene.spawn('assets/m.fbx', { name: h.name }), /already exists/);
});

test('move: правит def на месте и переставляет объект; clip null убирает клип', () => {
    const { Scene, loc } = makeScene();
    Scene.spawn('assets/models/character.glb', { name: 'hero', kind: 'actor', clip: 'idle' });
    const s = Scene.move('hero', { x: 100, heading: 45, clip: null });
    assert.equal(s.x, 100);
    assert.equal(s.rot[1], 45);
    assert.equal(s.clip, null);
    assert.equal(loc.objects[0].def.x, 100, 'def правится на месте (канон Objects.js)');
    assert.ok(loc.placed >= 1);
    assert.throws(() => Scene.move('hero', { scale: [0, 1, 1] }), /scale\[0\] must be > 0/);
    assert.throws(() => Scene.move('nobody', { x: 1 }), /no object named/);
});

test('query/remove: снимки — plain JSON, фильтр по kind, remove по имени', () => {
    const { Scene } = makeScene();
    Scene.spawn('assets/models/mill.fbx', { name: 'mill', kind: 'prop' });
    Scene.spawn('assets/models/character.glb', { name: 'hero', kind: 'actor' });
    assert.equal(Scene.query().length, 2);
    const actors = Scene.query({ kind: 'actor' });
    assert.deepEqual(actors.map(s => s.name), ['hero']);
    assert.equal(typeof JSON.stringify(Scene.query()), 'string');
    assert.equal(Scene.remove('mill'), true);
    assert.equal(Scene.remove('mill'), false);
    assert.deepEqual(Scene.query().map(s => s.name), ['hero']);
});

test('inspect: итоги сцены и findings линта без кадра', async () => {
    const { Scene } = makeScene();
    Scene.spawn('assets/models/mill.fbx', { name: 'mill' });
    const r = await Scene.inspect();
    assert.equal(r.objects, 1);
    assert.equal(r.loaded, 0);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.findings, []);
    assert.equal(r.fps, 60);
});
