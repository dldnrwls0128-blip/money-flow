import pandas as pd, numpy as np
df = pd.read_pickle('df.pkl')
B = {'vol20': [0, 1.5, 2, 2.5, 3, 4, 5, 99], 'd20h': [-1, -.2, -.12, -.08, -.05, -.03, -.01, 0.001],
     'tvr': [0, .5, .7, .9, 1.2, 1.6, 2.2, 3.5, 999], 'f20r': [-9, -.1, -.05, -.02, 0, .02, .05, .1, 9],
     'rsi': [0, 30, 40, 50, 60, 70, 80, 100], 'chg': [-40, -5, -2, -.5, .5, 2, 5, 10, 40], 'ma20r': [-1, -.1, -.05, -.02, 0, .02, .05, .1, .2, 9],
     'ma60r': [-1, -.1, 0, .1, .2, .3, 9], 'r20': [-1, -.15, -.05, 0, .05, .15, .3, 9], 'streak': [-99, -5, -3, -1, 0, 1, 3, 5, 99], 'gap': [-1, -.03, -.01, .01, .03, .07, 1]}
for f, b in B.items():
    c = pd.cut(df[f], b)
    t = df.groupby([c, 'tr'], observed=True).agg(n=('ex10', 'size'), ex10=('ex10', 'mean'), ex5=('ex5', 'mean'), y10=('y10', 'mean')).unstack()
    print('==', f)
    for idx, r in t.iterrows():
        print('  %-16s TR n=%6d ex10 %+5.1f ex5 %+5.1f y10 %+5.2f%% | TE n=%6d ex10 %+5.1f ex5 %+5.1f y10 %+5.2f%%' % (idx, r[('n', True)], r[('ex10', True)] * 100, r[('ex5', True)] * 100, r[('y10', True)] * 100, r[('n', False)], r[('ex10', False)] * 100, r[('ex5', False)] * 100, r[('y10', False)] * 100))
