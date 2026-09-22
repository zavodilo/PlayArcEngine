// ============================================================================
//  make-layout — write js/UILayout.js and js/Objects.js from JSON through the
//  editor's OWN formatters (formatUI / formatObjects in _utils/editor/save.mjs)
// ----------------------------------------------------------------------------
//  node tools/make-layout.mjs --ui=hud.json --objects=props.json
//  cat hud.json | node tools/make-layout.mjs --ui=-
//
//  Why this exists: UILayout.js and Objects.js are editor-owned files. Their bytes must
//  round-trip the formatters exactly (tests/ui.test.mjs and tests/editor-save.test.mjs assert
//  it), so hand-editing them — or generating them from a game's code — silently breaks the
//  project's check.mjs. This tool is the editor's "Save" button for agents and CI: the JSON is
//  a plain array of records (the same shapes the two files hold), the output is byte-identical
//  to what the UI / Objects tabs write, and an invalid record list leaves the file untouched.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { formatUI, formatObjects } from '../_utils/editor/save.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name) => {
    const eq = argv.find(a => a.startsWith('--' + name + '='));
    return eq ? eq.slice(name.length + 3) : null;
};

const readRecords = (spec) => {
    const text = spec === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(spec), 'utf8');
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error('make-layout: не разобрал JSON (' + spec + '): ' + e.message);
        process.exit(1);
    }
};

const TARGETS = [
    ['ui', 'js/UILayout.js', formatUI, 'записей HUD'],
    ['objects', 'js/Objects.js', formatObjects, 'объектов локации']
];

let done = 0;
for (const [flag, rel, fmt, what] of TARGETS) {
    const spec = arg(flag);
    if (!spec) continue;
    const r = fmt(readRecords(spec));
    if (!r.ok) {
        console.error('make-layout: ' + rel + ' отклонён форматтером: ' + JSON.stringify(r));
        process.exit(1);
    }
    fs.writeFileSync(path.join(ROOT, rel), r.src, 'utf8');
    console.log('make-layout: ' + rel + ' — ' + r.count + ' ' + what + ', формат редактора');
    done++;
}
if (!done) {
    console.error('make-layout: укажи --ui=<file.json|-> и/или --objects=<file.json|->');
    process.exit(1);
}
