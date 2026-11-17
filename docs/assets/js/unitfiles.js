/**
 * Unit files (3.12): electricity and property tax checks, scans in the Society's Google Drive,
 * and the per-unit backup ("<unit> unit file backup.json" in Units/<wing>/<unit>).
 */
import { driveCall, prepareFile, toBase64, safeName } from './drive.js';

/** Unit file records that can carry scans, and the Drive folder each goes to (same names as in Code.gs). */
export const RECORD_KINDS = ['members', 'tenants', 'comms', 'electricity', 'propertyTax'];
export const RECORD_FOLDER = { members: 'Members and shares', tenants: 'Tenants and agreements', comms: 'Communication',
  electricity: 'Electricity (MSEB)', propertyTax: 'Property tax (PMC)' };

export const TARIFFS = ['LT-I Residential', 'LT-II Non-residential / Commercial', 'LT-V Industrial', 'HT (high tension)', 'Other'];
export const TAX_USES = ['Residential', 'Non-residential / Commercial', 'Mixed (residential and commercial)', 'Open land / other'];
const COMMERCIAL_TARIFF = /LT-II|Non-residential|Commercial|Industrial|LT-V|^HT/i;
const COMMERCIAL_USE = /Non-residential|Commercial|Mixed/i;

const latest = (list, key) => [...(list || [])].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')))[0];

/**
 * Signs that a unit recorded as a Residential Flat is used commercially, from its latest electricity bill,
 * its latest property tax assessment and its current tenancies. Units already recorded as
 * "Residential, using as Commercial" (the Society has been informed) or as commercial premises are not flagged.
 */
export function commercialSigns(unit, { electricity = [], propertyTax = [], tenants = [] } = {}) {
  if ((unit?.type || 'Residential Flat') !== 'Residential Flat') return [];
  const out = [];
  const e = latest(electricity, 'billMonth');
  if (e && COMMERCIAL_TARIFF.test(e.tariff || '')) out.push(`MSEB bills the unit at the ${e.tariff} tariff (bill of ${monthText(e.billMonth)}, consumer no. ${e.consumerNo || '—'}).`);
  const t = latest(propertyTax, 'year');
  if (t && COMMERCIAL_USE.test(t.usage || '')) out.push(`PMC assesses the property tax as ${t.usage} (${t.year || 'year not given'}, property no. ${t.propertyNo || '—'}).`);
  for (const x of tenants.filter((r) => !r.to && /commercial|business/i.test(r.use || ''))) {
    out.push(`A current tenancy is for commercial use: ${x.name}${x.business ? ` (${x.business})` : ''}.`);
  }
  return out;
}

function monthText(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return ym || 'unknown month';
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Uploads new scans for one record to Units/<wing>/<unit>/<folder>. Returns [{ id, name, mime, size }]. */
export async function uploadUnitScans(fb, { unitId, unitLabel, wing, kind, title, files, onStep }) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    onStep?.(i + 1, files.length);
    const f = await prepareFile(files[i]);
    const ext = (f.name.match(/\.(\w+)$/)?.[1] || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
    const base = safeName(f.name.replace(/\.\w+$/, ''), 50);
    const name = `${unitLabel} ${safeName(title, 70)}${base ? ` - ${base}` : ''}.${ext}`;
    const r = await driveCall(fb, 'upload', { kind: 'unit', unitId, wing, record: kind, name, mimeType: f.type || 'application/octet-stream', data: await toBase64(f),
      note: `${unitLabel}: ${RECORD_FOLDER[kind]}; ${title}` });
    out.push({ id: r.file.id, name: r.file.name, mime: r.file.mime, size: r.file.size });
  }
  return out;
}

/* ---------------- backup ---------------- */

/** Firestore values → JSON (times as { "$time": ISO }), so a backup can be read anywhere and put back. */
export function toJSONValue(v) {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v?.toDate === 'function') return { $time: v.toDate().toISOString() };
  if (v instanceof Date) return { $time: v.toISOString() };
  if (Array.isArray(v)) return v.map(toJSONValue);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJSONValue(x)]));
  return v;
}
export function fromJSONValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(fromJSONValue);
  if (typeof v.$time === 'string' && Object.keys(v).length === 1) return new Date(v.$time);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromJSONValue(x)]));
}

/** Everything about one unit, as the signed-in person can read it. */
export async function unitBackup(fb, unitId, siteVersion) {
  const { F, db } = fb;
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...toJSONValue(d.data()) }));
  const sub = (name) => F.getDocs(F.collection(db, 'units', unitId, name)).then(rows).catch(() => []);
  const byUnit = (col) => F.getDocs(F.query(F.collection(db, col), F.where('unitId', '==', unitId))).then(rows).catch(() => []);
  const [unitSnap, records, ledger, pastReceipts, history, bills, payments, receiptCopies, memberDocs, agreements] = await Promise.all([
    F.getDoc(F.doc(db, 'units', unitId)),
    Promise.all(RECORD_KINDS.map(sub)).then((lists) => Object.fromEntries(RECORD_KINDS.map((k, i) => [k, lists[i]]))),
    sub('ledger'), sub('pastReceipts'), sub('history'), byUnit('bills'), byUnit('payments'), byUnit('receiptCopies'),
    sub('memberDocs'),
    F.getDocs(F.query(F.collection(db, 'memberAgreements'), F.where('unit', '==', unitId))).then(rows).catch(() => [])
  ]);
  if (!unitSnap.exists()) throw new Error(`Unit ${unitId} not found.`);
  return {
    format: 'sunshree-suntec-unit-file', formatVersion: 1, softwareVersion: siteVersion, savedAt: new Date().toISOString(),
    unitId, unit: toJSONValue(unitSnap.data()), records, ledger, bills, payments, receiptCopies, pastReceipts, tallyHistory: history,
    memberDocs, memberAgreements: agreements
  };
}

/** Saves the unit's backup in its Drive folder and notes when (driveBackups/<unitId>). */
export async function backupUnitToDrive(fb, { unitId, wing, siteVersion, byName }) {
  const data = await unitBackup(fb, unitId, siteVersion);
  const json = JSON.stringify(data, null, 1);
  const r = await driveCall(fb, 'backup', { unitId, wing, json });
  const { F, db } = fb;
  const counts = Object.fromEntries([...RECORD_KINDS.map((k) => [k, data.records[k].length]), ['ledger', data.ledger.length], ['bills', data.bills.length], ['payments', data.payments.length]]);
  await F.setDoc(F.doc(db, 'driveBackups', unitId), { at: F.serverTimestamp(), by: fb.auth.currentUser.uid, byName: byName || '', fileId: r.file.id, size: json.length, counts })
    .catch((err) => console.warn('backup note', err));
  return { fileId: r.file.id, size: json.length, counts };
}

/** Reads the unit's backup from Drive (committee) and compares it with what is here now. */
export async function compareWithBackup(fb, { unitId, wing }) {
  const r = await driveCall(fb, 'readBackup', { unitId, wing });
  const data = JSON.parse(r.json);
  if (data.format !== 'sunshree-suntec-unit-file' || data.unitId !== unitId) throw new Error('This backup is not for this unit.');
  const { F, db } = fb;
  const now = await Promise.all(RECORD_KINDS.map((k) => F.getDocs(F.collection(db, 'units', unitId, k)).then((s) => new Set(s.docs.map((d) => d.id))).catch(() => new Set())));
  const missing = {};
  RECORD_KINDS.forEach((k, i) => { missing[k] = (data.records?.[k] || []).filter((x) => x.id && !now[i].has(x.id)); });
  return { savedAt: data.savedAt, updated: r.updated, data, missing };
}

/** Puts back the records listed in `missing` with their original ids. */
export async function restoreMissing(fb, unitId, missing) {
  const { F, db } = fb;
  let n = 0;
  for (const k of RECORD_KINDS) {
    for (const rec of missing[k] || []) {
      const { id, ...rest } = rec;
      if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) continue;
      await F.setDoc(F.doc(db, 'units', unitId, k, id), { ...fromJSONValue(rest), restoredAt: F.serverTimestamp(), restoredBy: fb.auth.currentUser.uid });
      n++;
    }
  }
  return n;
}
