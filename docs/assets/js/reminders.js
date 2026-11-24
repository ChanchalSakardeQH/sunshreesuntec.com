/**
 * 3.16: reminders to registered members (agreement not accepted, not visiting the portal) and invitations to owners and
 * tenants whose contact is in the unit file but who haven't registered. Sent by WhatsApp or email from the committee
 * member's own phone or computer, or by email from the Society's account (Drive script version 6).
 */
export const REMINDER_SCRIPT_NEEDED = 6;

export const REMINDER_KINDS = {
  agreement: {
    label: 'Agreement not accepted',
    subject: 'Sunshree Suntec: please accept the member portal agreement for {unit}',
    body: 'Dear {name},\n\nThe Society has published the Member Portal Use Agreement. Please sign in at {link} with {email} and accept it. Your bills, receipts, balance and the Society’s notices open once it is accepted, and a copy of the agreement is emailed to you for your records.\n\n{sign}'
  },
  visit: {
    label: 'Not visiting the portal',
    subject: 'Sunshree Suntec: your bills, receipts and notices for {unit}',
    body: 'Dear {name},\n\nThis is a reminder to visit the Society’s portal regularly: {link}\n\nSign in with {email} to see your bills, receipts and balance for {unit} and the Society’s notices. Please also upload your unit’s documents (sale deed and Index II, rental agreement and police verification if let out, and the list of occupants) under “My unit’s documents”, and hand over self-attested copies at the office.\n\n{sign}'
  },
  invite: {
    label: 'Not registered yet',
    subject: 'Sunshree Suntec: invitation to register for {unit} on the Society’s portal',
    body: 'Dear {name},\n\nSunshree Suntec CHS now keeps members’ bills, receipts, balances, notices and unit documents on the Society’s portal. You are invited to register for {unit}:\n\n1. Open {link}\n2. Press Register, sign in with Google (or with an email and password) and choose unit {unit}.\n3. The Managing Committee checks the request against the Society’s records and approves it.\n\nPlease register with {email} so the request can be matched with the Society’s records quickly.\n\n{sign}'
  }
};

export const SITE_MEMBER_LINK = 'https://www.sunshreesuntec.com/#member';

/** The message for one person. Missing details are replaced by sensible words rather than left blank. */
export function fillReminder(tpl, p, sender) {
  const first = String(p.name || '').replace(/^(mr|mrs|ms|dr|shri|smt)\.?\s+/i, '').split(' ')[0] || 'Member';
  const sign = `Regards,\n${sender?.name || 'Managing Committee'}${sender?.role ? `, ${sender.role}` : ''}\nManaging Committee, Sunshree Suntec Co-op. Housing Society Ltd.`;
  const vals = { name: first, fullname: p.name || 'Member', unit: p.unitLabel || p.unit || 'your unit', email: p.email || 'your email address',
    mobile: p.mobile ? `+91 ${p.mobile}` : 'your mobile number', link: SITE_MEMBER_LINK, sign };
  const fill = (t) => String(t || '').replace(/\{(name|fullname|unit|email|mobile|link|sign)\}/g, (_, k) => vals[k]);
  return { subject: fill(tpl.subject), body: fill(tpl.body) };
}

/** Indian mobile → number for wa.me (91XXXXXXXXXX), or '' if it doesn't look like one. */
export function waNumber(mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return d;
  if (/^0[6-9]\d{9}$/.test(d)) return `91${d.slice(1)}`;
  return '';
}
export const tenDigits = (mobile) => { const w = waNumber(mobile); return w ? w.slice(2) : ''; };
export const validEmail = (e) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[A-Za-z]{2,}$/.test(String(e || '').trim());
export const waLink = (mobile, m) => `https://wa.me/${waNumber(mobile)}?text=${encodeURIComponent(`${m.subject}\n\n${m.body}`)}`;
export const mailLink = (email, m) => `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;

/** 3.22: the invitation for someone the committee pre-registered by email. */
export const PREREG_MESSAGE = {
  subject: 'Sunshree Suntec: your access to the Society’s portal for {unit} is ready',
  body: 'Dear {name},\n\nThe Managing Committee has registered {email} for {unit} on the Society’s portal, from the Society’s records. To start:\n\n1. Open {link}\n2. Press “Sign in with Google” and choose {email}.\n3. Confirm your mobile number and accept the member portal agreement.\n\nYou will then see your bills, receipts and balance and the Society’s notices, and can upload your unit’s documents.\n\n{sign}'
};
