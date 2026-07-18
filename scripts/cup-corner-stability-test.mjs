import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
const Matter = require(path.join(www, "js", "matter.min.js"));
const { Engine, World, Bodies, Body, Events } = Matter;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

const gameText = readFileSync(path.join(www, "js", "game.js"), "utf8");
const forbiddenCupPieces = [
  "cupLeftCorner",
  "cupRightCorner",
  "CUP_CORNER_LEFT",
  "CUP_CORNER_RIGHT",
  "CORNER_LENGTH",
  "CORNER_THICKNESS",
];
const leftoverPieces = forbiddenCupPieces.filter((needle) => gameText.includes(needle));
if (leftoverPieces.length) {
  fail(`physical cup still contains diagonal corner pieces: ${leftoverPieces.join(", ")}`);
} else {
  ok("physical cup has no diagonal corner bodies");
}

if (!gameText.includes("World.add(engine.world, [cupLeftWall, cupRightWall, cupFloor])")) {
  fail("physical cup should add only the two walls and the flat floor");
}

const physicsContext = { window: {} };
vm.runInNewContext(
  readFileSync(path.join(www, "js", "physics.js"), "utf8"),
  physicsContext,
  { filename: "physics.js" },
);
const CatPhysics = physicsContext.window.CatPhysics;

const stateText = readFileSync(path.join(www, "js", "state.js"), "utf8");
const scaleMatch = stateText.match(/CAT_SIZE_SCALE:\s*([0-9.]+)/);
if (!scaleMatch) {
  fail("could not read CAT_SIZE_SCALE from state.js");
  process.exit(1);
}

const GAME_Y_OFFSET = 90;
const SPAWN_Y = 220 + GAME_Y_OFFSET;
const CUP_PHYSICS_TOP_Y = 80 + GAME_Y_OFFSET;
const FLOOR_TOP_Y = 1100 + GAME_Y_OFFSET;
const CUP_WALL_LEFT_X = 90;
const CUP_WALL_RIGHT_X = 630;
const CUP_WALL_THICKNESS = 20;
const CUP_INNER_LEFT_X = CUP_WALL_LEFT_X + CUP_WALL_THICKNESS / 2;
const CUP_INNER_RIGHT_X = CUP_WALL_RIGHT_X - CUP_WALL_THICKNESS / 2;
const CUP_FLOOR_X = 360;
const CUP_FLOOR_Y = 1110 + GAME_Y_OFFSET;
const CUP_FLOOR_WIDTH = 560;
const CUP_FLOOR_HEIGHT = 20;
const CUP_WALL_PHYSICS_BOTTOM_Y = CUP_FLOOR_Y + 40;
const CUP_WALL_SPAWN_PADDING = 0;
const CUP_CORNER_LANDING_MAX_SPEED = 20;
const CUP_CORNER_LANDING_HEIGHT = 140;
const CUP_CORNER_LANDING_SIDE_PAD = 100;
const CUP_CORNER_REBOUND_MAX_SPEED = 2;
const CUP_CORNER_REBOUND_HEIGHT = 70;
const CUP_PIVOT_X = 360;
const CUP_PIVOT_Y = 1060 + GAME_Y_OFFSET;

const CAT_SIZE_SCALE = Number(scaleMatch[1]);
const LEVEL_4_RADIUS = (25.0 + (4 - 1) * 8.5) * CAT_SIZE_SCALE;
const LEVEL_4_COLLIDER_RADIUS = LEVEL_4_RADIUS * CatPhysics.COLLIDER_RADIUS_SCALE;
const LEFT_CLAMP_X = CUP_INNER_LEFT_X + LEVEL_4_RADIUS + CUP_WALL_SPAWN_PADDING;
const RIGHT_CLAMP_X = CUP_INNER_RIGHT_X - LEVEL_4_RADIUS - CUP_WALL_SPAWN_PADDING;
const RIGHT_SETTLE_X = CUP_INNER_RIGHT_X - LEVEL_4_COLLIDER_RADIUS;
const FLOOR_SETTLE_Y = FLOOR_TOP_Y - LEVEL_4_COLLIDER_RADIUS;

function rotatePoint(px, py, angle) {
  const dx = px - CUP_PIVOT_X;
  const dy = py - CUP_PIVOT_Y;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: CUP_PIVOT_X + dx * c - dy * s,
    y: CUP_PIVOT_Y + dx * s + dy * c,
  };
}

function createEngineWithCup() {
  const engine = Engine.create({
    gravity: { y: CatPhysics.GRAVITY_Y },
    positionIterations: CatPhysics.POSITION_ITERATIONS,
    velocityIterations: CatPhysics.VELOCITY_ITERATIONS,
  });

  const wallHeight = CUP_WALL_PHYSICS_BOTTOM_Y - CUP_PHYSICS_TOP_Y;
  const wallCenterY = CUP_PHYSICS_TOP_Y + wallHeight / 2;
  const common = {
    isStatic: true,
    friction: CatPhysics.WALL_FRICTION,
    restitution: CatPhysics.WALL_RESTITUTION,
  };
  const cup = {
    left: Bodies.rectangle(CUP_WALL_LEFT_X, wallCenterY, CUP_WALL_THICKNESS, wallHeight, { ...common, label: "cup-left-wall" }),
    right: Bodies.rectangle(CUP_WALL_RIGHT_X, wallCenterY, CUP_WALL_THICKNESS, wallHeight, { ...common, label: "cup-right-wall" }),
    floor: Bodies.rectangle(CUP_FLOOR_X, CUP_FLOOR_Y, CUP_FLOOR_WIDTH, CUP_FLOOR_HEIGHT, { ...common, label: "cup-floor" }),
  };

  World.add(engine.world, [cup.left, cup.right, cup.floor]);
  setCupAngle(engine, cup, 0);
  return { engine, cup };
}

function setCupAngle(engine, cup, angle) {
  const wallHeight = CUP_WALL_PHYSICS_BOTTOM_Y - CUP_PHYSICS_TOP_Y;
  const wallCenterY = CUP_PHYSICS_TOP_Y + wallHeight / 2;
  const leftPos = rotatePoint(CUP_WALL_LEFT_X, wallCenterY, angle);
  const rightPos = rotatePoint(CUP_WALL_RIGHT_X, wallCenterY, angle);
  const floorPos = rotatePoint(CUP_FLOOR_X, CUP_FLOOR_Y, angle);

  engine.gravity.x = Math.sin(angle) * CatPhysics.GRAVITY_Y;
  engine.gravity.y = Math.cos(angle) * CatPhysics.GRAVITY_Y;
  Body.setPosition(cup.left, leftPos);
  Body.setAngle(cup.left, angle);
  Body.setPosition(cup.right, rightPos);
  Body.setAngle(cup.right, angle);
  Body.setPosition(cup.floor, floorPos);
  Body.setAngle(cup.floor, angle);
}

function prepareLikeGame(body) {
  const floorCenterY = FLOOR_TOP_Y - LEVEL_4_COLLIDER_RADIUS;
  const nearFloor = body.position.y > floorCenterY - CUP_CORNER_LANDING_HEIGHT;
  if (!nearFloor || body.velocity.y <= CUP_CORNER_LANDING_MAX_SPEED) return;

  const nearLeftCorner = body.position.x < CUP_INNER_LEFT_X + LEVEL_4_COLLIDER_RADIUS + CUP_CORNER_LANDING_SIDE_PAD;
  const nearRightCorner = body.position.x > CUP_INNER_RIGHT_X - LEVEL_4_COLLIDER_RADIUS - CUP_CORNER_LANDING_SIDE_PAD;
  if (!nearLeftCorner && !nearRightCorner) return;

  let vx = body.velocity.x;
  if (nearLeftCorner && vx < 0) vx = 0;
  if (nearRightCorner && vx > 0) vx = 0;

  Body.setVelocity(body, {
    x: vx,
    y: CUP_CORNER_LANDING_MAX_SPEED,
  });
}

function dampReboundLikeGame(body) {
  const floorCenterY = FLOOR_TOP_Y - LEVEL_4_COLLIDER_RADIUS;
  const nearFloor = body.position.y > floorCenterY - CUP_CORNER_REBOUND_HEIGHT;
  if (!nearFloor || body.velocity.y >= -CUP_CORNER_REBOUND_MAX_SPEED) return;

  const nearLeftCorner = body.position.x < CUP_INNER_LEFT_X + LEVEL_4_COLLIDER_RADIUS + CUP_CORNER_LANDING_SIDE_PAD;
  const nearRightCorner = body.position.x > CUP_INNER_RIGHT_X - LEVEL_4_COLLIDER_RADIUS - CUP_CORNER_LANDING_SIDE_PAD;
  if (!nearLeftCorner && !nearRightCorner) return;

  Body.setVelocity(body, {
    x: body.velocity.x,
    y: -CUP_CORNER_REBOUND_MAX_SPEED,
  });
}

function clampLikeGame(body) {
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  if (speed > CatPhysics.MAX_CAT_SPEED) {
    const scale = CatPhysics.MAX_CAT_SPEED / speed;
    Body.setVelocity(body, {
      x: body.velocity.x * scale,
      y: body.velocity.y * scale,
    });
  }

  Body.setAngularVelocity(body, body.angularVelocity * 0.94);

  let x = body.position.x;
  let y = body.position.y;
  let needsReset = false;
  const r = LEVEL_4_COLLIDER_RADIUS;
  dampReboundLikeGame(body);

  if (x < CUP_INNER_LEFT_X - r - 20) {
    x = CUP_INNER_LEFT_X + r + 5;
    needsReset = true;
  }
  if (x > CUP_INNER_RIGHT_X + r + 20) {
    x = CUP_INNER_RIGHT_X - r - 5;
    needsReset = true;
  }
  if (y > FLOOR_TOP_Y + r + 20) {
    y = FLOOR_TOP_Y - r - 5;
    needsReset = true;
  }

  if (needsReset) {
    Body.setPosition(body, { x, y });
    Body.setVelocity(body, { x: 0, y: 0 });
  }
}

function tiltThenSettle(step) {
  if (step < 90) return 0.055;
  if (step < 330) return 0.055 * (1 - (step - 90) / 240);
  return 0;
}

function runCase(testCase) {
  const { engine, cup } = createEngineWithCup();
  const body = Bodies.circle(testCase.x, SPAWN_Y, LEVEL_4_COLLIDER_RADIUS, {
    friction: CatPhysics.CAT_FRICTION,
    restitution: CatPhysics.CAT_RESTITUTION,
    frictionAir: CatPhysics.CAT_FRICTION_AIR,
    label: "cat",
  });

  Body.setVelocity(body, { x: testCase.vx, y: 0 });
  Body.setAngularVelocity(body, testCase.angularVelocity);
  World.add(engine.world, body);

  const steps = 16 * 60;
  const lateStart = 12 * 60;
  let floorTouched = false;
  let maxLateSpeed = 0;
  let maxLateAngularSpeed = 0;
  let maxLateLift = 0;
  let maxAnyRightOverlap = 0;
  let maxAnyFloorOverlap = 0;
  let maxLateRightOverlap = 0;
  let maxLateFloorOverlap = 0;
  let sideWallHits = 0;
  let maxTransientAngularSpeed = Math.abs(body.angularVelocity);
  let maxUpwardVelocity = 0;

  Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (labels.includes("cat") && (labels.includes("cup-left-wall") || labels.includes("cup-right-wall"))) {
        sideWallHits += 1;
      }
    }
  });

  for (let step = 0; step < steps; step += 1) {
    const angle = testCase.angleAt ? testCase.angleAt(step) : 0;
    setCupAngle(engine, cup, angle);
    prepareLikeGame(body);
    Engine.update(engine, 1000 / 60);
    clampLikeGame(body);

    if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) {
      fail(`${testCase.name}: body position became non-finite`);
      return;
    }

    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    const angularSpeed = Math.abs(body.angularVelocity);
    maxTransientAngularSpeed = Math.max(maxTransientAngularSpeed, angularSpeed);
    maxUpwardVelocity = Math.min(maxUpwardVelocity, body.velocity.y);

    if (body.position.y >= FLOOR_SETTLE_Y - 3) floorTouched = true;
    const rightOverlap = body.position.x - RIGHT_SETTLE_X;
    const floorOverlap = body.position.y - FLOOR_SETTLE_Y;
    maxAnyRightOverlap = Math.max(maxAnyRightOverlap, rightOverlap);
    maxAnyFloorOverlap = Math.max(maxAnyFloorOverlap, floorOverlap);

    if (step >= lateStart) {
      maxLateSpeed = Math.max(maxLateSpeed, speed);
      maxLateAngularSpeed = Math.max(maxLateAngularSpeed, angularSpeed);
      maxLateLift = Math.max(maxLateLift, FLOOR_SETTLE_Y - body.position.y);
      maxLateRightOverlap = Math.max(maxLateRightOverlap, rightOverlap);
      maxLateFloorOverlap = Math.max(maxLateFloorOverlap, floorOverlap);
    }
  }

  const finalSpeed = Math.hypot(body.velocity.x, body.velocity.y);
  const finalAngularSpeed = Math.abs(body.angularVelocity);
  const problems = [];

  if (!floorTouched) problems.push("never touched floor");
  if (maxAnyRightOverlap > 80) problems.push(`large right wall excursion ${maxAnyRightOverlap.toFixed(2)}px`);
  if (maxAnyFloorOverlap > 25) problems.push(`large floor penetration ${maxAnyFloorOverlap.toFixed(2)}px`);
  if (maxLateRightOverlap > 2) problems.push(`late right wall overlap ${maxLateRightOverlap.toFixed(2)}px`);
  if (maxLateFloorOverlap > 4) problems.push(`late floor overlap ${maxLateFloorOverlap.toFixed(2)}px`);
  if (maxLateSpeed > 0.18) problems.push(`late speed ${maxLateSpeed.toFixed(4)}`);
  if (maxLateAngularSpeed > 0.018) problems.push(`late angular speed ${maxLateAngularSpeed.toFixed(4)}`);
  if (maxLateLift > 3) problems.push(`late lift ${maxLateLift.toFixed(2)}px`);
  if (testCase.expectNoSideWallHit && sideWallHits !== 0) problems.push(`side wall hit ${sideWallHits} time(s)`);
  if (testCase.maxTransientAngularSpeed !== undefined && maxTransientAngularSpeed > testCase.maxTransientAngularSpeed) {
    problems.push(`transient angular speed ${maxTransientAngularSpeed.toFixed(4)}`);
  }
  if (testCase.maxUpwardVelocity !== undefined && maxUpwardVelocity < testCase.maxUpwardVelocity) {
    problems.push(`upward rebound ${maxUpwardVelocity.toFixed(4)}`);
  }

  if (problems.length) {
    fail(
      `${testCase.name}: ${problems.join(", ")}; ` +
      `final=(${body.position.x.toFixed(2)}, ${body.position.y.toFixed(2)}), ` +
      `speed=${finalSpeed.toFixed(4)}, angular=${finalAngularSpeed.toFixed(4)}`,
    );
  } else {
    ok(
      `${testCase.name}: final=(${body.position.x.toFixed(2)}, ${body.position.y.toFixed(2)}), ` +
      `speed=${finalSpeed.toFixed(4)}, angular=${finalAngularSpeed.toFixed(4)}, ` +
      `maxUp=${maxUpwardVelocity.toFixed(4)}, sideHits=${sideWallHits}`,
    );
  }
}

function runCornerSweep(side) {
  const isRight = side === "right";
  const startX = isRight ? RIGHT_CLAMP_X : LEFT_CLAMP_X;
  const sideLabel = isRight ? "cup-right-wall" : "cup-left-wall";
  const stepX = 5;
  const samples = 19;

  for (let i = 0; i < samples; i += 1) {
    const x = isRight ? startX - i * stepX : startX + i * stepX;
    const { engine, cup } = createEngineWithCup();
    const body = Bodies.circle(x, SPAWN_Y, LEVEL_4_COLLIDER_RADIUS, {
      friction: CatPhysics.CAT_FRICTION,
      restitution: CatPhysics.CAT_RESTITUTION,
      frictionAir: CatPhysics.CAT_FRICTION_AIR,
      label: "cat",
    });

    World.add(engine.world, body);
    let sideWallHits = 0;
    let maxTransientAngularSpeed = 0;
    let maxAbsAngle = 0;
    let maxUpwardVelocity = 0;

    Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (labels.includes("cat") && labels.includes(sideLabel)) {
          sideWallHits += 1;
        }
      }
    });

    for (let step = 0; step < 4.2 * 60; step += 1) {
      setCupAngle(engine, cup, 0);
      prepareLikeGame(body);
      Engine.update(engine, 1000 / 60);
      clampLikeGame(body);

      maxTransientAngularSpeed = Math.max(maxTransientAngularSpeed, Math.abs(body.angularVelocity));
      maxAbsAngle = Math.max(maxAbsAngle, Math.abs(body.angle));
      maxUpwardVelocity = Math.min(maxUpwardVelocity, body.velocity.y);
    }

    const problems = [];
    if (maxTransientAngularSpeed > 0.001) problems.push(`transient angular speed ${maxTransientAngularSpeed.toFixed(4)}`);
    if (maxAbsAngle > 0.001) problems.push(`angle drift ${maxAbsAngle.toFixed(4)}`);
    if (maxUpwardVelocity < -2.001) problems.push(`upward rebound ${maxUpwardVelocity.toFixed(4)}`);

    if (problems.length) {
      fail(`level 4 ${side}-corner sweep x=${x.toFixed(2)}: ${problems.join(", ")}, sideHits=${sideWallHits}`);
    }
  }

  if (!process.exitCode) ok(`level 4 ${side}-corner sweep: 19 positions clean`);
}

const cases = [
  {
    name: "level 4 real right-clamp drop",
    x: RIGHT_CLAMP_X,
    vx: 0,
    angularVelocity: 0,
    maxTransientAngularSpeed: 0.001,
    maxUpwardVelocity: -2.001,
  },
  {
    name: "level 4 right wall nudge",
    x: RIGHT_CLAMP_X - 8,
    vx: 2.6,
    angularVelocity: 0.22,
  },
  {
    name: "level 4 hard lower-corner nudge",
    x: RIGHT_CLAMP_X,
    vx: 4.0,
    angularVelocity: -0.45,
  },
  {
    name: "level 4 tilted cup settling into right corner",
    x: RIGHT_CLAMP_X - 5,
    vx: 1.6,
    angularVelocity: 0.2,
    angleAt: tiltThenSettle,
  },
];

for (const testCase of cases) {
  runCase(testCase);
}
runCornerSweep("right");
runCornerSweep("left");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("All cup corner stability checks passed.");
