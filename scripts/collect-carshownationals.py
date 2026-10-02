"""Collect unique upcoming flyers from carshownationals.com month calendars."""
from __future__ import annotations

import argparse
import calendar
import gzip
import os
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

TODAY = date.today()
YEAR = TODAY.year
REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "instagram-events" / "carshownationals"
OUT = REPO / "instagram-events" / "carshownationals-to-post"

# Mountain / central US — extra state-page harvest when --region central
CENTRAL_STATE_SLUGS = [
    "colorado",
    "utah",
    "new-mexico",
    "arizona",
    "wyoming",
    "idaho",
    "montana",
    "nevada",
    "kansas",
    "nebraska",
    "oklahoma",
    "north-dakota",
    "south-dakota",
    "iowa",
    "missouri",
    "arkansas",
    "texas",
]
CENTRAL_STATE_KEYS = {
    "CO",
    "UT",
    "NM",
    "AZ",
    "WY",
    "ID",
    "MT",
    "NV",
    "KS",
    "NE",
    "OK",
    "ND",
    "SD",
    "IA",
    "MO",
    "AR",
    "TX",
    "Colorado",
    "Utah",
    "New-Mexico",
    "Arizona",
    "Wyoming",
    "Idaho",
    "Montana",
    "Nevada",
    "Kansas",
    "Nebraska",
    "Oklahoma",
    "North-Dakota",
    "South-Dakota",
    "Iowa",
    "Missouri",
    "Arkansas",
    "Texas",
}
SKIP_NAME = re.compile(
    r"(cropped-|logo|advertise|submit-your|buckleup|outlaw|zazzle|boss-hog|pinks-all-out|scaled-2)",
    re.I,
)
SIZE_SUFFIX = re.compile(r"-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|gif)$)", re.I)
PAGE_SUFFIX = re.compile(r"-page-\d+", re.I)
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "gzip",
}


def month_pages() -> list[str]:
    pages = []
    y, m = TODAY.year, TODAY.month
    for _ in range(4):
        name = calendar.month_name[m].lower()
        pages.append(f"https://www.carshownationals.com/{name}-car-shows/")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return pages


def state_pages(slugs: list[str]) -> list[str]:
    return [f"https://www.carshownationals.com/{slug}-car-shows/" for slug in slugs]


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


def canonical_name(name: str) -> str:
    n = PAGE_SUFFIX.sub("", name)
    n = SIZE_SUFFIX.sub("", n)
    return n.lower()


def parse_start_date(name: str) -> date | None:
    m = re.search(rf"(\d{{1,2}})-(\d{{1,2}})(?:-(\d{{1,2}}))?-({YEAR}|{YEAR + 1})", name)
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    year = int(m.group(4))
    try:
        return date(year, a, b)
    except ValueError:
        return None


def is_weekly_series(name: str) -> bool:
    head = re.split(rf"{YEAR}|{YEAR + 1}", name, maxsplit=1)[0]
    nums = re.findall(r"\d{1,2}", head)
    return len(nums) >= 8


def collect_urls(html: str) -> list[str]:
    found = re.findall(
        r"""https?://(?:www\.)?carshownationals\.com/wp-content/uploads/[^"'>\s]+\.(?:pdf|jpe?g|png|gif)""",
        html,
        re.I,
    )
    out = []
    seen = set()
    for u in found:
        u = u.replace("http://", "https://").split("?")[0]
        if u.lower() in seen:
            continue
        seen.add(u.lower())
        out.append(u)
    return out


STATE_RE = re.compile(
    r"-(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)(?:-|\.|$)",
    re.I,
)
STATE_NAME_RE = re.compile(
    r"(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New-Hampshire|New-Jersey|New-Mexico|New-York|North-Carolina|North-Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode-Island|South-Carolina|South-Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West-Virginia|Wisconsin|Wyoming)",
    re.I,
)


def state_key(name: str) -> str:
    m = STATE_RE.search(name)
    if m:
        return m.group(1).upper()
    m = STATE_NAME_RE.search(name.replace(" ", "-"))
    if m:
        return m.group(1).title()
    return "UNK"


def spread_pick(chosen: list[tuple[str, date, str]], per_state: int = 3, limit: int = 80):
    by: dict[str, list] = {}
    for item in chosen:
        key = state_key(item[0].split("/")[-1] + " " + item[2])
        by.setdefault(key, []).append(item)
    picked = []
    idx = {k: 0 for k in by}
    while len(picked) < limit:
        progressed = False
        for k in sorted(by):
            if idx[k] >= min(per_state, len(by[k])):
                continue
            picked.append(by[k][idx[k]])
            idx[k] += 1
            progressed = True
            if len(picked) >= limit:
                break
        if not progressed:
            break
    picked.sort(key=lambda x: (x[1], x[2]))
    print(
        "states represented",
        len({state_key(p[0].split("/")[-1] + " " + p[2]) for p in picked}),
    )
    return picked


def pick_best(
    urls: list[str],
    *,
    per_state: int = 3,
    limit: int = 80,
    region_filter: set[str] | None = None,
) -> list[tuple[str, date, str]]:
    buckets: dict[str, list[str]] = {}
    for u in urls:
        name = u.split("/")[-1]
        if SKIP_NAME.search(name):
            continue
        if is_weekly_series(name):
            continue
        dt = parse_start_date(name)
        if not dt or dt <= TODAY:
            continue
        canon = canonical_name(name)
        buckets.setdefault(canon, []).append(u)

    chosen = []
    for canon, group in buckets.items():

        def score(u: str) -> tuple:
            n = u.split("/")[-1]
            is_pdf = n.lower().endswith(".pdf")
            is_orig = SIZE_SUFFIX.search(n) is None
            return (0 if is_pdf else 1, 0 if is_orig else 1, -len(n))

        best = sorted(group, key=score)[0]
        dt = parse_start_date(best.split("/")[-1])
        if region_filter:
            key = state_key(best.split("/")[-1] + " " + canon)
            if key not in region_filter and key != "UNK":
                continue
        chosen.append((best, dt, canon))
    chosen.sort(key=lambda x: (x[1], x[2]))
    return spread_pick(chosen, per_state=per_state, limit=limit)


def slug(s: str, n: int = 50) -> str:
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


def to_jpeg(src: Path, dest: Path, banner: str) -> None:
    tmp = dest.with_suffix(".raw.jpg")
    if src.suffix.lower() == ".pdf":
        doc = fitz.open(src)
        pix = doc[0].get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
        pix.save(str(tmp))
        doc.close()
    else:
        Image.open(src).convert("RGB").save(tmp, "JPEG", quality=90)
    banner_jpeg(tmp, dest, banner)
    tmp.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Collect Car Show Nationals flyers")
    p.add_argument(
        "--region",
        choices=["national", "central"],
        default=os.environ.get("CSN_REGION", "national"),
        help="national = month calendars; central = mountain/plains state pages",
    )
    p.add_argument("--out", default="", help="Output folder (relative to repo or absolute)")
    p.add_argument("--per-state", type=int, default=0)
    p.add_argument("--limit", type=int, default=0)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = OUT
    per_state = 3
    limit = 80
    region_filter = None
    pages = month_pages()
    if args.region == "central":
        pages = state_pages(CENTRAL_STATE_SLUGS)
        out_dir = REPO / "instagram-events" / "carshownationals-central-to-post"
        per_state = 12
        limit = 120
        region_filter = CENTRAL_STATE_KEYS
    if args.out:
        out_dir = Path(args.out)
        if not out_dir.is_absolute():
            out_dir = REPO / out_dir
    if args.per_state:
        per_state = args.per_state
    if args.limit:
        limit = args.limit

    ROOT.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    all_urls = []
    for page in pages:
        print("fetch", page)
        try:
            html = fetch_text(page)
        except Exception as e:
            print(f"  skip page: {e}")
            continue
        slugp = page.rstrip("/").split("/")[-1]
        (ROOT / f"{slugp}.html").write_text(html, encoding="utf-8")
        urls = collect_urls(html)
        print(f"  raw urls {len(urls)}")
        all_urls.extend(urls)
        time.sleep(0.3)
    picked = pick_best(
        all_urls, per_state=per_state, limit=limit, region_filter=region_filter
    )
    print(f"unique upcoming one-off: {len(picked)}")
    ok = 0
    for i, (url, dt, canon) in enumerate(picked, 1):
        name = url.split("/")[-1]
        src = ROOT / "src" / name
        src.parent.mkdir(exist_ok=True)
        stem = Path(canonical_name(name)).stem
        out_name = f"csn-{dt.isoformat()}-{slug(stem)}-flyer.jpg"
        dest = out_dir / out_name
        if dest.exists() and dest.stat().st_size > 8000:
            print(f"SKIP exists {out_name}")
            ok += 1
            continue
        try:
            if not src.exists() or src.stat().st_size < 2000:
                src.write_bytes(fetch(url))
            banner = f"{stem.replace('-', ' ')}  |  {dt.strftime('%b %d, %Y')}"
            to_jpeg(src, dest, banner)
            print(f"OK {i:03d}/{len(picked)} {out_name} ({dest.stat().st_size})")
            ok += 1
        except Exception as e:
            print(f"FAIL {name}: {e}")
        time.sleep(0.15)
    print(f"saved={ok} dir={out_dir}")


if __name__ == "__main__":
    main()
