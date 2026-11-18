/**
 * The Society's Google Drive ("Sunshree Suntec Society Records"), reached through its Apps Script
 * (tools/drive-upload/Code.gs). Used by the unit files (3.12). Expenses keep their own copy in expenses.js.
 */
let cfg = null;
const blobs = new Map();   // Drive file id → object URL for this session

export async function loadDriveCfg(fb) {
  const s = await fb.F.getDoc(fb.F.doc(fb.db, 'settings', 'files')).catch(() => null);
  cfg = s?.exists() ? s.data() : null;
  return cfg;
}
export const driveReady = () => Boolean(cfg?.scriptUrl);

/** Version of the Drive script actually deployed (its doGet answer); 0 if it can't be read. Member agreement emails need version 5 or later. */
export const DRIVE_SCRIPT_NEEDED = 5;
export async function driveScriptVersion() {
  if (!cfg?.scriptUrl) return 0;
  try {
    const r = await fetch(cfg.scriptUrl, { method: 'GET' });
    const j = await r.json();
    return Number(j.version) || 1;
  } catch { return 0; }
}

export async function driveCall(fb, action, payload = {}) {
  if (!cfg?.scriptUrl) throw new Error('The Society’s Google Drive isn’t connected yet. The committee connects it in Expenses → Set-up.');
  const idToken = await fb.auth.currentUser.getIdToken();
  let res;
  try {
    res = await fetch(cfg.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, idToken, ...payload }) });
  } catch {
    throw new Error('Couldn’t reach the Society’s Google Drive. Check the internet connection and try again.');
  }
  let out;
  try { out = await res.json(); } catch { throw new Error('The Google Drive gave an unexpected answer. Ask the committee to check the set-up.'); }
  if (!out.ok) throw new Error(out.error || 'The Google Drive refused the request.');
  return out;
}

export const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Photos are made smaller (longest side 2000 px, JPEG) so they upload quickly on a phone; PDFs are sent as they are. */
export async function prepareFile(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return out && out.size < file.size ? new File([out], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

export const safeName = (s, n = 60) => String(s || '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Opens a stored file: payload says what it belongs to (the script checks the person may read that record). */
export async function driveFileUrl(fb, payload) {
  if (blobs.has(payload.fileId)) return blobs.get(payload.fileId);
  const r = await driveCall(fb, 'fetch', payload);
  const bin = atob(r.data), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u8], { type: r.mime }));
  blobs.set(payload.fileId, url);
  return url;
}
