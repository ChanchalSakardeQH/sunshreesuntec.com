/**
 * 3.26: the website's settings — maintenance and billing, agreements, access by role, committee, reminders, transfer
 * lists, website content, library catalogue — saved as one file (downloaded, and a copy in the Society's Drive) and
 * put back item by item after comparing with what the website has now. Records (units, bills, receipts, members…)
 * are not settings: they are in the full backup (3.25).
 */
import { toJSONValue, fromJSONValue } from './unitfiles.js';

export const SETTINGS_FORMAT = 'sunshree-suntec-settings';

/** Single documents, in the order shown. */
export const SETTINGS_DOCS = [
  ['settings/billing', 'Maintenance charges, billing, interest and the Society’s details'],
  ['public/site', 'Website content: home page, notices, committee, contacts'],
  ['settings/memberAgreement', 'Member portal agreement: the version in force'],
  ['settings/staffAgreement', 'Staff agreement (text and version)'],
  ['settings/rolePolicies', 'Staff access by role'],
  ['settings/committeeUndertaking', 'Committee undertaking (text and version)'],
  ['settings/committeeRegister', 'Committee register: Registrar intimation details'],
  ['settings/memberReminders', 'Reminder and invitation messages'],
  ['settings/transferChecklists', 'Membership transfer lists and their formats'],
  ['settings/fullBackupConfig', 'Full backup schedule'],
  ['settings/files', 'Google Drive connection (storage script and records folder)']
];
/** Whole collections that are configuration. */
export const SETTINGS_COLLECTIONS = [
  { col: 'memberAgreementVersions', label: (d, id) => `Member portal agreement, version ${d.version ?? id}`, permanent: true },
  { col: 'libraryDocs', label: (d) => `Library: ${d.title || '(untitled)'}`, sub: 'index' }
];
/** Changes only in these fields don't make an item "different". */
const IGNORE = new Set(['updatedAt', 'updatedBy', 'updatedByName']);

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => !IGNORE.has(k)).sort().map((k) => [k, canon(v[k])]));
  return v;
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export function labelFor(path, data) {
  const d = SETTINGS_DOCS.find(([p]) => p === path);
  if (d) return d[1];
  const [col, id] = path.split('/');
  const c = SETTINGS_COLLECTIONS.find((x) => x.col === col);
  return c ? c.label(data || {}, id) : path;
}

/** Everything that is configuration, as the signed-in committee member can read it. */
export async function collectSettings(fb, { siteVersion, project, byName }) {
  const { F, db } = fb, items = [];
  for (const [path] of SETTINGS_DOCS) {
    const [c, id] = path.split('/');
    const s = await F.getDoc(F.doc(db, c, id)).catch(() => null);
    if (s?.exists()) items.push({ path, data: toJSONValue(s.data()) });
  }
  for (const c of SETTINGS_COLLECTIONS) {
    const snap = await F.getDocs(F.collection(db, c.col)).catch(() => null);
    for (const d of snap?.docs || []) {
      const it = { path: `${c.col}/${d.id}`, data: toJSONValue(d.data()) };
      if (c.sub) {
        const sub = await F.getDocs(F.collection(db, c.col, d.id, c.sub)).catch(() => null);
        it.sub = (sub?.docs || []).map((x) => ({ id: x.id, data: toJSONValue(x.data()) }));
      }
      items.push(it);
    }
  }
  return { format: SETTINGS_FORMAT, formatVersion: 1, siteVersion, project, exportedAt: new Date().toISOString(), by: byName || '', items };
}

export function checkSettingsFile(data) {
  if (!data || data.format !== SETTINGS_FORMAT || !Array.isArray(data.items)) throw new Error('This is not a website settings file.');
  return data;
}

/**
 * Compares a settings file with what the website has now. Status: same, different, missing (not on the website now),
 * extra (only on the website now: left as it is), permanent (published agreement versions can't be changed),
 * skip (the Drive connection of another site).
 */
export function compareSettings(current, backup, project) {
  const now = new Map(current.items.map((i) => [i.path, i])), then = new Map(backup.items.map((i) => [i.path, i]));
  const order = (p) => { const i = SETTINGS_DOCS.findIndex(([x]) => x === p); return i >= 0 ? i : 100 + SETTINGS_COLLECTIONS.findIndex((c) => p.startsWith(`${c.col}/`)); };
  const paths = [...new Set([...then.keys(), ...now.keys()])].sort((a, b) => order(a) - order(b) || labelFor(a, then.get(a)?.data || now.get(a)?.data).localeCompare(labelFor(b, then.get(b)?.data || now.get(b)?.data)));
  return paths.map((path) => {
    const b = then.get(path), c = now.get(path), label = labelFor(path, (b || c).data);
    const permanent = SETTINGS_COLLECTIONS.some((x) => x.permanent && path.startsWith(`${x.col}/`));
    let status;
    if (!b) status = 'extra';
    else if (path === 'settings/files' && backup.project && project && backup.project !== project) status = 'skip';
    else if (!c) status = 'missing';
    else if (same(b.data, c.data) && (b.sub || []).length === (c.sub || []).length) status = 'same';
    else status = permanent ? 'permanent' : 'different';
    const changed = b && c && status !== 'same' ? Object.keys({ ...canon(b.data), ...canon(c.data) }).filter((k) => !same(b.data[k], c.data[k])) : [];
    return { path, label, status, changed };
  });
}

/** Writes the chosen items from the settings file (each replaced as it was in the file). */
export async function restoreSettings(fb, backup, paths, onStep) {
  const { F, db } = fb, want = new Set(paths), done = [], failed = [];
  // Times go back as Firestore times (a Date would also do; this keeps them exact everywhere).
  const back = (v) => { const x = fromJSONValue(v); return F.Timestamp?.fromDate ? toTs(x, F.Timestamp) : x; };
  for (const it of backup.items.filter((i) => want.has(i.path))) {
    onStep?.(labelFor(it.path, it.data));
    try {
      const [col, id] = it.path.split('/');
      await F.setDoc(F.doc(db, col, id), back(it.data));
      for (const s of it.sub || []) await F.setDoc(F.doc(db, col, id, SETTINGS_COLLECTIONS.find((c) => c.col === col).sub, s.id), back(s.data));
      done.push(it.path);
    } catch (err) { failed.push({ path: it.path, error: err?.message || String(err) }); }
  }
  return { done, failed };
}

function toTs(v, T) {
  if (v instanceof Date) return T.fromDate(v);
  if (Array.isArray(v)) return v.map((x) => toTs(x, T));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toTs(x, T)]));
  return v;
}

export const settingsFileName = (when = new Date()) => {
  const ist = new Date(when.getTime() + 5.5 * 3600e3).toISOString();
  return `Website settings ${ist.slice(0, 10)} ${ist.slice(11, 13)}${ist.slice(14, 16)}.json`;
};
