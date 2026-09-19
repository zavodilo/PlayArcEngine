// API gate (ROADMAP phase B+): agent-facing code never touches pc.* — the semantic
// layer (Scene/Edit/Kit/UI/Asset) is the only contract. The engine layer (World3D,
// Terrain3D, Model3D, Gltf3D, Debug3D) uses pc by design and is NOT gated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from './browser-scripts.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const AGENT_FACING = [
    'js/Game.js', 'js/SceneAPI.js',
    'scaffold/starters/empty/js/Game.js',
    'scaffold/starters/survival/js/Game.js',
    'scaffold/starters/empty/js/Objects.js',
    'scaffold/starters/survival/js/Objects.js'
];

test('агентский код не обходит semantic API: pc. только в engine-слое', () => {
    for (const rel of AGENT_FACING) {
        const hits = read(rel).split('\n')
            .map((l) => l.replace(/\/\/.*$/, ''))          // comments may name pc.*
            .map((l, i) => [i + 1, l]).filter(([, l]) => /\bpc\./.test(l));
        assert.deepEqual(hits, [], rel + ': строки с pc.: ' + hits.map(h => h[0]).join(','));
    }
});

test('стартеры не пользуют Math.random (детерминизм: Scene.random)', () => {
    for (const rel of ['scaffold/starters/survival/js/Game.js', 'scaffold/starters/empty/js/Game.js']) {
        assert.ok(!read(rel).includes('Math.random'), rel);
    }
});
