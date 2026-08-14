#!/usr/bin/env python3
"""Generate deterministic FloatCaption PNG extension icons from the brand geometry."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CANVAS = 1024


def brand_icon() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pixels = image.load()
    top = (76, 141, 255)
    bottom = (118, 87, 232)
    for y in range(CANVAS):
        ratio = y / (CANVAS - 1)
        color = tuple(round(a + (b - a) * ratio) for a, b in zip(top, bottom))
        for x in range(CANVAS):
            pixels[x, y] = (*color, 255)

    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((56, 56, 968, 968), radius=232, fill=255)
    image.putalpha(mask)

    draw = ImageDraw.Draw(image)
    white = (255, 255, 255, 255)
    draw.rounded_rectangle((232, 252, 792, 680), radius=84, outline=white, width=60)
    draw.polygon(((444, 350), (600, 440), (444, 530)), fill=white)
    draw.line((316, 532, 708, 532), fill=white, width=48)
    draw.line((380, 612, 644, 612), fill=white, width=48)
    return image


def main() -> None:
    source = brand_icon()
    targets = {120: "icon.png", 16: "icon16.png", 32: "icon32.png", 48: "icon48.png", 64: "icon64.png", 128: "icon128.png"}
    for size, name in targets.items():
        source.resize((size, size), Image.Resampling.LANCZOS).save(ASSETS / name)


if __name__ == "__main__":
    main()
