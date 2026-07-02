"""Post-process WAV files: remove DC offset, de-click fades, gentle peak limit."""
import math
import os
import struct
import wave

SAMPLE_RATE = 44100


def read_wav(path):
    with wave.open(path, "rb") as wf:
        n = wf.getnframes()
        raw = wf.readframes(n)
    samples = []
    for i in range(0, len(raw), 2):
        samples.append(struct.unpack("<h", raw[i : i + 2])[0] / 32767.0)
    return samples


def write_wav(path, samples):
    peak = max(abs(s) for s in samples) if samples else 0.0
    if peak > 0.0:
        samples = [s / peak * 0.72 for s in samples]
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        for s in samples:
            wf.writeframesraw(struct.pack("<h", int(max(-32768, min(32767, s * 32767)))))


def clean_sfx(samples):
    if not samples:
        return samples
    mean = sum(samples) / len(samples)
    samples = [s - mean for s in samples]

    fade_ms = 6
    fade = max(1, int(fade_ms / 1000.0 * SAMPLE_RATE))
    fade = min(fade, len(samples) // 4)
    for i in range(fade):
        w = math.sin((i / fade) * math.pi / 2)
        samples[i] *= w
        samples[-(i + 1)] *= w
    return samples


def clean_bgm_loop(samples):
    if not samples:
        return samples
    mean = sum(samples) / len(samples)
    samples = [s - mean for s in samples]

    # Trim trailing near-silence
    while len(samples) > SAMPLE_RATE and abs(samples[-1]) < 0.001:
        samples.pop()

    cf = int(0.15 * SAMPLE_RATE)
    if cf * 2 < len(samples):
        n = len(samples)
        for i in range(cf):
            t = i / cf
            fade_in = math.sin(t * math.pi / 2)
            fade_out = math.cos(t * math.pi / 2)
            samples[i] = samples[i] * fade_in + samples[n - cf + i] * fade_out
        samples = samples[: n - cf]

    fade = int(0.008 * SAMPLE_RATE)
    for i in range(min(fade, len(samples))):
        w = i / fade
        samples[i] *= w
    return samples


def clean_file(path):
    name = os.path.basename(path).lower()
    samples = read_wav(path)
    if name.startswith("bgm"):
        samples = clean_bgm_loop(samples)
    else:
        samples = clean_sfx(samples)
    write_wav(path, samples)


def clean_directory(directory):
    for fname in os.listdir(directory):
        if fname.endswith(".wav"):
            fpath = os.path.join(directory, fname)
            clean_file(fpath)
            print("Cleaned:", fname)
