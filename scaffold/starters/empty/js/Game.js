// Game.js — the empty starter: no logic, the whole kit at your disposal.
// Put game state in the class, read input yourself or via the camera controller,
// drive the world through Scene.* (semantic) or World3D/Location3D (direct).
class Game {
    /** @param {{ location: Location3D, camera: CameraController }} app */
    constructor(app) {
        this.app = app;
    }

    update(dt) {
        // your loop: state first, then the view (Scene.move / UI.get(...).setText)
    }
}
