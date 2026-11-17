// Shared start-up for every page. Returns null until the configuration is filled in.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
/** Shown at the foot of the accounts page and stored with each sign-in attempt. */
export const SITE_VERSION = '3.11.0';
let ready;

/* ---------- Android app ----------
 * Inside the Society's Android app the page is served from the phone and a small bridge, window.SSApp, is
 * available. Then: data read from the database is kept on the phone (offline cache), Google sign-in uses the
 * phone's own Google account, and printing and file downloads go through Android. In a browser none of this changes. */
export const inApp = typeof window !== 'undefined' && !!window.SSApp;
const pending = {};
if (inApp) {
  window.__ssAppResolve = (id, ok, value) => {
    const p = pending[id]; if (!p) return;
    delete pending[id];
    if (ok) p.resolve(value); else { const e = new Error(value || 'Something went wrong.'); e.code = 'app/failed'; p.reject(e); }
  };
  window.print = () => window.SSApp.print(document.title || 'Sunshree Suntec');
}
/** Calls an asynchronous method of the app; it answers through window.__ssAppResolve. */
export function appCall(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    pending[id] = { resolve, reject };
    try { window.SSApp[method](id, ...args); } catch (err) { delete pending[id]; reject(err); }
  });
}

/** Saves a file: in the app it is stored on the phone and opened; in a browser it downloads. */
export async function saveBlob(blob, fileName) {
  if (inApp) {
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return appCall('saveFile', fileName, blob.type || 'application/octet-stream', b64);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
}

export const isConfigured = Boolean(firebaseConfig?.apiKey) && !firebaseConfig.apiKey.startsWith('PASTE');

export function initFirebase() {
  if (!isConfigured) return Promise.resolve(null);
  ready ??= Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]).then(([appMod, A, F]) => {
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    if (inApp) {
      // Keep everything read on the phone so the app can show it without internet.
      try {
        db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager({}), cacheSizeBytes: 100 * 1024 * 1024 }) });
      } catch (err) { console.warn('Offline cache unavailable', err); db = F.getFirestore(app); }
    } else db = F.getFirestore(app);
    return { A, F, auth: A.getAuth(app), db };
  });
  return ready;
}

/**
 * Signs out. In the app it also wipes the offline copy of the accounts and the files saved on the phone,
 * so the next person using the phone can't see them, then reloads the page.
 */
export async function signOutUser(fb, goTo = '') {
  await fb.A.signOut(fb.auth);
  if (!inApp) { if (goTo) location.href = goTo; return; }
  try { await fb.F.terminate(fb.db); await fb.F.clearIndexedDbPersistence(fb.db); } catch (err) { console.warn('Offline copy not cleared', err); }
  try { ['ssOfflineSavedAt', 'ssOfflineDocsAt'].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  try { window.SSApp.clearSavedFiles(); } catch { /* older app */ }
  location.href = goTo || location.href.split('#')[0];
}

/** Resolves once Firebase knows whether someone is signed in. */
export function currentUser(fb) {
  return new Promise((resolve) => {
    const stop = fb.A.onAuthStateChanged(fb.auth, (u) => { stop(); resolve(u); });
  });
}

// Google and password sign-in, with progress messages and history, are in signin.js.

export function errorText(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Use a password of at least 8 characters.',
    'auth/user-disabled': 'This account has been switched off. Please contact the committee.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
    'auth/operation-not-allowed': 'Google sign-in isn’t switched on yet. Please use email and password, or contact the committee.',
    'auth/unauthorized-domain': 'Sign-in isn’t available at this web address. Please contact the committee.',
    'auth/account-exists-with-different-credential': 'This email is already registered with a password. Sign in with your email and password.',
    'permission-denied': 'This action isn’t allowed for your account.',
    'unavailable': 'The database can’t be reached. Check your connection and try again.',
    'app/failed': err?.message || 'Something went wrong in the app. Try again.'
  };
  return map[code] || err?.message || `Something went wrong${code ? ` (${code})` : ''}. Try again.`;
}
