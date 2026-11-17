"""종목정보(info.json) 만들기: 시총·실적·PER·PBR·ROE·배당·52주·외인소진율·회사 소개·최근 뉴스.
- 대상: 20일 평균 거래대금 30억↑(우선주·스팩 제외) + Top 목록 + 업종 탑픽 (보유 종목 같은 개인 정보는 쓰지 않음)
- 재무/지표: 하루 1번(18시 이후 또는 --force) 전부 새로, 그 외에는 빠진 종목만
- 뉴스: 주목 종목(Top·탑픽·🎯매수 후보)은 1시간마다, 나머지는 하루 1번
"""
import json, os, re, sys, html, time, datetime as dt
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import urllib.request
from fetch import num, ROOT, KST, PREF, ERRORS, UA

T0 = time.time(); BUDGET = float(os.environ.get("INFO_BUDGET", "480"))   # 초. 넘으면 남은 건 다음 실행으로
def left(): return BUDGET - (time.time() - T0)
FAIL = {"n": 0}
def get(url, tries=2, raw=False, timeout=8):
    for i in range(tries):
        if left() < 5: return None
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://m.stock.naver.com/"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read(); return b if raw else json.loads(b.decode("utf-8"))
        except Exception as e:
            last = e; time.sleep(0.5)
    FAIL["n"] += 1
    if FAIL["n"] <= 5: ERRORS.append(f"{url.split('?')[0]}: {last}")
    return None

def pmap(fn, items, chunk=48):
    """시간 안에서만 나눠 처리. 처리한 것만 (code, 결과)로 돌려줌"""
    out = []
    with ThreadPoolExecutor(8) as ex:
        for i in range(0, len(items), chunk):
            if left() < 30: print("시간 예산 다 씀, 남은", len(items) - i, "개는 다음에", flush=True); break
            part = items[i:i + chunk]; out += list(zip(part, ex.map(fn, part)))
    return out

MIN_TV = 30
now = dt.datetime.now(KST); today = now.strftime("%Y%m%d"); hm = now.hour * 100 + now.minute
force = "--force" in sys.argv
cpath = os.path.join(ROOT, "cache", "info.json")
cache = json.load(open(cpath, encoding="utf-8")) if os.path.exists(cpath) else {}
if cache.get("v") != 1: cache = {"v": 1, "day": "", "s": {}, "news": {}}

A = json.load(open(os.path.join(ROOT, "all.json"), encoding="utf-8"))["s"]
D = json.load(open(os.path.join(ROOT, "data.json"), encoding="utf-8"))
liquid = {c for c, r in A.items() if r.get("s") is not None and not r.get("pf") and not PREF.search(r["n"]) and (r.get("a20") or 0) >= MIN_TV}
featured = {s["code"] for s in D.get("stocks_top", [])}
for sec in D.get("sectors_all", []): featured |= set(sec.get("picks") or [])
for c in liquid:   # 🎯매수 후보(6.0점↑, 매수 구간 또는 3% 이내)
    r = A[c]; L = r.get("l")
    if r["s"] >= 6.0 and L and r.get("p") and r["p"] <= L[0] * 1.03 and (L[1] is None or r["p"] >= L[1]): featured.add(c)
universe = liquid | featured
print("info 대상", len(universe), "주목", len(featured), flush=True)

def fin_rows(fi):
    if not fi: return None
    fi = fi.get("financeInfo") or {}
    keys = [t["key"] for t in fi.get("trTitleList", []) if t.get("isConsensus") == "N"]
    rows = {r["title"]: r["columns"] for r in fi.get("rowList", [])}
    def v(t, k):
        x = (rows.get(t) or {}).get(k) or {}; return num(x.get("value"))
    return keys, v

def fundamentals(code):
    it = get(f"https://m.stock.naver.com/api/stock/{code}/integration")
    if not it: return None
    ti = {t.get("code"): t.get("value") for t in it.get("totalInfos") or []}
    rec = {"mc": ti.get("marketValue"), "per": ti.get("per"), "pbr": ti.get("pbr"), "dy": ti.get("dividendYieldRatio"),
           "fr": ti.get("foreignRate"), "h52": ti.get("highPriceOf52Weeks"), "l52": ti.get("lowPriceOf52Weeks"),
           "eps": ti.get("eps"), "cper": ti.get("cnsPer"), "t": now.strftime("%Y-%m-%d")}
    cs = it.get("consensusInfo") or {}
    if cs.get("priceTargetMean"): rec["tp"] = [cs.get("priceTargetMean"), cs.get("createDate")]
    for kind, lag in (("annual", 1), ("quarter", 4)):   # 연간은 전년, 분기는 4분기 전과 비교(YoY)
        fr = fin_rows(get(f"https://m.stock.naver.com/api/stock/{code}/finance/{kind}"))
        if not fr: continue
        keys, v = fr
        if not keys: continue
        k = keys[-1]; k0 = keys[-1 - lag] if len(keys) > lag else None
        x = {"p": k, "rev": v("매출액", k), "op": v("영업이익", k), "ni": v("당기순이익", k)}
        if k0: x.update(p0=k0, rev0=v("매출액", k0), op0=v("영업이익", k0), ni0=v("당기순이익", k0))
        if kind == "annual": rec["roe"] = v("ROE", k); rec["roep"] = k
        rec["a" if kind == "annual" else "q"] = x
    return rec

def describe(code):
    b = get(f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}", tries=1, raw=True, timeout=6)
    if not b: return None
    h = b.decode("utf-8", "ignore")
    m = re.search(r'class="cmp_comment">(.*?)</div>', h, re.S)
    if not m: return None
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))).strip()
    t = re.sub(r"^기업개요\s*\[기준:[^\]]*\]\s*", "", t)
    s = re.split(r"(?<=음\.)|(?<=임\.)|(?<=다\.)", t)[0].strip()
    return s[:140] if s else None

def news(code):
    j = get(f"https://m.stock.naver.com/api/news/stock/{code}?pageSize=3&page=1")
    out = []
    for grp in j or []:
        for x in grp.get("items", [])[:1]:
            if x.get("title") and x.get("mobileNewsUrl"):
                out.append([html.unescape(x["title"]), x.get("datetime", "")[:12], x["mobileNewsUrl"], x.get("officeName", "")])
        if len(out) >= 2: break
    return out

full = force or (hm >= 1800 and cache["day"] != today) or not cache["s"]
S = cache["s"]
tday = now.strftime("%Y-%m-%d")
pri = lambda c: (c not in featured, c)   # 주목 종목 먼저
todo = sorted((c for c in universe if S.get(c, {}).get("t") != tday), key=pri) if full else sorted((c for c in universe if c not in S), key=pri)[:200]
changed = False
if todo:
    t0 = time.time()
    done = pmap(fundamentals, todo)
    for c, r in done:
        if r:
            if S.get(c, {}).get("d"): r["d"] = S[c]["d"]; r["dt"] = S[c].get("dt")
            S[c] = r
    print("지표", len(done), "/", len(todo), "종목", round(time.time() - t0), "초, 실패", FAIL["n"], flush=True); changed = True
    if full and len(done) == len(todo) and hm >= 1800: cache["day"] = today
# 뉴스
N = cache["news"]
def stale(c, mins): return c not in N or (now - dt.datetime.fromisoformat(N[c]["t"])).total_seconds() > mins * 60
nq = sorted(c for c in featured if stale(c, 60)) + ([c for c in universe - featured if stale(c, 20 * 60)] if full else [])
if nq:
    for c, n in pmap(news, nq):
            N[c] = {"t": now.isoformat(timespec="minutes"), "i": n}
    changed = True
# 회사 소개는 30일마다
need_d = [c for c in universe if c in S and (not S[c].get("dt") or (now - dt.datetime.strptime(S[c]["dt"], "%Y-%m-%d").replace(tzinfo=KST)).days > 30)][:600]
if need_d:
    t0 = time.time(); probe = [describe(c) for c in need_d[:3]]   # 막혀 있으면 건너뜀
    ok = any(probe); print("회사 소개 시험", sum(1 for p in probe if p), "/3", flush=True)
    for c, d in list(zip(need_d[:3], probe)) + (pmap(describe, need_d[3:]) if ok else []):
            S[c]["dt"] = now.strftime("%Y-%m-%d")
            if d: S[c]["d"] = d
    changed = True
# 대상에서 빠진 종목 정리 (보관은 하되 출력은 대상만)
os.makedirs(os.path.dirname(cpath), exist_ok=True)
json.dump(cache, open(cpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
out = {"updated": now.isoformat(timespec="minutes"), "s": {c: S[c] for c in sorted(universe) if c in S},
       "news": {c: N[c]["i"] for c in sorted(universe) if c in N and N[c]["i"]}, "newsAt": {c: N[c]["t"] for c in featured if c in N}}
json.dump(out, open(os.path.join(ROOT, "info.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("info.json", len(out["s"]), "종목 지표,", len(out["news"]), "종목 뉴스,", sum(1 for x in out["s"].values() if x.get("d")), "소개,",
      round(os.path.getsize(os.path.join(ROOT, "info.json")) / 1e3), "KB · 오류", len(ERRORS))
if os.environ.get("GITHUB_OUTPUT"):
    open(os.environ["GITHUB_OUTPUT"], "a").write("info_changed=true\n" if changed else "")
