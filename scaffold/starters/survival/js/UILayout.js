// UILayout.js — the game's UI layout: every HUD element, placed and styled in the editor (UI tab).
// The editor rewrites the whole file (POST /api/save-ui) — keep the format. Drawn by js/UI.js;
// game code takes an element by id: UI.get('score').setText('10') — and never positions HUD itself.
//   kind — 'text' | 'panel' | 'bar' | 'button'; anchor — one of 9 screen points ('top-left' …
//   'bottom-right'): x, y go from it to the same point of the element (inward from an edge,
//   signed from the center); w, h — px; numbers are px of a screen UI_REF_HEIGHT tall;
//   colors — '#rrggbb', '' — none; visible: 0 — hidden until the game calls show().
//   Records go in drawing order: later — on top.
const UI_LAYOUT = [
    { id: 'title', kind: 'text', anchor: 'top-left', x: 6, y: 5, text: "Survival", fontSize: 26, color: '#ffffff', shadow: '#0b1a24', alpha: 0.5, visible: 1 },
    { id: 'wave', kind: 'text', anchor: 'top-right', x: 20, y: 16, text: "wave 1 · 0 enemies", fontSize: 14, color: '#ffffff', shadow: '#0b1a24', alpha: 0.6, visible: 1 },
    { id: 'stamina', kind: 'bar', anchor: 'bottom-center', x: 0, y: 60, w: 240, h: 14, value: 1, color: '#5ad05a', fill: '#10202c', border: '#ffffff', radius: 7, alpha: 1, visible: 1 },
];
