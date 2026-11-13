// Accounting operations (browser, Firebase modular SDK). Every money movement runs in a
// Firestore transaction that updates the unit's running balance and its ledger together.

import {
  computeBill, billNumber, billId, monthBounds, financialYear, receiptNumber, round, monthLabel, todayIST,
  categoryIdFor, liftGroupFor, liftExpenseEndMonth, buildContext, prepareExtras, extrasForUnit, maskedDues
} from './billing-core.js';
import { DEFAULT_BILLING, DEFAULT_SITE, OCTOBER_2026_BILL } from './defaults.js';

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
    tx.set(billRef, bill);
    tx.set(F.doc(F.collection(db, 'units', unitId, 'ledger')), {
      date: billDate, particulars: `Bill ${bill.billNo} for ${monthLabel(monthKey)}`, receipt: '',
      debit: calc.current, credit: 0, kind: 'bill', ref: billRef.id,
      createdAt: F.serverTimestamp(), createdBy: bill.createdBy
    });
    tx.update(unitRef, {
      balance: newBalance, interestDue: Math.max(0, round(unit.interestDue)) + calc.interest,
      lastBillId: billRef.id, updatedAt: F.serverTimestamp()
    });
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
  const made = [], skipped = [], failed = [];
  for (const [i, u] of units.entries()) {
    try {
      const extras = extrasForUnit(prepared, u);
      const b = await generateBill(fb, u.id, { ...opts, extras, liftExpenses, ctx });
      (b ? made : skipped).push(u.unit);
    } catch (err) {
      failed.push({ unit: u.unit, error: err.message || String(err) });
    }
    onProgress(i + 1, units.length);
  }
  if (made.length) await markBilled(fb, opts.monthKey, made.length);
  return { made, skipped, failed };
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
    createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
  });
  return { id: ref.id, units: served.length };
}

export async function deleteLiftExpense(fb, exp, lastBilledMonth) {
  if (lastBilledMonth && exp.startMonth <= lastBilledMonth) {
    throw new Error('This expense is already on generated bills. Correct individual units under Units → Add a correction instead.');
  }
  await fb.F.deleteDoc(fb.F.doc(fb.db, 'liftExpenses', exp.id));
}

/* ---------- payments and receipts ---------- */

export async function recordPayment(fb, p) {
  const { F, db, auth } = fb;
  const amount = round(p.amount);
  if (!(amount > 0)) throw new Error('Enter an amount greater than zero.');
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
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    };
    tx.set(counterRef, { next: seq + 1 });
    tx.set(payRef, payment);
    tx.set(F.doc(F.collection(db, 'units', p.unitId, 'ledger')), {
      date: p.date, particulars: `Payment received – ${p.mode}${p.reference ? ' ' + p.reference : ''}`,
      receipt: receiptNo, debit: 0, credit: amount, kind: 'payment', ref: payRef.id,
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, interestDue: Math.max(0, round(unit.interestDue)) - interestCleared, updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
    return { id: payRef.id, ...payment };
  });
}

/** Cancels a receipt (bounced cheque, wrong entry). The receipt stays on record, marked cancelled. */
export async function cancelPayment(fb, paymentId, reason) {
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
    tx.update(payRef, { status: 'cancelled', cancelReason: reason || '', cancelledAt: F.serverTimestamp(), cancelledBy: auth.currentUser.uid });
    tx.set(F.doc(F.collection(db, 'units', pay.unitId, 'ledger')), {
      date: todayIST(), particulars: `Receipt ${pay.receiptNo} cancelled${reason ? ' – ' + reason : ''}`,
      receipt: pay.receiptNo, debit: pay.amount, credit: 0, kind: 'reversal', ref: paymentId,
      createdAt: F.serverTimestamp(), createdBy: auth.currentUser.uid
    });
    tx.update(unitRef, { balance: after, interestDue: Math.max(0, round(unit.interestDue)) + (pay.interestCleared || 0), updatedAt: F.serverTimestamp() });
    patchPublic(tx, F, pubRef, pubSnap, { ...unit, balance: after });
  });
}

/** Manual correction to a unit's account (debit adds to dues, credit reduces them). */
export async function addAdjustment(fb, unitId, e) {
  const { F, db, auth } = fb;
  const debit = round(e.debit), credit = round(e.credit);
  const unitRef = F.doc(db, 'units', unitId);
  const pubRef = F.doc(db, 'private', 'dues');
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
  await rebuildPublicDues(fb, blocks);
  return id;
}

/** Saves carpet area, inlets, vehicles and lift for many units at once. rows: [{ id, ...fields }] */
export async function saveUnitMeasurements(fb, rows) {
  const { F, db } = fb;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const { id, ...fields } of rows.slice(i, i + 400)) batch.update(F.doc(db, 'units', id), { ...fields, updatedAt: F.serverTimestamp() });
    await batch.commit();
  }
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
  if (dues.openingRemoved) throw new Error('The opening balances were removed from the website files for privacy. Restore data/dues.json from GitHub history (version 2.6.2) to import again.');

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
