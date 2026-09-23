// GameSpec.js — the survival starter's game model (manifest/game-schema.json).
// The starter's Game.js still drives its actors through the Scene API (location records);
// the model below carries the shared parts — world, rules, roles — so the project already
// speaks the pipeline language. Move an actor into `entities` (stable id + logic + a visual
// role) and every render profile presents it its own way.
/** @satisfies {Record<string, any>} */
const GAME_SPEC = {
    id: 'survival',
    title: 'Survival Starter',
    specVersion: 1,
    renderProfile: 'lowpoly3d',
    renderProfileReason: 'the starter ships the kit-authored stylized 3D look; waves read well in isometric too (`arc run --variant …`)',
    rules: {
        'wave.size': { id: 'wave.size', description: 'wanderers per wave', params: { size: 6 } },
        'stamina.drain': { id: 'stamina.drain', description: 'seconds of running / resting', params: { runSec: 6, restSec: 5 } }
    },
    systems: [
        { id: 'waves', phase: 'logic', description: 'spawn wanderers on a ring until the wave is out' },
        { id: 'chase', phase: 'logic', description: 'wanderers close in on the hero' },
        { id: 'stamina', phase: 'logic', description: 'running drains, standing restores' }
    ],
    world: {
        id: 'arena',
        size: { width: 2048, height: 2048 },
        tileSize: 64,
        height: { base: 0, amplitude: 50 },
        rects: [
            { x: 0, z: 0, w: 32, h: 32, kind: 'floor' },
            { x: 0, z: 0, w: 32, h: 1, kind: 'wall' }, { x: 0, z: 31, w: 32, h: 1, kind: 'wall' },
            { x: 0, z: 0, w: 1, h: 32, kind: 'wall' }, { x: 31, z: 0, w: 1, h: 32, kind: 'wall' }
        ],
        tiles: [],
        zones: [{ id: 'arena-center', kind: 'safe', x: 768, z: 768, w: 512, h: 512 }],
        triggers: [], spawns: [{ id: 'player-spawn', kind: 'player', x: 1024, y: 0, z: 1024 }],
        props: [],
        navigation: { grid: true, diagonal: false }
    },
    entities: [],
    scenes: [{ id: 'gameplay', title: 'Gameplay', kind: 'gameplay', renderProfile: null, entities: [], ui: ['title', 'stamina', 'wave'] }],
    assets: [
        {
            role: 'hero.visual', kind: 'visual', entityType: 'character',
            variants: {
                isometric3d: { type: 'model', asset: 'assets/models/character.glb', clips: { idle: 'idle', run: 'run' } },
                lowpoly3d: { type: 'model', asset: 'assets/models/character.glb', clips: { idle: 'idle', run: 'run' } },
                full3d: { type: 'model', asset: 'assets/models/character.glb', clips: { idle: 'idle', run: 'run' } }
            },
            placeholder: { kind: 'capsule', color: '#4f8fd0', label: 'hero' }
        },
        {
            role: 'wanderer.visual', kind: 'visual', entityType: 'creature',
            variants: {
                isometric3d: { type: 'model', asset: 'assets/models/mill.fbx' },
                lowpoly3d: { type: 'model', asset: 'assets/models/mill.fbx' },
                full3d: { type: 'model', asset: 'assets/models/mill.fbx' }
            },
            placeholder: { kind: 'crate', color: '#a05050', label: 'wanderer' }
        }
    ],
    ui: { space: 'screen', elements: [{ id: 'stamina', role: 'meter', binds: 'hero.stamina' }, { id: 'wave', role: 'counter', binds: 'game.wave' }] },
    audio: { channels: ['master', 'music', 'sfx'], cues: [] },
    input: { actions: { move: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], run: ['ShiftLeft'] }, planes: { move: 'xz' } },
    progression: { level: 1, xp: 0, xpToLevel: [], unlocks: [], currencies: {} },
    saveState: { schemaVersion: 1, slot: 'autosave', fields: ['progression', 'entities', 'world', 'kit', 'activeScene'], entityFields: ['id', 'position', 'rotation', 'logic', 'components'] },
    visualMigrationJournal: []
};
