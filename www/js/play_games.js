// play_games.js
// Handles Google Play Games Services (GPGS) via @idleflowgames/capacitor-play-games
// Also handles Capacitor App events like the hardware back button.

const PlayGames = (function() {
    let playGamesPlugin = null;
    let appPlugin = null;
    let isAuthenticated = false;

    function isCapacitor() {
        return window.Capacitor && window.Capacitor.isNativePlatform();
    }

    async function init() {
        if (!isCapacitor()) {
            return;
        }

        try {
            playGamesPlugin = window.Capacitor.Plugins.PlayGames;
            appPlugin = window.Capacitor.Plugins.App;
            
            if (appPlugin) {
                setupBackButton();
            }

            if (playGamesPlugin) {
                await silentSignIn();
            }
        } catch (e) {
            console.error("PlayGames init failed:", e);
        }
    }

    async function signIn(silent) {
        try {
            const result = await playGamesPlugin.signIn({ silent });
            isAuthenticated = result?.signedIn === true;
            // Облачный сейв (надстройка): подтянуть/слить прогресс из облака.
            if (isAuthenticated) {
                try { if (window.CloudSave) window.CloudSave.onSignedIn(playGamesPlugin); } catch (e) {}
            }
        } catch (e) {
            isAuthenticated = false;
        }
        return isAuthenticated;
    }

    async function silentSignIn() {
        // Не показываем интерактивное окно на старте. Явный вход допустим только
        // после нажатия игроком на leaderboard.
        return signIn(true);
    }

    async function submitScore(leaderboardId, score) {
        if (!isCapacitor() || !isAuthenticated || !playGamesPlugin) return;
        try {
            await playGamesPlugin.submitScore({
                leaderboardId: leaderboardId,
                score: score
            });
        } catch (e) {
            console.error("GPGS: Failed to submit score", e);
        }
    }

    async function showLeaderboard(leaderboardId) {
        if (!isCapacitor() || !playGamesPlugin) return false;
        if (!isAuthenticated) await signIn(false);
        if (isAuthenticated) {
            try {
                await playGamesPlugin.showLeaderboard({ leaderboardId: leaderboardId });
                return true; 
            } catch (e) {
                console.error("GPGS: Failed to show native leaderboard UI", e);
            }
        }
        return false;
    }

    function setupBackButton() {
        appPlugin.addListener("backButton", (event) => {
            const openModals = document.querySelectorAll(".modal-overlay.active");
            if (openModals.length > 0) {
                window.dispatchEvent(new CustomEvent("closeModalsViaBackButton"));
                return;
            }

            if (document.querySelector("#settings-menu.active")) {
                window.dispatchEvent(new CustomEvent("closeSettingsMenuViaBackButton"));
                return;
            }

            if (window.isTargetingEraserVar && window.isTargetingEraserVar()) {
                window.dispatchEvent(new CustomEvent("cancelEraserViaBackButton"));
                return;
            }

            const wantExit = confirm("Are you sure you want to exit Cat Drop?");
            if (wantExit) {
                appPlugin.exitApp();
            }
        });
    }

    return { init, submitScore, showLeaderboard };
})();

window.PlayGames = PlayGames;
