# Cat Drop: Project Notes

## Current Status
- The app is a single HTML5 Canvas game with PWA support for offline mobile play.
- The active gameplay is the main Cat Drop/Suika-style mode powered by Matter.js.
- The temporary mouse test mode has been removed. The selected mouse behavior is now the normal mouse tuning in `www/js/game.js`.
- The former side mini-games have been removed from the runtime, UI, cache list, and release checks.

## File Structure
- `www/index.html`: main game markup and modals.
- `www/style.css`: global UI and game styling.
- `www/js/game.js`: main game controller, spawning, input, rendering, scoring, mouse behavior.
- `www/js/physics.js`: Matter.js cup and physics constants.
- `www/js/state.js`: local storage, coins, records, skins, active session persistence.
- `www/js/game_modes.js`: main game modes and spawn rules.
- `www/sw.js`: PWA service worker cache list. Bump `CACHE_NAME` whenever JS/CSS/assets change.

## Release Notes
- Keep the release payload focused on the main game.
- Run `npm run check` and `npm run qa` before publishing changes.
