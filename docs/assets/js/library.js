/**
 * 3.20: Rules, GRs and forms library. Acts, Rules, bye-laws, Government Resolutions, circulars, judgments, statutory
 * forms and application templates, kept in the Society's Google Drive (Library/<category>) and listed in libraryDocs.
 * Everyone can search the entries marked public; members and the team search all and open the Society's copies.
 * Words inside PDFs are read in the uploader's browser (pdf.js) and kept as a word list (libraryDocs/{id}/index/{n})
 * so the search finds documents by what they say, in English or Marathi.
 */
export const LIB_CATEGORIES = [
  'Act', 'Rules', 'Bye-laws', 'Government Resolution (GR)', 'Circular / Notification / Order', 'Court judgment',
  'Statutory form', 'Application: member to Society', 'Application: member to Registrar / DDR', 'Society’s own format', 'Guide / Other'
];
export const LIB_LANGS = ['English', 'Marathi', 'English and Marathi', 'Hindi'];
export const LIB_TYPES = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odt', 'text/plain': 'txt'
};
export const LIB_MAX_BYTES = 30 * 1024 * 1024;
const INDEX_CHUNK_BYTES = 700 * 1024;   // a Firestore document holds at most 1 MiB

/** Lower case, Unicode-normalised words (letters with their vowel signs, and numbers), so Marathi words stay whole. */
export function words(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966)).match(/[\p{L}\p{M}\p{N}\u200C\u200D]+/gu) || [];
}
/** PDFs store the Devanagari vowel sign ि before its consonant (as drawn); put it after, as it is typed. */
export function devanagariOrder(t) {
  return String(t || '').replace(/\u093F((?:[\u0915-\u0939\u0958-\u095F]\u094D)*[\u0915-\u0939\u0958-\u095F]\u093C?)/g, '$1\u093F');
}
/** Unique words of two or more characters, as one space-separated string. */
export function wordList(text) {
  const set = new Set();
  for (const w of words(text)) if (w.length >= 2 && w.length <= 40) set.add(w);
  return [...set].join(' ');
}

let pdfjs = null;
const PDFJS_BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  const lib = await import(`${PDFJS_BASE}pdf.min.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
  pdfjs = lib;
  return pdfjs;
}
/** The words of a PDF and its page count. Scanned PDFs (pictures of pages) give few or no words. */
export async function pdfWords(data, onPage = () => {}) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data, cMapUrl: `${PDFJS_BASE}cmaps/`, cMapPacked: true, isEvalSupported: false }).promise;
  const set = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    onPage(p, doc.numPages);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Pieces of text joined as written (whole words, even when a PDF splits them) and with spaces (words a PDF
    // places apart without a space character): both are kept.
    const joined = tc.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
    const spaced = tc.items.map((i) => i.str).join(' ');
    for (const w of [...words(devanagariOrder(joined)), ...words(devanagariOrder(spaced))]) if (w.length >= 2 && w.length <= 40) set.add(w);
    page.cleanup();
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { words: [...set].join(' '), pages, count: set.size };
}

/** Saves the word list in chunks (replacing any earlier ones). */
export async function saveIndex(fb, id, list, isPublic) {
  const { F, db } = fb;
  const old = await F.getDocs(F.collection(db, 'libraryDocs', id, 'index')).catch(() => ({ docs: [] }));
  for (const d of old.docs) await F.deleteDoc(F.doc(db, 'libraryDocs', id, 'index', d.id));
  const enc = new TextEncoder(), parts = [];
  let cur = [], size = 0;
  for (const w of String(list || '').split(' ').filter(Boolean)) {
    const n = enc.encode(w).length + 1;
    if (size + n > INDEX_CHUNK_BYTES && cur.length) { parts.push(cur.join(' ')); cur = []; size = 0; }
    cur.push(w); size += n;
  }
  if (cur.length) parts.push(cur.join(' '));
  for (let i = 0; i < parts.length; i++) await F.setDoc(F.doc(db, 'libraryDocs', id, 'index', String(i)), { words: parts[i], public: Boolean(isPublic) });
  return parts.length;
}
/** Marks the word list public or not, with its entry. */
export async function setIndexPublic(fb, id, isPublic) {
  const { F, db } = fb;
  const snap = await F.getDocs(F.collection(db, 'libraryDocs', id, 'index')).catch(() => ({ docs: [] }));
  for (const d of snap.docs) await F.updateDoc(F.doc(db, 'libraryDocs', id, 'index', d.id), { public: Boolean(isPublic) });
}
const indexCache = new Map();
export async function loadIndex(fb, id) {
  if (indexCache.has(id)) return indexCache.get(id);
  const { F, db } = fb;
  const snap = await F.getDocs(F.collection(db, 'libraryDocs', id, 'index')).catch(() => ({ docs: [] }));
  const list = snap.docs.map((d) => d.data().words || '').join(' ');
  const set = new Set(list.split(' ').filter(Boolean));
  indexCache.set(id, set);
  return set;
}
export const forgetIndex = (id) => indexCache.delete(id);

/** The text of an entry's details, for searching. */
export function entryText(e) {
  const g = e.guide || {};
  return [e.title, e.category, e.issuer, e.number, e.date, e.year, e.lang, (e.keywords || []).join(' '), e.description, e.file?.name, g.no, g.aka, g.law, g.use].filter(Boolean).join(' ');
}
/**
 * Searches entries: every word typed must be found (as the start of a word) in the entry's details or, when its word
 * list is loaded, inside the document. Results with matches in the details come first.
 */
export function searchLibrary(entries, query, indexes = new Map()) {
  const q = words(query).filter((w) => w.length >= 1);
  if (!q.length) return entries.map((e) => ({ e, inDetails: true, inside: false }));
  const out = [];
  for (const e of entries) {
    const det = words(entryText(e));
    const inside = indexes.get(e.id);
    let allDet = true, all = true, usedInside = false;
    for (const t of q) {
      const d = det.some((w) => w.startsWith(t));
      if (!d) {
        allDet = false;
        let found = false;
        if (inside && t.length >= 2) for (const w of inside) { if (w.startsWith(t)) { found = true; break; } }
        if (found) usedInside = true; else { all = false; break; }
      }
    }
    if (all) out.push({ e, inDetails: allDet, inside: usedInside });
  }
  return out.sort((a, b) => (b.inDetails - a.inDetails) || String(b.e.date || '').localeCompare(String(a.e.date || '')) || String(a.e.title).localeCompare(String(b.e.title)));
}
export const fmtSize = (n) => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const extOf = (e) => (e.file?.name?.match(/\.(\w+)$/)?.[1] || LIB_TYPES[e.file?.mime] || '').toUpperCase();
