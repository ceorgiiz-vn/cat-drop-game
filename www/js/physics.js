/**
 * Cat Drop — Matter.js physics tuning.
 * Baseline from CatDropEvolution-debug.apk; speed 2× per user request (2026-06).
 * 2026-07: fall speed reduced ~15% per user request (GRAVITY_Y / MAX_CAT_SPEED).
 * 2026-07: COLLIDER_RADIUS_SCALE set to 1.0 — physics collider now matches the drawn
 * sprite radius exactly, so resting cats no longer visually overlap each other.
 */
const CatPhysics = Object.freeze({
    GRAVITY_Y: 2.465,
    POSITION_ITERATIONS: 10,
    VELOCITY_ITERATIONS: 8,

    CAT_FRICTION: 0.15,
    CAT_RESTITUTION: 0.38,
    CAT_FRICTION_AIR: 0.002,
    COLLIDER_RADIUS_SCALE: 1.0,

    WALL_FRICTION: 0.03,
    WALL_RESTITUTION: 0.18,

    MAX_CAT_SPEED: 23.8,

    RESTING_LINEAR_SPEED: 0.36,
    RESTING_ANGULAR_SPEED: 0.055,
    RESTING_ANGULAR_DAMPING: 0.72,
    STACK_SETTLE_LINEAR_SPEED: 1.15,
    STACK_SETTLE_ANGULAR_SPEED: 0.16,
    STACK_SETTLE_LINEAR_DAMPING: 0.72,
    STACK_SETTLE_ANGULAR_DAMPING: 0.58,
    STACK_SETTLE_STOP_LINEAR_SPEED: 0.18,
    STACK_SETTLE_STOP_ANGULAR_SPEED: 0.02,
    STACK_SUPPORT_MARGIN: 4.5,

    WOBBLE_SPEED_DIVISOR: 90,
    WOBBLE_MAX_FORCE: 0.05,
    WOBBLE_MIN_FORCE: 0.02
});

window.CatPhysics = CatPhysics;
