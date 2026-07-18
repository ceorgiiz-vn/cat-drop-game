import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;

const SCREENSHOTS_DIR = path.join(ROOT, 'www', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting screenshot generator (fixed stacking logic)...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 450, height: 800, deviceScaleFactor: 2 });

    try {
        console.log("Navigating to game URL...");
        await page.goto(URL, { waitUntil: 'networkidle2' });
        await delay(2000);

        // Nickname modal bypass
        const isNicknameOpen = await page.evaluate(() => {
            const el = document.querySelector('#nickname-overlay');
            return el && el.classList.contains('active');
        });
        if (isNicknameOpen) {
            await page.type('#nickname-input', 'CatLover');
            await page.evaluate(() => document.querySelector('#profile-save-btn').click());
            await delay(1000);
        }

        // Resume Session bypass
        const isResumeOpen = await page.evaluate(() => {
            const el = document.querySelector('#resume-overlay');
            return el && el.classList.contains('active');
        });
        if (isResumeOpen) {
            await page.evaluate(() => document.querySelector('#resume-no-btn').click());
            await delay(1000);
        }

        // Helper to add cats to the world cleanly
        const spawnCatsInCup = async (catSpecs) => {
            await page.evaluate((specs) => {
                const debug = window.__DEBUG_GAME__;
                specs.forEach(c => {
                    const level = c.level;
                    let cat;
                    if (level === 0) {
                        cat = debug.createCat({ level: 0 }, c.x, c.y, true);
                    } else if (level === -1) {
                        cat = debug.createMouse(c.x, c.y, true);
                    } else {
                        cat = debug.createCat({ level }, c.x, c.y, true);
                    }
                    cat.spawnScale = 1.0;
                    debug.World.add(debug.engine().world, cat.body);
                    debug.activeCats().push(cat);
                });
            }, catSpecs);
        };

        const clearWorld = async () => {
            await page.evaluate(() => {
                const debug = window.__DEBUG_GAME__;
                const world = debug.World;
                const engine = debug.engine();
                const activeCats = debug.activeCats();
                while(activeCats.length > 0) {
                    const cat = activeCats.pop();
                    world.remove(engine.world, cat.body);
                }
            });
        };

        // --- Screenshot 1: Half-filled cup (different cats, no merges, Y: 700 to 1100) ---
        console.log("Preparing Screenshot 1: Half-filled cup...");
        await clearWorld();
        await spawnCatsInCup([
            { level: 8, x: 280, y: 1100 },
            { level: 7, x: 440, y: 1080 },
            { level: 6, x: 160, y: 1020 },
            { level: 5, x: 320, y: 900 },
            { level: 4, x: 220, y: 820 },
            { level: 3, x: 400, y: 820 },
            { level: 2, x: 300, y: 720 },
            { level: 1, x: 350, y: 650 }
        ]);
        await delay(3500); // Wait for physics settling
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_1_half_full.png') });

        // --- Screenshot 2: George egg on a half-filled cup with different cats ---
        console.log("Preparing Screenshot 2: George egg on half-filled cup...");
        await clearWorld();
        // Setup half-full stack
        await spawnCatsInCup([
            { level: 8, x: 280, y: 1100 },
            { level: 7, x: 440, y: 1080 },
            { level: 6, x: 160, y: 1020 },
            { level: 5, x: 320, y: 900 },
            { level: 4, x: 220, y: 820 },
            { level: 3, x: 400, y: 820 }
        ]);
        await delay(2500); // let base stack settle
        
        // Now spawn the two Level 11s near the top of the stack so they merge
        console.log("Spawning Level 11s on top of settled stack...");
        await spawnCatsInCup([
            { level: 11, x: 240, y: 680 },
            { level: 11, x: 360, y: 680 }
        ]);
        await delay(1200); // Touch, merge and show George
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_2_george_egg.png') });

        // --- Screenshot 3: Full cup near danger state (reaching up to y=350-400) ---
        console.log("Preparing Screenshot 3: Full cup near danger state...");
        await clearWorld();
        await spawnCatsInCup([
            // Bottom layer
            { level: 9, x: 300, y: 1100 },
            { level: 8, x: 460, y: 1080 },
            { level: 7, x: 160, y: 1020 },
            // Mid-low layer
            { level: 6, x: 320, y: 900 },
            { level: 5, x: 200, y: 810 },
            { level: 4, x: 420, y: 810 },
            // Mid-high layer
            { level: 3, x: 300, y: 710 },
            { level: 2, x: 180, y: 640 },
            { level: 1, x: 400, y: 630 },
            // Top layer (reaching the rim)
            { level: 5, x: 280, y: 540 },
            { level: 6, x: 360, y: 470 },
            { level: 3, x: 220, y: 450 },
            { level: 4, x: 290, y: 380 }
        ]);
        await delay(4500); // Wait for complex physics to settle
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_3_full_cup.png') });

        // --- Screenshot 4: Golden ball gameplay scene ---
        console.log("Preparing Screenshot 4: Golden ball scene...");
        await clearWorld();
        await spawnCatsInCup([
            { level: 7, x: 250, y: 1100 },
            { level: 6, x: 440, y: 1080 },
            { level: 5, x: 160, y: 1050 },
            { level: 0, x: 300, y: 930 }, // Golden Ball
            { level: 4, x: 200, y: 850 },
            { level: 3, x: 410, y: 840 },
            { level: 2, x: 300, y: 760 }
        ]);
        await delay(3000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_4_golden_ball.png') });

        // --- Screenshot 5: Shop screen ---
        console.log("Preparing Screenshot 5: Shop menu...");
        await page.evaluate(() => document.querySelector('#main-menu-btn').click());
        await delay(500);
        await page.evaluate(() => document.querySelector('#shop-btn').click());
        await delay(1200);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_5_shop.png') });

        console.log("All custom screenshots created inside www/screenshots successfully!");
    } catch (e) {
        console.error("Error during screenshot generation:", e);
    } finally {
        await browser.close();
    }
}

main();
