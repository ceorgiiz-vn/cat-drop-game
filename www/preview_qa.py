"""Simulate NEXT preview render and save PNG for visual QA."""
from PIL import Image, ImageDraw
import math
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SPRITE = os.path.join(ROOT, "assets", "sprites", "cat_1.png")
OUT = os.path.join(ROOT, "assets", "preview-qa.png")

DIAMETER = 44
PREVIEW_FIT = 0.90
PREVIEW_OVERSCALE = 1.06


def render_preview(src_path, out_path):
    img = Image.open(src_path).convert("RGBA")
    out = Image.new("RGBA", (DIAMETER, DIAMETER), (0, 0, 0, 0))
    radius = (DIAMETER / 2) * PREVIEW_FIT
    overscale_r = radius * PREVIEW_OVERSCALE
    scale = (overscale_r * 2) / img.width
    resized = img.resize(
        (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
        Image.Resampling.LANCZOS,
    )
    cx = cy = DIAMETER / 2
    paste_x = int(cx - resized.width / 2)
    paste_y = int(cy - resized.height / 2)
    layer = Image.new("RGBA", (DIAMETER, DIAMETER), (0, 0, 0, 0))
    layer.paste(resized, (paste_x, paste_y), resized)
    mask = Image.new("L", (DIAMETER, DIAMETER), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse((0, 0, DIAMETER - 1, DIAMETER - 1), fill=255)
    out = Image.composite(layer, out, mask)

    # QA metrics: white ring pixels near circle edge
    px = out.load()
    white_edge = 0
    for y in range(DIAMETER):
        for x in range(DIAMETER):
            if (x - cx) ** 2 + (y - cy) ** 2 > (DIAMETER / 2 - 2) ** 2:
                continue
            r, g, b, a = px[x, y]
            if a > 128 and r > 230 and g > 230 and b > 230:
                white_edge += 1
    corners = [px[0, 0][3], px[DIAMETER - 1, 0][3], px[0, DIAMETER - 1][3]]
    out.save(out_path)
    print(f"Saved {out_path}")
    print(f"corner alpha (should be 0): {corners}")
    print(f"near-white inside circle: {white_edge}")
    return white_edge < 800 and all(c == 0 for c in corners)


if __name__ == "__main__":
    ok = render_preview(SPRITE, OUT)
    print("QA pass" if ok else "QA fail")
