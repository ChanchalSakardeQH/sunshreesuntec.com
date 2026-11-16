// Shared helpers: data loading and money formatting.

let duesPromise;
let noticesPromise;

export function getDues() {
  duesPromise ??= fetch('data/dues.json', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Could not load dues (${r.status})`);
    return r.json();
  });
  return duesPromise;
}

export function getNotices() {
  noticesPromise ??= fetch('data/notices.json', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Could not load notices (${r.status})`);
    return r.json();
  });
  return noticesPromise;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const fmt = (n) => inr.format(Math.round(n));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')) : iso;
  return d.toLocaleDateString('en-IN', opts);
}

/** Member outstanding cell: null = not listed, negative = credit balance. */
export function ownerCell(n) {
  if (n === null || n === undefined) return '<span class="not-listed">Not listed</span>';
  if (n < 0) return `<span class="amt-credit">${fmt(-n)} Cr</span>`;
  if (n === 0) return '0';
  return `<span class="amt-due">${fmt(n)}</span>`;
}

export function bpmCell(n) {
  return n ? fmt(n) : '<span class="muted">—</span>';
}

export function totals(units) {
  let due = 0, credit = 0, bpm = 0, notListed = 0;
  for (const u of units) {
    if (u.owner === null || u.owner === undefined) notListed++;
    else if (u.owner > 0) due += u.owner;
    else credit += -u.owner;
    bpm += u.bpm || 0;
  }
  return { due, credit, bpm, notListed, count: units.length };
}

export const normalise = (s) => String(s).toLowerCase().replace(/[\s\-.]/g, '');

/* ---------- Who a registered person is, for their unit (3.5) ---------- */
export const RELATIONS = {
  owner: 'Owner',
  jointOwner: 'Joint owner',
  family: 'Family member of the owner',
  tenant: 'Tenant',
  caretaker: 'Caretaker / agent'
};
export const relationLabel = (r) => RELATIONS[r] || 'Owner';
/** What an approved person can see: 'full' = their unit's account and the Society's accounts; 'basic' = Society accounts and documents only. */
export const ACCESS = { full: 'Unit account and Society documents', basic: 'Society documents only (no unit account)' };
/** Suggested access when approving: owners and their family see the unit account; tenants and caretakers start with documents only. */
export const defaultAccess = (relation) => (['tenant', 'caretaker'].includes(relation) ? 'basic' : 'full');
