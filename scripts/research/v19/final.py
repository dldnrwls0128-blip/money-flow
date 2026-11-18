from evalr2 import *
from plans2 import plan2
from newscore import score19
import json
s19 = score19(S_); zone = (S_.zone == 1).values; hot = S_.hot.values; tv2 = (S_.p_tv == 2).values; s18 = S_.s18.values
V18 = (s18 >= 7) & zone & ~hot & tv2; NEW = (s19 >= 7) & zone & ~hot & tv2; ALL = np.ones(len(S_), bool)
def dedupe(mask):
    keep = np.zeros(len(mask), bool); last = {}
    idx = np.where(mask)[0]
    for i in idx:
        c, t = CODE[i], rows[i]
        if c in last and t < last[c]: continue
        keep[i] = True; last[c] = t + 20
    return keep
RULE = ('A1', 'sup10', 'R2/4')
res = {}
rA = run('v18'); rB = run('p2', *RULE, be=1)
K = ['n', '일평균', '체결률', '승률', '평균이익', '평균손실', '손익비', 'PF', '기대수익', '일당', '보유일', '하위5', '목표2', '손절', '손절T1후', '시간', 'MDD']
rowsout = []
for name, (r, inv, held, code, B), F in (('현재 v1.8 (옛 점수+지금 가격선)', rA, V18), ('새 점수+지금 가격선', rA, NEW), ('옛 점수+새 가격선', rB, V18), ('v1.9 새 점수+새 가격선', rB, NEW),
                                         ('전체 종목+지금 가격선', rA, ALL), ('전체 종목+새 가격선', rB, ALL)):
    for p, pm in (('TR', TR), ('TE', ~TR)):
        m = metrics(r, held, code, F & pm); rowsout.append(dict(설정=name, 기간=p, **{k: m[k] for k in K}))
        res[f'{name}|{p}'] = {k: float(m[k]) for k in K}
    md = dedupe(F)
    for p, pm in (('TR', TR), ('TE', ~TR)):
        m = metrics(r, held, code, md & pm); rowsout.append(dict(설정=name + ' [종목당 1건]', 기간=p, **{k: m[k] for k in K}))
        res[f'{name}[1]|{p}'] = {k: float(m[k]) for k in K}
    res[f'{name}|halves'] = {k: float(v) for k, v in halves(r, F).items()}
pd.set_option('display.width', 280); print(pd.DataFrame(rowsout).to_string(index=False))
for k, v in res.items():
    if k.endswith('halves'): print(k, v)
y = S_.y20.values - 0.0023
for nm, F in (('새 점수', NEW), ('옛 점수', V18), ('전체', ALL)):
    for p, pm in (('TR', TR), ('TE', ~TR)):
        x = y[F & pm]; x = x[~np.isnan(x)]; res[f'보유20|{nm}|{p}'] = dict(n=int(len(x)), 승률=round(float((x > 0).mean() * 100), 1), 기대수익=round(float(x.mean() * 100), 2), 하위5=round(float(np.percentile(x, 5) * 100), 1))
        print('20일 보유', nm, p, res[f'보유20|{nm}|{p}'])
json.dump(res, open('final.json', 'w'), ensure_ascii=False)
