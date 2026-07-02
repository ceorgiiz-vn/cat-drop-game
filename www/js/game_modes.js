// Game modes, daily seed, special spawn types

const GameModes = (function() {
    const MODES = {
        CLASSIC: "classic",
        DAILY: "daily",
        CHAOS: "chaos"
    };

    const GOLDEN_LEVEL = 0;
    const MOUSE_LEVEL = -1;

    const MOUSE_CHANCE_CLASSIC = 0.035 / 3;   // ~1.2% — rare surprise
    const MOUSE_CHANCE_CHAOS = 0.03 / 3;        // ~1%
    const GOLDEN_CHANCE_CLASSIC = 0.045 / 3;  // ~1.5% — rare surprise
    const GOLDEN_CHANCE_CHAOS = 0.03 / 3;     // ~1%

    /** Mouse only after enough drops and a stacked cup (see canSpawnMouse). */
    const MIN_DROPS_BEFORE_MOUSE = 40;
    const MIN_CATS_IN_CUP_BEFORE_MOUSE = 6;

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

    function mulberry32(seed) {
        let a = seed | 0;
        return function() {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hashDateKey(dateKey) {
        let h = 0;
        for (let i = 0; i < dateKey.length; i++) {
            h = ((h << 5) - h + dateKey.charCodeAt(i)) | 0;
        }
        return h;
    }

    function createDailyRng(dateKey) {
        return mulberry32(hashDateKey(dateKey || getDateKey()));
    }

    function rollSpawnRaw(mode, rng) {
        const r = rng();

        if (mode === MODES.CLASSIC) {
            if (r < MOUSE_CHANCE_CLASSIC) return { level: MOUSE_LEVEL, special: null };
            if (r < MOUSE_CHANCE_CLASSIC + GOLDEN_CHANCE_CLASSIC) return { level: GOLDEN_LEVEL, special: null };
            return { level: Math.floor(rng() * 4) + 1, special: null };
        }

        if (mode === MODES.DAILY) {
            return { level: Math.floor(rng() * 4) + 1, special: null };
        }

        // Chaos Cup
        if (r < MOUSE_CHANCE_CHAOS) return { level: MOUSE_LEVEL, special: null };
        if (r < MOUSE_CHANCE_CHAOS + GOLDEN_CHANCE_CHAOS) return { level: GOLDEN_LEVEL, special: null };
        if (r < 0.2) {
            const specs = [SPECIAL.STICKY, SPECIAL.SOAPY, SPECIAL.HEAVY, SPECIAL.EXPLOSIVE, SPECIAL.GHOST];
            return { level: Math.floor(rng() * 4) + 1, special: specs[Math.floor(rng() * specs.length)] };
        }
        return { level: Math.floor(rng() * 4) + 1, special: null };
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

    /** Reroll if same rare type would spawn twice in a row (mouse / golden). */
    function rollSpawn(mode, rng, exclude) {
        const ctx = exclude && exclude.spawnContext;
        const blockMouse = !!(exclude && exclude.noMouse) || (ctx ? !canSpawnMouse(ctx) : true);
        const blockGolden = !!(exclude && exclude.noGolden);
        if (!blockMouse && !blockGolden) {
            return rollSpawnRaw(mode, rng);
        }

        for (let attempt = 0; attempt < 12; attempt++) {
            const spec = rollSpawnRaw(mode, rng);
            if (blockMouse && isMouseSpawn(spec)) continue;
            if (blockGolden && isGoldenSpawn(spec)) continue;
            return spec;
        }
        return normalSmallCat(rng);
    }

    function getNextSpawn(mode, dailyIndex, dateKey, exclude) {
        if (mode === MODES.DAILY) {
            const rng = createDailyRng(dateKey || getDateKey());
            let spec = { level: 1, special: null };
            for (let i = 0; i <= dailyIndex; i++) {
                spec = rollSpawn(MODES.DAILY, rng, exclude);
            }
            return spec;
        }
        return rollSpawn(mode, Math.random, exclude);
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
        if (mode === MODES.DAILY) return "Daily ★";
        if (mode === MODES.CHAOS) return "Chaos ↻";
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
