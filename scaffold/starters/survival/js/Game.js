// Game.js — the survival starter: waves of wanderers close in on the hero, stamina
// drains while running (RMB-free: the camera follows the hero). Everything world-facing
// goes through the semantic Scene API; the HUD — through UI.get(id).
class Game {
    /** @param {{ location: Location3D, camera: CameraController }} app */
    constructor(app) {
        this.app = app;
        this.wave = 1;
        this.stamina = 1;
        this.running = false;
        this.spawnLeft = Game.WAVE_SIZE;
        this.timer = 2;
        this.hero = () => Scene.query({ name: 'hero' })[0];
        app.camera.follow({ get x() { return Game._heroX; }, get y() { return Game._heroY; } });
    }

    update(dt) {
        const hero = this.hero();
        if (!hero || !hero.loaded) return;
        Game._heroX = hero.x; Game._heroY = hero.y;

        // waves: spawn wanderers on a ring around the hero until the wave is out
        this.timer -= dt;
        if (this.timer <= 0 && this.spawnLeft > 0) {
            this.timer = 1.2;
            this.spawnLeft--;
            const a = Math.random() * Math.PI * 2, r = 500 + Math.random() * 200;
            Scene.spawn('assets/models/mill.fbx', {
                kind: 'prop',
                x: Math.max(64, Math.min(1984, hero.x + Math.cos(a) * r)),
                y: Math.max(64, Math.min(1984, hero.y + Math.sin(a) * r)),
                heading: Math.random() * 360,
                scale: [0.5, 0.5, 0.5]
            });
        }
        const enemies = Scene.query({ kind: 'prop' });
        if (this.spawnLeft === 0 && enemies.length === 0) {
            this.wave++;
            this.spawnLeft = Game.WAVE_SIZE + this.wave * 2;
        }

        // wanderers step toward the hero; the hero "runs" while stamina lasts
        this.running = this.stamina > 0.05;
        this.stamina = Math.max(0, Math.min(1, this.stamina + (this.running ? -dt / 8 : dt / 4)));
        for (const e of enemies) {
            const dx = hero.x - e.x, dy = hero.y - e.y, d = Math.hypot(dx, dy) || 1;
            const step = Game.ENEMY_SPEED * dt;
            Scene.move(e.name, { x: e.x + dx / d * step, y: e.y + dy / d * step, heading: Math.atan2(dy, dx) * 180 / Math.PI });
        }
        Scene.move('hero', { clip: this.running ? 'run' : 'idle' });

        const wave = UI.get('wave');
        if (wave) wave.setText('wave ' + this.wave + ' · ' + enemies.length + ' enemies');
        const bar = UI.get('stamina');
        if (bar) bar.setValue(this.stamina);
    }
}

Game._heroX = 1024;
Game._heroY = 1024;
Game.WAVE_SIZE = 4;
Game.ENEMY_SPEED = 40;   // world px/s
