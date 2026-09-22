// Voxel3D: the pure meshing math — face culling, chunk split, winding along the authored
// normals (the lint convention), colors on the vertices. No engine: Mesh3D/pc stay stubs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts, stub } from './browser-scripts.mjs';

const page = loadScripts(['js/Debug3D.js', 'js/Procedural3D.js', 'js/Voxel3D.js'], { pc: stub(), World3D: stub() });
const Voxel3D = page.get('Voxel3D');
const Debug3D = page.get('Debug3D');

const store = (pairs) => new Map(pairs.map(([x, y, z, c]) => [Voxel3D.key(x, y, z), Voxel3D.color(c)]));

test('color: hex-строка, число, тройка; мусор — null', () => {
    assert.deepEqual(Array.from(Voxel3D.color('#ff8040')), [1, 128 / 255, 64 / 255]);
    assert.deepEqual(Array.from(Voxel3D.color(0xff8040)), [1, 128 / 255, 64 / 255]);
    assert.deepEqual(Array.from(Voxel3D.color([0.1, 0.2, 0.3])), [0.1, 0.2, 0.3]);
    assert.equal(Voxel3D.color('red'), null);
    assert.equal(Voxel3D.color([1, 2]), null);
});

test('один куб: шесть граней, winding вдоль нормалей (against = 0)', () => {
    const [g] = Voxel3D.meshChunks(store([[0, 0, 0, '#ffffff']]), 16);
    assert.equal(g.positions.length, 6 * 6 * 3, '6 граней × 6 вершин × 3');
    assert.equal(g.normals.length, g.positions.length);
    assert.equal(g.colors.length, g.positions.length);
    const idx = [];
    for (let i = 0; i < g.positions.length / 3; i++) idx.push(i);
    const w = Debug3D.windingAgainstNormals(g.positions, g.normals, idx, 10000);
    assert.equal(w.against, 0, 'виндинг вдоль нормалей, against=' + w.against);
    // куб стоит в зеркальном мире: map (0,0,0) -> world X ∈ [-1, 0], Z ∈ [0, 1]
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < g.positions.length; i += 3) {
        minX = Math.min(minX, g.positions[i]); maxX = Math.max(maxX, g.positions[i]);
        minY = Math.min(minY, g.positions[i + 1]); maxY = Math.max(maxY, g.positions[i + 1]);
        minZ = Math.min(minZ, g.positions[i + 2]); maxZ = Math.max(maxZ, g.positions[i + 2]);
    }
    assert.deepEqual([minX, maxX, minY, maxY, minZ, maxZ], [-1, 0, 0, 1, 0, 1], 'куб в зеркале карты');
});

test('скрытые грани: сосед откусывает общую стенку, коробка 2×2×2 — только снаружи', () => {
    const two = Voxel3D.meshChunks(store([[0, 0, 0, '#ff0000'], [1, 0, 0, '#ff0000']]), 16);
    assert.equal(two.length, 1);
    assert.equal(two[0].positions.length, 10 * 6 * 3, '10 видимых граней у пары');
    const box = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) box.push([x, y, z, '#00ff00']);
    const [b] = Voxel3D.meshChunks(store(box), 16);
    assert.equal(b.positions.length, 24 * 6 * 3, '6 сторон × 4 квадрата');
    // цвет держится на вершинах своей копии
    assert.ok(Array.from(b.colors.slice(0, 3)).every(v => v === 0 || v === 1));
});

test('чанки: граница chunk делит на партии; соседние вокселы читаются через неё', () => {
    const geoms = Voxel3D.meshChunks(store([[0, 0, 0, '#111111'], [16, 0, 0, '#222222'], [16, 0, 1, '#222222']]), 16);
    assert.equal(geoms.length, 2, 'два чанка');
    const keys = Array.from(geoms, g => g.key).sort();
    assert.equal(keys.join('|'), '0,0,0|1,0,0');
    const g1 = geoms.find(g => g.key === '0,0,0');
    assert.equal(g1.positions.length, 6 * 6 * 3, 'одиночный куб в своём чанке');
});
