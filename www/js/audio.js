// Web Audio engine — seamless BGM loops and clean one-shot SFX

const GameAudio = (function() {
    /** Procedural BGM disabled — original game used SFX only (meow/drop/merge). */
    const ENABLE_BGM = false;

    const SETS = {
        Default: { suffix: "", bgm: "bgm.wav" },
        Mystic:  { suffix: "_mystic",  bgm: "bgm_mystic.wav" },
        Rapper:  { suffix: "_rapper",  bgm: "bgm_rapper.wav" },
        Zombie:  { suffix: "_zombie",  bgm: "bgm_zombie.wav" },
        Vampire: { suffix: "_vampire", bgm: "bgm_vampire.wav" },
        Oldman:  { suffix: "_oldman",  bgm: "bgm_oldman.wav" }
    };

    let ctx = null;
    let musicBus = null;
    let sfxBus = null;
    let buffers = {};
    let currentSet = "Default";
    let bgmSource = null;
    let musicEnabled = true;
    let sfxEnabled = true;
    let ready = false;
    let lastDropAt = 0;
    let lastMergeAt = 0;
    let devEggBuffer = null;

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
            musicBus.gain.value = 0.34;
            sfxBus.gain.value = 0.42;
            musicBus.connect(compressor);
            sfxBus.connect(compressor);
        }
        if (ctx.state === "suspended") {
            return ctx.resume();
        }
        return Promise.resolve();
    }

    function sfxFile(type, suffix) {
        if (type === "game_over") return `game_over${suffix}.wav`;
        return `${type}${suffix}.wav`;
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

    async function preload(callback) {
        try {
            await ensureContext();

            const tasks = [];
            for (const [setName, cfg] of Object.entries(SETS)) {
                for (const type of ["drop", "merge", "game_over"]) {
                    const url = `assets/audio/${sfxFile(type, cfg.suffix)}`;
                    const key = bufferKey(setName, type);
                    tasks.push(
                        loadBuffer(url)
                            .then(buf => { buffers[key] = buf; })
                            .catch(err => console.warn("Missing SFX:", url, err))
                    );
                }
                if (!ENABLE_BGM) continue;
                const bgmUrl = `assets/audio/${cfg.bgm}`;
                tasks.push(
                    loadBuffer(bgmUrl)
                        .then(buf => { buffers[bufferKey(setName, "bgm")] = buf; })
                        .catch(err => console.warn("Missing BGM:", bgmUrl, err))
                );
            }

            await Promise.all(tasks);

            try {
                devEggBuffer = await loadBuffer("assets/audio/dev_egg.wav");
            } catch (err) {
                console.warn("Missing dev egg SFX:", err);
            }
        } catch (err) {
            console.error("Audio preload error:", err);
        } finally {
            ready = true;
            if (callback) callback();
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
        setTimeout(() => {
            try { src.disconnect(); } catch (_) {}
            if (musicEnabled) musicBus.gain.value = 0.34;
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

    function resumeIfNeeded() {
        return ensureContext();
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
        if (musicEnabled && ready) {
            stopBGM(80);
            setTimeout(() => startBGM(currentSet), 90);
        }
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

    function playPreview(setName) {
        resumeIfNeeded().then(() => playOneShot("merge", setName || currentSet, 1.0, 0.95));
    }

    function playGroomLick() {
        if (!ctx || !sfxEnabled) return;
        resumeIfNeeded().then(() => {
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
        if (!ENABLE_BGM) {
            if (bgmSource) stopBGM(0);
            return;
        }
        resumeIfNeeded().then(() => {
            if (shouldPlay && musicEnabled && ready) {
                if (!bgmSource) startBGM(currentSet);
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
