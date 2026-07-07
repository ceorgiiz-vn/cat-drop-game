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
            console.log("PlayGames: Not running in native Capacitor environment. Mocking GPGS.");
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

    async function silentSignIn() {
        try {
            const result = await playGamesPlugin.signIn({ silent: true });
            if (result.isAuthenticated) {
                isAuthenticated = true;
                console.log("GPGS: Silently signed in!");
            }
        } catch (e) {
            console.log("GPGS: Silent sign-in failed, trying interactive.", e);
            try {
                const result = await playGamesPlugin.signIn();
                if (result.isAuthenticated) {
                    isAuthenticated = true;
                    console.log("GPGS: Interactively signed in!");
                }
            } catch (err) {
                console.error("GPGS: Interactive sign-in also failed:", err);
            }
        }
    }

    async function submitScore(leaderboardId, score) {
        if (!isCapacitor() || !isAuthenticated || !playGamesPlugin) return;
        try {
            await playGamesPlugin.submitScore({
                leaderboardId: leaderboardId,
                score: score
            });
            console.log("GPGS: Score submitted successfully!");
        } catch (e) {
            console.error("GPGS: Failed to submit score", e);
        }
    }

    async function showLeaderboard(leaderboardId) {
        if (!isCapacitor() || !playGamesPlugin) return false;
        if (!isAuthenticated) await silentSignIn();
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
                openModals.forEach(m => m.classList.remove("active"));
                window.dispatchEvent(new CustomEvent("modalClosedViaBackButton"));
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
