/**
 * Cat Drop — облачное сохранение (Google Play Games Saved Games / Snapshots).
 *
 * БЕЗОПАСНАЯ НАДСТРОЙКА над локальным сейвом. Принцип:
 *  - localStorage остаётся ГЛАВНЫМ и его логика (state.js) НЕ меняется;
 *  - облако лишь добавляется сверху и целиком обёрнуто в try/catch;
 *  - если PGS не настроены / нет сети / игрок не залогинен — модуль ничего не
 *    делает (ready=false), и игра работает ровно как раньше.
 *
 * Требует настроенных Google Play Games Services в Play Console (иначе вход не
 * проходит и sync не активируется — но и не ломает игру).
 */
const CloudSave = (function () {
    var SNAPSHOT_NAME = 'catdrop_main';
    var PUSH_DEBOUNCE_MS = 4000;

    var plugin = null;
    var ready = false;      // залогинены И плагин со снапшотами доступен
    var pushTimer = null;

    function reportErr(e) {
        try {
            if (window.CatDiag) {
                window.CatDiag.reportOncePer('cloudsave_err', 30000, 'cloud_save_error',
                    'CloudSave error: ' + ((e && e.message) || e), {});
            }
        } catch (_) {}
    }

    function uni(a, b) {
        var seen = {}, out = [];
        (a || []).concat(b || []).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
        return out;
    }

    // Локальный сейв «пустой» (свежая установка/переустановка)?
    function localIsFresh() {
        return !(GameState.highscore > 0)
            && !GameState.player_name
            && (GameState.purchased_skins || []).length === 0
            && (GameState.purchased_sounds || []).length === 0
            && (GameState.unlocked_themes || []).length <= 1;
    }

    // Свежая установка → берём облако целиком (восстановление имени/рекордов/покупок).
    function adoptCloud(cloud) {
        var keys = ['highscore', 'today_best', 'today_date', 'year_best', 'year_date',
            'player_name', 'fish_coins', 'unlocked_themes', 'active_theme',
            'purchased_skins', 'skin_assignments', 'purchased_sounds', 'active_sound_set'];
        keys.forEach(function (k) {
            if (cloud[k] !== undefined && cloud[k] !== null) GameState[k] = cloud[k];
        });
    }

    // Существующее устройство → объединяем (берём лучшее, ничего не теряем).
    function mergeCloud(cloud) {
        GameState.highscore = Math.max(GameState.highscore || 0, cloud.highscore || 0);
        GameState.fish_coins = Math.max(GameState.fish_coins || 0, cloud.fish_coins || 0);
        if ((cloud.today_best || 0) > (GameState.today_best || 0)) {
            GameState.today_best = cloud.today_best; GameState.today_date = cloud.today_date || GameState.today_date;
        }
        if ((cloud.year_best || 0) > (GameState.year_best || 0)) {
            GameState.year_best = cloud.year_best; GameState.year_date = cloud.year_date || GameState.year_date;
        }
        if (!GameState.player_name && cloud.player_name) GameState.player_name = cloud.player_name;
        GameState.unlocked_themes = uni(GameState.unlocked_themes, cloud.unlocked_themes);
        GameState.purchased_skins = uni(GameState.purchased_skins, cloud.purchased_skins);
        GameState.purchased_sounds = uni(GameState.purchased_sounds, cloud.purchased_sounds);
    }

    function currentPayload() {
        return JSON.stringify({
            highscore: GameState.highscore,
            today_best: GameState.today_best, today_date: GameState.today_date,
            year_best: GameState.year_best, year_date: GameState.year_date,
            player_name: GameState.player_name,
            fish_coins: GameState.fish_coins,
            unlocked_themes: GameState.unlocked_themes,
            active_theme: GameState.active_theme,
            purchased_skins: GameState.purchased_skins,
            skin_assignments: GameState.skin_assignments,
            purchased_sounds: GameState.purchased_sounds,
            active_sound_set: GameState.active_sound_set
        });
    }

    async function pushNow() {
        try {
            if (!ready || !plugin || !plugin.saveSnapshot) return;
            await plugin.saveSnapshot({ name: SNAPSHOT_NAME, data: currentPayload(), description: 'Cat Drop progress' });
        } catch (e) { reportErr(e); }
    }

    async function pullAndMerge() {
        try {
            if (!ready || !plugin || !plugin.loadSnapshot) return;
            var res = await plugin.loadSnapshot({ name: SNAPSHOT_NAME });
            var snap = res && res.snapshot;
            if (snap && snap.data) {
                var cloud = JSON.parse(snap.data);
                if (localIsFresh()) adoptCloud(cloud); else mergeCloud(cloud);
                GameState.save();   // запишет объединённое локально + обновит HUD
            }
            await pushNow();        // сразу сводим облако к актуальному локальному
        } catch (e) { reportErr(e); }
    }

    // Вызывается из play_games.js после успешного входа.
    async function onSignedIn(pgPlugin) {
        try {
            plugin = pgPlugin || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PlayGames);
            if (!plugin || !plugin.loadSnapshot) return; // старый плагин без снапшотов — тихо выходим
            ready = true;
            await pullAndMerge();
        } catch (e) { reportErr(e); }
    }

    // Вызывается из GameState.save() (одна защищённая строка-хук). Пуш с задержкой.
    function onLocalSave() {
        try {
            if (!ready) return;
            if (pushTimer) clearTimeout(pushTimer);
            pushTimer = setTimeout(function () { pushTimer = null; pushNow(); }, PUSH_DEBOUNCE_MS);
        } catch (e) {}
    }

    return { onSignedIn: onSignedIn, onLocalSave: onLocalSave, pullAndMerge: pullAndMerge };
})();
window.CloudSave = CloudSave;
