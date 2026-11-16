// Sign-in with feedback and history.
//
// Every sign-in attempt (Google, email and password, registration, password reset) is shown to the person
// step by step ("Opening Google sign-in…", "Signing you in…") and is written to the signInLog collection,
// so the committee can see who tried, from where, and why it failed.
// Passwords and Google tokens are never written anywhere.
import { inApp, appCall, errorText, SITE_VERSION } from './firebase.js';

const cut = (v, n) => String(v ?? '').slice(0, n);

/** In the app: version, phone and signing fingerprint (null in a browser or an older app). */
export function appInfo() {
  try { return inApp && window.SSApp.diagnostics ? JSON.parse(window.SSApp.diagnostics()) : null; } catch { return null; }
}

/** Short description of the phone or browser, e.g. "samsung SM-M315F, Android 12" or "Chrome on Windows". */
export function deviceText(info = appInfo()) {
  if (info?.device) return `${info.device}, Android ${info.android || '?'}`;
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android ([\d.]+)/.exec(ua)?.[0] || (/iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'unknown system');
  return `${browser} on ${os}`;
}

/**
 * Writes one attempt to the history. Never throws and never waits for the server, so it can't slow down or
 * break sign-in. entry: { method: google|password|register|reset, page: member|admin, result: ok|cancelled|failed,
 * code, detail, email, ms }
 */
export function logSignIn(fb, entry) {
  try {
    const info = appInfo(), user = fb.auth.currentUser;
    const doc = {
      at: fb.F.serverTimestamp(),
      method: entry.method, where: inApp ? 'app' : 'web', page: entry.page, result: entry.result,
      code: cut(entry.code, 80), detail: cut(entry.detail, 500),
      email: cut(entry.email || (entry.result === 'ok' ? user?.email : '') || '', 160).trim().toLowerCase(),
      uid: entry.result === 'ok' && user ? user.uid : '',
      appVersion: cut(info?.app, 20), siteVersion: SITE_VERSION, device: cut(deviceText(info), 120),
      ms: Math.max(0, Math.min(3599999, Math.round(entry.ms || 0)))
    };
    fb.F.addDoc(fb.F.collection(fb.db, 'signInLog'), doc).catch((err) => console.warn('Sign-in history not saved:', err?.code || err));
  } catch (err) { console.warn('Sign-in history not saved:', err); }
}

/**
 * Shows a message under a sign-in button or form.
 * kind: 'info' (in progress), 'ok' or 'error'. details: a small second line the person can screenshot for the committee.
 */
export function showMsg(container, text, kind = 'error', details = '') {
  const p = container.querySelector('.form-msg');
  if (!p) return;
  p.textContent = text;
  p.classList.toggle('ok', kind === 'ok');
  p.classList.toggle('info', kind === 'info');
  let d = p.nextElementSibling?.classList.contains('form-detail') ? p.nextElementSibling : null;
  if (details) {
    if (!d) { d = document.createElement('p'); d.className = 'form-detail'; p.after(d); }
    d.textContent = details;
  } else d?.remove();
  if (text) p.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

const REDIRECT_KEY = 'ssGoogleRedirect';
let running = false;

const appMessage = (r) => {
  if (r.status === 'cancelled' && r.quick) {
    return 'Google sign-in closed by itself, so you are not signed in. This copy of the app isn’t accepted by Google yet. '
      + 'Please sign in with email and password for now. The committee can see this problem in the sign-in history.';
  }
  return ({
    'no-account': 'No Google account was found on this phone. Add one in the phone’s Settings → Accounts, or sign in with email and password.',
    'no-client-id': 'Google sign-in isn’t set up in this copy of the app. Please sign in with email and password.',
    'bridge': 'The app couldn’t open Google sign-in. Close the app, open it again and retry, or sign in with email and password.'
  })[r.code] || 'Google sign-in didn’t work on this phone. Try once more, or sign in with email and password.';
};

const appDetails = (r, ms) => [
  `Code: ${r.status === 'cancelled' && r.quick ? 'closed-at-once' : (r.code || r.status)}`,
  `${Math.round(ms)} ms`,
  r.app ? `app ${r.app}` : '', r.device ? `${r.device}, Android ${r.android}` : '',
  r.sha1 ? `key SHA-1 ${r.sha1}` : '',
  new Date().toLocaleString('en-IN')
].filter(Boolean).join(' · ');

/**
 * "Continue with Google" with visible progress.
 * say(text, kind, details) shows a message; button is disabled and marked busy while it runs.
 * Returns true when signed in (the page's sign-in listener then takes over).
 */
export async function signInWithGoogle(fb, { page, button, say }) {
  if (running) { say('Google sign-in is already open. Please wait…', 'info'); return false; }
  if (!navigator.onLine) { say('You’re offline. Connect the phone to the internet, then tap “Continue with Google” again.', 'error'); return false; }
  running = true;
  const t0 = performance.now(), ms = () => performance.now() - t0;
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  say('Opening Google sign-in…', 'info');
  try {
    if (inApp) return await appGoogle(fb, page, say, ms);
    return await webGoogle(fb, page, say, ms);
  } finally {
    running = false;
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

async function appGoogle(fb, page, say, ms) {
  let r;
  try {
    const raw = await appCall('googleSignIn');
    // Older app copies answer with just the token (or nothing when cancelled).
    r = raw && String(raw).startsWith('{') ? JSON.parse(raw) : raw ? { status: 'ok', token: raw } : { status: 'cancelled' };
  } catch (err) {
    r = { status: 'error', code: err?.code === 'app/failed' ? 'app-error' : 'bridge', message: err?.message || String(err) };
  }
  if (r.status === 'cancelled' && !r.quick) {
    say('Google sign-in was closed before an account was chosen. Tap “Continue with Google” to try again.', 'info');
    logSignIn(fb, { method: 'google', page, result: 'cancelled', code: r.code || 'cancelled', detail: r.message, ms: ms() });
    return false;
  }
  if (r.status !== 'ok' || !r.token) {
    const details = appDetails(r, ms());
    say(appMessage(r), 'error', details);
    logSignIn(fb, {
      method: 'google', page, result: 'failed', code: r.status === 'cancelled' ? 'closed-at-once' : (r.code || 'error'),
      detail: [r.message, r.sha1 ? `app key SHA-1 ${r.sha1}` : '', r.versionCode ? `app code ${r.versionCode}` : ''].filter(Boolean).join(' | '), ms: ms()
    });
    return false;
  }
  say('Google account chosen. Signing you in…', 'info');
  try {
    const cred = await fb.A.signInWithCredential(fb.auth, fb.A.GoogleAuthProvider.credential(r.token));
    say(`Signed in as ${cred.user.email}. Loading…`, 'ok');
    logSignIn(fb, { method: 'google', page, result: 'ok', email: cred.user.email, ms: ms() });
    return true;
  } catch (err) {
    say(errorText(err), 'error', `Code: ${err?.code || 'unknown'} · ${new Date().toLocaleString('en-IN')}`);
    logSignIn(fb, { method: 'google', page, result: 'failed', code: err?.code || 'unknown', detail: err?.message, ms: ms() });
    return false;
  }
}

async function webGoogle(fb, page, say, ms) {
  const provider = new fb.A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await fb.A.signInWithPopup(fb.auth, provider);
    say(`Signed in as ${cred.user.email}. Loading…`, 'ok');
    logSignIn(fb, { method: 'google', page, result: 'ok', email: cred.user.email, ms: ms() });
    return true;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      say('The Google window was closed before an account was chosen. Tap “Continue with Google” to try again.', 'info');
      logSignIn(fb, { method: 'google', page, result: 'cancelled', code, ms: ms() });
      return false;
    }
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-environment') {
      say('Taking you to Google…', 'info');
      try { sessionStorage.setItem(REDIRECT_KEY, JSON.stringify({ page, t: Date.now() })); } catch { /* private mode */ }
      await fb.A.signInWithRedirect(fb.auth, provider);
      return false;
    }
    say(errorText(err), 'error', `Code: ${code || 'unknown'} · ${new Date().toLocaleString('en-IN')}`);
    logSignIn(fb, { method: 'google', page, result: 'failed', code: code || 'unknown', detail: err?.message, ms: ms() });
    return false;
  }
}

/** After coming back from Google's page (browsers that block pop-ups): shows and records the outcome. */
export async function finishGoogleRedirect(fb, say) {
  if (inApp) return;
  let started = null;
  try { started = JSON.parse(sessionStorage.getItem(REDIRECT_KEY) || 'null'); sessionStorage.removeItem(REDIRECT_KEY); } catch { /* ignore */ }
  const page = started?.page || 'member', ms = started ? Date.now() - started.t : 0;
  try {
    const res = await fb.A.getRedirectResult(fb.auth);
    if (res?.user) { say(`Signed in as ${res.user.email}. Loading…`, 'ok'); logSignIn(fb, { method: 'google', page, result: 'ok', email: res.user.email, ms }); }
    else if (started) { say('Google sign-in wasn’t completed. Tap “Continue with Google” to try again.', 'info'); logSignIn(fb, { method: 'google', page, result: 'cancelled', code: 'redirect-returned', ms }); }
  } catch (err) {
    say(errorText(err), 'error', `Code: ${err?.code || 'unknown'} · ${new Date().toLocaleString('en-IN')}`);
    logSignIn(fb, { method: 'google', page, result: 'failed', code: err?.code || 'unknown', detail: err?.message, ms });
  }
}

/** Email and password sign-in with history. Returns true when signed in. */
export async function signInWithPassword(fb, { page, email, password, say }) {
  const t0 = performance.now();
  say('Signing you in…', 'info');
  try {
    await fb.A.signInWithEmailAndPassword(fb.auth, email, password);
    say('Signed in. Loading…', 'ok');
    logSignIn(fb, { method: 'password', page, result: 'ok', email, ms: performance.now() - t0 });
    return true;
  } catch (err) {
    say(errorText(err), 'error');
    logSignIn(fb, { method: 'password', page, result: 'failed', code: err?.code || 'unknown', email, ms: performance.now() - t0 });
    return false;
  }
}
