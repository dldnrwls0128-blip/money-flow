#!/usr/bin/env python3
"""종목 로고를 한 번 받아 64px webp 로 logos/ 에 저장 (앱은 같은 사이트에서만 불러옴).
출처: 국내·미국 = 네이버 증권 로고 CDN(ssl.pstatic.net), 없으면 미국은 financialmodelingprep 공개 이미지,
코인 = CoinGecko. 이미 있는 파일은 다시 받지 않고, 없던 로고는 7일마다 다시 시도."""
import io, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "logos")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36"
CFG = json.load(open(os.path.join(ROOT, "config.json"), encoding="utf-8"))
os.makedirs(OUT, exist_ok=True)
MISS_P = os.path.join(OUT, "_missing.json")
miss = json.load(open(MISS_P)) if os.path.exists(MISS_P) else {}

def dl(url, image=True):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            if r.status != 200 or (image and not r.headers.get("Content-Type", "").startswith("image")): return None
            return r.read()
    except Exception:
        return None

def save(code, urls):
    path = os.path.join(OUT, f"{code}.webp")
    if os.path.exists(path): return True
    if code in miss and time.time() - miss[code] < 7 * 86400: return False
    for u in urls:
        b = dl(u)
        if not b: continue
        try:
            im = Image.open(io.BytesIO(b)).convert("RGBA")
            w, h = im.size; s = min(w, h)
            im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((64, 64), Image.LANCZOS)
            im.save(path, "WEBP", quality=82, method=6)
            miss.pop(code, None)
            return True
        except Exception:
            continue
    miss[code] = time.time()
    return False

def main():
    codes = list(json.load(open(os.path.join(ROOT, "all.json"), encoding="utf-8"))["s"].keys())
    jobs = [(c, [f"https://ssl.pstatic.net/imgstock/fn/real/logo/png/stock/Stock{c}.png"]) for c in codes]
    jobs += [(s, [f"https://ssl.pstatic.net/imgstock/fn/real/logo/png/stock/Stock{s}.png",
                  f"https://financialmodelingprep.com/image-stock/{s}.png"]) for s in CFG["us_symbols"]]
    for cid in CFG["coins"]:
        try:
            j = json.loads(dl(f"https://api.coingecko.com/api/v3/coins/{cid}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false", image=False) or b"{}")
            jobs.append((cid, [j["image"]["large"]]))
        except Exception:
            pass
    t0 = time.time()
    before = len([f for f in os.listdir(OUT) if f.endswith(".webp")])
    with ThreadPoolExecutor(16) as ex:
        list(ex.map(lambda j: save(*j), jobs))
    have = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".webp"))
    json.dump(have, open(os.path.join(OUT, "index.json"), "w"), separators=(",", ":"))
    json.dump(miss, open(MISS_P, "w"))
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    if os.environ.get("GITHUB_OUTPUT") and len(have) != before:
        open(os.environ["GITHUB_OUTPUT"], "a").write("logos_changed=true\n")
    print(f"logos: {len(have)}/{len(jobs)} 보유, 없음 {len(miss)}, {size/1e6:.1f}MB, {time.time()-t0:.0f}초")

if __name__ == "__main__":
    main()
