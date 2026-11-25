// Accounting operations (browser). Every money movement runs in a
// transaction that updates the unit's running balance and its ledger together.

import {
  computeBill, billNumber, billId, monthBounds, financialYear, receiptNumber, round, monthLabel, todayIST, LABEL,
  categoryIdFor, liftGroupFor, liftExpenseEndMonth, buildContext, prepareExtras, extrasForUnit, maskedDues,
  fyBounds, longDate
} from './billing-core.js';
import { DEFAULT_BILLING, DEFAULT_SITE, OCTOBER_2026_BILL } from './defaults.js';
import { auditIn, auditNow, diffFields } from './audit.js';

/* ---------- financial year lock ---------- */

/** Entries can't be dated on or before the last closed financial year's end (settings.lockedUpTo). */
export function assertOpen(settings, dateIso) {
  const lock = settings?.lockedUpTo || '';
  if (lock && dateIso && dateIso <= lock) {
    throw new Error(`The books are closed up to ${longDate(lock)}. Use a date after that, or ask the committee to reopen the year.`);
  }
}

/* ---------- reads ---------- */

export async function loadBilling({ F, db }) {
  const s = await F.getDoc(F.doc(db, 'settings', 'billing'));
  const d = s.exists() ? s.data() : {};
  return { ...DEFAULT_BILLING, ...d, mmc: { ...DEFAULT_BILLING.mmc, ...(d.mmc || {}) } };
}

export async function loadSite({ F, db }) {
  const s = await F.getDoc(F.doc(db, 'public', 'site'));
  if (!s.exists()) return structuredClone(DEFAULT_SITE);
  const d = s.data();
  return {
    ...structuredClone(DEFAULT_SITE), ...d,
    society: { ...DEFAULT_SITE.society, ...(d.society || {}) },
    bank: { ...DEFAULT_SITE.bank, ...(d.bank || {}) },
    contact: { ...DEFAULT_SITE.contact, ...(d.contact || {}) }
  };
}

export async function loadUnits({ F, db }) {
  const snap = await F.getDocs(F.collection(db, 'units'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ---------- public dues (what the website shows) ---------- */

/**
 * Dues are kept twice: private/dues has the amounts (signed-in members and committee only);
 * public/dues has names with masked amounts ("x,xx,xxx") for visitors.
 */
export async function rebuildPublicDues(fb, blocks) {
  const { F, db } = fb;
  const units = await loadUnits(fb);
  const prev = await F.getDoc(F.doc(db, 'public', 'dues'));
  const full = {
    statement: 'Society maintenance ledger',
    asOn: todayIST(),
    blocks: blocks || (prev.exists() ? prev.data().blocks : []),
    units: units.map(publicRow)
  };
  await F.setDoc(F.doc(db, 'private', 'dues'), { ...full, updatedAt: F.serverTimestamp() });
  await F.setDoc(F.doc(db, 'public', 'dues'), { ...maskedDues(full), updatedAt: F.serverTimestamp() });
}

/** True if public/dues still carries real amounts (written by version 2.6 or earlier). */
export async function publicDuesNeedMasking({ F, db }) {
  const s = await F.getDoc(F.doc(db, 'public', 'dues'));
  return s.exists() && !s.data().masked;
}

function publicRow(u) {
  return {
    id: u.id, unit: u.unit, block: u.block, name: u.name || '', type: u.type,
    owner: round(u.balance), bpm: u.bpm ?? null, ...(u.unverified ? { verify: true } : {})
  };
}

/** Patches one unit's row in private/dues and rewrites the masked public/dues, inside a running transaction. */
function patchPublic(tx, F, privRef, privSnap, unit) {
  if (!privSnap.exists()) return;
  const data = privSnap.data();
  const units = data.units.map((r) => (r.id === unit.id ? publicRow(unit) : r));
  const full = { ...data, units, asOn: todayIST() };
  tx.update(privRef, { units, asOn: full.asOn, updatedAt: F.serverTimestamp() });
  tx.set(F.doc(privRef.firestore, 'public', 'dues'), { ...maskedDues(full), updatedAt: F.serverTimestamp() });
}

/* ---------- bills ---------- */

/**
 * Creates one unit's bill for a month. Skips (returns null) if that bill already exists,
 * so running it twice never double-bills.
 */
export async function generateBill(fb, unitId, opts) {
  const { F, db, auth } = fb;
  const { monthKey, billDate, dueDate, extras = [], liftExpenses = [], ctx, settings, periodFrom, periodTo, source = 'admin' } = opts;
  const unitRef = F.doc(db, 'units', unitId);
  const billRef = F.doc(db, 'bills', billId(unitId, monthKey));
  const pubRef = F.doc(db, 'private', 'dues');

  assertOpen(settings, billDate);
  return F.runTransaction(db, async (tx) => {
    const [unitSnap, billSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(billRef), tx.get(pubRef)]);
    if (billSnap.exists()) return null;
    if (!unitSnap.exists()) throw new Error(`Unit ${unitId} not found`);
    const unit = { id: unitId, ...unitSnap.data() };
    if (unit.active === false) return null;

    const calc = computeBill({ unit, settings, monthKey, extras, liftExpenses, ctx });
    const bounds = monthBounds(monthKey);
    const bill = {
      billNo: billNumber(unit.unit, billDate),
      unitId, unit: unit.unit, block: unit.block, name: unit.name || '', type: unit.type, status: unit.status || '',
      month: monthKey, billDate, dueDate: dueDate || '',
      periodFrom: periodFrom || bounds.from, periodTo: periodTo || bounds.to,
      arrears: calc.arrears, lines: calc.lines, current: calc.current, total: calc.total,
      unverified: Boolean(unit.unverified),
      liftNotes: calc.liftNotes, liftExpenseIds: calc.liftNotes.map((n) => n.id),
      method: settings?.method || 'agm',
      source, createdAt: F.serverTimestamp(), createdBy: auth.currentUser?.uid || source
    };
    const newBalance = calc.arrears + calc.current;
    const auditId = auditIn(tx, fb, { action: 'bill.generate', unitId, unit: unit.unit, amount: calc.current, debit: calc.current,
      balanceBefore: round(unit.balance), balanceAfter: newBalance, refs: { bill: billRef.id }, refNo: bill.billNo,
      detail: `${monthLabel(monthKey)}: arrears ₹${calc.arrears}, this month ₹${calc.current}, total ₹${calc.total}${source !== 'admin' ? ` (${source})` : ''}` });
    tx.set(billRef, bill);
    tx.set(F.doc(F.collection(db, 'units', unitId, 'ledger')), {
      date: billDate, particulars: `Bill ${bill.billNo} for ${monthLabel(monthKey)}`, receipt: '',
      debit: calc.current, credit: 0, kind: 'bill', ref: billRef.id,
      createdAt: F.serverTimestamp(), createdBy: bill.createdBy
    });
    tx.update(unitRef, {
      balance: newBalance, interestDue: Math.max(0, round(unit.interestDue)) + calc.interest,
      lastBillId: billRef.id, auditId, updatedAt: F.serverTimestamp()
    });
    // Interest on past arrears added to this bill (3.15): marked as billed, with the bill it went on.
    for (const id of calc.adjIds || []) tx.update(F.doc(db, 'billAdjustments', id), { status: 'billed', billId: billRef.id, billNo: bill.billNo, billedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: newBalance });
    return bill;
  });
}

export async function generateMonth(fb, opts, onProgress = () => {}) {
  const allUnits = await loadUnits(fb);
  const units = allUnits.filter((u) => u.active !== false);
  const ctx = buildContext(allUnits);
  const prepared = prepareExtras(opts.extras, allUnits); // one-off charges: per unit, equal share or by area
  const liftExpenses = await loadLiftExpensesFor(fb, opts.monthKey);
  const pending = await loadPendingAdjustments(fb, opts.monthKey);
  const made = [], skipped = [], failed = [];
  for (const [i, u] of units.entries()) {
    try {
      const extras = [...extrasForUnit(prepared, u), ...(pending[u.id] || [])];
      const b = await generateBill(fb, u.id, { ...opts, extras, liftExpenses, ctx });
      (b ? made : skipped).push(u.unit);
    } catch (err) {
      failed.push({ unit: u.unit, error: err.message || String(err) });
    }
    onProgress(i + 1, units.length);
  }
  if (made.length) await markBilled(fb, opts.monthKey, made.length);
  if (made.length || failed.length) await auditNow(fb, { action: 'bill.month', count: made.length, refNo: opts.monthKey,
    detail: `${monthLabel(opts.monthKey)}: ${made.length} bills made, ${skipped.length} already there or not billed${failed.length ? `, ${failed.length} failed (${failed.slice(0, 10).map((f) => f.unit).join(', ')})` : ''}` });
  return { made, skipped, failed };
}

/** Interest on past arrears approved for a month's bills (billAdjustments, status pending), by unit, as bill extras. */
export async function loadPendingAdjustments({ F, db }, monthKey) {
  const snap = await F.getDocs(F.query(F.collection(db, 'billAdjustments'), F.where('month', '==', monthKey)));
  const out = {};
  snap.docs.forEach((d) => {
    const a = d.data();
    if (a.status !== 'pending' || !(Number(a.amount) > 0)) return;
    (out[a.unitId] ??= []).push({ code: a.code || 'interest', amount: Number(a.amount), detail: a.detail || '', adjId: d.id });
  });
  return out;
}

/** Remembers the latest month that has bills, so lift expenses can't be added to a month already billed. */
async function markBilled(fb, monthKey, count) {
  const ref = fb.F.doc(fb.db, 'settings', 'billing');
  const cur = await fb.F.getDoc(ref);
  const last = cur.exists() ? cur.data().lastBilledMonth || '' : '';
  await fb.F.setDoc(ref, {
    lastRun: { month: monthKey, at: fb.F.serverTimestamp(), count },
    ...(monthKey > last ? { lastBilledMonth: monthKey } : {})
  }, { merge: true });
}

/* ---------- lift expenses (AMC, repairs, wear & tear) ---------- */

export async function loadLiftExpenses({ F, db }) {
  const snap = await F.getDocs(F.collection(db, 'liftExpenses'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
}

/** Lift expenses with an instalment falling in this month. */
export async function loadLiftExpensesFor({ F, db }, monthKey) {
  const snap = await F.getDocs(F.query(F.collection(db, 'liftExpenses'), F.where('startMonth', '<=', monthKey)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.status !== 'deleted' && liftExpenseEndMonth(e) >= monthKey);
}

/** Units that share a lift expense: active units served by the chosen lift(s). */
export function unitsServedBy(units, lifts) {
  return units.filter((u) => u.active !== false && lifts.includes(liftGroupFor(u)));
}

/**
 * Records a lift expense to be shared equally by the units served by that lift, starting with the bills
 * of startMonth. That month must not have been billed yet, so every unit receives its share.
 */
export async function addLiftExpense(fb, e, units, lastBilledMonth) {
  const { F, db, auth } = fb;
  const amount = round(e.amount);
  if (!(amount > 0)) throw new Error('Enter the expense amount.');
  if (lastBilledMonth && e.startMonth <= lastBilledMonth) {
    throw new Error(`Bills up to ${monthLabel(lastBilledMonth)} are already generated. Recover this expense from a later month.`);
  }
  const lifts = e.lift === 'CD' ? ['C', 'D'] : [e.lift];
  const served = unitsServedBy(units, lifts);
  if (!served.length) throw new Error('No units are marked as served by this lift. Set the lift on each unit under Units → Open.');
  const ref = await F.addDoc(F.collection(db, 'liftExpenses'), {
    date: e.date, lift: e.lift, kind: e.kind, description: e.description || '', vendor: e.vendor || '',
    invoiceNo: e.invoiceNo || '', paidRef: e.paidRef || '', amount,
    startMonth: e.startMonth, instalments: Math.min(24, Math.max(1, round(e.instalments) || 1)),
    unitIds: served.map((u) => u.id), status: 'active',
    // When it comes from Accounts → Expenses: the approved expense (voucher, bill photos) it recovers.
    ...(e.expenseId ? { expenseId: e.expenseId, voucherNo: e.voucherNo || '' } : {}),
    createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
  });
  await auditNow(fb, { action: 'lift.add', amount, count: served.length, units: served.map((u) => u.id), refs: { liftExpense: ref.id }, refNo: e.invoiceNo || e.voucherNo || '',
    detail: `Lift ${e.lift} ${e.kind}: ${e.description || ''} · ₹${amount} from ${monthLabel(e.startMonth)} in ${Math.min(24, Math.max(1, round(e.instalments) || 1))} instalment(s), ${served.length} units` });
  return { id: ref.id, units: served.length };
}

export async function deleteLiftExpense(fb, exp, lastBilledMonth) {
  if (lastBilledMonth && exp.startMonth <= lastBilledMonth) {
    throw new Error('This expense is already on generated bills. Correct individual units under Units → Add a correction instead.');
  }
  await fb.F.deleteDoc(fb.F.doc(fb.db, 'liftExpenses', exp.id));
  await auditNow(fb, { action: 'lift.delete', amount: round(exp.amount), refs: { liftExpense: exp.id }, refNo: exp.invoiceNo || '', detail: `Lift ${exp.lift} ${exp.kind}: ${exp.description || ''} · ₹${round(exp.amount)} from ${monthLabel(exp.startMonth)}` });
}

/* ---------- payments and receipts ---------- */

export async function recordPayment(fb, p) {
  const { F, db, auth } = fb;
  const amount = round(p.amount);
  if (!(amount > 0)) throw new Error('Enter an amount greater than zero.');
  assertOpen(await loadBilling(fb), p.date);
  const fy = financialYear(p.date);
  const unitRef = F.doc(db, 'units', p.unitId);
  const counterRef = F.doc(db, 'counters', `receipts-${fy}`);
  const pubRef = F.doc(db, 'private', 'dues');
  const payRef = F.doc(F.collection(db, 'payments'));

  return F.runTransaction(db, async (tx) => {
    const [unitSnap, counterSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(counterRef), tx.get(pubRef)]);
    if (!unitSnap.exists()) throw new Error('Unit not found.');
    const unit = { id: p.unitId, ...unitSnap.data() };
    const seq = (counterSnap.exists() ? counterSnap.data().next : 1);
    const receiptNo = receiptNumber(fy, seq);
    const before = round(unit.balance);
    const after = before - amount;
    // A payment settles unpaid penal interest first, then the principal dues.
    const interestCleared = Math.min(amount, Math.max(0, round(unit.interestDue)));

    const payment = {
      receiptNo, fy, unitId: p.unitId, unit: unit.unit, block: unit.block, name: unit.name || '',
      date: p.date, amount, mode: p.mode, reference: p.reference || '', bank: p.bank || '', note: p.note || '',
      billNo: p.billNo || '', balanceBefore: before, balanceAfter: after, interestCleared, status: 'ok',
      ...(p.claimId ? { claimId: p.claimId } : {}),   // 3.29: a payment reported by the member, verified
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    };
    const auditId = auditIn(tx, fb, { action: 'payment.record', unitId: p.unitId, unit: unit.unit, amount, credit: amount, balanceBefore: before, balanceAfter: after,
      refs: { payment: payRef.id, claim: p.claimId || '' }, refNo: receiptNo, detail: `${p.date} · ${p.mode}${p.reference ? ' ' + p.reference : ''}${p.bank ? ' · ' + p.bank : ''}${p.billNo ? ' · against ' + p.billNo : ''}${p.note ? ' · ' + p.note : ''}` });
    tx.set(counterRef, { next: seq + 1 });
    tx.set(payRef, payment);
    tx.set(F.doc(F.collection(db, 'units', p.unitId, 'ledger')), {
      date: p.date, particulars: `Payment received – ${p.mode}${p.reference ? ' ' + p.reference : ''}`,
      receipt: receiptNo, debit: 0, credit: amount, kind: 'payment', ref: payRef.id,
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, interestDue: Math.max(0, round(unit.interestDue)) - interestCleared, auditId, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
    return { id: payRef.id, ...payment };
  });
}

/** Cancels a receipt (bounced cheque, wrong entry). The receipt stays on record, marked cancelled. */
export async function cancelPayment(fb, paymentId, reason, undoOf = '') {
  const { F, db, auth } = fb;
  const payRef = F.doc(db, 'payments', paymentId);
  const pubRef = F.doc(db, 'private', 'dues');
  return F.runTransaction(db, async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists()) throw new Error('Receipt not found.');
    const pay = paySnap.data();
    if (pay.status === 'cancelled') throw new Error('This receipt is already cancelled.');
    const unitRef = F.doc(db, 'units', pay.unitId);
    const [unitSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(pubRef)]);
    const unit = { id: pay.unitId, ...unitSnap.data() };
    const after = round(unit.balance) + pay.amount;
    const auditId = auditIn(tx, fb, { action: undoOf ? 'undo' : 'payment.cancel', unitId: pay.unitId, unit: unit.unit, amount: pay.amount, debit: pay.amount,
      balanceBefore: round(unit.balance), balanceAfter: after, refs: { payment: paymentId }, refNo: pay.receiptNo, reason, undoOf,
      detail: `Receipt ${pay.receiptNo} of ${pay.date} (₹${pay.amount}, ${pay.mode}${pay.reference ? ' ' + pay.reference : ''}) cancelled` });
    tx.update(payRef, { status: 'cancelled', cancelReason: reason || '', cancelledAt: F.serverTimestamp(), cancelledBy: auth.currentUser.uid });
    tx.set(F.doc(F.collection(db, 'units', pay.unitId, 'ledger')), {
      date: todayIST(), particulars: `Receipt ${pay.receiptNo} cancelled${reason ? ' – ' + reason : ''}`,
      receipt: pay.receiptNo, debit: pay.amount, credit: 0, kind: 'reversal', ref: paymentId,
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, interestDue: Math.max(0, round(unit.interestDue)) + (pay.interestCleared || 0), auditId, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
  });
}

/**
 * 3.31: takes a charge (billAdjustments, status billed) off the bill it went on, e.g. a charge added twice by mistake.
 * In one transaction: the bill's line is reduced (removed if nothing is left; the description of this charge taken out
 * of its note), this month's amount and the total go down and a revision is recorded on the bill; a ledger credit
 * (kind charge, dated the bill date or today if later) and the unit's balance follow; the charge is marked reversed.
 */
export async function reverseBilledCharge(fb, adjId, reason, byName) {
  const { F, db, auth } = fb;
  const adjRef = F.doc(db, 'billAdjustments', adjId);
  const pubRef = F.doc(db, 'private', 'dues');
  return F.runTransaction(db, async (tx) => {
    const adjSnap = await tx.get(adjRef);
    const a = adjSnap.data();
    if (!a || a.status !== 'billed' || !a.billId) throw new Error('This charge is not on a bill.');
    const billRef = F.doc(db, 'bills', a.billId), unitRef = F.doc(db, 'units', a.unitId);
    const [billSnap, unitSnap, pubSnap] = await Promise.all([tx.get(billRef), tx.get(unitRef), tx.get(pubRef)]);
    const bill = billSnap.data(), unit = { id: a.unitId, ...unitSnap.data() };
    const amt = round(a.amount);
    const i = (bill.lines || []).findIndex((l) => l.code === a.code);
    if (i < 0 || round(bill.lines[i].amount) < amt) throw new Error(`${bill.billNo} has no such amount under that head.`);
    const lines = bill.lines.map((l) => ({ ...l }));
    const left = round(lines[i].amount) - amt;
    if (left <= 0) lines.splice(i, 1);
    else {
      lines[i].amount = left;
      if (lines[i].detail) {
        const parts = lines[i].detail.split('; '), k = parts.indexOf(a.detail || '');
        if (k >= 0) parts.splice(k, 1);
        lines[i].detail = parts.join('; ');
        if (!lines[i].detail) delete lines[i].detail;
      }
    }
    const current = round(bill.current) - amt;
    const today = todayIST(), date = bill.billDate > today ? bill.billDate : today;
    tx.update(billRef, { lines, current, total: round(bill.arrears) + current, updatedAt: F.serverTimestamp(),
      revisions: [...(bill.revisions || []), { on: today, by: auth.currentUser.uid, byName: byName || '', code: a.code, amount: -amt, detail: a.detail || '', reason }] });
    tx.set(F.doc(F.collection(db, 'units', a.unitId, 'ledger')), {
      date, particulars: `Correction to bill ${bill.billNo}: ${LABEL[a.code] || a.code} ₹${amt} taken off (${reason})`.slice(0, 240),
      receipt: '', debit: 0, credit: amt, kind: 'charge', code: a.code, ref: a.billId, createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    const after = round(unit.balance) - amt;
    const auditId = auditIn(tx, fb, { action: 'charge.reverse', unitId: a.unitId, unit: unit.unit, amount: amt, credit: amt, balanceBefore: round(unit.balance), balanceAfter: after,
      refs: { bill: a.billId, adjustment: adjId }, refNo: bill.billNo, reason, detail: `${LABEL[a.code] || a.code}: ${a.detail || ''} taken off ${bill.billNo}` });
    tx.update(unitRef, { balance: after, auditId, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
    tx.update(adjRef, { status: 'reversed', reversedAt: F.serverTimestamp(), reversedBy: auth.currentUser.uid, reversedByName: byName || '', reason, correctionDate: date });
    return { billNo: bill.billNo, amount: amt };
  });
}

/**
 * 3.34: sets a unit's balance to the total of its ledger entries (committee), when the activity trail's check finds a
 * balance that doesn't match its ledger (a change made without its entry). The ledger is the record; nothing is added to it.
 */
export async function fixBalanceToLedger(fb, unitId, ledgerTotal, reason) {
  const { F, db } = fb;
  const unitRef = F.doc(db, 'units', unitId), pubRef = F.doc(db, 'private', 'dues');
  return F.runTransaction(db, async (tx) => {
    const [unitSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(pubRef)]);
    const unit = { id: unitId, ...unitSnap.data() };
    const after = round(ledgerTotal);
    const auditId = auditIn(tx, fb, { action: 'balance.fix', unitId, unit: unit.unit, amount: Math.abs(after - round(unit.balance)), balanceBefore: round(unit.balance), balanceAfter: after, reason,
      detail: `Balance ₹${round(unit.balance)} set to the ledger total ₹${after}` });
    tx.update(unitRef, { balance: after, auditId, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
  });
}

/** Manual correction to a unit's account (debit adds to dues, credit reduces them). */
export async function addAdjustment(fb, unitId, e) {
  const { F, db, auth } = fb;
  const debit = round(e.debit), credit = round(e.credit);
  assertOpen(await loadBilling(fb), e.date);
  const unitRef = F.doc(db, 'units', unitId);
  const pubRef = F.doc(db, 'private', 'dues');
  return F.runTransaction(db, async (tx) => {
    const [unitSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(pubRef)]);
    const unit = { id: unitId, ...unitSnap.data() };
    const after = round(unit.balance) + debit - credit;
    const ledgerRef = F.doc(F.collection(db, 'units', unitId, 'ledger'));
    const auditId = auditIn(tx, fb, { action: e.undoOf ? 'undo' : e.kind === 'charge' ? 'charge.debit' : 'correction', unitId, unit: unit.unit, amount: debit || credit, debit, credit,
      balanceBefore: round(unit.balance), balanceAfter: after, refs: { ledger: ledgerRef.id }, refNo: e.receipt || '', reason: e.reason || '', undoOf: e.undoOf || '',
      detail: `${e.date} · ${e.particulars}` });
    tx.set(ledgerRef, {
      date: e.date, particulars: e.particulars, receipt: e.receipt || '', debit, credit, kind: e.kind || 'adjustment', ...(e.code ? { code: e.code } : {}),
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, ...(e.clearUnverified ? { unverified: false } : {}), auditId, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after, ...(e.clearUnverified ? { unverified: false } : {}) });
  });
}

/**
 * Adds a unit that wasn't in the opening list (e.g. GF 21 found in the Index II documents).
 * Starts at ₹0, flagged for verification; the committee adds the opening balance as a correction.
 */
export async function addUnit(fb, u, blocks) {
  const { F, db } = fb;
  const id = String(u.id).trim().toUpperCase().replace(/\s+/g, '-');
  const ref = F.doc(db, 'units', id);
  if ((await F.getDoc(ref)).exists()) throw new Error(`Unit ${id} already exists.`);
  const all = await loadUnits(fb);
  const sameBlock = all.filter((x) => x.block === u.block);
  const order = sameBlock.length ? Math.max(...sameBlock.map((x) => x.order ?? 0)) + 0.5 : all.length;
  await F.setDoc(ref, {
    unit: u.unit, block: u.block, name: u.name || '', type: u.type, status: '',
    balance: 0, interestDue: 0, bpm: null, unverified: true,
    category: categoryIdFor({ ...u, id }), liftGroup: liftGroupFor(u), constructionCost: null,
    charges: {}, active: true, order, updatedAt: F.serverTimestamp()
  });
  await auditNow(fb, { action: 'unit.add', unitId: id, unit: u.unit, balanceAfter: 0, detail: `${u.unit} (${u.type}) ${u.name || ''} added at ₹0, to be verified` });
  await rebuildPublicDues(fb, blocks);
  return id;
}

/** Saves carpet area, inlets, vehicles and lift for many units at once. rows: [{ id, ...fields }] */
export async function saveUnitMeasurements(fb, rows, before = []) {
  const { F, db } = fb;
  const was = Object.fromEntries(before.map((u) => [u.id, u]));
  const changes = rows.flatMap(({ id, ...f }) => diffFields(was[id] || {}, f).map((c) => ({ ...c, field: `${was[id]?.unit || id} ${c.field}` })));
  if (changes.length || !before.length) await auditNow(fb, { action: 'unit.measurements', count: rows.length, units: rows.map((r) => r.id), changes, detail: `${rows.length} units saved${before.length ? `, ${changes.length} values changed` : ''}` });
  for (let i = 0; i < rows.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const { id, ...fields } of rows.slice(i, i + 400)) batch.update(F.doc(db, 'units', id), { ...fields, updatedAt: F.serverTimestamp() });
    await batch.commit();
  }
}

export async function updateUnitDetails(fb, unitId, patch, reason = '') {
  const { F, db } = fb;
  let was = {};
  try { const s = await F.getDoc(F.doc(db, 'units', unitId)); was = s.exists() ? s.data() : {}; } catch {}
  await F.updateDoc(F.doc(db, 'units', unitId), { ...patch, updatedAt: F.serverTimestamp() });
  const changes = diffFields(was, patch);
  if (changes.length) await auditNow(fb, { action: 'unit.edit', unitId, unit: was.unit || unitId, changes, reason, detail: changes.map((c) => c.field).join(', ') });
}

/* ---------- one-time import ---------- */

/**
 * Creates the units from data/dues.json with their balance as on 30 Sep 2026,
 * then (optionally) posts the October 2026 bill (arrears + Rs 6,500 other charges) for every unit.
 */
export async function importOpening(fb, dues, { includeOctober = true } = {}, onProgress = () => {}) {
  const { F, db, auth } = fb;
  const existing = await F.getDocs(F.collection(db, 'units'));
  if (!existing.empty) throw new Error('Units already exist. The opening import can only run once.');
  if (dues.openingRemoved) throw new Error('The opening balances were removed from the website files for privacy. Ask the person who maintains the website to restore them before importing again.');

  await F.setDoc(F.doc(db, 'settings', 'billing'), DEFAULT_BILLING, { merge: true });
  const siteSnap = await F.getDoc(F.doc(db, 'public', 'site'));
  if (!siteSnap.exists()) await F.setDoc(F.doc(db, 'public', 'site'), DEFAULT_SITE);

  const uid = auth.currentUser.uid;
  let batch = F.writeBatch(db), ops = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = F.writeBatch(db); ops = 0; } };

  for (const [i, u] of dues.units.entries()) {
    const opening = u.owner ?? 0;
    batch.set(F.doc(db, 'units', u.id), {
      unit: u.unit, block: u.block, name: u.name || '', type: u.type, status: '',
      balance: opening, interestDue: 0, bpm: u.bpm ?? null, unverified: u.owner === null || Boolean(u.verify),
      category: categoryIdFor(u), liftGroup: liftGroupFor(u), constructionCost: null,
      charges: {}, active: true, order: i, updatedAt: F.serverTimestamp()
    });
    batch.set(F.doc(F.collection(db, 'units', u.id, 'ledger')), {
      date: '2026-09-30',
      particulars: u.owner === null
        ? 'Opening balance as on 30 Sep 2026 – to be verified'
        : 'Opening balance as on 30 Sep 2026 (arrears 1 Apr 2018 – 30 Sep 2026)',
      receipt: '', debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, kind: 'opening',
      createdAt: F.serverTimestamp(), createdBy: uid
    });
    ops += 2;
    if (ops >= 400) await flush();
    onProgress(i + 1, dues.units.length * (includeOctober ? 2 : 1));
  }
  await flush();
  await auditNow(fb, { action: 'opening.import', count: dues.units.length, amount: dues.units.reduce((s, u) => s + (Number(u.owner) || 0), 0), detail: `Opening balances as on 30 Sep 2026 for ${dues.units.length} units${includeOctober ? ', with the October 2026 bill' : ''}` });
  await rebuildPublicDues(fb, dues.blocks);

  if (includeOctober) {
    const settings = await loadBilling(fb);
    const o = OCTOBER_2026_BILL;
    for (const [i, u] of dues.units.entries()) {
      // October bill carries only the one-off Rs 6,500, not the monthly rates.
      await generateBill(fb, u.id, {
        monthKey: o.month, billDate: o.billDate, dueDate: '', extras: o.extras,
        settings: { ...settings, method: 'agm', mmc: {}, categories: [], interestRatePA: 0, sinkingPct: 0, repairsPct: 0, nonOccupancyPct: 0 }, periodFrom: o.periodFrom, periodTo: o.periodTo, source: 'import'
      });
      onProgress(dues.units.length + i + 1, dues.units.length * 2);
    }
    await markBilled(fb, o.month, dues.units.length);
  }
}

/* ---------- financial-year reports ---------- */

/** Every unit's ledger entries: { unitId: [entries sorted by date] } */
export async function loadAllLedgers({ F, db }, units) {
  const lists = await Promise.all(units.map((u) => F.getDocs(F.collection(db, 'units', u.id, 'ledger'))));
  const out = {};
  units.forEach((u, i) => {
    out[u.id] = lists[i].docs.map((d) => d.data())
      .sort((a, b) => a.date.localeCompare(b.date) || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  });
  return out;
}

/**
 * Member-wise statement for a financial year, like the Sundry Debtors group summary:
 * opening (all entries before 1 April, plus opening balances taken over during the year),
 * billed, payments, cancelled receipts, corrections, closing on 31 March.
 */
export function fyStatement(units, ledgers, fy) {
  const { from, to } = fyBounds(fy);
  const rows = units.map((u) => {
    const r = { id: u.id, unit: u.unit, block: u.block, name: u.name || '', opening: 0, billed: 0, received: 0, reversed: 0, adjDebit: 0, adjCredit: 0 };
    for (const e of ledgers[u.id] || []) {
      const net = (e.debit || 0) - (e.credit || 0);
      if (e.date < from || (e.kind === 'opening' && e.date <= to)) { r.opening += net; continue; }
      if (e.date > to) continue;
      if (e.kind === 'bill') r.billed += e.debit || 0;
      else if (e.kind === 'payment') r.received += e.credit || 0;
      else if (e.kind === 'reversal') r.reversed += e.debit || 0;
      else { r.adjDebit += e.debit || 0; r.adjCredit += e.credit || 0; }
    }
    r.closing = r.opening + r.billed + r.reversed + r.adjDebit - r.received - r.adjCredit;
    return r;
  });
  const total = rows.reduce((t, r) => {
    for (const k of ['opening', 'billed', 'received', 'reversed', 'adjDebit', 'adjCredit', 'closing']) t[k] = (t[k] || 0) + r[k];
    return t;
  }, {});
  return { fy, from, to, rows, total };
}

export async function fyBills({ F, db }, fy) {
  const { months } = fyBounds(fy);
  const snap = await F.getDocs(F.query(F.collection(db, 'bills'), F.where('month', '>=', months[0]), F.where('month', '<=', months[11])));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fyPayments({ F, db }, fy) {
  const { from, to } = fyBounds(fy);
  const snap = await F.getDocs(F.query(F.collection(db, 'payments'), F.where('date', '>=', from), F.where('date', '<=', to)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Freezes the year: stores the closing statement and stops entries dated on or before 31 March of that year. */
export async function closeFinancialYear(fb, statement, note) {
  const { F, db, auth } = fb;
  await F.setDoc(F.doc(db, 'fyClosing', statement.fy), {
    fy: statement.fy, from: statement.from, to: statement.to, total: statement.total,
    units: statement.rows.map((r) => ({ id: r.id, unit: r.unit, name: r.name, opening: r.opening, closing: r.closing })),
    note: note || '', closedAt: F.serverTimestamp(), closedBy: auth.currentUser.uid, status: 'closed'
  });
  await F.setDoc(F.doc(db, 'settings', 'billing'), { lockedUpTo: statement.to }, { merge: true });
  await auditNow(fb, { action: 'fy.close', amount: round(statement.total?.closing), refNo: statement.fy, reason: note || '', detail: `${statement.fy} closed; entries up to ${statement.to} locked; ${statement.rows.length} units, closing ₹${round(statement.total?.closing)}` });
}

/** prevLock = lock date to go back to (end of the last year that stays closed, or '' if none). */
export async function reopenFinancialYear(fb, fy, reason, prevLock) {
  const { F, db, auth } = fb;
  const prevEnd = prevLock || '';
  await F.setDoc(F.doc(db, 'fyClosing', fy), { status: 'reopened', reopenReason: reason, reopenedAt: F.serverTimestamp(), reopenedBy: auth.currentUser.uid }, { merge: true });
  await F.setDoc(F.doc(db, 'settings', 'billing'), { lockedUpTo: prevEnd }, { merge: true });
  await auditNow(fb, { action: 'fy.reopen', refNo: fy, reason, detail: `${fy} reopened; locked up to ${prevEnd || 'nothing'}` });
}

/* ---------- Tally ledger history (1 Apr 2018 to the takeover date) ---------- */

export const TAKEOVER_DATE = '2026-09-30';

/** Saves each unit's Tally ledger (up to the takeover date) to units/{id}/history/tally. */
export async function importTallyHistory(fb, data, units, onProgress = () => {}) {
  const { F, db, auth } = fb;
  const take = data.takeoverDate || TAKEOVER_DATE;
  const done = [], missing = [], diffs = [];
  for (const [i, u] of units.entries()) {
    const h = data.units?.[u.id];
    onProgress(i + 1, units.length);
    if (!h) { missing.push(u.unit); continue; }
    const entries = h.entries.filter((e) => e.date <= take);
    const after = h.entries.filter((e) => e.date > take);
    await F.setDoc(F.doc(db, 'units', u.id, 'history', 'tally'), {
      source: data.source || 'Tally', file: h.file || '', period: h.period || '', takeoverDate: take,
      opening: h.opening, entries, after, balanceAtTakeover: h.balanceAtTakeover,
      importedAt: F.serverTimestamp(), importedBy: auth.currentUser.uid
    });
    done.push(u.unit);
  }
  await auditNow(fb, { action: 'tally.import', count: done.length, detail: `Tally history up to ${take} saved for ${done.length} units${missing.length ? `; not in the file: ${missing.slice(0, 20).join(', ')}` : ''}` });
  return { done, missing, diffs };
}

/**
 * One ledger for a unit: the Tally history up to the takeover date, then the new accounts.
 * The new accounts' "opening balance" entry is replaced by the Tally history; if the two balances
 * differ, a "difference" line keeps the final balance equal to the unit's balance today.
 */
/**
 * One ledger for a unit, oldest first:
 *   pre      – 2011-12 to 2017-18 from the audited balances and the past committee's receipts (optional, see pastreceipts.js)
 *   history  – Tally ledger up to the takeover date (optional)
 *   live     – these accounts
 * Where two sources meet and their balances differ, a "difference" line (marked Check) keeps the running balance
 * continuous, so the ledger always ends at the unit's balance today.
 */
export function mergeLedger(live, history, pre) {
  if (!history && !pre?.entries?.length) return live;
  const out = [...(pre?.entries || [])];
  const preEnd = pre ? pre.endBalance || 0 : 0;
  const fmtR = (n) => `₹ ${new Intl.NumberFormat('en-IN').format(Math.abs(n))}${n < 0 ? ' Cr' : ''}`;
  const bridge = (date, amount, text) => {
    const d = Math.round(amount * 100) / 100;
    if (Math.abs(d) >= 0.5) out.push({ date, particulars: text, receipt: '', debit: d > 0 ? d : 0, credit: d < 0 ? -d : 0, kind: 'opening', source: 'difference' });
  };
  if (history) {
    const take = history.takeoverDate || TAKEOVER_DATE;
    const a = history.opening?.amount || 0, od = history.opening?.date || '2018-04-01';
    if (pre) {
      // Tally is the book of record from 1 April 2018, so any difference with the audit is placed on that date
      // (reports from 2018-19 onwards then follow Tally exactly).
      const start = od > '2018-04-01' ? '2018-04-01' : od;
      bridge(start, a - preEnd, `Difference: Tally ${od > '2018-04-01' ? `ledger starts on ${od.split('-').reverse().join('/')} at` : 'opening'} ${fmtR(a)} vs audited balance ${fmtR(preEnd)} on 31/03/2018`);
    } else if (a) {
      out.push({ date: od, particulars: 'Opening balance (Tally)', receipt: '', debit: a > 0 ? a : 0, credit: a < 0 ? -a : 0, kind: 'opening', source: 'tally' });
    }
    for (const e of history.entries || []) {
      const kind = e.vchType === 'Receipt' && e.credit ? 'payment' : e.vchType === 'Journal' && e.debit ? 'bill' : 'adjustment';
      out.push({
        date: e.date, particulars: `${e.particulars}${e.vchType ? ` (${e.vchType} ${e.vchNo || ''})`.replace(' )', ')') : ''}`,
        receipt: e.vchType === 'Receipt' ? `Tally ${e.vchNo}` : '', debit: e.debit || 0, credit: e.credit || 0, kind, source: 'tally'
      });
    }
    const takenOver = live.filter((e) => e.kind === 'opening').reduce((t, e) => t + (e.debit || 0) - (e.credit || 0), 0);
    const diff = Math.round(takenOver - (history.balanceAtTakeover || 0));
    if (diff) {
      out.push({ date: take, particulars: `Difference: opening balance taken over ₹ ${takenOver} vs Tally ₹ ${history.balanceAtTakeover} on ${take}`,
        receipt: '', debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0, kind: 'adjustment', source: 'difference' });
    }
    out.push(...live.filter((e) => e.kind !== 'opening'));
  } else {
    // No Tally ledger: the balance taken over by these accounts follows straight on from 31 March 2018.
    const opening = live.filter((e) => e.kind === 'opening');
    const takenOver = opening.reduce((t, e) => t + (e.debit || 0) - (e.credit || 0), 0);
    const od = opening[0]?.date || TAKEOVER_DATE;
    bridge(od, takenOver - preEnd, `Change between 31/03/2018 (audited ${fmtR(preEnd)}) and the balance taken over on ${od.split('-').reverse().join('/')} (${fmtR(takenOver)}); no ledger for this period`);
    out.push(...live.filter((e) => e.kind !== 'opening'));
  }
  const rank = (e) => (e.source === 'archive' || e.source === 'audit' ? 0 : e.source === 'difference' && e.kind === 'opening' ? 1 : e.source === 'tally' ? 2 : 3);
  return out.sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b)
    || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
}

export async function loadHistory({ F, db }, unitId) {
  const s = await F.getDoc(F.doc(db, 'units', unitId, 'history', 'tally')).catch(() => null);
  return s?.exists() ? s.data() : null;
}

/** Live ledgers merged with Tally history, for every unit. */
/**
 * Live ledgers merged with Tally history and, when given, the 2011–2018 section
 * (pre = { unitId: preLedger(...) } from pastreceipts.js).
 */
export async function loadMergedLedgers(fb, units, pre = {}) {
  const [live, hist] = await Promise.all([loadAllLedgers(fb, units), Promise.all(units.map((u) => loadHistory(fb, u.id)))]);
  const out = {}, histories = {};
  units.forEach((u, i) => { histories[u.id] = hist[i]; out[u.id] = mergeLedger(live[u.id] || [], hist[i], pre[u.id] || null); });
  return { ledgers: out, histories };
}

/* ---------- full Tally migration (export from the accountant's laptop) ---------- */

/** Unit id from a Tally ledger name such as "C 402 Mr Chanchal Sakarde", "B-01 Rehana", "GF 05 …", "D 101 A …". */
export function unitIdFromLedger(name) {
  const m = String(name || '').toUpperCase().match(/^\s*(GF|A|B|C|D)\s*-?\s*0*(\d{1,3})\s*(?:([AB])(?![A-Z]))?(?![0-9])/);
  if (!m) return null;
  const [, pre, n, suf] = m;
  return pre === 'B' || pre === 'GF' ? `${pre}-${String(Number(n)).padStart(2, '0')}` : `${pre}-${Number(n)}${suf || ''}`;
}

/** Groups under which a ledger sits, nearest first (e.g. ["Sundry Debtors", "Current Assets"]). */
export function groupChain(groups, parent) {
  const byName = Object.fromEntries((groups || []).map((g) => [g.name, g]));
  const out = [];
  let p = parent;
  while (p && byName[p] && !out.includes(p)) { out.push(p); p = byName[p].parent; }
  if (p && !out.includes(p)) out.push(p);
  return out;
}

/** Suggested ledger → unit mapping: member ledgers and builder-pending (BPM) ledgers. */
export function suggestMapping(exp, units) {
  const ids = new Set(units.map((u) => u.id));
  return exp.ledgers.map((l) => {
    const chain = groupChain(exp.groups, l.parent);
    const uid = unitIdFromLedger(l.name);
    const isBpm = /\bBPM\b|BUILDER PENDING/i.test(l.name) || chain.some((g) => /builder pending/i.test(g));
    const debtor = chain.some((g) => /sundry debtors/i.test(g));
    return { ledger: l.name, parent: l.parent, chain, closing: l.closing, unit: uid && ids.has(uid) ? uid : '', kind: isBpm ? 'bpm' : (uid || debtor) ? 'member' : 'other' };
  }).filter((m) => m.kind !== 'other');
}

/** Per-unit histories (same shape as importTallyHistory expects) from the full export. */
export function historiesFromExport(exp, mapping, cutoff) {
  const ledgerOf = Object.fromEntries(mapping.filter((m) => m.kind === 'member' && m.unit).map((m) => [m.ledger, m.unit]));
  const byLedger = Object.fromEntries(exp.ledgers.map((l) => [l.name, l]));
  const units = {};
  // A unit can have more than one Tally ledger (e.g. a previous owner's account): they are combined.
  for (const [ledger, uid] of Object.entries(ledgerOf)) {
    const l = byLedger[ledger];
    const op = Math.round((l?.opening || 0) * 100) / 100;
    if (units[uid]) { units[uid].title += ` + ${ledger}`; units[uid].opening.amount = Math.round((units[uid].opening.amount + op) * 100) / 100; continue; }
    units[uid] = { file: 'Tally export', title: ledger, period: `${exp.fromDate} to ${exp.toDate}`,
      opening: { date: exp.booksFrom || exp.fromDate, amount: op }, entries: [] };
  }
  for (const v of exp.vouchers) {
    for (const ln of v.lines) {
      const uid = ledgerOf[ln.ledger];
      if (!uid) continue;
      const others = v.lines.filter((x) => x.ledger !== ln.ledger).map((x) => x.ledger);
      if (ledgerOf[ln.ledger] && others.length && others.every((o) => ledgerOf[o] === uid)) {
        // transfer between two ledgers of the same unit: keep it, it nets to zero
      }
      units[uid].entries.push({ date: v.date, particulars: others.join(' / ') || v.narration || v.type,
        vchType: v.type, vchNo: v.number, debit: ln.debit, credit: ln.credit, narration: v.narration || '' });
    }
  }
  for (const u of Object.values(units)) {
    u.entries.sort((a, b) => a.date.localeCompare(b.date));
    u.balanceAtTakeover = Math.round((u.opening.amount + u.entries.filter((e) => e.date <= cutoff).reduce((a, e) => a + e.debit - e.credit, 0)) * 100) / 100;
  }
  return { source: `Tally export from ${exp.computer || 'accountant laptop'} on ${String(exp.exportedAt).slice(0, 10)} (${exp.company})`, takeoverDate: cutoff, units };
}

/** Keeps the whole Tally books (groups, ledgers, every voucher) as a read-only archive. */
export async function saveTallyArchive(fb, exp, onProgress = () => {}) {
  const { F, db, auth } = fb;
  const CHUNK = 1500;
  const parts = Math.ceil(exp.vouchers.length / CHUNK);
  for (let i = 0; i < parts; i++) {
    const vs = exp.vouchers.slice(i * CHUNK, (i + 1) * CHUNK).map((v) => ({
      d: v.date, t: v.type || '', n: v.number || '', r: v.narration || '', l: v.lines.map((x) => ({ g: x.ledger, d: x.debit || 0, c: x.credit || 0 }))
    }));
    await F.setDoc(F.doc(db, 'tallyArchive', `vouchers-${String(i).padStart(3, '0')}`), { part: i, vouchers: vs });
    onProgress(i + 1, parts);
  }
  await F.setDoc(F.doc(db, 'tallyArchive', 'meta'), {
    company: exp.company, booksFrom: exp.booksFrom || '', fromDate: exp.fromDate, toDate: exp.toDate, exportedAt: exp.exportedAt,
    check: exp.check || {}, parts, groups: exp.groups.map((g) => ({ name: g.name, parent: g.parent || '' })),
    ledgers: exp.ledgers.map((l) => ({ name: l.name, parent: l.parent || '', opening: l.opening || 0, closing: l.closing || 0 })),
    savedAt: F.serverTimestamp(), savedBy: auth.currentUser.uid
  });
}

export async function loadTallyArchive({ F, db }) {
  const meta = await F.getDoc(F.doc(db, 'tallyArchive', 'meta')).catch(() => null);
  if (!meta?.exists()) return null;
  const m = meta.data();
  const parts = await Promise.all(Array.from({ length: m.parts || 0 }, (_, i) => F.getDoc(F.doc(db, 'tallyArchive', `vouchers-${String(i).padStart(3, '0')}`))));
  return { ...m, vouchers: parts.flatMap((p) => (p.exists() ? p.data().vouchers : [])) };
}
