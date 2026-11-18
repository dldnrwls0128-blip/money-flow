import json, os, re, sys, time
sys.path.insert(0, '/workspace/money-flow/scripts')
import backtest as b
from concurrent.futures import ThreadPoolExecutor
C = '/workspace/bt_cache2'
A = json.load(open('/workspace/money-flow/all.json'))['s']
pref = re.compile(r"(\d?우[A-C]?|우선주)$|스팩|SPAC|ETN|리츠$")
codes = sorted(c for c, r in A.items() if not r.get('pf') and not pref.search(r['n']) and (r.get('a20') or 0) >= 10)
json.dump({c: [A[c]['n'], A[c]['m']] for c in codes}, open(C + '/_codes.json', 'w'), ensure_ascii=False)
for sym in ('KOSPI', 'KOSDAQ'):
    json.dump(b.sise(sym, start='20230601'), open(f'{C}/_{sym}.json', 'w'))
def one(c):
    p = f'{C}/{c}.json'
    if os.path.exists(p): return 1
    r = {'px': b.sise(c, start='20230601'), 'fl': b.flows(c, pages=12)}
    json.dump(r, open(p, 'w')); return 1
t = time.time(); n = 0
with ThreadPoolExecutor(16) as ex:
    for _ in ex.map(one, codes):
        n += 1
        if n % 50 == 0: print(n, len(codes), round(time.time() - t), flush=True)
print('done', n, round(time.time() - t), flush=True)
