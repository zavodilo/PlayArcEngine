// Review item 10, phase D: mapToRender/renderToMap — the NAMED directions of the map <-> pc
// conversion, and the scope gate: the mirror formula may be derived only in Coords.js and
// World3D.js. Manual mirroring in gameplay code is how a scene silently flips — the whole
// point of the semantic layer is that nobody else re-derives -x.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, stub, ROOT } from './browser-scripts.mjs';

const page = loadScripts(['js/core/Coords.js', 'js/engine/World3D.js'], { pc: stub() });
const Coords = page.get('Coords');
const World3D = page.get('World3D');

test('World3D.mapToRender/renderToMap согласованы с Coords и обратимы', () => {
  for (const m of [
    { x: 10, y: 20, h: 5 }, { x: -3, y: 0, h: 0 }, { x: 0, y: 0, h: 12.5 }
  ]) {
    // vm-массивы/объекты живут в другом realm — сравниваем по полям, не deepEqual.
    const pcPos = Array.from(World3D.mapToRender(m));
    // тот же путь через канон: map -> canonical -> engine
    const viaCoords = Coords.toEngine(Coords.fromMap(m));
    assert.deepEqual(pcPos, [viaCoords.x, viaCoords.y, viaCoords.z], 'map->pc совпадает с Coords');
    const back = World3D.renderToMap(pcPos[0], pcPos[1], pcPos[2]);
    assert.equal(back.x, m.x, 'round-trip x');
    assert.equal(back.y, m.y, 'round-trip y');
    assert.equal(back.h, m.h, 'round-trip h');
  }
});

test('зеркало живёт только в Coords.js и World3D.js (scope gate)', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!f.name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, p).replace(/\\/g, '/');
      if (rel === 'js/core/Coords.js' || rel === 'js/engine/World3D.js') continue;
      const src = fs.readFileSync(p, 'utf8');
      // calls, not prose: mirror(/unmirror(/toEngine(/fromEngine( outside the two blessed files
      for (const fn of ['mirror', 'unmirror', 'toEngine', 'fromEngine']) {
        const re = new RegExp('[^A-Za-z0-9_.]' + fn + '\\s*\\(');
        if (re.test(src)) offenders.push(rel + ': ' + fn + '()');
      }
    }
  };
  walk(path.join(ROOT, 'js'));
  assert.deepEqual(offenders, [], 'конверсии координат только через Coords/World3D');
});
