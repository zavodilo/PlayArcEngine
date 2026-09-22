// ============================================================================
//  ArcEngine — scene manifest generator
// ----------------------------------------------------------------------------
//  node tools/manifest.mjs            regenerate js/SceneSchema.js
//  node tools/manifest.mjs --check    fail if js/SceneSchema.js drifts
//
//  The manifest is the machine-readable contract of the kit's scene for AI agents:
//  every Constants.js constant with its editor range and mode options (from
//  _utils/editor/schema.js), the LOCATION_OBJECTS record fields, the UI_LAYOUT record
//  kinds and the semantic Scene API surface (js/SceneAPI.js). The game reads the same
//  canon at runtime (SCENE_SCHEMA), so an agent can validate a scene edit BEFORE
//  rendering it.
//
//  Generated file: js/SceneSchema.js (a classic script, like everything in the kit).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const OUT = path.join(ROOT, 'js', 'SceneSchema.js');

// --- editor schema: constants with ranges and mode options -------------------
const schemaCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, '_utils/editor', 'schema.js'), 'utf8'), schemaCtx);
const KIT_SCHEMA = vm.runInContext('KIT_SCHEMA', schemaCtx);

const constants = [];
for (const group of KIT_SCHEMA) {
    for (const f of group.fields) {
        constants.push({
            group: group.id,
            name: f.name,
            min: f.min ?? null,
            max: f.max ?? null,
            step: f.step ?? null,
            kind: f.kind || 'number',
            options: f.options ? f.options.map(o => ({ value: o.value, label: o.label.en })) : null,
            label: f.label.en
        });
    }
}

// --- current values from Constants.js (numeric literals and GAME_VERSION) ----
const constantsSrc = fs.readFileSync(path.join(ROOT, 'js', 'Constants.js'), 'utf8');
for (const c of constants) {
    const m = constantsSrc.match(new RegExp('^const ' + c.name + '\\s*=\\s*([^;]+);', 'm'));
    if (!m) c.value = null;
    else {
        const raw = m[1].trim();
        c.value = /^'/.test(raw) ? raw.slice(1, -1) : Number(raw);   // 0xRRGGBB literals are not JSON
    }
}
const gv = constantsSrc.match(/^const GAME_VERSION\s*=\s*'([^']+)'/m);

// --- LOCATION_OBJECTS record (the canon: Objects.js header + editor behaviour) --
const objectFields = {
    name: { type: 'string', required: true, note: 'unique among location objects' },
    model: { type: 'string', required: true, note: 'literal quoted path from the game root (assets/models/*.fbx or *.glb; unquoted here so the asset scanner skips the manifest)' },
    kind: { type: 'string', required: true, enum: ['prop', 'actor'], note: 'actor — main objects of the frame, prop — environment' },
    x: { type: 'number', required: true, note: 'map px, right' },
    y: { type: 'number', required: true, note: 'map px, down' },
    h: { type: 'number', required: true, note: 'px above the ground' },
    rot: { type: 'number[3]', required: true, note: 'degrees [tilt-x, heading, tilt-z]; heading 0 — along +x, 90 — down the map' },
    scale: { type: 'number[3]', required: true, note: 'per axis, > 0 (1 cm in the file = 1 px)' },
    anim: { type: 'object', required: false, note: "FBX part spin: { part, axis: 'x'|'-x'|'y'|… , speed: rpm, dir: 'cw'|'ccw' }" },
    clip: { type: 'string', required: false, note: 'looped GLB animation clip (idle, run…); none — rest pose' },
    sound: { type: 'object', required: false, note: "a sound of assets/sounds at the object: { src, volume?, loop?, falloffMin?, falloffMax? } — heard while the camera is inside its falloff sphere (Sound3D, skill 'sound')" },
    tag: { type: 'string', required: false, note: 'a group name for game code: location.findByTag(tag)' },
    hidden: { type: 'boolean', required: false, note: 'placed but not in the scene (and silent) until location.setHidden(rec, false)' },
    fallback: { type: 'string', required: false, note: "procedural stand-in when the model is missing/unreadable ('tree'|'rock'|'crate'|'box'|'pole'); absent — guessed from the path" }
};

// --- UI_LAYOUT record kinds (the canon: UI.DEFAULTS) ---------------------------
const uiKinds = {
    text: { parent: '', anchor: 'top-left', x: 20, y: 20, text: 'Text', fontSize: 24, color: '#ffffff', shadow: '#000000', alpha: 1, visible: 1 },
    panel: { parent: '', anchor: 'top-left', x: 20, y: 20, w: 240, h: 80, stretch: '', fill: '#10202c', border: '', radius: 10, alpha: 0.7, visible: 1 },
    bar: { parent: '', anchor: 'top-left', x: 20, y: 20, w: 240, h: 18, stretch: '', value: 0.6, color: '#5ad05a', fill: '#10202c', border: '#ffffff', radius: 9, alpha: 1, visible: 1 },
    button: { parent: '', anchor: 'bottom-center', x: 0, y: 40, w: 180, h: 48, stretch: '', text: 'Button', fontSize: 20, color: '#ffffff', fill: '#2a6fb0', border: '', radius: 10, alpha: 1, visible: 1 }
};
const uiOptional = {
    parent: { type: 'string', kinds: 'all', note: "id of the element this one sits in (''/absent — the screen): anchor, x, y count from the parent's box, the parent clips it and hides it together with itself" },
    stretch: { type: "'h'|'v'|'both'", kinds: 'panel, bar, button', note: 'fill the container on that axis: x (y) is the inset from both edges, w (h) is ignored' }
};

const api = {
    spawn: 'Scene.spawn(model, opts) -> handle { name, def, loaded } ; opts: { name?, kind?, x?, y?, h?, heading?, rot?, scale?, clip? }',
    scatter: "Scene.scatter(def) -> handle { name, count, batches, setAll(items), removeAll() } ; def: { count, kind?|geometry?, at {x,y,r}|area {x,y,w,h}|grid {x,y,w,h,cols,rows,jitter}, scale? n|[min,max], heading? rad|'random', seed?, align? 'terrain'|'flat', group? 'prop'|'actor', name?, ink?, outline? } — static copies baked into one mesh per batch (Instances3D)",
    queryScatter: 'Scene.queryScatter() -> [{ name, source, count, batches, seed }]',
    move: 'Scene.move(name, patch) -> handle ; patch fields of def (x, y, h, heading, rot, scale, clip, kind)',
    remove: 'Scene.remove(name) -> boolean',
    query: 'Scene.query(filter?) -> plain JSON snapshots [{ name, model, kind, x, y, h, rot, scale, clip, loaded, error }]',
    inspect: 'Scene.inspect() -> Promise<{ objects, loaded, errors, triangles, fps, findings }>',
    follow: 'Scene.follow(name | null) -> camera follows the object each frame',
    manifest: 'Scene.manifest() -> this schema (SCENE_SCHEMA)'
};

const schema = {
    kit: 'ArcEngine',
    schemaVersion: 2,
    gameVersion: gv ? gv[1] : '0.0.0',
    engine: 'PlayCanvas 2 (libs/playcanvas.min.js, WebGL2)',
    coordinates: {
        map: 'x right, y down, height up, px; right-handed tradition',
        engineWorld: 'mirror of the map on X: pc(-x, h, y); rotations via World3D.rotQuat/eulerFromQuat'
    },
    constants,
    object: { fields: objectFields },
    ui: { kinds: uiKinds, optional: uiOptional, anchors: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] },
    api
};

const body = `// SceneSchema.js — GENERATED by tools/manifest.mjs — do not edit by hand.
// Machine-readable scene contract for AI agents and validators: constants with editor
// ranges and mode options, LOCATION_OBJECTS / UI_LAYOUT record fields, the Scene API
// surface (js/SceneAPI.js). Canon: js/Constants.js + _utils/editor/schema.js.
/** @satisfies {Record<string, any>} */
const SCENE_SCHEMA = ${JSON.stringify(schema, null, 4)};
`;

if (CHECK) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (have !== body) {
        console.error('manifest drift: js/SceneSchema.js — run node tools/manifest.mjs');
        process.exit(1);
    }
    console.log('manifest: ok (' + constants.length + ' constants, schema v' + schema.schemaVersion + ')');
} else {
    fs.writeFileSync(OUT, body);
    console.log('manifest: js/SceneSchema.js (' + constants.length + ' constants, schema v' + schema.schemaVersion + ')');
}
