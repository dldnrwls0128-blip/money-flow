import numpy as np, pandas as pd, numba as nb
FEE = 0.0023
@nb.njit(cache=True)
def sim(O, H, L, C, END, rows, B1, B2, S, T1, T2, close_entry, HOLD, E, BE, TOL=0.002):
    n = len(rows); ret = np.full(n, np.nan); inv = np.zeros(n); held = np.zeros(n); code = np.zeros(n, np.int8)
    for i in range(n):
        t = rows[i]; e = END[t]
        if t + HOLD >= e or not (B1[i] > 0) or not (S[i] > 0) or not (T1[i] > 0): continue
        q = 0.0; ub = 0.0; cost = 0.0; proceeds = 0.0; f1 = False; f2 = False; k0 = -1
        if close_entry:
            q = 0.5; ub = 0.5; cost = 0.5 * C[t]; f1 = True; k0 = t
        stop = S[i]; sold1 = False; last = t + HOLD; done = False
        for k in range(t + 1, last + 1):
            newfill = False
            if not f1:
                if k - t > E: break
                if L[k] <= B1[i] * (1 - TOL):
                    px = min(O[k], B1[i]); q += 0.5; ub += 0.5; cost += 0.5 * px; f1 = True; k0 = k; newfill = True
            if f1 and not f2 and not sold1 and B2[i] > 0 and L[k] <= B2[i] * (1 - TOL):
                px = min(O[k], B2[i]); q += 0.5; ub += 0.5; cost += 0.5 * px; f2 = True
            if not f1: continue
            if L[k] <= stop:
                proceeds += q * min(O[k], stop)
                q = 0.0; code[i] = 2 if not sold1 else 3; done = True; held[i] = k - k0 if k0 >= 0 else 0; break
            if newfill: continue
            if not sold1 and H[k] >= T1[i] * (1 + TOL):
                s = q * 0.5; proceeds += s * max(O[k], T1[i]); q -= s; sold1 = True
                if BE: stop = max(stop, cost / ub * 1.0023)
            if sold1 and q > 0 and H[k] >= T2[i] * (1 + TOL):
                proceeds += q * max(O[k], T2[i]); q = 0.0; code[i] = 1; done = True; held[i] = k - k0; break
        if not f1: continue
        if not done:
            proceeds += q * C[last]; q = 0.0; code[i] = 4 if not sold1 else 5; held[i] = last - k0
        cap = 0.5 * (C[t] if close_entry else B1[i]) + 0.5 * B2[i]   # 계획한 전체 금액 기준 (안 채운 절반은 현금)
        ret[i] = (proceeds - cost) / cap - FEE * cost / cap; inv[i] = cost / cap
    return ret, inv, held, code
