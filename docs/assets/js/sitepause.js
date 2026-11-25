/**
 * 3.28: pausing the website in an emergency. When public/status says { paused: true }, every visitor and member who
 * opens the website (and the app) sees an "under maintenance" page instead; nothing is deleted or changed. The
 * committee (and staff with the website permission) still use the accounts page, where they resume it; a signed-in
 * committee or staff member who opens the website sees it as usual, with a red bar saying it is paused for others.
 * The last state is kept in this browser so the page is hidden at once on the next visit, before the check.
 */
import { initFirebase, currentUser } from './firebase.js';
import { esc } from './data.js';

const KEY = 'sitePaused';
export const PAUSE_DEFAULT = {
  title: 'Website under maintenance',
  message: 'The Sunshree Suntec Society website is temporarily unavailable while work is carried out. Please try again later. For anything urgent, contact the Society office.',
  titleMr: 'संकेतस्थळ देखभालीसाठी तात्पुरते बंद',
  messageMr: 'सनश्री सनटेक सोसायटीचे संकेतस्थळ काही काळासाठी बंद आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा. तातडीच्या कामासाठी सोसायटी कार्यालयाशी संपर्क साधा.'
};

const d2 = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function overlay(st, society) {
  let el = document.getElementById('site-paused');
  if (!el) { el = document.createElement('div'); el.id = 'site-paused'; document.body.appendChild(el); }
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="sp-card">
    <img src="assets/img/seal.svg" alt="" width="72" height="72">
    <p class="sp-soc">${esc(society?.name || 'Sunshree Suntec Co-operative Housing Society Ltd.')}</p>
    <h1>${esc(st.title || PAUSE_DEFAULT.title)}</h1>
    <p>${esc(st.message || PAUSE_DEFAULT.message)}</p>
    <h2 lang="mr">${esc(st.titleMr || PAUSE_DEFAULT.titleMr)}</h2>
    <p lang="mr">${esc(st.messageMr || PAUSE_DEFAULT.messageMr)}</p>
    ${st.until ? `<p class="sp-until">Expected back by / अपेक्षित वेळ: <strong>${esc(d2(st.until))}</strong></p>` : ''}
    ${society?.email ? `<p class="sp-contact"><a href="mailto:${esc(society.email)}">${esc(society.email)}</a>${society.contactNo ? ` · <a href="tel:${esc(society.contactNo.replace(/\s/g, ''))}">${esc(society.contactNo)}</a>` : ''}</p>` : ''}
    <p class="sp-admin"><a href="admin.html">Committee sign-in</a></p></div>`;
  document.documentElement.classList.add('paused');
}

function banner(st) {
  document.documentElement.classList.remove('paused');
  document.getElementById('site-paused')?.remove();
  if (document.getElementById('paused-bar')) return;
  const b = document.createElement('div');
  b.id = 'paused-bar';
  b.innerHTML = `The website is PAUSED for visitors and members${st.byName ? ` (by ${esc(st.byName)})` : ''}: they see the maintenance page. You see it because you are signed in as committee / staff. <a href="admin.html#settings">Resume it</a>`;
  document.body.prepend(b);
}

/** Checks public/status; shows the maintenance page to everyone but the team. Returns true when paused for this person. */
export async function checkSitePause(society) {
  let st = null;
  try {
    const fb = await initFirebase();
    if (!fb) return false;
    const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'public', 'status'));
    st = snap.exists() ? snap.data() : null;
    if (!st?.paused) {
      try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
      document.documentElement.classList.remove('paused');
      document.getElementById('site-paused')?.remove();
      return false;
    }
    try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
    overlay(st, society);
    // The committee and staff still see the website (with a bar), to check it before resuming.
    const user = await currentUser(fb);
    if (user) {
      const a = await fb.F.getDoc(fb.F.doc(fb.db, 'admins', user.uid)).catch(() => null);
      if (a?.exists() && a.data().active !== false) { banner(st); return false; }
    }
    return true;
  } catch (err) {
    console.warn('site status', err);
    // Could not check: don't keep a stale pause on screen.
    document.documentElement.classList.remove('paused');
    return false;
  }
}
