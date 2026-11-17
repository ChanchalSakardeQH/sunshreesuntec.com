// Member access: register (mobile + email) → committee approves in admin.html → member sees own unit's
// balance, bills, receipts and account entries. Enforced by the server's access rules.
import { initFirebase, errorText, inApp, saveBlob, signOutUser } from './firebase.js';
import { signInWithGoogle, finishGoogleRedirect, signInWithPassword, logSignIn, showMsg } from './signin.js';
import { initOfflineUi, markSaved, saveForOffline } from './offline.js';
import { getDues, fmt, esc, ownerCell, RELATIONS, relationLabel } from './data.js';
import { ddmmyyyy, monthLabel, money, todayIST } from './billing-core.js';
import { mergeLedger } from './accounts.js';
import { SELF_REGISTER_ROLES, rolePolicy, PERM_LABEL } from './staff.js';
import { loadPastReceipts, preLedger } from './pastreceipts.js';
import { loadAuditYears, listArchive, openArchiveDoc, archiveBlob, yearEndRows } from './archive.js';
import { agreementHTML } from './memberagreement.js';
import { MEMBER_DOC_KINDS, DOC_STATUS, detailLines } from './memberdocs.js';
import { loadDriveCfg, driveReady, driveCall, prepareFile, toBase64, safeName } from './drive.js';

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
  const p = el.matches('.form-msg') ? el : $('.form-msg', el);
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
  $('#member-agreement').hidden = which !== 'agreement';
}

function setSignedInUI(user) {
  $$('.nav-member').forEach((a) => (a.textContent = user ? 'My account' : 'Member login'));
  $$('[data-signout]').forEach((b) => (b.hidden = !user));
}

/** Signed out: 'start' (Register / Sign in choice), 'signin' or 'register'. */
function authView(name) {
  $('#auth-start').hidden = name !== 'start';
  $('#auth-signin').hidden = name !== 'signin';
  $('#register-form').hidden = name !== 'register';
}

/* Registration details are filled in BEFORE Google is opened, kept for 30 minutes in this tab (they survive
   Google's redirect), and the request is sent as soon as Google returns with the person's Gmail. */
const PENDING_KEY = 'ssPendingRegistration';
const savePending = (d) => { try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ d, t: Date.now() })); } catch { /* private mode */ } };
const clearPending = () => { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } };
function readPending() {
  try {
    const x = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    return x && Date.now() - x.t < 30 * 60000 ? x.d : null;
  } catch { return null; }
}

/** Member of a unit, or staff / official: shows the matching fields. */
function setRegisterKind() {
  const staff = $('#register-form [name=kind]:checked')?.value === 'staff';
  $$('#register-form .reg-member').forEach((el) => { el.hidden = staff; const i = $('select, input', el); if (i) i.required = !staff; });
  $$('#register-form .reg-staff').forEach((el) => { el.hidden = !staff; });
  $('#register-form input[name=declare]').closest('label').lastChild.textContent = staff
    ? ' The details above are true. I will use any access only for the Society’s work and keep members’ information confidential.'
    : ' The details above are true. I understand the committee checks them before giving access.';
}

/** completing = already signed in (e.g. signed in with Google before registering): no Google step left. */
function setRegisterMode(completing, email = '') {
  const btn = $('#register-submit');
  $('#register-title').textContent = completing ? 'Finish your registration' : 'Register';
  $('#register-intro').textContent = completing
    ? `You’re signed in as ${email}, but haven’t sent a request yet. Fill in your details and press Send request.`
    : 'Fill in the form, then confirm with your Gmail. Your request goes to the committee in one step.';
  $('#reg-step3').hidden = completing; $('#reg-gmail-note').hidden = completing;
  $('#register-switch').hidden = completing;
  btn.className = completing ? 'btn btn-primary' : 'btn btn-google';
  btn.innerHTML = completing ? 'Send request' : '<span aria-hidden="true" class="g-logo">G</span> Continue with Google and send request';
}

function fillRegisterForm(d) {
  const f = $('#register-form');
  if (!d) return;
  $(`[name=kind][value=${d.staff ? 'staff' : 'member'}]`, f).checked = true;
  setRegisterKind();
  f.name.value = d.name || ''; f.mobile.value = d.mobile || '';
  if (d.unit) f.unit.value = d.unit;
  if (d.relation) f.relation.value = d.relation;
  if (d.role) f.role.value = d.role;
  f.org.value = d.org || '';
}

/** Saves the request: users/{uid} for a unit member, staffRequests/{uid} for staff and officials. */
async function sendRequest(user, d) {
  const { F, db } = fb;
  const provider = user.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password';
  if (d.staff) {
    await F.setDoc(F.doc(db, 'staffRequests', user.uid), { name: d.name, role: d.role, org: d.org, mobile: d.mobile, email: user.email, status: 'pending', provider, createdAt: F.serverTimestamp() });
    logSignIn(fb, { method: 'register', page: 'member', result: 'ok', email: user.email, detail: `staff request as ${d.role}${d.org ? ` (${d.org})` : ''} (${provider})` });
  } else {
    await F.setDoc(F.doc(db, 'users', user.uid), { name: d.name, unit: d.unit, mobile: d.mobile, relation: d.relation, email: user.email, status: 'pending', provider, createdAt: F.serverTimestamp() });
    logSignIn(fb, { method: 'register', page: 'member', result: 'ok', email: user.email, detail: `request for ${d.unit} as ${relationLabel(d.relation)} (${provider})` });
  }
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
    authView(readPending() ? 'register' : 'start');
    showPanel('auth');
    return;
  }

  const [adminSnap, profSnap, staffSnap] = await Promise.all([
    F.getDoc(F.doc(db, 'admins', user.uid)).catch(() => null),
    F.getDoc(F.doc(db, 'users', user.uid)),
    F.getDoc(F.doc(db, 'staffRequests', user.uid)).catch(() => null)
  ]);
  const isAdmin = Boolean(adminSnap?.exists());
  $('.nav-admin').hidden = !isAdmin;
  profile = profSnap.exists() ? profSnap.data() : null;
  let staffReq = staffSnap?.exists() ? staffSnap.data() : null;

  // Came back from Google while registering: send the request filled in before.
  const pending = readPending();
  if (pending && !profile && !staffReq && !isAdmin) {
    registering = true;
    try {
      await sendRequest(user, pending);
      clearPending();
      return void (registering = false, await onUser(user));
    } catch (err) {
      registering = false;
      clearPending();
      setRegisterMode(true, user.email);
      fillRegisterForm(pending);
      authView('register'); showPanel('auth');
      setMsg($('#register-form'), errorText(err));
      logSignIn(fb, { method: 'register', page: 'member', result: 'failed', code: err?.code || 'unknown', email: user.email, detail: pending.staff ? `staff request as ${pending.role}` : `request for ${pending.unit}` });
      return;
    }
  }
  if (pending) clearPending();   // already registered, or a committee / staff account

  if (!profile) {
    if (isAdmin) {
      const a = adminSnap.data();
      showPanel('status');
      $('#member-status').innerHTML = `<p>You’re signed in with a ${a.kind === 'staff' ? `staff account (${esc(a.role || 'staff')})` : 'committee account'}: ${esc(user.email)}.</p>
        <div class="form-actions"><a class="btn btn-primary" href="admin.html">Open Society accounts</a>
        <button class="btn" type="button" data-signout>Sign out</button></div>`;
      return;
    }
    if (staffReq) { renderStaffStatus(user, staffReq); return; }
    // Signed in (e.g. "Sign in with Google") but never registered: finish the registration here.
    setRegisterMode(true, user.email);
    authView('register');
    showPanel('auth');
    const rf = $('#register-form');
    if (!rf.name.value && user.displayName) rf.name.value = user.displayName;
    setMsg(rf, '');
    return;
  }

  if (profile.status === 'approved' && user.emailVerified) {
    // 3.13: the current member portal agreement must be accepted first (new and existing members alike).
    currentAg = await loadMemberAgreement().catch(() => null);
    if (currentAg && Number(profile.agreementVersion || 0) !== currentAg.version) { showAgreement(user); return; }
    showPanel('account');
    await loadAccount();
    // In the app: note when this was loaded, and keep the Society documents on the phone too.
    if (navigator.onLine) { markSaved(); saveForOffline(fb).catch(() => {}); }
    return;
  }
  renderStatus(user);
}

function renderStaffStatus(user, req) {
  showPanel('status');
  const role = esc(req.role), verify = user.emailVerified ? '' : `<p>Confirm your email address: open the link we sent to <strong>${esc(user.email)}</strong>.</p>`;
  const body = req.status === 'rejected'
    ? `<h2>Request not approved</h2><p>Your request to work as ${role} wasn’t approved.</p>${req.reason ? `<p><strong>Reason:</strong> ${esc(req.reason)}</p>` : ''}<p>Please contact the Society office if you think this is a mistake.</p>`
    : req.status === 'approved'
      ? `<h2>Access ended</h2><p>Your access as ${role} has ended or was removed. Please contact the Society office if you still need it.</p>`
      : `<h2>Request sent</h2><p>Your request to work as ${role}${req.org ? ` (${esc(req.org)})` : ''} is waiting for the committee. Once approved, open the Society accounts page and sign in with <strong>${esc(user.email)}</strong>.</p>${verify}`;
  $('#member-status').innerHTML = `${body}<div class="form-actions"><a class="btn" href="admin.html">Society accounts page</a><button class="btn" type="button" data-signout>Sign out</button></div>`;
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
  wireMemberDocs();
  const { A, F, auth, db } = fb;
  $('#auth-panels').hidden = false;
  const sayGoogle = (text, kind, details) => showMsg($('#google-box'), text, kind, details);
  $('#member-google').addEventListener('click', (e) => signInWithGoogle(fb, { page: 'member', button: e.currentTarget, say: sayGoogle }));
  finishGoogleRedirect(fb, sayGoogle);
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => { authView(b.dataset.go); $('#member-title').scrollIntoView({ behavior: 'smooth' }); }));
  const relNote = { owner: 'Owners and their family see the unit’s bills, receipts and balance once approved.',
    tenant: 'Tenants first see the Society’s notices, accounts and documents. The committee can also give you the unit’s bills and balance (for example if you pay the maintenance).',
    caretaker: 'Caretakers and agents first see the Society’s accounts and documents. The committee can give more access with the owner’s consent.' };
  $('#register-relation').addEventListener('change', (e) => {
    const r = e.currentTarget.value;
    $('#register-relation-note').textContent = relNote[r] || relNote.owner;
  });
  // Staff and officials: role, and what that role usually gets (the committee decides the final access).
  $('#register-role').innerHTML = SELF_REGISTER_ROLES.map((r) => `<option>${esc(r)}</option>`).join('');
  const roleNote = () => {
    const pol = rolePolicy($('#register-role').value);
    const what = pol.perms.map((k) => (PERM_LABEL[k] || k).split(':')[0].toLowerCase());
    $('#register-role-note').textContent = `After approval you sign in on the Society accounts page. ${what.length ? `Usual access for this role: ${what.join('; ')}.` : 'The committee decides your access.'}${
      pol.days ? ` Access lasts ${pol.days} days unless the committee extends it.` : ''} The committee checks every request.`;
  };
  $('#register-role').addEventListener('change', roleNote);
  roleNote();
  $$('#register-form [name=kind]').forEach((r) => r.addEventListener('change', setRegisterKind));

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
    const staff = fd.get('kind') === 'staff';
    const role = SELF_REGISTER_ROLES.includes(String(fd.get('role'))) ? String(fd.get('role')) : 'Other';
    const org = String(fd.get('org') || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    const completing = Boolean(auth.currentUser);
    if (name.length < 3) return setMsg(form, 'Enter your full name.');
    if (!staff && !unit) return setMsg(form, 'Choose your unit.');
    if (!/^[6-9]\d{9}$/.test(mobile)) return setMsg(form, 'Enter a 10-digit Indian mobile number.');
    if (!fd.get('declare')) return setMsg(form, 'Tick the box to confirm the details are true.');
    const details = { staff, name, unit: staff ? '' : unit, relation, role, org, mobile };
    setMsg(form, '');
    if (!completing) {
      // Gmail is the login: open Google; the request is sent when it returns (onUser).
      savePending(details);
      const ok = await signInWithGoogle(fb, { page: 'member', button: $('#register-submit'), say: (t, k, d) => showMsg(form, t, k, d) });
      if (!ok && !auth.currentUser) {
        const msg = $('.form-msg', form).textContent;
        if (!msg || /Opening Google/.test(msg)) setMsg(form, 'Google sign-in didn’t finish. Press the button again; your details are kept.');
      }
      return;
    }
    await busy($('#register-submit'), async () => {
      registering = true;
      try {
        await sendRequest(auth.currentUser, details);
        form.reset(); setRegisterKind();
      } catch (err) {
        setMsg(form, errorText(err));
        logSignIn(fb, { method: 'register', page: 'member', result: 'failed', code: err?.code || 'unknown', email: auth.currentUser?.email || '', detail: staff ? `staff request as ${role}` : `request for ${unit}` });
      } finally {
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

/* ---------- member portal agreement (3.13) ---------- */
let currentAg = null;

async function loadMemberAgreement() {
  const { F, db } = fb;
  const s = await F.getDoc(F.doc(db, 'settings', 'memberAgreement'));
  if (!s.exists() || !s.data().version) return null;
  const v = Number(s.data().version);
  const t = await F.getDoc(F.doc(db, 'memberAgreementVersions', String(v)));
  return t.exists() ? { ...t.data(), version: v } : null;
}

const wingOf = (unitId) => { const u = dues.units.find((x) => x.id === unitId); return dues.blocks.find((b) => b.id === u?.block)?.name || u?.block || ''; };
const plainUnit = (unitId) => dues.units.find((x) => x.id === unitId)?.unit || unitId;
const person = (user) => ({ name: profile.name, email: user.email, unit: unitLabel(profile.unit), relation: profile.relation, mobile: profile.mobile });

function showAgreement(user) {
  $('#ma-doc').innerHTML = agreementHTML(currentAg, person(user));
  $('#ma-email').textContent = user.email;
  const f = $('#ma-form');
  f.reset();
  f.sign.value = profile.name || '';
  setMsg(f, '');
  showPanel('agreement');
}

async function acceptAgreement(e) {
  e.preventDefault();
  const f = e.currentTarget, user = fb.auth.currentUser;
  const boxes = $$('input[type=checkbox]', f);
  const signed = f.sign.value.trim().replace(/\s+/g, ' ');
  if (boxes.some((b) => !b.checked)) return setMsg(f, 'Please tick all four boxes to accept the agreement.');
  if (signed.length < 3) return setMsg(f, 'Type your full name as your signature.');
  const { F, db } = fb;
  const v = currentAg.version, id = `${user.uid}_v${v}`;
  await busy($('button[type=submit]', f), async () => {
    try {
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, 'memberAgreements', id), {
        uid: user.uid, email: user.email, name: profile.name || '', mobile: profile.mobile || '', relation: profile.relation || '',
        unit: profile.unit, unitLabel: plainUnit(profile.unit), wing: wingOf(profile.unit),
        version: v, title: currentAg.title, signedName: signed, confirmations: boxes.map((b) => b.value),
        acceptedAt: F.serverTimestamp(), device: navigator.userAgent.slice(0, 180)
      });
      batch.update(F.doc(db, 'users', user.uid), { agreementVersion: v, agreementAcceptedAt: F.serverTimestamp(), agreementId: id });
      await batch.commit();
      profile.agreementVersion = v; profile.agreementId = id;
      setMsg(f, 'Accepted. Saving your copy and emailing it to you…', true);
      const sent = await archiveAgreement(id);
      showPanel('account');
      await loadAccount();
      setMsg($('#md-msg'), sent?.emailed ? `Thank you. Your copy of the agreement has been emailed to ${user.email}.` : 'Thank you. Your acceptance is recorded; your copy will be emailed to you shortly.', true);
      if (navigator.onLine) { markSaved(); saveForOffline(fb).catch(() => {}); }
    } catch (err) { setMsg(f, errorText(err)); }
  });
}

/** PDF in the unit's Drive folder and email (with a copy to the Society). Quiet on failure; tried again on the next visit. */
async function archiveAgreement(id) {
  try {
    await loadDriveCfg(fb);
    if (!driveReady()) return null;
    const r = await driveCall(fb, 'memberAgreement', { agreementId: id });
    const { F, db } = fb;
    await F.updateDoc(F.doc(db, 'memberAgreements', id), { pdf: r.pdf, emailed: Boolean(r.emailed), emailedTo: r.emailedTo || '', cc: r.cc || '', emailNote: r.note || '', archivedAt: F.serverTimestamp() });
    return r;
  } catch (err) { console.warn('agreement copy', err); return null; }
}

/* ---------- my unit's documents (3.13) ---------- */
/** "C 202 Agreement for sale … - agreement-2012.pdf" → "agreement-2012.pdf" */
const shortName = (n) => { const i = String(n).lastIndexOf(' - '); return i > 0 ? n.slice(i + 3) : n; };
let myDocs = [], mdKind = null, mdId = null, mdFiles = [], mdNew = [];

async function loadMyDocs() {
  const { F, db } = fb;
  const snap = await F.getDocs(F.collection(db, 'units', profile.unit, 'memberDocs')).catch(() => ({ docs: [] }));
  myDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
  const order = Object.keys(MEMBER_DOC_KINDS);
  myDocs.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  $('#md-list').innerHTML = myDocs.map((d) => {
    const st = DOC_STATUS[d.status] || DOC_STATUS.submitted, mine = d.submittedBy === fb.auth.currentUser.uid, open = d.status !== 'acknowledged';
    return `<tr><td><strong>${esc(MEMBER_DOC_KINDS[d.kind]?.short || d.kind)}</strong><span class="sub">${esc(d.title || '')}</span></td>
      <td>${detailLines(d.kind, d.details).map((l) => esc(l).replace(/\n/g, '<br>')).join('<br>')}</td>
      <td>${(d.files || []).map((x) => `<button class="file-link" type="button" data-md-file="${esc(d.id)}" data-fid="${esc(x.id)}" title="${esc(x.name)}">📎 ${esc(shortName(x.name))}</button>`).join('<br>') || '—'}</td>
      <td><span class="doc-pill ${st.cls}">${esc(st.text)}</span>${d.ack ? `<span class="sub">Ack. ${esc(d.ack.no)}, ${ddmmyyyy(d.ack.date)}</span>` : ''}${d.review?.reason && d.status === 'returned' ? `<span class="sub">${esc(d.review.reason)}</span>` : ''}</td>
      <td>${mine && open ? `<button class="btn btn-small" type="button" data-md-edit="${esc(d.id)}">Edit</button> <button class="btn btn-small" type="button" data-md-del="${esc(d.id)}">Withdraw</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No documents uploaded yet. Start with your sale deed or agreement and its Index II.</td></tr>';
  // The agreement accepted, with a copy to download; send the copy now if it didn't go earlier.
  const id = profile.agreementId;
  if (id) {
    const a = await F.getDoc(F.doc(db, 'memberAgreements', id)).catch(() => null);
    const rec = a?.exists() ? a.data() : null;
    if (rec && !rec.pdf) archiveAgreement(id).then((r) => r && loadMyDocs()).catch(() => {});
    $('#my-agreement').innerHTML = rec ? `Member portal agreement: version ${esc(rec.version)} accepted by ${esc(rec.signedName)}${rec.acceptedAt?.toDate ? ` on ${rec.acceptedAt.toDate().toLocaleDateString('en-IN')}` : ''}.
      ${rec.pdf ? `<button class="file-link" type="button" data-agreement="${esc(id)}">Download your copy</button>` : '<span class="muted">Your copy is being prepared.</span>'}` : '';
  }
  const ready = driveReady();
  $$('#md-add [data-md-add]').forEach((b) => (b.disabled = !ready));
  if (!ready) setMsg($('#md-msg'), 'Uploading documents will be available once the committee connects the Society’s records storage.');
}

function openMd(kind, doc = null) {
  const k = MEMBER_DOC_KINDS[kind];
  mdKind = kind; mdId = doc?.id || null;
  mdFiles = (doc?.files || []).map((f) => ({ ...f, keep: true })); mdNew = [];
  $('#md-title').textContent = `${doc ? 'Edit' : 'Add'}: ${k.label}`;
  $('#md-help').textContent = k.help;
  const d = doc?.details || {};
  $('#md-fields').innerHTML = k.fields.map(([key, label, type, opt]) => {
    const req = opt === true ? ' required' : '', star = opt === true ? ' *' : '', val = d[key] ?? '';
    if (type === 'select') return `<label>${esc(label)}<select name="${key}"><option value=""></option>${opt.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (type === 'textarea') return `<label class="wide">${esc(label)}${star}<textarea name="${key}" rows="${key === 'people' ? 5 : 3}"${req}>${esc(val)}</textarea></label>`;
    return `<label>${esc(label)}${star}<input type="${type}" name="${key}" value="${esc(val)}"${req}${type === 'number' ? ' min="0" step="1"' : ''}></label>`;
  }).join('');
  renderMdFiles();
  setMsg($('#md-form'), '');
  $('#md-dialog').showModal();
}

function renderMdFiles() {
  $('#md-file-list').innerHTML = mdFiles.map((f, i) => `<li class="${f.keep ? '' : 'removing'}"><span>${esc(f.name)}</span> <button class="btn-link" type="button" data-md-keep="${i}">${f.keep ? 'Remove' : 'Keep'}</button></li>`).join('')
    + mdNew.map((f, i) => `<li><span>${esc(f.name)}</span> <span class="muted">new</span> <button class="btn-link" type="button" data-md-drop="${i}">Remove</button></li>`).join('')
    || '<li class="muted">No files yet.</li>';
}

async function saveMd(e) {
  e.preventDefault();
  const f = e.currentTarget, k = MEMBER_DOC_KINDS[mdKind];
  const details = {};
  for (const [key, label, type, opt] of k.fields) {
    let v = f[key].value.trim();
    if (opt === true && !v) return setMsg(f, `Please fill in “${label}”.`);
    if (type === 'number' && v !== '') v = Number(v);
    if (v !== '') details[key] = v;
  }
  const kept = mdFiles.filter((x) => x.keep).map(({ keep, ...x }) => x);
  if (!kept.length && !mdNew.length && mdKind !== 'occupants') return setMsg(f, 'Add the scanned PDF or photos of the document.');
  const { F, db } = fb;
  await busy($('button[type=submit]', f), async () => {
    try {
      const added = [];
      const unitLabelPlain = plainUnit(profile.unit), title = k.title(details);
      for (let i = 0; i < mdNew.length; i++) {
        setMsg(f, `Uploading file ${i + 1} of ${mdNew.length}… Please keep this page open.`, true);
        const file = await prepareFile(mdNew[i]);
        const ext = (file.name.match(/\.(\w+)$/)?.[1] || (file.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
        const r = await driveCall(fb, 'memberUpload', { unitId: profile.unit, unitLabel: unitLabelPlain, wing: wingOf(profile.unit), record: mdKind,
          name: `${unitLabelPlain} ${safeName(title.replace(/→/g, "to"), 80)} - ${safeName(file.name.replace(/\.\w+$/, ''), 40)}.${ext}`,
          mimeType: file.type, data: await toBase64(file), note: `${k.label} uploaded by ${profile.name}` });
        added.push(r.file);
      }
      const files = [...kept, ...added];
      if (mdId) await F.updateDoc(F.doc(db, 'units', profile.unit, 'memberDocs', mdId), { title, details, files, status: 'submitted', updatedAt: F.serverTimestamp() });
      else await F.addDoc(F.collection(db, 'units', profile.unit, 'memberDocs'), { kind: mdKind, title, details, files, status: 'submitted', relation: profile.relation || '',
        submittedBy: fb.auth.currentUser.uid, submittedByName: profile.name || '', submittedAt: F.serverTimestamp() });
      $('#md-dialog').close();
      await loadMyDocs();
      setMsg($('#md-msg'), `Saved. Please hand over a self-attested physical copy at the Society’s office; the committee will record it and give you an acknowledgment number.`, true);
    } catch (err) { setMsg(f, errorText(err)); }
  });
}

async function openMemberFile(payload, name) {
  const msg = $('#md-msg');
  setMsg(msg, 'Opening…', true);
  try {
    const r = await driveCall(fb, 'memberFetch', payload);
    const bin = atob(r.data), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await saveBlob(new Blob([u8], { type: r.mime }), r.name || name);
    setMsg(msg, '');
  } catch (err) { setMsg(msg, errorText(err)); }
}

function wireMemberDocs() {
  $('#ma-form').addEventListener('submit', (e) => acceptAgreement(e));
  $('#md-add').addEventListener('click', (e) => { const b = e.target.closest('[data-md-add]'); if (b) openMd(b.dataset.mdAdd); });
  $('#md-cancel').addEventListener('click', () => $('#md-dialog').close());
  $('#md-form').addEventListener('submit', (e) => saveMd(e));
  $('#md-file-input').addEventListener('change', (e) => {
    for (const file of e.target.files) {
      if (!/^image\/|^application\/pdf$/.test(file.type)) { setMsg($('#md-form'), `${file.name}: only PDF files and photos can be added.`); continue; }
      if (file.type === 'application/pdf' && file.size > 25 * 1024 * 1024) { setMsg($('#md-form'), `${file.name} is larger than 25 MB. Scan it at 200 dpi in grey, or split it into parts.`); continue; }
      mdNew.push(file);
    }
    e.target.value = '';
    renderMdFiles();
  });
  $('#md-file-list').addEventListener('click', (e) => {
    const k = e.target.closest('[data-md-keep]'), d = e.target.closest('[data-md-drop]');
    if (k) { const x = mdFiles[Number(k.dataset.mdKeep)]; x.keep = !x.keep; renderMdFiles(); }
    if (d) { mdNew.splice(Number(d.dataset.mdDrop), 1); renderMdFiles(); }
  });
  $('#my-docs').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-md-edit]'), del = e.target.closest('[data-md-del]'), fl = e.target.closest('[data-md-file]'), ag = e.target.closest('[data-agreement]');
    if (ed) { const d = myDocs.find((x) => x.id === ed.dataset.mdEdit); if (d) openMd(d.kind, d); }
    if (fl) openMemberFile({ unitId: profile.unit, recordId: fl.dataset.mdFile, fileId: fl.dataset.fid }, fl.textContent);
    if (ag) {
      const { F, db } = fb;
      const a = await F.getDoc(F.doc(db, 'memberAgreements', ag.dataset.agreement));
      if (a.exists() && a.data().pdf) openMemberFile({ agreementId: ag.dataset.agreement, fileId: a.data().pdf.id }, a.data().pdf.name);
    }
    if (del && confirm('Withdraw this document? The upload is removed from your list (the committee keeps the files already received).')) {
      const { F, db } = fb;
      try { await F.deleteDoc(F.doc(db, 'units', profile.unit, 'memberDocs', del.dataset.mdDel)); await loadMyDocs(); } catch (err) { setMsg($('#md-msg'), errorText(err)); }
    }
  });
}

async function loadAccount() {
  const { F, db } = fb;
  const unitId = profile.unit;
  await loadDriveCfg(fb).catch(() => null);
  loadMyDocs().catch((err) => console.warn('unit documents', err));
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
