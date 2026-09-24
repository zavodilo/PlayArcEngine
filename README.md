# ArcEngine

A zero-dependency kit for 3D browser games on **PlayCanvas 2**, built for AI-assisted
development: vanilla JS, classic `<script>` tags, no npm, no build step — and a first-class
agent layer (skills, `AGENTS.md`, semantic API on the roadmap).

```
index.html  ->  js/ (kit)  ->  PlayCanvas 2 (libs/, local)  ->  WebGL2
   ^                         ^
   editor (_utils/)          agent skills (claude/skills, .agents/skills, AGENTS.md)
```

## What you get

- **A runnable game base**: hilly terrain, sun with colored toon shadows, light bands,
  ink edges and silhouette outlines, FBX and GLB models (skeleton + animation clips),
  a camera with flight/orbit/zoom, a DOM HUD laid out by data.
- **A web editor** (`_utils/editor/`): free/game cameras, Global Settings (every render and
  camera constant), Objects (import FBX/GLB, gizmos, part spin, clips), UI layout tab —
  the editor writes code files (`Constants.js`, `Objects.js`, `UILayout.js`), not binaries.
- **An agent layer**: kit skills in `claude/skills/` (world3d, ui, editor, build, verify,
  render-conventions), vendored PlayCanvas engine skills (`claude/vendor/playcanvas/`,
  MIT), generated native discovery for Claude Code (`.claude/skills/`), Codex/Cursor and
  Agent-Skills-compatible tools (`.agents/skills/`, `AGENTS.md`), Cursor rule
  (`.cursor/rules/arcengine.mdc`). `CLAUDE.md` remains the human-and-agent map.
- **Honest verification**: `node tools/check.mjs` (JSDoc types via tsc, 50+ logic tests,
  skills-sync check), `Debug3D.lint()` in the running scene, headless render harness in
  the project workflow.

## Quick start

One cross-platform CLI (any OS, zero npm):

```
node tools/arc.mjs run        # game at http://localhost:8080 (or next free port)
node tools/arc.mjs editor     # editor at http://localhost:8090/_utils/editor/
node tools/arc.mjs check      # fast profile: types + tests + skills sync + manifest
node tools/arc.mjs check --all   # release gate (+ headless render/visual)
node tools/arc.mjs build      # dist/arcengine-<version>.zip (playable without the repo)
node tools/arc.mjs scaffold my-game --starter survival
```

Thin wrappers, same commands: Windows `run.bat` / `editor.bat` / `check.bat` / `build.bat`,
macOS/Linux `./run.sh` / `./editor.sh` / `./check.sh` / `./build.sh`. Servers pick a free
port, print the URL and open the browser themselves (win32 `start`, darwin `open`,
linux `xdg-open`).
Requires Node.js (any modern LTS); the game itself needs none of it.

## One game, five looks (the unified visual pipeline)

A game is authored ONCE as a semantic model (`js/GameSpec.js`: rules, systems, world, entities,
scenes, an asset registry of ROLES, UI, audio, progression, the save schema). On top of it:

* a **render profile** — a type of presentation: `2d`, `2.5d`, `isometric3d`, `lowpoly3d`,
  `full3d` (canon: `manifest/render-profiles.json`);
* a **variant** — one concrete presentation of this project (profile + overrides), a JSON file
  in `presentation/variants/`. Profile != Variant; five variants share one game model.

```
node tools/arc.mjs run --all        # five browser tabs, ONE source tree, five presentations
node tools/arc.mjs run --variant arcengine-sample-2d
node tools/arc.mjs variant convert --source arcengine-sample-2d --profile full3d
node tools/arc.mjs check --profiles # the headless profile/migration matrix
```

Converting 2D → 3D is a *presentation migration*: entity ids, logical coordinates, rules, the
world and the save schema are byte-identical afterwards (`gameplayHash` proves it for the session,
`contractHash` across instances), missing art degrades through fallbacks to generated
placeholders, and the source variant always survives.
The editor's **Profile** tab previews any variant live and previews/applies migrations.
Gameplay code never sees a renderer: `GameModel`, `Entity`, `World`, `Input`, `GameAnimation`,
`GameAudio`, `Save`, `RenderProfile`, `Variant`, `Camera`, `Lighting` — never `pc.*`.

## Making a game

1. Logic lives in `js/Game.js` (`constructor(app)`, `update(dt)`); bigger games add files
   as `<script>` before `main.js` (+ a line in `CODE_FILES`, `tools/asset-scan.mjs`).
2. Static props — editor Objects tab (`Objects.js`); in code — `app.location.objects`,
   `Model3D.load/build` + `World3D.addObject`, ground height via `terrain.heightAt(x, y)`.
3. Animated characters — `.glb` + `Model3D.clips(root).play('run')` (cross-fade built in).
4. HUD — records in `UILayout.js` (editor UI tab) + `UI.get(id).setText/setValue/show/onClick`.

## Starting your own game on the kit

```
node tools/create-arcengine.mjs my-game --starter survival   # or empty | kit
cd my-game && node tools/dev-server.mjs
```

The scaffold copies the whole kit (game, editor, tools, tests, skills), overlays the
starter's `js/` files and regenerates the agent skill copies inside the target
(`--no-skills` to skip). No npm and no build step in the target, ever.
Starters: `kit` (sample as is), `empty` (blank scene), `survival` (waves chase the hero
through the Scene API — a working reference of the semantic layer).

## AI-native workflow

Agents start from `AGENTS.md` (or `CLAUDE.md`): read the skill for the area you touch,
keep the invariants (zero deps, constants in `Constants.js`, 3D is a view, HUD via layout),
verify with `check.mjs` and `Debug3D.lint()`. Skills ship in three flavors from one canon:
hand-edit `claude/skills/` or `claude/vendor/`, then `node tools/sync-skills.mjs`.

Composite agent edits are transactions: `Edit.begin(label).add/update/remove…commit()`
validates every op before applying and rolls back to a snapshot on failure
(`Scene.journal()` records the outcome). Determinism: `Scene.seed(n)` + `Scene.random()`
(starters never call `Math.random`), terrain noise from `TERRAIN_NOISE_SEED`.
Release gate: `node tools/check.mjs --all` (fast profile + headless render/visual smoke;
puppeteer is a dev-only dependency of the verify environment, not of the kit).
`tools/headless-gate.mjs --json=report.json` writes a machine-readable report (console
errors, pixel/DOM smoke, screenshots) — agents read it instead of exit codes. In-page visual
assertions: `Debug3D.assertVisible/assertInFrame/assertPosition/capture`.

The editor server is localhost-only (127.0.0.1) and hardened: no dot-path serving, path
traversal contained, request size limits (413), JSON validation (400), constant names behind
an identifier whitelist, model imports magic-byte checked and confined to `assets/models/`.
The contract lives in `tests/editor-security.test.mjs`.

Roadmap (phases A+/B+ and beyond): `ROADMAP.md`.

## License

MIT — see `LICENSE`. Bundled third-party components and attribution: `NOTICE`.
