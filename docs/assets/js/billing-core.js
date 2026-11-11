// Billing rules shared by the admin pages (browser) and scripts/generate-bills.mjs (GitHub Actions).
// No Firebase code here: only calculations, numbering and wording.

/**
 * Bill heads, in printed order. Heads follow the composition of charges in Model Bye-laws 65–67 and
 * Rule 106C (MCS Rules, 1961 as amended in 2026): service charges, funds, water, lift, parking,
 * non-occupancy, interest and other charges approved by the General Body.
 * optional: printed only when the bill has an amount under that head.
 */
export const PARTICULARS = [
  ['maintenance', 'Maintenance / Service Charges'],
  ['sinking', 'Sinking Fund'],
  ['repairs', 'Repairs & Maintenance Fund'],
  ['nonOccupancy', 'Non - Occupancy Charges'],
  ['arrears', 'Arrears'],
  ['interest', 'Penal Interest On Arrears'],
  ['water', 'Water Charges'],
  ['lift', 'Lift Charges'],
  ['liftRepairs', 'Lift AMC / Repairs (shared)', true],
  ['parking', 'Vehicle Parking Charges'],
  ['transferPremium', 'Transfer Premium'],
  ['transferFee', 'Transfer Fee'],
  ['entranceFee', 'Entrance Fee'],
  ['education', 'Education & Training Fund'],
  ['federation', 'Co-op Federation Fund'],
  ['chequeReturn', 'Cheque Return Charges'],
  ['penalty', 'Penalty / Other Charges'],
  ['others', 'Any Others Charges'],
  ['propertyTax', 'Property Tax', true],
  ['insurance', 'Insurance Charges', true],
  ['election', 'Election Fund', true],
  ['majorRepairs', 'Major Repairs Fund', true],
  ['loan', 'Loan Instalment & Interest', true],
  ['leaseRent', 'Lease Rent / N.A. Tax', true]
];
export const LABEL = Object.fromEntries(PARTICULARS.map(([c, l]) => [c, l]));
export const OPTIONAL = new Set(PARTICULARS.filter((p) => p[2]).map((p) => p[0]));

/** Monthly amounts set per charge category in Settings (and overridable per unit). */
export const CATEGORY_MONTHLY = ['maintenance', 'water', 'parking', 'education', 'federation', 'election'];
/** Lift is fixed per year by the AGM and charged only to units in a building with a lift. */
export const CATEGORY_FIELDS = [...CATEGORY_MONTHLY, 'liftYearly'];

/** One-off charges the committee can add to a month's bills. */
export const ONE_OFF = ['penalty', 'others', 'water', 'lift', 'liftRepairs', 'transferPremium', 'transferFee', 'entranceFee',
  'chequeReturn', 'propertyTax', 'insurance', 'election', 'majorRepairs', 'loan', 'leaseRent'];

export const PREMISES_TYPES = [
  'Residential Flat',
  'Residential, using as Commercial',
  'Commercial Office',
  'Hotel Terrace',
  'Ground-Floor Shop',
  'Basement Shop'
];

export const STATUSES = ['Own Occupied', 'Rented', 'Tenant', 'Commercial'];
/** Statuses that attract non-occupancy charges (premises let out). */
export const LET_OUT = new Set(['Rented', 'Tenant']);
export const PAYMENT_MODES = ['NEFT', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Demand Draft'];

/* ---------- dates (all in India time) ---------- */

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Today's date in India as YYYY-MM-DD, whatever time zone the code runs in. */
export function todayIST(now = new Date()) {
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`;
}

export const monthOf = (iso) => iso.slice(0, 7);

export function monthBounds(key) {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${pad(last)}` };
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 2026-10-01 → "01/10/2026" (format used on the Society's bills). */
export const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function longDate(iso) {
  if (!iso) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export function monthLabel(key) {
  return longDate(`${key}-01`).replace(/^1 /, '');
}

/** Indian financial year for a date: 2026-11-11 → "2026-27". */
export function financialYear(iso) {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${pad((start + 1) % 100)}`;
}

/* ---------- numbering ---------- */

/** "C 402" + 2026-11-01 → "C402/01112026" (same pattern as the October 2026 bills). */
export function billNumber(unitLabel, billDate) {
  return `${unitLabel.replace(/\s+/g, '')}/${billDate.slice(8, 10)}${billDate.slice(5, 7)}${billDate.slice(0, 4)}`;
}

export const billId = (unitId, monthKey) => `${unitId}_${monthKey}`;

export function receiptNumber(fy, seq) {
  return `SS/${fy}/${pad(seq, 4)}`;
}

/* ---------- amounts ---------- */

export const round = (n) => Math.round(Number(n) || 0);

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** 141400 → "1,41,400/-" ; negative → "Credit 9,430" */
export function money(n, { slash = true } = {}) {
  n = round(n);
  if (n < 0) return `Credit ${inr.format(-n)}`;
  return inr.format(n) + (slash ? '/-' : '');
}

/** Charge category of a unit: the one set on the unit, else a best guess from its type and wing. */
/** Units whose AGM category isn't obvious from their premises type. */
export const UNIT_CATEGORY = { 'D-101A': 'DCLINIC', 'D-101B': 'DCLINIC', 'D-201': 'DCOM', 'D-202': 'DCOM' };

export function categoryIdFor(unit) {
  if (unit.category) return unit.category;
  if (UNIT_CATEGORY[unit.id]) return UNIT_CATEGORY[unit.id];
  const t = unit.type || '';
  if (t === 'Residential Flat') return 'RES';
  if (t === 'Residential, using as Commercial') return 'RESCOM';
  if (t === 'Commercial Office') return unit.block === 'D' ? 'DCOM' : 'RESCOM';
  if (t === 'Hotel Terrace') return 'DCOM';
  if (/Shop/.test(t)) return 'SHOP_DRY';
  return 'RES';
}

/** Lifts in the society. Each unit is served by at most one. */
export const LIFT_GROUPS = { C: 'C wing lift', D: 'D wing lift' };
export const LIFT_KINDS = ['AMC', 'Repair', 'Wear & tear / parts', 'Licence / inspection', 'Electricity', 'Other'];

/** Which lift serves a unit: set on the unit, else C wing → C lift, D wing → D lift, others none. */
export function liftGroupFor(unit) {
  if (unit.liftGroup !== undefined && unit.liftGroup !== null) return unit.liftGroup;
  if (unit.block === 'C') return unit.hasLift === false ? '' : 'C';
  if (unit.block === 'D') return 'D';
  return '';
}
export const hasLift = (unit) => Boolean(liftGroupFor(unit));

/* ---------- month arithmetic ---------- */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function monthDiff(from, to) {
  const [y1, m1] = from.split('-').map(Number), [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * A lift expense (AMC, repair, wear & tear …) is shared equally among the units served by that lift
 * (Rule 106C: lift expenses divided equally among units in the building where the lift is provided),
 * recovered through the bills in one or more monthly instalments.
 * exp = { amount, unitIds: [...], startMonth: 'YYYY-MM', instalments }
 */
export function liftExpenseShare(exp, unitId, monthKey) {
  if (!exp || exp.status === 'deleted' || !exp.unitIds?.includes(unitId)) return 0;
  const n = Math.max(1, Number(exp.instalments) || 1);
  const idx = monthDiff(exp.startMonth, monthKey);
  if (idx < 0 || idx >= n) return 0;
  const share = Math.round(exp.amount / exp.unitIds.length);
  const per = Math.floor(share / n);
  return idx === n - 1 ? share - per * (n - 1) : per;
}

export const liftExpenseEndMonth = (exp) => addMonths(exp.startMonth, Math.max(1, Number(exp.instalments) || 1) - 1);

/**
 * Monthly charges for one unit and month, before arrears and interest.
 * Order of precedence for every head: amount set on the unit > its charge category > 0.
 */
export function chargesFor(unit, settings, monthKey) {
  const cats = settings?.categories || [];
  const cat = cats.find((c) => c.id === categoryIdFor(unit)) || {};
  const own = unit.charges || {};
  const pick = (code) => round(own[code] ?? cat[code] ?? 0);
  const out = {};
  for (const code of CATEGORY_MONTHLY) out[code] = pick(code);

  // Lift: yearly amount, billed in the chosen month (April by default) or spread monthly.
  const liftYearly = hasLift(unit) ? round(own.liftYearly ?? cat.liftYearly ?? 0) : 0;
  if (liftYearly) {
    if (settings?.liftBilling === 'monthly') out.lift = round(liftYearly / 12);
    else if (monthKey && Number(monthKey.slice(5, 7)) === Number(settings?.liftBillMonth || 4)) out.lift = liftYearly;
  }

  // Sinking fund and repairs fund: % per year of the architect-certified construction cost, billed monthly.
  const cost = Number(unit.constructionCost) || 0;
  out.sinking = own.sinking ?? (cost ? round((cost * (Number(settings?.sinkingPct) || 0)) / 100 / 12) : 0);
  out.repairs = own.repairs ?? (cost ? round((cost * (Number(settings?.repairsPct) || 0)) / 100 / 12) : 0);

  // Non-occupancy: % of service charges for premises that are let out.
  const nonOccPct = Number(settings?.nonOccupancyPct) || 0;
  out.nonOccupancy = own.nonOccupancy ?? (LET_OUT.has(unit.status) && nonOccPct ? round((out.maintenance * nonOccPct) / 100) : 0);
  return out;
}

/**
 * Builds one month's bill for a unit.
 * arrears     = the unit's running balance before this bill (negative = credit).
 * interestDue = penal interest already billed and not yet paid (excluded from the interest base,
 *               so interest stays simple, never interest-on-interest).
 * extras      = one-off lines for this month: [{ code, amount }]
 */
export function computeBill({ unit, settings, monthKey, extras = [], liftExpenses = [] }) {
  const arrears = round(unit.balance);
  const rate = Math.min(Number(settings?.interestRatePA) || 0, MAX_INTEREST_PA);
  const base = Math.max(0, arrears - Math.max(0, round(unit.interestDue)));
  const interest = rate > 0 && base > 0 ? round((base * rate) / 100 / 12) : 0;

  const amounts = { ...chargesFor(unit, settings, monthKey), interest };
  for (const x of extras) {
    if (!x || !x.code || x.code === 'arrears') continue;
    amounts[x.code] = (amounts[x.code] || 0) + round(x.amount);
  }

  // Shared lift expenses due from this unit this month, with a note for the bill.
  const liftNotes = [];
  for (const exp of liftExpenses) {
    const share = liftExpenseShare(exp, unit.id, monthKey);
    if (!share) continue;
    amounts.liftRepairs = (amounts.liftRepairs || 0) + share;
    liftNotes.push({
      id: exp.id, lift: exp.lift, kind: exp.kind, description: exp.description || '', invoiceNo: exp.invoiceNo || '',
      date: exp.date, amount: exp.amount, units: exp.unitIds.length,
      instalment: `${monthDiff(exp.startMonth, monthKey) + 1}/${Math.max(1, Number(exp.instalments) || 1)}`, share
    });
  }

  const lines = PARTICULARS
    .filter(([code]) => code !== 'arrears')
    .map(([code, label]) => ({ code, label, amount: round(amounts[code]) }))
    .filter((l) => l.amount !== 0);

  const current = lines.reduce((s, l) => s + l.amount, 0);
  return { arrears, lines, interest, current, total: arrears + current, liftNotes };
}

/** Ceiling on penal interest: 12% simple p.a. under the MCS (Amendment) Rules, 2026. */
export const MAX_INTEREST_PA = 12;

/* ---------- amount in words (Indian system) ---------- */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function below1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}

/** 141400 → "Rupees One Lakh Forty One Thousand Four Hundred Only." */
export function amountInWords(amount) {
  let n = Math.abs(round(amount));
  if (n === 0) return 'Rupees Zero Only.';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `Rupees ${parts.join(' ')} Only.`;
}
