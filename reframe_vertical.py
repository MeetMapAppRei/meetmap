from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter


TARGET_SIZE = (1080, 1920)


def reframe(source_path: Path, output_path: Path) -> None:
    source = Image.open(source_path).convert("RGB")
    target_width, target_height = TARGET_SIZE

    # Fill the vertical canvas with a blurred crop from the source.
    bg = source.copy()
    bg_scale = max(target_width / bg.width, target_height / bg.height)
    bg = bg.resize(
        (int(bg.width * bg_scale), int(bg.height * bg_scale)),
        Image.Resampling.LANCZOS,
    )
    bg_left = max((bg.width - target_width) // 2, 0)
    bg_top = max((bg.height - target_height) // 2, 0)
    bg = bg.crop((bg_left, bg_top, bg_left + target_width, bg_top + target_height))
    bg = bg.filter(ImageFilter.GaussianBlur(30))

    # Keep the full generated frame visible inside the 9:16 output.
    fg = source.copy()
    fg_scale = min(target_width / fg.width, target_height / fg.height)
    fg = fg.resize(
        (int(fg.width * fg_scale), int(fg.height * fg_scale)),
        Image.Resampling.LANCZOS,
    )

    canvas = bg
    x = (target_width - fg.width) // 2
    y = (target_height - fg.height) // 2
    canvas.paste(fg, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG", optimize=True)


def main() -> int:
    if len(sys.argv) < 3 or len(sys.argv[1:]) % 2 != 0:
        print("Usage: python reframe_vertical.py <source> <output> [<source> <output> ...]")
        return 1

    args = sys.argv[1:]
    for idx in range(0, len(args), 2):
        reframe(Path(args[idx]), Path(args[idx + 1]))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
