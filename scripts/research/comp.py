import pandas as pd, numpy as np
def comps(df):
    c = pd.DataFrame(index=df.index)
    c['flow20'] = np.clip(df.f20r / 0.06, 0, 1)
    c['flowneg'] = np.clip(-df.f20r / 0.06, 0, 1)
    c['per'] = df.i_per; c['sup'] = df.i_sup
    t = df.tvr
    c['tv'] = np.select([t < .5, t < .7, t <= 2.2, t <= 3.5], [0, .5, 1, .5], 0)
    c['vol'] = np.clip((5 - df.vol20) / 3, 0, 1)
    c['trend'] = np.clip((df.d20h + .2) / .15, 0, 1)
    c['hot'] = ((df.chg > 8) | (df.gap > .03) | (df.tvr > 3.5)).astype(float)
    c['cat'] = df.i_cat; c['pos'] = df.i_pos
    c['rsi30'] = (df.rsi <= 30).astype(float)
    return c
