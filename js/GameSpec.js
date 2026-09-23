// GameSpec.js — the MASTER PROJECT's game model (GAME_SPEC).
//
// This is the single source of truth for the game: rules, systems, world, entities, scenes,
// assets (semantic roles), UI, audio, input, progression and the save schema. It is
// renderer-independent by construction — no profile, no camera, no file format, no engine
// object appears in the gameplay parts of it. Shape: manifest/game-schema.json.
//
// The VISUAL side of the project lives next to it, not inside it:
//
//     presentation/variants/<id>.json    one file per visual variant (profile + overrides)
//     presentation/mappings/<id>.json    which asset dresses which role in that variant
//     project.json                       generated Master Project descriptor
//     js/presentation/Variants.js        generated: PROJECT_VARIANTS (what the runtime reads)
//
// Five variants of THIS game (2D, 2.5D, isometric, low-poly, full 3D) all boot the same
// GAME_SPEC: same entity ids, same world, same rules, same save schema. Coordinates are
// canonical everywhere — x horizontal, y height, z depth — so a 2D variant is the y = 0 case
// of the same space, not a different space.
//
// The editor writes this file (POST /api/save-spec) and tools/variants.mjs regenerates the
// variant/project files from it — keep GAME_SPEC a plain literal object.

/** @satisfies {Record<string, any>} */
const GAME_SPEC = {
    id: 'arcengine-sample',
    title: 'ArcEngine Sample',
    specVersion: 1,

    // The project's DEFAULT profile. Which variant a runtime instance presents comes from
    // the launch (/?variant=…, `arc run --variant …`) or from project.json's defaultVariant.
    renderProfile: 'lowpoly3d',
    renderProfileReason: 'the kit sample ships a stylized 3D scene (perspective camera, toon bands, ink edges): lowpoly3d with the isometric lighting preset is its direct match',
    genre: 'sandbox sample',

    // --- rules: numbers and predicates the systems read (never presentation) -----------
    rules: {
        'stamina.drain': { id: 'stamina.drain', description: 'seconds of running before the hero is exhausted', params: { runSec: 8, restSec: 4 } },
        'stamina.step': { id: 'stamina.step', description: 'seconds between footstep sounds while running', params: { stepSec: 0.35 } },
        'movement.speed': { id: 'movement.speed', description: 'walk/run speed in world px per second', params: { walk: 120, run: 260 } },
        'combat.damage': { id: 'combat.damage', description: 'base damage of a melee hit', params: { base: 10, critMul: 2 } }
    },

    // --- systems: what runs, in which order. Implementations live in js/Game.js --------
    systems: [
        { id: 'input', phase: 'input', description: 'read the semantic actions (Input.*)' },
        { id: 'stamina', phase: 'logic', description: 'running spends energy, standing restores it' },
        { id: 'animation', phase: 'present', description: 'map the logical state to GameAnimation.play' },
        { id: 'hud', phase: 'present', description: 'feed the HUD elements from the model' }
    ],

    // --- the logical world: one map for every profile ---------------------------------
    world: {
        id: 'sample-valley',
        size: { width: 2048, height: 2048 },
        tileSize: 64,
        height: { base: 0, amplitude: 66 },
        rects: [
            { x: 0, z: 0, w: 32, h: 32, kind: 'floor' },
            { x: 0, z: 0, w: 32, h: 1, kind: 'wall' },
            { x: 0, z: 31, w: 32, h: 1, kind: 'wall' },
            { x: 0, z: 0, w: 1, h: 32, kind: 'wall' },
            { x: 31, z: 0, w: 1, h: 32, kind: 'wall' }
        ],
        tiles: [
            { x: 6, z: 20, kind: 'water' }, { x: 7, z: 20, kind: 'water' }, { x: 8, z: 20, kind: 'water' },
            { x: 6, z: 21, kind: 'water' }, { x: 7, z: 21, kind: 'water' }, { x: 8, z: 21, kind: 'water' },
            { x: 12, z: 8, kind: 'obstacle' }, { x: 13, z: 9, kind: 'obstacle' }, { x: 20, z: 12, kind: 'obstacle' },
            { x: 17, z: 24, kind: 'door', data: { open: false, key: 'mill-key' } },
            { x: 10, z: 12, kind: 'loot', data: { item: 'mill-key' } },
            { x: 24, z: 6, kind: 'loot', data: { item: 'coin' } }
        ],
        zones: [
            { id: 'mill-yard', kind: 'landmark', x: 1024, z: 768, w: 320, h: 260, data: { name: 'Mill yard' } },
            { id: 'pond', kind: 'water', x: 384, z: 1280, w: 192, h: 128 }
        ],
        triggers: [
            { id: 'mill-approach', x: 1150, z: 860, r: 180, event: 'mill.approach', once: false },
            { id: 'pond-edge', x: 480, z: 1340, r: 120, event: 'pond.warning', once: true }
        ],
        spawns: [
            { id: 'player-spawn', kind: 'player', x: 1029.4, y: 0, z: 1010 },
            { id: 'yard-spawn', kind: 'enemy', x: 1180, y: 0, z: 800 },
            { id: 'loot-spawn', kind: 'loot', x: 640, y: 0, z: 768 }
        ],
        props: [],
        navigation: { grid: true, diagonal: false }
    },

    // --- entities: stable ids, shared by every variant --------------------------------
    entities: [
        {
            id: 'character', type: 'character', name: 'Hero', tags: ['player', 'hero'],
            position: { x: 1029.4, y: 0, z: 1010 },
            rotation: { x: 0, y: 60, z: 0 },
            scale: { x: 0.25, y: 0.25, z: 0.25 },
            logic: { health: 100, energy: 1, running: false, speed: 260, inventory: [] },
            components: {
                Health: { max: 100, current: 100 },
                Stamina: { max: 1, current: 1, drainPerSec: 0.125, restPerSec: 0.25 },
                Inventory: { slots: 12, items: [] }
            },
            visual: {
                role: 'player.visual',
                renderLayer: 'actors',
                animation: { default: 'idle', states: ['idle', 'walk', 'run', 'attack', 'hurt', 'death'] }
            }
        },
        {
            id: 'mill', type: 'structure', name: 'Mill', tags: ['landmark'],
            position: { x: 1149.6, y: 8.8, z: 857.1 },
            rotation: { x: 0, y: 34.4, z: 0 },
            scale: { x: 1.36, y: 1.36, z: 1.36 },
            logic: { working: true, grain: 0 },
            components: { Interactable: { radius: 180, action: 'grind' } },
            visual: { role: 'world.mill.visual', renderLayer: 'world' }
        }
    ],

    // --- scenes: one game, several presentation presets -------------------------------
    scenes: [
        { id: 'gameplay', title: 'Gameplay', kind: 'gameplay', renderProfile: null, camera: { mode: 'orbit', follow: null }, entities: ['character', 'mill'], ui: ['title', 'fps', 'hintPanel', 'hint'] },
        { id: 'main-menu', title: 'Main menu', kind: 'menu', renderProfile: '2d', camera: { mode: 'topdown', follow: null }, entities: [], ui: ['title'] },
        { id: 'map', title: 'World map', kind: 'map', renderProfile: 'isometric3d', camera: { mode: 'isometric', follow: null }, entities: ['mill'], ui: ['title'] },
        { id: 'inventory', title: 'Inventory', kind: 'overlay', renderProfile: '2d', camera: { mode: 'topdown', follow: null }, entities: [], ui: ['title'] }
    ],

    // --- the semantic asset registry: roles, not files --------------------------------
    // Every role carries one variant per profile where an asset exists; where it does not,
    // the registry falls back (a lower profile's asset, primitive geometry) and finally
    // generates a placeholder. A migration therefore never fails on missing art.
    assets: [
        {
            role: 'player.visual', kind: 'visual', entityType: 'character',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/player.png', size: [72, 96], frames: { cols: 4, rows: 2, fps: 8, states: { idle: [0, 1], walk: [2, 3, 2, 3], run: [4, 5, 6, 7] } } },
                '2.5d': { type: 'billboard', asset: 'assets/visual/2d/player.png', size: [72, 96] },
                isometric3d: { type: 'model', asset: 'assets/models/character.glb', clips: { idle: 'idle', walk: 'run', run: 'run', attack: 'run', hurt: 'idle', death: 'idle' } },
                lowpoly3d: { type: 'model', asset: 'assets/models/character.glb', clips: { idle: 'idle', run: 'run' } },
                full3d: { type: 'model', asset: 'assets/models/character.glb', clips: { idle: 'idle', walk: 'run', run: 'run' } }
            },
            placeholder: { kind: 'capsule', color: '#d0603f', label: 'player' },
            tags: ['hero']
        },
        {
            role: 'world.mill.visual', kind: 'visual', entityType: 'structure',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/mill.png', size: [128, 160] },
                '2.5d': { type: 'billboard', asset: 'assets/visual/2d/mill.png', size: [128, 160] },
                isometric3d: { type: 'model', asset: 'assets/models/mill.fbx' },
                lowpoly3d: { type: 'model', asset: 'assets/models/mill.fbx' },
                full3d: { type: 'model', asset: 'assets/models/mill.fbx' }
            },
            placeholder: { kind: 'box', color: '#8a7a5f', label: 'mill' }
        },
        {
            role: 'world.wall.visual', kind: 'visual', entityType: 'terrain',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/tile-wall.png', size: [64, 64] },
                '2.5d': { type: 'sprite', asset: 'assets/visual/2d/tile-wall.png', size: [64, 64] },
                isometric3d: { type: 'primitive', kind: 'box' },
                lowpoly3d: { type: 'primitive', kind: 'box' },
                full3d: { type: 'primitive', kind: 'box' }
            },
            placeholder: { kind: 'box', color: '#5b5f6b', label: 'wall' }
        },
        {
            role: 'world.water.visual', kind: 'visual', entityType: 'terrain',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/tile-water.png', size: [64, 64] },
                isometric3d: { type: 'primitive', kind: 'box' },
                lowpoly3d: { type: 'primitive', kind: 'box' },
                full3d: { type: 'primitive', kind: 'box' }
            },
            placeholder: { kind: 'box', color: '#3f6f9f', label: 'water' }
        },
        {
            role: 'world.obstacle.visual', kind: 'visual', entityType: 'prop',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/tile-rock.png', size: [64, 64] },
                isometric3d: { type: 'model', asset: 'assets/models/Bush_3.fbx' },
                lowpoly3d: { type: 'primitive', kind: 'rock' },
                full3d: { type: 'primitive', kind: 'rock' }
            },
            placeholder: { kind: 'rock', color: '#7a6a55', label: 'obstacle' }
        },
        {
            role: 'world.door.visual', kind: 'visual', entityType: 'structure',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/tile-door.png', size: [64, 96] },
                isometric3d: { type: 'primitive', kind: 'box' },
                lowpoly3d: { type: 'primitive', kind: 'box' },
                full3d: { type: 'primitive', kind: 'box' }
            },
            placeholder: { kind: 'box', color: '#8a6a3f', label: 'door' }
        },
        {
            role: 'world.loot.visual', kind: 'visual', entityType: 'item',
            variants: {
                '2d': { type: 'sprite', asset: 'assets/visual/2d/tile-loot.png', size: [40, 40] },
                isometric3d: { type: 'primitive', kind: 'crate' },
                lowpoly3d: { type: 'primitive', kind: 'crate' },
                full3d: { type: 'primitive', kind: 'crate' }
            },
            placeholder: { kind: 'crate', color: '#c9a227', label: 'loot' }
        }
    ],

    // --- UI: one semantic definition, the profile only changes presentation -----------
    ui: {
        space: 'screen',
        elements: [
            { id: 'title', role: 'branding', binds: 'game.title' },
            { id: 'fps', role: 'debug', binds: 'runtime.fps' },
            { id: 'hintPanel', role: 'chrome' },
            { id: 'hint', role: 'help', binds: 'input.hints' }
        ]
    },

    // --- audio: cues by id, files resolved through the registry -----------------------
    audio: {
        channels: ['master', 'music', 'sfx'],
        cues: [
            { id: 'step', asset: 'assets/sounds/step.wav', volume: 0.7, spatial: true },
            { id: 'mill', asset: 'assets/sounds/mill.mp3', volume: 0.25, loop: true, spatial: true },
            { id: 'hero', asset: 'assets/sounds/farmer.mp3', volume: 0.8, spatial: true }
        ]
    },

    // --- input: actions and their bindings (never keys inside gameplay code) ----------
    input: {
        actions: {
            move: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
            run: ['ShiftLeft', 'ShiftRight'],
            jump: ['Space'],
            interact: ['KeyE'],
            attack: ['mouse0'],
            pause: ['Escape'],
            variant: ['KeyV']
        },
        planes: { move: 'xz', look: 'xy', aim: 'xz' }
    },

    progression: { level: 1, xp: 0, xpToLevel: [100, 250, 500, 900], unlocks: [], currencies: { coins: 0 } },

    // --- the save schema: identical in every variant, so a save loads anywhere ----------
    saveState: {
        schemaVersion: 1,
        slot: 'autosave',
        fields: ['progression', 'entities', 'world', 'kit', 'activeScene'],
        entityFields: ['id', 'position', 'rotation', 'logic', 'components']
    },

    // Filled by Migration.convert: every conversion of this project, newest last.
    visualMigrationJournal: []
};
