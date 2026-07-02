"""Restore original George peek art — transparent outside silhouette only (no bg color)."""
from PIL import Image
import numpy as np
from collections import deque
import os

SRC = r"C:\Users\tsuts\.cursor\projects\d\assets\dev-cat-peek-peace.png"
OUT = os.path.join(os.path.dirname(__file__), "dev-cat-peek-peace.png")
SEEDS = [(420, 720), (480, 650), (350, 500), (550, 380), (400, 800), (300, 450)]


def strict_checker(r, g, b):
    ri, gi, bi = int(r), int(g), int(b)
    if abs(ri - gi) > 3 or abs(gi - bi) > 3:
        return False
    avg = (ri + gi + bi) / 3
    return (241 <= avg <= 246) or (252 <= avg <= 255)


def flood_char(a):
    h, w = a.shape[:2]
    char = np.zeros((h, w), dtype=bool)
    seen = np.zeros((h, w), dtype=bool)
    q = deque(SEEDS)
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x]:
            continue
        seen[y, x] = True
        if strict_checker(a[y, x, 0], a[y, x, 1], a[y, x, 2]):
            continue
        char[y, x] = True
        q.extend([(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)])
    return char


def trim_white_halo(rgba):
    out = rgba.copy()
    h, w = out.shape[:2]
    for y in range(h):
        for x in range(w):
            if out[y, x, 3] == 0:
                continue
            on_edge = False
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if ny < 0 or ny >= h or nx < 0 or nx >= w or out[ny, nx, 3] == 0:
                    on_edge = True
                    break
            if not on_edge:
                continue
            r, g, b = int(out[y, x, 0]), int(out[y, x, 1]), int(out[y, x, 2])
            if r > 200 and g > 200 and b > 200:
                out[y, x, 3] = 0
    return out


def crop_to_content(rgba, pad=20):
    alpha = rgba[:, :, 3] > 0
    xs = np.where(alpha.sum(axis=0) > 80)[0]
    ys = np.where(alpha.sum(axis=1) > 80)[0]
    if xs.size == 0:
        return rgba
    h, w = rgba.shape[:2]
    return rgba[
        max(0, ys[0] - pad) : min(h, ys[-1] + pad + 1),
        max(0, xs[0] - pad) : min(w, xs[-1] + pad + 1),
    ]


def main():
    if not os.path.isfile(SRC):
        raise FileNotFoundError(f"Original George not found: {SRC}")
    raw = np.array(Image.open(SRC).convert("RGBA"))
    char = flood_char(raw)
    out = raw.copy()
    out[:, :, 3] = np.where(char, 255, 0).astype(np.uint8)
    out = trim_white_halo(out)
    cropped = crop_to_content(out)
    Image.fromarray(cropped).save(OUT)
    print(f"Saved {OUT} ({cropped.shape[1]}x{cropped.shape[0]}) — alpha only, no bg fill")


if __name__ == "__main__":
    main()
