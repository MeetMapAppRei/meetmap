from __future__ import annotations

from io import BytesIO
from pathlib import Path
from urllib.parse import quote_plus
from urllib.request import urlopen

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = Path(
    r"C:\Users\areil\.cursor\projects\c-Users-areil-Desktop-meetmap\assets"
)
OUTPUT_DIR = Path(r"C:\Users\areil\Desktop\findcarmeets-stickers")
URL = "findcarmeets.com"
QR_URL = "https://findcarmeets.com"
SIZE = 900
CARD_RADIUS = 52


SPECS = [
    {
        "name": "sticker-honda-civic-type-r-red.png",
        "source": "c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_ChatGPT_Image_Mar_26__2026__09_51_35_AM-6c36b9a2-c3fe-4dd2-99e5-57dd18c6b019.png",
        "title": "CIVIC TYPE R",
        "car_color": (224, 50, 62),
        "glow_color": (255, 96, 108),
        "theme_dark": (25, 12, 16),
        "theme_mid": (58, 16, 24),
        "wheel_top": "MEETS",
        "wheel_bottom": "TRACK  STREET  SHOW",
    },
    {
        "name": "sticker-bmw-m3-blue.png",
        "source": "c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_ChatGPT_Image_Mar_26__2026__09_51_07_AM-dee04387-336f-435e-856b-7cef27e6079a.png",
        "title": "BMW M3",
        "car_color": (44, 142, 255),
        "glow_color": (101, 184, 255),
        "theme_dark": (10, 19, 34),
        "theme_mid": (18, 45, 84),
        "wheel_top": "FIND",
        "wheel_bottom": "LOCAL  CARS  EVENTS",
    },
    {
        "name": "sticker-ford-mustang-orange.png",
        "source": "c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_ChatGPT_Image_Mar_26__2026__09_51_02_AM-d0616b30-eb84-416a-8f40-9c8a5d1ff1d9.png",
        "title": "MUSTANG",
        "car_color": (255, 120, 34),
        "glow_color": (255, 164, 91),
        "theme_dark": (27, 16, 6),
        "theme_mid": (84, 41, 8),
        "wheel_top": "SCAN",
        "wheel_bottom": "FOR  UPCOMING  MEETS",
    },
    {
        "name": "sticker-toyota-gr-circuit-green.png",
        "source": "c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_ChatGPT_Image_Mar_26__2026__09_51_17_AM-9b66e123-6ea8-47d5-a198-43b6a914c7b5.png",
        "title": "GR CIRCUIT",
        "car_color": (64, 220, 124),
        "glow_color": (114, 241, 165),
        "theme_dark": (10, 24, 16),
        "theme_mid": (14, 62, 36),
        "wheel_top": "JOIN",
        "wheel_bottom": "CAR  COMMUNITY  LIVE",
    },
    {
        "name": "sticker-subaru-wrx-purple.png",
        "source": "c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_ChatGPT_Image_Mar_26__2026__09_50_57_AM-efbdb52c-b4a7-475d-87b6-8b603b24d711.png",
        "title": "WRX STI",
        "car_color": (143, 90, 255),
        "glow_color": (184, 144, 255),
        "theme_dark": (20, 10, 31),
        "theme_mid": (53, 24, 86),
        "wheel_top": "EVENTS",
        "wheel_bottom": "RIDES  FRIENDS  CRUISES",
    },
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                r"C:\Windows\Fonts\arialbd.ttf",
                r"C:\Windows\Fonts\segoeuib.ttf",
                r"C:\Windows\Fonts\bahnschrift.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                r"C:\Windows\Fonts\arial.ttf",
                r"C:\Windows\Fonts\segoeui.ttf",
                r"C:\Windows\Fonts\bahnschrift.ttf",
            ]
        )
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def fetch_qr() -> Image.Image:
    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/"
        f"?size=240x240&margin=0&data={quote_plus(QR_URL)}"
    )
    with urlopen(qr_url) as response:
        return Image.open(BytesIO(response.read())).convert("RGBA")


def make_background(spec: dict) -> Image.Image:
    bg = Image.new("RGBA", (SIZE, SIZE), spec["theme_dark"] + (255,))
    pixels = bg.load()
    for y in range(SIZE):
        for x in range(SIZE):
            tx = x / (SIZE - 1)
            ty = y / (SIZE - 1)
            mix = min(1.0, tx * 0.72 + ty * 0.95)
            r = int(spec["theme_dark"][0] * (1 - mix) + spec["theme_mid"][0] * mix)
            g = int(spec["theme_dark"][1] * (1 - mix) + spec["theme_mid"][1] * mix)
            b = int(spec["theme_dark"][2] * (1 - mix) + spec["theme_mid"][2] * mix)
            pixels[x, y] = (r, g, b, 255)

    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse(
        (-50, 90, 640, 720),
        fill=spec["glow_color"] + (92,),
    )
    gdraw.ellipse(
        (360, -70, 960, 430),
        fill=spec["glow_color"] + (52,),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    bg = Image.alpha_composite(bg, glow)

    stripe = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(stripe)
    for offset in range(-SIZE, SIZE, 70):
        sdraw.line(
            [(offset, 0), (offset + SIZE, SIZE)],
            fill=(255, 255, 255, 18),
            width=3,
        )
    stripe = stripe.filter(ImageFilter.GaussianBlur(1))
    return Image.alpha_composite(bg, stripe)


def round_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def make_photo_mask(img: Image.Image) -> Image.Image:
    # This polygon covers the car body area while excluding most of the white studio background.
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    points = [
        (60, 420),
        (155, 250),
        (340, 118),
        (680, 98),
        (945, 245),
        (970, 420),
        (862, 570),
        (158, 596),
    ]
    draw.polygon(points, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(20))


def recolor_car(img: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    rgb = img.convert("RGB")
    mask_shape = make_photo_mask(rgb)
    grayscale = rgb.convert("L")
    color_layer = Image.new("RGB", rgb.size, color)
    colorized = ImageChops.multiply(color_layer, Image.merge("RGB", (grayscale, grayscale, grayscale)))

    original_hsv = rgb.convert("HSV")
    h, s, v = original_hsv.split()

    low_sat = s.point(lambda px: 255 if px < 70 else 0)
    bright = v.point(lambda px: 255 if 108 < px < 248 else 0)
    recolor_mask = ImageChops.multiply(mask_shape, ImageChops.multiply(low_sat, bright))
    recolor_mask = recolor_mask.filter(ImageFilter.GaussianBlur(5))

    tinted = Image.composite(colorized, rgb, recolor_mask)

    overlay = Image.new("RGBA", rgb.size, color + (0,))
    alpha = recolor_mask.point(lambda px: int(px * 0.18))
    overlay.putalpha(alpha)
    result = Image.alpha_composite(tinted.convert("RGBA"), overlay)
    return result


def contain_image(img: Image.Image, width: int, height: int) -> Image.Image:
    copy = img.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = (width - copy.width) // 2
    y = (height - copy.height) // 2
    canvas.alpha_composite(copy, (x, y))
    return canvas


def add_card(base: Image.Image) -> Image.Image:
    panel = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((26, 34, 874, 882), radius=CARD_RADIUS, fill=(0, 0, 0, 175))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    panel = Image.alpha_composite(panel, shadow)

    card = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)
    cdraw.rounded_rectangle((24, 24, 876, 876), radius=CARD_RADIUS, fill=(12, 12, 14, 168))
    cdraw.rounded_rectangle((24, 24, 876, 876), radius=CARD_RADIUS, outline=(255, 255, 255, 44), width=2)
    return Image.alpha_composite(Image.alpha_composite(base, panel), card)


def draw_text_and_qr(base: Image.Image, spec: dict, qr: Image.Image) -> Image.Image:
    canvas = base.copy()
    draw = ImageDraw.Draw(canvas)
    url_font = load_font(42, bold=True)
    body_font = load_font(23, bold=False)
    accent_font = load_font(25, bold=False)

    qr_size = 220
    qr_panel = Image.new("RGBA", (qr_size + 32, qr_size + 32), (255, 255, 255, 255))
    qmask = round_mask(qr_panel.size, 30)
    qr_panel.putalpha(qmask)
    qr_resized = qr.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    qr_panel.alpha_composite(qr_resized, (16, 16))
    canvas.alpha_composite(qr_panel, (632, 618))

    draw.text((58, 682), URL, font=url_font, fill=(255, 255, 255, 245))
    draw.text((60, 734), "Scan to browse meets, shows, cruises, and events", font=body_font, fill=(255, 255, 255, 205))
    draw.text((60, 790), spec["wheel_top"], font=accent_font, fill=spec["glow_color"] + (255,))
    draw.text((60, 824), spec["wheel_bottom"], font=body_font, fill=(255, 255, 255, 180))
    return canvas


def add_photo(canvas: Image.Image, spec: dict) -> Image.Image:
    src_path = ASSET_ROOT / spec["source"]
    src = Image.open(src_path).convert("RGBA")
    recolored = recolor_car(src, spec["car_color"])
    photo = contain_image(recolored, 786, 560)

    photo_shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(photo_shadow)
    sdraw.rounded_rectangle((54, 54, 846, 620), radius=36, fill=(0, 0, 0, 150))
    photo_shadow = photo_shadow.filter(ImageFilter.GaussianBlur(24))
    canvas = Image.alpha_composite(canvas, photo_shadow)

    photo_panel = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(photo_panel)
    pdraw.rounded_rectangle((56, 56, 844, 618), radius=36, fill=(255, 255, 255, 18))
    pdraw.rounded_rectangle((56, 56, 844, 618), radius=36, outline=(255, 255, 255, 32), width=2)
    canvas = Image.alpha_composite(canvas, photo_panel)

    photo_mask = Image.new("L", canvas.size, 0)
    mdraw = ImageDraw.Draw(photo_mask)
    mdraw.rounded_rectangle((56, 56, 844, 618), radius=36, fill=255)
    photo_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    photo_layer.alpha_composite(photo, (57, 57))
    photo_layer.putalpha(ImageChops.multiply(photo_layer.getchannel("A"), photo_mask))
    return Image.alpha_composite(canvas, photo_layer)


def make_sticker(spec: dict, qr: Image.Image) -> Path:
    base = make_background(spec)
    base = add_card(base)
    base = add_photo(base, spec)
    base = draw_text_and_qr(base, spec, qr)
    out = OUTPUT_DIR / spec["name"]
    base.save(out, dpi=(300, 300))
    return out


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    qr = fetch_qr()
    outputs = [make_sticker(spec, qr) for spec in SPECS]
    print("Created sticker files:")
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
