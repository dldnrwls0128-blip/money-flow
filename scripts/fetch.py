#!/usr/bin/env python3
"""네이버 금융 공개 엔드포인트에서 시세·수급을 받아 data.json 을 만든다.
- 일별 데이터(투자자별 순매수, 60일 일봉)는 하루 한 번만 받아 cache/daily.json 에 저장
- 장중에는 지수·업종 등락·종목 현재가만 다시 받아 점수 재계산
지어낸 숫자 없음: 받지 못한 값은 null 로 둔다.
"""
import json, os, re, sys, time, datetime as dt, hashlib
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KST = dt.timezone(dt.timedelta(hours=9))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
CFG = json.load(open(os.path.join(ROOT, "config.json"), encoding="utf-8"))
ERRORS = []

def get(url, tries=3, raw=False):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://m.stock.naver.com/"})
            with urllib.request.urlopen(req, timeout=20) as r:
                b = r.read()
                return b if raw else json.loads(b.decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    ERRORS.append(f"{url.split('?')[0]}: {last}")
    return None

def num(s):
    if s is None: return None
    if isinstance(s, (int, float)): return s
    s = str(s).replace(",", "").replace("+", "").replace("%", "").strip()
    try: return float(s)
    except ValueError: return None

def clamp(x, a, b): return max(a, min(b, x))

PREF = re.compile(r"(\d?우[A-C]?|우선주)$|스팩|SPAC|ETN|리츠$")

# ---------------- 일별 캐시 ----------------
def stock_daily(code):
    tr = get(f"https://m.stock.naver.com/api/stock/{code}/trend?pageSize=20") or []
    end = dt.datetime.now(KST).strftime("%Y%m%d")
    start = (dt.datetime.now(KST) - dt.timedelta(days=380)).strftime("%Y%m%d")
    raw = get(f"https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&startTime={start}&endTime={end}&timeframe=day", raw=True)
    rows = []
    if raw:
        for m in re.finditer(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', raw.decode("utf-8", "ignore")):
            rows.append([m.group(1)] + [float(m.group(i)) for i in range(2, 7)])
    today = end
    full = [r for r in rows if r[0] < today]  # 완료된 거래일만 (약 1년)
    hist = full[-60:]
    flows = []
    for t in tr[:20]:
        v = num(t.get("accumulatedTradingVolume")) or 0
        flows.append({"d": t["bizdate"], "f": num(t.get("foreignerPureBuyQuant")) or 0,
                      "o": num(t.get("organPureBuyQuant")) or 0, "v": v, "c": num(t.get("closePrice")) or 0})
    if not hist:
        return None
    tv20 = [r[4] * r[5] for r in hist[-20:]]
    y1 = [r for r in full[-250:] if r[2] > 0 and r[3] > 0] or hist   # 52주 = 최근 약 250거래일 (거래정지 0값 제외)
    # v1.9: ATR(14일 평균 하루 변동폭), 최근 4거래일 중 거래대금이 그 전 20일 평균보다 많았던 날 수
    ok = [r for r in full if r[2] > 0 and r[3] > 0 and r[4] > 0]   # 거래정지(0값) 날 제외
    trs = [max(ok[i][2], ok[i - 1][4]) - min(ok[i][3], ok[i - 1][4]) for i in range(max(1, len(ok) - 14), len(ok))]
    atr = sum(trs) / len(trs) if len(trs) >= 10 else None
    tvs = [r[4] * r[5] for r in full]
    up4 = sum(1 for i in range(len(tvs) - 4, len(tvs)) if i >= 20 and tvs[i] > sum(tvs[i - 20:i]) / 20)
    cl = [r[4] for r in full[-21:]]
    ch = [(cl[i] / cl[i - 1] - 1) * 100 for i in range(1, len(cl)) if cl[i - 1] > 0]
    vol20 = (sum((x - sum(ch) / len(ch)) ** 2 for x in ch) / (len(ch) - 1)) ** 0.5 if len(ch) >= 10 else None
    return {"flows": flows, "hi60": max(r[2] for r in hist), "lo60": min(r[3] for r in hist),
            "vol20": round(vol20, 3) if vol20 is not None else None, "hi19": max(r[2] for r in full[-19:]),
            "atr": round(atr, 4) if atr else None, "up4": up4,
            "hi52": max(r[2] for r in y1), "lo52": min(r[3] for r in y1),
            "hi52d": max(y1, key=lambda r: r[2])[0], "lo52d": min(y1, key=lambda r: r[3])[0],
            "avgtv20": sum(tv20) / len(tv20), "last": hist[-1][0],
            "sr": sr_from_rows([(r[0], r[2], r[3]) for r in ok])}

def _md(d):
    y = dt.datetime.now(KST).year
    return (f"{d[2:4]}." if int(d[:4]) != y else "") + f"{int(d[4:6])}/{int(d[6:8])}"

def sr_from_rows(rows):
    """rows: [(yyyymmdd, high, low)] 완료 일봉. 실제 일봉 저점(지지)·고점(저항) 후보."""
    if not rows: return None
    S, R = [], []
    def lo_n(n, name):
        seg = rows[-n:]; r = min(seg, key=lambda x: x[2]); S.append([r[2], f"{name} 저점({_md(r[0])})"])
    def hi_n(n, name):
        seg = rows[-n:]; r = max(seg, key=lambda x: x[1]); R.append([r[1], f"{name} 고점({_md(r[0])})"])
    lo_n(10, "10일"); lo_n(20, "20일"); lo_n(60, "60일"); lo_n(len(rows), "52주")
    hi_n(20, "20일"); hi_n(60, "60일"); hi_n(len(rows), "52주")
    seg = rows[-120:]
    for i in range(2, len(seg) - 2):  # 스윙 저점/고점: 앞뒤 2일보다 낮은/높은 봉
        d, h, l = seg[i]
        if all(l < seg[j][2] for j in (i-2, i-1, i+1, i+2)): S.append([l, f"일봉 저점({_md(d)})"])
        if all(h > seg[j][1] for j in (i-2, i-1, i+1, i+2)): R.append([h, f"일봉 고점({_md(d)})"])
    def dedup(xs):
        out = {}
        for v, n in xs:
            if v not in out or not n.startswith("일봉"): out[v] = n
        return sorted([[v, n] for v, n in out.items()])
    return {"S": dedup(S), "R": dedup(R)}

def levels(c, sr, base_pct=None):
    """현재가 c 와 지지·저항 후보로 1·2차 매수, 손절, 1·2차 목표 산출. 없으면 None."""
    if not sr or not c: return None
    S, R = sr["S"], sr["R"]
    min10 = next((x for x in S if x[1].startswith("10일")), None)
    if min10 and min10[0] <= c:
        b1 = min10
    else:  # 최근 저점을 이미 깨고 내려온 경우: 현재가 아래 가장 가까운 실제 저점
        b1 = max((x for x in S if x[0] <= c), key=lambda x: x[0], default=None)
    nosup = False
    if not b1:  # 52주 저점까지 깨고 내려와 아래에 실제 지지선이 없는 경우 (신저가)
        nosup = True
        b1 = [c, "신저가: 아래 지지선 없음 → 현재가"]
    b2 = max((x for x in S if x[0] <= b1[0] * 0.97), key=lambda x: x[0], default=None)
    if nosup:
        b2 = [c * 0.97, "신저가: 현재가 −3%"]
    lv = {"buy1": b1[0], "buy1_why": b1[1], "nosup": nosup}
    if b2:
        lv.update(buy2=b2[0], buy2_why=b2[1])
        st = max((x for x in S if x[0] <= b2[0] * 0.965), key=lambda x: x[0], default=None)
        if st:
            lv.update(stop=st[0] * 0.995, stop_why=st[1] + " 바로 밑")
        else:
            lv.update(stop=b2[0] * 0.96, stop_why="더 낮은 일봉 저점이 없어 매수 구간 아래쪽 −4%")
    else:
        lv.update(stop=b1[0] * 0.96, stop_why="더 낮은 일봉 저점이 없어 매수가 −4%")
    s1 = min((x for x in R if x[0] >= max(b1[0] * 1.04, c)), key=lambda x: x[0], default=None)
    if s1:
        lv.update(sell1=s1[0], sell1_why=s1[1])
        s2 = min((x for x in R if x[0] >= s1[0] * 1.04), key=lambda x: x[0], default=None)
        if s2: lv.update(sell2=s2[0], sell2_why=s2[1])
    return lv

def tick_kr(v):
    for lim, t in ((2000, 1), (5000, 5), (20000, 10), (50000, 50), (200000, 100), (500000, 500)):
        if v < lim: return t
    return 1000

def round_levels(lv, kr=True):
    if not lv: return lv
    for k in ("buy1", "buy2", "stop", "sell1", "sell2"):
        if k in lv:
            v = lv[k]
            if kr:
                t = tick_kr(v); v = (v // t) * t if k == "stop" else round(v / t) * t
                lv[k] = int(v)
            else:
                lv[k] = round(v, 2 if v >= 1 else 4)
    return lv

def build_daily(codes):
    out = {}
    with ThreadPoolExecutor(12) as ex:
        for c, d in zip(codes, ex.map(stock_daily, codes)):
            if d: out[c] = d
    return out

# ---------------- 점수 ----------------
def session_frac(now):
    m = (now.hour * 60 + now.minute) - 9 * 60
    return clamp(m / 390.0, 0.08, 1.0)

def score_parts(flows, tv_today, avgtv20, frac, chg, mkt_chg, price, lo60, hi60, lo52=None, hi52=None, breadth=None, pos_override=None, p52_override=None):
    """점수 5항목과 실제 근거 수치(facts)를 돌려준다."""
    f = {}
    fl5 = flows[:5] if flows else []
    if fl5:
        r1 = (fl5[0]["f"] + fl5[0]["o"]) / fl5[0]["v"] if fl5[0]["v"] else 0
        v3 = sum(x["v"] for x in fl5[:3]); r3 = sum(x["f"] + x["o"] for x in fl5[:3]) / v3 if v3 else 0
        s_sup = clamp(1.5 + (0.5 * r1 + 0.5 * r3) * 7.5, 0, 3)
        f["fo"] = round(fl5[0]["f"] * fl5[0]["c"] / 1e8); f["oo"] = round(fl5[0]["o"] * fl5[0]["c"] / 1e8)
        f["r1"] = round(r1 * 100, 1); f["fd"] = fl5[0]["d"]
        pd = sum(1 for x in fl5 if x["f"] + x["o"] > 0)
        s_per = 2 * pd / len(fl5); f["pd"] = pd; f["n"] = len(fl5)
        sk = 0; sign = 1 if flows[0]["f"] + flows[0]["o"] > 0 else -1
        for x in flows:
            if (x["f"] + x["o"] > 0) == (sign > 0): sk += 1
            else: break
        f["sk"] = sk * sign
    else:
        s_sup, s_per = 1.5, 1.0
    if avgtv20 and tv_today is not None:
        pace = tv_today / (avgtv20 * frac)
        s_val = clamp(pace, 0, 2); f["pace"] = round(pace, 2)
    else:
        s_val = 1.0
    f["tv"] = round((tv_today or 0) / 1e8)
    rel = (chg or 0) - (mkt_chg or 0); f["rel"] = round(rel, 2)
    if breadth is None:
        s_cat = clamp(1 + rel / 4, 0, 2)
    else:
        s_cat = clamp(0.5 + rel / 6, 0, 1) + clamp(breadth, 0, 1); f["br"] = round(breadth * 100)
    if pos_override is not None:
        p = pos_override
    elif hi60 and lo60 and hi60 > lo60 and price:
        p = clamp((price - lo60) / (hi60 - lo60), 0, 1)
    else:
        p = None
    s_pos = 1 - p if p is not None else 0.5
    if p is not None: f["p60"] = round(p * 100)
    if p52_override is not None: f["p52"] = round(p52_override * 100)
    elif hi52 and lo52 and hi52 > lo52 and price: f["p52"] = round(clamp((price - lo52) / (hi52 - lo52), 0, 1) * 100)
    pt = [round(s_sup, 1), round(s_val, 1), round(s_per, 1), round(s_cat, 1), round(s_pos, 1)]
    return round(sum([s_sup, s_val, s_per, s_cat, s_pos]), 1), pt, f

NEW_PARTS = (("거래 꾸준", 2), ("외국인·기관", 2), ("오늘 거래대금", 2), ("안정성", 2), ("추세", 1), ("과열 아님", 1))
def score_new(flows, tv_today, avgtv20, frac, chg, price, vol20, hi19, up4=None):
    """v1.9 점수 (2023.11~2026.11 매매 시뮬레이션의 기대수익으로 고름, scripts/research/)
    거래 꾸준 2: 최근 5거래일(오늘 포함) 중 거래대금이 평소(그 전 20일 평균)보다 많았던 날 수 ÷ 5
    외국인·기관 2: 최근 20거래일 외국인+기관 순매수 ÷ 거래량 (0% 이하 0점, 6% 이상 만점)
    오늘 거래대금 2: 평소의 0.7~2.2배 만점, 0.5~0.7·2.2~3.5배 1점, 그 밖 0점
    안정성 2: 최근 20일 하루 등락률 표준편차 2% 이하 만점, 5% 이상 0점
    추세 1: 20일 고점 대비 −5% 이내 만점, −20% 이하 0점
    과열 아님 1: 오늘 +8% 넘게 급등했거나 거래대금이 평소 3.5배 넘으면 0점"""
    f = {}
    fl = flows[:20] if flows else []
    v = sum(x["v"] for x in fl)
    if fl and v:
        r20 = sum(x["f"] + x["o"] for x in fl) / v
        s_sup = clamp(r20 / 0.06, 0, 1) * 2; f["f20"] = round(r20 * 100, 1); f["n20"] = len(fl)
        f["pd20"] = sum(1 for x in fl if x["f"] + x["o"] > 0)
    else:
        s_sup = 0.0
    pace = tv_today / (avgtv20 * frac) if avgtv20 and tv_today is not None else None
    if up4 is not None:
        days = up4 + (1 if (pace or 0) > 1 else 0); s_days = days / 5 * 2; f["up5"] = days
    else:
        s_days = 1.0
    s_tv = 0 if pace is None else 2 if 0.7 <= pace <= 2.2 else 1 if 0.5 <= pace <= 3.5 else 0
    s_vol = clamp((5 - vol20) / 3, 0, 1) * 2 if vol20 is not None else 1.0
    if vol20 is not None: f["vol"] = round(vol20, 1)
    if price and hi19:
        dh = price / max(hi19, price) - 1; s_tr = clamp((dh + 0.2) / 0.15, 0, 1); f["dh"] = round(dh * 100, 1)
    else:
        s_tr = 0.5
    hot = (chg or 0) > 8 or (pace or 0) > 3.5
    f["hot"] = 1 if hot else 0
    f["tvok"] = 1 if s_tv == 2 else 0
    pt = [round(s_days, 1), round(s_sup, 1), round(s_tv, 1), round(s_vol, 1), round(s_tr, 1), 0.0 if hot else 1.0]
    return round(sum(pt), 1), pt, f

def plan19(lv, atr):
    """v1.9 매매 계획: 1차 매수=지지선(기존 매수 구간 위쪽), 2차 매수=1차−ATR, 손절=2차 매수가 아래 지지선 바로 밑(최소 −3%·최대 −10%),
    1차 매도=평균 매수가+손절폭×2, 2차 매도=+손절폭×4. 백테스트(20거래일 보유, 1차 매도 뒤 손절을 본전으로)로 고름."""
    if not lv or not atr: return lv
    b1 = lv["buy1"]; b2 = b1 - atr
    if b2 <= 0 or b2 >= b1: return lv
    st0 = lv.get("stop"); lo, hi = b2 * 0.90, b2 * 0.97
    if st0 and lo <= st0 <= hi: st, sw = st0, lv.get("stop_why", "")
    elif st0 and st0 > hi: st, sw = hi, "지지선이 2차 매수가에 너무 가까워 2차 매수가 −3%"
    else: st, sw = lo, "아래 지지선이 너무 멀어 2차 매수가 −10%"
    avg = (b1 + b2) / 2; R = avg - st
    s1 = max(avg + 2 * R, b1 * 1.01); s2 = max(avg + 4 * R, s1 * 1.01)
    out = {"buy1": b1, "buy1_why": lv.get("buy1_why"), "nosup": lv.get("nosup"), "buy2": b2, "buy2_why": f"1차 매수가 − 하루 평균 변동폭(ATR 14일) {atr:,.0f}",
           "stop": st, "stop_why": sw, "sell1": s1, "sell1_why": "평균 매수가 + 손절폭×2 (손익비 1:2, 여기서 절반 팔고 손절을 본전으로)",
           "sell2": s2, "sell2_why": "평균 매수가 + 손절폭×4 (손익비 1:4, 나머지 절반)"}
    return out

def lv_compact(lv):
    if not lv: return None
    return [lv.get(k) for k in ("buy1", "buy2", "stop", "sell1", "sell2")], [lv.get(k + "_why") for k in ("buy1", "buy2", "stop", "sell1", "sell2")]

LEVEL_RULE = ("국내 종목(v1.9): 1차 매수=최근 10일 저점(이미 깨졌으면 그 아래 가장 가까운 일봉 저점), 2차 매수=1차 매수가 − 하루 평균 변동폭(ATR 14일). "
              "손절선=2차 매수가 아래 가장 가까운 일봉 저점 바로 밑, 단 2차 매수가보다 최소 3%·최대 10% 아래. "
              "1차 매도=평균 매수가 + (평균 매수가 − 손절선)×2 → 절반 팔고 손절선을 본전으로 올림, 2차 매도=평균 매수가 + 손절폭×4, 20거래일이 지나면 남은 물량 정리. "
              "해외 종목은 예전 방식(실제 고점·저점)을 그대로 써요. 52주 저점까지 깨져 아래 지지선이 없으면(신저가) 1차 매수=현재가로 두고 '반등 확인 뒤 매수'로 표시.")

def all_quotes():
    out = {}
    for mkt in ("KOSPI", "KOSDAQ"):
        first = get(f"https://m.stock.naver.com/api/stocks/marketValue/{mkt}?page=1&pageSize=100") or {}
        total = first.get("totalCount") or 0
        pages = [first] + [None] * (max(1, -(-total // 100)) - 1)
        def pg(n): return get(f"https://m.stock.naver.com/api/stocks/marketValue/{mkt}?page={n}&pageSize=100") or {}
        with ThreadPoolExecutor(8) as ex:
            rest = list(ex.map(pg, range(2, len(pages) + 1)))
        for d in [first] + rest:
            for s_ in d.get("stocks", []):
                if s_.get("stockEndType") != "stock": continue
                out[s_["itemCode"]] = {"name": s_["stockName"], "price": num(s_["closePrice"]), "pct": num(s_["fluctuationsRatio"]),
                                      "tv": (num(s_.get("accumulatedTradingValue")) or 0) * 1e6, "mcap": (num(s_.get("marketValue")) or 0) * 1e8,
                                      "mkt": s_["stockExchangeType"]["code"]}
    return out

# ---------------- 메인 ----------------
def main():
    now = dt.datetime.now(KST)
    force = "--force" in sys.argv
    hm = now.hour * 100 + now.minute
    if os.environ.get("GITHUB_EVENT_NAME") == "schedule" and not force:
        if now.weekday() >= 5 or not (850 <= hm <= 1610 or 1800 <= hm <= 1840):
            print("장 시간이 아니라 건너뜀", now); return 0

    idx = {}
    for k in ("KOSPI", "KOSDAQ"):
        b = get(f"https://m.stock.naver.com/api/index/{k}/basic") or {}
        t = get(f"https://m.stock.naver.com/api/index/{k}/trend") or {}
        idx[k] = {"value": num(b.get("closePrice")), "chg": num(b.get("compareToPreviousClosePrice")),
                  "pct": num(b.get("fluctuationsRatio")), "status": b.get("marketStatus"), "at": b.get("localTradedAt"),
                  "bizdate": t.get("bizdate"), "personal": num(t.get("personalValue")), "foreign": num(t.get("foreignValue")),
                  "institution": num(t.get("institutionalValue"))}
    if idx["KOSPI"]["value"] is None:
        print("네이버 응답 없음:", ERRORS); return 1
    frac = session_frac(now) if idx["KOSPI"]["status"] == "OPEN" else 1.0
    mkt_pct = {"KS": idx["KOSPI"]["pct"], "KQ": idx["KOSDAQ"]["pct"]}

    ind = get("https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100") or {"groups": []}
    groups = [g for g in ind["groups"] if g["name"] != "기타" and g["totalCount"] >= 3]
    def members(g):
        st = []
        for pg_ in range(1, 1 + max(1, -(-g["totalCount"] // 100))):
            d = get(f"https://m.stock.naver.com/api/stocks/industry/{g['no']}?page={pg_}&pageSize=100") or {}
            st += [x for x in d.get("stocks", []) if x.get("stockEndType") == "stock"]
        return g, st
    with ThreadPoolExecutor(8) as ex:
        gm = list(ex.map(members, groups))

    quotes = all_quotes()
    sector_of = {}
    for g, st in gm:
        for x in st:
            sector_of.setdefault(x["itemCode"], g["name"])
            if x["itemCode"] not in quotes:
                quotes[x["itemCode"]] = {"name": x["stockName"], "price": num(x["closePrice"]), "pct": num(x["fluctuationsRatio"]),
                                         "tv": (num(x.get("accumulatedTradingValue")) or 0) * 1e6, "mcap": (num(x.get("marketValue")) or 0) * 1e8,
                                         "mkt": x["stockExchangeType"]["code"]}
    tops = {g["no"]: [x["itemCode"] for x in sorted([x for x in st if not PREF.search(x["stockName"])],
                     key=lambda x: num(x.get("marketValue")) or 0, reverse=True)[:CFG["top_per_sector"]]] for g, st in gm}
    core = sorted(set(c for v in tops.values() for c in v))

    # 일별 캐시: 장 마감 후(17:50~) 하루 1회 전 종목, 그 외에는 빠진 핵심 종목만 추가
    cpath = os.path.join(ROOT, "cache", "daily.json")
    cache = json.load(open(cpath, encoding="utf-8")) if os.path.exists(cpath) else {}
    today = now.strftime("%Y%m%d")
    full = force or cache.get("v") != 6 or (hm >= 1750 and cache.get("key") != today)
    changed = False
    if full:
        codes = sorted(set(quotes) | set(core))
        print("일별 데이터 전 종목 새로 받는 중:", len(codes)); t0 = time.time()
        cache = {"v": 6, "key": today if hm >= 1750 else "day-" + today, "made": now.isoformat(timespec="minutes"), "stocks": build_daily(codes)}
        print("일별 완료", round(time.time() - t0), "초", len(cache["stocks"])); changed = True
    else:
        miss = [c for c in core if c not in cache["stocks"]]
        if miss:
            cache["stocks"].update(build_daily(miss)); changed = True
    if changed:
        os.makedirs(os.path.dirname(cpath), exist_ok=True)
        json.dump(cache, open(cpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    daily = cache["stocks"]

    # 거래대금 순위
    rank = {c: i + 1 for i, c in enumerate(sorted(quotes, key=lambda c: quotes[c]["tv"], reverse=True))}

    # 전 종목 점수
    recs = {}
    for c, q in quotes.items():
        d = daily.get(c)
        r = {"n": q["name"], "m": q["mkt"], "p": q["price"], "c": q["pct"], "sec": sector_of.get(c)}
        if d:
            total, pt, f = score_parts(d["flows"], q["tv"], d["avgtv20"], frac, q["pct"], mkt_pct.get(q["mkt"]), q["price"],
                                       d["lo60"], d["hi60"], d.get("lo52"), d.get("hi52"))
            s2, pt2, f2 = score_new(d["flows"], q["tv"], d["avgtv20"], frac, q["pct"], q["price"], d.get("vol20"), d.get("hi19"), d.get("up4"))
            f.update(f2); f["rk"] = rank.get(c); f["tot"] = len(rank)
            r.update(s=s2, pt=pt2, f=f, a20=round(d["avgtv20"] / 1e8))
            if d.get("hi52d"): r["y52"] = [max(d["hi52"], q["price"] or 0), d["hi52d"], min(d["lo52"], q["price"] or d["lo52"]), d["lo52d"]]
            if PREF.search(q["name"]): r["pf"] = 1
            lc = lv_compact(round_levels(plan19(levels(q["price"], d.get("sr")), d.get("atr"))))
            if lc: r["l"], r["lw"] = lc
        else:
            r["f"] = {"tv": round(q["tv"] / 1e8), "rk": rank.get(c), "tot": len(rank)}
        recs[c] = r

    # 업종 점수 (시총 상위 5종목 합산, 우선주 제외)
    sectors = []
    for g, st in gm:
        top = [c for c in tops[g["no"]] if c in daily]
        if not top: continue
        agg = []
        for i in range(10):
            f_ = o_ = v_ = 0; dd = None
            for c in top:
                fl = daily[c]["flows"][:10]
                if len(fl) > i:
                    f_ += fl[i]["f"] * fl[i]["c"]; o_ += fl[i]["o"] * fl[i]["c"]; v_ += fl[i]["v"] * fl[i]["c"]; dd = fl[i]["d"]
            if v_: agg.append({"d": dd, "f": f_, "o": o_, "v": v_, "c": 1})
        tv = sum(quotes[c]["tv"] for c in top); avg = sum(daily[c]["avgtv20"] for c in top)
        def avgpos(lo, hi):
            ps = [clamp((quotes[c]["price"] - daily[c][lo]) / (daily[c][hi] - daily[c][lo]), 0, 1)
                  for c in top if quotes[c]["price"] and daily[c].get(hi) and daily[c][hi] > daily[c][lo]]
            return sum(ps) / len(ps) if ps else None
        rf = g["riseCount"] + g["fallCount"]
        breadth = g["riseCount"] / rf if rf else 0.5
        total, pt, f = score_parts(agg, tv, avg, frac, num(g["changeRate"]), mkt_pct["KS"], None, None, None,
                                   breadth=breadth, pos_override=avgpos("lo60", "hi60"), p52_override=avgpos("lo52", "hi52"))
        sectors.append({"n": g["name"], "c": num(g["changeRate"]), "rise": g["riseCount"], "fall": g["fallCount"], "cnt": g["totalCount"],
                        "s": total, "pt": pt, "f": f, "avg_tv": round(avg / 1e8),
                        "lead": [{"code": c, "n": quotes[c]["name"], "c": quotes[c]["pct"]} for c in top[:3]],
                        "picks": sorted([x["itemCode"] for x in st if x["itemCode"] in recs and "s" in recs[x["itemCode"]]
                                         and not PREF.search(x["stockName"]) and daily[x["itemCode"]]["avgtv20"] >= CFG["min_pick_tv_eok"] * 1e8],
                                        key=lambda c: (recs[c]["s"], quotes[c]["tv"]), reverse=True)[:3]})
    sectors.sort(key=lambda x: (x["s"], x["f"]["tv"]), reverse=True)
    top_sectors = [x for x in sectors if x["avg_tv"] >= CFG["min_sector_tv_eok"]][:CFG["top_n"]]
    liquid = [c for c, r in recs.items() if "s" in r and not PREF.search(r["n"]) and daily[c]["avgtv20"] >= CFG["min_avg_tv_eok"] * 1e8
              and quotes[c]["mcap"] >= CFG["min_mcap_eok"] * 1e8]
    top_codes = sorted(liquid, key=lambda c: (recs[c]["s"], recs[c]["f"]["tv"]), reverse=True)[:CFG["top_n"]]

    # 해외 / 코인 (누구나 찾기에서 고를 수 있는 공용 목록)
    overseas = []
    for sym in CFG["us_symbols"]:
        y = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1y&interval=1d")
        try:
            r0 = y["chart"]["result"][0]; m = r0["meta"]; qd = r0["indicators"]["quote"][0]
            prev = m.get("chartPreviousClose") or m.get("previousClose")
            pct = m.get("regularMarketChangePercent")
            if pct is None and prev: pct = (m["regularMarketPrice"] / prev - 1) * 100
            tz = dt.timezone(dt.timedelta(seconds=m.get("gmtoffset", -18000)))
            rows = [(dt.datetime.fromtimestamp(ts, tz).strftime("%Y%m%d"), h_, l_)
                    for ts, h_, l_ in zip(r0.get("timestamp", []), qd.get("high", []), qd.get("low", [])) if h_ is not None and l_ is not None]
            if rows and m.get("currentTradingPeriod", {}).get("regular", {}).get("end", 0) > time.time() and \
               rows[-1][0] == dt.datetime.fromtimestamp(m["regularMarketTime"], tz).strftime("%Y%m%d"):
                rows = rows[:-1]  # 진행 중인 오늘 봉 제외
            rec = {"code": sym, "n": sym, "full": m.get("shortName") or sym, "p": m["regularMarketPrice"],
                   "c": round(pct, 2) if pct is not None else None, "cur": "USD",
                   "at": dt.datetime.fromtimestamp(m["regularMarketTime"], KST).isoformat(timespec="minutes"),
                   "h52": m.get("fiftyTwoWeekHigh"), "l52": m.get("fiftyTwoWeekLow")}
            lc = lv_compact(round_levels(levels(m["regularMarketPrice"], sr_from_rows(rows)), kr=False))
            if lc: rec["l"], rec["lw"] = lc
            overseas.append(rec)
        except Exception as e:
            ERRORS.append(f"yahoo {sym}: {e}")
            overseas.append({"code": sym, "n": sym, "p": None, "c": None, "cur": "USD"})
    if CFG["coins"]:
        cg = get("https://api.coingecko.com/api/v3/simple/price?ids=" + ",".join(CFG["coins"]) + "&vs_currencies=usd,krw&include_24hr_change=true&include_market_cap=true") or {}
        for cid in CFG["coins"]:
            x = cg.get(cid, {})
            overseas.append({"code": cid, "n": CFG["coin_names"].get(cid, cid), "full": "CoinGecko 24시간 기준", "p": x.get("usd"), "krw": x.get("krw"),
                             "c": round(x["usd_24h_change"], 2) if x.get("usd_24h_change") is not None else None, "cur": "USD", "mcap": x.get("usd_market_cap")})

    F, I = idx["KOSPI"]["foreign"], idx["KOSPI"]["institution"]
    def who(v, n): return f"{n} {'순매수' if v > 0 else '순매도'} {abs(v):,.0f}억" if v is not None else f"{n} 데이터 없음"
    good = [c for c in top_codes if recs[c]["s"] >= 7.5]
    mood = "강세" if (idx["KOSPI"]["pct"] or 0) > 0.5 else ("약세" if (idx["KOSPI"]["pct"] or 0) < -0.5 else "보합")
    headline = (f"코스피 {mood}({idx['KOSPI']['pct']:+.2f}%), {who(F,'외국인')}·{who(I,'기관')}. "
                f"돈이 몰리는 업종은 {', '.join(x['n'] for x in top_sectors[:2])}" +
                (f", 사기 좋음 종목 {len(good)}개." if good else ", 아직 '사기 좋음'(7.5점↑) 종목은 없어요."))
    upd = now.isoformat(timespec="seconds")
    data = {"updated": upd, "market_status": idx["KOSPI"]["status"], "headline": headline, "index": idx,
            "sectors_top": top_sectors, "stocks_top": [dict(recs[c], code=c) for c in top_codes],
            "sectors_all": [{k: x[k] for k in ("n", "c", "s", "pt", "f", "rise", "fall", "cnt", "lead", "picks")} for x in sectors],
            "overseas": overseas,
            "daily_made": cache.get("made"), "levels_rule": LEVEL_RULE, "min_pick_tv_eok": CFG["min_pick_tv_eok"],
            "min_top_tv_eok": CFG["min_avg_tv_eok"], "min_top_mcap_eok": CFG["min_mcap_eok"],
            "flow_note": "업종·종목 수급은 전 거래일 확정치, 지수 수급(외국인·기관)은 장중 잠정치예요.",
            "errors": ERRORS[:10], "count": len(recs)}
    json.dump(data, open(os.path.join(ROOT, "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"updated": upd, "s": recs}, open(os.path.join(ROOT, "all.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a").write("ran=true\n" + ("cache_changed=true\n" if changed else "") + ("daily_full=true\n" if full else ""))
    print("ok", now, "sectors", len(sectors), "stocks", len(recs), "scored", sum(1 for r in recs.values() if "s" in r), "errors", len(ERRORS))
    return 0

if __name__ == "__main__":
    sys.exit(main())
