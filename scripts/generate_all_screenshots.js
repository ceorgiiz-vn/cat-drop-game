import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;

// Create subfolders
const BASE_DIR = path.join(ROOT, 'www', 'screenshots');
const DIRS = {
    phone: path.join(BASE_DIR, 'phone'),
    tablet_7: path.join(BASE_DIR, 'tablet_7'),
    tablet_10: path.join(BASE_DIR, 'tablet_10'),
    pc_games: path.join(BASE_DIR, 'pc_games')
};

for (const dir of Object.values(DIRS)) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting batch screenshot generation for all devices (30%, 80%, George, Shop, Golden Ball)...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    const bypassModals = async () => {
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
    };

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
                // Only bypass merges if specified, or if we do it globally
                if (c.noMerge) {
                    cat.isMerged = true;
                }
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

    // Stacking specifications
    const stack30 = [
        { level: 8, x: 280, y: 1100, noMerge: true },
        { level: 7, x: 440, y: 1080, noMerge: true },
        { level: 6, x: 160, y: 1020, noMerge: true },
        { level: 5, x: 320, y: 940, noMerge: true },
        { level: 4, x: 240, y: 880, noMerge: true }
    ];

    const stack80 = [
        { level: 11, x: 360, y: 1100, noMerge: true },
        { level: 10, x: 200, y: 1050, noMerge: true },
        { level: 9, x: 480, y: 1050, noMerge: true },
        { level: 8, x: 300, y: 940, noMerge: true },
        { level: 7, x: 180, y: 860, noMerge: true },
        { level: 6, x: 440, y: 860, noMerge: true },
        { level: 5, x: 310, y: 760, noMerge: true },
        { level: 4, x: 210, y: 680, noMerge: true },
        { level: 3, x: 400, y: 680, noMerge: true },
        { level: 2, x: 260, y: 600, noMerge: true },
        { level: 5, x: 350, y: 580, noMerge: true },
        { level: 4, x: 200, y: 500, noMerge: true },
        { level: 3, x: 320, y: 440, noMerge: true },
        { level: 2, x: 410, y: 440, noMerge: true },
        { level: 1, x: 260, y: 360, noMerge: true },
        { level: 1, x: 340, y: 360, noMerge: true }
    ];

    const stackGeorgeBase = [
        { level: 8, x: 280, y: 1100 },
        { level: 7, x: 440, y: 1080 },
        { level: 6, x: 160, y: 1020 },
        { level: 5, x: 320, y: 900 },
        { level: 4, x: 220, y: 820 },
        { level: 3, x: 400, y: 820 }
    ];

    const stackGoldenBall = [
        { level: 7, x: 250, y: 1100 },
        { level: 6, x: 440, y: 1080 },
        { level: 5, x: 160, y: 1050 },
        { level: 0, x: 300, y: 930 }, // Golden Ball
        { level: 4, x: 200, y: 850 },
        { level: 3, x: 410, y: 840 },
        { level: 2, x: 300, y: 760 }
    ];

    try {
        const viewports = [
            {
                name: 'phone',
                width: 540,
                height: 960,
                scale: 2,
                dir: DIRS.phone
            },
            {
                name: 'tablet_7',
                width: 600,
                height: 960,
                scale: 2,
                dir: DIRS.tablet_7
            },
            {
                name: 'tablet_10',
                width: 800,
                height: 1280,
                scale: 2,
                dir: DIRS.tablet_10
            },
            {
                name: 'pc_games',
                width: 1920,
                height: 1080,
                scale: 1,
                dir: DIRS.pc_games
            }
        ];

        for (const vp of viewports) {
            console.log(`Setting viewport for ${vp.name} (${vp.width}x${vp.height})...`);
            await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.scale });
            await page.goto(URL, { waitUntil: 'networkidle2' });
            await delay(1500);
            await bypassModals();

            // 1. 30% Fill Screenshot
            console.log(`[${vp.name}] Generating 30% fill screenshot...`);
            await clearWorld();
            await spawnCatsInCup(stack30);
            await delay(3000);
            await page.screenshot({ path: path.join(vp.dir, 'screenshot_30_percent.png') });

            // 2. 80% Fill Screenshot
            console.log(`[${vp.name}] Generating 80% fill screenshot...`);
            await clearWorld();
            await spawnCatsInCup(stack80);
            await delay(4000);
            await page.screenshot({ path: path.join(vp.dir, 'screenshot_80_percent.png') });

            // 3. George Egg screenshot
            console.log(`[${vp.name}] Generating George egg screenshot...`);
            await clearWorld();
            await spawnCatsInCup(stackGeorgeBase);
            await delay(2000);
            await spawnCatsInCup([
                { level: 11, x: 240, y: 680 },
                { level: 11, x: 360, y: 680 }
            ]);
            await delay(1500); // let them merge into George egg
            await page.screenshot({ path: path.join(vp.dir, 'screenshot_george.png') });

            // 4. Golden Ball screenshot
            console.log(`[${vp.name}] Generating Golden Ball screenshot...`);
            await clearWorld();
            await spawnCatsInCup(stackGoldenBall);
            await delay(2500);
            await page.screenshot({ path: path.join(vp.dir, 'screenshot_golden_ball.png') });

            // 5. Shop Screen screenshot
            console.log(`[${vp.name}] Generating Shop screen screenshot...`);
            await page.evaluate(() => document.querySelector('#main-menu-btn').click());
            await delay(500);
            await page.evaluate(() => document.querySelector('#shop-btn').click());
            await delay(1000);
            await page.screenshot({ path: path.join(vp.dir, 'screenshot_shop.png') });
        }

        console.log("All screenshots generated successfully!");
    } catch (e) {
        console.error("Error generating screenshots:", e);
    } finally {
        await browser.close();
    }
}

main();
