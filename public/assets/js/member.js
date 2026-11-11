// Member access: register (mobile + email) → committee approves → member sees own unit's account.
// Backend: Firebase Authentication (email/password) + Cloud Firestore. Access is enforced by firestore.rules.

import { firebaseConfig } from './firebase-config.js';
import { getDues, fmt, esc, fmtDate, ownerCell, bpmCell } from './data.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const configured = Boolean(firebaseConfig?.apiKey) && !firebaseConfig.apiKey.startsWith('PASTE');

let A, F, auth, db, dues;
let profile = null;
let registering = false;

main().catch((err) => console.error('Member module failed to start', err));

async function main() {
  dues = await getDues();
  fillUnitSelects();
  setSignedInUI(null);

  if (!configured) {
    $('#member-unavailable').hidden = false;
    adminDenied();
    return;
  }

  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);
  A = authMod;
  F = fsMod;
  const app = appMod.initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = F.getFirestore(app);

  wireMemberForms();
  wireAdmin();
  A.onAuthStateChanged(auth, (user) => onUser(user).catch(showFatal));
}

/* ---------------- helpers ---------------- */

function unitLabel(id) {
  const u = dues.units.find((x) => x.id === id);
  if (!u) return id;
  const b = dues.blocks.find((x) => x.id === u.block);
  return `${u.unit} (${b ? b.name : u.block})`;
}

function fillUnitSelects() {
  const groups = dues.blocks.map((b) => {
    const opts = dues.units.filter((u) => u.block === b.id)
      .map((u) => `<option value="${esc(u.id)}">${esc(u.unit)}</option>`).join('');
    return `<optgroup label="${esc(b.name)}">${opts}</optgroup>`;
  }).join('');
  $('#register-unit').insertAdjacentHTML('beforeend', groups);
  $('#admin-unit').insertAdjacentHTML('beforeend', groups);
}

function errorText(err) {
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
    'permission-denied': 'This action isn’t allowed for your account.'
  };
  return map[code] || `Something went wrong${code ? ` (${code})` : ''}. Try again.`;
}

function setMsg(form, text, ok = false) {
  const p = $('.form-msg', form);
  p.textContent = text;
  p.classList.toggle('ok', ok);
}

async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}

function showFatal(err) {
  console.error(err);
  $('#member-status').hidden = false;
  $('#member-status').innerHTML = `<p>${esc(errorText(err))}</p>`;
}

function showPanel(which) {
  $('#auth-panels').hidden = which !== 'auth';
  $('#member-status').hidden = which !== 'status';
  $('#member-account').hidden = which !== 'account';
}

function setSignedInUI(user) {
  $$('.nav-member').forEach((a) => (a.textContent = user ? 'My account' : 'Member login'));
  $$('[data-signout]').forEach((b) => (b.hidden = !user));
}

function switchAuthPanel(name) {
  $$('.switch-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panel === name)));
  $('#login-form').hidden = name !== 'login';
  $('#register-form').hidden = name !== 'register';
}

// When a signed-in user has no profile yet, only ask for name / unit / mobile.
function setRegisterMode(completing) {
  $$('#register-form .reg-only').forEach((l) => {
    l.hidden = completing;
    $('input', l).required = !completing;
  });
  $('.switcher').hidden = completing;
}

/* ---------------- auth state ---------------- */

async function onUser(user) {
  if (registering) return;
  setSignedInUI(user);

  if (!user) {
    profile = null;
    $('.nav-admin').hidden = true;
    adminDenied();
    setRegisterMode(false);
    switchAuthPanel('login');
    showPanel('auth');
    return;
  }

  const [adminSnap, profSnap] = await Promise.all([
    F.getDoc(F.doc(db, 'admins', user.uid)).catch(() => null),
    F.getDoc(F.doc(db, 'users', user.uid))
  ]);
  const isAdmin = Boolean(adminSnap?.exists());
  $('.nav-admin').hidden = !isAdmin;
  if (isAdmin) loadAdmin(user).catch(showFatal); else adminDenied();

  profile = profSnap.exists() ? profSnap.data() : null;

  if (!profile) {
    if (isAdmin) {
      showPanel('status');
      $('#member-status').innerHTML = `
        <p>You’re signed in with a committee account (${esc(user.email)}).</p>
        <div class="form-actions"><a class="btn btn-primary" href="#admin">Open admin</a>
        <button class="btn" type="button" data-signout>Sign out</button></div>`;
      return;
    }
    setRegisterMode(true);
    switchAuthPanel('register');
    showPanel('auth');
    setMsg($('#register-form'), 'Finish your request: add your name, unit and mobile number.', true);
    return;
  }

  if (profile.status === 'approved' && user.emailVerified) {
    showPanel('account');
    await loadAccount(user);
    return;
  }
  renderStatus(user);
}

function renderStatus(user) {
  showPanel('status');
  const unit = esc(unitLabel(profile.unit));
  const verifyBlock = user.emailVerified ? '' : `
    <p>Confirm your email address: open the link we sent to <strong>${esc(user.email)}</strong>. Check your spam folder if it isn’t in your inbox.</p>`;
  const verifyButtons = user.emailVerified ? '' : `
    <button class="btn" type="button" data-act="resend">Resend link</button>
    <button class="btn btn-primary" type="button" data-act="recheck">I’ve confirmed my email</button>`;

  let body;
  if (profile.status === 'pending') {
    body = `<h2>Request sent</h2>
      <p>Your request for ${unit} is waiting for approval. The committee checks each request against the member register before giving access.</p>${verifyBlock}`;
  } else if (profile.status === 'approved') {
    body = `<h2>Access approved</h2><p>Your access to ${unit} is approved.</p>${verifyBlock}`;
  } else {
    body = `<h2>Request not approved</h2>
      <p>Your request for ${unit} wasn’t approved. Contact the Society office with proof of ownership if you think this is a mistake.</p>`;
  }
  $('#member-status').innerHTML = `${body}
    <p class="form-msg" role="alert"></p>
    <div class="form-actions">${verifyButtons}<button class="btn" type="button" data-signout>Sign out</button></div>`;
}

/* ---------------- member forms ---------------- */

function wireMemberForms() {
  $('#auth-panels').hidden = false;

  $$('.switch-btn').forEach((b) => b.addEventListener('click', () => switchAuthPanel(b.dataset.panel)));

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setMsg(form, '');
    await busy($('button[type=submit]', form), async () => {
      try {
        await A.signInWithEmailAndPassword(auth, String(fd.get('email')).trim(), String(fd.get('password')));
        form.reset();
      } catch (err) { setMsg(form, errorText(err)); }
    });
  });

  $('#forgot-btn').addEventListener('click', async () => {
    const form = $('#login-form');
    const email = String(new FormData(form).get('email')).trim();
    if (!email) { setMsg(form, 'Enter your email above, then choose “Forgot password?” again.'); return; }
    try {
      await A.sendPasswordResetEmail(auth, email);
      setMsg(form, `If ${email} is registered, a password reset link is on its way.`, true);
    } catch (err) { setMsg(form, errorText(err)); }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get('name')).trim().replace(/\s+/g, ' ');
    const unit = String(fd.get('unit'));
    const mobile = String(fd.get('mobile')).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    const completing = Boolean(auth.currentUser);

    if (name.length < 3) return setMsg(form, 'Enter your full name.');
    if (!unit) return setMsg(form, 'Choose your unit.');
    if (!/^[6-9]\d{9}$/.test(mobile)) return setMsg(form, 'Enter a 10-digit Indian mobile number.');
    if (!fd.get('declare')) return setMsg(form, 'Tick the box to confirm you are the owner or authorised representative.');

    let email = '', password = '';
    if (!completing) {
      email = String(fd.get('email')).trim();
      password = String(fd.get('password'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg(form, 'Enter a valid email address.');
      if (password.length < 8) return setMsg(form, 'Use a password of at least 8 characters.');
      if (password !== fd.get('confirm')) return setMsg(form, 'The two passwords don’t match.');
    }
    setMsg(form, '');

    await busy($('button[type=submit]', form), async () => {
      registering = true;
      try {
        let user = auth.currentUser;
        if (!user) {
          user = (await A.createUserWithEmailAndPassword(auth, email, password)).user;
          await A.sendEmailVerification(user);
        }
        await F.setDoc(F.doc(db, 'users', user.uid), {
          name, unit, mobile, email: user.email, status: 'pending', createdAt: F.serverTimestamp()
        });
        form.reset();
      } catch (err) {
        setMsg(form, errorText(err));
      } finally {
        registering = false;
        if (auth.currentUser) await onUser(auth.currentUser).catch(showFatal);
      }
    });
  });

  // Status-card buttons and every sign-out button (delegated).
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-signout], #member-status [data-act]');
    if (!btn) return;
    if (btn.hasAttribute('data-signout')) {
      await A.signOut(auth);
      location.hash = '#member';
      return;
    }
    const card = $('#member-status');
    const user = auth.currentUser;
    if (!user) return;
    if (btn.dataset.act === 'resend') {
      await busy(btn, async () => {
        try { await A.sendEmailVerification(user); setMsg(card, `Link sent again to ${user.email}.`, true); }
        catch (err) { setMsg(card, errorText(err)); }
      });
    } else if (btn.dataset.act === 'recheck') {
      await busy(btn, async () => {
        await user.reload();
        await user.getIdToken(true); // refresh token so the rules see email_verified
        if (!auth.currentUser.emailVerified) { setMsg(card, 'Your email isn’t confirmed yet. Open the link in the email first.'); return; }
        await onUser(auth.currentUser);
      });
    }
  });
}

/* ---------------- member account ---------------- */

function ledgerRows(docs, withDelete) {
  let bal = 0;
  return docs.map((d) => {
    const e = d.data();
    bal += (e.debit || 0) - (e.credit || 0);
    return `<tr>
      <td>${fmtDate(e.date, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td>${esc(e.particulars)}</td>
      <td>${esc(e.receipt || '')}</td>
      <td class="num">${e.debit ? fmt(e.debit) : ''}</td>
      <td class="num">${e.credit ? fmt(e.credit) : ''}</td>
      <td class="num">${bal < 0 ? `<span class="amt-credit">${fmt(-bal)} Cr</span>` : fmt(bal)}</td>
      ${withDelete ? `<td><div class="row-actions"><button class="btn btn-small btn-danger" type="button" data-del="${esc(d.id)}">Delete</button></div></td>` : ''}
    </tr>`;
  }).join('');
}

async function fetchLedger(unitId) {
  const q = F.query(F.collection(db, 'units', unitId, 'ledger'), F.orderBy('date'));
  return (await F.getDocs(q)).docs;
}

async function loadAccount() {
  const u = dues.units.find((x) => x.id === profile.unit);
  $('#account-unit').textContent = unitLabel(profile.unit);
  $('#account-name').textContent = profile.name;
  $('#account-summary').innerHTML = `
    <div><dt>Member outstanding as on ${fmtDate(dues.periodTo)} (₹)</dt><dd>${u ? ownerCell(u.owner) : '—'}</dd></div>
    <div><dt>Builder pending maintenance (₹)</dt><dd>${u ? bpmCell(u.bpm) : '—'}</dd></div>`;

  const tbody = $('#account-ledger');
  tbody.innerHTML = '<tr><td colspan="6" class="empty">Loading entries…</td></tr>';
  try {
    const docs = await fetchLedger(profile.unit);
    tbody.innerHTML = docs.length ? ledgerRows(docs, false)
      : `<tr><td colspan="6" class="empty">The committee hasn’t added detailed entries for this unit yet. The balance above is from the ${fmtDate(dues.periodTo)} statement.</td></tr>`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(errorText(err))}</td></tr>`;
  }
}

/* ---------------- admin ---------------- */

function adminDenied() {
  $('#admin-panel').hidden = true;
  $('#admin-denied').hidden = false;
}

let adminUid = null;

async function loadAdmin(user) {
  adminUid = user.uid;
  $('#admin-denied').hidden = true;
  $('#admin-panel').hidden = false;
  await refreshRequests();
}

async function refreshRequests() {
  const byStatus = (s) => F.getDocs(F.query(F.collection(db, 'users'), F.where('status', '==', s)));
  const [pend, appr] = await Promise.all([byStatus('pending'), byStatus('approved')]);

  const approvedByUnit = {};
  appr.docs.forEach((d) => { (approvedByUnit[d.data().unit] ??= []).push(d.data().name); });

  const when = (ts) => (ts?.toDate ? fmtDate(ts.toDate(), { day: '2-digit', month: 'short', year: 'numeric' }) : '');

  $('#pending-rows').innerHTML = pend.docs.length ? pend.docs.map((d) => {
    const p = d.data();
    const dup = approvedByUnit[p.unit];
    return `<tr>
      <td class="unit">${esc(unitLabel(p.unit))}${dup ? `<span class="dup-warning">Already approved: ${esc(dup.join(', '))}</span>` : ''}</td>
      <td>${esc(p.name)}</td>
      <td><a href="tel:+91${esc(p.mobile)}">+91 ${esc(p.mobile)}</a></td>
      <td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
      <td>${when(p.createdAt)}</td>
      <td><div class="row-actions">
        <button class="btn btn-small btn-primary" type="button" data-act="approved" data-uid="${esc(d.id)}">Approve</button>
        <button class="btn btn-small btn-danger" type="button" data-act="rejected" data-uid="${esc(d.id)}" data-confirm="Reject this request?">Reject</button>
      </div></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">No requests waiting.</td></tr>';

  $('#approved-rows').innerHTML = appr.docs.length ? appr.docs.map((d) => {
    const p = d.data();
    return `<tr>
      <td class="unit">${esc(unitLabel(p.unit))}</td>
      <td>${esc(p.name)}</td>
      <td><a href="tel:+91${esc(p.mobile)}">+91 ${esc(p.mobile)}</a></td>
      <td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
      <td><div class="row-actions"><button class="btn btn-small btn-danger" type="button" data-act="rejected" data-uid="${esc(d.id)}" data-confirm="Remove this member’s access?">Remove access</button></div></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No approved members yet.</td></tr>';
}

async function renderAdminLedger(unitId) {
  const tbody = $('#admin-ledger');
  if (!unitId) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = '<tr><td colspan="7" class="empty">Loading…</td></tr>';
  const docs = await fetchLedger(unitId);
  tbody.innerHTML = docs.length ? ledgerRows(docs, true) : '<tr><td colspan="7" class="empty">No entries for this unit yet.</td></tr>';
}

function wireAdmin() {
  const onDecision = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
    await busy(btn, async () => {
      try {
        await F.updateDoc(F.doc(db, 'users', btn.dataset.uid), {
          status: btn.dataset.act, decidedAt: F.serverTimestamp(), decidedBy: adminUid
        });
        await refreshRequests();
      } catch (err) { alert(errorText(err)); }
    });
  };
  $('#pending-rows').addEventListener('click', onDecision);
  $('#approved-rows').addEventListener('click', onDecision);

  $('#admin-unit').addEventListener('change', (e) => {
    $('#entry-form').hidden = !e.target.value;
    renderAdminLedger(e.target.value).catch(showFatal);
  });

  $('#entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const unit = $('#admin-unit').value;
    const fd = new FormData(form);
    const date = String(fd.get('date'));
    const particulars = String(fd.get('particulars')).trim();
    const debit = Math.round(Number(fd.get('debit')) || 0);
    const credit = Math.round(Number(fd.get('credit')) || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setMsg(form, 'Choose a date.');
    if (!particulars) return setMsg(form, 'Describe the entry, e.g. “Maintenance Apr–Jun 2026”.');
    if (debit < 0 || credit < 0 || (!debit && !credit)) return setMsg(form, 'Enter a debit or a credit amount.');
    await busy($('button[type=submit]', form), async () => {
      try {
        await F.addDoc(F.collection(db, 'units', unit, 'ledger'), {
          date, particulars, receipt: String(fd.get('receipt')).trim(), debit, credit,
          createdAt: F.serverTimestamp(), createdBy: adminUid
        });
        form.reset();
        setMsg(form, 'Entry added.', true);
        await renderAdminLedger(unit);
      } catch (err) { setMsg(form, errorText(err)); }
    });
  });

  $('#admin-ledger').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-del]');
    if (!btn || !confirm('Delete this entry? This can’t be undone.')) return;
    const unit = $('#admin-unit').value;
    await busy(btn, async () => {
      try {
        await F.deleteDoc(F.doc(db, 'units', unit, 'ledger', btn.dataset.del));
        await renderAdminLedger(unit);
      } catch (err) { alert(errorText(err)); }
    });
  });
}
