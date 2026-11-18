from evalr2 import *
from newscore import score19
import json
zone = (S_.zone == 1).values; hot = S_.hot.values; tv2 = (S_.p_tv == 2).values; s18 = S_.s18.values; s19 = score19(S_)
def dedupe(mask):
    keep = np.zeros(len(mask), bool); last = {}
    for i in np.where(mask)[0]:
        c, t = CODE[i], rows[i]
        if c in last and t < last[c]: continue
        keep[i] = True; last[c] = t + 20
    return keep
K = ['n', '일평균', '승률', '평균이익', '평균손실', '손익비', 'PF', '기대수익', '보유일', '하위5', '목표2', '손절', '시간', 'MDD']
def M(r, inv, held, code, F):
    o = {}
    for p, pm in (('tr', TR), ('te', ~TR)):
        m = metrics(r, held, code, F & pm); o[p] = {k: float(m[k]) for k in K}
        m = metrics(r, held, code, dedupe(F) & pm); o[p + '1'] = {k: float(m[k]) for k in K}
    return o
rA = run('v18'); rB = run('p2', 'A1', 'sup10', 'R2/4', be=1)
A = {'v': 3, 'made': '2026-11-18', 'period': [S_.d.min(), S_.d.max()], 'train': [S_[TR].d.min(), S_[TR].d.max()], 'test': [S_[~TR].d.min(), S_[~TR].d.max()],
     'stocks': int(S_.code.nunique()), 'obs': int(len(S_)), 'days_tr': int(S_[TR].d.nunique()), 'days_te': int(S_[~TR].d.nunique()), 'fee': 0.23}
A['cur'] = M(*rA[:4], (s18 >= 7) & zone & ~hot & tv2)
A['new'] = {str(th): M(*rB[:4], (s19 >= th) & zone & ~hot & tv2) for th in (6.5, 7, 7.5)}
A['old_newlv'] = M(*rB[:4], (s18 >= 7) & zone & ~hot & tv2)
A['base'] = M(*rB[:4], np.ones(len(S_), bool))
A['halves'] = {k: float(v) for k, v in halves(rB[0], (s19 >= 7) & zone & ~hot & tv2).items() if k != '2023H2'}
A['halves_cur'] = {k: float(v) for k, v in halves(rA[0], (s18 >= 7) & zone & ~hot & tv2).items() if k != '2023H2'}
# 돈흐름 정의 비교: 같은 날 대비 기대수익(%) 상위20% − 하위20%
r = rB[0]; S_['r'] = r; S_['ex'] = r - S_.groupby('d').r.transform('mean')
DEF = [('m_days', '거래대금이 며칠째 평소보다 많음 (최근 5일 중 일수)'), ('m_rank', '거래대금 순위 상승 (5일 vs 60일)'), ('m_tvr5', '최근 5일 거래대금 ÷ 평소'), ('m_share', '시장 거래대금 비중 증가'),
       ('m_smart20', '외국인+기관 20일 순매수'), ('m_smart5', '외국인+기관 5일 순매수'), ('m_upvol', '오른 날 거래량 비율(매집)'), ('m_obv', 'OBV 20일 변화'), ('m_sector', '업종 거래대금 비중 증가')]
md = []
for f, nm in DEF:
    q = np.minimum(np.ceil(S_.groupby('d')[f].rank(pct=True) * 5) - 1, 4)
    o = [nm]
    for pm in (S_.tr, ~S_.tr):
        t = S_[pm].assign(q=q).groupby('q').ex.mean() * 100; o.append(round(float(t.iloc[-1] - t.iloc[0]), 2))
    md.append(o)
A['money_defs'] = md
for x in md: print(x)
json.dump(A, open('/workspace/money-flow/analysis.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(A['new']['7']['te'], A['cur']['te'], A['halves'])
