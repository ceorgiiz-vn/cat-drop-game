// Game state manager for Cat Drop: Evolution

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
            navigator.storage.persist().then(granted => {
                if (granted) console.log("Persistent storage granted. Saves are safe!");
                else console.log("Persistent storage not granted.");
            });
        }

        const dataStr = localStorage.getItem("cat_drop_save_data");
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                this.highscore = data.highscore ?? 0;
                this.today_best = data.today_best ?? 0;
                this.today_date = data.today_date ?? "";
                this.year_best = data.year_best ?? 0;
                this.year_date = data.year_date ?? "";
                this.player_name = data.player_name ?? "";
                this.google_sheets_url = data.google_sheets_url ?? "";
                this.fish_coins = data.fish_coins ?? 0;
                this.unlocked_themes = data.unlocked_themes ?? ["Indigo Night"];
                this.active_theme = data.active_theme ?? "Indigo Night";
                this.purchased_skins = data.purchased_skins ?? [];
                
                // Convert skin assignments
                this.skin_assignments = {};
                if (data.skin_assignments) {
                    for (const k in data.skin_assignments) {
                        this.skin_assignments[k] = parseInt(data.skin_assignments[k]) || 0;
                    }
                }
                
                this.purchased_sounds = data.purchased_sounds ?? [];
                this.active_sound_set = data.active_sound_set ?? "Default";
                this.sfx_enabled = data.sfx_enabled ?? true;
                this.music_enabled = data.music_enabled ?? true;
            } catch (e) {
                console.error("Error parsing save data, using defaults", e);
            }
        }
    },

    save() {
        const data = {
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
        localStorage.setItem("cat_drop_save_data", JSON.stringify(data));
    },

    getTodayKey() {
        return new Date().toISOString().slice(0, 10);
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
        }
    },

    resetScore() {
        this.score = 0;
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
            score: current_score,
            fish_coins: current_coins,
            next_spawn: next_spawn,
            game_mode: extra?.game_mode || "classic",
            cup_tilt: extra?.cup_tilt || 0,
            total_drops: extra?.total_drops || 0,
            cats: catsData
        };

        localStorage.setItem("cat_drop_session_data", JSON.stringify(data));
    },

    hasSavedSession() {
        return localStorage.getItem("cat_drop_session_data") !== null;
    },

    deleteActiveSession() {
        localStorage.removeItem("cat_drop_session_data");
    },

    loadActiveSession() {
        const sessionStr = localStorage.getItem("cat_drop_session_data");
        if (sessionStr) {
            try {
                return JSON.parse(sessionStr);
            } catch (e) {
                console.error("Error parsing session data", e);
            }
        }
        return null;
    },

    getTodayLeaderboardKey(dateKey) {
        return `cat_drop_today_leaderboard_${dateKey || this.getTodayKey()}`;
    },

    submitToLeaderboard(storageKey, name, score) {
        if (!name || score <= 0) return;
        let board = JSON.parse(localStorage.getItem(storageKey)) || [];
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
        return JSON.parse(localStorage.getItem(storageKey)) || [];
    }
};

// Auto load save data
GameState.load();
window.GameState = GameState;
