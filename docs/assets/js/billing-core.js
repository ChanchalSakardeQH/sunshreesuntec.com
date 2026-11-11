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
  ['welfare', 'Welfare Fund (voluntary)', true],
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
export const ONE_OFF = ['majorRepairs', 'penalty', 'others', 'water', 'lift', 'liftRepairs', 'transferPremium', 'transferFee',
  'entranceFee', 'chequeReturn', 'propertyTax', 'insurance', 'election', 'loan', 'leaseRent'];

/** Penalty for breach of bye-laws: at most Rs 5,000 a year (Bye-law 165). */
export const MAX_PENALTY_PER_YEAR = 5000;

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

/* ---------- Monthly Maintenance Calculation (MMC) ---------- */

/**
 * Totals the MMC needs across the society: number of units billed, units served by each lift,
 * water inlets and carpet area. Built from the active units before a billing run.
 */
export function buildContext(units) {
  const active = units.filter((u) => u.active !== false);
  const lift = { C: 0, D: 0 };
  let inlets = 0, area = 0;
  for (const u of active) {
    const g = liftGroupFor(u);
    if (g) lift[g] = (lift[g] || 0) + 1;
    inlets += Number(u.inlets) || 0;
    area += Number(u.carpetArea) || 0;
  }
  return { units: active.length, lift, inlets, area };
}

/**
 * Per-unit rates under the 2026 Rules (Rule 106C-12, Bye-laws 65–71):
 *  service charge  = monthly common expenses ÷ number of units (equal contribution)
 *  lift            = monthly lift expenses ÷ units served by that lift (shops without lift excluded)
 *  water           = monthly water expenses ÷ total inlets, × inlets of the unit
 */
export function mmcRates(settings, ctx) {
  const m = settings?.mmc || {};
  let serviceTotal = 0;
  const liftTotal = { C: 0, D: 0, CD: 0 };
  for (const it of m.expenses || []) {
    const a = Number(it.monthly) || 0;
    if (it.appliesTo === 'C' || it.appliesTo === 'D' || it.appliesTo === 'CD') liftTotal[it.appliesTo] += a;
    else serviceTotal += a;
  }
  const liftUnits = (ctx.lift.C || 0) + (ctx.lift.D || 0);
  const liftFor = (g) => (ctx.lift[g] ? liftTotal[g] / ctx.lift[g] : 0) + (liftUnits ? liftTotal.CD / liftUnits : 0);
  return {
    serviceTotal, liftTotal,
    service: ctx.units ? round(serviceTotal / ctx.units) : 0,
    lift: { C: round(liftFor('C')), D: round(liftFor('D')) },
    waterPerInlet: ctx.inlets ? round((Number(m.waterMonthly) || 0) / ctx.inlets) : 0
  };
}

/** Construction cost of a unit: certified amount on the unit, else society cost per sq ft × carpet area. */
export function constructionCostOf(unit, settings) {
  if (Number(unit.constructionCost)) return Number(unit.constructionCost);
  const rate = Number(settings?.mmc?.costPerSqft) || 0;
  return rate && Number(unit.carpetArea) ? rate * Number(unit.carpetArea) : 0;
}

/**
 * Monthly charges for one unit and month, before arrears and interest.
 * Returns { amounts, details } — details is a short note printed under each bill line.
 * Precedence for every head: amount set on the unit > calculated / category amount > 0.
 * settings.method: 'agm' = flat rates per charge category; 'mmc' = calculated as per the 2026 Rules.
 */
export function chargesFor(unit, settings, monthKey, ctx = { units: 0, lift: {}, inlets: 0, area: 0 }) {
  const own = unit.charges || {};
  const out = {}, details = {};
  const m = settings?.mmc || {};
  const g = liftGroupFor(unit);

  if (settings?.method === 'mmc') {
    const r = mmcRates(settings, ctx);
    out.maintenance = round(own.maintenance ?? r.service);
    details.maintenance = own.maintenance != null ? 'Fixed for this unit' : `Equal to all ${ctx.units} units`;
    if (g) {
      out.lift = round(own.liftMonthly ?? r.lift[g]);
      details.lift = `${LIFT_GROUPS[g]}, equal among ${ctx.lift[g]} units`;
    }
    const inlets = Number(unit.inlets) || 0;
    out.water = round(own.water ?? inlets * r.waterPerInlet);
    if (inlets && own.water == null) details.water = `${inlets} inlet${inlets > 1 ? 's' : ''} × ₹${r.waterPerInlet}`;
    for (const code of ['education', 'federation', 'election']) out[code] = round(own[code] ?? 0);

    // Area-wise: property tax and building insurance paid by the society, in proportion to carpet area.
    const area = Number(unit.carpetArea) || 0;
    if (area && ctx.area) {
      if (Number(m.propertyTaxYearly)) {
        out.propertyTax = round((Number(m.propertyTaxYearly) * area) / ctx.area / 12);
        details.propertyTax = `${area} of ${ctx.area} sq ft`;
      }
      if (Number(m.insuranceYearly)) {
        out.insurance = round((Number(m.insuranceYearly) * area) / ctx.area / 12);
        details.insurance = `${area} of ${ctx.area} sq ft`;
      }
    }
  } else {
    const cat = (settings?.categories || []).find((c) => c.id === categoryIdFor(unit)) || {};
    for (const code of CATEGORY_MONTHLY) out[code] = round(own[code] ?? cat[code] ?? 0);
    // Lift: yearly amount, billed in the chosen month (April by default) or spread monthly.
    const liftYearly = g ? round(own.liftYearly ?? cat.liftYearly ?? 0) : 0;
    if (liftYearly) {
      if (settings?.liftBilling === 'monthly') out.lift = round(liftYearly / 12);
      else if (monthKey && Number(monthKey.slice(5, 7)) === Number(settings?.liftBillMonth || 4)) out.lift = liftYearly;
    }
  }

  // Parking: number of vehicles × rate fixed by the General Body (both methods), unless fixed on the unit.
  const p2 = Number(unit.twoWheelers) || 0, p4 = Number(unit.fourWheelers) || 0;
  const rate2 = Number(m.parking2w) || 0, rate4 = Number(m.parking4w) || 0;
  if (own.parking == null && (p2 * rate2 + p4 * rate4)) {
    out.parking = round(p2 * rate2 + p4 * rate4);
    details.parking = [p2 && `${p2} two-wheeler × ₹${rate2}`, p4 && `${p4} four-wheeler × ₹${rate4}`].filter(Boolean).join(', ');
  } else if (own.parking != null) out.parking = round(own.parking);

  // Sinking fund 0.25% and repairs fund 0.75% per year of construction cost, billed monthly.
  const cost = constructionCostOf(unit, settings);
  const sPct = Number(settings?.sinkingPct) || 0, rPct = Number(settings?.repairsPct) || 0;
  out.sinking = round(own.sinking ?? (cost ? (cost * sPct) / 100 / 12 : 0));
  out.repairs = round(own.repairs ?? (cost ? (cost * rPct) / 100 / 12 : 0));
  if (cost && own.sinking == null) details.sinking = `${sPct}% p.a. of construction cost`;
  if (cost && own.repairs == null) details.repairs = `${rPct}% p.a. of construction cost`;

  // Non-occupancy: % of service charges for premises that are let out.
  const nonOccPct = Number(settings?.nonOccupancyPct) || 0;
  out.nonOccupancy = round(own.nonOccupancy ?? (LET_OUT.has(unit.status) && nonOccPct ? (out.maintenance * nonOccPct) / 100 : 0));
  if (out.nonOccupancy && own.nonOccupancy == null) details.nonOccupancy = `${nonOccPct}% of service charges`;

  // Welfare fund: voluntary, only for members who opt in.
  if (Number(own.welfare)) out.welfare = round(own.welfare);
  return { amounts: out, details };
}

/**
 * One-off charges for a month, as entered on the Bills page.
 * spec = { code, basis: 'unit' | 'equal' | 'area', amount, block: 'all' | blockId }
 *   unit  → amount charged to every unit in scope
 *   equal → total amount divided equally among units in scope
 *   area  → total amount divided in proportion to carpet area (e.g. Major Repairs Fund)
 */
export function prepareExtras(specs, units) {
  return (specs || []).filter((x) => x && x.code && Number(x.amount)).map((x) => {
    const scope = units.filter((u) => u.active !== false && (!x.block || x.block === 'all' || u.block === x.block));
    const area = scope.reduce((a, u) => a + (Number(u.carpetArea) || 0), 0);
    if (x.basis === 'area' && !area) throw new Error('Carpet area isn’t entered for these units, so an area-wise charge can’t be shared.');
    const perUnitMax = x.basis === 'unit' ? Number(x.amount) : x.basis === 'equal' ? Number(x.amount) / (scope.length || 1) : null;
    if (x.code === 'penalty' && perUnitMax != null && perUnitMax > MAX_PENALTY_PER_YEAR) {
      throw new Error(`A penalty can’t be more than ₹${MAX_PENALTY_PER_YEAR} a year per member (Bye-law 165).`);
    }
    return { ...x, ids: new Set(scope.map((u) => u.id)), count: scope.length, area };
  });
}

export function extrasForUnit(prepared, unit) {
  const out = [];
  for (const x of prepared || []) {
    if (!x.ids.has(unit.id)) continue;
    let amount = Number(x.amount);
    let detail = '';
    if (x.basis === 'equal') { amount = round(amount / x.count); detail = `₹${round(x.amount)} ÷ ${x.count} units`; }
    if (x.basis === 'area') {
      const a = Number(unit.carpetArea) || 0;
      amount = round((Number(x.amount) * a) / x.area);
      detail = `${a} of ${x.area} sq ft`;
    }
    if (amount) out.push({ code: x.code, amount, detail });
  }
  return out;
}

/**
 * Builds one month's bill for a unit.
 * arrears     = the unit's running balance before this bill (negative = credit).
 * interestDue = penal interest already billed and not yet paid (excluded from the interest base,
 *               so interest stays simple, never interest-on-interest).
 * extras      = one-off lines for this unit: [{ code, amount, detail? }]
 * ctx         = society totals from buildContext(), needed for the MMC method.
 */
export function computeBill({ unit, settings, monthKey, extras = [], liftExpenses = [], ctx }) {
  const arrears = round(unit.balance);
  const rate = Math.min(Number(settings?.interestRatePA) || 0, MAX_INTEREST_PA);
  const base = Math.max(0, arrears - Math.max(0, round(unit.interestDue)));
  const interest = rate > 0 && base > 0 ? round((base * rate) / 100 / 12) : 0;

  const { amounts: charges, details } = chargesFor(unit, settings, monthKey, ctx);
  const amounts = { ...charges, interest };
  if (interest) details.interest = `${rate}% p.a. simple on ₹${base}`;
  for (const x of extras) {
    if (!x || !x.code || x.code === 'arrears') continue;
    amounts[x.code] = (amounts[x.code] || 0) + round(x.amount);
    if (x.detail) details[x.code] = details[x.code] ? `${details[x.code]}; ${x.detail}` : x.detail;
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
    .map(([code, label]) => ({ code, label, amount: round(amounts[code]), ...(details[code] ? { detail: details[code] } : {}) }))
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
