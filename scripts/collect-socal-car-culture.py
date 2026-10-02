"""Collect unique upcoming flyers from socalcarculture.com/events.html."""
from __future__ import annotations

import html as htmlmod
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import fitz

REPO = Path(__file__).resolve().parents[1]
WORK = REPO / "instagram-events" / "socal-car-culture"
OUT_DIR = REPO / "instagram-events" / "socal-car-culture-to-post"
HTML_PATH = WORK / "events.html"
BASE = "http://www.socalcarculture.com/"
TODAY = date.today()
MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = s.replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def slug(s: str, n: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:n].strip("-") or "event"


def parse_events(raw: str) -> list[dict]:
    month = TODAY.month
    year = TODAY.year
    events = []
    rows = re.findall(r"<tr\b[^>]*>.*?</tr>", raw, flags=re.I | re.S)
    for row in rows:
        ym = re.search(r"year_(\d{4})\.gif", row)
        if ym:
            year = int(ym.group(1))
            continue
        m = re.search(r"month_([A-Za-z]+)\.gif", row, flags=re.I)
        if m:
            month = MONTHS[m.group(1).lower()]
            continue
        tds = re.findall(r"<td\b[^>]*>(.*?)</td>", row, flags=re.I | re.S)
        if len(tds) < 2:
            continue
        day_txt = strip_tags(tds[0])
        if not re.match(r"^\d{1,2}(?:-\d{1,2})?$", day_txt):
            continue
        day = int(day_txt.split("-")[0])
        body = tds[1]
        recurring = bool(re.search(r"#FFCC00", body, flags=re.I))
        flyer_m = re.search(
            r'href="(Images/[^"]+\.(?:pdf|jpe?g|png|gif))"', body, flags=re.I
        )
        if not flyer_m:
            continue
        flyer = flyer_m.group(1).replace("\\", "/")
        text = strip_tags(body)
        text = re.sub(r"\s*Flyer-?\s*V?\s*$", "", text, flags=re.I)
        text = re.sub(r"\s*Info-?\s*V?\s*$", "", text, flags=re.I)
        text = text.replace("*", "").strip(" -")
        try:
            ev_date = date(year, month, day)
        except ValueError:
            continue
        events.append(
            {
                "date": ev_date,
                "recurring": recurring,
                "flyer": flyer,
                "text": text,
            }
        )
    return events


def pick_unique(events: list[dict]) -> list[dict]:
    chosen = []
    seen_flyers = set()
    for ev in events:
        if ev["date"] <= TODAY:
            continue
        if ev["recurring"]:
            continue
        fname = ev["flyer"].split("/")[-1]
        if fname.lower().startswith("cruisenight_"):
            continue
        if ev["flyer"].lower() in seen_flyers:
            continue
        if not re.search(r"\d{2,5}\s+\S+", ev["text"]):
            if not re.match(r"^\d{6}", fname):
                continue
        if re.search(r"free oil filter|vendor space", ev["text"], flags=re.I):
            continue
        seen_flyers.add(ev["flyer"].lower())
        chosen.append(ev)
    return chosen


def banner_jpeg(src_path: Path, dest_path: Path, banner: str) -> None:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.open(src_path).convert("RGB")
    w, h = img.size
    banner_h = max(72, int(h * 0.07))
    out = Image.new("RGB", (w, h + banner_h), (18, 18, 18))
    out.paste(img, (0, 0))
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("segoeui.ttf", max(18, int(banner_h * 0.38)))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), banner, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2, h + (banner_h - th) / 2), banner, fill="white", font=font)
    out.save(dest_path, "JPEG", quality=88, optimize=True)


def pdf_or_image_to_jpeg(src: Path, dest: Path, banner: str) -> None:
    ext = src.suffix.lower()
    tmp = dest.with_suffix(".raw.jpg")
    if ext == ".pdf":
        doc = fitz.open(src)
        pix = doc[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        pix.save(str(tmp))
        doc.close()
    else:
        from PIL import Image

        Image.open(src).convert("RGB").save(tmp, "JPEG", quality=90)
    banner_jpeg(tmp, dest, banner)
    tmp.unlink(missing_ok=True)


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    download(BASE + "events.html", HTML_PATH)
    raw = HTML_PATH.read_text(encoding="latin-1", errors="ignore")
    events = parse_events(raw)
    chosen = pick_unique(events)
    print(f"parsed={len(events)} unique_upcoming={len(chosen)}")
    ok = 0
    for i, ev in enumerate(chosen, 1):
        href = ev["flyer"]
        url = BASE + urllib.parse.quote(href, safe="/")
        fname = href.split("/")[-1]
        city = re.sub(r"\*+", "", ev["text"].split(" - ", 1)[0]).strip()
        out_name = f"socal-{ev['date'].isoformat()}-{slug(city)}-{slug(Path(fname).stem, 36)}-flyer.jpg"
        dest = OUT_DIR / out_name
        if dest.exists() and dest.stat().st_size > 8000:
            print(f"SKIP exists {out_name}")
            ok += 1
            continue
        src = WORK / "pdfs" / fname
        src.parent.mkdir(exist_ok=True)
        try:
            if not src.exists() or src.stat().st_size < 2000:
                download(url, src)
            banner = f"{ev['text'][:110]}  |  {ev['date'].strftime('%b %d, %Y')}  |  California"
            pdf_or_image_to_jpeg(src, dest, banner)
            print(f"OK {i:02d}/{len(chosen)} {out_name} ({dest.stat().st_size})")
            ok += 1
        except Exception as e:
            print(f"FAIL {fname}: {e}")
    print(f"saved={ok} dir={OUT_DIR}")


if __name__ == "__main__":
    main()
