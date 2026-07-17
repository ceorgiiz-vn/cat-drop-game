// Game state manager for Cat Drop: Evolution

const CatDropData = (function() {
    const SAVE_KEY = "cat_drop_save_data";
    const SESSION_KEY = "cat_drop_session_data";
    const THEMES = new Set(["Indigo Night", "Violet Night", "Forest Night", "Rose Night", "Charcoal Night"]);
    const SKINS = new Set(["Rapper", "Zombie", "Vampire", "Bard", "Oldman"]);
    const SOUND_SETS = new Set(["Mystic", "Rapper", "Zombie", "Vampire", "Oldman"]);
    const SPECIALS = new Set(["sticky", "soapy", "heavy", "explosive", "ghost"]);
    const MAX_SESSION_CATS = 256;

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function number(value, fallback, min, max, integer = false) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        const bounded = Math.max(min, Math.min(max, parsed));
        return integer ? Math.trunc(bounded) : bounded;
    }

    function text(value, fallback = "", maxLength = 128) {
        if (typeof value !== "string") return fallback;
        return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
    }

    function stringList(value, allowed, fallback) {
        if (!Array.isArray(value)) return fallback.slice();
        return [...new Set(value.filter(item => typeof item === "string" && allowed.has(item)))];
    }

    function sheetsUrl(value) {
        if (typeof value !== "string" || !value) return "";
        try {
            const parsed = new URL(value);
            const allowedHost = parsed.hostname === "script.google.com" || parsed.hostname.endsWith(".googleusercontent.com");
            return parsed.protocol === "https:" && allowedHost ? parsed.href.slice(0, 2048) : "";
        } catch (_) {
            return "";
        }
    }

    function normalizeSave(value) {
        const data = isObject(value) ? value : {};
        const unlockedThemes = stringList(data.unlocked_themes, THEMES, ["Indigo Night"]);
        if (!unlockedThemes.includes("Indigo Night")) unlockedThemes.unshift("Indigo Night");
        const purchasedSkins = stringList(data.purchased_skins, SKINS, []);
        const purchasedSounds = stringList(data.purchased_sounds, SOUND_SETS, []);

        const assignments = {};
        if (isObject(data.skin_assignments)) {
            for (const skinId of purchasedSkins) {
                const level = number(data.skin_assignments[skinId], 0, 0, 11, true);
                if (level > 0) assignments[skinId] = level;
            }
        }

        const requestedTheme = text(data.active_theme, "Indigo Night", 32);
        const requestedSound = text(data.active_sound_set, "Default", 32);
        return {
            schema_version: 2,
            highscore: number(data.highscore, 0, 0, 1_000_000_000, true),
            today_best: number(data.today_best, 0, 0, 1_000_000_000, true),
            today_date: text(data.today_date, "", 10),
            year_best: number(data.year_best, 0, 0, 1_000_000_000, true),
            year_date: text(data.year_date, "", 4),
            player_name: text(data.player_name, "", 15),
            google_sheets_url: sheetsUrl(data.google_sheets_url),
            fish_coins: number(data.fish_coins, 0, 0, 1_000_000_000, true),
            unlocked_themes: unlockedThemes,
            active_theme: unlockedThemes.includes(requestedTheme) ? requestedTheme : "Indigo Night",
            purchased_skins: purchasedSkins,
            skin_assignments: assignments,
            purchased_sounds: purchasedSounds,
            active_sound_set: requestedSound === "Default" || purchasedSounds.includes(requestedSound) ? requestedSound : "Default",
            sfx_enabled: typeof data.sfx_enabled === "boolean" ? data.sfx_enabled : true,
            music_enabled: typeof data.music_enabled === "boolean" ? data.music_enabled : true
        };
    }

    function normalizeSpawn(value) {
        if (!isObject(value)) return { level: 1, special: null };
        const level = number(value.level, 1, -1, 11, true);
        const special = value.special == null ? null : text(value.special, "", 16);
        return {
            level,
            special: special && SPECIALS.has(special) ? special : null
        };
    }

    function normalizeSessionCat(value) {
        if (!isObject(value)) return null;
        const posX = Number(value.pos_x);
        const posY = Number(value.pos_y);
        const level = Number(value.level);
        if (!Number.isFinite(posX) || !Number.isFinite(posY) || !Number.isInteger(level) || level < -1 || level > 11) {
            return null;
        }

        const special = value.special == null ? null : text(value.special, "", 16);
        return {
            level,
            special: special && SPECIALS.has(special) ? special : null,
            pos_x: number(posX, 360, -720, 1440),
            pos_y: number(posY, 600, -1280, 2560),
            rot: number(value.rot, 0, -1000, 1000),
            vel_x: number(value.vel_x, 0, -100, 100),
            vel_y: number(value.vel_y, 0, -100, 100),
            ang_vel: number(value.ang_vel, 0, -20, 20)
        };
    }

    function normalizeSession(value) {
        if (!isObject(value) || !Array.isArray(value.cats) || value.cats.length > MAX_SESSION_CATS) return null;
        const cats = value.cats.map(normalizeSessionCat);
        if (cats.some(cat => cat === null)) return null;

        const legacySpawn = value.next_cat_level !== undefined
            ? { level: value.next_cat_level, special: null }
            : { level: 1, special: null };
        return {
            schema_version: 2,
            score: number(value.score, 0, 0, 1_000_000_000, true),
            fish_coins: number(value.fish_coins, 0, 0, 1_000_000_000, true),
            next_spawn: normalizeSpawn(value.next_spawn || legacySpawn),
            game_mode: "classic",
            cup_tilt: 0,
            total_drops: number(value.total_drops, cats.length, cats.length, 1_000_000, true),
            cats
        };
    }

    function readLeaderboard(storageKey) {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(entry => isObject(entry) && typeof entry.name === "string" && Number.isFinite(Number(entry.score)))
                .map(entry => ({
                    name: text(entry.name, "", 15),
                    score: number(entry.score, 0, 0, 1_000_000_000, true)
                }))
                .filter(entry => entry.name && entry.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);
        } catch (_) {
            localStorage.removeItem(storageKey);
            return [];
        }
    }

    return { SAVE_KEY, SESSION_KEY, normalizeSave, normalizeSession, readLeaderboard };
})();

const GameState = {
    // Current variables
    score: 0,
    highscore: 0,
    today_best: 0,
    today_date: "",
    year_best: 0,
    year_date: "",
    player_name: "",
    fish_coins: 0,
    unlocked_themes: ["Indigo Night"],
    active_theme: "Indigo Night",
    purchased_skins: [],
    skin_assignments: {}, // maps skin_id -> level
    purchased_sounds: [],
    active_sound_set: "Default",
    sfx_enabled: true,
    music_enabled: true,
    google_sheets_url: "",
    onStateChange: null,
    triggerStateChange() {
        if (typeof this.onStateChange === 'function') {
            this.onStateChange();
        }
    },

    /** Visual + physics scale for all cats (1.0 = original APK sizes). */
    CAT_SIZE_SCALE: 1.125,

    // Radii of cats (levels 1 to 11)
    get_radius(level) {
        return (25.0 + (level - 1) * 8.5) * this.CAT_SIZE_SCALE;
    },

    // Colors of cats (fallback)
    get_color(level) {
        const colors = {
            1: "#b5e2ff", // Нежно-голубой
            2: "#b5ffb8", // Нежно-зеленый
            3: "#fffeb5", // Нежно-желтый
            4: "#ffd3b5", // Персиковый
            5: "#ffb5e8", // Розовый
            6: "#d1b5ff", // Сиреневый
            7: "#b5ffd9", // Мятный
            8: "#ffb5b5", // Пастельно-красный
            9: "#e5ffb5", // Салатовый
            10: "#ffd700", // Золотой
            11: "#9370db"  // Пурпурный (Кот-Космонавт)
        };
        return colors[level] || "#ffffff";
    },

    load() {
        // Request persistent storage so progress is not wiped to clear space
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
        }

        const dataStr = localStorage.getItem(CatDropData.SAVE_KEY);
        if (dataStr) {
            try {
                const data = CatDropData.normalizeSave(JSON.parse(dataStr));
                this.highscore = data.highscore;
                this.today_best = data.today_best;
                this.today_date = data.today_date;
                this.year_best = data.year_best;
                this.year_date = data.year_date;
                this.player_name = data.player_name;
                this.google_sheets_url = data.google_sheets_url;
                this.fish_coins = data.fish_coins;
                this.unlocked_themes = data.unlocked_themes;
                this.active_theme = data.active_theme;
                this.purchased_skins = data.purchased_skins;
                this.skin_assignments = data.skin_assignments;
                this.purchased_sounds = data.purchased_sounds;
                this.active_sound_set = data.active_sound_set;
                this.sfx_enabled = data.sfx_enabled;
                this.music_enabled = data.music_enabled;
                localStorage.setItem(CatDropData.SAVE_KEY, JSON.stringify(data));
            } catch (e) {
                console.warn("Invalid save data removed; using defaults", e);
                localStorage.removeItem(CatDropData.SAVE_KEY);
            }
        }
    },

    save() {
        const data = {
            schema_version: 2,
            highscore: this.highscore,
            today_best: this.today_best,
            today_date: this.today_date,
            year_best: this.year_best,
            year_date: this.year_date,
            player_name: this.player_name,
            google_sheets_url: this.google_sheets_url,
            fish_coins: this.fish_coins,
            unlocked_themes: this.unlocked_themes,
            active_theme: this.active_theme,
            purchased_skins: this.purchased_skins,
            skin_assignments: this.skin_assignments,
            purchased_sounds: this.purchased_sounds,
            active_sound_set: this.active_sound_set,
            sfx_enabled: this.sfx_enabled,
            music_enabled: this.music_enabled
        };
        localStorage.setItem(CatDropData.SAVE_KEY, JSON.stringify(CatDropData.normalizeSave(data)));
        this.triggerStateChange();
        // Облачный сейв (надстройка): пуш в Play Games, если залогинен. Без влияния на локалку.
        try { if (window.CloudSave) window.CloudSave.onLocalSave(); } catch (e) {}
    },

    getTodayKey() {
        // BUG-E fix: локальная дата, а не UTC — «дневной» рекорд обнуляется в местную
        // полночь, а не в полночь по Гринвичу.
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mm}-${dd}`;
    },

    getYearKey() {
        return new Date().getFullYear().toString();
    },

    resetTodayIfNeeded() {
        const today = this.getTodayKey();
        const year = this.getYearKey();
        if (this.today_date !== today) {
            this.today_date = today;
            this.today_best = 0;
            this.save();
        }
        if (this.year_date !== year) {
            this.year_date = year;
            this.year_best = 0;
            this.save();
        }
    },

    recordScoreForModes(score, gameMode) {
        this.resetTodayIfNeeded();
        this.updateBestScores(score);
        this.save();
    },

    updateBestScores(score) {
        if (score > this.today_best) {
            this.today_best = score;
            this.today_date = this.getTodayKey();
        }
        if (score > this.year_best) {
            this.year_best = score;
            this.year_date = this.getYearKey();
        }
        if (score > this.highscore) {
            this.highscore = score;
        }
    },

    addScore(amount) {
        this.score += amount;
        const beforeHigh = this.highscore;
        const beforeToday = this.today_best;
        const beforeYear = this.year_best;
        this.resetTodayIfNeeded();
        this.updateBestScores(this.score);
        if (this.highscore !== beforeHigh || this.today_best !== beforeToday || this.year_best !== beforeYear) {
            this.save();
        } else {
            this.triggerStateChange();
        }
    },

    resetScore() {
        this.score = 0;
        this.triggerStateChange();
    },

    setPlayerName(name) {
        this.player_name = name.trim();
        this.save();
    },

    addFishCoins(amount) {
        this.fish_coins += amount;
        this.save();
    },
    
    spendFishCoins(amount) {
        if (this.fish_coins >= amount) {
            this.fish_coins -= amount;
            this.save();
            return true;
        }
        return false;
    },

    unlockTheme(themeName) {
        if (!this.unlocked_themes.includes(themeName)) {
            this.unlocked_themes.push(themeName);
            this.save();
        }
    },

    setActiveTheme(themeName) {
        this.active_theme = themeName;
        this.save();
    },

    unlockSkin(skinId) {
        if (!this.purchased_skins.includes(skinId)) {
            this.purchased_skins.push(skinId);
            this.save();
        }
    },

    assignSkinToLevel(skinId, level) {
        this.skin_assignments[skinId] = level;
        // Unassign other skins from the same level
        for (const otherSkin in this.skin_assignments) {
            if (otherSkin !== skinId && this.skin_assignments[otherSkin] === level) {
                this.skin_assignments[otherSkin] = 0;
            }
        }
        this.save();
    },

    unlockSoundSet(soundId) {
        if (!this.purchased_sounds.includes(soundId)) {
            this.purchased_sounds.push(soundId);
            this.save();
        }
    },

    setActiveSoundSet(soundId) {
        this.active_sound_set = soundId;
        this.save();
    },

    getCatSpritePath(level) {
        // Check assignments
        for (const skinId in this.skin_assignments) {
            if (this.skin_assignments[skinId] === level) {
                return `assets/sprites/skin_${skinId.toLowerCase()}.png`;
            }
        }
        return `assets/sprites/cat_${level}.png`;
    },

    // Session logic
    saveActiveSession(current_score, current_coins, next_spawn, catsArray, extra) {
        const catsData = catsArray.map(cat => ({
            level: cat.level,
            special: cat.special || null,
            pos_x: cat.x,
            pos_y: cat.y,
            rot: cat.angle,
            vel_x: cat.velocity.x,
            vel_y: cat.velocity.y,
            ang_vel: cat.angularVelocity
        }));

        const data = {
            schema_version: 2,
            score: current_score,
            fish_coins: current_coins,
            next_spawn: next_spawn,
            game_mode: extra?.game_mode || "classic",
            cup_tilt: extra?.cup_tilt || 0,
            total_drops: extra?.total_drops || 0,
            cats: catsData
        };

        localStorage.setItem(CatDropData.SESSION_KEY, JSON.stringify(data));
    },

    hasSavedSession() {
        return this.loadActiveSession() !== null;
    },

    deleteActiveSession() {
        localStorage.removeItem(CatDropData.SESSION_KEY);
    },

    loadActiveSession() {
        const sessionStr = localStorage.getItem(CatDropData.SESSION_KEY);
        if (sessionStr) {
            try {
                const session = CatDropData.normalizeSession(JSON.parse(sessionStr));
                if (session) return session;
                console.warn("Invalid session data removed");
            } catch (e) {
                console.warn("Invalid session JSON removed", e);
            }
            this.deleteActiveSession();
        }
        return null;
    },

    getTodayLeaderboardKey(dateKey) {
        return `cat_drop_today_leaderboard_${dateKey || this.getTodayKey()}`;
    },

    submitToLeaderboard(storageKey, name, score) {
        if (!name || score <= 0) return;
        let board = CatDropData.readLeaderboard(storageKey);
        const idx = board.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
        if (idx !== -1) {
            if (score > board[idx].score) board[idx].score = score;
        } else {
            board.push({ name, score });
        }
        board.sort((a, b) => b.score - a.score);
        localStorage.setItem(storageKey, JSON.stringify(board.slice(0, 10)));
    },

    getLeaderboard(storageKey) {
        return CatDropData.readLeaderboard(storageKey);
    }
};

// Auto load save data
GameState.load();
window.GameState = GameState;
