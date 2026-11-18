import numpy as np
ENTRY = ['appL', 'close', 'atrL', 'closeA']
STOP = ['app', 'appc', 'a1', 'a2', 'p5', 'p8']
TGT = ['app', 'A1.5/3', 'A2/4', 'A1/2.5', 'R1/2', 'R1.5/3', 'R0.75/2']
def plan(P, entry, stop, tgt):
    c, a = P['c'], P['atr']; b1, b2 = P['b1'], P['b2'].copy(); b2 = np.where(np.isnan(b2), b1 * 0.97, b2)
    if entry == 'appL': B1, B2 = b1, b2
    elif entry == 'close': B1, B2 = c.copy(), np.minimum(b2, c * 0.97)
    elif entry == 'atrL': B1, B2 = c - 0.5 * a, c - 1.5 * a
    else: B1, B2 = c.copy(), c - 1.0 * a
    m3 = B2 * 0.97   # 아래 매수가보다 최소 3% 아래
    if stop == 'app': S = np.minimum(P['st'], m3)
    elif stop == 'appc': S = np.maximum(np.minimum(P['st'], m3), B2 * 0.90)   # 지지선 손절, 단 아래 매수가 −10%보다 멀면 −10%
    elif stop == 'a1': S = np.minimum(B2 - a, m3)
    elif stop == 'a2': S = np.minimum(B2 - 2 * a, m3)
    elif stop == 'p5': S = B2 * 0.95
    else: S = B2 * 0.92
    avg = (B1 + B2) / 2
    if tgt == 'app':
        T1 = P['s1'].copy(); T2 = np.where(np.isnan(P['s2']), T1 * 1.05, P['s2'])
    elif tgt[0] == 'A':
        m1, m2 = map(float, tgt[1:].split('/')); T1, T2 = avg + m1 * a, avg + m2 * a
    else:
        m1, m2 = map(float, tgt[1:].split('/')); R = avg - S; T1, T2 = avg + m1 * R, avg + m2 * R
    T1 = np.maximum(T1, B1 * 1.01); T2 = np.maximum(T2, T1 * 1.01)
    bad = ~(B2 < B1) | ~(S < B2) | np.isnan(T1)
    for X in (B1, B2, S, T1, T2): X[bad] = np.nan
    return B1, B2, S, T1, T2
def stats(r, h):
    r = r[~np.isnan(r)]; hh = h[:len(r)] if False else None
    if len(r) == 0: return {}
    w, l = r[r > 0], r[r <= 0]
    return dict(n=len(r), win=round(len(w) / len(r) * 100, 1), aw=round(w.mean() * 100, 2) if len(w) else 0, al=round(l.mean() * 100, 2) if len(l) else 0,
                pay=round(w.mean() / -l.mean(), 2) if len(w) and len(l) and l.mean() < 0 else None, pf=round(w.sum() / -l.sum(), 2) if l.sum() < 0 else None,
                ev=round(r.mean() * 100, 2), med=round(np.median(r) * 100, 2))
