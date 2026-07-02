"""George peek — mask/cutout only; face pixels copied verbatim from canonical source."""
from PIL import Image
import numpy as np
from collections import deque
import os
import shutil

CANON = r"C:\Users\tsuts\.cursor\projects\d\assets\dev-cat-peek-peace.png"
BACKUP = os.path.join(os.path.dirname(__file__), "george-peek-canonical-source.png")
OUT = os.path.join(os.path.dirname(__file__), "dev-cat-peek-peace.png")
SEEDS = [(420, 720), (480, 650), (350, 500), (550, 380), (400, 800), (300, 450)]


def is_bg(r, g, b):
    ri, gi, bi = int(r), int(g), int(b)
    if abs(ri - gi) <= 5 and abs(gi - bi) <= 5:
        avg = (ri + gi + bi) / 3
        if avg >= 235:
            return True
    return False


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
        if is_bg(a[y, x, 0], a[y, x, 1], a[y, x, 2]):
            continue
        char[y, x] = True
        q.extend([(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)])
    return char


def largest_component(mask):
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    best = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            while q:
                y, x = q.popleft()
                comp.append((y, x))
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(comp) > len(best):
                best = comp
    out = np.zeros((h, w), dtype=bool)
    for y, x in best:
        out[y, x] = True
    return out


def face_bbox(char):
    ys, xs = np.where(char)
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    h, w = y1 - y0, x1 - x0
    return (
        y0 + int(h * 0.00),
        y0 + int(h * 0.52),
        x0 + int(w * 0.32),
        x0 + int(w * 0.96),
    )


def is_light_fringe(r, g, b):
    ri, gi, bi = int(r), int(g), int(b)
    lum = (ri + gi + bi) / 3
    sat = max(ri, gi, bi) - min(ri, gi, bi)
    if lum >= 248:
        return True
    if lum >= 220 and sat <= 18:
        return True
    return False


def peel_fringe(char, rgb, face_rect, passes=8):
    """Remove light halo pixels near silhouette; face interior never touched."""
    fy0, fy1, fx0, fx1 = face_rect
    out = char.copy()
    h, w = out.shape
    for _ in range(passes):
        remove = np.zeros((h, w), dtype=bool)
        for y in range(h):
            for x in range(w):
                if not out[y, x]:
                    continue
                if fy0 <= y < fy1 and fx0 <= x < fx1:
                    continue
                if not is_light_fringe(rgb[y, x, 0], rgb[y, x, 1], rgb[y, x, 2]):
                    continue
                near = False
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        ny, nx = y + dy, x + dx
                        if ny < 0 or ny >= h or nx < 0 or nx >= w or not out[ny, nx]:
                            near = True
                            break
                    if near:
                        break
                if near:
                    remove[y, x] = True
        out[remove] = False
    return out


def drop_white_specks(char, rgb, face_rect):
    """Remove stray white grid lines (not face, not eye glints)."""
    fy0, fy1, fx0, fx1 = face_rect
    h, w = char.shape
    out = char.copy()
    for y in range(h):
        for x in range(w):
            if not out[y, x]:
                continue
            if fy0 <= y < fy1 and fx0 <= x < fx1:
                continue
            r, g, b = int(rgb[y, x, 0]), int(rgb[y, x, 1]), int(rgb[y, x, 2])
            if r < 230 or g < 230 or b < 230:
                continue
            warm = 0
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    ny, nx = y + dy, x + dx
                    if ny < 0 or ny >= h or nx < 0 or nx >= w or not out[ny, nx]:
                        continue
                    rr, gg, bb = int(rgb[ny, nx, 0]), int(rgb[ny, nx, 1]), int(rgb[ny, nx, 2])
                    if rr > 70 and gg < rr - 5:
                        warm += 1
                    if rr < 80 and gg < 80 and bb < 90:
                        warm += 1
            if warm < 3:
                out[y, x] = False
    return out


def erode_outside_face(char, face_rect, steps=2):
    """Shrink mask slightly on hair/body edges to drop checkerboard halo."""
    fy0, fy1, fx0, fx1 = face_rect
    out = char.copy()
    h, w = out.shape
    for _ in range(steps):
        nxt = out.copy()
        for y in range(h):
            for x in range(w):
                if not out[y, x]:
                    continue
                if fy0 <= y < fy1 and fx0 <= x < fx1:
                    continue
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if ny < 0 or ny >= h or nx < 0 or nx >= w or not out[ny, nx]:
                        nxt[y, x] = False
                        break
        out = nxt
    return out


def compose(raw, char, face_rect):
    """RGB always from canonical source; alpha from cleaned mask."""
    out = np.zeros_like(raw)
    h, w = char.shape
    for y in range(h):
        for x in range(w):
            if not char[y, x]:
                continue
            out[y, x, :3] = raw[y, x, :3]
            out[y, x, 3] = 255
    return out


def crop_content(rgba, pad=16):
    a = rgba[:, :, 3] > 0
    xs = np.where(a.sum(0) > 30)[0]
    ys = np.where(a.sum(1) > 30)[0]
    if xs.size == 0:
        return rgba
    h, w = rgba.shape[:2]
    return rgba[
        max(0, ys[0] - pad) : min(h, ys[-1] + pad + 1),
        max(0, xs[0] - pad) : min(w, xs[-1] + pad + 1),
    ]


def main():
    if not os.path.isfile(CANON):
        raise FileNotFoundError(CANON)
    shutil.copy2(CANON, BACKUP)
    raw = np.array(Image.open(CANON).convert("RGBA"))
    rgb = raw[:, :, :3]
    char = largest_component(flood_char(raw))
    face_rect = face_bbox(char)
    char = drop_white_specks(char, rgb, face_rect)
    char = peel_fringe(char, rgb, face_rect, passes=8)
    char = erode_outside_face(char, face_rect, steps=3)
    out = compose(raw, char, face_rect)
    cropped = crop_content(out)
    Image.fromarray(cropped).save(OUT)
    print(f"Out: {OUT} {cropped.shape[1]}x{cropped.shape[0]}")


if __name__ == "__main__":
    main()
