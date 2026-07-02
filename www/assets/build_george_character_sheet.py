"""Patch FACE panel on turnaround sheet with exact pixels from canonical peek sprite."""
from PIL import Image
import numpy as np
import os
import shutil

ASSETS = os.path.dirname(__file__)
PEEK = os.path.join(ASSETS, "dev-cat-peek-peace.png")
BASE = os.path.join(ASSETS, "george-character-sheet-turnaround-base.png")
OUT_V2 = os.path.join(ASSETS, "george-character-sheet-v2.png")
OUT_MAIN = os.path.join(ASSETS, "george-character-sheet.png")


def face_crop(peek):
    a = np.array(peek)
    mask = a[:, :, 3] > 128
    ys, xs = np.where(mask)
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    h, w = y1 - y0, x1 - x0
    return peek.crop(
        (
            x0 + int(w * 0.02),
            y0,
            x0 + int(w * 0.68),
            y0 + int(h * 0.58),
        )
    )


def fit_face(face, pw, ph, top_margin=0.12):
    pad_x = int(pw * 0.08)
    pad_y = int(ph * top_margin)
    inner_w = pw - pad_x * 2
    inner_h = ph - pad_y - int(ph * 0.06)
    scale = min(inner_w / face.width, inner_h / face.height)
    nw = max(1, int(face.width * scale))
    nh = max(1, int(face.height * scale))
    resized = face.resize((nw, nh), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ox = (pw - nw) // 2
    oy = pad_y + (inner_h - nh) // 2
    layer.paste(resized, (ox, oy), resized)
    return layer


def main():
    if not os.path.isfile(BASE):
        raise FileNotFoundError(BASE)
    if not os.path.isfile(PEEK):
        raise FileNotFoundError(PEEK)

    sheet = Image.open(BASE).convert("RGBA")
    w, h = sheet.size
    px, py = w // 2, h // 2
    pw, ph = w - px, h - py

    face = face_crop(Image.open(PEEK).convert("RGBA"))
    panel = fit_face(face, pw, ph)

    # Keep gray panel bg from base; replace character art only
    base_panel = sheet.crop((px, py, w, h)).convert("RGBA")
    merged = Image.new("RGBA", (pw, ph), (220, 220, 220, 255))
    merged.paste(base_panel, (0, 0))
    merged = Image.alpha_composite(merged, panel)
    sheet.paste(merged, (px, py))

    sheet.save(OUT_V2)
    sheet.save(OUT_MAIN)
    print(f"Saved {OUT_V2}")


if __name__ == "__main__":
    main()
