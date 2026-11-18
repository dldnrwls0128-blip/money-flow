import numpy as np
def plan2(P, ent, stop, tgt):
    c, a = P['c'], P['atr']; b1, b2 = P['b1'], P['b2']; b2 = np.where(np.isnan(b2), b1 * 0.97, b2)
    B1 = c.copy()
    if ent == 'appB2': B2 = np.minimum(b2, c * 0.97)
    else: B2 = c - float(ent[1:]) * a          # 'A1' → 1 ATR 아래
    m3 = B2 * 0.97
    if stop.startswith('sup'):                 # 지지선 바로 밑, 단 아래 매수가 대비 최소 3%·최대 cap%
        cap = float(stop[3:]) / 100; S = np.maximum(np.minimum(P['st'], m3), B2 * (1 - cap))
    else: S = B2 * (1 - float(stop[1:]) / 100)  # 'p8' → 아래 매수가 −8%
    avg = (B1 + B2) / 2; m1, m2 = map(float, tgt[1:].split('/')); R = avg - S
    T1, T2 = avg + m1 * R, avg + m2 * R
    T1 = np.maximum(T1, B1 * 1.01); T2 = np.maximum(T2, T1 * 1.01)
    bad = ~(B2 < B1) | ~(S < B2)
    for X in (B1, B2, S, T1, T2): X[bad] = np.nan
    return B1, B2, S, T1, T2
