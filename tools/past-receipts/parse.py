"""Read every per-unit receipt sheet from the past committee's Excel files.
Usage: python3 -I parse.py <folder> <out.json>"""
import sys, os, re, json, datetime, statistics
import openpyxl
D, OUT = sys.argv[1], sys.argv[2]
BOOKS = ['A-D-WING.xlsx', 'C-WING -SUNTEC.xlsx', 'BASEMENT-SHOPS.xlsx', 'GROUND-FLOOR-SHOPS.xlsx']
def unit_id(sheet):
    s = sheet.upper().replace(' ', '')
    if s == 'C001': return 'C-100'
    m = re.match(r'^(GF|A|B|C|D)0*(\d+)([AB]?)$', s)
    pre, n, suf = m.groups()
    return f'{pre}-{int(n):02d}' if pre in ('B', 'GF') else f'{pre}-{int(n)}{suf}'
def num(v):
    if v is None or v == '': return 0.0
    if isinstance(v, (int, float)): return float(v)
    m = re.search(r'[\d,]+(\.\d+)?', str(v)); return float(m.group(0).replace(',', '')) if m else 0.0
def find_cols(hdr):
    c = {}
    for i, h in enumerate(hdr):
        h = str(h or '').strip().lower()
        if not h: continue
        if h.startswith('rec'): c['no'] = i
        elif h == 'unit': c['unit'] = i
        elif 'cash' in h: c['cash'] = i
        elif 'ch' in h and 'q' in h or h == 'cheque': c['chq'] = i
        elif h == 'other': c['other'] = i
        elif h.startswith('dup'): c['dup'] = i
        elif h == 'date': c['date'] = i
        elif 'detail' in h and 'bank' not in h or 'account' in h: c['period'] = i
        elif 'bank' in h or 'remark' in h: c['remark'] = i
    return c
rows = []
for b in BOOKS:
    wb = openpyxl.load_workbook(os.path.join(D, b), data_only=True)
    for ws in wb.worksheets:
        uid = unit_id(ws.title); cols = None
        for r_i, r in enumerate(ws.iter_rows(values_only=True), start=1):
            if cols is None:
                if any(str(v or '').strip().lower().startswith(('receipt', 'recpt')) for v in r): cols = find_cols(r)
                continue
            g = lambda k: r[cols[k]] if k in cols and cols[k] < len(r) else None
            no = g('no')
            if no in (None, ''): continue
            raw = g('date')
            rows.append({'book': b, 'sheet': ws.title, 'row': r_i, 'unitId': uid, 'sheetUnit': str(g('unit') or ''),
                'no': int(num(no)) if num(no) else str(no), 'cash': num(g('cash')), 'cheque': num(g('chq')), 'other': num(g('other')),
                'dup': num(g('dup')), 'raw': raw.strftime('%Y-%m-%d') if isinstance(raw, datetime.datetime) else (str(raw).strip() if raw is not None else ''),
                'rawType': 'excel-date' if isinstance(raw, datetime.datetime) else ('text' if raw not in (None, '') else 'blank'),
                'period': str(g('period') or '').strip(), 'remark': str(g('remark') or '').strip()})
json.dump(rows, open(OUT, 'w'), indent=0)
import collections
print('receipts', len(rows), 'units', len({r['unitId'] for r in rows}))
print('raw types', collections.Counter(r['rawType'] for r in rows))
print('non-int numbers', [r['no'] for r in rows if not isinstance(r['no'], int)][:20])
nos = [r['no'] for r in rows if isinstance(r['no'], int)]
print('receipt no range', min(nos), max(nos), 'distinct', len(set(nos)))
dup = [n for n, k in collections.Counter(nos).items() if k > 1]; print('receipt numbers used twice:', len(dup), sorted(dup)[:40])
print('sheet unit mismatch', [(r['sheet'], r['sheetUnit'], r['no']) for r in rows if r['sheetUnit'].upper().replace(' ', '') not in (r['sheet'].upper(), '')][:20])
print('totals cash', sum(r['cash'] for r in rows), 'chq', sum(r['cheque'] for r in rows), 'other', sum(r['other'] for r in rows), 'dup', sum(r['dup'] for r in rows))
print('zero-amount rows', [(r['sheet'], r['no'], r['period'], r['remark']) for r in rows if not (r['cash'] or r['cheque'] or r['other'])][:30])
