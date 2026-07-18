import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import puppeteer from "puppeteer";

const ROOT = process.cwd();
const WWW = path.join(ROOT, "www");
const TMP = path.join(ROOT, "tmp");
const REPORT_JSON = path.join(TMP, "full-game-qa-report.json");
const REPORT_MD = path.join(TMP, "full-game-qa-summary.md");
const PREMIUM_SOUND_PACKS = {
  Mystic: {
    fileId: "mystic",
    name: "Moonwhisker Pixel Pack",
    cost: 24000,
    desc: "BGM: Midnight Purrcade; SFX: Star Paw Pops",
  },
  Rapper: {
    fileId: "rapper",
    name: "Alley Cat Beat Pack",
    cost: 27000,
    desc: "BGM: Meow-Hop Rooftops; SFX: Scratch Bounce Hits",
  },
  Zombie: {
    fileId: "zombie",
    name: "Nine Lives Glitch Pack",
    cost: 30000,
    desc: "BGM: Purranormal Pixels; SFX: Crunchy Paw Drops",
  },
  Vampire: {
    fileId: "vampire",
    name: "Velvet Fang Chip Pack",
    cost: 33000,
    desc: "BGM: Bat-Cat Waltz; SFX: Crystal Fang Merges",
  },
  Oldman: {
    fileId: "oldman",
    name: "Grandpaw Arcade Pack",
    cost: 36000,
    desc: "BGM: Rocking Chair Quest; SFX: Soft Button Boops",
  },
};

const results = [];
const warnings = [];
const failures = [];

function log(message = "") {
  console.log(message);
}

function addResult(name, status, details = {}) {
  results.push({ name, status, details });
  const marker = status === "pass" ? "OK" : status === "warn" ? "WARN" : "FAIL";
  log(`${marker}: ${name}`);
}

function warn(name, details = {}) {
  warnings.push({ name, ...details });
  addResult(name, "warn", details);
}

function fail(name, details = {}) {
  failures.push({ name, ...details });
  addResult(name, "fail", details);
}

function pass(name, details = {}) {
  addResult(name, "pass", details);
}

function runCommand(name, command) {
  log(`\n== ${name} ==`);
  const proc = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);

  if (proc.error || proc.status !== 0) {
    fail(name, {
      command,
      status: proc.status,
      error: proc.error?.message || null,
    });
    return false;
  }

  pass(name, { command });
  return true;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
    server.on("error", reject);
  });
}

async function waitForServer(url, proc) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 15000) {
    if (proc.exitCode !== null) break;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw new Error(`Local server did not become ready: ${lastError?.message || "no response"}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const port = await getFreePort();
  const command = `npx serve www -l tcp://127.0.0.1:${port} -n`;
  const proc = spawn(command, {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  proc.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  proc.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, proc);
  return { proc, baseUrl, logs };
}

function stopServer(server) {
  if (!server?.proc || server.proc.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.proc.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  server.proc.kill("SIGINT");
}

const savePayload = {
  highscore: 0,
  today_best: 0,
  today_date: "",
  year_best: 0,
  year_date: "",
  player_name: "QA",
  fish_coins: 999999,
  unlocked_themes: ["Indigo Night"],
  active_theme: "Indigo Night",
  purchased_skins: [],
  skin_assignments: {},
  purchased_sounds: [],
  active_sound_set: "Default",
  sfx_enabled: false,
  music_enabled: false,
};

async function setupPage(browser, baseUrl, options = {}) {
  const page = await browser.newPage();
  const errors = [];
  const consoleWarnings = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setCacheEnabled(false);
  await page.setViewport({
    width: options.width || 420,
    height: options.height || 820,
    deviceScaleFactor: options.deviceScaleFactor || 1,
  });
  const initialSave = Object.hasOwn(options, "saveData") ? options.saveData : savePayload;
  const initialSession = Object.hasOwn(options, "sessionRaw") ? options.sessionRaw : null;
  await page.evaluateOnNewDocument(({ saveData, sessionRaw }) => {
    if (saveData === null) localStorage.removeItem("cat_drop_save_data");
    else localStorage.setItem("cat_drop_save_data", JSON.stringify(saveData));
    if (sessionRaw === null) localStorage.removeItem("cat_drop_session_data");
    else localStorage.setItem("cat_drop_session_data", sessionRaw);
  }, { saveData: initialSave, sessionRaw: initialSession });

  await page.goto(`${baseUrl}/?qa=${options.tag || "boot"}-${Date.now()}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__DEBUG_GAME__?.engine?.(), { timeout: 15000 });
  await page.waitForFunction(() => typeof document.querySelector("#main-menu-btn")?.onclick === "function", { timeout: 15000 });

  return { page, errors, consoleWarnings };
}

async function canvasLooksPainted(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#game-canvas");
    const ctx = canvas.getContext("2d");
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparent = 0;
    let colorVariance = 0;

    for (let i = 0; i < sample.length; i += 4 * 4000) {
      const r = sample[i];
      const g = sample[i + 1];
      const b = sample[i + 2];
      const a = sample[i + 3];
      if (a > 0) nonTransparent += 1;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 2) colorVariance += 1;
    }

    return {
      width: canvas.width,
      height: canvas.height,
      nonTransparent,
      colorVariance,
    };
  });
}

async function runBootMatrix(browser, baseUrl) {
  log("\n== Browser boot matrix ==");
  const viewports = [
    [420, 820],
    [360, 740],
    [320, 680],
    [768, 1024],
  ];

  for (const [width, height] of viewports) {
    const { page, errors } = await setupPage(browser, baseUrl, { width, height, tag: `boot-${width}x${height}` });
    const state = await page.evaluate(() => ({
      stateScript: [...document.scripts].find((script) => script.src.includes("js/state.js"))?.getAttribute("src"),
      audioScript: [...document.scripts].find((script) => script.src.includes("js/audio.js"))?.getAttribute("src"),
      playGamesScript: [...document.scripts].find((script) => script.src.includes("js/play_games.js"))?.getAttribute("src"),
      gameScript: [...document.scripts].find((script) => script.src.includes("js/game.js"))?.getAttribute("src"),
      spriteScript: [...document.scripts].find((script) => script.src.includes("js/sprite.js"))?.getAttribute("src"),
      stylesheet: document.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
      modalCount: document.querySelectorAll(".modal-overlay.active").length,
      debugReady: Boolean(window.__DEBUG_GAME__?.engine?.()),
    }));
    const paint = await canvasLooksPainted(page);
    await page.close();

    const problems = [];
    if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
    if (!state.debugReady) problems.push("debug API not ready");
    if (state.modalCount !== 0) problems.push(`unexpected active modal count ${state.modalCount}`);
    if (!state.stateScript?.includes("v=7")) problems.push(`unexpected state script ${state.stateScript}`);
    if (!state.audioScript?.includes("v=11")) problems.push(`unexpected audio script ${state.audioScript}`);
    if (!state.playGamesScript?.includes("v=4")) problems.push(`unexpected Play Games script ${state.playGamesScript}`);
    if (!state.gameScript?.includes("v=95")) problems.push(`unexpected game script ${state.gameScript}`);
    if (!state.spriteScript?.includes("v=19")) problems.push(`unexpected sprite script ${state.spriteScript}`);
    if (!state.stylesheet?.includes("v=48")) problems.push(`unexpected stylesheet ${state.stylesheet}`);
    if (paint.nonTransparent < 10 || paint.colorVariance < 2) problems.push(`canvas looks blank: ${JSON.stringify(paint)}`);

    if (problems.length) fail(`browser boot ${width}x${height}`, { problems, state, paint });
    else pass(`browser boot ${width}x${height}`, { state, paint });
  }
}

async function runMenuFlow(browser, baseUrl) {
  log("\n== Menu flow ==");
  const { page, errors } = await setupPage(browser, baseUrl, { width: 420, height: 820, tag: "menu" });
  await page.click("#main-menu-btn");
  await page.waitForSelector("#settings-menu.active", { timeout: 5000 });
  await delay(250);

  const openState = await page.evaluate(() => {
    const menu = document.querySelector("#settings-menu");
    const rect = menu.getBoundingClientRect();
    const items = [...document.querySelectorAll(".menu-item-btn")];
    return {
      ariaExpanded: document.querySelector("#main-menu-btn").getAttribute("aria-expanded"),
      ariaHidden: menu.getAttribute("aria-hidden"),
      inert: menu.inert,
      hiddenModalA11y: [...document.querySelectorAll(".modal-overlay:not(.active)")].every(modal => modal.inert && modal.getAttribute("aria-hidden") === "true"),
      menuRect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      },
      buttonCount: items.length,
      enabledCount: items.filter((item) => !item.disabled).length,
      disabledCount: items.filter((item) => item.disabled).length,
      hasSoundButtons: items.some((item) => /SFX|Music|Sound/i.test(item.textContent)),
      overflow: items
        .filter((item) => item.scrollWidth > item.clientWidth || item.scrollHeight > item.clientHeight)
        .map((item) => item.textContent.trim()),
    };
  });

  await page.keyboard.press("Escape");
  await delay(150);
  const closedByEsc = await page.$eval("#settings-menu", (menu) => ({
    closed: !menu.classList.contains("active"),
    ariaHidden: menu.getAttribute("aria-hidden"),
    inert: menu.inert,
  }));

  await page.click("#main-menu-btn");
  await page.waitForSelector("#settings-menu.active", { timeout: 5000 });
  await delay(250);
  await page.click("#shop-btn");
  await page.waitForFunction(() => document.querySelector("#shop-overlay")?.classList.contains("active"), { timeout: 5000 }).catch(() => {});
  const shopOpened = await page.$eval("#shop-overlay", (modal) => modal.classList.contains("active"));

  await page.close();

  const problems = [];
  if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
  if (openState.ariaExpanded !== "true") problems.push("menu aria-expanded did not switch to true");
  if (openState.ariaHidden !== "false" || openState.inert) problems.push("open menu accessibility state is incorrect");
  if (!openState.hiddenModalA11y) problems.push("hidden modals remain exposed to accessibility tools");
  if (openState.buttonCount !== 9) problems.push(`expected 9 menu buttons, got ${openState.buttonCount}`);
  if (openState.enabledCount !== 6 || openState.disabledCount !== 3) problems.push("unexpected enabled/disabled menu button count");
  if (openState.hasSoundButtons) problems.push("sound buttons leaked into menu");
  if (openState.overflow.length) problems.push(`menu text overflow: ${openState.overflow.join(", ")}`);
  if (!closedByEsc.closed) problems.push("Escape did not close menu");
  if (closedByEsc.ariaHidden !== "true" || !closedByEsc.inert) problems.push("closed menu accessibility state is incorrect");
  if (!shopOpened) problems.push("Shop button did not open shop modal");

  if (problems.length) fail("menu flow", { problems, openState });
  else pass("menu flow", openState);
}

async function runPlayGamesContract() {
  log("\n== Google Play Games contract ==");
  const calls = { signIn: [], submitScore: [], showLeaderboard: [] };
  const window = {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        PlayGames: {
          signIn: async (options) => {
            calls.signIn.push(options);
            return { signedIn: options?.silent !== true };
          },
          submitScore: async (options) => { calls.submitScore.push(options); },
          showLeaderboard: async (options) => { calls.showLeaderboard.push(options); },
        },
        App: { addListener: () => undefined, exitApp: () => undefined },
      },
    },
  };
  const context = vm.createContext({
    window,
    console,
    confirm: () => false,
    CustomEvent: class {},
    document: { querySelectorAll: () => [], querySelector: () => null },
  });
  vm.runInContext(fs.readFileSync(path.join(WWW, "js", "play_games.js"), "utf8"), context);

  await window.PlayGames.init();
  await window.PlayGames.submitScore("qa-board", 100);
  const shown = await window.PlayGames.showLeaderboard("qa-board");
  await window.PlayGames.submitScore("qa-board", 200);

  const problems = [];
  if (calls.signIn.length !== 2 || calls.signIn[0]?.silent !== true || calls.signIn[1]?.silent !== false) {
    problems.push(`unexpected sign-in flow: ${JSON.stringify(calls.signIn)}`);
  }
  if (!shown || calls.showLeaderboard.length !== 1) problems.push("native leaderboard was not shown after interactive sign-in");
  if (calls.submitScore.length !== 1 || calls.submitScore[0]?.score !== 200) problems.push("score submission did not honor signedIn state");

  if (problems.length) fail("Google Play Games contract", { problems, calls, shown });
  else pass("Google Play Games contract", { calls, shown });
}

async function dropCurrentCat(page) {
  const point = await page.$eval("#game-canvas", canvas => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.32 };
  });
  await page.mouse.click(point.x, point.y);
  await delay(250);
  return page.evaluate(() => window.__DEBUG_GAME__.activeCats().length);
}

async function runDataRecovery(browser, baseUrl) {
  log("\n== Save and session recovery ==");
  const problems = [];
  const cases = [];

  for (const [name, sessionRaw] of [["invalid-json", "{broken"], ["missing-schema", "{}"]]) {
    const { page, errors } = await setupPage(browser, baseUrl, { tag: `recovery-${name}`, sessionRaw });
    const before = await page.evaluate(() => ({
      resumeActive: document.querySelector("#resume-overlay").classList.contains("active"),
      sessionStored: localStorage.getItem("cat_drop_session_data") !== null,
    }));
    const catsAfterDrop = await dropCurrentCat(page);
    await page.close();
    cases.push({ name, before, catsAfterDrop, errors });
    if (errors.length) problems.push(`${name}: console errors ${errors.join(" | ")}`);
    if (before.resumeActive || before.sessionStored) problems.push(`${name}: corrupt session was not removed before boot`);
    if (catsAfterDrop !== 1) problems.push(`${name}: clean fallback game did not accept a drop`);
  }

  const validEmptySession = JSON.stringify({
    score: 12,
    fish_coins: 34,
    next_spawn: { level: 2, special: null },
    total_drops: 0,
    cats: [],
  });
  {
    const { page, errors } = await setupPage(browser, baseUrl, { tag: "recovery-valid-empty", sessionRaw: validEmptySession });
    const resumeVisible = await page.$eval("#resume-overlay", modal => modal.classList.contains("active"));
    await page.click("#resume-yes-btn");
    await delay(200);
    const afterResume = await page.evaluate(() => ({
      score: window.GameState.score,
      sessionStored: localStorage.getItem("cat_drop_session_data") !== null,
      activeModals: document.querySelectorAll(".modal-overlay.active").length,
    }));
    const catsAfterDrop = await dropCurrentCat(page);
    const afterDrop = await page.evaluate(() => ({
      sessionStored: localStorage.getItem("cat_drop_session_data") !== null,
    }));
    await page.close();
    cases.push({ name: "valid-empty", resumeVisible, catsAfterDrop, afterResume, afterDrop, errors });
    if (errors.length) problems.push(`valid-empty: console errors ${errors.join(" | ")}`);
    if (!resumeVisible || catsAfterDrop !== 1 || afterResume.score !== 12 || afterResume.sessionStored || afterResume.activeModals || !afterDrop.sessionStored) {
      problems.push(`valid-empty: valid session did not resume cleanly (${JSON.stringify({ resumeVisible, catsAfterDrop, afterResume, afterDrop })})`);
    }
  }

  {
    const malformedSave = {
      ...savePayload,
      unlocked_themes: {},
      purchased_skins: "Rapper",
      skin_assignments: [],
      purchased_sounds: { Mystic: true },
      active_sound_set: "Unknown",
      fish_coins: "not-a-number",
    };
    const { page, errors } = await setupPage(browser, baseUrl, { tag: "recovery-save-types", saveData: malformedSave });
    await page.evaluate(() => document.querySelector("#shop-btn").onclick());
    await delay(150);
    const state = await page.evaluate(() => ({
      shopActive: document.querySelector("#shop-overlay").classList.contains("active"),
      rows: document.querySelectorAll("#shop-items-list .shop-item-row").length,
      arraysValid: Array.isArray(window.GameState.unlocked_themes) && Array.isArray(window.GameState.purchased_skins) && Array.isArray(window.GameState.purchased_sounds),
      fishCoins: window.GameState.fish_coins,
    }));
    await page.close();
    cases.push({ name: "malformed-save-types", state, errors });
    if (errors.length || !state.shopActive || !state.rows || !state.arraysValid || state.fishCoins !== 0) {
      problems.push(`malformed-save-types: normalization failed (${JSON.stringify({ state, errors })})`);
    }
  }

  {
    const { page, errors } = await setupPage(browser, baseUrl, { tag: "recovery-leaderboard" });
    await page.evaluate(() => {
      localStorage.setItem("cat_drop_mock_leaderboard", "{broken");
      document.querySelector("#leaderboard-btn").onclick();
    });
    await delay(150);
    const state = await page.evaluate(() => ({
      active: document.querySelector("#leaderboard-overlay").classList.contains("active"),
      rows: document.querySelectorAll("#leaderboard-list .leaderboard-item").length,
    }));
    await page.close();
    cases.push({ name: "corrupt-leaderboard", state, errors });
    if (errors.length || !state.active || state.rows < 1) problems.push(`corrupt-leaderboard: recovery failed (${JSON.stringify({ state, errors })})`);
  }

  if (problems.length) fail("save and session recovery", { problems, cases });
  else pass("save and session recovery", { cases });
}

async function runModalPause(browser, baseUrl) {
  log("\n== Modal pause ==");
  const { page, errors } = await setupPage(browser, baseUrl, { tag: "modal-pause" });
  const inserted = await page.evaluate(() => {
    document.querySelector("#shop-btn").onclick();
    const dbg = window.__DEBUG_GAME__;
    const cat = dbg.createCat({ level: 9, special: null }, 360, 390, true);
    cat.spawnScale = 1;
    window.Matter.Body.setVelocity(cat.body, { x: 0, y: 0 });
    window.Matter.Body.setAngularVelocity(cat.body, 0);
    window.Matter.Body.setStatic(cat.body, true);
    dbg.World.add(dbg.engine().world, cat.body);
    dbg.activeCats().push(cat);
    return { radius: cat.radius, visualTop: cat.body.position.y - cat.radius };
  });
  await delay(3500);
  const whileOpen = await page.evaluate(() => ({
    shopActive: document.querySelector("#shop-overlay").classList.contains("active"),
    gameOverActive: document.querySelector("#gameover-overlay").classList.contains("active"),
  }));
  await page.click("#shop-close-btn");
  await delay(3500);
  const afterClose = await page.evaluate(() => ({
    gameOverActive: document.querySelector("#gameover-overlay").classList.contains("active"),
    activeModalIds: [...document.querySelectorAll(".modal-overlay.active")].map(modal => modal.id),
  }));
  await page.close();

  const problems = [];
  if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
  if (!whileOpen.shopActive || whileOpen.gameOverActive) problems.push(`game advanced behind modal: ${JSON.stringify(whileOpen)}`);
  if (!afterClose.gameOverActive || afterClose.activeModalIds.join() !== "gameover-overlay") {
    problems.push(`danger timer did not resume cleanly: ${JSON.stringify(afterClose)}`);
  }

  if (problems.length) fail("modal pauses simulation", { problems, inserted, whileOpen, afterClose });
  else pass("modal pauses simulation", { inserted, whileOpen, afterClose });
}

async function readDangerState(page) {
  return page.evaluate(() => {
    const vignette = document.querySelector("#danger-vignette");
    const gameOver = document.querySelector("#gameover-overlay");
    return {
      vignetteDisplay: getComputedStyle(vignette).display,
      gameOverActive: gameOver.classList.contains("active"),
    };
  });
}

async function addStaticDangerCat(page, mode) {
  return page.evaluate((catMode) => {
    const rimY = 340;
    const warningMargin = 12;
    const level = 9;
    const dbg = window.__DEBUG_GAME__;
    const engine = dbg.engine();
    const radius = (25.0 + (level - 1) * 8.5) * window.GameState.CAT_SIZE_SCALE;
    let centerY;

    if (catMode === "over") centerY = 390;
    else if (catMode === "near") centerY = rimY + radius + 6;
    else centerY = rimY + radius + warningMargin + 10;

    const cat = dbg.createCat({ level, special: null }, 360, centerY, true);
    cat.spawnScale = 1;
    window.Matter.Body.setVelocity(cat.body, { x: 0, y: 0 });
    window.Matter.Body.setAngularVelocity(cat.body, 0);
    window.Matter.Body.setStatic(cat.body, true);
    dbg.World.add(engine.world, cat.body);
    dbg.activeCats().push(cat);

    return {
      level,
      radius: cat.radius,
      centerY,
      visualTopY: centerY - cat.radius,
    };
  }, mode);
}

async function runDangerLine(browser, baseUrl) {
  log("\n== Death line ==");
  const cases = [
    { mode: "over", expectWarning: true, expectGameOver: true, waitAfterWarning: 3300 },
    { mode: "near", expectWarning: true, expectGameOver: false, waitAfterWarning: 3300 },
    { mode: "safe", expectWarning: false, expectGameOver: false, waitAfterWarning: 3300 },
  ];

  for (const testCase of cases) {
    const { page, errors } = await setupPage(browser, baseUrl, { width: 420, height: 820, tag: `danger-${testCase.mode}` });
    const cat = await addStaticDangerCat(page, testCase.mode);
    await delay(800);
    const warning = await readDangerState(page);
    await delay(testCase.waitAfterWarning);
    const afterTimer = await readDangerState(page);

    if (testCase.mode === "over") {
      fs.mkdirSync(TMP, { recursive: true });
      await page.screenshot({ path: path.join(TMP, "full-game-qa-danger-line.png"), fullPage: true });
    }

    await page.close();

    const problems = [];
    if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
    if ((warning.vignetteDisplay !== "none") !== testCase.expectWarning) {
      problems.push(`warning mismatch: got ${warning.vignetteDisplay}, expected ${testCase.expectWarning}`);
    }
    if (afterTimer.gameOverActive !== testCase.expectGameOver) {
      problems.push(`game over mismatch: got ${afterTimer.gameOverActive}, expected ${testCase.expectGameOver}`);
    }

    if (problems.length) fail(`death line ${testCase.mode}`, { problems, cat, warning, afterTimer });
    else pass(`death line ${testCase.mode}`, { cat, warning, afterTimer });
  }
}

async function measureFrames(page, durationMs = 2200) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const frames = [];
    let previous = performance.now();
    const start = previous;

    function step(now) {
      frames.push(now - previous);
      previous = now;
      if (now - start < duration) {
        requestAnimationFrame(step);
        return;
      }

      const useful = frames.slice(1);
      const sorted = useful.slice().sort((a, b) => a - b);
      const sum = useful.reduce((a, b) => a + b, 0);
      resolve({
        frames: useful.length,
        avgFps: Number((1000 / (sum / useful.length)).toFixed(1)),
        avgFrameMs: Number((sum / useful.length).toFixed(2)),
        p95FrameMs: Number((sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(2)),
        over25ms: useful.filter((v) => v > 25).length,
        over33ms: useful.filter((v) => v > 33.34).length,
        over50ms: useful.filter((v) => v > 50).length,
      });
    }

    requestAnimationFrame(step);
  }), durationMs);
}

async function addStressCats(page, count = 54) {
  return page.evaluate((catCount) => {
    const dbg = window.__DEBUG_GAME__;
    const engine = dbg.engine();
    const cats = dbg.activeCats();
    const cols = 9;
    const spacing = 56;
    const startX = 136;
    const startY = 390;

    for (let i = 0; i < catCount; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * spacing;
      const y = startY + row * spacing;
      const cat = dbg.createCat({ level: 1, special: null }, x, y, true);
      cat.spawnScale = 1;
      cat.isMerged = true;
      window.Matter.Body.setVelocity(cat.body, {
        x: (col - (cols - 1) / 2) * 0.08,
        y: 0.25 + row * 0.03,
      });
      window.Matter.Body.setAngularVelocity(cat.body, (col - (cols - 1) / 2) * 0.006);
      dbg.World.add(engine.world, cat.body);
      cats.push(cat);
    }

    return {
      inserted: catCount,
      activeCats: cats.length,
    };
  }, count);
}

async function getWorldHealth(page) {
  return page.evaluate(() => {
    const cats = window.__DEBUG_GAME__.activeCats();
    let nonFinite = 0;
    let maxSpeed = 0;
    let sleeping = 0;

    for (const cat of cats) {
      const body = cat.body;
      if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) nonFinite += 1;
      maxSpeed = Math.max(maxSpeed, Math.hypot(body.velocity.x, body.velocity.y));
      if (body.isSleeping) sleeping += 1;
    }

    return {
      activeCats: cats.length,
      nonFinite,
      maxSpeed: Number(maxSpeed.toFixed(3)),
      sleeping,
      gameOverActive: document.querySelector("#gameover-overlay").classList.contains("active"),
    };
  });
}

async function runPerformance(browser, baseUrl) {
  log("\n== Performance and stability ==");
  const { page, errors } = await setupPage(browser, baseUrl, { width: 420, height: 820, tag: "perf" });
  const baseline = await measureFrames(page, 1800);
  const stressSetup = await addStressCats(page, 54);
  await delay(600);
  const stress = await measureFrames(page, 2600);
  const health = await getWorldHealth(page);
  fs.mkdirSync(TMP, { recursive: true });
  await page.screenshot({ path: path.join(TMP, "full-game-qa-stress.png"), fullPage: true });
  await page.close();

  const problems = [];
  if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
  if (baseline.avgFps < 50) problems.push(`baseline FPS too low: ${baseline.avgFps}`);
  if (stress.avgFps < 48) problems.push(`stress FPS too low: ${stress.avgFps}`);
  if (stress.p95FrameMs > 35) problems.push(`stress p95 frame too high: ${stress.p95FrameMs}`);
  if (health.activeCats < stressSetup.inserted) problems.push(`stress load lost bodies: ${health.activeCats}/${stressSetup.inserted}`);
  if (health.nonFinite > 0) problems.push(`non-finite physics bodies: ${health.nonFinite}`);
  if (health.maxSpeed > 30) problems.push(`unexpected high body speed: ${health.maxSpeed}`);

  if (problems.length) fail("performance and stability", { problems, baseline, stress, stressSetup, health });
  else pass("performance and stability", { baseline, stress, stressSetup, health });
}

function listFiles(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function addOccurrences(bucket, file, text, regex, label, limit = 20) {
  let match;
  while ((match = regex.exec(text)) && bucket.length < limit) {
    bucket.push({
      label,
      file: path.relative(ROOT, file),
      line: lineNumber(text, match.index),
      sample: match[0].slice(0, 120),
    });
  }
}

function runStaticAudit() {
  log("\n== Static audit ==");
  const indexText = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
  const jsFiles = listFiles(path.join(WWW, "js"), (file) => file.endsWith(".js") && !file.endsWith("matter.min.js"));
  const files = [
    path.join(WWW, "index.html"),
    path.join(WWW, "style.css"),
    path.join(WWW, "sw.js"),
    ...jsFiles,
  ];

  const ids = [...indexText.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) fail("static audit duplicate DOM ids", { duplicateIds });
  else pass("static audit duplicate DOM ids");

  const idSet = new Set(ids);
  const missingIds = [];
  for (const file of jsFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/getElementById\(["'`]([^"'`]+)["'`]\)/g)) {
      if (!idSet.has(match[1])) {
        missingIds.push({
          id: match[1],
          file: path.relative(ROOT, file),
          line: lineNumber(text, match.index),
        });
      }
    }
  }
  if (missingIds.length) {
    warn("static audit missing or dynamic DOM ids", {
      count: missingIds.length,
      samples: missingIds.slice(0, 20),
    });
  } else {
    pass("static audit missing or dynamic DOM ids");
  }

  const hardFailures = [];
  const auditWarnings = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    addOccurrences(hardFailures, file, text, /\bplayClickSound\s*\(/g, "stale playClickSound call");
    addOccurrences(hardFailures, file, text, /\bdebugger\b/g, "debugger statement");
    addOccurrences(auditWarnings, file, text, /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b|Костыль|костыль/gi, "todo/fixme/hack marker");
    addOccurrences(auditWarnings, file, text, /console\.log\s*\(/g, "console.log");
    addOccurrences(auditWarnings, file, text, /setTimeout\s*\(/g, "manual timer");
    addOccurrences(auditWarnings, file, text, /(?:[\u0420\u0421][\u0402-\u040F\u0452-\u045F]|\u0432[\u0402\u0403\u201A\u201E\u2026\u2020\u2021\u2030\u2039\u040A\u040B\u040F]|\u043F\u0451|\u0440\u045F)/g, "mojibake-looking text");
  }

  if (hardFailures.length) fail("static audit hard code smells", { hardFailures });
  else pass("static audit hard code smells");

  if (auditWarnings.length) {
    warn("static audit warnings", {
      count: auditWarnings.length,
      samples: auditWarnings.slice(0, 20),
    });
  } else {
    pass("static audit warnings");
  }
}

function readWavInfo(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }

  let offset = 12;
  let fmt = null;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;

    if (id === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      dataSize = size;
    }

    offset = start + size + (size % 2);
  }

  if (!fmt || !dataSize) throw new Error("missing fmt or data chunk");
  const bytesPerFrame = fmt.channels * (fmt.bitsPerSample / 8);
  return {
    ...fmt,
    dataSize,
    duration: Number((dataSize / bytesPerFrame / fmt.sampleRate).toFixed(2)),
  };
}

function runAudioPackAudit() {
  log("\n== Premium audio assets ==");
  const gameText = fs.readFileSync(path.join(WWW, "js", "game.js"), "utf8");
  const problems = [];
  const files = [];

  for (const [packId, pack] of Object.entries(PREMIUM_SOUND_PACKS)) {
    if (!gameText.includes(`"${packId}": { name: "${pack.name}", cost: ${pack.cost}, desc: "${pack.desc}" }`)) {
      problems.push(`shop metadata mismatch for ${packId}`);
    }

    const expectedFiles = [
      { name: `bgm_${pack.fileId}.wav`, min: 10, max: 30 },
      { name: `drop_${pack.fileId}.wav`, min: 0.15, max: 0.8 },
      { name: `merge_${pack.fileId}.wav`, min: 0.3, max: 1.2 },
      { name: `game_over_${pack.fileId}.wav`, min: 0.8, max: 2.0 },
    ];

    for (const spec of expectedFiles) {
      const file = path.join(WWW, "assets", "audio", spec.name);
      if (!fs.existsSync(file)) {
        problems.push(`missing ${spec.name}`);
        continue;
      }

      try {
        const info = readWavInfo(file);
        files.push({ packId, file: spec.name, ...info });
        if (info.audioFormat !== 1) problems.push(`${spec.name} is not PCM`);
        if (info.sampleRate !== 44100) problems.push(`${spec.name} sample rate ${info.sampleRate}`);
        if (info.channels < 1 || info.channels > 2) problems.push(`${spec.name} channel count ${info.channels}`);
        if (info.bitsPerSample !== 16) problems.push(`${spec.name} bit depth ${info.bitsPerSample}`);
        if (info.duration < spec.min || info.duration > spec.max) {
          problems.push(`${spec.name} duration ${info.duration}s outside ${spec.min}-${spec.max}s`);
        }
      } catch (error) {
        problems.push(`${spec.name}: ${error.message}`);
      }
    }
  }

  if (problems.length) fail("premium audio assets", { problems, files });
  else pass("premium audio assets", { files });
}

async function runShopSoundCatalog(browser, baseUrl) {
  log("\n== Shop sound catalog ==");
  const { page, errors } = await setupPage(browser, baseUrl, { width: 420, height: 820, tag: "shop-sounds" });
  await page.click("#main-menu-btn");
  await page.waitForSelector("#settings-menu.active", { timeout: 5000 });
  await delay(250);
  await page.click("#shop-btn");
  await page.waitForFunction(() => document.querySelector("#shop-overlay")?.classList.contains("active"), { timeout: 5000 }).catch(async (error) => {
    const state = await page.evaluate(() => ({
      menuActive: document.querySelector("#settings-menu")?.classList.contains("active"),
      shopButtonText: document.querySelector("#shop-btn")?.textContent.trim(),
      shopOverlayClasses: document.querySelector("#shop-overlay")?.className,
    }));
    throw new Error(`Shop did not open: ${JSON.stringify(state)}; ${error.message}`);
  });
  await delay(500);
  await page.click("#tab-sounds");
  await delay(250);

  const catalog = await page.evaluate((expectedPacks) => {
    const rows = [...document.querySelectorAll("#shop-items-list .shop-item-row")].map((row) => ({
      name: row.querySelector(".shop-item-name")?.textContent.trim() || "",
      desc: row.querySelector(".shop-item-desc")?.textContent.trim() || "",
      buttonText: [...row.querySelectorAll("button")].map((button) => button.textContent.trim()).join(" | "),
      overflow: row.scrollWidth > row.clientWidth || row.scrollHeight > row.clientHeight,
    }));
    const expectedNames = new Set(Object.values(expectedPacks).map((pack) => pack.name));
    return {
      activeTab: rows.some((row) => expectedNames.has(row.name)),
      rows,
      expectedCount: Object.keys(expectedPacks).length,
    };
  }, PREMIUM_SOUND_PACKS);

  await page.close();

  const problems = [];
  if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
  if (!catalog.activeTab) problems.push("Sounds tab did not become active");
  if (catalog.rows.length !== catalog.expectedCount + 1) {
    problems.push(`expected ${catalog.expectedCount + 1} sound rows, got ${catalog.rows.length}`);
  }
  for (const pack of Object.values(PREMIUM_SOUND_PACKS)) {
    const row = catalog.rows.find((item) => item.name === pack.name);
    if (!row) {
      problems.push(`missing shop row ${pack.name}`);
      continue;
    }
    if (row.desc !== pack.desc) problems.push(`description mismatch for ${pack.name}`);
    if (!row.buttonText.includes(String(pack.cost))) problems.push(`price missing for ${pack.name}`);
    if (row.overflow) problems.push(`text overflow in ${pack.name}`);
  }

  if (problems.length) fail("shop sound catalog", { problems, catalog });
  else pass("shop sound catalog", catalog);
}

async function runNarrowShop(browser, baseUrl) {
  log("\n== Narrow shop layout ==");
  const problems = [];
  const measurements = [];

  for (const width of [320, 360]) {
    const { page, errors } = await setupPage(browser, baseUrl, { width, height: width === 320 ? 680 : 740, tag: `shop-narrow-${width}` });
    await page.evaluate(() => {
      document.querySelector("#shop-btn").onclick();
      document.querySelector("#tab-sounds").onclick();
    });
    await delay(200);
    const layout = await page.evaluate(() => {
      const scroll = document.querySelector("#shop-items-scroll");
      const scrollRect = scroll.getBoundingClientRect();
      const rows = [...document.querySelectorAll("#shop-items-list .shop-item-row")].map(row => {
        const rowRect = row.getBoundingClientRect();
        const actions = row.querySelector(".shop-item-actions");
        const actionRect = actions.getBoundingClientRect();
        const buttons = [...actions.querySelectorAll("button")].map(button => {
          const rect = button.getBoundingClientRect();
          return { text: button.textContent.trim(), left: rect.left, right: rect.right, height: rect.height };
        });
        return {
          name: row.querySelector(".shop-item-name")?.textContent.trim(),
          scrollWidth: row.scrollWidth,
          clientWidth: row.clientWidth,
          left: rowRect.left,
          right: rowRect.right,
          actionLeft: actionRect.left,
          actionRight: actionRect.right,
          buttons,
        };
      });
      return {
        viewport: { left: scrollRect.left, right: scrollRect.right, clientWidth: scroll.clientWidth, scrollWidth: scroll.scrollWidth },
        documentOverflow: document.documentElement.scrollWidth > innerWidth,
        rows,
      };
    });
    await page.close();
    measurements.push({ width, layout, errors });

    if (errors.length) problems.push(`${width}px console errors: ${errors.join(" | ")}`);
    if (layout.documentOverflow || layout.viewport.scrollWidth > layout.viewport.clientWidth + 1) problems.push(`${width}px shop viewport overflows`);
    for (const row of layout.rows) {
      if (row.scrollWidth > row.clientWidth + 1) problems.push(`${width}px row overflow: ${row.name}`);
      if (row.actionLeft < layout.viewport.left - 1 || row.actionRight > layout.viewport.right + 1) problems.push(`${width}px actions clipped: ${row.name}`);
      if (row.buttons.some(button => button.left < layout.viewport.left - 1 || button.right > layout.viewport.right + 1 || button.height < 43)) {
        problems.push(`${width}px button clipped or too small: ${row.name}`);
      }
    }
  }

  if (problems.length) fail("narrow shop layout", { problems, measurements });
  else pass("narrow shop layout", { measurements });
}

async function runLazyAssetLoading(browser, baseUrl) {
  log("\n== Lazy premium assets ==");
  const { page, errors } = await setupPage(browser, baseUrl, { width: 420, height: 820, tag: "lazy-assets" });
  const initial = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname));
  await page.evaluate(() => window.GameAudio.playPreview("Mystic"));
  await page.waitForFunction(() => performance.getEntriesByType("resource").some(entry => entry.name.includes("merge_mystic.wav")), { timeout: 5000 });
  const afterPreview = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname));
  await page.close();

  const unexpectedInitial = initial.filter(resource => /(?:_(?:mystic|rapper|zombie|vampire|oldman)\.wav|\/skin_|\/cat_(?:[5-9]|10|11)\.png|dev-cat-peek)/.test(resource));
  const previewLoaded = afterPreview.some(resource => resource.endsWith("/merge_mystic.wav"));
  const previewLoadedBgm = afterPreview.some(resource => resource.endsWith("/bgm_mystic.wav"));
  const problems = [];
  if (errors.length) problems.push(`console errors: ${errors.join(" | ")}`);
  if (unexpectedInitial.length) problems.push(`premium assets loaded during boot: ${unexpectedInitial.join(", ")}`);
  if (!previewLoaded) problems.push("preview sound was not loaded on demand");
  if (previewLoadedBgm) problems.push("sound preview unnecessarily loaded premium BGM");

  if (problems.length) fail("lazy premium assets", { problems, initial, afterPreview });
  else pass("lazy premium assets", { initialCount: initial.length, afterPreviewCount: afterPreview.length });
}

function runSigningSecurityAudit() {
  log("\n== Signing security ==");
  const gradleText = fs.readFileSync(path.join(ROOT, "android", "app", "build.gradle"), "utf8");
  const ignoreText = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  const problems = [];
  if (/storePassword\s+["'][^"']+["']|keyPassword\s+["'][^"']+["']/.test(gradleText)) problems.push("plaintext signing password remains in build.gradle");
  if (fs.existsSync(path.join(ROOT, "android", "app", "release-key.keystore"))) problems.push("release keystore remains inside project");
  if (!gradleText.includes("CAT_DROP_KEYSTORE_PROPERTIES") || !gradleText.includes("releaseSigningReady")) problems.push("protected signing configuration is not enforced");
  if (!ignoreText.includes("android/app/*.keystore")) problems.push("keystore ignore rule is missing");

  if (problems.length) fail("signing security", { problems });
  else pass("signing security");
}

function writeReports() {
  fs.mkdirSync(TMP, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    status: failures.length ? "fail" : "pass",
    failures,
    warnings,
    results,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  const lines = [];
  lines.push("# Cat Drop Full QA");
  lines.push("");
  lines.push(`Status: ${report.status.toUpperCase()}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Results");
  for (const result of results) {
    lines.push(`- ${result.status.toUpperCase()}: ${result.name}`);
  }

  const performance = results.find((item) => item.name === "performance and stability")?.details;
  if (performance) {
    lines.push("");
    lines.push("## Stability Metrics");
    lines.push(`- Baseline FPS: ${performance.baseline.avgFps}, p95 frame: ${performance.baseline.p95FrameMs}ms, slow frames >25ms: ${performance.baseline.over25ms}`);
    lines.push(`- Stress FPS: ${performance.stress.avgFps}, p95 frame: ${performance.stress.p95FrameMs}ms, slow frames >25ms: ${performance.stress.over25ms}`);
    lines.push(`- Physics health: ${performance.health.activeCats} cats, non-finite bodies: ${performance.health.nonFinite}, max speed: ${performance.health.maxSpeed}, sleeping: ${performance.health.sleeping}`);
  }

  const menu = results.find((item) => item.name === "menu flow")?.details;
  if (menu?.menuRect) {
    lines.push("");
    lines.push("## Menu Metrics");
    lines.push(`- Menu size: ${menu.menuRect.width}x${menu.menuRect.height}`);
    lines.push(`- Buttons: ${menu.buttonCount} total, ${menu.enabledCount} enabled, ${menu.disabledCount} disabled`);
    lines.push(`- Sound buttons in burger menu: ${menu.hasSoundButtons ? "yes" : "no"}`);
    lines.push(`- Text overflow: ${menu.overflow.length ? menu.overflow.join(", ") : "none"}`);
  }

  const audio = results.find((item) => item.name === "premium audio assets")?.details;
  if (audio) {
    lines.push("");
    lines.push("## Audio Metrics");
    for (const item of audio.files.filter((file) => file.file.startsWith("bgm_"))) {
      lines.push(`- ${item.file}: ${item.duration}s, ${item.sampleRate}Hz, ${item.channels}ch`);
    }
  }

  const dangerLine = results.filter((item) => item.name.startsWith("death line "));
  if (dangerLine.length) {
    lines.push("");
    lines.push("## Death Line Metrics");
    for (const item of dangerLine) {
      const mode = item.name.replace("death line ", "");
      lines.push(`- ${mode}: visual top ${item.details.cat.visualTopY}, warning ${item.details.warning.vignetteDisplay}, game over ${item.details.afterTimer.gameOverActive}`);
    }
  }

  if (failures.length) {
    lines.push("");
    lines.push("## Failures");
    for (const item of failures) {
      lines.push(`- ${item.name}`);
    }
  }
  if (warnings.length) {
    lines.push("");
    lines.push("## Warnings");
    for (const item of warnings) {
      lines.push(`- ${item.name}${item.count ? ` (${item.count})` : ""}`);
      for (const sample of item.samples || []) {
        const location = sample.file && sample.line ? `${sample.file}:${sample.line}` : sample.file || "unknown";
        const label = sample.id || sample.label || "warning";
        lines.push(`  - ${label} at ${location}`);
      }
    }
  }
  fs.writeFileSync(REPORT_MD, `${lines.join("\n")}\n`);
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  runCommand("release check", "npm run check");
  runCommand("legacy qa checks", "npm run qa");
  runCommand("cup corner stability", "node scripts/cup-corner-stability-test.mjs");
  runStaticAudit();
  runAudioPackAudit();
  runSigningSecurityAudit();
  await runPlayGamesContract();

  let server;
  let browser;
  try {
    server = await startServer();
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    await runBootMatrix(browser, server.baseUrl);
    await runMenuFlow(browser, server.baseUrl);
    await runDataRecovery(browser, server.baseUrl);
    await runModalPause(browser, server.baseUrl);
    await runShopSoundCatalog(browser, server.baseUrl);
    await runNarrowShop(browser, server.baseUrl);
    await runLazyAssetLoading(browser, server.baseUrl);
    await runDangerLine(browser, server.baseUrl);
    await runPerformance(browser, server.baseUrl);
  } catch (error) {
    fail("browser qa harness", { error: error.stack || error.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
    stopServer(server);
  }

  writeReports();

  log("");
  log(`Report: ${path.relative(ROOT, REPORT_MD)}`);
  log(`JSON: ${path.relative(ROOT, REPORT_JSON)}`);

  if (failures.length) {
    log(`Full QA finished with ${failures.length} failure(s) and ${warnings.length} warning(s).`);
    process.exit(1);
  }

  log(`Full QA passed with ${warnings.length} warning(s).`);
}

await main();
