import pandas as pd, numpy as np
from comp import comps
df = pd.read_pickle('df.pkl'); c = comps(df)
sA = 3*c.flow20 + 2*c.tv + 2*c.vol + 2*c.trend + (1 - c.hot)
rule = lambda s, th=7: (s >= th) & (df.zone == 1) & (c.hot == 0) & (c.tv == 1)
def show(m, lab):
    r = []
    for tr in (True, False):
        g = df[m & (df.tr == tr)]; r.append(f"{'TR' if tr else 'TE'} n={len(g)} h10 {g.h10.mean()*100:.1f} ex10 {g.ex10.mean()*100:+.1f} h5 {g.h5.mean()*100:.1f} ex5 {g.ex5.mean()*100:+.1f} y10 {g.y10.mean()*100:+.2f}")
    print('%-30s' % lab, ' | '.join(r))
show(rule(sA), '최종')
s_noflow = (2*c.tv + 2*c.vol + 2*c.trend + (1 - c.hot)) * 10 / 7
show(rule(s_noflow), '수급 뺀 점수(7점→10환산)')
show((df.zone == 1) & (c.hot == 0) & (c.tv == 1), '구간+과열X+거래만(점수無)')
show(rule(sA) & (df.f20r > 0.02), '최종 & 20일순매수≥2%')
show(rule(sA, 6), '최종 th6'); show(rule(sA, 8), '최종 th8')
print('-- 기간별 (최종 규칙)')
m = rule(sA); per = df.d.str[:4] + np.where(df.d.str[4:6].astype(int) <= 6, 'H1', 'H2')
for p in sorted(per.unique()):
    g = df[m & (per == p)]; b = df[per == p]
    print(p, 'n', len(g), 'h10 %.1f 기준 %.1f ex10 %+.1f | h5 %.1f 기준 %.1f | y10 %+.2f 기준 %+.2f' % (g.h10.mean()*100, b.h10.mean()*100, g.ex10.mean()*100, g.h5.mean()*100, b.h5.mean()*100, g.y10.mean()*100, b.y10.mean()*100))
print('-- 새 점수 구간별 (전 종목)')
bk = pd.cut(sA, [0, 4, 5, 6, 7, 8, 10.01], right=False)
for tr in (True, False):
    g = df[df.tr == tr]; print('TR' if tr else 'TE', g.groupby(bk[df.tr == tr], observed=True).agg(n=('h10', 'size'), h10=('h10', 'mean'), ex10=('ex10', 'mean'), y10=('y10', 'mean')).round(3).to_dict('index'))
print('-- 구간 안 새 점수 구간별')
for tr in (True, False):
    mm = (df.tr == tr) & (df.zone == 1); g = df[mm]; print('TR' if tr else 'TE', g.groupby(bk[mm], observed=True).agg(n=('h10', 'size'), h10=('h10', 'mean'), ex10=('ex10', 'mean')).round(3).to_dict('index'))
# 하루 평균 신호 개수
print('일평균 신호', df[m].groupby('d').size().describe().round(1).to_dict(), '총일수', df.d.nunique())
print('현재앱 일평균', df[(df.i_sup*3+2*df.i_val+2*df.i_per+2*df.i_cat+df.i_pos >= 6.5) & (df.zone == 1)].groupby('d').size().mean())
