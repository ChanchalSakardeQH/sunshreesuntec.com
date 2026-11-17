/**
 * Documents a member uploads for their unit (3.13): units/<unitId>/memberDocs/<id>.
 * Kept in the Society's Google Drive (Units › wing › unit › folder below). The committee acknowledges the
 * physical copy handed over at the office (ACK/<FY>/<nnnn>) or returns the upload for correction.
 */
export const MEMBER_DOC_KINDS = {
  ownership: {
    label: 'Sale deed / agreement and Index II',
    short: 'Ownership document',
    folder: 'Ownership (sale deeds and Index II)',
    help: 'Upload the complete scan of each registered document (every page), from the builder’s agreement for sale to the latest owner, with its Index II. Add each document of the chain separately.',
    fields: [
      ['docType', 'Document', 'select', ['Agreement for sale (from the builder)', 'Sale deed / conveyance', 'Index II', 'Gift / release / relinquishment deed', 'Will, probate or succession certificate', 'Other']],
      ['seller', 'From (builder / seller / transferor)', 'text'],
      ['buyer', 'To (buyer / transferee)', 'text'],
      ['regDate', 'Date of registration', 'date'],
      ['regNo', 'Document no. and sub-registrar office (e.g. 1234/2012, Haveli 3)', 'text'],
      ['notes', 'Notes', 'textarea']
    ],
    title: (d) => `${d.docType || 'Ownership document'}${d.seller || d.buyer ? `: ${d.seller || '…'} → ${d.buyer || '…'}` : ''}`
  },
  rental: {
    label: 'Leave and licence (rental) agreement',
    short: 'Rental agreement',
    folder: 'Tenants and agreements',
    help: 'The registered leave and licence agreement of the present tenant (every page). Tell the Society before the tenant moves in.',
    fields: [
      ['licensee', 'Licensee (tenant) names', 'text', true],
      ['from', 'From', 'date', true], ['to', 'To', 'date'],
      ['regNo', 'Registration no.', 'text'],
      ['use', 'Use', 'select', ['Residential', 'Commercial / business']],
      ['people', 'Number of people staying', 'number'],
      ['notes', 'Notes', 'textarea']
    ],
    title: (d) => `Rental agreement: ${d.licensee || ''}${d.from ? `, from ${d.from}` : ''}`
  },
  police: {
    label: 'Police intimation / verification',
    short: 'Police verification',
    folder: 'Tenants and agreements',
    help: 'The police intimation or verification of each tenant or occupant who is not family.',
    fields: [
      ['licensee', 'Tenant / occupant name', 'text', true],
      ['station', 'Police station', 'text'], ['date', 'Date', 'date'],
      ['ackNo', 'Acknowledgment / application no.', 'text'],
      ['notes', 'Notes', 'textarea']
    ],
    title: (d) => `Police verification: ${d.licensee || ''}`
  },
  occupants: {
    label: 'Who lives in the unit now',
    short: 'Occupants',
    folder: 'Occupants',
    help: 'Everyone staying in the unit now: one person per line, with relation to the owner and mobile number. Add ID proofs if the committee asks for them.',
    fields: [
      ['asOn', 'As on', 'date', true],
      ['people', 'People staying (one per line: name, relation, mobile)', 'textarea', true],
      ['vehicles', 'Vehicles (number and type)', 'textarea'],
      ['notes', 'Notes', 'textarea']
    ],
    title: (d) => `Occupants as on ${d.asOn || ''}`
  },
  pastRental: {
    label: 'Past tenancy',
    short: 'Past tenancy',
    folder: 'Tenants and agreements',
    help: 'Earlier tenants of the unit, with their agreement and police verification if you have them.',
    fields: [
      ['licensee', 'Tenant names', 'text', true],
      ['from', 'From', 'date'], ['to', 'To', 'date'],
      ['regNo', 'Agreement registration no.', 'text'],
      ['police', 'Police intimation no.', 'text'],
      ['notes', 'Notes', 'textarea']
    ],
    title: (d) => `Past tenancy: ${d.licensee || ''}${d.from || d.to ? ` (${d.from || '…'} to ${d.to || '…'})` : ''}`
  },
  other: {
    label: 'Application or other document',
    short: 'Application / other',
    folder: 'Communication',
    help: 'An application, letter or any other document about your unit.',
    fields: [
      ['subject', 'Subject', 'text', true],
      ['date', 'Date', 'date'],
      ['notes', 'Details', 'textarea']
    ],
    title: (d) => d.subject || 'Application'
  }
};

export const DOC_STATUS = {
  submitted: { text: 'Submitted: hand over the physical copy at the office', cls: 'warn' },
  acknowledged: { text: 'Physical copy received', cls: 'ok' },
  returned: { text: 'Returned for correction', cls: 'due' }
};

/** Short lines of the details, for lists. */
export function detailLines(kind, d = {}) {
  const k = MEMBER_DOC_KINDS[kind];
  if (!k) return [];
  return k.fields.filter(([key]) => d[key] !== undefined && d[key] !== null && String(d[key]).trim() !== '')
    .map(([key, label]) => `${label.replace(/\s*\(.*\)$/, '')}: ${String(d[key]).trim()}`);
}
