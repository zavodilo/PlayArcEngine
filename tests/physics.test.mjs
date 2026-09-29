// Physics: rays, areas and distances over the WorldMap — no renderer, no browser.
// The map is built by hand so every assertion names a tile it can point at.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPipeline, scanAssets, ROOT } from '../tools/headless.mjs';

const kit = bootPipeline({ files: scanAssets(ROOT), quiet: true });
const { Physics, World, Entity } = kit;
const T = 64;   // World.TILE_PX — the center of tile (tx, tz) is ((tx + 0.5) * T, (tz + 0.5) * T)

/** A 10x10 map, border walls, one full-height divider at tx = 5 with a gap at tz = 5. */
function dividedMap() {
    const w = World.sample({ cols: 10, rows: 10 });
    for (let tz = 1; tz <= 8; tz++) if (tz !== 5) w.setTile(5, tz, 'wall');
    return w;
}

test('Physics.distance: horizontal by contract, distance3 adds height', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 3 * T, y: 40, z: 4 * T };
    assert.equal(Physics.distance(a, b), 5 * T, 'a 3-4-5 triangle on the ground plane');
    assert.ok(Physics.distance3(a, b) > Physics.distance(a, b), 'height only lengthens distance3');
    assert.throws(() => Physics.distance(a, { x: 1 }), /need x and z/, 'a half point is an error, not 0');
});

test('Physics.blocked: the map answers, and a missing world throws instead of lying', () => {
    const w = dividedMap();
    assert.equal(Physics.blocked(w, 5.5 * T, 2.5 * T), true, 'the divider blocks');
    assert.equal(Physics.blocked(w, 2.5 * T, 2.5 * T), false, 'open floor does not');
    assert.equal(Physics.blocked(w, -100, 100), true, 'outside the map blocks');
    assert.throws(() => Physics.blocked(null, 1, 1), /pass a WorldMap/,
        '"not blocked" would let an AI walk through a wall');
});

test('Physics.raycast: hits the first wall and reports where', () => {
    const w = dividedMap();
    const hit = Physics.raycast(w, { x: 2.5 * T, z: 2.5 * T }, { x: 7.5 * T, z: 2.5 * T });
    assert.equal(hit.hit, true);
    assert.equal(hit.x, 5 * T, 'stops at the divider’s near edge');
    assert.equal(hit.dist, 2.5 * T);
    assert.equal(hit.total, 5 * T, 'the full length is still reported');

    const clear = Physics.raycast(w, { x: 2.5 * T, z: 2.5 * T }, { x: 4.5 * T, z: 2.5 * T });
    assert.equal(clear.hit, false);
    assert.equal(clear.x, 4.5 * T, 'a miss reports the target');
});

test('Physics.raycast: the target tile itself is tested, the start tile is not', () => {
    const w = dividedMap();
    // Shooting AT the wall: the march runs out before reaching it, but the target is a wall.
    const at = Physics.raycast(w, { x: 4.5 * T, z: 2.5 * T }, { x: 5.5 * T, z: 2.5 * T });
    assert.equal(at.hit, true, 'a shot into a wall hits');

    // Standing ON a wall tile must not read as an instant hit — a shooter in a doorway shoots.
    w.setTile(2, 2, 'wall');
    const from = Physics.raycast(w, { x: 2.5 * T, z: 2.5 * T }, { x: 2.5 * T, z: 4.5 * T });
    assert.equal(from.hit, false, 'the start point is never tested');
});

test('Physics.raycast: a shallow diagonal still catches a single wall tile at the default step', () => {
    const w = World.sample({ cols: 10, rows: 10 });
    w.setTile(5, 5, 'wall');
    // From open floor to open floor — the border ring is wall, so a ray starting there would
    // hit the tile it stands next to — grazing tile (5, 5) for only a few pixels.
    const from = { x: 1.5 * T, z: 4.5 * T }, to = { x: 8.5 * T, z: 5.5 * T };
    const fine = Physics.raycast(w, from, to);
    assert.equal(fine.hit, true, 'the half-tile default step samples inside the tile');
    assert.equal(Math.floor(fine.x / T), 5);
    assert.equal(Math.floor(fine.z / T), 5);
    const coarse = Physics.raycast(w, from, to, { step: T * 3 });
    assert.equal(coarse.hit, false,
        'which is exactly why the default is HALF a tile: a coarse step jumps the wall');
});

test('Physics.raycast: maxDist caps the march — beyond the range is a miss, not a lie', () => {
    const w = dividedMap();
    const from = { x: 2.5 * T, z: 2.5 * T }, to = { x: 7.5 * T, z: 2.5 * T };
    const short = Physics.raycast(w, from, to, { maxDist: T });
    assert.equal(short.hit, false, 'the wall is 2.5 tiles away, the range is 1');
    const long = Physics.raycast(w, from, to, { maxDist: 4 * T });
    assert.equal(long.hit, true, 'a longer range does reach it');
    // A garbage maxDist must not silently become 0 (which would never march at all).
    const bad = Physics.raycast(w, from, to, { maxDist: 'lots' });
    assert.equal(bad.hit, true);
    assert.equal(Physics.raycast(w, null, to), null, 'unusable points report null, not a miss');
});

test('Physics.lineOfSight: the boolean AI actually asks for', () => {
    const w = dividedMap();
    assert.equal(Physics.lineOfSight(w, { x: 2.5 * T, z: 2.5 * T }, { x: 7.5 * T, z: 2.5 * T }), false);
    // Through the gap at tz = 5 the divider is not in the way.
    assert.equal(Physics.lineOfSight(w, { x: 2.5 * T, z: 5.5 * T }, { x: 7.5 * T, z: 5.5 * T }), true);
});

test('Physics.overlap: circles, rectangles, entities and the skipped report', () => {
    const w = dividedMap();
    // The kit runs in a node:vm realm, so arrays it returns are not reference-equal to host
    // arrays — copy them out before deepEqual, as core-model.test.mjs does.
    const ids = (list) => [...list].map(e => e.id);
    const near = Entity.create({ id: 'ally', type: 'character', position: { x: 2 * T, y: 0, z: 2 * T } });
    const far = Entity.create({ id: 'foe', type: 'character', position: { x: 8 * T, y: 0, z: 8 * T } });
    const shapeless = { id: 'broken' };

    const circle = Physics.overlap(w, { x: 2 * T, z: 2 * T, r: T }, [near, far, shapeless]);
    assert.deepEqual(ids(circle.hits), ['ally'], 'an ArcEntity is read through its .position');
    assert.deepEqual(ids(circle.skipped), ['broken'],
        'a positionless item is reported, not quietly counted as outside');

    const rect = Physics.overlap(w, { x: 0, z: 0, w: 4 * T, h: 4 * T }, [near, far]);
    assert.deepEqual(ids(rect.hits), ['ally'], 'x/z is the rectangle’s corner, as in zones');

    // A degenerate area answers nothing rather than everything.
    assert.deepEqual(ids(Physics.overlap(w, { x: 0, z: 0 }, [near]).hits), []);
    assert.deepEqual(ids(Physics.overlap(w, null, [near]).hits), []);
});

test('Physics.overlap: items default to the map’s triggers, which is the pickup case', () => {
    const w = dividedMap();
    w.triggers.push({ id: 'loot', x: 2 * T, z: 2 * T, r: T });
    w.triggers.push({ id: 'shrine', x: 8 * T, z: 8 * T, r: T });
    assert.deepEqual([...Physics.near(w, { x: 2.1 * T, z: 2.1 * T }, T)].map(t => t.id), ['loot']);
    assert.deepEqual([...Physics.near(w, { x: 5 * T, z: 5 * T }, T)], [], 'nothing within reach');
});
