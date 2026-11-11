// Accounting operations (browser, Firebase modular SDK). Every money movement runs in a
// Firestore transaction that updates the unit's running balance and its ledger together.

import {
  computeBill, billNumber, billId, monthBounds, financialYear, receiptNumber, round, monthLabel, todayIST
} from './billing-core.js';
import { DEFAULT_BILLING, DEFAULT_SITE, OCTOBER_2026_BILL } from './defaults.js';

/* ---------- reads ---------- */

export async function loadBilling({ F, db }) {
  const s = await F.getDoc(F.doc(db, 'settings', 'billing'));
  return s.exists() ? { ...DEFAULT_BILLING, ...s.data() } : { ...DEFAULT_BILLING };
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

export async function rebuildPublicDues(fb, blocks) {
  const { F, db } = fb;
  const units = await loadUnits(fb);
  const prev = await F.getDoc(F.doc(db, 'public', 'dues'));
  await F.setDoc(F.doc(db, 'public', 'dues'), {
    statement: 'Society maintenance ledger',
    asOn: todayIST(),
    blocks: blocks || (prev.exists() ? prev.data().blocks : []),
    units: units.map(publicRow),
    updatedAt: F.serverTimestamp()
  });
}

function publicRow(u) {
  return {
    id: u.id, unit: u.unit, block: u.block, name: u.name || '', type: u.type,
    owner: round(u.balance), bpm: u.bpm ?? null, ...(u.unverified ? { verify: true } : {})
  };
}

/** Patches one unit's row inside public/dues within a running transaction (read must already be done). */
function patchPublic(tx, F, pubRef, pubSnap, unit) {
  if (!pubSnap.exists()) return;
  const data = pubSnap.data();
  const units = data.units.map((r) => (r.id === unit.id ? publicRow(unit) : r));
  tx.update(pubRef, { units, asOn: todayIST(), updatedAt: F.serverTimestamp() });
}

/* ---------- bills ---------- */

/**
 * Creates one unit's bill for a month. Skips (returns null) if that bill already exists,
 * so running it twice never double-bills.
 */
export async function generateBill(fb, unitId, opts) {
  const { F, db, auth } = fb;
  const { monthKey, billDate, dueDate, extras = [], settings, periodFrom, periodTo, source = 'admin' } = opts;
  const unitRef = F.doc(db, 'units', unitId);
  const billRef = F.doc(db, 'bills', billId(unitId, monthKey));
  const pubRef = F.doc(db, 'public', 'dues');

  return F.runTransaction(db, async (tx) => {
    const [unitSnap, billSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(billRef), tx.get(pubRef)]);
    if (billSnap.exists()) return null;
    if (!unitSnap.exists()) throw new Error(`Unit ${unitId} not found`);
    const unit = { id: unitId, ...unitSnap.data() };
    if (unit.active === false) return null;

    const calc = computeBill({ unit, settings, extras });
    const bounds = monthBounds(monthKey);
    const bill = {
      billNo: billNumber(unit.unit, billDate),
      unitId, unit: unit.unit, block: unit.block, name: unit.name || '', type: unit.type, status: unit.status || '',
      month: monthKey, billDate, dueDate: dueDate || '',
      periodFrom: periodFrom || bounds.from, periodTo: periodTo || bounds.to,
      arrears: calc.arrears, lines: calc.lines, current: calc.current, total: calc.total,
      unverified: Boolean(unit.unverified),
      source, createdAt: F.serverTimestamp(), createdBy: auth.currentUser?.uid || source
    };
    const newBalance = calc.arrears + calc.current;
    tx.set(billRef, bill);
    tx.set(F.doc(F.collection(db, 'units', unitId, 'ledger')), {
      date: billDate, particulars: `Bill ${bill.billNo} for ${monthLabel(monthKey)}`, receipt: '',
      debit: calc.current, credit: 0, kind: 'bill', ref: billRef.id,
      createdAt: F.serverTimestamp(), createdBy: bill.createdBy
    });
    tx.update(unitRef, { balance: newBalance, lastBillId: billRef.id, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: newBalance });
    return bill;
  });
}

export async function generateMonth(fb, opts, onProgress = () => {}) {
  const units = (await loadUnits(fb)).filter((u) => u.active !== false);
  const made = [], skipped = [], failed = [];
  for (const [i, u] of units.entries()) {
    try {
      const extras = opts.extrasBlock && opts.extrasBlock !== 'all' && u.block !== opts.extrasBlock ? [] : opts.extras;
      const b = await generateBill(fb, u.id, { ...opts, extras });
      (b ? made : skipped).push(u.unit);
    } catch (err) {
      failed.push({ unit: u.unit, error: err.message || String(err) });
    }
    onProgress(i + 1, units.length);
  }
  if (made.length) {
    await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'billing'),
      { lastRun: { month: opts.monthKey, at: fb.F.serverTimestamp(), count: made.length } }, { merge: true });
  }
  return { made, skipped, failed };
}

/* ---------- payments and receipts ---------- */

export async function recordPayment(fb, p) {
  const { F, db, auth } = fb;
  const amount = round(p.amount);
  if (!(amount > 0)) throw new Error('Enter an amount greater than zero.');
  const fy = financialYear(p.date);
  const unitRef = F.doc(db, 'units', p.unitId);
  const counterRef = F.doc(db, 'counters', `receipts-${fy}`);
  const pubRef = F.doc(db, 'public', 'dues');
  const payRef = F.doc(F.collection(db, 'payments'));

  return F.runTransaction(db, async (tx) => {
    const [unitSnap, counterSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(counterRef), tx.get(pubRef)]);
    if (!unitSnap.exists()) throw new Error('Unit not found.');
    const unit = { id: p.unitId, ...unitSnap.data() };
    const seq = (counterSnap.exists() ? counterSnap.data().next : 1);
    const receiptNo = receiptNumber(fy, seq);
    const before = round(unit.balance);
    const after = before - amount;

    const payment = {
      receiptNo, fy, unitId: p.unitId, unit: unit.unit, block: unit.block, name: unit.name || '',
      date: p.date, amount, mode: p.mode, reference: p.reference || '', bank: p.bank || '', note: p.note || '',
      billNo: p.billNo || '', balanceBefore: before, balanceAfter: after, status: 'ok',
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    };
    tx.set(counterRef, { next: seq + 1 });
    tx.set(payRef, payment);
    tx.set(F.doc(F.collection(db, 'units', p.unitId, 'ledger')), {
      date: p.date, particulars: `Payment received – ${p.mode}${p.reference ? ' ' + p.reference : ''}`,
      receipt: receiptNo, debit: 0, credit: amount, kind: 'payment', ref: payRef.id,
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
    return { id: payRef.id, ...payment };
  });
}

/** Cancels a receipt (bounced cheque, wrong entry). The receipt stays on record, marked cancelled. */
export async function cancelPayment(fb, paymentId, reason) {
  const { F, db, auth } = fb;
  const payRef = F.doc(db, 'payments', paymentId);
  const pubRef = F.doc(db, 'public', 'dues');
  return F.runTransaction(db, async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists()) throw new Error('Receipt not found.');
    const pay = paySnap.data();
    if (pay.status === 'cancelled') throw new Error('This receipt is already cancelled.');
    const unitRef = F.doc(db, 'units', pay.unitId);
    const [unitSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(pubRef)]);
    const unit = { id: pay.unitId, ...unitSnap.data() };
    const after = round(unit.balance) + pay.amount;
    tx.update(payRef, { status: 'cancelled', cancelReason: reason || '', cancelledAt: F.serverTimestamp(), cancelledBy: auth.currentUser.uid });
    tx.set(F.doc(F.collection(db, 'units', pay.unitId, 'ledger')), {
      date: todayIST(), particulars: `Receipt ${pay.receiptNo} cancelled${reason ? ' – ' + reason : ''}`,
      receipt: pay.receiptNo, debit: pay.amount, credit: 0, kind: 'reversal', ref: paymentId,
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
  });
}

/** Manual correction to a unit's account (debit adds to dues, credit reduces them). */
export async function addAdjustment(fb, unitId, e) {
  const { F, db, auth } = fb;
  const debit = round(e.debit), credit = round(e.credit);
  const unitRef = F.doc(db, 'units', unitId);
  const pubRef = F.doc(db, 'public', 'dues');
  return F.runTransaction(db, async (tx) => {
    const [unitSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(pubRef)]);
    const unit = { id: unitId, ...unitSnap.data() };
    const after = round(unit.balance) + debit - credit;
    tx.set(F.doc(F.collection(db, 'units', unitId, 'ledger')), {
      date: e.date, particulars: e.particulars, receipt: e.receipt || '', debit, credit, kind: 'adjustment',
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, ...(e.clearUnverified ? { unverified: false } : {}), updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after, ...(e.clearUnverified ? { unverified: false } : {}) });
  });
}

export async function updateUnitDetails(fb, unitId, patch) {
  const { F, db } = fb;
  await F.updateDoc(F.doc(db, 'units', unitId), { ...patch, updatedAt: F.serverTimestamp() });
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
      balance: opening, bpm: u.bpm ?? null, unverified: u.owner === null || Boolean(u.verify),
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
  await rebuildPublicDues(fb, dues.blocks);

  if (includeOctober) {
    const settings = await loadBilling(fb);
    const o = OCTOBER_2026_BILL;
    for (const [i, u] of dues.units.entries()) {
      // October bill carries only the one-off Rs 6,500, not the monthly rates.
      await generateBill(fb, u.id, {
        monthKey: o.month, billDate: o.billDate, dueDate: '', extras: o.extras,
        settings: { ...settings, rates: {}, interestRatePA: 0 }, periodFrom: o.periodFrom, periodTo: o.periodTo, source: 'import'
      });
      onProgress(dues.units.length + i + 1, dues.units.length * 2);
    }
  }
}
