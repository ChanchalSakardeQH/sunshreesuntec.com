// Committee accounts: dashboard, monthly bills, payments + receipts, unit ledgers, member access, website content, settings.
import { initFirebase, errorText } from './firebase.js';
import {
  loadBilling, loadSite, loadUnits, generateMonth, recordPayment, cancelPayment, addAdjustment,
  updateUnitDetails, importOpening, rebuildPublicDues
} from './accounts.js';
import {
  PARTICULARS, LABEL, RECURRING, ONE_OFF, PREMISES_TYPES, STATUSES, PAYMENT_MODES,
  todayIST, monthOf, monthBounds, addDays, monthLabel, ddmmyyyy, round
} from './billing-core.js';
import { getDues, getNotices, fmt, esc, fmtDate } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TABS = ['dashboard', 'bills', 'payments', 'units', 'members', 'website', 'settings'];

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
const unitOptions = (withBalance) => dues.blocks.map((b) => `<optgroup label="${esc(b.name)}">${
  units.filter((u) => u.block === b.id).map((u) => `<option value="${esc(u.id)}">${esc(u.unit)}${u.name ? ' – ' + esc(u.name) : ''}${withBalance ? ` (₹ ${fmt(u.balance)})` : ''}</option>`).join('')
}</optgroup>`).join('');

async function refreshCore() {
  [units, billing, site] = await Promise.all([loadUnits(fb), loadBilling(fb), loadSite(fb)]);
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
    await busy($('button', form), async () => {
      try { await fb.A.signInWithEmailAndPassword(fb.auth, String(fd.get('email')).trim(), String(fd.get('password'))); }
      catch (err) { setMsg(form, errorText(err)); }
    });
  });
  $('#signout').addEventListener('click', () => fb.A.signOut(fb.auth));
  $('.nav-toggle').addEventListener('click', (e) => {
    const nav = $('#admin-nav');
    const open = nav.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  fb.A.onAuthStateChanged(fb.auth, async (user) => {
    $$('.tab').forEach((t) => (t.hidden = true));
    $('#admin-nav').hidden = true;
    if (!user) { $('#gate').hidden = true; $('#admin-login').hidden = false; return; }
    $('#admin-login').hidden = true;
    const adminSnap = await fb.F.getDoc(fb.F.doc(fb.db, 'admins', user.uid)).catch(() => null);
    if (!adminSnap?.exists()) {
      $('#gate').hidden = false;
      $('#gate').innerHTML = `${esc(user.email)} isn’t a committee account. <button class="btn btn-small" type="button" id="gate-out">Sign out</button>`;
      $('#gate-out').onclick = () => fb.A.signOut(fb.auth);
      return;
    }
    uid = user.uid;
    $('#gate').hidden = true;
    $('#admin-nav').hidden = false;
    await refreshCore();
    wireOnce();
    route();
  });
  window.addEventListener('hashchange', () => uid && route());
}

function route() {
  let id = location.hash.slice(1);
  if (!TABS.includes(id)) id = 'dashboard';
  $$('.tab').forEach((t) => (t.hidden = t.dataset.tab !== id));
  $$('#admin-nav a').forEach((a) => (a.getAttribute('href') === '#' + id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#admin-nav').classList.remove('open');
  const load = { dashboard: loadDashboard, bills: loadBills, payments: loadPayments, units: renderUnits, members: loadMembers, website: loadWebsite, settings: loadSettings }[id];
  load().catch((err) => { console.error(err); alert(errorText(err)); });
}

let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  wireBills();
  wirePayments();
  wireUnits();
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
  const noRates = PREMISES_TYPES.every((t) => !billing.rates?.[t]?.maintenance);
  if (!units.length) {
    setup.hidden = false;
    setup.innerHTML = '<h2>Set up the accounts</h2><p>No units yet. Go to <a href="#settings">Settings</a> and import the opening balances.</p>';
  } else if (noRates) {
    setup.hidden = false;
    setup.innerHTML = '<h2>Monthly maintenance rates are ₹0</h2><p>Enter the monthly charges fixed by the General Body in <a href="#settings">Settings</a> before the next bills are generated.</p>';
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
    if (extraCode && !extraAmount) return setMsg(form, 'Enter the extra amount per unit, or set the extra charge to None.');
    if (!units.length) return setMsg(form, 'Import the opening balances in Settings first.');
    const noRates = PREMISES_TYPES.every((t) => !billing.rates?.[t]?.maintenance);
    const warn = noRates ? '\n\nMaintenance rates in Settings are ₹0, so these bills will only carry the other charges.' : '';
    if (!confirm(`Create ${monthLabel(monthKey)} bills for every unit that doesn’t have one yet?${warn}`)) return;

    setMsg(form, '');
    await busy($('button[type=submit]', form), async () => {
      try {
        billing = await loadBilling(fb);
        const res = await generateMonth(fb, {
          monthKey, billDate: String(fd.get('billDate')), dueDate: String(fd.get('dueDate')),
          extras: extraCode ? [{ code: extraCode, amount: extraAmount }] : [], extrasBlock: String(fd.get('extraBlock')),
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
    <td>${p.status === 'cancelled' ? '' : `<button class="btn btn-small btn-danger" type="button" data-cancel="${p.id}">Cancel</button>`}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No receipts this month.</td></tr>';
  const total = lastPayments.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + p.amount, 0);
  $('#pay-foot').innerHTML = lastPayments.length ? `<tr><td colspan="5">Total received in ${monthLabel(month)}</td><td class="num">${fmt(total)}</td><td></td></tr>` : '';
}

/* ---------------- units ---------------- */

let editing = null;

function renderUnits() {
  const q = ($('#units-search').value || '').toLowerCase().replace(/\s/g, '');
  const rows = units.filter((u) => !q || (u.unit + u.name).toLowerCase().replace(/\s/g, '').includes(q));
  $('#units-rows').innerHTML = rows.map((u) => `<tr>
    <td class="unit">${esc(u.unit)}</td>
    <td>${esc(u.name)}${u.unverified ? '<span class="flag">To verify</span>' : ''}${u.active === false ? ' <span class="status-pill">Not billed</span>' : ''}</td>
    <td class="type">${esc(u.type)}</td><td>${esc(u.status || '')}</td>
    <td class="num">${amt(u.balance)}</td><td class="num">${u.bpm ? fmt(u.bpm) : '—'}</td>
    <td><button class="btn btn-small" type="button" data-edit="${esc(u.id)}">Open</button></td></tr>`).join('')
    || `<tr><td colspan="7" class="empty">${units.length ? 'No unit matches.' : 'No units yet. Import the opening balances in Settings.'}</td></tr>`;
  return Promise.resolve();
}

function wireUnits() {
  const form = $('#unit-form');
  form.type.innerHTML = PREMISES_TYPES.map((t) => `<option>${t}</option>`).join('');
  form.status.innerHTML += STATUSES.map((s) => `<option>${s}</option>`).join('');
  $('#unit-charges').innerHTML = RECURRING.map((c) => `<label>${LABEL[c]}<input type="number" min="0" step="1" name="ch_${c}" inputmode="numeric"></label>`).join('');
  $('#units-search').addEventListener('input', renderUnits);
  $('#units-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) openUnit(b.dataset.edit).catch((err) => alert(errorText(err)));
  });
  $('[data-close]', form).addEventListener('click', () => $('#unit-dialog').close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const charges = {};
    for (const c of RECURRING) { const v = fd.get('ch_' + c); if (v !== '') charges[c] = round(v); }
    await busy($('button[type=submit]', form), async () => {
      try {
        await updateUnitDetails(fb, editing, {
          name: String(fd.get('name')).trim(), type: fd.get('type'), status: fd.get('status'),
          bpm: fd.get('bpm') === '' ? null : round(fd.get('bpm')), charges, active: Boolean(fd.get('active'))
        });
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
  form.bpm.value = u.bpm ?? '';
  form.active.checked = u.active !== false;
  for (const c of RECURRING) form['ch_' + c].value = u.charges?.[c] ?? '';
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
  if (!$('#unit-dialog').open) $('#unit-dialog').showModal();
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
      <td>${esc(p.name)}</td>${contact(p)}<td>${when(p.createdAt)}</td>
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

async function loadSettings() {
  $('#import-box').hidden = units.length > 0;
  $('#rates-head').innerHTML = `<tr><th>Premises type</th>${RECURRING.map((c) => `<th class="num">${LABEL[c]}</th>`).join('')}</tr>`;
  $('#rates-body').innerHTML = PREMISES_TYPES.map((t, i) => `<tr><td>${esc(t)}</td>${RECURRING.map((c) =>
    `<td class="num"><input type="number" min="0" step="1" name="r_${i}_${c}" value="${billing.rates?.[t]?.[c] ?? 0}" aria-label="${esc(t)} ${LABEL[c]}"></td>`).join('')}</tr>`).join('');
  const bf = $('#billing-form');
  bf.interestRatePA.value = billing.interestRatePA ?? 0;
  bf.dueDays.value = billing.dueDays ?? 15;
  $('#society-fields').innerHTML = SOCIETY_FIELDS.map(([k, label]) => {
    const [a, b] = k.split('.');
    return `<label>${label}<input type="text" name="${k}" value="${esc(site[a]?.[b] || '')}"></label>`;
  }).join('');
}

function wireSettings() {
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
      } catch (err) { msg.className = 'form-msg'; msg.textContent = errorText(err); }
    });
  });

  const bf = $('#billing-form');
  bf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(bf);
    const rates = {};
    PREMISES_TYPES.forEach((t, i) => { rates[t] = {}; RECURRING.forEach((c) => { rates[t][c] = round(fd.get(`r_${i}_${c}`)); }); });
    const interestRatePA = Number(fd.get('interestRatePA')) || 0;
    const dueDays = round(fd.get('dueDays')) || 15;
    await busy($('button', bf), async () => {
      try {
        await fb.F.setDoc(fb.F.doc(fb.db, 'settings', 'billing'), { rates, interestRatePA, dueDays }, { merge: true });
        await saveSite({ interestRatePA }); // printed on bills for members too
        billing = await loadBilling(fb);
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
