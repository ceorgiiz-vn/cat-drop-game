/**
 * Cat Drop — Diagnostics «чёрный ящик».
 *
 * ПРИНЦИП: этот файл только НАБЛЮДАЕТ. Он не меняет игровую логику, физику
 * или механику. Всё обёрнуто в try/catch — сбой диагностики не должен ронять игру.
 *
 * Этап 1: паспорт устройства + Sentry (падения кода) + запись времени кадров
 * (кольцевой буфер) + детектор долгого кадра (ловля рывков/зависаний) +
 * наблюдатель долгих задач/GC + скрытый счётчик FPS для отладки на устройстве.
 *
 * Скрытый счётчик включается тройным тапом в левом верхнем углу экрана (70×70 px).
 */
(function () {
    'use strict';

    // Версию бампаем при каждой новой сборке — так Sentry группирует отчёты по билду.
    var BUILD = 'cat-drop@sw123-diag2';
    var SENTRY_DSN = 'https://23bffdf39a49a470777b7a8631573dd8@o4511750724976640.ingest.de.sentry.io/4511750742343760';

    // Пороги
    var FREEZE_MS = 120;          // кадр дольше этого = рывок/зависание
    var LONGTASK_MS = 200;        // «долгая задача» интереснее этого
    var RING_SECONDS = 12;        // сколько секунд контекста держим в буфере
    var REPORT_COOLDOWN_MS = 8000;// не чаще одного отчёта раз в 8 с (антиспам)

    // ---------- Паспорт устройства ----------
    function collectDevice() {
        var d = {};
        try {
            d.ua = navigator.userAgent;
            d.platform = navigator.platform;
            d.lang = navigator.language;
            d.dpr = window.devicePixelRatio || 1;
            d.screen_w = (window.screen && screen.width) || null;
            d.screen_h = (window.screen && screen.height) || null;
            d.inner_w = window.innerWidth;
            d.inner_h = window.innerHeight;
            if (window.visualViewport) {
                d.vv_w = Math.round(window.visualViewport.width);
                d.vv_h = Math.round(window.visualViewport.height);
            }
            d.cores = navigator.hardwareConcurrency || null;
            d.mem_gb = navigator.deviceMemory || null;
            d.capacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
            var mChrome = /Chrome\/(\d+[\d.]*)/.exec(navigator.userAgent);
            d.chrome = mChrome ? mChrome[1] : null;              // версия движка WebView/Chrome
            d.webview = /; wv[;)]/.test(navigator.userAgent);    // "wv" помечает Android WebView
            var mAndroid = /Android (\d+(?:\.\d+)*)/.exec(navigator.userAgent);
            d.android = mAndroid ? mAndroid[1] : null;
        } catch (e) {}
        return d;
    }

    // ---------- Оценка частоты экрана (60/90/120/144 Гц) ----------
    function estimateHz(cb) {
        try {
            var times = [], start = performance.now();
            function tick(t) {
                times.push(t);
                if (t - start < 300 && times.length < 40) {
                    requestAnimationFrame(tick);
                } else {
                    var diffs = [];
                    for (var i = 1; i < times.length; i++) diffs.push(times[i] - times[i - 1]);
                    diffs.sort(function (a, b) { return a - b; });
                    var med = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 16.7;
                    cb(med > 0 ? Math.round(1000 / med) : 60);
                }
            }
            requestAnimationFrame(tick);
        } catch (e) { cb(60); }
    }

    // ---------- Sentry ----------
    var sentryReady = false;
    function initSentry(device) {
        try {
            if (!window.Sentry || !window.Sentry.init) return;
            window.Sentry.init({
                dsn: SENTRY_DSN,
                release: BUILD,
                environment: 'closed-testing',
                sampleRate: 1.0            // без tracing/replay — не грузим и не тормозим игру
            });
            window.Sentry.setContext('device_passport', device);
            window.Sentry.setTag('dpr', String(device.dpr));
            window.Sentry.setTag('webview', String(device.webview));
            window.Sentry.setTag('android', device.android || 'n/a');
            window.Sentry.setTag('native', String(device.capacitor));
            sentryReady = true;
        } catch (e) {}
    }

    function report(kind, message, extra) {
        try {
            if (!sentryReady || !window.Sentry || !window.Sentry.withScope) return;
            window.Sentry.withScope(function (scope) {
                scope.setLevel('warning');
                scope.setTag('diag_kind', kind);
                if (extra) scope.setContext('diag_' + kind, extra);
                window.Sentry.captureMessage(message);
            });
        } catch (e) {}
    }

    // Антиспам по ключу: один и тот же сигнал шлём не чаще раза в cooldownMs.
    var reportCooldowns = {};
    function reportOncePer(key, cooldownMs, kind, message, extra) {
        try {
            var now = performance.now();
            if (reportCooldowns[key] && (now - reportCooldowns[key]) < cooldownMs) return false;
            reportCooldowns[key] = now;
            report(kind, message, extra);
            return true;
        } catch (e) { return false; }
    }

    // ---------- Запись кадров (кольцевой буфер) ----------
    var ring = [];
    var ringMax = Math.round(RING_SECONDS * 75); // запас на 120+ Гц
    var lastFrame = performance.now();
    var lastReport = 0;
    var fps = 0, frameCount = 0, fpsWindowStart = performance.now();
    var maxFrame10s = 0, maxWindowStart = performance.now();
    var longTasks = 0;

    function recordFrame(now) {
        var dt = now - lastFrame;
        lastFrame = now;

        ring.push(Math.round(dt));
        if (ring.length > ringMax) ring.shift();

        frameCount++;
        if (now - fpsWindowStart >= 1000) {
            fps = Math.round(frameCount * 1000 / (now - fpsWindowStart));
            frameCount = 0;
            fpsWindowStart = now;
        }

        if (dt > maxFrame10s) maxFrame10s = dt;
        if (now - maxWindowStart >= 10000) { maxFrame10s = dt; maxWindowStart = now; }

        // Детектор рывка/зависания
        if (dt >= FREEZE_MS && (now - lastReport) > REPORT_COOLDOWN_MS) {
            lastReport = now;
            report('freeze', 'Long frame ' + Math.round(dt) + 'ms', {
                frame_ms: Math.round(dt),
                fps: fps,
                recent_frames_ms: ring.slice(-90), // ~последние секунды контекста
                long_tasks_total: longTasks,
                modal_open: !!document.querySelector('.modal-overlay.active')
            });
            flashOverlay();
        }

        updateOverlay(dt);
        requestAnimationFrame(recordFrame);
    }

    // ---------- Наблюдатель долгих задач / пауз GC ----------
    function initLongTasks() {
        try {
            if (typeof PerformanceObserver === 'undefined') return;
            var obs = new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (entry) {
                    longTasks++;
                    if (entry.duration >= LONGTASK_MS && (performance.now() - lastReport) > REPORT_COOLDOWN_MS) {
                        lastReport = performance.now();
                        report('longtask', 'Long task ' + Math.round(entry.duration) + 'ms', {
                            duration_ms: Math.round(entry.duration),
                            name: entry.name || 'unknown'
                        });
                    }
                });
            });
            obs.observe({ entryTypes: ['longtask'] });
        } catch (e) {}
    }

    // ---------- Скрытый счётчик (по умолчанию выключен) ----------
    var overlay = null, overlayOn = false;
    function buildOverlay() {
        try {
            overlay = document.createElement('div');
            overlay.id = 'diag-overlay';
            overlay.style.cssText =
                'position:fixed;top:4px;left:4px;z-index:99999;' +
                'font:11px/1.35 monospace;color:#0f0;background:rgba(0,0,0,.6);' +
                'padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre;display:none;';
            (document.body || document.documentElement).appendChild(overlay);
        } catch (e) {}
    }
    function updateOverlay(dt) {
        if (!overlayOn || !overlay) return;
        overlay.textContent =
            'FPS ' + fps + '\n' +
            'frame ' + Math.round(dt) + 'ms\n' +
            'max10s ' + Math.round(maxFrame10s) + 'ms\n' +
            'longtasks ' + longTasks;
    }
    function flashOverlay() {
        if (!overlay || !overlayOn) return;
        overlay.style.background = 'rgba(180,0,0,.8)';
        setTimeout(function () { if (overlay) overlay.style.background = 'rgba(0,0,0,.6)'; }, 400);
    }

    // Тройной тап в левом верхнем углу 70×70 за 1.2 с — переключить счётчик.
    var taps = [];
    function onTap(x, y) {
        if (x > 70 || y > 70) { taps = []; return; }
        var t = Date.now();
        taps.push(t);
        taps = taps.filter(function (v) { return t - v < 1200; });
        if (taps.length >= 3) {
            taps = [];
            overlayOn = !overlayOn;
            if (overlay) overlay.style.display = overlayOn ? 'block' : 'none';
        }
    }

    // ---------- Запуск ----------
    var device = collectDevice();
    initSentry(device);   // сразу, чтобы ловить и ранние ошибки
    initLongTasks();
    requestAnimationFrame(recordFrame);
    estimateHz(function (hz) {
        device.refresh_hz = hz;
        try { if (sentryReady) window.Sentry.setTag('refresh_hz', String(hz)); } catch (e) {}
    });

    // Публичный мини-API для других диагностических модулей (сторожа физики, ручной отчёт).
    window.CatDiag = {
        report: report,
        reportOncePer: reportOncePer,
        device: device,
        recentFrames: function () { return ring.slice(-90); }
    };

    function onReady() {
        buildOverlay();
        // Слушатели ввода пассивные и НЕ мешают игре: только читаем координаты.
        try {
            document.addEventListener('touchstart', function (e) {
                var tt = e.touches && e.touches[0];
                if (tt) onTap(tt.clientX, tt.clientY);
            }, { passive: true });
            document.addEventListener('click', function (e) { onTap(e.clientX, e.clientY); }, true);
        } catch (e) {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();
