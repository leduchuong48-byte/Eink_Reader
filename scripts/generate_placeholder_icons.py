#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit("Pillow is required. Install it with: pip install Pillow") from exc


ROOT_DIR = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT_DIR / "static" / "icons"
TEXT = "E-ink"


def _draw_icon(size: int, output_path: Path) -> None:
    image = Image.new("L", (size, size), 255)
    draw = ImageDraw.Draw(image)

    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), TEXT, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (size - text_width) // 2
    y = (size - text_height) // 2
    draw.text((x, y), TEXT, fill=0, font=font)

    image.save(output_path, format="PNG")


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    icon_192 = ICONS_DIR / "icon-192.png"
    icon_512 = ICONS_DIR / "icon-512.png"

    _draw_icon(192, icon_192)
    _draw_icon(512, icon_512)

    print(f"Generated: {icon_192}")
    print(f"Generated: {icon_512}")


if __name__ == "__main__":
    main()
