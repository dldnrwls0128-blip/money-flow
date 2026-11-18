#!/usr/bin/env python3
"""주도주 로테이션(bt10 '가장 안정적' 규칙) 데이터 → cache/leaders.json
규칙: 시장 폭(유동성 종목 중 60일선 위 비율) 45% 미만이면 전량 현금.
      업종 점수 comp2 = 거래대금 비중 증가 지속(10일) + 60일 상대수익 + 52주 고점 근처 비율 (업종끼리 순위 평균)
      이번 주 상위 3 ∩ 지난주 점검일 상위 3 업종만, 업종당 20일선 위·52주 고점 10% 안 종목을 고점에 가까운 순 3개, 9칸 동일 비중, 종가 −15% 손절.
지어낸 숫자 없음: 못 받은 값은 빼고, 실패하면 이전 파일을 그대로 둔다.
"""
import json, os, re, sys, time, datetime as dt, math, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "cache", "leaders.json")
KST = dt.timezone(dt.timedelta(hours=9))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PREF = re.compile(r"(\d?우[A-C]?|우선주)$|스팩|SPAC|ETN|리츠$")
BR_TH, K, L, NEAR, STOP = 0.45, 3, 3, 0.10, 0.15
ERR = []

def get(url, raw=False, tries=3, data=None):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Referer": "https://m.stock.naver.com/"})
            with urllib.request.urlopen(req, timeout=20) as r:
                b = r.read(); return b if raw else json.loads(b.decode("utf-8"))
        except Exception as e:
            last = e; time.sleep(1.2 * (i + 1))
    ERR.append(f"{url.split('?')[0]}: {last}"); return None

def sise(code, start, end):
    b = get(f"https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&startTime={start}&endTime={end}&timeframe=day", raw=True)
    if not b: return code, None
    rows = [(m.group(1), float(m.group(3)), float(m.group(4)), float(m.group(5)), float(m.group(6)))
            for m in re.finditer(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', b.decode("utf-8", "ignore"))]
    return code, rows

def main():
    now = dt.datetime.now(KST); force = "--force" in sys.argv
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else None
    today = now.strftime("%Y%m%d"); closed = now.weekday() < 5 and (now.hour, now.minute) >= (15, 45)
    if old and not force:   # 하루 한 번(장 마감 뒤) 또는 주말·휴장일엔 3시간에 한 번만 확인
        want = today if closed else None
        chk = dt.datetime.fromisoformat(old.get("checked", "2000-01-01T00:00:00+09:00"))
        if (want and old.get("asof") == want) or (not want and (now - chk).total_seconds() < 3 * 3600) or (want and (now - chk).total_seconds() < 1800):
            print("leaders: 최신이라 건너뜀", old.get("asof")); return 0
    A = json.load(open(os.path.join(ROOT, "all.json"), encoding="utf-8"))["s"]
    codes = sorted(c for c, r in A.items() if not r.get("pf") and not PREF.search(r.get("n", "")) and (r.get("a20") or 0) >= 10)
    start = (now - dt.timedelta(days=430)).strftime("%Y%m%d")
    t0 = time.time()
    with ThreadPoolExecutor(12) as ex: res = dict(ex.map(lambda c: sise(c, start, today), codes))
    frames = []
    for c, rows in res.items():
        if not rows: continue
        rows = [r for r in rows if r[1] > 0 and r[2] > 0 and r[3] > 0 and (r[0] < today or closed)]   # 장중 오늘 행 제외
        if len(rows) < 140: continue
        d = pd.DataFrame(rows, columns=["d", "h", "l", "c", "v"]); d["code"] = c; frames.append(d)
    if len(frames) < 300:
        print("leaders: 시세를 충분히 못 받음", len(frames)); return 1
    df = pd.concat(frames, ignore_index=True).sort_values(["code", "d"]).reset_index(drop=True)
    df["sec"] = df.code.map(lambda c: A[c].get("sec"))
    g = df.groupby("code", sort=False)
    df["tvw"] = df.c * df.v
    df["tv5"] = g.tvw.transform(lambda s: s.rolling(5).mean())
    df["tv60s"] = g.tvw.transform(lambda s: s.shift(5).rolling(60).mean())
    df["tv20s"] = g.tvw.transform(lambda s: s.rolling(20).mean())
    df["tv20p"] = g.tvw.transform(lambda s: s.shift(1).rolling(20).mean())
    for n in (20, 60, 120): df[f"ma{n}"] = g.c.transform(lambda s: s.rolling(n, min_periods=n).mean())
    df["hi250"] = g.h.transform(lambda s: s.rolling(250, min_periods=120).max())
    df["r60x"] = g.c.transform(lambda s: s / s.shift(60) - 1)
    df["above60"] = (df.c > df.ma60).astype(float); df["nearhi"] = (df.c >= 0.95 * df.hi250).astype(float)
    df["keep"] = (df.tv20p >= 30e8) & df.ma120.notna()
    cnt = df[df.keep].groupby("d").size(); okd = set(cnt[cnt >= 100].index)
    df["sig"] = df.keep & df.d.isin(okd)
    dates = sorted(okd); asof = dates[-1]
    # 시장 폭
    br = df[df.sig].groupby("d").above60.mean()
    # 업종 점수 (bt8 sec.py 와 같은 계산)
    scnt = df.groupby("code").sec.first().value_counts(); BIG = set(scnt[scnt >= 5].index)
    mk = df.groupby("d").agg(mtv5=("tv5", "sum"), mtv60=("tv60s", "sum"), mr60=("r60x", "mean"))
    S = df[df.sec.isin(BIG)].groupby(["d", "sec"]).agg(stv5=("tv5", "sum"), stv60=("tv60s", "sum"), sr60=("r60x", "mean"), bhi=("nearhi", "mean"), b60=("above60", "mean"), n=("c", "size")).reset_index().merge(mk, on="d")
    S["sh_rise"] = (S.stv5 / S.mtv5) / (S.stv60 / S.mtv60); S["rs60"] = S.sr60 - S.mr60
    S = S.sort_values(["sec", "d"]); S["sh_sus"] = S.groupby("sec").sh_rise.transform(lambda s: (s > 1.1).rolling(10).mean())
    for k in ("sh_sus", "rs60", "bhi"): S["rk_" + k] = S.groupby("d")[k].rank(pct=True)
    S["comp2"] = (S.rk_sh_sus + S.rk_rs60 + S.rk_bhi) / 3
    S["pos"] = S.groupby("d").comp2.rank(ascending=False, method="first")
    def top(d, n=K): x = S[(S.d == d) & (S.pos <= n)]; return set(x.sec)
    wk = pd.to_datetime(pd.Series(dates)).dt.to_period("W").values
    firsts = [dates[i] for i in range(len(dates)) if i == 0 or wk[i] != wk[i - 1]]
    this_week = [f for f in firsts if f <= asof][-1]; prev = [f for f in firsts if f < this_week][-1]
    if asof != this_week: prev_check = this_week if False else prev
    prev_check = prev            # 지난주 점검일 (그 주 첫 거래일)
    now_top, prev_top = top(asof), top(prev_check)
    qual = now_top & prev_top
    Sd = S[S.d == asof].sort_values("pos")
    sectors = [dict(n=r.sec, pos=int(r.pos), prev=bool(r.sec in prev_top), q=bool(r.sec in qual), sh=round(float(r.sh_rise), 2), sus=round(float(r.sh_sus) * 100),
                    rs60=round(float(r.rs60) * 100, 1), bhi=round(float(r.bhi) * 100), b60=round(float(r.b60) * 100), m=int(r.n)) for r in Sd.head(6).itertuples()]
    # 후보
    T = df[(df.d == asof) & df.sig].copy(); T["hr"] = T.c / T.hi250
    def leaders(secs):
        out = []
        for s in [x["n"] for x in sectors if x["n"] in secs]:
            gg = T[(T.sec == s) & (T.c > T.ma20) & (T.c >= (1 - NEAR) * T.hi250)].sort_values("hr", ascending=False)
            out += [dict(code=r.code, n=A[r.code]["n"], m=A[r.code].get("m"), sec=s, c=r.c, hi=round((r.hr - 1) * 100, 1), ma20=round(float(r.ma20)), tv20=round(r.tv20s / 1e8),
                         stop=int(round(r.c * (1 - STOP)))) for r in gg.head(L + 3).itertuples()]
        return out
    cand, nxt = leaders(qual), leaders(now_top - qual)
    # 관리종목(KIND) · 거래정지(네이버) 확인
    admin, admin_ok = set(), False
    b = get("https://kind.krx.co.kr/investwarn/adminissue.do", raw=True,
            data=b"method=searchAdminIssueSub&currentPageSize=3000&pageIndex=1&orderMode=1&orderStat=D&searchMode=&searchCodeType=&searchCorpName=&marketType=&repIsuSrtCd=")
    if b:
        h = b.decode("utf-8", "ignore"); names = re.findall(r"alt='(?:유가증권|코스닥)'>\s*([^<]+?)</a>", h)
        if names: admin = {x.strip() for x in names}; admin_ok = True
    def flag(x):
        bs = get(f"https://m.stock.naver.com/api/stock/{x['code']}/basic") or {}
        ts = (bs.get("tradeStopType") or {}).get("name"); x["halt"] = bool(ts and ts != "TRADING") or bs.get("tradableStatus") not in (None, "tradable")
        x["admin"] = x["n"] in admin
        return x
    with ThreadPoolExecutor(6) as ex: cand = list(ex.map(flag, cand)); nxt = list(ex.map(flag, nxt))
    def take(lst):
        per, out = {}, []
        for x in lst:
            if x["halt"] or x["admin"]: continue
            if per.get(x["sec"], 0) < L: out.append(x); per[x["sec"]] = per.get(x["sec"], 0) + 1
        return out[:K * L]
    picks = take(cand); excluded = [x for x in cand + nxt if x["halt"] or x["admin"]]
    u = df[(df.d == asof) & df.sig]; gap = u.c / u.ma60 - 1; n = len(u); above = int((gap > 0).sum())
    hist = [[d, round(float(v) * 100, 1)] for d, v in br.tail(60).items()]
    out = dict(v=1, asof=asof, made=now.isoformat(timespec="seconds"), checked=now.isoformat(timespec="seconds"), prev_check=prev_check, this_week=this_week,
               rule=dict(br=BR_TH, K=K, L=L, near=NEAR, stop=STOP),
               breadth=dict(pct=round(above / n * 100, 1), above=above, n=n, need=max(0, math.ceil(BR_TH * n) - above),
                            near5=int(((gap <= 0) & (gap > -0.05)).sum()), near10=int(((gap <= 0) & (gap > -0.10)).sum()), hist=hist),
               on=bool(above / n >= BR_TH), sectors=sectors, qual=sorted(qual), picks=picks, next=take(nxt), excluded=[dict(code=x["code"], n=x["n"], why="거래정지" if x["halt"] else "관리종목") for x in excluded],
               admin_ok=admin_ok, stocks=len(frames), errors=ERR[:5])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    if os.environ.get("GITHUB_OUTPUT"): open(os.environ["GITHUB_OUTPUT"], "a").write("leaders_changed=true\n")
    print("leaders ok", asof, "breadth", out["breadth"]["pct"], "on", out["on"], "qual", sorted(qual), "picks", [(x["code"], x["n"]) for x in picks], "secs", round(time.time() - t0), "s", "errors", len(ERR))
    return 0

if __name__ == "__main__":
    sys.exit(main())
