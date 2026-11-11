// Starting values, taken from the Society's printed bill and January 2026 notice.
// Everything here can be edited later in Admin → Website and Admin → Settings.

export const DEFAULT_SITE = {
  society: {
    name: 'SUNSHREE SUNTEC CO - OP. HSG. SOC. LTD.',
    regd: 'Regd. No. PNA / PNA (4) / HSG (TC) /12471/ 2012-13 Dt. 30-10-2012',
    address: 'S. No. 19/2, 20/1, NIBM Road, Kondhwa Khurd, Pune - 411 048.',
    email: 'sunshreesuntec@gmail.com',
    website: 'www.sunshreesuntec.com',
    contactNo: ''
  },
  bank: {
    name: 'IDBI BANK, NIBM Road, Kondhwa, Pune - 411 048.',
    accountName: 'SUNSHREE SUNTEC CO - OP. HSG. SOC. LTD.',
    accountNo: '0769102000011644',
    ifsc: 'IBKL0000769'
  },
  committee: [
    { role: 'Chairman', name: 'Mr Saji Rajan', phone: '' },
    { role: 'Secretary', name: '', phone: '' },
    { role: 'Treasurer', name: '', phone: '' }
  ],
  contact: { hours: '' },
  chargesBasis: 'Charges as per AGM dated 25/01/2015 (amended 07/07/2015) and Bye-laws 65 to 71 of the Society.',
  chargesBasisMmc: 'Charges calculated as per Bye-laws 65 to 71 and Rule 106C-12 of the MCS Rules, 1961 (as amended 2026), at rates approved by the General Body.',
  notices: []
};

/**
 * Charge categories and rates as passed at the AGM of 25 Jan 2015 (MOM AGM-MOM/20150225) and amended
 * on 07 Jul 2015 (AmendmentOfMom/20150707), effective 1 April 2015. Amounts are per unit per month,
 * except liftYearly. Education & Training Fund is Rs 10 per unit per month as per the bye-laws.
 * Edit in Admin → Settings whenever the General Body revises them.
 */
export const AGM_2015_CATEGORIES = [
  { id: 'RES', name: 'Residential flat (A & C wing)', maintenance: 1300, water: 0, liftYearly: 1000, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'RESCOM', name: 'Residential flat used as commercial (A & C wing)', maintenance: 2000, water: 300, liftYearly: 2000, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'DCOM', name: 'Commercial D wing (Gym D 201)', maintenance: 2000, water: 500, liftYearly: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'DCLINIC', name: 'Commercial D wing clinic / hospital (D 101 A & B)', maintenance: 2000, water: 500, liftYearly: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'SHOP_DRY', name: 'Shop (basement / ground floor) without water', maintenance: 1000, water: 0, liftYearly: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'SHOP_TAP', name: 'Shop with only water tap', maintenance: 1000, water: 300, liftYearly: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'SHOP_HEAVY', name: 'Shop: beauty parlour / pet shop / clinic / food shop / chicken centre', maintenance: 1000, water: 500, liftYearly: 0, parking: 0, education: 10, federation: 0, election: 0 }
];

/**
 * Monthly Maintenance Calculation (MMC) as per Bye-laws 65–71 and Rule 106C-12 of the MCS Rules (amended 2026).
 * Fill in the society's actual monthly expenses; amounts start at 0 except the Education & Training Fund
 * (Rs 10 per unit per month). appliesTo: 'all' = equal among all units; 'C' / 'D' / 'CD' = equal among
 * units served by that lift (shops and units without a lift don't pay lift costs).
 */
export const MMC_TEMPLATE = {
  expenses: [
    { id: 'security', name: 'Security / watchmen salaries', monthly: 0, appliesTo: 'all' },
    { id: 'housekeeping', name: 'Housekeeping and cleaning', monthly: 0, appliesTo: 'all' },
    { id: 'commonElec', name: 'Common electricity (MSEB, excluding lifts and water pump)', monthly: 0, appliesTo: 'all' },
    { id: 'office', name: 'Office, printing, stationery and postage', monthly: 0, appliesTo: 'all' },
    { id: 'audit', name: 'Accounting and audit fees', monthly: 0, appliesTo: 'all' },
    { id: 'meetings', name: 'General body and committee meeting expenses', monthly: 0, appliesTo: 'all' },
    { id: 'legal', name: 'Legal and professional charges', monthly: 0, appliesTo: 'all' },
    { id: 'education', name: 'Education & Training Fund (Rs 10 per unit)', monthly: 650, appliesTo: 'all' },
    { id: 'federation', name: 'Housing Federation subscription', monthly: 0, appliesTo: 'all' },
    { id: 'election', name: 'Election fund', monthly: 0, appliesTo: 'all' },
    { id: 'drainage', name: 'Drainage, tank cleaning and pest control', monthly: 0, appliesTo: 'all' },
    { id: 'safety', name: 'Fire fighting, CCTV and intercom maintenance', monthly: 0, appliesTo: 'all' },
    { id: 'garden', name: 'Garden and common amenities', monthly: 0, appliesTo: 'all' },
    { id: 'liftC', name: 'C wing lift: electricity and AMC (monthly)', monthly: 0, appliesTo: 'C' },
    { id: 'liftD', name: 'D wing lift: electricity and AMC (monthly)', monthly: 0, appliesTo: 'D' }
  ],
  waterMonthly: 0,        // monthly water expense (PMC water bill, tanker, pump electricity) shared per inlet
  costPerSqft: 0,         // construction cost per sq ft certified by the architect
  propertyTaxYearly: 0,   // only if the society pays property tax for the building
  insuranceYearly: 0,     // building insurance premium per year
  parking2w: 0,           // per two-wheeler per month, as fixed by the General Body
  parking4w: 0            // per four-wheeler per month
};

export const DEFAULT_BILLING = {
  method: 'agm',            // 'agm' = AGM 2015 category rates; 'mmc' = calculated as per 2026 Rules
  mmc: MMC_TEMPLATE,
  categories: AGM_2015_CATEGORIES,
  interestRatePA: 0,        // 0 = no penal interest; maximum 12% simple p.a. (MCS Rules as amended 2026)
  dueDays: 15,              // due date = bill date + this many days
  liftBilling: 'yearly',    // 'yearly' = full year's lift charge in liftBillMonth; 'monthly' = 1/12 every month
  liftBillMonth: 4,         // April, start of the financial year
  sinkingPct: 0.25,         // % per year of construction cost (minimum under the bye-laws / Rules)
  repairsPct: 0.75,         // % per year of construction cost (minimum under the bye-laws / Rules)
  nonOccupancyPct: 10       // % of service charges for let-out premises
};

/** The October 2026 bill sent to every unit: arrears to 30 Sep 2026 plus Rs 6,500 under "Any Others Charges". */
export const OCTOBER_2026_BILL = {
  month: '2026-10',
  billDate: '2026-10-01',
  periodFrom: '2018-04-01',
  periodTo: '2026-09-30',
  extras: [{ code: 'others', amount: 6500 }]
};
