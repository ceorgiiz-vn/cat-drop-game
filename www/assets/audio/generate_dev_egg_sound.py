"""Dev-egg SFX — short cartoon boing + pop (replace with user voice later)."""
import math
import wave
import struct
import os

SAMPLE_RATE = 44100


def write_wav(filename, samples):
    peak = max(abs(x) for x in samples) if samples else 0.0
    if peak > 0.0:
        samples = [x / peak * 0.78 for x in samples]

    with wave.open(filename, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        for sample in samples:
            val = int(max(-32768, min(32767, sample * 32767)))
            wav.writeframesraw(struct.pack("<h", val))


def silence(seconds):
    return [0.0] * int(seconds * SAMPLE_RATE)


def spring_boing(duration=0.34, f0=220, f1=680):
    n = int(duration * SAMPLE_RATE)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        p = i / max(1, n - 1)
        f = f0 + (f1 - f0) * (p ** 0.45)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        wave_val = math.sin(phase) + 0.28 * math.sin(phase * 2.0)
        env = math.sin(math.pi * p) ** 0.8 * math.exp(-1.8 * p)
        out.append(wave_val * env * 0.9)
    return out


def cartoon_pop(duration=0.08):
    n = int(duration * SAMPLE_RATE)
    out = []
    for i in range(n):
        p = i / max(1, n - 1)
        env = math.exp(-18.0 * p)
        click = math.sin(2.0 * math.pi * (900 - 500 * p) * (i / SAMPLE_RATE))
        out.append(click * env * 0.55)
    return out


def main():
    samples = []
    samples += spring_boing(0.32, 180, 620)
    samples += silence(0.02)
    samples += cartoon_pop(0.09)

    out_path = os.path.join(os.path.dirname(__file__), "dev_egg.wav")
    write_wav(out_path, samples)
    print("Wrote", out_path, f"({len(samples) / SAMPLE_RATE:.2f}s)")


if __name__ == "__main__":
    main()
