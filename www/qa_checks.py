"""Self-QA checks for known bug areas. Run after changes: python www/qa_checks.py"""
import os
import sys
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "assets")
SPRITES = os.path.join(ASSETS, "sprites")


def fail(msg):
    print("FAIL:", msg)
    return False


def ok(msg):
    print("OK:", msg)
    return True


def check_dev_cat_png():
    try:
        from PIL import Image
    except ImportError:
        return fail("Pillow not installed")

    path = os.path.join(ASSETS, "dev-cat-peek-peace.png")
    if not os.path.isfile(path):
        return fail(f"missing {path}")

    a = np.array(Image.open(path).convert("RGBA"))
    h, w = a.shape[:2]
    alpha = a[:, :, 3]

    if (alpha > 0).mean() > 0.75:
        fail("dev-cat: too much opaque area — background likely not cut out")
        return False

    right = alpha[:, int(w * 0.65) :]
    if (right == 0).mean() < 0.5:
        fail("dev-cat: right side should be mostly transparent")
        return False

    eye = alpha[max(0, h // 2 - 80) : min(h, h // 2 + 40), w // 2 - 120 : w // 2 + 40]
    if eye.size and (eye > 0).mean() < 0.3:
        fail("dev-cat: eye region too transparent")
        return False

    return ok(f"dev-cat PNG cutout ({w}x{h}, transparent={(alpha==0).mean():.0%})")


def check_sprite_corners():
    try:
        from PIL import Image
    except ImportError:
        return fail("Pillow not installed")

    path = os.path.join(SPRITES, "cat_1.png")
    a = np.array(Image.open(path).convert("RGBA"))
    corners = [a[0, 0, 3], a[0, -1, 3], a[-1, 0, 3], a[-1, -1, 3]]
    if any(c > 20 for c in corners):
        return fail(f"cat_1 corners not transparent: {corners}")
    return ok("cat_1 sprite has transparent corners")


def check_sprite_js_preview():
    path = os.path.join(ROOT, "js", "sprite.js")
    text = open(path, encoding="utf-8").read()
    if "previewDisplayD" not in text:
        return fail("sprite.js: preview needs previewDisplayD for responsive sizing")
    cat_block = text.split("function renderPreview")[1].split("\n    function ")[0]
    if "canvas.style.width" in cat_block:
        return fail("sprite.js: renderPreview must not override CSS canvas size")
    if "draw(ctx, img" not in cat_block:
        return fail("sprite.js: renderPreview must use draw() like APK")
    return ok("sprite.js HUD preview uses responsive canvas size")


def check_physics_frozen():
    path = os.path.join(ROOT, "js", "physics.js")
    text = open(path, encoding="utf-8").read()
    required = [
        "CAT_RESTITUTION: 0.38",
        "CAT_FRICTION: 0.25",
        "GRAVITY_Y: 1.45",
        "DO NOT change",
    ]
    for needle in required:
        if needle not in text:
            return fail(f"physics.js missing frozen baseline marker: {needle}")
    game = open(os.path.join(ROOT, "js", "game.js"), encoding="utf-8").read()
    if "restitution: 0.38" in game and "CatPhysics" not in game:
        return fail("game.js should use CatPhysics, not inline restitution")
    return ok("physics.js frozen baseline present")


def check_mouse_spawn_gate():
    text = open(os.path.join(ROOT, "js", "game_modes.js"), encoding="utf-8").read()
    if "MIN_DROPS_BEFORE_MOUSE" not in text or "canSpawnMouse" not in text:
        return fail("game_modes.js must gate early mouse spawns")
    if "MIN_DROPS_BEFORE_MOUSE = 40" not in text:
        return fail("MIN_DROPS_BEFORE_MOUSE should be 40")
    return ok("mouse spawn gated until cup has stacked")


def check_game_timing():
    path = os.path.join(ROOT, "js", "game.js")
    text = open(path, encoding="utf-8").read()
    audio = open(os.path.join(ROOT, "js", "audio.js"), encoding="utf-8").read()
    if "DEBUG_ULTIMATE_EGG_TEST = true" in text:
        return fail("DEBUG_ULTIMATE_EGG_TEST must be false for release")
    if "ENABLE_BGM = false" in audio:
        return fail("BGM should be enabled (ENABLE_BGM = true)")
    bgm = os.path.join(ROOT, "assets", "audio", "bgm.wav")
    if os.path.getsize(bgm) > 1_200_000:
        return fail("bgm.wav looks like wrong (chiptune) version — use original ~1MB")
    if "timer: 2.5" not in text or "total: 2.5" not in text:
        return fail("dev peek duration should be 2.5s")
    if "mouthY" not in text or "mouthX" not in text:
        return fail("speech bubble should anchor to mouthX/mouthY")
    return ok("game.js dev peek timing + release flags")


def check_css_preview_circle():
    path = os.path.join(ROOT, "style.css")
    text = open(path, encoding="utf-8").read()
    if "hud-top-bar" not in text:
        return fail("style.css: missing unified hud-top-bar")
    if "hud-center" not in text or "evolution-scroll" not in text:
        return fail("style.css: HUD needs grid; evolution needs evolution-scroll")
    return ok("CSS top HUD bar + circular next preview")


def main():
    print("=== Cat Drop QA ===")
    results = [
        check_dev_cat_png(),
        check_sprite_corners(),
        check_sprite_js_preview(),
        check_physics_frozen(),
        check_mouse_spawn_gate(),
        check_game_timing(),
        check_css_preview_circle(),
    ]
    print("---")
    if all(results):
        print("All checks passed.")
        return 0
    print(f"{sum(not r for r in results)} check(s) failed.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
