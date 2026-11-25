// 3.34: the activity trail (auditLog). Every change to money in the accounts — receipts, cancellations, bills,
// corrections, charges, interest, unit rates and details, billing settings, year closing — writes one permanent entry:
// who (name, role, committee / staff), when (server time), what, which unit, the amount, the balance before and after,
// the records it made and the reason. Entries can't be changed or deleted by anyone through the website (see the rules).
// Money changes write their entry in the same transaction as the change, so one can't happen without the other; when
// the committee turns on "Require an entry", the rules refuse a balance change that has no entry.

import { SITE_VERSION } from './firebase.js';

let actor = { name: '', role: '', kind: '' };
/** Who is working (the admins record of the signed-in person). Called by the accounts page after sign-in. */
export function setAuditActor(me) {
  actor = { name: String(me?.name || me?.email || '').slice(0, 80), role: String(me?.role || '').slice(0, 60), kind: me?.kind === 'staff' ? 'staff' : 'committee' };
}

/** What each action is called, and its group (for the filters). */
export const ACTIONS = {
  'payment.record': ['Receipt issued', 'payments'],
  'payment.cancel': ['Receipt cancelled', 'payments'],
  'claim.decide': ['Reported payment decided', 'payments'],
  'bill.generate': ['Bill generated', 'bills'],
  'bill.month': ['Monthly bills generated', 'bills'],
  'charge.reverse': ['Charge taken off a bill', 'bills'],
  'bill.note': ['Revised-bill note shown or hidden', 'bills'],
  'correction': ['Correction to a unit account', 'corrections'],
  'charge.debit': ['Charge debited to a unit', 'corrections'],
  'charge.add': ['Charges put on a coming bill', 'corrections'],
  'charge.cancel': ['Coming charges cancelled', 'corrections'],
  'interest.run': ['Interest on past arrears calculated', 'corrections'],
  'interest.cancel': ['Interest calculation cancelled', 'corrections'],
  'balance.fix': ['Balance set to the ledger total', 'corrections'],
  'pastReceipt.edit': ['Old receipt (2011–2016) corrected or checked', 'corrections'],
  'pastReceipt.add': ['Old receipt (2011–2016) added', 'corrections'],
  'undo': ['Mistake corrected from the activity trail', 'corrections'],
  'unit.add': ['Unit added', 'units'],
  'unit.edit': ['Unit details or rates changed', 'units'],
  'unit.delete': ['Unit deleted', 'units'],
  'unit.measurements': ['Areas, inlets, vehicles, lifts saved', 'units'],
  'lift.add': ['Lift expense added', 'units'],
  'lift.delete': ['Lift expense deleted', 'units'],
  'settings.billing': ['Billing settings or rates changed', 'settings'],
  'audit.setting': ['Activity trail setting changed', 'settings'],
  'opening.import': ['Opening balances imported', 'settings'],
  'tally.import': ['Tally history imported', 'settings'],
  'fy.close': ['Financial year closed', 'settings'],
  'fy.reopen': ['Financial year reopened', 'settings']
};
export const GROUPS = { payments: 'Receipts and payments', bills: 'Bills', corrections: 'Corrections, charges, interest', units: 'Units, rates, lift', settings: 'Settings, imports, year closing' };
export const actionLabel = (a) => ACTIONS[a]?.[0] || a;
export const actionGroup = (a) => ACTIONS[a]?.[1] || 'settings';

const cut = (s, n) => String(s ?? '').slice(0, n);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined);
const inApp = () => typeof window !== 'undefined' && Boolean(window.SSApp);

/** A field-by-field list of what changed between two objects (only the keys of `after`). */
export function diffFields(before = {}, after = {}, keys = Object.keys(after)) {
  const show = (v) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return keys.filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null))
    .slice(0, 40).map((k) => ({ field: cut(k, 60), from: cut(show(before?.[k]), 300), to: cut(show(after?.[k]), 300) }));
}

/** The entry as stored. a: { action, unitId, unit, amount, debit, credit, balanceBefore, balanceAfter, refs, refNo, reason, detail, changes, count, units, undoOf } */
export function auditData(fb, a) {
  const d = {
    at: fb.F.serverTimestamp(), by: fb.auth.currentUser?.uid || '', byName: actor.name, byRole: actor.role, byKind: actor.kind,
    action: cut(a.action, 40), where: inApp() ? 'app' : 'web', siteVersion: SITE_VERSION
  };
  if (a.unitId) { d.unitId = cut(a.unitId, 40); d.unit = cut(a.unit || a.unitId, 40); }
  for (const k of ['amount', 'debit', 'credit', 'balanceBefore', 'balanceAfter', 'count']) { const v = num(a[k]); if (v !== undefined) d[k] = v; }
  if (a.refs && Object.keys(a.refs).length) d.refs = Object.fromEntries(Object.entries(a.refs).filter(([, v]) => v).map(([k, v]) => [cut(k, 30), Array.isArray(v) ? v.slice(0, 500).map((x) => cut(x, 60)) : cut(v, 120)]));
  if (a.refNo) d.refNo = cut(a.refNo, 60);
  if (a.reason) d.reason = cut(a.reason, 300);
  if (a.detail) d.detail = cut(a.detail, 600);
  if (a.changes?.length) d.changes = a.changes.slice(0, 40);
  if (a.units?.length) d.units = a.units.slice(0, 500).map((x) => cut(x, 20));
  if (a.undoOf) d.undoOf = cut(a.undoOf, 60);
  return d;
}

/** Writes the entry inside a transaction or batch (same commit as the change). Returns its id. */
export function auditIn(tx, fb, a) {
  const ref = fb.F.doc(fb.F.collection(fb.db, 'auditLog'));
  tx.set(ref, auditData(fb, a));
  return ref.id;
}
/** A new entry id, for a change that must point at its entry (unit balance: auditId). */
export function newAuditRef(fb) { return fb.F.doc(fb.F.collection(fb.db, 'auditLog')); }

/** Writes the entry on its own (for changes made outside a transaction). Never stops the work if it fails. */
export async function auditNow(fb, a) {
  try { const ref = newAuditRef(fb); await fb.F.setDoc(ref, auditData(fb, a)); return ref.id; } catch (e) { console.warn('activity trail', e); return ''; }
}

/* ---------- reading ---------- */

export async function loadAudit({ F, db }, max = 3000) {
  const snap = await F.getDocs(F.query(F.collection(db, 'auditLog'), F.orderBy('at', 'desc'), F.limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
/** All entries of one unit (no index needed: one equality filter, sorted here). */
export async function loadUnitAudit({ F, db }, unitId) {
  const snap = await F.getDocs(F.query(F.collection(db, 'auditLog'), F.where('unitId', '==', unitId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.at) - ms(a.at));
}
export const ms = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : 0);

/** Which entries were corrected later: id → the correcting entry. */
export function undoneMap(list) {
  const m = {};
  for (const e of list) if (e.undoOf) m[e.undoOf] = e;
  return m;
}

/**
 * How a mistaken entry can be put right from the trail:
 *  cancelReceipt — a receipt issued by mistake: cancel it (the receipt stays, marked cancelled);
 *  opposite      — a correction or a debited charge or a bill amount: post the opposite entry on the unit's account;
 *  takeOff       — a charge on a bill: take it off the bill (revised bill);
 *  cancelPending — charges waiting for a coming bill: cancel those still waiting.
 */
export function fixFor(e) {
  if (e.undoOf || !e.action) return null;
  if (e.action === 'payment.record' && e.refs?.payment) return { how: 'cancelReceipt', perm: 'cancelReceipts', label: 'Cancel this receipt' };
  if ((e.action === 'correction' || e.action === 'charge.debit') && e.unitId && ((e.debit || 0) > 0 || (e.credit || 0) > 0)) return { how: 'opposite', perm: 'corrections', label: 'Reverse with an opposite entry' };
  if (e.action === 'bill.generate' && e.unitId && (e.debit || 0) > 0) return { how: 'opposite', perm: 'committee', label: 'Credit this bill’s amount back' };
  if (e.action === 'charge.add' && e.refs?.adjustments?.length) return { how: 'cancelPending', perm: 'corrections', label: 'Cancel those still waiting' };
  return null;
}

/** Units whose balance differs from the total of their ledger entries (a change made without its ledger entry). */
export function balanceMismatches(units, ledgers) {
  const out = [];
  for (const u of units) {
    const rows = (ledgers[u.id] || []).filter((r) => r.kind !== 'memo');
    const total = Math.round(rows.reduce((s, r) => s + (Number(r.debit) || 0) - (Number(r.credit) || 0), 0) * 100) / 100;
    const bal = Math.round((Number(u.balance) || 0) * 100) / 100;
    if (Math.abs(total - bal) >= 0.5) out.push({ id: u.id, unit: u.unit, name: u.name || '', balance: bal, ledger: total, diff: Math.round((bal - total) * 100) / 100 });
  }
  return out;
}

export function auditCsv(list, unitLabel = (x) => x) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['When', 'Who', 'Role', 'Committee/staff', 'What', 'Unit', 'Amount', 'Debit', 'Credit', 'Balance before', 'Balance after', 'Receipt/bill', 'Reason', 'Details', 'Changes', 'Corrects entry', 'App/website', 'Software', 'Entry id'];
  const rows = list.map((e) => [new Date(ms(e.at)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), e.byName, e.byRole, e.byKind, actionLabel(e.action), e.unit ? unitLabel(e.unit) : '',
    e.amount ?? '', e.debit ?? '', e.credit ?? '', e.balanceBefore ?? '', e.balanceAfter ?? '', e.refNo || '', e.reason || '', e.detail || '',
    (e.changes || []).map((c) => `${c.field}: ${c.from} → ${c.to}`).join('; '), e.undoOf || '', e.where || '', e.siteVersion || '', e.id]);
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
