from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


DPI = 300
STICKER_SIZE_IN = 3

STICKER_DIR = Path(r"C:\Users\areil\Desktop\findcarmeets-stickers")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a printable sticker sheet.")
    parser.add_argument("--width", type=int, required=True, help="Sheet width in inches")
    parser.add_argument("--height", type=int, required=True, help="Sheet height in inches")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cols = args.width // STICKER_SIZE_IN
    rows = args.height // STICKER_SIZE_IN
    if cols <= 0 or rows <= 0:
        raise ValueError("Sheet dimensions must fit at least one 3x3 sticker.")

    output_path = STICKER_DIR / f"findcarmeets-sticker-sheet-{args.width}x{args.height}.png"

    sheet_width = args.width * DPI
    sheet_height = args.height * DPI
    sticker_px = STICKER_SIZE_IN * DPI

    sheet = Image.new("RGB", (sheet_width, sheet_height), "white")
    draw = ImageDraw.Draw(sheet)

    stickers = sorted(STICKER_DIR.glob("sticker-*.png"))
    if not stickers:
        raise FileNotFoundError(f"No sticker PNGs found in {STICKER_DIR}")

    used_stickers = [
        path for path in stickers if not path.name.startswith("findcarmeets-sticker-sheet-")
    ]
    if not used_stickers:
        raise FileNotFoundError("Only the sheet image exists; no source stickers were found.")

    left_margin = (sheet_width - (cols * sticker_px)) // 2
    top_margin = (sheet_height - (rows * sticker_px)) // 2

    for row in range(rows):
        for col in range(cols):
            idx = (row * cols + col) % len(used_stickers)
            sticker = Image.open(used_stickers[idx]).convert("RGB")
            if sticker.size != (sticker_px, sticker_px):
                sticker = sticker.resize((sticker_px, sticker_px), Image.Resampling.LANCZOS)

            x = left_margin + (col * sticker_px)
            y = top_margin + (row * sticker_px)
            sheet.paste(sticker, (x, y))

    # Outer crop marks for easier trimming without drawing lines over the stickers.
    mark_len = 70
    mark_color = (40, 40, 40)
    mark_width = 3

    x_bounds = [left_margin + (i * sticker_px) for i in range(cols + 1)]
    y_bounds = [top_margin + (i * sticker_px) for i in range(rows + 1)]

    for x in x_bounds:
        draw.line((x, top_margin - mark_len, x, top_margin), fill=mark_color, width=mark_width)
        draw.line((x, top_margin + (rows * sticker_px), x, top_margin + (rows * sticker_px) + mark_len), fill=mark_color, width=mark_width)

    for y in y_bounds:
        draw.line((left_margin - mark_len, y, left_margin, y), fill=mark_color, width=mark_width)
        draw.line((left_margin + (cols * sticker_px), y, left_margin + (cols * sticker_px) + mark_len, y), fill=mark_color, width=mark_width)

    sheet.save(output_path, dpi=(DPI, DPI))
    pdf_path = output_path.with_suffix(".pdf")
    sheet.save(pdf_path, resolution=DPI)
    print(output_path)
    print(pdf_path)


if __name__ == "__main__":
    main()
