// Web Audio engine — seamless BGM loops and clean one-shot SFX

const GameAudio = (function() {
    const ENABLE_BGM = true;
    const MUSIC_GAIN = 0.20;
    const scheduleAudioTask = globalThis.setTimeout.bind(globalThis);

    const SETS = {
        Default: { suffix: "", bgm: "bgm.ogg" },
        Mystic:  { suffix: "_mystic",  bgm: "bgm_mystic.ogg" },
        Rapper:  { suffix: "_rapper",  bgm: "bgm_rapper.ogg" },
        Zombie:  { suffix: "_zombie",  bgm: "bgm_zombie.ogg" },
        Vampire: { suffix: "_vampire", bgm: "bgm_vampire.ogg" },
        Oldman:  { suffix: "_oldman",  bgm: "bgm_oldman.ogg" },
        // Новые чиптюн-треки (BGM), SFX — стандартные (suffix "")
        ChipCozy:  { suffix: "", bgm: "bgm_chip_cozy.ogg" },
        ChipSunny: { suffix: "", bgm: "bgm_chip_sunny.ogg" },
        ChipMoon:  { suffix: "", bgm: "bgm_chip_moon.ogg" },
        ChipCozyCalm:  { suffix: "", bgm: "bgm_chip_cozy_calm.ogg" },
        ChipSunnyCalm: { suffix: "", bgm: "bgm_chip_sunny_calm.ogg" },
        ChipMoonCalm:  { suffix: "", bgm: "bgm_chip_moon_calm.ogg" }
    };

    let ctx = null;
    let musicBus = null;
    let sfxBus = null;
    let buffers = {};
    const loadingBuffers = new Map();
    let currentSet = "Default";
    let bgmSource = null;
    let wantBGM = false; // BUG-музыка: помним намерение играть и стартуем, как только буфер готов
    let musicEnabled = true;
    let sfxEnabled = true;
    let ready = false;
    let lastDropAt = 0;
    let lastMergeAt = 0;
    let devEggBuffer = null;
    let devEggPromise = null;

    function ensureContext() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();

            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -20;
            compressor.knee.value = 12;
            compressor.ratio.value = 6;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.12;
            compressor.connect(ctx.destination);

            musicBus = ctx.createGain();
            sfxBus = ctx.createGain();
            musicBus.gain.value = MUSIC_GAIN;
            sfxBus.gain.value = 0.42;
            musicBus.connect(compressor);
            sfxBus.connect(compressor);
        }
        return Promise.resolve();
    }

    function sfxFile(type, suffix) {
        if (type === "game_over") return `game_over${suffix}.ogg`;
        return `${type}${suffix}.ogg`;
    }

    function bufferKey(setName, type) {
        return `${setName}:${type}`;
    }

    async function loadBuffer(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Audio fetch failed: ${url}`);
        const data = await res.arrayBuffer();
        return ctx.decodeAudioData(data);
    }

    function ensureBuffer(setName, type) {
        if (!SETS[setName]) setName = "Default";
        const key = bufferKey(setName, type);
        if (buffers[key]) return Promise.resolve(buffers[key]);
        if (loadingBuffers.has(key)) return loadingBuffers.get(key);

        const cfg = SETS[setName];
        const file = type === "bgm" ? cfg.bgm : sfxFile(type, cfg.suffix);
        const url = `assets/audio/${file}`;
        const promise = loadBuffer(url)
            .then(buffer => {
                buffers[key] = buffer;
                // Как только догрузился нужный BGM — пробуем стартовать (если музыку уже хотели)
                if (type === "bgm") maybeStartBGM();
                return buffer;
            })
            .catch(error => {
                console.warn("Missing audio:", url, error);
                return null;
            })
            .finally(() => loadingBuffers.delete(key));
        loadingBuffers.set(key, promise);
        return promise;
    }

    function ensureSoundSet(setName, includeBgm = true) {
        const types = ["drop", "merge", "game_over"];
        if (ENABLE_BGM && includeBgm) types.push("bgm");
        return Promise.all(types.map(type => ensureBuffer(setName, type)));
    }

    async function preload(setName, callback) {
        const activeSet = SETS[setName] ? setName : "Default";
        try {
            await ensureContext();
            // На старте ждём ТОЛЬКО короткие эффекты — они лёгкие.
            // Музыку (самый тяжёлый декод) грузим ниже, уже после запуска игры,
            // чтобы не отнимать процессор у первых кадров.
            const tasks = [ensureSoundSet("Default", false)];
            if (activeSet !== "Default") tasks.push(ensureSoundSet(activeSet, false));
            await Promise.all(tasks);
        } catch (err) {
            console.error("Audio preload error:", err);
        } finally {
            ready = true;
            if (callback) callback();
            // Отложенная догрузка музыки: ensureBuffer сам вызовет maybeStartBGM,
            // когда буфер будет готов (если музыку уже хотели включить).
            if (ENABLE_BGM) {
                scheduleAudioTask(() => { ensureBuffer(activeSet, "bgm"); }, 1200);
            }
        }
    }

    function stopBGM(fadeMs = 0) {
        if (!bgmSource || !ctx) return;
        const src = bgmSource;
        bgmSource = null;

        if (fadeMs <= 0) {
            try { src.stop(0); } catch (_) {}
            src.disconnect();
            return;
        }

        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        musicBus.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
        try { src.stop(t + fadeMs / 1000 + 0.05); } catch (_) {}
        scheduleAudioTask(() => {
            try { src.disconnect(); } catch (_) {}
            if (musicEnabled) musicBus.gain.value = MUSIC_GAIN;
        }, fadeMs + 60);
    }

    function startBGM(setName) {
        if (!ENABLE_BGM || !ctx || !musicEnabled) return;

        const key = bufferKey(setName, "bgm");
        const buf = buffers[key] || buffers[bufferKey("Default", "bgm")];
        if (!buf) return;

        stopBGM(0);

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(musicBus);
        src.start(0);
        bgmSource = src;
    }

    // Стартует BGM, когда сложились ВСЕ условия: музыку хотят, движок готов,
    // контекст разблокирован и нужный буфер уже загружен. Вызывается и после
    // разблокировки звука, и после догрузки буфера — что наступит позже.
    function maybeStartBGM() {
        if (!ENABLE_BGM || !ctx || !musicEnabled || !ready || !wantBGM) return;
        if (ctx.state === "suspended") return;
        if (bgmSource) return;
        const buf = buffers[bufferKey(currentSet, "bgm")] || buffers[bufferKey("Default", "bgm")];
        if (!buf) return;
        startBGM(currentSet);
    }

    async function resumeIfNeeded() {
        await ensureContext();
        if (ctx.state !== "suspended") return;
        try {
            await Promise.race([
                ctx.resume(),
                new Promise(resolve => scheduleAudioTask(resolve, 750))
            ]);
        } catch (_) {}
    }

    function setMusicEnabled(on) {
        musicEnabled = on;
        if (!on) stopBGM(180);
    }

    function setSfxEnabled(on) {
        sfxEnabled = on;
    }

    function loadSoundSet(setName) {
        if (!SETS[setName]) setName = "Default";
        currentSet = setName;
        const requestedSet = setName;
        return ensureContext()
            .then(() => ensureSoundSet(requestedSet))
            .then(() => {
                if (!musicEnabled || !ready || currentSet !== requestedSet) return;
                stopBGM(80);
                scheduleAudioTask(() => {
                    if (currentSet === requestedSet) startBGM(requestedSet);
                }, 90);
            });
    }

    function playOneShot(type, setName, pitch, volume) {
        if (!ctx || !sfxEnabled || !ready) return;

        const key = bufferKey(setName, type);
        const buf = buffers[key] || buffers[bufferKey("Default", type)];
        if (!buf) return;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = Math.max(0.5, Math.min(2.0, pitch || 1.0));

        const gain = ctx.createGain();
        gain.gain.value = volume || 1.0;
        src.connect(gain);
        gain.connect(sfxBus);

        src.start(0);
        src.onended = () => {
            try { src.disconnect(); gain.disconnect(); } catch (_) {}
        };
    }

    function playDrop() {
        const now = performance.now();
        if (now - lastDropAt < 70) return;
        lastDropAt = now;
        resumeIfNeeded().then(() => playOneShot("drop", currentSet, 1.0, 0.85));
    }

    function playMerge(pitch) {
        const now = performance.now();
        if (now - lastMergeAt < 70) return;
        lastMergeAt = now;
        resumeIfNeeded().then(() => playOneShot("merge", currentSet, pitch || 1.0, 0.9));
    }

    function playGameOver() {
        resumeIfNeeded().then(() => playOneShot("game_over", currentSet, 1.0, 1.0));
    }

    // Превью в магазине: играем САМУ музыку пака ~8с и ВСЕГДА слышно —
    // даже когда звук/музыка выключены в игре (идёт мимо флага mute, прямо на выход).
    let previewSource = null;
    let previewTimer = null;
    function stopPreview() {
        if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
        if (previewSource) {
            try { previewSource.stop(); } catch (_) {}
            try { previewSource.disconnect(); } catch (_) {}
            previewSource = null;
        }
        if (musicBus && musicEnabled) musicBus.gain.value = MUSIC_GAIN; // снять приглушение фоновой музыки
    }
    function playPreview(setName) {
        const previewSet = SETS[setName] ? setName : currentSet;
        resumeIfNeeded()
            .then(() => ensureBuffer(previewSet, "bgm"))
            .then(buf => {
                if (!ctx || !buf) return;
                stopPreview();
                if (musicBus) musicBus.gain.value = 0.0; // приглушаем текущую музыку, чтобы не накладывалась
                const g = ctx.createGain();
                g.gain.value = 0.32; // слышимо независимо от того, включён ли звук в игре
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.loop = false;
                src.connect(g);
                g.connect(ctx.destination); // мимо sfx/music-шины и флага mute
                const t = ctx.currentTime;
                const dur = Math.min(8, buf.duration || 8);
                g.gain.setValueAtTime(g.gain.value, t + Math.max(0.1, dur - 0.4));
                g.gain.linearRampToValueAtTime(0.0001, t + dur);
                src.start(0);
                try { src.stop(t + dur + 0.05); } catch (_) {}
                previewSource = src;
                src.onended = () => {
                    if (previewSource === src) previewSource = null;
                    try { src.disconnect(); g.disconnect(); } catch (_) {}
                    if (musicBus && musicEnabled) musicBus.gain.value = MUSIC_GAIN;
                };
                previewTimer = scheduleAudioTask(() => {
                    if (musicBus && musicEnabled) musicBus.gain.value = MUSIC_GAIN;
                }, (dur + 0.25) * 1000);
            })
            .catch(() => {});
    }

    function playGroomLick() {
        if (!sfxEnabled) return;
        resumeIfNeeded().then(() => {
            if (!devEggPromise) {
                devEggPromise = loadBuffer("assets/audio/dev_egg.ogg")
                    .then(buffer => {
                        devEggBuffer = buffer;
                        return buffer;
                    })
                    .catch(() => null);
            }
            return devEggPromise;
        }).then(() => {
            if (devEggBuffer) {
                const src = ctx.createBufferSource();
                src.buffer = devEggBuffer;
                const gain = ctx.createGain();
                gain.gain.value = 0.72;
                src.connect(gain);
                gain.connect(sfxBus);
                src.start(0);
                src.onended = () => {
                    try { src.disconnect(); gain.disconnect(); } catch (_) {}
                };
                return;
            }

            const now = ctx.currentTime;
            const honks = [
                { t: 0, f0: 780, f1: 420, dur: 0.28 },
                { t: 0.33, f0: 860, f1: 380, dur: 0.32 }
            ];
            honks.forEach(({ t, f0, f1, dur }) => {
                const start = now + t;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(f0, start);
                osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.38, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
                osc.connect(gain);
                gain.connect(sfxBus);
                osc.start(start);
                osc.stop(start + dur + 0.02);
            });
            [0.72, 0.88].forEach((t, i) => {
                const start = now + t;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "square";
                osc.frequency.setValueAtTime(900 + i * 120, start);
                osc.frequency.exponentialRampToValueAtTime(1600 + i * 80, start + 0.14);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
                osc.connect(gain);
                gain.connect(sfxBus);
                osc.start(start);
                osc.stop(start + 0.16);
            });
        }).catch(() => {});
    }

    function updateBGM(shouldPlay) {
        wantBGM = !!shouldPlay;
        if (!ENABLE_BGM) {
            if (bgmSource) stopBGM(0);
            return;
        }
        resumeIfNeeded().then(() => {
            if (wantBGM && musicEnabled && ready) {
                maybeStartBGM(); // если буфер ещё не готов — стартанёт сам по факту загрузки
            } else if (bgmSource) {
                stopBGM(180);
            }
        }).catch(() => {});
    }

    return {
        preload,
        resumeIfNeeded,
        loadSoundSet,
        setMusicEnabled,
        setSfxEnabled,
        playDrop,
        playMerge,
        playGameOver,
        playPreview,
        playGroomLick,
        updateBGM,
        getCurrentSet: () => currentSet
    };
})();

window.GameAudio = GameAudio;
