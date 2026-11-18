import pandas as pd, numpy as np, json
from comp import comps
df = pd.read_pickle('df.pkl'); c = comps(df)
def newscore(c, w=(3, 2, 2, 2, 1)):
    return w[0]*c.flow20 + w[1]*c.tv + w[2]*c.vol + w[3]*c.trend + w[4]*(1 - c.hot)
df['sA'] = newscore(c); df['sB'] = newscore(c, (2, 2, 3, 2, 1))
df['s0'] = 3*df.i_sup + 2*df.i_val + 2*df.i_per + 2*df.i_cat + df.i_pos
days = sorted(df.d.unique()); blk = {d: i // 10 for i, d in enumerate(days)}
df['blk'] = df.d.map(blk)
def st(m, label, out=None):
    r = {}
    for tr in (True, False):
        g = df[m & (df.tr == tr)]
        if len(g) == 0: continue
        dd = g.groupby('d')[['ex5', 'ex10']].mean(); dd['blk'] = dd.index.map(blk)
        b = dd.groupby('blk').mean()
        t = lambda s: s.mean() / s.std() * np.sqrt(len(s))
        z = g[g.tgt.notna()]
        r['TR' if tr else 'TE'] = dict(n=len(g), days=g.d.nunique(), h5=round(g.h5.mean()*100, 1), h10=round(g.h10.mean()*100, 1), ex5=round(g.ex5.mean()*100, 1), ex10=round(g.ex10.mean()*100, 1),
            t5=round(t(b.ex5), 1), t10=round(t(b.ex10), 1), y5=round(g.y5.mean()*100, 2), y10=round(g.y10.mean()*100, 2), med10=round(g.y10.median()*100, 2),
            tgt=round((z.tgt == 1).mean()*100, 1), stop=round((z.tgt == 0).mean()*100, 1), ntgt=len(z))
    print('%-40s' % label + ' | '.join(f"{k} n={v['n']} 일{v['days']} 5일 {v['h5']}%({v['ex5']:+} t{v['t5']}) 10일 {v['h10']}%({v['ex10']:+} t{v['t10']}) 평균 {v['y5']:+}/{v['y10']:+}% 중앙 {v['med10']:+}% 목표먼저 {v['tgt']}% 손절먼저 {v['stop']}%" for k, v in r.items()))
    if out is not None: out[label] = r
    return r
O = {}
ALL = pd.Series(True, index=df.index)
st(ALL, '전체(기준)', O)
st(df.zone == 1, '매수 구간 전체', O)
st((df.s0 >= 6.5) & (df.zone == 1), '현재앱: 현점수≥6.5 & 매수구간', O)
st(df.s0 >= 6.5, '현점수≥6.5', O)
for th in (6, 6.5, 7, 7.5, 8, 8.5):
    st(df.sA >= th, f'새점수A≥{th}', O)
for th in (6, 6.5, 7, 7.5, 8):
    st((df.sA >= th) & (df.zone == 1), f'새점수A≥{th} & 매수구간', O)
for th in (7, 7.5):
    st((df.sB >= th) & (df.zone == 1), f'새점수B≥{th} & 매수구간', O)
st((df.sA >= 7) & (df.zone == 1) & (c.hot == 0) & (c.tv == 1), '새A≥7 & 구간 & 과열X & 거래 0.7~2.2', O)
st((df.sA >= 7) & (df.zone == 1) & (df.nosup == 0), '새A≥7 & 구간 & 신저가X', O)
st((df.sA >= 7) & (df.zone == 1) & (df.f20r > 0), '새A≥7 & 구간 & 20일순매수+', O)
st((df.sA >= 7) & (df.zone == 1) & (df.m_ma60 > 0), '새A≥7 & 구간 & 시장>60일선', O)
st((df.sA >= 7) & (df.zone == 1) & (df.m_ma60 <= 0), '새A≥7 & 구간 & 시장<60일선', O)
st((df.sA >= 7) & (df.zone == 1) & (df.m_ma20 > 0), '새A≥7 & 구간 & 시장>20일선', O)
st((df.sA >= 7) & (df.zone == 1) & (df.m_ma20 <= 0), '새A≥7 & 구간 & 시장<20일선', O)
json.dump(O, open('final.json', 'w'), ensure_ascii=False)
df[['d','code','sA','s0','zone','h10','h5','y10','tr','m_ma20','m_ma60']].to_pickle('scores.pkl')
