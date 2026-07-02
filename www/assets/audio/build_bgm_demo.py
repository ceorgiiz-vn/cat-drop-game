"""Build cleaned BGM demo for user approval before enabling in game."""
import math
import os
import struct
import wave

from generate_bgm import bgm_default
from clean_wav import read_wav, write_wav

SAMPLE_RATE = 44100
DIR = os.path.dirname(os.path.abspath(__file__))


def clean_bgm_seamless(samples):
    """DC removal + equal-power crossfade loop (no click at wrap)."""
    if not samples:
        return samples

    mean = sum(samples) / len(samples)
    samples = [s - mean for s in samples]

    cf = int(0.22 * SAMPLE_RATE)
    if cf * 2 >= len(samples):
        return samples

    n = len(samples)
    out = samples[:]
    for i in range(cf):
        t = i / cf
        fade_in = math.sin(t * math.pi / 2)
        fade_out = math.cos(t * math.pi / 2)
        out[i] = out[i] * fade_in + out[n - cf + i] * fade_out

    out = out[: n - cf]

    edge = int(0.012 * SAMPLE_RATE)
    for i in range(min(edge, len(out))):
        w = math.sin((i / edge) * math.pi / 2)
        out[i] *= w

    return out


def write_loop_test(path, samples, loops=3):
    """Concatenate loops so the user can hear if the seam clicks."""
    if not samples:
        return
    merged = []
    for _ in range(loops):
        merged.extend(samples)
    write_wav(path, merged)


def main():
    print("Generating original-style cozy BGM (bgm_default melody)...")
    raw = bgm_default()
    cleaned = clean_bgm_seamless(raw)

    demo_path = os.path.join(DIR, "bgm_demo.wav")
    loop_test_path = os.path.join(DIR, "bgm_demo_loop_test.wav")

    write_wav(demo_path, cleaned)
    write_loop_test(loop_test_path, cleaned, loops=3)

    dur = len(cleaned) / SAMPLE_RATE
    print(f"Demo: {demo_path} ({dur:.1f}s, seamless loop)")
    print(f"Loop test (3x): {loop_test_path}")


if __name__ == "__main__":
    main()
