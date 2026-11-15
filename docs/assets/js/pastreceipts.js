// Receipts kept by the past committee (Excel sheets, Oct 2011 – Oct 2016), one record per receipt line,
// stored with each unit and editable by the committee after checking the physical receipt books.
//
//   units/{unitId}/pastReceipts/{id}   { receiptNo, date, fy, amount, cash, cheque, mode, head, period, remark,
//                                        status, checks[], asTyped{}, source, verify{ state, note, by, byName, at } }
//   pastReceiptEdits/{auto}             permanent log of every change: { unitId, receiptId, before, after, reason, by, byName, at }
//
// status: 'payment' (money received) | 'duplicate' (reissued copy) | 'cancelled' | 'repeat' (same line listed twice)
//         | 'void' (removed by the committee after checking). Only 'payment' lines count as money received.
// verify.state: 'unchecked' | 'verified' (matches the receipt book) | 'corrected' (changed after checking) | 'disputed'

import { fyBounds, financialYear } from './billing-core.js';

/** Heads that are part of the member's maintenance account. Other heads are shown but don't change the dues balance. */
export const DUES_HEADS = ['Maintenance', 'Lift AMC'];
export const HEADS = ['Maintenance', 'Lift AMC', 'Builder pending', 'Transfer fee', 'Society formation & share', 'Drainage work', 'Property tax', 'Other'];
export const STATUSES = [['payment', 'Payment'], ['duplicate', 'Duplicate copy (not counted)'], ['cancelled', 'Cancelled (not counted)'],
  ['repeat', 'Listed twice (not counted)'], ['void', 'Removed after checking (not counted)']];
export const VERIFY = [['unchecked', 'Not yet checked'], ['verified', 'Checked: matches the receipt book'],
  ['corrected', 'Corrected after checking the receipt book'], ['disputed', 'Discrepancy: still to be resolved']];
export const VERIFY_LABEL = Object.fromEntries(VERIFY);
const EDITABLE = ['receiptNo', 'date', 'amount', 'cash', 'cheque', 'mode', 'head', 'period', 'remark', 'status'];

export const counts = (r) => r.status === 'payment' && (r.amount || 0) > 0;
export const towardDues = (r) => counts(r) && DUES_HEADS.includes(r.head);

export async function loadPastReceipts({ F, db }, unitId) {
  const s = await F.getDocs(F.collection(db, 'units', unitId, 'pastReceipts')).catch(() => ({ docs: [] }));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.receiptNo).localeCompare(String(b.receiptNo), undefined, { numeric: true }));
}

export async function loadAllPastReceipts(fb, units) {
  const lists = await Promise.all(units.map((u) => loadPastReceipts(fb, u.id)));
  return Object.fromEntries(units.map((u, i) => [u.id, lists[i]]));
}

/** Writes every receipt from the prepared file. Records the committee has already checked or edited are left alone. */
export async function importPastReceipts(fb, data, units, onProgress = () => {}) {
  const { F, db, auth } = fb;
  const ids = new Set(units.map((u) => u.id));
  const list = (data.receipts || []).filter((r) => ids.has(r.unitId));
  const skippedUnits = [...new Set((data.receipts || []).filter((r) => !ids.has(r.unitId)).map((r) => r.unitId))];
  const existing = await loadAllPastReceipts(fb, units.filter((u) => list.some((r) => r.unitId === u.id)));
  const keep = new Set(Object.values(existing).flat().filter((r) => r.verify?.state && r.verify.state !== 'unchecked').map((r) => `${r.unitId}/${r.id}`));
  let written = 0, kept = 0;
  for (let i = 0; i < list.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const r of list.slice(i, i + 400)) {
      if (keep.has(`${r.unitId}/${r.id}`)) { kept++; continue; }
      const { id, ...rest } = r;
      batch.set(F.doc(db, 'units', r.unitId, 'pastReceipts', id), {
        ...rest, verify: { state: 'unchecked' }, importedAt: F.serverTimestamp(), importedBy: auth.currentUser.uid
      });
      written++;
    }
    await batch.commit();
    onProgress(Math.min(i + 400, list.length), list.length);
  }
  return { written, kept, skippedUnits, total: list.length };
}

function cleanRecord(r) {
  const out = {};
  for (const k of EDITABLE) if (r[k] !== undefined) out[k] = r[k];
  if (out.date) out.fy = financialYear(out.date);
  for (const k of ['amount', 'cash', 'cheque']) if (out[k] !== undefined) out[k] = Math.round((Number(out[k]) || 0) * 100) / 100;
  return out;
}

/** Saves a change (or a verification) and writes a permanent log entry with the reason. */
export async function savePastReceipt(fb, unitId, before, changes, verify, reason, byName) {
  const { F, db, auth } = fb;
  const after = cleanRecord({ ...before, ...changes });
  const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
  const v = { state: verify.state, note: verify.note || '', by: auth.currentUser.uid, byName: byName || '', at: F.serverTimestamp() };
  await F.updateDoc(F.doc(db, 'units', unitId, 'pastReceipts', before.id), { ...changed, verify: v, updatedAt: F.serverTimestamp() });
  await F.addDoc(F.collection(db, 'pastReceiptEdits'), {
    unitId, receiptId: before.id, receiptNo: after.receiptNo ?? before.receiptNo,
    before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k] ?? null])), after: changed,
    verifyBefore: before.verify?.state || 'unchecked', verifyAfter: v.state, reason: reason || '', by: auth.currentUser.uid, byName: byName || '', at: F.serverTimestamp()
  });
  return Object.keys(changed);
}

/** Adds a receipt found in the physical books but missing from the Excel sheets. */
export async function addPastReceipt(fb, unitId, rec, verify, reason, byName) {
  const { F, db, auth } = fb;
  const data = cleanRecord(rec);
  const id = `${unitId}_${String(data.receiptNo || 'new').replace(/[^\w-]/g, '-')}_added${Date.now().toString(36)}`;
  await F.setDoc(F.doc(db, 'units', unitId, 'pastReceipts', id), {
    unitId, ...data, checks: [], asTyped: {}, source: 'Added by the committee from the receipt book',
    verify: { state: verify.state, note: verify.note || '', by: auth.currentUser.uid, byName: byName || '', at: F.serverTimestamp() },
    createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
  });
  await F.addDoc(F.collection(db, 'pastReceiptEdits'), {
    unitId, receiptId: id, receiptNo: data.receiptNo || '', before: null, after: data, verifyBefore: null, verifyAfter: verify.state,
    reason: reason || '', by: auth.currentUser.uid, byName: byName || '', at: F.serverTimestamp()
  });
  return id;
}

export async function loadPastReceiptEdits({ F, db }, unitId) {
  const s = await F.getDocs(F.query(F.collection(db, 'pastReceiptEdits'), F.where('unitId', '==', unitId))).catch(() => ({ docs: [] }));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
}

const rs = (n) => `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(n))}${n < 0 ? ' Cr' : ''}`;
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * The unit's ledger before Tally (2011-12 to 2017-18): for each audited year, the archived receipts toward
 * maintenance (credits) and one balancing line that brings the balance to the audited figure on 31 March
 * (charges for the year, less any payments that are not in the receipt archive). Receipts for other heads
 * (builder pending, transfer fees …) are listed as memo lines that don't change the balance.
 * Returns { entries, endBalance, endDate } or null when there are no audited years.
 */
export function preLedger(unitId, audits, receipts) {
  if (!audits?.length) return null;
  const shop = /^(B|GF)-/.test(unitId);
  const out = [];
  let bal = 0, lastKnown = 0, pendingYears = [];
  for (const a of audits) {
    const { from, to } = fyBounds(a.fy);
    const inYear = (receipts || []).filter((r) => r.date >= from && r.date <= to && counts(r));
    for (const r of inYear) {
      const flags = r.verify?.state && r.verify.state !== 'unchecked' ? ` [${VERIFY_LABEL[r.verify.state]}]` : (r.checks || []).length ? ' [to check]' : '';
      if (towardDues(r)) {
        out.push({ date: r.date, particulars: `Receipt ${r.receiptNo}: ${r.head}${r.period ? `, ${r.period}` : ''} (${r.mode})${flags}`,
          receipt: `Old ${r.receiptNo}`, debit: 0, credit: r.amount, kind: 'payment', source: 'archive', archiveId: r.id });
        bal -= r.amount;
      } else {
        out.push({ date: r.date, particulars: `Receipt ${r.receiptNo}: ${r.head} ${rs(r.amount)}${r.period ? `, ${r.period}` : ''} (not part of maintenance dues)${flags}`,
          receipt: `Old ${r.receiptNo}`, debit: 0, credit: 0, memo: r.amount, kind: 'memo', source: 'archive', archiveId: r.id });
      }
    }
    const row = (a.dues || []).find((d) => d.unitId === unitId);
    const known = row || a.duesComplete || shop;
    pendingYears.push(a.fy);
    if (!known) continue;                       // balance not in this year's audit file: carry on to the next audited figure
    const closing = row ? row.amount : 0;
    const diff = r2(closing - bal);
    const paidIn = inYear.filter(towardDues).reduce((t, r) => t + r.amount, 0);
    const span = pendingYears.length > 1 ? `${pendingYears[0]} to ${pendingYears[pendingYears.length - 1]}` : a.fy;
    if (Math.abs(diff) >= 0.5) {
      out.push({ date: to, particulars: `Balancing figure to the audited balance of ${rs(closing)} on 31 March ${to.slice(0, 4)}: charges for ${span} less any payments not in the receipt archive (receipts above: ${rs(paidIn)})`,
        receipt: '', debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0, kind: 'adjustment', source: 'audit' });
    }
    bal = closing; lastKnown = closing; pendingYears = [];
  }
  const last = audits[audits.length - 1];
  return { entries: out, endBalance: r2(bal), endDate: last.to, lastKnown };
}

/** Receipts toward dues per financial year for one unit: { '2015-16': 12000, … } */
export function receiptsByYear(receipts) {
  const out = {};
  for (const r of receipts || []) if (towardDues(r)) out[r.fy] = r2((out[r.fy] || 0) + r.amount);
  return out;
}
