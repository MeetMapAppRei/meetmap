"""Probe and collect public car-show flyers from non-Instagram web sources."""
from __future__ import annotations

import gzip
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "instagram-events" / "web-national-to-post"
TODAY = date.today()
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "gzip",
}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        enc = (resp.headers.get("Content-Encoding") or "").lower()
    if data[:2] == b"\x1f\x8b" or "gzip" in enc:
        try:
            data = gzip.decompress(data)
        except Exception:
            pass
    return data


def fetch_text(url: str) -> str:
    return fetch(url).decode("utf-8", "replace")


def slug(s: str, n: int = 48) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:n].strip("-") or "event"


def banner_jpeg(src: Path, dest: Path, banner: str) -> None:
    img = Image.open(src).convert("RGB")
    w, h = img.size
    max_w = 1600
    if w > max_w:
        nh = int(h * max_w / w)
        img = img.resize((max_w, nh), Image.Resampling.LANCZOS)
        w, h = img.size
    bh = max(64, int(h * 0.07))
    out = Image.new("RGB", (w, h + bh), (18, 18, 18))
    out.paste(img, (0, 0))
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("segoeui.ttf", max(16, int(bh * 0.36)))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), banner, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2, h + (bh - th) / 2), banner, fill="white", font=font)
    out.save(dest, "JPEG", quality=85, optimize=True)


def pdf_to_jpeg(src: Path, dest: Path, banner: str) -> None:
    tmp = dest.with_suffix(".raw.jpg")
    doc = fitz.open(src)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
    pix.save(str(tmp))
    doc.close()
    banner_jpeg(tmp, dest, banner)
    tmp.unlink(missing_ok=True)


def save_pdf(url: str, dest: Path, banner: str) -> bool:
    if dest.exists() and dest.stat().st_size > 8000:
        print(f"SKIP {dest.name}")
        return True
    raw = OUT / "raw" / dest.with_suffix(".pdf").name
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_bytes(fetch(url))
    pdf_to_jpeg(raw, dest, banner)
    print(f"OK {dest.name} ({dest.stat().st_size})")
    return True


def collect_goodguys() -> int:
    """Goodguys publishes weekend PDF flyers for each national event."""
    pages = [
        "https://good-guys.com/events/2026-events",
        "https://good-guys.com/events/2026-event-tickets",
    ]
    pdfs: set[str] = set()
    for page in pages:
        try:
            html = fetch_text(page)
        except Exception as e:
            print(f"goodguys skip {page}: {e}")
            continue
        for u in re.findall(r"https?://[^\"'\\s>]+good-guys\.com/pdf/[^\"'\\s>]+\.pdf", html, re.I):
            pdfs.add(u.replace("http://", "https://").split("?")[0])
        for u in re.findall(r"/pdf/[^\"'\\s>]+\.pdf", html, re.I):
            pdfs.add(f"https://www.good-guys.com{u.split('?')[0]}")
    print(f"goodguys pdf urls: {len(pdfs)}")
    ok = 0
    for url in sorted(pdfs):
        stem = Path(url).stem
        name = f"goodguys-{slug(stem)}-flyer.jpg"
        dest = OUT / name
        try:
            if save_pdf(url, dest, f"Goodguys {stem.replace('-', ' ')}"):
                ok += 1
        except Exception as e:
            print(f"FAIL {url}: {e}")
        time.sleep(0.2)
    return ok


def collect_csn_state_pages() -> int:
    """Car Show Nationals — every state sidebar page."""
    home = fetch_text("https://www.carshownationals.com/")
    pages = sorted(
        set(
            re.findall(
                r"https://www\.carshownationals\.com/[a-z0-9-]+-car-shows/",
                home,
                re.I,
            )
        )
    )
    print(f"csn state pages: {len(pages)}")
    url_re = re.compile(
        r"https://www\.carshownationals\.com/wp-content/uploads/[^\"'>\s]+\.(?:pdf|jpe?g|png)",
        re.I,
    )
    all_urls: list[str] = []
    for page in pages:
        try:
            html = fetch_text(page)
            urls = url_re.findall(html)
            print(f"  {page.split('/')[-2]}: {len(urls)} assets")
            all_urls.extend(urls)
        except Exception as e:
            print(f"  skip {page}: {e}")
        time.sleep(0.15)
    seen: set[str] = set()
    ok = 0
    for url in all_urls:
        url = url.split("?")[0]
        if url.lower() in seen:
            continue
        seen.add(url.lower())
        name = url.split("/")[-1]
        if not re.search(r"\d{1,2}-\d{1,2}-(?:2026|2027)", name):
            continue
        stem = slug(Path(name).stem)
        dest = OUT / f"csn-state-{stem}-flyer.jpg"
        if dest.exists() and dest.stat().st_size > 8000:
            ok += 1
            continue
        try:
            raw = OUT / "raw" / name
            raw.parent.mkdir(parents=True, exist_ok=True)
            raw.write_bytes(fetch(url))
            if name.lower().endswith(".pdf"):
                pdf_to_jpeg(raw, dest, stem.replace("-", " "))
            else:
                banner_jpeg(raw, dest, stem.replace("-", " "))
            print(f"OK {dest.name}")
            ok += 1
        except Exception as e:
            print(f"FAIL {name}: {e}")
        time.sleep(0.1)
    return ok


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    g = collect_goodguys()
    c = collect_csn_state_pages()
    n = len(list(OUT.glob("*.jpg")))
    print(f"done goodguys={g} csn={c} total_jpg={n} dir={OUT}")


if __name__ == "__main__":
    main()
