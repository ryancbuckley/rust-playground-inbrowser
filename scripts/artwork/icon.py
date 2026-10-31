#!/usr/bin/env python3
"""Draw the playground's app icon: a crab, claws up, pleased to compile.

    python3 scripts/artwork/icon.py

Writes web/icons/icon-{180,192,512}.png: 180 for iOS's Home Screen (which
ignores the manifest's icons), 192 and 512 for Android and the rest. A crab
of its own rather than the Rust logo, which is a Rust Foundation trademark;
a nod to Ferris, the community's crab, without being a copy of it.

And icon-maskable-512.png, the same crab smaller: a launcher crops a
maskable icon to as little as the circle 80% of its width across, and the
crab that fills the plain icons would lose a claw and its feet to it. One
image for both would make the plain icons a small crab on a lot of slate.

Drawn at four times the largest size and reduced with LANCZOS, because
ImageDraw does not antialias.
"""

import pathlib
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("needs Pillow: python3 -m pip install Pillow")

OUT = pathlib.Path(__file__).resolve().parents[2] / "web" / "icons"
SS, SIZE = 4, 512
S = SIZE * SS

BG = (27, 38, 54)          # deep slate: the manifest's background_color
SHELL = (240, 106, 46)     # rust orange
SHELL_DARK = (196, 78, 30)
SHELL_LIGHT = (255, 150, 92)
EYE = (255, 252, 245)
PUPIL = (27, 38, 54)
CHEEK = (255, 128, 128)
MOUTH = (110, 40, 14)
SPARK = (255, 214, 102)

# The crab is drawn in a unit square, scaled by K about (CX, CY): set by
# draw() for each of the two sizes of crab.
K, CX, CY = 1.0, 0.5, 0.5
PLAIN = (0.86, 0.54)      # fills the tile
MASKABLE = (0.66, 0.52)   # sparkles, claws and feet within the safe circle


def p(x, y):
    return ((CX + (x - 0.5) * K) * S, (CY + (y - 0.5) * K) * S)


def w(width):
    return max(1, round(width * K * S))


def circle(d, x, y, r, fill):
    (cx, cy), rr = p(x, y), r * K * S
    d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=fill)


def ellipse(d, x, y, rx, ry, fill):
    (cx, cy) = p(x, y)
    d.ellipse((cx - rx * K * S, cy - ry * K * S, cx + rx * K * S, cy + ry * K * S), fill=fill)


def line(d, points, width, fill):
    pts = [p(*q) for q in points]
    d.line(pts, fill=fill, width=w(width), joint="curve")
    for q in (pts[0], pts[-1]):          # round caps
        r = w(width) / 2
        d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=fill)


def claw(d, x, y, r, opening, side):
    """A pincer: a disc with a wedge bitten out, pointing `opening` degrees
    (clockwise from three o'clock, as ImageDraw counts). The shine sits on
    the inner side, away from the bite."""
    circle(d, x, y, r, SHELL)
    circle(d, x - side * 0.022, y + 0.005, r * 0.5, SHELL_LIGHT)
    (cx, cy), rr = p(x, y), r * K * S * 1.02
    d.pieslice((cx - rr, cy - rr, cx + rr, cy + rr), opening - 24, opening + 24, fill=BG)


def sparkle(d, x, y, r):
    """A four-pointed star: two thin diamonds crossed."""
    (cx, cy), rr = p(x, y), r * K * S
    t = rr * 0.28
    d.polygon([(cx, cy - rr), (cx + t, cy), (cx, cy + rr), (cx - t, cy)], fill=SPARK)
    d.polygon([(cx - rr, cy), (cx, cy - t), (cx + rr, cy), (cx, cy + t)], fill=SPARK)


def draw(scale, centre_y):
    global K, CY
    K, CY = scale, centre_y
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)

    # Legs first, behind the body: three a side, bent at the knee.
    # Each (hip, knee, foot), fanned from the front leg, nearly level, to the
    # back one, tucked steeply under.
    legs = [((0.20, 0.60), (0.36, 0.585), (0.43, 0.70)),
            ((0.21, 0.645), (0.35, 0.665), (0.39, 0.79)),
            ((0.19, 0.68), (0.30, 0.735), (0.31, 0.85))]
    for side in (-1, 1):
        for leg in legs:
            line(d, [(0.5 + side * x, y) for x, y in leg], 0.034, SHELL_DARK)

    # Arms up to the claws, then the claws, opening up and outwards.
    for side in (-1, 1):
        line(d, [(0.5 + side * 0.16, 0.55), (0.5 + side * 0.27, 0.45), (0.5 + side * 0.30, 0.35)], 0.05, SHELL)
    claw(d, 0.19, 0.27, 0.105, 225, -1)
    claw(d, 0.81, 0.27, 0.105, 315, 1)

    # Sparkles: it compiled.
    for x, y, r in ((0.12, 0.12, 0.045), (0.90, 0.10, 0.035), (0.95, 0.42, 0.025)):
        sparkle(d, x, y, r)

    # Eye stalks and eyes, looking up at whatever just compiled.
    for side in (-1, 1):
        line(d, [(0.5 + side * 0.055, 0.50), (0.5 + side * 0.075, 0.39)], 0.026, SHELL)
        circle(d, 0.5 + side * 0.078, 0.36, 0.052, EYE)
        circle(d, 0.5 + side * 0.078 + 0.012, 0.348, 0.026, PUPIL)
        circle(d, 0.5 + side * 0.078 + 0.020, 0.340, 0.008, EYE)

    # The body: a wide shell, lit from above.
    ellipse(d, 0.5, 0.61, 0.25, 0.155, SHELL)
    ellipse(d, 0.5, 0.575, 0.19, 0.085, SHELL_LIGHT)
    ellipse(d, 0.5, 0.60, 0.21, 0.11, SHELL)

    # Cheeks and a smile.
    for side in (-1, 1):
        ellipse(d, 0.5 + side * 0.13, 0.635, 0.035, 0.02, CHEEK)
    (cx, cy) = p(0.5, 0.60)
    rx, ry = 0.06 * K * S, 0.045 * K * S
    d.arc((cx - rx, cy - ry, cx + rx, cy + ry), 20, 160, fill=MOUTH, width=w(0.016))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    plain = draw(*PLAIN)
    for size in (180, 192, 512):
        plain.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png", optimize=True)
        print(f"wrote {OUT / f'icon-{size}.png'}")
    draw(*MASKABLE).resize((512, 512), Image.LANCZOS).save(OUT / "icon-maskable-512.png", optimize=True)
    print(f"wrote {OUT / 'icon-maskable-512.png'}")


if __name__ == "__main__":
    main()
