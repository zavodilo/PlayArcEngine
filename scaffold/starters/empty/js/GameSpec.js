// GameSpec.js — the empty starter's game model (manifest/game-schema.json).
// No entities yet: add them here (stable ids, logic, a visual ROLE) and every render profile
// will present them its own way. Coordinates are canonical: x horizontal, y height, z depth.
/** @satisfies {Record<string, any>} */
const GAME_SPEC = {
    id: 'my-game',
    title: 'My Game',
    specVersion: 1,
    renderProfile: 'lowpoly3d',
    renderProfileReason: 'a new project starts from the kit-authored stylized 3D look; switch with `arc run --variant …` or the editor Profile tab',
    rules: {},
    systems: [],
    world: {
        id: 'world',
        size: { width: 1024, height: 1024 },
        tileSize: 64,
        height: { base: 0, amplitude: 40 },
        rects: [{ x: 0, z: 0, w: 16, h: 16, kind: 'floor' }],
        tiles: [],
        zones: [], triggers: [], spawns: [{ id: 'player-spawn', kind: 'player', x: 512, y: 0, z: 512 }],
        props: [],
        navigation: { grid: true, diagonal: false }
    },
    entities: [],
    scenes: [{ id: 'gameplay', title: 'Gameplay', kind: 'gameplay', renderProfile: null, entities: [], ui: [] }],
    assets: [],
    ui: { space: 'screen', elements: [] },
    audio: { channels: ['master', 'music', 'sfx'], cues: [] },
    input: { actions: { move: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], interact: ['KeyE'] }, planes: { move: 'xz' } },
    progression: { level: 1, xp: 0, xpToLevel: [], unlocks: [], currencies: {} },
    saveState: { schemaVersion: 1, slot: 'autosave', fields: ['progression', 'entities', 'world', 'kit', 'activeScene'], entityFields: ['id', 'position', 'rotation', 'logic', 'components'] },
    visualMigrationJournal: []
};
