import pandas as pd, numpy as np, json
df = pd.read_pickle('df.pkl')
t = df.tvr
tv = np.select([t < .5, t < .7, t <= 2.2, t <= 3.5], [0, 1, 2, 1], 0)
hot = ((df.chg > 8) | (df.tvr > 3.5))
pts = pd.DataFrame({'sup': np.clip(df.f20r / .06, 0, 1) * 3, 'tv': tv, 'vol': np.clip((5 - df.vol20) / 3, 0, 1) * 2,
                    'tr': np.clip((df.d20h + .2) / .15, 0, 1) * 2, 'hot': (~hot).astype(float)})
df['sN'] = pts.round(1).sum(1).round(1)
df['s0'] = (3*df.i_sup + 2*df.i_val + 2*df.i_per + 2*df.i_cat + df.i_pos)
days = sorted(df.d.unique()); blk = {d: i // 10 for i, d in enumerate(days)}
def st(m):
    r = {}
    for tr in (True, False):
        g = df[m & (df.tr == tr)]; b = df[df.tr == tr]
        dd = g.groupby('d')[['ex5', 'ex10']].mean(); bb = dd.groupby(dd.index.map(blk)).mean()
        tt = lambda s: round(float(s.mean() / s.std() * np.sqrt(len(s))), 1)
        z = g[g.tgt.notna()]
        r['tr' if tr else 'te'] = dict(n=int(len(g)), days=int(g.d.nunique()), h5=round(g.h5.mean()*100, 1), h10=round(g.h10.mean()*100, 1),
            ex5=round(g.ex5.mean()*100, 1), ex10=round(g.ex10.mean()*100, 1), t5=tt(bb.ex5), t10=tt(bb.ex10),
            y5=round(g.y5.mean()*100, 2), y10=round(g.y10.mean()*100, 2), tgt=round((z.tgt == 1).mean()*100, 1), stop=round((z.tgt == 0).mean()*100, 1),
            b5=round(b.h5.mean()*100, 1), b10=round(b.h10.mean()*100, 1), by10=round(b.y10.mean()*100, 2))
    return r
R = {}
R['base'] = st(pd.Series(True, index=df.index))
R['zone'] = st(df.zone == 1)
R['old'] = st((df.s0 >= 6.5) & (df.zone == 1))
for th in (6, 6.5, 7, 7.5):
    R[f'new{th}'] = st((df.sN >= th) & (df.zone == 1) & ~hot & (tv == 2))
R['new7_weak'] = st((df.sN >= 7) & (df.zone == 1) & ~hot & (tv == 2) & (df.m_ma20 <= 0))
R['new7_strong'] = st((df.sN >= 7) & (df.zone == 1) & ~hot & (tv == 2) & (df.m_ma20 > 0))
for k, v in R.items(): print(k, v)
m = (df.sN >= 7) & (df.zone == 1) & ~hot & (tv == 2)
print('일평균', round(df[m].groupby('d').size().mean(), 1), '신호일', df[m].d.nunique())
meta = dict(period=[days[0], days[-1]], cut=df[~df.tr].d.min(), train=[days[0], df[df.tr].d.max()], test=[df[~df.tr].d.min(), days[-1]],
            days=len(days), days_tr=int(df[df.tr].d.nunique()), days_te=int(df[~df.tr].d.nunique()), stocks=int(df.code.nunique()), obs=int(len(df)))
print(meta)
json.dump({'meta': meta, 'R': R}, open('out.json', 'w'), ensure_ascii=False)
per = df.d.str[:4] + np.where(df.d.str[4:6].astype(int) <= 6, '상', '하')
halves = []
for p in sorted(per.unique()):
    g = df[m & (per == p)]; b = df[per == p]
    if len(g) < 300: continue
    halves.append([p[2:4] + '년 ' + p[4:] + '반기', int(len(g)), round(g.h10.mean()*100, 1), round(b.h10.mean()*100, 1), round(g.ex10.mean()*100, 1)])
print(halves)
K = lambda x: {k: {kk: (float(vv) if not isinstance(vv, int) else vv) for kk, vv in v.items()} for k, v in x.items()}
A = {'made': '2026-11-18', 'v': 2, **meta, 'base': K(R['base']), 'zone': K(R['zone']), 'old': K(R['old']),
     'rule': {k[3:]: K(R[k]) for k in ('new6', 'new6.5', 'new7', 'new7.5')}, 'weak': K(R['new7_weak']), 'strong': K(R['new7_strong']), 'halves': halves}
json.dump(A, open('/workspace/money-flow/analysis.json', 'w'), ensure_ascii=False, separators=(',', ':'))
