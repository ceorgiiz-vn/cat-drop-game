// Game state manager for Cat Drop: Evolution

const GameState = {
    // Current variables
    score: 0,
    highscore: 0,
    today_best: 0,
    today_date: "",
    daily_best: 0,
    daily_date: "",
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
    
    // Tamagotchi State
    tamagotchi: {
        hunger: 100,
        happiness: 100,
        energy: 100,
        last_update: Date.now(),
        created_at: Date.now(),
        items: {
            bowl: 0,         // 0: none, 1: basic, 2: premium
            bed: 0,          // 0: none, 1: cardboard box, 2: fluffy bed
            toy: 0,          // 0: none, 1: yarn ball, 2: mouse toy
            scratcher: 0,    // 0: none, 1: small post, 2: cat tree
            hat: 0,          // 0: none, 1: top hat
            glasses: 0       // 0: none, 1: sunglasses
        },
        equipped: {
            hat: null,
            glasses: null
        }
    },

    // Radii of cats (levels 1 to 11)
    get_radius(level) {
        return 25.0 + (level - 1) * 8.5;
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
                this.daily_best = data.daily_best ?? 0;
                this.daily_date = data.daily_date ?? "";
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
                
                if (data.tamagotchi) {
                    this.tamagotchi = data.tamagotchi;
                }
                // Ensure default values exist if updating from older version
                if (!this.tamagotchi.items) {
                    this.tamagotchi.items = { bowl: 0, bed: 0, toy: 0, scratcher: 0, hat: 0, glasses: 0 };
                }
                if (!this.tamagotchi.equipped) {
                    this.tamagotchi.equipped = { hat: null, glasses: null };
                }
                if (!this.tamagotchi.created_at) {
                    this.tamagotchi.created_at = Date.now();
                }
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
            daily_best: this.daily_best,
            daily_date: this.daily_date,
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
            music_enabled: this.music_enabled,
            tamagotchi: this.tamagotchi
        };
        localStorage.setItem("cat_drop_save_data", JSON.stringify(data));
    },

    getTodayKey() {
        return new Date().toISOString().slice(0, 10);
    },

    resetTodayIfNeeded() {
        const today = this.getTodayKey();
        if (this.today_date !== today) {
            this.today_date = today;
            this.today_best = 0;
            this.save();
        }
        if (this.daily_date !== today) {
            this.daily_date = today;
            this.daily_best = 0;
            this.save();
        }
    },

    recordScoreForModes(score, gameMode) {
        this.resetTodayIfNeeded();
        if (score > this.today_best) {
            this.today_best = score;
            this.today_date = this.getTodayKey();
        }
        if (gameMode === "daily" && score > this.daily_best) {
            this.daily_best = score;
            this.daily_date = this.getTodayKey();
        }
        this.save();
    },

    addScore(amount) {
        this.score += amount;
        if (this.score > this.highscore) {
            this.highscore = this.score;
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

    updateTamagotchiStats(hungerDelta, happinessDelta, energyDelta) {
        this.tamagotchi.hunger = Math.max(0, Math.min(100, this.tamagotchi.hunger + hungerDelta));
        this.tamagotchi.happiness = Math.max(0, Math.min(100, this.tamagotchi.happiness + happinessDelta));
        this.tamagotchi.energy = Math.max(0, Math.min(100, this.tamagotchi.energy + energyDelta));
        this.tamagotchi.last_update = Date.now();
        this.save();
    },
    
    buyTamagotchiItem(type, level, cost) {
        if (this.spendFishCoins(cost)) {
            this.tamagotchi.items[type] = level;
            // Auto equip if accessory
            if (type === 'hat') this.tamagotchi.equipped.hat = level;
            if (type === 'glasses') this.tamagotchi.equipped.glasses = level;
            this.save();
            return true;
        }
        return false;
    },

    equipTamagotchiAccessory(type, level) {
        this.tamagotchi.equipped[type] = level;
        this.save();
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
            daily_spawn_index: extra?.daily_spawn_index || 0,
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

    getDailyLeaderboardKey(dateKey) {
        return `cat_drop_daily_leaderboard_${dateKey || this.getTodayKey()}`;
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
