import pandas as pd, numpy as np
df = pd.read_pickle('/workspace/bt2/feat2.pkl').sort_values(['code', 'd']).reset_index(drop=True)
g = df.groupby('code').cumcount(); n = df.groupby('code').d.transform('size')
df['END'] = (df.index - g + n - 1).astype(np.int64)   # 종목 마지막 행
CUT = '20251114'
cnt = df[df.keep].groupby('d').size(); okd = set(cnt[cnt >= 100].index)
df['sig'] = df.keep & df.d.isin(okd) & (df.d >= '20231130') & (df.index + 20 <= df.END)
df['tr'] = df.d < CUT
# v1.8 점수
t = df.tvr
df['p_sup'] = np.clip(df.f20r / .06, 0, 1) * 3
df['p_tv'] = np.select([t < .5, t < .7, t <= 2.2, t <= 3.5], [0, 1, 2, 1], 0)
df['p_vol'] = np.clip((5 - df.vol20) / 3, 0, 1) * 2
df['p_tr'] = np.clip((df.d20h + .2) / .15, 0, 1) * 2
df['hot'] = (df.chg > 8) | (df.tvr > 3.5)
df['p_hot'] = (~df.hot).astype(float)
df['s18'] = df[['p_sup', 'p_tv', 'p_vol', 'p_tr', 'p_hot']].sum(axis=1)
df.to_pickle('/workspace/bt3/panel.pkl')
s = df[df.sig]; print(len(df), 'sig', len(s), 'tr', s.tr.sum(), 'te', (~s.tr).sum(), s.d.min(), s.d.max())
