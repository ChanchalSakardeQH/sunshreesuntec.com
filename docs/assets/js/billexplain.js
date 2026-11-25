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

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rs = (n) => `₹ ${money(Math.abs(r2(n)), { slash: false })}${n < 0 ? ' Cr' : ''}`;
const secs = (t) => (t?.seconds ?? (t?.toDate ? t.toDate().getTime() / 1000 : null));

/** Reads what the explanation needs; anything unreadable is left out (the page says so). */
export async function loadExplainData(fb, bill) {
  const { F, db } = fb, id = bill.unitId;
  const safe = (p) => p.catch(() => null);
  const [unitSnap, ledgerSnap, tallySnap, auditSnap, billsSnap] = await Promise.all([
    safe(F.getDoc(F.doc(db, 'units', id))),
    safe(F.getDocs(F.collection(db, 'units', id, 'ledger'))),
    safe(F.getDoc(F.doc(db, 'units', id, 'history', 'tally'))),
    safe(F.getDoc(F.doc(db, 'units', id, 'history', 'audited'))),
    safe(F.getDocs(F.query(F.collection(db, 'bills'), F.where('unitId', '==', id))))
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
    bills: (billsSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() }))
  };
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

    <p class="x-foot">Questions or a correction: write to ${esc(site.society?.email || 'the Society office')}${site.society?.contactNo ? ` or call ${esc(site.society.contactNo)}` : ''} within 7 days, quoting the bill number. Payments made after ${ddmmyyyy(b.billDate)} are not in this bill; they appear in the next one.</p>
  </div></section>`;
}
