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

export const DEFAULT_BILLING = {
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
