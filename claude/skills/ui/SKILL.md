---
name: ui
description: The game's UI (HUD) — js/UI.js runtime, js/UILayout.js layout records with nesting (parent) and stretch, the editor's UI tab (_utils/editor/ui-panel.js) with drag and resize over the view, UI_REF_HEIGHT scaling. Read before adding or changing ANY on-screen interface element (text, counter, bar, button, panel, menu), before editing UI.js, UILayout.js or ui-panel.js, and before adding a new element kind or field.
---

# Game UI: UI.js, UILayout.js, the editor's UI tab

## The rule

**Every UI element is a record in `js/UILayout.js`, placed and styled in the editor's UI tab.**
Game code never creates, positions or styles HUD DOM itself — no `document.createElement` for
interface, no coordinates, sizes, colors or font sizes in game code. It takes an element by id
and feeds it data:

```js
UI.get('score').setText('10');          // text, button label
UI.get('hp').setValue(0.7);             // bar fill 0..1
UI.get('start').onClick(() => …);       // button
UI.get('hint').show(false);             // visibility; `visible: 0` in the record — hidden until show()
```

Why: the user tunes the whole interface by dragging it in the editor, on the real scene, and
sees every element there. An element created in code is invisible to the editor — it cannot be
moved, restyled or even found.

Adding an element = a record in `UILayout.js` (write it in the file's format or add it in the
UI tab) + `UI.get(id)` in game code. `UI.get` returns `null` for a missing id — guard it
(`const bar = UI.get('hp'); if (bar) …`): the user may delete an element in the editor.

Many elements of one kind (inventory slots, a list of players): ONE template record in
`UILayout.js` (usually `visible: 0`) + copies at run time, offsets derived from the template:

```js
const t = UI.def('slot');
for (let i = 0; i < 5; i++) UI.add(Object.assign({}, t, { id: 'slot' + i, x: t.x + i * (t.w + 8), visible: 1 }));
```

## Record

`{ id, kind, anchor, x, y, …fields of the kind }` — the field list per kind is `UI.DEFAULTS`
(`js/UI.js`) and, in file order, `UI_FIELDS` (`_utils/editor/save.mjs`); a test keeps them equal.

| Kind | Fields besides `x, y, alpha, visible` |
|---|---|
| `text` | `parent, text, fontSize, color, shadow` — sizes itself by its content |
| `panel` | `parent, w, h, stretch, fill, border, radius` |
| `bar` | `parent, w, h, stretch, value, color` (the filled part), `fill, border, radius` |
| `button` | `parent, w, h, stretch, text, fontSize, color, fill, border, radius` — the only kind that catches the pointer |

- `id` — `[A-Za-z_][A-Za-z0-9_-]*`, unique: game code finds the element by it.
- `anchor` — one of 9 screen points (`top-left` … `bottom-right`): `x, y` go from that screen
  point to THE SAME point of the element — inward from an edge, signed from the center. A
  `bottom-right` element with `x: 20, y: 20` keeps its bottom right corner 20 px from the
  screen corner on any screen. Math without DOM: `UI.resolve(def, w, h, W, H)` and the inverse
  `UI.toStored(anchor, left, top, w, h, W, H)` (the editor changes the anchor through it — the
  element stays in place).
- `parent` (optional) — the id of the element this one sits in (`''`/absent — the screen):
  `anchor`, `x` and `y` then count from the PARENT's box, the parent clips the child
  (`overflow: hidden`) and hiding the parent hides everything inside it. `UI.parentOf(def)`
  walks the chain and gives `null` on a missing parent or a cycle — a bad record lands on the
  screen instead of breaking the tree; `formatUI` refuses cycles outright. A full-screen dim
  for a pause menu is a panel with `parent` of the HUD frame, or `stretch: 'both', x: 0, y: 0`
  on the screen.
- `stretch` (optional, sized kinds) — `'h' | 'v' | 'both'`: the element fills its container
  (the parent's box or the screen) on that axis; `x` (`y`) becomes the inset from BOTH edges
  and `w` (`h`) is ignored. A `text` never stretches (it sizes itself by its content).
- Colors — `'#rrggbb'`, `''` — none. Records go in drawing order: later — on top.
- Numbers are px of a screen `UI_REF_HEIGHT` tall (`Constants.js`, 720): the root is scaled by
  `canvas height / UI_REF_HEIGHT`, so the interface keeps its proportions from a phone to 4K.
  `UI.size()` — the screen in layout px (the width depends on the aspect ratio — anchor wide
  things to an edge or the center, do not assume 1280). `UI_REF_HEIGHT = 0` — plain CSS px.

## Runtime (`js/UI.js`)

`UI.init(canvas, layout?)` (`main.js`; the editor passes its copy) puts a root `div.arc-ui`
over the canvas (`pointer-events: none`; a `ResizeObserver` keeps it on the canvas) and builds
the elements. `UI.applyLayout(layout?)` rebuilds everything from the records; what the game
has set (text, value, visibility, click handler) survives by id. `UIElement.apply()` — one
element from its record, cheap: called on every edit and every `setText`. `UI.editing` — the
editor's UI tab: every element catches the pointer, hidden ones show at 35%, buttons do not fire.

World-anchored interface (a label over a character) is not covered yet: it is a new element
kind whose position comes from `view.projectToScreen` (skill `world3d`) every frame, styled by
its record like the rest — not DOM positioned by hand in game code.

## Editor: the UI tab (`_utils/editor/ui-panel.js`)

- `UIPanel.init(canvas)` (from `Lab.init`) — a COPY of `UI_LAYOUT` drawn by the game's own
  `UI.js` over the editor's view; the toolbar checkbox `#opt-ui` hides the HUD on other tabs.
- With the tab open: click selects, drag moves, the 8 handles of the selection box resize
  (`panel`, `bar`, `button`; a `text` has none), arrows nudge by 1 px (Shift — 10), Del
  deletes, Ctrl+D duplicates, Esc deselects. The key listener is in the CAPTURE phase and
  stops the event: otherwise arrows also fly the camera. `ObjectsPanel.onKey` ignores its
  keys while `PaneTabs.current === 'ui'`.
- The selection box lives INSIDE the scaled root, so its lines and handles are sized through
  the CSS variable `--ui-inv` (= 1 / scale). `UI.applyLayout` clears the root — `refresh()`
  puts the box back.
- Geometry goes through `container(def)` → `rect(def)` / `place(def, rect)` — layout px, whole
  numbers; a nested element is laid out inside its parent's box (screen px are the parent's
  rect plus its border). The list is a TREE (children indented under the parent, drawing order
  inside one container); deleting an element deletes what is nested in it (Ctrl+Z brings it all
  back), renaming rewrites the `parent` references. The "Inside" and "Stretch" rows
  (`setParent` / `setStretch`) keep the element where it stands: the geometry is recomputed for
  the new container / the released axis keeps the size it had.
- Property rows — `UIPanel.FIELDS` (`[key, type]`, type: `num | unit | text | color | flag`),
  shown when the key is in `UI.DEFAULTS[kind]`; labels — `ui.f.<key>` in `i18n.js`.
- History — layout snapshots before/after (`snapshot` / `commit` / `restore`), like the
  Objects tab; field edits merge by `ui:<id>:<field>`.
- "Save to UILayout.js" (also Ctrl+S) — `POST /api/save-ui` `{ elements }`: `formatUI` validates
  every record (`bad_element` with `index` and `field`) and writes the file WHOLE with a backup
  `UILayout-*.js`; texts are written as JSON strings, so quotes are safe.

## New element kind or field

1. `UI.DEFAULTS` (`js/UI.js`) — the kind with all its fields and defaults; `UI.KINDS`;
   drawing — a branch in `UIElement.apply()`; a run-time setter, if the game feeds it data.
2. `UI_FIELDS` and `UI_TYPES` (`save.mjs`) — the same fields in file order and their types;
   restart `editor.bat` and bump `EDITOR_API_VERSION` (skill `editor`).
3. `UIPanel.FIELDS` — a row for a new field; `ui.kind.<kind>` / `ui.f.<field>` in BOTH
   dictionaries of `i18n.js`; `UIRecord` in `globals.d.ts`.
4. `tests/ui.test.mjs` compares `UI_FIELDS` with `UI.DEFAULTS` and round-trips the kit's
   `UILayout.js` through `formatUI`.

## Pitfalls

- A quoted `'assets/…'` inside a text is an asset reference for the builder's scanner
  (`UILayout.js` is scanned like any game script).
- The editor holds a COPY of the layout: `UI_LAYOUT` on the editor page is stale after a save.
- `offsetWidth/Height` of an element are layout px (the root's `transform: scale` does not
  change them); `getBoundingClientRect` is screen px — divide by `UI.scale()`.
- A sized element clips its content (`overflow: hidden`): a button label longer than `w` is cut.

## Checklist

1. No HUD DOM, coordinates or colors in game code — only `UI.get(id)` and setters.
2. The new element is visible and draggable in the UI tab; "Save to UILayout.js" writes a file
   that `node tools/check.mjs` accepts (`tests/ui.test.mjs`).
3. Looked at in the game on a wide and a narrow (portrait) window: nothing overlaps — anchors
   chosen by the edge the element belongs to.
