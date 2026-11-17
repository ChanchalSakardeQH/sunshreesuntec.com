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
  chargesBasis: 'Charges as per the AGM of 25/01/2015 (minutes dated 25/02/2015, effective 01/04/2015) and Bye-laws 65 to 71 of the Society. Penal interest 18% p.a. up to 30/06/2026 (members’ resolution of 13/04/2013) and 12% p.a. from 01/07/2026 (MCS Rule 106C-12(4)-6).',
  chargesBasisMmc: 'Charges calculated as per Bye-laws 65 to 71 and Rule 106C-12 of the MCS Rules, 1961 (as amended 2026), at rates approved by the General Body.',
  notices: []
};

/**
 * Charge categories and rates as passed at the AGM held on 25/01/2015 (minutes Ref. AGM-MOM/20150225 dated 25/02/2015),
 * "accepted by all members", effective 1 April 2015 and unchanged since. Amounts are per unit per month, except
 * liftYearly. maintenancePerSqft (Rs per sq ft of carpet area per month) is used when the unit's carpet area is
 * recorded; otherwise the fixed maintenance applies. Education & Training Fund is Rs 10 per unit per month as per
 * the bye-laws. Edit in Admin → Settings whenever the General Body revises them.
 */
export const AGM_2015_CATEGORIES = [
  { id: 'RES', name: 'Residential flat (A & C wing)', maintenance: 1300, water: 0, liftYearly: 1000, liftMonthly: 0, maintenancePerSqft: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'RESCOM', name: 'Residential flat used as commercial (A & C wing)', maintenance: 2000, water: 500, liftYearly: 0, liftMonthly: 500, maintenancePerSqft: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'DCOM', name: 'Commercial D wing (Gym D 201)', maintenance: 2000, water: 2000, liftYearly: 0, liftMonthly: 0, maintenancePerSqft: 3, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'DCLINIC', name: 'Commercial D wing clinic / hospital (D 101 A & B)', maintenance: 2000, water: 1000, liftYearly: 0, liftMonthly: 0, maintenancePerSqft: 3, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'SHOP_DRY', name: 'Shop (basement / ground floor) without water', maintenance: 1000, water: 0, liftYearly: 0, liftMonthly: 0, maintenancePerSqft: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'SHOP_TAP', name: 'Shop with only water tap', maintenance: 1000, water: 500, liftYearly: 0, liftMonthly: 0, maintenancePerSqft: 0, parking: 0, education: 10, federation: 0, election: 0 },
  { id: 'SHOP_HEAVY', name: 'Shop: beauty parlour / pet shop / clinic / food shop / chicken centre', maintenance: 1000, water: 900, liftYearly: 0, liftMonthly: 0, maintenancePerSqft: 0, parking: 0, education: 10, federation: 0, election: 0 }
];

/**
 * Maintenance as passed by the General Body over time (shown to members and kept for reference; bills use the
 * categories above). Penal interest: see settings.interestPeriods (18% from 13/04/2013, 12% from 01/07/2026).
 */
export const RATE_HISTORY = [
  {
    from: '2013-04-01', to: '2015-03-31',
    meeting: 'Members’ meeting held on 13/04/2013 (Ref. RES_PASSED/130413/002, item 6)',
    rows: [['Residential flats', '₹1,000 per month', 'Lift expenses extra for C wing'], ['Residential using as commercial', '₹1,500 per month', 'Activities approved by applicable bye-laws'],
      ['Commercial, without water tap', '₹600 per month', ''], ['Commercial, with water tap', '₹700 per month', ''], ['Restaurants / hotel / others', '₹900 per month', 'As per water usage']],
    notes: ['10% extra on maintenance for all rented properties.', 'Water tap charges are for water pump motor electricity.', 'Item 9: for late payment, i.e. beyond the calendar month, 18% extra per year.']
  },
  {
    from: '2015-04-01', to: '',
    meeting: 'AGM held on 25/01/2015 (minutes Ref. AGM-MOM/20150225 dated 25/02/2015), accepted by all members',
    rows: [['Residential flats A & C wing', '₹1,300 per month', 'Lift (C wing) ₹1,000 per year (lift AMC)'], ['Residential flats used as commercial, A & C wing', '₹2,000 per month', 'Water pump (MSEB) ₹500; lift (C wing) ₹500 per month (AMC)'],
      ['Commercial D wing (currently gym D 201)', '₹3 per sq ft per month', 'Water pump (MSEB) ₹2,000'], ['Commercial D wing clinic / hospital (D 101 A & B)', '₹3 per sq ft per month', 'Water pump (MSEB) ₹1,000'],
      ['Shop at basement / ground floor without water', '₹1,000 per month', ''], ['Shop at basement / ground floor with only water tap', '₹1,000 per month', 'Water ₹500'],
      ['Shop: beauty parlour / pet shop / clinics / food shop / chicken centre', '₹1,000 per month', 'Water ₹900']],
    notes: ['Penal interest 18% per year continues to 30/06/2026; from 01/07/2026, 12% per year (MCS (Amendment) Rules, 2026), with the same maintenance.']
  }
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
