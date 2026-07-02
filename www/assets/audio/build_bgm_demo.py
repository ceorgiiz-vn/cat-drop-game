"""Build cleaned BGM demo from the original APK track."""
import os

from clean_wav import read_wav, clean_bgm_loop, write_wav

DIR = os.path.dirname(os.path.abspath(__file__))
ORIGINAL = os.path.join(DIR, "original_bgm.wav")


def write_loop_test(path, samples, loops=3):
    merged = []
    for _ in range(loops):
        merged.extend(samples)
    write_wav(path, merged)


def main():
    if not os.path.isfile(ORIGINAL):
        raise SystemExit(f"Missing {ORIGINAL} — extract from CatDropEvolution-debug.apk first.")

    print("Cleaning original BGM for seamless loop...")
    cleaned = clean_bgm_loop(read_wav(ORIGINAL))

    demo = os.path.join(DIR, "bgm_demo_original.wav")
    loop_test = os.path.join(DIR, "bgm_demo_original_loop_test.wav")

    write_wav(demo, cleaned)
    write_loop_test(loop_test, cleaned, loops=3)

    print(f"Demo: {demo} ({len(cleaned) / 44100:.1f}s)")
    print(f"Loop test: {loop_test}")


if __name__ == "__main__":
    main()
