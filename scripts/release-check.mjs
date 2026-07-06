import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
let failed = false;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed = true;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const jsFiles = [
  "js/telegram.js",
  "js/state.js",
  "js/sprite.js",
  "js/responsive.js",
  "js/physics.js",
  "js/game_modes.js",
  "js/audio.js",
  "js/game.js",
  "js/agario.js",
  "js/match3.js",
  "sw.js",
];

for (const file of jsFiles) {
  const full = path.join(www, file);
  const result = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
  if (result.status !== 0) fail(`${file} syntax check failed\n${result.stderr || result.stdout}`);
}
if (!failed) ok("all runtime JS files pass node --check");

const html = readFileSync(path.join(www, "index.html"), "utf8");
const htmlRefs = [...html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)]
  .map(match => match[1])
  .filter(ref => !ref.startsWith("http") && !ref.startsWith("data:") && ref !== "#");
const externalScripts = [...html.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)].map(match => match[1]);

if (externalScripts.length) {
  fail(`index.html contains external blocking scripts:\n${externalScripts.join("\n")}`);
}

for (const ref of htmlRefs) {
  if (!existsSync(path.join(www, ref))) fail(`index.html references missing file: ${ref}`);
}
ok("index.html local references exist");

const sw = readFileSync(path.join(www, "sw.js"), "utf8");
if (!/cat-drop-v\d+/.test(sw)) fail("sw.js CACHE_NAME must include a numeric release version");
for (const match of sw.matchAll(/['"]\.\/([^'"]+)['"]/g)) {
  const ref = match[1];
  if (ref === "") continue;
  if (!existsSync(path.join(www, ref))) fail(`sw.js cache list references missing file: ${ref}`);
}
for (const match of sw.matchAll(/'([^']+\.wav)'/g)) {
  const ref = path.join("assets", "audio", match[1]);
  if (!existsSync(path.join(www, ref))) fail(`sw.js AUDIO_FILES references missing file: ${ref}`);
}
ok("service worker cache list is valid");

const forbidden = walk(www).filter(file => {
  const name = path.basename(file).toLowerCase();
  return name.endsWith(".py") || name.endsWith(".pyc") || name.endsWith(".jpg") || name.includes("preview_qa");
});
if (forbidden.length) {
  fail(`release payload contains dev/source artifacts:\n${forbidden.map(rel).join("\n")}`);
} else {
  ok("release payload has no dev/source artifacts");
}

process.exit(failed ? 1 : 0);
