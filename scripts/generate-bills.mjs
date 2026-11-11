// Creates the month's maintenance bills for every active unit. Run by .github/workflows/monthly-bills.yml
// on the 1st of each month (06:00 IST), or by hand from the Actions tab.
// Same rules as Admin → Bills: one bill per unit per month, so re-running never double-bills.
//
// Needs the secret FIREBASE_SERVICE_ACCOUNT (the JSON key of a Firebase service account).
// Optional: BILL_MONTH=YYYY-MM to bill a month other than the current one.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  computeBill, billNumber, billId, monthBounds, monthLabel, todayIST, addDays, round
} from '../docs/assets/js/billing-core.js';
import { DEFAULT_BILLING } from '../docs/assets/js/defaults.js';

const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT secret is missing. See README → Monthly bills.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(key)) });
const db = getFirestore();

const monthKey = (process.env.BILL_MONTH || '').trim() || todayIST().slice(0, 7);
if (!/^\d{4}-\d{2}$/.test(monthKey)) { console.error(`BILL_MONTH must look like 2026-12, got "${monthKey}"`); process.exit(1); }

const settingsSnap = await db.doc('settings/billing').get();
const settings = { ...DEFAULT_BILLING, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
const billDate = `${monthKey}-01`;
const dueDate = addDays(billDate, Number(settings.dueDays) || 15);
const bounds = monthBounds(monthKey);

const unitsSnap = await db.collection('units').orderBy('order').get();
if (unitsSnap.empty) { console.error('No units found. Import the opening balances from Admin → Settings first.'); process.exit(1); }

let made = 0, skipped = 0;
const failed = [];

for (const doc of unitsSnap.docs) {
  const unitRef = doc.ref;
  const billRef = db.doc(`bills/${billId(doc.id, monthKey)}`);
  const pubRef = db.doc('public/dues');
  try {
    const created = await db.runTransaction(async (tx) => {
      const [unitSnap, billSnap, pubSnap] = await Promise.all([tx.get(unitRef), tx.get(billRef), tx.get(pubRef)]);
      if (billSnap.exists) return false;
      const unit = { id: doc.id, ...unitSnap.data() };
      if (unit.active === false) return false;

      const calc = computeBill({ unit, settings });
      const bill = {
        billNo: billNumber(unit.unit, billDate), unitId: unit.id, unit: unit.unit, block: unit.block,
        name: unit.name || '', type: unit.type, status: unit.status || '', month: monthKey, billDate, dueDate,
        periodFrom: bounds.from, periodTo: bounds.to, arrears: calc.arrears, lines: calc.lines,
        current: calc.current, total: calc.total, unverified: Boolean(unit.unverified),
        source: 'scheduler', createdAt: FieldValue.serverTimestamp(), createdBy: 'github-actions'
      };
      const newBalance = calc.arrears + calc.current;
      tx.set(billRef, bill);
      tx.set(unitRef.collection('ledger').doc(), {
        date: billDate, particulars: `Bill ${bill.billNo} for ${monthLabel(monthKey)}`, receipt: '',
        debit: calc.current, credit: 0, kind: 'bill', ref: billRef.id,
        createdAt: FieldValue.serverTimestamp(), createdBy: 'github-actions'
      });
      tx.update(unitRef, { balance: newBalance, lastBillId: billRef.id, updatedAt: FieldValue.serverTimestamp() });
      if (pubSnap.exists) {
        const units = pubSnap.data().units.map((r) => (r.id === unit.id ? { ...r, owner: round(newBalance) } : r));
        tx.update(pubRef, { units, asOn: todayIST(), updatedAt: FieldValue.serverTimestamp() });
      }
      return true;
    });
    created ? made++ : skipped++;
  } catch (err) {
    failed.push(`${doc.data().unit}: ${err.message}`);
  }
}

await db.doc('settings/billing').set({ lastRun: { month: monthKey, at: FieldValue.serverTimestamp(), count: made, by: 'github-actions' } }, { merge: true });

console.log(`${monthLabel(monthKey)}: ${made} bills created, ${skipped} already existed or not billed.`);
if (failed.length) {
  console.error(`${failed.length} failed:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
