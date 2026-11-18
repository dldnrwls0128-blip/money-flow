import json, os, sys, math
import numpy as np, pandas as pd
from multiprocessing import Pool
sys.path.insert(0, '/workspace/money-flow/scripts')
import fetch as F   # sr_from_rows, levels (실서비스와 같은 함수)
C = '/workspace/bt_cache2'
codes = json.load(open(C + '/_codes.json'))
def idxdf(sym):
    r = json.load(open(f'{C}/_{sym}.json')); d = pd.DataFrame(r, columns=['d', 'o', 'h', 'l', 'c', 'v']).set_index('d')
    out = pd.DataFrame(index=d.index)
    out['mchg'] = d.c.pct_change() * 100
    out['m_ma20'] = d.c / d.c.rolling(20).mean() - 1
    out['m_ma60'] = d.c / d.c.rolling(60).mean() - 1
    out['m_r5'] = d.c / d.c.shift(5) - 1
    return out
IDX = {'KS': idxdf('KOSPI'), 'KQ': idxdf('KOSDAQ')}
H = 20
def one(code):
    p = f'{C}/{code}.json'
    if not os.path.exists(p): return None
    j = json.load(open(p)); n, m = codes[code]
    px = [r for r in j['px'] if r[2] > 0 and r[3] > 0 and r[4] > 0]
    if len(px) < 140: return None
    d = pd.DataFrame(px, columns=['d', 'o', 'h', 'l', 'c', 'v'])
    fl = j['fl']
    d['net'] = [fl[x][0] if x in fl else np.nan for x in d.d]
    d['fv'] = [fl[x][1] if x in fl else np.nan for x in d.d]
    d['tv'] = d.c * d.v
    d['tv20p'] = d.tv.shift(1).rolling(20).mean()          # 전날까지 20일 평균
    d['chg'] = d.c.pct_change() * 100
    d = d.join(IDX[m], on='d')
    # 현행 5항목 (0~1)
    r1 = d.net / d.fv
    r3 = d.net.rolling(3).sum() / d.fv.rolling(3).sum()
    d['i_sup'] = np.clip(1.5 + (0.5 * r1 + 0.5 * r3) * 7.5, 0, 3) / 3
    d['i_val'] = np.clip(d.tv / d.tv20p, 0, 2) / 2
    d['i_per'] = (d.net > 0).astype(float).rolling(5).sum() / 5
    rel = d.chg - d.mchg.fillna(0)
    d['i_cat'] = np.clip(1 + rel / 4, 0, 2) / 2
    hi60 = d.h.shift(1).rolling(60).max(); lo60 = d.l.shift(1).rolling(60).min()
    d['p60'] = np.clip((d.c - lo60) / (hi60 - lo60), 0, 1)
    d['i_pos'] = 1 - d.p60
    # 추가 후보
    nv = d.net * d.c
    d['fv5'] = nv.rolling(5).sum() / (5 * d.tv20p)       # 5일 순매수 금액 / 평소 거래대금
    d['fv20'] = nv.rolling(20).sum() / (20 * d.tv20p)
    d['f20r'] = d.net.rolling(20).sum() / d.fv.rolling(20).sum()
    s = np.sign(d.net.fillna(0)).values; st = np.zeros(len(d))
    for i in range(len(d)):
        st[i] = (st[i - 1] + s[i] if i and np.sign(st[i - 1]) == s[i] else s[i])
    d['streak'] = st
    d['tvr'] = d.tv / d.tv20p
    d['tvr5'] = d.tv.rolling(5).mean() / d.tv20p
    for k in (5, 20, 60, 120):
        d[f'ma{k}r'] = d.c / d.c.rolling(k).mean() - 1
    d['ma60up'] = d.c.rolling(60).mean() / d.c.rolling(60).mean().shift(10) - 1
    dl = d.c.diff(); up = dl.clip(lower=0).ewm(alpha=1 / 14).mean(); dn = (-dl.clip(upper=0)).ewm(alpha=1 / 14).mean()
    d['rsi'] = 100 - 100 / (1 + up / dn)
    d['d20h'] = d.c / d.h.rolling(20).max() - 1
    d['d60h'] = d.c / d.h.rolling(60).max() - 1
    d['r5'] = d.c / d.c.shift(5) - 1; d['r20'] = d.c / d.c.shift(20) - 1; d['r60'] = d.c / d.c.shift(60) - 1
    d['clv'] = ((d.c - d.l) / (d.h - d.l)).where(d.h > d.l, 0.5)
    d['gap'] = d.o / d.c.shift(1) - 1
    d['vol20'] = d.chg.rolling(20).std()
    # 미래
    for k in (5, 10, 20):
        d[f'y{k}'] = d.c.shift(-k) / d.c - 1
    d['nxo'] = d.o.shift(-1) / d.c - 1
    # 매수 구간 + 목표/손절 선착 (20거래일)
    rows = list(zip(d.d, d.h, d.l)); H_, L_, C_ = d.h.values, d.l.values, d.c.values
    zone = np.full(len(d), np.nan); tgt = np.full(len(d), np.nan); s1p = np.full(len(d), np.nan); stp = np.full(len(d), np.nan); nosup = np.zeros(len(d))
    liq = (d.tv20p >= 30e8).values
    for t in range(130, len(d)):
        if not liq[t]: continue
        sr = F.sr_from_rows(rows[max(0, t - 250):t])
        lv = F.levels(C_[t], sr)
        if not lv: continue
        b1, b2 = lv['buy1'], lv.get('buy2')
        zone[t] = 1.0 if (C_[t] <= b1 * 1.01 and (b2 is None or C_[t] >= b2)) else 0.0
        nosup[t] = 1.0 if lv.get('nosup') else 0.0
        s1, sp = lv.get('sell1'), lv['stop']
        stp[t] = sp / C_[t] - 1
        if s1: s1p[t] = s1 / C_[t] - 1
        if s1 and t + H < len(d):
            res = np.nan
            for k in range(t + 1, t + H + 1):
                hs, ls = H_[k] >= s1, L_[k] <= sp
                if ls: res = 0.0; break          # 같은 날 둘 다면 보수적으로 손절
                if hs: res = 1.0; break
            if np.isnan(res): res = 0.5   # 20일 안에 둘 다 안 닿음
            tgt[t] = res
    d['zone'] = zone; d['tgt'] = tgt; d['s1p'] = s1p; d['stp'] = stp; d['nosup'] = nosup
    d['code'] = code; d['mkt'] = m
    d = d[(d.tv20p >= 30e8) & d.net.notna() & d.ma120r.notna()]
    return d
if __name__ == '__main__':
    with Pool(8) as P:
        parts = [x for x in P.map(one, list(codes), chunksize=8) if x is not None and len(x)]
    df = pd.concat(parts, ignore_index=True)
    df.to_pickle('/workspace/bt2/feat.pkl')
    print(df.shape, df.d.min(), df.d.max(), df.code.nunique())
