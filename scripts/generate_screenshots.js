import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting screenshot generation script...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // Use a standard phone screen resolution for Google Play portrait screenshots (450x800, scaled to double resolution on render)
    await page.setViewport({ width: 450, height: 800, deviceScaleFactor: 2 });

    try {
        console.log("Navigating to game URL...");
        await page.goto(URL, { waitUntil: 'networkidle2' });
        await delay(2000); // let it load and service worker initialize

        // Check if Nickname modal is open, type a nickname and click start game
        const isNicknameOpen = await page.evaluate(() => {
            const el = document.querySelector('#nickname-overlay');
            return el && el.classList.contains('active');
        });

        if (isNicknameOpen) {
            console.log("Nickname modal detected. Entering name and starting...");
            await page.type('#nickname-input', 'CatLover');
            await page.evaluate(() => {
                document.querySelector('#profile-save-btn').click();
            });
            await delay(1500);
        }

        // Check if Resume Session modal is open, click NO to start a clean game
        const isResumeOpen = await page.evaluate(() => {
            const el = document.querySelector('#resume-overlay');
            return el && el.classList.contains('active');
        });

        if (isResumeOpen) {
            console.log("Resume session modal detected. Clicking NO to start a fresh game.");
            await page.evaluate(() => {
                document.querySelector('#resume-no-btn').click();
            });
            await delay(1500);
        }

        // --- 1. Clean Game Board Screenshot ---
        console.log("Capturing Clean Game Board...");
        await page.screenshot({ path: path.join(ROOT, 'screenshot_1_gameplay.png') });

        // --- 2. Active Gameplay (Merging Cats) Screenshot ---
        console.log("Spawning gameplay cats...");
        await page.evaluate(() => {
            const debug = window.__DEBUG_GAME__;
            const addCat = (level, x, y) => {
                const cat = debug.createCat({ level }, x, y, true);
                cat.spawnScale = 1.0;
                debug.World.add(debug.engine().world, cat.body);
                debug.activeCats().push(cat);
                return cat;
            };

            const levels = [1, 2, 3, 4, 3, 2];
            levels.forEach((lvl, i) => {
                const x = 160 + i * 50;
                const y = 900 - i * 50;
                addCat(lvl, x, y);
            });
        });
        await delay(2500); // let cats settle under physics
        console.log("Capturing active gameplay...");
        await page.screenshot({ path: path.join(ROOT, 'screenshot_2_merging.png') });

        // --- 3. Shop Screenshot ---
        console.log("Opening settings menu...");
        await page.evaluate(() => {
            document.querySelector('#main-menu-btn').click();
        });
        await delay(500);
        console.log("Opening Shop...");
        await page.evaluate(() => {
            document.querySelector('#shop-btn').click();
        });
        await delay(1200); // let shop list render and layout compute
        console.log("Capturing Shop...");
        await page.screenshot({ path: path.join(ROOT, 'screenshot_3_shop.png') });

        // Close shop
        console.log("Closing Shop...");
        await page.evaluate(() => {
            document.querySelector('#shop-close-btn').click();
        });
        await delay(800);

        // --- 4. George Easter Egg Screenshot ---
        console.log("Triggering George easter egg...");
        await page.evaluate(() => {
            const debug = window.__DEBUG_GAME__;
            const world = debug.World;
            const engine = debug.engine();
            const activeCats = debug.activeCats();
            
            // Remove existing cats
            while(activeCats.length > 0) {
                const cat = activeCats.pop();
                world.remove(engine.world, cat.body);
            }

            const addCat = (level, x, y) => {
                const cat = debug.createCat({ level }, x, y, true);
                cat.spawnScale = 1.0;
                debug.World.add(debug.engine().world, cat.body);
                debug.activeCats().push(cat);
                return cat;
            };

            // Create two lvl 11 cats close to each other to force merge
            addCat(11, 280, 800);
            addCat(11, 380, 800);
        });

        console.log("Waiting for merge and George praises you animation...");
        await delay(1200); // let them touch, merge and show George
        console.log("Capturing George Easter Egg...");
        await page.screenshot({ path: path.join(ROOT, 'screenshot_4_george.png') });

        console.log("All screenshots captured successfully!");
    } catch (e) {
        console.error("Error during screenshot generation:", e);
    } finally {
        await browser.close();
    }
}

main();
