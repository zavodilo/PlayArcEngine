// The semantic core: coordinates, world map, entities, rules, saves — all renderer-free.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPipeline, scanAssets, ROOT } from '../tools/headless.mjs';

const kit = bootPipeline({ files: scanAssets(ROOT), quiet: true });
const { Coords, World, Entity, GameModel, Save, GameAnimation } = kit;

test('canonical coordinates: x horizontal, y height, z depth; the map record is the mirror', () => {
    // NOTE: the kit runs in a node:vm realm, so compare through same-realm copies
    const same = (o) => JSON.parse(JSON.stringify(o));
    assert.deepEqual(same(Coords.toMap({ x: 10, y: 5, z: 20 })), { x: 10, y: 20, h: 5 });
    assert.deepEqual(same(Coords.fromMap({ x: 10, y: 20, h: 5 })), { x: 10, y: 5, z: 20 });
    assert.deepEqual(same(Coords.toEngine({ x: 10, y: 5, z: 20 })), { x: -10, y: 5, z: 20 });
    assert.equal(Math.round(Coords.headingOf({ x: 0, y: 0, z: -1 })), -90);   // north is -z everywhere
    assert.ok(Coords.equals(Coords.fromHeading(-90), { x: 0, y: 0, z: -1 }, 1e-9));
});

test('WorldMap: tiles block movement, pathfinding stays on the logical grid', () => {
    const w = World.sample({ cols: 12, rows: 12 });
    assert.equal(w.kindAt(0, 0), 'wall');
    assert.equal(w.kindAt(5, 5), 'floor');
    assert.ok(w.blocked(10, 10), 'a wall tile blocks');
    assert.ok(!w.blocked(5.5 * 64, 5.5 * 64));
    w.setTile(5, 5, 'wall');
    assert.ok(w.blocked(5.5 * 64, 5.5 * 64));
    const path = w.findPath({ x: 2.5 * 64, z: 2.5 * 64 }, { x: 9.5 * 64, z: 9.5 * 64 });
    assert.ok(path && path.length > 2, 'a path exists around the new wall');
    w.setTile(5, 4, 'wall'); w.setTile(5, 6, 'wall'); w.setTile(4, 5, 'wall'); w.setTile(6, 5, 'wall');
    assert.equal(w.findPath({ x: 2.5 * 64, z: 2.5 * 64 }, { x: 5.5 * 64, z: 5.5 * 64 }), null, 'a sealed cell is unreachable');
    // the world spec round-trips (a save / a migration reads exactly this)
    const spec = w.toSpec();
    const w2 = World.map(spec);
    assert.equal(JSON.stringify(w2.toSpec()), JSON.stringify(spec));
});

test('entities: stable ids, logic state, components; visuals are references, not objects', () => {
    const e = Entity.create({ id: 'hero', type: 'character', logic: { health: 100 }, visual: { role: 'player.visual' } });
    assert.equal(e.id, 'hero');
    e.inc('health', -30);
    assert.equal(e.get('health'), 70);
    e.add('Inventory', { slots: 12 });
    assert.deepEqual(JSON.parse(JSON.stringify(e.component('Inventory'))), { slots: 12 });
    assert.equal(e.role(), 'player.visual');
    assert.throws(() => Entity.create({ id: 'x', type: 'spaceship' }), /type must be one of/);
    assert.throws(() => Entity.create({ id: 'Bad Id', type: 'prop' }), /id must match/);
    const snap = e.snapshot();
    assert.equal(snap.visual.role, 'player.visual');
    assert.ok(!snap.visual.asset, 'a logical entity never carries a file');
});

test('GameModel: boot, systems by phase, rules, and a gameplay hash that ignores presentation', () => {
    kit.PlayArcRuntime.start({ profile: 'lowpoly3d', apply: false });
    const hash = GameModel.gameplayHash();
    let ran = 0;
    GameModel.system('test-logic', (dt) => { ran += dt; }, 'logic');
    GameModel.run(0.5);
    assert.ok(ran >= 0.5);
    GameModel.offSystem('test-logic');
    assert.equal(GameModel.param('movement.speed', 'run', 1), 260);
    // switching the presentation must not move the hash: it covers gameplay only
    kit.PlayArcRuntime.start({ profile: '2d', apply: false });
    assert.equal(GameModel.gameplayHash(), hash, 'the gameplay hash is presentation-independent');
    assert.equal(Save.schemaHash(), kit.PlayArcRuntime.start({ profile: 'full3d', apply: false }) && Save.schemaHash());
});

test('Save: a save has no profile in it and loads in any variant', () => {
    kit.PlayArcRuntime.start({ profile: 'full3d', apply: false });
    const hero = GameModel.entity('character');
    hero.set('energy', 0.42);
    const data = Save.serialize({ slot: 'unit' });
    assert.ok(!('profile' in data) || data.presentedWith, 'the profile is recorded for information only');
    assert.equal(data.schemaVersion, Save.schema().schemaVersion);
    kit.PlayArcRuntime.start({ profile: '2d', apply: false });
    const r = Save.restore(data);
    assert.equal(r.restored, GameModel.entities.length);
    assert.equal(Number(GameModel.entity('character').get('energy')).toFixed(2), '0.42');
    assert.equal(GameModel.gameplayHash(), kit.GAME_SPEC ? GameModel.gameplayHash() : null);
});

test('GameAnimation: semantic states are shared; the profile only picks the representation', () => {
    for (const st of ['idle', 'run', 'attack', 'death']) assert.ok(GameAnimation.isKnown(st));
    assert.throws(() => GameAnimation.play('dance'), /unknown state/);
    const s2 = GameAnimation.system('2d');
    const s3 = GameAnimation.system('full3d');
    assert.match(s2.system, /sprite/);
    assert.match(s3.system, /skeletal/);
    assert.deepEqual(JSON.parse(JSON.stringify(s2.states)), JSON.parse(JSON.stringify(GameAnimation.statesFor('2d'))));
});
