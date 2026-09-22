// The game's UI: anchor math of js/UI.js and the editor writing js/UILayout.js (save.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { UI_FIELDS, formatUI } from '../_utils/editor/save.mjs';
import { ROOT, loadScripts } from './browser-scripts.mjs';

const page = loadScripts(['js/Constants.js', 'js/UI.js']);
const UI = page.get('UI');
const evalLayout = (src) => JSON.parse(JSON.stringify(vm.runInNewContext(src + '; UI_LAYOUT')));

const TEXT = { id: 'score', kind: 'text', anchor: 'top-right', x: 20, y: 16, text: "Don't \"stop\"", fontSize: 18, color: '#FFFFFF', shadow: '', alpha: 1, visible: 1 };
const BAR = { id: 'hp', kind: 'bar', anchor: 'bottom-center', x: 0, y: 40.26, w: 240, h: 18, value: 0.6, color: '#5ad05a', fill: '#10202c', border: '', radius: 9, alpha: 0.85, visible: 0 };

test('якорь: x и y идут от точки экрана к той же точке элемента', () => {
  const W = 1280, H = 720, w = 200, h = 50;
  assert.deepEqual({ ...UI.resolve({ anchor: 'top-left', x: 20, y: 10 }, w, h, W, H) }, { left: 20, top: 10 });
  assert.deepEqual({ ...UI.resolve({ anchor: 'bottom-right', x: 20, y: 10 }, w, h, W, H) }, { left: 1060, top: 660 });
  assert.deepEqual({ ...UI.resolve({ anchor: 'middle-center', x: 0, y: 0 }, w, h, W, H) }, { left: 540, top: 335 });
  assert.deepEqual({ ...UI.resolve({ anchor: 'top-center', x: -30, y: 5 }, w, h, W, H) }, { left: 510, top: 5 });
  assert.deepEqual({ ...UI.resolve({ anchor: 'мусор', x: 7, y: 8 }, w, h, W, H) }, { left: 7, top: 8 }, 'негодный якорь — top-left');
});

test('смена якоря не двигает элемент: toStored обратна resolve для всех 9 якорей', () => {
  const W = 1000, H = 600, w = 120, h = 40, left = 333, top = 222;
  for (const anchor of UI.ANCHORS) {
    const s = UI.toStored(anchor, left, top, w, h, W, H);
    assert.deepEqual({ ...UI.resolve({ anchor, x: s.x, y: s.y }, w, h, W, H) }, { left, top }, anchor);
  }
});

test('поля вида в редакторе и в рантайме совпадают: UI_FIELDS (save.mjs) = UI.DEFAULTS (UI.js)', () => {
  assert.deepEqual(Object.keys(UI_FIELDS).sort(), [...UI.KINDS].sort());
  for (const kind of UI.KINDS) {
    assert.deepEqual([...UI_FIELDS[kind]].sort(), Object.keys(UI.DEFAULTS[kind]).filter(k => k !== 'anchor').sort(), kind);
    assert.equal(formatUI([{ id: 'e', kind, ...UI.DEFAULTS[kind] }]).ok, true, 'значения по умолчанию сохраняются: ' + kind);
  }
});

test('UILayout.js: запись читается игрой, числа округлены, текст с кавычками цел', () => {
  const r = formatUI([TEXT, BAR]);
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
  assert.deepEqual(evalLayout(r.src), [
    { ...TEXT, color: '#ffffff' },
    { ...BAR, y: 40.3 },
  ]);
});

test('UILayout.js: негодные элементы отклоняются с номером', () => {
  const bad = (patch) => formatUI([TEXT, { ...BAR, ...patch }]);
  assert.equal(formatUI('нет').code, 'bad_ui');
  for (const patch of [{ id: 'score' }, { id: '1st' }, { id: "a'b" }, { kind: 'image' }, { anchor: 'center' }, { w: -1 }, { value: 2 },
    { color: 'red' }, { fill: '#12345' }, { x: 'abc' }]) {
    const r = bad(patch);
    assert.equal(r.code, 'bad_element', JSON.stringify(patch));
    assert.equal(r.index, 1);
  }
});

test('js/UILayout.js набора записан редактором: формат воспроизводится, id не повторяются', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/UILayout.js'), 'utf8').replace(/\r\n/g, '\n');
  const r = formatUI(evalLayout(src));
  assert.equal(r.ok, true);
  assert.equal(r.src, src);
});

test('stretch: на растянутой оси x (y) — отступ от обоих краёв, w (h) игнорируется', () => {
  const W = 1000, H = 600;
  assert.deepEqual({ ...UI.stretchOf({ kind: 'panel', stretch: 'both' }) }, { h: true, v: true });
  assert.deepEqual({ ...UI.stretchOf({ kind: 'panel', stretch: 'h' }) }, { h: true, v: false });
  assert.deepEqual({ ...UI.stretchOf({ kind: 'text', stretch: 'both' }) }, { h: false, v: false }, 'text не растягивается');
  assert.deepEqual({ ...UI.stretchOf({ kind: 'panel', stretch: '' }) }, { h: false, v: false });
  // On a stretched axis the anchor does not matter: x is the inset from BOTH edges.
  for (const anchor of ['top-left', 'top-right', 'bottom-center']) {
    assert.deepEqual({ ...UI.resolve({ kind: 'panel', anchor, stretch: 'both', x: 10, y: 20 }, 999, 999, W, H) }, { left: 10, top: 20 }, anchor);
  }
  // A free axis keeps the anchor math.
  assert.deepEqual({ ...UI.resolve({ kind: 'panel', anchor: 'bottom-right', stretch: 'h', x: 10, y: 20 }, 100, 50, W, H) }, { left: 10, top: 530 });
});

test('parent: цепочка, отсутствующий родитель и цикл дают null — запись падает на экран, а не ломает дерево', () => {
  const saved = UI.elements;
  try {
    UI.elements = new Map();
    const p = { def: { id: 'p', kind: 'panel' } };
    const c = { def: { id: 'c', kind: 'text', parent: 'p' } };
    const g = { def: { id: 'g', kind: 'text', parent: 'c' } };
    UI.elements.set('p', p); UI.elements.set('c', c); UI.elements.set('g', g);
    assert.equal(UI.parentOf(c.def), p);
    assert.equal(UI.parentOf(g.def), c);
    assert.equal(UI.parentOf(p.def), null, 'без parent — экран');
    assert.equal(UI.isInside(g.def, 'p'), true, 'вложен через цепочку');
    assert.equal(UI.isInside(g.def, 'zzz'), false);
    UI.elements.set('zz', { def: { id: 'zz', kind: 'panel', parent: 'zz2' } });   // parent does not exist
    assert.equal(UI.parentOf(UI.elements.get('zz').def), null);
    const a = { def: { id: 'a', kind: 'panel', parent: 'b' } }, b = { def: { id: 'b', kind: 'panel', parent: 'a' } };
    UI.elements.set('a', a); UI.elements.set('b', b);
    assert.equal(UI.parentOf(a.def), null, 'цикл — экран');
    assert.equal(UI.parentOf(b.def), null, 'цикл — экран');
  } finally { UI.elements = saved; }
});
