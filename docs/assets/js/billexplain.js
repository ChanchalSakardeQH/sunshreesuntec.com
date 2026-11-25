/**
 * 3.27: "How this bill is worked out" — a second page printed with a bill, for members who ask how the bill and its
 * arrears are calculated: the unit's details used, each of this month's charges with its calculation, the penal
 * interest, and the arrears built up year by year from the unit's full account (audited years, Tally, these
 * accounts), with the latest entries in detail. Everything comes from the same records as the member's statement.
 */
import { mergeLedger } from './accounts.js';
import { preLedger, loadPastReceipts } from './pastreceipts.js';
import { financialYear, money, ddmmyyyy, monthLabel, LIFT_GROUPS, LABEL, liftGroupFor } from './billing-core.js';
import { esc } from './data.js';
import { DUES_DAYS } from './memberagreement.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rs = (n) => `₹ ${money(Math.abs(r2(n)), { slash: false })}${n < 0 ? ' Cr' : ''}`;
const secs = (t) => (t?.seconds ?? (t?.toDate ? t.toDate().getTime() / 1000 : null));

/** Reads what the explanation needs; anything unreadable is left out (the page says so). */
export async function loadExplainData(fb, bill) {
  const { F, db } = fb, id = bill.unitId;
  const safe = (p) => p.catch(() => null);
  const [unitSnap, ledgerSnap, tallySnap, auditSnap, billsSnap, adjSnap] = await Promise.all([
    safe(F.getDoc(F.doc(db, 'units', id))),
    safe(F.getDocs(F.collection(db, 'units', id, 'ledger'))),
    safe(F.getDoc(F.doc(db, 'units', id, 'history', 'tally'))),
    safe(F.getDoc(F.doc(db, 'units', id, 'history', 'audited'))),
    safe(F.getDocs(F.query(F.collection(db, 'bills'), F.where('unitId', '==', id)))),
    // 3.32: the interest on past arrears put on this bill, with its month-by-month working
    safe(F.getDocs(F.query(F.collection(db, 'billAdjustments'), F.where('unitId', '==', id))))
  ]);
  const audits = auditSnap?.exists() ? (auditSnap.data().years || []).map((y) => ({ fy: y.fy, to: y.to, duesComplete: Boolean(y.complete),
    dues: y.listed ? [{ unitId: id, name: y.name || '', amount: y.amount }] : [] })) : [];
  const receipts = audits.length ? await loadPastReceipts(fb, id).catch(() => []) : [];
  const live = (ledgerSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.date.localeCompare(b.date) || ((secs(a.createdAt) || 0) - (secs(b.createdAt) || 0)));
  return {
    unit: unitSnap?.exists() ? unitSnap.data() : null,
    ledgerRead: Boolean(ledgerSnap),
    entries: mergeLedger(live, tallySnap?.exists() ? tallySnap.data() : null, preLedger(id, audits, receipts)),
    bills: (billsSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() })),
    pastInterest: (adjSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.code === 'interest' && a.month === bill.month && ['billed', 'pending'].includes(a.status) && Array.isArray(a.months))
  };
}

/* ---------- 3.32: annexures — interest on past arrears month by month; charges by head, and the lift ---------- */

const HEAD_OF_CODE = { maintenance: 'maint', sinking: 'maint', repairs: 'maint', nonOccupancy: 'maint', education: 'maint', federation: 'maint', election: 'maint',
  welfare: 'maint', majorRepairs: 'maint', propertyTax: 'maint', insurance: 'maint', leaseRent: 'maint', loan: 'maint',
  lift: 'lift', liftRepairs: 'lift', water: 'water', interest: 'interest' };
export const HEADS = [['maint', 'Maintenance and funds'], ['lift', 'Lift'], ['water', 'Water'], ['interest', 'Penal interest'], ['other', 'Other charges'], ['audit', 'Audited years (all heads)']];
/** Which head a charge in the old books (Tally) is, from its wording. */
export function headOfText(t) {
  const x = String(t || '');
  return /lift|elevator/i.test(x) ? 'lift' : /water|tanker/i.test(x) ? 'water' : /interest|penal/i.test(x) ? 'interest' : /maint|service|society charges|sinking|repair/i.test(x) ? 'maint' : 'other';
}
/** The charges in the unit's account split by head: [{ fy, maint, lift, water, interest, other, audit, total }], and each lift entry. */
export function chargesByHead(entries, bills, upto, billId) {
  const byBill = new Map((bills || []).map((b) => [b.id, b]));
  const rows = new Map(), lift = [];
  const add = (fy, head, amt) => { const r = rows.get(fy) || rows.set(fy, { fy, maint: 0, lift: 0, water: 0, interest: 0, other: 0, audit: 0, total: 0 }).get(fy); r[head] += amt; r.total += amt; };
  for (const e of entries) {
    if (e.kind === 'memo' || e.date > upto || (billId && e.ref === billId)) continue;
    const fy = financialYear(e.date), net = (e.debit || 0) - (e.credit || 0);
    if (e.kind === 'bill' && e.ref && byBill.has(e.ref)) {
      for (const l of byBill.get(e.ref).lines || []) {
        const h = HEAD_OF_CODE[l.code] || 'other';
        add(fy, h, l.amount || 0);
        if (h === 'lift') lift.push({ date: e.date, text: `${l.label}${l.detail ? ` – ${l.detail}` : ''} (bill ${byBill.get(e.ref).billNo})`, amount: l.amount || 0 });
      }
      for (const n of byBill.get(e.ref).liftNotes || []) if (!(byBill.get(e.ref).lines || []).some((l) => l.code === 'liftRepairs')) lift.push({ date: e.date, text: `${n.kind}: ${n.description || ''}`, amount: n.share });
    } else if (e.kind === 'charge' && e.ref && byBill.has(e.ref)) {
      continue;   // a correction to a bill (3.31): the bill's lines already show the corrected amount
    } else if (e.kind === 'bill' || e.kind === 'charge') {
      const h = e.kind === 'charge' ? (HEAD_OF_CODE[e.code] || 'other') : headOfText(e.particulars);
      add(fy, h, net);
      if (h === 'lift') lift.push({ date: e.date, text: e.particulars, amount: net });
    } else if (e.source === 'audit' && net > 0) add(fy, 'audit', net);
  }
  return { rows: [...rows.values()].sort((a, b) => a.fy.localeCompare(b.fy)), lift };
}

/** 3.33: how to dispute an entry (as in the portal agreement): within 10 days, with proof; errors corrected promptly. */
function disputeBox(site) {
  return `<div class="x-dispute"><b>If you think an amount is wrong</b> — including arrears of earlier years or of a previous owner, or an amount covered by a no-dues certificate or NOC given to you earlier — write to the Society within <b>${DUES_DAYS} days</b> of receiving this bill: on the portal, by email to ${esc(site.society?.email || 'the Society’s email address')}, or by letter at the office. Attach your proof (receipts, bank statements, the NOC or letter). The Society checks it against its books and the bank, corrects proven errors promptly with a revised bill or statement, and does not charge interest on any amount found not due; otherwise it replies with its reasons. Please pay the part you do not dispute. Your rights before the Registrar and the Co-operative Court are not affected.</div>`;
}

function interestAnnex(b, data, site) {
  const adjs = data.pastInterest || [];
  if (!adjs.length) return '';
  const months = adjs.flatMap((a) => a.months || []).sort((a, b2) => a.month.localeCompare(b2.month));
  const total = adjs.reduce((t, a) => t + (a.amount || 0), 0);
  const byFy = new Map();
  for (const m of months) {
    const fy = financialYear(`${m.month}-01`), r = byFy.get(fy) || byFy.set(fy, { fy, n: 0, high: 0, low: Infinity, sum: 0, rates: new Set() }).get(fy);
    r.n++; r.high = Math.max(r.high, m.base); r.low = Math.min(r.low, m.base); r.sum += m.amount; r.rates.add(m.text);
  }
  const fyRows = [...byFy.values()].map((r) => `<tr><td>${esc(r.fy)}</td><td class="num">${r.n}</td><td class="num">${rs(r.low)} – ${rs(r.high)}</td><td>${esc([...r.rates].join('; '))}</td><td class="num">${rs(r.sum)}</td></tr>`).join('');
  const third = Math.ceil(months.length / 3);
  // 3.35: one table, three months to a row (column by column), so it breaks cleanly across pages.
  const cell = (m) => (m ? `<td>${esc(monthLabel(m.month).replace(/^(\w{3})\w*/, '$1'))}</td><td class="num">${money(m.base, { slash: false })}</td><td class="num x-gap">${(Math.round(m.amount * 100) / 100).toFixed(2)}</td>` : '<td></td><td></td><td class="x-gap"></td>');
  const head3 = '<th>Month</th><th class="num">Arrears at start</th><th class="num x-gap">Interest</th>';
  const monthTable = `<table class="x-table x-mini x-months"><thead><tr>${head3}${head3}${head3}</tr></thead><tbody>${Array.from({ length: third }, (_, i) =>
    `<tr>${cell(months[i])}${cell(months[i + third])}${cell(months[i + 2 * third])}</tr>`).join('')}</tbody></table>`;
  const periods = (site.interestPeriods || []).filter((p) => Number(p.rate) > 0);
  return `<section class="sheet explain annex"><div class="x-wrap">
    <h2>Annexure A – Penal interest on past arrears, month by month</h2>
    <p class="x-sub">Bill ${esc(b.billNo)} · ${esc(b.unit)}${b.name ? `, ${esc(b.name)}` : ''} · ${adjs.map((a) => esc(a.runNo || '')).filter(Boolean).join(', ')}</p>
    <p>This bill includes <b>${rs(total)}</b> of interest on overdue dues of past months (${esc(monthLabel(adjs[0].fromMonth))} to ${esc(monthLabel(adjs[0].toMonth))}), as decided by the Managing Committee. It is worked out the same way a monthly bill charges interest:</p>
    <ol class="x-list x-steps">
      <li><b>Arrears at the start of each month</b> = the balance of the unit’s account on the 1st of the month (everything charged before that day, less everything paid before that day — the same statement as on the previous page), <b>less any penal interest already billed</b>, so interest is never charged on interest.</li>
      <li><b>Interest for the month</b> = arrears at the start × yearly rate ÷ 12 (a month in which the rate changed is charged by days at each rate).</li>
      <li>Months with no arrears (fully paid, or in credit) have no interest. Months whose own bill already charged interest are left out.</li>
    </ol>
    ${periods.length ? `<p class="x-note">Rates fixed by the General Body: ${esc(periods.map((p) => `${p.rate}% p.a. from ${ddmmyyyy(p.from)}${p.to ? ` to ${ddmmyyyy(p.to)}` : ''}`).join('; '))}.</p>` : ''}
    <p class="x-note">Example: arrears of ₹ 10,000 at the start of a month at 18% p.a. → 10,000 × 18% ÷ 12 = ₹ 150 for that month.</p>
    <h3>Year by year</h3>
    <table class="x-table"><thead><tr><th>Year (Apr–Mar)</th><th class="num">Months with arrears</th><th class="num">Arrears at the start of the month (lowest – highest)</th><th>Rate</th><th class="num">Interest</th></tr></thead>
      <tbody>${fyRows}</tbody><tfoot><tr><td colspan="4">Interest on past arrears on this bill</td><td class="num"><b>${rs(total)}</b></td></tr></tfoot></table>
    <h3>Every month</h3>
    ${monthTable}
    <p class="x-note">Amounts in rupees; the interest of each month is shown to the paisa and the total is rounded to the rupee. If a month’s arrears look wrong, compare them with the statement on the member page.</p>
    ${disputeBox(site)}
  </div></section>`;
}

function headsAnnex(b, data, site) {
  if (!data.ledgerRead) return '';
  const { rows, lift } = chargesByHead(data.entries, data.bills, b.billDate, b.id);
  if (!rows.length) return '';
  const used = HEADS.filter(([k]) => rows.some((r) => Math.abs(r[k]) >= 1));
  const tot = Object.fromEntries(used.map(([k]) => [k, rows.reduce((t, r) => t + r[k], 0)]));
  const g = data.unit ? liftGroupFor({ block: b.block, ...data.unit }) : '';
  return `<section class="sheet explain annex"><div class="x-wrap">
    <h2>Annexure B – What was charged, by head${lift.length || g ? ', and the lift' : ''}</h2>
    <p class="x-sub">Bill ${esc(b.billNo)} · ${esc(b.unit)}${b.name ? `, ${esc(b.name)}` : ''} · everything charged up to this bill</p>
    <p>The <i>Charged</i> column of the previous page, split by what it was for. From 2018-19 the Society’s books (Tally) and these accounts show each charge; for 2011-12 to 2017-18 only the audited balance on 31 March is known, so those years are shown as one figure.</p>
    <table class="x-table"><thead><tr><th>Year</th>${used.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}<th class="num">Total charged</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.fy)}</td>${used.map(([k]) => `<td class="num">${Math.abs(r[k]) >= 1 ? rs(r[k]) : ''}</td>`).join('')}<td class="num"><b>${rs(r.total)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>${used.map(([k]) => `<td class="num">${rs(tot[k])}</td>`).join('')}<td class="num"><b>${rs(rows.reduce((t, r) => t + r.total, 0))}</b></td></tr></tfoot></table>
    ${g || lift.length ? `<h3>The lift${g ? ` (${esc(LIFT_GROUPS[g] || g)})` : ''}</h3>
    <p>${g ? `This unit is served by the ${esc(LIFT_GROUPS[g] || g)}. ` : ''}The lift is charged separately from maintenance, only to the units it serves: the yearly lift contribution fixed by the General Body, and the lift’s AMC, repairs and other costs shared equally by the units served (each share is on the bill of its month). These are the lift charges in this unit’s account:</p>
    ${lift.length ? `<table class="x-table"><thead><tr><th>Date</th><th>Particulars</th><th class="num">Amount</th></tr></thead><tbody>${lift.map((x) => `<tr><td>${ddmmyyyy(x.date)}</td><td>${esc(x.text)}</td><td class="num">${rs(x.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Lift charges in total</td><td class="num"><b>${rs(lift.reduce((t, x) => t + x.amount, 0))}</b></td></tr></tfoot></table>` : '<p class="x-note">No lift charge is recorded in this unit’s account yet.</p>'}` : ''}
    <p class="x-note">The account of a unit carries its dues from one owner to the next; arrears of an earlier period, including a previous owner’s, are part of the unit’s balance where the Society’s books show them unpaid.</p>
    ${disputeBox(site)}
    <p class="x-note">Heads in the old books are read from their wording (e.g. “Lift Maint. Contribution C Bldg” is lift, “Society Maintenance Charges (C Building)” is maintenance). Payments are not split by head: a payment reduces the balance as a whole.</p>
  </div></section>`;
}

/**
 * The entries that make up the arrears on this bill: everything dated up to the bill date that was recorded before
 * the bill was made (entries recorded later — e.g. a payment entered afterwards with an earlier date — are not in it),
 * except the bill's own entry.
 */
export function entriesBefore(entries, bill) {
  const made = secs(bill.createdAt);
  return entries.filter((e) => e.kind !== 'memo' && e.ref !== bill.id && e.date <= bill.billDate
    && !(made && secs(e.createdAt) && secs(e.createdAt) > made));
}

/** Year by year: brought forward, charged, paid, other entries, carried forward. */
export function yearTable(entries, interestByBill = {}) {
  const years = new Map();
  for (const e of entries) {
    const fy = financialYear(e.date);
    const y = years.get(fy) || years.set(fy, { fy, charged: 0, interest: 0, paid: 0, other: 0, otherText: new Set() }).get(fy);
    const net = (e.debit || 0) - (e.credit || 0);
    if (e.kind === 'bill' || e.kind === 'charge' || (e.source === 'audit' && net > 0)) { y.charged += net; y.interest += interestByBill[e.ref] || 0; }
    else if (e.kind === 'payment') y.paid += (e.credit || 0) - (e.debit || 0);
    else {
      y.other += net;
      y.otherText.add(e.kind === 'opening' ? (e.source === 'difference' ? 'differences between records' : 'opening balance') : e.kind === 'reversal' ? 'cancelled receipts' : 'corrections');
    }
  }
  let bal = 0;
  return [...years.values()].sort((a, b) => a.fy.localeCompare(b.fy)).map((y) => {
    const bf = bal;
    bal = r2(bal + y.charged - y.paid + y.other);
    return { ...y, bf: r2(bf), cf: bal, charged: r2(y.charged), paid: r2(y.paid), other: r2(y.other), interest: r2(y.interest), otherText: [...y.otherText].join(', ') };
  });
}

const UNIT_FIELDS = [
  ['type', 'Premises'], ['status', 'Occupancy'], ['carpetArea', 'Carpet area (sq ft)'], ['inlets', 'Water inlets'],
  ['twoWheelers', 'Two-wheelers'], ['fourWheelers', 'Four-wheelers'], ['constructionCost', 'Construction cost (₹)']
];

/** The page itself. site: public site settings (society, interest periods, basis text). */
export function explainHTML(b, data, site, basis = '') {
  const u = data.unit || {};
  const g = data.unit ? liftGroupFor({ block: b.block, ...u }) : '';
  const lift = g ? LIFT_GROUPS[g] || g : 'No lift';
  const unitRows = UNIT_FIELDS.filter(([k]) => u[k] != null && u[k] !== '' && !(k === 'constructionCost' && !Number(u[k])))
    .map(([k, l]) => `<tr><th>${l}</th><td>${esc(k === 'constructionCost' ? money(u[k], { slash: false }) : String(u[k]))}</td></tr>`).join('')
    + `<tr><th>Lift</th><td>${esc(lift)}</td></tr><tr><th>Charges worked out by</th><td>${b.method === 'mmc' ? 'the cost-sharing method of the 2026 Rules (Society’s expenses shared among the units)' : 'the rates fixed by the General Body for the unit’s category'}</td></tr>`;

  // This month's charges
  const lines = (b.lines || []).map((l) => `<tr><td>${esc(l.label || LABEL[l.code] || l.code)}</td><td>${esc(l.detail || (l.code === 'interest' ? '' : 'Rate fixed by the General Body'))}</td><td class="num">${rs(l.amount)}</td></tr>`).join('');
  const liftNotes = (b.liftNotes || []).map((n) => `<li>${esc(n.lift === 'CD' ? 'C & D wing lifts' : LIFT_GROUPS[n.lift] || n.lift)} – ${esc(n.kind)}${n.description ? `: ${esc(n.description)}` : ''}, ${rs(n.amount)} ÷ ${n.units} units${n.instalment !== '1/1' ? `, instalment ${esc(n.instalment)}` : ''} = ${rs(n.share)}</li>`).join('');

  // Penal interest
  const interestLine = (b.lines || []).find((l) => l.code === 'interest');
  const periods = (site.interestPeriods || []).filter((p) => Number(p.rate) > 0);
  const interestText = interestLine
    ? `${rs(interestLine.amount)} this month: ${esc(interestLine.detail || '')}. Interest is simple: it is worked out on the unpaid dues only, never on interest already charged (that part of the arrears is left out of the base). The yearly rate is divided by 12 for one month.`
    : b.arrears > 0 ? 'No penal interest is charged on this bill.' : 'Nothing is overdue, so no penal interest.';
  const periodText = periods.length ? `Rates fixed by the General Body: ${periods.map((p) => `${p.rate}% p.a. from ${ddmmyyyy(p.from)}${p.to ? ` to ${ddmmyyyy(p.to)}` : ''}`).join('; ')} (ceiling: 21% p.a. before 18/07/2026, 12% p.a. from then, MCS Rule 106C-12(4)-6).` : '';

  // Arrears
  let arrearsHTML;
  if (!data.ledgerRead) arrearsHTML = '<p>The unit’s account could not be read here. The full statement is on the member page (My account → Statement) or from the Society office.</p>';
  else {
    const interestByBill = Object.fromEntries(data.bills.map((x) => [x.id, (x.lines || []).filter((l) => l.code === 'interest').reduce((t, l) => t + (l.amount || 0), 0)]));
    const before = entriesBefore(data.entries, b);
    const years = yearTable(before, interestByBill);
    const sum = years.length ? years.at(-1).cf : 0, diff = r2(b.arrears - sum);
    const yrRows = years.map((y) => `<tr><td>${esc(y.fy)}${y.fy === financialYear(b.billDate) ? ' <small>(so far)</small>' : ''}</td><td class="num">${rs(y.bf)}</td>
      <td class="num">${y.charged ? rs(y.charged) : ''}${y.interest ? `<small>incl. interest ${rs(y.interest)}</small>` : ''}</td><td class="num">${y.paid ? rs(y.paid) : ''}</td>
      <td class="num">${y.other ? rs(y.other) : ''}${y.otherText ? `<small>${esc(y.otherText)}</small>` : ''}</td><td class="num"><b>${rs(y.cf)}</b></td></tr>`).join('');
    const pays = before.filter((e) => e.kind === 'payment' && e.credit);
    const last = pays.at(-1);
    const recent = before.slice(-12);
    let run = r2(sum - recent.reduce((t, e) => t + (e.debit || 0) - (e.credit || 0), 0));
    const recRows = recent.map((e) => { run = r2(run + (e.debit || 0) - (e.credit || 0));
      return `<tr><td>${ddmmyyyy(e.date)}</td><td>${esc(e.particulars)}${e.receipt ? ` <small>${esc(e.receipt)}</small>` : ''}</td><td class="num">${e.debit ? rs(e.debit) : ''}</td><td class="num">${e.credit ? rs(e.credit) : ''}</td><td class="num">${rs(run)}</td></tr>`; }).join('');
    const yearAgo = `${Number(b.billDate.slice(0, 4)) - 1}${b.billDate.slice(4)}`;
    const paid12 = pays.filter((e) => e.date > yearAgo).reduce((t, e) => t + e.credit, 0);
    arrearsHTML = `
      <p>The arrears are the balance of the unit’s account just before this bill: everything charged since the Society’s records begin, less everything paid. Year by year:</p>
      <table class="x-table"><thead><tr><th>Year (Apr–Mar)</th><th class="num">Brought forward</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Other entries</th><th class="num">Carried forward</th></tr></thead>
        <tbody>${yrRows || '<tr><td colspan="6">No entries.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="5">Arrears on this bill</td><td class="num"><b>${rs(b.arrears)}</b></td></tr></tfoot></table>
      ${Math.abs(diff) >= 1 ? `<p class="x-note">The entries above come to ${rs(sum)}; the difference of ${rs(diff)} is from entries recorded or corrected after this bill was made. Your statement on the member page shows them.</p>` : ''}
      <p class="x-facts">${last ? `Last payment before this bill: ${rs(last.credit)} on ${ddmmyyyy(last.date)}. ` : 'No payment is recorded before this bill. '}Paid in the 12 months before this bill: ${rs(paid12)}.</p>
      ${recRows ? `<p><b>Latest entries</b> (the full statement, from the first year, is on the member page):</p>
      <table class="x-table"><thead><tr><th>Date</th><th>Particulars</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>${recRows}</tbody></table>` : ''}
      <p class="x-note"><i>Charged</i> includes the monthly bills (and, for 2011-12 to 2017-18, the charges worked back from the audited balance on 31 March). <i>Other entries</i> are opening balances taken over, corrections and differences found between the past committee’s, Tally and these records${b.unverified ? '; the balance taken over for this unit is still being verified' : ''}.</p>`;
  }

  return `<section class="sheet explain"><div class="x-wrap">
    <h2>How this bill is worked out</h2>
    <p class="x-sub">${esc(site.society?.name || '')} · Bill ${esc(b.billNo)} dated ${ddmmyyyy(b.billDate)} · ${esc(b.unit)}${b.name ? `, ${esc(b.name)}` : ''} · ${monthLabel(b.month)}</p>
    <table class="x-sum"><tbody>
      <tr><td>Arrears (balance before this bill)</td><td class="num">${rs(b.arrears)}</td></tr>
      <tr><td>+ This month’s charges${(b.lines || []).some((l) => l.code === 'interest') ? ' (with penal interest)' : ''}</td><td class="num">${rs(b.current)}</td></tr>
      <tr class="tot"><td>= Total payable by ${ddmmyyyy(b.dueDate)}</td><td class="num">${rs(b.total)}</td></tr>
    </tbody></table>

    <h3>1. Your unit, as recorded</h3>
    <table class="x-kv"><tbody>${unitRows}</tbody></table>
    ${basis ? `<p class="x-note">${esc(basis)}</p>` : ''}

    <h3>2. This month’s charges</h3>
    <table class="x-table"><thead><tr><th>Head</th><th>How it is worked out</th><th class="num">Amount</th></tr></thead>
      <tbody>${lines || '<tr><td colspan="3">No charges this month.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">This month’s charges</td><td class="num"><b>${rs(b.current)}</b></td></tr></tfoot></table>
    ${liftNotes ? `<p><b>Lift costs shared by the units served:</b></p><ul class="x-list">${liftNotes}</ul>` : ''}

    <h3>3. Penal interest</h3>
    <p>${interestText}</p>${periodText ? `<p class="x-note">${esc(periodText)}</p>` : ''}

    <h3>4. Arrears: how ${rs(b.arrears)} built up</h3>
    ${arrearsHTML}

    <p class="x-foot">Questions or a correction: write to ${esc(site.society?.email || 'the Society office')}${site.society?.contactNo ? ` or call ${esc(site.society.contactNo)}` : ''} within ${DUES_DAYS} days, quoting the bill number and with your proof (see Annexure A or the portal agreement). Payments made after ${ddmmyyyy(b.billDate)} are not in this bill; they appear in the next one.${(data.pastInterest || []).length ? ' The interest on past arrears is worked out month by month in Annexure A.' : ''} Annexure B splits the charges by head${(data.unit && liftGroupFor({ block: b.block, ...data.unit })) ? ' and lists the lift charges' : ''}.</p>
  </div></section>${interestAnnex(b, data, site)}${headsAnnex(b, data, site)}`;
}

/* ---------- 3.35: the unit's ledger, printed after the bill (…&ledger=1) ---------- */

const SOURCE_TAG = { tally: 'Tally', archive: 'Old receipt', audit: 'Audit', difference: 'Check' };

/**
 * The entries of the unit's account up to this bill (its date, and recorded before it was made), with this bill.
 * fold: the bill was corrected before it was sent (no "Revised bill" note): a correction taken off this bill is shown
 * inside the bill's line (at the revised amount) instead of as a separate line, as on the bill itself.
 */
export function ledgerEntries(b, data, { fold = false } = {}) {
  const made = secs(b.createdAt);
  let list = (data.entries || []).filter((e) => e.date <= b.billDate
    && (e.ref === b.id || !(made && secs(e.createdAt) && secs(e.createdAt) > made)));
  if (fold && list.some((e) => e.kind === 'bill' && e.ref === b.id)) {
    list = list.filter((e) => !(e.kind === 'charge' && e.ref === b.id))
      .map((e) => (e.kind === 'bill' && e.ref === b.id ? { ...e, debit: r2(b.current), credit: 0 } : e));
  }
  return list;
}

export function ledgerHTML(b, data, site, { fold = false } = {}) {
  const top = `<h2>Ledger of the unit’s account</h2>
    <p class="x-sub">${esc(site.society?.name || '')} · ${esc(b.unit)}${b.name ? `, ${esc(b.name)}` : ''} · every bill, payment and correction up to bill ${esc(b.billNo)} dated ${ddmmyyyy(b.billDate)}</p>`;
  if (!data.ledgerRead) return `<section class="sheet ledger-sheet"><div class="x-wrap">${top}<p>The unit’s account could not be read here. Please ask the Society office for the statement.</p></div></section>`;
  const list = ledgerEntries(b, data, { fold });
  let bal = 0, dr = 0, cr = 0, rows = '', fy = '';
  const yearEnd = (f) => `<tr class="l-year"><td>${ddmmyyyy(`${Number(f.slice(0, 4)) + 1}-03-31`)}</td><td colspan="4">Balance at the end of ${esc(f)}</td><td class="num">${rs(bal)}</td></tr>`;
  for (const e of list) {
    const f = financialYear(e.date);
    if (fy && f !== fy) rows += yearEnd(fy);
    fy = f;
    bal = r2(bal + (e.debit || 0) - (e.credit || 0)); dr += e.debit || 0; cr += e.credit || 0;
    const tag = SOURCE_TAG[e.source] ? ` <small class="l-tag">${SOURCE_TAG[e.source]}</small>` : '';
    const memo = e.kind === 'memo';
    rows += `<tr${memo ? ' class="l-memo"' : e.ref === b.id ? ' class="l-this"' : ''}><td>${ddmmyyyy(e.date)}</td><td>${esc(e.particulars)}${tag}${memo && e.memo ? ` <small>(₹ ${money(e.memo, { slash: false })}, not part of the balance)</small>` : ''}</td>
      <td>${esc(e.receipt || '')}</td><td class="num">${e.debit ? money(e.debit, { slash: false }) : ''}</td><td class="num">${e.credit ? money(e.credit, { slash: false }) : ''}</td><td class="num">${rs(bal)}</td></tr>`;
  }
  const diff = r2(b.total - bal);
  const sources = [list.some((e) => e.source === 'audit' || e.source === 'archive') ? '2011-12 to 2017-18: receipts from the past committee’s records (Old receipt) and, at each 31 March, the balancing figure to the audited balance (Audit)' : '',
    list.some((e) => e.source === 'tally') ? 'from 2018-19: the Society’s Tally ledger (Tally)' : '',
    ''].filter(Boolean);
  const srcText = sources.length ? `${sources.join('; ')}; then these accounts` : 'these accounts';
  return `<section class="sheet ledger-sheet"><div class="x-wrap">${top}
    <table class="x-table l-table"><thead><tr><th>Date</th><th>Particulars</th><th>Receipt</th><th class="num">Debit (₹)</th><th class="num">Credit (₹)</th><th class="num">Balance (₹)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No entries.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">Total of the entries above</td><td class="num">${money(r2(dr), { slash: false })}</td><td class="num">${money(r2(cr), { slash: false })}</td><td class="num"><b>${rs(bal)}</b></td></tr>
        <tr><td colspan="5">Total payable on bill ${esc(b.billNo)}</td><td class="num"><b>${rs(b.total)}</b></td></tr></tfoot></table>
    ${Math.abs(diff) >= 1 ? `<p class="x-note">The entries above come to ${rs(bal)}; the difference of ${rs(diff)} is from entries recorded or corrected after this bill was made.</p>` : ''}
    <p class="x-note">Debit adds to the dues, credit reduces them; a balance marked Cr is an advance. Sources: ${esc(srcText)}. Payments made after ${ddmmyyyy(b.billDate)}, or recorded after this bill was made, are not in this ledger.</p>
    ${disputeBox(site)}
  </div></section>`;
}
