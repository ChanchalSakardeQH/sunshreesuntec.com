// Member access: register (mobile + email) → committee approves in admin.html → member sees own unit's
// balance, bills, receipts and account entries. Enforced by firestore.rules.
import { initFirebase, errorText, googleSignIn } from './firebase.js';
import { getDues, fmt, esc, ownerCell } from './data.js';
import { ddmmyyyy, monthLabel, money } from './billing-core.js';
import { mergeLedger } from './accounts.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let fb, dues, profile = null, registering = false;

main().catch((err) => console.error('Member module failed to start', err));

async function main() {
  dues = await getDues();
  fillUnitSelect();
  setSignedInUI(null);
  fb = await initFirebase();
  if (!fb) { $('#member-unavailable').hidden = false; return; }
  wireForms();
  fb.A.onAuthStateChanged(fb.auth, (user) => onUser(user).catch(showFatal));
}

/* ---------- helpers ---------- */

function unitLabel(id) {
  const u = dues.units.find((x) => x.id === id);
  if (!u) return id;
  const b = dues.blocks.find((x) => x.id === u.block);
  return `${u.unit} (${b ? b.name : u.block})`;
}

function fillUnitSelect() {
  $('#register-unit').insertAdjacentHTML('beforeend', dues.blocks.map((b) => `<optgroup label="${esc(b.name)}">${
    dues.units.filter((u) => u.block === b.id).map((u) => `<option value="${esc(u.id)}">${esc(u.unit)}</option>`).join('')}</optgroup>`).join(''));
}

function setMsg(el, text, ok = false) {
  const p = $('.form-msg', el);
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

function setRegisterMode(completing) {
  $$('#register-form .reg-only').forEach((l) => { l.hidden = completing; $('input', l).required = !completing; });
  $('.switcher').hidden = completing;
  $('#google-box').hidden = completing;
}

/* ---------- auth state ---------- */

async function onUser(user) {
  if (registering) return;
  setSignedInUI(user);
  const { F, db } = fb;

  if (!user) {
    profile = null;
    $('.nav-admin').hidden = true;
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
  profile = profSnap.exists() ? profSnap.data() : null;

  if (!profile) {
    if (isAdmin) {
      showPanel('status');
      $('#member-status').innerHTML = `<p>You’re signed in with a committee account (${esc(user.email)}).</p>
        <div class="form-actions"><a class="btn btn-primary" href="admin.html">Open accounts</a>
        <button class="btn" type="button" data-signout>Sign out</button></div>`;
      return;
    }
    setRegisterMode(true);
    switchAuthPanel('register');
    showPanel('auth');
    const rf = $('#register-form');
    if (!rf.name.value && user.displayName) rf.name.value = user.displayName;
    const viaGoogle = user.providerData.some((p) => p.providerId === 'google.com');
    setMsg(rf, `${viaGoogle ? `Signed in with Google as ${user.email}. ` : ''}Finish your request: add your name, unit and mobile number.`, true);
    return;
  }

  if (profile.status === 'approved' && user.emailVerified) {
    showPanel('account');
    await loadAccount();
    return;
  }
  renderStatus(user);
}

function renderStatus(user) {
  showPanel('status');
  const unit = esc(unitLabel(profile.unit));
  const verify = user.emailVerified ? '' : `<p>Confirm your email address: open the link we sent to <strong>${esc(user.email)}</strong>. Check your spam folder if it isn’t in your inbox.</p>`;
  const verifyBtns = user.emailVerified ? '' : `<button class="btn" type="button" data-act="resend">Resend link</button>
    <button class="btn btn-primary" type="button" data-act="recheck">I’ve confirmed my email</button>`;
  const body = profile.status === 'pending'
    ? `<h2>Request sent</h2><p>Your request for ${unit} is waiting for approval. The committee checks each request against the member register before giving access.</p>${verify}`
    : profile.status === 'approved'
      ? `<h2>Access approved</h2><p>Your access to ${unit} is approved.</p>${verify}`
      : `<h2>Request not approved</h2><p>Your request for ${unit} wasn’t approved. Contact the Society office with proof of ownership if you think this is a mistake.</p>`;
  $('#member-status').innerHTML = `${body}<p class="form-msg" role="alert"></p>
    <div class="form-actions">${verifyBtns}<button class="btn" type="button" data-signout>Sign out</button></div>`;
}

/* ---------- forms ---------- */

function wireForms() {
  const { A, F, auth, db } = fb;
  $('#auth-panels').hidden = false;
  $('#member-google').addEventListener('click', async (e) => {
    setMsg($('#google-box'), '');
    await busy(e.currentTarget, async () => {
      try { await googleSignIn(fb); } catch (err) { setMsg($('#google-box'), errorText(err)); }
    });
  });
  A.getRedirectResult(auth).catch((err) => setMsg($('#google-box'), errorText(err)));
  $$('.switch-btn').forEach((b) => b.addEventListener('click', () => switchAuthPanel(b.dataset.panel)));

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    setMsg(form, '');
    await busy($('button[type=submit]', form), async () => {
      try { await A.signInWithEmailAndPassword(auth, String(fd.get('email')).trim(), String(fd.get('password'))); form.reset(); }
      catch (err) { setMsg(form, errorText(err)); }
    });
  });

  $('#forgot-btn').addEventListener('click', async () => {
    const form = $('#login-form');
    const email = String(new FormData(form).get('email')).trim();
    if (!email) { setMsg(form, 'Enter your email above, then choose “Forgot password?” again.'); return; }
    try { await A.sendPasswordResetEmail(auth, email); setMsg(form, `If ${email} is registered, a password reset link is on its way.`, true); }
    catch (err) { setMsg(form, errorText(err)); }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
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
        const provider = user.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password';
        await F.setDoc(F.doc(db, 'users', user.uid), { name, unit, mobile, email: user.email, status: 'pending', provider, createdAt: F.serverTimestamp() });
        form.reset();
      } catch (err) { setMsg(form, errorText(err)); }
      finally {
        registering = false;
        if (auth.currentUser) await onUser(auth.currentUser).catch(showFatal);
      }
    });
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-signout], #member-status [data-act]');
    if (!btn) return;
    if (btn.hasAttribute('data-signout')) { await A.signOut(auth); location.hash = '#member'; return; }
    const card = $('#member-status'), user = auth.currentUser;
    if (!user) return;
    if (btn.dataset.act === 'resend') {
      await busy(btn, async () => {
        try { await A.sendEmailVerification(user); setMsg(card, `Link sent again to ${user.email}.`, true); }
        catch (err) { setMsg(card, errorText(err)); }
      });
    } else if (btn.dataset.act === 'recheck') {
      await busy(btn, async () => {
        await user.reload();
        await user.getIdToken(true);
        if (!auth.currentUser.emailVerified) { setMsg(card, 'Your email isn’t confirmed yet. Open the link in the email first.'); return; }
        await onUser(auth.currentUser);
      });
    }
  });
}

/* ---------- member account ---------- */

async function loadAccount() {
  const { F, db } = fb;
  const unitId = profile.unit;
  $('#account-unit').textContent = unitLabel(unitId);
  $('#account-name').textContent = profile.name;

  const [unitSnap, billSnap, paySnap, ledgerSnap, histSnap] = await Promise.all([
    F.getDoc(F.doc(db, 'units', unitId)).catch(() => null),
    F.getDocs(F.query(F.collection(db, 'bills'), F.where('unitId', '==', unitId))),
    F.getDocs(F.query(F.collection(db, 'payments'), F.where('unitId', '==', unitId))),
    F.getDocs(F.collection(db, 'units', unitId, 'ledger')),
    F.getDoc(F.doc(db, 'units', unitId, 'history', 'tally')).catch(() => null)
  ]);
  const unit = unitSnap?.exists() ? unitSnap.data() : dues.units.find((u) => u.id === unitId);
  const balance = unit?.balance ?? unit?.owner ?? null;

  $('#account-summary').innerHTML = `
    <div><dt>Balance today (₹)</dt><dd>${ownerCell(balance)}</dd></div>
    <div><dt>Builder pending maintenance (₹)</dt><dd>${unit?.bpm ? fmt(unit.bpm) : '—'}</dd></div>`;

  const bills = billSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month));
  $('#account-bills').innerHTML = bills.map((b) => `<tr>
    <td>${esc(b.billNo)}</td><td>${monthLabel(b.month)}</td><td>${ddmmyyyy(b.dueDate)}</td>
    <td class="num">${money(b.total, { slash: false })}</td>
    <td><a href="print.html?bill=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">View / download</a></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No bills yet.</td></tr>';

  const pays = paySnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
  $('#account-receipts').innerHTML = pays.map((p) => `<tr>
    <td>${esc(p.receiptNo)}${p.status === 'cancelled' ? ' <span class="flag">Cancelled</span>' : ''}</td><td>${ddmmyyyy(p.date)}</td><td>${esc(p.mode)}</td>
    <td class="num">${fmt(p.amount)}</td>
    <td><a href="print.html?receipt=${p.id}" target="_blank" rel="noopener">View / download</a></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No payments recorded yet.</td></tr>';

  const liveEntries = ledgerSnap.docs.map((d) => d.data())
    .sort((a, b) => a.date.localeCompare(b.date) || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  // Full history: the Society's Tally ledger up to 30 Sep 2026, then these accounts.
  const entries = mergeLedger(liveEntries, histSnap?.exists() ? histSnap.data() : null);
  let bal = 0;
  $('#account-ledger').innerHTML = entries.map((e) => {
    bal += (e.debit || 0) - (e.credit || 0);
    return `<tr><td>${ddmmyyyy(e.date)}</td><td>${esc(e.particulars)}</td><td>${esc(e.receipt || '')}</td>
      <td class="num">${e.debit ? fmt(e.debit) : ''}</td><td class="num">${e.credit ? fmt(e.credit) : ''}</td>
      <td class="num">${bal < 0 ? `<span class="amt-credit">${fmt(-bal)} Cr</span>` : fmt(bal)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No account entries yet.</td></tr>';
}
