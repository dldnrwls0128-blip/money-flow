import pandas as pd, numpy as np, json
df = pd.read_pickle('panel.pkl')
A = json.load(open('/workspace/money-flow/all.json'))['s']
df['sec'] = df.code.map(lambda c: (A.get(c) or {}).get('sec') or '기타')
g = df.groupby('code', sort=False)
# 시장 거래대금 비중 (우리 표본 838종목 합 기준)
tot = df.groupby('d').tv.transform('sum'); df['shr'] = df.tv / tot
df['shr5'] = g.shr.transform(lambda x: x.rolling(5).mean()); df['shr60'] = g.shr.transform(lambda x: x.shift(5).rolling(60).mean())
df['m_share'] = df.shr5 / df.shr60                      # 최근 5일 비중 ÷ 그전 60일 비중
# 거래대금 꾸준함: 최근 5일 중 평소(20일 평균)보다 많았던 날 수, 5일 평균/20일 평균
above = (df.tv > df.tv20p).astype(float); df['m_days'] = above.groupby(df.code).transform(lambda x: x.rolling(5).sum())
df['m_tvr5'] = df.tvr5
# 거래대금 순위 상승: 5일 평균 거래대금 순위 백분위 − 60일 평균 순위 백분위
df['tv5'] = g.tv.transform(lambda x: x.rolling(5).mean()); df['tv60'] = g.tv.transform(lambda x: x.shift(5).rolling(60).mean())
df['m_rank'] = df.groupby('d').tv5.rank(pct=True) - df.groupby('d').tv60.rank(pct=True)
# 업종 돈 쏠림: 업종 5일 거래대금 비중 ÷ 60일 비중
st = df.groupby(['sec', 'd']).tv.sum().rename('stv').reset_index()
st['sshr'] = st.stv / st.groupby('d').stv.transform('sum')
st = st.sort_values(['sec', 'd']); gs = st.groupby('sec').sshr
st['m_sector'] = gs.transform(lambda x: x.rolling(5).mean()) / gs.transform(lambda x: x.shift(5).rolling(60).mean())
df = df.merge(st[['sec', 'd', 'm_sector']], on=['sec', 'd'], how='left')
df = df.sort_values(['code', 'd']).reset_index(drop=True)
# 매집: 20일 상승일 거래량 비율, OBV 20일 변화 ÷ 20일 거래량
up = (df.c > g.c.shift(1)).astype(float) if False else (df.c > df.groupby('code').c.shift(1)).astype(float)
uv = (df.v * up).groupby(df.code).transform(lambda x: x.rolling(20).sum()); vv = df.v.groupby(df.code).transform(lambda x: x.rolling(20).sum())
df['m_upvol'] = uv / vv
sgn = np.sign(df.c - df.groupby('code').c.shift(1)).fillna(0)
df['m_obv'] = (sgn * df.v).groupby(df.code).transform(lambda x: x.rolling(20).sum()) / vv
# 스마트머니(외국인+기관) 20일·5일, 개인은 그 반대로 근사
df['m_smart20'] = df.f20r; df['m_smart5'] = df.fv5
assert (df.END.values >= df.index.values).all()
# END 다시 계산 (정렬 바뀜 대비)
gg = df.groupby('code').cumcount(); n = df.groupby('code').d.transform('size'); df['END'] = (df.index - gg + n - 1).astype(np.int64)
df.to_pickle('panel2.pkl'); print(df[df.sig][['m_share','m_days','m_tvr5','m_rank','m_sector','m_upvol','m_obv','m_smart20']].describe().round(3).to_string())
