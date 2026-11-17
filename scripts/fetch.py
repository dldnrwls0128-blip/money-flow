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
    tr = get(f"https://m.stock.naver.com/api/stock/{code}/trend?pageSize=10") or []
    end = dt.datetime.now(KST).strftime("%Y%m%d")
    start = (dt.datetime.now(KST) - dt.timedelta(days=100)).strftime("%Y%m%d")
    raw = get(f"https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&startTime={start}&endTime={end}&timeframe=day", raw=True)
    rows = []
    if raw:
        for m in re.finditer(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', raw.decode("utf-8", "ignore")):
            rows.append([m.group(1)] + [float(m.group(i)) for i in range(2, 7)])
    today = end
    hist = [r for r in rows if r[0] < today][-60:]  # 완료된 거래일만
    flows = []
    for t in tr[:5]:
        v = num(t.get("accumulatedTradingVolume")) or 0
        flows.append({"d": t["bizdate"], "f": num(t.get("foreignerPureBuyQuant")) or 0,
                      "o": num(t.get("organPureBuyQuant")) or 0, "v": v, "c": num(t.get("closePrice")) or 0})
    if not hist:
        return None
    tv20 = [r[4] * r[5] for r in hist[-20:]]
    return {"flows": flows, "hi60": max(r[2] for r in hist), "lo60": min(r[3] for r in hist),
            "avgtv20": sum(tv20) / len(tv20), "last": hist[-1][0],
            "lows": [[r[0], r[3]] for r in hist[-20:]]}

def build_daily(codes):
    out = {}
    with ThreadPoolExecutor(8) as ex:
        for c, d in zip(codes, ex.map(stock_daily, codes)):
            if d: out[c] = d
    return out

# ---------------- 점수 ----------------
def session_frac(now):
    m = (now.hour * 60 + now.minute) - 9 * 60
    return clamp(m / 390.0, 0.08, 1.0)

def score_parts(flows, tv_today, avgtv20, frac, chg, mkt_chg, price, hi, lo, breadth=None):
    why = []
    # 수급 3: 외국인+기관 순매수 / 거래량 (전일·최근3일)
    if flows:
        r1 = (flows[0]["f"] + flows[0]["o"]) / flows[0]["v"] if flows[0]["v"] else 0
        v3 = sum(x["v"] for x in flows[:3]); r3 = sum(x["f"] + x["o"] for x in flows[:3]) / v3 if v3 else 0
        x = 0.5 * r1 + 0.5 * r3
        s_sup = clamp(1.5 + x * 7.5, 0, 3)
        fo = flows[0]["f"] * flows[0]["c"] / 1e8; oo = flows[0]["o"] * flows[0]["c"] / 1e8
        why.append(f"전일 외국인 {fo:+,.0f}억 · 기관 {oo:+,.0f}억")
        pos_days = sum(1 for x in flows[:5] if x["f"] + x["o"] > 0)
        s_per = 2 * pos_days / max(1, len(flows[:5]))
        why.append(f"최근 {len(flows[:5])}일 중 {pos_days}일 외국인+기관 순매수")
    else:
        s_sup, s_per = 1.5, 1.0; why.append("수급 데이터 없음(중립)")
    # 거래대금 2: 오늘 거래대금 속도 / 20일 평균
    if avgtv20 and tv_today is not None:
        pace = tv_today / (avgtv20 * frac)
        s_val = clamp(pace, 0, 2); why.append(f"거래대금 평소의 {pace:.1f}배 속도")
    else:
        s_val = 1.0
    # 촉매 2 (근사): 시장 대비 오늘 강도 (+업종은 상승 종목 비율)
    rel = (chg or 0) - (mkt_chg or 0)
    if breadth is None:
        s_cat = clamp(1 + rel / 4, 0, 2)
    else:
        s_cat = clamp(0.5 + rel / 6, 0, 1) + clamp(breadth, 0, 1)
    why.append(f"시장 대비 {rel:+.1f}%p" + (f" · 상승 종목 비율 {breadth*100:.0f}%" if breadth is not None else ""))
    # 가격위치 1: 60일 범위에서 낮을수록 높음
    if hi and lo and hi > lo and price:
        p = clamp((price - lo) / (hi - lo), 0, 1); s_pos = 1 - p
        why.append(f"60일 범위의 {p*100:.0f}% 위치")
    else:
        s_pos = 0.5
    parts = {"수급": round(s_sup, 1), "거래대금": round(s_val, 1), "지속성": round(s_per, 1), "촉매": round(s_cat, 1), "가격위치": round(s_pos, 1)}
    total = round(s_sup + s_val + s_per + s_cat + s_pos, 1)
    return total, parts, why

def label(s):
    return "사기 좋음" if s >= 7.5 else ("관망" if s >= 6 else "주의")

# ---------------- 메인 ----------------
def main():
    now = dt.datetime.now(KST)
    force = "--force" in sys.argv
    # 장 시간 게이트 (스케줄 실행만): 평일 08:50~16:10 KST, 또는 18:00~18:40 마감 확정 갱신
    if os.environ.get("GITHUB_EVENT_NAME") == "schedule" and not force:
        hm = now.hour * 100 + now.minute
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

    # 업종 목록
    ind = get("https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100") or {"groups": []}
    groups = [g for g in ind["groups"] if g["name"] != "기타" and g["totalCount"] >= 3]

    def members(g):
        d = get(f"https://m.stock.naver.com/api/stocks/industry/{g['no']}?page=1&pageSize=100") or {}
        st = [s for s in d.get("stocks", []) if s.get("stockEndType") == "stock" and not PREF.search(s["stockName"])]
        st.sort(key=lambda s: num(s.get("marketValue")) or 0, reverse=True)
        return g, st
    with ThreadPoolExecutor(8) as ex:
        gm = list(ex.map(members, groups))

    quotes = {}  # code -> 현재 시세
    sector_of = {}
    for g, st in gm:
        for s in st[:CFG["top_per_sector"]]:
            sector_of.setdefault(s["itemCode"], g["name"])
            quotes[s["itemCode"]] = {"name": s["stockName"], "price": num(s["closePrice"]), "pct": num(s["fluctuationsRatio"]),
                                     "tv": (num(s.get("accumulatedTradingValue")) or 0) * 1e6, "mcap": (num(s.get("marketValue")) or 0) * 1e8,
                                     "mkt": s["stockExchangeType"]["code"]}
    extra = [c for c in CFG["extra_codes"] if c not in quotes]
    for i in range(0, len(extra), 20):
        d = get("https://polling.finance.naver.com/api/realtime/domestic/stock/" + ",".join(extra[i:i+20])) or {}
        for x in d.get("datas", []):
            quotes[x["itemCode"]] = {"name": x["stockName"], "price": num(x["closePriceRaw"] if "closePriceRaw" in x else x["closePrice"]),
                                     "pct": num(x["fluctuationsRatio"]), "tv": num(x.get("accumulatedTradingValueRaw")) or 0,
                                     "mcap": num(x.get("marketValueFullRaw")) or 0, "mkt": x["stockExchangeType"]["code"]}
    # 일별 캐시
    cpath = os.path.join(ROOT, "cache", "daily.json")
    cache = json.load(open(cpath, encoding="utf-8")) if os.path.exists(cpath) else {}
    key = now.strftime("%Y%m%d") + ("pm" if now.hour >= 17 else "")
    if cache.get("key") != key or force:
        print("일별 데이터 새로 받는 중:", len(quotes), "종목")
        cache = {"key": key, "made": now.isoformat(timespec="minutes"), "stocks": build_daily(sorted(quotes))}
        os.makedirs(os.path.dirname(cpath), exist_ok=True)
        json.dump(cache, open(cpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    daily = cache["stocks"]

    # 종목 점수
    scored = {}
    for c, q in quotes.items():
        d = daily.get(c)
        if not d: continue
        total, parts, why = score_parts(d["flows"], q["tv"], d["avgtv20"], frac, q["pct"], mkt_pct.get(q["mkt"]), q["price"], d["hi60"], d["lo60"])
        scored[c] = {"code": c, "name": q["name"], "sector": sector_of.get(c), "price": q["price"], "pct": q["pct"],
                     "tv": round(q["tv"] / 1e8), "score": total, "label": label(total), "parts": parts, "why": why,
                     "flow_date": d["flows"][0]["d"] if d["flows"] else None}
    # 업종 점수 (시총 상위 종목 합산)
    sectors = []
    for g, st in gm:
        top = [s["itemCode"] for s in st[:CFG["top_per_sector"]] if s["itemCode"] in daily]
        if not top: continue
        agg = []
        for i in range(5):
            f = o = v = 0; dd = None
            for c in top:
                fl = daily[c]["flows"]
                if len(fl) > i:
                    f += fl[i]["f"] * fl[i]["c"]; o += fl[i]["o"] * fl[i]["c"]; v += fl[i]["v"] * fl[i]["c"]; dd = fl[i]["d"]
            if v: agg.append({"d": dd, "f": f, "o": o, "v": v, "c": 1})
        tv = sum(quotes[c]["tv"] for c in top); avg = sum(daily[c]["avgtv20"] for c in top)
        poss = [clamp((quotes[c]["price"] - daily[c]["lo60"]) / (daily[c]["hi60"] - daily[c]["lo60"]), 0, 1)
                for c in top if quotes[c]["price"] and daily[c]["hi60"] > daily[c]["lo60"]]
        pavg = sum(poss) / len(poss) if poss else None
        rf = g["riseCount"] + g["fallCount"]
        breadth = g["riseCount"] / rf if rf else 0.5
        total, parts, why = score_parts(agg, tv, avg, frac, num(g["changeRate"]), mkt_pct["KS"],
                                        pavg if pavg is not None else None, 1 if pavg is not None else None, 0, breadth)
        why[0] = why[0].replace("외국인", "외국인(상위 종목 합)")
        sectors.append({"name": g["name"], "pct": num(g["changeRate"]), "rise": g["riseCount"], "fall": g["fallCount"],
                        "count": g["totalCount"], "tv": round(tv / 1e8), "avg_tv": round(avg / 1e8), "score": total, "label": label(total), "parts": parts,
                        "why": why, "leaders": [{"code": c, "name": quotes[c]["name"], "pct": quotes[c]["pct"]} for c in top[:3]]})
    sectors.sort(key=lambda s: (s["score"], s["tv"]), reverse=True)
    liquid = [s for s in scored.values() if s["tv"] >= 0 and daily[s["code"]]["avgtv20"] >= CFG["min_avg_tv_eok"] * 1e8
              and quotes[s["code"]]["mcap"] >= CFG["min_mcap_eok"] * 1e8]
    top_stocks = sorted(liquid, key=lambda s: (s["score"], s["tv"]), reverse=True)[:CFG["top_n"]]
    top_sectors = [s for s in sectors if s["avg_tv"] >= CFG["min_sector_tv_eok"]][:CFG["top_n"]]

    # 해외 / 코인
    overseas = []
    for sym in CFG["us_symbols"]:
        y = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1d")
        try:
            m = y["chart"]["result"][0]["meta"]
            prev = m.get("chartPreviousClose") or m.get("previousClose")
            pct = m.get("regularMarketChangePercent")
            if pct is None and prev: pct = (m["regularMarketPrice"] / prev - 1) * 100
            overseas.append({"code": sym, "name": m.get("shortName") or sym, "price": m["regularMarketPrice"], "pct": round(pct, 2) if pct is not None else None,
                             "cur": "USD", "at": dt.datetime.fromtimestamp(m["regularMarketTime"], KST).isoformat(timespec="minutes")})
        except Exception:
            overseas.append({"code": sym, "name": sym, "price": None, "pct": None, "cur": "USD"})
    if CFG["coins"]:
        cg = get("https://api.coingecko.com/api/v3/simple/price?ids=" + ",".join(CFG["coins"]) + "&vs_currencies=usd,krw&include_24hr_change=true") or {}
        for cid in CFG["coins"]:
            x = cg.get(cid, {})
            overseas.append({"code": cid, "name": CFG["coin_names"].get(cid, cid), "price": x.get("usd"), "krw": x.get("krw"),
                             "pct": round(x["usd_24h_change"], 2) if x.get("usd_24h_change") is not None else None, "cur": "USD"})

    extra_q = {c: scored.get(c) or ({"code": c, **quotes[c], "tv": round(quotes[c]["tv"] / 1e8), "score": None} if c in quotes else None)
               for c in CFG["extra_codes"]}
    if any(v and "mcap" in v for v in extra_q.values()):
        for v in extra_q.values():
            if v: v.pop("mcap", None); v.pop("mkt", None)

    # 한 줄 결론 (규칙 기반)
    F, I = idx["KOSPI"]["foreign"], idx["KOSPI"]["institution"]
    def who(v, n): return f"{n} {'순매수' if v > 0 else '순매도'} {abs(v):,.0f}억" if v is not None else f"{n} 데이터 없음"
    good = [s for s in top_stocks if s["score"] >= 7.5]
    mood = "강세" if (idx["KOSPI"]["pct"] or 0) > 0.5 else ("약세" if (idx["KOSPI"]["pct"] or 0) < -0.5 else "보합")
    headline = (f"코스피 {mood}({idx['KOSPI']['pct']:+.2f}%), {who(F,'외국인')}·{who(I,'기관')}. "
                f"돈이 몰리는 업종은 {', '.join(s['name'] for s in top_sectors[:2])}" +
                (f", 사기 좋음 종목 {len(good)}개." if good else ", 아직 '사기 좋음'(7.5점↑) 종목은 없어요."))

    data = {"updated": now.isoformat(timespec="seconds"), "market_status": idx["KOSPI"]["status"], "headline": headline,
            "index": idx, "sectors_top": top_sectors, "stocks_top": top_stocks, "sectors_all": [{k: s[k] for k in ("name", "pct", "score", "label", "tv")} for s in sectors],
            "tracked": extra_q, "overseas": overseas, "daily_made": cache.get("made"),
            "flow_note": "업종·종목 수급은 전 거래일 확정치, 지수 수급(외국인·기관)은 장중 잠정치예요.",
            "errors": ERRORS[:10]}
    out = os.path.join(ROOT, "data.json")
    json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a").write("ran=true\n")
    print("ok", now, "sectors", len(sectors), "stocks", len(scored), "errors", len(ERRORS))
    return 0

if __name__ == "__main__":
    sys.exit(main())
