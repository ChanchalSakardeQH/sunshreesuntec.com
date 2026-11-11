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
  notices: []
};

export const DEFAULT_BILLING = {
  interestRatePA: 0,   // 0 = no penal interest line on bills
  dueDays: 15,         // due date = bill date + this many days
  // Monthly charges by premises type. Education Fund is Rs 10 per unit per month as per the bye-laws.
  // Fill in the other amounts as fixed by the General Body before generating the first monthly bills.
  rates: {
    'Residential Flat': { maintenance: 0, education: 10 },
    'Residential, using as Commercial': { maintenance: 0, education: 10 },
    'Commercial Office': { maintenance: 0, education: 10 },
    'Hotel Terrace': { maintenance: 0, education: 10 },
    'Ground-Floor Shop': { maintenance: 0, education: 10 },
    'Basement Shop': { maintenance: 0, education: 10 }
  }
};

/** The October 2026 bill sent to every unit: arrears to 30 Sep 2026 plus Rs 6,500 under "Any Others Charges". */
export const OCTOBER_2026_BILL = {
  month: '2026-10',
  billDate: '2026-10-01',
  periodFrom: '2018-04-01',
  periodTo: '2026-09-30',
  extras: [{ code: 'others', amount: 6500 }]
};
