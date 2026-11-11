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
