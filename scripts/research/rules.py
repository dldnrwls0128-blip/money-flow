import pandas as pd, numpy as np
from comp import comps
df = pd.read_pickle('df.pkl'); c = comps(df)
conds = {
 'flow20+': df.f20r > 0.02, 'per>=3': df.i_per >= 0.6, 'sup+': df.i_sup > 0.6, 'streak>=2': df.streak >= 2,
 'tv0.7-2.2': (df.tvr >= .7) & (df.tvr <= 2.2), 'vol<3': df.vol20 < 3, 'vol<4': df.vol20 < 4,
 'up60': df.ma60r > 0, 'up120': df.ma120r > 0, 'pull5': df.ma5r < 0, 'near20ma': df.ma20r.abs() < 0.03,
 'd20h>-8%': df.d20h > -.08, 'd20h>-12%': df.d20h > -.12, 'nohot': c.hot == 0, 'chg<0': df.chg < 0, 'rsi<60': df.rsi < 60,
 'zone': df.zone == 1, 'mkt>ma20': df.m_ma20 > 0, 'mkt>ma60': df.m_ma60 > 0}
def stat(m):
    o = []
    for tr in (True, False):
        g = df[m & (df.tr == tr)]
        dd = g.groupby('d').agg(h10=('h10','mean'), ex=('ex10','mean'), ex5=('ex5','mean'), y=('y10','mean'))
        s = dd.ex.iloc[::10]; t = s.mean()/s.std()*np.sqrt(len(s)) if len(s) > 2 else np.nan
        o.append((len(g), g.h10.mean()*100, g.ex10.mean()*100, g.ex5.mean()*100, g.y10.mean()*100, t, len(dd)))
    return o
def pr(name, m):
    a, b = stat(m)
    print('%-48s TR n=%6d h10 %.1f ex10 %+.1f ex5 %+.1f y10 %+.2f t %.1f | TE n=%6d h10 %.1f ex10 %+.1f ex5 %+.1f y10 %+.2f t %.1f' % ((name,) + a[:6] + b[:6]))
for k, m in conds.items(): pr(k, m)
print('--- 조합')
import itertools
keys = ['flow20+', 'per>=3', 'tv0.7-2.2', 'vol<4', 'up60', 'pull5', 'd20h>-12%', 'nohot', 'zone', 'rsi<60', 'chg<0']
res = []
for r in (2, 3, 4):
    for ks in itertools.combinations(keys, r):
        m = np.logical_and.reduce([conds[k] for k in ks])
        g = df[m & df.tr]
        if len(g) < 3000: continue
        res.append((g.ex10.mean(), ks))
res.sort(reverse=True)
for v, ks in res[:25]: pr(' & '.join(ks), np.logical_and.reduce([conds[k] for k in ks]))
