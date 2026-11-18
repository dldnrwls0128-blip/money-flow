import pandas as pd, numpy as np
df = pd.read_pickle('df.pkl')
def qq(f, n): return np.minimum(np.ceil(df.groupby('d')[f].rank(pct=True) * n) - 1, n - 1)
df['vq'] = qq('vol20', 3)
for f in ['f20r', 'fv5', 'i_sup', 'd20h', 'tvr', 'chg', 'rsi', 'ma60r']:
    df['fq'] = qq(f, 5)
    for tr in (True, False):
        g = df[df.tr == tr]; t = g.groupby(['vq', 'fq']).ex10.mean().unstack() * 100
        print(f, 'TR' if tr else 'TE', ' | '.join(' '.join('%+.1f' % v for v in r) for r in t.values))
# regime
for tr in (True, False):
    g = df[df.tr == tr]
    print('regime', 'TR' if tr else 'TE', g.groupby(g.m_ma20 > 0)[['h5', 'h10', 'y10']].mean().round(3).to_dict('index'), g.groupby(g.m_ma20 > 0).d.nunique().to_dict())
    print('regime60', g.groupby(g.m_ma60 > 0)[['h10', 'y10']].mean().round(3).to_dict('index'))
    print('mr5', g.groupby(pd.cut(g.m_r5, [-1, -.03, 0, .03, 1]))[['h10','y10']].mean().round(3).to_dict('index'))
