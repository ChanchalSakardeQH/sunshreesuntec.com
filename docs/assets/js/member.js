// Member access: register (mobile + email) → committee approves in admin.html → member sees own unit's
// balance, bills, receipts and account entries. Enforced by the server's access rules.
import { initFirebase, errorText, inApp, saveBlob, signOutUser } from './firebase.js';
import { signInWithGoogle, finishGoogleRedirect, signInWithPassword, logSignIn, showMsg } from './signin.js';
import { initOfflineUi, markSaved, saveForOffline } from './offline.js';
import { getDues, fmt, esc, ownerCell, RELATIONS, relationLabel } from './data.js';
import { ddmmyyyy, monthLabel, money, todayIST } from './billing-core.js';
import { mergeLedger } from './accounts.js';
import { loadPastReceipts, preLedger } from './pastreceipts.js';
import { loadAuditYears, listArchive, openArchiveDoc, archiveBlob, yearEndRows } from './archive.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let fb, dues, profile = null, registering = false;

main().catch((err) => console.error('Member module failed to start', err));

async function main() {
  initOfflineUi();
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
    // In the app: note when this was loaded, and keep the Society documents on the phone too.
    if (navigator.onLine) { markSaved(); saveForOffline(fb).catch(() => {}); }
    return;
  }
  renderStatus(user);
}

function renderStatus(user) {
  showPanel('status');
  const unit = esc(unitLabel(profile.unit));
  const as = profile.relation ? ` as ${esc(relationLabel(profile.relation).toLowerCase())}` : '';
  const verify = user.emailVerified ? '' : `<p>Confirm your email address: open the link we sent to <strong>${esc(user.email)}</strong>. Check your spam folder if it isn’t in your inbox.</p>`;
  const verifyBtns = user.emailVerified ? '' : `<button class="btn" type="button" data-act="resend">Resend link</button>
    <button class="btn btn-primary" type="button" data-act="recheck">I’ve confirmed my email</button>`;
  const body = profile.status === 'pending'
    ? `<h2>Request sent</h2><p>Your request for ${unit}${as} is waiting for approval. The committee checks each request against the member register before giving access.</p>${verify}`
    : profile.status === 'approved'
      ? `<h2>Access approved</h2><p>Your access to ${unit} is approved.</p>${verify}`
      : `<h2>${profile.removed ? 'Access removed' : 'Request not approved'}</h2>
        <p>${profile.removed ? `Your access to ${unit} has been removed by the committee.` : `Your request for ${unit} wasn’t approved.`}
        Contact the Society office with proof of ownership if you think this is a mistake.</p>
        ${profile.reason ? `<p><strong>Reason:</strong> ${esc(profile.reason)}</p>` : ''}`;
  $('#member-status').innerHTML = `${body}<p class="form-msg" role="alert"></p>
    <div class="form-actions">${verifyBtns}<button class="btn" type="button" data-signout>Sign out</button></div>`;
}

/* ---------- forms ---------- */

function wireForms() {
  const { A, F, auth, db } = fb;
  $('#auth-panels').hidden = false;
  const sayGoogle = (text, kind, details) => showMsg($('#google-box'), text, kind, details);
  $('#member-google').addEventListener('click', (e) => signInWithGoogle(fb, { page: 'member', button: e.currentTarget, say: sayGoogle }));
  finishGoogleRedirect(fb, sayGoogle);
  $$('.switch-btn').forEach((b) => b.addEventListener('click', () => switchAuthPanel(b.dataset.panel)));
  const relNote = { owner: 'Owners and their family see the unit’s bills, receipts and balance once approved.',
    tenant: 'Tenants first see the Society’s notices, accounts and documents. The committee can also give you the unit’s bills and balance (for example if you pay the maintenance).',
    caretaker: 'Caretakers and agents first see the Society’s accounts and documents. The committee can give more access with the owner’s consent.' };
  $('#register-relation').addEventListener('change', (e) => {
    const r = e.currentTarget.value;
    $('#register-relation-note').textContent = relNote[r] || relNote.owner;
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    const email = String(fd.get('email')).trim(), password = String(fd.get('password'));
    if (!email || !password) { showMsg(form, 'Enter your email and password.'); return; }
    await busy($('button[type=submit]', form), async () => {
      const ok = await signInWithPassword(fb, { page: 'member', email, password, say: (t, k, d) => showMsg(form, t, k, d) });
      if (ok) form.reset();
    });
  });

  $('#forgot-btn').addEventListener('click', async () => {
    const form = $('#login-form');
    const email = String(new FormData(form).get('email')).trim();
    if (!email) { setMsg(form, 'Enter your email above, then choose “Forgot password?” again.'); return; }
    try {
      await A.sendPasswordResetEmail(auth, email);
      setMsg(form, `If ${email} is registered, a password reset link is on its way.`, true);
      logSignIn(fb, { method: 'reset', page: 'member', result: 'ok', email });
    } catch (err) {
      setMsg(form, errorText(err));
      logSignIn(fb, { method: 'reset', page: 'member', result: 'failed', code: err?.code || 'unknown', email });
    }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    const name = String(fd.get('name')).trim().replace(/\s+/g, ' ');
    const unit = String(fd.get('unit'));
    const mobile = String(fd.get('mobile')).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    const relation = RELATIONS[String(fd.get('relation'))] ? String(fd.get('relation')) : 'owner';
    const completing = Boolean(auth.currentUser);
    if (name.length < 3) return setMsg(form, 'Enter your full name.');
    if (!unit) return setMsg(form, 'Choose your unit.');
    if (!/^[6-9]\d{9}$/.test(mobile)) return setMsg(form, 'Enter a 10-digit Indian mobile number.');
    if (!fd.get('declare')) return setMsg(form, 'Tick the box to confirm the details are true.');
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
        await F.setDoc(F.doc(db, 'users', user.uid), { name, unit, mobile, relation, email: user.email, status: 'pending', provider, createdAt: F.serverTimestamp() });
        logSignIn(fb, { method: 'register', page: 'member', result: 'ok', email: user.email, detail: `request for ${unit} as ${relationLabel(relation)} (${provider})` });
        form.reset();
      } catch (err) {
        setMsg(form, errorText(err));
        logSignIn(fb, { method: 'register', page: 'member', result: 'failed', code: err?.code || 'unknown', email: email || auth.currentUser?.email || '', detail: `request for ${unit}` });
      }
      finally {
        registering = false;
        if (auth.currentUser) await onUser(auth.currentUser).catch(showFatal);
      }
    });
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-signout], #member-status [data-act]');
    if (!btn) return;
    if (btn.hasAttribute('data-signout')) { await signOutUser(fb, inApp ? 'index.html#member' : ''); if (!inApp) location.hash = '#member'; return; }
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
  $('#account-name').textContent = `${profile.name} · ${relationLabel(profile.relation)}`;
  // Access 'basic' (set by the committee, e.g. for a caretaker): Society accounts and documents only.
  const basic = profile.access === 'basic';
  $('#account-money').hidden = basic;
  $('#account-basic').hidden = !basic;
  if (basic) {
    $('#account-basic').textContent = `Your access is to the Society’s accounts and documents. The bills, receipts and balance of ${unitLabel(unitId)} are shown to the owner’s side; if you need them (for example to pay maintenance), ask the committee to give you access to the unit account.`;
    audits = await loadAuditYears(fb).catch(() => []);
    await loadSocietyAccounts().catch((err) => console.warn('Society accounts unavailable', err));
    return;
  }

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
  // Full history: 2011-12 to 2017-18 (past committee's receipts, balanced to the audited figures each 31 March),
  // then the Society's Tally ledger up to 30 Sep 2026, then these accounts.
  audits = await loadAuditYears(fb).catch(() => []);
  const oldReceipts = await loadPastReceipts(fb, unitId).catch(() => []);
  const entries = mergeLedger(liveEntries, histSnap?.exists() ? histSnap.data() : null, preLedger(unitId, audits, oldReceipts));
  const cr = (v) => (v < 0 ? `<span class="amt-credit">${fmt(-v)} Cr</span>` : fmt(v));
  $('#account-years').innerHTML = yearEndRows(unitId, audits, entries, todayIST()).map((r) => `<tr>
    <td>${esc(r.fy)}</td><td>${ddmmyyyy(r.asOn)}</td><td>${esc(r.name)}</td><td>${esc(r.source)}${r.note ? ` <small class="muted">${esc(r.note)}</small>` : ''}</td>
    <td class="num">${r.amount == null ? '—' : cr(r.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No year-end figures yet.</td></tr>';
  loadSocietyAccounts().catch((err) => console.warn('Society accounts unavailable', err));
  let bal = 0;
  $('#account-ledger').innerHTML = entries.map((e) => {
    bal += (e.debit || 0) - (e.credit || 0);
    return `<tr${e.kind === 'memo' ? ' class="muted"' : ''}><td>${ddmmyyyy(e.date)}</td><td>${esc(e.particulars)}</td><td>${esc(e.receipt || '')}</td>
      <td class="num">${e.debit ? fmt(e.debit) : ''}</td><td class="num">${e.credit ? fmt(e.credit) : ''}</td>
      <td class="num">${bal < 0 ? `<span class="amt-credit">${fmt(-bal)} Cr</span>` : fmt(bal)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No account entries yet.</td></tr>';
}

/* ---------- Society accounts (audited years) and documents, for approved members ---------- */

let audits = [], docs = [];
const inr = (n) => (n == null ? '—' : fmt(n));

function stmt(title, groups, totalLabel, total) {
  return `<div class="table-scroll"><table class="stmt"><thead><tr><th scope="col">${esc(title)}</th><th scope="col" class="num">₹</th></tr></thead><tbody>
    ${groups.map((g) => `<tr class="grp"><td>${esc(g.group)}</td><td class="num">${inr(g.total)}</td></tr>
      ${g.items.filter((i) => i.amount).map((i) => `<tr class="item"><td>${esc(i.name)}</td><td class="num">${inr(i.amount)}</td></tr>`).join('')}`).join('')}
    </tbody><tfoot><tr><td>${esc(totalLabel)}</td><td class="num">${inr(total)}</td></tr></tfoot></table></div>`;
}

function renderYear(fy) {
  const a = audits.find((x) => x.fy === fy);
  if (!a) return;
  const ie = a.incomeExpenditure, bs = a.balanceSheet;
  const doc = docs.find((d) => d.fy === fy && /audit/i.test(`${d.category} ${d.title}`));
  $('#sa-body').innerHTML = `
    <dl class="dues-summary">
      <div><dt>Audit class</dt><dd>${esc(a.auditClass)}</dd></div>
      <div><dt>Income (₹)</dt><dd>${inr(a.income)}</dd></div>
      <div><dt>Expenditure (₹)</dt><dd>${inr(a.expenditure)}</dd></div>
      <div><dt>Surplus (₹)</dt><dd class="credit">${inr(a.surplus)}</dd></div>
      <div><dt>Members’ dues on 31 March (₹)</dt><dd class="due">${inr(a.debtors.members)}</dd></div>
      <div><dt>Builder pending (₹)</dt><dd>${inr(a.debtors.builderPending)}</dd></div>
    </dl>
    <p class="muted small-note">Audited by ${esc(a.auditor.name)}, ${esc(a.auditor.role)}; report dated ${ddmmyyyy(a.reportDate)}. Annual general meeting ${ddmmyyyy(a.agmDate)}; ${a.committeeMeetings} committee meetings in the year.
      ${doc ? `<button class="btn-link" type="button" data-sa-doc="${esc(doc.id)}">Open the full audit report</button>` : ''}</p>
    ${a.notes.length ? `<details class="glossary"><summary>Notes on this year’s file</summary><ul>${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
    <div class="stmt-pair">
      ${ie ? stmt('Expenditure', ie.expenditure, 'Surplus', a.surplus) + stmt('Income', ie.income, 'Total income', a.income)
        : `<p class="muted">The income &amp; expenditure statement is not in this year’s file; the surplus of ₹ ${inr(a.surplus)} is from the balance sheet.</p><div></div>`}
    </div>
    <details class="glossary mt-sm"><summary>Balance sheet on ${ddmmyyyy(a.to)} (total ₹ ${inr(bs.total)})</summary>
      <div class="stmt-pair">${stmt('Liabilities', bs.liabilities, 'Total', bs.total)}${stmt('Assets', bs.assets, 'Total', bs.total)}</div></details>
    <details class="glossary"><summary>Auditor’s remarks</summary><p>${esc(a.overall)}</p><ul>${[...a.compliance, ...a.suggestions].map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>
    <details class="glossary"><summary>Managing committee</summary><ul>${a.committee.map((c) => `<li>${esc(c.role)}: ${esc(c.name)} (${esc(c.unitId.replace('-', ' '))})</li>`).join('')}</ul></details>`;
}

async function loadSocietyAccounts() {
  docs = await listArchive(fb).catch(() => []);
  if (!audits.length && !docs.length) return;
  $('#society-accounts').hidden = false;
  if (audits.length) {
    const sel = $('#sa-year');
    sel.innerHTML = [...audits].reverse().map((a) => `<option value="${esc(a.fy)}">${esc(a.fy)}</option>`).join('');
    sel.onchange = () => renderYear(sel.value);
    renderYear(sel.value);
    $('#sa-trend').innerHTML = audits.map((a) => `<tr><td>${esc(a.fy)}</td><td>${esc(a.auditClass)}</td><td class="num">${inr(a.income)}</td><td class="num">${inr(a.expenditure)}</td>
      <td class="num">${inr(a.surplus)}</td><td class="num">${inr(a.debtors.members)}</td></tr>`).join('');
  } else {
    $('#sa-year').closest('label').hidden = true;
  }
  $('#sa-docs').innerHTML = docs.map((d) => `<tr><td>${esc(d.title)}${d.note ? `<br><small class="muted">${esc(d.note)}</small>` : ''}</td><td>${esc(d.fy || '')}</td><td class="num">${d.pages || ''}</td>
    <td><button class="btn btn-small" type="button" data-sa-doc="${esc(d.id)}">Open</button></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No documents yet.</td></tr>';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sa-doc]');
  if (!b) return;
  const d = docs.find((x) => x.id === b.dataset.saDoc);
  if (!d) return;
  const msg = $('#sa-msg');
  if (inApp) {
    try { await saveBlob(await archiveBlob(fb, d), `${d.title}.pdf`); msg.textContent = ''; }
    catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    return;
  }
  const win = window.open('', '_blank');
  if (win) win.document.write(`<p style="font:16px system-ui;padding:2rem">Opening ${esc(d.title)}…</p>`);
  try {
    const url = await openArchiveDoc(fb, d);
    if (win) win.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `${d.title}.pdf`; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    msg.textContent = '';
  } catch (err) { if (win) win.close(); msg.className = 'form-msg'; msg.textContent = errorText(err); }
});
