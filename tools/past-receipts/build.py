"""Turn dated rows into the import file. Usage: python3 -I build.py <receipts-dated.json> <out.json>"""
import sys, json, re, statistics, bisect, datetime, collections
R = json.load(open(sys.argv[1]))
R = [r for r in R if r['sheet'] != 'GF18']           # GF 18's sheet is a copy of GF 19's
R = [r for r in R if str(r['no']).strip().upper() != 'LIFT']
def fy(d):
    y, m = int(d[:4]), int(d[5:7]); s = y if m >= 4 else y - 1
    return f"{s}-{str(s + 1)[2:]}"
def head(r):
    t = f"{r['period']} {r['remark']} {r['raw'] if r['rawType'] == 'text' and not re.match(r'^\d', r['raw']) else ''}".lower()
    if 'builder' in t: return 'Builder pending'
    if 'form' in t and 'share' in t: return 'Society formation & share'
    if 'drainage' in t: return 'Drainage work'
    if 'prop' in t and 'tax' in t: return 'Property tax'
    if 'transfer' in t: return 'Transfer fee'
    if 'amc' in t and not re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d', t.replace('amc11', '').replace('amc15', '')): return 'Lift AMC'
    if 'lift' in t and re.search(r'\(lift\)|lift amc', t) and not re.search(r'to (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)', t): return 'Lift AMC'
    return 'Maintenance'
# estimated dates for undated rows, from neighbouring receipts
dated = sorted((r['no'], r['date']) for r in R if isinstance(r['no'], int) and r['date'])
nos = [d[0] for d in dated]
def estimate(no):
    i = bisect.bisect_left(nos, no); near = [dated[j][1] for j in range(max(0, i - 3), min(len(dated), i + 3))]
    return sorted(near)[len(near) // 2] if near else None
out = []; seen = {}
for r in R:
    checks = []
    if r['dateCheck'] and r['dateNote']: checks.append(r['dateNote'])
    date = r['date']
    if not date and isinstance(r['no'], int):
        date = estimate(r['no']); checks = [f"No date in the sheet; {datetime.date.fromisoformat(date).strftime('%d %b %Y')} estimated from receipt order"]
    txt = f"{r['period']} {r['remark']}".lower()
    status = 'payment'; amount = r['cash'] + r['cheque'] + r['other']
    if r['dup']:
        if 'dup' in txt: status = 'duplicate'
        elif 'cancel' in txt: status = 'cancelled'
        else:
            amount += r['dup']; checks.append(f"Amount ₹{int(r['dup']):,} was entered in the “Duplicate” column; treated as a payment")
    if 'cancel' in txt and status == 'payment' and not amount: status = 'cancelled'
    if status == 'payment' and not amount: status = 'cancelled' if 'cancel' in txt else 'blank'
    if 'duplicate' in txt and status == 'payment' and not amount: status = 'duplicate'
    key = (r['unitId'], str(r['no']).lstrip('*'), amount, date)
    if status == 'payment' and key in seen:
        status = 'repeat'; checks.append(f"Same receipt, amount and date listed again in the sheet (row {seen[key]}); counted once")
    elif status == 'payment': seen[key] = r['row']
    same_no = [x for x in R if x is not r and x['unitId'] == r['unitId'] and str(x['no']).lstrip('*') == str(r['no']).lstrip('*')]
    if same_no and status == 'payment' and not any('counted once' in c for c in checks) and key in seen and seen[key] == r['row'] and any((x['cash'] + x['cheque'] + x['dup']) != amount for x in same_no):
        checks.append('Two lines on the same receipt number')
    m = re.search(r'(?:chq|cheque|ch)\.?\s*amount\s*([\d,]+)', r['remark'], re.I)
    if m and float(m.group(1).replace(',', '')) != amount: checks.append(f"Remark says cheque amount ₹{m.group(1)}; sheet shows ₹{int(amount):,}")
    if str(r['no']).startswith('*'): checks.append('Receipt number marked with * in the sheet')
    if re.search(r'need to check|to find|not paid|confirm', r['remark'], re.I): checks.append(f"Past committee’s note: “{r['remark'].strip()}”")
    mode = 'Cash' if r['cash'] and not r['cheque'] else 'Cheque' if r['cheque'] and not r['cash'] else 'Cash + cheque' if r['cash'] and r['cheque'] else ('Cheque' if re.search(r'\bch', txt) else 'Cash')
    no = str(r['no']).lstrip('*') if not isinstance(r['no'], int) else str(r['no'])
    rec = {'unitId': r['unitId'], 'receiptNo': no, 'date': date, 'fy': fy(date) if date else '', 'amount': round(amount, 2) if status == 'payment' else 0,
           'listedAmount': round(r['cash'] + r['cheque'] + r['other'] + r['dup'], 2), 'cash': r['cash'], 'cheque': r['cheque'], 'mode': mode,
           'head': head(r), 'period': re.sub(r'\s+', ' ', r['period'] or (r['raw'] if r['rawType'] == 'text' and not re.match(r'^\d', r['raw']) else '')).strip(), 'remark': r['remark'], 'status': status, 'checks': checks,
           'asTyped': {'date': r['raw'], 'dateCell': r['rawType'], 'dateFix': r.get('dateHow') or ''},
           'source': f"{r['book']} › sheet {r['sheet']} › row {r['row']}"}
    n = sum(1 for x in out if x['unitId'] == rec['unitId'] and x['receiptNo'] == no)
    rec['id'] = f"{r['unitId']}_{no.replace('/', '-')}" + (f"_{n + 1}" if n else '')
    out.append(rec)
out.sort(key=lambda x: (x['unitId'], x['date'] or '', x['receiptNo']))
meta = {'format': 'sunshreesuntec-past-receipts/1', 'source': 'MS EXCEL SHEET FROM PAST COMMITTEE.zip (per-unit receipt sheets)',
        'built': datetime.date.today().isoformat(), 'count': len(out),
        'notes': ['Dates: Excel had read typed dd/mm/yy as mm/dd/yy; day and month were swapped back, and year slips corrected using receipt-number order. Corrected dates are flagged.',
                  'GF 18’s sheet was a copy of GF 19’s receipts and was not imported.',
                  'No receipts in the files for A 100, B 21, D 101 B, D 202, GF 01, GF 02, GF 03, GF 18.'],
        'receipts': out}
json.dump(meta, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
c = collections.Counter(x['status'] for x in out); print('records', len(out), c)
print('heads', collections.Counter(x['head'] for x in out if x['status'] == 'payment'))
print('to check', sum(1 for x in out if x['checks']))
byfy = collections.defaultdict(float)
for x in out: byfy[x['fy']] += x['amount']
print('by FY', {k: round(v) for k, v in sorted(byfy.items())}, 'total', round(sum(byfy.values())))
for x in out:
    if x['head'] != 'Maintenance' or x['status'] != 'payment' or any('Two lines' in c or 'Remark' in c or 'Duplicate' in c for c in x['checks']): print('  ', x['id'], x['date'], x['amount'], x['head'], x['status'], '|', x['period'], '|', x['remark'], '|', '; '.join(x['checks']))
