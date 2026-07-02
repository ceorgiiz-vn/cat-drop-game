"""Regenerate all SFX + themed BGM, then de-click / normalize."""
import os
import subprocess
import sys

DIR = os.path.dirname(os.path.abspath(__file__))

scripts = [
    "generate_audio.py",
    "generate_extra_sounds.py",
]
if os.environ.get("REGEN_BGM") == "1":
    scripts.insert(1, "generate_bgm.py")

for script in scripts:
    print(f"Running {script}...")
    subprocess.run([sys.executable, os.path.join(DIR, script)], check=True, cwd=DIR)

from clean_wav import clean_directory

print("Cleaning all WAV files (de-click, normalize, seamless BGM)...")
clean_directory(DIR)
print("Done — all audio generated and cleaned.")
