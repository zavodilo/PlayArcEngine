// A stand-in for js/engine/World3D.js as the BROWSER sees it: a classic <script> whose
// top-level `const` becomes a LEXICAL global, not a property of window. Every kit module is
// loaded this way, so `window.World3D` is undefined in the game even though World3D exists —
// the trap this fixture pins (tests/sceneapi.test.mjs).
const World3D = {
    view: { fake: true },   // a truthy stand-in: Debug3D.lint(view) is what inspect() calls
    fps: () => 42,
    app: null
};
