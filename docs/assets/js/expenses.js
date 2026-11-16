// Daily expenses with bill photos (3.7).
//
// Who: staff and committee with "Add expenses" add an expense with photos / scans of the bill. The files are kept in
// the Society's Google Drive through a small Apps Script installed in the Society's Google account
// (tools/drive-upload), filed as  <root>/Expenses/FY 2026-27/2026-11 November/Submitted|Approved|Rejected.
// The expense record (amount, head, payee, who paid, the Drive file ids) is in the database (expenses/{id}).
//
// Flow: submitted → approved (gets a voucher number, files move to Approved) or rejected (with a reason).
// Who paid: the Society (cash / bank / UPI, with reference), a person from their own money (shown as due to them
// until paid back), or not paid yet (the payment is recorded later). Paybacks and advances to staff are
// staffSettlements/{id}; a payback lists the expenses it covers, so every payment links back to its bills.
import { fmt, esc } from './data.js';
import { unitsServedBy, addLiftExpense } from './accounts.js';
import { LIFT_KINDS } from './billing-core.js';

export const EXPENSE_HEADS = [
  'Housekeeping and cleaning', 'Security', 'Electricity', 'Water and tanker', 'Lift maintenance and repair',
  'Plumbing', 'Electrical repairs', 'Civil repairs and painting', 'Garden', 'Pest control', 'Generator and diesel',
  'Office, stationery and printing', 'Postage and courier', 'Bank charges', 'Professional and audit fees',
  'Festival and events', 'Staff welfare', 'Emergency services', 'Other'
];
export const PAY_MODES = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer / NEFT', cheque: 'Cheque', card: 'Card' };
const STATUS = { submitted: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected' };
const PAID_BY = { society: 'Society', person: 'Own money (to pay back)', unpaid: 'Not paid yet' };
const MAX_FILES = 10, MAX_FILE_MB = 12;

let ctx = null;            // from admin.js: fb, uid(), me(), canDo, busy, setMsg, saveBlob, errorText, requireOnline
let filesCfg = null;       // settings/files: { scriptUrl }
let list = [];             // expenses loaded for the chosen period
let settlements = [];      // paybacks and advances
const blobs = new Map();   // Drive file id → object URL (bill images shown in this session)

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const rs = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (n) => `₹ ${rs.format(Math.round((Number(n) || 0) * 100) / 100)}`;
const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
export const fyOf = (date) => { const y = +date.slice(0, 4), m = +date.slice(5, 7), s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
const ddmmyyyy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const tsDate = (t) => (t?.toDate ? t.toDate() : null);
const whenLong = (t) => (tsDate(t) ? tsDate(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const can = (p) => ctx.canDo(p);
const myUid = () => ctx.uid();
const myName = () => ctx.me()?.name || ctx.fb.auth.currentUser?.email || '';
const personKey = (e) => e.paidByUid || `name:${(e.paidByName || '').trim().toLowerCase()}`;

/* ---------------------------------------------------------------- Drive (Apps Script) */

/** Calls the Society's file script with the signed-in person's token. */
async function driveCall(action, payload = {}) {
  if (!filesCfg?.scriptUrl) throw new Error('Bill storage isn’t connected yet. The committee connects it in Expenses → Set-up.');
  const idToken = await ctx.fb.auth.currentUser.getIdToken();
  let res;
  try {
    res = await fetch(filesCfg.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, idToken, ...payload }) });
  } catch {
    throw new Error('Couldn’t reach the bill storage. Check the internet connection and try again.');
  }
  let out;
  try { out = await res.json(); } catch { throw new Error('The bill storage gave an unexpected answer. Ask the committee to check the set-up.'); }
  if (!out.ok) throw new Error(out.error || 'The bill storage refused the request.');
  return out;
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Photos are made smaller (longest side 2000 px, JPEG) so they upload quickly on a phone; PDFs are sent as they are. */
async function prepareFile(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return out && out.size < file.size ? new File([out], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

const safe = (s) => String(s || '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

async function uploadFiles(files, rec, onStep) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    onStep?.(i + 1, files.length);
    const f = await prepareFile(files[i]);
    const ext = (f.name.match(/\.(\w+)$/)?.[1] || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
    const name = `${rec.date} Rs ${rs.format(rec.amount)} ${safe(rec.category)} - ${safe(rec.payee)}${files.length > 1 ? ` (${i + 1})` : ''}.${ext}`;
    const r = await driveCall('upload', { kind: rec.kind || 'bill', month: rec.fileMonth || rec.date.slice(0, 7), name, mimeType: f.type || 'application/octet-stream', data: await toBase64(f),
      note: `${rec.category}; ${rec.payee}; ${money(rec.amount)}; ${rec.description || ''}` });
    out.push({ id: r.file.id, name: r.file.name, mime: r.file.mime, size: r.file.size });
  }
  return out;
}

/** A stored file as a local address. owner: an expense, or { settlementId } for a payback / advance proof. */
async function fileUrl(owner, f) {
  if (blobs.has(f.id)) return blobs.get(f.id);
  const r = await driveCall('fetch', owner.settlementId ? { settlementId: owner.settlementId, fileId: f.id } : { expenseId: owner.id, fileId: f.id });
  const bin = atob(r.data), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u8], { type: r.mime }));
  blobs.set(f.id, url);
  return url;
}

/* ---------------------------------------------------------------- data */

async function loadFilesCfg() {
  const s = await ctx.fb.F.getDoc(ctx.fb.F.doc(ctx.fb.db, 'settings', 'files')).catch(() => null);
  filesCfg = s?.exists() ? s.data() : null;
}

const seesAll = () => can('view') || can('approveExpenses') || can('payExpenses');

async function loadList() {
  const { F, db } = ctx.fb;
  const col = F.collection(db, 'expenses');
  const q = seesAll() ? F.query(col, F.orderBy('date', 'desc'), F.limit(2000)) : F.query(col, F.where('submittedBy', '==', myUid()));
  list = (await F.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sq = seesAll() ? F.collection(db, 'staffSettlements') : F.query(F.collection(db, 'staffSettlements'), F.where('personUid', '==', myUid()));
  settlements = (await F.getDocs(sq).catch(() => ({ docs: [] }))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

async function logStep(expId, action, text = '') {
  const { F, db } = ctx.fb;
  return F.addDoc(F.collection(db, 'expenses', expId, 'log'), { action, text: String(text).slice(0, 300), by: myUid(), byName: myName(), at: F.serverTimestamp() })
    .catch((err) => console.warn('expense log', err));
}

/** Next number in a series per financial year (counters/<series>-<fy>), inside a transaction. */
async function nextNumber(tx, series, fy) {
  const { F, db } = ctx.fb;
  const ref = F.doc(db, 'counters', `${series}-${fy}`);
  const snap = await tx.get(ref);
  const n = (snap.exists() ? Number(snap.data().next) || 1 : 1);
  tx.set(ref, { next: n + 1 });
  return n;
}

/** Per person who paid from their own money: approved bills not yet paid back, advances held. */
function balances() {
  const people = new Map();
  const get = (key, name, uid) => {
    if (!people.has(key)) people.set(key, { key, name, uid: uid || '', due: 0, dueItems: [], advance: 0, paidBack: 0 });
    const p = people.get(key);
    if (name && !p.name) p.name = name;
    return p;
  };
  list.filter((e) => e.paidBy === 'person' && e.status === 'approved').forEach((e) => {
    const p = get(personKey(e), e.paidByName, e.paidByUid);
    if (!e.settlementId) { p.due += e.amount; p.dueItems.push(e); }
  });
  settlements.forEach((s) => {
    const p = get(s.personKey, s.personName, s.personUid);
    if (s.kind === 'advance') p.advance += s.amount;
    else { p.paidBack += s.amount; p.advance -= s.adjusted || 0; }
  });
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------------------------------------------------------- page */

export function initExpenses(c) {
  ctx = c;
  const root = $('[data-tab=expenses]');
  // sub-sections
  $$('.exp-tabs button', root).forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane)));
  wireForm();
  wireList();
  wireDialog();
  wireStaff();
  wireReport();
  wireSetup();
}

function showPane(id) {
  $$('.exp-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === id)));
  $$('.exp-pane').forEach((p) => (p.hidden = p.dataset.pane !== id));
  if (id === 'list') renderList();
  if (id === 'staff') renderStaff();
  if (id === 'payments') renderPayments();
  if (id === 'report') renderReport();
  if (id === 'setup' && filesCfg?.scriptUrl && !$('#exp-setup').scriptUrl.value) $('#exp-setup').scriptUrl.value = filesCfg.scriptUrl;
}

export async function loadExpenses() {
  await loadFilesCfg();
  const add = can('submitExpenses') || can('approveExpenses') || can('payExpenses');
  $('.exp-tabs [data-pane=add]').hidden = !add;
  $('.exp-tabs [data-pane=payments]').hidden = !seesAll();
  $('.exp-tabs [data-pane=report]').hidden = !seesAll();
  $('.exp-tabs [data-pane=setup]').hidden = !can('committee');
  $('#exp-not-connected').hidden = Boolean(filesCfg?.scriptUrl);
  $('#exp-staff-actions').hidden = !can('payExpenses');
  if (!$('#exp-month').value) $('#exp-month').value = todayIST().slice(0, 7);
  if (!$('#exr-month').value) $('#exr-month').value = todayIST().slice(0, 7);
  await loadList();
  fillPersonList();
  const current = $('.exp-tabs button[aria-selected=true]:not([hidden])')?.dataset.pane;
  showPane(current || (add ? 'add' : 'list'));
  if (pendingOpen) { const id = pendingOpen; pendingOpen = null; showPane('list'); openExpense(list.find((x) => x.id === id)); }
}

/* ----- add / edit ----- */

let picked = [];        // files chosen for the form
let editing = null;     // expense being corrected (by the person who added it, while waiting)

function fillPersonList() {
  const names = [...new Set(list.filter((e) => e.paidByName).map((e) => e.paidByName))];
  $('#exp-people').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
}

function renderPicked() {
  $('#exp-files').innerHTML = picked.map((f, i) => `<li>${f.type.startsWith('image/') ? `<img alt="" src="${esc(URL.createObjectURL(f))}">` : '<span class="file-ico">PDF</span>'}
    <span>${esc(f.name)}<br><small class="muted">${(f.size / 1048576).toFixed(1)} MB</small></span>
    <button class="btn btn-small" type="button" data-unpick="${i}" aria-label="Remove ${esc(f.name)}">Remove</button></li>`).join('');
  const kept = editing?.files?.length || 0;
  $('#exp-files-note').textContent = editing ? `${kept} file${kept === 1 ? '' : 's'} already saved; files added here are added to them.` : '';
}

const multi = () => $('#exp-form [name=itemsMode]:checked')?.value === 'many';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function itemRow(r = {}) {
  return `<tr><td><input type="date" name="i_date" value="${esc(r.date || '')}" aria-label="Date"></td>
    <td><select name="i_head" aria-label="Head">${EXPENSE_HEADS.map((h) => `<option ${h === r.category ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></td>
    <td><input type="text" name="i_what" maxlength="200" value="${esc(r.description || '')}" placeholder="e.g. Garbage truck" aria-label="What for"></td>
    <td><input type="text" name="i_payee" maxlength="120" value="${esc(r.payee || '')}" placeholder="Paid to (optional)" aria-label="Paid to"></td>
    <td><input type="number" name="i_amount" min="1" step="0.01" inputmode="decimal" value="${r.amount || ''}" aria-label="Amount"></td>
    <td><button class="btn btn-small" type="button" data-del-item aria-label="Remove line">✕</button></td></tr>`;
}
function readItems() {
  return $$('#exp-item-rows tr').map((tr) => ({
    date: $('[name=i_date]', tr).value, category: $('[name=i_head]', tr).value, description: $('[name=i_what]', tr).value.trim().slice(0, 200),
    payee: $('[name=i_payee]', tr).value.trim().replace(/\s+/g, ' ').slice(0, 120), amount: round2($('[name=i_amount]', tr).value)
  })).filter((r) => r.amount || r.description);
}
function itemsTotal() {
  const items = readItems();
  $('#exp-items-total').textContent = items.length ? `${items.length} item${items.length === 1 ? '' : 's'} · total ${money(items.reduce((s, r) => s + r.amount, 0))}` : '';
}
function modeChanged() {
  const many = multi();
  $$('#exp-form .exp-single').forEach((el) => { el.hidden = many; });
  $('#exp-multi').hidden = !many;
  $('#exp-payee-label').firstChild.textContent = many ? 'Paid to (if the same for every line)' : 'Paid to';
  if (many && !$('#exp-item-rows tr')) $('#exp-item-rows').innerHTML = itemRow({ date: todayIST() }) + itemRow() + itemRow();
  itemsTotal();
}

function paidByChanged() {
  const f = $('#exp-form'), v = f.paidBy.value;
  $('#exp-person-row').hidden = v !== 'person';
  $('#exp-pay-row').hidden = v !== 'society';
  if (v === 'person' && !f.paidByName.value) f.paidByName.value = myName();
}

function wireForm() {
  const f = $('#exp-form');
  f.category.innerHTML = EXPENSE_HEADS.map((h) => `<option>${esc(h)}</option>`).join('');
  f.payMode.innerHTML = Object.entries(PAY_MODES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  f.date.value = todayIST();
  $$('input[name=paidBy]', f).forEach((r) => r.addEventListener('change', paidByChanged));
  paidByChanged();
  $$('input[name=itemsMode]', f).forEach((r) => r.addEventListener('change', modeChanged));
  $('#exp-add-item').addEventListener('click', () => { $('#exp-item-rows').insertAdjacentHTML('beforeend', itemRow()); itemsTotal(); });
  $('#exp-item-rows').addEventListener('click', (e) => { const b = e.target.closest('[data-del-item]'); if (b) { b.closest('tr').remove(); itemsTotal(); } });
  $('#exp-item-rows').addEventListener('input', itemsTotal);
  $('#exp-pick').addEventListener('change', (e) => {
    const add = [...e.target.files];
    e.target.value = '';
    const tooBig = add.filter((x) => x.size > MAX_FILE_MB * 1048576);
    picked = [...picked, ...add.filter((x) => x.size <= MAX_FILE_MB * 1048576)].slice(0, MAX_FILES);
    ctx.setMsg(f, tooBig.length ? `${tooBig.map((x) => x.name).join(', ')}: larger than ${MAX_FILE_MB} MB, not added. Take a photo instead of a scan, or reduce the PDF.` : '');
    renderPicked();
  });
  $('#exp-files').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unpick]');
    if (b) { picked.splice(Number(b.dataset.unpick), 1); renderPicked(); }
  });
  $('#exp-cancel-edit').addEventListener('click', () => resetForm());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const rec = {
      date: String(fd.get('date')), amount: Math.round(Number(fd.get('amount')) * 100) / 100, category: String(fd.get('category')),
      payee: String(fd.get('payee')).trim().replace(/\s+/g, ' ').slice(0, 120), billNo: String(fd.get('billNo')).trim().slice(0, 40),
      description: String(fd.get('description')).trim().slice(0, 500), paidBy: String(fd.get('paidBy'))
    };
    const many = multi() && !editing;
    let items = [];
    if (many) {
      items = readItems();
      if (items.length < 2) return ctx.setMsg(f, 'Enter at least two lines (for one item choose “One expense”).');
      const bad = items.findIndex((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > todayIST() || !(r.amount > 0) || r.description.length < 2);
      if (bad >= 0) return ctx.setMsg(f, `Line ${bad + 1}: enter the date (not in the future), what it was for and the amount.`);
      if (items.length > 50) return ctx.setMsg(f, 'At most 50 lines at a time.');
      rec.date = items.map((r) => r.date).sort().pop();
      rec.amount = round2(items.reduce((s, r) => s + r.amount, 0));
      rec.category = `Sheet of ${items.length} items`;
      if (rec.payee.length < 2 && items.some((r) => r.payee.length < 2)) return ctx.setMsg(f, 'Enter who was paid: on each line, or once in “Paid to” if the same for all.');
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date) || rec.date > todayIST()) return ctx.setMsg(f, 'Enter the date the money was spent (not in the future).');
      if (!(rec.amount > 0)) return ctx.setMsg(f, 'Enter the amount.');
      if (rec.payee.length < 2) return ctx.setMsg(f, 'Enter who was paid (shop, vendor or person).');
    }
    if (!picked.length && !editing?.files?.length) return ctx.setMsg(f, 'Add a photo or scan of the bill. If there is no bill, take a photo of a handwritten note signed by the person paid.');
    if (rec.paidBy === 'person') {
      rec.paidByName = String(fd.get('paidByName')).trim().slice(0, 80);
      if (rec.paidByName.length < 2) return ctx.setMsg(f, 'Enter who paid from their own money.');
      rec.paidByUid = rec.paidByName.toLowerCase() === myName().toLowerCase() ? myUid() : (editing?.paidByUid && editing.paidByName === rec.paidByName ? editing.paidByUid : '');
      rec.payMode = String(fd.get('personMode') || 'cash'); rec.payRef = '';
    } else if (rec.paidBy === 'society') {
      rec.payMode = String(fd.get('payMode')); rec.payRef = String(fd.get('payRef')).trim().slice(0, 60);
      if (rec.payMode !== 'cash' && !rec.payRef) return ctx.setMsg(f, 'Enter the payment reference (UPI / transaction / cheque number).');
      rec.paidByName = ''; rec.paidByUid = '';
    } else { rec.payMode = ''; rec.payRef = ''; rec.paidByName = ''; rec.paidByUid = ''; }
    rec.month = rec.date.slice(0, 7); rec.fy = fyOf(rec.date);
    rec.fileMonth = editing?.fileMonth || rec.month;
    const btn = $('button[type=submit]', f);
    await ctx.busy(btn, async () => {
      try {
        const { F, db } = ctx.fb;
        const files = picked.length ? await uploadFiles(picked, { ...rec, payee: rec.payee || rec.paidByName || 'various' }, (i, n) => ctx.setMsg(f, `Saving bill ${i} of ${n} to the Society’s records…`, true)) : [];
        if (many) {
          // One sheet, several expenses: each line is its own expense (own date, head, voucher), all sharing the sheet's photos.
          const by = { submittedBy: myUid(), submittedByName: myName(), submittedByRole: ctx.me()?.kind === 'staff' ? (ctx.me().role || 'Staff') : 'Committee' };
          const groupId = F.doc(F.collection(db, 'expenses')).id;
          const batch = F.writeBatch(db);
          items.forEach((r, i) => {
            const ref = F.doc(F.collection(db, 'expenses'));
            batch.set(ref, { ...rec, date: r.date, month: r.date.slice(0, 7), fy: fyOf(r.date), amount: r.amount, category: r.category, description: r.description,
              payee: r.payee || rec.payee, files, groupId, groupLine: i + 1, groupSize: items.length, groupTotal: rec.amount, status: 'submitted', ...by, submittedAt: F.serverTimestamp() });
            batch.set(F.doc(F.collection(db, 'expenses', ref.id, 'log')), { action: 'submitted', text: `${money(r.amount)} · line ${i + 1} of ${items.length} on one sheet (${money(rec.amount)}) · ${PAID_BY[rec.paidBy]}`,
              by: myUid(), byName: myName(), at: F.serverTimestamp() });
          });
          await batch.commit();
          resetForm();
          ctx.setMsg(f, `Saved ${items.length} expenses, total ${money(rec.amount)}, with the sheet attached to each. They now wait for approval.`, true);
          await loadList(); fillPersonList();
          return;
        }
        if (editing) {
          await F.updateDoc(F.doc(db, 'expenses', editing.id), { ...rec, files: [...(editing.files || []), ...files], updatedAt: F.serverTimestamp() });
          await logStep(editing.id, 'edited', 'details corrected before approval');
        } else {
          const ref = await F.addDoc(F.collection(db, 'expenses'), { ...rec, files, status: 'submitted', submittedBy: myUid(), submittedByName: myName(),
            submittedByRole: ctx.me()?.kind === 'staff' ? (ctx.me().role || 'Staff') : 'Committee', submittedAt: F.serverTimestamp() });
          await logStep(ref.id, 'submitted', `${money(rec.amount)} · ${PAID_BY[rec.paidBy]}`);
        }
        const was = editing;
        resetForm();
        ctx.setMsg(f, was ? 'Corrected. It is still waiting for approval.' : `Saved: ${money(rec.amount)} to ${esc(rec.payee)}. It now waits for the committee’s approval.`, true);
        await loadList();
        fillPersonList();
      } catch (err) { ctx.setMsg(f, esc(err.message || ctx.errorText(err))); }
    });
  });
}

function resetForm() {
  const f = $('#exp-form');
  f.reset(); f.date.value = todayIST(); picked = []; editing = null;
  $('#exp-form-title').textContent = 'Add an expense';
  $('#exp-cancel-edit').hidden = true;
  $('#exp-item-rows').innerHTML = '';
  $('#exp-mode-row').hidden = false;
  paidByChanged(); modeChanged(); renderPicked();
}

function startEdit(e) {
  const f = $('#exp-form');
  editing = e; picked = [];
  showPane('add');
  $('#exp-form-title').textContent = 'Correct the expense';
  $('#exp-cancel-edit').hidden = false;
  $('input[name=itemsMode][value=one]', f).checked = true; modeChanged();
  $('#exp-mode-row').hidden = true;
  f.date.value = e.date; f.amount.value = e.amount; f.category.value = e.category; f.payee.value = e.payee || '';
  f.billNo.value = e.billNo || ''; f.description.value = e.description || '';
  $(`input[name=paidBy][value=${e.paidBy}]`, f).checked = true;
  paidByChanged();
  f.paidByName.value = e.paidByName || ''; f.payMode.value = e.payMode || 'cash'; f.payRef.value = e.payRef || '';
  if (e.paidBy === 'person') f.personMode.value = e.payMode || 'cash';
  renderPicked();
  f.scrollIntoView({ behavior: 'smooth' });
}

/* ----- list ----- */

function filtered() {
  const m = $('#exp-month').value, st = $('#exp-status').value, pb = $('#exp-paidby').value, q = $('#exp-search').value.trim().toLowerCase();
  return list.filter((e) => (!m || e.month === m) && (!st || (st === 'unpaid' ? e.paidBy === 'unpaid' && e.status !== 'rejected' : e.status === st))
    && (!pb || e.paidBy === pb) && (!q || [e.payee, e.category, e.description, e.billNo, e.voucherNo, e.paidByName, e.submittedByName, e.payRef].some((v) => String(v || '').toLowerCase().includes(q))));
}

const statusPill = (e) => `<span class="status-pill ${e.status === 'approved' ? 'ok' : e.status === 'rejected' ? 'failed' : 'closed'}">${STATUS[e.status] || e.status}</span>`;
function payText(e) {
  if (e.paidBy === 'society') return `${PAY_MODES[e.payMode] || e.payMode}${e.payRef ? ` · ${esc(e.payRef)}` : ''}${e.paidOn && e.paidOn !== e.date ? ` · ${ddmmyyyy(e.paidOn)}` : ''}`;
  if (e.paidBy === 'person') {
    const s = e.settlementId && settlements.find((x) => x.id === e.settlementId);
    return `${esc(e.paidByName)} (own money)<br>${s ? `<span class="pill-ok">Paid back ${ddmmyyyy(s.date)} · ${esc(s.no || '')}</span>` : e.status === 'approved' ? '<span class="warn">To pay back</span>' : ''}`;
  }
  return '<span class="warn">Not paid yet</span>';
}

function renderList() {
  const rows = filtered();
  const total = rows.filter((e) => e.status !== 'rejected').reduce((s, e) => s + e.amount, 0);
  $('#exp-rows').innerHTML = rows.map((e) => `<tr>
    <td>${ddmmyyyy(e.date)}${e.voucherNo ? `<br><small class="muted">${esc(e.voucherNo)}</small>` : ''}</td>
    <td>${esc(e.category)}<br><small class="muted">${esc(e.payee)}${e.billNo ? ` · bill ${esc(e.billNo)}` : ''}</small></td>
    <td class="num">${money(e.amount)}</td><td>${payText(e)}</td><td>${statusPill(e)}</td>
    <td>${esc(e.submittedByName || '')}</td>
    <td><button class="btn btn-small" type="button" data-exp="${esc(e.id)}">Open${e.files?.length ? ` (${e.files.length})` : ''}</button></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No expenses for this choice.</td></tr>';
  $('#exp-total').textContent = rows.length ? `${rows.length} expense${rows.length === 1 ? '' : 's'} · ${money(total)} (not counting rejected)` : '';
}

function wireList() {
  ['#exp-month', '#exp-status', '#exp-paidby'].forEach((id) => $(id).addEventListener('change', renderList));
  $('#exp-search').addEventListener('input', renderList);
  $('#exp-all-months').addEventListener('click', () => { $('#exp-month').value = ''; renderList(); });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-exp]');
    if (b) openExpense(list.find((x) => x.id === b.dataset.exp));
  });
  $('#exp-csv').addEventListener('click', () => {
    const rows = filtered().map((e) => [e.date, e.voucherNo || '', e.category, e.payee, e.billNo || '', e.description || '', e.amount, PAID_BY[e.paidBy],
      e.paidByName || '', PAY_MODES[e.payMode] || '', e.payRef || '', STATUS[e.status], e.reason || '', e.submittedByName || '', e.decidedByName || '',
      e.settlementId ? (settlements.find((s) => s.id === e.settlementId)?.no || 'yes') : '', (e.files || []).length]);
    csv([['Date', 'Voucher', 'Head', 'Paid to', 'Bill no.', 'Description', 'Amount', 'Paid by', 'Person', 'Mode', 'Reference', 'Status', 'Reason', 'Added by', 'Decided by', 'Paid back (payback no.)', 'Bill files'], ...rows],
      `expenses-${$('#exp-month').value || 'all'}.csv`);
  });
}

function csv(rows, name) {
  const text = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  return ctx.saveBlob(new Blob(['﻿' + text], { type: 'text/csv' }), name).catch((err) => alert(ctx.errorText(err)));
}

/* ----- one expense ----- */

let open = null;

async function openExpense(e) {
  if (!e) return;
  open = e;
  const d = $('#exp-dialog');
  $('#exd-title').textContent = `${money(e.amount)} · ${e.category}`;
  const s = e.settlementId && settlements.find((x) => x.id === e.settlementId);
  $('#exd-facts').innerHTML = [
    ['Status', `${statusPill(e)}${e.voucherNo ? ` Voucher <strong>${esc(e.voucherNo)}</strong>` : ''}${e.reason ? `<br>Reason: ${esc(e.reason)}` : ''}`],
    ['Date spent', ddmmyyyy(e.date)], ['Paid to', `${esc(e.payee)}${e.billNo ? ` · bill no. ${esc(e.billNo)}` : ''}`],
    ['Description', esc(e.description || '—')], ['Paid by', payText(e)],
    ...(s ? [['Paid back', `${esc(s.no)} on ${ddmmyyyy(s.date)} · ${PAY_MODES[s.mode] || s.mode}${s.ref ? ` · ${esc(s.ref)}` : ''} · ${money(s.amount)} for ${s.expenseIds.length} bill${s.expenseIds.length === 1 ? '' : 's'}`]] : []),
    ['Added by', `${esc(e.submittedByName || '')}${e.submittedByRole ? ` (${esc(e.submittedByRole)})` : ''} · ${whenLong(e.submittedAt)}`],
    ...(e.decidedAt ? [['Decided by', `${esc(e.decidedByName || '')} · ${whenLong(e.decidedAt)}`]] : []),
    ...(e.recovery ? [['Recovered from', `${esc(e.recovery.liftName || e.recovery.lift)}: ${e.recovery.units} units × ${money(e.recovery.perUnit)}, from the ${esc(monthName(e.recovery.startMonth))} bill${e.recovery.instalments > 1 ? ` over ${e.recovery.instalments} months` : ''}`]] : [])
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  // Lines of the same bill sheet
  const sheet = e.groupId ? list.filter((x) => x.groupId === e.groupId).sort((a, b) => (a.groupLine || 0) - (b.groupLine || 0)) : [];
  $('#exd-sheet').hidden = !sheet.length;
  if (sheet.length) {
    const waiting = sheet.filter((x) => x.status === 'submitted');
    $('#exd-sheet-list').innerHTML = sheet.map((x) => `<li${x.id === e.id ? ' class="current"' : ''}>${ddmmyyyy(x.date)} · ${esc(x.description || x.category)} · <strong>${money(x.amount)}</strong> · ${statusPill(x)}${x.voucherNo ? ` ${esc(x.voucherNo)}` : ''}
      ${x.id === e.id ? '' : `<button class="link-btn" type="button" data-exp="${esc(x.id)}">open</button>`}</li>`).join('');
    $('#exd-sheet-total').textContent = `${sheet.length} lines on one sheet, total ${money(sheet.reduce((t, x) => t + x.amount, 0))}`;
    const canAll = can('approveExpenses') && waiting.length > 1 && sheet.every((x) => x.submittedBy !== myUid());
    $('#exd-approve-all').hidden = !canAll;
    $('#exd-approve-all').textContent = `Approve all ${waiting.length} waiting on this sheet`;
  }
  const mine = e.submittedBy === myUid();
  const canDecide = can('approveExpenses') && !mine;
  $('#exd-approve').hidden = !(canDecide && e.status !== 'approved');
  $('#exd-reject').hidden = !(canDecide && e.status !== 'rejected' && !e.settlementId && !(e.status === 'approved' && e.paidBy === 'society' && e.paidOn));
  $('#exd-pay').hidden = !(can('payExpenses') && e.paidBy === 'unpaid' && e.status === 'approved');
  $('#exd-edit').hidden = !(mine && e.status === 'submitted');
  $('#exd-delete').hidden = !((mine && e.status === 'submitted') || (can('committee') && e.status !== 'approved'));
  $('#exd-own-note').hidden = !(can('approveExpenses') && mine && e.status === 'submitted');
  $('#exd-reason').value = ''; $('#exd-reason-row').hidden = true;
  $('#exd-pay-row').hidden = true;
  $('#exd-pay-proof').value = '';
  // Recover a lift expense from the members' bills (Lift tab sharing), once it is approved
  const liftable = e.status === 'approved' && /lift/i.test(`${e.category} ${e.description}`) && !e.liftExpenseId && can('liftExpenses');
  $('#exd-lift').hidden = !liftable;
  if (liftable) prepareLift(e);
  ctx.setMsg($('#exd-form'), '');
  // bills
  $('#exd-files').innerHTML = (e.files || []).map((f) => `<figure data-file="${esc(f.id)}"><div class="exd-thumb">Loading…</div><figcaption>${esc(f.name)}</figcaption></figure>`).join('')
    || '<p class="muted">No bill attached.</p>';
  d.showModal();
  (e.files || []).forEach(async (f) => {
    const fig = $(`#exd-files [data-file="${CSS.escape(f.id)}"] .exd-thumb`);
    try {
      const url = await fileUrl(e, f);
      fig.innerHTML = f.mime?.startsWith('image/') ? `<a href="${url}" target="_blank" rel="noopener"><img alt="Bill" src="${url}"></a>`
        : `<button class="btn btn-small" type="button" data-openfile="${esc(f.id)}">Open ${f.mime === 'application/pdf' ? 'PDF' : 'file'}</button>`;
    } catch (err) { fig.textContent = err.message || 'Couldn’t load this file.'; }
  });
  // proof of payment: of the vendor payment, or of the payback
  const proofs = [...(e.payFiles || []).map((f) => ({ f, owner: e })), ...((s?.files) || []).map((f) => ({ f, owner: { settlementId: s.id } }))];
  $('#exd-proof-wrap').hidden = !proofs.length;
  $('#exd-proofs').innerHTML = proofs.map(({ f }) => `<figure data-file="${esc(f.id)}"><div class="exd-thumb">Loading…</div><figcaption>${esc(f.name)}</figcaption></figure>`).join('');
  proofs.forEach(async ({ f, owner }) => {
    const fig = $(`#exd-proofs [data-file="${CSS.escape(f.id)}"] .exd-thumb`);
    try {
      const url = await fileUrl(owner, f);
      fig.innerHTML = f.mime?.startsWith('image/') ? `<a href="${url}" target="_blank" rel="noopener"><img alt="Proof of payment" src="${url}"></a>` : `<a class="btn btn-small" href="${url}" download="${esc(f.name)}">Open</a>`;
    } catch (err) { fig.textContent = err.message || 'Couldn’t load this file.'; }
  });
  // history
  try {
    const { F, db } = ctx.fb;
    const snap = await F.getDocs(F.collection(db, 'expenses', e.id, 'log'));
    const items = snap.docs.map((x) => x.data()).sort((a, b) => (tsDate(a.at) || 0) - (tsDate(b.at) || 0));
    $('#exd-history').innerHTML = items.map((h) => `<li><strong>${esc(h.action)}</strong>${h.text ? `: ${esc(h.text)}` : ''}<br><span class="muted">${whenLong(h.at)} · ${esc(h.byName || '')}</span></li>`).join('');
  } catch { $('#exd-history').innerHTML = ''; }
}

function wireDialog() {
  const d = $('#exp-dialog'), form = $('#exd-form');
  $('#exd-close').addEventListener('click', () => d.close());
  $('#exd-files').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-openfile]');
    if (!b) return;
    const f = open.files.find((x) => x.id === b.dataset.openfile);
    const url = await fileUrl(open, f);
    const blob = await (await fetch(url)).blob();
    ctx.saveBlob(blob, f.name).catch((err) => alert(ctx.errorText(err)));
  });
  $('#exd-edit').addEventListener('click', () => { d.close(); startEdit(open); });
  $('#exd-delete').addEventListener('click', async (ev) => {
    if (!confirm('Delete this expense? Its bill files stay in the Society’s records (Submitted / Rejected folder).')) return;
    await ctx.busy(ev.currentTarget, async () => {
      try { await ctx.fb.F.deleteDoc(ctx.fb.F.doc(ctx.fb.db, 'expenses', open.id)); d.close(); await loadList(); renderList(); }
      catch (err) { ctx.setMsg(form, esc(ctx.errorText(err))); }
    });
  });
  $('#exd-reject').addEventListener('click', async (ev) => {
    if ($('#exd-reason-row').hidden) { $('#exd-reason-row').hidden = false; $('#exd-reason').focus(); ctx.setMsg(form, 'Write the reason, then press Reject again.', true); return; }
    const reason = $('#exd-reason').value.trim();
    if (reason.length < 3) return ctx.setMsg(form, 'Write why it is rejected (the person who added it sees this).');
    await decide(ev.currentTarget, 'rejected', reason);
  });
  $('#exd-approve').addEventListener('click', (ev) => decide(ev.currentTarget, 'approved', ''));
  $('#exd-approve-all').addEventListener('click', (ev) => approveSheet(ev.currentTarget));
  $('#exd-lift-go').addEventListener('click', (ev) => recoverLift(ev.currentTarget));
  ['change', 'input'].forEach((t) => $('#exd-lift').addEventListener(t, liftPreview));
  $('#exd-pay').addEventListener('click', async (ev) => {
    const row = $('#exd-pay-row');
    if (row.hidden) {
      row.hidden = false;
      $('#exd-pay-mode').innerHTML = Object.entries(PAY_MODES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
      $('#exd-pay-date').value = todayIST();
      ctx.setMsg(form, 'Enter how it was paid, then press Record payment again.', true);
      return;
    }
    const mode = $('#exd-pay-mode').value, ref = $('#exd-pay-ref').value.trim(), date = $('#exd-pay-date').value;
    if (mode !== 'cash' && !ref) return ctx.setMsg(form, 'Enter the payment reference.');
    if (!date) return ctx.setMsg(form, 'Enter the payment date.');
    const proof = $('#exd-pay-proof').files[0];
    if (proof && proof.size > MAX_FILE_MB * 1048576) return ctx.setMsg(form, `The proof is larger than ${MAX_FILE_MB} MB.`);
    await ctx.busy(ev.currentTarget, async () => {
      try {
        const { F, db } = ctx.fb;
        const payFiles = proof ? await uploadFiles([proof], { kind: 'payment', date, fileMonth: date.slice(0, 7), amount: open.amount, category: `Payment ${PAY_MODES[mode]} ${ref}`, payee: open.payee }) : [];
        await F.updateDoc(F.doc(db, 'expenses', open.id), { paidBy: 'society', payMode: mode, payRef: ref.slice(0, 60), paidOn: date, paidRecordedBy: myUid(), paidRecordedAt: F.serverTimestamp(),
          ...(payFiles.length ? { payFiles } : {}) });
        await logStep(open.id, 'paid', `${PAY_MODES[mode]}${ref ? ` ${ref}` : ''} on ${ddmmyyyy(date)}`);
        await loadList(); d.close(); renderList();
      } catch (err) { ctx.setMsg(form, esc(ctx.errorText(err))); }
    });
  });
}

async function decide(btn, status, reason) {
  const form = $('#exd-form'), e = open;
  await ctx.busy(btn, async () => {
    try {
      const { F, db } = ctx.fb;
      let voucherNo = e.voucherNo || '';
      await F.runTransaction(db, async (tx) => {
        const patch = { status, reason, decidedBy: myUid(), decidedByName: myName(), decidedAt: F.serverTimestamp() };
        if (status === 'approved' && !voucherNo) {
          const n = await nextNumber(tx, 'expenses', e.fy || fyOf(e.date));
          voucherNo = `EXP/${e.fy || fyOf(e.date)}/${String(n).padStart(4, '0')}`;
          patch.voucherNo = voucherNo;
        }
        tx.update(F.doc(db, 'expenses', e.id), patch);
      });
      await logStep(e.id, status, status === 'approved' ? `voucher ${voucherNo}` : reason);
      await loadList();
      // Move the bill files to the Approved / Rejected folder of the month (named with the voucher number).
      // A sheet shared by several lines moves when every line has the same decision.
      const same = e.groupId ? list.filter((x) => x.groupId === e.groupId).every((x) => x.status === status) : true;
      if (e.files?.length && same) await driveCall('move', { expenseId: e.id }).catch((err) => console.warn('Files not moved', err));
      $('#exp-dialog').close();
      renderList();
    } catch (err) { ctx.setMsg(form, esc(err.message || ctx.errorText(err))); }
  });
}

/** Approves every waiting line of a bill sheet, with consecutive voucher numbers, in one step. */
async function approveSheet(btn) {
  const form = $('#exd-form'), e = open;
  const lines = list.filter((x) => x.groupId === e.groupId && x.status === 'submitted').sort((a, b) => a.date.localeCompare(b.date) || (a.groupLine || 0) - (b.groupLine || 0));
  if (!lines.length || !confirm(`Approve ${lines.length} expenses (total ${money(lines.reduce((t, x) => t + x.amount, 0))}) from this sheet?`)) return;
  await ctx.busy(btn, async () => {
    try {
      const { F, db } = ctx.fb;
      const given = {};
      await F.runTransaction(db, async (tx) => {
        // all reads first (one counter per financial year), then the writes
        const fys = [...new Set(lines.map((x) => x.fy || fyOf(x.date)))];
        const next = {};
        for (const fy of fys) { const snap = await tx.get(F.doc(db, 'counters', `expenses-${fy}`)); next[fy] = snap.exists() ? Number(snap.data().next) || 1 : 1; }
        lines.forEach((x) => {
          const fy = x.fy || fyOf(x.date);
          given[x.id] = `EXP/${fy}/${String(next[fy]++).padStart(4, '0')}`;
          tx.update(F.doc(db, 'expenses', x.id), { status: 'approved', reason: '', voucherNo: given[x.id], decidedBy: myUid(), decidedByName: myName(), decidedAt: F.serverTimestamp() });
        });
        fys.forEach((fy) => tx.set(F.doc(db, 'counters', `expenses-${fy}`), { next: next[fy] }));
      });
      for (const x of lines) await logStep(x.id, 'approved', `voucher ${given[x.id]} (whole sheet approved together)`);
      await loadList();
      if (list.filter((x) => x.groupId === e.groupId).every((x) => x.status === 'approved') && e.files?.length) {
        await driveCall('move', { expenseId: e.id }).catch((err) => console.warn('Files not moved', err));
      }
      $('#exp-dialog').close();
      renderList();
    } catch (err) { ctx.setMsg(form, esc(err.message || ctx.errorText(err))); }
  });
}

/* ----- recovering a lift expense from the members' bills ----- */

const LIFT_NAMES = { C: 'C wing lift', D: 'D wing lift', CD: 'C & D wing lifts' };
function prepareLift(e) {
  const f = $('#exd-lift');
  f.querySelector('[name=lr_kind]').innerHTML = LIFT_KINDS.map((k) => `<option ${/amc/i.test(e.description + e.category) && k === 'AMC' ? 'selected' : ''}>${esc(k)}</option>`).join('');
  const guess = /\bD[\s-]*wing/i.test(e.description) ? 'D' : /\bC[\s-]*wing/i.test(e.description) ? 'C' : 'C';
  f.querySelector('[name=lr_lift]').value = guess;
  const last = ctx.lastBilled?.() || '';
  const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  f.querySelector('[name=lr_start]').value = last ? nextMonth(last) : todayIST().slice(0, 7);
  f.querySelector('[name=lr_inst]').value = 1;
  liftPreview();
}
function liftPreview() {
  const f = $('#exd-lift'), e = open;
  if (!e || f.hidden) return;
  const l = f.querySelector('[name=lr_lift]').value, inst = Math.max(1, Math.min(24, Number(f.querySelector('[name=lr_inst]').value) || 1));
  const n = unitsServedBy(ctx.units(), l === 'CD' ? ['C', 'D'] : [l]).length;
  const share = n ? e.amount / n : 0;
  $('#exd-lift-preview').innerHTML = n ? `Shared equally by <strong>${n} units</strong> served by the ${esc(LIFT_NAMES[l])}: about ${money(share)} each${inst > 1 ? `, ${money(share / inst)} a month for ${inst} months` : ''}, on their bills from ${esc(monthName(f.querySelector('[name=lr_start]').value || todayIST().slice(0, 7)))}.`
    : 'No units are set as served by this lift (Units → Open → Served by lift).';
}
async function recoverLift(btn) {
  const f = $('#exd-lift'), form = $('#exd-form'), e = open;
  const lift = f.querySelector('[name=lr_lift]').value, kind = f.querySelector('[name=lr_kind]').value;
  const startMonth = f.querySelector('[name=lr_start]').value, instalments = Math.max(1, Math.min(24, Number(f.querySelector('[name=lr_inst]').value) || 1));
  if (!startMonth) return ctx.setMsg(form, 'Choose the bill month to start from.');
  const n = unitsServedBy(ctx.units(), lift === 'CD' ? ['C', 'D'] : [lift]).length;
  if (!confirm(`Add ${money(e.amount)} (${kind}) to the bills of the ${n} units served by the ${LIFT_NAMES[lift]}, from the ${monthName(startMonth)} bill${instalments > 1 ? ` over ${instalments} months` : ''}?`)) return;
  await ctx.busy(btn, async () => {
    try {
      const last = await ctx.reloadBilling();
      const r = await addLiftExpense(ctx.fb, { date: e.date, lift, kind, description: `${e.description || e.category} (voucher ${e.voucherNo})`, vendor: e.payee,
        invoiceNo: e.billNo || '', paidRef: e.payRef || '', amount: e.amount, startMonth, instalments, expenseId: e.id, voucherNo: e.voucherNo }, ctx.units(), last);
      const { F, db } = ctx.fb;
      const recovery = { lift, liftName: LIFT_NAMES[lift], kind, startMonth, instalments, units: r.units, perUnit: Math.round((e.amount / r.units) * 100) / 100 };
      await F.updateDoc(F.doc(db, 'expenses', e.id), { liftExpenseId: r.id, recovery });
      await logStep(e.id, 'to members’ bills', `${LIFT_NAMES[lift]}: ${r.units} units × ${money(recovery.perUnit)} from ${monthName(startMonth)}${instalments > 1 ? ` over ${instalments} months` : ''}`);
      await loadList();
      openExpense(list.find((x) => x.id === e.id));
      ctx.setMsg(form, `Added to the members’ bills from ${esc(monthName(startMonth))}. See Lift → Lift expense register.`, true);
    } catch (err) { ctx.setMsg(form, esc(err.message || ctx.errorText(err))); }
  });
}

/** Opens an expense from elsewhere (e.g. the Lift register): goes to this tab and shows it. */
let pendingOpen = null;
export function openExpenseById(id) { pendingOpen = id; if (location.hash !== '#expenses') location.hash = '#expenses'; else loadExpenses(); }

/* ----- staff paybacks and advances ----- */

function renderStaff() {
  const people = balances();
  $('#exs-rows').innerHTML = people.map((p) => {
    const net = p.due - Math.max(0, p.advance);
    return `<tr><td><strong>${esc(p.name || '—')}</strong></td><td class="num">${money(p.due)}<br><small class="muted">${p.dueItems.length} bill${p.dueItems.length === 1 ? '' : 's'}</small></td>
      <td class="num">${money(Math.max(0, p.advance))}</td>
      <td class="num"><strong>${net >= 0 ? money(net) : `${money(-net)} with them`}</strong></td>
      <td>${can('payExpenses') ? `<div class="row-actions">${p.due > 0 ? `<button class="btn btn-small btn-primary" type="button" data-payback="${esc(p.key)}">Pay back</button>` : ''}
        <button class="btn btn-small" type="button" data-advance="${esc(p.key)}">Give advance</button></div>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No one has paid from their own money yet.</td></tr>';
  $('#exs-history').innerHTML = settlements.map((s) => `<tr><td>${ddmmyyyy(s.date)}<br><small class="muted">${esc(s.no || '')}</small></td>
    <td>${esc(s.personName)}</td><td>${s.kind === 'advance' ? 'Advance given' : `Payback for ${s.expenseIds.length} bill${s.expenseIds.length === 1 ? '' : 's'}`}</td>
    <td class="num">${money(s.amount)}${s.adjusted ? `<br><small class="muted">+ ${money(s.adjusted)} from advance</small>` : ''}</td>
    <td>${PAY_MODES[s.mode] || s.mode}${s.ref ? ` · ${esc(s.ref)}` : ''}</td>
    <td>${(s.expenseIds || []).map((id) => { const x = list.find((y) => y.id === id); return x ? `<button class="link-btn" type="button" data-exp="${esc(id)}">${esc(x.voucherNo || ddmmyyyy(x.date))}</button>` : ''; }).join(' ')}
      ${(s.files || []).map((f) => `<button class="btn btn-small" type="button" data-proof="${esc(s.id)}" data-file="${esc(f.id)}">📎 Proof</button>`).join(' ')}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No paybacks or advances yet.</td></tr>';
}

let settling = null;
function wireStaff() {
  const box = $('#exs-form');
  $('.exp-pane[data-pane=staff]').addEventListener('click', (ev) => {
    const pb = ev.target.closest('[data-payback]'), ad = ev.target.closest('[data-advance]');
    if (!pb && !ad && !ev.target.closest('#exs-new-advance')) return;
    const people = balances();
    const p = people.find((x) => x.key === (pb || ad)?.dataset[pb ? 'payback' : 'advance']) || { key: '', name: '', uid: '', due: 0, dueItems: [], advance: 0 };
    settling = { kind: pb ? 'payback' : 'advance', person: p };
    $('#exs-title').textContent = pb ? `Pay back ${p.name}` : `Give an advance${p.name ? ` to ${p.name}` : ''}`;
    box.personName.value = p.name; box.personName.readOnly = Boolean(p.key);
    box.mode.innerHTML = Object.entries(PAY_MODES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    box.date.value = todayIST(); box.ref.value = ''; box.note.value = ''; box.proof.value = '';
    $('#exs-items').innerHTML = pb ? p.dueItems.map((e) => `<label class="check"><input type="checkbox" name="item" value="${esc(e.id)}" data-amt="${e.amount}" checked>
      ${ddmmyyyy(e.date)} · ${esc(e.voucherNo || '')} · ${esc(e.category)} · ${esc(e.payee)} · <strong>${money(e.amount)}</strong></label>`).join('') : '';
    $('#exs-items-row').hidden = !pb;
    $('#exs-adjust-row').hidden = !(pb && p.advance > 0);
    box.adjust.value = pb && p.advance > 0 ? Math.min(p.advance, p.due) : 0;
    box.amount.readOnly = Boolean(pb);
    ctx.setMsg(box, '');
    recalc();
    $('#exs-dialog').showModal();
  });
  const recalc = () => {
    if (settling?.kind !== 'payback') { $('#exs-sum').textContent = ''; return; }
    const sum = $$('#exs-items input:checked').reduce((s, i) => s + Number(i.dataset.amt), 0);
    const adj = Math.min(Math.max(0, Number(box.adjust.value) || 0), Math.max(0, settling.person.advance), sum);
    box.amount.value = Math.round((sum - adj) * 100) / 100;
    $('#exs-sum').textContent = `Bills ${money(sum)}${adj ? ` − advance they hold ${money(adj)}` : ''} = to pay ${money(sum - adj)}`;
  };
  $('#exs-items').addEventListener('change', recalc);
  // proof of a payback / advance: open it
  $('#exs-history').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-proof]');
    if (!b) return;
    const st = settlements.find((x) => x.id === b.dataset.proof), f = st?.files?.find((x) => x.id === b.dataset.file);
    if (!f) return;
    await ctx.busy(b, async () => {
      try { const url = await fileUrl({ settlementId: st.id }, f); ctx.saveBlob(await (await fetch(url)).blob(), f.name).catch((err) => alert(ctx.errorText(err))); }
      catch (err) { alert(err.message || ctx.errorText(err)); }
    });
  });
  box.adjust.addEventListener('input', recalc);
  $('#exs-cancel').addEventListener('click', () => $('#exs-dialog').close());
  box.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const s = settling, name = box.personName.value.trim();
    const ids = $$('#exs-items input:checked').map((i) => i.value);
    const amount = Math.round(Number(box.amount.value) * 100) / 100, adjusted = s.kind === 'payback' ? Math.round((Number(box.adjust.value) || 0) * 100) / 100 : 0;
    if (name.length < 2) return ctx.setMsg(box, 'Enter the person’s name.');
    if (s.kind === 'payback' && !ids.length) return ctx.setMsg(box, 'Tick the bills being paid back.');
    if (s.kind === 'advance' && !(amount > 0)) return ctx.setMsg(box, 'Enter the amount.');
    if (amount < 0) return ctx.setMsg(box, 'The advance used is more than the bills.');
    if (box.mode.value !== 'cash' && amount > 0 && !box.ref.value.trim()) return ctx.setMsg(box, 'Enter the payment reference.');
    const proof = box.proof.files[0];
    if (proof && proof.size > MAX_FILE_MB * 1048576) return ctx.setMsg(box, `The proof is larger than ${MAX_FILE_MB} MB.`);
    await ctx.busy($('button[type=submit]', box), async () => {
      try {
        const { F, db } = ctx.fb;
        const date = box.date.value || todayIST(), fy = fyOf(date);
        const files = proof ? await uploadFiles([proof], { kind: 'payment', date, fileMonth: date.slice(0, 7), amount, category: `${s.kind === 'payback' ? 'Payback' : 'Advance'} ${PAY_MODES[box.mode.value]} ${box.ref.value.trim()}`, payee: name }) : [];
        // A name typed for a new advance joins the person already on record with that name.
        const known = s.person.key ? s.person : balances().find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
        if (known && !s.person.key) s.person = known;
        const key = s.person.key || `name:${name.toLowerCase()}`;
        await F.runTransaction(db, async (tx) => {
          const n = await nextNumber(tx, s.kind === 'payback' ? 'paybacks' : 'advances', fy);
          const no = `${s.kind === 'payback' ? 'PB' : 'ADV'}/${fy}/${String(n).padStart(4, '0')}`;
          const ref = F.doc(F.collection(db, 'staffSettlements'));
          tx.set(ref, { no, kind: s.kind, personKey: key, personName: name, personUid: s.person.uid || '', amount, adjusted, date, mode: box.mode.value,
            ref: box.ref.value.trim().slice(0, 60), note: box.note.value.trim().slice(0, 300), expenseIds: ids, files, by: myUid(), byName: myName(), at: F.serverTimestamp() });
          ids.forEach((id) => tx.update(F.doc(db, 'expenses', id), { settlementId: ref.id, settledOn: date }));
        });
        for (const id of ids) await logStep(id, 'paid back', `${money(amount + adjusted)} total in ${s.kind} to ${name}`);
        $('#exs-dialog').close();
        await loadList();
        renderStaff();
      } catch (err) { ctx.setMsg(box, esc(ctx.errorText(err))); }
    });
  });
}

/* ----- payments made (all money that went out, linked to bills) ----- */

function paymentsFor(month) {
  const rows = [];
  list.filter((e) => e.status === 'approved' && e.paidBy === 'society').forEach((e) => {
    const on = e.paidOn || e.date;
    if (!month || on.slice(0, 7) === month) rows.push({ date: on, what: `${e.category} · ${e.payee}`, to: e.payee, mode: e.payMode, ref: e.payRef, amount: e.amount, links: [e], kind: 'Expense' });
  });
  settlements.forEach((s) => {
    if (month && s.date.slice(0, 7) !== month) return;
    if (!(s.amount > 0)) return;
    rows.push({ date: s.date, what: s.kind === 'advance' ? `Advance to ${s.personName}` : `Payback to ${s.personName} (${s.no})`, to: s.personName, mode: s.mode, ref: s.ref, amount: s.amount,
      links: (s.expenseIds || []).map((id) => list.find((x) => x.id === id)).filter(Boolean).sort((a, b) => (a.voucherNo || a.date).localeCompare(b.voucherNo || b.date)), kind: s.kind === 'advance' ? 'Advance' : 'Payback' });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function renderPayments() {
  const m = $('#exp-pay-month').value || todayIST().slice(0, 7);
  $('#exp-pay-month').value = m;
  const rows = paymentsFor(m);
  $('#exp-pay-rows').innerHTML = rows.map((r) => `<tr><td>${ddmmyyyy(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.what)}</td><td>${PAY_MODES[r.mode] || esc(r.mode || '')}${r.ref ? ` · ${esc(r.ref)}` : ''}</td>
    <td class="num">${money(r.amount)}</td><td>${r.links.map((e) => `<button class="link-btn" type="button" data-exp="${esc(e.id)}">${esc(e.voucherNo || ddmmyyyy(e.date))}${e.files?.length ? ' 📎' : ''}</button>`).join(' ')}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No payments in this month.</td></tr>';
  const by = {};
  rows.forEach((r) => (by[r.mode] = (by[r.mode] || 0) + r.amount));
  $('#exp-pay-total').textContent = rows.length ? `${money(rows.reduce((s, r) => s + r.amount, 0))} paid out: ${Object.entries(by).map(([k, v]) => `${PAY_MODES[k] || k} ${money(v)}`).join(', ')}` : '';
}

/* ----- monthly report ----- */

function reportData(m) {
  const inMonth = list.filter((e) => e.month === m);
  const approved = inMonth.filter((e) => e.status === 'approved');
  const heads = {};
  approved.forEach((e) => (heads[e.category] = (heads[e.category] || 0) + e.amount));
  const sum = (a) => a.reduce((s, e) => s + e.amount, 0);
  const endOfMonth = `${m}-31`;
  // Due to staff at the end of the month: approved own-money bills up to then, not paid back by then.
  const dueAtEnd = {};
  list.filter((e) => e.paidBy === 'person' && e.status === 'approved' && e.date <= endOfMonth && !(e.settledOn && e.settledOn <= endOfMonth))
    .forEach((e) => (dueAtEnd[e.paidByName] = (dueAtEnd[e.paidByName] || 0) + e.amount));
  return {
    m, approved, heads, total: sum(approved),
    society: sum(approved.filter((e) => e.paidBy === 'society')), person: sum(approved.filter((e) => e.paidBy === 'person')), unpaid: sum(approved.filter((e) => e.paidBy === 'unpaid')),
    waiting: inMonth.filter((e) => e.status === 'submitted'), rejected: inMonth.filter((e) => e.status === 'rejected'),
    payments: paymentsFor(m), dueAtEnd
  };
}

function reportHTML(r) {
  const tr = (cells) => `<tr>${cells.join('')}</tr>`;
  return `<h2>Expenses: ${esc(monthName(r.m))}</h2>
    <dl class="facts"><div><dt>Approved expenses</dt><dd>${money(r.total)} (${r.approved.length})</dd></div>
      <div><dt>Paid by the Society</dt><dd>${money(r.society)}</dd></div><div><dt>Paid by staff / committee (own money)</dt><dd>${money(r.person)}</dd></div>
      <div><dt>Approved, not paid yet</dt><dd>${money(r.unpaid)}</dd></div>
      <div><dt>Waiting for approval</dt><dd>${money(r.waiting.reduce((s, e) => s + e.amount, 0))} (${r.waiting.length})</dd></div>
      <div><dt>Rejected</dt><dd>${r.rejected.length}</dd></div></dl>
    <h3>By head</h3><table><thead><tr><th>Head</th><th class="num">Amount</th></tr></thead><tbody>
      ${Object.entries(r.heads).sort((a, b) => b[1] - a[1]).map(([h, v]) => tr([`<td>${esc(h)}</td>`, `<td class="num">${money(v)}</td>`])).join('') || '<tr><td colspan="2" class="empty">None</td></tr>'}
      <tr class="total"><td>Total</td><td class="num">${money(r.total)}</td></tr></tbody></table>
    <h3>Vouchers</h3><table><thead><tr><th>Date</th><th>Voucher</th><th>Head</th><th>Paid to</th><th>Paid by</th><th class="num">Amount</th><th>Bills</th></tr></thead><tbody>
      ${r.approved.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => tr([`<td>${ddmmyyyy(e.date)}</td>`, `<td>${esc(e.voucherNo || '')}</td>`, `<td>${esc(e.category)}</td>`,
        `<td>${esc(e.payee)}${e.billNo ? ` (${esc(e.billNo)})` : ''}</td>`, `<td>${e.paidBy === 'society' ? `${PAY_MODES[e.payMode] || ''}${e.payRef ? ` ${esc(e.payRef)}` : ''}` : e.paidBy === 'person' ? `${esc(e.paidByName)} (own)` : 'Not paid yet'}</td>`,
        `<td class="num">${money(e.amount)}</td>`, `<td>${(e.files || []).length}</td>`])).join('') || '<tr><td colspan="7" class="empty">None</td></tr>'}</tbody></table>
    <h3>Payments made in the month</h3><table><thead><tr><th>Date</th><th>Payment</th><th>Mode</th><th class="num">Amount</th><th>For vouchers</th></tr></thead><tbody>
      ${r.payments.map((p) => tr([`<td>${ddmmyyyy(p.date)}</td>`, `<td>${esc(p.what)}</td>`, `<td>${PAY_MODES[p.mode] || esc(p.mode || '')}${p.ref ? ` ${esc(p.ref)}` : ''}</td>`,
        `<td class="num">${money(p.amount)}</td>`, `<td>${p.links.map((e) => esc(e.voucherNo || ddmmyyyy(e.date))).join(', ')}</td>`])).join('') || '<tr><td colspan="5" class="empty">None</td></tr>'}</tbody></table>
    <h3>Owed to staff and committee at month end</h3><table><thead><tr><th>Person</th><th class="num">Amount</th></tr></thead><tbody>
      ${Object.entries(r.dueAtEnd).map(([n, v]) => tr([`<td>${esc(n)}</td>`, `<td class="num">${money(v)}</td>`])).join('') || '<tr><td colspan="2" class="empty">Nothing owed</td></tr>'}</tbody></table>
    <p class="muted small-note">Prepared ${esc(new Date().toLocaleString('en-IN'))} by ${esc(myName())}. Bills for every voucher are kept in the Society’s records under ${esc(r.m)}.</p>`;
}

function renderReport() {
  const m = $('#exr-month').value || todayIST().slice(0, 7);
  $('#exr-body').innerHTML = reportHTML(reportData(m));
}

function reportCsv(r) {
  const rows = [[`Expenses ${monthName(r.m)}`], [], ['Head', 'Amount'], ...Object.entries(r.heads).map(([h, v]) => [h, v]), ['Total', r.total], [],
    ['Date', 'Voucher', 'Head', 'Paid to', 'Bill no.', 'Paid by', 'Mode', 'Reference', 'Amount', 'Bill files'],
    ...r.approved.map((e) => [e.date, e.voucherNo || '', e.category, e.payee, e.billNo || '', PAID_BY[e.paidBy], PAY_MODES[e.payMode] || '', e.payRef || '', e.amount, (e.files || []).length]),
    [], ['Payments made', '', '', 'Mode', 'Reference', 'Amount', 'For vouchers'],
    ...r.payments.map((p) => [p.date, p.kind, p.what, PAY_MODES[p.mode] || p.mode, p.ref || '', p.amount, p.links.map((e) => e.voucherNo || e.date).join(' ')]),
    [], ['Owed to', 'Amount'], ...Object.entries(r.dueAtEnd)];
  return rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

function wireReport() {
  $('#exr-month').addEventListener('change', renderReport);
  $('#exp-pay-month').addEventListener('change', renderPayments);
  $('#exr-print').addEventListener('click', () => {
    document.body.classList.add('printing-report');
    const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  });
  $('#exr-csv').addEventListener('click', () => {
    const r = reportData($('#exr-month').value);
    ctx.saveBlob(new Blob(['﻿' + reportCsv(r)], { type: 'text/csv' }), `expense-report-${r.m}.csv`).catch((err) => alert(ctx.errorText(err)));
  });
  $('#exr-drive').addEventListener('click', async (ev) => {
    const r = reportData($('#exr-month').value), form = $('#exr-actions');
    await ctx.busy(ev.currentTarget, async () => {
      try {
        const data = btoa(unescape(encodeURIComponent('﻿' + reportCsv(r))));
        const out = await driveCall('upload', { kind: 'report', month: r.m, name: `Expense report ${r.m} (${new Date().toISOString().slice(0, 10)}).csv`, mimeType: 'text/csv', data });
        ctx.setMsg(form, `Saved in the Society’s records: Reports → ${esc(r.m)} → ${esc(out.file.name)}.`, true);
      } catch (err) { ctx.setMsg(form, esc(err.message || ctx.errorText(err))); }
    });
  });
}

/* ----- set-up (committee) ----- */

function wireSetup() {
  const f = $('#exp-setup');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const url = f.scriptUrl.value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return ctx.setMsg(f, 'Paste the web app address that ends in /exec (from Deploy → Manage deployments).');
    await ctx.busy($('button[type=submit]', f), async () => {
      const before = filesCfg;
      try {
        filesCfg = { scriptUrl: url };
        const r = await driveCall('ping');
        await ctx.fb.F.setDoc(ctx.fb.F.doc(ctx.fb.db, 'settings', 'files'), { scriptUrl: url, folder: r.folder || '', connectedBy: myUid(), connectedAt: ctx.fb.F.serverTimestamp() });
        ctx.setMsg(f, `Connected. Bills will be kept in the folder “${esc(r.folder || 'Society records')}” of ${esc(r.owner || 'the Society’s account')}.`, true);
        $('#exp-not-connected').hidden = true;
      } catch (err) { filesCfg = before; ctx.setMsg(f, esc(err.message || ctx.errorText(err))); }
    });
  });
}
