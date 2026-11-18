import pandas as pd, numpy as np
df = pd.read_pickle('feat.pkl')
df = df[df.y10.notna() & (df.y10.abs() < 2)]
cnt = df.groupby('d').size(); days = sorted(cnt[cnt >= 100].index); df = df[df.d.isin(days)]
cut = days[int(len(days) * 2 / 3)]
df['tr'] = df.d < cut
for k in (5, 10): df[f'h{k}'] = (df[f'y{k}'] > 0).astype(float)
for k in (5, 10): df[f'ex{k}'] = df[f'h{k}'] - df.groupby('d')[f'h{k}'].transform('mean')
print('days', len(days), days[0], days[-1], 'cut', cut, 'obs', len(df), 'train', df.tr.sum(), 'test', (~df.tr).sum())
for s, g in df.groupby('tr'): print('train' if s else 'test', 'base h5 %.1f h10 %.1f y10 %.2f%%' % (g.h5.mean()*100, g.h10.mean()*100, g.y10.mean()*100))
df['s0'] = 3*df.i_sup + 2*df.i_val + 2*df.i_per + 2*df.i_cat + df.i_pos
F = ['s0','i_sup','i_val','i_per','i_cat','i_pos','fv5','fv20','f20r','streak','tvr','tvr5','ma5r','ma20r','ma60r','ma120r','ma60up','rsi','d20h','d60h','chg','r5','r20','r60','clv','gap','vol20','p60']
out = []
for f in F:
    q = np.minimum((df.groupby('d')[f].rank(pct=True) * 5).apply(np.ceil) - 1, 4)
    for tr in (True, False):
        g = df[df.tr == tr].assign(q=q[df.tr == tr])
        m = g.groupby('q')[['ex10', 'ex5']].mean() * 100
        out.append((f, 'TR' if tr else 'TE', ' '.join('%+.1f' % v for v in m.ex10), ' '.join('%+.1f' % v for v in m.ex5)))
for o in out: print('%-7s %s ex10(Q1..Q5): %-28s ex5: %s' % o)
df.to_pickle('df.pkl')
