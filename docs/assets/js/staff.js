// Staff roles (Accountant, Society Manager …), what each permission allows, and the default
// Commitment, Confidentiality and Work Responsibilities Agreement that staff accept before working.
// Permissions are enforced on the server by firestore.rules; the pages only hide what isn't allowed.

/** Every permission a staff member can be given. Committee members have all of them. */
export const PERMS = [
  ['view', 'View accounts: dashboard, units, bills, receipts, ledgers, lift expenses'],
  ['recordPayments', 'Record payments and issue receipts'],
  ['cancelReceipts', 'Cancel receipts (bounced cheque, wrong entry)'],
  ['generateBills', 'Generate the monthly bills'],
  ['corrections', 'Add corrections (debit / credit) to unit accounts'],
  ['editUnits', 'Edit unit details: name, status, area, inlets, vehicles, lift (not balances)'],
  ['liftExpenses', 'Record lift AMC / repair expenses'],
  ['unitRecords', 'Maintain unit files: member register (I & J), tenants and rental history, communication'],
  ['members', 'Approve or remove member logins'],
  ['website', 'Publish notices and contact details on the website']
];
export const PERM_LABEL = Object.fromEntries(PERMS);

/** Only the managing committee can do these; they can't be given to staff. */
export const COMMITTEE_ONLY = [
  'Change rates, charge basis and society / bank details (Settings)',
  'Import opening balances',
  'Add, change or remove staff and their access',
  'Edit and publish the staff agreement'
];

export const STAFF_ROLES = {
  'Accountant': ['view', 'recordPayments', 'cancelReceipts', 'generateBills', 'corrections', 'liftExpenses'],
  'Society Manager': ['view', 'recordPayments', 'editUnits', 'liftExpenses', 'unitRecords', 'members', 'website'],
  'Office Assistant': ['view', 'recordPayments', 'unitRecords']
};

export const permsFor = (role) => Object.fromEntries(PERMS.map(([k]) => [k, (STAFF_ROLES[role] || []).includes(k)]));

/** A signed-in admins/{uid} record is a committee member unless it is marked kind: 'staff'. */
export const isCommitteeRecord = (rec) => Boolean(rec) && rec.kind !== 'staff' && rec.active !== false;

export function can(rec, perm) {
  if (!rec || rec.active === false) return false;
  if (rec.kind !== 'staff') return true;
  return Boolean(rec.perms?.[perm]);
}

/** Default agreement (version 1). The committee can edit it in Accounts → Staff and publish a new version. */
export const DEFAULT_AGREEMENT = {
  version: 1,
  title: 'Commitment, Confidentiality and Work Responsibilities Agreement',
  intro: 'This agreement is between Sunshree Suntec Co-operative Housing Society Ltd. (the Society), acting through its Managing Committee, and the person named below, who has been given access to the Society’s online accounts at sunshreesuntec.com. Access is given only for the Society’s work and only after this agreement is accepted.',
  common: [
    'I will use my access only for the work assigned to me by the Managing Committee, and only within the permissions listed in this agreement.',
    'I will sign in only with my own account. I will not share my password, Google account or device with anyone, and I will sign out on shared computers.',
    'I will keep confidential all information about members, tenants and the Society, including names, mobile numbers, email addresses, balances, payments and documents, during and after my engagement, and handle it as required by applicable data protection law, including the Digital Personal Data Protection Act, 2023.',
    'I will not copy, download, forward or publish member data except as required for my work, and will not use it for any personal or commercial purpose.',
    'Every entry I make will be true and complete, made on the day the transaction happens, and supported by a document (bank credit, cheque, invoice, written committee approval).',
    'I will never alter, back-date or hide an entry. Mistakes will be corrected by a new entry with a reason, and reported to the Treasurer.',
    'Every payment received in cash or cheque will be receipted in the system immediately and deposited in the Society’s bank account by the next working day.',
    'I will declare any personal interest (relative, vendor, tenant) in a matter I handle and will not act on it without committee approval.',
    'I will follow the Society’s bye-laws, General Body resolutions and Managing Committee instructions, and report any error, misuse or suspected fraud to the committee at once.',
    'I understand that every action I take in the system is recorded with my name and time, that the committee may review, suspend or withdraw my access at any time, and that my access ends when my engagement ends.',
    'On leaving, I will hand over all records, documents and pending work to the committee.'
  ],
  roles: {
    'Accountant': [
      'Record every maintenance payment with date, mode and UTR / cheque number, and issue the receipt the same day.',
      'Reconcile receipts with the IDBI Bank statement every month and report differences to the Treasurer.',
      'Check and generate the monthly bills on schedule, and report any unit whose bill looks wrong before it is sent.',
      'Make corrections only with written approval of the Treasurer or Chairman, quoting that approval in the particulars.',
      'Prepare the monthly receipt register (CSV) and outstanding list for the committee, and assist the auditor.',
      'Not change rates, charge basis or society settings.'
    ],
    'Society Manager': [
      'Keep unit details up to date (tenancy status, vehicles, water inlets, carpet area) on the basis of documents submitted by members.',
      'Record lift AMC, repair and other lift expenses with the vendor invoice, after committee approval of the work.',
      'Approve member logins only after checking the member register or ownership documents (Index II / agreement).',
      'Publish notices and contact details only as approved by the committee.',
      'Receipt any payment collected by me immediately in the system and deposit it in the Society’s bank account by the next working day.',
      'Attend to member complaints and escalate unresolved ones to the committee.'
    ],
    'Office Assistant': [
      'Receipt payments handed over at the office immediately in the system and hand the cash / cheques to the Treasurer the same day.',
      'Assist members with copies of their bills and receipts.'
    ]
  },
  closing: 'By accepting, I confirm that I have read and understood this agreement, the access given to me and my responsibilities, and I agree to follow them. My acceptance is recorded electronically with my name, email, date and time.'
};
