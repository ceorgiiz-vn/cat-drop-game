/**
 * Cat Drop — frozen Matter.js physics baseline.
 * Recovered from CatDropEvolution-debug.apk (classic cat stacking feel).
 * DO NOT change these values unless the user explicitly asks to tune physics.
 */
const CatPhysics = Object.freeze({
    GRAVITY_Y: 1.45,
    POSITION_ITERATIONS: 10,
    VELOCITY_ITERATIONS: 8,

    CAT_FRICTION: 0.25,
    CAT_RESTITUTION: 0.38,
    CAT_FRICTION_AIR: 0,
    COLLIDER_RADIUS_SCALE: 0.98,

    WALL_FRICTION: 0.25,
    WALL_RESTITUTION: 0.18,

    MAX_CAT_SPEED: 14,

    WOBBLE_SPEED_DIVISOR: 90,
    WOBBLE_MAX_FORCE: 0.05,
    WOBBLE_MIN_FORCE: 0.02
});

window.CatPhysics = CatPhysics;
