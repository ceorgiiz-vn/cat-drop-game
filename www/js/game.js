// Cat Drop: Evolution - Core Game Logic

(function() {
    // Canvas & Graphics Context
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");

    // Fix Canvas coordinate buffer space to match Godot virtual resolution
    const GAME_W = 720;
    const GAME_H = 1280;
    canvas.width = GAME_W;
    canvas.height = GAME_H;

    // Matter.js modules shorthand
    const { Engine, World, Bodies, Body, Composite, Events } = Matter;

    // Game Simulation State
    let engine;
    let activeCats = [];
    let currentCat = null;
    let nextSpawn = { level: 1, special: null };
    let currentGameMode = GameModes.MODES.CLASSIC;
    let dailySpawnIndex = 0;
    let cupTiltAngle = 0;
    let cupTiltTarget = 0;
    let chaosTimer = 0;
    let chaosTiltPhase = "idle";
    let chaosWarningTimer = 0;
    let mergeCountSinceTilt = 0;
    let leaderboardTab = "alltime";
    let canDrop = true;
    let isGameOver = false;
    let isTargetingEraser = false;
    let currentShopTab = "Themes";
    let particles = [];
    let floatingTexts = [];
    let devPeekEffect = null;
    let devCatPeekImage = null;
    let gameSessionId = 0;
    let lastTime = performance.now();
    let lastUndoSnapshot = null;
    let pendingGameOver = false;
    let pendingGameOverScore = 0;

    // Screen Shake variables
    let shakeIntensity = 0;
    let shakeDuration = 0;
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;

    // Background Theme colors
    let currentThemeColors = {
        title: "#8c9cc2",
        best: "#c5a5b5",
        btnNormal: "#7384b5",
        btnPressed: "#c5a5b5",
        boxColor: "#434d70",
        guideColor: "rgba(92, 108, 156, 0.45)",
        paperColor: "#141724",
        stripeColor: "#1b1f30",
        penColor: "rgba(92, 108, 156, 0.45)",
        pencilColor: "rgba(67, 77, 112, 0.35)",
        blushColor: "rgba(197, 165, 181, 0.4)",
        cardColor: "rgba(30, 35, 56, 0.7)"
    };

    // Asset Caching
    const catImages = {};
    const skinImages = {};

    function getCatImage(level) {
        for (const skinId in GameState.skin_assignments) {
            if (GameState.skin_assignments[skinId] === level) {
                const skin = skinImages[skinId];
                if (skin && skin.complete && skin.naturalWidth) return skin;
                break;
            }
        }
        return catImages[level];
    }

    function drawCatSprite(ctx, img, radius) {
        CatSprite.draw(ctx, img, radius);
    }

    function renderCatPreview(canvas, img, diameter, fitScale) {
        CatSprite.renderPreview(canvas, img, diameter, fitScale);
    }

    // Track clicked state for audio autoplay gestures
    let hasInteracted = false;

    // --- Audio Functions (Web Audio via GameAudio) ---
    function loadSoundSet(setName) {
        GameAudio.loadSoundSet(setName);
    }

    function playDropSound() {
        if (!GameState.sfx_enabled) return;
        GameAudio.playDrop();
    }

    function playMergeSound(pitch = 1.0) {
        if (!GameState.sfx_enabled) return;
        GameAudio.playMerge(pitch);
    }

    function playGameOverSound() {
        if (!GameState.sfx_enabled) return;
        GameAudio.playGameOver();
    }

    function playPreviewSound(setName) {
        GameAudio.playPreview(setName);
    }

    function updateBGMState() {
        GameAudio.setMusicEnabled(GameState.music_enabled);
        GameAudio.setSfxEnabled(GameState.sfx_enabled);
        GameAudio.updateBGM(GameState.music_enabled && hasInteracted && !isGameOver);
    }

    function unlockAudio() {
        if (!hasInteracted) {
            hasInteracted = true;
            GameAudio.resumeIfNeeded().then(updateBGMState);
        }
    }
    const THEMES = ["Indigo Night", "Violet Night", "Forest Night", "Rose Night", "Charcoal Night"];
    const SPAWN_Y = 220;
    const LEFT_LIMIT = 80;
    const RIGHT_LIMIT = 640;
    const CUP_RIM_Y = 250;
    const CUP_PHYSICS_TOP_Y = 80; // invisible wall extension above visual rim (avoids top-corner bounce)
    const FLOOR_TOP_Y = 1100;
    const mergingBodyIds = new Set();
    const CHAOS_TILT_RAD = Math.PI / 8; // ~22.5° — proportional cup teeter, not sideways magnet
    const MOUSE_RADIUS = 22 * GameState.CAT_SIZE_SCALE;
    const MOUSE_GHOST_FALL_SPEED = 560;
    const MOUSE_GHOST_SWAY_AMPLITUDE = 26;
    const MOUSE_GHOST_SWAY_SPEED = 7.5;
    const MOUSE_PLOW_RADIUS = MOUSE_RADIUS * 1.75;
    /** TEMP: spawn two lvl-11 cats for easter-egg testing — set false before release */
    const DEBUG_ULTIMATE_EGG_TEST = false;
    let debugEggSpawned = false;
    let totalDropsThisSession = 0;
    let cupLeftWall = null;
    let cupRightWall = null;
    let cupFloor = null;

    const CUP_WALL_LEFT_X = 90;
    const CUP_WALL_RIGHT_X = 630;
    const CUP_FLOOR_X = 360;
    const CUP_FLOOR_Y = 1110;
    const CUP_PIVOT_X = 360;
    const CUP_PIVOT_Y = 1060; // pivot near cup base — cats roll to lower corner, not the side wall
    // Walls end exactly where the floor begins (both at FLOOR_TOP_Y) with zero overlap —
    // two static rectangles meeting at a perfectly coincident edge/corner is a classic
    // 2D-physics degenerate case: a ball rolling into that exact seam gets an ambiguous
    // contact normal (wall face vs floor face), which shows up as spinning in place,
    // sticking, or occasionally tunnelling through right at the corner. Extending the
    // walls a bit past the floor's top surface turns that hairline seam into solid
    // overlapping geometry, so there's no ambiguous point left to catch on.
    const WALL_FLOOR_OVERLAP = 26;

    function rotatePoint(px, py, angle) {
        const dx = px - CUP_PIVOT_X;
        const dy = py - CUP_PIVOT_Y;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return {
            x: CUP_PIVOT_X + dx * c - dy * s,
            y: CUP_PIVOT_Y + dx * s + dy * c
        };
    }

    function worldToCupLocal(wx, wy) {
        const dx = wx - CUP_PIVOT_X;
        const dy = wy - CUP_PIVOT_Y;
        const c = Math.cos(-cupTiltAngle);
        const s = Math.sin(-cupTiltAngle);
        return {
            x: CUP_PIVOT_X + dx * c - dy * s,
            y: CUP_PIVOT_Y + dx * s + dy * c
        };
    }

    function updateCupBoundaries(angle) {
        if (!cupLeftWall || !cupRightWall || !cupFloor) return;
        const wallHeight = FLOOR_TOP_Y - CUP_PHYSICS_TOP_Y + WALL_FLOOR_OVERLAP;
        const wallCenterY = CUP_PHYSICS_TOP_Y + wallHeight / 2;

        const leftPos = rotatePoint(CUP_WALL_LEFT_X, wallCenterY, angle);
        const rightPos = rotatePoint(CUP_WALL_RIGHT_X, wallCenterY, angle);
        const floorPos = rotatePoint(CUP_FLOOR_X, CUP_FLOOR_Y, angle);

        Body.setPosition(cupLeftWall, leftPos);
        Body.setAngle(cupLeftWall, angle);
        Body.setPosition(cupRightWall, rightPos);
        Body.setAngle(cupRightWall, angle);
        Body.setPosition(cupFloor, floorPos);
        Body.setAngle(cupFloor, angle);
    }

    // Mouse coordinates tracker in internal 720x1280 coordinate system
    let mouseX = 360;

    // --- Asset Preloading ---
    function preloadAssets(callback) {
        let loadedCount = 0;
        const skins = ["Rapper", "Zombie", "Vampire", "Bard", "Oldman"];
        const totalAssets = 12 + skins.length;

        function checkLoaded() {
            loadedCount++;
            if (loadedCount === totalAssets && callback) {
                callback();
            }
        }

        for (let i = 1; i <= 11; i++) {
            const img = new Image();
            img.onload = checkLoaded;
            img.onerror = checkLoaded;
            img.src = `assets/sprites/cat_${i}.png`;
            catImages[i] = img;
        }

        skins.forEach(skin => {
            const img = new Image();
            img.onload = checkLoaded;
            img.onerror = checkLoaded;
            img.src = `assets/sprites/skin_${skin.toLowerCase()}.png`;
            skinImages[skin] = img;
        });

        const devImg = new Image();
        devImg.onload = checkLoaded;
        devImg.onerror = checkLoaded;
        devImg.src = "assets/dev-cat-peek-peace.png?v=5";
        devCatPeekImage = devImg;
    }

    // --- Physics Engine Initialization ---
    function initPhysics() {
        engine = Engine.create({
            gravity: { y: CatPhysics.GRAVITY_Y },
            positionIterations: CatPhysics.POSITION_ITERATIONS,
            velocityIterations: CatPhysics.VELOCITY_ITERATIONS
        });

        // Rigid boundaries — inner faces at x=80 / x=640; walls extend above visual rim so
        // dropped cats slide in without bouncing off the top corner at y=CUP_RIM_Y.
        const wallHeight = FLOOR_TOP_Y - CUP_PHYSICS_TOP_Y + WALL_FLOOR_OVERLAP;
        const wallCenterY = CUP_PHYSICS_TOP_Y + wallHeight / 2;
        cupLeftWall = Bodies.rectangle(CUP_WALL_LEFT_X, wallCenterY, 20, wallHeight, { 
            isStatic: true, 
            friction: CatPhysics.WALL_FRICTION, 
            restitution: CatPhysics.WALL_RESTITUTION 
        });
        cupRightWall = Bodies.rectangle(CUP_WALL_RIGHT_X, wallCenterY, 20, wallHeight, { 
            isStatic: true, 
            friction: CatPhysics.WALL_FRICTION, 
            restitution: CatPhysics.WALL_RESTITUTION 
        });
        cupFloor = Bodies.rectangle(CUP_FLOOR_X, CUP_FLOOR_Y, 560, 20, { 
            isStatic: true, 
            friction: CatPhysics.WALL_FRICTION, 
            restitution: CatPhysics.WALL_RESTITUTION 
        });

        World.add(engine.world, [cupLeftWall, cupRightWall, cupFloor]);
        updateCupBoundaries(cupTiltAngle);
        applyCupGravity();

        // Collision Start Events
        Events.on(engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                // Play wobble on impacts
                if (bodyA.gameObject) triggerWobble(bodyA.gameObject, bodyA.speed);
                if (bodyB.gameObject) triggerWobble(bodyB.gameObject, bodyB.speed);

                if (bodyA.gameObject && bodyB.gameObject) {
                    const catA = bodyA.gameObject;
                    const catB = bodyB.gameObject;

                    if (catA.isMouse && catB.isDropped && !catB.isMouse && !catB.isGoldenBall) {
                        applyMousePush(catA, catB, true);
                    }
                    if (catB.isMouse && catA.isDropped && !catA.isMouse && !catA.isGoldenBall) {
                        applyMousePush(catB, catA, true);
                    }

                    if (catA.isGoldenBall && !catB.isGoldenBall && !catB.isMouse) {
                        tryTransformGoldenBall(catA, catB);
                    } else if (catB.isGoldenBall && !catA.isGoldenBall && !catA.isMouse) {
                        tryTransformGoldenBall(catB, catA);
                    }

                    if (catA.specialType === GameModes.SPECIAL.GHOST && catA.isDropped && !catA.ghostUsed && catB.isDropped) {
                        catA.ghostUsed = true;
                    }
                    if (catB.specialType === GameModes.SPECIAL.GHOST && catB.isDropped && !catB.ghostUsed && catA.isDropped) {
                        catB.ghostUsed = true;
                    }
                }

                // Merging Logic
                if (bodyA.gameObject && bodyB.gameObject) {
                    const catA = bodyA.gameObject;
                    const catB = bodyB.gameObject;

                    if (catA.isGoldenBall || catB.isGoldenBall || catA.isMouse || catB.isMouse) return;

                    if (catA.level === catB.level && !catA.isMerged && !catB.isMerged && catA.isDropped && catB.isDropped) {
                        if (mergingBodyIds.has(bodyA.id) || mergingBodyIds.has(bodyB.id)) return;

                        catA.isMerged = true;
                        catB.isMerged = true;
                        mergingBodyIds.add(bodyA.id);
                        mergingBodyIds.add(bodyB.id);

                        const midX = (bodyA.position.x + bodyB.position.x) / 2;
                        const midY = (bodyA.position.y + bodyB.position.y) / 2;
                        const newLevel = catA.level + 1;
                        const mergedSpecial = (catA.specialType === catB.specialType) ? catA.specialType : null;

                        // Add score and coins
                        GameState.addScore(catA.level * 2);
                        GameState.addFishCoins(newLevel);

                        if (catA.specialType === GameModes.SPECIAL.EXPLOSIVE || catB.specialType === GameModes.SPECIAL.EXPLOSIVE) {
                            triggerExplosion(midX, midY, catA.level);
                        }

                        onChaosMerge();

                        // Trigger effects
                        triggerMergeEffects(midX, midY, newLevel);

                        if (catA.level === 11 && catB.level === 11) {
                            triggerBigCatGroomEasterEgg(midX, midY);
                        }

                        // Delete physics bodies on next tick
                        setTimeout(() => {
                            mergingBodyIds.delete(bodyA.id);
                            mergingBodyIds.delete(bodyB.id);
                            Composite.remove(engine.world, [bodyA, bodyB]);
                            activeCats = activeCats.filter(c => c.body !== bodyA && c.body !== bodyB);

                            if (newLevel <= 11) {
                                spawnMergedCat(midX, midY, newLevel, mergedSpecial);
                            } else {
                                // Ultimate level bonus
                                GameState.addScore(500);
                                spawnFloatingText(midX, midY, "+500 🏆 Ultimate!", "#9370db");
                            }
                            saveGameSession();
                        }, 0);
                    }
                }
            });
        });

        // Note: continuous mouse/cat separation is handled once per frame by
        // applyMouseScatterField() in updateMice(), not here — that used to also run
        // on every 'collisionActive' substep with a different formula on the same
        // bodies in the same frame, and two independent systems hard-teleporting the
        // same cat back and forth is what caused the mouse to visibly "tremble" when
        // wedged instead of scattering the pile. collisionStart's one-shot impact bump
        // (above) is kept only for the initial "Squeak!" contact.
    }

    function normalizeSpawn(spec) {
        if (typeof spec === "number") return { level: spec, special: null };
        return spec || { level: 1, special: null };
    }

    function isGoldenSpawn(spec) {
        return GameModes.isGoldenSpawn(normalizeSpawn(spec));
    }

    function isMouseSpawn(spec) {
        return GameModes.isMouseSpawn(normalizeSpawn(spec));
    }

    function getSpawnRadius(spec) {
        const s = normalizeSpawn(spec);
        if (isMouseSpawn(s)) return MOUSE_RADIUS;
        if (isGoldenSpawn(s)) return GameState.get_radius(2);
        return GameState.get_radius(s.level);
    }

    function applySpecialPhysics(bodyOptions, special) {
        if (!special) return bodyOptions;
        if (special === GameModes.SPECIAL.STICKY) bodyOptions.friction = 0.92;
        if (special === GameModes.SPECIAL.SOAPY) bodyOptions.restitution = 0.62;
        if (special === GameModes.SPECIAL.HEAVY) bodyOptions.density = 0.0028;
        if (special === GameModes.SPECIAL.GHOST) bodyOptions.friction = 0.08;
        return bodyOptions;
    }

    function createCat(spawnSpec, x, y, isDropped = false) {
        const spec = normalizeSpawn(spawnSpec);
        const isGoldenBall = isGoldenSpawn(spec);
        const level = isGoldenBall ? GameModes.GOLDEN_LEVEL : spec.level;
        const radius = getSpawnRadius(spec);
        const radiusCollider = radius * CatPhysics.COLLIDER_RADIUS_SCALE;

        let bodyOptions = {
            friction: CatPhysics.CAT_FRICTION,
            restitution: CatPhysics.CAT_RESTITUTION,
            frictionAir: CatPhysics.CAT_FRICTION_AIR,
            isStatic: !isDropped
        };
        bodyOptions = applySpecialPhysics(bodyOptions, spec.special);

        const body = Bodies.circle(x, y, radiusCollider, bodyOptions);

        const cat = {
            body: body,
            level: level,
            specialType: spec.special || null,
            radius: radius,
            isGoldenBall: isGoldenBall,
            isMouse: false,
            isTransforming: false,
            ghostUsed: false,
            isDropped: isDropped,
            isMerged: false,
            deathZoneTime: 0,
            spawnScale: isDropped ? 0.2 : 0.0,
            scaleVelocity: 0.0,
            wobbleScaleX: 1.0,
            wobbleScaleY: 1.0,
            wobbleVelocityX: 0.0,
            wobbleVelocityY: 0.0
        };

        body.gameObject = cat;
        return cat;
    }

    function createMouse(x, y, isDropped = false) {
        const radius = MOUSE_RADIUS;
        const colliderR = radius * 0.64;
        const body = Bodies.circle(x, y, colliderR, {
            friction: 0.018,
            restitution: 0.22,
            frictionAir: 0.0025,
            density: 0.05,
            isSensor: true,
            isStatic: !isDropped,
            label: "mouse",
            sleepThreshold: Infinity
        });

        const mouse = {
            body,
            level: GameModes.MOUSE_LEVEL,
            specialType: null,
            radius,
            isGoldenBall: false,
            isMouse: true,
            isTransforming: false,
            isDropped,
            isMerged: false,
            isEscaping: isDropped,
            scurryPhase: Math.random() * Math.PI * 2,
            stuckTime: 0,
            ghostBaseX: x,
            ghostElapsed: 0,
            squeaked: false,
            deathZoneTime: 0,
            spawnScale: isDropped ? 1.0 : 0.0,
            scaleVelocity: 0.0,
            wobbleScaleX: 1.0,
            wobbleScaleY: 1.0,
            wobbleVelocityX: 0.0,
            wobbleVelocityY: 0.0
        };
        body.gameObject = mouse;
        return mouse;
    }

    function getMouseColliderRadius(mouse) {
        return mouse.radius * 0.64;
    }

    function getMousePushPower(mouse) {
        const stuck = mouse.stuckTime || 0;
        if (stuck < 0.05) return 1.2;
        // Ramps up the longer the mouse is wedged, so a tightly packed pile
        // eventually gets muscled apart instead of holding the mouse forever.
        return 1.2 + Math.min((stuck - 0.05) * 3.2, 9.5);
    }

    function getCatHeavyBoost(cat) {
        if (cat.level >= 8) return 1.55;
        if (cat.level >= 6) return 1.42;
        if (cat.level >= 4) return 1.25;
        if (cat.level >= 2) return 1.1;
        return 1;
    }

    /** Mouse sitting on / wedged into the crown of a ball below */
    function isCrownBlock(mouse, cat) {
        const mx = mouse.body.position.x;
        const my = mouse.body.position.y;
        const cx = cat.body.position.x;
        const cy = cat.body.position.y;
        const dx = cx - mx;
        const dy = cy - my;
        const mouseR = getMouseColliderRadius(mouse);
        const catR = getCatColliderRadius(cat);
        return dy > -catR * 0.15 && dy < mouseR + catR * 0.92 && Math.abs(dx) < catR * 0.95;
    }

    /** Nudge mouse sideways toward the side with more clearance */
    function steerMouseAroundBlocks(mouse) {
        if ((mouse.stuckTime || 0) < 0.04) return;

        const mx = mouse.body.position.x;
        const my = mouse.body.position.y;
        let leftWeight = 0;
        let rightWeight = 0;

        activeCats.forEach(cat => {
            if (cat.isMouse || !cat.isDropped || cat.isGoldenBall) return;
            if (!isCrownBlock(mouse, cat)) return;
            const dx = cat.body.position.x - mx;
            const w = cat.radius * (1 + cat.level * 0.04);
            if (dx <= 0) leftWeight += w;
            else rightWeight += w;
        });

        if (leftWeight === 0 && rightWeight === 0) return;

        const dir = leftWeight <= rightWeight ? 1 : -1;
        const power = getMousePushPower(mouse);
        Body.applyForce(mouse.body, mouse.body.position, {
            x: dir * 0.0055 * mouse.body.mass * power,
            y: 0
        });
    }

    /**
     * One-shot impact nudge on first contact (called from collisionStart only).
     * Now that the mouse carries real weight (see createMouse's density), Matter's own
     * collision response already imparts genuine momentum to whatever it hits — this
     * just adds a small extra kick + the "Squeak!" cue. Deliberately NOT repeated every
     * frame and NOT a position teleport, so it can never fight the solver / cause jitter.
     */
    function applyMousePush(mouse, cat, isImpact) {
        if (!mouse.isMouse || !mouse.isDropped || !cat.isDropped || cat.isMouse || cat.isGoldenBall) return;
        if (!isImpact) return;

        const power = getMousePushPower(mouse);
        const mx = mouse.body.position.x;
        const my = mouse.body.position.y;
        const cx = cat.body.position.x;
        const cy = cat.body.position.y;
        const dx = cx - mx;
        const dy = cy - my;
        const dist = Math.hypot(dx, dy) || 0.01;
        const nx = dx / dist;
        const ny = dy / dist;

        const kick = 1.4 * power;
        Body.setVelocity(cat.body, {
            x: Math.max(-CatPhysics.MAX_CAT_SPEED, Math.min(CatPhysics.MAX_CAT_SPEED, cat.body.velocity.x + nx * kick)),
            y: Math.max(-CatPhysics.MAX_CAT_SPEED, Math.min(CatPhysics.MAX_CAT_SPEED, cat.body.velocity.y + Math.max(0, ny) * kick * 0.6))
        });

        if (!mouse.squeaked) {
            mouse.squeaked = true;
            playMergeSound(1.45);
            spawnFloatingText(mx, my - 20, "Squeak!", "#f48fb1");
        }
    }

    /**
     * Continuous outward push field while the mouse is stuck. Pure forces only (no
     * position teleporting) so it blends into Matter's own solver instead of fighting
     * it frame-to-frame — that fight (multiple systems hard-repositioning the same
     * bodies) is what used to look like "shaking" instead of a clean scatter. Combined
     * with the mouse's real weight, this is now enough to actually fling cats apart
     * rather than just vibrate against them.
     */
    function applyMouseScatterField(mouse) {
        const stuck = mouse.stuckTime || 0;
        if (stuck < 0.05) return;

        const mx = mouse.body.position.x;
        const my = mouse.body.position.y;
        const power = getMousePushPower(mouse);
        const mouseR = getMouseColliderRadius(mouse);

        activeCats.forEach(cat => {
            if (cat.isMouse || !cat.isDropped || cat.isGoldenBall) return;

            const dx = cat.body.position.x - mx;
            const dy = cat.body.position.y - my;
            const dist = Math.hypot(dx, dy) || 0.01;
            const reach = mouseR + cat.radius + 16;
            if (dist > reach) return;

            const overlap = reach - dist;
            if (overlap <= 0.15) return; // ignore hairline overlaps — avoids visible micro-jitter at rest

            const nx = dx / dist;
            const ny = dy / dist;
            const heavy = getCatHeavyBoost(cat);

            // Radial force away from the mouse, scaled by overlap depth and accumulated
            // stuck power. Proportional to the cat's own mass so the resulting
            // acceleration (how "hard" the scatter looks) stays consistent across sizes.
            const forceMag = 0.0075 * cat.body.mass * power * Math.min(heavy, 1.5) * (overlap / reach + 0.4);
            Body.applyForce(cat.body, cat.body.position, {
                x: nx * forceMag,
                y: ny * forceMag * (ny < 0 ? 0.35 : 0.85)
            });
        });

        // The mouse itself wiggles/pushes back a bit harder the longer it's stuck,
        // helping it work its way into the opening its own force field creates.
        const wiggle = Math.sin(mouse.scurryPhase * 2.1) * 0.006 * mouse.body.mass * power;
        Body.applyForce(mouse.body, mouse.body.position, { x: wiggle, y: 0 });
    }

    function applyMouseGhostPlow(mouse) {
        const mx = mouse.body.position.x;
        const my = mouse.body.position.y;
        const plowR = MOUSE_PLOW_RADIUS;

        activeCats.forEach(cat => {
            if (cat.isMouse || !cat.isDropped || cat.isMerged) return;

            const dx = cat.body.position.x - mx;
            const dy = cat.body.position.y - my;
            const dist = Math.hypot(dx, dy) || 0.01;
            const catR = getCatColliderRadius(cat);
            const reach = plowR + catR;
            if (dist > reach) return;

            const overlap = reach - dist;
            if (overlap <= 0.15) return;

            const strength = Math.min(1, overlap / Math.max(1, reach * 0.45));
            const heavy = getCatHeavyBoost(cat);
            let side = Math.abs(dx) > 6 ? Math.sign(dx) : Math.sign(Math.sin(mouse.scurryPhase) || 1);
            const sideRoom = side > 0
                ? RIGHT_LIMIT - cat.radius - cat.body.position.x
                : cat.body.position.x - (LEFT_LIMIT + cat.radius);
            if (sideRoom < 10) side *= -1;

            const correction = Math.min(9, (1.4 + overlap * 0.13) * heavy);
            const yNudge = dy < -catR * 0.25 ? -correction * 0.18 : Math.min(2.2, correction * 0.14);
            const targetX = getClampedX(cat.body.position.x + side * correction, cat.radius);
            const targetY = Math.min(FLOOR_TOP_Y - catR, cat.body.position.y + yNudge);
            Body.setPosition(cat.body, { x: targetX, y: targetY });

            const impulse = (1.6 + strength * 5.2) * Math.min(heavy, 1.65);
            Body.setVelocity(cat.body, {
                x: Math.max(-CatPhysics.MAX_CAT_SPEED, Math.min(CatPhysics.MAX_CAT_SPEED, cat.body.velocity.x + side * impulse)),
                y: Math.max(-CatPhysics.MAX_CAT_SPEED, Math.min(CatPhysics.MAX_CAT_SPEED, cat.body.velocity.y + Math.max(0, dy / dist) * impulse * 0.12))
            });
            Body.setAngularVelocity(cat.body, cat.body.angularVelocity + side * (0.035 + strength * 0.08));
            triggerWobble(cat, 4 + strength * 8);
        });
    }

    const MOUSE_FAILSAFE_STUCK_TIME = 4.2; // seconds fully wedged before we guarantee an opening

    /**
     * Last-resort escape valve: if the mouse has been wedged in a fully-packed pile
     * longer than MOUSE_FAILSAFE_STUCK_TIME even at max push power (should be rare —
     * getMousePushPower() ramps to full strength well before this), directly relocate
     * whichever neighboring cat overlaps it the most to a clear spot beside it. This
     * guarantees the mouse can never truly soft-lock the cup.
     */
    function forceClearMousePath(mouse) {
        const mx = mouse.body.position.x;
        const my = mouse.body.position.y;
        const mouseR = getMouseColliderRadius(mouse);

        let worstCat = null;
        let worstOverlap = 0;
        activeCats.forEach(cat => {
            if (cat.isMouse || !cat.isDropped || cat.isGoldenBall) return;
            const dx = cat.body.position.x - mx;
            const dy = cat.body.position.y - my;
            const dist = Math.hypot(dx, dy) || 0.01;
            const overlap = (mouseR + getCatColliderRadius(cat)) - dist;
            if (overlap > worstOverlap) {
                worstOverlap = overlap;
                worstCat = cat;
            }
        });

        if (!worstCat) {
            mouse.stuckTime = 0;
            return;
        }

        const catR = getCatColliderRadius(worstCat);
        const dx = worstCat.body.position.x - mx;
        const signX = dx >= 0 ? 1 : -1;
        const targetX = getClampedX(mx + signX * (mouseR + catR + 10), catR);

        Body.setPosition(worstCat.body, { x: targetX, y: worstCat.body.position.y });
        Body.setVelocity(worstCat.body, { x: signX * 5, y: worstCat.body.velocity.y * 0.5 });
        triggerWobble(worstCat, 6);

        mouse.stuckTime = 0;
    }

    function getMouseFaceAngle(mouse) {
        if (!mouse.isDropped) return Math.PI;
        const vel = mouse.body.velocity;
        const speed = Math.hypot(vel.x, vel.y);
        if (speed < 0.25) return Math.PI;
        return Math.atan2(vel.y, vel.x) + Math.PI / 2;
    }

    function updateMice(delta) {
        activeCats.filter(c => c.isMouse && c.isDropped && c.isEscaping).forEach(mouse => {
            const dt = Math.min(delta, 0.05);
            mouse.ghostElapsed += dt;
            mouse.scurryPhase += dt * 14;

            const prevX = mouse.body.position.x;
            const prevY = mouse.body.position.y;
            const sway = Math.sin(mouse.ghostElapsed * MOUSE_GHOST_SWAY_SPEED + mouse.scurryPhase * 0.35) * MOUSE_GHOST_SWAY_AMPLITUDE;
            const x = getClampedX(mouse.ghostBaseX + sway, mouse.radius);
            const y = prevY + MOUSE_GHOST_FALL_SPEED * dt;

            Body.setPosition(mouse.body, { x, y });
            Body.setVelocity(mouse.body, { x: x - prevX, y: y - prevY });
            Body.setAngularVelocity(mouse.body, Math.sin(mouse.scurryPhase) * 0.08);

            applyMouseGhostPlow(mouse);

            const r = getMouseColliderRadius(mouse);
            const floorY = FLOOR_TOP_Y - r;
            if (mouse.body.position.y >= floorY - 1) {
                poofRemoveMouse(mouse);
            }
        });
    }

    function poofRemoveMouse(mouse) {
        if (mouse.isRemoved) return;
        mouse.isRemoved = true;
        const x = mouse.body.position.x;
        const y = mouse.body.position.y;
        Composite.remove(engine.world, mouse.body);
        activeCats = activeCats.filter(c => c !== mouse);

        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = Math.random() * 2.5 + 0.8;
            particles.push({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 0.5,
                color: i % 3 === 0 ? "#f48fb1" : "#c8c8c8",
                radius: Math.random() * 3 + 1.5,
                alpha: 0.85,
                life: 0.7
            });
        }
        spawnFloatingText(x, y - 12, "puff~", "#bdbdbd");
        saveGameSession();
    }

    function spawnEntity(spawnSpec, x, y, isDropped) {
        if (isMouseSpawn(spawnSpec)) return createMouse(x, y, isDropped);
        return createCat(spawnSpec, x, y, isDropped);
    }

    function getSpawnContext() {
        return {
            totalDrops: totalDropsThisSession,
            catsInCup: activeCats.filter(c => c.isDropped && !c.isMouse).length
        };
    }

    function spawnExcludeFrom(lastSpec) {
        if (!lastSpec) lastSpec = null;
        return {
            noMouse: GameModes.isMouseSpawn(lastSpec),
            noGolden: GameModes.isGoldenSpawn(lastSpec),
            spawnContext: getSpawnContext()
        };
    }

    function ensureSpawnAllowed(spec) {
        if (GameModes.isMouseSpawn(spec) && !GameModes.canSpawnMouse(getSpawnContext())) {
            return { level: Math.floor(Math.random() * 4) + 1, special: null };
        }
        return spec;
    }

    function rollNextSpawn(lastSpec) {
        const exclude = spawnExcludeFrom(lastSpec);
        if (currentGameMode === GameModes.MODES.DAILY) {
            const spec = ensureSpawnAllowed(GameModes.getNextSpawn(currentGameMode, dailySpawnIndex, null, exclude));
            dailySpawnIndex++;
            return spec;
        }
        return ensureSpawnAllowed(GameModes.getNextSpawn(currentGameMode, 0, null, exclude));
    }

    function tryTransformGoldenBall(goldenCat, otherCat) {
        if (!goldenCat.isGoldenBall || goldenCat.isTransforming || goldenCat.isMerged) return;
        if (!goldenCat.isDropped || !otherCat.isDropped || otherCat.isMerged) return;
        if (otherCat.isGoldenBall || otherCat.isMouse) return;

        goldenCat.isTransforming = true;
        transformGoldenBall(goldenCat, otherCat.level, otherCat.specialType);
    }

    function transformGoldenBall(goldenCat, newLevel, specialType) {
        const body = goldenCat.body;
        const x = body.position.x;
        const y = body.position.y;
        const angle = body.angle;
        const vel = { x: body.velocity.x, y: body.velocity.y };
        const angVel = body.angularVelocity;

        Composite.remove(engine.world, body);
        activeCats = activeCats.filter(c => c !== goldenCat);

        const newCat = createCat({ level: newLevel, special: specialType }, x, y, true);
        newCat.spawnScale = 1.0;
        Body.setPosition(newCat.body, { x, y });
        Body.setAngle(newCat.body, angle);
        Body.setVelocity(newCat.body, vel);
        Body.setAngularVelocity(newCat.body, angVel);
        World.add(engine.world, newCat.body);
        activeCats.push(newCat);

        playMergeSound(1.6);
        spawnFloatingText(x, y - 20, `✨ Lvl ${newLevel}!`, "#ffd700");
        burstParticles(x, y, "#ffd700", 16);
        saveGameSession();
    }

    function burstParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            particles.push({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed - 1.2,
                color,
                radius: Math.random() * 4 + 2,
                alpha: 1.0,
                life: 1.0
            });
        }
    }

    function triggerExplosion(x, y, level) {
        const r = GameState.get_radius(level) + 40;
        activeCats.forEach(cat => {
            if (!cat.isDropped || cat.isMerged) return;
            const dx = cat.body.position.x - x;
            const dy = cat.body.position.y - y;
            const dist = Math.hypot(dx, dy);
            if (dist < r && dist > 1) {
                Body.applyForce(cat.body, cat.body.position, {
                    x: (dx / dist) * 0.04 * cat.body.mass,
                    y: (dy / dist) * 0.04 * cat.body.mass
                });
            }
        });
        burstParticles(x, y, "#ff7043", 20);
        spawnFloatingText(x, y - 30, "BOOM!", "#ff7043");
    }

    function applyCupGravity() {
        const g = CatPhysics.GRAVITY_Y;
        engine.gravity.x = Math.sin(cupTiltAngle) * g;
        engine.gravity.y = Math.cos(cupTiltAngle) * g;
        updateCupBoundaries(cupTiltAngle);
    }

    function settleCupUpright(delta) {
        cupTiltTarget = 0;
        const speed = Math.abs(cupTiltAngle) > 0.05 ? 10 : 14;
        cupTiltAngle += (0 - cupTiltAngle) * Math.min(1, delta * speed);
        if (Math.abs(cupTiltAngle) < 0.001) cupTiltAngle = 0;
        applyCupGravity();
    }

    function updateChaosTilt(delta) {
        if (currentGameMode !== GameModes.MODES.CHAOS || isGameOver) {
            if (cupTiltAngle !== 0 || cupTiltTarget !== 0 || engine.gravity.x !== 0) {
                settleCupUpright(delta);
            }
            return;
        }

        chaosTimer += delta;

        if (chaosTiltPhase === "idle" && chaosTimer >= 55) {
            chaosTiltPhase = "warn";
            chaosWarningTimer = 1.8;
            spawnFloatingText(360, 300, "↻ Cup tilts!", "#ffb300");
        }

        if (chaosTiltPhase === "warn") {
            chaosWarningTimer -= delta;
            if (chaosWarningTimer <= 0) {
                chaosTiltPhase = "tilted";
                cupTiltTarget = CHAOS_TILT_RAD;
                chaosTimer = 0;
            }
        }

        if (chaosTiltPhase === "tilted") {
            if (chaosTimer >= 3.5) {
                chaosTiltPhase = "idle";
                cupTiltTarget = 0;
                chaosTimer = 0;
            }
        }

        const tiltSpeed = cupTiltTarget === 0 ? 10 : 4;
        cupTiltAngle += (cupTiltTarget - cupTiltAngle) * Math.min(1, delta * tiltSpeed);
        if (Math.abs(cupTiltTarget - cupTiltAngle) < 0.001) cupTiltAngle = cupTiltTarget;
        applyCupGravity();
    }

    function onChaosMerge() {
        if (currentGameMode !== GameModes.MODES.CHAOS) return;
        mergeCountSinceTilt++;
        if (chaosTiltPhase === "idle" && mergeCountSinceTilt >= 12) {
            mergeCountSinceTilt = 0;
            chaosTiltPhase = "warn";
            chaosWarningTimer = 1.2;
            chaosTimer = 0;
            spawnFloatingText(360, 300, "↻ Merge tilt!", "#ffb300");
        }
    }

    function triggerWobble(cat, speed) {
        const force = Math.min(speed / CatPhysics.WOBBLE_SPEED_DIVISOR, CatPhysics.WOBBLE_MAX_FORCE);
        if (force > CatPhysics.WOBBLE_MIN_FORCE) {
            cat.wobbleVelocityX = -force;
            cat.wobbleVelocityY = force * 1.2;
        }
    }

    function spawnNewCat() {
        if (isGameOver) return;

        const spawnRadius = getSpawnRadius(nextSpawn);
        const handedSpawn = nextSpawn;
        currentCat = spawnEntity(handedSpawn, getClampedX(mouseX, spawnRadius), SPAWN_Y, false);
        currentCat.spawnScale = currentCat.isMouse ? 1.0 : 0.0;
        currentCat.scaleVelocity = 0.0;

        nextSpawn = rollNextSpawn(handedSpawn);
        updateNextPreview();
        updateModeBadge();

        if (isModalOpen()) {
            canDrop = false;
        } else {
            canDrop = true;
        }

        spawnDebugUltimatePair();
    }

    function spawnMergedCat(x, y, level, specialType) {
        const radius = GameState.get_radius(level);
        const colliderR = radius * CatPhysics.COLLIDER_RADIUS_SCALE;
        const clampedX = getClampedX(x, radius);
        const clampedY = Math.min(y, FLOOR_TOP_Y - colliderR);
        const cat = createCat({ level, special: specialType || null }, clampedX, clampedY, true);
        cat.spawnScale = 0.2;
        cat.scaleVelocity = 0.0;
        World.add(engine.world, cat.body);
        activeCats.push(cat);
    }

    /** TEMP debug — two lvl-11 cats at the bottom, almost touching (knock together to pop) */
    function spawnDebugUltimatePair() {
        if (!DEBUG_ULTIMATE_EGG_TEST || debugEggSpawned) return;
        debugEggSpawned = true;

        const level = 11;
        const r = GameState.get_radius(level);
        const colliderR = r * CatPhysics.COLLIDER_RADIUS_SCALE;
        const y = FLOOR_TOP_Y - colliderR - 4;
        const touchGap = colliderR * 2 + 6;
        const leftX = 360 - touchGap / 2;
        const rightX = 360 + touchGap / 2;

        [leftX, rightX].forEach(x => {
            const cat = createCat({ level, special: null }, x, y, true);
            cat.spawnScale = 1.0;
            Body.setStatic(cat.body, false);
            Body.setVelocity(cat.body, { x: 0, y: 0 });
            Body.setAngularVelocity(cat.body, 0);
            World.add(engine.world, cat.body);
            activeCats.push(cat);
        });
    }

    function getSpawnSpecFromCat(cat) {
        if (!cat) return { level: 1, special: null };
        if (cat.isGoldenBall) return { level: GameModes.GOLDEN_LEVEL, special: null };
        if (cat.isMouse) return { level: GameModes.MOUSE_LEVEL, special: null };
        return { level: cat.level, special: cat.specialType || null };
    }

    function captureUndoSnapshot() {
        if (isGameOver || !currentCat) return;
        lastUndoSnapshot = {
            score: GameState.score,
            fish_coins: GameState.fish_coins,
            cats: getSerializableCats(),
            current_spawn: getSpawnSpecFromCat(currentCat),
            next_spawn: { ...nextSpawn, special: nextSpawn.special || null },
            game_mode: currentGameMode,
            daily_spawn_index: dailySpawnIndex,
            cup_tilt: cupTiltAngle,
            cup_tilt_target: cupTiltTarget,
            chaos_timer: chaosTimer,
            chaos_tilt_phase: chaosTiltPhase,
            chaos_warning_timer: chaosWarningTimer,
            merge_count_since_tilt: mergeCountSinceTilt
        };
    }

    function updateGameOverUndoUI() {
        const undoBtn = document.getElementById("gameover-undo-btn");
        const undoHint = document.getElementById("gameover-undo-hint");
        const canUndo = !!lastUndoSnapshot;
        if (undoBtn) undoBtn.style.display = canUndo ? "flex" : "none";
        if (undoHint) undoHint.style.display = canUndo ? "block" : "none";
    }

    function clearAllCatsFromWorld() {
        activeCats.forEach(c => Composite.remove(engine.world, c.body));
        activeCats = [];
        if (currentCat && currentCat.body) {
            Composite.remove(engine.world, currentCat.body);
        }
        currentCat = null;
    }

    function restoreCatsFromSnapshot(catsData) {
        catsData.forEach(cData => {
            const spec = { level: cData.level, special: cData.special || null };
            const cat = spawnEntity(spec, cData.x, cData.y, true);
            Body.setPosition(cat.body, { x: cData.x, y: cData.y });
            Body.setAngle(cat.body, cData.angle);
            Body.setStatic(cat.body, false);
            Body.setVelocity(cat.body, { x: cData.velocity.x, y: cData.velocity.y });
            Body.setAngularVelocity(cat.body, cData.angularVelocity);
            cat.deathZoneTime = 0;
            if (cat.isMouse) {
                cat.isEscaping = false;
                cat.isRemoved = false;
                cat.spawnScale = 1.0;
            }
            World.add(engine.world, cat.body);
            activeCats.push(cat);
        });
    }

    function performUndoStep() {
        if (!lastUndoSnapshot || !isGameOver) return;

        const snap = lastUndoSnapshot;
        pendingGameOver = false;

        closeModal(document.getElementById("gameover-overlay"));
        isGameOver = false;
        isTargetingEraser = false;
        mergingBodyIds.clear();
        particles = [];
        floatingTexts = [];

        clearAllCatsFromWorld();

        GameState.score = snap.score;
        GameState.fish_coins = snap.fish_coins;
        currentGameMode = snap.game_mode;
        dailySpawnIndex = snap.daily_spawn_index;
        if (currentGameMode === GameModes.MODES.CHAOS) {
            cupTiltAngle = snap.cup_tilt;
            cupTiltTarget = snap.cup_tilt_target;
            chaosTimer = snap.chaos_timer;
            chaosTiltPhase = snap.chaos_tilt_phase;
            chaosWarningTimer = snap.chaos_warning_timer;
            mergeCountSinceTilt = snap.merge_count_since_tilt;
        } else {
            cupTiltAngle = 0;
            cupTiltTarget = 0;
            chaosTimer = 0;
            chaosTiltPhase = "idle";
            chaosWarningTimer = 0;
            mergeCountSinceTilt = 0;
        }
        applyCupGravity();

        restoreCatsFromSnapshot(snap.cats);

        nextSpawn = { ...snap.next_spawn };
        const spawnRadius = getSpawnRadius(snap.current_spawn);
        currentCat = spawnEntity(snap.current_spawn, getClampedX(mouseX, spawnRadius), SPAWN_Y, false);
        currentCat.spawnScale = currentCat.isMouse ? 1.0 : 1.0;
        currentCat.scaleVelocity = 0;

        updateNextPreview();
        updateHUD();
        updateModeBadge();
        updateTargetingUI();
        updateBGMState();

        activeCats.forEach(cat => {
            Body.setStatic(cat.body, false);
        });

        canDrop = true;
        saveGameSession();
        spawnFloatingText(360, 320, "⏪ One step back!", "#ffd700");
    }

    function finalizeGameOver() {
        if (!pendingGameOver) return;
        GameState.recordScoreForModes(pendingGameOverScore, currentGameMode);
        submitScore();
        pendingGameOver = false;
    }

    function dropCurrentCat() {
        if (!currentCat || !canDrop || isGameOver) return;

        captureUndoSnapshot();

        canDrop = false;
        const cat = currentCat;
        currentCat = null;
        
        Body.setPosition(cat.body, { x: getClampedX(mouseX, cat.radius), y: SPAWN_Y });

        // Zero out velocities to prevent angled momentum
        Body.setVelocity(cat.body, { x: 0, y: 0 });
        Body.setAngularVelocity(cat.body, 0);

        cat.isDropped = true;
        Body.setStatic(cat.body, false);
        totalDropsThisSession++;

        if (cat.isMouse) {
            cat.isEscaping = true;
            cat.squeaked = false;
            cat.stuckTime = 0;
            cat.ghostBaseX = cat.body.position.x;
            cat.ghostElapsed = 0;
            Body.setVelocity(cat.body, { x: 0, y: MOUSE_GHOST_FALL_SPEED / 60 });
        }

        World.add(engine.world, cat.body);
        activeCats.push(cat);

        playDropSound();
        saveGameSession();

        const currentSession = gameSessionId;
        setTimeout(() => {
            if (currentSession === gameSessionId) {
                spawnNewCat();
            }
        }, 700);
    }

    function getClampedX(x, radius) {
        // Add 5 pixels padding so it doesn't touch the walls and bounce diagonally on drop
        return Math.max(LEFT_LIMIT + radius + 5, Math.min(RIGHT_LIMIT - radius - 5, x));
    }

    function getCatColliderRadius(cat) {
        return cat.radius * CatPhysics.COLLIDER_RADIUS_SCALE;
    }

    function clampCatInCup(cat) {
        if (!cat.isDropped || cat.body.isStatic) return;

        if (Math.abs(cupTiltAngle) > 0.02) {
            const speed = Math.hypot(cat.body.velocity.x, cat.body.velocity.y);
            if (speed > CatPhysics.MAX_CAT_SPEED) {
                const scale = CatPhysics.MAX_CAT_SPEED / speed;
                Body.setVelocity(cat.body, {
                    x: cat.body.velocity.x * scale,
                    y: cat.body.velocity.y * scale
                });
            }
            return;
        }

        const r = cat.isMouse ? getMouseColliderRadius(cat) : getCatColliderRadius(cat);
        const minX = LEFT_LIMIT + r;
        const maxX = RIGHT_LIMIT - r;
        const maxY = FLOOR_TOP_Y - r;
        const pos = cat.body.position;
        let x = pos.x;
        let y = pos.y;
        let clampedX = false;

        if (x < minX) { x = minX; clampedX = true; }
        if (x > maxX) { x = maxX; clampedX = true; }
        if (y > maxY) y = maxY;

        if (x !== pos.x || y !== pos.y) {
            Body.setPosition(cat.body, { x, y });
        }
        if (clampedX) {
            Body.setVelocity(cat.body, { x: 0, y: cat.body.velocity.y });
        }

        const speed = Math.hypot(cat.body.velocity.x, cat.body.velocity.y);
        if (speed > CatPhysics.MAX_CAT_SPEED) {
            const scale = CatPhysics.MAX_CAT_SPEED / speed;
            Body.setVelocity(cat.body, {
                x: cat.body.velocity.x * scale,
                y: cat.body.velocity.y * scale
            });
        }

        // Плавное затухание вращения (угловой скорости) котика,
        // чтобы предотвратить бесконечное кручение вокруг своей оси в углах
        Body.setAngularVelocity(cat.body, cat.body.angularVelocity * 0.94);
    }

    function clampAllCatsInCup() {
        activeCats.forEach(clampCatInCup);
    }

    function getRandomSpawnLevel() {
        return rollNextSpawn();
    }

    // --- Particle and Overlay Effects ---
    function triggerMergeEffects(x, y, newLevel) {
        // Play merge sound with pitch scale matching level (higher level = lower pitch)
        const pitch = Math.max(0.6, Math.min(2.0, 1.4 - (newLevel - 1) * 0.08));
        playMergeSound(pitch);

        // Screen Shake for big merges (Level 7+)
        if (newLevel >= 7) {
            const intensity = 5.0 + (newLevel - 7) * 3.5;
            const duration = 0.2 + (newLevel - 7) * 0.05;
            shakeCamera(intensity, duration);
        }

        // Merge particles
        const particleColor = GameState.get_color(Math.min(newLevel, 11));
        const pCount = 12 + newLevel * 2;
        for (let i = 0; i < pCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5, // slightly upwards
                color: particleColor,
                radius: Math.random() * 5 + 3,
                alpha: 1.0,
                life: 1.0 // 100%
            });
        }

        // Spawn flying score popup
        const addedScore = newLevel > 11 ? 500 : (newLevel - 1) * 2;
        spawnFloatingText(x, y, `+${addedScore}`, GameState.get_color(Math.min(newLevel, 11)));

        // Spawn flying coins popup
        spawnFloatingText(x + 40, y - 25, `+${newLevel} 🐟`, "#ffd700");
    }

    /** Dev easter egg — only when 11 + 11 pop */
    function triggerBigCatGroomEasterEgg(x, y) {
        devPeekEffect = {
            timer: 2.5,
            total: 2.5,
            phase: 0,
            side: x > 360 ? -1 : 1,
            x,
            y
        };
        GameAudio.playGroomLick();
        spawnFloatingText(x, y - 55, "ULTIMATE POP! 🐾", "#ffb5e8");
        shakeCamera(10, 0.28);
        burstParticles(x, y, "#f48fb1", 28);
    }

    function easeOutBack(t) {
        const c1 = 1.525;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function updateDevPeekEffect(delta) {
        if (!devPeekEffect) return;
        devPeekEffect.timer -= delta;
        devPeekEffect.phase += delta;
        if (devPeekEffect.timer <= 0) devPeekEffect = null;
    }

    function drawComicSpeechBubble(ctx, cx, cy, text, tailDir) {
        ctx.font = "bold 14px 'Nunito', sans-serif";
        const padX = 18;
        const padY = 11;
        const textW = ctx.measureText(text).width;
        const w = textW + padX * 2;
        const h = 38;
        const left = cx - w / 2;
        const top = cy - h / 2;
        const r = 14;
        const tailBaseX = cx + tailDir * (w * 0.22);

        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(left + r, top);
        ctx.lineTo(left + w - r, top);
        ctx.quadraticCurveTo(left + w, top, left + w, top + r);
        ctx.lineTo(left + w, top + h - r);
        ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
        ctx.lineTo(tailBaseX + 14 * tailDir, top + h);
        ctx.lineTo(tailBaseX, top + h + 20);
        ctx.lineTo(tailBaseX - 10 * tailDir, top + h);
        ctx.lineTo(left + r, top + h);
        ctx.quadraticCurveTo(left, top + h, left, top + h - r);
        ctx.lineTo(left, top + r);
        ctx.quadraticCurveTo(left, top, left + r, top);
        ctx.closePath();

        ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
        ctx.fill();

        ctx.fillStyle = "#ffb347";
        ctx.fill();
        ctx.strokeStyle = "#2d1b4e";
        ctx.lineWidth = 3.2;
        ctx.stroke();

        ctx.fillStyle = "#2d1b4e";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, cx, cy + 1);
        ctx.restore();
    }

    function getDevPeekLayout(e, vis) {
        const side = e.side;
        const drawH = 420;
        const img = devCatPeekImage;
        const aspect = (img && img.naturalWidth) ? img.naturalWidth / img.naturalHeight : 1.5;
        const drawW = drawH * aspect;
        const slide = drawW * 0.92 * vis;
        const bob = Math.sin(e.phase * 2.8) * 5 * vis;
        const anchorY = Math.min(680, Math.max(400, e.y)) + bob;
        const top = anchorY - drawH * 0.52;

        let faceX;
        let mouthX;
        const faceY = top + drawH * 0.28;
        const mouthY = top + drawH * 0.44;
        if (side > 0) {
            const spriteLeft = -drawW + slide;
            faceX = spriteLeft + drawW * 0.68;
            mouthX = spriteLeft + drawW * 0.72;
        } else {
            faceX = (GAME_W - slide) - drawW * 0.32;
            mouthX = (GAME_W - slide) - drawW * 0.28;
        }

        return { side, drawH, drawW, slide, bob, anchorY, top, faceX, faceY, mouthX, mouthY };
    }

    function drawDevPeekEffect() {
        if (!devPeekEffect) return;

        const e = devPeekEffect;
        const elapsed = e.total - e.timer;
        const enter = easeOutBack(Math.min(1, elapsed / 0.42));
        const exit = Math.min(1, e.timer / 0.45);
        const vis = enter * exit;
        if (vis <= 0.01) return;

        const side = e.side;
        const img = devCatPeekImage;
        const hasSprite = img && img.complete && img.naturalWidth > 0;
        const layout = getDevPeekLayout(e, vis);

        if (hasSprite) {
            const { drawH, drawW, slide, top, faceX, faceY, side } = layout;

            ctx.save();
            ctx.globalAlpha = 0.98 * Math.min(1, enter * 1.1) * exit;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            if (side > 0) {
                ctx.drawImage(img, -drawW + slide, top, drawW, drawH);
            } else {
                ctx.save();
                ctx.translate(GAME_W, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(img, -drawW + slide, top, drawW, drawH);
                ctx.restore();
            }
            ctx.restore();

            if (elapsed > 0.18 && e.timer > 0.38) {
                const bubbleSlide = Math.min(1, (elapsed - 0.18) / 0.3) * exit;
                const { faceX, faceY } = layout;
                const bubbleX = faceX + side * 30;
                const bubbleY = faceY - 46;
                const pop = 0.88 + 0.12 * bubbleSlide;

                ctx.save();
                ctx.globalAlpha = 0.96 * vis * bubbleSlide;
                ctx.translate(bubbleX + (1 - bubbleSlide) * side * 16, bubbleY);
                ctx.scale(pop, pop);
                drawComicSpeechBubble(ctx, 0, 0, "George praises you!", -side);
                ctx.restore();
            }
            return;
        }

        if (elapsed > 0.2 && e.timer > 0.4) {
            const tagSlide = Math.min(1, (elapsed - 0.2) / 0.28) * exit;
            const bob = Math.sin(e.phase * 2.8) * 5 * vis;
            const anchorY = Math.min(680, Math.max(400, e.y)) + bob;
            const tagX = side > 0 ? 168 : GAME_W - 168;

            ctx.save();
            ctx.globalAlpha = 0.92 * vis * tagSlide;
            ctx.translate(tagX + (1 - tagSlide) * side * 36, anchorY - 130);
            drawComicSpeechBubble(ctx, 0, 0, "George praises you!", -side);
            ctx.restore();
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function spawnFloatingText(x, y, text, color) {
        floatingTexts.push({
            x: x,
            y: y,
            text: text,
            color: color,
            alpha: 1.0,
            ySpeed: -2.5,
            life: 1.0
        });
    }

    function shakeCamera(intensity, duration) {
        shakeIntensity = intensity;
        shakeDuration = duration;
    }

    // --- Visual Rendering Engine ---
    function drawBackgroundGingham(colors) {
        ctx.fillStyle = colors.paperColor;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Gingham stripes (plaid)
        ctx.fillStyle = colors.stripeColor;
        const stripeSize = 45;
        const gap = 100;
        
        // Verticals
        for (let x = 0; x < GAME_W; x += gap) {
            ctx.fillRect(x, 0, stripeSize, GAME_H);
        }
        // Horizontals
        for (let y = 0; y < GAME_H; y += gap) {
            ctx.fillRect(0, y, GAME_W, stripeSize);
        }
    }

    function drawWobblyLine(x1, y1, x2, y2, color, width, wobble = 1.5) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const segments = Math.max(2, Math.floor(dist / 20));
        const dx = (x2 - x1) / dist;
        const dy = (y2 - y1) / dist;
        const nx = -dy;
        const ny = dx;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;
            const offset = Math.sin(x1 * 0.05 + y1 * 0.05 + i * 2.3) * wobble;
            ctx.lineTo(px + nx * offset, py + ny * offset);
        }
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
    }

    function drawMemoCardOutline(x, y, w, h, colors) {
        const top_left = { x: x, y: y };
        const top_right = { x: x + w, y: y };
        const bottom_right = { x: x + w, y: y + h };
        const bottom_left = { x: x, y: y + h };

        const pts = [];
        const steps = 8;

        // Top
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = top_left.x + (top_right.x - top_left.x) * t;
            const py = top_left.y + Math.sin(px * 0.08 + 1.2) * 1.5;
            pts.push({ x: px, y: py });
        }
        // Right
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const py = top_right.y + (bottom_right.y - top_right.y) * t;
            const px = top_right.x + Math.sin(py * 0.08 + 2.5) * 1.5;
            pts.push({ x: px, y: py });
        }
        // Bottom
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const px = bottom_right.x + (bottom_left.x - bottom_right.x) * t;
            const py = bottom_right.y + Math.sin(px * 0.08 + 3.8) * 1.5;
            pts.push({ x: px, y: py });
        }
        // Left
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const py = bottom_left.y + (top_left.y - bottom_left.y) * t;
            const px = bottom_left.x + Math.sin(py * 0.08 + 5.1) * 1.5;
            pts.push({ x: px, y: py });
        }

        // Fill background
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = colors.cardColor;
        ctx.fill();

        // Outline
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = colors.penColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Notebook horizontal rulings
        const gridStep = 14.0;
        let gridY = y + 24.0;
        while (gridY < y + h - 12.0) {
            drawWobblyLine(x + 8.0, gridY, x + w - 8.0, gridY, colors.penColor + "33", 0.8, 0.6); // 20% opacity pen color
            gridY += gridStep;
        }

        // Washi tape at top-left
        ctx.fillStyle = colors.blushColor.replace("0.4", "0.55"); // increase opacity
        ctx.beginPath();
        ctx.moveTo(top_left.x - 15, top_left.y + 10);
        ctx.lineTo(top_left.x + 25, top_left.y - 15);
        ctx.lineTo(top_left.x + 35, top_left.y - 5);
        ctx.lineTo(top_left.x - 5, top_left.y + 20);
        ctx.closePath();
        ctx.fill();

        // Tape edges outlines
        ctx.strokeStyle = colors.penColor + "80"; // 50% opacity
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(top_left.x - 15, top_left.y + 10);
        ctx.lineTo(top_left.x - 5, top_left.y + 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(top_left.x + 25, top_left.y - 15);
        ctx.lineTo(top_left.x + 35, top_left.y - 5);
        ctx.stroke();
    }

    // --- Doodle Drawing Functions (grid elements) ---
    function drawCatHead(x, y, scale, colors) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        
        ctx.fillStyle = colors.blushColor;
        ctx.lineWidth = 1.6;

        // Ear blush fill
        ctx.beginPath();
        ctx.moveTo(-14, -14);
        ctx.lineTo(-11, -26);
        ctx.lineTo(-3, -19);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(3, -19);
        ctx.lineTo(11, -26);
        ctx.lineTo(14, -14);
        ctx.closePath();
        ctx.fill();

        // Head outline
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.strokeStyle = colors.penColor;
        ctx.stroke();

        // Ear outline
        ctx.beginPath();
        ctx.moveTo(-17, -15);
        ctx.lineTo(-12, -29);
        ctx.lineTo(-2, -21);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, -21);
        ctx.lineTo(12, -29);
        ctx.lineTo(17, -15);
        ctx.stroke();

        // Sleepy eyes
        ctx.beginPath();
        ctx.arc(-8, -1, 4, 0, Math.PI);
        ctx.strokeStyle = colors.pencilColor;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(8, -1, 4, 0, Math.PI);
        ctx.stroke();

        // Blush cheeks
        ctx.beginPath();
        ctx.arc(-12, 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(12, 5, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.beginPath();
        ctx.moveTo(-1.5, 4);
        ctx.lineTo(1.5, 4);
        ctx.lineTo(0, 5.5);
        ctx.closePath();
        ctx.fillStyle = colors.pencilColor;
        ctx.fill();
        ctx.strokeStyle = colors.pencilColor;
        ctx.stroke();

        // Mouth w-shape
        ctx.beginPath();
        ctx.arc(-2, 7.5, 2, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(2, 7.5, 2, 0, Math.PI);
        ctx.stroke();

        ctx.restore();
    }

    function drawFishSkeleton(x, y, scale, colors) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.strokeStyle = colors.penColor;
        ctx.lineWidth = 1.6;

        // Spine
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(16, 0);
        ctx.stroke();

        // Skull
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-26, -6);
        ctx.lineTo(-32, -6);
        ctx.lineTo(-32, 6);
        ctx.lineTo(-26, 6);
        ctx.closePath();
        ctx.stroke();
        
        // Skull eye dot
        ctx.beginPath();
        ctx.arc(-26, -2, 1, 0, Math.PI*2);
        ctx.fillStyle = colors.penColor;
        ctx.fill();

        // Ribs (3 pairs)
        ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-12, 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-4, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(4, 4); ctx.stroke();

        // Tail fin
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(24, -10);
        ctx.lineTo(22, 0);
        ctx.lineTo(24, 10);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }

    function drawDoubleHearts(x, y, scale, colors) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.lineWidth = 1.6;

        // Drawing a path for heart shape
        function pathHeart(ctx, size) {
            ctx.beginPath();
            ctx.moveTo(0, -size * 0.3);
            ctx.bezierCurveTo(-size * 0.4, -size * 0.7, -size * 0.8, -size * 0.4, -size * 0.8, 0);
            ctx.bezierCurveTo(-size * 0.8, size * 0.4, -size * 0.4, size * 0.7, 0, size);
            ctx.bezierCurveTo(size * 0.4, size * 0.7, size * 0.8, size * 0.4, size * 0.8, 0);
            ctx.bezierCurveTo(size * 0.8, -size * 0.4, size * 0.4, -size * 0.7, 0, -size * 0.3);
            ctx.closePath();
        }

        // Heart 1
        ctx.save();
        ctx.translate(-6, -2);
        ctx.rotate(-0.1);
        pathHeart(ctx, 12);
        ctx.fillStyle = colors.blushColor;
        ctx.fill();
        ctx.strokeStyle = colors.penColor;
        ctx.stroke();
        ctx.restore();

        // Heart 2
        ctx.save();
        ctx.translate(8, 6);
        ctx.rotate(0.18);
        pathHeart(ctx, 8);
        ctx.fillStyle = colors.blushColor;
        ctx.fill();
        ctx.strokeStyle = colors.penColor;
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    function drawBowOrStars(x, y, scale, colors) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.strokeStyle = colors.penColor;
        ctx.lineWidth = 1.6;

        // Bow loop curves
        ctx.fillStyle = colors.blushColor;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Left loop
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-15, -12, -22, -2, -6, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right loop
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(15, -12, 22, -2, 6, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Ribbon tails
        ctx.beginPath();
        ctx.moveTo(-2, 2);
        ctx.lineTo(-12, 14);
        ctx.lineTo(-7, 14);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(12, 14);
        ctx.lineTo(7, 14);
        ctx.stroke();

        ctx.restore();
    }

    function drawBackgroundDecorations(colors) {
        // Staggered grid doodles
        const cellW = 144.0;
        const cellH = 142.22;
        
        for (let r = 0; r <= 9; r++) {
            for (let c = -1; c <= 5; c++) {
                let px = (c + 0.5) * cellW;
                const py = (r + 0.5) * cellH;

                if (r % 2 === 1) {
                    px += cellW * 0.5;
                }

                const itemIndex = Math.abs(r * 3 + c) % 4;
                switch (itemIndex) {
                    case 0: drawCatHead(px, py, 0.72, colors); break;
                    case 1: drawFishSkeleton(px, py, 0.75, colors); break;
                    case 2: drawDoubleHearts(px, py, 0.7, colors); break;
                    case 3: drawBowOrStars(px, py, 0.8, colors); break;
                }
            }
        }

        // Notebook paper cards are now drawn via HTML/CSS directly

        // Draw wobbly Glass Cup boundaries (rotates with Chaos tilt — synced to physics walls)
        ctx.save();
        ctx.translate(CUP_PIVOT_X, CUP_PIVOT_Y);
        ctx.rotate(cupTiltAngle);
        ctx.translate(-CUP_PIVOT_X, -CUP_PIVOT_Y);

        drawWobblyLine(80, 250, 80, 1075, colors.pencilColor.replace("0.35", "0.75"), 2.0, 1.0);
        drawWobblyLine(80, 1075, 110, 1098, colors.pencilColor.replace("0.35", "0.75"), 2.0, 1.0);
        drawWobblyLine(110, 1098, 610, 1098, colors.pencilColor.replace("0.35", "0.75"), 2.0, 1.0);
        drawWobblyLine(610, 1098, 640, 1075, colors.pencilColor.replace("0.35", "0.75"), 2.0, 1.0);
        drawWobblyLine(640, 1075, 640, 250, colors.pencilColor.replace("0.35", "0.75"), 2.0, 1.0);

        // Double wobbles and diagonal hatchings
        drawWobblyLine(84, 250, 84, 1070, colors.pencilColor.replace("0.35", "0.4"), 1.0, 0.8);
        drawWobblyLine(636, 1070, 636, 250, colors.pencilColor.replace("0.35", "0.4"), 1.0, 0.8);
        
        // Hatch lines down left wall
        let segY = 270;
        while (segY < 1050) {
            ctx.beginPath();
            ctx.moveTo(80, segY);
            ctx.lineTo(95, segY + 8);
            ctx.strokeStyle = colors.pencilColor;
            ctx.lineWidth = 1.0;
            ctx.stroke();
            segY += 15;
        }

        // Hatch lines down right wall
        segY = 270;
        while (segY < 1050) {
            ctx.beginPath();
            ctx.moveTo(640, segY);
            ctx.lineTo(625, segY + 8);
            ctx.strokeStyle = colors.pencilColor;
            ctx.lineWidth = 1.0;
            ctx.stroke();
            segY += 15;
        }

        // Vertical reflections
        drawWobblyLine(95, 270, 95, 1050, colors.penColor.replace("0.45", "0.2"), 1.0, 0.8);
        drawWobblyLine(105, 280, 105, 1030, colors.penColor.replace("0.45", "0.1"), 0.8, 0.6);
        drawWobblyLine(625, 270, 625, 1050, colors.penColor.replace("0.45", "0.2"), 1.0, 0.8);
        drawWobblyLine(615, 280, 615, 1030, colors.penColor.replace("0.45", "0.1"), 0.8, 0.6);

        // Ground shading shadows under cup
        ctx.beginPath();
        ctx.ellipse(360, 1110, 180, 10, 0, 0, Math.PI * 2);
        ctx.strokeStyle = colors.pencilColor.replace("0.35", "0.6");
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(360, 1115, 220, 15, 0, 0, Math.PI * 2);
        ctx.strokeStyle = colors.pencilColor.replace("0.35", "0.4");
        ctx.stroke();

        // 3D Glass top rim
        ctx.beginPath();
        ctx.ellipse(360, 250, 280, 12, 0, 0, Math.PI * 2);
        ctx.strokeStyle = colors.pencilColor.replace("0.35", "0.95");
        ctx.lineWidth = 2.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(360, 250, 277, 9.5, 0, 0, Math.PI * 2);
        ctx.strokeStyle = colors.pencilColor.replace("0.35", "0.5");
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.restore();
    }

    function drawCatSphere(cat) {
        const x = cat.body.position.x;
        const y = cat.body.position.y;
        const radius = cat.radius;
        const level = cat.level;
        
        ctx.save();
        ctx.translate(x, y);
        if (cat.isMouse) {
            ctx.scale(cat.spawnScale, cat.spawnScale);
        } else {
            ctx.rotate(cat.body.angle);
            ctx.scale(cat.spawnScale * cat.wobbleScaleX, cat.spawnScale * cat.wobbleScaleY);
        }

        if (cat.isGoldenBall) {
            CatSprite.drawGolden(ctx, radius, Date.now());
        } else if (cat.isMouse) {
            CatSprite.drawMouse(ctx, radius, Date.now(), getMouseFaceAngle(cat));
        } else {
            const img = getCatImage(level);

            if (img && img.complete && img.naturalWidth !== 0) {
                drawCatSprite(ctx, img, radius);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fillStyle = GameState.get_color(level);
                ctx.fill();

                ctx.fillStyle = "#232535";
                ctx.font = `bold ${Math.floor(radius * 0.9)}px 'Nunito', sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(level, 0, 0);
            }
            if (cat.specialType && currentGameMode === GameModes.MODES.CHAOS) {
                CatSprite.drawSpecialRing(ctx, radius, cat.specialType, Date.now());
            }
        }

        ctx.restore();
    }

    // --- Death Zone Laser Warning Line ---
    function drawLaserLine(colors) {
        ctx.save();
        ctx.translate(CUP_PIVOT_X, CUP_PIVOT_Y);
        ctx.rotate(cupTiltAngle);
        ctx.translate(-CUP_PIVOT_X, -CUP_PIVOT_Y);

        const pulse = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(Date.now() * 0.008));
        const laserColor = `rgba(242, 66, 66, ${pulse})`;

        ctx.beginPath();
        ctx.setLineDash([10, 6]);
        ctx.moveTo(80, 250);
        ctx.lineTo(640, 250);
        ctx.strokeStyle = laserColor;
        ctx.lineWidth = 3.0;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // --- UI Laser Pointer Guide Line ---
    function drawGuideLine(colors) {
        if (!currentCat || isModalOpen() || isTargetingEraser) return;

        ctx.save();
        const laserColor = colors.guideColor;
        
        ctx.beginPath();
        ctx.moveTo(currentCat.body.position.x, currentCat.body.position.y);
        const guideLen = 880;
        const gx = Math.sin(cupTiltAngle) * guideLen;
        const gy = Math.cos(cupTiltAngle) * guideLen;
        ctx.lineTo(currentCat.body.position.x + gx, currentCat.body.position.y + gy);

        const grad = ctx.createLinearGradient(
            currentCat.body.position.x, currentCat.body.position.y,
            currentCat.body.position.x + gx, currentCat.body.position.y + gy
        );
        grad.addColorStop(0, laserColor);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }

    // --- Dynamic DOM State Sync ---
    function formatHudNum(n) {
        return Number(n || 0).toLocaleString("en-US");
    }

    function applyHudNum(el, n) {
        if (!el) return;
        const v = Math.max(0, Math.floor(Number(n) || 0));
        el.textContent = formatHudNum(v);
        const digits = String(v).length;
        el.dataset.digits = String(Math.min(9, Math.max(1, digits)));
    }

    function updatePlayerChip() {
        const name = GameState.player_name || "Guest";
        const nameEl = document.getElementById("player-name-text");
        const avatarEl = document.getElementById("player-avatar");
        if (nameEl) nameEl.textContent = name;
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    }

    function updateHUD() {
        applyHudNum(document.getElementById("score-val"), GameState.score);
        applyHudNum(document.getElementById("highscore-val"), GameState.highscore);
        GameState.resetTodayIfNeeded();
        applyHudNum(document.getElementById("today-val"), GameState.today_best);
        applyHudNum(document.getElementById("daily-val"), GameState.daily_best);
        applyHudNum(document.getElementById("coin-val"), GameState.fish_coins);
        updatePlayerChip();
        
        // Update coin labels inside shop modal and button
        const balLabel = document.getElementById("shop-balance");
        if (balLabel) balLabel.textContent = `Your Balance: 🐟 ${formatHudNum(GameState.fish_coins)}`;

        // Disable boosters if coins insufficient
        document.getElementById("yarn-btn").disabled = (GameState.fish_coins < 150) || isTargetingEraser;
        document.getElementById("fishbone-btn").disabled = (GameState.fish_coins < 350) && !isTargetingEraser;
    }

    function updateNextPreview() {
        const preview = document.getElementById("next-preview-image");
        const previewD = 62;
        if (isMouseSpawn(nextSpawn)) {
            CatSprite.renderMousePreview(preview, previewD, 0.9);
        } else if (isGoldenSpawn(nextSpawn)) {
            CatSprite.renderGoldenPreview(preview, previewD, 0.9);
        } else {
            renderCatPreview(preview, getCatImage(nextSpawn.level), previewD, 0.9);
        }
    }

    function updateModeBadge() {
        const badge = document.getElementById("mode-badge");
        if (badge) badge.textContent = GameModes.modeLabel(currentGameMode);
    }

    function startGameMode(mode) {
        currentGameMode = mode;
        dailySpawnIndex = 0;
        totalDropsThisSession = 0;
        cupTiltAngle = 0;
        cupTiltTarget = 0;
        chaosTimer = 0;
        chaosTiltPhase = "idle";
        mergeCountSinceTilt = 0;
        applyCupGravity();
        if (mode === GameModes.MODES.DAILY) {
            nextSpawn = ensureSpawnAllowed(GameModes.getNextSpawn(mode, 0));
            dailySpawnIndex = 1;
        } else {
            nextSpawn = ensureSpawnAllowed(GameModes.getNextSpawn(mode, 0));
        }
        updateModeBadge();
    }

    function updateAudioButtons() {
        document.getElementById("sfx-btn").textContent = GameState.sfx_enabled ? "🔊" : "🔇";
        document.getElementById("music-btn").textContent = GameState.music_enabled ? "🎵" : "⏸️";
    }

    // --- Game Over Sequence ---
    function triggerGameOver() {
        if (isGameOver) return;
        isGameOver = true;
        isTargetingEraser = false;
        updateTargetingUI();
        updateBGMState();

        // Play sound
        playGameOverSound();

        pendingGameOver = true;
        pendingGameOverScore = GameState.score;

        // Freeze all physics bodies
        activeCats.forEach(cat => {
            Body.setStatic(cat.body, true);
            Body.setVelocity(cat.body, { x: 0, y: 0 });
            cat.body.angularVelocity = 0;
        });
        if (currentCat && currentCat.body) {
            Body.setStatic(currentCat.body, true);
        }

        updateGameOverUndoUI();
        document.getElementById("gameover-score-text").textContent = `Your Score: ${GameState.score}`;
        openModal(document.getElementById("gameover-overlay"));
    }

    function restartGame() {
        if (isGameOver) {
            finalizeGameOver();
            GameState.deleteActiveSession();
        }

        gameSessionId++;
        isGameOver = false;
        pendingGameOver = false;
        lastUndoSnapshot = null;
        isTargetingEraser = false;
        mergingBodyIds.clear();
        updateTargetingUI();
        updateBGMState();

        // Clear physics bodies
        activeCats.forEach(cat => {
            Composite.remove(engine.world, cat.body);
        });
        activeCats = [];
        if (currentCat && currentCat.body) {
            Composite.remove(engine.world, currentCat.body);
        }
        currentCat = null;

        // Clear particles & texts
        particles = [];
        floatingTexts = [];
        devPeekEffect = null;
        debugEggSpawned = false;

        GameState.resetScore();
        startGameMode(currentGameMode);
        updateHUD();

        // Hide modals
        closeAllModals();

        // Spawn first cat
        spawnNewCat();
    }

    // --- Camera / Viewport Shake Implementation ---
    function updateCameraShake() {
        if (shakeDuration > 0) {
            shakeOffsetX = (Math.random() - 0.5) * shakeIntensity;
            shakeOffsetY = (Math.random() - 0.5) * shakeIntensity;
            shakeDuration -= 0.016; // 60fps delta approx
            if (shakeDuration <= 0) {
                shakeOffsetX = 0;
                shakeOffsetY = 0;
            }
        }
    }

    // --- Main Game Loop (Physics & Animation ticks) ---
    function gameLoop(time) {
        const delta = (time - lastTime) / 1000.0;
        lastTime = time;

        // Step physics engine
        if (!isGameOver) {
            updateChaosTilt(delta);
            Engine.update(engine, 1000 / 60);
            clampAllCatsInCup();
            updateMice(delta);
            updateDevPeekEffect(delta);
        }

        // Clear draw buffers and offset context for screen shake
        ctx.save();
        updateCameraShake();
        ctx.translate(shakeOffsetX, shakeOffsetY);

        // Render Background Gingham & hand-drawn doodles
        drawBackgroundGingham(currentThemeColors);
        drawBackgroundDecorations(currentThemeColors);

        // Update & Render Particles
        particles.forEach((p, idx) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // particle gravity
            p.alpha -= 0.02;
            p.life -= 0.02;

            if (p.alpha > 0) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
                ctx.fill();
                ctx.globalAlpha = 1.0; // reset
            }
        });
        particles = particles.filter(p => p.life > 0 && p.alpha > 0);

        // Update & Render Floating texts
        floatingTexts.forEach((t, idx) => {
            t.y += t.ySpeed;
            t.alpha -= 0.015;
            t.life -= 0.015;

            if (t.alpha > 0) {
                ctx.fillStyle = t.color;
                ctx.font = "bold 20px 'Nunito', sans-serif";
                ctx.textAlign = "center";
                ctx.globalAlpha = t.alpha;
                ctx.fillText(t.text, t.x, t.y);
                ctx.globalAlpha = 1.0;
            }
        });
        floatingTexts = floatingTexts.filter(t => t.life > 0 && t.alpha > 0);

        // Render warning line
        drawLaserLine(currentThemeColors);

        // Render Guide Laser Pointer
        drawGuideLine(currentThemeColors);

        // Render Dropped Cats
        let maxDeathTime = 0.0;
        activeCats.forEach(cat => {
            drawCatSphere(cat);

            // Spring physics for spawnScale (elastic spawn/merge)
            if (cat.spawnScale < 1.0 || cat.scaleVelocity !== 0.0) {
                const k = 0.12;
                const damping = 0.8;
                const force = -k * (cat.spawnScale - 1.0);
                cat.scaleVelocity = (cat.scaleVelocity + force) * damping;
                cat.spawnScale += cat.scaleVelocity;
                if (Math.abs(cat.spawnScale - 1.0) < 0.001 && Math.abs(cat.scaleVelocity) < 0.001) {
                    cat.spawnScale = 1.0;
                    cat.scaleVelocity = 0.0;
                }
            }

            // Spring physics for wobble — settle to round when cat rests
            const wobbleSpeed = Math.hypot(cat.body.velocity.x, cat.body.velocity.y);
            const wk = 0.14;
            const wdamping = 0.82;
            const wforceX = -wk * (cat.wobbleScaleX - 1.0);
            cat.wobbleVelocityX = (cat.wobbleVelocityX + wforceX) * wdamping;
            cat.wobbleScaleX += cat.wobbleVelocityX;
            const wforceY = -wk * (cat.wobbleScaleY - 1.0);
            cat.wobbleVelocityY = (cat.wobbleVelocityY + wforceY) * wdamping;
            cat.wobbleScaleY += cat.wobbleVelocityY;

            if (wobbleSpeed < 0.35) {
                cat.wobbleScaleX += (1.0 - cat.wobbleScaleX) * 0.18;
                cat.wobbleScaleY += (1.0 - cat.wobbleScaleY) * 0.18;
            }
            cat.wobbleScaleX = Math.max(0.94, Math.min(1.06, cat.wobbleScaleX));
            cat.wobbleScaleY = Math.max(0.94, Math.min(1.06, cat.wobbleScaleY));
            if (Math.abs(cat.wobbleScaleX - 1) < 0.008) cat.wobbleScaleX = 1;
            if (Math.abs(cat.wobbleScaleY - 1) < 0.008) cat.wobbleScaleY = 1;

            // Death zone countdown checking
            if (!isGameOver && cat.isDropped && !cat.isMouse) {
                const speed = Math.hypot(cat.body.velocity.x, cat.body.velocity.y);
                const localY = worldToCupLocal(cat.body.position.x, cat.body.position.y).y;
                if (speed < 0.25 && localY < 320) {
                    cat.deathZoneTime += delta;
                    if (cat.deathZoneTime > maxDeathTime) {
                        maxDeathTime = cat.deathZoneTime;
                    }
                    if (cat.deathZoneTime > 3.0) {
                        triggerGameOver();
                    }
                } else {
                    cat.deathZoneTime = 0.0;
                }
            }
        });

        // Pulse warning vignette and red borders dynamically based on time spent in death zone (analog feedback)
        const dangerVig = document.getElementById("danger-vignette");
        if (maxDeathTime > 0.0 && !isGameOver) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
            const intensity = (maxDeathTime / 3.0) * pulse;
            dangerVig.style.boxShadow = `inset 0 0 100px rgba(220, 0, 0, ${Math.min(intensity, 1.0)})`;
            dangerVig.style.display = "block";
        } else {
            dangerVig.style.boxShadow = "inset 0 0 100px rgba(220, 0, 0, 0)";
            dangerVig.style.display = "none";
        }

        // Render Un-dropped cat following guides
        if (currentCat && !isGameOver) {
            drawCatSphere(currentCat);
            
            // Spring physics for spawnScale of current preview cat
            if (currentCat.spawnScale < 1.0 || currentCat.scaleVelocity !== 0.0) {
                const k = 0.12;
                const damping = 0.8;
                const force = -k * (currentCat.spawnScale - 1.0);
                currentCat.scaleVelocity = (currentCat.scaleVelocity + force) * damping;
                currentCat.spawnScale += currentCat.scaleVelocity;
                if (Math.abs(currentCat.spawnScale - 1.0) < 0.001 && Math.abs(currentCat.scaleVelocity) < 0.001) {
                    currentCat.spawnScale = 1.0;
                    currentCat.scaleVelocity = 0.0;
                }
            }

            // Spring physics for wobble of current preview cat
            const wk = 0.14;
            const wdamping = 0.82;
            const wforceX = -wk * (currentCat.wobbleScaleX - 1.0);
            currentCat.wobbleVelocityX = (currentCat.wobbleVelocityX + wforceX) * wdamping;
            currentCat.wobbleScaleX += currentCat.wobbleVelocityX;
            const wforceY = -wk * (currentCat.wobbleScaleY - 1.0);
            currentCat.wobbleVelocityY = (currentCat.wobbleVelocityY + wforceY) * wdamping;
            currentCat.wobbleScaleY += currentCat.wobbleVelocityY;
            currentCat.wobbleScaleX = Math.max(0.94, Math.min(1.06, currentCat.wobbleScaleX));
            currentCat.wobbleScaleY = Math.max(0.94, Math.min(1.06, currentCat.wobbleScaleY));
            if (Math.abs(currentCat.wobbleScaleX - 1) < 0.008) currentCat.wobbleScaleX = 1;
            if (Math.abs(currentCat.wobbleScaleY - 1) < 0.008) currentCat.wobbleScaleY = 1;
        }

        drawDevPeekEffect();

        ctx.restore(); // restore shake offsets

        // Sync DOM numbers
        updateHUD();

        requestAnimationFrame(gameLoop);
    }

    // --- Input listeners mapped to Canvas dimensions ---
    function getInternalCoordinates(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        // Convert screen coordinates to canvas internal (720x1280) logical coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function handleMove(clientX, clientY) {
        const coords = getInternalCoordinates(clientX, clientY);
        mouseX = coords.x;

        if (currentCat && !currentCat.isDropped) {
            const radius = currentCat.radius;
            Body.setPosition(currentCat.body, {
                x: getClampedX(mouseX, radius),
                y: SPAWN_Y
            });
        }
    }

    function handleInteraction(clientX, clientY) {
        // First touch/gesture locks sound autoplay capability
        unlockAudio();

        // Handle booster erase clicks
        if (isTargetingEraser) {
            const coords = getInternalCoordinates(clientX, clientY);
            let clickedCat = null;

            for (const cat of activeCats) {
                if (cat.isDropped) {
                    const dist = Math.hypot(coords.x - cat.body.position.x, coords.y - cat.body.position.y);
                    if (dist <= cat.radius) {
                        clickedCat = cat;
                        break;
                    }
                }
            }

            if (clickedCat) {
                isTargetingEraser = false;
                GameState.addFishCoins(-350);

                // Burst particles
                triggerMergeEffects(clickedCat.body.position.x, clickedCat.body.position.y, clickedCat.level);
                // Flying cost indicator
                spawnFloatingText(clickedCat.body.position.x, clickedCat.body.position.y, "-350 🐟 Erase!", "#ffd700");

                // Remove from Matter world and active array
                Composite.remove(engine.world, clickedCat.body);
                activeCats = activeCats.filter(c => c !== clickedCat);

                updateTargetingUI();
                saveGameSession();
            }
            return;
        }

        // Normal drop tap
        if (canDrop && currentCat && !isModalOpen()) {
            dropCurrentCat();
        }
    }

    // Touch/Mouse Area Restrictor
    function isInsideDropZone(clientX, clientY) {
        const coords = getInternalCoordinates(clientX, clientY);
        // Cup boundaries are roughly X: 80 to 640. We allow X: 60 to 660, Y: 100 to 1150
        return coords.x > 60 && coords.x < 660 && coords.y > 100 && coords.y < 1150;
    }

    // Mouse Listeners
    canvas.addEventListener("mousemove", (e) => {
        handleMove(e.clientX, e.clientY);
    });

    canvas.addEventListener("mouseup", (e) => {
        if (e.button === 0 && isInsideDropZone(e.clientX, e.clientY)) { // left-click inside cup
            handleInteraction(e.clientX, e.clientY);
        }
    });

    // Touch Listeners
    let lastTouchX = 360, lastTouchY = 0;
    let isValidTouch = false;
    
    canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
            const tx = e.touches[0].clientX;
            const ty = e.touches[0].clientY;
            if (isInsideDropZone(tx, ty) || isTargetingEraser) {
                isValidTouch = true;
                lastTouchX = tx;
                lastTouchY = ty;
                handleMove(lastTouchX, lastTouchY);
            } else {
                isValidTouch = false;
            }
        }
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (isValidTouch && e.touches.length > 0) {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            handleMove(lastTouchX, lastTouchY);
        }
    }, { passive: false });

    canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        if (isValidTouch) {
            if (e.changedTouches && e.changedTouches.length > 0) {
                lastTouchX = e.changedTouches[0].clientX;
                lastTouchY = e.changedTouches[0].clientY;
            }
            handleInteraction(lastTouchX, lastTouchY);
            isValidTouch = false;
        }
    }, { passive: false });

    // Cancel eraser mode on ESC / right click
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isTargetingEraser) {
            isTargetingEraser = false;
            updateTargetingUI();
        }
    });
    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (isTargetingEraser) {
            isTargetingEraser = false;
            updateTargetingUI();
        }
    });

    // --- State/Session serialization helpers ---
    function getSerializableCats() {
        return activeCats.map(cat => ({
            level: cat.isGoldenBall ? GameModes.GOLDEN_LEVEL : (cat.isMouse ? GameModes.MOUSE_LEVEL : cat.level),
            special: cat.specialType || null,
            x: cat.body.position.x,
            y: cat.body.position.y,
            angle: cat.body.angle,
            velocity: { x: cat.body.velocity.x, y: cat.body.velocity.y },
            angularVelocity: cat.body.angularVelocity
        }));
    }

    function saveGameSession() {
        if (isGameOver) return;
        GameState.saveActiveSession(GameState.score, GameState.fish_coins, nextSpawn, getSerializableCats(), {
            game_mode: currentGameMode,
            daily_spawn_index: dailySpawnIndex,
            cup_tilt: cupTiltAngle,
            total_drops: totalDropsThisSession
        });
    }

    function resumeGameSession() {
        const data = GameState.loadActiveSession();
        if (data) {
            activeCats.forEach(c => Composite.remove(engine.world, c.body));
            activeCats = [];

            GameState.score = data.score;
            GameState.fish_coins = data.fish_coins;
            currentGameMode = data.game_mode || GameModes.MODES.CLASSIC;
            dailySpawnIndex = data.daily_spawn_index || 0;
            if (currentGameMode === GameModes.MODES.CHAOS) {
                cupTiltAngle = data.cup_tilt || 0;
                cupTiltTarget = cupTiltAngle;
            } else {
                cupTiltAngle = 0;
                cupTiltTarget = 0;
            }
            applyCupGravity();

            totalDropsThisSession = data.total_drops || data.cats.length;

            if (data.next_spawn) {
                nextSpawn = ensureSpawnAllowed(data.next_spawn);
            } else if (data.next_cat_level !== undefined) {
                nextSpawn = ensureSpawnAllowed({ level: data.next_cat_level, special: null });
            }

            data.cats.forEach(cData => {
                const spec = {
                    level: cData.level,
                    special: cData.special || null
                };
                const cat = spawnEntity(spec, cData.pos_x, cData.pos_y, true);

                Body.setPosition(cat.body, { x: cData.pos_x, y: cData.pos_y });
                Body.setAngle(cat.body, cData.rot);
                Body.setStatic(cat.body, false);
                Body.setVelocity(cat.body, { x: cData.vel_x, y: cData.vel_y });
                Body.setAngularVelocity(cat.body, cData.ang_vel);

                if (cat.isMouse) {
                    cat.isEscaping = true;
                    cat.spawnScale = 1.0;
                }

                World.add(engine.world, cat.body);
                activeCats.push(cat);
            });

            spawnNewCat();
            updateHUD();
            updateModeBadge();
        }

        GameState.deleteActiveSession();
        closeAllModals();

        if (!GameState.player_name) {
            openNicknameModal();
        } else {
            canDrop = true;
        }
    }

    function discardGameSession() {
        GameState.deleteActiveSession();
        closeAllModals();

        startGameMode(currentGameMode);
        spawnNewCat();
        updateModeBadge();

        if (!GameState.player_name) {
            openNicknameModal();
        } else {
            canDrop = true;
        }
    }

    // --- Booster Actions ---
    function releaseBoosterButton(btnId) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.blur();
        if (document.activeElement === btn) {
            document.body.focus();
        }
    }

    function setupBoosterButtonRelease() {
        ["yarn-btn", "fishbone-btn"].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const release = () => {
                requestAnimationFrame(() => releaseBoosterButton(id));
            };
            btn.addEventListener("pointerup", release);
            btn.addEventListener("pointercancel", release);
            btn.addEventListener("mouseleave", release);
        });
    }

    function useYarnBall() {
        if (GameState.fish_coins < 150 || isTargetingEraser) return;
        GameState.addFishCoins(-150);
        playMergeSound(1.2);
        spawnFloatingText(360, 500, "-150 🐟 SHAKE!", "#ffd700");

        activeCats.forEach(cat => {
            if (cat.isDropped) {
                const forceX = (Math.random() - 0.5) * 0.04 * cat.body.mass;
                const forceY = -(Math.random() * 0.04 + 0.04) * cat.body.mass;
                Body.applyForce(cat.body, cat.body.position, { x: forceX, y: forceY });
                Body.setAngularVelocity(cat.body, (Math.random() - 0.5) * 0.3);
            }
        });
        updateHUD();
        releaseBoosterButton("yarn-btn");
        saveGameSession();
    }

    function toggleEraserTargeting() {
        if (isTargetingEraser) {
            isTargetingEraser = false;
            updateTargetingUI();
        } else {
            if (GameState.fish_coins >= 350) {
                isTargetingEraser = true;
                updateTargetingUI();
            }
        }
    }

    function updateTargetingUI() {
        const label = document.getElementById("targeting-label");
        const fishboneBtn = document.getElementById("fishbone-btn");
        if (isTargetingEraser) {
            canDrop = false;
            label.style.display = "block";
            if (fishboneBtn) fishboneBtn.classList.add("booster-armed");
            if (currentCat) currentCat.spawnScale = 0; // hide visual preview
        } else {
            label.style.display = "none";
            if (fishboneBtn) {
                fishboneBtn.classList.remove("booster-armed");
                releaseBoosterButton("fishbone-btn");
            }
            if (currentCat) currentCat.spawnScale = 1;
            if (!isModalOpen() && currentCat) {
                canDrop = true;
            }
        }
        updateHUD();
    }

    // --- Modal overlays controllers ---
    function isModalOpen() {
        return document.querySelectorAll(".modal-overlay.active").length > 0;
    }

    function openModal(modal) {
        modal.classList.add("active");
        canDrop = false;
    }

    function closeModal(modal) {
        modal.classList.remove("active");
        if (!isModalOpen() && !isGameOver && !isTargetingEraser) {
            canDrop = true;
        }
    }

    function closeAllModals() {
        document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
        if (!isGameOver && !isTargetingEraser) {
            canDrop = true;
        }
    }

    // --- Profile & Nickname panel ---
    function openNicknameModal() {
        const firstLaunch = !GameState.player_name;
        const input = document.getElementById("nickname-input");
        input.value = GameState.player_name;

        const title = document.getElementById("profile-title");
        const subtitle = document.getElementById("profile-subtitle");
        const saveBtn = document.getElementById("profile-save-btn");
        const closeBtn = document.getElementById("profile-close-btn");
        const stats = document.getElementById("profile-stats");

        if (firstLaunch) {
            title.textContent = "WELCOME TO CAT DROP!";
            subtitle.textContent = "Enter your nickname for leaderboards:";
            stats.style.display = "none";
            saveBtn.style.display = "none";
            closeBtn.textContent = "START GAME";
        } else {
            title.textContent = "PLAYER PROFILE";
            subtitle.textContent = "Change your nickname:";
            stats.style.display = "block";
            saveBtn.style.display = "block";
            closeBtn.textContent = "CLOSE";

            // Populate stats
            document.getElementById("profile-best-val").textContent = GameState.highscore;
            
            // Unlocked metrics
            const unlockedThemes = GameState.unlocked_themes.length;
            const unlockedSkins = GameState.purchased_skins.length;
            const unlockedSounds = GameState.purchased_sounds.length + 1;
            document.getElementById("profile-unlocked-val").textContent = `Themes ${unlockedThemes}/5, Skins ${unlockedSkins}/5, Sounds ${unlockedSounds}/6`;

            // Calculate level title
            let playerTitle = "Kitten Beginner 🐾";
            if (GameState.highscore >= 10000) playerTitle = "Cosmic Cat Master 🌌";
            else if (GameState.highscore >= 5000) playerTitle = "Cat Evolutionist 🧬";
            else if (GameState.highscore >= 1000) playerTitle = "Fish Chaser 🐟";
            
            document.getElementById("profile-rank-val").textContent = playerTitle;
        }

        openModal(document.getElementById("nickname-overlay"));
    }

    function saveNickname() {
        const input = document.getElementById("nickname-input");
        let name = input.value.trim();
        if (!name) {
            name = "Player_" + Math.floor(1000 + Math.random() * 9000);
        }
        GameState.setPlayerName(name);
        updatePlayerChip();
        
        submitScore();
        spawnFloatingText(360, 400, "Name Saved!", "#ffd700");
    }

    // --- Leaderboard system (Google Sheets API fetch/post compatibility) ---
    function submitScore() {
        if (!GameState.player_name) return;

        // Submit to local mock storage
        submitScoreToMockLeaderboard();

        // If real URL is configured, POST to it
        if (GameState.google_sheets_url) {
            const data = {
                name: GameState.player_name,
                score: GameState.score
            };
            fetch(GameState.google_sheets_url, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            }).catch(e => console.error("Score submit failed:", e));
        }
    }

    function submitScoreToMockLeaderboard() {
        const defaults = [
            { name: "MeowMaster", score: 2500 },
            { name: "PurrfectCat", score: 1800 },
            { name: "Whiskers", score: 1200 },
            { name: "NyanCat", score: 900 },
            { name: "TabbyTom", score: 500 }
        ];
        if (!localStorage.getItem("cat_drop_mock_leaderboard")) {
            localStorage.setItem("cat_drop_mock_leaderboard", JSON.stringify(defaults));
        }

        GameState.submitToLeaderboard("cat_drop_mock_leaderboard", GameState.player_name, GameState.highscore);
        GameState.submitToLeaderboard(GameState.getTodayLeaderboardKey(), GameState.player_name, GameState.today_best);
        if (GameState.daily_best > 0) {
            GameState.submitToLeaderboard(GameState.getDailyLeaderboardKey(), GameState.player_name, GameState.daily_best);
        }
    }

    function switchLeaderboardTab(tab) {
        leaderboardTab = tab;
        document.querySelectorAll(".leaderboard-tab-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.tab === tab);
        });
        populateLeaderboardOverlay(false);
    }

    function populateLeaderboardOverlay(submitFirst = true) {
        if (submitFirst) submitScore();

        const statusLabel = document.getElementById("leaderboard-status");
        const subtitle = document.getElementById("leaderboard-subtitle");
        if (subtitle) {
            if (leaderboardTab === "today") subtitle.textContent = `Best Today — ${GameState.getTodayKey()}`;
            else if (leaderboardTab === "daily") subtitle.textContent = `Daily Challenge — ${GameState.getTodayKey()}`;
            else subtitle.textContent = "Top Cat Evolutionists (All-Time)";
        }

        if (leaderboardTab !== "alltime" || !GameState.google_sheets_url) {
            if (statusLabel) statusLabel.textContent = "";
            showMockLeaderboard();
            return;
        }

        if (statusLabel) statusLabel.textContent = "Loading leaderboard...";
        fetch(GameState.google_sheets_url)
            .then(res => {
                if (!res.ok) throw new Error("HTTP error " + res.status);
                return res.json();
            })
            .then(scores => {
                if (statusLabel) statusLabel.textContent = "";
                if (Array.isArray(scores)) {
                    renderLeaderboard(scores);
                } else {
                    if (statusLabel) statusLabel.textContent = "Invalid leaderboard response";
                    showMockLeaderboard();
                }
            })
            .catch(err => {
                console.error("Leaderboard fetch failed:", err);
                if (statusLabel) statusLabel.textContent = "Connection failed. Showing local scores.";
                showMockLeaderboard();
            });
    }

    function showMockLeaderboard() {
        let scores;
        if (leaderboardTab === "today") {
            scores = GameState.getLeaderboard(GameState.getTodayLeaderboardKey());
        } else if (leaderboardTab === "daily") {
            scores = GameState.getLeaderboard(GameState.getDailyLeaderboardKey());
        } else {
            scores = GameState.getLeaderboard("cat_drop_mock_leaderboard");
        }
        renderLeaderboard(scores);
    }

    function openModeSelectModal() {
        openModal(document.getElementById("mode-overlay"));
    }

    function selectGameMode(mode) {
        closeModal(document.getElementById("mode-overlay"));
        const wasPlaying = activeCats.length > 0 || currentCat || GameState.score > 0;

        if (mode !== currentGameMode && wasPlaying) {
            currentGameMode = mode;
            restartGame();
            return;
        }

        startGameMode(mode);
        updateHUD();
        if (!currentCat && !isGameOver) {
            spawnNewCat();
            if (!GameState.player_name) openNicknameModal();
        }
    }

    function renderLeaderboard(scores) {
        const listContainer = document.getElementById("leaderboard-list");
        listContainer.innerHTML = "";

        if (!scores || scores.length === 0) {
            const empty = document.createElement("div");
            empty.className = "leaderboard-item";
            empty.style.justifyContent = "center";
            empty.textContent = "No scores yet — be the first!";
            listContainer.appendChild(empty);
            return;
        }

        scores.forEach((entry, idx) => {
            const row = document.createElement("div");
            row.className = "leaderboard-item";

            let medal = `${idx + 1}. `;
            if (idx === 0) medal = "🥇 ";
            else if (idx === 1) medal = "🥈 ";
            else if (idx === 2) medal = "🥉 ";

            row.innerHTML = `
                <span>${medal} <strong>${entry.name}</strong></span>
                <span>${entry.score}</span>
            `;
            listContainer.appendChild(row);
        });
    }

    // --- Evolution Chart list populator ---
    function renderEvolutionPreview(canvas, img, size) {
        const draw = () => renderCatPreview(canvas, img, size, 0.88);
        if (img && img.complete && img.naturalWidth) {
            draw();
        } else if (img) {
            img.onload = () => draw();
        }
    }

    function populateEvolutionOverlay() {
        const list = document.getElementById("evolution-list");
        list.innerHTML = "";
        const previewSize = 78;

        for (let lvl = 1; lvl <= 11; lvl++) {
            const node = document.createElement("div");
            node.className = "evolution-node";

            node.innerHTML = `
                <canvas class="evolution-img" width="${previewSize}" height="${previewSize}"></canvas>
                <span class="evolution-lbl">Lvl ${lvl}</span>
            `;
            list.appendChild(node);

            const evoCanvas = node.querySelector("canvas");
            renderEvolutionPreview(evoCanvas, getCatImage(lvl), previewSize);
        }

        const scroll = list.closest(".modal-content-scroll");
        if (scroll) scroll.scrollTop = 0;
    }

    // --- Shop items custom renderer ---
    function switchShopTab(tabName) {
        currentShopTab = tabName;
        // Highlight active tab
        const tabs = {
            "Themes": document.getElementById("tab-themes"),
            "Skins": document.getElementById("tab-skins"),
            "Sounds": document.getElementById("tab-sounds")
        };
        for (const k in tabs) {
            if (k === tabName) {
                tabs[k].style.background = "var(--btn-normal)";
                tabs[k].style.color = "#ffffff";
                tabs[k].style.borderColor = "#ffffff";
            } else {
                tabs[k].style.background = "var(--card-bg)";
                tabs[k].style.color = "var(--btn-normal)";
                tabs[k].style.borderColor = "var(--border-color)";
            }
        }

        populateShopList();
    }

    function populateShopList() {
        const container = document.getElementById("shop-items-list");
        container.innerHTML = "";
        
        // Sync balance label
        document.getElementById("shop-balance").textContent = `Your Balance: 🐟 ${GameState.fish_coins}`;

        if (currentShopTab === "Themes") {
            const themePrices = {
                "Indigo Night": 0,
                "Violet Night": 100,
                "Forest Night": 350,
                "Rose Night": 750,
                "Charcoal Night": 1500
            };

            THEMES.forEach(tName => {
                const price = themePrices[tName] || 0;
                const isUnlocked = GameState.unlocked_themes.includes(tName);
                const isActive = GameState.active_theme === tName;

                const row = document.createElement("div");
                row.className = "shop-item-row";
                row.innerHTML = `
                    <div class="shop-item-info">
                        <span class="shop-item-name">${tName}</span>
                    </div>
                    <div class="shop-item-actions" id="action-theme-${tName.replace(" ", "")}"></div>
                `;
                container.appendChild(row);

                const actContainer = document.getElementById(`action-theme-${tName.replace(" ", "")}`);
                const btn = document.createElement("button");
                btn.className = "paper-button shop-btn-buy";
                if (isActive) {
                    btn.textContent = "ACTIVE";
                    btn.disabled = true;
                } else if (isUnlocked) {
                    btn.textContent = "SELECT";
                    btn.onclick = () => {
                        GameState.setActiveTheme(tName);
                        updateUIThemeColors(tName);
                        populateShopList();
                    };
                } else {
                    btn.textContent = `BUY (🐟 ${price})`;
                    btn.disabled = GameState.fish_coins < price;
                    btn.onclick = () => {
                        GameState.addFishCoins(-price);
                        GameState.unlockTheme(tName);
                        GameState.setActiveTheme(tName);
                        updateUIThemeColors(tName);
                        playMergeSound(1.0);
                        populateShopList();
                    };
                }
                actContainer.appendChild(btn);
            });

        } else if (currentShopTab === "Skins") {
            const premiumSkins = {
                "Rapper": { name: "Rapper Cat", cost: 500, desc: "Cool gold cat sphere" },
                "Zombie": { name: "Zombie Cat", cost: 400, desc: "Cozy green stitch sphere" },
                "Vampire": { name: "Vampire Cat", cost: 750, desc: "Noble dark fangs sphere" },
                "Bard": { name: "Mustached Bard", cost: 1100, desc: "Cozy amber feather sphere" },
                "Oldman": { name: "Old Man Cat", cost: 1600, desc: "Grumpy grey grandpa in purple sphere" }
            };

            const skinsOrder = ["Rapper", "Zombie", "Vampire", "Bard", "Oldman"];

            skinsOrder.forEach(skinId => {
                const info = premiumSkins[skinId];
                const isOwned = GameState.purchased_skins.includes(skinId);
                const imgPath = `assets/sprites/skin_${skinId.toLowerCase()}.png`;

                const row = document.createElement("div");
                row.className = "shop-item-row";
                row.innerHTML = `
                    <div class="shop-item-preview" style="background-image: url('${imgPath}'); background-size: contain; background-position: center; background-repeat: no-repeat;"></div>
                    <div class="shop-item-info">
                        <span class="shop-item-name">${info.name}</span>
                        <span class="shop-item-desc">${info.desc}</span>
                    </div>
                    <div class="shop-item-actions" id="action-skin-${skinId}"></div>
                `;
                container.appendChild(row);

                const actContainer = document.getElementById(`action-skin-${skinId}`);
                if (isOwned) {
                    // Replacer drop-down select list
                    const assignLbl = document.createElement("span");
                    assignLbl.style.fontSize = "12px";
                    assignLbl.style.marginRight = "4px";
                    assignLbl.textContent = "Replace:";
                    
                    const select = document.createElement("select");
                    select.className = "shop-select";
                    select.innerHTML = `<option value="0">None</option>`;
                    for (let l = 1; l <= 11; l++) {
                        select.innerHTML += `<option value="${l}">Lvl ${l}</option>`;
                    }
                    select.value = GameState.skin_assignments[skinId] || 0;
                    select.onchange = (e) => {
                        const level = parseInt(e.target.value);
                        GameState.assignSkinToLevel(skinId, level);
                        updateNextPreview();
                        populateShopList();
                    };

                    actContainer.appendChild(assignLbl);
                    actContainer.appendChild(select);
                } else {
                    const btn = document.createElement("button");
                    btn.className = "paper-button shop-btn-buy";
                    btn.textContent = `BUY (🐟 ${info.cost})`;
                    btn.disabled = GameState.fish_coins < info.cost;
                    btn.onclick = () => {
                        GameState.addFishCoins(-info.cost);
                        GameState.unlockSkin(skinId);
                        playMergeSound(1.0);
                        populateShopList();
                    };
                    actContainer.appendChild(btn);
                }
            });

        } else if (currentShopTab === "Sounds") {
            const soundSets = {
                "Mystic": { name: "Halloween Sound Set", cost: 1500, desc: "Owl hoots, witch chimes & spooky loop" },
                "Rapper": { name: "Rapper Sound Set", cost: 1500, desc: "Vinyl scratches, boom-bap beat & hi-hats" },
                "Zombie": { name: "Zombie Sound Set", cost: 1500, desc: "Guttural groans & shambling horror march" },
                "Vampire": { name: "Vampire Sound Set", cost: 1500, desc: "Gothic \"Boo!\", organ stabs & dark waltz" },
                "Oldman": { name: "Oldman Sound Set", cost: 1500, desc: "Grumpy coughs & nostalgic music-box waltz" }
            };

            // Render default sounds first
            const defaultRow = document.createElement("div");
            defaultRow.className = "shop-item-row";
            defaultRow.innerHTML = `
                <div class="shop-item-info">
                    <span class="shop-item-name">Default Sounds</span>
                    <span class="shop-item-desc">Cozy cat-cafe loop &amp; warm bloop sounds</span>
                </div>
                <div class="shop-item-actions" id="action-sound-Default"></div>
            `;
            container.appendChild(defaultRow);

            const defActContainer = document.getElementById("action-sound-Default");
            
            const defDemoBtn = document.createElement("button");
            defDemoBtn.className = "paper-button";
            defDemoBtn.style.padding = "8px 10px";
            defDemoBtn.style.marginRight = "6px";
            defDemoBtn.textContent = "🔊 DEMO";
            defDemoBtn.onclick = () => playPreviewSound("Default");
            
            const defBtn = document.createElement("button");
            defBtn.className = "paper-button shop-btn-buy";
            if (GameState.active_sound_set === "Default") {
                defBtn.textContent = "ACTIVE";
                defBtn.disabled = true;
            } else {
                defBtn.textContent = "SELECT";
                defBtn.onclick = () => {
                    GameState.setActiveSoundSet("Default");
                    loadSoundSet("Default");
                    playMergeSound(1.0);
                    populateShopList();
                };
            }
            defActContainer.appendChild(defDemoBtn);
            defActContainer.appendChild(defBtn);

            // Themed sounds order
            const soundsOrder = ["Mystic", "Rapper", "Zombie", "Vampire", "Oldman"];
            soundsOrder.forEach(soundId => {
                const info = soundSets[soundId];
                const isOwned = GameState.purchased_sounds.includes(soundId);
                const isActive = GameState.active_sound_set === soundId;

                const row = document.createElement("div");
                row.className = "shop-item-row";
                row.innerHTML = `
                    <div class="shop-item-info">
                        <span class="shop-item-name">${info.name}</span>
                        <span class="shop-item-desc">${info.desc}</span>
                    </div>
                    <div class="shop-item-actions" id="action-sound-${soundId}"></div>
                `;
                container.appendChild(row);

                const actContainer = document.getElementById(`action-sound-${soundId}`);
                
                const demoBtn = document.createElement("button");
                demoBtn.className = "paper-button";
                demoBtn.style.padding = "8px 10px";
                demoBtn.style.marginRight = "6px";
                demoBtn.textContent = "🔊 DEMO";
                demoBtn.onclick = () => playPreviewSound(soundId);

                const btn = document.createElement("button");
                btn.className = "paper-button shop-btn-buy";
                if (isActive) {
                    btn.textContent = "ACTIVE";
                    btn.disabled = true;
                } else if (isOwned) {
                    btn.textContent = "SELECT";
                    btn.onclick = () => {
                        GameState.setActiveSoundSet(soundId);
                        loadSoundSet(soundId);
                        playMergeSound(1.0);
                        populateShopList();
                    };
                } else {
                    btn.textContent = `BUY (🐟 ${info.cost})`;
                    btn.disabled = GameState.fish_coins < info.cost;
                    btn.onclick = () => {
                        GameState.addFishCoins(-info.cost);
                        GameState.unlockSoundSet(soundId);
                        GameState.setActiveSoundSet(soundId);
                        loadSoundSet(soundId);
                        playMergeSound(1.0);
                        populateShopList();
                    };
                }

                actContainer.appendChild(demoBtn);
                actContainer.appendChild(btn);
            });
        }
    }

    // --- DOM Color Variable Updates based on Themes ---
    function updateUIThemeColors(themeName) {
        const root = document.documentElement;
        let colors = {
            title: "#8c9cc2",
            best: "#c5a5b5",
            btnNormal: "#7384b5",
            btnPressed: "#c5a5b5",
            boxColor: "#434d70",
            guideColor: "rgba(92, 108, 156, 0.45)",
            paperColor: "#141724",
            stripeColor: "#1b1f30",
            penColor: "rgba(92, 108, 156, 0.45)",
            pencilColor: "rgba(67, 77, 112, 0.35)",
            blushColor: "rgba(197, 165, 181, 0.4)",
            cardColor: "rgba(30, 35, 56, 0.7)"
        };

        switch (themeName) {
            case "Indigo Night":
                colors = {
                    title: "#8c9cc2",
                    best: "#c5a5b5",
                    btnNormal: "#7384b5",
                    btnPressed: "#c5a5b5",
                    boxColor: "#434d70",
                    guideColor: "rgba(92, 108, 156, 0.45)",
                    paperColor: "#141724",
                    stripeColor: "#1b1f30",
                    penColor: "rgba(92, 108, 156, 0.45)",
                    pencilColor: "rgba(67, 77, 112, 0.35)",
                    blushColor: "rgba(197, 165, 181, 0.4)",
                    cardColor: "rgba(30, 35, 56, 0.7)"
                };
                break;
            case "Violet Night":
                colors = {
                    title: "#a29ac2",
                    best: "#c09eb0",
                    btnNormal: "#887db5",
                    btnPressed: "#c09eb0",
                    boxColor: "#554970",
                    guideColor: "rgba(122, 108, 156, 0.45)",
                    paperColor: "#161424",
                    stripeColor: "#1f1c30",
                    penColor: "rgba(122, 108, 156, 0.45)",
                    pencilColor: "rgba(85, 73, 112, 0.35)",
                    blushColor: "rgba(192, 158, 176, 0.4)",
                    cardColor: "rgba(35, 30, 56, 0.7)"
                };
                break;
            case "Forest Night":
                colors = {
                    title: "#8ca69e",
                    best: "#bfa495",
                    btnNormal: "#709489",
                    btnPressed: "#bfa495",
                    boxColor: "#435c54",
                    guideColor: "rgba(99, 138, 125, 0.45)",
                    paperColor: "#121616",
                    stripeColor: "#1a2020",
                    penColor: "rgba(99, 138, 125, 0.45)",
                    pencilColor: "rgba(67, 92, 84, 0.35)",
                    blushColor: "rgba(191, 164, 149, 0.4)",
                    cardColor: "rgba(25, 35, 35, 0.7)"
                };
                break;
            case "Rose Night":
                colors = {
                    title: "#b59ca4",
                    best: "#c09ca4",
                    btnNormal: "#a87887",
                    btnPressed: "#c09ca4",
                    boxColor: "#704955",
                    guideColor: "rgba(156, 108, 123, 0.45)",
                    paperColor: "#1a1317",
                    stripeColor: "#241b20",
                    penColor: "rgba(156, 108, 123, 0.45)",
                    pencilColor: "rgba(112, 73, 85, 0.35)",
                    blushColor: "rgba(192, 156, 164, 0.4)",
                    cardColor: "rgba(40, 30, 35, 0.7)"
                };
                break;
            case "Charcoal Night":
                colors = {
                    title: "#a0a5b0",
                    best: "#c5a5b5",
                    btnNormal: "#8e94a0",
                    btnPressed: "#c5a5b5",
                    boxColor: "#585d6b",
                    guideColor: "rgba(140, 146, 160, 0.45)",
                    paperColor: "#161618",
                    stripeColor: "#202024",
                    penColor: "rgba(140, 146, 160, 0.45)",
                    pencilColor: "rgba(88, 93, 107, 0.35)",
                    blushColor: "rgba(197, 165, 181, 0.4)",
                    cardColor: "rgba(35, 35, 40, 0.7)"
                };
                break;
        }

        root.style.setProperty('--bg-color', colors.paperColor);
        root.style.setProperty('--border-color', colors.btnNormal);
        root.style.setProperty('--accent-color', colors.best);
        root.style.setProperty('--btn-normal', colors.btnNormal);
        root.style.setProperty('--btn-pressed', colors.btnPressed);

        // Sync header colors
        document.getElementById("score-title-text").style.color = colors.title;
        document.getElementById("highscore-title-text").style.color = colors.title;
        document.getElementById("today-title-text").style.color = colors.title;
        document.getElementById("daily-title-text").style.color = colors.title;
        document.getElementById("highscore-val").style.color = colors.best;
        document.getElementById("next-title-text").style.color = colors.title;

        currentThemeColors = colors;
    }

    // --- UI Controls event connectors ---
    function connectEvents() {
        // SFX toggle
        document.getElementById("sfx-btn").onclick = () => {
            unlockAudio();
            GameState.sfx_enabled = !GameState.sfx_enabled;
            GameState.save();
            updateAudioButtons();
            if (GameState.sfx_enabled) playMergeSound(1.0);
        };

        // Music toggle
        document.getElementById("music-btn").onclick = () => {
            unlockAudio();
            GameState.music_enabled = !GameState.music_enabled;
            GameState.save();
            updateAudioButtons();
            updateBGMState();
        };

        // Help Overlay
        document.getElementById("help-btn").onclick = () => {
            openModal(document.getElementById("help-overlay"));
        };
        document.getElementById("help-close-btn").onclick = () => {
            closeModal(document.getElementById("help-overlay"));
        };

        // Profile Panel
        const nickInput = document.getElementById("nickname-input");
        nickInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
        });

        document.getElementById("name-display-btn").onclick = openNicknameModal;
        document.getElementById("profile-save-btn").onclick = () => {
            unlockAudio();
            saveNickname();
            closeModal(document.getElementById("nickname-overlay"));
        };
        document.getElementById("profile-close-btn").onclick = () => {
            unlockAudio();
            if (!GameState.player_name) {
                saveNickname();
            }
            closeModal(document.getElementById("nickname-overlay"));
        };

        // Leaderboard Overlay
        document.getElementById("leaderboard-btn").onclick = () => {
            switchLeaderboardTab("alltime");
            populateLeaderboardOverlay();
            openModal(document.getElementById("leaderboard-overlay"));
        };
        document.getElementById("leaderboard-close-btn").onclick = () => {
            closeModal(document.getElementById("leaderboard-overlay"));
        };
        document.querySelectorAll(".leaderboard-tab-btn").forEach(btn => {
            btn.onclick = () => switchLeaderboardTab(btn.dataset.tab);
        });

        const modeBadge = document.getElementById("mode-badge");
        if (modeBadge) modeBadge.onclick = openModeSelectModal;
        document.getElementById("mode-classic-btn").onclick = () => selectGameMode(GameModes.MODES.CLASSIC);
        document.getElementById("mode-daily-btn").onclick = () => selectGameMode(GameModes.MODES.DAILY);
        document.getElementById("mode-chaos-btn").onclick = () => selectGameMode(GameModes.MODES.CHAOS);
        document.getElementById("mode-close-btn").onclick = () => {
            closeModal(document.getElementById("mode-overlay"));
            if (!currentCat && !isGameOver && !GameState.hasSavedSession()) {
                startGameMode(currentGameMode);
                spawnNewCat();
                if (!GameState.player_name) openNicknameModal();
            }
        };

        // Evolution Overlay
        document.getElementById("evolution-btn").onclick = () => {
            populateEvolutionOverlay();
            openModal(document.getElementById("evolution-overlay"));
        };
        document.getElementById("evolution-close-btn").onclick = () => {
            closeModal(document.getElementById("evolution-overlay"));
        };

        // Shop Overlay
        document.getElementById("shop-btn").onclick = () => {
            switchShopTab("Themes");
            openModal(document.getElementById("shop-overlay"));
        };
        document.getElementById("shop-close-btn").onclick = () => {
            closeModal(document.getElementById("shop-overlay"));
        };

        document.getElementById("tab-themes").onclick = () => switchShopTab("Themes");
        document.getElementById("tab-skins").onclick = () => switchShopTab("Skins");
        document.getElementById("tab-sounds").onclick = () => switchShopTab("Sounds");

        // Yarn Ball Booster
        document.getElementById("yarn-btn").onclick = useYarnBall;

        // Fish Bone Eraser Booster
        document.getElementById("fishbone-btn").onclick = toggleEraserTargeting;
        setupBoosterButtonRelease();

        // Quick restarts
        document.getElementById("quick-restart-btn").onclick = () => {
            openModal(document.getElementById("restart-confirm-overlay"));
        };
        document.getElementById("restart-confirm-yes-btn").onclick = () => {
            closeModal(document.getElementById("restart-confirm-overlay"));
            restartGame();
        };
        document.getElementById("restart-confirm-no-btn").onclick = () => {
            closeModal(document.getElementById("restart-confirm-overlay"));
        };
        document.getElementById("gameover-restart-btn").onclick = restartGame;
        document.getElementById("gameover-undo-btn").onclick = () => {
            unlockAudio();
            performUndoStep();
        };

        // Resume Overlay
        document.getElementById("resume-yes-btn").onclick = resumeGameSession;
        document.getElementById("resume-no-btn").onclick = discardGameSession;
    }

    // --- Game Engine Startup Sequence ---
    window.addEventListener("load", () => {
        let imagesReady = false;
        let audioReady = false;

        function tryStart() {
            if (!imagesReady || !audioReady) return;

            loadSoundSet(GameState.active_sound_set);
            updateAudioButtons();
            connectEvents();
            updateUIThemeColors(GameState.active_theme);
            updatePlayerChip();
            initPhysics();
            requestAnimationFrame(gameLoop);

            GameState.resetTodayIfNeeded();
            updateHUD();
            updateModeBadge();
            updateNextPreview();

            window.addEventListener("resize", updateNextPreview);
            if (window.visualViewport) {
                window.visualViewport.addEventListener("resize", updateNextPreview);
            }

            if (GameState.hasSavedSession()) {
                openModal(document.getElementById("resume-overlay"));
            } else {
                openModeSelectModal();
            }
        }

        preloadAssets(() => {
            imagesReady = true;
            tryStart();
        });

        GameAudio.preload(() => {
            GameAudio.setMusicEnabled(GameState.music_enabled);
            GameAudio.setSfxEnabled(GameState.sfx_enabled);
            audioReady = true;
            tryStart();
        });
    });

})();
