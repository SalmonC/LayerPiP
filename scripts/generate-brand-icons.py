#!/usr/bin/env python3
"""Generate deterministic LayerPiP PNG extension icons from the brand geometry."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CANVAS = 1024


def brand_icon() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pixels = image.load()
    top = (15, 118, 110)
    bottom = (8, 47, 73)
    for y in range(CANVAS):
        ratio = y / (CANVAS - 1)
        color = tuple(round(a + (b - a) * ratio) for a, b in zip(top, bottom))
        for x in range(CANVAS):
            pixels[x, y] = (*color, 255)

    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((56, 56, 968, 968), radius=232, fill=255)
    image.putalpha(mask)

    draw = ImageDraw.Draw(image, "RGBA")
    mint = (45, 212, 191, 164)
    white = (248, 250, 252, 255)
    teal = (15, 118, 110, 255)
    pale = (153, 246, 228, 255)
    draw.rounded_rectangle((208, 232, 708, 612), radius=84, fill=mint)
    draw.rounded_rectangle((316, 340, 816, 720), radius=84, fill=white)
    draw.polygon(((506, 436), (690, 548), (506, 660)), fill=teal)
    draw.line((428, 780, 596, 780), fill=pale, width=44)
    draw.line((650, 780, 686, 780), fill=pale, width=44)
    return image


def main() -> None:
    source = brand_icon()
    targets = {120: "icon.png", 16: "icon16.png", 32: "icon32.png", 48: "icon48.png", 64: "icon64.png", 128: "icon128.png"}
    for size, name in targets.items():
        source.resize((size, size), Image.Resampling.LANCZOS).save(ASSETS / name)


if __name__ == "__main__":
    main()
