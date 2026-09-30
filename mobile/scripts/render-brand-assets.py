"""Render the approved FairClaim V11.1 production brand assets.

The coordinates match FairClaimLogo.tsx and fairclaim-mark.svg. The adaptive
foreground and monochrome mask retain transparent negative space so Android
can supply the approved obsidian background or system tint.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
SIZE = 1024
SUPERSAMPLE = 4

OBSIDIAN = (5, 7, 11)
PLATINUM = (245, 247, 250)
MINT = (104, 245, 194)
BORDER = (38, 57, 69)

LEFT_BODY = (
    (10, 31), (44, 11), (44, 36), (32, 43),
    (32, 57), (44, 64), (44, 89), (10, 69),
)
RIGHT_BODY = tuple((100 - x, y) for x, y in LEFT_BODY)
VERIFY_CORE = (
    (50, 40.65), (60.285, 46.26), (60.285, 53.74),
    (50, 59.35), (39.715, 53.74), (39.715, 46.26),
)


def transform(poly, canvas_size: int, scale: float):
    side = int(canvas_size * scale)
    offset = (canvas_size - side) // 2
    return [(offset + x * side / 100, offset + y * side / 100) for x, y in poly]


def mark(*, scale: float, monochrome: bool = False) -> Image.Image:
    canvas_size = SIZE * SUPERSAMPLE
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    body = (*PLATINUM, 255)
    core_rgb = PLATINUM if monochrome else MINT
    core = (*core_rgb, 255)
    draw.polygon(transform(LEFT_BODY, canvas_size, scale), fill=body)
    draw.polygon(transform(RIGHT_BODY, canvas_size, scale), fill=body)
    draw.polygon(transform(VERIFY_CORE, canvas_size, scale), fill=core)
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def launcher() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (*OBSIDIAN, 255))
    draw = ImageDraw.Draw(image)
    inset = round(SIZE * 0.045)
    draw.rounded_rectangle(
        (inset, inset, SIZE - inset, SIZE - inset),
        radius=round(SIZE * 0.22),
        fill=(*OBSIDIAN, 255),
        outline=(*BORDER, 255),
        width=max(2, SIZE // 128),
    )
    image.alpha_composite(mark(scale=0.60))
    return image


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    mark(scale=0.56).save(IMAGES / "fairclaim-foreground.png")
    mark(scale=0.56, monochrome=True).save(IMAGES / "fairclaim-monochrome.png")
    launcher().convert("RGB").save(IMAGES / "fairclaim.png")
    print("Rendered approved FairClaim V11.1 launcher, adaptive foreground, and monochrome icon.")


if __name__ == "__main__":
    main()
