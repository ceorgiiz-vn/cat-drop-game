/**
 * Cat Drop — сторожа физических аномалий (Этап 2).
 *
 * ПРИНЦИП тот же: только НАБЛЮДАЕТ. Читает состояние игры через готовый
 * window.__DEBUG_GAME__ (activeCats/engine) — game.js НЕ трогаем. Отчёты шлёт
 * через window.CatDiag (Sentry). Каждый сторож с антиспамом, чтобы не заваливать Sentry.
 *
 * Пороги подобраны консервативно и будут донастроены на реальных устройствах.
 * Ловим: взрыв физики (NaN), вылет за пределы, сверхскорость, крутёж на месте,
 * утечку тел, застрявшее слияние. «Массовый разлёт» пока НЕ ловим отдельно —
 * он путается с бустером SHAKE (тряска кружки — легальное массовое движение);
 * добавим после того, как увидим реальные данные.
 */
(function () {
    'use strict';

    var GAME_W = 720, GAME_H = 1280;
    var CHECK_MS = 200; // проверяем 5 раз в секунду — дёшево и достаточно

    // Пороги (донастроим по данным с телефонов)
    var MAXSPD = (window.CatPhysics && window.CatPhysics.MAX_CAT_SPEED) || 23.8;
    var ELASTIC_SPEED = MAXSPD * 1.6;  // явно выше клампа = баг
    var SPIN_ANGVEL = 0.4;             // рад/шаг — быстрое вращение
    var SPIN_MOVE_PX = 6;              // за интервал почти не сдвинулся
    var SPIN_SECONDS = 2.0;            // крутится столько подряд
    var STUCK_MERGE_SECONDS = 3.0;     // соприкасаются, но не сливаются
    var BODY_LEAK = 90;                // ненормально много тел (утечка)
    var OOB_MARGIN = 40;               // запас за краем поля

    function num(v) { return typeof v === 'number' && isFinite(v); }
    function dbg() { return window.__DEBUG_GAME__; }
    function diag() { return window.CatDiag; }

    var spinTrack = {};   // body.id -> {x, y, spinT}
    var mergePairs = {};  // "idA_idB" -> накопленное время касания

    function check(dt) {
        var D = dbg(), CD = diag();
        if (!D || !CD || typeof D.activeCats !== 'function') return;

        var cats;
        try { cats = D.activeCats() || []; } catch (e) { return; }

        var seen = {};

        for (var i = 0; i < cats.length; i++) {
            var c = cats[i];
            if (!c || !c.body) continue;
            var b = c.body, p = b.position, v = b.velocity, id = b.id;
            seen[id] = 1;

            // W1: взрыв физики — NaN/бесконечность в позиции или скорости
            if (!num(p.x) || !num(p.y) || !num(v.x) || !num(v.y)) {
                CD.reportOncePer('nan_' + id, 15000, 'phys_nan', 'Physics NaN/Inf on cat', {
                    level: c.level, isMouse: !!c.isMouse, pos: [p.x, p.y], vel: [v.x, v.y]
                });
                continue;
            }

            var speed = Math.hypot(v.x, v.y);

            // W2: вылет за пределы поля (туннелирование сквозь стенку)
            if (p.x < -OOB_MARGIN || p.x > GAME_W + OOB_MARGIN || p.y > GAME_H + OOB_MARGIN || p.y < -120) {
                CD.reportOncePer('oob_' + id, 15000, 'phys_oob', 'Cat escaped play area', {
                    level: c.level, isMouse: !!c.isMouse,
                    pos: [Math.round(p.x), Math.round(p.y)], speed: Math.round(speed)
                });
            }

            // W3: сверхскорость — кламп скорости не сработал
            if (speed > ELASTIC_SPEED) {
                CD.reportOncePer('fast_' + id, 10000, 'phys_overspeed', 'Cat overspeed ' + Math.round(speed), {
                    level: c.level, speed: Math.round(speed), max: MAXSPD,
                    pos: [Math.round(p.x), Math.round(p.y)]
                });
            }

            // W4: крутится на месте (быстрое вращение + почти нет перемещения)
            var t = spinTrack[id] || { x: p.x, y: p.y, spinT: 0 };
            var moved = Math.hypot(p.x - t.x, p.y - t.y);
            if (c.isDropped && Math.abs(b.angularVelocity) > SPIN_ANGVEL && moved < SPIN_MOVE_PX) {
                t.spinT += dt;
                if (t.spinT >= SPIN_SECONDS) {
                    CD.reportOncePer('spin_' + id, 15000, 'phys_spin', 'Cat spinning in place', {
                        level: c.level, angVel: Number(b.angularVelocity.toFixed(3)),
                        pos: [Math.round(p.x), Math.round(p.y)], seconds: Number(t.spinT.toFixed(1))
                    });
                    t.spinT = 0;
                }
            } else {
                t.spinT = 0;
            }
            t.x = p.x; t.y = p.y;
            spinTrack[id] = t;
        }

        // W5: утечка тел — тела не удаляются после слияния
        if (cats.length > BODY_LEAK) {
            CD.reportOncePer('leak', 30000, 'phys_bodyleak', 'Too many cats: ' + cats.length, { count: cats.length });
        }

        // W6: застрявшее слияние — пара одного уровня долго касается, но не сливается
        checkStuckMerge(cats, dt);

        // чистим треки исчезнувших тел
        for (var k in spinTrack) { if (!seen[k]) delete spinTrack[k]; }
    }

    function checkStuckMerge(cats, dt) {
        var live = {};
        for (var i = 0; i < cats.length; i++) {
            var a = cats[i];
            if (!a || !a.body || a.isMouse || a.isGoldenBall || !a.isDropped || a.isMerged) continue;
            for (var j = i + 1; j < cats.length; j++) {
                var b = cats[j];
                if (!b || !b.body || b.isMouse || b.isGoldenBall || !b.isDropped || b.isMerged) continue;
                if (a.level !== b.level) continue;

                var dx = a.body.position.x - b.body.position.x;
                var dy = a.body.position.y - b.body.position.y;
                var dist = Math.hypot(dx, dy);
                if (dist < (a.radius + b.radius) * 0.95) {
                    var key = a.body.id < b.body.id ? (a.body.id + '_' + b.body.id) : (b.body.id + '_' + a.body.id);
                    var tt = (mergePairs[key] || 0) + dt;
                    mergePairs[key] = tt;
                    live[key] = 1;
                    if (tt >= STUCK_MERGE_SECONDS) {
                        diag().reportOncePer('stuckmerge_' + key, 20000, 'phys_stuckmerge',
                            'Same-level cats touching but not merging', {
                                level: a.level, seconds: Number(tt.toFixed(1)), dist: Math.round(dist)
                            });
                        mergePairs[key] = 0;
                    }
                }
            }
        }
        for (var k in mergePairs) { if (!live[k]) delete mergePairs[k]; }
    }

    // Тикаем на таймере (не в rAF) — не мешаем кадрам отрисовки.
    var last = performance.now();
    setInterval(function () {
        try {
            var now = performance.now();
            var dt = (now - last) / 1000;
            last = now;
            if (dt > 1) dt = CHECK_MS / 1000; // после фонового простоя не копим время
            check(dt);
        } catch (e) {}
    }, CHECK_MS);
})();
