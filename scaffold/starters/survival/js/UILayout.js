// UILayout.js — the survival starter HUD: wave counter and hero stamina.
const UI_LAYOUT = [
    { id: 'title', kind: 'text', anchor: 'top-left', x: 6, y: 5, text: "Survival", fontSize: 26, color: '#ffffff', shadow: '#0b1a24', alpha: 0.5, visible: 1 },
    { id: 'wave', kind: 'text', anchor: 'top-right', x: 20, y: 16, text: "wave 1 · 0 enemies", fontSize: 14, color: '#ffffff', shadow: '#0b1a24', alpha: 0.6, visible: 1 },
    { id: 'stamina', kind: 'bar', anchor: 'bottom-center', x: 0, y: 60, w: 240, h: 14, value: 1, color: '#5ad05a', fill: '#10202c', border: '#ffffff', radius: 7, alpha: 1, visible: 1 },
];
