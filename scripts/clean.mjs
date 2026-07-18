#!/usr/bin/env node
/**
 * npm run clean — убирает мусор сборки, чтобы папка оставалась чистой.
 * Безопасно: трогает только пересоздаваемые сборки и кэш, не исходники.
 */
import { readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let freed = 0;

function sizeOf(p) {
  try {
    const s = statSync(p);
    if (s.isFile()) return s.size;
    let total = 0;
    for (const f of readdirSync(p)) total += sizeOf(join(p, f));
    return total;
  } catch { return 0; }
}

function remove(p, label) {
  const full = join(root, p);
  if (!existsSync(full)) return;
  const sz = sizeOf(full);
  rmSync(full, { recursive: true, force: true });
  freed += sz;
  console.log(`  удалено: ${label} (${(sz / 1048576).toFixed(1)} МБ)`);
}

console.log('Очистка Cat Drop…');

// 1. Старые сборки в корне (*.apk / *.aab / *.zip)
for (const f of readdirSync(root)) {
  if (/\.(apk|aab)$/i.test(f) || /^_.*\.zip$/i.test(f)) remove(f, f);
}

// 2. Кэш и выходные папки сборки Android (пересоздаются)
remove('android/app/build', 'кэш android/app/build');
remove('android/build', 'кэш android/build');
remove('android/.gradle', 'кэш android/.gradle');

// 3. Временные папки
remove('tmp', 'tmp');
remove('_apk_old', '_apk_old');

console.log(`Готово. Освобождено ~${(freed / 1048576).toFixed(0)} МБ.`);
