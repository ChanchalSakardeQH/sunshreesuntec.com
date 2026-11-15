// Society document archive and audited accounts (2011-12 onwards).
//
// Documents (audit reports, AGM minutes …) are stored in the database itself, split into parts of
// under 1 MB, so they stay private: the security rules let only approved members and the
// accounts team read them.
//
//   archiveDocs/{id}              { title, category, fy, pages, bytes, parts, note, uploadedAt, uploadedBy }
//   archiveDocs/{id}/parts/{n}    { n, data: Bytes }
//   auditYears/{fy}               audited figures for one financial year (see importAuditedAccounts)

import { fyList, fyBounds } from './billing-core.js';

const PART = 900 * 1024;          // bytes per part (document size limit is 1 MiB)
export const MAX_DOC_MB = 15;     // keep uploads small; scans should be compressed first

export const ARCHIVE_CATEGORIES = ['Audited accounts', 'AGM minutes', 'Notices and circulars', 'Legal and registration', 'Other'];

export async function listArchive({ F, db }) {
  const s = await F.getDocs(F.collection(db, 'archiveDocs'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (b.fy || '').localeCompare(a.fy || '') || (a.title || '').localeCompare(b.title || ''));
}

/** Uploads a PDF in parts, then writes the index record last (so a half-finished upload never shows). */
export async function uploadArchiveDoc(fb, file, meta, onProgress = () => {}) {
  const { F, db, auth } = fb;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF file.');
  if (file.size > MAX_DOC_MB * 1024 * 1024) throw new Error(`This file is ${(file.size / 1048576).toFixed(1)} MB. Keep documents under ${MAX_DOC_MB} MB (compress scans first).`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const pages = (new TextDecoder('latin1').decode(buf).match(/\/Type\s*\/Page[^s]/g) || []).length || null;
  const slug = String(meta.title || file.name).toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const id = `${slug}-${Date.now().toString(36)}`;
  const parts = Math.ceil(buf.length / PART);
  for (let i = 0; i < parts; i++) {
    await F.setDoc(F.doc(db, 'archiveDocs', id, 'parts', String(i).padStart(3, '0')), {
      n: i, data: F.Bytes.fromUint8Array(buf.subarray(i * PART, (i + 1) * PART))
    });
    onProgress(i + 1, parts);
  }
  await F.setDoc(F.doc(db, 'archiveDocs', id), {
    title: meta.title || file.name.replace(/\.pdf$/i, ''), category: meta.category || 'Other', fy: meta.fy || '',
    note: meta.note || '', fileName: file.name, pages, bytes: buf.length, parts,
    uploadedAt: F.serverTimestamp(), uploadedBy: auth.currentUser.uid
  });
  return id;
}

/** Rebuilds the PDF from its parts and returns an object URL (caller revokes it). */
export async function openArchiveDoc({ F, db }, doc, onProgress = () => {}) {
  const s = await F.getDocs(F.collection(db, 'archiveDocs', doc.id, 'parts'));
  const parts = s.docs.map((d) => d.data()).sort((a, b) => a.n - b.n);
  if (parts.length !== doc.parts) throw new Error('This document is incomplete. Ask the committee to upload it again.');
  onProgress(parts.length, doc.parts);
  const blob = new Blob(parts.map((p) => p.data.toUint8Array()), { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export async function deleteArchiveDoc({ F, db }, doc) {
  for (let i = 0; i < (doc.parts || 0); i++) await F.deleteDoc(F.doc(db, 'archiveDocs', doc.id, 'parts', String(i).padStart(3, '0')));
  await F.deleteDoc(F.doc(db, 'archiveDocs', doc.id));
}

/* ---------- audited accounts ---------- */

export async function loadAuditYears({ F, db }) {
  const s = await F.getDocs(F.collection(db, 'auditYears')).catch(() => ({ docs: [] }));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.fy.localeCompare(b.fy));
}

/** Writes one auditYears/{fy} document per audited year from the prepared data file. */
export async function importAuditedAccounts(fb, data, onProgress = () => {}) {
  const { F, db, auth } = fb;
  const years = data.years || [];
  for (const [i, y] of years.entries()) {
    await F.setDoc(F.doc(db, 'auditYears', y.fy), { ...y, source: data.source || '', importedAt: F.serverTimestamp(), importedBy: auth.currentUser.uid });
    onProgress(i + 1, years.length);
  }
  return years.length;
}

/** Year-end balance of one unit in each audited year: [{ fy, asOn, amount (Dr +, Cr −), name }]. */
export function auditedBalancesFor(unitId, years) {
  return years.map((y) => {
    const r = (y.dues || []).find((d) => d.unitId === unitId);
    return r ? { fy: y.fy, asOn: y.to, amount: r.amount, name: r.name } : null;
  }).filter(Boolean);
}

/** Names a unit was listed under in each year's audited list of members. */
export function memberNamesFor(unitId, years) {
  const out = [];
  for (const y of years) {
    const m = (y.members || []).find((x) => x.unitId === unitId);
    if (m) out.push({ fy: y.fy, name: m.name });
  }
  return out;
}

/** Collapses the yearly names into periods: [{ name, from, to }] (first and last year listed). */
export function namePeriods(list) {
  const out = [];
  for (const r of list) {
    const last = out[out.length - 1];
    const same = last && last.name.toLowerCase().replace(/[^a-z]/g, '') === r.name.toLowerCase().replace(/[^a-z]/g, '');
    if (same) last.to = r.fy; else out.push({ name: r.name, from: r.fy, to: r.fy });
  }
  return out;
}

/**
 * A unit's balance on 31 March of every year: audited years first (from the member-wise lists),
 * then each later year from the unit ledger (Tally history + these accounts). The current year
 * shows the balance so far. amount: Dr +, Cr −; null = not available.
 */
export function yearEndRows(unitId, audits, entries, today, takeover = '2026-09-30') {
  const shop = /^(B|GF)-/.test(unitId);
  const rows = audits.map((a) => {
    const r = (a.dues || []).find((d) => d.unitId === unitId);
    const known = r || a.duesComplete || shop;
    return { fy: a.fy, asOn: a.to, source: 'Audited', name: r?.name || '', amount: r ? r.amount : known ? 0 : null,
      note: known ? '' : 'Residential list missing from this year’s audit file' };
  });
  const lastAudit = audits.length ? audits[audits.length - 1].to : '';
  for (const fy of fyList('2018-04-01', today).reverse()) {
    const { to } = fyBounds(fy);
    if (to <= lastAudit) continue;
    const ended = to < today;
    const upto = ended ? to : today;
    const bal = entries.filter((e) => e.date <= upto).reduce((t, e) => t + (e.debit || 0) - (e.credit || 0), 0);
    rows.push({ fy, asOn: upto, source: upto <= takeover ? 'Tally' : 'These accounts', name: '', amount: Math.round(bal * 100) / 100,
      note: ended ? '' : 'Balance so far' });
  }
  return rows;
}

const rs = (n) => `₹${n < 0 ? `${new Intl.NumberFormat('en-IN').format(-n)} Cr` : new Intl.NumberFormat('en-IN').format(n)}`;

/** Compares the audited balance on 31 March 2018 with the Tally ledger opening on 1 April 2018. */
export function handoverCheck(unitId, audits, history) {
  const a = audits.find((x) => x.to === '2018-03-31');
  if (!a) return null;
  const r = (a.dues || []).find((d) => d.unitId === unitId);
  const audited = r ? r.amount : 0;
  if (!history) return { ok: !audited, audited, text: audited ? `Audited balance ${rs(audited)} on 31 March 2018; there is no Tally ledger for this unit.` : 'No Tally ledger for this unit (audited balance nil).' };
  const od = history.opening?.date || '';
  if (od > '2018-04-01') return { ok: !audited, audited, startsOn: od,
    text: audited ? `The Tally ledger starts on ${od.split('-').reverse().join('/')}; the audited balance of ${rs(audited)} on 31 March 2018 is not carried into it (it may be in an earlier ledger, e.g. a previous owner’s).` : `The Tally ledger starts on ${od.split('-').reverse().join('/')}.` };
  const tally = history.opening?.amount || 0;
  const diff = Math.round((audited - tally) * 100) / 100;
  return { ok: !diff, audited, tally, diff, text: diff ? `Audited balance on 31 March 2018 ${rs(audited)} vs Tally opening on 1 April 2018 ${rs(tally)}: difference ${rs(diff)}.` : 'Audited balance on 31 March 2018 matches the Tally opening on 1 April 2018.' };
}

/** Builder pending maintenance of one unit in each audited year. */
export function bpmHistory(unitId, audits) {
  return audits.map((a) => ({ fy: a.fy, amount: (a.bpm || []).find((b) => b.unitId === unitId)?.amount || 0 })).filter((x, i, arr) => arr.some((y) => y.amount));
}
