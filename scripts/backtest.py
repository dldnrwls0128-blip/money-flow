"""점수 항목·가중치 사후 분석 (연구용, 실서비스 점수에는 영향 없음)
- 대상: 현재 20일 평균 거래대금 30억↑ 종목(info 대상과 같은 507개 근처) → 생존 편향 있음
- 자료: 네이버 일봉(siseJson, 수정주가) + 투자자별 순매수(trend, 60일씩 과거로)
- 매일 장 마감 기준 5개 항목을 실서비스와 같은 식으로 다시 계산하고, 다음 5·10거래일 수익률과 비교
"""
import json, os, re, sys, time, math, random, urllib.request
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get("BT_CACHE", "/workspace/bt_cache")
UA = "Mozilla/5.0"
def get(url, raw=False):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://m.stock.naver.com/"}), timeout=15) as r:
                b = r.read(); return b if raw else json.loads(b)
        except Exception: time.sleep(1 + i)
    return None
def sise(sym, start="20250801", end="20261118"):
    b = get(f"https://api.finance.naver.com/siseJson.naver?symbol={sym}&requestType=1&startTime={start}&endTime={end}&timeframe=day", raw=True)
    rows = []
    for m in re.finditer(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', (b or b"").decode("utf-8", "ignore")):
        rows.append([m.group(1)] + [float(m.group(i)) for i in range(2, 7)])
    return rows
def flows(code, pages=5):
    out, bd = [], None
    for _ in range(pages):
        j = get(f"https://m.stock.naver.com/api/stock/{code}/trend?pageSize=60" + (f"&bizdate={bd}" if bd else ""))
        if not j: break
        out += j; bd = j[-1]["bizdate"]
        if len(j) < 60: break
    d = {}
    for x in out:
        def n(k):
            try: return float(str(x.get(k) or 0).replace(",", "").replace("+", ""))
            except ValueError: return 0.0
        d[x["bizdate"]] = (n("foreignerPureBuyQuant") + n("organPureBuyQuant"), n("accumulatedTradingVolume"))
    return d
def load(code):
    p = os.path.join(CACHE, code + ".json")
    if os.path.exists(p): return json.load(open(p))
    r = {"px": sise(code), "fl": flows(code)}
    json.dump(r, open(p, "w")); return r
clamp = lambda x, a, b: max(a, min(b, x))

def items(px, fl, mkt, t):
    """t: px 인덱스(그날 장 마감). 실서비스 score_parts와 같은 식. 반환: 0~1로 정규화한 5항목"""
    d, close, vol = px[t][0], px[t][4], px[t][5]
    days = [px[k][0] for k in range(t - 4, t + 1)]
    if any(x not in fl for x in days[-3:]): return None
    f5 = [fl[x] for x in days if x in fl]
    r1 = f5[-1][0] / f5[-1][1] if f5[-1][1] else 0
    v3 = sum(x[1] for x in f5[-3:]); r3 = sum(x[0] for x in f5[-3:]) / v3 if v3 else 0
    sup = clamp(1.5 + (0.5 * r1 + 0.5 * r3) * 7.5, 0, 3)
    hist = px[t - 60:t]
    tv20 = [r[4] * r[5] for r in hist[-20:]]; avg = sum(tv20) / 20
    val = clamp(close * vol / avg, 0, 2) if avg else 1.0
    per = 2 * sum(1 for x in f5 if x[0] > 0) / len(f5)
    chg = (close / px[t - 1][4] - 1) * 100
    mc = mkt.get(d); rel = chg - mc if mc is not None else 0
    cat = clamp(1 + rel / 4, 0, 2)
    hi, lo = max(r[2] for r in hist), min(r[3] for r in hist)
    pos = 1 - clamp((close - lo) / (hi - lo), 0, 1) if hi > lo else 0.5
    return [sup / 3, val / 2, per / 2, cat / 2, pos / 1]

def spearman(a, b):
    n = len(a)
    if n < 10: return None
    ra = {i: r for r, i in enumerate(sorted(range(n), key=lambda i: a[i]))}
    rb = {i: r for r, i in enumerate(sorted(range(n), key=lambda i: b[i]))}
    ma = mb = (n - 1) / 2
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    den = math.sqrt(sum((ra[i] - ma) ** 2 for i in range(n)) * sum((rb[i] - mb) ** 2 for i in range(n)))
    return num / den if den else None

def main():
    os.makedirs(CACHE, exist_ok=True)
    A = json.load(open(os.path.join(ROOT, "all.json")))["s"]
    pref = re.compile(r"(\d?우[A-C]?|우선주)$|스팩|SPAC|ETN|리츠$")
    codes = sorted(c for c, r in A.items() if r.get("s") is not None and not r.get("pf") and not pref.search(r["n"]) and (r.get("a20") or 0) >= 30)
    mk = {c: A[c]["m"] for c in codes}
    print("대상", len(codes), flush=True)
    idx = {}
    for k, sym in (("KS", "KOSPI"), ("KQ", "KOSDAQ")):
        rows = sise(sym); idx[k] = {rows[i][0]: (rows[i][4] / rows[i - 1][4] - 1) * 100 for i in range(1, len(rows))}
    t0 = time.time()
    with ThreadPoolExecutor(8) as ex: data = dict(zip(codes, ex.map(load, codes)))
    print("자료 받음", round(time.time() - t0), "초", flush=True)
    # 날짜별 횡단면
    per_day = {}
    for c in codes:
        px = [r for r in data[c]["px"] if r[2] > 0 and r[3] > 0 and r[4] > 0]
        fl = data[c]["fl"]
        for t in range(61, len(px) - 10):
            it = items(px, fl, idx.get(mk[c], {}), t)
            if not it: continue
            f5 = px[t + 5][4] / px[t][4] - 1; f10 = px[t + 10][4] / px[t][4] - 1
            if abs(f5) > 1.5 or abs(f10) > 2: continue   # 이상치(분할 미반영 등) 제외
            per_day.setdefault(px[t][0], []).append((it, f5, f10))
    days = sorted(d for d, v in per_day.items() if len(v) >= 100)
    print("분석일", len(days), days[0], "~", days[-1], "표본", sum(len(per_day[d]) for d in days), flush=True)
    W = {"현재(3·2·2·2·1)": [3, 2, 2, 2, 1], "수급4·가격0": [4, 2, 2, 2, 0], "동일(2·2·2·2·2)": [2, 2, 2, 2, 2],
         "수급만": [1, 0, 0, 0, 0], "거래대금만": [0, 1, 0, 0, 0], "지속성만": [0, 0, 1, 0, 0], "촉매만": [0, 0, 0, 1, 0], "가격위치만": [0, 0, 0, 0, 1],
         "수급3·지속2·가격2(거래대금·촉매 0)": [3, 0, 2, 0, 2], "촉매 0(3·2·2·0·1)": [3, 2, 2, 0, 1], "촉매0·가격3(3·2·2·0·3)": [3, 2, 2, 0, 3]}
    res = {}
    for name, w in W.items():
        out = {}
        for h, hi in (("5일", 1), ("10일", 2)):
            ics, spreads, hits, tops = [], [], [], []
            for di, d in enumerate(days):
                v = per_day[d]; sc = [sum(a * b for a, b in zip(x[0], w)) + random.random() * 1e-9 for x in v]; fr = [x[hi] for x in v]
                ic = spearman(sc, fr); 
                if ic is None: continue
                order = sorted(range(len(v)), key=lambda i: sc[i]); q = len(v) // 5
                bot = [fr[i] for i in order[:q]]; top = [fr[i] for i in order[-q:]]; allm = sum(fr) / len(fr)
                ics.append((di, ic)); spreads.append((di, sum(top) / q - sum(bot) / q)); tops.append((di, sum(top) / q - allm))
                hits.append((di, sum(1 for x in top if x > 0) / q))
            step = 5 if h == "5일" else 10   # 겹치지 않는 날만으로 t값
            nov = [ic for di, ic in ics if di % step == 0]
            m = sum(nov) / len(nov); sd = math.sqrt(sum((x - m) ** 2 for x in nov) / (len(nov) - 1)) if len(nov) > 1 else 0
            half = len(ics) // 2
            out[h] = {"IC": round(sum(x for _, x in ics) / len(ics), 4), "IC_t(비중첩)": round(m / sd * math.sqrt(len(nov)), 2) if sd else None, "비중첩일수": len(nov),
                      "IC_앞절반": round(sum(x for _, x in ics[:half]) / half, 4), "IC_뒤절반": round(sum(x for _, x in ics[half:]) / (len(ics) - half), 4),
                      "상위20%-하위20%(%p)": round(sum(x for _, x in spreads) / len(spreads) * 100, 2), "상위20%-전체(%p)": round(sum(x for _, x in tops) / len(tops) * 100, 2),
                      "상위20%_상승비율(%)": round(sum(x for _, x in hits) / len(hits) * 100, 1), "IC>0인_날(%)": round(sum(1 for _, x in ics if x > 0) / len(ics) * 100, 1)}
        res[name] = out; print(name, json.dumps(out, ensure_ascii=False), flush=True)
    base_up = {h: round(sum(sum(1 for x in per_day[d] if x[hi] > 0) / len(per_day[d]) for d in days) / len(days) * 100, 1) for h, hi in (("5일", 1), ("10일", 2))}
    meta = {"stocks": len(codes), "days": len(days), "from": days[0], "to": days[-1], "obs": sum(len(per_day[d]) for d in days), "base_up_pct": base_up}
    json.dump({"meta": meta, "res": res}, open(os.path.join(CACHE, "_result.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False))
if __name__ == "__main__": main()
