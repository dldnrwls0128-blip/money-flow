import numpy as np, pandas as pd
def nz(x): return np.nan_to_num(np.asarray(x, float), nan=0.5)
W = dict(days=2, smart=2, tv=2, vol=2, tr=1, hot=1)
def parts19(S):
    return {'days': nz(S.m_days / 5), 'smart': nz(S.p_sup / 3), 'tv': nz(S.p_tv / 2), 'vol': nz(S.p_vol / 2), 'tr': nz(S.p_tr / 2), 'hot': nz(S.p_hot)}
def score19(S):
    p = parts19(S); return sum(W[k] * p[k] for k in W)
