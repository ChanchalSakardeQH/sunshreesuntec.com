// Committee accounts: dashboard, monthly bills, payments + receipts, unit ledgers, member access, website content, settings.
import { initFirebase, errorText, googleSignIn } from './firebase.js';
import { PERMS, PERM_LABEL, COMMITTEE_ONLY, STAFF_ROLES, permsFor, isCommitteeRecord, can, DEFAULT_AGREEMENT } from './staff.js';
import {
  loadBilling, loadSite, loadUnits, generateMonth, recordPayment, cancelPayment, addAdjustment,
  updateUnitDetails, importOpening, rebuildPublicDues,
  loadLiftExpenses, addLiftExpense, deleteLiftExpense, unitsServedBy, saveUnitMeasurements, addUnit, publicDuesNeedMasking,
  loadAllLedgers, fyStatement, fyBills, fyPayments, closeFinancialYear, reopenFinancialYear,
  importTallyHistory, mergeLedger, loadHistory, loadMergedLedgers, TAKEOVER_DATE
} from './accounts.js';
import {
  LABEL, ONE_OFF, PREMISES_TYPES, STATUSES, PAYMENT_MODES, CATEGORY_MONTHLY,
  categoryIdFor, liftGroupFor, LIFT_GROUPS, LIFT_KINDS, addMonths, liftExpenseEndMonth, MAX_INTEREST_PA,
  PARTICULARS, buildContext, mmcRates, computeBill, prepareExtras, extrasForUnit, constructionCostOf,
  financialYear, fyBounds, fyList, longDate,
  todayIST, monthOf, monthBounds, addDays, monthLabel, ddmmyyyy, round
} from './billing-core.js';
import { DEFAULT_SITE, MMC_TEMPLATE, DEFAULT_BILLING } from './defaults.js';
import { getDues, getNotices, fmt, esc, fmtDate } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TABS = ['dashboard', 'bills', 'payments', 'units', 'unitfile', 'lift', 'reports', 'members', 'website', 'staff', 'settings', 'profile'];
const TAB_NEED = { reports: 'view', unitfile: 'view', dashboard: 'view', bills: 'view', payments: 'view', units: 'view', lift: 'view', members: 'members', website: 'website', staff: 'committee', settings: 'committee', profile: null };

let me = null;          // this person's admins record (committee or staff)
let agreement = null;   // current staff agreement
const canDo = (p) => (!p ? true : p === 'committee' ? isCommitteeRecord(me) : can(me, p));

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
  dues = await getDues();
  fb = await initFirebase();
  if (!fb) { $('#gate').textContent = 'Firebase isn’t set up yet. Fill in assets/js/firebase-config.js first (see README).'; return; }

  $('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    await busy($('button[type=submit]', form), async () => {
      try { await fb.A.signInWithEmailAndPassword(fb.auth, String(fd.get('email')).trim(), String(fd.get('password'))); }
      catch (err) { setMsg(form, errorText(err)); }
    });
  });
  $('#admin-google').addEventListener('click', async (e) => {
    await busy(e.currentTarget, async () => {
      try { await googleSignIn(fb); } catch (err) { setMsg($('#admin-login'), esc(errorText(err))); }
    });
  });
  fb.A.getRedirectResult(fb.auth).catch((err) => setMsg($('#admin-login'), esc(errorText(err))));
  $('#signout').addEventListener('click', () => fb.A.signOut(fb.auth));
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
  if (withSignOut) $('#gate-out').onclick = () => fb.A.signOut(fb.auth);
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
      gate(`${esc(user.email || 'This account')} isn’t a committee or staff account. If the committee has invited you, sign in with the exact Gmail address they invited.`, true);
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

  agreement = await loadAgreement();
  if (me.kind === 'staff') {
    if (!agreement) { gate('The committee hasn’t published the staff agreement yet. Please try again later.', true); return; }
    if (me.agreementVersion !== agreement.version) { showAgreement(); return; }
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
  $('#agreement-decline').addEventListener('click', () => fb.A.signOut(fb.auth));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const signed = String(fd.get('sign')).trim().replace(/\s+/g, ' ');
    if (!fd.get('agree')) return setMsg(f, 'Tick the box to confirm you have read and accept the agreement.');
    if (signed.length < 3) return setMsg(f, 'Type your full name as your signature.');
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
  $$('.tab').forEach((t) => (t.hidden = t.dataset.tab !== id));
  $$('#admin-nav a').forEach((a) => (a.getAttribute('href') === '#' + id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#admin-nav').classList.remove('open');
  $('#no-units').hidden = units.length > 0 || ['settings', 'staff', 'profile', 'members', 'website'].includes(id) || !canDo('view');
  if (id === 'settings' && !units.length) setTimeout(() => $('#import-box').scrollIntoView({ behavior: 'smooth' }), 50);
  const load = { dashboard: loadDashboard, bills: loadBills, payments: loadPayments, units: renderUnits, unitfile: loadUnitFile, reports: loadReports, lift: loadLift, members: loadMembers, website: loadWebsite, settings: loadSettings, staff: loadStaff, profile: loadProfile }[id];
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
  wireReports();
  wireMembers();
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
      } catch (err) { setMsg(form, esc(errorText(err))); }
    });
  });

  $('#bills-month').value = monthOf(todayIST());
  $('#bills-month').addEventListener('change', (e) => listBills(e.target.value).catch((err) => alert(errorText(err))));
}

async function loadBills() {
  await listBills($('#bills-month').value || monthOf(todayIST()));
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = `receipts-${$('#pay-month').value}.csv`;
    a.click();
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
      <td>${ddmmyyyy(e.date)}</td><td>${esc(liftName(e.lift))}</td><td>${esc(e.kind)}</td>
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

async function loadMembers() {
  const { F, db } = fb;
  const byStatus = (s) => F.getDocs(F.query(F.collection(db, 'users'), F.where('status', '==', s)));
  const [pend, appr] = await Promise.all([byStatus('pending'), byStatus('approved')]);
  const label = (id) => { const u = units.find((x) => x.id === id) || dues.units.find((x) => x.id === id); return u ? u.unit : id; };
  const approvedByUnit = {};
  appr.docs.forEach((d) => (approvedByUnit[d.data().unit] ??= []).push(d.data().name));
  const when = (ts) => (ts?.toDate ? fmtDate(ts.toDate(), { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const contact = (p) => `<td><a href="tel:+91${esc(p.mobile)}">+91 ${esc(p.mobile)}</a></td><td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>`;

  $('#pending-rows').innerHTML = pend.docs.map((d) => {
    const p = d.data(), dup = approvedByUnit[p.unit];
    return `<tr><td class="unit">${esc(label(p.unit))}${dup ? `<span class="dup-warning">Already approved: ${esc(dup.join(', '))}</span>` : ''}</td>
      <td>${esc(p.name)}${p.provider === 'google' ? ' <span class="status-pill">Google</span>' : ''}</td>${contact(p)}<td>${when(p.createdAt)}</td>
      <td><div class="row-actions"><button class="btn btn-small btn-primary" type="button" data-act="approved" data-uid="${d.id}">Approve</button>
      <button class="btn btn-small btn-danger" type="button" data-act="rejected" data-uid="${d.id}" data-confirm="Reject this request?">Reject</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No requests waiting.</td></tr>';

  $('#approved-rows').innerHTML = appr.docs.map((d) => {
    const p = d.data();
    return `<tr><td class="unit">${esc(label(p.unit))}</td><td>${esc(p.name)}</td>${contact(p)}
      <td><div class="row-actions"><button class="btn btn-small btn-danger" type="button" data-act="rejected" data-uid="${d.id}" data-confirm="Remove this member’s access?">Remove access</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No approved members yet.</td></tr>';
}

function wireMembers() {
  const handler = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || (btn.dataset.confirm && !confirm(btn.dataset.confirm))) return;
    await busy(btn, async () => {
      try {
        await fb.F.updateDoc(fb.F.doc(fb.db, 'users', btn.dataset.uid), { status: btn.dataset.act, decidedAt: fb.F.serverTimestamp(), decidedBy: uid });
        await loadMembers();
      } catch (err) { alert(errorText(err)); }
    });
  };
  $('#pending-rows').addEventListener('click', handler);
  $('#approved-rows').addEventListener('click', handler);
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
  const roles = site.committee?.length ? site.committee : [{ role: 'Chairman' }, { role: 'Secretary' }, { role: 'Treasurer' }];
  $('#committee-fields').innerHTML = roles.map((c, i) => `<div class="committee-row">
    <label>Role<input type="text" name="role_${i}" value="${esc(c.role)}"></label>
    <label>Name<input type="text" name="name_${i}" value="${esc(c.name || '')}"></label>
    <label>Phone<input type="tel" name="phone_${i}" value="${esc(c.phone || '')}"></label></div>`).join('');
  const cf = $('#contact-form');
  cf.contactNo.value = site.society.contactNo || '';
  cf.hours.value = site.contact?.hours || '';
}

function wireWebsite() {
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
    const committee = [];
    for (let i = 0; fd.has(`role_${i}`); i++) {
      const role = String(fd.get(`role_${i}`)).trim();
      if (role) committee.push({ role, name: String(fd.get(`name_${i}`)).trim(), phone: String(fd.get(`phone_${i}`)).trim() });
    }
    await busy($('button', cf), async () => {
      try {
        await saveSite({ committee, society: { ...site.society, contactNo: String(fd.get('contactNo')).trim() }, contact: { ...site.contact, hours: String(fd.get('hours')).trim() } });
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

const CAT_COLS = [['maintenance', 'Maintenance / service'], ['water', 'Water'], ['liftYearly', 'Lift (per year)'],
  ['parking', 'Parking'], ['education', 'Education fund'], ['federation', 'Federation fund'], ['election', 'Election fund']];
let draftCats = [];

function renderCategories() {
  $('#rates-head').innerHTML = `<tr><th>Category</th>${CAT_COLS.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th>Units</th></tr>`;
  $('#rates-body').innerHTML = draftCats.map((c, i) => `<tr>
    <td><input type="text" class="cat-name" name="c_${i}_name" value="${esc(c.name)}" aria-label="Category name"></td>
    ${CAT_COLS.map(([k, l]) => `<td class="num"><input type="number" min="0" step="1" name="c_${i}_${k}" value="${c[k] ?? 0}" aria-label="${esc(c.name)} ${l}"></td>`).join('')}
    <td class="num">${units.filter((u) => categoryIdFor(u) === c.id).length}</td></tr>`).join('');
}

async function loadSettings() {
  $('#import-box').hidden = units.length > 0;
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
  bf.interestRatePA.value = billing.interestRatePA ?? 0;
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
    for (const [k] of CAT_COLS) out[k] = round(fd.get(`c_${i}_${k}`) ?? c[k]);
    return out;
  });
}

function wireTallyImport() {
  $('#tally-box').hidden = !canDo('committee');
  $('#tally-import').addEventListener('click', async (e) => {
    const file = $('#tally-file').files[0];
    const msg = $('#tally-msg');
    if (!file) { msg.className = 'form-msg'; msg.textContent = 'Choose the tally-ledgers-2018-2026.json file first.'; return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch { msg.textContent = 'That file isn’t a valid Tally history file.'; return; }
    if (!data.units) { msg.textContent = 'That file has no unit ledgers.'; return; }
    if (!confirm(`Load Tally history for ${Object.keys(data.units).length} units?`)) return;
    await busy(e.currentTarget, async () => {
      try {
        const r = await importTallyHistory(fb, data, units, (i, n) => { $('#tally-progress').textContent = `${i} of ${n}…`; });
        $('#tally-progress').textContent = '';
        msg.className = 'form-msg ok';
        msg.textContent = `Loaded ${r.done.length} units.${r.missing.length ? ` No Tally ledger for: ${r.missing.join(', ')}.` : ''}`;
        // Compare the Tally balance on the takeover date with the opening balance taken over.
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = `maintenance-calculation-${month}.csv`;
    a.click();
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
          ? ' Check that firestore.rules is published in Firebase and that your User UID is in the admins collection.' : '');
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
    const interestRatePA = num('interestRatePA', 0);
    if (interestRatePA > MAX_INTEREST_PA) return setMsg(bf, `Penal interest can’t be more than ${MAX_INTEREST_PA}% simple per year.`);
    if (num('nonOccupancyPct', 10) > 10) return setMsg(bf, 'Non-occupancy charges can’t be more than 10% of service charges.');
    const patch = {
      categories: draftCats, interestRatePA, dueDays: round(num('dueDays', 15)) || 15,
      liftBilling: fd.get('liftBilling'), liftBillMonth: Number(fd.get('liftBillMonth')),
      sinkingPct: num('sinkingPct', 0.25), repairsPct: num('repairsPct', 0.75), nonOccupancyPct: num('nonOccupancyPct', 10)
    };
    await busy($('button[type=submit]', bf), async () => {
      try {
        await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'billing'), patch, { merge: true });
        await saveSite({ interestRatePA, chargesBasis: String(fd.get('chargesBasis')).trim() }); // printed on bills for members too
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

async function loadStaff() {
  const { F, db } = fb;
  agreement = await ensureAgreement();
  const [adm, inv, acc] = await Promise.all([
    F.getDocs(F.collection(db, 'admins')),
    F.getDocs(F.collection(db, 'staffInvites')),
    F.getDocs(F.collection(db, 'staffAgreements'))
  ]);
  staffList = adm.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const claimed = new Set(staffList.map((x) => (x.email || '').toLowerCase()));

  $('#staff-rows').innerHTML = staffList.sort((a, b) => (isCommitteeRecord(b) - isCommitteeRecord(a)) || (a.name || '').localeCompare(b.name || '')).map((x) => {
    const committee = x.kind !== 'staff';
    const agr = committee ? '<span class="muted">Not required</span>'
      : x.agreementVersion === agreement.version ? `<span class="pill-ok">v${x.agreementVersion} accepted</span><br><span class="muted">${esc(tsText(x.agreementAcceptedAt))}</span>`
      : `<span class="warn">${x.agreementVersion ? `Accepted v${x.agreementVersion}; v${agreement.version} pending` : 'Not yet accepted'}</span>`;
    return `<tr><td><strong>${esc(x.name || x.email || x.uid)}</strong><br><span class="muted">${esc(x.email || '')}</span></td>
      <td>${esc(committee ? `Committee${x.role ? ' – ' + x.role : ''}` : x.role)}</td>
      <td>${esc(accessSummary(x))}</td><td>${agr}</td><td>${esc(tsText(x.lastLoginAt))}</td>
      <td>${x.active === false ? '<span class="warn">Suspended</span>' : 'Active'}</td>
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
  const roles = [...new Set([...Object.keys(STAFF_ROLES), ...Object.keys(agreement.roles || {})])];
  $('#role-texts').innerHTML = roles.map((r) => `<label>Responsibilities of ${esc(r)} (one per line)<textarea name="role_${esc(r)}" rows="6">${esc((agreement.roles?.[r] || []).join('\n'))}</textarea></label>`).join('');
}

function wireStaff() {
  const roleOptions = Object.keys(STAFF_ROLES).map((r) => `<option>${esc(r)}</option>`).join('');
  const f = $('#invite-form');
  $('#invite-role').innerHTML = roleOptions;
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

  const sf = $('#staff-form');
  $('#staff-role').innerHTML = roleOptions;
  let editingStaff = null;
  $('#staff-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-staff]');
    if (!b) return;
    editingStaff = staffList.find((x) => x.uid === b.dataset.editStaff);
    $('#staff-title').textContent = `${editingStaff.name || editingStaff.email}`;
    sf.role.value = editingStaff.role;
    $('#staff-perms').innerHTML = permChecks(editingStaff.perms);
    sf.active.checked = editingStaff.active !== false;
    setMsg(sf, '');
    $('#staff-dialog').showModal();
  });
  sf.role.addEventListener('change', () => { $('#staff-perms').innerHTML = permChecks(permsFor(sf.role.value)); });
  $('[data-close]', sf).addEventListener('click', () => $('#staff-dialog').close());
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(sf);
    await busy($('button[type=submit]', sf), async () => {
      try {
        await fb.F.updateDoc(fb.F.doc(fb.db, 'admins', editingStaff.uid), { role: String(fd.get('role')), perms: readPerms(fd), active: Boolean(fd.get('active')) });
        $('#staff-dialog').close();
        await loadStaff();
      } catch (err) { setMsg(sf, esc(errorText(err))); }
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
const ufCache = { members: [], tenants: [], comms: [] };

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
      ['channel', 'How', 'select', opt(['Letter', 'Notice', 'Email', 'WhatsApp', 'SMS', 'Phone call', 'Registered post', 'Meeting / visit'])],
      ['direction', 'Direction', 'select', opt(['Sent to member', 'Received from member', 'Sent to tenant', 'Received from tenant'])],
      ['subject', 'Subject', 'text', null, true, true],
      ['summary', 'Details', 'textarea', null, false, true],
      ['refNo', 'Reference / letter no.', 'text'], ['followUp', 'Follow up on', 'date'],
      ['docLink', 'Document link (copy of letter, email, acknowledgement)', 'url', null, false, true]
    ]
  }
};

const dd = (iso) => (iso ? ddmmyyyy(iso) : '');
const linkHTML = (u) => (u ? ` <a href="${esc(u)}" target="_blank" rel="noopener">Document</a>` : '');

async function loadUnitFile() {
  if (!fileUnit || !units.find((u) => u.id === fileUnit)) fileUnit = units[0]?.id;
  if (!fileUnit) { $('#uf-title').textContent = 'No units yet'; return; }
  $('#uf-pick').innerHTML = unitOptions(false);
  $('#uf-pick').value = fileUnit;
  const u = units.find((x) => x.id === fileUnit);
  const { F, db } = fb;
  const [ledgerSnap, billSnap, paySnap, memSnap, tenSnap, comSnap] = await Promise.all([
    F.getDocs(F.collection(db, 'units', fileUnit, 'ledger')),
    F.getDocs(F.query(F.collection(db, 'bills'), F.where('unitId', '==', fileUnit))),
    F.getDocs(F.query(F.collection(db, 'payments'), F.where('unitId', '==', fileUnit))),
    F.getDocs(F.collection(db, 'units', fileUnit, 'members')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'tenants')).catch(() => ({ docs: [] })),
    F.getDocs(F.collection(db, 'units', fileUnit, 'comms')).catch(() => ({ docs: [] }))
  ]);
  ufCache.members = memSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.admissionDate || '').localeCompare(a.admissionDate || ''));
  ufCache.tenants = tenSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.from || '').localeCompare(a.from || ''));
  ufCache.comms = comSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const currentTenants = ufCache.tenants.filter((t) => !t.to);
  $('#uf-title').textContent = `${u.unit}, ${blockName(u.block)}`;
  $('#uf-sub').innerHTML = [esc(u.name || 'No name on record'), esc(u.type), esc(catName(u)), `Lift: ${liftGroupFor(u) || 'none'}`, `Water: ${Number(u.inlets) > 0 ? 'yes' : 'no'}`, u.carpetArea ? `${fmt(u.carpetArea)} sq ft carpet` : ''].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const lastBill = billSnap.docs.map((d) => d.data()).sort((a, b) => b.month.localeCompare(a.month))[0];
  $('#uf-cards').innerHTML = `
    <div><dt>Balance today (₹)</dt><dd>${amt(u.balance)}</dd></div>
    <div><dt>Unpaid interest included (₹)</dt><dd>${fmt(u.interestDue || 0)}</dd></div>
    <div><dt>Builder pending maintenance (₹)</dt><dd>${u.bpm ? fmt(u.bpm) : '—'}</dd></div>
    <div><dt>Occupancy</dt><dd>${currentTenants.length ? `<span class="pill warn">Rented</span> <small>${esc(currentTenants.map((t) => t.name).join(', '))}</small>` : `<span class="pill ok">${esc(u.status || 'Own / not set')}</span>`}</dd></div>
    <div><dt>Last bill</dt><dd>${lastBill ? `${esc(lastBill.billNo)}<small class="muted"> ₹ ${fmt(lastBill.total)}</small>` : '—'}</dd></div>`;

  // Account
  const liveEntries = ledgerSnap.docs.map((d) => d.data()).sort((a, b) => a.date.localeCompare(b.date) || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  ufHistory = await loadHistory(fb, fileUnit);
  const entries = mergeLedger(liveEntries, ufHistory);
  ufEntries = entries;
  const fys = entries.length ? fyList(entries[0].date, todayIST()) : [financialYear(todayIST())];
  const pick = $('#uf-fy'), keep = pick.value;
  pick.innerHTML = '<option value="">All years</option>' + fys.map((f) => `<option value="${f}">${f}</option>`).join('');
  pick.value = fys.includes(keep) ? keep : '';
  renderUfLedger();
  $('#uf-bills').innerHTML = billSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month))
    .map((b) => `<tr><td>${esc(b.billNo)}</td><td>${monthLabel(b.month)}</td><td class="num">${amt(b.total)}</td><td><a href="print.html?bill=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">View</a></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No bills.</td></tr>';
  $('#uf-receipts').innerHTML = paySnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => `<tr><td>${esc(p.receiptNo)}${p.status === 'cancelled' ? ' <span class="status-pill cancelled">Cancelled</span>' : ''}</td><td>${dd(p.date)}</td><td>${esc(p.mode)}</td><td class="num">${fmt(p.amount)}</td><td><a href="print.html?receipt=${p.id}" target="_blank" rel="noopener">View</a></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">No receipts.</td></tr>';

  const editBtn = (kind, id) => (canDo('unitRecords') ? `<button class="btn btn-small" type="button" data-rec="${kind}" data-id="${esc(id)}">Edit</button>` : '');

  // Members (I & J register)
  $('#uf-members').innerHTML = ufCache.members.map((m) => `<tr>
    <td><strong>${esc(m.name)}</strong>${m.address ? `<span class="sub">${esc(m.address)}</span>` : ''}${linkHTML(m.docLink)}</td>
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
      <td><strong>${esc(t.name)}</strong>${t.mobile ? `<span class="sub">${esc(t.mobile)}</span>` : ''}${linkHTML(t.docLink)}</td>
      <td>${esc(t.use || '')}${t.business ? `<span class="sub">${esc(t.business)}</span>` : ''}</td>
      <td>${dd(t.from)} – ${t.to ? dd(t.to) : 'now'}</td>
      <td>${esc(t.agreementType || '')}${t.agreementNo ? `<span class="sub">No. ${esc(t.agreementNo)}</span>` : ''}${t.agreementTo ? `<span class="sub">Valid ${t.agreementFrom ? `${dd(t.agreementFrom)} – ` : 'till '}${dd(t.agreementTo)}</span>` : ''}</td>
      <td>${t.policeDate ? `${dd(t.policeDate)}<span class="sub">${esc(t.policeStation || '')} ${esc(t.policeRef || '')}</span>` : '—'}</td>
      <td>${current ? '<span class="pill ok">Current</span>' : '<span class="pill past">Past</span>'}${warns.map((w) => ` <span class="pill warn">${w}</span>`).join('')}</td>
      <td>${editBtn('tenants', t.id)}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No tenancies recorded.</td></tr>';

  // Communication
  $('#uf-comms').innerHTML = ufCache.comms.map((c) => `<tr>
    <td>${dd(c.date)}</td><td>${esc(c.channel || '')}</td><td>${esc(c.direction || '')}</td>
    <td><strong>${esc(c.subject)}</strong>${c.summary ? `<span class="sub">${esc(c.summary)}</span>` : ''}${linkHTML(c.docLink)}</td>
    <td>${esc(c.refNo || '')}</td><td>${c.followUp ? `<span class="${c.followUp <= today ? 'pill warn' : ''}">${dd(c.followUp)}</span>` : ''}</td>
    <td>${editBtn('comms', c.id)}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No communication recorded.</td></tr>';

  showUfPane(ufPane);
  applyAccess();
}

let ufEntries = [];
let ufHistory = null;
/** Unit ledger, all years or one financial year with its opening and closing balance. */
function renderUfLedger() {
  const fy = $('#uf-fy').value;
  let bal = 0, rows = '';
  const line = (e) => {
    bal += (e.debit || 0) - (e.credit || 0);
    const tag = e.source === 'tally' ? ' <span class="pill past">Tally</span>' : e.source === 'difference' ? ' <span class="pill warn">Check</span>' : '';
    return `<tr><td>${dd(e.date)}</td><td>${esc(e.particulars)}${tag}</td><td>${esc(e.receipt || '')}</td><td class="num">${e.debit ? fmt(e.debit) : ''}</td><td class="num">${e.credit ? fmt(e.credit) : ''}</td><td class="num">${amt(bal)}</td></tr>`;
  };
  const note = ufHistory ? `<tr class="fy-line"><td colspan="6" class="muted">Entries up to ${dd(ufHistory.takeoverDate)} are from the Society’s Tally ledger (${esc(ufHistory.period || '')}); later entries are from these accounts.${(ufHistory.after || []).length ? ` Tally also has ${ufHistory.after.length} entr${ufHistory.after.length > 1 ? 'ies' : 'y'} after that date, not carried over: ${esc(ufHistory.after.map((e) => `${dd(e.date)} ${e.particulars} ₹ ${fmt(e.debit || e.credit)}`).join('; '))}.` : ''}</td></tr>` : '';
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
  setMsg($('#rec-form'), '');
  $('#rec-dialog').showModal();
}

function wireUnitFile() {
  $('#uf-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) showUfPane(b.dataset.pane); });
  $('#uf-pick').addEventListener('change', (e) => { fileUnit = e.target.value; sessionStorage.setItem('fileUnit', fileUnit); loadUnitFile().catch((err) => alert(errorText(err))); });
  $('#uf-print').addEventListener('click', () => window.print());
  $('#uf-fy').addEventListener('change', renderUfLedger);
  $('#uf-pay').addEventListener('click', () => { payFor = fileUnit; location.hash = '#payments'; });
  $('#uf-edit').addEventListener('click', () => openUnit(fileUnit).catch((err) => alert(errorText(err))));
  $('section[data-tab="unitfile"]').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return openRecord(add.dataset.add);
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
        const col = F.collection(db, 'units', fileUnit, recKind);
        if (recId) await F.updateDoc(F.doc(col, recId), { ...rec, updatedAt: F.serverTimestamp(), updatedBy: uid });
        else await F.addDoc(col, { ...rec, createdAt: F.serverTimestamp(), createdBy: uid });
        $('#rec-dialog').close();
        await loadUnitFile();
        if (recKind === 'tenants') await syncOccupancy();
      } catch (err) { setMsg(f, esc(errorText(err))); }
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
  const first = '2018-04-01';   // Tally history starts 1 Apr 2018 (years without data show zeros)
  const fys = fyList(first, todayIST());
  if (!sel.options.length) {
    sel.innerHTML = fys.map((f) => `<option value="${f}">${f} (1 Apr ${f.slice(0, 4)} – 31 Mar ${Number(f.slice(0, 4)) + 1})</option>`).join('');
  }
  await buildReport(sel.value || fys[0]);
}

async function buildReport(fy) {
  $('#rp-status').textContent = 'Working out the figures…';
  $('#rp-body').innerHTML = '';
  const [{ ledgers, histories }, bills, pays, closingSnap] = await Promise.all([
    loadMergedLedgers(fb, units), fyBills(fb, fy), fyPayments(fb, fy),
    fb.F.getDoc(fb.F.doc(fb.db, 'fyClosing', fy)).catch(() => null)
  ]);
  // Tally entries for this year: bills by particulars, receipts for the register.
  const { from: fyFrom, to: fyTo } = fyBounds(fy);
  const tally = Object.entries(histories).flatMap(([uid, h]) => (h?.entries || []).filter((e) => e.date >= fyFrom && e.date <= fyTo)
    .map((e) => ({ ...e, unitId: uid, unit: units.find((x) => x.id === uid)?.unit, name: units.find((x) => x.id === uid)?.name })));
  rpData = { fy, st: fyStatement(units, ledgers, fy), ledgers, bills, pays, tally, closing: closingSnap?.exists() ? closingSnap.data() : null };
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = `${rpCsv.name}.csv`;
    a.click();
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
