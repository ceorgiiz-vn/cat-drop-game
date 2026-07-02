/**
 * Cat Drop — Matter.js physics tuning.
 * Baseline from CatDropEvolution-debug.apk; speed 2× per user request (2026-06).
 */
const CatPhysics = Object.freeze({
    GRAVITY_Y: 2.9,
    POSITION_ITERATIONS: 10,
    VELOCITY_ITERATIONS: 8,

    CAT_FRICTION: 0.25,
    CAT_RESTITUTION: 0.38,
    CAT_FRICTION_AIR: 0,
    COLLIDER_RADIUS_SCALE: 0.98,

    WALL_FRICTION: 0.25,
    WALL_RESTITUTION: 0.18,

    MAX_CAT_SPEED: 28,

    WOBBLE_SPEED_DIVISOR: 90,
    WOBBLE_MAX_FORCE: 0.05,
    WOBBLE_MIN_FORCE: 0.02
});

window.CatPhysics = CatPhysics;
