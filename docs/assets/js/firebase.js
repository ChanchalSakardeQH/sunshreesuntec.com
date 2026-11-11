// Shared Firebase start-up for every page. Returns null until firebase-config.js is filled in.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
let ready;

export const isConfigured = Boolean(firebaseConfig?.apiKey) && !firebaseConfig.apiKey.startsWith('PASTE');

export function initFirebase() {
  if (!isConfigured) return Promise.resolve(null);
  ready ??= Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]).then(([appMod, A, F]) => {
    const app = appMod.initializeApp(firebaseConfig);
    return { A, F, auth: A.getAuth(app), db: F.getFirestore(app) };
  });
  return ready;
}

/** Resolves once Firebase knows whether someone is signed in. */
export function currentUser(fb) {
  return new Promise((resolve) => {
    const stop = fb.A.onAuthStateChanged(fb.auth, (u) => { stop(); resolve(u); });
  });
}

/** Sign in with Google: popup, or full-page redirect where popups are blocked (some phones). */
export async function googleSignIn(fb) {
  const provider = new fb.A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await fb.A.signInWithPopup(fb.auth, provider);
  } catch (err) {
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return null;
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-environment') {
      await fb.A.signInWithRedirect(fb.auth, provider);
      return null;
    }
    throw err;
  }
}

export function errorText(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Use a password of at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
    'auth/operation-not-allowed': 'Google sign-in isn’t switched on yet. In Firebase: Authentication → Sign-in method → Google → Enable.',
    'auth/unauthorized-domain': 'This website address isn’t authorised for sign-in. Add it in Firebase: Authentication → Settings → Authorized domains.',
    'auth/account-exists-with-different-credential': 'This email is already registered with a password. Sign in with your email and password.',
    'permission-denied': 'This action isn’t allowed for your account.',
    'unavailable': 'The database can’t be reached. Check your connection and try again.'
  };
  return map[code] || err?.message || `Something went wrong${code ? ` (${code})` : ''}. Try again.`;
}
