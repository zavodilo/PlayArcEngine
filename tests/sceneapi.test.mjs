// SceneAPI: the semantic layer validates and drives the location without 3D.
// PlayCanvas/World3D/Debug3D are stubs; the location is a fake record store — the
// contract (validation errors, snapshots, def edits) is what is tested.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts, stub } from './browser-scripts.mjs';

function makeScene() {
    const page = loadScripts(['js/Constants.js', 'js/UILayout.js', 'js/UI.js', 'js/SceneSchema.js',
        'js/Debug3D.js', 'js/Procedural3D.js', 'js/Instances3D.js', 'js/Voxel3D.js', 'js/SceneAPI.js'],
        { pc: stub(), World3D: stub(), Debug3D: { lint: async () => ({ findings: [], stats: { triangles: 0 } }) } });
    const loc = {
        objects: [],
        view: stub(),
        addObject(def) {
            const rec = { def, mesh: null, error: null, loaded: Promise.resolve(null) };
            this.objects.push(rec);
            return rec;
        },
        placeObject() { this.placed = (this.placed || 0) + 1; },
        removeObject(rec) { this.objects.splice(this.objects.indexOf(rec), 1); }
    };
    page.ctx.app = { location: loc, camera: { follow() {} } };
    page.ctx.World3D = { view: {}, fps: () => 60, addObject: () => {}, removeObject: () => {} };
    const cache = new Map();
    page.ctx.Model3D = {
        load: (p) => { if (!cache.has(p)) cache.set(p, Promise.resolve({})); return cache.get(p); },
        _cache: cache
    };
    return { Scene: page.get('Scene'), Kit: page.get('Kit'), Asset: page.get('Asset'), UI: page.get('UI'), Edit: page.get('Edit'), loc };
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
    assert.equal(r.errors.length, 0);
    assert.equal(r.findings.length, 0);   // the real Debug3D.lint runs on the stub view
    assert.equal(r.fps, 60);
});

test('Edit: транзакция коммитится атомарно, журнал пишется', () => {
    const { Scene, Edit } = makeScene();
    Scene.spawn('assets/models/mill.fbx', { name: 'mill' });
    const tx = Edit.begin('squad');
    tx.add('assets/models/mill.fbx', { name: 'a', x: 10, y: 10 })
      .add('assets/models/mill.fbx', { name: 'b', x: 20, y: 20 })
      .update('mill', { x: 500 });
    assert.equal(tx.ops().ops.map(o => o.op).join(','), 'add,add,update');   // cross-realm arrays: compare by value
    const r = tx.commit();
    assert.equal(r.applied.length, 3);
    assert.equal(Scene.query().length, 3);
    assert.equal(Scene.query({ name: 'mill' })[0].x, 500);
    const j = Scene.journal();
    assert.equal(j[0].status, 'committed');
    assert.equal(j[0].label, 'squad');
});

test('Edit: reject на валидации и rollback применения пишутся в журнал, сцена цела', () => {
    const { Scene, Edit } = makeScene();
    Scene.spawn('assets/models/mill.fbx', { name: 'mill', x: 100, y: 100 });
    // 1) validate catches the duplicate before anything is applied
    const tx = Edit.begin('bad');
    tx.add('assets/models/mill.fbx', { name: 'ok1' })
      .add('assets/models/mill.fbx', { name: 'ok1' });
    assert.throws(() => tx.commit(), /duplicate name/);
    assert.equal(JSON.stringify(Scene.query().map(s => [s.name, s.x])), '[["mill",100]]', 'сцена не тронута');
    assert.equal(Scene.journal().at(-1).status, 'rejected');
    // 2) a failure during APPLY rolls the snapshot back
    const tx2 = Edit.begin('apply-fail');
    tx2.add('assets/models/mill.fbx', { name: 'ghost' }).update('mill', { x: 777 });
    const loc = Scene._location();
    const realPlace = loc.placeObject.bind(loc);
    let blew = false;
    loc.placeObject = (rec) => {   // blow up ONCE, on the apply of the update (not on rollback)
        if (!blew && rec.def.name === 'mill') { blew = true; throw new Error('boom'); }
        realPlace(rec);
    };
    assert.throws(() => tx2.commit(), /boom/);
    loc.placeObject = realPlace;
    assert.equal(JSON.stringify(Scene.query().map(s => s.name).sort()), '["mill"]', 'ghost удалён откатом');
    assert.equal(Scene.query({ name: 'mill' })[0].x, 100, 'def mill восстановлен');
    assert.equal(Scene.journal().at(-1).status, 'rolledback');
});

test('Edit: rollback сброшенной транзакции пишется как discarded', () => {
    const { Scene, Edit } = makeScene();
    const tx = Edit.begin('drop');
    tx.add('assets/models/mill.fbx', { name: 'x' });
    tx.rollback();
    assert.equal(Scene.query().length, 0);
    assert.equal(Scene.journal().at(-1).status, 'discarded');
});

test('Kit: state, frame-хуки и часы; UI.query/patch валидируются по схеме', () => {
    const { Scene, Kit, UI } = makeScene();
    Kit.state('score', 10);
    assert.equal(Kit.state('score'), 10);
    assert.equal(Kit.state('missing'), undefined);
    let seen = 0;
    Kit.onFrame('ai', (dt) => { seen += dt; });
    Kit._run(0.5);
    assert.equal(seen, 0.5);
    assert.equal(Kit.dt(), 0.5);
    Kit.offFrame('ai');
    Kit._run(0.5);
    assert.equal(seen, 0.5, 'хук снят');
    // UI: layout из UILayout.js канона
    UI.applyLayout([{ id: 'hp', kind: 'bar', anchor: 'top-left', x: 10, y: 10, w: 100, h: 10, value: 0.5, color: '#5ad05a', fill: '#10202c', border: '', radius: 5, alpha: 1, visible: 1 }]);
    assert.equal(UI.query().length, 1);
    const patched = UI.patch('hp', { value: 0.25, w: 120 });
    assert.equal(patched.value, 0.25);
    assert.throws(() => UI.patch('hp', { value: 'half' }), /finite number/);
    assert.throws(() => UI.patch('hp', { kind: 'text' }), /immutable/);
    assert.throws(() => UI.patch('nope', { value: 1 }), /no element/);
    assert.ok(Scene.query, 'Scene на месте');
});

test('Asset: list/loaded/preload без pc.*', async () => {
    const { Scene, Asset } = makeScene();
    Scene.spawn('assets/models/mill.fbx', { name: 'mill' });
    const list = Asset.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].path, 'assets/models/mill.fbx');
    assert.equal(await Asset.preload('assets/models/character.glb'), true);
    assert.equal(Asset.loaded('assets/models/character.glb'), true);
    assert.equal(Asset.loaded('assets/models/nope.fbx'), false);
});

test('Scene.seed: последовательность Scene.random воспроизводима', () => {
    const { Scene } = makeScene();
    Scene.seed(7);
    const a = [Scene.random(), Scene.random(), Scene.random()];
    Scene.seed(7);
    const b = [Scene.random(), Scene.random(), Scene.random()];
    assert.deepEqual(a, b);
    Scene.seed(8);
    assert.notDeepEqual(a, [Scene.random(), Scene.random(), Scene.random()]);
});

test('inspect: фильтры kind/name/area и машиночитаемый отчёт (entities/camera/warnings)', async () => {
    const { Scene } = makeScene();
    Scene.spawn('assets/models/mill.fbx', { name: 'a', x: 100, y: 100 });
    Scene.spawn('assets/models/mill.fbx', { name: 'b', x: 900, y: 900 });
    Scene.spawn('assets/models/character.glb', { name: 'hero', kind: 'actor', x: 500, y: 500 });
    const all = await Scene.inspect();
    assert.equal(all.objects, 3);
    assert.equal(all.entities.length, 3);
    assert.equal(JSON.stringify(all.entities[0].position), '[100,100,0]');   // cross-realm
    assert.equal(all.entities[0].id, 'a');
    assert.ok(Array.isArray(all.warnings));
    const area = await Scene.inspect({ area: [0, 0, 200, 200] });
    assert.equal(area.entities.map(e => e.id).join(','), 'a');
    const kind = await Scene.inspect({ kind: 'actor' });
    assert.equal(kind.entities.map(e => e.id).join(','), 'hero');
    const one = await Scene.inspect({ name: 'b' });
    assert.equal(one.entities.map(e => e.id).join(','), 'b');
    assert.equal(all.camera, null, 'без камеры в стабе camera = null');
});

test('scatter: валидация до выпечки — count, размещение, источник, имя', () => {
    const { Scene } = makeScene();
    assert.throws(() => Scene.scatter({ count: 0, kind: 'tree', area: { x: 0, y: 0, w: 10, h: 10 } }), /count must be > 0/);
    assert.throws(() => Scene.scatter({ count: 5, kind: 'tree' }), /at \{x,y,r\}, area/);
    assert.throws(() => Scene.scatter({ count: 5, area: { x: 0, y: 0, w: 10, h: 10 } }), /kind .* or geometry/);
    const h = Scene.scatter({ count: 4, kind: 'tree', area: { x: 0, y: 0, w: 100, h: 100 }, seed: 3, name: 'forest' });
    assert.equal(h.name, 'forest');
    assert.equal(h.count, 4);
    assert.ok(h.batches >= 1);
    assert.throws(() => Scene.scatter({ count: 2, kind: 'rock', at: { x: 0, y: 0, r: 50 }, name: 'forest' }), /already exists/);
});

test('scatter: детерминизм по seed, terrain-выравнивание, queryScatter, remove', async () => {
    const a = makeScene(), b = makeScene();
    const ha = a.Scene.scatter({ count: 8, kind: 'rock', at: { x: 500, y: 500, r: 200 }, seed: 42, scale: [0.8, 1.4], heading: 'random' });
    const hb = b.Scene.scatter({ count: 8, kind: 'rock', at: { x: 500, y: 500, r: 200 }, seed: 42, scale: [0.8, 1.4], heading: 'random' });
    const ia = a.Scene._scatters.get(ha.name).instances.items, ib = b.Scene._scatters.get(hb.name).instances.items;
    assert.equal(ia.map(i => [i.x.toFixed(3), i.y.toFixed(3), i.scale.toFixed(3), i.heading.toFixed(3)].join('|')).join(';'),
        ib.map(i => [i.x.toFixed(3), i.y.toFixed(3), i.scale.toFixed(3), i.heading.toFixed(3)].join('|')).join(';'), 'один seed — одна поляна');

    const c = makeScene();
    c.loc.terrain = { heightAt: (x, y) => 10 + (x % 7) };
    const hc = c.Scene.scatter({ count: 5, kind: 'tree', area: { x: 0, y: 0, w: 50, h: 50 }, seed: 1 });
    const ic = c.Scene._scatters.get(hc.name).instances.items;
    for (const it of ic) assert.equal(it.h, 10 + (it.x % 7), 'копии стоят на земле');
    const hf = c.Scene.scatter({ count: 3, kind: 'crate', area: { x: 0, y: 0, w: 50, h: 50 }, seed: 1, align: 'flat', h: 25 });
    for (const it of c.Scene._scatters.get(hf.name).instances.items) assert.equal(it.h, 25, "align: 'flat' — одна высота");

    const list = c.Scene.queryScatter();
    assert.equal(list.length, 2);
    assert.equal(Array.from(list, x => x.name).sort().join(','), [hc.name, hf.name].sort().join(','));
    assert.equal(list.find(x => x.name === hc.name).source, 'tree');
    assert.equal(c.Scene.remove(hc.name), true);
    assert.equal(c.Scene.queryScatter().length, 1);
    const rep = await c.Scene.inspect();
    assert.equal(rep.scatters.length, 1, 'inspect() показывает живые scatter-партии');
});

test('scatter без seed идёт из потока сессии: Scene.seed повторяет раскладку', () => {
    const grab = (S) => { S.seed(9); return S.scatter({ count: 6, kind: 'pole', area: { x: 0, y: 0, w: 90, h: 90 } }); };
    const a = makeScene(), b = makeScene();
    const ha = grab(a.Scene), hb = grab(b.Scene);
    const ia = a.Scene._scatters.get(ha.name).instances.items, ib = b.Scene._scatters.get(hb.name).instances.items;
    assert.equal(ia.map(i => i.x.toFixed(6)).join(','), ib.map(i => i.x.toFixed(6)).join(','));
});

test('voxel: фасад Scene строит объём по кубу, коробка, расчистка', () => {
    const { Scene } = makeScene();
    assert.equal(Scene.voxelCount(), 0, 'объёма ещё нет');
    assert.equal(Scene.voxelSet(4, 2, 0, '#7a5230'), 1);
    assert.equal(Scene.voxelFill(4, 2, 1, 6, 4, 2, 0x8a8a8a), 1 + 3 * 3 * 2);
    assert.equal(Scene.voxelCount(), 19);
    const vol = Scene.voxelVolume();
    assert.equal(Array.from(vol.get(5, 3, 1), v => v.toFixed(4)).join(','),
        [0x8a / 255, 0x8a / 255, 0x8a / 255].map(v => v.toFixed(4)).join(','));
    assert.equal(vol.nodes.size >= 1, true, 'чанк замешился');
    assert.equal(Scene.voxelClear(4, 2, 0), 18);
    assert.equal(Scene.voxelClearAll(), 0);
    assert.equal(vol.nodes.size, 0, 'меши выброшены');
    assert.throws(() => Scene.voxelSet(1, 1, 1, 'red'), /bad color/);
});
