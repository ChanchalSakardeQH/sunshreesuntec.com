// Offline use in the Society's Android app. (In a browser these functions do nothing.)
//  - initOfflineUi(): a bar at the top of the page while the phone has no internet, saying when the
//    information shown was last saved on the phone.
//  - saveForOffline(fb): while online, reads the Society documents and audited accounts once so they are kept
//    on the phone; everything else a member opens (dues, bills, receipts, ledger) is kept as it is read.
//  - requireOnline(): stops changes (payments, bills, edits) while offline, with a message.
import { inApp } from './firebase.js';

const KEY = 'ssOfflineSavedAt';
const DOCS_KEY = 'ssOfflineDocsAt';

export function lastSaved() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Records that the information on screen has just been loaded from the internet. */
export function markSaved() {
  if (!inApp || !navigator.onLine) return;
  try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* storage full or blocked */ }
  update();
}

let bar = null;
function update() {
  if (!bar) return;
  const off = !navigator.onLine;
  bar.hidden = !off;
  document.body.classList.toggle('is-offline', off);
  const t = lastSaved();
  bar.textContent = off
    ? `You’re offline. Showing information saved on this phone${t ? ` on ${when(t)}` : ''}. Changes need internet.`
    : '';
}

export function initOfflineUi() {
  if (!inApp || bar) return;
  bar = document.createElement('div');
  bar.className = 'offline-bar';
  bar.setAttribute('role', 'status');
  bar.hidden = true;
  document.body.prepend(bar);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/** In the app, refuses to start a change while offline. Returns true when it is fine to go ahead. */
export function requireOnline() {
  if (!inApp || navigator.onLine) return true;
  alert('You’re offline. Changes can be made when the phone is connected to the internet.');
  return false;
}

/**
 * Reads the audited accounts and every Society document (all parts) so they open without internet.
 * Runs at most once every 12 hours, only in the app and only while online. Never throws.
 */
export async function saveForOffline(fb, { force = false } = {}) {
  if (!inApp || !navigator.onLine || !fb) return { skipped: true };
  try {
    const last = localStorage.getItem(DOCS_KEY);
    if (!force && last && Date.now() - Date.parse(last) < 12 * 3600 * 1000) return { skipped: true };
  } catch { /* ignore */ }
  const { F, db } = fb;
  let docs = 0;
  try {
    await F.getDocs(F.collection(db, 'auditYears')).catch(() => null);
    const list = await F.getDocs(F.collection(db, 'archiveDocs'));
    for (const d of list.docs) {
      await F.getDocs(F.collection(db, 'archiveDocs', d.id, 'parts'));
      docs++;
    }
    try { localStorage.setItem(DOCS_KEY, new Date().toISOString()); } catch { /* ignore */ }
    markSaved();
  } catch (err) {
    console.warn('Saving for offline use stopped', err);
  }
  return { docs };
}
