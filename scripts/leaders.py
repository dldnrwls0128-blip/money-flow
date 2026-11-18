#!/usr/bin/env python3
"""주도주 5슬롯 (v2.1, bt12 추천 규칙) → cache/leaders.json + data/slots.json(가상 계좌, 저장소에 쌓임)
규칙: 격주 수요일 장 마감 뒤 점검(기준 2026-11-18), 다음날 시가 주문. 점검일 시장 폭(유동성 종목 중 60일선 위 비율) 45% 미만 → 전부 현금.
      업종 점수 comp2 = 거래대금 비중 증가 지속(10일) + 60일 상대수익 + 52주 고점 근처 비율 (업종끼리 순위 평균, 10점 환산)
      이번 주 상위 3 ∩ 지난주 같은 요일 상위 3 업종, 업종마다 1등(20일선 위·52주 고점 10% 안, 고점에 가까운 순) 먼저, 그다음 2등… 최대 5종목 × 1/5.
      보유 유지: 업종 상위 5 & 업종 안 6위 & 고점 15% 안, 아니면 점검일에 교체. 종가 −20% → 다음날 시가 매도, 종가 +30% → 다음날 시가 절반 매도.
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
BR_TH, K, L, NEAR, STOP, TP, NSLOT = 0.45, 3, 3, 0.10, 0.20, 0.30, 5
BUF_SEC, BUF_RANK, BUF_NEAR = 5, 6, 0.15
ANCHOR, START_CASH, SLIP, FEE = "20261118", 10_000_000, 0.003, 0.0023
SLOTS = os.path.join(ROOT, "data", "slots.json")
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
    rows = [(m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(5)), float(m.group(6)))
            for m in re.finditer(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', b.decode("utf-8", "ignore"))]
    return code, rows


WDK = "월화수목금토일"
def d8(s): return f"{int(s[4:6])}/{int(s[6:8])}({WDK[dt.date(int(s[:4]), int(s[4:6]), int(s[6:8])).weekday()]})"
def main():
    now = dt.datetime.now(KST); force = "--force" in sys.argv
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else None
    today = now.strftime("%Y%m%d"); closed = now.weekday() < 5 and (now.hour, now.minute) >= (15, 45)
    if old and old.get("v") == 4 and not force and os.path.exists(SLOTS):   # 하루 한 번(장 마감 뒤) 또는 3시간에 한 번만
        want = today if closed else None
        chk = dt.datetime.fromisoformat(old.get("checked", "2000-01-01T00:00:00+09:00"))
        if (want and old.get("asof") == want) or (not want and (now - chk).total_seconds() < 3 * 3600) or (want and (now - chk).total_seconds() < 1800):
            print("leaders: 최신이라 건너뜀", old.get("asof")); return 0
    st = json.load(open(SLOTS, encoding="utf-8")) if os.path.exists(SLOTS) else None
    A = json.load(open(os.path.join(ROOT, "all.json"), encoding="utf-8"))["s"]
    codes = {c for c, r in A.items() if not r.get("pf") and not PREF.search(r.get("n", "")) and (r.get("a20") or 0) >= 10}
    if st: codes |= set(st["pos"])
    codes = sorted(codes)
    start = (now - dt.timedelta(days=430)).strftime("%Y%m%d")
    t0 = time.time()
    with ThreadPoolExecutor(12) as ex: res = dict(ex.map(lambda c: sise(c, start, today), codes + ["KOSPI"]))
    kos = {r[0]: r[4] for r in (res.pop("KOSPI") or []) if r[0] < today or closed}
    frames = []
    for c, rows in res.items():
        if not rows: continue
        rows = [r for r in rows if r[2] > 0 and r[3] > 0 and r[4] > 0 and (r[0] < today or closed)]   # 장중 오늘 행 제외
        if len(rows) < 140 and not (st and c in st["pos"]): continue
        d = pd.DataFrame(rows, columns=["d", "o", "h", "l", "c", "v"]); d["code"] = c; frames.append(d)
    if len(frames) < 300:
        print("leaders: 시세를 충분히 못 받음", len(frames)); return 1
    df = pd.concat(frames, ignore_index=True).sort_values(["code", "d"]).reset_index(drop=True)
    df["sec"] = df.code.map(lambda c: A.get(c, {}).get("sec"))
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
    df["hr"] = df.c / df.hi250
    df["keep"] = (df.tv20p >= 30e8) & df.ma120.notna() & ~df.code.map(lambda c: bool(A.get(c, {}).get("pf")) or bool(PREF.search(A.get(c, {}).get("n", "")))) & df.code.map(lambda c: (A.get(c, {}).get("a20") or 0) >= 10)
    cnt = df[df.keep].groupby("d").size(); okd = set(cnt[cnt >= 100].index)
    df["sig"] = df.keep & df.d.isin(okd)
    dates = sorted(okd); asof = dates[-1]
    br = df[df.sig].groupby("d").above60.mean()
    # 업종 점수 (bt8 sec.py 와 같은 계산)
    scnt = df[df.code.isin([c for c in codes if c in A])].groupby("code").sec.first().value_counts(); BIG = set(scnt[scnt >= 5].index)
    mk = df.groupby("d").agg(mtv5=("tv5", "sum"), mtv60=("tv60s", "sum"), mr60=("r60x", "mean"))
    S = df[df.sec.isin(BIG)].groupby(["d", "sec"]).agg(stv5=("tv5", "sum"), stv60=("tv60s", "sum"), sr60=("r60x", "mean"), bhi=("nearhi", "mean"), b60=("above60", "mean"), n=("c", "size")).reset_index().merge(mk, on="d")
    S["sh_rise"] = (S.stv5 / S.mtv5) / (S.stv60 / S.mtv60); S["rs60"] = S.sr60 - S.mr60
    S = S.sort_values(["sec", "d"]); S["sh_sus"] = S.groupby("sec").sh_rise.transform(lambda s: (s > 1.1).rolling(10).mean())
    for k in ("sh_sus", "rs60", "bhi"): S["rk_" + k] = S.groupby("d")[k].rank(pct=True)
    S["comp2"] = (S.rk_sh_sus + S.rk_rs60 + S.rk_bhi) / 3
    S["pos"] = S.groupby("d").comp2.rank(ascending=False, method="first")
    POS = {d: dict(zip(x.sec, x.pos)) for d, x in S.groupby("d")}
    top = lambda d, n=K: {a for a, p in POS.get(d, {}).items() if p <= n}
    # 주마다 수요일(휴장이면 그 주 다음 거래일, 없으면 그 주 마지막 거래일) = bt rb_days(2)
    wk = pd.to_datetime(pd.Series(dates)).dt.to_period("W").values; wdy = pd.to_datetime(pd.Series(dates)).dt.weekday.values
    WED = []; i = 0
    while i < len(dates):
        j = i
        while j < len(dates) and wk[j] == wk[i]: j += 1
        cnd = [t for t in range(i, j) if wdy[t] >= 2]; WED.append(dates[cnd[0]] if cnd else dates[j - 1]); i = j
    a0 = dt.date(int(ANCHOR[:4]), int(ANCHOR[4:6]), int(ANCHOR[6:]))
    wkno = lambda s: ((dt.date(int(s[:4]), int(s[4:6]), int(s[6:])) - a0).days + 2) // 7   # 기준 주 0
    CHECK = {w for w in WED if wkno(w) % 2 == 0}
    def prev_wed(d): x = [w for w in WED if w < d and wkno(w) < wkno(d)]; return x[-1] if x else None
    SIGD = {d: x for d, x in df[df.sig].groupby("d")}
    def picks_at(d, flagged=()):
        pw = prev_wed(d); q = top(d) & top(pw) if pw else set(); gq = SIGD.get(d)
        if gq is None: return [], q
        gq = gq[(gq.c > gq.ma20) & (gq.hr >= 1 - NEAR) & ~gq.code.isin(flagged)]
        per = [list(gq[gq.sec == s].sort_values("hr", ascending=False).code.values[:L]) for s in sorted(q, key=lambda s: POS[d][s])]
        return [p[i] for i in range(L) for p in per if i < len(p)][:NSLOT], q
    def keep_at(d):
        gq = SIGD.get(d)
        if gq is None: return set()
        gq = gq[gq.sec.isin(top(d, BUF_SEC)) & (gq.hr >= 1 - BUF_NEAR)]
        rk = gq.groupby("sec").hr.rank(ascending=False); return set(gq.code[rk <= BUF_RANK])
    # 관리종목(KIND) · 거래정지(네이버) 확인 — 오늘 후보만
    pre, qual = picks_at(asof)
    cand = list(pre)
    gq = SIGD[asof]; gq = gq[(gq.c > gq.ma20) & (gq.hr >= 1 - NEAR) & gq.sec.isin(qual)]
    cand += [c for c in gq.sort_values("hr", ascending=False).code if c not in cand][:6]
    admin, admin_ok = set(), False
    b = get("https://kind.krx.co.kr/investwarn/adminissue.do", raw=True,
            data=b"method=searchAdminIssueSub&currentPageSize=3000&pageIndex=1&orderMode=1&orderStat=D&searchMode=&searchCodeType=&searchCorpName=&marketType=&repIsuSrtCd=")
    if b:
        h = b.decode("utf-8", "ignore"); names = re.findall(r"alt='(?:유가증권|코스닥)'>\s*([^<]+?)</a>", h)
        if names: admin = {x.strip() for x in names}; admin_ok = True
    def flag(c):
        bs = get(f"https://m.stock.naver.com/api/stock/{c}/basic") or {}
        ts = (bs.get("tradeStopType") or {}).get("name"); halt = bool(ts and ts != "TRADING") or bs.get("tradableStatus") not in (None, "tradable")
        return c, ("거래정지" if halt else "관리종목" if A.get(c, {}).get("n") in admin else None)
    with ThreadPoolExecutor(6) as ex: fl = {c: w for c, w in ex.map(flag, cand) if w}
    picks, qual = picks_at(asof, set(fl))
    PC = df.pivot(index="d", columns="code", values="c").reindex(dates).ffill()
    PO = df.pivot(index="d", columns="code", values="o").reindex(dates); PO = PO.where(PO > 0, PC)
    row = df[df.d == asof].set_index("code")
    nm = lambda c: A.get(c, {}).get("n", c); sec_of = lambda c: A.get(c, {}).get("sec")
    cs, cb = 1 - SLIP - FEE / 2, 1 + SLIP + FEE / 2
    # ---------------- 가상 5슬롯 계좌 ----------------
    if not st:
        st = dict(v=1, start=ANCHOR, start_cash=START_CASH, cash=float(START_CASH), pos={}, pend=[], hist=[], curve=[], last="00000000", k0=None)
    for d in [x for x in dates if x > st["last"] and x >= st["start"]]:
        if st["k0"] is None: st["k0"] = kos.get(d)
        # 1) 시가 체결 (전날 종가 신호)
        sells = [o for o in st["pend"] if o["act"] != "buy"]; buys = [o for o in st["pend"] if o["act"] == "buy"]
        for o in sells:
            p = st["pos"].get(o["code"])
            if not p: continue
            px = float(PO.at[d, o["code"]]) if o["code"] in PO.columns and not np.isnan(PO.at[d, o["code"]]) else float(PC.at[d, o["code"]])
            q = p["q"] / 2 if o["act"] == "half" else p["q"]
            cash_in = q * px * cs; st["cash"] += cash_in; p["real"] += cash_in; p["q"] -= q
            if o["act"] == "half":
                p["half"] = True; st["hist"].append(dict(code=o["code"], n=p["n"], ed=p["ed"], ep=p["ep"], xd=d, xp=round(px), ret=round((px * cs / (p["ep"] * cb) - 1) * 100, 1), why=o["why"], part="절반"))
            else:
                st["hist"].append(dict(code=o["code"], n=p["n"], ed=p["ed"], ep=p["ep"], xd=d, xp=round(px), ret=round((p["real"] / p["cost"] - 1) * 100, 1), why=o["why"], part="전부"))
                del st["pos"][o["code"]]
        E = st["cash"] + sum(p["q"] * float(PO.at[d, c] if c in PO.columns and not np.isnan(PO.at[d, c]) else PC.at[d, c]) for c, p in st["pos"].items())
        for o in buys:
            c = o["code"]
            if c in st["pos"] or len(st["pos"]) >= NSLOT or c not in PO.columns: continue
            px = float(PO.at[d, c]) if not np.isnan(PO.at[d, c]) else float(PC.at[d, c])
            amt = min(E / NSLOT, st["cash"])
            if amt < 1: continue
            st["cash"] -= amt; st["pos"][c] = dict(n=nm(c), sec=sec_of(c), ed=d, ep=round(px, 2), q=amt / (px * cb), cost=amt, real=0.0, half=False)
        st["pend"] = []
        # 2) 종가 확인 → 다음날 시가 주문
        for c, p in st["pos"].items():
            cl = float(PC.at[d, c])
            if cl <= p["ep"] * (1 - STOP): st["pend"].append(dict(code=c, n=p["n"], act="sell", why="손절 −20%", sig=d))
            elif not p["half"] and cl >= p["ep"] * (1 + TP): st["pend"].append(dict(code=c, n=p["n"], act="half", why="+30% 절반 익절", sig=d))
        if d in CHECK:
            sold = {o["code"] for o in st["pend"] if o["act"] == "sell"}
            if not (br.get(d, 0) >= BR_TH):
                for c, p in st["pos"].items():
                    if c not in sold: st["pend"].append(dict(code=c, n=p["n"], act="sell", why="시장 비율 45% 미만 → 현금", sig=d)); sold.add(c)
            else:
                pk, _ = picks_at(d, set(fl) if d == asof else ()); kp = keep_at(d)
                for c, p in st["pos"].items():
                    if c in pk or c in kp or c in sold: continue
                    st["pend"].append(dict(code=c, n=p["n"], act="sell", why="교체: 유지 조건 벗어남", sig=d)); sold.add(c)
                st["pend"] = [o for o in st["pend"] if not (o["act"] == "half" and o["code"] in sold)]
                free = NSLOT - len([c for c in st["pos"] if c not in sold])
                for c in pk:
                    if c in st["pos"] or free <= 0: continue
                    st["pend"].append(dict(code=c, n=nm(c), act="buy", why="새로 들어옴 (점검일 1등부터)", sig=d)); free -= 1
        eqv = st["cash"] + sum(p["q"] * float(PC.at[d, c]) for c, p in st["pos"].items())
        st["curve"].append([d, round(eqv / st["start_cash"] * 100, 2), round(kos[d] / st["k0"] * 100, 2) if kos.get(d) and st["k0"] else None])
        st["last"] = d
    eqv = st["cash"] + sum(p["q"] * float(PC.at[asof, c]) for c, p in st["pos"].items()) if st["last"] >= st["start"] else st["start_cash"]
    pend_by = {o["code"]: o for o in st["pend"]}
    slots = []
    for c, p in st["pos"].items():
        cl = float(PC.at[asof, c]); o = pend_by.get(c)
        stt = "손절 예정" if o and o["why"].startswith("손절") else "절반 익절 예정" if o and o["act"] == "half" else "교체 예정" if o else "절반 익절함 · 유지" if p["half"] else "유지"
        slots.append(dict(code=c, n=p["n"], sec=p["sec"], ed=p["ed"], ep=round(p["ep"]), c=cl, ret=round(((p["q"] * cl + p["real"]) / p["cost"] - 1) * 100, 1),
                          val=round(p["q"] * cl), w=round(p["q"] * cl / eqv * 100, 1), stop=int(round(p["ep"] * (1 - STOP))), tp=int(round(p["ep"] * (1 + TP))), half=p["half"], status=stt))
    nxt = [w for w in [ (dt.date(int(asof[:4]), int(asof[4:6]), int(asof[6:])) + dt.timedelta(days=x)).strftime("%Y%m%d") for x in range(1, 22)]
           if dt.date(int(w[:4]), int(w[4:6]), int(w[6:])).weekday() == 2 and wkno(w) % 2 == 0][0]
    last_check = max([w for w in CHECK if w <= asof], default=None)
    is_check = asof in CHECK
    view = dict(v=1, made=now.isoformat(timespec="seconds"), asof=asof, start=st["start"], start_cash=st["start_cash"], equity=round(eqv), ret=round((eqv / st["start_cash"] - 1) * 100, 2),
                cash=round(st["cash"]), cash_pct=round(st["cash"] / eqv * 100, 1), kospi_ret=round((st["curve"][-1][2] - 100), 2) if st["curve"] and st["curve"][-1][2] else None,
                slots=slots, empty=NSLOT - len(slots), orders=st["pend"], hist=st["hist"][::-1][:60], curve=st["curve"],
                check=dict(anchor=ANCHOR, every="2주(수요일 장 마감 뒤)", is_check_day=is_check, last=last_check, next=nxt, next_txt=d8(nxt) + " 장 마감 뒤 → 다음날 시가 주문 (휴장이면 그 주 다음 거래일)"),
                rule=dict(n=NSLOT, w="1/5", stop=STOP, tp=TP, br=BR_TH, keep="업종 상위 5 · 업종 안 6위 · 52주 고점 15% 안", slip=SLIP, fee=FEE))
    os.makedirs(os.path.dirname(SLOTS), exist_ok=True)
    stv = dict(st); stv["view"] = view
    json.dump(stv, open(SLOTS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # ---------------- 업종 순위 Top 10 (10점) ----------------
    pw = prev_wed(asof); Sd = S[S.d == asof].sort_values("pos")
    def streak(sname):
        n_ = 0
        for w in [x for x in WED if x <= asof][::-1] if asof in WED else ([asof] + [x for x in WED if x < asof][::-1]):
            if POS.get(w, {}).get(sname, 99) <= K: n_ += 1
            else: break
        return n_
    def leaders_of(sname, n_=2):
        gq = SIGD[asof]; gq = gq[gq.sec == sname].sort_values("hr", ascending=False)
        el = gq[(gq.c > gq.ma20) & (gq.hr >= 1 - NEAR)]
        src = el if len(el) else gq
        return [dict(code=r.code, n=nm(r.code), hi=round((r.hr - 1) * 100, 1), ok=bool(r.c > r.ma20 and r.hr >= 1 - NEAR)) for r in src.head(n_).itertuples()]
    sectors = []
    for r in Sd.head(10).itertuples():
        lp = POS.get(pw, {}).get(r.sec) if pw else None
        sectors.append(dict(n=r.sec, pos=int(r.pos), last=int(lp) if lp else None, chg=(int(lp) - int(r.pos)) if lp else None, streak=streak(r.sec), q=bool(r.sec in qual),
                            sc=round(float(r.comp2) * 10, 1), parts=[round(float(r.rk_sh_sus) * 10 / 3, 1), round(float(r.rk_rs60) * 10 / 3, 1), round(float(r.rk_bhi) * 10 / 3, 1)],
                            sh=round(float(r.sh_rise), 2), sus=round(float(r.sh_sus) * 100), rs60=round(float(r.rs60) * 100, 1), bhi=round(float(r.bhi) * 100), m=int(r.n), top=leaders_of(r.sec)))
    # ---------------- 종목 점수 (10점) ----------------
    now_top = top(asof); posmap = POS.get(asof, {}); BR_ON = bool(br.get(asof, 0) >= BR_TH)
    Z = df[df.d == asof].copy()
    E = Z[Z.sig & (Z.c > Z.ma20) & (Z.hr >= 1 - NEAR) & ~Z.code.isin(set(fl))]
    Z["rk"] = E.groupby("sec").hr.rank(ascending=False, method="first").reindex(Z.index).fillna(0).astype(int)
    Kb = Z[Z.sig & Z.sec.isin(top(asof, BUF_SEC)) & (Z.hr >= 1 - BUF_NEAR)]
    Z["kr"] = Kb.groupby("sec").hr.rank(ascending=False, method="first").reindex(Z.index).fillna(0).astype(int)
    kp_now = keep_at(asof); pick_codes = set(picks)
    scores = {}
    for r in Z.itertuples():
        if not (r.hi250 > 0) or not (r.ma20 > 0) or r.code not in A: continue
        sp = int(posmap.get(r.sec, 0)); sec_s = 3 if r.sec in qual else 1.5 if r.sec in now_top else 0.5 if 0 < sp <= 6 else 0
        hi_s = 2 if r.hr >= 0.95 else 1 if r.hr >= 0.90 else 0
        ma_s = 1 if r.c > r.ma20 else 0
        rk_s = 2 if 0 < r.rk <= L else 0
        liq_s = 0.5 * (r.tv20s >= 30e8) + 0.5 * (r.c <= 1.25 * r.ma20)
        tot = sec_s + hi_s + ma_s + rk_s + (1 if BR_ON else 0) + liq_s
        scores[r.code] = dict(t=round(tot, 1), it=[sec_s, hi_s, ma_s, rk_s, 1 if BR_ON else 0, liq_s], h=round((r.hr - 1) * 100, 1), m20=round(float(r.ma20)), c=r.c,
                              sp=sp, rk=int(r.rk), kr=int(r.kr), keep=int(r.code in kp_now), tv=round(r.tv20s / 1e8), k=int(bool(r.sig)), f=int(r.code in fl), p=int(r.code in pick_codes))
    def pdict(c):
        rr = row.loc[c]
        return dict(code=c, n=nm(c), m=A[c].get("m"), sec=rr.sec, c=float(rr.c), hi=round((rr.hr - 1) * 100, 1), ma20=round(float(rr.ma20)), tv20=round(rr.tv20s / 1e8),
                    stop=int(round(rr.c * (1 - STOP))), tp=int(round(rr.c * (1 + TP))), sc=scores.get(c, {}).get("t"))
    u = df[(df.d == asof) & df.sig]; gap = u.c / u.ma60 - 1; n = len(u); above = int((gap > 0).sum())
    hist = [[d, round(float(v) * 100, 1)] for d, v in br.tail(60).items()]
    out = dict(v=4, asof=asof, made=now.isoformat(timespec="seconds"), checked=now.isoformat(timespec="seconds"), prev_check=pw, this_week=asof,
               rule=dict(br=BR_TH, K=K, L=L, near=NEAR, stop=STOP, tp=TP, n=NSLOT, every="2주 수요일", anchor=ANCHOR, keep=[BUF_SEC, BUF_RANK, BUF_NEAR]),
               check=view["check"],
               breadth=dict(pct=round(above / n * 100, 1), above=above, n=n, need=max(0, math.ceil(BR_TH * n) - above),
                            near5=int(((gap <= 0) & (gap > -0.05)).sum()), near10=int(((gap <= 0) & (gap > -0.10)).sum()), hist=hist),
               on=bool(above / n >= BR_TH), sectors=sectors, qual=sorted(qual), picks=[pdict(c) for c in picks],
               excluded=[dict(code=c, n=nm(c), why=w) for c, w in fl.items()], admin_ok=admin_ok, stocks=len(frames), errors=ERR[:5],
               score_items=["업종 주도 지속", "52주 고점 근접", "20일선 위", "업종 안 상위 3", "시장 폭", "유동성·과열 아님"], score_max=[3, 2, 1, 2, 1, 1], scores=scores,
               slots=dict(equity=view["equity"], ret=view["ret"], cash_pct=view["cash_pct"], empty=view["empty"], slots=slots, orders=st["pend"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    if os.environ.get("GITHUB_OUTPUT"): open(os.environ["GITHUB_OUTPUT"], "a").write("leaders_changed=true\nslots_changed=true\n")
    print("leaders ok", asof, "breadth", out["breadth"]["pct"], "on", out["on"], "check", is_check, "next", nxt, "qual", sorted(qual), "picks", [(x["code"], x["n"]) for x in out["picks"]],
          "slots", len(slots), "orders", len(st["pend"]), "secs", round(time.time() - t0), "s", "errors", len(ERR))
    return 0

if __name__ == "__main__":
    sys.exit(main())
