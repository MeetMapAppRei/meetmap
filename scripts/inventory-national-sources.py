"""Quick inventory of non-IG flyer sources (no downloads)."""
import gzip
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip"}


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    data = urllib.request.urlopen(req, timeout=45).read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return data.decode("utf-8", "replace")


home = fetch_text("https://www.carshownationals.com/")
states = sorted(set(re.findall(r"https://www.carshownationals.com/[a-z0-9-]+-car-shows/", home, re.I)))
print(f"CSN state pages: {len(states)}")

for gg in [
    "https://good-guys.com/events/2026-events",
    "https://good-guys.com/events/2026-event-tickets",
]:
    try:
        h = fetch_text(gg)
        pdfs = set(re.findall(r"https?://[^\"'\s>]+\.pdf", h, re.I))
        pdfs |= {
            "https://www.good-guys.com" + p.split("?")[0]
            for p in re.findall(r"/pdf/[^\"'\s>]+\.pdf", h, re.I)
        }
        print(f"{gg}: {len(pdfs)} pdf links")
        for p in sorted(pdfs)[:8]:
            print(f"  {p}")
    except Exception as e:
        print(f"{gg}: ERR {e}")

print("Sample regional PDF sources:")
samples = [
    "https://www.longislandcarclubs.org/_files/ugd/5a19f9_f497df0965f84ea4a6d66c019966690d.pdf",
    "https://vamnj.org/events/files/VAMNJ_Calendar_2026.pdf",
    "http://www.quailrunrv.com/cruise/Cruise_In_Flyer.pdf",
    "https://www.americanmusclecarmuseum.com/files/events/2026-aaca-celebration-of-cars-67.pdf",
]
for u in samples:
    try:
        req = urllib.request.Request(u, headers=UA, method="HEAD")
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"OK {r.status} {u}")
    except Exception as e:
        print(f"FAIL {u}: {e}")
