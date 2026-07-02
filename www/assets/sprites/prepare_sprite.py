"""
Prepare a game cat/skin sprite as a single ready-to-use PNG.

Output spec (drop into assets/sprites/ — no runtime trimming needed):
  - 1024 x 1024 RGBA PNG
  - Cat-in-ball centered, fills the frame
  - Transparent outside the circle (corners are alpha=0)

Usage:
  python prepare_sprite.py skin_oldman_preview.png -o skin_oldman.png
  python prepare_sprite.py --all          # convert all cat_*.jpg / skin sources
  python prepare_sprite.py my_cat.png -o cat_12.png
"""
from __future__ import annotations

import argparse
import glob
import math
import os

from PIL import Image

SPRITE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_SIZE = 1024


def sample_ring(px, w, h, cx, cy, r):
    sat = dark = n = 0
    for a in range(0, 360, 6):
        x = int(cx + r * math.cos(math.radians(a)))
        y = int(cy + r * math.sin(math.radians(a)))
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        R, G, B = px[x, y][:3]
        n += 1
        if max(R, G, B) - min(R, G, B) > 25:
            sat += 1
        if 0.299 * R + 0.587 * G + 0.114 * B < 90:
            dark += 1
    if n < 20:
        return None
    return sat / n, dark / n


def is_dark_outline_ring(px, w, h, cx, cy, r):
    cur = sample_ring(px, w, h, cx, cy, r)
    outer = sample_ring(px, w, h, cx, cy, r + 10)
    inner = sample_ring(px, w, h, cx, cy, r - 10)
    if not cur or not outer or not inner:
        return False
    s, d = cur
    os, od = outer
    is_, id_ = inner
    if d < 0.75 or s > 0.35:
        return False
    if os < 0.5 or od > 0.5:
        return False
    if is_ < 0.45 and not (is_ > 0.3 and id_ < 0.5):
        return False
    if id_ > 0.75 and is_ < 0.35:
        return False
    return True


def find_disk_radius(px, w, h, cx, cy, max_r):
    outer = 0
    for r in range(max_r, 40, -2):
        stats = sample_ring(px, w, h, cx, cy, r)
        if stats and stats[0] > 0.35:
            outer = r
            break
    if outer < 40:
        return int(max_r * 0.85)

    min_in = int(outer * 0.75)
    scan_hi = min(outer, max_r - 10)
    for r in range(scan_hi, min_in, -2):
        if is_dark_outline_ring(px, w, h, cx, cy, r):
            inner = r
            while inner > min_in:
                stats = sample_ring(px, w, h, cx, cy, inner)
                if not stats or stats[1] < 0.45:
                    break
                inner -= 2
            return inner - 2

    return int(outer * 0.995)


def apply_circle_alpha(im: Image.Image) -> Image.Image:
    """Hard circular alpha — ball edge stays fully opaque (no inner shave)."""
    w, h = im.size
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    radius = w / 2.0
    px = im.load()
    for y in range(h):
        for x in range(w):
            if math.hypot(x - cx, y - cy) > radius:
                px[x, y] = (0, 0, 0, 0)
    return im


def prepare_sprite(input_path: str, output_path: str | None = None) -> str:
    im = Image.open(input_path).convert("RGBA")
    w, h = im.size
    rgb = im.convert("RGB")
    px = rgb.load()
    cx, cy = w // 2, h // 2
    max_r = min(cx, cy) - 2
    disk_r = find_disk_radius(px, w, h, cx, cy, max_r)

    # Already a tight square (e.g. 1024 game sprite) — do not crop again or paws get clipped.
    if disk_r >= max_r * 0.97 and w == h:
        scaled = im.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS) if w != OUTPUT_SIZE else im.copy()
    else:
        left = int(cx - disk_r)
        top = int(cy - disk_r)
        size = disk_r * 2
        cropped = im.crop((left, top, left + size, top + size))
        scaled = cropped.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)

    final = apply_circle_alpha(scaled)

    if output_path is None:
        base = os.path.splitext(os.path.basename(input_path))[0]
        if base.endswith("_preview"):
            base = base[: -len("_preview")]
        output_path = os.path.join(SPRITE_DIR, f"{base}.png")

    final.save(output_path, optimize=True)
    print(f"  {os.path.basename(input_path)} -> {os.path.basename(output_path)} (disk R={disk_r})")
    return output_path


def prepare_all():
    jobs: list[tuple[str, str | None]] = []

    for path in sorted(glob.glob(os.path.join(SPRITE_DIR, "cat_*.jpg"))):
        out = os.path.join(SPRITE_DIR, os.path.splitext(os.path.basename(path))[0] + ".png")
        jobs.append((path, out))

    for path in sorted(glob.glob(os.path.join(SPRITE_DIR, "skin_*.jpg"))):
        out = os.path.join(SPRITE_DIR, os.path.splitext(os.path.basename(path))[0] + ".png")
        jobs.append((path, out))

    preview = os.path.join(SPRITE_DIR, "skin_oldman_preview.png")
    if os.path.isfile(preview):
        jobs.append((preview, os.path.join(SPRITE_DIR, "skin_oldman.png")))

    if not jobs:
        print("No source sprites found.")
        return

    print(f"Preparing {len(jobs)} sprites...")
    for src, dst in jobs:
        prepare_sprite(src, dst)
    print("Done.")


def main():
    parser = argparse.ArgumentParser(description="Prepare game-ready circular PNG sprites.")
    parser.add_argument("input", nargs="?", help="Source image (jpg/png)")
    parser.add_argument("-o", "--output", help="Output .png path")
    parser.add_argument("--all", action="store_true", help="Convert all cat/skin sources")
    args = parser.parse_args()

    if args.all:
        prepare_all()
    elif args.input:
        prepare_sprite(args.input, args.output)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
