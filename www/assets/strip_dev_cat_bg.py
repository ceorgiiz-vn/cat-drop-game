"""Cut dev-cat PNG: true alpha outside character silhouette."""
from PIL import Image
import numpy as np
from collections import deque
import os

SRC = r"C:\Users\tsuts\.cursor\projects\d\assets\dev-cat-peek-peace.png"
OUT = os.path.join(os.path.dirname(__file__), "dev-cat-peek-peace.png")
SEEDS = [(420, 720), (480, 650), (350, 500), (550, 380), (400, 800), (300, 450)]
COL_THRESH = 80
ROW_THRESH = 80
PAD = 20


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


def crop_to_content(rgba, pad=PAD):
    alpha = rgba[:, :, 3] > 0
    col_count = alpha.sum(axis=0)
    row_count = alpha.sum(axis=1)
    xs = np.where(col_count > COL_THRESH)[0]
    ys = np.where(row_count > ROW_THRESH)[0]
    if xs.size == 0 or ys.size == 0:
        return rgba
    h, w = rgba.shape[:2]
    x0 = max(0, xs[0] - pad)
    x1 = min(w, xs[-1] + pad + 1)
    y0 = max(0, ys[0] - pad)
    y1 = min(h, ys[-1] + pad + 1)
    return rgba[y0:y1, x0:x1]


def main():
    src = SRC if os.path.isfile(SRC) else OUT
    raw = np.array(Image.open(src).convert("RGBA"))
    char = flood_char(raw)
    out = raw.copy()
    out[:, :, 3] = np.where(char, 255, 0).astype(np.uint8)
    cropped = crop_to_content(out)
    Image.fromarray(cropped).save(OUT)
    print(f"Saved {OUT} ({cropped.shape[1]}x{cropped.shape[0]})")


if __name__ == "__main__":
    main()
