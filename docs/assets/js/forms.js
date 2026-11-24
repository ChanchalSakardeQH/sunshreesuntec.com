/**
 * 3.24: the forms (appendices) of the model bye-laws of co-operative housing societies, with a short plain-language
 * note on each (what it is for, the bye-law / rule it is under, who signs, stamp paper) and the tasks members come
 * for (transfer on death or sale, new membership, letting, nomination…), each with the forms it needs.
 *
 * The forms themselves are kept in the Library (libraryDocs, with formKey = the key below) in the Society's Drive.
 * Keys are the file names of the Society's set (appendix-15.pdf → 'appendix-15'). Note: the numbering of the
 * appendices differs between editions of the model bye-laws for the first ten or so (e.g. the undertaking to use the
 * flat is Appendix 4 in this set and "Appendix 3 / Form No. 3" in the 2014 booklet); `aka` gives the other number.
 *
 * The notes are a guide, not legal advice; fees and stamp duty change (the 2026 amendment of the MCS Rules, stamp
 * duty notifications), so the Society's current requirements prevail.
 */
export const FORMS = {
  'appendix-1': { no: 'Appendix 1', title: 'Share certificate', use: 'The Society’s share certificate issued to a member. Filled in and signed by the Society, not by members.', law: 'Bye-laws (share certificate)', signedBy: 'Chairman, Secretary and a committee member, under the Society’s seal', society: true },
  'appendix-2': { no: 'Appendix 2', aka: 'Appendix 1 in the 2014 booklet', title: 'Membership application for a minor nominee or heir, through the guardian', use: 'A member has died and the nominee or heir is a minor: the guardian or legal representative applies on the minor’s behalf.', law: 'Bye-law 17(b); MCS Rules, Rule 20', signedBy: 'Guardian / legal representative', attach: 'Death certificate' },
  'appendix-3': { no: 'Appendix 3', aka: 'Appendix 2 in the 2014 booklet', title: 'Membership application by an individual', use: 'A person applying to become a member of the Society directly (for example a first purchaser).', law: 'Bye-laws 19(B) and 66(v)', signedBy: 'Applicant' },
  'appendix-4': { no: 'Appendix 4', aka: 'Appendix 3 / Form No. 3 in the 2014 booklet', title: 'Undertaking by the prospective member to use the flat for its purpose', use: 'Every new member (by purchase, nomination or inheritance) undertakes to use the flat for the purpose for which it is allotted.', law: 'Bye-laws 17(b) and 19(A)(iv)', signedBy: 'New member', stamp: '₹100 stamp paper (as printed; the Society may ask for the current value)' },
  'appendix-5': { no: 'Appendix 5', aka: 'Form No. 4 in the 2014 booklet', title: 'Undertaking by the person on whom a non-earning member depends', use: 'When the new member has no income of their own: the person they depend on undertakes to pay the Society’s dues.', law: 'Bye-law 19(A)(v)', signedBy: 'The person supporting the new member', stamp: '₹100 stamp paper (as printed)' },
  'appendix-6': { no: 'Appendix 6', title: 'Membership application by a firm, company, trust or other body corporate', use: 'A company, firm, public trust or other body applying for membership.', law: 'Bye-law 19(C)', signedBy: 'Authorised signatory' },
  'appendix-7': { no: 'Appendix 7', aka: 'Appendix 5 in the 2014 booklet', title: 'Associate (joint) membership by an individual, with an existing member', use: 'Adding a person (e.g. spouse or child) to hold the shares jointly with an existing member.', law: 'Bye-laws 19(B) and 19(C)', signedBy: 'Applicant and the member' },
  'appendix-8': { no: 'Appendix 8', title: 'Associate membership when both persons apply together', use: 'Two persons applying at the same time, one as member and the other as associate member.', law: 'Bye-law 19(B)', signedBy: 'Both applicants' },
  'appendix-9': { no: 'Appendix 9', aka: 'Appendix 6 in the 2014 booklet', title: 'Associate membership by a firm or company with an existing member', use: 'A firm, company or body corporate becoming associate member with an existing member.', law: 'Bye-law 19(B)', signedBy: 'Authorised signatory and the member' },
  'appendix-10': { no: 'Appendix 10', title: 'Membership / associate membership by a person and a firm together', use: 'A person and a firm, company or body corporate applying together.', law: 'Bye-law 19(B)', signedBy: 'Both applicants' },
  'appendix-10a': { no: 'Appendix 10A', title: 'No-objection and undertaking by the member for the associate member to join the committee', use: 'An associate member wants to stand for or serve on the Managing Committee: the original member gives this no-objection.', law: 'Bye-law 118(v)', signedBy: 'Original member' },
  'appendix-11': { no: 'Appendix 11', title: 'Nominal membership by a tenant, licensee or caretaker', use: 'A tenant (leave and licence), sub-tenant or caretaker applies to be a nominal member. Nominal members have no share in the Society’s property and no vote.', law: 'Bye-laws 20 and 43(2)(ii)', signedBy: 'Tenant / licensee', attach: 'Copy of the leave and licence agreement' },
  'appendix-12': { no: 'Appendix 12', title: 'Letter of allotment of the flat', use: 'The Society’s letter allotting a flat to a member. Issued by the Society.', law: 'Bye-laws 24 and 76(a)', signedBy: 'Society', society: true },
  'appendix-13': { no: 'Appendix 13', title: 'Notice of resignation of membership', use: 'A member leaving the Society gives three months’ notice; dues are cleared and the share certificate surrendered. Asked of the outgoing member in a sale.', law: 'Bye-law 27(a)', signedBy: 'Outgoing member' },
  'appendix-14': { no: 'Appendix 14', title: 'Nomination (in triplicate)', use: 'A member names who should get their shares and interest in the flat after their death. Every member should file one; a new member files a fresh one.', law: 'Bye-law 32; MCS Rules, Rule 25; MCS Act, Section 154B-13', signedBy: 'Member, with two witnesses', attach: 'Three copies' },
  'appendix-15': { no: 'Appendix 15', aka: 'Form No. 15', title: 'Membership application by the nominee(s) of a deceased member', use: 'A member has died leaving a nomination: the nominee applies for membership and the transfer of the shares and interest.', law: 'Bye-law 34; MCS Act, Section 154B-13', signedBy: 'Nominee(s)', attach: 'Copy of the death certificate; indemnity bond (Appendix 18) if there are several nominees; undertaking (Appendix 4); entrance fee' },
  'appendix-16': { no: 'Appendix 16', title: 'Public notice inviting claims or objections (death without nomination)', use: 'Published by the Society in two local newspapers when a member died without a nomination, inviting heirs and others to claim or object.', law: 'Bye-law 35', signedBy: 'Society (Secretary)', society: true },
  'appendix-17': { no: 'Appendix 17', title: 'Membership application by the heir of a deceased member', use: 'A member has died without a nomination: the heir chosen by all heirs applies for membership and the transfer.', law: 'Bye-law 35; MCS Act, Section 154B-13', signedBy: 'Heir', attach: 'Death certificate; affidavit of the heirs choosing the applicant (original); indemnity bond (Appendix 19); entrance fee' },
  'appendix-18': { no: 'Appendix 18', title: 'Indemnity bond (more than one nominee)', use: 'Given by the nominee who applies, on behalf of all the nominees, protecting the Society against later claims.', law: 'Bye-law 34', signedBy: 'Applying nominee', stamp: '₹200 stamp paper (as printed)' },
  'appendix-19': { no: 'Appendix 19', title: 'Indemnity bond (no nomination)', use: 'Given by the heir who applies when there was no nomination, protecting the Society against claims by other heirs.', law: 'Bye-law 35', signedBy: 'Applying heir', stamp: '₹200 stamp paper (as printed)' },
  'appendix-20-1': { no: 'Appendix 20(1)', aka: 'Form 20A', title: 'Notice of intention to transfer shares and interest', use: 'The selling member tells the Society they intend to transfer the flat, to whom and for what price, with the buyer’s consent.', law: 'Bye-law 37(a); MCS Rules, Rule 24', signedBy: 'Seller (transferor)', attach: 'Buyer’s consent (Appendix 20(2))' },
  'appendix-20-2': { no: 'Appendix 20(2)', aka: 'Form 20B', title: 'Consent of the proposed transferee', use: 'The buyer consents to the transfer of the shares and interest to them.', law: 'Bye-law 37(a); MCS Rules, Rule 24(1)(b)', signedBy: 'Buyer (transferee)' },
  'appendix-21': { no: 'Appendix 21', aka: 'Form 21-1', title: 'Application for transfer by the transferor (individual)', use: 'The seller applies for the transfer of the shares and interest to the buyer, with the transfer fee, after the notice of intention.', law: 'Bye-law 38(e)(i); MCS Rules, Rule 24(1)(b)', signedBy: 'Seller (transferor)', attach: 'Buyer’s membership application (Appendix 23); transfer fee and any premium' },
  'appendix-22': { no: 'Appendix 22', title: 'Application for transfer by the transferor (body corporate)', use: 'As Appendix 21, when the seller is a company or other body.', law: 'Bye-law 38(e)(i)', signedBy: 'Authorised signatory of the seller' },
  'appendix-23': { no: 'Appendix 23', aka: 'Form 23', title: 'Membership application by the proposed transferee (individual)', use: 'The buyer applies to become a member in place of the seller.', law: 'Bye-law 38(e)(ii)', signedBy: 'Buyer (transferee)', attach: 'Entrance fee; details of other property in the area' },
  'appendix-24': { no: 'Appendix 24', title: 'Membership application by the proposed transferee (body corporate)', use: 'As Appendix 23, when the buyer is a company or other body.', law: 'Bye-law 38(e)(ii)', signedBy: 'Authorised signatory of the buyer' },
  'appendix-25': { no: 'Appendix 25(1) and 25(2)', aka: 'Form 25', title: 'Undertaking about registration of the transfer (Income-tax)', use: '25(1): given jointly by seller and buyer about registering the transfer under the Income-tax Act. 25(2): by a person seeking direct admission.', law: 'Bye-law 38(e)(xi) (25(1)); bye-law 19A (25(2))', signedBy: 'Seller and buyer (25(1))', stamp: '₹100 stamp paper (as printed)' },
  'appendix-26': { no: 'Appendix 26', aka: 'Form 26', title: 'Society’s intimation to the new member', use: 'The Society’s letter telling the new member that the transfer and membership are approved, their name entered in the I and J registers, with the endorsed share certificate.', law: 'Bye-law 40', signedBy: 'Society (Secretary)', stamp: '₹100 stamp paper (as printed)', society: true },
  'appendix-27': { no: 'Appendix 27', title: 'Permission to let the flat (leave and licence, sub-let, caretaker)', use: 'A member asks the Society’s permission before giving the flat on rent / leave and licence or to a caretaker.', law: 'Bye-law 43(2)(i)', signedBy: 'Member', attach: 'Copy of the registered agreement; tenant’s nominal membership application (Appendix 11)' },
  'appendix-28': { no: 'Appendix 28', aka: 'Appendix 27 in the 2014 booklet', title: 'Permission to hold more than one flat', use: 'A member who holds or wants to hold another flat in the Society asks for permission.', law: 'Bye-law 62', signedBy: 'Member' },
  'appendix-29': { no: 'Appendix 29 (Form M-20)', title: 'Bond by an elected committee member (Form M-20)', use: 'Every elected Managing Committee member signs this bond within 15 days of taking office.', law: 'MCS Rules, Rule 58A', signedBy: 'Committee member', committee: true },
  'model-bye-laws': { no: 'Model bye-laws', title: 'Model bye-laws of co-operative housing societies (2014)', use: 'The bye-laws under which the forms above are prescribed. The Society’s registered bye-laws prevail.', law: 'MCS Act, 1960', category: 'Bye-laws' },
  'maharashtra-cooperative-society-rules-1961': { no: 'MCS Rules', title: 'Maharashtra Co-operative Societies Rules, 1961', use: 'The Rules under the Act (as amended, including the 2026 amendment for housing societies).', law: 'MCS Act, 1960', category: 'Rules' },
  'new-housing-society-election-rules': { no: 'Election rules', title: 'Housing society election rules (Government Gazette, 2014)', use: 'How housing society committee elections are held.', law: 'MCS Act, 1960', category: 'Rules', lang: 'Marathi' }
};

/** What members come to do, with the forms each needs (in order). `if` explains when a form applies. */
export const TASKS = [
  { key: 'death-nominee', title: 'A member has died and had made a nomination', law: 'MCS Act, Section 154B-13; bye-law 34',
    intro: 'The nominee applies for membership and the transfer of the deceased member’s shares and interest in the flat. Apply within six months of the death if possible. The Society may admit the nominee provisionally until the legal heirs are settled.',
    forms: [['appendix-15'], ['appendix-18', 'if there is more than one nominee'], ['appendix-2', 'if the nominee is a minor'], ['appendix-4'], ['appendix-5', 'if the new member has no income of their own'], ['appendix-14', 'the new member’s own nomination']],
    also: 'Copy of the death certificate, copy of the nomination on record, the original share certificate, entrance fee.', transfer: 'death' },
  { key: 'death-heir', title: 'A member has died without a nomination', law: 'MCS Act, Section 154B-13; bye-law 35',
    intro: 'The Society publishes a notice inviting claims (Appendix 16). The heirs choose one of them, by affidavit, to apply; that heir gives an indemnity bond. The Society can ask for a will, succession certificate or other proof of heirship.',
    forms: [['appendix-16', 'published by the Society'], ['appendix-17'], ['appendix-19'], ['appendix-2', 'if the heir is a minor'], ['appendix-4'], ['appendix-14', 'the new member’s own nomination']],
    also: 'Death certificate, affidavit of all heirs (original), proof of heirship as asked, the original share certificate, entrance fee.', transfer: 'death' },
  { key: 'sale', title: 'Selling or buying a flat (transfer of membership)', law: 'Bye-laws 37–40; MCS Rules, Rule 24',
    intro: 'The seller gives notice of the intended transfer with the buyer’s consent, then applies for the transfer with the transfer fee; the buyer applies for membership. When the committee approves, the share certificate is endorsed in the buyer’s name and the Society informs them (Appendix 26).',
    forms: [['appendix-20-1'], ['appendix-20-2'], ['appendix-21'], ['appendix-22', 'instead of 21, if the seller is a company'], ['appendix-23'], ['appendix-24', 'instead of 23, if the buyer is a company'], ['appendix-25'], ['appendix-4'], ['appendix-13', 'from the seller'], ['appendix-14', 'the buyer’s nomination'], ['appendix-26', 'issued by the Society at the end']],
    also: 'Copy of the registered sale deed, the original share certificate, no-dues from the Society, transfer fee, entrance fee.', transfer: 'sale' },
  { key: 'join', title: 'Becoming a member directly', law: 'Bye-law 19',
    intro: 'For someone admitted directly rather than by transfer (for example a first purchaser).',
    forms: [['appendix-3'], ['appendix-6', 'instead, for a company or trust'], ['appendix-4'], ['appendix-5', 'if the applicant has no income of their own'], ['appendix-25', '25(2)'], ['appendix-14']] },
  { key: 'joint', title: 'Adding a joint (associate) member', law: 'Bye-law 19(B)',
    intro: 'A spouse, child or other person can hold the shares jointly with the member as an associate member.',
    forms: [['appendix-7'], ['appendix-8', 'if both apply together'], ['appendix-9', 'for a firm or company'], ['appendix-10', 'a person and a firm together'], ['appendix-10a', 'if the associate member is to join the committee']] },
  { key: 'letting', title: 'Giving the flat on rent (leave and licence) or to a caretaker', law: 'Bye-law 43',
    intro: 'Ask the Society’s permission, with a copy of the registered agreement; the tenant applies for nominal membership. Police verification of the tenant is also required.',
    forms: [['appendix-27'], ['appendix-11', 'by the tenant']] },
  { key: 'nominate', title: 'Making or changing a nomination', law: 'Bye-law 32; MCS Rules, Rule 25',
    intro: 'Every member should file a nomination so the flat can be transferred smoothly. A new nomination replaces the earlier one.', forms: [['appendix-14']] },
  { key: 'resign', title: 'Resigning from membership', law: 'Bye-law 27', intro: 'Three months’ notice, with the Society’s dues cleared.', forms: [['appendix-13']] },
  { key: 'second-flat', title: 'Holding more than one flat', law: 'Bye-law 62', intro: 'Permission from the Society to hold another flat.', forms: [['appendix-28']] },
  { key: 'committee', title: 'Elected to the Managing Committee', law: 'MCS Rules, Rule 58A', intro: 'The M-20 bond within 15 days of taking office (recorded under Staff → Managing Committee).', forms: [['appendix-29'], ['appendix-10a', 'for an associate member']] }
];

/**
 * The documents of the standard transfer lists (transfers.js) and the forms they are. Society-specific numbering:
 * "Form No. 3 / 03" and "Form No. 4" follow the 2014 booklet (Appendix 3 = the undertaking, Form No. 4 = the
 * dependant's undertaking), which are appendix-4 and appendix-5 in the Society's set.
 */
export const CHECKLIST_FORMS = {
  d1: 'appendix-15', d3: 'appendix-4', d4: 'appendix-5', d5: 'appendix-14',
  s3: 'appendix-13', s5: 'appendix-20-1', s6: 'appendix-20-2', s7: 'appendix-21', s8: 'appendix-23', s9: 'appendix-25', s10: 'appendix-26', s11: 'appendix-4'
};

/** The form key of an uploaded file name (appendix-15.pdf, Appendix 15.pdf, appendix_20_1.pdf …), or ''. */
export function formKeyOf(fileName) {
  const stem = String(fileName || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').trim().replace(/[\s_]+/g, '-').replace(/[()]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
  if (FORMS[stem]) return stem;
  const m = stem.match(/^(?:appendix|app|form)-?(?:no-?)?(\d+[a-z]?)(?:-(\d))?$/);
  if (m) { const k = `appendix-${m[1]}${m[2] ? `-${m[2]}` : ''}`; if (FORMS[k]) return k; }
  return '';
}

/** One line for the form: number (also known as), law, who signs, stamp paper. */
export function formLine(f) {
  if (!f) return '';
  return [f.no + (f.aka ? ` (${f.aka})` : ''), f.law && `Under ${f.law}`, f.signedBy && `Signed by: ${f.signedBy}`, f.stamp].filter(Boolean).join(' · ');
}

/** The guide of a library entry: its own (edited) fields, else the catalogue's. */
export function guideOf(entry) {
  const base = FORMS[entry?.formKey] || {};
  const g = entry?.guide || {};
  return { no: g.no || base.no || '', aka: g.aka ?? base.aka ?? '', title: base.title || entry?.title || '', use: g.use || base.use || '', law: g.law || base.law || '',
    signedBy: g.signedBy || base.signedBy || '', stamp: g.stamp ?? base.stamp ?? '', attach: g.attach ?? base.attach ?? '', society: Boolean(base.society) };
}
