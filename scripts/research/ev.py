import pandas as pd, numpy as np, itertools, sys
from comp import comps
df = pd.read_pickle('df.pkl'); c = comps(df)
rng = np.random.default_rng(0); df['rnd'] = rng.random(len(df)) * 1e-6
def tstat(s, step):
    s = s.dropna(); s = s.iloc[::step]
    return s.mean() / s.std() * np.sqrt(len(s)) if len(s) > 2 else np.nan
def evaluate(score, label, K=20, verbose=True):
    d = df.assign(sc=score + df.rnd)
    out = {}
    for tr in (True, False):
        g = d[d.tr == tr]
        top = g[g.groupby('d').sc.rank(ascending=False, method='first') <= K]
        day = top.groupby('d').agg(h5=('h5', 'mean'), h10=('h10', 'mean'), y10=('y10', 'mean'))
        base = g.groupby('d').agg(h5=('h5', 'mean'), h10=('h10', 'mean'), y10=('y10', 'mean'))
        ex = day - base
        out['TR' if tr else 'TE'] = dict(h5=day.h5.mean() * 100, h10=day.h10.mean() * 100, b5=base.h5.mean() * 100, b10=base.h10.mean() * 100,
            y10=day.y10.mean() * 100, by10=base.y10.mean() * 100, t5=tstat(ex.h5, 5), t10=tstat(ex.h10, 10), n=len(top), days=len(day))
    if verbose:
        print('%-34s' % label + ' | '.join('%s top%d 5d %.1f%%(기준 %.1f, t %.1f) 10d %.1f%%(기준 %.1f, t %.1f) 10d수익 %+.2f%%(기준 %+.2f)' % (k, K, v['h5'], v['b5'], v['t5'], v['h10'], v['b10'], v['t10'], v['y10'], v['by10']) for k, v in out.items()))
    return out
S0 = 3*df.i_sup + 2*df.i_val + 2*df.i_per + 2*df.i_cat + df.i_pos
if __name__ == '__main__':
    evaluate(S0, '현재 3·2·2·2·1')
    V = {'A 수급3 거래2 안정2 추세2 과열-1': 3*c.flow20 + 2*c.tv + 2*c.vol + 2*c.trend + (1 - c.hot),
         'B 수급2 거래2 안정3 추세2 과열1': 2*c.flow20 + 2*c.tv + 3*c.vol + 2*c.trend + (1 - c.hot),
         'C 수급3 거래3 안정2 추세1 과열1': 3*c.flow20 + 3*c.tv + 2*c.vol + 1*c.trend + (1 - c.hot),
         'D 수급3 거래2 안정2 추세1 과열1 RSI1': 3*c.flow20 + 2*c.tv + 2*c.vol + c.trend + (1 - c.hot) + c.rsi30,
         'E 동일 1씩': c.flow20 + c.tv + c.vol + c.trend + (1 - c.hot),
         'F A+현재수급(sup)1': 3*c.flow20 + 2*c.tv + 2*c.vol + 2*c.trend + (1 - c.hot) + c.sup,
         'G 수급만(20일)': c.flow20, 'H 안정만': c.vol, 'I 거래만': c.tv, 'J 추세만': c.trend}
    for k, v in V.items(): evaluate(v, k)
