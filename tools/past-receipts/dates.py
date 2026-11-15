"""Rebuild receipt dates. Usage: python3 -I dates.py <receipts-raw.json> <out.json>
Excel (US settings) read typed dd/mm/yy as mm/dd/yy whenever the day was 12 or less, so those cells hold
day and month swapped; text cells kept what was typed. Receipt numbers rise with time across the Society,
so each date is checked against neighbouring receipts and year slips are corrected and flagged."""
import sys, json, re, datetime, statistics, bisect
R = json.load(open(sys.argv[1]))
D = datetime.date
def text_date(s):
    m = re.match(r'^\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})', s)
    if not m: return None
    d, mo, y = map(int, m.groups()); y = y + 2000 if y < 100 else y
    try: return D(y, mo, d)
    except ValueError:
        try: return D(y, d, mo)   # typed month/day
        except ValueError: return None
def cands(r):
    if r['rawType'] == 'text':
        t = text_date(r['raw']); return [(t, 'typed')] if t else []
    if r['rawType'] == 'excel-date':
        y, m, d = map(int, r['raw'].split('-')); out = []
        if d <= 12:
            try: out.append((D(y, d, m), 'excel-swap'))
            except ValueError: pass
        out.append((D(y, m, d), 'excel-asis'))
        return out
    return []
for r in R: r['_c'] = cands(r)
nums = [r for r in R if isinstance(r['no'], int)]
# anchors: unambiguous text dates, and Excel dates whose day > 12 (cannot be swapped)
anchors = sorted((r['no'], c[0][0].toordinal()) for r in nums if len(r['_c']) == 1 for c in [r['_c']])
an_no = [a[0] for a in anchors]
def expected(no):
    i = bisect.bisect_left(an_no, no)
    near = [anchors[j][1] for j in range(max(0, i - 6), min(len(anchors), i + 6)) if anchors[j][0] != no]
    return statistics.median(near) if near else None
for r in R:
    r['date'] = None; r['dateNote'] = ''; r['dateCheck'] = False
    if not r['_c']:
        r['dateNote'] = 'No date in the sheet'; r['dateCheck'] = True; continue
    exp = expected(r['no']) if isinstance(r['no'], int) else None
    if exp is None:
        d, how = r['_c'][0]
    else:
        d, how = min(r['_c'], key=lambda c: abs(c[0].toordinal() - exp))
        gap = abs(d.toordinal() - exp)
        if gap > 75:   # try a year slip (e.g. 2017 typed for 2015, 2023 for 2013)
            best = None
            for c, h in r['_c']:
                for y in range(2011, 2019):
                    try: c2 = c.replace(year=y)
                    except ValueError: continue
                    g = abs(c2.toordinal() - exp)
                    if best is None or g < best[0]: best = (g, c2, h)
            if best and best[0] <= 75:
                r['dateNote'] = f"Year corrected from {d.year if how != 'excel-swap' else best[1].replace(year=d.year).year} to {best[1].year} to fit receipt order"
                d, how = best[1], best[2]; r['dateCheck'] = True
            elif how == 'typed' and gap <= 150:
                pass   # typed as text and only a few months from sparse neighbours: keep
            else:
                r['dateNote'] = f"Out of order with nearby receipts (about {round(gap / 30)} months away)"; r['dateCheck'] = True
    r['date'] = d.isoformat()
    r['dateHow'] = how
    if how == 'excel-swap' and not r['dateNote']: r['dateNote'] = 'Day and month were swapped by Excel; corrected'
    del r['_c']
json.dump(R, open(sys.argv[2], 'w'), indent=0)
import collections
print(collections.Counter(r.get('dateHow') for r in R))
chk = [r for r in R if r['dateCheck']]
print('needs checking:', len(chk))
for r in chk: print('  ', r['sheet'], r['no'], r['raw'], '->', r['date'], '|', r['dateNote'], '|', r['period'])
# monotonic check after fixing
s = sorted([r for r in R if isinstance(r['no'], int) and r['date']], key=lambda r: r['no'])
bad = sum(1 for a, b in zip(s, s[1:]) if b['date'] < a['date'] and (D.fromisoformat(a['date']) - D.fromisoformat(b['date'])).days > 45)
print('remaining big backward steps:', bad, '| first', s[0]['date'], 'last', s[-1]['no'], s[-1]['date'])
