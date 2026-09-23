// Game.js — the sample game on top of the kit: gameplay on the SEMANTIC layer only.
//
// This file is the proof of the architecture: it never mentions a renderer, a profile, a
// sprite, a model, a camera object or pc.*. Everything it does goes through the semantic
// APIs — GameModel, Entity, World, Input, GameAnimation, GameAudio, Save, UI, Kit, Variant —
// so the SAME code runs in the 2D, 2.5D, isometric, low-poly and full 3D variants of the
// game. Converting the game between them changes no line here.
//
//     Input.axis('move')      -> a canonical direction { x, y, z } (north is -z everywhere)
//     World.blocked(x, z)     -> the logical map answers, not the rendered terrain
//     GameAnimation.play('run')   -> sprite frames in 2D, skeletal clips in 3D
//     GameAudio.play('step')  -> spatial or not, the profile decides
//     UI.get('energy')        -> the HUD is one definition in every profile
//     PlayArcRuntime.setVariant(next)  -> the presentation changes, the game does not
//
// main.js creates this class after the runtime is up (window.app.game) and calls update(dt)
// every frame before the render.

class Game {
    /** @param {{ location: Location3D, camera: CameraController, runtime: any }} app */
    constructor(app) {
        this.app = app;
        this.hero = GameModel.need(Game.HERO_ID);
        this.stepTimer = 0;
        this.fpsTimer = 0;
        this.saveTimer = Game.AUTOSAVE_SEC;

        // The systems declared in GAME_SPEC get their implementations here: the spec says
        // WHAT runs and in which order, the code says HOW. A migration preserves the list.
        GameModel.system('input', (dt) => this.systemInput(dt), 'input', 'read the semantic actions');
        GameModel.system('stamina', (dt) => this.systemStamina(dt), 'logic', 'running spends energy, standing restores it');
        GameModel.system('animation', (dt) => this.systemAnimation(dt), 'present', 'map the logical state to GameAnimation.play');
        GameModel.system('hud', (dt) => this.systemHud(dt), 'present', 'feed the HUD from the model');

        // UI: elements are records in UILayout.js (the editor's UI tab) — the game only feeds them.
        const run = UI.get('run');
        if (run) run.onClick(() => this.setRunning(!this.hero.get('running')));
        const visual = UI.get('visual');
        if (visual) visual.onClick(() => this.nextVariant());
        Input.on('variant', () => this.nextVariant());
        Input.on('interact', () => this.interact());

        GameAnimation.subject(this.hero.id);
        this.setRunning(false);
        this.showVariant();
    }

    /** The sample's rules come from GAME_SPEC (Constants.js is the fallback). */
    static cfg() {
        const U = 'undefined';
        return {
            runSec: GameModel.param('stamina.drain', 'runSec', typeof GAME_RUN_SEC !== U ? GAME_RUN_SEC : 8),
            restSec: GameModel.param('stamina.drain', 'restSec', typeof GAME_REST_SEC !== U ? GAME_REST_SEC : 4),
            stepSec: GameModel.param('stamina.step', 'stepSec', typeof GAME_STEP_SEC !== U ? GAME_STEP_SEC : 0.35),
            walk: GameModel.param('movement.speed', 'walk', 120),
            run: GameModel.param('movement.speed', 'run', 260)
        };
    }

    // --- systems ------------------------------------------------------------------------

    /** input phase: actions -> logical movement on the x/z plane (a profile never decides this). */
    systemInput(dt) {
        const c = Game.cfg();
        const dir = Input.axis('move');
        const running = !!this.hero.get('running') && (Input.isDown('run') || this.forcedRun);
        const speed = running ? c.run : c.walk;
        if (!dir || (!dir.x && !dir.z && !dir.y)) return;
        const step = speed * dt;
        const next = Coords.add(this.hero.position, Coords.scale(dir, step));
        // The LOGICAL map answers whether the hero may stand there — the same answer in 2D
        // and in full 3D, because the world model is one.
        const world = GameModel.world;
        if (world && world.blocked(next.x, next.z)) {
            // slide along the blocked axis instead of stopping dead
            const sx = Coords.add(this.hero.position, Coords.vec(dir.x * step, 0, 0));
            const sz = Coords.add(this.hero.position, Coords.vec(0, 0, dir.z * step));
            if (!world.blocked(sx.x, sx.z)) this.hero.setPosition(sx);
            else if (!world.blocked(sz.x, sz.z)) this.hero.setPosition(sz);
        } else {
            this.hero.setPosition(next);
        }
        if (dir.x || dir.z) this.hero.setHeading(Coords.headingOf(dir));
        this.moving = true;
    }

    /** logic phase: stamina. Pure model math, nothing visual. */
    systemStamina(dt) {
        const c = Game.cfg();
        const st = this.hero.component('Stamina') || {};
        let energy = Number(this.hero.get('energy'));
        if (!Number.isFinite(energy)) energy = 1;
        const running = !!this.hero.get('running');
        energy = Math.max(0, Math.min(1, energy + (running ? -dt / c.runSec : dt / c.restSec)));
        this.hero.set('energy', energy);
        if (st.current !== undefined) st.current = energy;
        if (running && energy <= 0) this.setRunning(false);

        // Footsteps: a cue by id, at the hero's position. Spatial or not is the profile's call.
        this.stepTimer -= running ? dt : this.stepTimer;
        if (running && this.stepTimer <= 0) {
            this.stepTimer = c.stepSec;
            GameAudio.at('step', this.hero.position, { volume: 0.7 });
        }
        // Triggers of the logical world fire the same events in every profile.
        const world = GameModel.world;
        if (world) {
            for (const t of world.triggersAt(this.hero.position.x, this.hero.position.z)) {
                Kit.state('lastTrigger', t.event);
            }
        }
    }

    /** present phase: the logical state -> a semantic animation state (never a clip or frame). */
    systemAnimation(dt) {
        const running = !!this.hero.get('running');
        const state = this.hero.get('health') <= 0 ? 'death' : (running ? 'run' : (this.moving ? 'walk' : 'idle'));
        if (state !== this.lastState) {
            this.lastState = state;
            GameAnimation.play(this.hero.id, state);
        }
        this.moving = false;
    }

    /** present phase: the HUD. One definition (UILayout.js), every profile draws it. */
    systemHud(dt) {
        const bar = UI.get('energy');
        if (bar) bar.setValue(Number(this.hero.get('energy')) || 0);
        this.fpsTimer -= dt;
        if (this.fpsTimer <= 0) {
            this.fpsTimer = 0.5;
            const fps = UI.get('fps');
            if (fps) fps.setText(Math.round(Kit.fps()) + ' fps');
            this.showVariant();
        }
        // Autosave: the save file has no profile in it, so it loads in any variant.
        this.saveTimer -= dt;
        if (this.saveTimer <= 0) {
            this.saveTimer = Game.AUTOSAVE_SEC;
            Save.save('autosave');
        }
    }

    /** main.js calls this every frame; the systems run from GameModel.run(dt). */
    update(dt) {
        // kept for the kit's frame contract: the sample's work lives in the systems above
        this.dt = dt;
    }

    // --- game facing helpers ---------------------------------------------------------------

    setRunning(on) {
        this.forcedRun = !!on;
        const energy = Number(this.hero.get('energy')) || 0;
        this.hero.set('running', !!on && energy > 0.05);
        const button = UI.get('run');
        if (button) button.setText(this.hero.get('running') ? 'Stop' : 'Run');
        return this.hero.get('running');
    }

    /** The demo of the whole architecture: the presentation changes, the game does not. */
    nextVariant() {
        const ids = Variant.list().filter(v => v.enabled !== false).map(v => v.id);
        if (ids.length < 2) return null;
        const cur = Variant.currentId();
        const next = ids[(ids.indexOf(cur) + 1) % ids.length];
        const before = GameModel.gameplayHash();
        const r = PlayArcRuntime.setVariant(next);
        const after = GameModel.gameplayHash();
        console.log('ArcEngine: вариант ' + next + ' (профиль ' + r.context.profile + ') — gameplay ' +
            (before === after ? 'не изменился' : 'ИЗМЕНИЛСЯ (ошибка!)') + ', hash ' + after);
        this.showVariant();
        return r.context;
    }

    showVariant() {
        const el = UI.get('profile');
        if (!el) return;
        const ctx = PlayArcRuntime.context();
        if (!ctx) return;
        el.setText(ctx.profile + '  ·  ' + ctx.variant);
        const button = UI.get('visual');
        if (button) button.setText('Visual: ' + ctx.profile);
    }

    /** Interact with whatever the world says is near the hero (a rule, not a renderer query). */
    interact() {
        const world = GameModel.world;
        if (!world) return null;
        const p = this.hero.position;
        const kind = world.kindAtWorld(p.x, p.z);
        if (kind === 'loot') {
            world.setTileWorld(p.x, p.z, 'floor');
            const inv = this.hero.component('Inventory') || this.hero.add('Inventory', { slots: 12, items: [] });
            inv.items = inv.items || [];
            inv.items.push('loot');
            GameAudio.play('hero', { volume: 0.5 });
            return 'loot';
        }
        if (kind === 'door') {
            GameAudio.play('hero', { volume: 0.4 });
            return 'door';
        }
        return null;
    }
}

Game.HERO_ID = 'character';        // the stable logical identity (GAME_SPEC.entities)
Game.HERO_TAG = 'player';          // the tag the editor's object carries (Objects.js)
Game.AUTOSAVE_SEC = 20;            // s between autosaves (Save.save -> Store)
