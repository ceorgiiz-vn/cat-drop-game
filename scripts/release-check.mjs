#!/usr/bin/env node
/**
 * npm run check — сторож перед сборкой.
 * Ловит то, что легко забыть: битые ссылки на ресурсы, внешние URL (ломают офлайн),
 * незаполненные версии кэша, мусор в сборке, лишние файлы.
 * Правила проекта — AGENTS.md. Ничего не меняет, только проверяет.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
let failed = false;
const warnings = [];

const fail = (m) => { console.error(`❌ ПРОБЛЕМА: ${m}`); failed = true; };
const ok   = (m) => console.log(`✅ ${m}`);
const warn = (m) => { warnings.push(m); };
const rel  = (f) => path.relative(root, f).replaceAll(path.sep, "/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    (statSync(full).isDirectory() ? walk(full, out) : out.push(full));
  }
  return out;
}
const allFiles = walk(www);
const read = (p) => readFileSync(p, "utf8");

/* ---------- 1. Синтаксис всех наших JS (список больше не хардкодим) ---------- */
const ourJs = allFiles.filter(f => f.endsWith(".js") && !/\.min\.js$/.test(f));
for (const f of ourJs) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) fail(`синтаксис ${rel(f)}\n${r.stderr || r.stdout}`);
}
if (!failed) ok(`синтаксис в порядке (${ourJs.length} файлов)`);

/* ---------- 2. Внешние URL — ломают офлайн (тут проскочил Google Fonts) ---------- */
const ALLOWED = [/ingest\.[a-z.]*sentry\.io/, /fonts\.googleapis\.com\/css/ /* только если вернут намеренно */];
const externals = [];
for (const f of allFiles.filter(f => /\.(js|css|html|json)$/.test(f) && !/\.min\.js$/.test(f))) {
  for (const m of read(f).matchAll(/https?:\/\/[^\s'"`)]+/g)) {
    const url = m[0];
    if (url.includes("ingest") && url.includes("sentry.io")) continue;   // отправка телеметрии — это API, не ресурс
    if (/schema\.org|w3\.org|github\.com|example\.com/.test(url)) continue; // ссылки в комментариях/манифесте
    externals.push(`${rel(f)}: ${url.slice(0, 80)}`);
  }
}
if (externals.length) {
  fail(`внешние URL в игре (сломают офлайн):\n   ${externals.join("\n   ")}`);
} else ok("внешних ресурсов нет — игра полностью локальная");

/* ---------- 3. Ссылки из index.html существуют ---------- */
const html = read(path.join(www, "index.html"));
for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
  const ref = m[1];
  if (/^(https?:|data:|#)/.test(ref)) continue;
  if (!existsSync(path.join(www, ref))) fail(`index.html ссылается на несуществующий файл: ${ref}`);
}
ok("ссылки из index.html на месте");

/* ---------- 4. Service Worker: версия кэша + список файлов ---------- */
const sw = read(path.join(www, "sw.js"));
if (!/cat-drop-v\d+/.test(sw)) fail("в sw.js нет версии кэша (cat-drop-vN) — обновление не долетит до игроков");
for (const m of sw.matchAll(/['"`]\.\/([^'"`]+)['"`]/g)) {
  const ref = m[1];
  if (!ref || ref.includes("${")) continue;                 // шаблоны проверим ниже
  if (!existsSync(path.join(www, ref))) fail(`sw.js кэширует несуществующий файл: ${ref}`);
}
ok("список кэша Service Worker корректен");

/* ---------- 5. Динамические ресурсы: всё, что код может запросить, существует ---------- */
const audioJs = read(path.join(www, "js/audio.js"));
const sets = [...audioJs.matchAll(/suffix:\s*"([^"]*)"\s*,\s*bgm:\s*"([^"]+)"/g)];
const expectedAudio = new Set();
for (const [, suf, bgm] of sets) {
  expectedAudio.add(bgm);
  for (const t of ["drop", "merge", "game_over"]) expectedAudio.add(`${t}${suf}.ogg`);
}
for (const f of expectedAudio) {
  if (!existsSync(path.join(www, "assets/audio", f))) fail(`код просит звук, которого нет: ${f}`);
}
const stateJs = read(path.join(www, "js/state.js"));
const extMatch = stateJs.match(/cat_\$\{level\}\.(\w+)/);
const spriteExt = extMatch ? extMatch[1] : "webp";
for (let lvl = 1; lvl <= 11; lvl++) {
  if (!existsSync(path.join(www, `assets/sprites/cat_${lvl}.${spriteExt}`)))
    fail(`нет спрайта кота ${lvl} (.${spriteExt})`);
}
for (const skin of ["rapper", "zombie", "vampire", "bard", "oldman"]) {
  if (!existsSync(path.join(www, `assets/sprites/skin_${skin}.${spriteExt}`)))
    fail(`нет спрайта скина: ${skin}`);
}
ok(`динамические ресурсы на месте (${expectedAudio.size} звуков, 11 котов, 5 скинов)`);

/* ---------- 6. Лишние файлы (мёртвый вес) ---------- */
const usedAudio = new Set([...expectedAudio].map(f => path.join(www, "assets/audio", f)));
const unusedAudio = allFiles.filter(f => f.includes(`${path.sep}audio${path.sep}`) && !usedAudio.has(f));
if (unusedAudio.length) warn(`аудио не используется кодом: ${unusedAudio.map(f => path.basename(f)).join(", ")}`);
const leftovers = allFiles.filter(f => /\.(wav|psd|xcf|bak)$/i.test(f));
if (leftovers.length) warn(`исходники/остатки в сборке: ${leftovers.map(rel).join(", ")}`);

/* ---------- 7. Мусор и вес ---------- */
const junk = allFiles.filter(f => /\.(py|pyc|jpg)$/i.test(path.basename(f)) || path.basename(f).includes("preview_qa"));
if (junk.length) fail(`в сборку попал мусор:\n   ${junk.map(rel).join("\n   ")}`);
else ok("мусора в сборке нет");

const totalMb = allFiles.reduce((s, f) => s + statSync(f).size, 0) / 1048576;
const BUDGET_MB = 12;
if (totalMb > BUDGET_MB) warn(`вес www ${totalMb.toFixed(1)} МБ — больше бюджета ${BUDGET_MB} МБ`);
ok(`вес www: ${totalMb.toFixed(1)} МБ (бюджет ${BUDGET_MB} МБ)`);

/* ---------- 8. Отладочные логи в нашем коде ---------- */
const logs = ourJs.filter(f => /console\.log\(/.test(read(f))).map(rel);
if (logs.length) warn(`console.log остался в: ${logs.join(", ")}`);

/* ---------- 9. Версия приложения ---------- */
const gradle = readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const vc = gradle.match(/versionCode\s+(\d+)/);
const vn = gradle.match(/versionName\s+"([^"]+)"/);
if (!vc) fail("не найден versionCode в build.gradle");
else ok(`версия для загрузки: versionCode ${vc[1]} / ${vn ? vn[1] : "?"} — убедись, что она БОЛЬШЕ уже загруженной`);

/* ---------- Итог ---------- */
if (warnings.length) {
  console.log("\n⚠️  Предупреждения (не блокируют сборку):");
  warnings.forEach(w => console.log(`   • ${w}`));
}
console.log(failed ? "\n❌ Проверка НЕ пройдена — чинить перед сборкой." : "\n✅ Проверка пройдена — можно собирать.");
process.exit(failed ? 1 : 0);
