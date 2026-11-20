/**
 * 3.19: the Managing Committee on the portal — posts, the undertaking each committee member accepts at their first
 * sign-in, and the M-20 bond (Rule 58A of the MCS Rules 1961: every elected committee member executes a bond in
 * Form M-20 on stamp paper within fifteen days of taking office; the Secretary keeps the bonds and informs the
 * Registrar within fifteen days of the committee's formation).
 */
export const POSTS = ['Chairman', 'Vice-Chairman', 'Secretary', 'Joint Secretary', 'Treasurer', 'Committee member'];
/** Only one person holds each of these at a time. */
export const SINGLE_POSTS = ['Chairman', 'Vice-Chairman', 'Secretary', 'Joint Secretary', 'Treasurer'];
export const M20_DAYS = 15;

export const DEFAULT_UNDERTAKING = {
  version: 1,
  title: 'Undertaking by a Member of the Managing Committee',
  intro: 'I have been elected or co-opted to the Managing Committee of Sunshree Suntec Co-operative Housing Society Ltd. Before I use the Society’s accounts and records on this portal, I give this undertaking to the Society and its members.',
  common: [
    'I will act in good faith in the interest of the Society and all its members, within the Maharashtra Co-operative Societies Act 1960, the Rules under it, the Society’s registered bye-laws and the resolutions of the General Body.',
    'I will execute the bond in Form M-20 on stamp paper within fifteen days of taking office (Rule 58A of the MCS Rules 1961) and hand it to the Secretary. I understand that the members of the committee are jointly and severally responsible for the decisions the committee takes during its term.',
    'I will take decisions only in duly called committee meetings, recorded in the minutes, and will not act alone beyond the powers the bye-laws or the committee give me.',
    'I will declare any personal interest (myself, a relative, a business, a tenant or a vendor) in a matter before the committee, and will not take part in deciding it.',
    'I will keep members’ personal data and the Society’s records confidential, use them only for the Society’s work, and not copy, forward or publish them, including on social media (Digital Personal Data Protection Act, 2023).',
    'I will not use my office for personal gain, will not accept gifts or favours from vendors, contractors or members in connection with the Society’s work, and will follow the purchase and expense procedures approved by the committee.',
    'I will pay my own dues to the Society on time. I understand that a member in default may be disqualified from the committee under the bye-laws.',
    'I will attend committee meetings regularly and the training for committee members required under the Rules.',
    'I understand that every action I take on this portal is recorded with my name and the time.',
    'When my term ends or I resign, I will hand over all records, documents, keys, cheque books and pending work to the committee within the time fixed by the Act and the bye-laws.'
  ],
  roles: {
    'Chairman': [
      'Preside over the General Body and Managing Committee meetings and conduct them in order.',
      'Supervise the carrying out of the committee’s decisions; act for the committee in an emergency only as far as the bye-laws allow, and report it at the next committee meeting.',
      'Sign cheques and bank instructions jointly with the Secretary or the Treasurer, as the bye-laws provide.',
      'Decide, with the Secretary and the Treasurer, members’ applications to view the Society’s accounts (Section 32 of the Act), refusing only with a reason.'
    ],
    'Vice-Chairman': ['Act for the Chairman in their absence, with the same care and within the same limits.'],
    'Secretary': [
      'Keep the statutory registers, the member and share records, and the minutes of meetings.',
      'Issue notices and agendas of meetings, record the minutes, and carry out the committee’s resolutions.',
      'Deal with correspondence, members’ applications and complaints within the time fixed by the bye-laws.',
      'Arrange the statutory audit and file the returns with the Registrar on time.',
      'Receive the committee members’ M-20 bonds, keep them in the Society’s records, and inform the Registrar within fifteen days of the committee’s formation.',
      'See that the annual general meeting is held and the audit completed on time.'
    ],
    'Joint Secretary': ['Assist the Secretary and act for them in their absence.'],
    'Treasurer': [
      'Keep the Society’s accounts correct and up to date, with every receipt and payment supported by a document.',
      'See that members’ dues are billed and recovered, and report defaulters to the committee.',
      'Sign cheques jointly with the Secretary as the bye-laws provide; keep the bank accounts reconciled and the Society’s money invested only as the Act and bye-laws allow.',
      'Present the accounts to the committee every month and assist the auditor.',
      'Decide, with the Chairman and the Secretary, members’ applications to view the Society’s accounts.'
    ],
    'Committee member': ['Take part in committee meetings and in the committee’s collective decisions, and carry out the work the committee gives me.']
  },
  closing: 'I give this undertaking freely. A copy is emailed to me and kept in the Society’s records.'
};

const day = 864e5;
/** 'YYYY-MM-DD' (India) of a Date. */
export const isoDay = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const addDays = (iso, n) => isoDay(new Date(new Date(`${iso}T12:00:00+05:30`).getTime() + n * day));
export const addYears = (iso, n) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
export const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00+05:30`) - new Date(`${a}T12:00:00+05:30`)) / day);
export const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** M-20 status of a committee record: submitted, due (with days left), overdue, or unknown (date of taking office not recorded). */
export function m20Status(rec, today = isoDay(new Date())) {
  if (rec.m20?.submittedOn) return { state: 'submitted', on: rec.m20.submittedOn };
  if (!rec.tookOfficeOn) return { state: 'unknown' };
  const due = addDays(rec.tookOfficeOn, M20_DAYS), left = daysBetween(today, due);
  return { state: left >= 0 ? 'due' : 'overdue', due, left };
}

/** The undertaking for one post, as stored with the acceptance (so the copy always shows what was accepted). */
export function undertakingFor(u, post) {
  return { title: u.title, intro: u.intro, roleLines: u.roles?.[post] || u.roles?.['Committee member'] || [], common: u.common || [], closing: u.closing, version: u.version };
}
