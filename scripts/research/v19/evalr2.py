import numpy as np, pandas as pd
from sim import sim
from plans2 import plan2
from plans import plan
df = pd.read_pickle('panel2.pkl')
O, H, L, C = [df[k].values.astype(np.float64) for k in ('o', 'h', 'l', 'c')]; END = df.END.values.astype(np.int64)
S_ = df[df.sig].copy(); rows = S_.index.values.astype(np.int64)
P = {k: S_[k].values.astype(np.float64) for k in ('c', 'atr', 'b1', 'b2', 'st', 's1', 's2')}
TR = S_.tr.values; D = S_.d.values; CODE = S_.code.values
def run(kind, *a, hold=20, be=0):
    if kind == 'v18': B = plan(P, 'appL', 'app', 'app'); ce = False
    else: B = plan2(P, *a); ce = True
    return sim(O, H, L, C, END, rows, *B, ce, hold, 5, be) + (B,)
def metrics(r, held, code, m):
    mm = m & ~np.isnan(r); x = r[mm]; w, l = x[x > 0], x[x <= 0]
    dd = pd.Series(x, index=D[mm]).groupby(level=0).mean().sort_index() / 20
    eq = dd.cumsum(); mdd = (eq - eq.cummax()).min()
    ndays = len(set(D[m]))
    return dict(n=int(len(x)), 일평균=round(len(x) / max(ndays, 1), 1), 체결률=round(mm.sum() / max(m.sum(), 1) * 100, 1), 승률=round(len(w) / len(x) * 100, 1),
                평균이익=round(w.mean() * 100, 2), 평균손실=round(l.mean() * 100, 2), 손익비=round(w.mean() / -l.mean(), 2), PF=round(w.sum() / -l.sum(), 2),
                기대수익=round(x.mean() * 100, 2), 일당=round(x.mean() * 100 / max(held[mm].mean(), 1), 3), 보유일=round(held[mm].mean(), 1),
                하위5=round(np.percentile(x, 5) * 100, 1), 목표2=round((code[mm] == 1).mean() * 100, 1), 손절=round(np.isin(code[mm], (2,)).mean() * 100, 1),
                손절T1후=round((code[mm] == 3).mean() * 100, 1), 시간=round(np.isin(code[mm], (4, 5)).mean() * 100, 1), MDD=round(mdd * 100, 1))
def halves(r, m):
    per = pd.Series(D).str[:4] + np.where(pd.Series(D).str[4:6].astype(int) <= 6, 'H1', 'H2')
    return {p: round(np.nanmean(r[m & (per.values == p)]) * 100, 2) for p in sorted(per.unique()) if (m & (per.values == p)).sum() > 200}
