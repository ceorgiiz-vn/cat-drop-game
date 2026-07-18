import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SCREENSHOTS_DIR = path.join(ROOT, 'www', 'screenshots', 'pc_games');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Convert local images to Base64 to load them reliably in Puppeteer file:// environment
function getBase64(filePath) {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
}

async function main() {
    console.log("Starting PC assets generation...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Paths to local source images
    const iconPath = path.join(ROOT, '_dev_assets', 'app_icon_512.png');
    const featuredGraphicPath = path.join(ROOT, '_dev_assets', 'gpgs_featured_graphic.jpg');

    const iconBase64 = getBase64(iconPath);
    const graphicBase64 = getBase64(featuredGraphicPath);

    // --- 1. Generate 600x400 Transparent Logo ---
    console.log("Rendering 600x400 transparent logo...");
    const logoHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    width: 600px;
                    height: 400px;
                    background: transparent;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    font-family: 'Fredoka', sans-serif;
                }
                .logo-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 20px;
                }
                img {
                    width: 140px;
                    height: 140px;
                    filter: drop-shadow(0 6px 12px rgba(0,0,0,0.25));
                    animation: float 3s ease-in-out infinite;
                }
                .text-block {
                    display: flex;
                    flex-direction: column;
                }
                h1 {
                    margin: 0;
                    font-size: 72px;
                    font-weight: 700;
                    color: #ffb5e8;
                    text-shadow: 
                        -3px -3px 0 #191d32,  
                         3px -3px 0 #191d32,
                        -3px  3px 0 #191d32,
                         3px  3px 0 #191d32,
                         0px 8px 16px rgba(25, 29, 50, 0.4);
                    letter-spacing: 1px;
                }
                h2 {
                    margin: -10px 0 0 0;
                    font-size: 32px;
                    font-weight: 600;
                    color: #ffd700;
                    text-shadow: 
                        -2px -2px 0 #191d32,  
                         2px -2px 0 #191d32,
                        -2px  2px 0 #191d32,
                         2px  2px 0 #191d32,
                         0px 4px 8px rgba(0,0,0,0.3);
                    align-self: flex-start;
                    transform: rotate(-3deg);
                }
            </style>
        </head>
        <body>
            <div class="logo-container">
                <img src="${iconBase64}" />
                <div class="text-block">
                    <h1>Cat Drop</h1>
                    <h2>Evolution</h2>
                </div>
            </div>
        </body>
        </html>
    `;

    await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 1 });
    await page.setContent(logoHtml);
    await delay(500); // let fonts load
    await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'pc_logo_600x400.png'), 
        omitBackground: true 
    });

    // --- 2. Generate 1920x1080 (16:9) Description Image ---
    console.log("Rendering 1920x1080 16:9 description image...");
    const descriptionHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    width: 1920px;
                    height: 1080px;
                    background: #191d32;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                }
                .banner {
                    width: 1920px;
                    height: 1080px;
                    background-image: url('${graphicBase64}');
                    background-size: cover;
                    background-position: center;
                }
            </style>
        </head>
        <body>
            <div class="banner"></div>
        </body>
        </html>
    `;

    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(descriptionHtml);
    await delay(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'pc_description_1920x1080.png') });

    console.log("PC assets created successfully!");
    await browser.close();
}

main();
