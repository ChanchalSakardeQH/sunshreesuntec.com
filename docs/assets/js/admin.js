// Committee accounts: dashboard, monthly bills, payments + receipts, unit ledgers, member access, website content, settings.
import { initFirebase, errorText, inApp, saveBlob, signOutUser, SITE_VERSION, PROJECT_ID } from './firebase.js';
import { signInWithGoogle, finishGoogleRedirect, signInWithPassword, showMsg } from './signin.js';
import { initExpenses, loadExpenses, openExpenseById } from './expenses.js';
import { initOfflineUi, requireOnline } from './offline.js';
import { PERMS, PERM_LABEL, COMMITTEE_ONLY, permsFor, isCommitteeRecord, can, DEFAULT_AGREEMENT, setRolePolicies, rolePolicy, roleNames, DEFAULT_ROLE_POLICIES, accessEnds, accessEnded } from './staff.js';
import {
  loadBilling, loadSite, loadUnits, generateMonth, recordPayment, cancelPayment, addAdjustment,
  updateUnitDetails, importOpening, rebuildPublicDues,
  loadLiftExpenses, addLiftExpense, deleteLiftExpense, unitsServedBy, saveUnitMeasurements, addUnit, publicDuesNeedMasking,
  loadAllLedgers, fyStatement, fyBills, fyPayments, closeFinancialYear, reopenFinancialYear,
  importTallyHistory, mergeLedger, loadHistory, loadMergedLedgers, TAKEOVER_DATE,
  suggestMapping, historiesFromExport, saveTallyArchive, loadTallyArchive
} from './accounts.js';
import {
  listArchive, uploadArchiveDoc, openArchiveDoc, archiveBlob, deleteArchiveDoc, ARCHIVE_CATEGORIES,
  loadAuditYears, importAuditedAccounts, auditedBalancesFor, memberNamesFor, namePeriods,
  yearEndRows, handoverCheck, bpmHistory
} from './archive.js';
import {
  HEADS as PR_HEADS, STATUSES as PR_STATUSES, VERIFY as PR_VERIFY, VERIFY_LABEL, counts as prCounts, towardDues, loadPastReceipts, loadAllPastReceipts,
  importPastReceipts, savePastReceipt, addPastReceipt, loadPastReceiptEdits, preLedger, receiptsByYear
} from './pastreceipts.js';
import {
  LABEL, ONE_OFF, PREMISES_TYPES, STATUSES, PAYMENT_MODES, CATEGORY_MONTHLY,
  categoryIdFor, liftGroupFor, LIFT_GROUPS, LIFT_KINDS, addMonths, liftExpenseEndMonth, MAX_INTEREST_PA,
  interestPeriodsOf, checkInterestPeriods, monthInterestRate, pastInterest, RULES_2026_FROM,
  PARTICULARS, buildContext, mmcRates, computeBill, prepareExtras, extrasForUnit, constructionCostOf,
  financialYear, fyBounds, fyList, longDate,
  todayIST, monthOf, monthBounds, addDays, monthLabel, ddmmyyyy, round
} from './billing-core.js';
import { DEFAULT_SITE, MMC_TEMPLATE, DEFAULT_BILLING, AGM_2015_CATEGORIES } from './defaults.js';
import { loadDriveCfg, driveReady, driveFileUrl, driveCall, prepareFile, toBase64, safeName, driveScriptVersion, DRIVE_SCRIPT_NEEDED } from './drive.js';
import { TRANSFER_TYPES, DEFAULT_CHECKLISTS, caseProgress, openLetter, LETTERS, libraryFor } from './transfers.js';
import { FORMS, CHECKLIST_FORMS, formKeyOf, formLine, guideOf } from './forms.js';
import { collectSettings, checkSettingsFile, compareSettings, restoreSettings, settingsFileName } from './settingsbackup.js';
import { LIB_CATEGORIES, LIB_LANGS, LIB_TYPES, LIB_MAX_BYTES, pdfWords, wordList, saveIndex, setIndexPublic, loadIndex, forgetIndex, searchLibrary, fmtSize, extOf } from './library.js';
import { POSTS, SINGLE_POSTS, M20_DAYS, DEFAULT_UNDERTAKING, m20Status, undertakingFor, addYears, addDays as cAddDays } from './committee.js';
import { PREREG_MESSAGE, REMINDER_KINDS, REMINDER_SCRIPT_NEEDED, fillReminder, waNumber, tenDigits, validEmail, waLink, mailLink } from './reminders.js';
import { DEFAULT_MEMBER_AGREEMENT, agreementHTML as memberAgreementHTML, sectionsToText, textToSections } from './memberagreement.js';
import { MEMBER_DOC_KINDS, DOC_STATUS, detailLines } from './memberdocs.js';
import { initCorrespondence, loadCorrespondence, lettersForUnit, statusText as letterStatus } from './correspondence.js';
import { RECORD_FOLDER, TARIFFS, TAX_USES, commercialSigns, uploadUnitScans, backupUnitToDrive, compareWithBackup, restoreMissing } from './unitfiles.js';
import { getDues, getNotices, fmt, esc, fmtDate, relationLabel, defaultAccess } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TABS = ['dashboard', 'bills', 'payments', 'units', 'unitfile', 'lift', 'reports', 'documents', 'letters', 'library', 'transfers', 'members', 'expenses', 'directory', 'website', 'staff', 'settings', 'profile'];
const TAB_NEED = { letters: 'letters', library: 'library', transfers: 'view', documents: 'view', reports: 'view', unitfile: 'view', dashboard: 'view', bills: 'view', payments: 'view', units: 'view', lift: 'view', members: 'membersTab', expenses: 'expenses', directory: 'directory', website: 'website', staff: 'committee', settings: 'committee', profile: null };

let me = null;          // this person's admins record (committee or staff)
let agreement = null;   // current staff agreement
let undertaking = null, agreementMode = 'staff';   // 3.19: current committee undertaking; which document the agreement screen shows
// 3.18: the Chairman, Secretary, Treasurer (committee) or the Accountant (staff) decide members' applications to view the
// Society's accounts, and give or withdraw the permissions to see other units' amounts and the Society's accounts.
const APPROVER_ROLES = ['Chairman', 'Secretary', 'Treasurer'];
const isApprover = () => Boolean(me) && me.active !== false && (isCommitteeRecord(me) ? APPROVER_ROLES.includes(me.role) : me.role === 'Accountant');
const canDo = (p) => (!p ? true : p === 'committee' ? isCommitteeRecord(me)
  : p === 'membersTab' ? can(me, 'members') || isApprover()
  : p === 'expenses' ? ['view', 'submitExpenses', 'approveExpenses', 'payExpenses'].some((k) => can(me, k))
  : p === 'letters' ? ['view', 'correspondence'].some((k) => can(me, k)) : can(me, p));

let fb, uid, units = [], billing, site, dues;

/* ---------------- helpers ---------------- */

const amt = (n) => {
  n = round(n);
  return n < 0 ? `<span class="amt-credit">${fmt(-n)} Cr</span>` : n > 0 ? `<span class="amt-due">${fmt(n)}</span>` : '0';
};
const setMsg = (form, text, ok = false) => {
  const p = $('.form-msg', form);
  p.innerHTML = text;
  p.classList.toggle('ok', ok);
};
async function busy(btn, fn) {
  if (!requireOnline()) return;
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}
const blockName = (id) => dues.blocks.find((b) => b.id === id)?.name || id;
const unitOptions = (withBalance) => (!units.length
  ? '<option value="" disabled>No units yet: import them in Settings</option>'
  : dues.blocks.map((b) => `<optgroup label="${esc(b.name)}">${
  units.filter((u) => u.block === b.id).map((u) => `<option value="${esc(u.id)}">${esc(u.unit)}${u.name ? ' – ' + esc(u.name) : ''}${withBalance ? ` (₹ ${fmt(u.balance)})` : ''}</option>`).join('')
}</optgroup>`).join(''));

const noRates = () => (billing.method === 'mmc'
  ? !(billing.mmc?.expenses || []).some((e) => Number(e.monthly) > 0 && e.id !== 'education')
  : !(billing.categories || []).some((c) => Number(c.maintenance) > 0));
const catName = (u) => (billing.categories || []).find((c) => c.id === categoryIdFor(u))?.name || categoryIdFor(u);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function refreshCore() {
  [units, billing, site] = await Promise.all([
    canDo('view') ? loadUnits(fb) : Promise.resolve([]),
    canDo('view') ? loadBilling(fb) : Promise.resolve(structuredClone(DEFAULT_BILLING)),
    loadSite(fb)
  ]);
}

function applyAccess() {
  $$('#admin-nav [data-need]').forEach((a) => (a.hidden = !canDo(a.dataset.need)));
  $$('[data-perm]').forEach((el) => (el.hidden = !canDo(el.dataset.perm)));
}

/* ---------------- start ---------------- */

main().catch((err) => { console.error(err); $('#gate').textContent = errorText(err); });

async function main() {
  initOfflineUi();
  $('#version-note').textContent = `Software version ${SITE_VERSION}`;
  dues = await getDues();
  fb = await initFirebase();
  if (!fb) { $('#gate').textContent = 'The accounts aren’t available yet. Please contact the committee.'; return; }

  $('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    const email = String(fd.get('email')).trim(), password = String(fd.get('password'));
    if (!email || !password) { showMsg(form, 'Enter your email and password.'); return; }
    await busy($('button[type=submit]', form), () => signInWithPassword(fb, { page: 'admin', email, password, say: (t, k, d) => showMsg(form, t, k, d) }));
  });
  const sayAdmin = (text, kind, details) => showMsg($('#admin-login'), text, kind, details);
  $('#admin-google').addEventListener('click', (e) => { if (requireOnline()) signInWithGoogle(fb, { page: 'admin', button: e.currentTarget, say: sayAdmin }); });
  finishGoogleRedirect(fb, sayAdmin);
  $('#signout').addEventListener('click', () => signOutUser(fb));
  $('.nav-toggle').addEventListener('click', (e) => {
    const nav = $('#admin-nav');
    const open = nav.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  wireAgreement();

  fb.A.onAuthStateChanged(fb.auth, (user) => startSession(user).catch((err) => gate(esc(errorText(err)), true)));
  window.addEventListener('hashchange', () => uid && route());
}

function gate(html, withSignOut) {
  $('#gate').hidden = false;
  $('#gate').innerHTML = `${html}${withSignOut ? ' <button class="btn btn-small" type="button" id="gate-out">Sign out</button>' : ''}`;
  if (withSignOut) $('#gate-out').onclick = () => signOutUser(fb);
}

async function loadAgreement() {
  const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'settings', 'staffAgreement')).catch(() => null);
  return snap?.exists() ? snap.data() : null;
}

/** Decides what a signed-in person sees: committee, staff (after agreement), invitation to claim, or nothing. */
async function startSession(user) {
  const { F, db } = fb;
  uid = null; me = null;
  $$('.tab').forEach((t) => (t.hidden = true));
  $('#admin-nav').hidden = true;
  $('#agreement-screen').hidden = true;
  $('#no-units').hidden = true;
  if (!user) { $('#gate').hidden = true; $('#admin-login').hidden = false; return; }
  $('#admin-login').hidden = true;
  gate('Checking your access…');

  let snap = await F.getDoc(F.doc(db, 'admins', user.uid)).catch(() => null);
  if (!snap?.exists()) {
    const inv = user.email ? await F.getDoc(F.doc(db, 'staffInvites', user.email)).catch(() => null) : null;
    if (!inv?.exists()) {
      const req = await F.getDoc(F.doc(db, 'staffRequests', user.uid)).catch(() => null);
      const r = req?.exists() ? req.data() : null;
      if (r?.status === 'pending') gate(`Your request to work as ${esc(r.role)} is waiting for the committee’s approval. Please try again after you hear from them.`, true);
      else if (r?.status === 'rejected') gate(`Your request to work as ${esc(r.role)} wasn’t approved.${r.reason ? ` Reason: ${esc(r.reason)}.` : ''} Please contact the Society office.`, true);
      else gate(`${esc(user.email || 'This account')} isn’t a committee or staff account. Staff and officials can ask for access on the website’s Member page (Register → Society staff or an official). If the committee has invited you, sign in with the exact Gmail address they invited.`, true);
      return;
    }
    if (!user.emailVerified) {
      gate(`Confirm your email address first: <button class="btn btn-small" type="button" id="gate-verify">Send confirmation link to ${esc(user.email)}</button> <button class="btn btn-small" type="button" id="gate-recheck">I’ve confirmed it</button>`, true);
      $('#gate-verify').onclick = () => fb.A.sendEmailVerification(user).then(() => alert('Link sent. Open it, then click “I’ve confirmed it”.'));
      $('#gate-recheck').onclick = async () => { await user.reload(); await user.getIdToken(true); startSession(fb.auth.currentUser); };
      return;
    }
    const d = inv.data();
    await F.setDoc(F.doc(db, 'admins', user.uid), {
      kind: 'staff', role: d.role, perms: d.perms, name: d.name || user.displayName || '', email: user.email,
      mobile: d.mobile || '', active: true, createdAt: F.serverTimestamp(), invitedBy: d.invitedBy || ''
    });
    snap = await F.getDoc(F.doc(db, 'admins', user.uid));
  }

  me = { uid: user.uid, email: user.email, ...snap.data() };
  if (me.active === false) { gate('Your access has been suspended by the committee.', true); return; }
  if (accessEnded(me)) { gate(`Your access ended on ${esc(accessEnds(me).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}. Please contact the committee if you still need it.`, true); return; }

  agreement = await loadAgreement();
  if (me.kind === 'staff' && me.agreementRequired !== false) {
    if (!agreement) { gate('The committee hasn’t published the staff agreement yet. Please try again later.', true); return; }
    if (me.agreementVersion !== agreement.version) { showAgreement(); return; }
  }
  // 3.19: each committee member accepts the committee undertaking (current version) before working.
  if (isCommitteeRecord(me)) {
    undertaking = await loadUndertaking();
    if (me.undertakingVersion !== undertaking.version && sessionStorage.getItem('undertakingLater') !== `${user.uid}:${undertaking.version}`) { showUndertaking(); return; }
  }
  F.updateDoc(F.doc(db, 'admins', user.uid), { lastLoginAt: F.serverTimestamp() }).catch(() => {});

  uid = user.uid;
  $('#gate').hidden = true;
  $('#admin-nav').hidden = false;
  applyAccess();
  await refreshCore();
  // One-time switch to masked public dues (version 2.7): moves amounts to private/dues.
  if (isCommitteeRecord(me) && units.length && await publicDuesNeedMasking(fb).catch(() => false)) {
    await rebuildPublicDues(fb, dues.blocks).catch((err) => console.warn('Could not mask public dues', err));
  }
  wireOnce();
  route();
  if (isCommitteeRecord(me)) refreshCommitteeNotice().catch((err) => console.warn('committee notice', err));
}

/* ---------------- staff agreement ---------------- */

function agreementHTML(ag, rec, accepted) {
  const role = rec.role || '';
  const roleLines = ag.roles?.[role] || [];
  const permRows = PERMS.map(([k, label]) => `<tr><td>${esc(label)}</td><td>${can(rec, k) ? '<span class="pill-ok">Yes</span>' : '<span class="pill-no">No</span>'}</td></tr>`).join('');
  return `<h1>${esc(ag.title)}</h1>
    <p class="meta-line">Sunshree Suntec Co-operative Housing Society Ltd., Reg. No. PNA/PNA(4)/HSG/(TC)/12471/2012-13. Version ${ag.version}.</p>
    <p>${esc(ag.intro)}</p>
    <h2>Staff member</h2>
    <p><strong>${esc(rec.name || '')}</strong>, ${esc(role)}<br>${esc(rec.email || '')}${rec.mobile ? `, +91 ${esc(rec.mobile)}` : ''}</p>
    <h2>Access given</h2>
    <div class="table-scroll"><table><thead><tr><th>Access</th><th>Given</th></tr></thead><tbody>${permRows}
      ${COMMITTEE_ONLY.map((c) => `<tr><td>${esc(c)}</td><td><span class="pill-no">Committee only</span></td></tr>`).join('')}</tbody></table></div>
    ${roleLines.length ? `<h2>My responsibilities as ${esc(role)}</h2><ol>${roleLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}
    <h2>My commitments</h2>
    <ol>${(ag.common || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <p>${esc(ag.closing)}</p>
    ${accepted ? `<p class="meta-line"><strong>Accepted</strong> by ${esc(accepted.name)} (${esc(rec.email || '')}) on ${esc(accepted.when)}, version ${accepted.version}.</p>` : ''}`;
}

function showAgreement() {
  agreementMode = 'staff';
  $('#agreement-agree-text').textContent = 'I have read and understood this agreement, the access given to me and my responsibilities, and I accept them.';
  $('#gate').hidden = true;
  $('#agreement-doc').innerHTML = agreementHTML(agreement, me);
  const f = $('#agreement-form');
  f.reset();
  f.sign.value = '';
  setMsg(f, '');
  $('#agreement-screen').hidden = false;
}

function wireAgreement() {
  const f = $('#agreement-form');
  $('#agreement-decline').addEventListener('click', () => signOutUser(fb));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const signed = String(fd.get('sign')).trim().replace(/\s+/g, ' ');
    if (!fd.get('agree')) return setMsg(f, 'Tick the box to confirm you have read and accept the agreement.');
    if (signed.length < 3) return setMsg(f, 'Type your full name as your signature.');
    if (agreementMode === 'committee') return acceptUndertaking(f, signed);
    const { F, db } = fb;
    await busy($('button[type=submit]', f), async () => {
      try {
        await F.addDoc(F.collection(db, 'staffAgreements'), {
          uid: me.uid, email: me.email, name: me.name || '', signedName: signed, role: me.role || '', perms: me.perms || {},
          version: agreement.version, title: agreement.title, acceptedAt: F.serverTimestamp(),
          device: navigator.userAgent.slice(0, 180)
        });
        await F.updateDoc(F.doc(db, 'admins', me.uid), { agreementVersion: agreement.version, agreementAcceptedAt: F.serverTimestamp(), agreementName: signed });
        await startSession(fb.auth.currentUser);
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
}

function route() {
  let id = location.hash.slice(1);
  if (!TABS.includes(id)) id = 'dashboard';
  if (!canDo(TAB_NEED[id])) id = TABS.find((t) => canDo(TAB_NEED[t]) && t !== 'profile') || 'profile';
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());   // a window left open on another tab
  $$('.tab').forEach((t) => (t.hidden = t.dataset.tab !== id));
  $$('#admin-nav a').forEach((a) => (a.getAttribute('href') === '#' + id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#admin-nav').classList.remove('open');
  $('#no-units').hidden = units.length > 0 || ['settings', 'staff', 'profile', 'members', 'website', 'directory', 'expenses', 'library'].includes(id) || !canDo('view');
  if (id === 'settings' && !units.length) setTimeout(() => $('#import-box').scrollIntoView({ behavior: 'smooth' }), 50);
  const load = { dashboard: loadDashboard, bills: loadBills, payments: loadPayments, units: renderUnits, unitfile: loadUnitFile, reports: loadReports, documents: loadDocuments, letters: loadCorrespondence, library: loadLibraryAdmin, transfers: loadTransfers, lift: loadLift, members: loadMembers, expenses: loadExpenses, directory: loadDirectory, website: loadWebsite, settings: loadSettings, staff: loadStaff, profile: loadProfile }[id];
  load().catch((err) => { console.error(err); alert(errorText(err)); });
}

let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  wireBills();
  wirePayments();
  wireUnits();
  wireLift();
  wireStaff();
  wireUnitFile();
  wireDriveBackups();
  wireReports();
  wireDocuments();
  wireMembers();
  wireReminders();
  wireAccessApps();
  wirePrereg();
  wireTransfers();
  wireCommittee();
  wireLibraryAdmin();
  initExpenses({ fb, uid: () => uid, me: () => me, canDo, busy, setMsg, saveBlob, errorText, units: () => units, lastBilled: () => lastBilled(),
    reloadBilling: async () => { billing = await loadBilling(fb); return lastBilled(); } });
  initCorrespondence({ fb, uid: () => uid, me: () => me, canDo, busy, setMsg, saveBlob, errorText, units: () => units });
  wireWebsite();
  wireSettings();
}

/* ---------------- dashboard ---------------- */

async function loadDashboard() {
  const month = monthOf(todayIST());
  const { from, to } = monthBounds(month);
  const { F, db } = fb;
  const [billSnap, paySnap, recentSnap] = await Promise.all([
    F.getDocs(F.query(F.collection(db, 'bills'), F.where('month', '==', month))),
    F.getDocs(F.query(F.collection(db, 'payments'), F.where('date', '>=', from), F.where('date', '<=', to))),
    F.getDocs(F.query(F.collection(db, 'payments'), F.orderBy('createdAt', 'desc'), F.limit(8)))
  ]);
  const due = units.reduce((s, u) => s + Math.max(0, u.balance || 0), 0);
  const credit = units.reduce((s, u) => s + Math.max(0, -(u.balance || 0)), 0);
  const billed = billSnap.docs.reduce((s, d) => s + d.data().current, 0);
  const collected = paySnap.docs.filter((d) => d.data().status !== 'cancelled').reduce((s, d) => s + d.data().amount, 0);

  $('#dash-asof').textContent = `As on ${fmtDate(todayIST())}`;
  $('#dash-cards').innerHTML = `
    <div><dt>Total outstanding (₹)</dt><dd class="due">${fmt(due)}</dd></div>
    <div><dt>Advances / credits (₹)</dt><dd class="credit">${fmt(credit)}</dd></div>
    <div><dt>Billed in ${monthLabel(month)} (₹)</dt><dd>${fmt(billed)} <small class="muted">${billSnap.size} bills</small></dd></div>
    <div><dt>Collected in ${monthLabel(month)} (₹)</dt><dd class="credit">${fmt(collected)}</dd></div>`;

  $('#dash-top').innerHTML = [...units].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 8)
    .map((u) => `<tr><td class="unit">${esc(u.unit)}</td><td>${esc(u.name)}</td><td class="num">${amt(u.balance)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">No units yet.</td></tr>';
  $('#dash-recent').innerHTML = recentSnap.docs.map((d) => {
    const p = d.data();
    return `<tr><td>${ddmmyyyy(p.date)}</td><td><a href="print.html?receipt=${d.id}" target="_blank" rel="noopener">${esc(p.receiptNo)}</a>${p.status === 'cancelled' ? ' <span class="status-pill cancelled">Cancelled</span>' : ''}</td><td>${esc(p.unit)}</td><td class="num">${fmt(p.amount)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">No receipts yet.</td></tr>';

  const setup = $('#dash-setup');
  const noCost = units.filter((u) => u.active !== false && !u.constructionCost && !u.charges?.sinking).length;
  if (!units.length) {
    setup.hidden = false;
    setup.innerHTML = '<h2>Set up the accounts</h2><p>No units yet. Go to <a href="#settings">Settings</a> and import the opening balances.</p>';
  } else if (noRates()) {
    setup.hidden = false;
    setup.innerHTML = '<h2>Maintenance rates are ₹0</h2><p>Enter the rates fixed by the General Body in <a href="#settings">Settings</a> before the next bills are generated.</p>';
  } else if (noCost) {
    setup.hidden = false;
    setup.innerHTML = `<h2>Sinking and repairs funds not yet billed for ${noCost} units</h2><p>These funds are worked out from each unit’s construction cost certified by the architect. Enter it under <a href="#units">Units → Open</a> once the General Body has adopted the figures.</p>`;
  } else setup.hidden = true;
}

/* ---------------- bills ---------------- */

function wireBills() {
  wirePastInterest();
  const form = $('#gen-form');
  form.extraCode.innerHTML += ONE_OFF.map((c) => `<option value="${c}">${LABEL[c]}</option>`).join('');
  form.extraBlock.innerHTML += dues.blocks.map((b) => `<option value="${b.id}">${esc(b.name)} only</option>`).join('');
  const setDates = () => {
    const m = form.month.value;
    if (!m) return;
    form.billDate.value = `${m}-01`;
    form.dueDate.value = addDays(`${m}-01`, Number(billing.dueDays) || 15);
  };
  form.month.addEventListener('change', setDates);
  form.month.value = monthOf(todayIST());
  setDates();
  form.billDate.addEventListener('change', () => { form.dueDate.value = addDays(form.billDate.value, Number(billing.dueDays) || 15); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const monthKey = String(fd.get('month'));
    const extraCode = String(fd.get('extraCode'));
    const extraAmount = round(fd.get('extraAmount'));
    if (!monthKey) return setMsg(form, 'Choose a month.');
    if (extraCode && !extraAmount) return setMsg(form, 'Enter the extra amount, or set the extra charge to None.');
    if (extraCode) {
      try { prepareExtras([{ code: extraCode, amount: extraAmount, basis: String(fd.get('extraBasis')), block: String(fd.get('extraBlock')) }], units); }
      catch (err) { return setMsg(form, esc(err.message)); }
    }
    if (!units.length) return setMsg(form, 'Import the opening balances in Settings first.');
    const m = Number(monthKey.slice(5, 7));
    const warn = (noRates() ? '\n\nMaintenance rates in Settings are ₹0, so these bills will only carry the other charges.' : '')
      + (billing.liftBilling !== 'monthly' && m === Number(billing.liftBillMonth || 4) ? `\n\nThis month includes the yearly lift charge for units with a lift.` : '');
    if (!confirm(`Create ${monthLabel(monthKey)} bills for every unit that doesn’t have one yet?${warn}`)) return;

    setMsg(form, '');
    await busy($('button[type=submit]', form), async () => {
      try {
        billing = await loadBilling(fb);
        const res = await generateMonth(fb, {
          monthKey, billDate: String(fd.get('billDate')), dueDate: String(fd.get('dueDate')),
          extras: extraCode ? [{ code: extraCode, amount: extraAmount, basis: String(fd.get('extraBasis')), block: String(fd.get('extraBlock')) }] : [],
          settings: billing
        }, (i, n) => { $('#gen-progress').textContent = `${i} of ${n} units…`; });
        $('#gen-progress').textContent = '';
        setMsg(form, `${res.made.length} bills created, ${res.skipped.length} already existed.${res.failed.length ? ` <strong>${res.failed.length} failed:</strong> ${res.failed.map((f) => esc(f.unit + ' – ' + f.error)).join('; ')}` : ''}`, !res.failed.length);
        await refreshCore();
        $('#bills-month').value = monthKey;
        await listBills(monthKey);
        renderPiRuns().catch(() => {});
      } catch (err) { setMsg(form, esc(errorText(err))); }
    });
  });

  $('#bills-month').value = monthOf(todayIST());
  $('#bills-month').addEventListener('change', (e) => listBills(e.target.value).catch((err) => alert(errorText(err))));
}

async function loadBills() {
  await listBills($('#bills-month').value || monthOf(todayIST()));
  setupPastInterest().catch((err) => console.warn('past interest', err));
}

/* ---------------- Interest on past arrears (3.15) ---------------- */
let piResult = null;
const nextMonth = (m) => addMonths(m, 1);
const fyOfMonth = (m) => financialYear(`${m}-01`);

async function setupPastInterest() {
  const box = $('#pi-box');
  box.hidden = !canDo('committee');
  if (box.hidden) return;
  const periods = interestPeriodsOf(billing);
  const f = $('#pi-form');
  $('#pi-rates').innerHTML = periods.length
    ? `Rates: ${periods.map((p) => `<strong>${p.rate}%</strong> from ${dd(p.from)}${p.to ? ` to ${dd(p.to)}` : ' onwards'}`).join('; ')}. Change them in Settings → Penal interest rate periods.`
    : '<span class="cr-overdue">No penal interest rates are set. Add the rate periods in Settings first.</span>';
  $('#pi-sum').textContent = periods.length ? `· ${periods.map((p) => `${p.rate}% from ${dd(p.from)}`).join(', ')}` : '· no rates set';
  if (!f.from.value) {
    const first = periods.find((p) => p.rate > 0);
    f.from.value = first ? (first.from.endsWith('-01') ? first.from.slice(0, 7) : nextMonth(first.from.slice(0, 7))) : '';
    const lb = lastBilled();
    f.to.value = lb || addMonths(monthOf(todayIST()), -1);
    f.billMonth.value = lb ? nextMonth(lb) : monthOf(todayIST());
    f.block.innerHTML = '<option value="">All units</option>' + dues.blocks.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  }
  await renderPiRuns();
}

async function calcPastInterest(e) {
  e.preventDefault();
  const f = e.currentTarget, from = f.from.value, to = f.to.value, billMonth = f.billMonth.value, min = Number(f.min.value) || 0;
  if (!from || !to || !billMonth) return setMsg(f, 'Choose the months.');
  if (to < from) return setMsg(f, '“Up to” is before “from”.');
  if (billMonth <= to) return setMsg(f, 'Add it to the bills of a month after the last month counted.');
  if (!interestPeriodsOf(billing).length) return setMsg(f, 'Set the penal interest rate periods in Settings first.');
  setMsg(f, '');
  await busy($('button[type=submit]', f), async () => {
    try {
      $('#pi-progress').textContent = 'Reading the ledgers…';
      if (!auditCache.length) auditCache = await loadAuditYears(fb).catch(() => []);
      const scope = units.filter((u) => u.active !== false && (!f.block.value || u.block === f.block.value));
      const old = from < '2018-04' ? await allOldReceipts() : {};
      const pre = from < '2018-04' ? Object.fromEntries(scope.map((u) => [u.id, preLedger(u.id, auditCache, old[u.id] || [])])) : {};
      const [{ ledgers }, billSnap, adjSnap] = await Promise.all([
        loadMergedLedgers(fb, scope, pre),
        fb.F.getDocs(fb.F.collection(fb.db, 'bills')),
        fb.F.getDocs(fb.F.collection(fb.db, 'billAdjustments'))
      ]);
      // Interest each bill already charged (by bill id), and months already covered by an earlier calculation.
      const billInterest = {}, billedMonths = {};
      billSnap.docs.forEach((d) => {
        const b = d.data(), i = (b.lines || []).filter((l) => l.code === 'interest').reduce((t, l) => t + (Number(l.amount) || 0), 0);
        billInterest[d.id] = i;
        if (i > 0) (billedMonths[b.unitId] ??= new Set()).add(b.month);
      });
      const covered = {};
      adjSnap.docs.forEach((d) => {
        const a = d.data();
        if (a.status === 'cancelled') return;
        for (const m of a.months || []) (covered[a.unitId] ??= new Set()).add(m.month);
      });
      const rows = [], periods = interestPeriodsOf(billing);
      for (const u of scope) {
        const entries = (ledgers[u.id] || []).map((x) => ({ date: x.date, debit: x.debit, credit: x.credit, interest: x.kind === 'bill' && x.ref ? billInterest[x.ref] || 0 : 0 }));
        const skip = new Set([...(billedMonths[u.id] || []), ...(covered[u.id] || [])]);
        const r = pastInterest(entries, billing, { fromMonth: from, toMonth: to, skip });
        if (r.total >= Math.max(min, 1)) rows.push({ u, ...r, high: Math.max(...r.months.map((x) => x.base)) });
      }
      rows.sort((a, b) => b.total - a.total);
      const rates = [...new Set(periods.map((p) => p.rate))].filter((x) => x > 0).sort((a, b) => b - a);
      piResult = { from, to, billMonth, rows, rates, periods, skippedCovered: Object.keys(covered).length };
      $('#pi-progress').textContent = '';
      renderPi();
    } catch (err) { $('#pi-progress').textContent = ''; setMsg(f, esc(errorText(err))); }
  });
}

function piDetail(r, runNo = '') {
  const parts = piResult.periods.filter((p) => r.byRate[p.rate]).map((p) => `₹${fmt(r.byRate[p.rate])} at ${p.rate}% p.a.${p.to ? ` up to ${dd(p.to)}` : ` from ${dd(p.from)}`}`);
  return `Interest on arrears ${monthLabel(piResult.from)} to ${monthLabel(piResult.to)}${runNo ? ` (${runNo})` : ''}: ${parts.join(', ')}`;
}

function renderPi() {
  const { rows, rates } = piResult;
  const total = rows.reduce((t, r) => t + r.total, 0);
  $('#pi-result').hidden = false;
  $('#pi-note').hidden = piResult.from >= '2018-04';
  $('#pi-note').textContent = 'Months before April 2018 use balances rebuilt from the audited year-end figures and the past committee’s receipts (Tally starts in April 2018). Check a few units’ ledgers in the Unit file before charging, and how far back to go with the Society’s advocate.';
  $('#pi-h1').textContent = rates[0] != null ? `At ${rates[0]}% (₹)` : '';
  $('#pi-h2').textContent = rates[1] != null ? `At ${rates[1]}% (₹)` : '';
  $('#pi-cards').innerHTML = `<div><dt>Units with interest</dt><dd>${rows.length}</dd></div>
    ${rates.map((r) => `<div><dt>At ${r}% p.a.</dt><dd>₹ ${fmt(rows.reduce((t, x) => t + (x.byRate[r] || 0), 0))}</dd></div>`).join('')}
    <div><dt>Total interest</dt><dd>₹ ${fmt(total)}</dd></div>`;
  $('#pi-rows').innerHTML = rows.map((r, i) => `<tr><td>${esc(r.u.unit)}</td><td>${esc(r.u.name || '')}</td><td class="num">${r.months.length}</td><td class="num">${fmt(r.high)}</td>
      <td class="num">${rates[0] != null ? fmt(r.byRate[rates[0]] || 0) : ''}</td><td class="num">${rates[1] != null ? fmt(r.byRate[rates[1]] || 0) : ''}</td><td class="num"><strong>${fmt(r.total)}</strong></td>
      <td><button class="btn btn-small" type="button" data-pi-months="${i}" aria-expanded="false">Months</button></td></tr>`).join('')
    || '<tr><td colspan="8" class="empty">No unit had overdue dues in these months (or the interest is below the minimum).</td></tr>';
  $('#pi-add').hidden = !rows.length;
  $('#pi-add').textContent = `Add ₹ ${fmt(total)} to the ${monthLabel(piResult.billMonth)} bills`;
}

function piCsv(months) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const { rows, rates } = piResult;
  const lines = months
    ? [['Unit', 'Name', 'Month', 'Arrears at start of month (₹)', 'Rate', 'Interest (₹)'], ...rows.flatMap((r) => r.months.map((m) => [r.u.unit, r.u.name || '', monthLabel(m.month), m.base, m.text, m.amount.toFixed(2)]))]
    : [['Unit', 'Name', 'Months', 'Highest arrears (₹)', ...rates.map((x) => `At ${x}% (₹)`), 'Interest (₹)'], ...rows.map((r) => [r.u.unit, r.u.name || '', r.months.length, r.high, ...rates.map((x) => r.byRate[x] || 0), r.total])];
  return '\ufeff' + [`Interest on arrears ${monthLabel(piResult.from)} to ${monthLabel(piResult.to)}; rates: ${piResult.periods.map((p) => `${p.rate}% from ${dd(p.from)}${p.to ? ` to ${dd(p.to)}` : ''}`).join(', ')}`, '', ...lines.map((l) => (Array.isArray(l) ? l.map(q).join(',') : l))].join('\r\n');
}

async function addPastInterest(btn) {
  const { rows, from, to, billMonth } = piResult;
  if (billMonth <= (lastBilled() || '')) return alert(`Bills for ${monthLabel(billMonth)} are already made. Choose a later month.`);
  const total = rows.reduce((t, r) => t + r.total, 0);
  if (!confirm(`Add ₹ ${fmt(total)} interest on arrears to ${rows.length} units’ bills for ${monthLabel(billMonth)}?\n\nIt is charged when that month’s bills are made, and can be cancelled until then. Members see the calculation for their unit.`)) return;
  const { F, db } = fb;
  await busy(btn, async () => {
    try {
      const fy = fyOfMonth(billMonth), runRef = F.doc(F.collection(db, 'interestRuns'));
      const no = await F.runTransaction(db, async (tx) => {
        const cRef = F.doc(db, 'counters', `interest-${fy}`), c = await tx.get(cRef);
        const n = c.exists() ? Number(c.data().next) || 1 : 1;
        tx.set(cRef, { next: n + 1 });
        return `INT/${fy}/${String(n).padStart(3, '0')}`;
      });
      const batch = F.writeBatch(db);
      batch.set(runRef, { no, fromMonth: from, toMonth: to, billMonth, periods: piResult.periods, units: rows.length, total, status: 'pending',
        createdAt: F.serverTimestamp(), createdBy: uid, createdByName: me?.name || '' });
      for (const r of rows) {
        batch.set(F.doc(F.collection(db, 'billAdjustments')), {
          runId: runRef.id, runNo: no, unitId: r.u.id, unit: r.u.unit, month: billMonth, code: 'interest', amount: r.total, detail: piDetail(r, no),
          byRate: Object.fromEntries(Object.entries(r.byRate).map(([k, v]) => [String(k), v])), months: r.months, fromMonth: from, toMonth: to,
          status: 'pending', createdAt: F.serverTimestamp(), createdBy: uid
        });
      }
      await batch.commit();
      // A copy of the calculation in the Society's Drive, next to the reference documents.
      const copy = btoa(unescape(encodeURIComponent(`${no}\r\n${piCsv(true)}`)));
      loadDriveCfg(fb).then(() => driveReady() && driveCall(fb, 'upload', { kind: 'reference', topic: 'Interest on arrears',
        name: `${no.replace(/\//g, '-')} interest on arrears ${from} to ${to} (bills of ${billMonth}).csv`, mimeType: 'text/csv', data: copy }))
        .catch((err) => console.warn('interest copy', err));
      const m = $('#pi-runs-msg'); m.className = 'form-msg ok';
      m.textContent = `${no}: ₹ ${fmt(total)} for ${rows.length} units will be charged on the ${monthLabel(billMonth)} bills.`;
      $('#pi-result').hidden = true; piResult = null;
      await renderPiRuns();
    } catch (err) { alert(errorText(err)); }
  });
}

async function renderPiRuns() {
  const { F, db } = fb;
  const [runs, adj] = await Promise.all([F.getDocs(F.collection(db, 'interestRuns')).catch(() => ({ docs: [] })), F.getDocs(F.collection(db, 'billAdjustments')).catch(() => ({ docs: [] }))]);
  const byRun = {};
  adj.docs.forEach((d) => { const a = d.data(); (byRun[a.runId] ??= { pending: 0, billed: 0, cancelled: 0 })[a.status] = ((byRun[a.runId] ??= { pending: 0, billed: 0, cancelled: 0 })[a.status] || 0) + 1; });
  const list = runs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.no).localeCompare(String(a.no)));
  $('#pi-runs').innerHTML = list.map((r) => {
    const c = byRun[r.id] || {};
    const st = r.status === 'cancelled' ? 'Cancelled' : c.billed && !c.pending ? 'Billed' : c.billed ? `Billed ${c.billed}, waiting ${c.pending}` : `Waiting for the ${monthLabel(r.billMonth)} bills`;
    return `<tr><td>${esc(r.no)}</td><td>${monthLabel(r.fromMonth)} to ${monthLabel(r.toMonth)}</td><td>${monthLabel(r.billMonth)}</td><td class="num">${r.units}</td><td class="num">${fmt(r.total)}</td>
      <td>${esc(st)}</td><td>${r.status !== 'cancelled' && c.pending ? `<button class="btn btn-small" type="button" data-pi-cancel="${esc(r.id)}">Cancel what isn’t billed</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">None yet.</td></tr>';
}

async function cancelPiRun(id, btn) {
  if (!confirm('Cancel this calculation for the units whose bills haven’t been made yet?')) return;
  const { F, db } = fb;
  await busy(btn, async () => {
    try {
      const snap = await F.getDocs(F.query(F.collection(db, 'billAdjustments'), F.where('runId', '==', id)));
      const batch = F.writeBatch(db);
      let n = 0, billed = 0;
      snap.docs.forEach((d) => { if (d.data().status === 'pending') { batch.update(d.ref, { status: 'cancelled', cancelledAt: F.serverTimestamp(), cancelledBy: uid }); n++; } else if (d.data().status === 'billed') billed++; });
      if (!billed) batch.update(F.doc(db, 'interestRuns', id), { status: 'cancelled', cancelledAt: F.serverTimestamp(), cancelledBy: uid });
      await batch.commit();
      const m = $('#pi-runs-msg'); m.className = 'form-msg ok'; m.textContent = `${n} unit${n === 1 ? '' : 's'} cancelled.${billed ? ` ${billed} already billed stay as billed.` : ''}`;
      await renderPiRuns();
    } catch (err) { alert(errorText(err)); }
  });
}

function wirePastInterest() {
  $('#pi-form').addEventListener('submit', (e) => calcPastInterest(e));
  $('#pi-add').addEventListener('click', (e) => addPastInterest(e.currentTarget));
  $('#pi-csv').addEventListener('click', () => saveBlob(new Blob([piCsv(false)], { type: 'text/csv' }), `Interest on arrears ${piResult.from} to ${piResult.to}.csv`));
  $('#pi-csv-months').addEventListener('click', () => saveBlob(new Blob([piCsv(true)], { type: 'text/csv' }), `Interest on arrears ${piResult.from} to ${piResult.to} by month.csv`));
  $('#pi-runs').addEventListener('click', (e) => { const b = e.target.closest('[data-pi-cancel]'); if (b) cancelPiRun(b.dataset.piCancel, b); });
  $('#pi-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pi-months]');
    if (!b) return;
    const tr = b.closest('tr'), open = tr.nextElementSibling?.classList.contains('pi-months');
    if (open) { tr.nextElementSibling.remove(); b.setAttribute('aria-expanded', 'false'); return; }
    const r = piResult.rows[Number(b.dataset.piMonths)];
    tr.insertAdjacentHTML('afterend', `<tr class="pi-months"><td colspan="8"><table><thead><tr><th>Month</th><th class="num">Arrears at start (₹)</th><th>Rate</th><th class="num">Interest (₹)</th></tr></thead><tbody>
      ${r.months.map((m) => `<tr><td>${monthLabel(m.month)}</td><td class="num">${fmt(m.base)}</td><td>${esc(m.text)}</td><td class="num">${m.amount.toFixed(2)}</td></tr>`).join('')}</tbody></table></td></tr>`);
    b.setAttribute('aria-expanded', 'true');
  });
}

async function listBills(month) {
  const { F, db } = fb;
  const snap = await F.getDocs(F.query(F.collection(db, 'bills'), F.where('month', '==', month)));
  const order = new Map(units.map((u, i) => [u.id, i]));
  const bills = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (order.get(a.unitId) ?? 999) - (order.get(b.unitId) ?? 999));
  $('#bills-title').textContent = `${monthLabel(month)} bills`;
  $('#print-all').href = `print.html?month=${month}`;
  $('#print-all').hidden = !bills.length;
  $('#bills-rows').innerHTML = bills.map((b) => `<tr>
    <td>${esc(b.billNo)}</td><td class="unit">${esc(b.unit)}</td><td>${esc(b.name)}</td>
    <td class="num">${amt(b.arrears)}</td><td class="num">${fmt(b.current)}</td><td class="num">${amt(b.total)}</td>
    <td><a href="print.html?bill=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">View</a></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No bills for this month yet.</td></tr>';
  const sum = (k) => bills.reduce((s, b) => s + (b[k] || 0), 0);
  $('#bills-foot').innerHTML = bills.length ? `<tr><td colspan="3">${bills.length} bills</td><td class="num">${fmt(sum('arrears'))}</td><td class="num">${fmt(sum('current'))}</td><td class="num">${fmt(sum('total'))}</td><td></td></tr>` : '';
}

/* ---------------- payments ---------------- */

function wirePayments() {
  const form = $('#pay-form');
  $('#pay-mode').innerHTML = PAYMENT_MODES.map((m) => `<option>${m}</option>`).join('');
  form.date.value = todayIST();

  $('#pay-unit').addEventListener('change', async (e) => {
    const u = units.find((x) => x.id === e.target.value);
    $('#pay-bill').value = '';
    if (!u) { $('#pay-info').textContent = ''; return; }
    let last = '';
    if (u.lastBillId) {
      const b = await fb.F.getDoc(fb.F.doc(fb.db, 'bills', u.lastBillId));
      if (b.exists()) { $('#pay-bill').value = b.data().billNo; last = ` Last bill ${esc(b.data().billNo)}: ₹ ${fmt(b.data().total)}.`; }
    }
    $('#pay-info').innerHTML = `<strong>${esc(u.name || 'No name on record')}</strong>. Current balance ₹ ${amt(u.balance)}.${last}`;
    form.amount.placeholder = u.balance > 0 ? String(u.balance) : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    if (!data.unitId) return setMsg(form, 'Choose the unit.');
    if (!data.date) return setMsg(form, 'Enter the payment date.');
    if (!(round(data.amount) > 0)) return setMsg(form, 'Enter the amount received.');
    if (/NEFT|IMPS|UPI|Cheque|Draft/i.test(data.mode) && !data.reference.trim()) return setMsg(form, `Enter the ${data.mode === 'Cheque' ? 'cheque number' : 'UTR / transaction reference'} so the receipt can be matched with the bank statement.`);
    const u = units.find((x) => x.id === data.unitId);
    if (!confirm(`Save ₹ ${fmt(data.amount)} received from ${u.unit} ${u.name} on ${ddmmyyyy(data.date)} by ${data.mode}?`)) return;
    await busy($('button[type=submit]', form), async () => {
      try {
        const r = await recordPayment(fb, data);
        setMsg(form, `Receipt ${esc(r.receiptNo)} created. New balance for ${esc(r.unit)}: ₹ ${fmt(r.balanceAfter)}. <a href="print.html?receipt=${r.id}" target="_blank" rel="noopener">Open receipt</a>`, true);
        form.reset();
        form.date.value = todayIST();
        $('#pay-info').textContent = '';
        await refreshCore();
        $('#pay-unit').innerHTML = '<option value="">Choose unit</option>' + unitOptions(true);
        await listPayments($('#pay-month').value);
      } catch (err) { setMsg(form, esc(errorText(err))); }
    });
  });

  $('#pay-month').value = monthOf(todayIST());
  $('#pay-month').addEventListener('change', (e) => listPayments(e.target.value).catch((err) => alert(errorText(err))));

  $('#pay-rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    const reason = prompt('Why is this receipt being cancelled? (e.g. cheque bounced, wrong unit)');
    if (reason === null) return;
    await busy(btn, async () => {
      try {
        await cancelPayment(fb, btn.dataset.cancel, reason.trim());
        await refreshCore();
        await listPayments($('#pay-month').value);
      } catch (err) { alert(errorText(err)); }
    });
  });

  $('#pay-csv').addEventListener('click', () => {
    const rows = lastPayments.map((p) => [p.date, p.receiptNo, p.unit, p.name, p.mode, p.reference, p.bank, p.billNo, p.amount, p.status, p.balanceAfter]);
    const head = ['Date', 'Receipt No', 'Unit', 'Name', 'Mode', 'Reference', 'Bank', 'Bill No', 'Amount', 'Status', 'Balance After'];
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv' }), `receipts-${$('#pay-month').value}.csv`).catch((err) => alert(errorText(err)));
  });
}

let lastPayments = [];
async function loadPayments() {
  $('#pay-unit').innerHTML = '<option value="">Choose unit</option>' + unitOptions(true);
  if (payFor) { $('#pay-unit').value = payFor; $('#pay-unit').dispatchEvent(new Event('change')); payFor = null; }
  await listPayments($('#pay-month').value || monthOf(todayIST()));
}

async function listPayments(month) {
  const { from, to } = monthBounds(month);
  const { F, db } = fb;
  const snap = await F.getDocs(F.query(F.collection(db, 'payments'), F.where('date', '>=', from), F.where('date', '<=', to), F.orderBy('date')));
  lastPayments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  $('#pay-rows').innerHTML = lastPayments.map((p) => `<tr>
    <td>${ddmmyyyy(p.date)}</td>
    <td><a href="print.html?receipt=${p.id}" target="_blank" rel="noopener">${esc(p.receiptNo)}</a>${p.status === 'cancelled' ? ' <span class="status-pill cancelled">Cancelled</span>' : ''}</td>
    <td class="unit">${esc(p.unit)}</td><td>${esc(p.name)}</td>
    <td>${esc(p.mode)}${p.reference ? ' ' + esc(p.reference) : ''}</td>
    <td class="num">${fmt(p.amount)}</td>
    <td>${p.status === 'cancelled' || !canDo('cancelReceipts') ? '' : `<button class="btn btn-small btn-danger" type="button" data-cancel="${p.id}">Cancel</button>`}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No receipts this month.</td></tr>';
  const total = lastPayments.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + p.amount, 0);
  $('#pay-foot').innerHTML = lastPayments.length ? `<tr><td colspan="5">Total received in ${monthLabel(month)}</td><td class="num">${fmt(total)}</td><td></td></tr>` : '';
}

/* ---------------- units ---------------- */

let editing = null;
const UNIT_OVERRIDES = [
  ['maintenance', 'Maintenance / service (₹/month)'], ['water', 'Water (₹/month)'], ['liftYearly', 'Lift (₹/year)'],
  ['parking', 'Parking (₹/month)'], ['sinking', 'Sinking fund (₹/month)'], ['repairs', 'Repairs fund (₹/month)'],
  ['nonOccupancy', 'Non-occupancy (₹/month)'], ['education', 'Education fund (₹/month)'], ['federation', 'Federation fund (₹/month)'],
  ['liftMonthly', 'Lift, calculated method (₹/month)'], ['welfare', 'Welfare fund, voluntary (₹/month)']
];

function renderUnits() {
  const q = ($('#units-search').value || '').toLowerCase().replace(/\s/g, '');
  const rows = units.filter((u) => !q || (u.unit + u.name).toLowerCase().replace(/\s/g, '').includes(q));
  $('#units-rows').innerHTML = rows.map((u) => `<tr>
    <td class="unit">${esc(u.unit)}</td>
    <td>${esc(u.name)}${u.unverified ? '<span class="flag">To verify</span>' : ''}${u.active === false ? ' <span class="status-pill">Not billed</span>' : ''}</td>
    <td class="type">${esc(catName(u))}</td><td>${liftGroupFor(u) || '—'}</td><td>${esc(u.status || '')}</td>
    <td class="num">${amt(u.balance)}</td><td class="num">${u.bpm ? fmt(u.bpm) : '—'}</td>
    <td><div class="row-actions"><a class="btn btn-small btn-primary" href="#unitfile" data-file="${esc(u.id)}">Unit file</a><button class="btn btn-small" type="button" data-edit="${esc(u.id)}">Edit</button></div></td></tr>`).join('')
    || `<tr><td colspan="8" class="empty">${units.length ? 'No unit matches.' : 'No units yet. Import the opening balances in Settings.'}</td></tr>`;
  return Promise.resolve();
}

let index2 = null;
async function loadIndex2() {
  if (index2) return index2;
  try { index2 = await (await fetch('data/index2.json', { cache: 'no-cache' })).json(); }
  catch { index2 = { units: [] }; }
  return index2;
}
let planAreas = null;
async function loadPlan() {
  if (planAreas) return planAreas;
  try { planAreas = await (await fetch('data/plan-areas.json', { cache: 'no-cache' })).json(); }
  catch { planAreas = { units: [] }; }
  return planAreas;
}
const SOURCES = ['PMC approved plan', 'Agreement', 'Measured', 'Other'];
const BASIS_TEXT = { carpet: 'carpet', 'built-up': 'built-up, not carpet', saleable: 'saleable, not carpet', unstated: 'type not stated' };

function index2Text(u, e, pl) {
  const plan = pl ? `<br>Plan: ${fmt2(pl.area)} sq ft (${esc(pl.dims)})${e?.basis === 'carpet' && Math.abs(e.area - pl.area) / pl.area > 0.05 ? ' <span class="area-warn">differs from Index II by more than 5%</span>' : ''}` : '';
  return index2Only(u, e) + plan;
}
function index2Only(u, e) {
  if (!e) return '<span class="muted">No Index II</span>';
  const parts = [`${fmt2(e.area)} sq ft ${BASIS_TEXT[e.basis] || e.basis}`];
  if (e.loft) parts.push(`loft ${fmt2(e.loft)}`);
  if (e.terrace) parts.push(`terrace ${fmt2(e.terrace)}`);
  let t = `${parts.join(', ')} (p. ${e.page})`;
  if (e.owner && u.name && !sameName(e.owner, u.name)) t += `<br><span class="area-warn">Index II owner: ${esc(e.owner)}</span>`;
  if (e.note) t += `<br>${esc(e.note)}`;
  return e.basis === 'carpet' ? t : `<span class="area-warn">${t}</span>`;
}
const fmt2 = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
function sameName(a, b) {
  const words = (x) => new Set(String(x).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['mrs', 'smt', 'shri'].includes(w)));
  const A = words(a), B = words(b);
  return [...A].some((w) => B.has(w));
}

async function renderMeasurements() {
  const [i2, pa] = await Promise.all([loadIndex2(), loadPlan()]);
  const byId = Object.fromEntries(i2.units.map((e) => [e.id, e]));
  const planById = Object.fromEntries(pa.units.map((e) => [e.id, e]));
  const count = (b) => i2.units.filter((e) => e.basis === b).length;
  const missing = units.filter((u) => !byId[u.id]).length;
  $('#index2-summary').textContent = `${i2.units.length} documents read: ${count('carpet')} with carpet area, ${count('built-up')} built-up, ${count('saleable')} saleable, ${count('unstated')} area type not stated. ${missing} units have no Index II yet.`;
  $('#measure-rows').innerHTML = units.map((u) => {
    const id = esc(u.id), g = liftGroupFor(u), e = byId[u.id];
    const n = (name, v, label, step = '1') => `<td class="num" data-label="${label}"><input type="number" min="0" step="${step}" inputmode="decimal" name="m_${id}_${name}" value="${v ?? ''}" aria-label="${esc(u.unit)} ${label}"></td>`;
    const src = u.areaSource || '';
    const opts = ['', ...(e ? [`Index II p. ${e.page}`] : []), ...SOURCES];
    const pl = planById[u.id];
    if (src && !opts.includes(src)) opts.push(src);
    const hint = (e || pl) ? index2Text(u, e, pl) : '<span class="muted">No Index II or plan figure. Use the member’s agreement.</span>';
    return `<tr class="m-row" data-id="${id}" data-find="${esc((u.unit + ' ' + u.name).toLowerCase())}">
      <td class="who"><strong>${esc(u.unit)}</strong><span>${esc(u.name)}</span></td>
      ${n('area', u.carpetArea, 'Carpet area (sq ft)', '0.01')}
      <td data-label="Where the area comes from"><select class="src" name="m_${id}_src" aria-label="${esc(u.unit)} area source">${opts.map((o) => `<option value="${esc(o)}" ${o === src ? 'selected' : ''}>${o ? esc(o) : 'Not set'}</option>`).join('')}</select></td>
      <td data-label="Water usage"><select name="m_${id}_inlets" aria-label="${esc(u.unit)} water usage"><option value="0">No</option><option value="1" ${Number(u.inlets) > 0 ? 'selected' : ''}>Yes</option></select></td>
      <td data-label="Lift"><select name="m_${id}_lift" aria-label="${esc(u.unit)} lift"><option value="">None</option><option value="C" ${g === 'C' ? 'selected' : ''}>C wing</option><option value="D" ${g === 'D' ? 'selected' : ''}>D wing</option></select></td></tr>
    <tr class="m-note" data-for="${id}"><td colspan="5">${hint}</td></tr>`;
  }).join('');
  filterMeasurements();
}

/** Search and "missing only" filter for the measurement grid (keeps each unit's note row with it). */
function filterMeasurements() {
  const q = ($('#measure-search').value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const missingOnly = $('#measure-missing').checked;
  const f = $('#measure-form');
  let shown = 0;
  for (const row of $$('#measure-rows tr.m-row')) {
    const id = row.dataset.id;
    const area = f.elements[`m_${id}_area`]?.value;
    const ok = (!q || row.dataset.find.includes(q) || row.dataset.find.replace(/\s/g, '').includes(q.replace(/\s/g, ''))) && (!missingOnly || !area);
    row.hidden = !ok;
    const note = row.nextElementSibling;
    if (note?.classList.contains('m-note')) note.hidden = !ok;
    if (ok) shown++;
  }
  const withArea = $$('#measure-rows tr.m-row').filter((r) => f.elements[`m_${r.dataset.id}_area`]?.value).length;
  $('#measure-count').textContent = `${shown} shown. ${withArea} of ${units.length} units have a carpet area.`;
}

function fillFromPlan() {
  const overwrite = $('#index2-overwrite').checked;
  const f = $('#measure-form');
  let filled = 0, kept = 0;
  for (const p of planAreas?.units || []) {
    const input = f.elements[`m_${p.id}_area`];
    if (!input) continue;
    if (input.value && !overwrite) { kept++; continue; }
    input.value = p.area;
    f.elements[`m_${p.id}_src`].value = 'PMC approved plan';
    input.closest('tr').classList.add('filled');
    filled++;
  }
  setMsg(f, `Filled ${filled} shop / store carpet areas from the approved plan${kept ? `; kept ${kept} already entered` : ''}. Check them, then click Save all units.`, true);
}

function fillFromIndex2() {
  const overwrite = $('#index2-overwrite').checked;
  const f = $('#measure-form');
  let filled = 0, kept = 0;
  for (const e of index2?.units || []) {
    if (e.basis !== 'carpet') continue;
    const input = f.elements[`m_${e.id}_area`];
    if (!input) continue;
    if (input.value && !overwrite) { kept++; continue; }
    input.value = e.area;
    f.elements[`m_${e.id}_src`].value = `Index II p. ${e.page}`;
    input.closest('tr').classList.add('filled');
    filled++;
  }
  setMsg(f, `Filled ${filled} carpet areas from Index II${kept ? `; kept ${kept} already entered` : ''}. Check them, then click Save all units.`, true);
}

function wireUnits() {
  const form = $('#unit-form');
  form.type.innerHTML = PREMISES_TYPES.map((t) => `<option>${t}</option>`).join('');
  form.status.innerHTML += STATUSES.map((s) => `<option>${s}</option>`).join('');
  $('#unit-charges').innerHTML = UNIT_OVERRIDES.map(([c, label]) => `<label>${label}<input type="number" min="0" step="1" name="ch_${c}" inputmode="numeric"></label>`).join('');
  $('#units-search').addEventListener('input', renderUnits);
  $('#measure-toggle').addEventListener('click', () => {
    const f = $('#measure-form');
    f.hidden = !f.hidden;
    if (!f.hidden) renderMeasurements().catch((err) => alert(errorText(err)));
  });
  $('#index2-fill').addEventListener('click', () => { fillFromIndex2(); filterMeasurements(); });
  $('#measure-search').addEventListener('input', filterMeasurements);
  $('#measure-missing').addEventListener('change', filterMeasurements);
  $('#plan-fill').addEventListener('click', () => { fillFromPlan(); filterMeasurements(); });
  const af = $('#addunit-form');
  af.block.innerHTML = dues.blocks.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  af.type.innerHTML = PREMISES_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
  af.block.addEventListener('change', () => { if (['GF', 'B'].includes(af.block.value)) af.type.value = af.block.value === 'GF' ? 'Ground-Floor Shop' : 'Basement Shop'; });
  af.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(af);
    const unit = String(fd.get('unit')).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!/^[A-Z]{1,2}[ -]?\d{1,3}( ?[A-Z])?$/.test(unit)) return setMsg(af, 'Enter the unit number as printed, e.g. GF 21 or C 504.');
    const id = unit.replace(/^([A-Z]+)[ -]?/, '$1-').replace(/ /g, '');
    await busy($('button[type=submit]', af), async () => {
      try {
        const made = await addUnit(fb, { id, unit, block: String(fd.get('block')), type: String(fd.get('type')), name: String(fd.get('name')).trim() }, dues.blocks);
        af.reset();
        await refreshCore();
        renderUnits();
        setMsg(af, `Unit ${esc(made)} added. Open it to set its category and lift, and add its opening balance as a correction.`, true);
      } catch (err) { setMsg(af, esc(errorText(err))); }
    });
  });
  $('#measure-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, fd = new FormData(f);
    const num = (k) => (fd.get(k) === '' || fd.get(k) == null ? null : Number(fd.get(k)));
    const rows = units.map((u) => ({
      id: u.id, carpetArea: num(`m_${u.id}_area`), areaSource: String(fd.get(`m_${u.id}_src`) ?? ''), inlets: Number(fd.get(`m_${u.id}_inlets`)) > 0 ? 1 : 0,
      liftGroup: String(fd.get(`m_${u.id}_lift`) ?? '')
    }));
    await busy($('button[type=submit]', f), async () => {
      try {
        await saveUnitMeasurements(fb, rows);
        await refreshCore();
        renderUnits();
        setMsg(f, `Saved ${rows.length} units.`, true);
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#units-rows').addEventListener('click', (e) => {
    const f = e.target.closest('[data-file]');
    if (f) { fileUnit = f.dataset.file; sessionStorage.setItem('fileUnit', fileUnit); return; }
    const b = e.target.closest('[data-edit]');
    if (b) openUnit(b.dataset.edit).catch((err) => alert(errorText(err)));
  });
  $('[data-close]', form).addEventListener('click', () => $('#unit-dialog').close());
  $('#unit-remove').addEventListener('click', async (e) => {
    const u = units.find((x) => x.id === editing);
    if (!u || !confirm(`Remove unit ${u.unit} from the accounts? It has no entries, so nothing else is affected.`)) return;
    await busy(e.currentTarget, async () => {
      try {
        await fb.F.deleteDoc(fb.F.doc(fb.db, 'units', editing));
        await rebuildPublicDues(fb, dues.blocks);
        await refreshCore();
        renderUnits();
        $('#unit-dialog').close();
      } catch (err) { alert(errorText(err)); }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const charges = {};
    for (const [c] of UNIT_OVERRIDES) { const v = fd.get('ch_' + c); if (v !== '') charges[c] = round(v); }
    await busy($('button[type=submit]', form), async () => {
      try {
        const full = {
          name: String(fd.get('name')).trim(), type: fd.get('type'), status: fd.get('status'),
          category: fd.get('category'), liftGroup: String(fd.get('liftGroup')),
          constructionCost: fd.get('constructionCost') === '' ? null : round(fd.get('constructionCost')),
          carpetArea: fd.get('carpetArea') === '' ? null : Number(fd.get('carpetArea')),
          inlets: Number(fd.get('inlets')) > 0 ? 1 : 0, twoWheelers: round(fd.get('twoWheelers')), fourWheelers: round(fd.get('fourWheelers')),
          bpm: fd.get('bpm') === '' ? null : round(fd.get('bpm')), charges, active: Boolean(fd.get('active'))
        };
        // Staff who may edit units change only descriptive details; rates and amounts stay with the committee.
        const STAFF_UNIT_FIELDS = ['name', 'type', 'status', 'carpetArea', 'inlets', 'twoWheelers', 'fourWheelers', 'liftGroup'];
        const patch = canDo('committee') ? full : Object.fromEntries(STAFF_UNIT_FIELDS.map((k) => [k, full[k]]));
        await updateUnitDetails(fb, editing, patch);
        await rebuildPublicDues(fb, dues.blocks);
        await refreshCore();
        renderUnits();
        setMsg(form, 'Saved. The website shows the new details.', true);
      } catch (err) { setMsg(form, esc(errorText(err))); }
    });
  });

  const adj = $('#adj-form');
  adj.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(adj);
    const debit = round(fd.get('debit')), credit = round(fd.get('credit'));
    if (!fd.get('date')) return setMsg(adj, 'Choose a date.');
    if (!String(fd.get('particulars')).trim()) return setMsg(adj, 'Describe the correction.');
    if (!debit && !credit && !fd.get('clearUnverified')) return setMsg(adj, 'Enter a debit or credit amount.');
    await busy($('button[type=submit]', adj), async () => {
      try {
        await addAdjustment(fb, editing, { date: fd.get('date'), particulars: String(fd.get('particulars')).trim(), debit, credit, clearUnverified: Boolean(fd.get('clearUnverified')) });
        adj.reset();
        await refreshCore();
        renderUnits();
        await openUnit(editing);
        setMsg(adj, 'Correction added.', true);
      } catch (err) { setMsg(adj, esc(errorText(err))); }
    });
  });
}

async function openUnit(id) {
  editing = id;
  const u = units.find((x) => x.id === id);
  const form = $('#unit-form');
  $('#unit-title').textContent = `${u.unit}, ${blockName(u.block)}`;
  form.name.value = u.name || '';
  form.type.value = u.type;
  form.status.value = u.status || '';
  form.category.innerHTML = (billing.categories || []).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  form.category.value = categoryIdFor(u);
  form.liftGroup.value = liftGroupFor(u);
  form.constructionCost.value = u.constructionCost ?? '';
  form.carpetArea.value = u.carpetArea ?? '';
  form.inlets.value = Number(u.inlets) > 0 ? '1' : '0';
  form.twoWheelers.value = u.twoWheelers ?? '';
  form.fourWheelers.value = u.fourWheelers ?? '';
  form.bpm.value = u.bpm ?? '';
  form.active.checked = u.active !== false;
  for (const [c] of UNIT_OVERRIDES) form['ch_' + c].value = u.charges?.[c] ?? '';
  // Committee-only fields are read-only for staff.
  const committee = canDo('committee');
  for (const el of [form.category, form.constructionCost, form.bpm, form.active, ...$$('#unit-charges input')]) el.disabled = !committee;
  for (const el of $$('input, select', form)) if (!canDo('editUnits')) el.disabled = true;
  setMsg(form, '');
  setMsg($('#adj-form'), '');
  $('#adj-form').date.value = todayIST();

  const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'units', id, 'ledger'));
  const entries = snap.docs.map((d) => d.data()).sort((a, b) => a.date.localeCompare(b.date) || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  let bal = 0;
  $('#unit-ledger').innerHTML = entries.map((e) => {
    bal += (e.debit || 0) - (e.credit || 0);
    return `<tr><td>${ddmmyyyy(e.date)}</td><td>${esc(e.particulars)}</td><td>${esc(e.receipt || '')}</td>
      <td class="num">${e.debit ? fmt(e.debit) : ''}</td><td class="num">${e.credit ? fmt(e.credit) : ''}</td><td class="num">${amt(bal)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No entries.</td></tr>';
  // A unit added by mistake can be removed only while it has no bills, payments or entries.
  $('#unit-remove').hidden = !(canDo('committee') && entries.length === 0);
  if (!$('#unit-dialog').open) $('#unit-dialog').showModal();
}

/* ---------------- lift expenses ---------------- */

let liftList = [];
const lastBilled = () => billing.lastBilledMonth || billing.lastRun?.month || '';
const liftName = (l) => (l === 'CD' ? 'C & D wing lifts' : LIFT_GROUPS[l] || l);

function liftPreview() {
  const f = $('#lift-form');
  const lifts = f.lift.value === 'CD' ? ['C', 'D'] : [f.lift.value];
  const n = unitsServedBy(units, lifts).length;
  const amount = round(f.amount.value);
  const inst = Math.max(1, round(f.instalments.value) || 1);
  if (!n) { $('#lift-preview').textContent = 'No units are set as served by this lift yet (Units → Open → Served by lift).'; return; }
  if (!amount) { $('#lift-preview').textContent = `Shared equally by ${n} units.`; return; }
  const share = Math.round(amount / n);
  $('#lift-preview').innerHTML = `Shared equally by <strong>${n} units</strong>: ₹ ${fmt(share)} each${inst > 1 ? `, ₹ ${fmt(Math.floor(share / inst))} a month for ${inst} months` : ''}, starting with the ${monthLabel(f.startMonth.value || monthOf(todayIST()))} bill.`;
}

async function loadLift() {
  const counts = Object.keys(LIFT_GROUPS).map((g) => `${LIFT_GROUPS[g]}: ${unitsServedBy(units, [g]).length} units`).join('; ');
  $('#lift-served').innerHTML = `${counts}. Change which lift serves a unit under <a href="#units">Units → Open</a>.`;
  const f = $('#lift-form');
  const next = lastBilled() ? addMonths(lastBilled(), 1) : monthOf(todayIST());
  const firstOpen = next > monthOf(todayIST()) ? next : monthOf(todayIST()); // earliest month not yet billed
  if (!f.startMonth.value || f.startMonth.value <= lastBilled()) f.startMonth.value = firstOpen;
  f.startMonth.min = next;
  liftPreview();
  liftList = await loadLiftExpenses(fb);
  const lb = lastBilled();
  $('#lift-rows').innerHTML = liftList.map((e) => {
    const end = liftExpenseEndMonth(e);
    const billed = e.startMonth > lb ? `From ${monthLabel(e.startMonth)}` : end <= lb ? 'Fully billed' : `Billing till ${monthLabel(end)}`;
    return `<tr>
      <td>${ddmmyyyy(e.date)}${e.expenseId ? `<br><button class="link-btn" type="button" data-open-exp="${esc(e.expenseId)}" title="Open the expense with its bill">${esc(e.voucherNo || 'Voucher')}</button>` : ''}</td><td>${esc(liftName(e.lift))}</td><td>${esc(e.kind)}</td>
      <td>${esc(e.description)}${e.vendor ? `<br><span class="muted">${esc(e.vendor)}${e.invoiceNo ? ', inv. ' + esc(e.invoiceNo) : ''}</span>` : ''}</td>
      <td class="num">${fmt(e.amount)}</td><td class="num">${e.unitIds.length}</td><td class="num">${fmt(Math.round(e.amount / e.unitIds.length))}</td>
      <td>${billed}${e.instalments > 1 ? ` <span class="muted">(${e.instalments} instalments)</span>` : ''}</td>
      <td>${e.startMonth > lb && canDo('liftExpenses') ? `<button class="btn btn-small btn-danger" type="button" data-del-lift="${e.id}">Delete</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="9" class="empty">No lift expenses recorded yet.</td></tr>';
  const fy = (iso) => (Number(iso.slice(5, 7)) >= 4 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1);
  const thisFy = fy(todayIST());
  const byLift = {};
  liftList.filter((e) => fy(e.date) === thisFy).forEach((e) => { byLift[e.lift] = (byLift[e.lift] || 0) + e.amount; });
  $('#lift-foot').innerHTML = liftList.length ? `<tr><td colspan="9">This financial year: ${Object.entries(byLift).map(([l, a]) => `${esc(liftName(l))} ₹ ${fmt(a)}`).join(', ') || 'none'}</td></tr>` : '';
}

function wireLift() {
  const f = $('#lift-form');
  f.kind.innerHTML = LIFT_KINDS.map((k) => `<option>${k}</option>`).join('');
  f.date.value = todayIST();
  ['input', 'change'].forEach((ev) => f.addEventListener(ev, liftPreview));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    if (!data.date) return setMsg(f, 'Enter the date of the expense.');
    if (!data.description.trim()) return setMsg(f, 'Describe the expense, e.g. the work done or the AMC period.');
    if (!(round(data.amount) > 0)) return setMsg(f, 'Enter the amount.');
    if (!data.startMonth) return setMsg(f, 'Choose the bill month to start recovering from.');
    const lifts = data.lift === 'CD' ? ['C', 'D'] : [data.lift];
    const n = unitsServedBy(units, lifts).length;
    if (!confirm(`Share ₹ ${fmt(data.amount)} (${data.kind}, ${liftName(data.lift)}) equally among ${n} units from the ${monthLabel(data.startMonth)} bill?`)) return;
    await busy($('button[type=submit]', f), async () => {
      try {
        billing = await loadBilling(fb);
        const r = await addLiftExpense(fb, data, units, lastBilled());
        setMsg(f, `Saved. ${r.units} units will see their share on the ${monthLabel(data.startMonth)} bill.`, true);
        f.reset();
        f.date.value = todayIST();
        f.instalments.value = 1;
        await loadLift();
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#lift-rows').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-open-exp]');
    if (o) { openExpenseById(o.dataset.openExp); return; }
    const b = e.target.closest('[data-del-lift]');
    if (!b || !confirm('Delete this lift expense? It hasn’t been billed yet.')) return;
    await busy(b, async () => {
      try {
        billing = await loadBilling(fb);
        await deleteLiftExpense(fb, liftList.find((x) => x.id === b.dataset.delLift), lastBilled());
        await loadLift();
      } catch (err) { alert(errorText(err)); }
    });
  });
}

/* ---------------- members ---------------- */

let memberDocs = [];        // every users record loaded for this tab
let signinLog = [];         // latest sign-in attempts
let knownEmails = new Set(), knownUids = new Set(), knownMobiles = new Set();
const tsDate = (ts) => (ts?.toDate ? ts.toDate() : null);
const whenShort = (ts) => (tsDate(ts) ? fmtDate(tsDate(ts), { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const whenLong = (ts) => (tsDate(ts) ? tsDate(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const memberUnitLabel = (id) => { const u = units.find((x) => x.id === id) || dues.units.find((x) => x.id === id); return u ? u.unit : (id || ''); };
const csvText = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
const saveCsv = (rows, name) => saveBlob(new Blob(['﻿' + csvText(rows)], { type: 'text/csv' }), name).catch((err) => alert(errorText(err)));

async function loadMembers() {
  const { F, db } = fb;
  // An approver without the members permission (usually the Accountant) sees only the applications.
  const onlyApps = !can(me, 'members');
  $('.tab[data-tab="members"]').classList.toggle('only-apps', onlyApps);
  ensureAuditHistory().catch((err) => console.warn('audited history for members', err));
  await loadAccessApps();
  if (onlyApps) return;
  const all = await F.getDocs(F.collection(db, 'users'));
  memberDocs = all.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Everyone who has a record somewhere (for "Tried but never registered"): members, staff requests, staff and committee.
  const [sr, ad] = await Promise.all([F.getDocs(F.collection(db, 'staffRequests')).catch(() => ({ docs: [] })), F.getDocs(F.collection(db, 'admins')).catch(() => ({ docs: [] }))]);
  knownEmails = new Set([...memberDocs, ...sr.docs.map((d) => d.data()), ...ad.docs.map((d) => d.data())].map((x) => String(x.email || '').trim().toLowerCase()).filter(Boolean));
  knownUids = new Set([...memberDocs.map((m) => m.id), ...sr.docs.map((d) => d.id), ...ad.docs.map((d) => d.id)]);
  knownMobiles = new Set([...memberDocs, ...sr.docs.map((d) => d.data()), ...ad.docs.map((d) => d.data())].map((x) => tenDigits(x.mobile)).filter(Boolean));
  rmLog = await loadReminderLog();
  await loadInvites().catch((err) => console.warn('pre-registered', err));
  const pend = memberDocs.filter((m) => m.status === 'pending').sort((a, b) => (tsDate(a.createdAt) || 0) - (tsDate(b.createdAt) || 0));
  const appr = memberDocs.filter((m) => m.status === 'approved').sort((a, b) => memberUnitLabel(a.unit).localeCompare(memberUnitLabel(b.unit), 'en', { numeric: true }));
  const rej = memberDocs.filter((m) => m.status === 'rejected').sort((a, b) => (tsDate(b.decidedAt) || 0) - (tsDate(a.decidedAt) || 0));
  const approvedByUnit = {};
  appr.forEach((p) => (approvedByUnit[p.unit] ??= []).push(`${p.name} (${relationLabel(p.relation)})`));
  const contact = (p) => `<td>${p.mobile ? `<a href="tel:+91${esc(p.mobile)}">+91 ${esc(p.mobile)}</a>` : ''}</td><td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>`;
  const gpill = (p) => `${p.relation ? ` <span class="rel-pill">${esc(relationLabel(p.relation))}</span>` : ''}${p.provider === 'google' ? ' <span class="status-pill">Google</span>' : ''}${p.invited ? ' <span class="status-pill">Pre-registered</span>' : ''}`;

  $('#pending-rows').innerHTML = pend.map((p) => {
    const dup = approvedByUnit[p.unit];
    return `<tr><td class="unit">${esc(memberUnitLabel(p.unit))}${dup ? `<span class="dup-warning">Already approved for this unit: ${esc(dup.join(', '))}</span>` : ''}</td>
      <td>${esc(p.name)}${gpill(p)}${invitedTag(p)}</td>${contact(p)}<td>${whenShort(p.createdAt)}</td>
      <td><div class="row-actions"><button class="btn btn-small btn-primary" type="button" data-act="approve" data-uid="${esc(p.id)}">Approve</button>
      <button class="btn btn-small btn-danger" type="button" data-act="reject" data-uid="${esc(p.id)}">Reject</button>
      <button class="btn btn-small" type="button" data-act="edit" data-uid="${esc(p.id)}">Edit</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No requests waiting.</td></tr>';

  const agV = await loadMemberAgreementBox(appr).catch((err) => { console.warn('member agreement', err); return 0; });
  // The accepted agreements, to show whether each member's copy was saved and emailed (3.15.3).
  const agSnap = agV ? await F.getDocs(F.collection(db, 'memberAgreements')).catch(() => ({ docs: [] })) : { docs: [] };
  memberAgreementRecs = new Map(agSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  checkAgreementMail(appr, agV).catch((err) => console.warn('agreement mail check', err));
  $('#approved-rows').innerHTML = appr.map((p) => `<tr><td class="unit">${esc(memberUnitLabel(p.unit))}</td><td>${esc(p.name)}${gpill(p)}</td>
      <td class="access-note">${(p.access || 'full') === 'full' ? 'Unit account' : 'No unit account'}${viewExtras(p)}</td>${contact(p)}
      <td>${agreementCell(p, agV, memberAgreementRecs.get(p.agreementId))}</td>
      <td><div class="row-actions"><button class="btn btn-small" type="button" data-act="edit" data-uid="${esc(p.id)}">Edit</button>
      <button class="btn btn-small btn-danger" type="button" data-act="remove" data-uid="${esc(p.id)}">Remove access</button></div></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No approved members yet.</td></tr>';

  $('#rejected-rows').innerHTML = rej.map((p) => `<tr><td class="unit">${esc(memberUnitLabel(p.unit))}</td><td>${esc(p.name)}${gpill(p)}</td>${contact(p)}
      <td>${whenShort(p.createdAt)}</td>
      <td>${p.removed ? 'Access removed' : 'Rejected'}${p.decidedAt ? `<br><span class="muted">${whenShort(p.decidedAt)}${p.decidedByEmail ? ` · ${esc(p.decidedByEmail)}` : ''}</span>` : ''}</td>
      <td>${esc(p.reason || '')}</td>
      <td><div class="row-actions"><button class="btn btn-small" type="button" data-act="edit" data-uid="${esc(p.id)}">Open</button>
      <button class="btn btn-small" type="button" data-act="restore" data-uid="${esc(p.id)}" title="Move back to Requests waiting">Back to waiting</button>
      <button class="btn btn-small btn-primary" type="button" data-act="approve" data-uid="${esc(p.id)}">Approve</button></div></td></tr>`).join('')
    || '<tr><td colspan="8" class="empty">Nothing rejected or removed.</td></tr>';

  await loadSigninLog();
  rmAppr = appr; rmAgV = agV;
  await renderReminders().catch((err) => console.warn('reminders', err));
}

/* ----- reminders and invitations (3.16) ----- */
let rmLog = [], rmAppr = [], rmAgV = 0, rmKind = 'agreement', rmTpl = null, rmSaved = {}, rmContacts = null, rmRows = [], rmScriptVer = null;
async function loadReminderLog() {
  if (!canDo('members')) return [];
  const { F, db } = fb;
  const snap = await F.getDocs(F.query(F.collection(db, 'memberReminders'), F.orderBy('at', 'desc'), F.limit(2000))).catch(() => ({ docs: [] }));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
const rmKeyOf = (kind, p) => kind === 'invite' ? `inv:${p.unit}:${String(p.email || tenDigits(p.mobile)).toLowerCase()}` : `uid:${p.id}`;
function invitedTag(p) {
  const email = String(p.email || '').toLowerCase(), mob = tenDigits(p.mobile);
  const hit = rmLog.find((r) => r.kind === 'invite' && ((email && String(r.email || '').toLowerCase() === email) || (mob && r.mobile === mob)));
  return hit ? ` <span class="status-pill">Invited ${whenShort(hit.at)}</span>` : '';
}
/** The last visit: the member's own record (3.16 onwards) or their latest successful sign-in in the sign-in history. */
function lastVisit(p) {
  const seen = tsDate(p.lastSeenAt), email = String(p.email || '').toLowerCase();
  const si = signinLog.find((e) => e.result === 'ok' && String(e.email || '').toLowerCase() === email);
  const s2 = si ? tsDate(si.at) : null;
  return seen && s2 ? (seen > s2 ? seen : s2) : seen || s2;
}
async function loadUnitContacts() {
  const { F, db } = fb;
  const list = units.length ? units : dues.units;
  const out = [];
  await Promise.all(list.map(async (u) => {
    const [m, t] = await Promise.all([F.getDocs(F.collection(db, 'units', u.id, 'members')).catch(() => ({ docs: [] })),
      F.getDocs(F.collection(db, 'units', u.id, 'tenants')).catch(() => ({ docs: [] }))]);
    m.docs.map((d) => d.data()).filter((x) => !x.cessationDate).forEach((x) => out.push({ unit: u.id, unitLabel: u.unit, name: x.name || '', email: String(x.email || '').trim(), mobile: tenDigits(x.mobile), as: x.role || 'Member' }));
    t.docs.map((d) => d.data()).filter((x) => !x.to).forEach((x) => out.push({ unit: u.id, unitLabel: u.unit, name: x.name || '', email: String(x.email || '').trim(), mobile: tenDigits(x.mobile), as: 'Tenant' }));
  }));
  return out.filter((c) => c.name && (validEmail(c.email) || c.mobile));
}
function rmTemplate(kind = rmKind) { return rmSaved[kind] || REMINDER_KINDS[kind]; }
function rmCandidates(kind) {
  const days = Number($('#rm-days').value) || 60, now = Date.now();
  if (kind === 'agreement') {
    return rmAgV ? rmAppr.filter((p) => Number(p.agreementVersion) !== rmAgV).map((p) => ({ ...p, unitLabel: memberUnitLabel(p.unit),
      status: p.agreementVersion ? `Accepted version ${p.agreementVersion} only` : 'Not accepted', seen: lastVisit(p) })) : [];
  }
  if (kind === 'visit') {
    return rmAppr.map((p) => ({ ...p, unitLabel: memberUnitLabel(p.unit), seen: lastVisit(p) }))
      .filter((p) => !p.seen || now - p.seen.getTime() >= days * 864e5).map((p) => ({ ...p, status: p.seen ? `Last visit ${fmtDate(p.seen, { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No visit recorded' }));
  }
  // Not registered: contacts in the unit files with no member record (any status) for that email or mobile.
  const emails = new Set(memberDocs.map((m) => String(m.email || '').toLowerCase()).filter(Boolean));
  const mobiles = new Set(memberDocs.map((m) => tenDigits(m.mobile)).filter(Boolean));
  const approvedUnits = new Set(rmAppr.map((p) => p.unit));
  const skip = $('#rm-skip-registered').checked;
  const seen = new Set();
  return (rmContacts || []).filter((c) => !(c.email && emails.has(c.email.toLowerCase())) && !(c.mobile && mobiles.has(c.mobile)) && !(skip && approvedUnits.has(c.unit)))
    .filter((c) => { const k = rmKeyOf('invite', c); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c) => ({ ...c, status: `${c.as} in the unit file${approvedUnits.has(c.unit) ? '; someone else is approved for this unit' : ''}` }));
}
function rmLastFor(kind, p) {
  const key = rmKeyOf(kind, p);
  return rmLog.filter((r) => r.kind === kind && r.key === key);
}
const RM_CHANNEL = { whatsapp: 'WhatsApp', email: 'Email', 'society-email': 'Email from the Society' };
async function renderReminders() {
  const box = $('#rm-box');
  box.hidden = !canDo('members');
  if (box.hidden) return;
  if (!rmTpl) {
    const s = await fb.F.getDoc(fb.F.doc(fb.db, 'settings', 'memberReminders')).catch(() => null);
    rmSaved = s?.exists() ? s.data() : {};
    rmTpl = true; fillRmTemplate();
  }
  if (rmKind === 'invite' && !rmContacts) {
    $('#rm-rows').innerHTML = '<tr><td colspan="7" class="empty">Reading the unit files…</td></tr>';
    rmContacts = await loadUnitContacts();
  }
  if (rmScriptVer === null) { await loadDriveCfg(fb); rmScriptVer = driveReady() ? await driveScriptVersion() : -1; }
  $$('.rm-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.rm === rmKind)));
  $('#rm-days-wrap').hidden = rmKind !== 'visit';
  $('#rm-skip-wrap').hidden = rmKind !== 'invite';
  const gap = Number($('#rm-gap').value) || 0, now = Date.now();
  const counts = {};
  ['agreement', 'visit'].concat(rmContacts ? ['invite'] : []).forEach((k) => (counts[k] = rmCandidates(k).length));
  $$('[data-rm-count]').forEach((c) => (c.textContent = counts[c.dataset.rmCount] != null ? `(${counts[c.dataset.rmCount]})` : ''));
  const all = rmCandidates(rmKind);
  rmRows = all.filter((p) => { const last = rmLastFor(rmKind, p)[0]; return !gap || !last || !tsDate(last.at) || now - tsDate(last.at).getTime() >= gap * 864e5; })
    .sort((a, b) => String(a.unitLabel).localeCompare(String(b.unitLabel), 'en', { numeric: true }));
  const hidden = all.length - rmRows.length;
  $('#rm-note').textContent = [
    rmKind === 'agreement' && !rmAgV ? 'No agreement is published, so there is nothing to remind about.' : '',
    rmKind === 'visit' ? 'Visits are recorded from version 3.16; before that only sign-ins in the sign-in history are known.' : '',
    rmKind === 'invite' ? 'Taken from the Members and Tenants records in each unit file (current ones with a mobile or email). To invite someone not listed, add their mobile or email in their unit file.' : '',
    hidden ? `${hidden} reminded within the last ${gap} days ${hidden === 1 ? 'is' : 'are'} not shown.` : ''].filter(Boolean).join(' ');
  const tpl = rmTemplate(), sender = { name: me?.name, role: me?.role };
  $('#rm-prereg-all').hidden = rmKind !== 'invite' || !canDo('members') || !rmRows.some((p) => validEmail(p.email) && !invitesByEmail.get(p.email.toLowerCase()));
  $('#rm-rows').innerHTML = rmRows.map((p, i) => {
    // 3.22: someone already pre-registered gets the "your access is ready" message instead of "please register".
    const inv = rmKind === 'invite' && p.email ? invitesByEmail.get(String(p.email).toLowerCase()) : null;
    const msg = fillReminder(inv?.status === 'open' ? PREREG_MESSAGE : tpl, p, sender), wa = waNumber(p.mobile), em = validEmail(p.email);
    const log = rmLastFor(rmKind, p), last = log[0];
    return `<tr><td><input type="checkbox" data-rm-pick="${i}" ${em ? '' : 'disabled title="No email address"'} aria-label="Select ${esc(p.name)}"></td>
      <td class="unit">${esc(p.unitLabel)}</td><td>${esc(p.name)}${p.relation ? `<span class="sub">${esc(relationLabel(p.relation))}</span>` : ''}</td>
      <td class="rm-contact">${p.mobile ? `+91 ${esc(tenDigits(p.mobile) || p.mobile)}` : '<span class="muted">no mobile</span>'}<span class="sub">${em ? esc(p.email) : 'no email'}</span></td>
      <td data-l="Status">${esc(p.status)}${inv?.status === 'open' ? `<span class="sub">Pre-registered ${whenShort(inv.createdAt)}: waiting for their first sign-in</span>` : ''}</td>
      <td data-l="Last reminded">${last ? `${esc(RM_CHANNEL[last.channel] || last.channel)}<span class="sub">${whenShort(last.at)}${last.byName ? `, ${esc(last.byName)}` : ''}${log.length > 1 ? ` · ${log.length} times` : ''}</span>` : '<span class="muted">Never</span>'}</td>
      <td><div class="rm-send-cell">${wa ? `<a class="btn btn-small" href="${esc(waLink(p.mobile, msg))}" target="_blank" rel="noopener" data-rm-go="whatsapp" data-i="${i}">WhatsApp</a>` : ''}
        ${em ? `<a class="btn btn-small" href="${esc(mailLink(p.email, msg))}" data-rm-go="email" data-i="${i}">Email</a>` : ''}
        ${rmKind === 'invite' && em && !inv && canDo('members') ? `<button class="btn btn-small btn-primary" type="button" data-rm-prereg="${i}">Pre-register</button>` : ''}</div></td></tr>`;
  }).join('') || `<tr><td colspan="7" class="empty">${rmKind === 'invite' ? 'Nobody to invite: everyone with a mobile or email in the unit files has registered.' : rmKind === 'visit' ? 'Every approved member has visited in this period.' : 'Nobody waiting: every approved member has accepted the current agreement.'}</td></tr>`;
  $('#rm-all').checked = false;
  const ok = rmScriptVer >= REMINDER_SCRIPT_NEEDED;
  $('#rm-send').disabled = !ok || !rmRows.some((p) => validEmail(p.email));
  $('#rm-send-note').textContent = rmScriptVer === -1 ? 'The Society’s Google Drive isn’t connected.'
    : rmScriptVer === 0 ? 'Couldn’t check the Google Drive script just now.'
    : !ok ? `Needs the Google Drive script version ${REMINDER_SCRIPT_NEEDED} (now ${rmScriptVer}). Until then use the WhatsApp and Email buttons.` : 'Up to 25 at a time; Google allows about 100 emails a day from the Society’s account.';
}
function fillRmTemplate() {
  const f = $('#rm-tpl'), t = rmTemplate();
  f.subject.value = t.subject; f.body.value = t.body;
  $$('input, textarea', f).forEach((x) => (x.readOnly = !canDo('committee')));
  setMsg(f, '');
}
async function logReminder(p, channel, kind = rmKind) {
  const { F, db } = fb;
  const rec = { kind, key: kind === 'unfinished' ? `try:${p.key}` : rmKeyOf(kind, p), unit: p.unit || '', name: p.name || '', email: String(p.email || '').toLowerCase(), mobile: tenDigits(p.mobile),
    uid: kind === 'invite' || kind === 'unfinished' ? '' : p.id, channel, by: uid, byName: me?.name || '', at: F.serverTimestamp() };
  try {
    const ref = await F.addDoc(F.collection(db, 'memberReminders'), rec);
    rmLog.unshift({ ...rec, id: ref.id, at: { toDate: () => new Date() } });
  } catch (err) { console.warn('memberReminders', err); }
}
function wireReminders() {
  $('#rm-box').addEventListener('click', async (e) => {
    const tab = e.target.closest('.rm-tab');
    if (tab) { rmKind = tab.dataset.rm; fillRmTemplate(); await renderReminders(); return; }
    const pr = e.target.closest('[data-rm-prereg]');
    if (pr) {
      const p = rmRows[Number(pr.dataset.rmPrereg)];
      const msg = $('#rm-msg');
      try { await savePrereg(contactToPrereg(p)); msg.className = 'form-msg ok'; msg.textContent = `${p.name} (${p.unitLabel}) pre-registered with ${p.email}. Send the invitation with WhatsApp or Email.`; }
      catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
      await loadInvites(); await renderReminders();
      return;
    }
    const go = e.target.closest('[data-rm-go]');
    if (go) {
      const p = rmRows[Number(go.dataset.i)];
      if (p) logReminder(p, go.dataset.rmGo).then(() => setTimeout(() => renderReminders(), 400));
    }
  });
  // Follow-ups to people who tried but didn't register (3.17). A phone call is not recorded.
  $('#stray-rows').addEventListener('click', (e) => {
    const go = e.target.closest('[data-try-go]');
    if (!go || go.dataset.tryGo === 'call') return;
    const x = strayRows[Number(go.dataset.i)];
    if (x) logReminder(x, go.dataset.tryGo, 'unfinished').then(() => setTimeout(() => renderStrays(), 400));
  });
  ['#rm-days', '#rm-gap', '#rm-skip-registered'].forEach((id) => $(id).addEventListener('change', () => renderReminders()));
  $('#rm-all').addEventListener('change', (e) => $$('[data-rm-pick]:not(:disabled)').forEach((c) => (c.checked = e.target.checked)));
  // Editing the wording changes the links straight away (not saved until the committee saves it).
  $('#rm-tpl').addEventListener('input', () => { if (canDo('committee')) { const f = $('#rm-tpl'); rmSaved = { ...rmSaved, [rmKind]: { subject: f.subject.value, body: f.body.value } }; renderReminders(); } });
  $('#rm-tpl').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!canDo('committee')) return;
    if (f.subject.value.trim().length < 5 || f.body.value.trim().length < 20) return setMsg(f, 'Write a subject and a message.');
    try {
      await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'memberReminders'), { [rmKind]: { subject: f.subject.value.trim(), body: f.body.value.trim() }, updatedAt: fb.F.serverTimestamp(), updatedBy: uid }, { merge: true });
      setMsg(f, 'Saved. Everyone sending reminders now uses this wording.', true);
    } catch (err) { setMsg(f, esc(errorText(err))); }
  });
  $('#rm-tpl-reset').addEventListener('click', () => { const { [rmKind]: _, ...rest } = rmSaved; rmSaved = rest; fillRmTemplate(); renderReminders(); });
  $('#rm-copy').addEventListener('click', async () => {
    const m = fillReminder(rmTemplate(), { name: 'Members', unit: 'your unit', unitLabel: 'your unit' }, { name: me?.name, role: me?.role });
    const text = `${m.subject.replace(' for your unit', '')}\n\n${m.body}`;
    try { await navigator.clipboard.writeText(text); setMsg($('#rm-tpl'), 'Copied. Paste it in the Society’s WhatsApp group.', true); }
    catch { setMsg($('#rm-tpl'), 'Couldn’t copy on this device; select the message and copy it.'); }
  });
  $('#rm-send').addEventListener('click', async (e) => {
    const picked = $$('[data-rm-pick]:checked').map((c) => rmRows[Number(c.dataset.rmPick)]).filter((p) => p && validEmail(p.email));
    const msg = $('#rm-msg');
    if (!picked.length) { msg.className = 'form-msg'; msg.textContent = 'Tick the people to email first (only those with an email address).'; return; }
    if (picked.length > 25) { msg.className = 'form-msg'; msg.textContent = 'Up to 25 at a time, please.'; return; }
    if (!confirm(`Email ${picked.length} ${picked.length === 1 ? 'person' : 'people'} from the Society’s account? Each gets their own email.`)) return;
    const tpl = rmTemplate(), sender = { name: me?.name, role: me?.role };
    await busy(e.currentTarget, async () => {
      try {
        const r = await driveCall(fb, 'memberMail', { items: picked.map((p) => ({ to: p.email.trim(), ...fillReminder(tpl, p, sender) })) });
        const sent = new Set(r.sent.map((x) => x.toLowerCase()));
        for (const p of picked) if (sent.has(p.email.trim().toLowerCase())) await logReminder(p, 'society-email');
        msg.className = r.failed.length ? 'form-msg' : 'form-msg ok';
        msg.textContent = `Emailed ${r.sent.length} from ${r.from}.${r.failed.length ? ` Not sent: ${r.failed.map((x) => `${x.to} (${x.error})`).join('; ')}.` : ''} Emails left today: ${r.left}.`;
        await renderReminders();
      } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    });
  });
}

/** Saves a change to a member record and writes it to the member history (memberLog). */
async function decideMember(m, patch, action, { reason = '', note = '', changes = '' } = {}) {
  const { F, db } = fb, me = fb.auth.currentUser;
  const decided = action === 'edited' ? {} : { decidedAt: F.serverTimestamp(), decidedBy: uid, decidedByEmail: me?.email || '' };
  // One batch: the decision and its history entry are saved together or not at all.
  const batch = F.writeBatch(db);
  batch.update(F.doc(db, 'users', m.id), { ...patch, ...decided });
  batch.set(F.doc(F.collection(db, 'memberLog')), {
    uid: m.id, action, by: uid, byEmail: me?.email || '', at: F.serverTimestamp(),
    name: patch.name ?? m.name ?? '', unit: patch.unit ?? m.unit ?? '', reason, note, changes
  });
  await batch.commit();
}

const ACTION_TEXT = { approved: 'Approved', rejected: 'Rejected', removed: 'Access removed', restored: 'Moved back to waiting', edited: 'Details edited', notified: 'Member told' };

/* ----- telling the member (email or WhatsApp from the committee's own phone or computer) ----- */

const SITE_LINK = /^https?:$/.test(location.protocol) && !/androidplatform/.test(location.host) ? `${location.origin}/#member` : 'https://sunshreesuntec.com/#member';
function notifyText(m, action) {
  const unit = memberUnitLabel(m.unit), first = (m.name || '').split(' ')[0] || 'Member';
  const sign = `\n\nRegards,\n${me?.name || 'Managing Committee'}\nSunshree Suntec Co-op. Housing Society Ltd.`;
  const why = m.reason ? `\nReason: ${m.reason}` : '';
  if (action === 'approved') {
    return { subject: `Sunshree Suntec: your access for ${unit} is approved`,
      body: `Dear ${first},\n\nYour request for ${unit} on the Society website has been approved. Sign in at ${SITE_LINK} with ${m.email} to see ${
        (m.access || defaultAccess(m.relation)) === 'full' ? 'your unit’s bills, receipts and balance, and' : ''} the Society’s notices. To see the Society’s audited accounts and documents, apply under “Society accounts” on the same page.${sign}` };
  }
  if (action === 'removed') {
    return { subject: `Sunshree Suntec: access for ${unit} removed`,
      body: `Dear ${first},\n\nYour access to ${unit} on the Society website has been removed.${why}\n\nIf you think this is a mistake, please contact the Society office.${sign}` };
  }
  return { subject: `Sunshree Suntec: your request for ${unit}`,
    body: `Dear ${first},\n\nYour request for access to ${unit} on the Society website was not approved.${why}\n\nIf you think this is a mistake, please contact the Society office with proof of ownership or tenancy.${sign}` };
}
function showNotify(m, action) {
  const box = $('#member-notice');
  if (!['approved', 'rejected', 'removed'].includes(action)) { box.hidden = true; return; }
  const t = notifyText(m, action);
  const mail = `mailto:${encodeURIComponent(m.email || '')}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
  const wa = m.mobile ? `https://wa.me/91${m.mobile}?text=${encodeURIComponent(`${t.subject}\n\n${t.body}`)}` : '';
  box.innerHTML = `<p><strong>${esc(ACTION_TEXT[action])}: ${esc(m.name)} (${esc(memberUnitLabel(m.unit))}).</strong> Let them know${m.reason && action !== 'approved' ? ', with the reason' : ''}:</p>
    <div class="form-actions"><a class="btn btn-small btn-primary" href="${esc(mail)}" data-notify="email" data-uid="${esc(m.id)}">Send email</a>
    ${wa ? `<a class="btn btn-small" href="${esc(wa)}" target="_blank" rel="noopener" data-notify="whatsapp" data-uid="${esc(m.id)}">Send WhatsApp</a>` : ''}
    <button class="btn btn-small" type="button" id="notice-close">Close</button></div>`;
  box.dataset.action = action;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function logNotified(m, channel, action) {
  const { F, db } = fb;
  try {
    await F.addDoc(F.collection(db, 'memberLog'), { uid: m.id, action: 'notified', by: uid, byEmail: fb.auth.currentUser?.email || '', at: F.serverTimestamp(),
      name: m.name || '', unit: m.unit || '', reason: '', note: '', changes: `${channel === 'email' ? 'email' : 'WhatsApp'} opened to tell them: ${ACTION_TEXT[action] || action}` });
  } catch (err) { console.warn('memberLog notified', err); }
}

/* ----- deleting a test or mistaken record (committee only) ----- */
async function deleteMemberForever(m) {
  const { F, db } = fb;
  const logs = await F.getDocs(F.query(F.collection(db, 'memberLog'), F.where('uid', '==', m.id)));
  const batch = F.writeBatch(db);
  logs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(F.doc(db, 'users', m.id));
  await batch.commit();
}
let dialogMember = null;

async function openMemberDialog(m, mode) {
  dialogMember = m;
  const form = $('#member-form');
  form.reset();
  setMsg(form, '');
  const unitList = units.length ? units : dues.units;
  $('#md-unit').innerHTML = `${unitList.some((u) => u.id === m.unit) ? '' : `<option value="${esc(m.unit || '')}">${esc(m.unit || 'Choose unit')}</option>`}${
    unitList.map((u) => `<option value="${esc(u.id)}">${esc(u.unit)}${u.name ? ' – ' + esc(u.name) : ''}</option>`).join('')}`;
  form.name.value = m.name || ''; form.unit.value = m.unit || ''; form.mobile.value = m.mobile || ''; form.email.value = m.email || '';
  form.reason.value = m.reason || '';
  form.relation.value = m.relation || 'owner';
  form.access.value = m.access || defaultAccess(m.relation);
  form.seeAllDues.checked = m.seeAllDues === true;
  form.societyAccounts.checked = m.societyAccounts === true;
  form.accountsUntil.value = tsDate(m.accountsUntil) ? isoIST(tsDate(m.accountsUntil)) : '';
  $$('#md-view input').forEach((x) => (x.disabled = !isApprover()));
  $('#md-view-note').textContent = isApprover() ? '' : '(given by the Chairman, Secretary, Treasurer or Accountant)';
  $('#member-delete').hidden = !(canDo('committee') && m.status === 'rejected' && mode === 'edit');
  form.status.value = mode === 'reject' || mode === 'remove' ? 'rejected' : (m.status || 'pending');
  form.dataset.mode = mode;
  $('#member-dialog-title').textContent = mode === 'reject' ? `Reject request: ${m.name}` : mode === 'remove' ? `Remove access: ${m.name}` : m.name || 'Member request';
  $('#member-dialog-sub').textContent = [`Requested ${whenLong(m.createdAt) || '—'}`, m.provider === 'google' ? 'signs in with Google' : 'signs in with email and password',
    m.decidedAt ? `last decision ${whenLong(m.decidedAt)}${m.decidedByEmail ? ` by ${m.decidedByEmail}` : ''}` : ''].filter(Boolean).join(' · ');
  $('#member-save').textContent = mode === 'reject' ? 'Reject' : mode === 'remove' ? 'Remove access' : 'Save';
  $('#member-save').classList.toggle('btn-danger', mode === 'reject' || mode === 'remove');
  $('#member-history').innerHTML = '<li class="muted">Loading…</li>';
  $('#member-dialog').showModal();
  if (mode === 'reject' || mode === 'remove') form.reason.focus();
  try {
    const snap = await fb.F.getDocs(fb.F.query(fb.F.collection(fb.db, 'memberLog'), fb.F.where('uid', '==', m.id)));
    const items = snap.docs.map((d) => d.data()).sort((a, b) => (tsDate(b.at) || 0) - (tsDate(a.at) || 0));
    const first = `<li>Request sent<br><span class="muted">${whenLong(m.createdAt) || '—'} · ${esc(memberUnitLabel(m.unit))}</span></li>`;
    $('#member-history').innerHTML = items.map((h) => `<li><strong>${esc(ACTION_TEXT[h.action] || h.action)}</strong>${h.changes ? `: ${esc(h.changes)}` : ''}
      ${h.reason ? `<br>Reason: ${esc(h.reason)}` : ''}${h.note ? `<br>Note: ${esc(h.note)}` : ''}
      <br><span class="muted">${whenLong(h.at)}${h.byEmail ? ` · ${esc(h.byEmail)}` : ''}</span></li>`).join('') + first;
  } catch (err) { $('#member-history').innerHTML = `<li class="muted">${esc(errorText(err))}</li>`; }
}

async function saveMemberDialog() {
  const form = $('#member-form'), m = dialogMember;
  if (!m) return;
  const name = form.name.value.trim().replace(/\s+/g, ' ');
  const mobile = form.mobile.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const unit = form.unit.value, status = form.status.value, relation = form.relation.value, access = form.access.value;
  const reason = form.reason.value.trim(), note = form.note.value.trim();
  if (name.length < 3) return setMsg(form, 'Enter the full name.');
  if (!unit) return setMsg(form, 'Choose the unit.');
  if (mobile && !/^[6-9]\d{9}$/.test(mobile)) return setMsg(form, 'Enter a 10-digit Indian mobile number.');
  const patch = { name, unit, mobile, reason, relation, access };
  const changes = [];
  if (name !== (m.name || '')) changes.push(`name ${m.name || '—'} → ${name}`);
  if (unit !== (m.unit || '')) changes.push(`unit ${memberUnitLabel(m.unit) || '—'} → ${memberUnitLabel(unit)}`);
  if (mobile !== (m.mobile || '')) changes.push(`mobile ${m.mobile || '—'} → ${mobile || '—'}`);
  if (relation !== (m.relation || 'owner')) changes.push(`relation ${relationLabel(m.relation)} → ${relationLabel(relation)}`);
  if (access !== (m.access || defaultAccess(m.relation))) changes.push(`can see: ${access === 'full' ? 'unit account and documents' : 'documents only'}`);
  if (reason !== (m.reason || '') && status === m.status) changes.push('reason updated');
  // 3.18: other units' amounts and the Society's accounts (approvers only; the rules enforce it too).
  if (isApprover()) {
    const seeAll = form.seeAllDues.checked, acc = form.societyAccounts.checked, untilStr = acc ? form.accountsUntil.value : '';
    const oldUntil = tsDate(m.accountsUntil) ? isoIST(tsDate(m.accountsUntil)) : '';
    if (seeAll !== (m.seeAllDues === true) || acc !== (m.societyAccounts === true) || untilStr !== oldUntil) {
      Object.assign(patch, { seeAllDues: seeAll, societyAccounts: acc, accountsUntil: untilStr ? fb.F.Timestamp.fromDate(new Date(`${untilStr}T23:59:59+05:30`)) : null,
        accessBy: uid, accessByName: me?.name || '', accessAt: fb.F.serverTimestamp() });
      changes.push(`sees other units’ amounts: ${seeAll ? 'yes' : 'no'}; Society accounts: ${acc ? `yes${untilStr ? ` until ${ddmmyyyy(untilStr)}` : ''}` : 'no'}`);
    }
  }
  let action = 'edited';
  if (status !== m.status) {
    patch.status = status;
    if (status === 'approved') { action = 'approved'; patch.removed = false; }
    else if (status === 'pending') { action = 'restored'; patch.removed = false; }
    else { action = m.status === 'approved' ? 'removed' : 'rejected'; patch.removed = m.status === 'approved'; }
  } else if (!changes.length && !note) { $('#member-dialog').close(); return; }
  await busy($('#member-save'), async () => {
    try {
      await decideMember(m, patch, action, { reason, note, changes: changes.join('; ') });
      $('#member-dialog').close();
      await loadMembers();
      const fresh = memberDocs.find((x) => x.id === m.id);
      showNotify(fresh || { ...m, ...patch }, action);
    } catch (err) { setMsg(form, esc(errorText(err))); }
  });
}

/* ----- 3.23: membership transfer sets (units/{id}/transfers/{caseId}) ----- */
let trCases = [], trChecklists = null, trLib = [], trCurrent = null;
async function loadTransferChecklists() {
  const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'settings', 'transferChecklists')).catch(() => null);
  return snap?.exists() && snap.data().death ? snap.data() : structuredClone(DEFAULT_CHECKLISTS);
}
async function loadTransfers() {
  const { F, db } = fb;
  const list = (units.length ? units : dues.units);
  const [lists, lib, per] = await Promise.all([loadTransferChecklists(),
    F.getDocs(F.collection(db, 'libraryDocs')).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.removed)).catch(() => []),
    Promise.all(list.map((u) => F.getDocs(F.collection(db, 'units', u.id, 'transfers')).then((s) => s.docs.map((d) => ({ id: d.id, unit: u.id, ...d.data() }))).catch(() => [])))]);
  trChecklists = lists; trLib = lib; trCases = per.flat();
  const canEdit = canDo('unitRecords');
  $('#tr-new').hidden = !canEdit;
  $$('#trc-save, #trc-reset, #trc-forms').forEach((b) => (b.hidden = !canDo('committee')));
  renderTransfers();
  renderChecklistEditor();
}
function renderTransfers() {
  const q = $('#tr-q').value.trim().toLowerCase(), show = $('#tr-show').value;
  const list = (units.length ? units : dues.units).slice().sort((a, b) => String(a.unit).localeCompare(String(b.unit), 'en', { numeric: true }));
  const byUnit = new Map();
  for (const c of trCases) (byUnit.get(c.unit) || byUnit.set(c.unit, []).get(c.unit)).push(c);
  const rows = [];
  for (const u of list) {
    const cases = (byUnit.get(u.id) || []).filter((c) => c.status !== 'cancelled').sort((a, b) => String(b.startedOn || '').localeCompare(String(a.startedOn || '')));
    const match = (c) => !q || [u.unit, u.name, c?.from, c?.to].some((t) => String(t || '').toLowerCase().includes(q));
    if (show === 'none') { if (!cases.length && match(null)) rows.push({ u, c: null }); continue; }
    if (show === 'all' && !cases.length) { if (match(null)) rows.push({ u, c: null }); continue; }
    for (const c of cases) if ((show === 'all' || (show === 'open' ? c.status === 'open' : c.status === 'completed')) && match(c)) rows.push({ u, c });
  }
  const open = trCases.filter((c) => c.status === 'open').length, done = trCases.filter((c) => c.status === 'completed').length;
  const units0 = list.filter((u) => !(byUnit.get(u.id) || []).some((c) => c.status !== 'cancelled')).length;
  $('#tr-summary').textContent = `${open} in progress · ${done} completed · ${units0} units with no transfer recorded.`;
  const canEdit = canDo('unitRecords');
  $('#tr-rows').innerHTML = rows.map(({ u, c }) => {
    if (!c) return `<tr><td class="unit">${esc(u.unit)}</td><td>${esc(u.name || '')}</td><td colspan="3" class="muted">No transfer recorded</td>
      <td>${canEdit ? `<button class="btn btn-small" type="button" data-tr-start="${esc(u.id)}">Start…</button>` : ''}</td></tr>`;
    const p = caseProgress(c);
    return `<tr><td class="unit">${esc(u.unit)}</td><td>${esc(u.name || '')}</td>
      <td>${esc(TRANSFER_TYPES[c.type] || c.type)}<span class="sub">${esc(c.from || '…')} → ${esc(c.to || '…')}</span><span class="sub">Started ${dmy(c.startedOn)}</span></td>
      <td>${p.done} of ${p.total}<span class="tr-bar"><i style="width:${p.total ? Math.round(100 * p.done / p.total) : 0}%"></i></span>${p.missing.length && c.status === 'open' ? `<span class="sub">Still to come: ${esc(p.missing.slice(0, 4).map((i) => i.name).join(', '))}${p.missing.length > 4 ? ` and ${p.missing.length - 4} more` : ''}</span>` : ''}</td>
      <td>${c.status === 'completed' ? `<span class="ag-ok">Completed ${dmy(c.completedOn)}</span>` : '<span class="m20-due">In progress</span>'}${c.resolutionOn ? `<span class="sub">Resolution ${dmy(c.resolutionOn)}${c.resolutionRef ? `, ${esc(c.resolutionRef)}` : ''}</span>` : ''}${c.endorsedOn ? `<span class="sub">Certificate endorsed ${dmy(c.endorsedOn)}</span>` : ''}</td>
      <td><button class="btn btn-small${c.status === 'open' ? ' btn-primary' : ''}" type="button" data-tr-open="${esc(c.unit)}/${esc(c.id)}">${canEdit && c.status === 'open' ? 'Update' : 'View'}</button></td></tr>`;
  }).join('') || `<tr><td colspan="6" class="empty">${show === 'open' ? 'No transfers in progress.' : 'Nothing to show.'}</td></tr>`;
}
function trLetterCtx(c, unitLabel) {
  return { unit: unitLabel, from: c.from, to: c.to, eventDate: c.eventDate, possessionDate: c.possessionDate, deedNo: c.deedNo, cert: c.cert, items: c.items };
}
function openTransfer(c, isNew = false) {
  trCurrent = c;
  const f = $('#tr-form'), canEdit = canDo('unitRecords') && c.status !== 'completed' && c.status !== 'cancelled';
  f.reset(); setMsg(f, '');
  $('#tr-start').hidden = !isNew;
  const u = (units.length ? units : dues.units).find((x) => x.id === c.unit);
  $('#tr-title').textContent = isNew ? 'Start a membership transfer' : `${u?.unit || c.unit}: ${TRANSFER_TYPES[c.type]}`;
  if (isNew) {
    f.unit.innerHTML = (units.length ? units : dues.units).slice().sort((a, b) => String(a.unit).localeCompare(String(b.unit), 'en', { numeric: true }))
      .map((x) => `<option value="${esc(x.id)}">${esc(x.unit)}${x.name ? ` – ${esc(x.name)}` : ''}</option>`).join('');
    f.unit.value = c.unit || f.unit.options[0]?.value; f.type.value = c.type || 'sale';
  }
  ['from', 'to', 'eventDate', 'deedNo', 'possessionDate', 'cert', 'resolutionOn', 'resolutionRef', 'endorsedOn', 'newCert', 'notes'].forEach((k) => { f[k].value = c[k] || ''; });
  trTypeChanged();
  renderTrItems();
  $$('input, select, textarea', f).forEach((x) => { if (!x.closest('[data-close]')) x.disabled = !canEdit; });
  $('#tr-save').hidden = $('#tr-complete').hidden = $('#tr-cancel-case').hidden = !canEdit;
  $('#tr-cancel-case').hidden ||= isNew;
  $('#tr-dialog').showModal();
}
function trTypeChanged() {
  const f = $('#tr-form'), type = $('#tr-start').hidden ? trCurrent.type : f.type.value, death = type === 'death';
  $('#tr-from-label').firstChild.textContent = death ? 'Deceased member' : 'Outgoing member (seller)';
  $('#tr-to-label').firstChild.textContent = death ? 'Nominee(s) / legal heir(s)' : 'New member(s) (buyer)';
  $('#tr-date-label').firstChild.textContent = death ? 'Date of death' : 'Date of the sale deed';
  $$('.tr-sale', f).forEach((x) => (x.hidden = death));
  if (!$('#tr-start').hidden) { trCurrent.type = type; trCurrent.items = structuredClone(trChecklists[type].items); renderTrItems(); }
}
function renderTrItems() {
  const c = trCurrent, got = c.got || {};
  $('#tr-items').innerHTML = (c.items || []).map((i) => {
    const g = got[i.id] || {}, files = (c.files || []).filter((x) => x.item === i.id);
    const le = libraryFor(i, trLib), gl = le ? guideOf(le) : FORMS[i.formKey];
    const fmt = i.letter && LETTERS[i.letter] ? `<button class="btn btn-small" type="button" data-tr-letter="${esc(i.letter)}">Print letter</button>`
      : le ? `<button class="btn btn-small" type="button" data-tr-lib="${esc(le.id)}">Blank form</button>` : i.formKey ? '<span class="muted">Not in the Library yet</span>' : '<span class="muted">—</span>';
    return `<tr data-item="${esc(i.id)}"><td><strong>${esc(i.name)}</strong>${i.note ? `<span class="sub">${esc(i.note)}</span>` : ''}${gl ? `<span class="sub tr-form-line">${esc(formLine(gl))}</span>` : ''}${g.by ? `<span class="sub">Recorded by ${esc(g.byName || '')}</span>` : ''}</td>
      <td><input type="date" name="on_${esc(i.id)}" value="${esc(g.on || '')}" aria-label="${esc(i.name)} received on"></td>
      <td><input type="checkbox" name="na_${esc(i.id)}" ${g.na ? 'checked' : ''} aria-label="${esc(i.name)} not needed"></td>
      <td>${files.map((x) => `<button class="btn btn-small" type="button" data-tr-file="${esc(x.id)}" title="${esc(x.name)}">Open</button>`).join(' ')}<input type="file" name="file_${esc(i.id)}" accept="image/*,application/pdf" multiple></td>
      <td>${fmt}</td></tr>`;
  }).join('');
  const p = caseProgress(c);
  $('#tr-progress').textContent = `${p.done} of ${p.total} received or not needed.`;
}
function readTrForm() {
  const f = $('#tr-form'), c = { ...trCurrent, items: JSON.parse(JSON.stringify(trCurrent.items || [])), got: JSON.parse(JSON.stringify(trCurrent.got || {})) };
  ['from', 'to', 'eventDate', 'deedNo', 'possessionDate', 'cert', 'resolutionOn', 'resolutionRef', 'endorsedOn', 'newCert', 'notes'].forEach((k) => { c[k] = f[k].value.trim(); });
  if (!$('#tr-start').hidden) { c.unit = f.unit.value; c.type = f.type.value; }
  c.got = c.got || {};
  for (const i of c.items || []) {
    const on = f[`on_${i.id}`].value, na = f[`na_${i.id}`].checked, prev = c.got[i.id] || {};
    if (on !== (prev.on || '') || na !== Boolean(prev.na)) c.got[i.id] = { on, na, by: uid, byName: me?.name || '', at: new Date().toISOString() };
    if (!on && !na) delete c.got[i.id];
  }
  return c;
}
async function saveTransfer(complete) {
  const { F, db } = fb, f = $('#tr-form');
  const c = readTrForm();
  if (!c.unit) return setMsg(f, 'Choose the unit.');
  if (complete) {
    const p = caseProgress(c);
    if (p.missing.length && !confirm(`${p.missing.length} document(s) not received yet: ${p.missing.map((i) => i.name).join(', ')}. Mark completed anyway?`)) return;
    if (!c.resolutionOn && !confirm('No committee resolution date. Mark completed anyway?')) return;
  }
  const u = (units.length ? units : dues.units).find((x) => x.id === c.unit);
  await busy(complete ? $('#tr-complete') : $('#tr-save'), async () => {
    try {
      // New scans go to the unit's Drive folder, Membership transfer.
      const newFiles = [];
      const picks = (c.items || []).map((i) => [i, [...(f[`file_${i.id}`]?.files || [])]]).filter(([, fs]) => fs.length);
      if (picks.length) {
        await loadDriveCfg(fb);
        if (!driveReady()) throw new Error('Connect the Society’s Google Drive first (Expenses → Set-up) to keep scans.');
        for (const [i, fs] of picks) {
          setMsg(f, `Saving the scan of ${esc(i.name)}…`, true);
          const saved = await uploadUnitScans(fb, { unitId: c.unit, unitLabel: u?.unit || c.unit, wing: blockName(u?.block), kind: 'transfers', title: `${c.type === 'death' ? 'Transmission' : 'Transfer'} - ${i.name}`, files: fs });
          saved.forEach((x) => newFiles.push({ ...x, item: i.id }));
          if (!c.got[i.id]?.on) c.got[i.id] = { ...(c.got[i.id] || {}), on: todayISO(), by: uid, byName: me?.name || '', at: new Date().toISOString() };
        }
      }
      const data = { type: c.type, title: TRANSFER_TYPES[c.type], items: c.items, got: c.got, files: [...(c.files || []), ...newFiles],
        from: c.from, to: c.to, eventDate: c.eventDate, deedNo: c.deedNo, possessionDate: c.possessionDate, cert: c.cert,
        resolutionOn: c.resolutionOn, resolutionRef: c.resolutionRef, endorsedOn: c.endorsedOn, newCert: c.newCert, notes: c.notes,
        status: complete ? 'completed' : c.status || 'open', completedOn: complete ? todayISO() : c.completedOn || '',
        updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: me?.name || '' };
      if (c.id) await F.updateDoc(F.doc(db, 'units', c.unit, 'transfers', c.id), data);
      else {
        const ref = await F.addDoc(F.collection(db, 'units', c.unit, 'transfers'), { ...data, startedOn: todayISO(), createdBy: uid, createdByName: me?.name || '', createdAt: F.serverTimestamp() });
        c.id = ref.id;
        $('#tr-show').value = 'open';   // show the new case in the list
      }
      $('#tr-dialog').close();
      backupThisUnit(c.unit);
      const msg = $('#tr-msg'); msg.className = 'form-msg ok';
      const p = caseProgress({ ...c, got: data.got });
      msg.textContent = `${u?.unit || c.unit}: ${complete ? 'transfer completed' : `saved (${p.done} of ${p.total} documents)`}.${newFiles.length ? ` ${newFiles.length} scan(s) kept in the unit’s Drive folder.` : ''}`;
      await loadTransfers();
    } catch (err) { setMsg(f, esc(errorText(err))); }
  });
}
function renderChecklistEditor() {
  const ed = canDo('committee');
  const libOpts = (sel) => `<option value="">—</option>${trLib.filter((e) => e.file).sort((a, b) => Number(!a.formKey) - Number(!b.formKey) || Object.keys(FORMS).indexOf(a.formKey) - Object.keys(FORMS).indexOf(b.formKey) || String(a.title).localeCompare(String(b.title)))
    .map((e) => `<option value="${esc(e.id)}" ${sel === e.id ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}`;
  const letOpts = (sel) => `<option value="">—</option>${Object.entries(LETTERS).map(([k, L]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(L.title)}</option>`).join('')}`;
  $('#trc-lists').innerHTML = ['death', 'sale'].map((t) => {
    const L = trChecklists[t];
    return `<div class="trc-list" data-list="${t}"><h3>${esc(TRANSFER_TYPES[t])}</h3>
      <label>Title<input type="text" data-k="title" value="${esc(L.title)}" ${ed ? '' : 'disabled'}></label>
      <div class="table-scroll"><table><thead><tr><th>Document</th><th>Note (stamp paper etc.)</th><th>Society’s letter</th><th>Blank form in the Library</th><th></th></tr></thead><tbody>
      ${L.items.map((i) => `<tr data-id="${esc(i.id)}" data-form="${esc(i.formKey || '')}"><td><input type="text" data-k="name" value="${esc(i.name)}" ${ed ? '' : 'disabled'}></td><td><input type="text" data-k="note" value="${esc(i.note || '')}" ${ed ? '' : 'disabled'}></td>
        <td><select data-k="letter" ${ed ? '' : 'disabled'}>${letOpts(i.letter)}</select></td><td><select data-k="libraryId" ${ed ? '' : 'disabled'}>${libOpts(libraryFor(i, trLib)?.id || '')}</select>${i.formKey && FORMS[i.formKey] ? `<span class="sub">${esc(FORMS[i.formKey].no)}${libraryFor(i, trLib) ? '' : ' — not in the Library yet'}</span>` : ''}</td>
        <td>${ed ? '<button class="btn btn-small" type="button" data-trc-del>Remove</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>${ed ? `<button class="btn btn-small" type="button" data-trc-add="${t}">Add a document</button>` : ''}</div>`;
  }).join('');
}
/** The blank form chosen for a document: the Library entry, and its bye-law form key (kept if none is chosen). */
function trFormOf(tr) {
  const id = $('[data-k=libraryId]', tr).value, ent = trLib.find((e) => e.id === id);
  const formKey = id ? ent?.formKey || '' : tr.dataset.form || '';
  return { ...(id ? { libraryId: id } : {}), ...(formKey ? { formKey } : {}) };
}
function readChecklists() {
  const out = {};
  for (const box of $$('#trc-lists .trc-list')) {
    const t = box.dataset.list;
    out[t] = { title: $('[data-k=title]', box).value.trim(), intro: trChecklists[t].intro || '', items: $$('tbody tr', box).map((tr) => ({
      id: tr.dataset.id, name: $('[data-k=name]', tr).value.trim(), note: $('[data-k=note]', tr).value.trim(),
      ...($('[data-k=letter]', tr).value ? { letter: $('[data-k=letter]', tr).value } : {}), ...trFormOf(tr) })).filter((i) => i.name) };
  }
  return out;
}
function wireTransfers() {
  const { F, db } = fb;
  ['#tr-q', '#tr-show'].forEach((id) => $(id).addEventListener(id === '#tr-q' ? 'input' : 'change', renderTransfers));
  $('#tr-new').addEventListener('click', () => openTransfer({ unit: '', type: 'sale', items: structuredClone(trChecklists.sale.items), got: {}, files: [], status: 'open' }, true));
  $('#tr-rows').addEventListener('click', (e) => {
    const st = e.target.closest('[data-tr-start]'), op = e.target.closest('[data-tr-open]');
    if (st) {
      const u = (units.length ? units : dues.units).find((x) => x.id === st.dataset.trStart);
      openTransfer({ unit: u.id, type: 'sale', from: u.name || '', items: structuredClone(trChecklists.sale.items), got: {}, files: [], status: 'open' }, true);
    }
    if (op) { const [unit, id] = op.dataset.trOpen.split('/'); const c = trCases.find((x) => x.unit === unit && x.id === id);
      // Plain copy (times and other Firestore values are not needed in the window).
      openTransfer({ ...c, items: JSON.parse(JSON.stringify(c.items || [])), got: JSON.parse(JSON.stringify(c.got || {})), files: JSON.parse(JSON.stringify(c.files || [])), createdAt: null, updatedAt: null }); }
  });
  $('#tr-form').type.addEventListener('change', trTypeChanged);
  $('#tr-form').unit.addEventListener('change', (e) => { const u = (units.length ? units : dues.units).find((x) => x.id === e.target.value); if (u && !$('#tr-form').from.value) $('#tr-form').from.value = u.name || ''; });
  $('#tr-form').addEventListener('submit', (e) => { e.preventDefault(); saveTransfer(false); });
  $('#tr-complete').addEventListener('click', () => saveTransfer(true));
  $('#tr-cancel-case').addEventListener('click', async () => {
    const c = trCurrent;
    if (!c.id || !confirm('Cancel this transfer? It stays on record as cancelled.')) return;
    try { await F.updateDoc(F.doc(db, 'units', c.unit, 'transfers', c.id), { status: 'cancelled', updatedAt: F.serverTimestamp(), updatedBy: uid }); $('#tr-dialog').close(); await loadTransfers(); }
    catch (err) { setMsg($('#tr-form'), esc(errorText(err))); }
  });
  $('#tr-dialog [data-close]').addEventListener('click', () => $('#tr-dialog').close());
  $('#tr-items').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = readTrForm(), u = (units.length ? units : dues.units).find((x) => x.id === c.unit);
    if (b.dataset.trLetter) openLetter(b.dataset.trLetter, trLetterCtx(c, u?.unit || c.unit));
    else if (b.dataset.trLib) { const ent = trLib.find((x) => x.id === b.dataset.trLib); openDriveCopy({ libraryId: ent.id, fileId: ent.file.id }); }
    else if (b.dataset.trFile) openDriveCopy({ unitId: c.unit, record: 'transfers', recordId: c.id, fileId: b.dataset.trFile });
  });
  $('#trc-lists').addEventListener('click', (e) => {
    const del = e.target.closest('[data-trc-del]'), add = e.target.closest('[data-trc-add]');
    if (del) del.closest('tr').remove();
    if (add) {
      trChecklists = readChecklists();
      trChecklists[add.dataset.trcAdd].items.push({ id: `x${Date.now().toString(36)}`, name: 'New document', note: '' });
      renderChecklistEditor();
    }
  });
  $('#trc-save').addEventListener('click', async (e) => {
    if (!canDo('committee')) return;
    const next = readChecklists();
    if (!next.death.items.length || !next.sale.items.length) return setMsg($('#trc-box'), 'Each list needs at least one document.');
    await busy(e.currentTarget, async () => {
      try {
        await F.setDoc(F.doc(db, 'settings', 'transferChecklists'), { ...next, updatedAt: F.serverTimestamp(), updatedBy: uid }); trChecklists = next;
        // The transfers in progress keep their documents, but can take the forms now linked to them.
        const byId = new Map(['death', 'sale'].flatMap((t) => next[t].items.map((i) => [`${t}/${i.id}`, i])));
        const open = trCases.filter((c) => c.status === 'open' && (c.items || []).some((i) => { const n = byId.get(`${c.type}/${i.id}`); return n && ((n.libraryId || '') !== (i.libraryId || '') || (n.formKey || '') !== (i.formKey || '')); }));
        let upd = 0;
        if (open.length && confirm(`Use the forms now linked in the ${open.length} transfer${open.length === 1 ? '' : 's'} in progress too? (Their documents and what was received stay as they are.)`)) {
          for (const c of open) {
            const items = c.items.map((i) => { const n = byId.get(`${c.type}/${i.id}`); if (!n) return i; const o = { ...i }; delete o.libraryId; delete o.formKey; return { ...o, ...(n.libraryId ? { libraryId: n.libraryId } : {}), ...(n.formKey ? { formKey: n.formKey } : {}) }; });
            await F.updateDoc(F.doc(db, 'units', c.unit, 'transfers', c.id), { items, updatedAt: F.serverTimestamp(), updatedBy: uid }); upd++;
          }
          await loadTransfers();
        }
        const m = $('#trc-msg'); m.className = 'form-msg ok'; m.textContent = `Saved. New transfers use these lists; members see them on their page.${upd ? ` ${upd} transfer${upd === 1 ? '' : 's'} in progress updated.` : ''}`;
      }
      catch (err) { const m = $('#trc-msg'); m.className = 'form-msg'; m.textContent = errorText(err); }
    });
  });
  $('#trc-forms').addEventListener('click', () => {
    trChecklists = readChecklists();
    let linked = 0; const missing = new Set();
    for (const L of Object.values(trChecklists)) for (const i of L.items) {
      const key = CHECKLIST_FORMS[i.id] && (DEFAULT_CHECKLISTS.death.items.concat(DEFAULT_CHECKLISTS.sale.items).find((d) => d.id === i.id)?.name === i.name) ? CHECKLIST_FORMS[i.id] : i.formKey;
      if (!key) continue;
      const ent = trLib.find((e) => e.formKey === key && e.file);
      if (ent) { i.formKey = key; i.libraryId = ent.id; linked++; } else { i.formKey = key; delete i.libraryId; missing.add(FORMS[key]?.no || key); }
    }
    renderChecklistEditor();
    const m = $('#trc-msg'); m.className = missing.size ? 'form-msg' : 'form-msg ok';
    m.textContent = `${linked} document${linked === 1 ? '' : 's'} linked to the bye-law forms in the Library.${missing.size ? ` Not in the Library yet: ${[...missing].join(', ')} (add them under Library → Add the bye-law forms).` : ''} Save the checklists to keep this.`;
  });
  $('#trc-reset').addEventListener('click', () => { if (confirm('Put back the standard lists in the editor? Nothing changes until you save.')) { trChecklists = structuredClone(DEFAULT_CHECKLISTS); renderChecklistEditor(); } });
}

/* ----- 3.22: members pre-registered by email (memberInvites/{email}) ----- */
let invites = [], invitesByEmail = new Map();
const PR_RELATIONS = ['owner', 'jointOwner', 'family', 'tenant', 'caretaker'];
async function loadInvites() {
  if (!canDo('members')) return;
  const { F, db } = fb;
  const snap = await F.getDocs(F.collection(db, 'memberInvites')).catch(() => ({ docs: [] }));
  invites = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (tsDate(b.createdAt) || 0) - (tsDate(a.createdAt) || 0));
  invitesByEmail = new Map(invites.filter((i) => i.status !== 'cancelled').map((i) => [i.id, i]));
  renderInvites();
}
function renderInvites() {
  const f = $('#prereg-form');
  if (!f.unit.options.length) {
    const list = (units.length ? units : dues.units).slice().sort((a, b) => String(a.unit).localeCompare(String(b.unit), 'en', { numeric: true }));
    f.unit.innerHTML = '<option value="">Choose…</option>' + list.map((u) => `<option value="${esc(u.id)}">${esc(u.unit)}${u.name ? ` – ${esc(u.name)}` : ''}</option>`).join('');
    f.relation.innerHTML = PR_RELATIONS.map((r) => `<option value="${r}">${esc(relationLabel(r))}</option>`).join('');
  }
  const sender = { name: me?.name, role: me?.role };
  const usedBy = new Map(memberDocs.map((m) => [m.id, m]));
  $('#prereg-rows').innerHTML = invites.map((i) => {
    const p = { name: i.name, unit: i.unit, unitLabel: memberUnitLabel(i.unit), email: i.email, mobile: i.mobile };
    const m = fillReminder(PREREG_MESSAGE, p, sender);
    const log = rmLog.filter((r) => r.kind === 'invite' && r.key === `pre:${i.id}`), last = log[0];
    const member = i.usedBy ? usedBy.get(i.usedBy) : null;
    const status = i.status === 'used' ? `<span class="ag-ok">Signed in ${whenShort(i.usedAt)}</span><span class="sub">${member ? `${member.agreementVersion ? 'Agreement accepted' : 'Agreement not yet accepted'}` : ''}</span>`
      : i.status === 'cancelled' ? '<span class="muted">Cancelled</span>'
      : `<span class="m20-due">Waiting for their first sign-in</span><span class="sub">Since ${whenShort(i.createdAt)}${i.createdByName ? `, by ${esc(i.createdByName)}` : ''}</span>`;
    return `<tr><td>${esc(i.email)}</td><td class="unit">${esc(memberUnitLabel(i.unit))}</td><td>${esc(i.name)}<span class="sub">${esc(relationLabel(i.relation))}${i.mobile ? ` · +91 ${esc(i.mobile)}` : ''}</span></td>
      <td>${status}</td><td>${last ? `${esc(RM_CHANNEL[last.channel] || last.channel)}<span class="sub">${whenShort(last.at)}${log.length > 1 ? ` · ${log.length} times` : ''}</span>` : '<span class="muted">Not sent</span>'}</td>
      <td><div class="mc-actions">${i.status === 'open' ? `${waNumber(i.mobile) ? `<a class="btn btn-small" href="${esc(waLink(i.mobile, m))}" target="_blank" rel="noopener" data-pr-go="whatsapp" data-pr="${esc(i.id)}">WhatsApp</a>` : ''}
        <a class="btn btn-small" href="${esc(mailLink(i.email, m))}" data-pr-go="email" data-pr="${esc(i.id)}">Email</a>
        <button class="btn btn-small btn-danger" type="button" data-pr-cancel="${esc(i.id)}">Cancel</button>`
        : i.status === 'cancelled' ? `<button class="btn btn-small" type="button" data-pr-reopen="${esc(i.id)}">Reopen</button>` : ''}</div></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Nobody pre-registered yet.</td></tr>';
}
/** A contact from the unit files (Reminders → Not registered) as a pre-registration. */
function contactToPrereg(c) {
  const rel = /tenant/i.test(c.as) ? 'tenant' : /joint/i.test(c.as) ? 'jointOwner' : /family/i.test(c.as) ? 'family' : 'owner';
  return { unit: c.unit, name: c.name, relation: rel, email: c.email, mobile: tenDigits(c.mobile), access: defaultAccess(rel) };
}
/** Saves a pre-registration after checking the email isn't already a member, a request or someone pre-registered. */
async function savePrereg(d) {
  const { F, db } = fb;
  const email = String(d.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw new Error('Enter a valid email address.');
  if (!d.unit) throw new Error('Choose the unit.');
  if (String(d.name || '').trim().length < 3) throw new Error('Enter the name.');
  const mobile = d.mobile ? tenDigits(d.mobile) : '';
  if (d.mobile && !mobile) throw new Error('The mobile number should have 10 digits.');
  const already = memberDocs.find((m) => String(m.email || '').toLowerCase() === email && m.status !== 'rejected' && !m.removed);
  if (already) throw new Error(already.status === 'pending' ? `${email} has already asked for access (${memberUnitLabel(already.unit)}): approve the request under Requests waiting.` : `${email} is already a member (${memberUnitLabel(already.unit)}).`);
  const prev = invitesByEmail.get(email);
  if (prev?.status === 'used') throw new Error(`${email} has already signed in with this pre-registration.`);
  await F.setDoc(F.doc(db, 'memberInvites', email), { email, name: String(d.name).trim(), unit: d.unit, relation: d.relation, access: d.access, mobile, status: 'open',
    createdBy: uid, createdByName: me?.name || '', createdByEmail: me?.email || '', createdAt: F.serverTimestamp() });
  return email;
}
function wirePrereg() {
  const { F, db } = fb;
  const f = $('#prereg-form');
  f.relation.addEventListener('change', () => { f.access.value = defaultAccess(f.relation.value); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await busy($('button[type=submit]', f), async () => {
      try {
        const email = await savePrereg({ unit: f.unit.value, name: f.name.value, relation: f.relation.value, email: f.email.value, mobile: f.mobile.value, access: f.access.value });
        f.reset(); f.access.value = 'full'; setMsg(f, '');
        const msg = $('#prereg-msg'); msg.className = 'form-msg ok';
        msg.textContent = `Pre-registered ${email}. Send the invitation below; when they sign in with Google using this email, they confirm their mobile and accept the agreement.`;
        await loadInvites();
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#prereg-rows').addEventListener('click', async (e) => {
    const go = e.target.closest('[data-pr-go]');
    const i = invites.find((x) => x.id === (go?.dataset.pr || e.target.closest('[data-pr-cancel],[data-pr-reopen]')?.dataset.prCancel || e.target.closest('[data-pr-reopen]')?.dataset.prReopen));
    if (!i) return;
    if (go) {
      const rec = { kind: 'invite', key: `pre:${i.id}`, unit: i.unit, name: i.name, email: i.email, mobile: i.mobile || '', uid: '', channel: go.dataset.prGo, by: uid, byName: me?.name || '', at: F.serverTimestamp() };
      F.addDoc(F.collection(db, 'memberReminders'), rec).then((ref) => { rmLog.unshift({ ...rec, id: ref.id, at: { toDate: () => new Date() } }); setTimeout(renderInvites, 300); }).catch((err) => console.warn('invitation log', err));
      return;
    }
    const cancel = e.target.closest('[data-pr-cancel]');
    if (cancel && !confirm(`Cancel the pre-registration of ${i.email}? If they sign in later they will have to register and wait for approval.`)) return;
    try {
      await F.setDoc(F.doc(db, 'memberInvites', i.id), { ...Object.fromEntries(Object.entries(i).filter(([k]) => k !== 'id')), status: cancel ? 'cancelled' : 'open', changedBy: uid, changedAt: F.serverTimestamp() });
      await loadInvites();
    } catch (err) { const msg = $('#prereg-msg'); msg.className = 'form-msg'; msg.textContent = errorText(err); }
  });
  $('#rm-prereg-all').addEventListener('click', async (e) => {
    const todo = rmRows.filter((p) => validEmail(p.email) && !invitesByEmail.get(p.email.toLowerCase()));
    if (!todo.length || !confirm(`Pre-register ${todo.length} ${todo.length === 1 ? 'person' : 'people'} with the email in their unit file? Each can then sign in with Google using that email without waiting for approval.`)) return;
    const msg = $('#rm-msg'); let ok = 0; const bad = [];
    await busy(e.currentTarget, async () => {
      for (const p of todo) { try { await savePrereg(contactToPrereg(p)); ok++; } catch (err) { bad.push(`${p.name}: ${errorText(err)}`); } }
      await loadInvites(); await renderReminders();
    });
    msg.className = bad.length ? 'form-msg' : 'form-msg ok';
    msg.textContent = `Pre-registered ${ok}.${bad.length ? ` Not done: ${bad.join('; ')}.` : ''} Send them the invitation (WhatsApp or Email in the list).`;
  });
}

/* ----- 3.20: Rules, GRs and forms library ----- */
let libDocs = [], libEdit = null;
const libIndexes = new Map();
/* 3.24: add the model bye-law forms (appendices) in one go, each with its guide */
let libsetFiles = [];
function renderLibrarySet() {
  const have = new Map(libDocs.filter((e) => !e.removed && e.formKey).map((e) => [e.formKey, e]));
  const seen = new Set();
  libsetFiles = [...$('#libset-files').files].map((file) => {
    const key = formKeyOf(file.name);
    const st = !key ? 'unknown' : have.has(key) ? 'have' : seen.has(key) ? 'dup' : file.type && file.type !== 'application/pdf' ? 'type' : 'add';
    if (key) seen.add(key);
    return { file, key, st };
  });
  const order = (x) => (x.key ? Object.keys(FORMS).indexOf(x.key) : 999);
  libsetFiles.sort((a, b) => order(a) - order(b));
  $('#libset-rows').innerHTML = libsetFiles.map((x) => { const fm = FORMS[x.key];
    return `<tr class="${x.st === 'add' ? '' : 'muted'}"><td>${esc(x.file.name)}<span class="sub">${fmtSize(x.file.size)}</span></td><td>${fm ? `<strong>${esc(fm.no)}</strong>${fm.aka ? ` <span class="muted">(${esc(fm.aka)})</span>` : ''}<span class="sub">${esc(fm.title)}</span>` : '—'}</td><td>${esc(fm?.law || '')}</td>
      <td>${{ add: 'To add', have: 'Already in the library', dup: 'Same form twice', unknown: 'Not recognised: add it with the form below', type: 'Not a PDF' }[x.st]}</td></tr>`; }).join('');
  const n = libsetFiles.filter((x) => x.st === 'add').length;
  $('#libset-add').disabled = !n;
  $('#libset-add').textContent = n ? `Add ${n} form${n === 1 ? '' : 's'}` : 'Add the forms';
}
function wireLibrarySet() {
  const { F, db } = fb;
  $('#libset-files').addEventListener('change', renderLibrarySet);
  $('#libset-add').addEventListener('click', async (e) => {
    const todo = libsetFiles.filter((x) => x.st === 'add'), isPublic = $('#libset-public').checked, msg = $('#libset-msg');
    const prog = (t) => { $('#libset-progress').textContent = t; };
    msg.textContent = '';
    await busy(e.currentTarget, async () => {
      let done = 0, noWords = [];
      try {
        await loadDriveCfg(fb);
        if (!driveReady()) throw new Error('Connect the Society’s Google Drive first (Expenses → Set-up).');
        for (const x of todo) {
          const fm = FORMS[x.key], label = `${done + 1} of ${todo.length}: ${fm.no}`;
          prog(`${label} — saving in the Society’s Google Drive…`);
          const category = fm.category || 'Statutory form', title = fm.category ? fm.title : `${fm.no}: ${fm.title}`;
          const r = await driveCall(fb, 'upload', { kind: 'library', category, name: `${safeName(fm.category ? fm.title : `${fm.no} - ${fm.title}`, 150)}.pdf`,
            mimeType: 'application/pdf', data: await toBase64(x.file), note: fm.law || '' });
          const guide = {};
          for (const k of LIB_GUIDE_KEYS) if (fm[k]) guide[k] = fm[k];
          const keywords = [fm.no, fm.aka, 'model bye-laws', fm.category ? '' : 'form', ...(fm.no.match(/\d+[A-Za-z]?/g) || []).map((n) => `appendix ${n}`)].filter(Boolean);
          const ref = await F.addDoc(F.collection(db, 'libraryDocs'), { title, category, issuer: '', number: fm.category ? '' : fm.no, date: '', year: '', lang: fm.lang || 'English',
            keywords: [...new Set(keywords)], description: fm.use, link: '', public: isPublic, removed: false, formKey: x.key, guide,
            file: r.file, textWords: 0, pages: 0, addedBy: uid, addedByName: me?.name || '', addedAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: me?.name || '' });
          try {
            const w = await indexLibraryPdf(ref.id, new Uint8Array(await x.file.arrayBuffer()), isPublic, (t) => prog(`${label} — ${t}`));
            if (!w.count) noWords.push(fm.no);
          } catch (err) { console.warn('pdf words', err); noWords.push(fm.no); }
          x.st = 'have'; done++;
        }
        msg.className = 'form-msg ok';
        msg.textContent = `${done} form${done === 1 ? '' : 's'} added to the library.${noWords.length ? ` No words could be read from ${noWords.join(', ')} (scanned?); they are still found by their number and title.` : ''} Link them to the transfer lists under Transfers → The checklists and their formats → Use the bye-law forms.`;
      } catch (err) {
        msg.className = 'form-msg';
        msg.textContent = `${done ? `${done} added; then: ` : ''}${errorText(err)}`;
      }
      prog('');
      await loadLibraryAdmin();
      renderLibrarySet();
    });
  });
}

async function loadLibraryAdmin() {
  const { F, db } = fb;
  const snap = await F.getDocs(F.collection(db, 'libraryDocs'));
  libDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const f = $('#lib-form');
  if (!f.category.options.length) {
    f.category.innerHTML = LIB_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
    f.lang.innerHTML = LIB_LANGS.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#lib-cat').innerHTML = '<option value="">All</option>' + LIB_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
    f.formKey.innerHTML = '<option value="">— not a bye-law form —</option>' + Object.entries(FORMS).map(([k, x]) => `<option value="${k}">${esc(x.no)}: ${esc(x.title)}</option>`).join('');
  }
  renderLibraryAdmin();
}
async function renderLibraryAdmin() {
  const q = $('#lib-q').value.trim(), cat = $('#lib-cat').value, showRemoved = $('#lib-show-removed').checked;
  let list = libDocs.filter((e) => (showRemoved || !e.removed) && (!cat || e.category === cat));
  if (q.length >= 2) for (const e of list) if (e.textWords && !libIndexes.has(e.id)) libIndexes.set(e.id, await loadIndex(fb, e.id));
  const hits = searchLibrary(list, q, libIndexes);
  $('#lib-count').textContent = `(${libDocs.filter((e) => !e.removed).length})`;
  $('#lib-rows').innerHTML = hits.map(({ e, inside }) => `<tr class="${e.removed ? 'lib-removed' : ''}">
      <td><strong>${esc(e.title)}</strong>${e.number ? `<span class="sub">${esc(e.number)}</span>` : ''}<span class="sub">${esc([e.issuer, e.lang, extOf(e) && `${extOf(e)} ${fmtSize(e.file?.size)}`].filter(Boolean).join(' · '))}</span>
        ${e.formKey || e.guide?.no ? `<span class="sub lib-guide-line">${esc(formLine(guideOf(e)))}</span>` : ''}${(e.keywords || []).length ? `<span class="sub">Keywords: ${esc(e.keywords.join(', '))}</span>` : ''}${inside ? '<span class="sub">Found inside the document</span>' : ''}
        <span class="sub">${e.public ? 'Public' : 'Members and team only'}${e.removed ? ` · Removed ${whenShort(e.removedAt)}` : ''}${e.addedByName ? ` · Added by ${esc(e.addedByName)}` : ''}</span></td>
      <td>${esc(e.category)}</td><td>${e.date ? dmy(e.date) : ''}</td>
      <td>${e.textWords ? `${e.textWords.toLocaleString('en-IN')} words${e.pages ? `<span class="sub">${e.pages} pages</span>` : ''}` : e.file?.mime === 'application/pdf' ? '<span class="warn">No text (scanned?)</span>' : '<span class="muted">—</span>'}</td>
      <td><div class="mc-actions">${e.file ? `<button class="btn btn-small" type="button" data-lib-open="${esc(e.id)}">Open</button>` : ''}${e.link ? `<a class="btn btn-small" href="${esc(e.link)}" target="_blank" rel="noopener">Official source</a>` : ''}
        ${e.removed ? `<button class="btn btn-small" type="button" data-lib-restore="${esc(e.id)}">Restore</button>` : `<button class="btn btn-small" type="button" data-lib-edit="${esc(e.id)}">Edit</button>${e.file?.mime === 'application/pdf' ? `<button class="btn btn-small" type="button" data-lib-reindex="${esc(e.id)}">Read words again</button>` : ''}<button class="btn btn-small btn-danger" type="button" data-lib-remove="${esc(e.id)}">Remove</button>`}</div></td></tr>`).join('')
    || `<tr><td colspan="5" class="empty">${libDocs.length ? 'Nothing matches.' : 'The library is empty. Add the first document above.'}</td></tr>`;
}
function libProgress(t) { $('#lib-progress').textContent = t; }
/** Reads the words of a PDF (bytes) and saves them with the entry. */
async function indexLibraryPdf(id, bytes, isPublic, progress = libProgress) {
  progress('Reading the words in the PDF…');
  const r = await pdfWords(bytes, (p, n) => progress(`Reading the words: page ${p} of ${n}…`));
  progress('Saving the word list…');
  await saveIndex(fb, id, r.words, isPublic);
  forgetIndex(id); libIndexes.delete(id);
  await fb.F.updateDoc(fb.F.doc(fb.db, 'libraryDocs', id), { textWords: r.count, pages: r.pages, indexedAt: fb.F.serverTimestamp() });
  return r;
}
function resetLibForm() {
  const f = $('#lib-form');
  f.reset(); libEdit = null; setMsg(f, ''); libProgress('');
  $('#lib-form-title').textContent = 'Add a document'; $('#lib-save').textContent = 'Add to the library';
  $('#lib-cancel').hidden = true; $('#lib-keep-wrap').hidden = true;
  libSourceChanged();
}
const LIB_GUIDE_KEYS = ['no', 'aka', 'law', 'signedBy', 'stamp', 'use', 'attach'];
function readLibGuide(f) {
  const g = {};
  for (const k of LIB_GUIDE_KEYS) { const v = f[`g_${k}`].value.trim(); if (v) g[k] = v; }
  return g;
}
/** Puts an entry's guide in the form; blanks are filled from the bye-law form chosen. */
function fillLibGuide(f, g, key) {
  const base = FORMS[key] || {};
  for (const k of LIB_GUIDE_KEYS) f[`g_${k}`].value = g[k] || base[k] || '';
}
function libSourceChanged() {
  const v = $('#lib-form').source.value;
  $('#lib-file-wrap').hidden = v !== 'file'; $('#lib-url-wrap').hidden = v !== 'link';
}
function wireLibraryAdmin() {
  const { F, db } = fb;
  const f = $('#lib-form');
  $$('[name=source]', f).forEach((r) => r.addEventListener('change', libSourceChanged));
  f.url.addEventListener('change', () => { if (!f.link.value) f.link.value = f.url.value; });
  ['#lib-q', '#lib-cat', '#lib-show-removed'].forEach((id) => $(id).addEventListener(id === '#lib-q' ? 'input' : 'change', () => renderLibraryAdmin()));
  $('#lib-cancel').addEventListener('click', resetLibForm);
  f.formKey.addEventListener('change', () => {
    const x = FORMS[f.formKey.value];
    if (!x) return;
    fillLibGuide(f, readLibGuide(f), f.formKey.value);
    if (!f.title.value.trim()) f.title.value = `${x.no}: ${x.title}`;
    if (!f.description.value.trim()) f.description.value = x.use;
    if (!libEdit) f.category.value = x.category || 'Statutory form';
  });
  wireLibrarySet();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = f.source.value, file = f.file.files[0], title = f.title.value.trim();
    if (title.length < 3) return setMsg(f, 'Write the title.');
    if (source === 'file' && !file) return setMsg(f, 'Choose the file.');
    if (source === 'file' && !LIB_TYPES[file.type]) return setMsg(f, 'Only PDF, Word, Excel, text files and photos can be added.');
    if (source === 'file' && file.size > LIB_MAX_BYTES) return setMsg(f, 'The file is larger than 30 MB.');
    if (source === 'link' && !/^https?:\/\/\S+$/i.test(f.url.value.trim())) return setMsg(f, 'Give the full web address, starting with https://');
    if (f.link.value && !/^https?:\/\/\S+$/i.test(f.link.value.trim())) return setMsg(f, 'The official source must be a web address starting with https://');
    const meta = { title, category: f.category.value, issuer: f.issuer.value.trim(), number: f.number.value.trim(), date: f.date.value || '', year: f.date.value ? f.date.value.slice(0, 4) : '',
      lang: f.lang.value, keywords: f.keywords.value.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30), description: f.description.value.trim(),
      link: f.link.value.trim(), public: f.public.checked, removed: false, updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: me?.name || '',
      formKey: f.formKey.value, guide: readLibGuide(f) };
    await busy($('#lib-save'), async () => {
      try {
        await loadDriveCfg(fb);
        if (source !== 'keep' && !driveReady()) throw new Error('Connect the Society’s Google Drive first (Expenses → Set-up).');
        let saved = null, bytes = null;
        if (source === 'file') {
          libProgress('Saving the file in the Society’s Google Drive…');
          const ext = (file.name.match(/\.(\w+)$/)?.[1] || LIB_TYPES[file.type]).toLowerCase();
          const r = await driveCall(fb, 'upload', { kind: 'library', category: meta.category, name: `${safeName(title, 110)}${meta.number ? ` - ${safeName(meta.number, 60)}` : ''}.${ext}`,
            mimeType: file.type, data: await toBase64(file), note: [meta.number, meta.issuer].filter(Boolean).join(', ') });
          saved = r.file;
          if (file.type === 'application/pdf') bytes = new Uint8Array(await file.arrayBuffer());
        } else if (source === 'link') {
          libProgress('Fetching the document from its web address and saving it in the Drive…');
          const r = await driveCall(fb, 'libraryFromLink', { url: f.url.value.trim(), category: meta.category, name: safeName(title, 110) });
          saved = r.file;
          if (saved.mime === 'application/pdf' && r.data) { const bin = atob(r.data); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
          if (!meta.link) meta.link = f.url.value.trim();
        }
        let id = libEdit?.id;
        if (saved) Object.assign(meta, { file: saved, textWords: 0, pages: 0 });
        if (id) await F.updateDoc(F.doc(db, 'libraryDocs', id), meta);
        else {
          const ref = await F.addDoc(F.collection(db, 'libraryDocs'), { ...meta, file: saved, textWords: 0, pages: 0, addedBy: uid, addedByName: me?.name || '', addedAt: F.serverTimestamp() });
          id = ref.id;
        }
        let note = '';
        if (bytes) {
          try { const r = await indexLibraryPdf(id, bytes, meta.public); note = r.count ? ` ${r.count.toLocaleString('en-IN')} words read from ${r.pages} pages, so it can be found by what it says.` : ' No words could be read (a scanned PDF?): add keywords so it can be found.'; }
          catch (err) { console.warn('pdf words', err); note = ` The words couldn’t be read (${errorText(err)}); add keywords, or press “Read words again”.`; }
        } else if (libEdit && libEdit.public !== meta.public) await setIndexPublic(fb, id, meta.public);
        else if (saved) await saveIndex(fb, id, '', meta.public);
        const msg = $('#lib-msg');
        msg.className = 'form-msg ok';
        msg.textContent = `${libEdit ? 'Saved' : 'Added'}: ${title}.${note}`;
        resetLibForm();
        await loadLibraryAdmin();
      } catch (err) { libProgress(''); setMsg(f, esc(errorText(err))); }
    });
  });
  $('#lib-rows').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const msg = $('#lib-msg');
    const ent = libDocs.find((x) => x.id === (b.dataset.libOpen || b.dataset.libEdit || b.dataset.libRemove || b.dataset.libRestore || b.dataset.libReindex));
    if (!ent) return;
    try {
      if (b.dataset.libOpen) {
        const w = window.open('', '_blank');
        try { const url = await driveFileUrl(fb, { libraryId: ent.id, fileId: ent.file.id }); if (w) w.location = url; else location.href = url; }
        catch (err) { if (w) w.close(); throw err; }
      } else if (b.dataset.libEdit) {
        libEdit = ent;
        f.title.value = ent.title || ''; f.category.value = ent.category; f.issuer.value = ent.issuer || ''; f.number.value = ent.number || ''; f.date.value = ent.date || '';
        f.lang.value = ent.lang || 'English'; f.keywords.value = (ent.keywords || []).join(', '); f.description.value = ent.description || ''; f.link.value = ent.link || ''; f.public.checked = ent.public === true;
        f.formKey.value = ent.formKey || ''; fillLibGuide(f, ent.guide || {}, ent.formKey);
        $('#lib-keep-wrap').hidden = !ent.file; f.source.value = ent.file ? 'keep' : 'file'; libSourceChanged();
        $('#lib-form-title').textContent = `Change: ${ent.title}`; $('#lib-save').textContent = 'Save changes'; $('#lib-cancel').hidden = false;
        f.scrollIntoView({ behavior: 'smooth' });
      } else if (b.dataset.libRemove) {
        if (!confirm(`Remove “${ent.title}” from the library? The file stays in the Society’s Drive and the entry can be restored.`)) return;
        await F.updateDoc(F.doc(db, 'libraryDocs', ent.id), { removed: true, public: false, removedAt: F.serverTimestamp(), removedBy: uid, updatedAt: F.serverTimestamp() });
        await setIndexPublic(fb, ent.id, false);
        msg.className = 'form-msg ok'; msg.textContent = `Removed: ${ent.title}.`;
        await loadLibraryAdmin();
      } else if (b.dataset.libRestore) {
        await F.updateDoc(F.doc(db, 'libraryDocs', ent.id), { removed: false, updatedAt: F.serverTimestamp() });
        msg.className = 'form-msg ok'; msg.textContent = `Restored (members and team only; tick Public in Edit to list it to everyone): ${ent.title}.`;
        await loadLibraryAdmin();
      } else if (b.dataset.libReindex) {
        await busy(b, async () => {
          const url = await driveFileUrl(fb, { libraryId: ent.id, fileId: ent.file.id });
          const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          const r = await indexLibraryPdf(ent.id, bytes, ent.public);
          libProgress('');
          msg.className = 'form-msg ok'; msg.textContent = `${ent.title}: ${r.count.toLocaleString('en-IN')} words read from ${r.pages} pages.`;
          await loadLibraryAdmin();
        });
      }
    } catch (err) { libProgress(''); msg.className = 'form-msg'; msg.textContent = errorText(err); }
  });
  libSourceChanged();
}

/* ----- 3.19: Managing Committee — posts, undertaking, M-20 bonds ----- */
const POST_ORDER = (r) => { const i = POSTS.indexOf(r); return i < 0 ? 99 : i; };
const todayISO = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
let mcApproved = [], mcCurrent = null, mcRegister = {};

async function loadUndertaking() {
  const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'settings', 'committeeUndertaking')).catch(() => null);
  return snap?.exists() ? snap.data() : structuredClone(DEFAULT_UNDERTAKING);
}
function undertakingDocHTML(u, rec) {
  const t = undertakingFor(u, rec.role || 'Committee member');
  return `<h1>${esc(t.title)}</h1>
    <p class="meta-line">Sunshree Suntec Co-operative Housing Society Ltd., Reg. No. PNA/PNA(4)/HSG/(TC)/12471/2012-13. Version ${esc(t.version)}.</p>
    <p>${esc(t.intro)}</p>
    <h2>Committee member</h2>
    <p><strong>${esc(rec.name || '')}</strong>, ${esc(rec.role || 'Committee member')}${rec.unitLabel ? `, ${esc(rec.unitLabel)}` : ''}<br>${esc(rec.email || '')}${rec.tookOfficeOn ? `<br>Took office on ${dmy(rec.tookOfficeOn)}; M-20 bond due by ${dmy(cAddDays(rec.tookOfficeOn, M20_DAYS))}` : ''}</p>
    <h2>Access</h2>
    <p>As a committee member you have every permission on the Society’s accounts portal, including those only the committee has: ${esc(COMMITTEE_ONLY.join('; '))}.</p>
    ${t.roleLines.length ? `<h2>My responsibilities as ${esc(rec.role || 'Committee member')}</h2><ol>${t.roleLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}
    <h2>My undertakings</h2>
    <ol>${t.common.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <p>${esc(t.closing)}</p>`;
}
function showUndertaking() {
  agreementMode = 'committee';
  $('#gate').hidden = true;
  $('#agreement-doc').innerHTML = undertakingDocHTML(undertaking, me);
  $('#agreement-agree-text').textContent = 'I have read and understood this undertaking and my responsibilities as a member of the Managing Committee, and I accept them.';
  const f = $('#agreement-form');
  f.reset(); f.sign.value = ''; setMsg(f, '');
  $('#agreement-screen').hidden = false;
}
async function acceptUndertaking(f, signed) {
  const { F, db } = fb, t = undertakingFor(undertaking, me.role || 'Committee member');
  await busy($('button[type=submit]', f), async () => {
    try {
      const ref = await F.addDoc(F.collection(db, 'committeeUndertakings'), {
        uid: me.uid, email: me.email || '', name: me.name || '', signedName: signed, role: me.role || 'Committee member', unit: me.unit || '', unitLabel: me.unitLabel || '',
        tookOfficeOn: me.tookOfficeOn || '', version: t.version, title: t.title, intro: t.intro, roleLines: t.roleLines, common: t.common, closing: t.closing,
        acceptedAt: F.serverTimestamp(), device: navigator.userAgent.slice(0, 180) });
      await F.updateDoc(F.doc(db, 'admins', me.uid), { undertakingVersion: t.version, undertakingAt: F.serverTimestamp(), undertakingName: signed, undertakingId: ref.id });
      // The PDF copy in the Society's Drive and by email (Drive script version 8); noted on the acceptance.
      loadDriveCfg(fb).then(() => (driveReady() ? driveCall(fb, 'committeeUndertaking', { undertakingId: ref.id }) : null))
        .then((r) => r && F.updateDoc(F.doc(db, 'committeeUndertakings', ref.id), { pdf: r.pdf, emailed: Boolean(r.emailed), emailedTo: r.emailedTo || '', cc: r.cc || '', emailNote: r.note || '', archivedAt: F.serverTimestamp() }))
        .catch((err) => { console.warn('undertaking copy', err); F.updateDoc(F.doc(db, 'committeeUndertakings', ref.id), { emailed: false, emailNote: String(errorText(err)).slice(0, 300) }).catch(() => {}); });
      await startSession(fb.auth.currentUser);
    } catch (err) {
      // Never lock the committee out (for example if the new rules aren't published yet): allow continuing for this visit.
      setMsg(f, `${esc(errorText(err))} Your acceptance couldn’t be recorded. <button class="btn btn-small" type="button" id="und-later">Continue for now</button>`);
      $('#und-later').onclick = () => { sessionStorage.setItem('undertakingLater', `${me.uid}:${undertaking.version}`); startSession(fb.auth.currentUser); };
    }
  });
}

/** The banner for committee members: their own M-20 bond, and for the Chairman and Secretary, everyone's. */
async function refreshCommitteeNotice() {
  const { F, db } = fb, box = $('#committee-notice'), lines = [];
  const own = m20Status(me);
  if (own.state === 'due' || own.state === 'overdue') lines.push(`Your bond in <strong>Form M-20</strong> (Rule 58A, MCS Rules 1961) ${own.state === 'due' ? `is due by <strong>${dmy(own.due)}</strong> (${own.left} day${own.left === 1 ? '' : 's'} left)` : `was due on <strong>${dmy(own.due)}</strong>`}: sign it on stamp paper and hand it to the Secretary.`);
  if (['Chairman', 'Secretary'].includes(me.role)) {
    const adm = await F.getDocs(F.collection(db, 'admins'));
    const pend = adm.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((x) => isCommitteeRecord(x) && x.active !== false && x.uid !== me.uid)
      .map((x) => ({ x, st: m20Status(x) })).filter(({ st }) => st.state === 'due' || st.state === 'overdue' || st.state === 'unknown');
    if (pend.length) lines.push(`M-20 bonds not yet received: ${pend.map(({ x, st }) => `${esc(x.name || x.email)} (${esc(x.role || 'Committee member')}${st.due ? `, due ${dmy(st.due)}` : ', date of taking office not recorded'})`).join('; ')}. <a href="#staff">Record them</a>.`);
    const reg = await F.getDoc(F.doc(db, 'settings', 'committeeRegister')).catch(() => null);
    const r = reg?.exists() ? reg.data() : {};
    if (r.formedOn && !r.informedOn) lines.push(`Inform the Registrar of the committee’s formation and the M-20 bonds by <strong>${dmy(cAddDays(r.formedOn, M20_DAYS))}</strong>. <a href="#staff">Record it</a>.`);
  }
  box.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
  box.hidden = !lines.length;
}

async function renderCommittee() {
  const { F, db } = fb;
  const [usr, und, reg] = await Promise.all([
    F.getDocs(F.query(F.collection(db, 'users'), F.where('status', '==', 'approved'))).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'committeeUndertakings')).catch(() => ({ docs: [] })),
    F.getDoc(F.doc(db, 'settings', 'committeeRegister')).catch(() => null)]);
  undertaking = await loadUndertaking();
  mcRegister = reg?.exists() ? reg.data() : {};
  const users = usr.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => !u.removed);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const committee = staffList.filter((x) => x.kind !== 'staff');   // including past members (inactive)
  const active = committee.filter((x) => x.active !== false).sort((a, b) => POST_ORDER(a.role) - POST_ORDER(b.role) || (a.name || '').localeCompare(b.name || ''));
  const past = committee.filter((x) => x.active === false);
  const accepted = und.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (tsDate(b.acceptedAt) || 0) - (tsDate(a.acceptedAt) || 0));
  const m20Cell = (x) => {
    const st = m20Status(x);
    if (st.state === 'submitted') return `<span class="m20-ok">Received ${dmy(st.on)}</span>${x.m20.stampValue ? `<span class="sub">Stamp paper ₹${esc(x.m20.stampValue)}${x.m20.stampNo ? `, no. ${esc(x.m20.stampNo)}` : ''}</span>` : ''}${x.m20.receivedByName ? `<span class="sub">Recorded by ${esc(x.m20.receivedByName)}</span>` : ''}${x.m20.file ? `<button class="btn btn-small" type="button" data-m20-open="${esc(x.uid)}">Open scan</button>` : ''}`;
    if (st.state === 'unknown') return '<span class="m20-due">Date of taking office not recorded</span>';
    return st.state === 'due' ? `<span class="m20-due">Due by ${dmy(st.due)}</span><span class="sub">${st.left} day${st.left === 1 ? '' : 's'} left</span>` : `<span class="m20-late">Overdue since ${dmy(st.due)}</span><span class="sub">${-st.left} days late</span>`;
  };
  const term = (x) => `${x.tookOfficeOn ? `From ${dmy(x.tookOfficeOn)}` : '<span class="muted">Start not recorded</span>'}${x.termEnds ? `<span class="sub">Term ends ${dmy(x.termEnds)}</span>` : ''}${x.termEndedOn ? `<span class="sub">Ended ${dmy(x.termEndedOn)}${x.endReason ? `: ${esc(x.endReason)}` : ''}</span>` : ''}`;
  const remind = (x) => {
    const st = m20Status(x), u = usersById.get(x.uid), mobile = x.mobile || u?.mobile || '', email = x.email || u?.email || '';
    const pendingUnd = x.undertakingVersion !== undertaking.version;
    if (!(st.state === 'due' || st.state === 'overdue') && !pendingUnd) return '';
    const first = String(x.name || '').replace(/^(mr|mrs|ms|dr|shri|smt)\.?\s+/i, '').split(' ')[0] || 'Sir / Madam';
    const parts = [];
    if (pendingUnd) parts.push(`please sign in to the Society accounts page (https://www.sunshreesuntec.com/admin.html) with ${email || 'your Gmail'} and accept the committee undertaking`);
    if (st.due) parts.push(`please sign the bond in Form M-20 on stamp paper and hand it to the Secretary by ${dmy(st.due)} (Rule 58A, MCS Rules 1961)`);
    const m = { subject: 'Sunshree Suntec: committee undertaking and M-20 bond', body: `Dear ${first},\n\nAs ${x.role || 'committee member'} of Sunshree Suntec CHS${x.tookOfficeOn ? ` from ${dmy(x.tookOfficeOn)}` : ''}, ${parts.join('; and ')}.\n\nRegards,\n${me?.name || ''}, ${me?.role || 'Managing Committee'}\nSunshree Suntec Co-op. Housing Society Ltd.` };
    return `${waNumber(mobile) ? `<a class="btn btn-small" href="${esc(waLink(mobile, m))}" target="_blank" rel="noopener">WhatsApp reminder</a>` : ''}${validEmail(email) ? `<a class="btn btn-small" href="${esc(mailLink(email, m))}">Email reminder</a>` : ''}`;
  };
  $('#mc-rows').innerHTML = active.map((x) => {
    const acc = x.undertakingVersion === undertaking.version ? `<span class="pill-ok">v${x.undertakingVersion} accepted</span><span class="sub">${esc(tsText(x.undertakingAt))}</span>`
      : `<span class="warn">${x.undertakingVersion ? `Accepted v${x.undertakingVersion}; v${undertaking.version} pending` : 'Not yet accepted'}</span>`;
    const copy = accepted.find((a) => a.id === x.undertakingId);
    return `<tr><td><strong>${esc(x.name || x.email || x.uid)}</strong>${x.unitLabel ? ` <span class="muted">${esc(x.unitLabel)}</span>` : ''}<span class="sub">${esc(x.email || '')}</span></td>
      <td>${esc(x.role || 'Committee member')}${APPROVER_ROLES.includes(x.role) ? '<span class="sub">Decides applications to view the accounts</span>' : ''}</td>
      <td>${term(x)}</td><td>${acc}${copy?.pdf ? `<button class="btn btn-small" type="button" data-und-open="${esc(copy.id)}">Copy</button>` : ''}</td><td>${m20Cell(x)}</td>
      <td><div class="mc-actions"><button class="btn btn-small" type="button" data-mc-edit="${esc(x.uid)}">Edit</button><button class="btn btn-small btn-primary" type="button" data-mc-m20="${esc(x.uid)}">M-20…</button>${remind(x)}</div></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No committee members yet.</td></tr>';
  $('#mc-past-count').textContent = past.length ? `(${past.length})` : '';
  $('#mc-past').innerHTML = past.map((x) => `<tr><td>${esc(x.name || x.email)}${x.unitLabel ? ` <span class="muted">${esc(x.unitLabel)}</span>` : ''}</td><td>${esc(x.role || '')}</td><td>${term(x)}</td><td>${m20Cell(x)}</td><td></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">None.</td></tr>';
  // Make a member a committee member: approved members who aren't on the committee or staff now.
  const taken = new Set(staffList.filter((x) => x.active !== false).map((x) => x.uid));
  mcApproved = users.filter((u) => !taken.has(u.id)).sort((a, b) => String(a.unit).localeCompare(String(b.unit), 'en', { numeric: true }));
  const f = $('#mc-form');
  f.uid.innerHTML = '<option value="">Choose…</option>' + mcApproved.map((u) => `<option value="${esc(u.id)}">${esc(memberUnitLabel(u.unit))} – ${esc(u.name)} (${esc(relationLabel(u.relation || 'owner'))})</option>`).join('');
  [f.post, $('#mc-edit').post].forEach((sel) => { sel.innerHTML = POSTS.map((p) => `<option>${esc(p)}</option>`).join(''); });
  if (!f.from.value) f.from.value = todayISO();
  // Registrar
  const rf = $('#mc-reg-form');
  rf.formedOn.value = mcRegister.formedOn || ''; rf.informedOn.value = mcRegister.informedOn || ''; rf.ref.value = mcRegister.ref || '';
  $('#mc-reg-status').innerHTML = !mcRegister.formedOn ? 'Enter the date the committee was formed: the Registrar is to be informed within 15 days.'
    : mcRegister.informedOn ? `Registrar informed on ${dmy(mcRegister.informedOn)}${mcRegister.ref ? `, letter ${esc(mcRegister.ref)}` : ''}.${mcRegister.letterFile ? ' <button class="btn btn-small" type="button" id="mc-reg-open">Open letter</button>' : ''}`
    : `To be informed by ${dmy(cAddDays(mcRegister.formedOn, M20_DAYS))}.`;
  // Undertaking text and acceptances
  const done = active.filter((x) => x.undertakingVersion === undertaking.version).length;
  $('#und-status').textContent = `Current undertaking: version ${undertaking.version}${undertaking.publishedAt ? `, published ${tsText(undertaking.publishedAt)}` : ' (standard text)'}. ${done} of ${active.length} committee members have accepted it.`;
  const ef = $('#und-edit');
  ef.title.value = undertaking.title || ''; ef.intro.value = undertaking.intro || ''; ef.common.value = (undertaking.common || []).join('\n'); ef.closing.value = undertaking.closing || '';
  $('#und-role-texts').innerHTML = POSTS.map((r) => `<label>Responsibilities of the ${esc(r)} (one per line)<textarea name="role_${esc(r)}" rows="5">${esc((undertaking.roles?.[r] || []).join('\n'))}</textarea></label>`).join('');
  $('#und-rows').innerHTML = accepted.map((a) => `<tr><td>${esc(tsText(a.acceptedAt))}</td><td>${esc(a.signedName)}</td><td>${esc(a.role)}</td><td>${esc(a.version)}</td>
    <td>${a.pdf ? `<button class="btn btn-small" type="button" data-und-open="${esc(a.id)}">PDF</button>${a.emailed ? '<span class="sub">Emailed</span>' : ''}` : a.emailNote ? `<span class="sub">Not saved: ${esc(a.emailNote)}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No acceptances yet.</td></tr>';
}

/** Keeps the website's Committee page in step (public/site.committee). */
async function siteCommitteeSet(fn) {
  const { F, db } = fb;
  const snap = await F.getDoc(F.doc(db, 'public', 'site'));
  const list = structuredClone(snap.exists() ? snap.data().committee || [] : []);
  const next = fn(list);
  await F.setDoc(F.doc(db, 'public', 'site'), { committee: next, updatedAt: F.serverTimestamp() }, { merge: true });
  if (site) site.committee = next;
}
/** Single posts: offer to move the present holder to Committee member. Returns false if the committee member cancels. */
function holderOf(post, exceptUid) {
  return SINGLE_POSTS.includes(post) ? staffList.find((x) => isCommitteeRecord(x) && x.active !== false && x.role === post && x.uid !== exceptUid) : null;
}
async function openDriveCopy(payload) {
  const w = window.open('', '_blank');
  try { const url = await driveFileUrl(fb, payload); if (w) w.location = url; else location.href = url; }
  catch (err) { if (w) w.close(); alert(errorText(err)); }
}
async function uploadCommitteeFile(file, sub, name, note) {
  await loadDriveCfg(fb);
  if (!driveReady()) throw new Error('Connect the Society’s Google Drive first (Expenses → Set-up).');
  const f = await prepareFile(file);
  if (!/^image\/|^application\/pdf$/.test(f.type)) throw new Error('Only PDF files and photos.');
  const ext = (f.name.match(/\.(\w+)$/)?.[1] || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
  const r = await driveCall(fb, 'upload', { kind: 'committee', sub, name: `${name.replace(/[\\/:*?"<>|#%]+/g, ' ').slice(0, 120)}.${ext}`, mimeType: f.type, data: await toBase64(f), note });
  return r.file;
}
function wireCommittee() {
  const { F, db } = fb;
  const msg = $('#mc-msg');
  const say = (t, ok = true) => { msg.className = ok ? 'form-msg ok' : 'form-msg'; msg.textContent = t; };
  $('#mc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, u = mcApproved.find((x) => x.id === f.uid.value), post = f.post.value, from = f.from.value, to = f.to.value;
    if (!u) return setMsg(f, 'Choose the member.');
    if (!from) return setMsg(f, 'Enter the date they took office.');
    if (to && to <= from) return setMsg(f, 'The term must end after it starts.');
    const prior = staffList.find((x) => x.uid === u.id);
    if (prior && prior.kind === 'staff') return setMsg(f, `${esc(u.name)} has a staff login; remove it in the Staff list first.`);
    const holder = holderOf(post, u.id);
    if (holder && !confirm(`${holder.name} is ${post} now. Make ${holder.name} a Committee member, and ${u.name} the ${post}?`)) return;
    await busy($('button[type=submit]', f), async () => {
      try {
        const unitLabel = memberUnitLabel(u.unit);
        const batch = F.writeBatch(db);
        if (holder) batch.update(F.doc(db, 'admins', holder.uid), { role: 'Committee member', postHistory: [...(holder.postHistory || []), { post: 'Committee member', from, by: me?.name || '', at: new Date().toISOString() }] });
        // A new term: a fresh undertaking and M-20 bond (an earlier term's record stays in the acceptance list and the Drive).
        batch.set(F.doc(db, 'admins', u.id), { name: u.name, email: u.email, mobile: u.mobile || '', role: post, unit: u.unit, unitLabel, active: true,
          tookOfficeOn: from, termEnds: to || '', termEndedOn: '', endReason: '', m20: null, undertakingVersion: null, undertakingId: '',
          postHistory: [...(prior?.postHistory || []), { post, from, by: me?.name || '', at: new Date().toISOString() }],
          addedBy: uid, addedByName: me?.name || '', createdAt: F.serverTimestamp() }, { merge: true });
        await batch.commit();
        if (f.site.checked) {
          await siteCommitteeSet((list) => {
            const out = list.filter((c) => (c.name || '').trim().toLowerCase() !== u.name.trim().toLowerCase());
            if (holder) out.forEach((c) => { if ((c.name || '').trim().toLowerCase() === (holder.name || '').trim().toLowerCase()) c.role = 'Committee member'; });
            const at = SINGLE_POSTS.includes(post) ? out.findIndex((c) => POST_ORDER(c.role) > POST_ORDER(post)) : -1;
            const row = { role: post, name: u.name, unit: unitLabel, phone: '' };
            if (at < 0) out.push(row); else out.splice(at, 0, row);
            return out;
          }).catch((err) => console.warn('website committee list', err));
        }
        f.reset(); setMsg(f, '');
        say(`${u.name} (${unitLabel}) is now ${post}. They sign in to this page with ${u.email}, accept the committee undertaking, and their M-20 bond is due by ${dmy(cAddDays(from, M20_DAYS))}.${holder ? ` ${holder.name} is now a Committee member.` : ''}`);
        await loadStaff();
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#mc-box').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mcEdit) {
      mcCurrent = staffList.find((x) => x.uid === b.dataset.mcEdit);
      const f = $('#mc-edit');
      f.post.value = mcCurrent.role && POSTS.includes(mcCurrent.role) ? mcCurrent.role : 'Committee member';
      f.from.value = mcCurrent.tookOfficeOn || ''; f.to.value = mcCurrent.termEnds || '';
      $('#mc-edit-title').textContent = `${mcCurrent.name || mcCurrent.email}${mcCurrent.unitLabel ? `, ${mcCurrent.unitLabel}` : ''}`;
      setMsg(f, ''); $('#mc-dialog').showModal();
    } else if (b.dataset.mcM20) {
      mcCurrent = staffList.find((x) => x.uid === b.dataset.mcM20);
      const f = $('#m20-form'); f.reset(); setMsg(f, '');
      f.on.value = mcCurrent.m20?.submittedOn || todayISO(); f.stamp.value = mcCurrent.m20?.stampValue || ''; f.stampNo.value = mcCurrent.m20?.stampNo || '';
      $('#m20-title').textContent = `M-20 bond: ${mcCurrent.name || mcCurrent.email} (${mcCurrent.role || 'Committee member'})`;
      $('#m20-dialog').showModal();
    } else if (b.dataset.m20Open) {
      const x = staffList.find((y) => y.uid === b.dataset.m20Open);
      openDriveCopy({ committeeUid: x.uid, fileId: x.m20.file.id });
    } else if (b.dataset.undOpen) {
      const snap = await F.getDoc(F.doc(db, 'committeeUndertakings', b.dataset.undOpen));
      if (snap.exists() && snap.data().pdf) openDriveCopy({ undertakingId: b.dataset.undOpen, fileId: snap.data().pdf.id });
    } else if (b.id === 'mc-reg-open') {
      openDriveCopy({ committeeRegister: true, fileId: mcRegister.letterFile.id });
    }
  });
  $$('#mc-dialog [data-close], #m20-dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#mc-edit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, x = mcCurrent, post = f.post.value;
    if (f.to.value && f.from.value && f.to.value <= f.from.value) return setMsg(f, 'The term must end after it starts.');
    const holder = post !== x.role ? holderOf(post, x.uid) : null;
    if (holder && !confirm(`${holder.name} is ${post} now. Make ${holder.name} a Committee member?`)) return;
    await busy($('button[type=submit]', f), async () => {
      try {
        const batch = F.writeBatch(db), today = todayISO();
        if (holder) batch.update(F.doc(db, 'admins', holder.uid), { role: 'Committee member', postHistory: [...(holder.postHistory || []), { post: 'Committee member', from: today, by: me?.name || '', at: new Date().toISOString() }] });
        const patch = { role: post, tookOfficeOn: f.from.value || '', termEnds: f.to.value || '' };
        if (post !== x.role) patch.postHistory = [...(x.postHistory || []), { post, from: today, by: me?.name || '', at: new Date().toISOString() }];
        batch.update(F.doc(db, 'admins', x.uid), patch);
        await batch.commit();
        if (post !== x.role) siteCommitteeSet((list) => list.map((c) => {
          const n = (c.name || '').trim().toLowerCase();
          if (n === (x.name || '').trim().toLowerCase()) return { ...c, role: post };
          if (holder && n === (holder.name || '').trim().toLowerCase()) return { ...c, role: 'Committee member' };
          return c;
        })).catch(() => {});
        $('#mc-dialog').close();
        say(`${x.name}: saved.${holder ? ` ${holder.name} is now a Committee member.` : ''}`);
        await loadStaff();
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#mc-end').addEventListener('click', async () => {
    const x = mcCurrent, f = $('#mc-edit');
    if (x.uid === uid) return setMsg(f, 'Ask another committee member to end your term.');
    const reason = prompt(`End ${x.name}'s term as ${x.role || 'committee member'}? They lose committee access at once. Reason (e.g. term over, resigned, disqualified):`);
    if (reason === null) return;
    const when = prompt('Term ended on (DD/MM/YYYY):', dmy(todayISO()));
    const m = String(when || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return setMsg(f, 'Write the date as DD/MM/YYYY.');
    try {
      await F.updateDoc(F.doc(db, 'admins', x.uid), { active: false, termEndedOn: `${m[3]}-${m[2]}-${m[1]}`, endReason: reason.trim().slice(0, 200), endedBy: uid, endedByName: me?.name || '' });
      if (confirm(`Also remove ${x.name} from the website's Committee page?`)) await siteCommitteeSet((list) => list.filter((c) => (c.name || '').trim().toLowerCase() !== (x.name || '').trim().toLowerCase())).catch(() => {});
      $('#mc-dialog').close();
      say(`${x.name}'s term ended on ${when}. Their records, undertaking and M-20 bond stay under Past committee members. Collect the records, keys and cheque books they hold.`);
      await loadStaff();
    } catch (err) { setMsg(f, esc(errorText(err))); }
  });
  $('#m20-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, x = mcCurrent, file = f.file.files[0];
    if (!f.on.value) return setMsg(f, 'Enter the date the bond was received.');
    if (x.tookOfficeOn && f.on.value < x.tookOfficeOn) return setMsg(f, 'The bond can’t be received before taking office.');
    if (!file && !x.m20?.file && !confirm('Save without a scan of the signed bond? You can add the scan later.')) return;
    await busy($('button[type=submit]', f), async () => {
      try {
        const saved = file ? await uploadCommitteeFile(file, 'm20', `${x.name} - ${x.role || 'Committee member'} - M-20 bond - ${f.on.value}`, `Form M-20 bond of ${x.name}, ${x.role}, received ${dmy(f.on.value)}`) : x.m20?.file || null;
        await F.updateDoc(F.doc(db, 'admins', x.uid), { m20: { submittedOn: f.on.value, stampValue: f.stamp.value ? Number(f.stamp.value) : null, stampNo: f.stampNo.value.trim(), file: saved,
          receivedBy: uid, receivedByName: me?.name || '', recordedAt: F.serverTimestamp() } });
        $('#m20-dialog').close();
        say(`M-20 bond of ${x.name} recorded (received ${dmy(f.on.value)}).`);
        await loadStaff();
        refreshCommitteeNotice().catch(() => {});
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#mc-reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, file = f.file.files[0];
    if (f.informedOn.value && f.formedOn.value && f.informedOn.value < f.formedOn.value) return setMsg(f, 'The Registrar can’t be informed before the committee was formed.');
    await busy($('button[type=submit]', f), async () => {
      try {
        const letterFile = file ? await uploadCommitteeFile(file, 'registrar', `Registrar intimation - committee formed ${f.formedOn.value || ''} - ${f.ref.value || ''}`, 'Letter informing the Registrar of the committee and the M-20 bonds') : mcRegister.letterFile || null;
        await F.setDoc(F.doc(db, 'settings', 'committeeRegister'), { formedOn: f.formedOn.value, informedOn: f.informedOn.value, ref: f.ref.value.trim(), letterFile, updatedBy: uid, updatedAt: F.serverTimestamp() });
        setMsg(f, 'Saved.', true); f.file.value = '';
        await loadStaff();
        refreshCommitteeNotice().catch(() => {});
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#und-edit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, lines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);
    const next = { title: f.title.value.trim(), intro: f.intro.value.trim(), common: lines(f.common.value), closing: f.closing.value.trim(),
      roles: Object.fromEntries(POSTS.map((r) => [r, lines(f[`role_${r}`].value)])), version: (undertaking.version || 1) + 1, publishedAt: F.serverTimestamp(), publishedBy: uid };
    if (next.title.length < 5 || next.common.length < 3) return setMsg(f, 'Write the title and at least three undertakings.');
    if (!confirm(`Publish version ${next.version}? Every committee member must accept it at their next sign-in.`)) return;
    await busy($('button[type=submit]', f), async () => {
      try { await F.setDoc(F.doc(db, 'settings', 'committeeUndertaking'), next); setMsg(f, `Version ${next.version} published.`, true); await loadStaff(); }
      catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
}

/* ----- 3.18: what a member sees beyond their own unit; applications to view the Society's accounts ----- */
const VIEW_WHAT = { accounts: 'Society’s audited accounts and documents', allDues: 'Maintenance amounts of all units' };
const isoIST = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
function accountsValid(p) { const u = tsDate(p.accountsUntil); return p.societyAccounts === true && (!u || u > new Date()); }
function viewExtras(p) {
  const out = [];
  if (p.seeAllDues === true) out.push('+ all units’ amounts');
  if (p.societyAccounts === true) out.push(accountsValid(p) ? `+ Society accounts${tsDate(p.accountsUntil) ? ` till ${whenShort(p.accountsUntil)}` : ''}` : `Society accounts ended ${whenShort(p.accountsUntil)}`);
  return out.map((t) => `<span class="view-extra">${esc(t)}</span>`).join('');
}

let accessApps = [], arCurrent = null;
async function loadAccessApps() {
  const { F, db } = fb;
  const snap = await F.getDocs(F.collection(db, 'accessRequests')).catch(() => ({ docs: [] }));
  accessApps = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (tsDate(b.at) || 0) - (tsDate(a.at) || 0));
  const pend = accessApps.filter((a) => a.status === 'pending').reverse(), done = accessApps.filter((a) => a.status !== 'pending');
  $('#ar-count').textContent = pend.length ? `(${pend.length} waiting)` : '';
  $('#ar-who').textContent = isApprover() ? `You can decide these applications as ${me.role}.` : 'Only the Chairman, Secretary, Treasurer or Accountant can decide these applications.';
  const what = (a) => esc((a.what || []).map((w) => VIEW_WHAT[w] || w).join('; '));
  const who = (a) => `<strong>${esc(a.name)}</strong> <span class="muted">${esc(memberUnitLabel(a.unit))}</span>${a.relation ? `<br><span class="muted">${esc(relationLabel(a.relation))}</span>` : ''}<br><a href="mailto:${esc(a.email)}">${esc(a.email)}</a>${a.mobile ? ` · <a href="tel:+91${esc(a.mobile)}">+91 ${esc(a.mobile)}</a>` : ''}`;
  const mail = (a) => a.mailed === true ? '<span class="ar-mail">Emailed to the Society</span>' : a.mailNote ? `<span class="ar-mail">Not emailed: ${esc(a.mailNote)}</span>` : '';
  $('#ar-rows').innerHTML = pend.map((a) => `<tr><td>${whenShort(a.at)}${mail(a)}</td><td>${who(a)}</td><td>${what(a)}</td><td>${esc(a.purpose)}</td>
      <td>${isApprover() ? `<button class="btn btn-small btn-primary" type="button" data-ar="${esc(a.id)}">Decide</button>` : '<span class="muted">Waiting</span>'}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No applications waiting.</td></tr>';
  $('#ar-done-count').textContent = done.length ? `(${done.length})` : '';
  $('#ar-done').innerHTML = done.map((a) => `<tr><td>${whenShort(a.at)}</td><td>${who(a)}</td><td>${what(a)}<br><small class="muted">${esc(a.purpose)}</small></td>
      <td>${a.status === 'approved' ? `<span class="ag-ok">Approved</span>${a.granted && a.granted.length < (a.what || []).length ? `<span class="sub">Given: ${esc(a.granted.map((w) => VIEW_WHAT[w]).join('; '))}</span>` : ''}${a.until ? `<span class="sub">Until ${whenShort(a.until)}</span>` : ''}`
        : a.status === 'rejected' ? '<span class="ag-no">Not approved</span>' : '<span class="muted">Withdrawn by the member</span>'}
        ${a.decidedByName ? `<span class="sub">${esc(a.decidedByName)}${a.decidedRole ? `, ${esc(a.decidedRole)}` : ''}, ${whenShort(a.decidedAt)}</span>` : ''}${a.reason ? `<span class="sub">${esc(a.reason)}</span>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">None yet.</td></tr>';
}
function openAccessApp(id) {
  const a = accessApps.find((x) => x.id === id);
  if (!a || !isApprover()) return;
  arCurrent = a;
  const f = $('#ar-form');
  f.reset(); setMsg(f, '');
  $('#ar-dialog-title').textContent = `${a.name}, ${memberUnitLabel(a.unit)}`;
  $('#ar-dialog-sub').textContent = `Applied ${whenLong(a.at)} · ${a.email}${a.mobile ? ` · +91 ${a.mobile}` : ''}${a.relation ? ` · ${relationLabel(a.relation)}` : ''}`;
  $('#ar-dialog-purpose').textContent = `Purpose: ${a.purpose}`;
  $$('[name=grant]', f).forEach((c) => { c.checked = (a.what || []).includes(c.value); });
  $('#ar-date-wrap').hidden = true;
  $('#ar-dialog').showModal();
}
function untilFromForm(f) {
  const v = f.until.value, now = new Date();
  if (!v) return null;
  let d;
  if (v === 'fy') { const y = Number(isoIST(now).slice(0, 4)), m = Number(isoIST(now).slice(5, 7)); d = `${m >= 4 ? y + 1 : y}-03-31`; }
  else if (v === 'date') d = f.date.value;
  else d = isoIST(new Date(now.getTime() + Number(v) * 864e5));
  return d ? fb.F.Timestamp.fromDate(new Date(`${d}T23:59:59+05:30`)) : undefined;
}
async function decideAccessApp(approve, btn) {
  const f = $('#ar-form'), a = arCurrent, { F, db } = fb;
  if (!a) return;
  const granted = $$('[name=grant]:checked', f).map((c) => c.value), reason = f.reason.value.trim();
  if (approve && !granted.length) return setMsg(f, 'Tick what to give, or press Not approve.');
  if (!approve && reason.length < 5) return setMsg(f, 'Write the reason; the member sees it.');
  const until = approve && granted.includes('accounts') ? untilFromForm(f) : null;
  if (until === undefined) return setMsg(f, 'Choose the date.');
  await busy(btn, async () => {
    try {
      const batch = F.writeBatch(db);
      batch.update(F.doc(db, 'accessRequests', a.id), { status: approve ? 'approved' : 'rejected', granted: approve ? granted : [], until: until || null, reason,
        decidedBy: uid, decidedByName: me?.name || '', decidedRole: me?.role || '', decidedAt: F.serverTimestamp() });
      if (approve) {
        const u = await F.getDoc(F.doc(db, 'users', a.uid));
        const cur = u.exists() ? u.data() : {};
        batch.update(F.doc(db, 'users', a.uid), { seeAllDues: granted.includes('allDues') || cur.seeAllDues === true,
          societyAccounts: granted.includes('accounts') || cur.societyAccounts === true,
          accountsUntil: granted.includes('accounts') ? until || null : cur.accountsUntil ?? null,
          accessBy: uid, accessByName: me?.name || '', accessAt: F.serverTimestamp() });
      }
      await batch.commit();
      $('#ar-dialog').close();
      const msg = $('#ar-msg');
      msg.className = 'form-msg ok';
      msg.textContent = `${approve ? 'Approved' : 'Not approved'}: ${a.name}, ${memberUnitLabel(a.unit)}.`;
      // Email the member the decision (Drive script version 7).
      try {
        await loadDriveCfg(fb);
        if (driveReady()) { const r = await driveCall(fb, 'accessDecision', { requestId: a.id }); msg.textContent += ` Emailed to ${r.to}, with a copy to ${r.cc}.`; }
        else msg.textContent += ' Not emailed: the Society’s Google Drive isn’t connected; please tell the member.';
      } catch (err) { msg.className = 'form-msg'; msg.textContent += ` Not emailed (${errorText(err)}); please tell the member.`; }
      await loadMembers();
    } catch (err) { setMsg(f, esc(errorText(err))); }
  });
}
function wireAccessApps() {
  $('#ar-box').addEventListener('click', (e) => { const b = e.target.closest('[data-ar]'); if (b) openAccessApp(b.dataset.ar); });
  $('#ar-form [name=until]').addEventListener('change', (e) => { $('#ar-date-wrap').hidden = e.target.value !== 'date'; });
  $('#ar-approve').addEventListener('click', (e) => decideAccessApp(true, e.currentTarget));
  $('#ar-reject').addEventListener('click', (e) => decideAccessApp(false, e.currentTarget));
  $('#ar-dialog [data-close]').addEventListener('click', () => $('#ar-dialog').close());
}

/**
 * Each unit's own audited year-end figures (units/{id}/history/audited), from the audit files, so a member who may
 * not see the whole audit file (every unit's dues) still sees their own history. Committee only; redone when the
 * audited years change.
 */
async function ensureAuditHistory(force = false) {
  if (!canDo('committee')) return 0;
  const { F, db } = fb;
  const audits = auditCache.length ? auditCache : (auditCache = await loadAuditYears(fb).catch(() => []));
  if (!audits.length) return 0;
  const sig = audits.map((a) => `${a.fy}:${(a.dues || []).length}:${a.duesComplete ? 1 : 0}`).join(',');
  const st = await F.getDoc(F.doc(db, 'settings', 'auditHistory')).catch(() => null);
  if (!force && st?.exists() && st.data().sig === sig) return 0;
  const list = units.length ? units : dues.units;
  let n = 0, batch = F.writeBatch(db);
  for (const u of list) {
    const years = audits.map((a) => {
      const r = (a.dues || []).find((d) => d.unitId === u.id);
      return { fy: a.fy, to: a.to, listed: Boolean(r), name: r?.name || '', amount: r ? r.amount : null, complete: Boolean(a.duesComplete) };
    });
    batch.set(F.doc(db, 'units', u.id, 'history', 'audited'), { years, updatedAt: F.serverTimestamp() });
    if (++n % 400 === 0) { await batch.commit(); batch = F.writeBatch(db); }
  }
  batch.set(F.doc(db, 'settings', 'auditHistory'), { sig, units: n, updatedAt: F.serverTimestamp(), by: uid });
  await batch.commit();
  return n;
}

/* ----- residents directory (watchman, housekeeping, manager) ----- */

let directoryPeople = null;
async function loadDirectory() {
  const { F, db } = fb;
  if (!directoryPeople) {
    const snap = await F.getDocs(F.query(F.collection(db, 'users'), F.where('status', '==', 'approved')));
    directoryPeople = snap.docs.map((d) => d.data());
    $('#dir-search').addEventListener('input', renderDirectory);
  }
  renderDirectory();
}
function renderDirectory() {
  const q = $('#dir-search').value.trim().toLowerCase();
  const list = (units.length ? units : dues.units).map((u) => ({ id: u.id, unit: u.unit, name: u.name || '', people: directoryPeople.filter((p) => p.unit === u.id) }));
  const hit = (x) => !q || [x.unit, x.name, ...x.people.flatMap((p) => [p.name, p.mobile])].some((v) => String(v || '').toLowerCase().includes(q));
  $('#dir-rows').innerHTML = list.filter(hit).map((x) => `<tr><td class="unit">${esc(x.unit)}</td><td>${esc(x.name)}</td>
    <td>${x.people.length ? `<ul>${x.people.map((p) => `<li>${esc(p.name)} <span class="rel-pill">${esc(relationLabel(p.relation))}</span>${p.mobile ? ` <a href="tel:+91${esc(p.mobile)}">+91 ${esc(p.mobile)}</a>` : ''}</li>`).join('')}</ul>` : '<span class="muted">—</span>'}</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">No match.</td></tr>';
}

/* ----- sign-in history ----- */

const METHOD_TEXT = { google: 'Google', password: 'Email + password', register: 'Registration', reset: 'Password reset' };
const RESULT_PILL = { ok: '<span class="status-pill ok">Signed in</span>', cancelled: '<span class="status-pill closed">Closed</span>', failed: '<span class="status-pill failed">Failed</span>' };
const RESULT_WORD = { ok: 'Signed in', cancelled: 'Closed', failed: 'Failed' };
// Plain-language explanation of common failure codes, with what the committee can do.
const PROBLEM_HELP = {
  'closed-at-once': 'Google closed its account chooser straight away in the app. Google doesn’t accept this app copy yet: add the app’s SHA-1 fingerprint (shown below) in Firebase console → Project settings → Your apps → Android app → Add fingerprint. It works a few minutes later, without rebuilding the app.',
  'no-client-id': 'The app was built without the Web client ID. Add WEB_CLIENT_ID in app-config.properties (build menu option 7) and build again.',
  'no-account': 'The phone has no Google account. The member can add one in the phone’s Settings → Accounts, or use email and password.',
  'auth/invalid-credential': 'Wrong email or password (or an expired Google answer). If it repeats for one person, they can use “Forgot password?”.',
  'auth/operation-not-allowed': 'Google sign-in is switched off in Firebase console → Authentication → Sign-in method.',
  'auth/unauthorized-domain': 'This web address isn’t in Firebase console → Authentication → Settings → Authorised domains.',
  'auth/network-request-failed': 'The phone or computer had no working internet connection.',
  'auth/too-many-requests': 'Too many tries from one device; Firebase blocks it for a few minutes.',
  'auth/popup-blocked': 'The browser blocked Google’s window.'
};

async function loadSigninLog() {
  const { F, db } = fb;
  try {
    const snap = await F.getDocs(F.query(F.collection(db, 'signInLog'), F.orderBy('at', 'desc'), F.limit(1000)));
    signinLog = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (tsDate(b.at) || 0) - (tsDate(a.at) || 0));
    $('#si-foot').textContent = signinLog.length >= 1000 ? 'Showing the latest 1,000 attempts.' : '';
  } catch (err) {
    signinLog = [];
    $('#si-foot').textContent = `The sign-in history couldn’t be loaded: ${errorText(err)}`;
  }
  renderSigninLog();
  renderStrays();
}

/** What the person typed in the registration form, if anything (3.17). */
function whoTyped(e) {
  if (!e.name && !e.mobile) return '';
  const unit = e.unit ? (String(e.unit).startsWith('Staff') ? e.unit : memberUnitLabel(e.unit)) : '';
  return [e.name, unit, e.mobile ? `+91 ${e.mobile}` : ''].filter(Boolean).join(' · ');
}

/**
 * People in the sign-in history with no request, member record or staff login: they pressed Sign in before registering,
 * or (3.17) filled in the registration form and then closed Google sign-in or it failed. Grouped by mobile when the
 * form was filled in, otherwise by email.
 */
function renderStrays() {
  const by = new Map();
  signinLog.forEach((e) => {
    const email = String(e.email || '').toLowerCase(), mob = tenDigits(e.mobile);
    if (!email && !mob) return;
    if ((email && knownEmails.has(email)) || (mob && knownMobiles.has(mob)) || (e.uid && knownUids.has(e.uid))) return;
    const key = mob ? `m:${mob}` : email;
    if (!by.has(key)) by.set(key, { key, email: '', mobile: mob, name: '', unit: '', tries: 0, last: null, events: [] });
    const x = by.get(key);
    x.tries++; x.events.push(e);
    if (email && !x.email) x.email = email;
    if (e.name && !x.name) { x.name = e.name; x.unit = e.unit || ''; }
    if (!x.last || (tsDate(e.at) || 0) > (tsDate(x.last.at) || 0)) x.last = e;
  });
  const formFilled = (x) => x.events.some((e) => e.name || e.mobile);
  const what = (x) => {
    const has = (m, r) => x.events.some((e) => e.method === m && (!r || e.result === r));
    if (formFilled(x) && has('google', 'cancelled') && !has('google', 'ok')) return 'Filled in the registration form, then closed Google sign-in before choosing a Gmail';
    if (formFilled(x) && has('google', 'failed') && !has('google', 'ok')) return `Filled in the registration form; Google sign-in failed (${x.events.find((e) => e.method === 'google' && e.result === 'failed').code || 'error'})`;
    if (has('google', 'ok')) return 'Signed in with Google but didn’t fill in the registration';
    if (has('password', 'failed')) return `Tried email and password without registering${has('reset') ? ', then asked for a password reset' : ''}`;
    if (has('register', 'failed')) return 'Registration failed';
    if (has('reset')) return 'Asked for a password reset without registering';
    return 'Tried to sign in';
  };
  const link = SITE_LINK;
  strayRows = [...by.values()].sort((a, b) => (tsDate(b.last.at) || 0) - (tsDate(a.last.at) || 0));
  $('#stray-rows').innerHTML = strayRows.map((x, i) => {
    const first = String(x.name || '').replace(/^(mr|mrs|ms|dr|shri|smt)\.?\s+/i, '').split(' ')[0];
    const unit = x.unit && !String(x.unit).startsWith('Staff') ? memberUnitLabel(x.unit) : '';
    const closed = formFilled(x) && !x.events.some((e) => e.method === 'google' && e.result === 'ok');
    const body = closed
      ? `Dear ${first || 'member'},\n\nYou started registering${unit ? ` for ${unit}` : ''} on the Sunshree Suntec website, but Google sign-in didn’t finish, so your request didn’t reach the committee.\n\nTo finish:\n1. Open ${link} in Chrome.\n2. Choose “New here? Register” and fill in your name, unit and mobile number.\n3. Press “Continue with Google and send request”, choose your Gmail in the Google window and wait until it says “Signed in”. Please don’t close the Google window or press Back.\n\nIf it still doesn’t work, reply to this message and we’ll help.\n\nRegards,\n${me?.name || 'Managing Committee'}\nSunshree Suntec Co-op. Housing Society Ltd.`
      : `Dear ${first || 'member'},\n\nWe noticed you tried to sign in to the Sunshree Suntec website. To get access, please register first:\n\n1. Open ${link}\n2. Choose “New here? Register”.\n3. Choose who you are (member of a unit, or Society staff), fill in your name, unit and mobile number.\n4. Press “Continue with Google and send request” and choose your Gmail${x.email ? ` (${x.email})` : ''}.\n\nThe committee will check and approve your request. After that, open the same page, choose “Sign in” and use the same Gmail.\n\nRegards,\n${me?.name || 'Managing Committee'}\nSunshree Suntec Co-op. Housing Society Ltd.`;
    const subject = closed ? 'Sunshree Suntec website: finishing your registration' : 'Sunshree Suntec website: how to register';
    const m = { subject, body };
    const log = rmLog.filter((r) => r.kind === 'unfinished' && r.key === `try:${x.key}`), last = log[0];
    const whoCell = `${x.name ? `<strong>${esc(x.name)}</strong>${unit ? ` <span class="muted">${esc(unit)}</span>` : x.unit ? ` <span class="muted">${esc(x.unit)}</span>` : ''}<br>` : ''}${x.mobile ? `+91 ${esc(x.mobile)}<br>` : ''}${x.email ? esc(x.email) : '<span class="muted">Gmail not known</span>'}`;
    return `<tr><td>${whoCell}</td><td class="num">${x.tries}</td><td>${whenLong(x.last.at)}<br><span class="muted">${esc(x.last.where === 'app' ? 'App' : 'Website')} · ${esc(x.last.device || '')}</span></td>
      <td>${esc(what(x))}${last ? `<span class="sub">Followed up: ${esc(RM_CHANNEL[last.channel] || last.channel)}, ${whenShort(last.at)}${last.byName ? `, ${esc(last.byName)}` : ''}</span>` : ''}</td>
      <td><div class="rm-send-cell">${x.mobile && waNumber(x.mobile) ? `<a class="btn btn-small btn-primary" href="${esc(waLink(x.mobile, m))}" target="_blank" rel="noopener" data-try-go="whatsapp" data-i="${i}">WhatsApp the steps</a>
        <a class="btn btn-small" href="tel:+91${esc(x.mobile)}" data-try-go="call" data-i="${i}">Call</a>` : ''}
        ${x.email ? `<a class="btn btn-small${x.mobile ? '' : ' btn-primary'}" href="${esc(mailLink(x.email, m))}" data-try-go="email" data-i="${i}">Email the steps</a>` : ''}</div></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">Nobody: everyone who tried has a request or a login.</td></tr>';
}
let strayRows = [];

function filteredSignins() {
  const days = Number($('#si-days').value), res = $('#si-result').value, how = $('#si-method').value, where = $('#si-where').value;
  const from = days ? Date.now() - days * 86400000 : 0;
  return signinLog.filter((e) => (!from || (tsDate(e.at) || new Date()) >= from)
    && (!res || e.result === res) && (!how || e.method === how) && (!where || e.where === where));
}

function renderSigninLog() {
  const list = filteredSignins();
  const people = new Set(list.map((e) => e.email || e.mobile || e.device || e.id));
  const n = (r) => list.filter((e) => e.result === r).length;
  const failedPeople = new Set(list.filter((e) => e.result !== 'ok').map((e) => e.email || e.mobile || e.device));
  const okPeople = new Set(list.filter((e) => e.result === 'ok').map((e) => e.email));
  const stuck = [...failedPeople].filter((p) => p && !okPeople.has(p)).length;
  $('#si-summary').innerHTML = `<span><b>${list.length}</b> attempts</span><span><b>${people.size}</b> people or devices</span>
    <span><b>${n('ok')}</b> signed in</span><span><b>${n('failed')}</b> failed</span><span><b>${n('cancelled')}</b> closed</span>
    <span title="Had a failed or closed attempt and no successful one in this period"><b>${stuck}</b> still not in</span>`;

  // Problems: failure codes in this period, most frequent first, with what to do.
  const byCode = {};
  list.filter((e) => e.result === 'failed').forEach((e) => {
    const c = e.code || 'unknown';
    (byCode[c] ??= { count: 0, people: new Set(), sample: e }).count++;
    byCode[c].people.add(e.email || e.device);
  });
  $('#si-problems').innerHTML = Object.entries(byCode).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([code, x]) => {
    const sha = /SHA-1 ([0-9A-F:]{59})/.exec(x.sample.detail || '')?.[1];
    return `<div class="si-problem"><p><strong>${esc(code)}</strong>: ${x.count} time${x.count === 1 ? '' : 's'}, ${x.people.size} ${x.people.size === 1 ? 'person or device' : 'people or devices'}</p>
      ${PROBLEM_HELP[code] ? `<p>${esc(PROBLEM_HELP[code])}</p>` : ''}
      ${sha ? `<p>App SHA-1 to add: <code>${esc(sha)}</code> (app ${esc(x.sample.appVersion || '?')})</p>` : ''}</div>`;
  }).join('');

  const del = canDo('committee');
  $('.si-check').hidden = !del; $('#si-delete-bar').hidden = !del;
  $('#signin-rows').innerHTML = list.map((e) => `<tr>${del ? `<td class="si-check"><input type="checkbox" data-si="${esc(e.id)}" aria-label="Select"></td>` : ''}
      <td class="si-when">${whenLong(e.at) || 'just now'}</td>
      <td>${e.email ? esc(e.email) : whoTyped(e) ? '' : '<span class="muted">—</span>'}${whoTyped(e) ? `<span class="sub si-who" title="Typed in the registration form">${e.email ? '' : 'Form: '}${esc(whoTyped(e))}</span>` : ''}</td>
      <td>${esc(METHOD_TEXT[e.method] || e.method)}${e.page === 'admin' ? ' <span class="status-pill">Committee page</span>' : ''}</td>
      <td>${e.where === 'app' ? `App${e.appVersion ? ' ' + esc(e.appVersion) : ''}` : 'Website'}</td>
      <td>${RESULT_PILL[e.result] || esc(e.result)}</td>
      <td class="si-detail">${[e.code, e.detail, e.device, e.ms ? `${(e.ms / 1000).toFixed(1)} s` : ''].filter(Boolean).map(esc).join(' · ')}</td></tr>`).join('')
    || `<tr><td colspan="${del ? 7 : 6}" class="empty">No sign-in attempts in this period.</td></tr>`;
  if (del) { $('#si-all').checked = false; $('#si-delete').disabled = true; $('#si-delete').textContent = 'Delete selected'; }
}

function wireMembers() {
  const handler = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const m = memberDocs.find((x) => x.id === btn.dataset.uid);
    if (!m) return;
    const act = btn.dataset.act;
    if (act === 'edit') return openMemberDialog(m, 'edit');
    if (act === 'reject') return openMemberDialog(m, 'reject');
    if (act === 'remove') return openMemberDialog(m, 'remove');
    if (act === 'resend') {
      const msg = $('#ma-send-msg');
      return resendAgreement(m.agreementId, btn, msg, async () => { const t = msg.textContent, c = msg.className; await loadMembers(); msg.textContent = t; msg.className = c; });
    }
    if (act === 'restore' && !confirm(`Move ${m.name}'s request back to Requests waiting?`)) return;
    await busy(btn, async () => {
      try {
        if (act === 'approve') await decideMember(m, { status: 'approved', removed: false, access: m.access || defaultAccess(m.relation) }, 'approved');
        if (act === 'restore') await decideMember(m, { status: 'pending', removed: false }, 'restored');
        await loadMembers();
        const fresh = memberDocs.find((x) => x.id === m.id);
        showNotify(fresh || m, act === 'approve' ? 'approved' : 'restored');
      } catch (err) { alert(errorText(err)); }
    });
  };
  ['#pending-rows', '#approved-rows', '#rejected-rows'].forEach((id) => $(id).addEventListener('click', handler));

  $('#member-notice').addEventListener('click', (e) => {
    if (e.target.closest('#notice-close')) { $('#member-notice').hidden = true; return; }
    const a = e.target.closest('[data-notify]');
    const m = a && memberDocs.find((x) => x.id === a.dataset.uid);
    if (m) logNotified(m, a.dataset.notify, $('#member-notice').dataset.action);
  });
  const form = $('#member-form');
  form.addEventListener('submit', (e) => { e.preventDefault(); saveMemberDialog(); });
  $('#member-delete').addEventListener('click', async (e) => {
    const m = dialogMember;
    if (!m || !confirm(`Delete ${m.name} (${memberUnitLabel(m.unit)}) and all its history permanently?\n\nUse this only for test or mistaken records. It can't be undone.`)) return;
    await busy(e.currentTarget, async () => {
      try { await deleteMemberForever(m); $('#member-dialog').close(); $('#member-notice').hidden = true; await loadMembers(); }
      catch (err) { setMsg(form, esc(errorText(err))); }
    });
  });
  $('[data-close]', form).addEventListener('click', () => $('#member-dialog').close());

  $('#rejected-csv').addEventListener('click', () => {
    const rows = memberDocs.filter((m) => m.status === 'rejected').map((m) => [memberUnitLabel(m.unit), m.name, relationLabel(m.relation), m.mobile, m.email,
      m.provider === 'google' ? 'Google' : 'Email + password', whenLong(m.createdAt), m.removed ? 'Access removed' : 'Rejected',
      whenLong(m.decidedAt), m.decidedByEmail || '', m.reason || '']);
    saveCsv([['Unit', 'Name', 'Relation', 'Mobile', 'Email', 'Signs in with', 'Requested', 'Decision', 'Decided on', 'Decided by', 'Reason'], ...rows], 'rejected-and-removed-members.csv');
  });
  ['#si-days', '#si-result', '#si-method', '#si-where'].forEach((id) => $(id).addEventListener('change', renderSigninLog));
  // Committee: tick entries (e.g. tests) and delete them.
  const siCount = () => { const n = $$('#signin-rows input[data-si]:checked').length; $('#si-delete').disabled = !n; $('#si-delete').textContent = n ? `Delete selected (${n})` : 'Delete selected'; };
  $('#signin-rows').addEventListener('change', siCount);
  $('#si-all').addEventListener('change', (e) => { $$('#signin-rows input[data-si]').forEach((c) => (c.checked = e.currentTarget.checked)); siCount(); });
  $('#si-delete').addEventListener('click', async (e) => {
    const ids = $$('#signin-rows input[data-si]:checked').map((c) => c.dataset.si);
    if (!ids.length || !confirm(`Delete ${ids.length} sign-in ${ids.length === 1 ? 'entry' : 'entries'} permanently? This can't be undone.`)) return;
    await busy(e.currentTarget, async () => {
      try {
        for (let i = 0; i < ids.length; i += 400) {
          const batch = fb.F.writeBatch(fb.db);
          ids.slice(i, i + 400).forEach((id) => batch.delete(fb.F.doc(fb.db, 'signInLog', id)));
          await batch.commit();
        }
        $('#si-all').checked = false;
        await loadSigninLog();
      } catch (err) { alert(errorText(err)); }
    });
  });
  $('#signin-csv').addEventListener('click', () => {
    const rows = filteredSignins().map((e) => [whenLong(e.at), e.email, METHOD_TEXT[e.method] || e.method, e.page === 'admin' ? 'Committee page' : 'Member page',
      e.where === 'app' ? 'App' : 'Website', e.appVersion, RESULT_WORD[e.result] || e.result, e.code, e.detail, e.device, e.ms ? (e.ms / 1000).toFixed(1) : '']);
    saveCsv([['When', 'Email', 'How', 'Page', 'Where', 'App version', 'Result', 'Code', 'Details', 'Phone or browser', 'Seconds'], ...rows], `sign-in-history-${todayIST()}.csv`);
  });
}

/* ---------------- website ---------------- */

async function saveSite(patch) {
  await fb.F.setDoc(fb.F.doc(fb.db, 'public', 'site'), { ...patch, updatedAt: fb.F.serverTimestamp() }, { merge: true });
  site = await loadSite(fb);
}

function renderNoticeAdmin() {
  const list = [...(site.notices || [])].sort((a, b) => b.date.localeCompare(a.date));
  $('#notice-admin-list').innerHTML = list.map((n) => `<div class="notice-admin">
    <div><p><strong>${esc(n.title)}</strong></p><p class="muted">${fmtDate(n.date)}: ${esc(n.summary)}</p></div>
    <button class="btn btn-small btn-danger" type="button" data-del-notice="${esc(n.id)}">Remove</button></div>`).join('')
    || '<p class="muted">No notices published yet.</p>';
}

async function loadWebsite() {
  renderNoticeAdmin();
  committeeDraft = structuredClone(site.committee?.length ? site.committee : [{ role: 'Chairman' }, { role: 'Secretary' }, { role: 'Treasurer' }]);
  renderCommitteeRows();
  const cf = $('#contact-form');
  cf.contactNo.value = site.society.contactNo || '';
  cf.hours.value = site.contact?.hours || '';
}

/* Penal interest rate periods (3.15) */
let ipDraft = [];
function readIp() {
  return $$('#ip-rows tr[data-i]').map((tr) => ({ from: $('[data-f=from]', tr).value, rate: Number($('[data-f=rate]', tr).value), ref: $('[data-f=ref]', tr).value.trim() }));
}
function renderIp() {
  $('#ip-rows').innerHTML = ipDraft.map((p, i) => `<tr data-i="${i}">
    <td><input type="date" data-f="from" value="${esc(p.from || '')}" aria-label="Rate period ${i + 1} starts"></td>
    <td><input type="number" data-f="rate" min="0" max="21" step="0.5" value="${esc(p.rate ?? '')}" aria-label="Rate period ${i + 1}, % per year"></td>
    <td><input type="text" data-f="ref" maxlength="200" value="${esc(p.ref || '')}" aria-label="Rate period ${i + 1} reference"></td>
    <td><button class="btn btn-small" type="button" data-ip-del="${i}">Remove</button></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No penal interest is charged.</td></tr>';
  const list = interestPeriodsOf({ interestPeriods: ipDraft.filter((p) => p.from) });
  const problems = checkInterestPeriods(ipDraft.filter((p) => p.from));
  $('#ip-summary').innerHTML = list.length ? `${list.map((p) => `<strong>${p.rate}%</strong> from ${dd(p.from)}${p.to ? ` to ${dd(p.to)}` : ' onwards'}`).join('; ')}.${problems.length ? ` <span class="cr-overdue">${esc(problems.join(' '))}</span>` : ''}` : '';
}
function renderInterestRefs() {
  const refs = site.interestRefs || [];
  $('#ir-list').innerHTML = refs.map((r, i) => `<li><span>📎 ${esc(r.title || r.name)}</span>
      <button class="btn-link" type="button" data-ir-open="${i}">Open</button> <button class="btn-link" type="button" data-ir-del="${i}">Remove from the website</button></li>`).join('')
    || '<li class="muted">None yet.</li>';
}
function wireInterestPeriods() {
  $('#cat-agm2015').addEventListener('click', useAgm2015Rates);
  $('#ir-upload').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const file = $('#ir-file').files[0], title = $('#ir-title').value.trim(), msg = $('#ir-msg');
    if (!file || !title) { msg.textContent = 'Choose the file and write its title.'; return; }
    if (!/^image\/|^application\/pdf$/.test(file.type)) { msg.textContent = 'Only PDF files and photos.'; return; }
    try {
      await loadDriveCfg(fb);
      if (!driveReady()) { msg.textContent = 'Connect the Society’s Google Drive first (Expenses → Set-up).'; return; }
      msg.textContent = 'Uploading…';
      const f = await prepareFile(file);
      const r = await driveCall(fb, 'upload', { kind: 'reference', topic: 'Interest on arrears', name: `${title.replace(/[\\/:*?"<>|#%]+/g, ' ').slice(0, 100)}.${(f.name.match(/\.(\w+)$/)?.[1] || 'pdf').toLowerCase()}`,
        mimeType: f.type, data: await toBase64(f), note: title });
      const refs = [...(site.interestRefs || []), { id: r.file.id, name: r.file.name, mime: r.file.mime, title, addedOn: todayIST() }];
      await saveSite({ interestRefs: refs });
      site.interestRefs = refs;
      $('#ir-file').value = ''; $('#ir-title').value = '';
      msg.textContent = 'Uploaded. Members now see it beside the interest explanation.';
      renderInterestRefs();
    } catch (err) { msg.textContent = errorText(err); }
  }));
  $('#ir-list').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-ir-open]'), d = e.target.closest('[data-ir-del]'), refs = site.interestRefs || [];
    if (o) {
      const r = refs[Number(o.dataset.irOpen)];
      try { const url = await driveFileUrl(fb, { referenceId: r.id, fileId: r.id }); await saveBlob(await (await fetch(url)).blob(), r.name); } catch (err) { alert(errorText(err)); }
    }
    if (d && confirm('Stop showing this document to members? The file stays in the Drive.')) {
      const next = refs.filter((_, i) => i !== Number(d.dataset.irDel));
      await saveSite({ interestRefs: next }); site.interestRefs = next; renderInterestRefs();
    }
  });
  $('#ip-add').addEventListener('click', () => { ipDraft = readIp(); ipDraft.push({ from: '', rate: '', ref: '' }); renderIp(); });
  // As resolved by the members on 13/04/2013 (Ref. RES_PASSED/130413/002, item 9) and confirmed at the AGM of 25/01/2015;
  // 12% from 01/07/2026 under the MCS (Amendment) Rules, 2026.
  $('#ip-suggest').addEventListener('click', () => {
    ipDraft = [{ from: '2013-04-13', rate: 18, ref: 'Members’ meeting 13/04/2013 (Ref. RES_PASSED/130413/002, item 9): 18% per year for late payment, i.e. beyond the calendar month, effective April 2013; continued with the maintenance of the AGM of 25/01/2015 (minutes 25/02/2015, effective 01/04/2015)' },
      { from: '2026-07-01', rate: 12, ref: 'MCS (Amendment) Rules, 2026, Rule 106C-12(4)-6 (notified 18/07/2026): maximum 12% simple p.a.; maintenance unchanged as per the AGM of 25/01/2015; General Body resolution dated __' }];
    renderIp();
  });
  $('#ip-rows').addEventListener('click', (e) => { const b = e.target.closest('[data-ip-del]'); if (b) { ipDraft = readIp(); ipDraft.splice(Number(b.dataset.ipDel), 1); renderIp(); } });
  $('#ip-rows').addEventListener('change', () => { ipDraft = readIp(); renderIp(); });
}

/* Committee list (3.14): add, remove and reorder people; the unit is shown after the name on the website. */
let committeeDraft = [];
function readCommitteeRows() {
  return $$('#committee-fields .committee-row').map((row) => ({
    role: $('[data-f=role]', row).value.trim(), name: $('[data-f=name]', row).value.trim(),
    unit: $('[data-f=unit]', row).value.trim(), phone: $('[data-f=phone]', row).value.trim() }));
}
function renderCommitteeRows() {
  const n = committeeDraft.length;
  $('#committee-fields').innerHTML = committeeDraft.map((c, i) => `<div class="committee-row" data-i="${i}">
    <label>Role<input type="text" data-f="role" list="committee-roles" value="${esc(c.role || '')}"></label>
    <label>Name<input type="text" data-f="name" value="${esc(c.name || '')}"></label>
    <label>Unit (optional)<input type="text" data-f="unit" list="committee-units" value="${esc(c.unit || '')}" placeholder="e.g. C 202"></label>
    <label>Phone<input type="tel" data-f="phone" value="${esc(c.phone || '')}"></label>
    <div class="committee-actions">
      <button class="btn btn-small" type="button" data-cm="up" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(c.name || c.role || 'this person')} up">↑</button>
      <button class="btn btn-small" type="button" data-cm="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Move ${esc(c.name || c.role || 'this person')} down">↓</button>
      <button class="btn btn-small btn-danger" type="button" data-cm="remove">Remove</button></div></div>`).join('')
    || '<p class="muted">No one listed. Add the committee members below.</p>';
  $('#committee-units').innerHTML = units.map((u) => `<option value="${esc(u.unit)}">${esc(u.name || '')}</option>`).join('');
}

function wireWebsite() {
  wireInterestPeriods();
  $('#committee-add').addEventListener('click', () => {
    committeeDraft = readCommitteeRows();
    committeeDraft.push({ role: 'Member', name: '', unit: '', phone: '' });
    renderCommitteeRows();
    $$('#committee-fields [data-f=name]').at(-1)?.focus();
  });
  $('#committee-fields').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cm]');
    if (!b) return;
    committeeDraft = readCommitteeRows();
    const i = Number(b.closest('.committee-row').dataset.i);
    if (b.dataset.cm === 'remove') committeeDraft.splice(i, 1);
    if (b.dataset.cm === 'up' && i > 0) [committeeDraft[i - 1], committeeDraft[i]] = [committeeDraft[i], committeeDraft[i - 1]];
    if (b.dataset.cm === 'down' && i < committeeDraft.length - 1) [committeeDraft[i + 1], committeeDraft[i]] = [committeeDraft[i], committeeDraft[i + 1]];
    renderCommitteeRows();
  });
  const nf = $('#notice-form');
  nf.date.value = todayIST();
  nf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(nf);
    const body = String(fd.get('body')).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (!fd.get('title') || !fd.get('summary') || !body.length) return setMsg(nf, 'Fill in the title, summary and full text.');
    await busy($('button', nf), async () => {
      try {
        const notice = { id: `n${Date.now()}`, date: String(fd.get('date')), title: String(fd.get('title')).trim(), summary: String(fd.get('summary')).trim(), body };
        await saveSite({ notices: [...(site.notices || []), notice] });
        nf.reset();
        nf.date.value = todayIST();
        renderNoticeAdmin();
        setMsg(nf, 'Notice published on the website.', true);
      } catch (err) { setMsg(nf, esc(errorText(err))); }
    });
  });
  $('#notice-admin-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-notice]');
    if (!b || !confirm('Remove this notice from the website?')) return;
    try {
      await saveSite({ notices: (site.notices || []).filter((n) => n.id !== b.dataset.delNotice) });
      renderNoticeAdmin();
    } catch (err) { alert(errorText(err)); }
  });

  const cf = $('#contact-form');
  cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(cf);
    const committee = readCommitteeRows().filter((c) => c.role || c.name)
      .map((c) => ({ role: c.role || 'Member', name: c.name, phone: c.phone, ...(c.unit ? { unit: c.unit } : {}) }));
    if (committee.some((c) => !c.name && !['Chairman', 'Secretary', 'Treasurer'].includes(c.role))) return setMsg(cf, 'Write the name of each person, or remove the empty row.');
    await busy($('button', cf), async () => {
      try {
        await saveSite({ committee, society: { ...site.society, contactNo: String(fd.get('contactNo')).trim() }, contact: { ...site.contact, hours: String(fd.get('hours')).trim() } });
        committeeDraft = structuredClone(committee);
        renderCommitteeRows();
        setMsg(cf, 'Saved. The website and new bills use these details.', true);
      } catch (err) { setMsg(cf, esc(errorText(err))); }
    });
  });
}

/* ---------------- settings ---------------- */

const SOCIETY_FIELDS = [
  ['society.name', 'Society name (bill heading)'], ['society.regd', 'Registration line'], ['society.address', 'Address'],
  ['society.email', 'Email'], ['society.website', 'Website'],
  ['bank.name', 'Bank and branch'], ['bank.accountName', 'Account name'], ['bank.accountNo', 'Account number'], ['bank.ifsc', 'IFSC code']
];

/* ----- Monthly Maintenance Calculation ----- */
let draftExp = [];
const APPLIES = [['all', 'All units'], ['C', 'C wing lift units'], ['D', 'D wing lift units'], ['CD', 'All lift units']];

function renderMmcRows() {
  $('#mmc-rows').innerHTML = draftExp.map((e, i) => `<tr>
    <td><input type="text" class="exp-name" name="e_${i}_name" value="${esc(e.name)}" aria-label="Expense"></td>
    <td class="num"><input type="number" min="0" step="1" name="e_${i}_monthly" value="${e.monthly ?? 0}" aria-label="${esc(e.name)} per month"></td>
    <td><select name="e_${i}_applies" aria-label="${esc(e.name)} shared by">${APPLIES.map(([v, l]) => `<option value="${v}" ${e.appliesTo === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    <td><button class="btn btn-small btn-danger" type="button" data-del-exp="${i}">Remove</button></td></tr>`).join('');
  const total = draftExp.reduce((a, e) => a + (Number(e.monthly) || 0), 0);
  $('#mmc-rows').insertAdjacentHTML('beforeend', `<tr><td><strong>Total per month</strong></td><td class="num"><strong>${fmt(total)}</strong></td><td colspan="2"></td></tr>`);
}

function readMmc(fd) {
  draftExp = draftExp.map((e, i) => ({
    ...e, name: String(fd.get(`e_${i}_name`) ?? e.name).trim() || e.name,
    monthly: round(fd.get(`e_${i}_monthly`) ?? e.monthly), appliesTo: String(fd.get(`e_${i}_applies`) ?? e.appliesTo)
  }));
  const n = (k) => Number(fd.get(k)) || 0;
  return {
    expenses: draftExp, waterMonthly: n('waterMonthly'), costPerSqft: n('costPerSqft'),
    propertyTaxYearly: n('propertyTaxYearly'), insuranceYearly: n('insuranceYearly'), parking2w: n('parking2w'), parking4w: n('parking4w')
  };
}

function mmcSummary() {
  const f = $('#mmc-form');
  const mmc = readMmc(new FormData(f));
  const ctx = buildContext(units);
  const r = mmcRates({ mmc }, ctx);
  const active = units.filter((u) => u.active !== false);
  const noArea = active.filter((u) => !Number(u.carpetArea)).length;
  const noInlets = active.filter((u) => !(Number(u.inlets) > 0)).length;
  $('#mmc-summary').innerHTML = `<dl>
    <dt>Common expenses ÷ units</dt><dd>₹ ${fmt(r.serviceTotal)} ÷ ${ctx.units} = ₹ ${fmt(r.service)} service charge per unit</dd>
    <dt>C wing lift</dt><dd>₹ ${fmt(r.liftTotal.C)}${r.liftTotal.CD ? ` + share of ₹ ${fmt(r.liftTotal.CD)}` : ''} ÷ ${ctx.lift.C || 0} units = ₹ ${fmt(r.lift.C)} per unit</dd>
    <dt>D wing lift</dt><dd>₹ ${fmt(r.liftTotal.D)}${r.liftTotal.CD ? ` + share of ₹ ${fmt(r.liftTotal.CD)}` : ''} ÷ ${ctx.lift.D || 0} units = ₹ ${fmt(r.lift.D)} per unit</dd>
    <dt>Water</dt><dd>₹ ${fmt(mmc.waterMonthly)} ÷ ${ctx.inlets} units using water = ₹ ${fmt(r.waterPerInlet)} per unit${noInlets ? ` <span class="muted">(${noInlets} units marked No pay none)</span>` : ''}</dd>
    <dt>Carpet area entered</dt><dd>${fmt(ctx.area)} sq ft${noArea ? ` <span class="warn">${noArea} units have no area entered</span>` : ''}</dd>
    <dt>Sinking / repairs funds</dt><dd>${mmc.costPerSqft ? `₹ ${fmt(mmc.costPerSqft)}/sq ft × area × ${billing.sinkingPct}% and ${billing.repairsPct}% ÷ 12` : 'Enter construction cost per sq ft'}</dd>
  </dl>`;
}

function previewBills() {
  const mmc = readMmc(new FormData($('#mmc-form')));
  const settings = { ...billing, method: 'mmc', mmc };
  const ctx = buildContext(units);
  const month = addMonths(lastBilled() || monthOf(todayIST()), lastBilled() ? 1 : 0);
  const rows = units.filter((u) => u.active !== false).map((u) => {
    const calc = computeBill({ unit: { ...u, balance: 0, interestDue: 0 }, settings, monthKey: month, ctx });
    return { u, amounts: Object.fromEntries(calc.lines.map((l) => [l.code, l.amount])), total: calc.current };
  });
  const codes = PARTICULARS.map(([c]) => c).filter((c) => rows.some((r) => r.amounts[c]));
  lastPreview = { month, codes, rows };
  $('#mmc-preview-title').textContent = `Preview: ${monthLabel(month)} charges (before arrears)`;
  $('#mmc-preview-head').innerHTML = `<tr><th>Unit</th><th>Name</th>${codes.map((c) => `<th class="num">${esc(LABEL[c])}</th>`).join('')}<th class="num">This month</th></tr>`;
  $('#mmc-preview-rows').innerHTML = rows.map((r) => `<tr><td class="unit">${esc(r.u.unit)}</td><td>${esc(r.u.name)}</td>${codes.map((c) => `<td class="num">${r.amounts[c] ? fmt(r.amounts[c]) : ''}</td>`).join('')}<td class="num"><strong>${fmt(r.total)}</strong></td></tr>`).join('');
  const sum = (c) => rows.reduce((a, r) => a + (r.amounts[c] || 0), 0);
  const expTotal = mmc.expenses.reduce((a, e) => a + (Number(e.monthly) || 0), 0) + (mmc.waterMonthly || 0);
  $('#mmc-preview-foot').innerHTML = `<tr><td colspan="2">Total collected</td>${codes.map((c) => `<td class="num">${fmt(sum(c))}</td>`).join('')}<td class="num">${fmt(rows.reduce((a, r) => a + r.total, 0))}</td></tr>
    <tr><td colspan="${codes.length + 3}" class="muted">Monthly expenses entered (service, lift, water): ₹ ${fmt(expTotal)}. Small differences come from rounding to whole rupees.</td></tr>`;
  $('#mmc-preview-box').hidden = false;
  $('#mmc-preview-box').scrollIntoView({ behavior: 'smooth' });
}
let lastPreview = null;

const CAT_COLS = [['maintenance', 'Maintenance / service'], ['maintenancePerSqft', 'Or ₹ per sq ft'], ['water', 'Water'], ['liftYearly', 'Lift (per year)'], ['liftMonthly', 'Or lift per month'],
  ['parking', 'Parking'], ['education', 'Education fund'], ['federation', 'Federation fund'], ['election', 'Election fund']];
let draftCats = [];

function useAgm2015Rates() {
  if (!confirm('Replace the rates below with those of the AGM of 25/01/2015 (minutes 25/02/2015)? Nothing changes until you press Save charges.')) return;
  const keep = Object.fromEntries(draftCats.map((c) => [c.id, c]));
  draftCats = [...AGM_2015_CATEGORIES.map((c) => ({ ...keep[c.id], ...structuredClone(c) })), ...draftCats.filter((c) => !AGM_2015_CATEGORIES.some((a) => a.id === c.id))];
  renderCategories();
}
function renderCategories() {
  $('#rates-head').innerHTML = `<tr><th>Category</th>${CAT_COLS.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th>Units</th></tr>`;
  $('#rates-body').innerHTML = draftCats.map((c, i) => `<tr>
    <td><input type="text" class="cat-name" name="c_${i}_name" value="${esc(c.name)}" aria-label="Category name"></td>
    ${CAT_COLS.map(([k, l]) => `<td class="num"><input type="number" min="0" step="${k === 'maintenancePerSqft' ? '0.01' : '1'}" name="c_${i}_${k}" value="${c[k] ?? 0}" aria-label="${esc(c.name)} ${l}"></td>`).join('')}
    <td class="num">${units.filter((u) => categoryIdFor(u) === c.id).length}</td></tr>`).join('');
}

async function loadSettings() {
  $('#import-box').hidden = units.length > 0;
  await loadDriveCfg(fb).catch(() => null);
  $('#ufb-box').hidden = !units.length;
  $('#ufr-unit').innerHTML = unitOptions(false);
  if (!driveReady()) setMsg($('#ufb-box'), 'Connect the Society’s Google Drive first: Expenses → Set-up.');
  loadFullBackups().catch((err) => console.warn('full backups', err));
  $('#sb-box').hidden = !canDo('committee');
  const mf = $('#mmc-form');
  const mmc = billing.mmc || MMC_TEMPLATE;
  mf.method.value = billing.method || 'agm';
  draftExp = structuredClone(mmc.expenses || MMC_TEMPLATE.expenses);
  renderMmcRows();
  for (const k of ['waterMonthly', 'costPerSqft', 'propertyTaxYearly', 'insuranceYearly', 'parking2w', 'parking4w']) mf[k].value = mmc[k] ?? 0;
  mmcSummary();
  draftCats = structuredClone(billing.categories || []);
  renderCategories();
  const bf = $('#billing-form');
  bf.liftBillMonth.innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  bf.liftBilling.value = billing.liftBilling || 'yearly';
  bf.liftBillMonth.value = String(billing.liftBillMonth || 4);
  bf.sinkingPct.value = billing.sinkingPct ?? 0.25;
  bf.repairsPct.value = billing.repairsPct ?? 0.75;
  bf.nonOccupancyPct.value = billing.nonOccupancyPct ?? 10;
  ipDraft = (billing.interestPeriods || []).map((p) => ({ ...p }));
  if (!ipDraft.length && Number(billing.interestRatePA) > 0) ipDraft = [{ from: '2000-01-01', rate: Number(billing.interestRatePA), ref: 'General Body resolution' }];
  renderIp();
  renderInterestRefs();
  bf.dueDays.value = billing.dueDays ?? 15;
  bf.chargesBasis.value = site.chargesBasis ?? DEFAULT_SITE.chargesBasis;
  $('#society-fields').innerHTML = SOCIETY_FIELDS.map(([k, label]) => {
    const [a, b] = k.split('.');
    return `<label>${label}<input type="text" name="${k}" value="${esc(site[a]?.[b] || '')}"></label>`;
  }).join('');
}

function readCategories(fd) {
  draftCats = draftCats.map((c, i) => {
    const out = { ...c, name: String(fd.get(`c_${i}_name`) ?? c.name).trim() || c.name };
    for (const [k] of CAT_COLS) out[k] = k === 'maintenancePerSqft' ? Math.round(Number(fd.get(`c_${i}_${k}`) ?? c[k] ?? 0) * 100) / 100 : round(fd.get(`c_${i}_${k}`) ?? c[k]);
    return out;
  });
}

let tallyFileData = null;
let tmMapping = [];

/** After a load: list units whose Tally balance on the cut-off date differs from the opening taken over. */
async function showTallyDifferences(data) {
  const live = await loadAllLedgers(fb, units);
  const rows = units.map((u) => {
    const h = data.units[u.id];
    if (!h) return null;
    const taken = (live[u.id] || []).filter((x) => x.kind === 'opening').reduce((a, x) => a + (x.debit || 0) - (x.credit || 0), 0);
    return { u, taken, tally: h.balanceAtTakeover, diff: Math.round(taken - h.balanceAtTakeover) };
  }).filter((x) => x && x.diff);
  $('#tally-result').innerHTML = rows.length ? `<p><strong>${rows.length} units</strong> have a different Tally balance on ${ddmmyyyy(data.takeoverDate || TAKEOVER_DATE)} from the opening balance taken over. Their unit ledgers show a “Difference” line marked Check, so today’s balance is unchanged. Decide each one and add a correction if needed.</p>
    <div class="table-scroll"><table><thead><tr><th>Unit</th><th>Member</th><th class="num">Tally balance (₹)</th><th class="num">Taken over (₹)</th><th class="num">Difference (₹)</th></tr></thead>
    <tbody>${rows.map((x) => `<tr><td class="unit"><a href="#unitfile" data-file-link="${esc(x.u.id)}">${esc(x.u.unit)}</a></td><td>${esc(x.u.name)}</td><td class="num">${amt(x.tally)}</td><td class="num">${amt(x.taken)}</td><td class="num">${amt(x.diff)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p>Every unit’s Tally balance matches the opening balance taken over.</p>';
}

function renderTallyMapping() {
  const opts = (sel) => `<option value="">Skip</option>` + units.map((u) => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.unit)}${u.name ? ' – ' + esc(u.name) : ''}</option>`).join('');
  $('#tm-map').innerHTML = tmMapping.map((m, i) => `<tr><td>${esc(m.ledger)}${m.kind === 'bpm' ? ' <span class="pill past">BPM</span>' : ''}</td><td class="type">${esc(m.chain.join(' › '))}</td>
    <td class="num">${amt(m.closing)}</td><td><select data-map="${i}">${opts(m.unit)}</select></td></tr>`).join('');
}

function wireTallyImport() {
  $('#tally-box').hidden = !canDo('committee');
  const msg = $('#tally-msg');
  $('#tally-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    $('#tally-migrate').hidden = true; $('#tally-old-actions').hidden = true; $('#tally-result').innerHTML = ''; msg.textContent = '';
    if (!file) return;
    try { tallyFileData = JSON.parse(await file.text()); } catch { msg.className = 'form-msg'; msg.textContent = 'That file isn’t a valid Tally file.'; return; }
    const d = tallyFileData;
    if (String(d.format || '').startsWith('sunshreesuntec-tally-export')) {
      tmMapping = suggestMapping(d, units);
      $('#tm-facts').innerHTML = `
        <div><dt>Company</dt><dd>${esc(d.company)}</dd></div>
        <div><dt>Period</dt><dd>${ddmmyyyy(d.fromDate)} to ${ddmmyyyy(d.toDate)} (books from ${ddmmyyyy(d.booksFrom)})</dd></div>
        <div><dt>Exported</dt><dd>${esc(String(d.exportedAt).replace('T', ' '))} on ${esc(d.computer || '')}</dd></div>
        <div><dt>Contents</dt><dd>${d.groups.length} groups, ${d.ledgers.length} ledgers, ${d.vouchers.length} vouchers</dd></div>
        <div><dt>Balance check</dt><dd>${d.check?.ledgersDiffering ? `<span class="warn">${d.check.ledgersDiffering} ledgers differ from Tally’s closing balance; see export-log.txt</span>` : '<span class="pill ok">Every ledger agrees with Tally</span>'}</dd></div>
        <div><dt>Matched</dt><dd>${tmMapping.filter((m) => m.kind === 'member' && m.unit).length} member ledgers, ${tmMapping.filter((m) => m.kind === 'bpm' && m.unit).length} BPM ledgers matched to units; ${tmMapping.filter((m) => !m.unit).length} not matched</dd></div>`;
      $('#tm-cutoff').value = TAKEOVER_DATE;
      renderTallyMapping();
      $('#tally-migrate').hidden = false;
    } else if (d.units) {
      $('#tally-old-actions').hidden = false;
      msg.className = 'form-msg ok'; msg.textContent = `Tally ledger history for ${Object.keys(d.units).length} units. Click Load Tally history.`;
    } else { msg.className = 'form-msg'; msg.textContent = 'This isn’t a Tally export or Tally history file.'; }
  });
  $('#tm-map').addEventListener('change', (e) => { const sel = e.target.closest('[data-map]'); if (sel) tmMapping[Number(sel.dataset.map)].unit = sel.value; });

  $('#tm-go').addEventListener('click', async (e) => {
    const d = tallyFileData, cutoff = $('#tm-cutoff').value;
    if (!cutoff) return alert('Choose the date up to which Tally history is taken.');
    const members = tmMapping.filter((m) => m.kind === 'member' && m.unit);
    const dup = [...new Set(members.map((m) => m.unit).filter((u, i, a) => a.indexOf(u) !== i))];
    if (dup.length && !confirm(`More than one Tally ledger is matched to ${dup.join(', ')} (for example a previous owner’s account). Their entries will be combined in one unit ledger. Continue?`)) return;
    if (!confirm(`Migrate Tally history for ${members.length} units up to ${ddmmyyyy(cutoff)}${$('#tm-archive').checked ? ', and keep the whole Tally books as an archive' : ''}?`)) return;
    await busy(e.currentTarget, async () => {
      try {
        const hist = historiesFromExport(d, tmMapping, cutoff);
        const r = await importTallyHistory(fb, hist, units, (i, n) => { $('#tally-progress').textContent = `Unit ledgers ${i} of ${n}…`; });
        let extra = '';
        if ($('#tm-archive').checked) {
          await saveTallyArchive(fb, d, (i, n) => { $('#tally-progress').textContent = `Archive ${i} of ${n}…`; });
          extra += ` The whole Tally books (${d.ledgers.length} ledgers, ${d.vouchers.length} vouchers) are in Reports → Tally books.`;
        }
        if ($('#tm-bpm').checked) {
          const bpm = tmMapping.filter((m) => m.kind === 'bpm' && m.unit);
          for (const m of bpm) await updateUnitDetails(fb, m.unit, { bpm: Math.round(m.closing) || null });
          await rebuildPublicDues(fb, dues.blocks);
          await refreshCore();
          extra += ` Builder pending maintenance updated for ${bpm.length} units.`;
        }
        $('#tally-progress').textContent = '';
        msg.className = 'form-msg ok';
        msg.textContent = `Migrated Tally history for ${r.done.length} units.${extra}`;
        await showTallyDifferences(hist);
      } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    });
  });

  $('#tally-import').addEventListener('click', async (e) => {
    const data = tallyFileData;
    if (!data?.units) return;
    if (!confirm(`Load Tally history for ${Object.keys(data.units).length} units?`)) return;
    await busy(e.currentTarget, async () => {
      try {
        const r = await importTallyHistory(fb, data, units, (i, n) => { $('#tally-progress').textContent = `${i} of ${n}…`; });
        $('#tally-progress').textContent = '';
        msg.className = 'form-msg ok';
        msg.textContent = `Loaded ${r.done.length} units.${r.missing.length ? ` No Tally ledger for: ${r.missing.join(', ')}.` : ''}`;
        await showTallyDifferences(data);
      } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    });
  });
  $('#tally-result').addEventListener('click', (e) => {
    const a = e.target.closest('[data-file-link]');
    if (a) { fileUnit = a.dataset.fileLink; sessionStorage.setItem('fileUnit', fileUnit); }
  });
}

function wireSettings() {
  wireTallyImport();
  wireAuditImport();
  wirePastReceiptImport();
  const mf = $('#mmc-form');
  mf.addEventListener('input', () => mmcSummary());
  $('#mmc-add').addEventListener('click', () => {
    readMmc(new FormData(mf));
    draftExp.push({ id: `exp${Date.now().toString(36)}`, name: 'New expense', monthly: 0, appliesTo: 'all' });
    renderMmcRows();
  });
  $('#mmc-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del-exp]');
    if (!b) return;
    readMmc(new FormData(mf));
    draftExp.splice(Number(b.dataset.delExp), 1);
    renderMmcRows();
    mmcSummary();
  });
  $('#mmc-preview').addEventListener('click', previewBills);
  $('#mmc-csv').addEventListener('click', () => {
    if (!lastPreview) return;
    const { codes, rows, month } = lastPreview;
    const head = ['Unit', 'Name', ...codes.map((c) => LABEL[c]), 'Total'];
    const body = rows.map((r) => [r.u.unit, r.u.name, ...codes.map((c) => r.amounts[c] || 0), r.total]);
    const csv = [head, ...body].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv' }), `maintenance-calculation-${month}.csv`).catch((err) => alert(errorText(err)));
  });
  mf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(mf);
    const mmc = readMmc(fd);
    const method = String(fd.get('method'));
    if (method === 'mmc' && method !== billing.method && !confirm('Switch billing to the Monthly Maintenance Calculation? The next bills generated will use it. Check the preview first.')) return;
    await busy($('button[type=submit]', mf), async () => {
      try {
        await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'billing'), { method, mmc }, { merge: true });
        billing = await loadBilling(fb);
        renderMmcRows();
        mmcSummary();
        setMsg(mf, method === 'mmc' ? 'Saved. New bills are calculated as per the 2026 Rules.' : 'Saved. New bills still use the AGM 2015 category rates.', true);
      } catch (err) { setMsg(mf, esc(errorText(err))); }
    });
  });

  $('#import-btn').addEventListener('click', async (e) => {
    if (!confirm('Create all units with their 30 September 2026 balances? This can only be done once.')) return;
    const msg = $('#import-msg');
    msg.textContent = '';
    await busy(e.currentTarget, async () => {
      try {
        await importOpening(fb, dues, { includeOctober: $('#import-oct').checked }, (i, n) => { $('#import-progress').textContent = `${i} of ${n}…`; });
        const notices = await getNotices().catch(() => []);
        const cur = await loadSite(fb);
        if (!cur.notices?.length && notices.length) await saveSite({ notices });
        await refreshCore();
        $('#import-progress').textContent = '';
        msg.className = 'form-msg ok';
        msg.textContent = `${units.length} units created. The website now shows balances from the accounts.`;
        $('#import-box').hidden = true;
        $('#no-units').hidden = true;
      } catch (err) {
        msg.className = 'form-msg';
        msg.textContent = errorText(err) + (err?.code === 'permission-denied'
          ? ' Your login doesn’t have permission for this. Ask the person who maintains the website to check committee access.' : '');
      }
    });
  });

  const bf = $('#billing-form');
  $('#add-category').addEventListener('click', () => {
    readCategories(new FormData(bf));
    draftCats.push({ id: `CAT${Date.now().toString(36).toUpperCase()}`, name: 'New category', maintenance: 0, water: 0, liftYearly: 0, parking: 0, education: 10, federation: 0, election: 0 });
    renderCategories();
  });
  bf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(bf);
    readCategories(fd);
    const num = (k, d) => (fd.get(k) === '' ? d : Number(fd.get(k)));
    ipDraft = readIp();
    if (ipDraft.some((p) => !p.from || !(p.rate >= 0))) return setMsg(bf, 'Each rate period needs a start date and a rate (0 for no interest).');
    const ipProblems = checkInterestPeriods(ipDraft);
    if (ipProblems.length) return setMsg(bf, esc(ipProblems.join(' ')));
    const interestPeriods = ipDraft.sort((a, b) => a.from.localeCompare(b.from));
    const interestRatePA = monthInterestRate({ interestPeriods }, monthOf(todayIST())).rate; // today's rate, printed on bills
    if (num('nonOccupancyPct', 10) > 10) return setMsg(bf, 'Non-occupancy charges can’t be more than 10% of service charges.');
    const patch = {
      categories: draftCats, interestRatePA, interestPeriods, dueDays: round(num('dueDays', 15)) || 15,
      liftBilling: fd.get('liftBilling'), liftBillMonth: Number(fd.get('liftBillMonth')),
      sinkingPct: num('sinkingPct', 0.25), repairsPct: num('repairsPct', 0.75), nonOccupancyPct: num('nonOccupancyPct', 10)
    };
    await busy($('button[type=submit]', bf), async () => {
      try {
        await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'billing'), patch, { merge: true });
        await saveSite({ interestRatePA, interestPeriods: interestPeriodsOf({ interestPeriods }), chargesBasis: String(fd.get('chargesBasis')).trim() }); // printed on bills and shown to members
        billing = await loadBilling(fb);
        renderCategories();
        setMsg(bf, 'Saved. New bills use these charges.', true);
      } catch (err) { setMsg(bf, esc(errorText(err))); }
    });
  });

  const sf = $('#society-form');
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(sf);
    const patch = { society: { ...site.society }, bank: { ...site.bank } };
    for (const [k] of SOCIETY_FIELDS) { const [a, b] = k.split('.'); patch[a][b] = String(fd.get(k)).trim(); }
    await busy($('button', sf), async () => {
      try { await saveSite(patch); setMsg(sf, 'Saved. Bills and receipts now print these details.', true); }
      catch (err) { setMsg(sf, esc(errorText(err))); }
    });
  });
}

/* ---------------- staff (committee only) ---------------- */

async function ensureAgreement() {
  const { F, db } = fb;
  const ref = F.doc(db, 'settings', 'staffAgreement');
  const snap = await F.getDoc(ref);
  if (snap.exists()) return snap.data();
  const ag = { ...structuredClone(DEFAULT_AGREEMENT), publishedAt: F.serverTimestamp(), publishedBy: uid };
  await F.setDoc(ref, ag);
  return (await F.getDoc(ref)).data();
}

const tsText = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : null;
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};
const accessSummary = (rec) => (isCommitteeRecord(rec) ? 'Full access' : PERMS.filter(([k]) => rec.perms?.[k]).map(([k]) => k).length + ' of ' + PERMS.length);
const permChecks = (perms) => PERMS.map(([k, label]) => `<label><input type="checkbox" name="p_${k}" ${perms?.[k] ? 'checked' : ''}> ${esc(label)}</label>`).join('');
const readPerms = (fd) => Object.fromEntries(PERMS.map(([k]) => [k, Boolean(fd.get('p_' + k))]));
let staffList = [];
let staffRequests = [];
const dateShort = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const dateInput = (d) => (d ? new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : '');
const endOfDay = (v) => (v ? fb.F.Timestamp.fromDate(new Date(`${v}T23:59:59+05:30`)) : null);
const plusDays = (n) => (n ? dateInput(new Date(Date.now() + n * 86400000)) : '');

function fillRoleSelects() {
  const opts = roleNames().map((r) => `<option>${esc(r)}</option>`).join('');
  ['#invite-role', '#staff-role'].forEach((id) => {
    const sel = $(id), keep = sel.value;
    sel.innerHTML = opts;
    if (keep && roleNames().includes(keep)) sel.value = keep;
  });
}

function renderRolePolicies() {
  $('#role-policies').innerHTML = roleNames().map((r, i) => {
    const p = rolePolicy(r);
    return `<details class="role-policy" data-role="${esc(r)}"><summary>${esc(r)}${p.group === 'official' ? '<span class="group-pill">Official</span>' : ''}
      <span class="muted">· ${p.perms.length} of ${PERMS.length} permissions · ${p.agreement ? 'agreement required' : 'no agreement'} · ${p.days ? `${p.days} days` : 'until removed'}</span></summary>
      <div class="perm-grid">${PERMS.map(([k, label]) => `<label><input type="checkbox" name="rp${i}_${k}" ${p.perms.includes(k) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div>
      <div class="rp-row"><label class="check"><input type="checkbox" name="rp${i}_agreement" ${p.agreement ? 'checked' : ''}> Must accept the staff agreement</label>
      <label>Access lasts (days, 0 = until removed)<input type="number" name="rp${i}_days" min="0" max="3650" value="${p.days}"></label></div></details>`;
  }).join('');
}

function renderStaffRequests() {
  const list = staffRequests.filter((r) => r.status !== 'approved')
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || (tsDate(b.createdAt) || 0) - (tsDate(a.createdAt) || 0));
  $('#staff-request-rows').innerHTML = list.map((r) => `<tr><td><strong>${esc(r.name)}</strong>${r.provider === 'google' ? ' <span class="status-pill">Google</span>' : ''}</td>
      <td>${esc(r.role)}${rolePolicy(r.role).group === 'official' ? '<span class="group-pill">Official</span>' : ''}</td><td>${esc(r.org || '')}</td>
      <td>${r.mobile ? `<a href="tel:+91${esc(r.mobile)}">+91 ${esc(r.mobile)}</a>` : ''}</td><td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
      <td>${whenShort(r.createdAt)}${r.status === 'rejected' ? `<br><span class="warn">Rejected${r.reason ? `: ${esc(r.reason)}` : ''}</span>` : ''}</td>
      <td><div class="row-actions">${r.status === 'pending'
        ? `<button class="btn btn-small btn-primary" type="button" data-sr="approve" data-uid="${esc(r.uid)}">Approve</button>
           <button class="btn btn-small btn-danger" type="button" data-sr="reject" data-uid="${esc(r.uid)}">Reject</button>`
        : `<button class="btn btn-small" type="button" data-sr="restore" data-uid="${esc(r.uid)}">Back to waiting</button>
           <button class="btn btn-small btn-danger" type="button" data-sr="delete" data-uid="${esc(r.uid)}">Delete</button>`}</div></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No requests.</td></tr>';
}

function staffNotify(r, action) {
  const box = $('#staff-notice');
  const first = (r.name || '').split(' ')[0] || 'Sir / Madam';
  const sign = `\n\nRegards,\n${me?.name || 'Managing Committee'}\nSunshree Suntec Co-op. Housing Society Ltd.`;
  const link = SITE_LINK.replace('/#member', '/admin.html');
  const t = action === 'approved'
    ? { subject: `Sunshree Suntec: your access as ${r.role} is approved`, body: `Dear ${first},\n\nYour access to the Society’s accounts as ${r.role} has been approved${r.until ? ` until ${r.until}` : ''}. Open ${link} and sign in with ${r.email}.${r.agreement ? ' Please read and accept the staff agreement shown at your first sign-in.' : ''}${sign}` }
    : { subject: `Sunshree Suntec: your request as ${r.role}`, body: `Dear ${first},\n\nYour request for access to the Society’s accounts as ${r.role} was not approved.${r.reason ? `\nReason: ${r.reason}` : ''}\n\nPlease contact the Society office if you think this is a mistake.${sign}` };
  const mail = `mailto:${encodeURIComponent(r.email || '')}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
  const wa = r.mobile ? `https://wa.me/91${r.mobile}?text=${encodeURIComponent(`${t.subject}\n\n${t.body}`)}` : '';
  box.innerHTML = `<p><strong>${action === 'approved' ? 'Approved' : 'Rejected'}: ${esc(r.name)} (${esc(r.role)}).</strong> Let them know:</p>
    <div class="form-actions"><a class="btn btn-small btn-primary" href="${esc(mail)}" data-snotify="email">Send email</a>
    ${wa ? `<a class="btn btn-small" href="${esc(wa)}" target="_blank" rel="noopener" data-snotify="whatsapp">Send WhatsApp</a>` : ''}
    <button class="btn btn-small" type="button" data-snotify="close">Close</button></div>`;
  box.dataset.uid = r.uid; box.dataset.action = action;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function loadStaff() {
  const { F, db } = fb;
  agreement = await ensureAgreement();
  const [adm, inv, acc, pol, reqs] = await Promise.all([
    F.getDocs(F.collection(db, 'admins')),
    F.getDocs(F.collection(db, 'staffInvites')),
    F.getDocs(F.collection(db, 'staffAgreements')),
    F.getDoc(F.doc(db, 'settings', 'rolePolicies')).catch(() => null),
    F.getDocs(F.collection(db, 'staffRequests')).catch(() => ({ docs: [] }))
  ]);
  setRolePolicies(pol?.exists() ? pol.data().roles : null);
  fillRoleSelects();
  renderRolePolicies();
  staffRequests = reqs.docs.map((d) => ({ uid: d.id, ...d.data() }));
  renderStaffRequests();
  staffList = adm.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const claimed = new Set(staffList.map((x) => (x.email || '').toLowerCase()));

  renderCommittee().catch((err) => console.warn('committee', err));
  $('#staff-rows').innerHTML = staffList.filter((x) => x.kind === 'staff').sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((x) => {
    const committee = x.kind !== 'staff';
    const agr = committee || x.agreementRequired === false ? '<span class="muted">Not required</span>'
      : x.agreementVersion === agreement.version ? `<span class="pill-ok">v${x.agreementVersion} accepted</span><br><span class="muted">${esc(tsText(x.agreementAcceptedAt))}</span>`
      : `<span class="warn">${x.agreementVersion ? `Accepted v${x.agreementVersion}; v${agreement.version} pending` : 'Not yet accepted'}</span>`;
    return `<tr><td><strong>${esc(x.name || x.email || x.uid)}</strong><br><span class="muted">${esc(x.email || '')}</span></td>
      <td>${esc(committee ? `Committee${x.role ? ' – ' + x.role : ''}` : x.role)}</td>
      <td>${esc(accessSummary(x))}</td><td>${agr}</td><td>${esc(tsText(x.lastLoginAt))}</td>
      <td>${x.active === false ? '<span class="warn">Suspended</span>' : accessEnded(x) ? `<span class="warn">Ended ${esc(dateShort(accessEnds(x)))}</span>`
        : accessEnds(x) ? `Active until ${esc(dateShort(accessEnds(x)))}` : 'Active'}</td>
      <td>${committee || x.uid === uid ? '' : `<button class="btn btn-small" type="button" data-edit-staff="${esc(x.uid)}">Edit</button>`}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No one yet.</td></tr>';

  const invites = inv.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !claimed.has(i.id.toLowerCase()));
  $('#invite-rows').innerHTML = invites.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.id)}</td><td>${esc(i.role)}</td><td>${esc(tsText(i.invitedAt))}</td>
    <td><button class="btn btn-small btn-danger" type="button" data-revoke="${esc(i.id)}">Cancel invitation</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">None.</td></tr>';

  const accepted = acc.docs.map((d) => d.data()).sort((a, b) => (b.acceptedAt?.seconds || 0) - (a.acceptedAt?.seconds || 0));
  $('#acceptance-rows').innerHTML = accepted.map((a) => `<tr><td>${esc(tsText(a.acceptedAt))}</td><td>${esc(a.signedName)}</td><td>${esc(a.email)}</td><td>${esc(a.role)}</td><td>${a.version}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No acceptances yet.</td></tr>';

  const staffOnly = staffList.filter((x) => x.kind === 'staff' && x.active !== false);
  const done = staffOnly.filter((x) => x.agreementVersion === agreement.version).length;
  $('#agreement-status').textContent = `Current agreement: version ${agreement.version}${agreement.publishedAt ? `, published ${tsText(agreement.publishedAt)}` : ''}. ${done} of ${staffOnly.length} active staff have accepted it.`;

  const ef = $('#agreement-edit');
  ef.title.value = agreement.title || '';
  ef.intro.value = agreement.intro || '';
  ef.common.value = (agreement.common || []).join('\n');
  ef.closing.value = agreement.closing || '';
  const roles = [...new Set([...roleNames(), ...Object.keys(agreement.roles || {})])];
  $('#role-texts').innerHTML = roles.map((r) => `<label>Responsibilities of ${esc(r)} (one per line)<textarea name="role_${esc(r)}" rows="6">${esc((agreement.roles?.[r] || []).join('\n'))}</textarea></label>`).join('');
}

function wireStaff() {
  const f = $('#invite-form');
  fillRoleSelects();
  const fillInvitePerms = () => { $('#invite-perms').innerHTML = permChecks(permsFor(f.role.value)); };
  f.role.addEventListener('change', fillInvitePerms);
  fillInvitePerms();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const email = String(fd.get('email')).trim().toLowerCase();
    const name = String(fd.get('name')).trim();
    const mobile = String(fd.get('mobile')).replace(/\D/g, '').slice(-10);
    if (name.length < 3) return setMsg(f, 'Enter the staff member’s full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg(f, 'Enter the email address they will sign in with.');
    const perms = readPerms(fd);
    if (!Object.values(perms).some(Boolean)) return setMsg(f, 'Give at least one kind of access.');
    await busy($('button[type=submit]', f), async () => {
      try {
        await ensureAgreement();
        await fb.F.setDoc(fb.F.doc(fb.db, 'staffInvites', email), {
          name, mobile, role: String(fd.get('role')), perms, invitedBy: uid, invitedAt: fb.F.serverTimestamp()
        });
        f.reset(); fillInvitePerms();
        setMsg(f, `Invited ${esc(name)}. Ask them to open sunshreesuntec.com/admin.html and choose Continue with Google with ${esc(email)}.`, true);
        await loadStaff();
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });

  $('#invite-rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-revoke]');
    if (!b || !confirm('Cancel this invitation?')) return;
    await fb.F.deleteDoc(fb.F.doc(fb.db, 'staffInvites', b.dataset.revoke)).catch((err) => alert(errorText(err)));
    await loadStaff();
  });

  // One dialog for: edit a staff member, approve a request (with the role's policy, adjustable), reject a request.
  const sf = $('#staff-form');
  let editingStaff = null, mode = 'edit';
  const openStaffDialog = (rec, m) => {
    editingStaff = rec; mode = m;
    const pol = rolePolicy(rec.role);
    $('#staff-title').textContent = m === 'approve' ? `Approve: ${rec.name}` : m === 'reject' ? `Reject: ${rec.name}` : `${rec.name || rec.email}`;
    $('#staff-sub').textContent = [rec.role, rec.org, rec.email, rec.mobile ? `+91 ${rec.mobile}` : ''].filter(Boolean).join(' · ');
    $('.staff-edit-only', sf).hidden = m === 'reject';
    $('.staff-reject-only', sf).hidden = m !== 'reject';
    $('#staff-remove').hidden = m !== 'edit';
    $('button[type=submit]', sf).textContent = m === 'approve' ? 'Approve' : m === 'reject' ? 'Reject' : 'Save';
    $('button[type=submit]', sf).classList.toggle('btn-danger', m === 'reject');
    sf.reason.value = '';
    if (m !== 'reject') {
      if (!roleNames().includes(rec.role)) fillRoleSelects();
      sf.role.value = roleNames().includes(rec.role) ? rec.role : 'Other';
      $('#staff-perms').innerHTML = permChecks(m === 'approve' ? permsFor(rec.role) : rec.perms);
      sf.agreementRequired.checked = m === 'approve' ? pol.agreement : rec.agreementRequired !== false;
      sf.validUntil.value = m === 'approve' ? plusDays(pol.days) : dateInput(accessEnds(rec));
      sf.active.checked = m === 'approve' ? true : rec.active !== false;
    }
    setMsg(sf, '');
    $('#staff-dialog').showModal();
  };
  $('#staff-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-staff]');
    if (b) openStaffDialog(staffList.find((x) => x.uid === b.dataset.editStaff), 'edit');
  });
  $('#staff-request-rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sr]');
    const r = b && staffRequests.find((x) => x.uid === b.dataset.uid);
    if (!r) return;
    const act = b.dataset.sr;
    if (act === 'approve' || act === 'reject') { openStaffDialog(r, act); return; }
    if (act === 'delete' && !confirm(`Delete ${r.name}'s request permanently? It can't be undone.`)) return;
    await busy(b, async () => {
      try {
        if (act === 'restore') await fb.F.updateDoc(fb.F.doc(fb.db, 'staffRequests', r.uid), { status: 'pending', reason: '' });
        if (act === 'delete') await fb.F.deleteDoc(fb.F.doc(fb.db, 'staffRequests', r.uid));
        await loadStaff();
      } catch (err) { alert(errorText(err)); }
    });
  });
  $('#staff-notice').addEventListener('click', (e) => {
    const a = e.target.closest('[data-snotify]');
    if (!a) return;
    const box = $('#staff-notice');
    if (a.dataset.snotify === 'close') { box.hidden = true; return; }
    const r = staffRequests.find((x) => x.uid === box.dataset.uid) || staffList.find((x) => x.uid === box.dataset.uid);
    if (r) logNotified({ id: box.dataset.uid, name: r.name, unit: '' }, a.dataset.snotify, box.dataset.action);
  });
  sf.role.addEventListener('change', () => {
    const pol = rolePolicy(sf.role.value);
    $('#staff-perms').innerHTML = permChecks(permsFor(sf.role.value));
    if (mode === 'approve') { sf.agreementRequired.checked = pol.agreement; sf.validUntil.value = plusDays(pol.days); }
  });
  $('[data-close]', sf).addEventListener('click', () => $('#staff-dialog').close());
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(sf), F = fb.F, db = fb.db, r = editingStaff;
    const role = String(fd.get('role')), perms = readPerms(fd), validUntil = endOfDay(String(fd.get('validUntil') || ''));
    const agreementRequired = Boolean(fd.get('agreementRequired'));
    if (mode !== 'reject' && validUntil && validUntil.toDate() < new Date()) return setMsg(sf, 'The “Access until” date has passed. Choose a later date or leave it empty.');
    await busy($('button[type=submit]', sf), async () => {
      try {
        if (mode === 'edit') {
          await F.updateDoc(F.doc(db, 'admins', r.uid), { role, perms, active: Boolean(fd.get('active')), agreementRequired, validUntil });
          $('#staff-dialog').close();
        } else if (mode === 'approve') {
          if (!Object.values(perms).some(Boolean)) return setMsg(sf, 'Give at least one kind of access.');
          const batch = F.writeBatch(db);
          batch.set(F.doc(db, 'admins', r.uid), { kind: 'staff', role, perms, name: r.name, email: r.email, mobile: r.mobile || '', org: r.org || '',
            active: true, agreementRequired, validUntil, createdAt: F.serverTimestamp(), invitedBy: uid, fromRequest: true });
          batch.update(F.doc(db, 'staffRequests', r.uid), { status: 'approved', decidedAt: F.serverTimestamp(), decidedBy: uid, decidedByEmail: fb.auth.currentUser?.email || '' });
          batch.set(F.doc(F.collection(db, 'memberLog')), { uid: r.uid, action: 'approved', by: uid, byEmail: fb.auth.currentUser?.email || '', at: F.serverTimestamp(),
            name: r.name, unit: '', reason: '', note: '', changes: `staff access as ${role}${validUntil ? ` until ${fd.get('validUntil')}` : ''}` });
          await batch.commit();
          $('#staff-dialog').close();
          staffNotify({ ...r, role, until: validUntil ? dateShort(validUntil.toDate()) : '', agreement: agreementRequired }, 'approved');
        } else {
          const reason = String(fd.get('reason') || '').trim().slice(0, 300);
          const batch = F.writeBatch(db);
          batch.update(F.doc(db, 'staffRequests', r.uid), { status: 'rejected', reason, decidedAt: F.serverTimestamp(), decidedBy: uid, decidedByEmail: fb.auth.currentUser?.email || '' });
          batch.set(F.doc(F.collection(db, 'memberLog')), { uid: r.uid, action: 'rejected', by: uid, byEmail: fb.auth.currentUser?.email || '', at: F.serverTimestamp(),
            name: r.name, unit: '', reason, note: '', changes: `staff request as ${r.role}` });
          await batch.commit();
          $('#staff-dialog').close();
          staffNotify({ ...r, reason }, 'rejected');
        }
        await loadStaff();
      } catch (err) { setMsg(sf, esc(errorText(err))); }
    });
  });

  $('#role-policy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form), roles = {};
    roleNames().forEach((r, i) => {
      roles[r] = { group: rolePolicy(r).group, perms: PERMS.map(([k]) => k).filter((k) => fd.get(`rp${i}_${k}`)),
        agreement: Boolean(fd.get(`rp${i}_agreement`)), days: Math.max(0, Math.min(3650, Math.round(Number(fd.get(`rp${i}_days`)) || 0))) };
    });
    await busy($('button[type=submit]', form), async () => {
      try {
        await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'rolePolicies'), { roles, updatedAt: fb.F.serverTimestamp(), updatedBy: uid });
        setRolePolicies(roles);
        renderRolePolicies();
        setMsg(form, 'Saved. New approvals and invitations use these settings.', true);
      } catch (err) { setMsg(form, esc(errorText(err))); }
    });
  });

  $('#staff-remove').addEventListener('click', async () => {
    if (!editingStaff || !confirm(`Remove all access for ${editingStaff.name || editingStaff.email}? Their past entries and agreement record stay.`)) return;
    try {
      await fb.F.deleteDoc(fb.F.doc(fb.db, 'admins', editingStaff.uid));
      if (editingStaff.email) await fb.F.deleteDoc(fb.F.doc(fb.db, 'staffInvites', editingStaff.email.toLowerCase())).catch(() => {});
      $('#staff-dialog').close();
      await loadStaff();
    } catch (err) { alert(errorText(err)); }
  });

  const ef = $('#agreement-edit');
  ef.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(ef);
    const lines = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const roles = {};
    for (const [k, v] of fd.entries()) if (k.startsWith('role_')) roles[k.slice(5)] = lines(v);
    const next = { title: String(fd.get('title')).trim(), intro: String(fd.get('intro')).trim(), common: lines(fd.get('common')),
      roles, closing: String(fd.get('closing')).trim(), version: (agreement?.version || 0) + 1,
      publishedAt: fb.F.serverTimestamp(), publishedBy: uid };
    if (!next.common.length) return setMsg(ef, 'Add at least one commitment.');
    if (!confirm(`Publish version ${next.version}? Every staff member must accept it again before they can work.`)) return;
    await busy($('button[type=submit]', ef), async () => {
      try {
        await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'staffAgreement'), next);
        setMsg(ef, `Version ${next.version} published.`, true);
        await loadStaff();
      } catch (err) { setMsg(ef, esc(errorText(err))); }
    });
  });
}

/* ---------------- my profile (everyone) ---------------- */

async function loadProfile() {
  const committee = isCommitteeRecord(me);
  $('#profile-facts').innerHTML = `
    <div><dt>Name</dt><dd>${esc(me.name || '—')}</dd></div>
    <div><dt>Sign-in email</dt><dd>${esc(me.email || '')}</dd></div>
    <div><dt>Role</dt><dd>${esc(committee ? `Managing Committee${me.role ? ' – ' + me.role : ''}` : me.role)}</dd></div>
    ${me.mobile ? `<div><dt>Mobile</dt><dd>+91 ${esc(me.mobile)}</dd></div>` : ''}
    <div><dt>Agreement</dt><dd>${committee ? 'Not required for committee members'
      : `Version ${me.agreementVersion} accepted as “${esc(me.agreementName || '')}” on ${esc(tsText(me.agreementAcceptedAt))}`}</dd></div>`;
  $('#profile-perms').innerHTML = PERMS.map(([k, label]) => `<tr><td>${esc(label)}</td><td>${can(me, k) ? '<span class="pill-ok">Yes</span>' : '<span class="pill-no">No</span>'}</td></tr>`).join('')
    + COMMITTEE_ONLY.map((c) => `<tr><td>${esc(c)}</td><td>${committee ? '<span class="pill-ok">Yes</span>' : '<span class="pill-no">Committee only</span>'}</td></tr>`).join('');
  $('#profile-agreement').innerHTML = committee || !agreement ? ''
    : `<details class="glossary"><summary>Read my accepted agreement</summary><article class="agreement mt-sm">${agreementHTML(agreement, me,
      { name: me.agreementName || '', when: tsText(me.agreementAcceptedAt), version: me.agreementVersion })}</article></details>`;
}

/* ---------------- unit file: account, I & J register, tenants, communication ---------------- */

let fileUnit = sessionStorage.getItem('fileUnit') || null;
let payFor = null;
let ufPane = 'account';
const ufCache = { members: [], tenants: [], comms: [], electricity: [], propertyTax: [], memberDocs: [], agreements: [] };
const fyChoices = () => { const now = Number(financialYear(todayIST()).slice(0, 4)); const out = []; for (let y = now + 1; y >= 2011; y--) out.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`); return out; };

const opt = (list) => list.map((v) => ({ v, l: v }));
const RECORDS = {
  members: {
    title: 'Member record',
    fields: [
      ['h', 'Member'],
      ['role', 'Type of membership', 'select', opt(['Member (owner)', 'Joint member', 'Associate member', 'Nominal member'])],
      ['name', 'Full name', 'text', null, true], ['address', 'Address', 'text', null, false, true],
      ['mobile', 'Mobile', 'tel'], ['email', 'Email', 'email'], ['occupation', 'Occupation', 'text'], ['ageAtAdmission', 'Age on admission', 'number'],
      ['h', 'Admission and shares (I register)'],
      ['admissionDate', 'Date of admission', 'date'], ['entranceFeeDate', 'Entrance fee paid on', 'date'], ['entranceFeeReceipt', 'Entrance fee receipt no.', 'text'],
      ['shareCertNo', 'Share certificate no.', 'text'], ['shareNos', 'Share numbers (from – to)', 'text'], ['shareValue', 'Value of shares (₹)', 'number'],
      ['iRegisterNo', 'I register serial no.', 'text'], ['jRegisterNo', 'J register serial no.', 'text'],
      ['h', 'Nomination'],
      ['nominee', 'Nominee name', 'text'], ['nomineeRelation', 'Relationship', 'text'], ['nominationDate', 'Nomination date', 'date'],
      ['h', 'Cessation (leave blank for a current member)'],
      ['cessationDate', 'Ceased to be a member on', 'date'], ['cessationReason', 'Reason (sale, transfer, death …)', 'text'],
      ['docLink', 'Document link (Index II, share certificate, nomination form)', 'url', null, false, true],
      ['remarks', 'Remarks', 'textarea', null, false, true]
    ]
  },
  tenants: {
    title: 'Tenancy',
    fields: [
      ['h', 'Tenant'],
      ['name', 'Tenant / licensee name(s)', 'text', null, true], ['mobile', 'Mobile', 'tel'], ['email', 'Email', 'email'],
      ['use', 'Use', 'select', opt(['Residential', 'Commercial / business'])], ['business', 'Business name (if commercial)', 'text'],
      ['from', 'Occupied from', 'date', null, true], ['to', 'Vacated on (blank if still there)', 'date'],
      ['h', 'Leave and licence agreement'],
      ['agreementType', 'Agreement type', 'select', opt(['Registered leave and licence', 'Notarised / unregistered', 'Other'])],
      ['agreementNo', 'Registration / document no.', 'text'], ['agreementDate', 'Agreement date', 'date'],
      ['agreementFrom', 'Agreement valid from', 'date'], ['agreementTo', 'Agreement valid till', 'date'],
      ['h', 'Police verification and society intimation'],
      ['policeDate', 'Police verification submitted on', 'date'], ['policeStation', 'Police station', 'text'], ['policeRef', 'Acknowledgement / ref. no.', 'text'],
      ['societyNocDate', 'Society NOC / intimation date', 'date'],
      ['docLink', 'Documents link (agreement, police verification, ID proof)', 'url', null, false, true],
      ['remarks', 'Remarks', 'textarea', null, false, true]
    ]
  },
  comms: {
    title: 'Communication',
    fields: [
      ['date', 'Date', 'date', null, true],
      ['kind', 'What it is', 'select', opt(['Application / request from the member', 'Society’s reply', 'Notice from the Society', 'Complaint', 'Letter / information', 'Other'])],
      ['channel', 'How', 'select', opt(['Letter', 'Notice', 'Email', 'WhatsApp', 'SMS', 'Phone call', 'Registered post', 'Meeting / visit'])],
      ['direction', 'Direction', 'select', opt(['Sent to member', 'Received from member', 'Sent to tenant', 'Received from tenant'])],
      ['subject', 'Subject', 'text', null, true, true],
      ['summary', 'Details', 'textarea', null, false, true],
      ['refNo', 'Reference / letter no.', 'text'], ['followUp', 'Follow up on', 'date'],
      ['docLink', 'Document link (copy of letter, email, acknowledgement)', 'url', null, false, true]
    ]
  },
  electricity: {
    title: 'Electricity bill',
    fields: [
      ['h', 'Connection'],
      ['consumerNo', 'Consumer no.', 'text', null, true], ['nameOnBill', 'Name on the bill', 'text'], ['meterNo', 'Meter no.', 'text'],
      ['tariff', 'Tariff category', 'select', opt(TARIFFS)], ['load', 'Sanctioned load (kW)', 'number'],
      ['h', 'Bill'],
      ['billMonth', 'Bill month', 'month', null, true], ['units', 'Units consumed', 'number'], ['amount', 'Bill amount (₹)', 'number'], ['dueDate', 'Due date', 'date'],
      ['remarks', 'Remarks', 'textarea', null, false, true]
    ]
  },
  propertyTax: {
    title: 'Property tax record',
    fields: [
      ['h', 'Pune Municipal Corporation record'],
      ['propertyNo', 'Property no. (PMC)', 'text', null, true], ['nameInRecord', 'Name in the PMC record', 'text'],
      ['usage', 'Use as assessed', 'select', opt(TAX_USES)], ['area', 'Assessed area (sq ft)', 'number'],
      ['h', 'Tax'],
      ['year', 'Financial year', 'select', opt(fyChoices()), true], ['tax', 'Property tax for the year (₹)', 'number'], ['arrears', 'Arrears shown (₹)', 'number'],
      ['paidOn', 'Paid on', 'date'], ['receiptNo', 'PMC receipt no.', 'text'],
      ['remarks', 'Remarks', 'textarea', null, false, true]
    ]
  }
};

const dd = (iso) => (iso ? ddmmyyyy(iso) : '');
const linkHTML = (u) => (u ? ` <a href="${esc(u)}" target="_blank" rel="noopener">Document</a>` : '');

async function loadUnitFile() {
  await loadDriveCfg(fb).catch(() => null);
  if (!fileUnit || !units.find((u) => u.id === fileUnit)) fileUnit = units[0]?.id;
  if (!fileUnit) { $('#uf-title').textContent = 'No units yet'; return; }
  $('#uf-pick').innerHTML = unitOptions(false);
  $('#uf-pick').value = fileUnit;
  const u = units.find((x) => x.id === fileUnit);
  const { F, db } = fb;
  const [ledgerSnap, billSnap, paySnap, memSnap, tenSnap, comSnap, elecSnap, taxSnap, mdocSnap, agSnap] = await Promise.all([
    F.getDocs(F.collection(db, 'units', fileUnit, 'ledger')),
    F.getDocs(F.query(F.collection(db, 'bills'), F.where('unitId', '==', fileUnit))),
    F.getDocs(F.query(F.collection(db, 'payments'), F.where('unitId', '==', fileUnit))),
    F.getDocs(F.collection(db, 'units', fileUnit, 'members')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'tenants')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'comms')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'electricity')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'propertyTax')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'memberDocs')).catch(() => ({ docs: [] })),
    F.getDocs(F.query(F.collection(db, 'memberAgreements'), F.where('unit', '==', fileUnit))).catch(() => ({ docs: [] }))
  ]);
  ufCache.members = memSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.admissionDate || '').localeCompare(a.admissionDate || ''));
  ufCache.tenants = tenSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.from || '').localeCompare(a.from || ''));
  ufCache.comms = comSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  ufCache.electricity = elecSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.billMonth || '').localeCompare(a.billMonth || ''));
  ufCache.propertyTax = taxSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.year || '').localeCompare(a.year || ''));
  const signs = commercialSigns(u, ufCache);
  const kindOrder = Object.keys(MEMBER_DOC_KINDS);
  ufCache.memberDocs = mdocSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
  ufCache.agreements = agSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.acceptedAt?.seconds || 0) - (a.acceptedAt?.seconds || 0));

  const currentTenants = ufCache.tenants.filter((t) => !t.to);
  $('#uf-title').textContent = `${u.unit}, ${blockName(u.block)}`;
  $('#uf-sub').innerHTML = [esc(u.name || 'No name on record'), esc(u.type), esc(catName(u)), `Lift: ${liftGroupFor(u) || 'none'}`, `Water: ${Number(u.inlets) > 0 ? 'yes' : 'no'}`, u.carpetArea ? `${fmt(u.carpetArea)} sq ft carpet` : ''].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const lastBill = billSnap.docs.map((d) => d.data()).sort((a, b) => b.month.localeCompare(a.month))[0];
  $('#uf-cards').innerHTML = `
    <div><dt>Balance today (₹)</dt><dd>${amt(u.balance)}</dd></div>
    <div><dt>Unpaid interest included (₹)</dt><dd>${fmt(u.interestDue || 0)}</dd></div>
    <div><dt>Builder pending maintenance (₹)</dt><dd>${u.bpm ? fmt(u.bpm) : '—'}</dd></div>
    <div><dt>Occupancy</dt><dd>${currentTenants.length ? `<span class="pill warn">Rented</span> <small>${esc(currentTenants.map((t) => t.name).join(', '))}</small>` : `<span class="pill ok">${esc(u.status || 'Own / not set')}</span>`}${signs.length ? ' <span class="pill warn">Commercial use?</span>' : ''}</dd></div>
    <div><dt>Last bill</dt><dd>${lastBill ? `${esc(lastBill.billNo)}<small class="muted"> ₹ ${fmt(lastBill.total)}</small>` : '—'}</dd></div>`;

  // Account
  const liveEntries = ledgerSnap.docs.map((d) => d.data()).sort((a, b) => a.date.localeCompare(b.date) || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  ufHistory = await loadHistory(fb, fileUnit);
  if (!auditCache.length) auditCache = await loadAuditYears(fb).catch(() => []);
  ufOld = await loadPastReceipts(fb, fileUnit);
  const entries = mergeLedger(liveEntries, ufHistory, preLedger(fileUnit, auditCache, ufOld));
  ufEntries = entries;
  const fys = entries.length ? fyList(entries[0].date, todayIST()) : [financialYear(todayIST())];
  const pick = $('#uf-fy'), keep = pick.value;
  pick.innerHTML = '<option value="">All years</option>' + fys.map((f) => `<option value="${f}">${f}</option>`).join('');
  pick.value = fys.includes(keep) ? keep : '';
  renderUfLedger();
  $('#uf-bills').innerHTML = billSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month))
    .map((b) => `<tr><td>${esc(b.billNo)}</td><td>${monthLabel(b.month)}</td><td class="num">${amt(b.total)}</td><td><a href="print.html?bill=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">View</a></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No bills.</td></tr>';
  dupPays = paySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  initDupPane(u).catch((err) => console.warn('duplicate receipts', err));
  $('#uf-receipts').innerHTML = paySnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => `<tr><td>${esc(p.receiptNo)}${p.status === 'cancelled' ? ' <span class="status-pill cancelled">Cancelled</span>' : ''}</td><td>${dd(p.date)}</td><td>${esc(p.mode)}</td><td class="num">${fmt(p.amount)}</td><td><a href="print.html?receipt=${p.id}" target="_blank" rel="noopener">View</a></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No receipts.</td></tr>';

  const editBtn = (kind, id) => (canDo('unitRecords') ? `<button class="btn btn-small" type="button" data-rec="${kind}" data-id="${esc(id)}">Edit</button>` : '');

  // Members (I & J register)
  $('#uf-members').innerHTML = ufCache.members.map((m) => `<tr>
    <td><strong>${esc(m.name)}</strong>${m.address ? `<span class="sub">${esc(m.address)}</span>` : ''}${linkHTML(m.docLink)}${docChips('members', m)}</td>
    <td>${esc(m.role || '')}</td>
    <td>${m.mobile ? `<a href="tel:+91${esc(m.mobile)}">${esc(m.mobile)}</a>` : ''}${m.email ? `<span class="sub">${esc(m.email)}</span>` : ''}</td>
    <td>${dd(m.admissionDate)}${m.entranceFeeDate ? `<span class="sub">Entrance fee ${dd(m.entranceFeeDate)}</span>` : ''}</td>
    <td>${esc(m.shareCertNo || '')}${m.shareNos ? `<span class="sub">Shares ${esc(m.shareNos)}</span>` : ''}</td>
    <td>${esc(m.iRegisterNo || '—')} / ${esc(m.jRegisterNo || '—')}</td>
    <td>${esc(m.nominee || '')}${m.nomineeRelation ? `<span class="sub">${esc(m.nomineeRelation)}</span>` : ''}</td>
    <td>${m.cessationDate ? `<span class="pill past">Ceased ${dd(m.cessationDate)}</span><span class="sub">${esc(m.cessationReason || '')}</span>` : '<span class="pill ok">Current</span>'}</td>
    <td>${editBtn('members', m.id)}</td></tr>`).join('')
    || '<tr><td colspan="9" class="empty">No member records yet. Add the details from the I and J registers.</td></tr>';

  // Tenants
  const today = todayIST();
  $('#uf-tenants').innerHTML = ufCache.tenants.map((t) => {
    const current = !t.to;
    const warns = [];
    if (current && t.agreementTo && t.agreementTo < today) warns.push('Agreement expired');
    if (current && !t.policeDate) warns.push('No police verification');
    if (current && !t.agreementNo) warns.push('No agreement on record');
    return `<tr>
      <td><strong>${esc(t.name)}</strong>${t.mobile ? `<span class="sub">${esc(t.mobile)}</span>` : ''}${linkHTML(t.docLink)}${docChips('tenants', t)}</td>
      <td>${esc(t.use || '')}${t.business ? `<span class="sub">${esc(t.business)}</span>` : ''}</td>
      <td>${dd(t.from)} – ${t.to ? dd(t.to) : 'now'}</td>
      <td>${esc(t.agreementType || '')}${t.agreementNo ? `<span class="sub">No. ${esc(t.agreementNo)}</span>` : ''}${t.agreementTo ? `<span class="sub">Valid ${t.agreementFrom ? `${dd(t.agreementFrom)} – ` : 'till '}${dd(t.agreementTo)}</span>` : ''}</td>
      <td>${t.policeDate ? `${dd(t.policeDate)}<span class="sub">${esc(t.policeStation || '')} ${esc(t.policeRef || '')}</span>` : '—'}</td>
      <td>${current ? '<span class="pill ok">Current</span>' : '<span class="pill past">Past</span>'}${warns.map((w) => ` <span class="pill warn">${w}</span>`).join('')}</td>
      <td>${editBtn('tenants', t.id)}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No tenancies recorded.</td></tr>';

  // Communication
  $('#uf-comms').innerHTML = ufCache.comms.map((c) => `<tr>
    <td>${dd(c.date)}</td><td>${esc(c.channel || '')}${c.kind ? `<span class="sub">${esc(c.kind)}</span>` : ''}</td><td>${esc(c.direction || '')}</td>
    <td><strong>${esc(c.subject)}</strong>${c.summary ? `<span class="sub">${esc(c.summary)}</span>` : ''}${linkHTML(c.docLink)}${docChips('comms', c)}</td>
    <td>${esc(c.refNo || '')}</td><td>${c.followUp ? `<span class="${c.followUp <= today ? 'pill warn' : ''}">${dd(c.followUp)}</span>` : ''}</td>
    <td>${editBtn('comms', c.id)}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No communication recorded.</td></tr>';

  // Electricity and property tax (3.12)
  $('#uf-electricity').innerHTML = ufCache.electricity.map((r) => `<tr>
    <td>${r.billMonth ? monthLabel(r.billMonth) : ''}</td><td>${esc(r.consumerNo || '')}${r.meterNo ? `<span class="sub">Meter ${esc(r.meterNo)}</span>` : ''}</td>
    <td>${esc(r.nameOnBill || '')}</td><td>${esc(r.tariff || '')}${r.load ? `<span class="sub">${fmt(r.load)} kW</span>` : ''}</td>
    <td class="num">${r.units != null && r.units !== '' ? fmt(r.units) : ''}</td><td class="num">${r.amount != null && r.amount !== '' ? fmt(r.amount) : ''}</td>
    <td>${docChips('electricity', r) || '—'}</td><td>${editBtn('electricity', r.id)}</td></tr>`).join('')
    || '<tr><td colspan="8" class="empty">No electricity bills recorded.</td></tr>';
  $('#uf-propertyTax').innerHTML = ufCache.propertyTax.map((r) => `<tr>
    <td>${esc(r.year || '')}</td><td>${esc(r.propertyNo || '')}</td><td>${esc(r.nameInRecord || '')}</td>
    <td>${esc(r.usage || '')}${r.area ? `<span class="sub">${fmt(r.area)} sq ft</span>` : ''}</td>
    <td class="num">${r.tax != null && r.tax !== '' ? fmt(r.tax) : ''}${r.arrears ? `<span class="sub">Arrears ${fmt(r.arrears)}</span>` : ''}</td>
    <td>${r.paidOn ? `${dd(r.paidOn)}${r.receiptNo ? `<span class="sub">${esc(r.receiptNo)}</span>` : ''}` : '<span class="pill warn">Not recorded</span>'}</td>
    <td>${docChips('propertyTax', r) || '—'}</td><td>${editBtn('propertyTax', r.id)}</td></tr>`).join('')
    || '<tr><td colspan="8" class="empty">No property tax records.</td></tr>';
  $('#ut-flag').innerHTML = signs.length
    ? `<div class="ut-flag" role="status"><h3>Possible commercial use of a residential flat</h3><ul>${signs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
       <p>The Society’s records show <strong>${esc(u.type || 'Residential Flat')}</strong>. Check with the member. If the flat is used for business, record a notice under Communication and change the type to <em>Residential, using as Commercial</em> in <strong>Edit unit details</strong>, so the right charges apply from the next bill.</p></div>`
    : (ufCache.electricity.length || ufCache.propertyTax.length ? `<p class="ut-ok">No sign of commercial use in the latest electricity and property tax records.</p>` : '');
  showBackupNote().catch(() => {});
  renderMemberDocsPane();
  lettersForUnit(fb, fileUnit).then((ls) => {
    $('#uf-letters').innerHTML = ls.map((x) => `<tr><td>${esc(x.no)}</td><td>${dd(x.date)}</td><td>${esc(x.party)}<span class="sub">${esc(x.partyType || '')}</span></td>
      <td>${esc(x.subject)}${(x.files || []).length ? `<span class="sub">📎 ${x.files.length} scan${x.files.length > 1 ? 's' : ''} (open in Correspondence)</span>` : ''}</td><td>${esc(letterStatus(x.status))}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No correspondence recorded about this unit.</td></tr>';
  }).catch(() => {});

  // Audited history (2011-12 to 2017-18) and year-end balances.
  if (!auditCache.length) auditCache = await loadAuditYears(fb).catch(() => []);
  const ye = yearEndRows(fileUnit, auditCache, ufEntries, todayIST());
  $('#uf-years').innerHTML = ye.map((r) => `<tr><td>${esc(r.fy)}</td><td>${dd(r.asOn)}</td><td><span class="src-tag">${esc(r.source)}</span></td><td>${esc(r.name)}</td>
    <td class="num">${r.amount == null ? '—' : amt(r.amount)}</td><td class="muted">${esc(r.note)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No year-end figures yet.</td></tr>';
  const hc = auditCache.length ? handoverCheck(fileUnit, auditCache, ufHistory) : null;
  $('#uf-handover').hidden = !hc;
  if (hc) $('#uf-handover').innerHTML = `<strong>Audit to Tally, 2018:</strong> ${esc(hc.text)} ${hc.ok ? '<span class="pill ok">Matches</span>' : '<span class="pill warn">Check</span>'}`;
  const bh = bpmHistory(fileUnit, auditCache);
  $('#uf-bpm').innerHTML = bh.length ? `<h3 class="mt-sm">Builder pending maintenance (audited)</h3>
    <div class="table-scroll"><table><thead><tr>${bh.map((b) => `<th class="num">${esc(b.fy)}</th>`).join('')}<th class="num">Today</th></tr></thead>
    <tbody><tr>${bh.map((b) => `<td class="num">${fmt(b.amount)}</td>`).join('')}<td class="num">${u.bpm ? fmt(u.bpm) : '—'}</td></tr></tbody></table></div>` : '';
  const names = namePeriods(memberNamesFor(fileUnit, auditCache));
  const roles = [...new Set(auditCache.flatMap((a) => (a.committee || []).filter((c) => c.unitId === fileUnit).map((c) => `${c.role}: ${c.name} (${a.fy})`)))];
  const roleRange = auditCache.length && roles.length ? (() => {
    const by = {};
    auditCache.forEach((a) => (a.committee || []).filter((c) => c.unitId === fileUnit).forEach((c) => { const k = `${c.role} – ${c.name}`; (by[k] ??= []).push(a.fy); }));
    return Object.entries(by).map(([k, fys]) => `${esc(k)} (${fys[0]} to ${fys[fys.length - 1]})`);
  })() : [];
  $('#uf-audit-names').innerHTML = auditCache.length ? `<h3 class="mt-sm">In the audited records (2011-12 to 2017-18)</h3>
    <p class="muted small-note">From the list of members and the managing committee attached to each audit report. Add these to the register above with admission and share details if they are missing.</p>
    <div class="table-scroll"><table><thead><tr><th>Name in the audited list of members</th><th>Years</th></tr></thead><tbody>
    ${names.map((n) => `<tr><td>${esc(n.name || '(no name in the list)')}</td><td>${esc(n.from)}${n.to !== n.from ? ` to ${esc(n.to)}` : ''}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">This unit is not in the audited list of members.</td></tr>'}
    </tbody></table></div>
    ${roleRange.length ? `<p><strong>Managing committee:</strong> ${roleRange.join('; ')}</p>` : ''}` : '';

  renderOldReceipts();
  showUfPane(ufPane);
  applyAccess();
}

/* ---------- Duplicate receipts (3.11): copies of any payment recorded for the unit ---------- */
let dupPays = [], dupRows = [];
const DUP_SRC = { web: 'These accounts', tally: 'Tally', old: 'Past committee' };
const r2 = (n) => Math.round(n * 100) / 100;
/** Name in a Tally ledger title such as "C 202 Mr Om Prakash Singh". */
const tallyName = (t) => String(t || '').replace(/^\s*(GF|A|B|C|D)\s*-?\s*\d+\s*[AB]?(?![A-Za-z])\s*/i, '').trim();

function buildDupRows() {
  const rows = [];
  for (const p of dupPays) {
    rows.push({ key: `web:${p.id}`, src: 'web', date: p.date, no: p.receiptNo, amount: p.amount, cancelled: p.status === 'cancelled',
      paidBy: [p.mode, p.reference].filter(Boolean).join(' '), towards: p.note || '', p });
  }
  if (ufHistory) {
    let bal = ufHistory.opening?.amount || 0;
    (ufHistory.entries || []).forEach((e, i) => {
      const before = bal;
      bal = r2(bal + (e.debit || 0) - (e.credit || 0));
      if (e.vchType === 'Receipt' && e.credit > 0) {
        rows.push({ key: `tally:${i}`, src: 'tally', date: e.date, no: `Tally ${e.vchNo}`, amount: e.credit, before: r2(before), after: bal,
          paidBy: /cash/i.test(e.particulars) ? 'Cash' : `Into ${e.particulars}`, towards: '', e });
      }
    });
  }
  for (const r of ufOld.filter(prCounts)) {
    rows.push({ key: `old:${r.id}`, src: 'old', date: r.date, no: r.receiptNo, amount: r.amount, paidBy: r.mode || '',
      towards: [r.head, r.period].filter(Boolean).join(', '), r });
  }
  return rows.filter((x) => x.date).sort((a, b) => b.date.localeCompare(a.date) || String(b.no).localeCompare(String(a.no), undefined, { numeric: true }));
}

async function initDupPane(u) {
  dupRows = buildDupRows();
  const fys = [...new Set(dupRows.map((x) => financialYear(x.date)))].sort().reverse();
  const keep = $('#dup-fy').value;
  $('#dup-fy').innerHTML = '<option value="">All years</option>' + fys.map((f) => `<option value="${f}">${f}</option>`).join('');
  $('#dup-fy').value = fys.includes(keep) ? keep : '';
  $('#dup-name').value = u.name || tallyName(ufHistory?.title) || '';
  renderDupRows();
  await loadDupLog();
}

function renderDupRows() {
  const fy = $('#dup-fy').value, src = $('#dup-src').value;
  const shown = dupRows.filter((x) => (!fy || financialYear(x.date) === fy) && (!src || x.src === src));
  const picked = new Set($$('#dup-rows input:checked').map((c) => c.value));
  $('#dup-rows').innerHTML = shown.map((x) => `<tr${picked.has(x.key) ? ' class="picked"' : ''}>
    <td><input type="checkbox" value="${esc(x.key)}"${picked.has(x.key) ? ' checked' : ''} aria-label="Receipt ${esc(x.no)} of ${dd(x.date)}"></td>
    <td>${dd(x.date)}</td><td>${esc(x.no)}${x.cancelled ? ' <span class="status-pill cancelled">Cancelled</span>' : ''}</td>
    <td><span class="pill${x.src === 'web' ? '' : ' past'}">${DUP_SRC[x.src]}</span></td>
    <td>${esc(x.paidBy)}</td><td>${esc(x.towards)}</td><td class="num">${fmt(x.amount)}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No payments recorded for this unit in this selection.</td></tr>';
  dupCount();
}

function dupCount() {
  const keys = $$('#dup-rows input:checked').map((c) => c.value);
  const total = dupRows.filter((x) => keys.includes(x.key)).reduce((t, x) => t + x.amount, 0);
  $('#dup-count').textContent = keys.length ? `${keys.length} receipt${keys.length > 1 ? 's' : ''} selected, ₹ ${fmt(total)}` : 'Nothing selected';
  $('#dup-print').disabled = !keys.length;
  $('#dup-print').textContent = keys.length ? `Print ${keys.length} duplicate receipt${keys.length > 1 ? 's' : ''}` : 'Print duplicate receipts';
  const boxes = $$('#dup-rows input[type=checkbox]');
  $('#dup-all').checked = boxes.length > 0 && boxes.every((c) => c.checked);
  $('#dup-all').indeterminate = keys.length > 0 && !$('#dup-all').checked;
  $$('#dup-rows tr').forEach((tr) => tr.classList.toggle('picked', !!tr.querySelector('input:checked')));
}

/** What is printed on each copy; stored with the record of the duplicate so it can be opened again later. */
function dupReceipt(x, name) {
  if (x.src === 'web') {
    const p = x.p, out = { recordedIn: `These accounts, receipt ${p.receiptNo}`, receiptNo: p.receiptNo, date: p.date, name: p.name || name, amount: p.amount, mode: p.mode || '' };
    for (const k of ['reference', 'bank', 'billNo', 'note', 'balanceBefore', 'balanceAfter', 'status']) if (p[k] !== undefined && p[k] !== null && p[k] !== '') out[k] = p[k];
    out.paymentId = p.id;
    return out;
  }
  if (x.src === 'tally') {
    return { recordedIn: `The Society’s Tally books, receipt voucher No. ${x.e.vchNo}`, receiptNo: `${x.e.vchNo} (Tally)`, date: x.date, name, amount: x.amount,
      mode: x.paidBy, balanceBefore: x.before, balanceAfter: x.after };
  }
  return { recordedIn: `The past committee’s receipt book, receipt No. ${x.r.receiptNo}`, receiptNo: `${x.r.receiptNo} (old receipt book)`, date: x.date, name,
    amount: x.amount, mode: x.paidBy, ...(x.towards ? { towards: x.towards } : {}) };
}

async function issueDuplicates(e) {
  e.preventDefault();
  const form = e.currentTarget, fd = new FormData(form);
  if (!requireOnline(form)) return;
  const keys = $$('#dup-rows input:checked').map((c) => c.value);
  const picked = dupRows.filter((x) => keys.includes(x.key)).sort((a, b) => a.date.localeCompare(b.date));
  const name = String(fd.get('name') || '').trim();
  const details = String(fd.get('details') || '').trim();
  const reason = fd.get('reason') === 'other' ? details : [fd.get('reason'), details].filter(Boolean).join(': ');
  if (!picked.length) return setMsg(form, 'Tick at least one payment.');
  if (picked.length > 60) return setMsg(form, 'Please print at most 60 receipts at a time.');
  if (!name && picked.some((x) => x.src !== 'web')) return setMsg(form, 'Write the name to print on the receipts.');
  if (!reason) return setMsg(form, 'Write the reason in Details.');
  const u = units.find((x) => x.id === fileUnit);
  // Open the window now (browsers only allow it straight after a click), then send it to the receipts.
  const win = inApp ? null : window.open('', '_blank');
  const btn = $('#dup-print'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
  try {
    const { F, db, auth } = fb;
    const fy = financialYear(todayIST());
    const ref = F.doc(F.collection(db, 'receiptCopies'));
    const no = await F.runTransaction(db, async (tx) => {
      const cRef = F.doc(db, 'counters', `duplicates-${fy}`), c = await tx.get(cRef);
      const n = c.exists() ? Number(c.data().next) || 1 : 1;
      const refNo = `DUP/${fy}/${String(n).padStart(4, '0')}`;
      tx.set(cRef, { next: n + 1 });
      tx.set(ref, {
        ref: refNo, unitId: fileUnit, unit: u.unit, issuedOn: todayIST(), reason,
        issuedBy: auth.currentUser.uid, issuedByName: me?.name || auth.currentUser.email || '', createdAt: F.serverTimestamp(),
        receipts: picked.map((x) => dupReceipt(x, name)), total: r2(picked.reduce((t, x) => t + x.amount, 0))
      });
      return refNo;
    });
    const url = `print.html?copies=${ref.id}`;
    if (win) win.location.href = url;
    setMsg(form, `${esc(no)}: ${picked.length} duplicate receipt${picked.length > 1 ? 's' : ''} ready. <a href="${url}" target="_blank" rel="noopener">Open the duplicate receipts</a>`, true);
    $$('#dup-rows input:checked').forEach((c) => (c.checked = false));
    dupCount();
    await loadDupLog();
  } catch (err) {
    if (win) win.close();
    setMsg(form, errorText(err));
  } finally { btn.removeAttribute('aria-busy'); dupCount(); }
}

async function loadDupLog() {
  const { F, db } = fb;
  const snap = await F.getDocs(F.query(F.collection(db, 'receiptCopies'), F.where('unitId', '==', fileUnit))).catch(() => ({ docs: [] }));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  $('#dup-log').innerHTML = list.map((c) => `<tr><td>${esc(c.ref || '')}</td><td>${dd(c.issuedOn)}</td><td>${esc(c.issuedByName || '')}</td>
    <td>${(c.receipts || []).map((r) => `${esc(r.receiptNo)} <span class="muted">(${dd(r.date)}, ₹ ${fmt(r.amount)})</span>`).join('<br>')}</td>
    <td>${esc(c.reason || '')}</td><td><a href="print.html?copies=${c.id}" target="_blank" rel="noopener">Open</a></td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No duplicates issued yet.</td></tr>';
}

let ufOld = [];
let ufEntries = [];
let ufHistory = null;
/** Unit ledger, all years or one financial year with its opening and closing balance. */
function renderUfLedger() {
  const fy = $('#uf-fy').value;
  let bal = 0, rows = '';
  const line = (e) => {
    bal += (e.debit || 0) - (e.credit || 0);
    const tag = e.source === 'tally' ? ' <span class="pill past">Tally</span>' : e.source === 'difference' ? ' <span class="pill warn">Check</span>'
      : e.source === 'archive' ? ' <span class="pill past">Old receipt</span>' : e.source === 'audit' ? ' <span class="pill past">Audit</span>' : '';
    return `<tr${e.kind === 'memo' ? ' class="muted"' : ''}><td>${dd(e.date)}</td><td>${esc(e.particulars)}${tag}</td><td>${esc(e.receipt || '')}</td><td class="num">${e.debit ? fmt(e.debit) : ''}</td><td class="num">${e.credit ? fmt(e.credit) : ''}</td><td class="num">${amt(bal)}</td></tr>`;
  };
  const oldNote = ufOld.length || auditCache.length ? `<tr class="fy-line"><td colspan="6" class="muted">2011-12 to 2017-18: receipts from the past committee’s sheets (marked Old receipt) and, at each 31 March, a balancing figure to the audited balance (marked Audit).</td></tr>` : '';
  const note = oldNote + (ufHistory ? `<tr class="fy-line"><td colspan="6" class="muted">Entries up to ${dd(ufHistory.takeoverDate)} are from the Society’s Tally ledger (${esc(ufHistory.period || '')}); later entries are from these accounts.${(ufHistory.after || []).length ? ` Tally also has ${ufHistory.after.length} entr${ufHistory.after.length > 1 ? 'ies' : 'y'} after that date, not carried over: ${esc(ufHistory.after.map((e) => `${dd(e.date)} ${e.particulars} ₹ ${fmt(e.debit || e.credit)}`).join('; '))}.` : ''}</td></tr>` : '');
  if (!fy) rows = note + ufEntries.map(line).join('');
  else {
    const { from, to } = fyBounds(fy);
    const before = ufEntries.filter((e) => e.date < from);
    bal = before.reduce((a, e) => a + (e.debit || 0) - (e.credit || 0), 0);
    rows = `<tr class="fy-line"><td>${dd(from)}</td><td colspan="4"><strong>Opening balance on 1 April</strong></td><td class="num"><strong>${amt(bal)}</strong></td></tr>`
      + ufEntries.filter((e) => e.date >= from && e.date <= to).map(line).join('')
      + (to < todayIST()
        ? `<tr class="fy-line"><td>${dd(to)}</td><td colspan="4"><strong>Closing balance on 31 March</strong></td><td class="num"><strong>${amt(bal)}</strong></td></tr>`
        : `<tr class="fy-line"><td>${dd(todayIST())}</td><td colspan="4"><strong>Balance so far (year not yet ended)</strong></td><td class="num"><strong>${amt(bal)}</strong></td></tr>`);
  }
  $('#uf-ledger').innerHTML = rows || '<tr><td colspan="6" class="empty">No entries.</td></tr>';
}

function showUfPane(name) {
  ufPane = name;
  $$('#uf-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pane === name)));
  $$('.uf-pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
}

let recKind = null, recId = null;
function openRecord(kind, id) {
  recKind = kind; recId = id || null;
  const def = RECORDS[kind];
  const data = id ? ufCache[kind].find((r) => r.id === id) || {} : (kind === 'comms' ? { date: todayIST() } : {});
  $('#rec-title').textContent = `${id ? 'Edit' : 'Add'} ${def.title.toLowerCase()}: ${units.find((u) => u.id === fileUnit)?.unit || ''}`;
  $('#rec-fields').innerHTML = def.fields.map(([k, label, type, options, req, wide]) => {
    if (k === 'h') return `<h3>${esc(label)}</h3>`;
    const v = data[k] ?? '';
    const cls = wide ? ' class="full"' : '';
    if (type === 'select') return `<label${cls}>${esc(label)}<select name="${k}"><option value=""></option>${options.map((o) => `<option ${o.v === v ? 'selected' : ''}>${esc(o.v)}</option>`).join('')}</select></label>`;
    if (type === 'textarea') return `<label${cls}>${esc(label)}<textarea name="${k}" rows="3">${esc(v)}</textarea></label>`;
    return `<label${cls}>${esc(label)}${req ? ' *' : ''}<input type="${type}" name="${k}" value="${esc(v)}" ${req ? 'required' : ''}></label>`;
  }).join('');
  recFiles = (data.files || []).map((f) => ({ ...f, keep: true }));
  recNew = [];
  $('#rec-file-input').value = '';
  const ready = driveReady();
  $('#rec-file-input').disabled = !ready;
  $('#rec-files-note').textContent = ready ? `Kept in the Society’s Google Drive: Units › ${wingName()} › ${units.find((u) => u.id === fileUnit)?.unit || ''} › ${RECORD_FOLDER[kind]}.`
    : 'The Society’s Google Drive isn’t connected yet (Expenses → Set-up), so scans can’t be added.';
  renderRecFiles();
  setMsg($('#rec-form'), '');
  $('#rec-dialog').showModal();
}

/* ---------- documents from the member and portal agreements (3.13) ---------- */
let ackDoc = null, ackMode = 'ack';
function renderMemberDocsPane() {
  const waiting = ufCache.memberDocs.filter((d) => d.status === 'submitted').length;
  $('#mdocs-count').hidden = !waiting;
  $('#mdocs-count').textContent = waiting;
  const can = canDo('unitRecords');
  $('#uf-mdocs').innerHTML = ufCache.memberDocs.map((d) => {
    const st = DOC_STATUS[d.status] || DOC_STATUS.submitted;
    return `<tr><td>${whenShort(d.submittedAt)}<span class="sub">${esc(d.submittedByName || '')}${d.relation ? `, ${esc(relationLabel(d.relation))}` : ''}</span></td>
      <td><strong>${esc(MEMBER_DOC_KINDS[d.kind]?.short || d.kind)}</strong><span class="sub">${esc(d.title || '')}</span></td>
      <td>${detailLines(d.kind, d.details).map((l) => esc(l).replace(/\n/g, '<br>')).join('<br>')}</td>
      <td>${docChips('memberDocs', d) || '—'}</td>
      <td><span class="doc-pill ${st.cls}">${d.status === 'submitted' ? 'Waiting for physical copy' : esc(st.text)}</span>
        ${d.ack ? `<span class="sub">${esc(d.ack.no)}, ${dd(d.ack.date)}${d.ack.byName ? `, ${esc(d.ack.byName)}` : ''}${d.ack.note ? `<br>${esc(d.ack.note)}` : ''}</span>` : ''}
        ${d.status === 'returned' && d.review?.reason ? `<span class="sub">${esc(d.review.reason)}</span>` : ''}</td>
      <td>${can && d.status !== 'acknowledged' ? `<div class="row-actions"><button class="btn btn-small btn-primary" type="button" data-ack="${esc(d.id)}">Acknowledge</button>
        <button class="btn btn-small" type="button" data-return="${esc(d.id)}">Return</button></div>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Nothing uploaded by the member yet.</td></tr>';
  $('#uf-agreements').innerHTML = ufCache.agreements.map((a) => `<tr><td>${esc(a.signedName)}<span class="sub">${esc(a.email)}${a.relation ? `, ${esc(relationLabel(a.relation))}` : ''}</span></td>
      <td>${esc(a.version)}</td><td>${whenShort(a.acceptedAt)}</td>
      <td>${a.pdf ? `<button class="doc-chip" type="button" data-doc="agreements" data-rid="${esc(a.id)}" data-fid="${esc(a.pdf.id)}">📎 PDF</button>` : '<span class="muted">Not saved yet</span>'}
        <span class="sub">${a.emailed ? `Emailed to ${esc(a.emailedTo)}` : a.emailNote ? `Not emailed: ${esc(a.emailNote)}` : ''}${a.resentAt ? `; sent again ${whenShort(a.resentAt)}` : ''}</span></td>
      <td>${canDo('members') ? `<button class="btn btn-small" type="button" data-resend="${esc(a.id)}">Send copy again</button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No one from this unit has accepted the portal agreement yet.</td></tr>';
}

function openAck(id, mode) {
  ackDoc = ufCache.memberDocs.find((d) => d.id === id);
  if (!ackDoc) return;
  ackMode = mode;
  const f = $('#ack-form');
  f.reset();
  f.date.value = todayIST();
  $('#ack-title').textContent = mode === 'ack' ? 'Acknowledge the physical copy' : 'Return to the member for correction';
  $('#ack-what').textContent = `${MEMBER_DOC_KINDS[ackDoc.kind]?.label || ''}: ${ackDoc.title || ''}`;
  $('#ack-ack').hidden = mode !== 'ack';
  $('#ack-return').hidden = mode === 'ack';
  setMsg(f, '');
  $('#ack-dialog').showModal();
}

async function saveAck(e) {
  e.preventDefault();
  const f = e.currentTarget, { F, db } = fb;
  const ref = F.doc(db, 'units', fileUnit, 'memberDocs', ackDoc.id), byName = me?.name || fb.auth.currentUser.email || '';
  await busy($('button[type=submit]', f), async () => {
    try {
      if (ackMode === 'ack') {
        if (!f.date.value) return setMsg(f, 'Enter the date the physical copy was received.');
        const fy = financialYear(f.date.value);
        await F.runTransaction(db, async (tx) => {
          const cRef = F.doc(db, 'counters', `acks-${fy}`), c = await tx.get(cRef);
          const n = c.exists() ? Number(c.data().next) || 1 : 1;
          tx.set(cRef, { next: n + 1 });
          tx.update(ref, { status: 'acknowledged', ack: { no: `ACK/${fy}/${String(n).padStart(4, '0')}`, date: f.date.value, note: f.note.value.trim(), by: uid, byName, at: F.serverTimestamp() },
            updatedAt: F.serverTimestamp(), updatedBy: uid });
        });
      } else {
        const reason = f.reason.value.trim();
        if (reason.length < 5) return setMsg(f, 'Write what needs to be corrected; the member sees it.');
        await F.updateDoc(ref, { status: 'returned', review: { reason, by: uid, byName, at: F.serverTimestamp() }, updatedAt: F.serverTimestamp(), updatedBy: uid });
      }
      $('#ack-dialog').close();
      await loadUnitFile();
      showUfPane('mdocs');
      backupThisUnit(fileUnit);
    } catch (err) { setMsg(f, esc(errorText(err))); }
  });
}

async function resendAgreement(id, btn, msg = $('#uf-mdocs-msg'), after = async () => { await loadUnitFile(); showUfPane('mdocs'); }) {
  await busy(btn, async () => {
    try {
      const r = await driveCall(fb, 'resendAgreement', { agreementId: id });
      const { F, db } = fb;
      await F.updateDoc(F.doc(db, 'memberAgreements', id), { pdf: r.pdf, emailed: Boolean(r.emailed), emailedTo: r.emailedTo || '', cc: r.cc || '', emailNote: r.note || '', resentAt: F.serverTimestamp(), resentBy: uid });
      msg.className = 'form-msg ok';
      msg.textContent = r.emailed ? `Copy emailed to ${r.emailedTo}, with a copy to ${r.cc}.` : `Saved in the unit’s Agreements folder, but not emailed: ${r.note}`;
      if (!r.emailed) msg.className = 'form-msg';
      await after();
    } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
  });
}

/* ---------- Members tab: the member portal agreement (3.13) ---------- */
let maCurrent = null, maFilled = false;
async function loadMemberAgreementBox(appr) {
  const { F, db } = fb;
  const s = await F.getDoc(F.doc(db, 'settings', 'memberAgreement')).catch(() => null);
  const v = s?.exists() ? Number(s.data().version) || 0 : 0;
  maCurrent = null;
  if (v) {
    const t = await F.getDoc(F.doc(db, 'memberAgreementVersions', String(v))).catch(() => null);
    maCurrent = t?.exists() ? { ...t.data(), version: v } : { version: v };
  }
  const done = appr.filter((p) => v && Number(p.agreementVersion) === v);
  $('#ma-status').textContent = v ? `· version ${v} published${maCurrent?.publishedOn ? ` on ${dd(maCurrent.publishedOn)}` : ''} · accepted by ${done.length} of ${appr.length} approved members`
    : '· not published yet: members are not asked to accept anything';
  $('#ma-pending').innerHTML = !v ? '<tr><td colspan="4" class="empty">Publish the agreement first.</td></tr>'
    : appr.filter((p) => Number(p.agreementVersion) !== v).map((p) => `<tr><td>${esc(memberUnitLabel(p.unit))}</td><td>${esc(p.name)}</td><td>${esc(p.email)}</td>
      <td>${p.agreementVersion ? `Version ${esc(p.agreementVersion)} only` : 'Not yet'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Every approved member has accepted the current version.</td></tr>';
  const f = $('#ma-edit');
  if (!maFilled) { fillMaForm(maCurrent?.sections ? maCurrent : DEFAULT_MEMBER_AGREEMENT); maFilled = true; }
  const committee = canDo('committee');
  $$('input, textarea', f).forEach((x) => (x.readOnly = !committee));
  $('#ma-publish').hidden = !committee; $('#ma-reset').hidden = !committee;
  $('#ma-publish').textContent = `Publish as version ${v + 1}`;
  return v;
}
function fillMaForm(ag) {
  const f = $('#ma-edit');
  f.title.value = ag.title || '';
  f.intro.value = (ag.intro || []).join('\n\n');
  f.body.value = sectionsToText(ag.sections);
  f.closing.value = ag.closing || '';
}
function readMaForm() {
  const f = $('#ma-edit');
  return { title: f.title.value.trim(), intro: f.intro.value.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean),
    sections: textToSections(f.body.value), closing: f.closing.value.trim() };
}
async function publishMemberAgreement(e) {
  e.preventDefault();
  const f = e.currentTarget, ag = readMaForm();
  if (ag.title.length < 5 || !ag.sections.length || !ag.closing) return setMsg(f, 'The title, at least one section with clauses, and the closing statement are needed.');
  const v = (maCurrent?.version || 0) + 1;
  if (!confirm(`Publish version ${v}? Every approved member will be asked to accept it at their next visit, and a copy of each acceptance will be saved and emailed.`)) return;
  const { F, db } = fb;
  await busy($('#ma-publish'), async () => {
    try {
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, 'memberAgreementVersions', String(v)), { ...ag, version: v, publishedOn: todayIST(), publishedAt: F.serverTimestamp(), publishedBy: uid, publishedByName: me?.name || '' });
      batch.set(F.doc(db, 'settings', 'memberAgreement'), { version: v, title: ag.title, publishedAt: F.serverTimestamp(), publishedBy: uid });
      await batch.commit();
      maFilled = false;
      setMsg(f, `Version ${v} published.`, true);
      await loadMembers();
    } catch (err) { setMsg(f, esc(errorText(err))); }
  });
}
let memberAgreementRecs = new Map();
function agreementCell(p, v, rec) {
  if (!v) return '<span class="muted">—</span>';
  if (Number(p.agreementVersion) !== v) return `<span class="ag-no">Not yet</span>${p.agreementVersion ? `<span class="sub">accepted v${esc(p.agreementVersion)}</span>` : ''}`;
  const mail = !rec ? '' : rec.emailed ? `<span class="ag-mail ok">✉ Copy emailed${rec.resentAt ? ' again' : ''}</span>`
    : `<span class="ag-mail no">✉ Copy not emailed${rec.emailNote ? `: ${esc(rec.emailNote)}` : ' yet'}</span>`;
  const send = rec && canDo('members') ? `<button class="btn btn-small ag-send" type="button" data-act="resend" data-uid="${esc(p.id)}">${rec.emailed ? 'Email copy again' : 'Send copy now'}</button>` : '';
  return `<span class="ag-ok">✓ Accepted</span><span class="sub">v${v}${p.agreementAcceptedAt ? `, ${whenShort(p.agreementAcceptedAt)}` : ''}</span>${mail}${send}`;
}

/** Warn when agreement copies aren't going out: the Drive script deployed is older than the website needs, or copies failed. */
async function checkAgreementMail(appr, v) {
  const box = $('#ma-mail-note');
  if (!v) { box.hidden = true; return; }
  await loadDriveCfg(fb);
  const failed = appr.filter((p) => Number(p.agreementVersion) === v && memberAgreementRecs.get(p.agreementId) && !memberAgreementRecs.get(p.agreementId).emailed);
  const ver = driveReady() ? await driveScriptVersion() : -1;
  const lines = [];
  if (ver === -1) lines.push('The Society’s Google Drive isn’t connected, so accepted agreements can’t be saved or emailed. Connect it in Expenses → Set-up.');
  else if (ver === 0) lines.push('Couldn’t check the Google Drive script just now (no internet, or the script address has changed).');
  else if (ver < DRIVE_SCRIPT_NEEDED) lines.push(`The Google Drive script in use is version ${ver}; saving and emailing agreement copies needs version ${DRIVE_SCRIPT_NEEDED}. Paste the new Code.gs and appsscript.json into the script, run <em>setup</em> once and allow the email permission, then Deploy → Manage deployments → Edit → Version: New version → Deploy (keep the same web app address).`);
  if (failed.length) lines.push(`${failed.length} accepted agreement${failed.length === 1 ? ' has' : 's have'} not been emailed yet: ${failed.map((p) => `${esc(memberUnitLabel(p.unit))} ${esc(p.name)}`).join(', ')}. ${ver >= DRIVE_SCRIPT_NEEDED ? 'Press <strong>Send copy now</strong> next to each one below.' : 'Once the script is updated, press <strong>Send copy now</strong> next to each one below.'}`);
  box.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
  box.hidden = !lines.length;
}

/* ---------- scans on unit file records (3.12) ---------- */
let recFiles = [], recNew = [];
const wingName = () => { const u = units.find((x) => x.id === fileUnit); return u ? blockName(u.block) : ''; };
function docChips(kind, r) {
  const label = `${units.find((u) => u.id === fileUnit)?.unit || ''} `;
  const short = (n) => { if (kind === 'memberDocs') { const i = n.lastIndexOf(' - '); if (i > 0) return n.slice(i + 3); } return n.startsWith(label) ? n.slice(label.length) : n; };
  return (r.files || []).map((f) => `<button class="doc-chip" type="button" data-doc="${kind}" data-rid="${esc(r.id)}" data-fid="${esc(f.id)}" title="${esc(f.name)}">📎 ${esc(short(f.name))}</button>`).join('');
}
function renderRecFiles() {
  $('#rec-file-list').innerHTML = recFiles.map((f, i) => `<li class="${f.keep ? '' : 'removing'}"><span>📎 ${esc(f.name)}</span>
      <button class="btn-link" type="button" data-keep="${i}">${f.keep ? 'Remove from this record' : 'Keep'}</button></li>`).join('')
    + recNew.map((f, i) => `<li><span>${esc(f.name)}</span> <span class="new">new, saved to Drive with the record</span> <button class="btn-link" type="button" data-drop="${i}">Remove</button></li>`).join('')
    || '<li class="muted">No scans yet.</li>';
}
async function openUnitDoc(kind, rid, fid) {
  const rec = ufCache[kind].find((r) => r.id === rid), f = (kind === 'agreements' ? [rec?.pdf] : rec?.files || []).find((x) => x?.id === fid);
  if (!f) return;
  const d = $('#ufdoc-dialog');
  $('#ufdoc-title').textContent = f.name;
  $('#ufdoc-body').textContent = 'Loading from the Society’s Google Drive…';
  $('#ufdoc-save').disabled = true;
  d.showModal();
  try {
    const url = await driveFileUrl(fb, kind === 'agreements' ? { agreementId: rid, fileId: fid } : { unitId: fileUnit, record: kind, recordId: rid, fileId: fid });
    $('#ufdoc-body').innerHTML = f.mime?.startsWith('image/') ? `<img alt="${esc(f.name)}" src="${url}">` : `<p>PDF document. Use <strong>Save / open</strong> to see it.</p>`;
    $('#ufdoc-save').disabled = false;
    $('#ufdoc-save').onclick = async () => { try { await saveBlob(await (await fetch(url)).blob(), f.name); } catch (err) { alert(errorText(err)); } };
  } catch (err) { $('#ufdoc-body').textContent = errorText(err); }
}

/** Saves the unit's backup in Drive; quiet unless asked. */
async function backupThisUnit(unitId = fileUnit, { loud = false } = {}) {
  if (!driveReady() || !canDo('unitRecords')) return null;
  const u = units.find((x) => x.id === unitId);
  try {
    const r = await backupUnitToDrive(fb, { unitId, wing: blockName(u.block), siteVersion: SITE_VERSION, byName: me?.name || '' });
    if (unitId === fileUnit) await showBackupNote();
    return r;
  } catch (err) {
    console.warn('unit backup', err);
    if (loud) throw err;
    if (unitId === fileUnit) $('#uf-backup').textContent = `Google Drive backup: couldn’t be saved just now (${errorText(err)}).`;
    return null;
  }
}
async function showBackupNote() {
  const { F, db } = fb;
  const s = await F.getDoc(F.doc(db, 'driveBackups', fileUnit)).catch(() => null);
  const b = s?.exists() ? s.data() : null;
  const at = b?.at?.toDate ? b.at.toDate() : null;
  $('#uf-backup').textContent = !driveReady() ? 'Google Drive backup: the Drive isn’t connected yet (Expenses → Set-up).'
    : at ? `Google Drive backup: saved ${at.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${b.byName ? ` by ${b.byName}` : ''}.`
      : 'Google Drive backup: not saved yet for this unit (it is made when one of its records is saved, or with Back up now; all units are also in the scheduled full backup, Settings → Full backups).';
  $('#uf-backup-now').hidden = !driveReady() || !canDo('unitRecords');
}

/** Every unit: residential flats with signs of commercial use. */
async function checkAllUnits() {
  const { F, db } = fb;
  const out = [];
  const list = units.filter((u) => (u.type || 'Residential Flat') === 'Residential Flat');
  for (let i = 0; i < list.length; i += 8) {
    $('#ut-all').textContent = `Checking ${Math.min(i + 8, list.length)} of ${list.length} residential flats…`;
    await Promise.all(list.slice(i, i + 8).map(async (u) => {
      const get = (k) => F.getDocs(F.collection(db, 'units', u.id, k)).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
      const [electricity, propertyTax, tenants] = await Promise.all([get('electricity'), get('propertyTax'), get('tenants')]);
      const signs = commercialSigns(u, { electricity, propertyTax, tenants });
      if (signs.length) out.push({ u, signs });
    }));
  }
  $('#ut-all').innerHTML = out.length
    ? `<p><strong>${out.length}</strong> residential flat${out.length > 1 ? 's show' : ' shows'} signs of commercial use:</p><div class="table-scroll"><table><thead><tr><th>Unit</th><th>Member</th><th>What the records show</th><th></th></tr></thead><tbody>
      ${out.sort((a, b) => a.u.id.localeCompare(b.u.id, undefined, { numeric: true })).map(({ u, signs }) => `<tr><td>${esc(u.unit)}</td><td>${esc(u.name || '')}</td><td>${signs.map(esc).join('<br>')}</td>
        <td><button class="btn btn-small" type="button" data-goto-unit="${esc(u.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`
    : `<p class="ut-ok">None of the ${list.length} residential flats shows a commercial tariff, a non-residential tax assessment or a commercial tenancy.</p>`;
}

function wireUnitFile() {
  $('#uf-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) showUfPane(b.dataset.pane); });
  $('#rec-file-input').addEventListener('change', (e) => {
    for (const f of e.target.files) {
      if (!/^image\/|^application\/pdf$/.test(f.type)) { alert(`${f.name}: only photos and PDF files can be added.`); continue; }
      if (f.size > 15 * 1024 * 1024 && f.type === 'application/pdf') { alert(`${f.name} is larger than 15 MB.`); continue; }
      recNew.push(f);
    }
    e.target.value = '';
    renderRecFiles();
  });
  $('#rec-file-list').addEventListener('click', (e) => {
    const k = e.target.closest('[data-keep]'), dr = e.target.closest('[data-drop]');
    if (k) { const f = recFiles[Number(k.dataset.keep)]; f.keep = !f.keep; renderRecFiles(); }
    if (dr) { recNew.splice(Number(dr.dataset.drop), 1); renderRecFiles(); }
  });
  $('#ufdoc-close').addEventListener('click', () => $('#ufdoc-dialog').close());
  $('#ack-form').addEventListener('submit', (e) => saveAck(e));
  $('#ack-cancel').addEventListener('click', () => $('#ack-dialog').close());
  $('[data-pane="mdocs"].uf-pane').addEventListener('click', (e) => {
    const a = e.target.closest('[data-ack]'), r = e.target.closest('[data-return]'), s = e.target.closest('[data-resend]');
    if (a) openAck(a.dataset.ack, 'ack');
    if (r) openAck(r.dataset.return, 'return');
    if (s) resendAgreement(s.dataset.resend, s);
  });
  $('#ma-edit').addEventListener('submit', (e) => publishMemberAgreement(e));
  $('#ma-preview').addEventListener('click', () => {
    const d = $('#ma-preview-doc');
    d.innerHTML = memberAgreementHTML({ ...readMaForm(), version: (maCurrent?.version || 0) + 1 }, { name: 'Member’s name', unit: 'C 202 (C Wing)', relation: 'owner', email: 'member@example.com' });
    d.hidden = false;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#ma-reset').addEventListener('click', () => { if (confirm('Replace the text in the editor with the draft? Nothing is published until you press Publish.')) fillMaForm(DEFAULT_MEMBER_AGREEMENT); });
  $('#uf-backup-now').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    $('#uf-backup').textContent = 'Google Drive backup: saving…';
    try { await backupThisUnit(fileUnit, { loud: true }); } catch (err) { $('#uf-backup').textContent = `Google Drive backup: ${errorText(err)}`; }
  }));
  $('#ut-check-all').addEventListener('click', (e) => busy(e.currentTarget, () => checkAllUnits().catch((err) => { $('#ut-all').textContent = errorText(err); })));
  $('#ut-all').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto-unit]');
    if (!b) return;
    fileUnit = b.dataset.gotoUnit; sessionStorage.setItem('fileUnit', fileUnit);
    loadUnitFile().then(() => { showUfPane('utility'); window.scrollTo(0, 0); }).catch((err) => alert(errorText(err)));
  });
  $('#dup-fy').addEventListener('change', renderDupRows);
  $('#dup-src').addEventListener('change', renderDupRows);
  $('#dup-rows').addEventListener('change', dupCount);
  $('#dup-all').addEventListener('change', (e) => { $$('#dup-rows input[type=checkbox]').forEach((c) => (c.checked = e.target.checked)); dupCount(); });
  $('#dup-form').addEventListener('submit', (e) => issueDuplicates(e).catch((err) => setMsg(e.target, errorText(err))));
  $('#uf-pick').addEventListener('change', (e) => { fileUnit = e.target.value; sessionStorage.setItem('fileUnit', fileUnit); loadUnitFile().catch((err) => alert(errorText(err))); });
  $('#uf-print').addEventListener('click', () => window.print());
  $('#uf-fy').addEventListener('change', renderUfLedger);
  wireOldReceipts();
  $('#uf-pay').addEventListener('click', () => { payFor = fileUnit; location.hash = '#payments'; });
  $('#uf-edit').addEventListener('click', () => openUnit(fileUnit).catch((err) => alert(errorText(err))));
  $('section[data-tab="unitfile"]').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return openRecord(add.dataset.add);
    const doc = e.target.closest('[data-doc]');
    if (doc) return openUnitDoc(doc.dataset.doc, doc.dataset.rid, doc.dataset.fid);
    const ed = e.target.closest('[data-rec]');
    if (ed) openRecord(ed.dataset.rec, ed.dataset.id);
  });
  const f = $('#rec-form');
  $('[data-close]', f).addEventListener('click', () => $('#rec-dialog').close());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const rec = {};
    for (const [k, , type, , req] of RECORDS[recKind].fields) {
      if (k === 'h') continue;
      let v = String(fd.get(k) ?? '').trim();
      if (req && !v) return setMsg(f, 'Fill in the fields marked *.');
      if (type === 'number') v = v === '' ? null : Number(v);
      if (k === 'mobile') v = v.replace(/\D/g, '').slice(-10);
      rec[k] = v;
    }
    if (recKind === 'tenants' && rec.to && rec.from && rec.to < rec.from) return setMsg(f, 'Vacated date is before the occupied-from date.');
    const { F, db } = fb;
    await busy($('button[type=submit]', f), async () => {
      try {
        const u = units.find((x) => x.id === fileUnit);
        let added = [];
        if (recNew.length) {
          const title = recKind === 'electricity' ? `MSEB ${rec.billMonth || ''} ${rec.consumerNo || ''}` : recKind === 'propertyTax' ? `Property tax ${rec.year || ''} ${rec.propertyNo || ''}`
            : recKind === 'comms' ? `${rec.date || ''} ${rec.kind || rec.channel || ''} ${rec.subject || ''}` : recKind === 'tenants' ? `Tenancy ${rec.name || ''} ${rec.from || ''}` : `Member ${rec.name || ''}`;
          added = await uploadUnitScans(fb, { unitId: fileUnit, unitLabel: u.unit, wing: blockName(u.block), kind: recKind, title, files: recNew,
            onStep: (i, n) => setMsg(f, `Saving scan ${i} of ${n} to the Society’s Google Drive…`) });
        }
        const files = [...recFiles.filter((x) => x.keep).map(({ keep, ...x }) => x), ...added];
        if (recFiles.length || added.length) rec.files = files;
        const col = F.collection(db, 'units', fileUnit, recKind);
        if (recId) await F.updateDoc(F.doc(col, recId), { ...rec, updatedAt: F.serverTimestamp(), updatedBy: uid });
        else await F.addDoc(col, { ...rec, createdAt: F.serverTimestamp(), createdBy: uid });
        recNew = [];
        $('#rec-dialog').close();
        await loadUnitFile();
        if (recKind === 'tenants') await syncOccupancy();
        backupThisUnit(fileUnit);
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
}

/* ---------- Settings: full backups (3.25) ---------- */
const FB_NEEDED = 13;
let fbList = [], fbPick = null;
const fbWhen = (iso) => { if (!iso) return ''; const d = new Date(iso.toDate ? iso.toDate() : iso); return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
async function loadFullBackups() {
  const { F, db } = fb, f = $('#fb-form'), st = $('#fb-status');
  if (!f.hour.options.length) f.hour.innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h === 0 ? '12 midnight' : h < 12 ? `${h} am` : h === 12 ? '12 noon' : `${h - 12} pm`}</option>`).join('');
  const [cfgSnap, stSnap] = await Promise.all([F.getDoc(F.doc(db, 'settings', 'fullBackupConfig')).catch(() => null), F.getDoc(F.doc(db, 'settings', 'fullBackup')).catch(() => null)]);
  const c = { frequency: 'daily', hour: 2, weekday: 0, keepDays: 30, ...(cfgSnap?.exists() ? cfgSnap.data() : {}) };
  f.frequency.value = c.frequency; f.hour.value = String(c.hour); f.weekday.value = String(c.weekday); f.keepDays.value = String(c.keepDays);
  fbFreqChanged();
  const ed = canDo('committee');
  $$('#fb-box [data-committee]').forEach((b) => (b.hidden = !ed));
  $$('select', f).forEach((x) => (x.disabled = !ed));
  const s = stSnap?.exists() ? stSnap.data() : null;
  const ver = driveReady() ? await driveScriptVersion() : -1;
  st.className = 'fb-status';
  if (ver !== -1 && ver < FB_NEEDED) {
    st.className = 'fb-status bad';
    st.textContent = `Not set up yet: the storage script needs to be updated (version ${FB_NEEDED}; it is ${ver || 'not answering'}), given access to the database and its schedule started — see the storage script’s README, “3.25”.`;
    return;
  }
  if (!s) { st.className = 'fb-status bad'; st.textContent = driveReady() ? 'No full backup has been made yet. After updating the storage script, run setupBackups once in its editor (it makes the first backup and starts the schedule).' : 'Connect the Society’s Google Drive first: Expenses → Set-up.'; return; }
  const parts = [];
  if (s.at) parts.push(`Last full backup: ${fbWhen(s.at)} (${s.kind === 'scheduled' ? 'scheduled' : `by ${s.by || 'request'}`}) — ${s.docs} records, ${s.users ?? 0} sign-in accounts, ${fmtSize(s.bytes)}.`);
  if (s.ok === false) parts.push(`The last attempt FAILED on ${fbWhen(s.failedAt)}: ${s.error}`);
  if (s.at && Date.now() - new Date(s.at.toDate ? s.at.toDate() : s.at).getTime() > (c.frequency === 'weekly' ? 8 : 2) * 864e5 && c.frequency !== 'off') parts.push('No backup for longer than the schedule: check the storage script’s schedule (setupBackups).');
  if (s.usersNote) parts.push(`Sign-in accounts were not saved (${s.usersNote}).`);
  if (s.lastRestore) parts.push(`Last restore: ${fbWhen(s.lastRestore.at)} by ${s.lastRestore.by} from ${s.lastRestore.file} (${s.lastRestore.mode === 'all' ? 'everything' : 'missing only'}; ${s.lastRestore.restored} put back).`);
  if (c.frequency === 'off') parts.push('Scheduled backups are OFF.');
  st.className = `fb-status ${s.ok === false || c.frequency === 'off' || parts.some((p) => p.startsWith('No backup')) ? 'bad' : 'ok'}`;
  st.textContent = parts.join(' ');
}
function fbFreqChanged() { $('#fb-day-label').hidden = $('#fb-form').frequency.value !== 'weekly'; }
async function fbShowList() {
  const r = await driveCall(fb, 'listBackups');
  fbList = r.backups || [];
  $('#fb-backups').hidden = false;
  $('#fb-rows').innerHTML = fbList.map((b, i) => `<tr><td>${esc(b.name.replace(/^Full backup /, '').replace(/\.json\.gz$/, '').replace(/ (\d\d)(\d\d)$/, ' $1:$2'))}${i === 0 ? ' <span class="muted">(newest)</span>' : ''}${/-01 /.test(b.name) ? ' <span class="muted">(monthly, kept)</span>' : ''}</td><td>${fmtSize(b.bytes)}</td>
    <td><button class="btn btn-small" type="button" data-fb-restore="${esc(b.id)}">Restore…</button></td></tr>`).join('') || '<tr><td colspan="3" class="empty">No full backups yet.</td></tr>';
}
function wireFullBackups() {
  const f = $('#fb-form');
  f.frequency.addEventListener('change', fbFreqChanged);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canDo('committee')) return;
    const { F, db } = fb;
    await busy(e.submitter || $('#fb-form [type=submit]'), async () => {
      try {
        await F.setDoc(F.doc(db, 'settings', 'fullBackupConfig'), { frequency: f.frequency.value, hour: Number(f.hour.value), weekday: Number(f.weekday.value), keepDays: Number(f.keepDays.value), updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: me?.name || '' });
        setMsg(f, f.frequency.value === 'off' ? 'Saved: scheduled backups are off.' : `Saved: ${f.frequency.value === 'weekly' ? `every ${f.weekday.selectedOptions[0].text}` : 'every day'} at ${f.hour.selectedOptions[0].text}.`, true);
        await loadFullBackups();
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
  $('#fb-now').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    setMsg(f, 'Backing up everything… (this can take a minute)', true);
    try {
      await loadDriveCfg(fb);
      const r = await driveCall(fb, 'fullBackup');
      setMsg(f, `Backed up: ${r.backup.fileName} — ${r.backup.docs} records, ${r.backup.users} sign-in accounts, ${fmtSize(r.backup.bytes)}, in ${r.backup.seconds} s.`, true);
      await loadFullBackups();
      if (!$('#fb-backups').hidden) await fbShowList();
    } catch (err) { setMsg(f, esc(errorText(err))); }
  }));
  $('#fb-list').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { await loadDriveCfg(fb); await fbShowList(); } catch (err) { setMsg(f, esc(errorText(err))); }
  }));
  $('#fb-rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fb-restore]');
    if (!b) return;
    fbPick = fbList.find((x) => x.id === b.dataset.fbRestore);
    const rf = $('#fb-restore');
    rf.reset(); setMsg(rf, ''); $('#fb-r-confirm-wrap').hidden = true;
    $('#fb-r-name').textContent = fbPick.name.replace(/\.json\.gz$/, '');
    $('#fb-r-info').textContent = 'Reading the backup…'; $('#fb-r-cols').innerHTML = '';
    $('#fb-dialog').showModal();
    try {
      const r = await driveCall(fb, 'restoreBackup', { fileId: fbPick.id, info: true });
      const cnt = r.info.counts || {};
      $('#fb-r-info').textContent = `Made ${fbWhen(r.info.createdAt)}: ${Object.values(cnt).reduce((a, n) => a + n, 0)} records, ${r.info.users} sign-in accounts.`;
      $('#fb-r-cols').innerHTML = Object.keys(cnt).sort().map((k) => `<label class="check"><input type="checkbox" value="${esc(k)}"> ${esc(k)} <span class="muted">(${cnt[k]})</span></label>`).join('');
    } catch (err) { $('#fb-r-info').textContent = errorText(err); }
  });
  const rf = $('#fb-restore');
  rf.addEventListener('change', () => { $('#fb-r-confirm-wrap').hidden = rf.mode.value !== 'all'; });
  $('#fb-dialog [data-close]').addEventListener('click', () => $('#fb-dialog').close());
  rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = rf.mode.value, cols = $$('#fb-r-cols input:checked').map((x) => x.value);
    if (mode === 'all' && rf.confirm.value.trim() !== 'RESTORE') return setMsg(rf, 'Type RESTORE to put everything back as it was.');
    if (!confirm(`${mode === 'all' ? 'Put EVERYTHING back as it was' : 'Put back what is missing'} from ${fbPick.name}${cols.length ? ` (only: ${cols.join(', ')})` : ''}?`)) return;
    await busy($('#fb-r-go'), async () => {
      try {
        setMsg(rf, 'Restoring… (this can take a few minutes; keep this page open)', true);
        const r = await driveCall(fb, 'restoreBackup', { fileId: fbPick.id, mode, collections: cols, confirm: rf.confirm.value.trim() });
        const x = r.restore;
        $('#fb-dialog').close();
        setMsg(f, `Restored from ${fbPick.name}: ${x.restored} records put back, ${x.existed} already there${x.failed ? `, ${x.failed} failed (${esc(x.errors.join('; '))})` : ''}. Reload the page to see them.`, !x.failed);
        await loadFullBackups();
      } catch (err) { setMsg(rf, esc(errorText(err))); }
    });
  });
}

/* ---------- Settings: unit files in Google Drive (3.12) ---------- */
let ufrFound = null;
/* ---------- Settings: the website's settings as a file (3.26) ---------- */
const SB_NEEDED = 14;
let sbFile = null, sbRows = [];
const sbMsg = (t, ok = true) => { const m = $('#sb-msg'); m.className = `form-msg${ok ? ' ok' : ''}`; m.textContent = t; };
async function sbCurrent() { return collectSettings(fb, { siteVersion: SITE_VERSION, project: PROJECT_ID, byName: me?.name || '' }); }
async function sbToDrive(data, note = '') {
  await loadDriveCfg(fb);
  if (!driveReady()) throw new Error('Connect the Society’s Google Drive first (Expenses → Set-up).');
  if ((await driveScriptVersion()) < SB_NEEDED) throw new Error(`Saving settings in the Drive needs the storage script version ${SB_NEEDED}: see its README, 3.26. Use “Download the settings file” meanwhile.`);
  const name = settingsFileName();
  return (await driveCall(fb, 'settingsBackup', { name, note, text: JSON.stringify(data) })).file;
}
const sbDownload = (data, name = settingsFileName()) => saveBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), name);
const SB_TEXT = { same: 'Same', different: 'Different', missing: 'Not on the website now', extra: 'Only on the website now (left as it is)', permanent: 'Different, but a published version can’t be changed', skip: 'From another site: not restored (it would connect this site to that site’s Drive)' };
async function sbCompare(data, sourceName) {
  sbFile = checkSettingsFile(data);
  sbMsg('Reading the website’s settings to compare…');
  const now = await sbCurrent();
  sbRows = compareSettings(now, sbFile, PROJECT_ID);
  const nd = sbRows.filter((r) => r.status === 'different' || r.status === 'missing').length;
  $('#sb-c-title').textContent = `Compare: ${sourceName}`;
  $('#sb-c-note').textContent = `Saved ${new Date(sbFile.exportedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })}${sbFile.by ? ` by ${sbFile.by}` : ''}, website version ${sbFile.siteVersion || '?'}${sbFile.project && sbFile.project !== PROJECT_ID ? `, from ANOTHER site (${sbFile.project})` : ''}. ${nd ? `${nd} item${nd === 1 ? '' : 's'} differ.` : 'Everything is the same as on the website now.'}`;
  $('#sb-rows').innerHTML = sbRows.map((r, i) => { const can = r.status === 'different' || r.status === 'missing';
    return `<tr><td>${can ? `<input type="checkbox" data-sb="${i}" aria-label="Restore ${esc(r.label)}">` : ''}</td><td>${esc(r.label)}<span class="sub">${esc(r.path)}</span></td>
      <td><span class="sb-st ${r.status}">${esc(SB_TEXT[r.status])}</span>${r.changed.length && r.status !== 'extra' ? `<span class="sub">Changed: ${esc(r.changed.slice(0, 8).join(', '))}${r.changed.length > 8 ? '…' : ''}</span>` : ''}</td></tr>`; }).join('');
  $('#sb-all').checked = false;
  $('#sb-compare').hidden = false; $('#sb-restore').disabled = true;
  sbMsg('');
}
function wireSettingsBackup() {
  $('#sb-save').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { sbMsg('Collecting the settings…'); const f = await sbToDrive(await sbCurrent()); sbMsg(`Saved in the Drive (Backups → Settings): ${f.name}, ${fmtSize(f.bytes)}.`); }
    catch (err) { sbMsg(errorText(err), false); }
  }));
  $('#sb-download').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { sbMsg('Collecting the settings…'); const d = await sbCurrent(); await sbDownload(d); sbMsg(`Downloaded: ${d.items.length} items. Keep the file private.`); }
    catch (err) { sbMsg(errorText(err), false); }
  }));
  $('#sb-list').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      await loadDriveCfg(fb);
      if ((await driveScriptVersion()) < SB_NEEDED) throw new Error(`Needs the storage script version ${SB_NEEDED} (see its README, 3.26). Meanwhile restore from a downloaded file.`);
      const r = await driveCall(fb, 'listSettingsBackups');
      if (!r.backups.length) return sbMsg('No settings backups in the Drive yet: use “Back up the settings now”.', false);
      $('#sb-pick').innerHTML = r.backups.map((b) => `<option value="${esc(b.id)}">${esc(b.name.replace(/\.json$/, ''))} (${fmtSize(b.bytes)})${/before restore/i.test(b.note || '') ? ' – before a restore' : ''}</option>`).join('');
      $('#sb-drive').hidden = false; sbMsg('');
    } catch (err) { sbMsg(errorText(err), false); }
  }));
  $('#sb-open').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { const r = await driveCall(fb, 'readSettingsBackup', { fileId: $('#sb-pick').value }); await sbCompare(JSON.parse(r.text), r.name); }
    catch (err) { sbMsg(errorText(err), false); }
  }));
  $('#sb-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { await sbCompare(JSON.parse(await file.text()), file.name); }
    catch (err) { sbMsg(err instanceof SyntaxError ? 'This file is not a website settings file.' : errorText(err), false); }
  });
  const ticked = () => $$('#sb-rows [data-sb]:checked').map((x) => sbRows[Number(x.dataset.sb)]);
  $('#sb-rows').addEventListener('change', () => { $('#sb-restore').disabled = !ticked().length; });
  $('#sb-all').addEventListener('change', (e) => { $$('#sb-rows [data-sb]').forEach((x) => (x.checked = e.target.checked)); $('#sb-restore').disabled = !ticked().length; });
  $('#sb-close').addEventListener('click', () => { $('#sb-compare').hidden = true; sbFile = null; });
  $('#sb-restore').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const pick = ticked();
    if (!pick.length || !confirm(`Put back ${pick.length} setting${pick.length === 1 ? '' : 's'} as in the file?\n\n${pick.map((r) => `• ${r.label}`).join('\n')}`)) return;
    try {
      // First a copy of the settings as they are now, to undo this if needed.
      sbMsg('Saving the present settings first…');
      const before = await sbCurrent();
      let where = '';
      try { const f = await sbToDrive(before, 'Before restore'); where = `in the Drive as ${f.name}`; }
      catch (err) { await sbDownload(before, settingsFileName().replace('.json', ' before restore.json')); where = 'as a downloaded file (the Drive copy could not be saved)'; }
      const r = await restoreSettings(fb, sbFile, pick.map((x) => x.path), (label) => sbMsg(`Restoring: ${label}…`));
      sbMsg(`${r.done.length} setting${r.done.length === 1 ? '' : 's'} restored. The settings as they were just before are saved ${where}.${r.failed.length ? ` Not restored: ${r.failed.map((x) => `${x.path} (${x.error})`).join('; ')}.` : ''} Reload the page to use them.`, !r.failed.length);
      $('#sb-compare').hidden = true;
    } catch (err) { sbMsg(errorText(err), false); }
  }));
}

function wireDriveBackups() {
  wireFullBackups();
  wireSettingsBackup();
  $('#ufb-all').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const box = $('#ufb-box'), prog = $('#ufb-progress');
    setMsg(box, '');
    if (!driveReady()) return setMsg(box, 'Connect the Society’s Google Drive first: Expenses → Set-up.');
    let ok = 0; const failed = [];
    for (let i = 0; i < units.length; i++) {
      prog.textContent = `Saving ${i + 1} of ${units.length}: ${units[i].unit}…`;
      try { await backupThisUnit(units[i].id, { loud: true }); ok++; } catch (err) { failed.push(`${units[i].unit} (${errorText(err)})`); }
    }
    prog.textContent = '';
    setMsg(box, failed.length ? `${ok} unit files backed up. Not saved: ${esc(failed.join('; '))}. Try again for those.` : `All ${ok} unit files backed up to the Society’s Google Drive.`, !failed.length);
  }));
  $('#ufr-read').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const id = $('#ufr-unit').value, u = units.find((x) => x.id === id);
    $('#ufr-result').innerHTML = ''; $('#ufr-msg').textContent = '';
    if (!u) return;
    try {
      ufrFound = { unitId: id, ...(await compareWithBackup(fb, { unitId: id, wing: blockName(u.block) })) };
      const kinds = Object.keys(RECORD_FOLDER);
      const total = kinds.reduce((t, k) => t + ufrFound.missing[k].length, 0);
      const saved = new Date(ufrFound.savedAt);
      $('#ufr-result').innerHTML = `<p>Backup of <strong>${esc(u.unit)}</strong> saved on ${saved.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.</p>
        <div class="table-scroll"><table><thead><tr><th>Records</th><th class="num">In the backup</th><th class="num">Missing here</th></tr></thead><tbody>
        ${kinds.map((k) => `<tr><td>${esc(RECORD_FOLDER[k])}</td><td class="num">${(ufrFound.data.records?.[k] || []).length}</td><td class="num">${ufrFound.missing[k].length}</td></tr>`).join('')}
        </tbody></table></div>
        ${total ? `<div class="form-actions"><button class="btn btn-primary" type="button" id="ufr-restore">Restore ${total} missing record${total > 1 ? 's' : ''}</button></div>` : '<p class="ut-ok">Nothing is missing: every record in the backup is here.</p>'}`;
    } catch (err) { $('#ufr-msg').textContent = errorText(err); }
  }));
  $('#ufr-result').addEventListener('click', (e) => {
    const b = e.target.closest('#ufr-restore');
    if (!b || !ufrFound) return;
    if (!confirm('Put back the missing records from the Drive backup? Records that exist now are not changed.')) return;
    busy(b, async () => {
      try {
        const n = await restoreMissing(fb, ufrFound.unitId, ufrFound.missing);
        $('#ufr-result').innerHTML = '';
        $('#ufr-msg').className = 'form-msg ok';
        $('#ufr-msg').textContent = `${n} record${n === 1 ? '' : 's'} restored to ${units.find((x) => x.id === ufrFound.unitId)?.unit}.`;
        ufrFound = null;
      } catch (err) { $('#ufr-msg').className = 'form-msg'; $('#ufr-msg').textContent = errorText(err); }
    });
  });
}

/** Keeps the unit's status (which drives non-occupancy charges) in line with the tenancy records. */
async function syncOccupancy() {
  const u = units.find((x) => x.id === fileUnit);
  if (!u || !canDo('editUnits')) return;
  const rented = ufCache.tenants.some((t) => !t.to);
  const letOut = ['Rented', 'Tenant'].includes(u.status);
  if (rented && !letOut && confirm(`${u.unit} has a current tenant. Mark the unit as Rented? (Non-occupancy charges apply from the next bill.)`)) {
    await updateUnitDetails(fb, u.id, { status: 'Rented' });
  } else if (!rented && letOut && confirm(`${u.unit} has no current tenant. Mark the unit as Own Occupied?`)) {
    await updateUnitDetails(fb, u.id, { status: 'Own Occupied' });
  } else return;
  await refreshCore();
  await loadUnitFile();
}

/* ---------------- financial-year reports ---------------- */

let rpKind = 'summary';
let rpData = null;      // { fy, st, bills, pays, closing }
let rpCsv = null;       // { name, rows }

async function loadReports() {
  const sel = $('#rp-fy');
  auditCache = await loadAuditYears(fb).catch(() => []);
  // Audited accounts go back to 2011-12; Tally history starts 1 Apr 2018.
  const first = auditCache.length ? auditCache[0].from : '2018-04-01';
  const fys = fyList(first, todayIST());
  if (!sel.options.length) {
    sel.innerHTML = fys.map((f) => `<option value="${f}">${f} (1 Apr ${f.slice(0, 4)} – 31 Mar ${Number(f.slice(0, 4)) + 1})</option>`).join('');
  }
  await buildReport(sel.value || fys[0]);
}

async function buildReport(fy) {
  $('#rp-status').textContent = 'Working out the figures…';
  $('#rp-body').innerHTML = '';
  if (!auditCache.length) auditCache = await loadAuditYears(fb).catch(() => []);
  const old = await allOldReceipts();
  const pre = Object.fromEntries(units.map((u) => [u.id, preLedger(u.id, auditCache, old[u.id] || [])]));
  const [{ ledgers, histories }, bills, pays, closingSnap] = await Promise.all([
    loadMergedLedgers(fb, units, pre), fyBills(fb, fy), fyPayments(fb, fy),
    fb.F.getDoc(fb.F.doc(fb.db, 'fyClosing', fy)).catch(() => null)
  ]);
  // Tally entries for this year: bills by particulars, receipts for the register.
  const { from: fyFrom, to: fyTo } = fyBounds(fy);
  const tally = Object.entries(histories).flatMap(([uid, h]) => (h?.entries || []).filter((e) => e.date >= fyFrom && e.date <= fyTo)
    .map((e) => ({ ...e, unitId: uid, unit: units.find((x) => x.id === uid)?.unit, name: units.find((x) => x.id === uid)?.name })));
  rpData = { fy, st: fyStatement(units, ledgers, fy), ledgers, bills, pays, tally, closing: closingSnap?.exists() ? closingSnap.data() : null,
    audit: auditCache.find((a) => a.fy === fy) || null, audits: auditCache,
    old: Object.entries(old).flatMap(([uid, list]) => list.filter((r) => r.fy === fy).map((r) => ({ ...r, unitId: uid }))), oldAll: old };
  const lock = billing.lockedUpTo || '';
  $('#rp-status').innerHTML = rpData.closing?.status === 'closed'
    ? `<span class="pill past">Year closed</span> on ${esc(tsText(rpData.closing.closedAt))}. Entries dated up to ${longDate(lock || rpData.st.to)} are locked.`
    : `<span class="pill ok">Open year</span>${lock ? ` Books are closed up to ${longDate(lock)}.` : ''}`;
  renderReport();
}

function renderReport() {
  $$('#rp-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rp === rpKind)));
  const { fy, st, bills, pays } = rpData;
  const head = `<div class="rp-print-head"><h2>Sunshree Suntec Co-op. Hsg. Soc. Ltd.</h2><p>Financial year ${fy} (${longDate(st.from)} to ${longDate(st.to)})</p></div>`;
  const okPays = pays.filter((p) => p.status !== 'cancelled');

  if (rpKind === 'audited') { renderAudited(head); rpCsv = auditCsv(); return; }
  if (rpKind === 'trend') { renderTrend(head); return; }
  if (rpData.audit) {
    // Years covered by the audited accounts (before Tally): figures come from the audit report.
    if (rpKind === 'summary') { renderAuditSummary(head); return; }
    if (rpKind === 'members') { renderAuditMembers(head); return; }
    if (rpKind === 'collections' && rpData.old.length) { renderOldCollections(head); return; }
    if (['heads', 'collections'].includes(rpKind)) {
      $('#rp-body').innerHTML = head + `<p class="muted">For ${fy} the Society’s records are the audited statements, not individual bills and receipts. See <strong>Audited statements</strong> for income by head and <strong>Member-wise statement</strong> for each unit’s balance.</p>`;
      rpCsv = null; return;
    }
  }

  if (rpKind === 'summary') {
    const t = st.total;
    // Month by month from the merged ledgers (Tally history and these accounts alike).
    const all = Object.values(rpData.ledgers).flat();
    const months = fyBounds(fy).months.map((m) => {
      const inM = all.filter((e) => e.date.slice(0, 7) === m);
      const b = inM.filter((e) => e.kind === 'bill').reduce((a, e) => a + (e.debit || 0), 0);
      const c = inM.filter((e) => e.kind === 'payment').reduce((a, e) => a + (e.credit || 0), 0) - inM.filter((e) => e.kind === 'reversal').reduce((a, e) => a + (e.debit || 0), 0);
      return { m, b, c };
    });
    const due = st.rows.filter((r) => r.closing > 0).length;
    $('#rp-body').innerHTML = head + `
      <dl class="dues-summary">
        <div><dt>Opening balance (₹)</dt><dd>${amt(t.opening)}</dd></div>
        <div><dt>Billed in the year (₹)</dt><dd>${fmt(t.billed)}</dd></div>
        <div><dt>Received in the year (₹)</dt><dd class="credit">${fmt(t.received - t.reversed)}</dd></div>
        <div><dt>Corrections, net (₹)</dt><dd>${amt(t.adjDebit - t.adjCredit)}</dd></div>
        <div><dt>${st.to < todayIST() ? 'Closing balance on 31 March' : 'Balance so far'} (₹)</dt><dd class="due">${amt(t.closing)}</dd></div>
        <div><dt>Collection against billing</dt><dd>${t.billed ? Math.round(((t.received - t.reversed) / t.billed) * 100) + '%' : '—'}</dd></div>
      </dl>
      <p class="muted">${due} of ${st.rows.length} units have dues at the end of the period. Received is net of cancelled receipts (₹ ${fmt(t.reversed)}).</p>
      <h2>Month by month</h2>
      <div class="table-scroll"><table><thead><tr><th>Month</th><th class="num">Billed (₹)</th><th class="num">Received (₹)</th></tr></thead>
      <tbody>${months.map((x) => `<tr><td>${monthLabel(x.m)}</td><td class="num">${x.b ? fmt(x.b) : ''}</td><td class="num">${x.c ? fmt(x.c) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${fmt(months.reduce((a, x) => a + x.b, 0))}</td><td class="num">${fmt(months.reduce((a, x) => a + x.c, 0))}</td></tr></tfoot></table></div>`;
    rpCsv = { name: `year-summary-${fy}`, rows: [['Month', 'Billed', 'Received'], ...months.map((x) => [monthLabel(x.m), x.b, x.c])] };
  }

  if (rpKind === 'members') {
    const cols = [['opening', 'Opening'], ['billed', 'Billed'], ['received', 'Received'], ['reversed', 'Cancelled receipts'], ['adjDebit', 'Corrections +'], ['adjCredit', 'Corrections −'], ['closing', 'Closing']];
    $('#rp-body').innerHTML = head + `<p class="muted">Like the Sundry Debtors group summary: each unit’s opening balance on 1 April (including balances taken over on 30 Sep 2026), what was billed and received during the year, and the closing balance on 31 March.</p>
      <div class="table-scroll"><table><thead><tr><th>Unit</th><th>Member</th>${cols.map(([, l]) => `<th class="num">${l} (₹)</th>`).join('')}</tr></thead>
      <tbody>${st.rows.map((r) => `<tr><td class="unit">${esc(r.unit)}</td><td>${esc(r.name)}</td>${cols.map(([k]) => `<td class="num">${k === 'opening' || k === 'closing' ? amt(r[k]) : r[k] ? fmt(r[k]) : ''}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total, ${st.rows.length} units</td>${cols.map(([k]) => `<td class="num">${k === 'opening' || k === 'closing' ? amt(st.total[k]) : fmt(st.total[k])}</td>`).join('')}</tr></tfoot></table></div>`;
    rpCsv = { name: `member-statement-${fy}`, rows: [['Unit', 'Member', ...cols.map(([, l]) => l)], ...st.rows.map((r) => [r.unit, r.name, ...cols.map(([k]) => r[k])]), ['Total', '', ...cols.map(([k]) => st.total[k])]] };
  }

  if (rpKind === 'heads') {
    const sums = {};
    for (const b of bills) for (const l of b.lines || []) sums[l.code] = (sums[l.code] || 0) + l.amount;
    const heads = PARTICULARS.filter(([c]) => sums[c]);
    // Tally years: group the journal debits by their Tally ledger name.
    for (const e of rpData.tally.filter((x) => x.vchType === 'Journal' && x.debit)) {
      const key = `tally:${e.particulars}`;
      if (!sums[key]) heads.push([key, `${e.particulars} (Tally)`]);
      sums[key] = (sums[key] || 0) + e.debit;
    }
    const total = Object.values(sums).reduce((a, x) => a + x, 0);
    $('#rp-body').innerHTML = head + `<p class="muted">What was billed under each head this year (arrears not included)${rpData.tally.length ? '; heads marked Tally come from the Society’s Tally ledger' : ''}. Sinking fund and repairs fund lines show what has been raised for those funds.</p>
      <div class="table-scroll"><table><thead><tr><th>Head</th><th class="num">Billed (₹)</th><th class="num">Share</th></tr></thead>
      <tbody>${heads.map(([c, l]) => `<tr><td>${esc(l)}</td><td class="num">${fmt(sums[c])}</td><td class="num">${total ? Math.round((sums[c] / total) * 1000) / 10 + '%' : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No bills in this year.</td></tr>'}</tbody>
      <tfoot><tr><td>Total billed</td><td class="num">${fmt(total)}</td><td></td></tr></tfoot></table></div>`;
    rpCsv = { name: `billing-by-head-${fy}`, rows: [['Head', 'Billed'], ...heads.map(([c, l]) => [l, sums[c]]), ['Total', total]] };
  }

  if (rpKind === 'collections') {
    const byMode = {};
    okPays.forEach((p) => { byMode[p.mode] = (byMode[p.mode] || 0) + p.amount; });
    const cancelled = pays.filter((p) => p.status === 'cancelled');
    const tallyRcpts = rpData.tally.filter((e) => e.vchType === 'Receipt' && e.credit)
      .map((e) => ({ date: e.date, receiptNo: `Tally ${e.vchNo}`, unit: e.unit, name: e.name, mode: e.particulars, reference: '', amount: e.credit, status: 'ok' }));
    tallyRcpts.forEach((p) => { byMode[`${p.mode} (Tally)`] = (byMode[`${p.mode} (Tally)`] || 0) + p.amount; });
    okPays.push(...tallyRcpts);
    const list = [...pays, ...tallyRcpts].sort((a, b) => a.date.localeCompare(b.date) || String(a.receiptNo).localeCompare(String(b.receiptNo)));
    $('#rp-body').innerHTML = head + `
      <dl class="dues-summary">${Object.entries(byMode).map(([m, a]) => `<div><dt>${esc(m)} (₹)</dt><dd>${fmt(a)}</dd></div>`).join('')}
        <div><dt>Total received (₹)</dt><dd class="credit">${fmt(okPays.reduce((a, p) => a + p.amount, 0))}</dd></div>
        <div><dt>Cancelled receipts</dt><dd>${cancelled.length} <small class="muted">₹ ${fmt(cancelled.reduce((a, p) => a + p.amount, 0))}</small></dd></div></dl>
      <h2>Receipt register</h2>
      <div class="table-scroll"><table><thead><tr><th>Date</th><th>Receipt no.</th><th>Unit</th><th>Name</th><th>Mode / ref.</th><th class="num">Amount (₹)</th><th>Status</th></tr></thead>
      <tbody>${list.map((p) => `<tr><td>${dd(p.date)}</td><td>${esc(p.receiptNo)}</td><td class="unit">${esc(p.unit)}</td><td>${esc(p.name)}</td><td>${esc(p.mode)} ${esc(p.reference || '')}</td><td class="num">${fmt(p.amount)}</td><td>${p.status === 'cancelled' ? '<span class="status-pill cancelled">Cancelled</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No receipts in this year.</td></tr>'}</tbody></table></div>`;
    rpCsv = { name: `receipts-${fy}`, rows: [['Date', 'Receipt No', 'Unit', 'Name', 'Mode', 'Reference', 'Amount', 'Status'], ...list.map((p) => [p.date, p.receiptNo, p.unit, p.name, p.mode, p.reference, p.amount, p.status])] };
  }

  if (rpKind === 'tally') {
    renderTallyBooks();
    rpCsv = tallyCsv;
    return;
  }

  if (rpKind === 'close') {
    const c = rpData.closing;
    const ended = todayIST() > st.to;
    const committee = canDo('committee');
    $('#rp-body').innerHTML = head + `
      <p>Closing a financial year freezes it for audit: the member-wise closing balances on 31 March are saved as they stand, and no bill, payment or correction can be dated on or before 31 March of that year. The closing balances are the opening balances of the next year.</p>
      ${c ? `<div class="callout"><p><strong>${c.status === 'closed' ? 'Closed' : 'Reopened'}.</strong> Closed on ${esc(tsText(c.closedAt))}; closing balance ₹ ${fmt(c.total?.closing || 0)} for ${c.units?.length || 0} units.${c.note ? ` Note: ${esc(c.note)}` : ''}${c.status === 'reopened' ? ` Reopened on ${esc(tsText(c.reopenedAt))}: ${esc(c.reopenReason || '')}` : ''}</p></div>` : ''}
      ${!committee ? '<p class="muted">Only the committee can close or reopen a year.</p>'
        : !ended ? `<p class="muted">This year ends on ${longDate(st.to)}. It can be closed after that, once all March payments are entered and the accounts are checked.</p>`
        : c?.status === 'closed' ? `<div class="form-actions"><button class="btn btn-danger" type="button" id="rp-reopen">Reopen ${fy}</button></div>`
        : `<label class="inline-label">Note for the record (e.g. audited by …)<input type="text" id="rp-note"></label>
           <div class="form-actions"><button class="btn btn-primary" type="button" id="rp-close">Close financial year ${fy}</button></div>`}`;
    rpCsv = null;
  }
}

function wireReports() {
  $('#rp-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-rp]'); if (b && rpData) { rpKind = b.dataset.rp; renderReport(); } });
  $('#rp-fy').addEventListener('change', (e) => buildReport(e.target.value).catch((err) => alert(errorText(err))));
  $('#rp-print').addEventListener('click', () => window.print());
  $('#rp-csv').addEventListener('click', () => {
    if (!rpCsv) return alert('This page has nothing to download.');
    const csv = rpCsv.rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv' }), `${rpCsv.name}.csv`).catch((err) => alert(errorText(err)));
  });
  $('#rp-body').addEventListener('click', async (e) => {
    if (e.target.id === 'rp-close') {
      if (!confirm(`Close financial year ${rpData.fy}? Entries dated on or before ${longDate(rpData.st.to)} will be locked.`)) return;
      await busy(e.target, async () => {
        try { await closeFinancialYear(fb, rpData.st, $('#rp-note').value.trim()); billing = await loadBilling(fb); await buildReport(rpData.fy); }
        catch (err) { alert(errorText(err)); }
      });
    }
    if (e.target.id === 'rp-reopen') {
      const reason = prompt('Why is this year being reopened? (recorded)');
      if (!reason) return;
      await busy(e.target, async () => {
        try {
          // Go back to the end of the previous year if that one is closed, else no lock.
          const prevFy = `${Number(rpData.fy.slice(0, 4)) - 1}-${rpData.fy.slice(2, 4)}`;
          const prev = await fb.F.getDoc(fb.F.doc(fb.db, 'fyClosing', prevFy)).catch(() => null);
          await reopenFinancialYear(fb, rpData.fy, reason, prev?.exists() && prev.data().status === 'closed' ? prev.data().to : '');
          billing = await loadBilling(fb);
          await buildReport(rpData.fy);
        } catch (err) { alert(errorText(err)); }
      });
    }
  });
}

/* ---------------- Tally books archive viewer ---------------- */

let tallyArchive = null, tallyCsv = null;
async function renderTallyBooks() {
  const body = $('#rp-body');
  if (!tallyArchive) {
    body.innerHTML = '<p class="muted">Loading the Tally books…</p>';
    tallyArchive = await loadTallyArchive(fb).catch(() => null) || { none: true };
  }
  if (tallyArchive.none) { body.innerHTML = '<p class="muted">No Tally books archive yet. The committee can add it under Settings → Tally migration.</p>'; return; }
  const a = tallyArchive;
  const byParent = {};
  a.ledgers.forEach((l) => (byParent[l.parent || 'Other'] ??= []).push(l));
  const sel = $('#tb-ledger')?.value || '';
  body.innerHTML = `<p class="muted">Read-only copy of the Tally books of ${esc(a.company)}, ${ddmmyyyy(a.fromDate)} to ${ddmmyyyy(a.toDate)}: ${a.ledgers.length} ledgers, ${a.vouchers.length} vouchers. Shown for the financial year selected above.</p>
    <label class="inline-label">Ledger<select id="tb-ledger"><option value="">Choose a ledger</option>${Object.keys(byParent).sort().map((p) => `<optgroup label="${esc(p)}">${byParent[p].sort((x, y) => x.name.localeCompare(y.name)).map((l) => `<option ${l.name === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <div id="tb-out" class="mt-sm"></div>`;
  $('#tb-ledger').addEventListener('change', () => renderTallyLedger());
  if (sel) renderTallyLedger();
}

function renderTallyLedger() {
  const name = $('#tb-ledger').value, out = $('#tb-out');
  if (!name) { out.innerHTML = ''; tallyCsv = null; return; }
  const a = tallyArchive, l = a.ledgers.find((x) => x.name === name);
  const { from, to } = fyBounds(rpData.fy);
  const lines = [];
  for (const v of a.vouchers) for (const x of v.l) if (x.g === name) lines.push({ date: v.d, type: v.t, no: v.n, narr: v.r, other: v.l.filter((y) => y.g !== name).map((y) => y.g).join(' / '), d: x.d, c: x.c });
  lines.sort((p, q) => p.date.localeCompare(q.date));
  let bal = (l?.opening || 0) + lines.filter((x) => x.date < from).reduce((s2, x) => s2 + x.d - x.c, 0);
  const openBal = bal;
  const inYear = lines.filter((x) => x.date >= from && x.date <= to);
  out.innerHTML = `<div class="table-scroll"><table class="ledger"><thead><tr><th>Date</th><th>Particulars</th><th>Voucher</th><th class="num">Debit (₹)</th><th class="num">Credit (₹)</th><th class="num">Balance (₹)</th></tr></thead><tbody>
    <tr class="fy-line"><td>${dd(from)}</td><td colspan="4"><strong>Opening balance</strong></td><td class="num"><strong>${amt(openBal)}</strong></td></tr>
    ${inYear.map((x) => { bal += x.d - x.c; return `<tr><td>${dd(x.date)}</td><td>${esc(x.other)}${x.narr ? `<span class="sub">${esc(x.narr)}</span>` : ''}</td><td>${esc(x.type)} ${esc(x.no)}</td><td class="num">${x.d ? fmt(x.d) : ''}</td><td class="num">${x.c ? fmt(x.c) : ''}</td><td class="num">${amt(bal)}</td></tr>`; }).join('')}
    <tr class="fy-line"><td>${dd(to)}</td><td colspan="4"><strong>Closing balance</strong></td><td class="num"><strong>${amt(bal)}</strong></td></tr></tbody></table></div>
    <p class="muted">Debit balances are shown as amounts, credit balances with Cr.</p>`;
  tallyCsv = { name: `tally-${name.replace(/[^A-Za-z0-9]+/g, '-')}-${rpData.fy}`, rows: [['Date', 'Particulars', 'Voucher type', 'Voucher no', 'Narration', 'Debit', 'Credit'], ...inYear.map((x) => [x.date, x.other, x.type, x.no, x.narr, x.d, x.c])] };
  rpCsv = tallyCsv;
}

/* ---------------- documents archive ---------------- */

let archive = [];
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

async function loadDocuments() {
  archive = await listArchive(fb);
  $('#doc-rows').innerHTML = archive.map((d) => `<tr>
    <td><strong>${esc(d.title)}</strong>${d.note ? `<span class="sub">${esc(d.note)}</span>` : ''}</td>
    <td>${esc(d.fy || '')}</td><td>${esc(d.category || '')}</td><td class="num">${d.pages || ''}</td><td class="num">${kb(d.bytes || 0)}</td>
    <td><div class="row-actions"><button class="btn btn-small btn-primary" type="button" data-doc-open="${esc(d.id)}">Open</button>
      ${canDo('committee') ? `<button class="btn btn-small" type="button" data-doc-del="${esc(d.id)}">Delete</button>` : ''}</div></td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No documents yet.</td></tr>';
}

/** Opens an archived PDF in a new tab (the tab is opened first so pop-up blockers allow it). */
async function openDoc(id, msgEl) {
  const d = archive.find((x) => x.id === id) || (await listArchive(fb)).find((x) => x.id === id);
  if (!d) return;
  if (inApp) {
    try { await saveBlob(await archiveBlob(fb, d), `${d.title}.pdf`); }
    catch (err) { if (msgEl) { msgEl.className = 'form-msg'; msgEl.textContent = errorText(err); } else alert(errorText(err)); }
    return;
  }
  const win = window.open('', '_blank');
  if (win) win.document.write(`<p style="font:16px system-ui;padding:2rem">Opening ${esc(d.title)}…</p>`);
  try {
    const url = await openArchiveDoc(fb, d);
    if (win) win.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `${d.title}.pdf`; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  } catch (err) { if (win) win.close(); if (msgEl) { msgEl.className = 'form-msg'; msgEl.textContent = errorText(err); } else alert(errorText(err)); }
}

function wireDocuments() {
  const f = $('#doc-form');
  f.category.innerHTML = ARCHIVE_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
  f.file.addEventListener('change', () => {
    const file = f.file.files[0];
    if (file && !f.title.value) f.title.value = file.name.replace(/\.pdf$/i, '');
    const m = file && file.name.match(/(20\d\d)\s*-\s*(?:20)?(\d\d)/);
    if (m && !f.fy.value) f.fy.value = `${m[1]}-${m[2]}`;
    if (file && /audit/i.test(file.name)) f.category.value = 'Audited accounts';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = f.file.files[0];
    if (!file) return setMsg(f, 'Choose a PDF file.');
    if (f.fy.value && !/^\d{4}-\d{2}$/.test(f.fy.value)) return setMsg(f, 'Write the year like 2011-12.');
    await busy($('button[type=submit]', f), async () => {
      try {
        await uploadArchiveDoc(fb, file, { title: f.title.value.trim(), category: f.category.value, fy: f.fy.value.trim(), note: f.note.value.trim() },
          (i, n) => { $('#doc-progress').textContent = `Uploading part ${i} of ${n}…`; });
        $('#doc-progress').textContent = '';
        f.reset();
        setMsg(f, 'Uploaded.', true);
        await loadDocuments();
      } catch (err) { $('#doc-progress').textContent = ''; setMsg(f, esc(errorText(err))); }
    });
  });
  document.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-doc-open]');
    if (o) { e.preventDefault(); return openDoc(o.dataset.docOpen, $('#doc-open-msg')); }
    const del = e.target.closest('[data-doc-del]');
    if (del) {
      const d = archive.find((x) => x.id === del.dataset.docDel);
      if (!d || !confirm(`Delete “${d.title}” from the archive? This can’t be undone.`)) return;
      await busy(del, async () => { try { await deleteArchiveDoc(fb, d); await loadDocuments(); } catch (err) { alert(errorText(err)); } });
    }
  });
}

/* ---------------- audited accounts (2011-12 to 2017-18) ---------------- */

let auditCache = [];
const inr = (n) => (n == null ? '—' : fmt(n));
const dmy = (iso) => (iso ? ddmmyyyy(iso) : '—');

function stmtTable(title, groups, totalLabel, total) {
  return `<div class="table-scroll"><table class="stmt"><thead><tr><th>${esc(title)}</th><th class="num">₹</th><th class="num">₹</th></tr></thead><tbody>
    ${groups.map((g) => `<tr class="grp"><td>${esc(g.group)}</td><td></td><td class="num">${inr(g.total)}</td></tr>
      ${g.items.map((i) => `<tr class="item"><td>${esc(i.name)}</td><td class="num">${inr(i.amount)}</td><td></td></tr>`).join('')}`).join('')}
    </tbody><tfoot><tr class="tot"><td>${esc(totalLabel)}</td><td></td><td class="num">${inr(total)}</td></tr></tfoot></table></div>`;
}

/** Opens the archived audit report for a year, if the committee has uploaded it. */
async function auditDocFor(fy) {
  archive = archive.length ? archive : await listArchive(fb).catch(() => []);
  return archive.find((d) => d.fy === fy && /audit/i.test(`${d.category} ${d.title}`));
}

async function renderAudited(head) {
  const a = rpData.audit, body = $('#rp-body');
  if (!a) {
    body.innerHTML = head + `<p class="muted">No audited statements are loaded for ${esc(rpData.fy)}. Audited figures are available for ${rpData.audits.map((x) => x.fy).join(', ') || 'no years yet'}${rpData.audits.length ? '' : ' (Settings → Audited accounts)'}.</p>`;
    return;
  }
  const ie = a.incomeExpenditure, bs = a.balanceSheet;
  body.innerHTML = head + `
    <dl class="facts audit-facts">
      <div><dt>Audit class</dt><dd>${esc(a.auditClass)}</dd></div>
      <div><dt>Auditor</dt><dd>${esc(a.auditor.name)}<br><small class="muted">${esc(a.auditor.role)}, panel ${esc(a.auditor.panel)}</small></dd></div>
      <div><dt>Audit report dated</dt><dd>${dmy(a.reportDate)}</dd></div>
      <div><dt>Annual general meeting</dt><dd>${dmy(a.agmDate)}</dd></div>
      <div><dt>Committee meetings in the year</dt><dd>${a.committeeMeetings}</dd></div>
      <div><dt>Ordinary members</dt><dd>${a.ordinaryMembers}</dd></div>
      <div><dt>Office bearers</dt><dd><small>Chairman ${esc(a.officeBearers.chairman)}<br>Secretary ${esc(a.officeBearers.secretary)}<br>Treasurer ${esc(a.officeBearers.treasurer)}</small></dd></div>
      <div><dt>Audit fee</dt><dd>₹ ${inr(a.auditFee.amount)}<br><small class="muted">${esc(a.auditFee.bill)}</small></dd></div>
      ${a.accountingFee ? `<div><dt>Accounting fee</dt><dd>₹ ${inr(a.accountingFee.amount)}<br><small class="muted">${esc(a.accountingFee.by)}: ${esc(a.accountingFee.detail)}</small></dd></div>` : ''}
    </dl>
    <p class="mt-sm"><span id="audit-doc-slot" class="muted">Looking for the scanned report…</span></p>
    ${a.notes.length ? `<div class="callout"><p><strong>Notes on this year’s file</strong></p><ul>${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    <h2>Income &amp; expenditure</h2>
    ${ie ? `<p class="muted">${esc(ie.asPrinted)} (page ${ie.page} of the report). Income ₹ ${inr(a.income)}, expenditure ₹ ${inr(a.expenditure)}, surplus ₹ ${inr(a.surplus)}.</p>
      <div class="stmt-pair">${stmtTable('Expenditure', ie.expenditure, 'Surplus transferred to balance sheet', a.surplus)}${stmtTable('Income', ie.income, 'Total income', a.income)}</div>`
      : `<p class="muted">The income &amp; expenditure statement for this year is not in the file; the surplus of ₹ ${inr(a.surplus)} is from the balance sheet.</p>`}
    <h2>Balance sheet on ${dmy(a.to)}</h2>
    <p class="muted">${esc(bs.asPrinted)} (page ${bs.page}). Total ₹ ${inr(bs.total)}.</p>
    <div class="stmt-pair">${stmtTable('Liabilities', bs.liabilities, 'Total', bs.total)}${stmtTable('Assets', bs.assets, 'Total', bs.total)}</div>
    <h2>Sundry debtors</h2>
    <div class="table-scroll"><table><tbody>
      <tr><td>Commercial members (shops)</td><td class="num">${inr(a.debtors.commercial)}</td></tr>
      <tr><td>Residential members</td><td class="num">${inr(a.debtors.residential)}</td></tr>
      <tr><td><strong>Members’ maintenance dues</strong></td><td class="num"><strong>${inr(a.debtors.members)}</strong></td></tr>
      <tr><td>Builder pending maintenance (also shown as Reserve under liabilities)</td><td class="num">${inr(a.debtors.builderPending)}</td></tr>
    </tbody></table></div>
    <h2>Auditor’s remarks</h2>
    <p>${esc(a.overall)}</p>
    <p><strong>Compliance:</strong></p><ul>${a.compliance.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <p><strong>Suggestions:</strong></p><ul>${a.suggestions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <p class="muted">${esc(a.appointment)}</p>
    <h2>Managing committee</h2>
    <div class="table-scroll"><table><thead><tr><th>Unit</th><th>Name</th><th>Role</th></tr></thead><tbody>
      ${a.committee.map((c) => `<tr><td class="unit">${esc(unitName(c.unitId))}</td><td>${esc(c.name)}</td><td>${esc(c.role)}</td></tr>`).join('')}</tbody></table></div>`;
  const d = await auditDocFor(a.fy);
  const slot = $('#audit-doc-slot');
  if (slot) slot.outerHTML = d ? `<button class="btn btn-primary" type="button" data-doc-open="${esc(d.id)}">Open the audit report (${d.pages || ''} pages)</button>`
    : `<span class="muted">The scanned report for ${esc(a.fy)} isn’t in Documents yet.</span>`;
}

function unitName(id) { return units.find((u) => u.id === id)?.unit || id.replace('-', ' '); }

function auditCsv() {
  const a = rpData.audit;
  if (!a) return null;
  const rows = [['Statement', 'Group', 'Item', 'Amount']];
  for (const [st, side] of [['Income & expenditure', 'income'], ['Income & expenditure', 'expenditure']]) for (const g of a.incomeExpenditure?.[side] || []) for (const i of g.items) rows.push([`${st} – ${side}`, g.group, i.name, i.amount]);
  for (const side of ['liabilities', 'assets']) for (const g of a.balanceSheet[side]) for (const i of g.items) rows.push([`Balance sheet – ${side}`, g.group, i.name, i.amount]);
  return { name: `audited-statements-${a.fy}`, rows };
}

function renderAuditSummary(head) {
  const a = rpData.audit;
  const bank = a.balanceSheet.assets.flatMap((g) => g.items).filter((i) => /bank/i.test(i.name)).reduce((s2, i) => s2 + i.amount, 0);
  const cash = a.balanceSheet.assets.flatMap((g) => g.items).filter((i) => /cash/i.test(i.name)).reduce((s2, i) => s2 + i.amount, 0);
  const fd = a.balanceSheet.assets.flatMap((g) => g.items).filter((i) => /fixed deposit/i.test(i.name)).reduce((s2, i) => s2 + i.amount, 0);
  const prev = rpData.audits.find((x) => x.to === `${a.from.slice(0, 4)}-03-31`);
  const maint = a.incomeExpenditure?.income.flatMap((g) => g.items).filter((i) => /maint/i.test(i.name)).reduce((s2, i) => s2 + i.amount, 0);
  $('#rp-body').innerHTML = head + `
    <p class="muted">From the audited accounts (audit class ${esc(a.auditClass)}, report dated ${dmy(a.reportDate)}).</p>
    <dl class="dues-summary">
      <div><dt>Income (₹)</dt><dd>${inr(a.income)}</dd></div>
      <div><dt>Expenditure (₹)</dt><dd>${inr(a.expenditure)}</dd></div>
      <div><dt>Surplus (₹)</dt><dd class="credit">${inr(a.surplus)}</dd></div>
      <div><dt>Members’ dues on 31 March (₹)</dt><dd class="due">${inr(a.debtors.members)}</dd></div>
      <div><dt>Builder pending (₹)</dt><dd>${inr(a.debtors.builderPending)}</dd></div>
      <div><dt>Bank, cash and fixed deposits (₹)</dt><dd>${inr(bank + cash + fd)}</dd></div>
    </dl>
    <div class="table-scroll mt-sm"><table><tbody>
      ${prev ? `<tr><td>Members’ dues on 1 April (previous year end)</td><td class="num">${inr(prev.debtors.members)}</td></tr>` : ''}
      ${maint != null ? `<tr><td>Maintenance and lift charges (income as per audit)</td><td class="num">${inr(maint)}</td></tr>` : ''}
      ${rpData.old.length ? `<tr><td>Received as per the past committee’s receipts (towards maintenance)</td><td class="num">${inr(rpData.old.filter(towardDues).reduce((t, r) => t + r.amount, 0))}</td></tr>
        <tr><td>Other payments in those receipts (builder pending, transfer fees …)</td><td class="num">${inr(rpData.old.filter((r) => prCounts(r) && !towardDues(r)).reduce((t, r) => t + r.amount, 0))}</td></tr>` : ''}
      <tr><td>Bank balances</td><td class="num">${inr(bank)}</td></tr><tr><td>Cash in hand</td><td class="num">${inr(cash)}</td></tr><tr><td>Fixed deposits</td><td class="num">${inr(fd)}</td></tr>
      <tr><td>Annual general meeting</td><td class="num">${dmy(a.agmDate)}</td></tr><tr><td>Committee meetings</td><td class="num">${a.committeeMeetings}</td></tr>
    </tbody></table></div>`;
  rpCsv = auditCsv();
}

function renderAuditMembers(head) {
  const a = rpData.audit;
  const prev = rpData.audits.find((x) => x.to === `${a.from.slice(0, 4)}-03-31`);
  const prevMap = Object.fromEntries((prev?.dues || []).map((r) => [r.unitId, r.amount]));
  const curMap = Object.fromEntries(a.dues.map((r) => [r.unitId, r]));
  const regName = Object.fromEntries(a.members.filter((m) => m.name).map((m) => [m.unitId, m.name]));
  const showFlow = a.dues.some((r) => r.billed != null);
  const ids = [...new Set([...units.map((u) => u.id)])];
  const rows = ids.map((id) => {
    const r = curMap[id];
    const name = r?.name || regName[id] || units.find((u) => u.id === id)?.name || '';
    return { id, unit: unitName(id), name, opening: prev ? (prev.duesComplete || id in prevMap ? (prevMap[id] ?? 0) : null) : null,
      billed: r?.billed ?? null, received: r?.received ?? null, closing: r ? r.amount : (a.duesComplete ? 0 : null),
      oldRcpt: rpData.old.filter((x) => x.unitId === id && towardDues(x)).reduce((t, x) => t + x.amount, 0) };
  });
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  const showOld = rpData.old.length > 0;
  $('#rp-body').innerHTML = head + `<p class="muted">Each unit’s balance from the member-wise lists attached to the audit report${prev ? ` (opening = balance on 31 March ${a.from.slice(0, 4)} in the previous year’s report)` : ''}. Amounts with Cr are in the member’s favour.${a.duesComplete ? '' : ' <strong>This year’s file has only the commercial list; residential balances are not available.</strong>'}</p>
    <div class="table-scroll"><table><thead><tr><th>Unit</th><th>Name in the audited list</th>${prev ? '<th class="num">Opening (₹)</th>' : ''}${showFlow ? '<th class="num">Billed (₹)</th><th class="num">Received as per audit (₹)</th>' : ''}${showOld ? '<th class="num">Old receipts (₹)</th>' : ''}<th class="num">Closing on 31 March (₹)</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="unit">${esc(r.unit)}</td><td>${esc(r.name)}</td>${prev ? `<td class="num">${r.opening == null ? '—' : amt(r.opening)}</td>` : ''}${showFlow ? `<td class="num">${r.billed ? fmt(r.billed) : ''}</td><td class="num">${r.received ? fmt(r.received) : ''}</td>` : ''}${showOld ? `<td class="num${showFlow && r.received != null && Math.round(r.received) !== Math.round(r.oldRcpt) ? ' warn-cell' : ''}">${r.oldRcpt ? fmt(r.oldRcpt) : ''}</td>` : ''}<td class="num">${r.closing == null ? '—' : amt(r.closing)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">Total</td>${prev ? `<td class="num">${amt(sum('opening'))}</td>` : ''}${showFlow ? `<td class="num">${fmt(sum('billed'))}</td><td class="num">${fmt(sum('received'))}</td>` : ''}${showOld ? `<td class="num">${fmt(sum('oldRcpt'))}</td>` : ''}<td class="num">${amt(sum('closing'))}</td></tr></tfoot></table></div>
    ${showOld ? `<p class="muted">Old receipts: what the past committee’s sheets record as received towards maintenance in ${esc(a.fy)}${showFlow ? '; highlighted where it differs from the audit’s figure for the unit (check the unit file → Old receipts)' : ''}.</p>` : ''}
    <p class="muted">Audited members’ dues: commercial ₹ ${inr(a.debtors.commercial)} + residential ₹ ${inr(a.debtors.residential)} = ₹ ${inr(a.debtors.members)}.</p>`;
  rpCsv = { name: `member-statement-${a.fy}-audited`, rows: [['Unit', 'Name', 'Opening', 'Billed', 'Received as per audit', 'Old receipts', 'Closing'], ...rows.map((r) => [r.unit, r.name, r.opening, r.billed, r.received, r.oldRcpt, r.closing])] };
}

/** Every year side by side: audited years, then the Tally / these-accounts years. */
async function renderTrend(head) {
  const body = $('#rp-body');
  const audits = rpData.audits;
  const ledgerYears = fyList('2018-04-01', todayIST()).reverse();
  const oldBy = {};
  for (const list of Object.values(rpData.oldAll || {})) for (const r of list) if (towardDues(r)) oldBy[r.fy] = (oldBy[r.fy] || 0) + r.amount;
  const rows = audits.map((a) => ({ fy: a.fy, src: 'Audited', cls: a.auditClass, income: a.income, exp: a.expenditure, surplus: a.surplus,
    billed: null, received: oldBy[a.fy] ?? null, oldR: oldBy[a.fy] != null, dues: a.debtors.members, bpm: a.debtors.builderPending, ended: true }));
  for (const fy of ledgerYears) {
    const st = fyStatement(units, rpData.ledgers, fy);
    rows.push({ fy, src: fy < '2026-27' ? 'Tally' : 'These accounts', cls: '', income: null, exp: null, surplus: null,
      billed: st.total.billed, received: st.total.received - st.total.reversed, dues: st.total.closing, bpm: null, ended: st.to < todayIST() });
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.dues || 0)), 1);
  body.innerHTML = head + `<p class="muted">Members’ maintenance dues at the end of each year, with the Society’s income and expenditure where the audited statements give them. 2011-12 to 2017-18 are from the audit reports; later years from the unit ledgers (Tally, then these accounts). The current year shows the balance so far.</p>
    <div class="table-scroll"><table class="trend"><thead><tr><th>Year</th><th>Source</th><th class="num">Income (₹)</th><th class="num">Expen&shy;diture (₹)</th><th class="num">Surplus (₹)</th><th class="num">Maintenance billed (₹)</th><th class="num">Received (₹)</th><th class="num">Members’ dues at year end (₹)</th><th class="bar-cell"><span class="visually-hidden">Dues bar</span></th><th class="num">Builder pending (₹)</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.fy)}</td><td><span class="src-tag">${esc(r.src)}${r.cls ? `, class ${esc(r.cls)}` : ''}</span></td>
      <td class="num">${inr(r.income)}</td><td class="num">${inr(r.exp)}</td><td class="num">${inr(r.surplus)}</td>
      <td class="num">${r.billed == null ? '—' : fmt(r.billed)}</td><td class="num">${r.received == null ? '—' : fmt(r.received)}${r.oldR ? '<sup>*</sup>' : ''}</td>
      <td class="num">${amt(r.dues)}${r.ended ? '' : ' <small class="muted">so far</small>'}</td>
      <td class="bar-cell"><span class="bar" style="width:${Math.round((Math.abs(r.dues) / max) * 100)}%" title="${esc(r.fy)}: members’ dues ₹ ${fmt(r.dues)}"></span></td>
      <td class="num">${inr(r.bpm)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">* Received in audited years: receipts towards maintenance recorded in the past committee’s Excel sheets (October 2011 to October 2016; 2016-17 is part of the year, and the files have no sheets for a few units). Received for ledger years is net of cancelled receipts. Members’ dues from 2018-19 follow each unit’s ledger, which continues from the audited balance on 31 March 2018 (differences with Tally are marked Check in the unit files).</p>`;
  rpCsv = { name: 'over-the-years', rows: [['Year', 'Source', 'Audit class', 'Income', 'Expenditure', 'Surplus', 'Billed', 'Received', 'Members dues at year end', 'Builder pending'],
    ...rows.map((r) => [r.fy, r.src, r.cls, r.income, r.exp, r.surplus, r.billed, r.received, r.dues, r.bpm])] };
}

/* ---------------- Settings: load audited accounts ---------------- */

function wireAuditImport() {
  $('#audit-box').hidden = !canDo('committee');
  $('#audit-import').addEventListener('click', async (e) => {
    const btn = e.currentTarget;   // captured before any await (currentTarget is cleared afterwards)
    const msg = $('#audit-msg'), file = $('#audit-file').files[0];
    if (!file) { msg.className = 'form-msg'; msg.textContent = 'Choose the audited-accounts-2011-2018.json file first.'; return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch { msg.className = 'form-msg'; msg.textContent = 'That file isn’t valid.'; return; }
    if (!String(data.format || '').startsWith('sunshreesuntec-audited-accounts')) { msg.className = 'form-msg'; msg.textContent = 'This isn’t an audited accounts file.'; return; }
    if (!confirm(`Load audited accounts for ${data.years.map((y) => y.fy).join(', ')}? Loading again replaces these years.`)) return;
    await busy(btn, async () => {
      try {
        const n = await importAuditedAccounts(fb, data, (i, k) => { $('#audit-progress').textContent = `${i} of ${k}…`; });
        auditCache = []; await ensureAuditHistory(true).catch((err) => console.warn('audited history for members', err));
        $('#audit-progress').textContent = '';
        auditCache = await loadAuditYears(fb);
        msg.className = 'form-msg ok';
        msg.textContent = `Loaded ${n} audited years. See Reports (choose a year from 2011-12) and each unit file.`;
      } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    });
  });
}

/* ---------------- old receipts (past committee, 2011–2016) ---------------- */

const prStatusLabel = Object.fromEntries(PR_STATUSES);
let prEditing = null;   // record being edited, or { new: true }

function prStatePill(r) {
  const v = r.verify?.state || 'unchecked';
  if (v === 'verified') return '<span class="pill ok">Checked</span>';
  if (v === 'corrected') return '<span class="pill ok">Corrected</span>';
  if (v === 'disputed') return '<span class="pill bad">Discrepancy</span>';
  return (r.checks || []).length ? '<span class="pill warn">To check</span>' : '<span class="pill past">Not checked</span>';
}

function renderOldReceipts() {
  const list = ufOld;
  const counted = list.filter(prCounts), dues = list.filter(towardDues);
  const toCheck = list.filter((r) => (r.checks || []).length && !['verified', 'corrected'].includes(r.verify?.state));
  const checked = list.filter((r) => ['verified', 'corrected'].includes(r.verify?.state));
  $('#pr-cards').innerHTML = list.length ? `
    <div><dt>Receipts</dt><dd>${counted.length}<small class="muted"> of ${list.length} lines</small></dd></div>
    <div><dt>Towards maintenance (₹)</dt><dd class="credit">${fmt(dues.reduce((t, r) => t + r.amount, 0))}</dd></div>
    <div><dt>Other payments (₹)</dt><dd>${fmt(counted.filter((r) => !towardDues(r)).reduce((t, r) => t + r.amount, 0))}</dd></div>
    <div><dt>Checked against the book</dt><dd>${checked.length} of ${list.length}</dd></div>
    <div><dt>Lines to check</dt><dd class="${toCheck.length ? 'due' : ''}">${toCheck.length}</dd></div>` : '';
  const f = $('#pr-filter').value;
  const show = list.filter((r) => !f
    || (f === 'check' && (r.checks || []).length && !['verified', 'corrected'].includes(r.verify?.state))
    || (f === 'notcounted' && !prCounts(r))
    || (['unchecked', 'verified', 'disputed'].includes(f) && ((r.verify?.state || 'unchecked') === f || (f === 'verified' && r.verify?.state === 'corrected'))));
  const canEdit = canDo('corrections');
  $('#pr-rows').innerHTML = show.map((r) => `<tr class="${prCounts(r) ? '' : 'not-counted'}">
      <td>${dd(r.date)}</td><td>${esc(r.receiptNo)}</td>
      <td>${esc(r.head)}${r.period ? `<span class="sub">${esc(r.period)}</span>` : ''}</td>
      <td>${esc(r.mode || '')}${r.remark ? `<span class="sub">${esc(r.remark)}</span>` : ''}</td>
      <td class="num">${fmt(prCounts(r) ? r.amount : (r.listedAmount || r.amount || 0))}</td>
      <td>${prStatePill(r)}${prCounts(r) ? '' : ` <span class="pill past">${esc((prStatusLabel[r.status] || r.status).replace(/ \(not counted\)/, ''))}</span>`}
        ${(r.checks || []).length && !['verified', 'corrected'].includes(r.verify?.state) ? `<span class="flags">${r.checks.map(esc).join('<br>')}</span>` : ''}
        ${r.verify?.note ? `<span class="sub">${esc(r.verify.note)}</span>` : ''}</td>
      <td>${canEdit ? `<button class="btn btn-small" type="button" data-pr="${esc(r.id)}">${r.verify?.state && r.verify.state !== 'unchecked' ? 'Edit' : 'Check / edit'}</button>` : ''}</td></tr>`).join('')
    || `<tr><td colspan="7" class="empty">${list.length ? 'No lines match this filter.' : 'No old receipts for this unit. (Settings → Past committee receipts loads them; some units have no sheet in the files.)'}</td></tr>`;

  // Year by year: receipts towards maintenance, and the audited figure where the audit lists each unit's receipts (2015-16).
  const byYear = receiptsByYear(list);
  const years = auditCache.filter((a) => byYear[a.fy] != null || (a.dues || []).some((d) => d.unitId === fileUnit && d.received != null));
  $('#pr-years').innerHTML = years.length ? `<h3 class="mt-sm">Receipts towards maintenance, by year</h3>
    <div class="table-scroll"><table><thead><tr><th>Year</th><th class="num">Old receipts (₹)</th><th class="num">Received as per audit (₹)</th><th></th></tr></thead><tbody>
    ${years.map((a) => {
      const aud = (a.dues || []).find((d) => d.unitId === fileUnit)?.received;
      const mine = byYear[a.fy] || 0;
      const diff = aud == null ? null : Math.round(aud - mine);
      return `<tr><td>${esc(a.fy)}</td><td class="num">${fmt(mine)}</td><td class="num">${aud == null ? '—' : fmt(aud)}</td>
        <td>${diff == null ? '<span class="muted">The audit doesn’t list receipts by unit this year</span>' : diff ? `<span class="pill warn">Differs by ₹ ${fmt(Math.abs(diff))}</span>` : '<span class="pill ok">Matches</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>` : '';
  loadPastReceiptEdits(fb, fileUnit).then((log) => {
    $('#pr-log').innerHTML = log.length ? `<div class="table-scroll"><table><thead><tr><th>When</th><th>By</th><th>Receipt</th><th>Change</th><th>Reason</th></tr></thead><tbody>
      ${log.map((l) => `<tr><td>${esc(tsText(l.at))}</td><td>${esc(l.byName || '')}</td><td>${esc(l.receiptNo || '')}</td>
        <td>${l.before === null ? 'Added' : Object.keys(l.after || {}).map((k) => `${esc(k)}: ${esc(String(l.before?.[k] ?? '—'))} → ${esc(String(l.after[k]))}`).join('<br>') || ''}${l.verifyAfter && l.verifyAfter !== l.verifyBefore ? `<br>${esc(VERIFY_LABEL[l.verifyAfter] || l.verifyAfter)}` : ''}</td>
        <td>${esc(l.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No changes yet.</p>';
  }).catch(() => { $('#pr-log').innerHTML = ''; });
}

function openOldReceipt(id) {
  const f = $('#pr-form');
  const r = id ? ufOld.find((x) => x.id === id) : null;
  prEditing = r || { new: true };
  f.head.innerHTML = PR_HEADS.map((h) => `<option>${esc(h)}</option>`).join('');
  f.status.innerHTML = PR_STATUSES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  f.verify.innerHTML = PR_VERIFY.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  const u = units.find((x) => x.id === fileUnit);
  $('#pr-title').textContent = r ? `Receipt ${r.receiptNo}, ${u?.unit || ''}` : `Add a receipt from the book, ${u?.unit || ''}`;
  $('#pr-source').textContent = r ? `Source: ${r.source || ''}` : 'For a receipt found in the physical receipt books but missing from the Excel sheets.';
  $('#pr-checks').innerHTML = r && (r.checks || []).length ? `<ul>${r.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
  $('#pr-typed').textContent = r?.asTyped?.date ? `In the Excel sheet the date reads “${r.asTyped.date}”${r.asTyped.dateCell === 'excel-date' ? ' (as Excel stored it)' : ''}${r.listedAmount && r.listedAmount !== r.amount ? `; amount listed ₹ ${fmt(r.listedAmount)}` : ''}.` : '';
  f.receiptNo.value = r?.receiptNo || '';
  f.date.value = r?.date || '';
  f.cash.value = r ? (r.cash || '') : '';
  f.cheque.value = r ? (r.cheque || (r.cash ? '' : r.amount || '')) : '';
  f.head.value = r?.head || 'Maintenance';
  f.status.value = r?.status || 'payment';
  f.period.value = r?.period || '';
  f.remark.value = r?.remark || '';
  f.verify.value = r?.verify?.state && r.verify.state !== 'unchecked' ? r.verify.state : (r ? 'verified' : 'verified');
  f.verifyNote.value = r?.verify?.note || '';
  f.reason.value = '';
  setMsg(f, '');
  $('#pr-dialog').showModal();
}

function wireOldReceipts() {
  $('#pr-filter').addEventListener('change', renderOldReceipts);
  $('#pr-add').addEventListener('click', () => openOldReceipt(null));
  $('#pr-rows').addEventListener('click', (e) => { const b = e.target.closest('[data-pr]'); if (b) openOldReceipt(b.dataset.pr); });
  const f = $('#pr-form');
  $('[data-close]', f).addEventListener('click', () => $('#pr-dialog').close());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const cash = Number(fd.get('cash')) || 0, cheque = Number(fd.get('cheque')) || 0;
    const rec = {
      receiptNo: String(fd.get('receiptNo')).trim(), date: String(fd.get('date')), cash, cheque, amount: cash + cheque,
      mode: cash && cheque ? 'Cash + cheque' : cheque ? 'Cheque' : 'Cash', head: String(fd.get('head')), status: String(fd.get('status')),
      period: String(fd.get('period')).trim(), remark: String(fd.get('remark')).trim()
    };
    const verify = { state: String(fd.get('verify')), note: String(fd.get('verifyNote')).trim() };
    const reason = String(fd.get('reason')).trim();
    if (!rec.receiptNo || !rec.date) return setMsg(f, 'Enter the receipt number and date.');
    if (rec.date < '2011-04-01' || rec.date > '2018-03-31') return setMsg(f, 'Old receipts must be dated between 1 April 2011 and 31 March 2018.');
    if (rec.status === 'payment' && !(rec.amount > 0)) return setMsg(f, 'Enter the amount (cash or cheque), or choose a status that isn’t counted.');
    if (!reason) return setMsg(f, 'Write the reason for this change, e.g. what the receipt book shows.');
    await busy($('button[type=submit]', f), async () => {
      try {
        if (prEditing.new) await addPastReceipt(fb, fileUnit, rec, verify, reason, me?.name || me?.email || '');
        else await savePastReceipt(fb, fileUnit, prEditing, rec, verify, reason, me?.name || me?.email || '');
        $('#pr-dialog').close();
        prCache = null;
        await loadUnitFile();
        showUfPane('oldrcpt');
      } catch (err) { setMsg(f, esc(errorText(err))); }
    });
  });
}

function wirePastReceiptImport() {
  $('#pr-box').hidden = !canDo('committee');
  $('#pr-import').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msg = $('#pr-msg'), file = $('#pr-file').files[0];
    if (!file) { msg.className = 'form-msg'; msg.textContent = 'Choose the past-receipts-2011-2016.json file first.'; return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch { msg.className = 'form-msg'; msg.textContent = 'That file isn’t valid.'; return; }
    if (!String(data.format || '').startsWith('sunshreesuntec-past-receipts')) { msg.className = 'form-msg'; msg.textContent = 'This isn’t a past receipts file.'; return; }
    if (!confirm(`Load ${data.receipts.length} old receipt lines into the unit ledgers?`)) return;
    await busy(btn, async () => {
      try {
        const r = await importPastReceipts(fb, data, units, (i, n) => { $('#pr-progress').textContent = `${i} of ${n}…`; });
        $('#pr-progress').textContent = '';
        prCache = null;
        msg.className = 'form-msg ok';
        msg.textContent = `Loaded ${r.written} receipt lines${r.kept ? `; kept ${r.kept} lines already checked or corrected` : ''}.${r.skippedUnits.length ? ` Not loaded (unit not in the accounts): ${r.skippedUnits.join(', ')}.` : ''} See each unit file → Old receipts.`;
      } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    });
  });
}

let prCache = null;
async function allOldReceipts() {
  prCache ??= await loadAllPastReceipts(fb, units).catch(() => ({}));
  return prCache;
}

/** Collections for an audited year: the past committee's receipt register. */
function renderOldCollections(head) {
  const list = [...rpData.old].sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.receiptNo).localeCompare(String(b.receiptNo), undefined, { numeric: true }));
  const ok = list.filter(prCounts);
  const byHead = {}, byMode = {};
  ok.forEach((r) => { byHead[r.head] = (byHead[r.head] || 0) + r.amount; byMode[r.mode] = (byMode[r.mode] || 0) + r.amount; });
  const checked = list.filter((r) => ['verified', 'corrected'].includes(r.verify?.state)).length;
  $('#rp-body').innerHTML = head + `<p class="muted">From the past committee’s receipt sheets. ${checked} of ${list.length} lines have been checked against the receipt books so far.</p>
    <dl class="dues-summary">${Object.entries(byHead).map(([h, a]) => `<div><dt>${esc(h)} (₹)</dt><dd>${fmt(a)}</dd></div>`).join('')}
      ${Object.entries(byMode).map(([m, a]) => `<div><dt>${esc(m)} (₹)</dt><dd>${fmt(a)}</dd></div>`).join('')}
      <div><dt>Total received (₹)</dt><dd class="credit">${fmt(ok.reduce((t, r) => t + r.amount, 0))}</dd></div></dl>
    <h2>Receipt register</h2>
    <div class="table-scroll"><table class="pr-table"><thead><tr><th>Date</th><th>Receipt no.</th><th>Unit</th><th>For</th><th>Mode / remark</th><th class="num">Amount (₹)</th><th>Status</th></tr></thead>
    <tbody>${list.map((r) => `<tr class="${prCounts(r) ? '' : 'not-counted'}"><td>${dd(r.date)}</td><td>${esc(r.receiptNo)}</td><td class="unit">${esc(unitName(r.unitId))}</td>
      <td>${esc(r.head)}${r.period ? `<span class="sub">${esc(r.period)}</span>` : ''}</td><td>${esc(r.mode || '')}${r.remark ? `<span class="sub">${esc(r.remark)}</span>` : ''}</td>
      <td class="num">${fmt(prCounts(r) ? r.amount : (r.listedAmount || 0))}</td><td>${prStatePill(r)}</td></tr>`).join('')}</tbody></table></div>`;
  rpCsv = { name: `old-receipts-${rpData.fy}`, rows: [['Date', 'Receipt no', 'Unit', 'Paid for', 'Months / details', 'Mode', 'Remark', 'Amount', 'Counted', 'Checked'],
    ...list.map((r) => [r.date, r.receiptNo, unitName(r.unitId), r.head, r.period, r.mode, r.remark, prCounts(r) ? r.amount : 0, prCounts(r) ? 'yes' : (prStatusLabel[r.status] || r.status), VERIFY_LABEL[r.verify?.state || 'unchecked']])] };
}
