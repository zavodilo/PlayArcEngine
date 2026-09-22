// Instances3D: the bake math without an engine — placement streams, the copy transform
// (mirror + heading + scale, equal to a Scene.spawn object with rot [0, heading°, 0]),
// normals and the batch split. pc/World3D are stubs: only pure functions run here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts, stub } from './browser-scripts.mjs';

const page = loadScripts(['js/Debug3D.js', 'js/Procedural3D.js', 'js/Instances3D.js'], { pc: stub(), World3D: stub() });
const Instances3D = page.get('Instances3D');
const Procedural3D = page.get('Procedural3D');

// A deterministic [0,1) stream (the draw order is the contract: spot, scale, heading).
function lcg(seed) {
    let a = seed >>> 0;
    return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}

test('scatterPoints: count, границы area, круг at, решётка grid, детерминизм', () => {
    const area = Instances3D.scatterPoints({ count: 200, area: { x: 1000, y: 500, w: 400, h: 200 } }, lcg(7));
    assert.equal(area.length, 200);
    for (const it of area) {
        assert.ok(Math.abs(it.x - 1000) <= 200 && Math.abs(it.y - 500) <= 100, 'внутри area');
        assert.equal(it.scale, 1);
        assert.equal(it.heading, 0);
        assert.equal(it.h, 0, 'h заполняет вызывающий (terrain)');
    }
    const same = Instances3D.scatterPoints({ count: 200, area: { x: 1000, y: 500, w: 400, h: 200 } }, lcg(7));
    assert.equal(Array.from(same, i => i.x.toFixed(3)).join(','), Array.from(area, i => i.x.toFixed(3)).join(','), 'один seed — один лес');
    const other = Instances3D.scatterPoints({ count: 200, area: { x: 1000, y: 500, w: 400, h: 200 } }, lcg(8));
    assert.notEqual(Array.from(other, i => i.x.toFixed(3)).join(','), Array.from(area, i => i.x.toFixed(3)).join(','));

    const circ = Instances3D.scatterPoints({ count: 100, at: { x: 10, y: -20, r: 50 } }, lcg(3));
    for (const it of circ) assert.ok(Math.hypot(it.x - 10, it.y + 20) <= 50 + 1e-9, 'внутри круга');

    const grid = Instances3D.scatterPoints({ count: 6, grid: { x: 0, y: 0, w: 300, h: 200, cols: 3, rows: 2, jitter: 0 } }, lcg(1));
    assert.equal(grid.length, 6);
    const xs = Array.from(grid, g => g.x).sort((a, b) => a - b);
    assert.deepEqual(xs, [-100, -100, 0, 0, 100, 100], 'центры ячеек решётки по x');
});

test('scatterPoints: scale-диапазон и random heading берутся из того же потока', () => {
    const items = Instances3D.scatterPoints({ count: 50, area: { x: 0, y: 0, w: 10, h: 10 }, scale: [0.5, 1.5], heading: 'random' }, lcg(11));
    for (const it of items) {
        assert.ok(it.scale >= 0.5 && it.scale <= 1.5, 'scale в диапазоне');
        assert.ok(it.heading >= 0 && it.heading < Math.PI * 2, 'heading в [0, 2π)');
    }
    const spread = new Set(Array.from(items, i => i.scale.toFixed(3)));
    assert.ok(spread.size > 40, 'scale разнообразен');
});

test('bake: копия стоит как Scene.spawn — зеркало (-x, h, y), heading как rotQuat(0, -θ, 0)', () => {
    const geo = Procedural3D.geometry('box', 1);
    const V = geo.positions.length / 3;
    const item = { x: 100, y: 200, h: 50, heading: 0, scale: 1 };
    const [b] = Instances3D.bake(geo, [item]);
    assert.equal(b.positions.length / 3, V);
    for (let v = 0; v < V; v++) {
        const lx = geo.positions[v * 3], ly = geo.positions[v * 3 + 1], lz = geo.positions[v * 3 + 2];
        assert.ok(Math.abs(b.positions[v * 3] - (-100 + lx)) < 1e-4, 'X = -x + lx (mirror of the PLACE, geometry is world-oriented — as an entity)');
        assert.ok(Math.abs(b.positions[v * 3 + 1] - (50 + ly)) < 1e-4, 'Y = h + ly');
        assert.ok(Math.abs(b.positions[v * 3 + 2] - (200 + lz)) < 1e-4, 'Z = y + lz');
    }

    // A quarter turn: the same matrix Location3D builds from rot [0, 90, 0] —
    // X' = cosθ·X + sinθ·Z, Z' = -sinθ·X + cosθ·Z (θ — heading, rad).
    const th = Math.PI / 2, ct = Math.cos(th), st = Math.sin(th);
    const [r] = Instances3D.bake(geo, [{ x: 0, y: 0, h: 0, heading: th, scale: 1 }]);
    for (let v = 0; v < V; v++) {
        const lx = geo.positions[v * 3], lz = geo.positions[v * 3 + 2];
        assert.ok(Math.abs(r.positions[v * 3] - (ct * lx + st * lz)) < 1e-4, 'поворот X');
        assert.ok(Math.abs(r.positions[v * 3 + 2] - (-st * lx + ct * lz)) < 1e-4, 'поворот Z');
    }
});

test('bake: масштабы по осям [map-x, height, map-y], нормали — обратный масштаб, единичные', () => {
    const geo = Procedural3D.geometry('box', 1);
    const [b] = Instances3D.bake(geo, [{ x: 0, y: 0, h: 0, heading: 0, scale: [2, 3, 4] }]);
    for (let v = 0; v < geo.positions.length / 3; v++) {
        assert.ok(Math.abs(b.positions[v * 3] - 2 * geo.positions[v * 3]) < 1e-4);
        assert.ok(Math.abs(b.positions[v * 3 + 1] - 3 * geo.positions[v * 3 + 1]) < 1e-4);
        assert.ok(Math.abs(b.positions[v * 3 + 2] - 4 * geo.positions[v * 3 + 2]) < 1e-4);
        const l = Math.hypot(b.normals[v * 3], b.normals[v * 3 + 1], b.normals[v * 3 + 2]);
        assert.ok(Math.abs(l - 1) < 1e-5, 'нормаль единичная');
    }
    // A flattened copy: the up normal stays up (the inverse scale keeps it honest).
    const [f] = Instances3D.bake({ positions: [0, 1, 0, 1, 1, 0, 0, 1, 1], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], color: [1, 1, 1] },
        [{ x: 0, y: 0, h: 0, heading: 0, scale: [1, 0.01, 1] }]);
    assert.ok(Math.abs(f.normals[1] - 1) < 1e-6, 'плоская копия: верх смотрит вверх');
});

test('bake: партии по maxBatchVerts, пустой список, цвет проходит насквозь', () => {
    const geo = Procedural3D.geometry('crate', 1);
    const V = geo.positions.length / 3;
    const items = Instances3D.scatterPoints({ count: 7, area: { x: 0, y: 0, w: 100, h: 100 } }, lcg(5));
    const batches = Instances3D.bake(geo, items, null, V * 3);
    assert.equal(batches.length, 3, '7 копий по 3 в партии');
    assert.equal(batches.reduce((n, b) => n + b.positions.length / 3, 0), 7 * V);
    assert.equal(Array.from(batches[0].color).join(','), Array.from(geo.color || [0.6, 0.6, 0.6]).join(','));
    assert.equal(Instances3D.bake(geo, []).length, 0);
});

test('bake: цвета частей едут с копиями', () => {
    const geo = Procedural3D.geometry('tree', 2);
    const batches = Instances3D.bake(geo, [{ x: 0, y: 0, h: 0, heading: 0, scale: 1 }, { x: 50, y: 0, h: 0, heading: 1, scale: 2 }]);
    assert.equal(batches.length, 1);
    const b = batches[0];
    assert.ok(b.colors && b.colors.length === b.positions.length, 'цвета по числу вершин партии');
    const V = geo.positions.length / 3;
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(b.colors[V * 3 + i] - geo.colors[i]) < 1e-6, 'вторая копия начинает с тех же цветов');
});
