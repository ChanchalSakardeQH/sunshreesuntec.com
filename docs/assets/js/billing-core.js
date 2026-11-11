// Billing rules shared by the admin pages (browser) and scripts/generate-bills.mjs (GitHub Actions).
// No Firebase code here: only calculations, numbering and wording.

/** The 15 lines of the Society's printed bill, in order. */
export const PARTICULARS = [
  ['maintenance', 'Maintenance Charges'],
  ['sinking', 'Sinking Fund'],
  ['repairs', 'Repairs & Maintenance Fund'],
  ['nonOccupancy', 'Non - Occupancy Charges'],
  ['arrears', 'Arrears'],
  ['interest', 'Penal Interest On Arrears'],
  ['water', 'Water / Wastage Penalty / Charges'],
  ['parking', 'Vehicle Parking Charges'],
  ['transferPremium', 'Transfer Premium'],
  ['transferFee', 'Transfer Fee'],
  ['entranceFee', 'Entrance Fee'],
  ['education', 'Education Fund'],
  ['federation', 'Co-op Federation Fund'],
  ['chequeReturn', 'Cheque Return Charges'],
  ['others', 'Any Others Charges']
];
export const LABEL = Object.fromEntries(PARTICULARS);

/** Charges billed every month from the rate table (Settings) or a unit's own override. */
export const RECURRING = ['maintenance', 'sinking', 'repairs', 'nonOccupancy', 'water', 'parking', 'education', 'federation'];

/** One-off charges the committee can add to a month's bills. */
export const ONE_OFF = ['transferPremium', 'transferFee', 'entranceFee', 'chequeReturn', 'others', 'water'];

export const PREMISES_TYPES = [
  'Residential Flat',
  'Residential, using as Commercial',
  'Commercial Office',
  'Hotel Terrace',
  'Ground-Floor Shop',
  'Basement Shop'
];

export const STATUSES = ['Own Occupied', 'Rented', 'Tenant', 'Commercial'];
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

/** Monthly recurring charges for a unit: its own override first, else the rate for its premises type. */
export function chargesFor(unit, settings) {
  const typeRates = settings?.rates?.[unit.type] || {};
  const override = unit.charges || {};
  const out = {};
  for (const code of RECURRING) {
    const v = override[code] ?? typeRates[code] ?? 0;
    out[code] = round(v);
  }
  return out;
}

/**
 * Builds one month's bill for a unit.
 * arrears = the unit's running balance before this bill (negative = credit).
 * extras  = one-off lines for this month: [{ code, amount }]
 */
export function computeBill({ unit, settings, extras = [] }) {
  const arrears = round(unit.balance);
  const rate = Number(settings?.interestRatePA) || 0;
  const interest = rate > 0 && arrears > 0 ? round((arrears * rate) / 100 / 12) : 0;

  const amounts = { ...chargesFor(unit, settings), interest };
  for (const x of extras) {
    if (!x || !x.code || x.code === 'arrears') continue;
    amounts[x.code] = (amounts[x.code] || 0) + round(x.amount);
  }

  const lines = PARTICULARS
    .filter(([code]) => code !== 'arrears')
    .map(([code, label]) => ({ code, label, amount: round(amounts[code]) }))
    .filter((l) => l.amount !== 0);

  const current = lines.reduce((s, l) => s + l.amount, 0);
  return { arrears, lines, current, total: arrears + current };
}

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
