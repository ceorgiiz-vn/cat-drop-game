// Classic-only spawn rules and special spawn identifiers.

const GameModes = (function() {
    const MODES = {
        CLASSIC: "classic"
    };

    const GOLDEN_LEVEL = 0;
    const MOUSE_LEVEL = -1;

    const MOUSE_CHANCE_CLASSIC = 0.035 / 3;
    const GOLDEN_CHANCE_CLASSIC = 0.045 / 3;

    /** Mouse only after enough drops and a stacked cup (see canSpawnMouse). */
    const MIN_DROPS_BEFORE_MOUSE = 40;
    const MIN_CATS_IN_CUP_BEFORE_MOUSE = 6;

    // Kept for old saved sessions; new classic spawns no longer create special balls.
    const SPECIAL = {
        STICKY: "sticky",
        SOAPY: "soapy",
        HEAVY: "heavy",
        EXPLOSIVE: "explosive",
        GHOST: "ghost"
    };

    function getDateKey(d) {
        const dt = d || new Date();
        return dt.toISOString().slice(0, 10);
    }

    function normalSmallCat(rng) {
        return { level: Math.floor(rng() * 4) + 1, special: null };
    }

    function canSpawnMouse(ctx) {
        if (!ctx) return false;
        const drops = ctx.totalDrops | 0;
        const inCup = ctx.catsInCup | 0;
        return drops >= MIN_DROPS_BEFORE_MOUSE && inCup >= MIN_CATS_IN_CUP_BEFORE_MOUSE;
    }

    function rollSpawnRaw(rng) {
        const r = rng();
        if (r < MOUSE_CHANCE_CLASSIC) return { level: MOUSE_LEVEL, special: null };
        if (r < MOUSE_CHANCE_CLASSIC + GOLDEN_CHANCE_CLASSIC) return { level: GOLDEN_LEVEL, special: null };
        return normalSmallCat(rng);
    }

    function rollSpawn(rng, exclude) {
        const ctx = exclude && exclude.spawnContext;
        const blockMouse = !!(exclude && exclude.noMouse) || (ctx ? !canSpawnMouse(ctx) : true);
        const blockGolden = !!(exclude && exclude.noGolden) || (ctx ? ctx.totalDrops < 20 : false);
        if (!blockMouse && !blockGolden) {
            return rollSpawnRaw(rng);
        }

        for (let attempt = 0; attempt < 12; attempt++) {
            const spec = rollSpawnRaw(rng);
            if (blockMouse && isMouseSpawn(spec)) continue;
            if (blockGolden && isGoldenSpawn(spec)) continue;
            return spec;
        }
        return normalSmallCat(rng);
    }

    function getNextSpawn(mode, index, dateKey, exclude) {
        return rollSpawn(Math.random, exclude);
    }

    function isGoldenSpawn(spec) {
        return spec && spec.level === GOLDEN_LEVEL;
    }

    function isMouseSpawn(spec) {
        return spec && spec.level === MOUSE_LEVEL;
    }

    function isSpecialSpawn(spec) {
        return !!(spec && spec.special);
    }

    function modeLabel(mode) {
        return "Classic";
    }

    return {
        MODES,
        GOLDEN_LEVEL,
        MOUSE_LEVEL,
        SPECIAL,
        getDateKey,
        getNextSpawn,
        isGoldenSpawn,
        isMouseSpawn,
        isSpecialSpawn,
        canSpawnMouse,
        MIN_DROPS_BEFORE_MOUSE,
        MIN_CATS_IN_CUP_BEFORE_MOUSE,
        modeLabel
    };
})();

window.GameModes = GameModes;
