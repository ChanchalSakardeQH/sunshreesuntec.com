/**
 * Society correspondence (3.14): the inward / outward register. correspondence/<id>
 *   { no: IN/2026-27/0001 | OUT/2026-27/0001, dir: in|out, fy, date, received?, partyType, party, subject, reference, mode,
 *     unitId?, replyTo?{ id, no }, status: open|replied|closed|noAction, dueBy?, notes, files[], createdBy, createdByName, createdAt }
 * Scans go to the Society's Google Drive: Correspondence/FY 2026-27/Inward | Outward. After each save the year's
 * register is also saved there as "Correspondence register FY 2026-27.json" (backup).
 */
import { esc, fmt } from './data.js';
import { ddmmyyyy, todayIST, financialYear } from './billing-core.js';
import { loadDriveCfg, driveReady, driveCall, driveFileUrl, prepareFile, toBase64, safeName } from './drive.js';
import { toJSONValue } from './unitfiles.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const PARTY_TYPES = [
  'DDR / Registrar of Co-operative Societies', 'Pune Municipal Corporation (PMC)', 'MSEDCL (electricity)', 'Police',
  'Bank', 'Other housing society', 'Builder / developer', 'Contractor / AMC vendor', 'Advocate / legal', 'Auditor',
  'Member / resident', 'Government office (other)', 'Other'];
const STATUS = { open: 'Waiting for reply / action', replied: 'Replied', closed: 'Closed', noAction: 'No action needed' };

let ctx, list = [], fy = financialYear(todayIST()), editing = null, keepFiles = [], newFiles = [];

export function initCorrespondence(c) {
  ctx = c;
  $('[data-tab="letters"]').addEventListener('click', onClick);
  ['#cr-fy', '#cr-dir', '#cr-party', '#cr-status'].forEach((s) => $(s).addEventListener('change', () => { if (s === '#cr-fy') { fy = $('#cr-fy').value; loadCorrespondence(); } else render(); }));
  $('#cr-q').addEventListener('input', render);
  $('#cr-csv').addEventListener('click', downloadCsv);
  $('#cr-cancel').addEventListener('click', () => $('#cr-dialog').close());
  $('#crdoc-close').addEventListener('click', () => $('#crdoc-dialog').close());
  $('#cr-form').addEventListener('submit', save);
  $('#cr-file-input').addEventListener('change', (e) => {
    for (const f of e.target.files) {
      if (!/^image\/|^application\/pdf$/.test(f.type)) { ctx.setMsg($('#cr-form'), `${esc(f.name)}: only PDF files and photos can be added.`); continue; }
      if (f.type === 'application/pdf' && f.size > 25 * 1024 * 1024) { ctx.setMsg($('#cr-form'), `${esc(f.name)} is larger than 25 MB.`); continue; }
      newFiles.push(f);
    }
    e.target.value = '';
    renderFiles();
  });
  $('#cr-file-list').addEventListener('click', (e) => {
    const k = e.target.closest('[data-keep]'), d = e.target.closest('[data-drop]');
    if (k) { const f = keepFiles[Number(k.dataset.keep)]; f.keep = !f.keep; renderFiles(); }
    if (d) { newFiles.splice(Number(d.dataset.drop), 1); renderFiles(); }
  });
}

export async function loadCorrespondence() {
  const { F, db } = ctx.fb;
  await loadDriveCfg(ctx.fb).catch(() => null);
  const snap = await F.getDocs(F.query(F.collection(db, 'correspondence'), F.where('fy', '==', fy)));
  list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.no).localeCompare(String(a.no)));
  const now = financialYear(todayIST()), years = [];
  for (let y = Number(now.slice(0, 4)); y >= 2012; y--) years.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  $('#cr-fy').innerHTML = years.map((y) => `<option${y === fy ? ' selected' : ''}>${y}</option>`).join('');
  const parties = [...new Set(list.map((x) => x.partyType).filter(Boolean))];
  const keep = $('#cr-party').value;
  $('#cr-party').innerHTML = '<option value="">Everyone</option>' + PARTY_TYPES.filter((p) => parties.includes(p)).map((p) => `<option${p === keep ? ' selected' : ''}>${esc(p)}</option>`).join('');
  $$('[data-tab="letters"] [data-perm="correspondence"]').forEach((x) => (x.hidden = !ctx.canDo('correspondence')));
  render();
}

function shown() {
  const dir = $('#cr-dir').value, party = $('#cr-party').value, st = $('#cr-status').value, q = $('#cr-q').value.trim().toLowerCase();
  return list.filter((x) => (!dir || x.dir === dir) && (!party || x.partyType === party) && (!st || x.status === st)
    && (!q || [x.no, x.party, x.subject, x.reference, x.notes, x.partyType].join(' ').toLowerCase().includes(q)));
}

function render() {
  const today = todayIST(), can = ctx.canDo('correspondence');
  const open = list.filter((x) => x.status === 'open'), overdue = open.filter((x) => x.dueBy && x.dueBy < today);
  $('#cr-cards').innerHTML = `
    <div><dt>Received in ${esc(fy)}</dt><dd>${list.filter((x) => x.dir === 'in').length}</dd></div>
    <div><dt>Sent in ${esc(fy)}</dt><dd>${list.filter((x) => x.dir === 'out').length}</dd></div>
    <div><dt>Waiting for reply / action</dt><dd>${open.length}${overdue.length ? ` <small class="cr-overdue">${overdue.length} overdue</small>` : ''}</dd></div>`;
  const rows = shown();
  $('#cr-rows').innerHTML = rows.map((x) => {
    const late = x.status === 'open' && x.dueBy && x.dueBy < today;
    return `<tr><td><span class="cr-dir ${x.dir}">${x.dir === 'in' ? 'IN' : 'OUT'}</span>${esc(x.no)}</td>
      <td>${ddmmyyyy(x.date)}${x.received && x.received !== x.date ? `<span class="sub">Recd ${ddmmyyyy(x.received)}</span>` : ''}</td>
      <td><strong>${esc(x.party)}</strong><span class="sub">${esc(x.partyType || '')}${x.mode ? ` · ${esc(x.mode)}` : ''}</span></td>
      <td>${esc(x.subject)}${x.unitId ? `<span class="sub">Unit ${esc(unitLabel(x.unitId))}</span>` : ''}${x.replyTo ? `<span class="sub">In reply to ${esc(x.replyTo.no)}</span>` : ''}${x.notes ? `<span class="sub">${esc(x.notes)}</span>` : ''}</td>
      <td>${esc(x.reference || '')}</td>
      <td>${(x.files || []).map((f) => `<button class="doc-chip" type="button" data-cr-file="${esc(x.id)}" data-fid="${esc(f.id)}" title="${esc(f.name)}">📎 ${esc(short(f.name))}</button>`).join('') || '—'}</td>
      <td>${esc(STATUS[x.status] || '')}${x.dueBy && x.status === 'open' ? `<span class="sub${late ? ' cr-overdue' : ''}">${late ? 'Overdue: ' : 'Due '}${ddmmyyyy(x.dueBy)}</span>` : ''}</td>
      <td>${can ? `<div class="row-actions"><button class="btn btn-small" type="button" data-cr-edit="${esc(x.id)}">Edit</button>${x.dir === 'in' ? `<button class="btn btn-small" type="button" data-cr-reply="${esc(x.id)}">Record reply</button>` : ''}</div>` : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="8" class="empty">${list.length ? 'Nothing matches the filters.' : `Nothing recorded for ${esc(fy)} yet.`}</td></tr>`;
}

const short = (n) => { const i = String(n).lastIndexOf(' - '); return i > 0 ? n.slice(i + 3) : n; };
const unitLabel = (id) => ctx.units().find((u) => u.id === id)?.unit || id;

function onClick(e) {
  const nw = e.target.closest('[data-cr-new]'), ed = e.target.closest('[data-cr-edit]'), rp = e.target.closest('[data-cr-reply]'), fl = e.target.closest('[data-cr-file]');
  if (nw) openForm(nw.dataset.crNew);
  if (ed) openForm(null, list.find((x) => x.id === ed.dataset.crEdit));
  if (rp) { const src = list.find((x) => x.id === rp.dataset.crReply); openForm('out', null, src); }
  if (fl) openFile(fl.dataset.crFile, fl.dataset.fid);
}

function openForm(dir, rec = null, replyOf = null) {
  editing = rec;
  dir = rec?.dir || dir;
  const f = $('#cr-form');
  f.reset();
  f.dataset.dir = dir;
  $('#cr-title').textContent = rec ? `Edit ${rec.no}` : dir === 'in' ? 'Record a letter received' : 'Record a letter sent';
  $('#cr-party-label').firstChild.textContent = dir === 'in' ? 'From (name of office or person)' : 'To (name of office or person)';
  $('#cr-recd-wrap').hidden = dir !== 'in';
  f.partyType.innerHTML = '<option value=""></option>' + PARTY_TYPES.map((p) => `<option>${esc(p)}</option>`).join('');
  f.unitId.innerHTML = '<option value="">—</option>' + ctx.units().map((u) => `<option value="${esc(u.id)}">${esc(u.unit)} – ${esc(u.name || '')}</option>`).join('');
  const others = list.filter((x) => x.id !== rec?.id && x.dir !== dir);
  f.replyTo.innerHTML = '<option value="">—</option>' + others.map((x) => `<option value="${esc(x.id)}">${esc(x.no)}: ${esc(x.party)} – ${esc(x.subject).slice(0, 60)}</option>`).join('');
  $('#cr-parties').innerHTML = [...new Set(list.map((x) => x.party))].map((p) => `<option value="${esc(p)}">`).join('');
  const d = rec || {};
  f.date.value = d.date || todayIST();
  f.received.value = d.received || (dir === 'in' && !rec ? todayIST() : '');
  f.partyType.value = d.partyType || replyOf?.partyType || '';
  f.party.value = d.party || replyOf?.party || '';
  f.subject.value = d.subject || (replyOf ? `Reply: ${replyOf.subject}` : '');
  f.reference.value = d.reference || '';
  f.mode.value = d.mode || (dir === 'in' ? 'By hand' : 'By hand');
  f.unitId.value = d.unitId || replyOf?.unitId || '';
  f.replyTo.value = d.replyTo?.id || replyOf?.id || '';
  f.status.value = d.status || (dir === 'in' ? 'open' : 'closed');
  f.dueBy.value = d.dueBy || '';
  f.notes.value = d.notes || '';
  keepFiles = (d.files || []).map((x) => ({ ...x, keep: true })); newFiles = [];
  $('#cr-file-input').disabled = !driveReady();
  $('#cr-files-note').textContent = driveReady() ? `Kept in the Society’s Google Drive: Correspondence › FY ${fy.replace(/^FY /, '')} › ${dir === 'in' ? 'Inward' : 'Outward'}.`
    : 'The Society’s Google Drive isn’t connected yet (Expenses → Set-up), so scans can’t be added.';
  renderFiles();
  ctx.setMsg(f, '');
  f._replyOf = replyOf;
  $('#cr-dialog').showModal();
}

function renderFiles() {
  $('#cr-file-list').innerHTML = keepFiles.map((f, i) => `<li class="${f.keep ? '' : 'removing'}"><span>📎 ${esc(f.name)}</span> <button class="btn-link" type="button" data-keep="${i}">${f.keep ? 'Remove' : 'Keep'}</button></li>`).join('')
    + newFiles.map((f, i) => `<li><span>${esc(f.name)}</span> <span class="new">new</span> <button class="btn-link" type="button" data-drop="${i}">Remove</button></li>`).join('')
    || '<li class="muted">No scans yet.</li>';
}

async function save(e) {
  e.preventDefault();
  const f = e.currentTarget, dir = f.dataset.dir, { F, db } = ctx.fb;
  const v = (k) => f[k].value.trim();
  if (!v('date') || !v('partyType') || !v('party') || !v('subject')) return ctx.setMsg(f, 'Fill in the date, the type of organisation, the name and the subject.');
  const recFy = financialYear(v('date'));
  const replyId = v('replyTo'), reply = replyId ? list.find((x) => x.id === replyId) : null;
  const data = { dir, fy: recFy, date: v('date'), partyType: v('partyType'), party: v('party'), subject: v('subject'), reference: v('reference'), mode: v('mode'),
    unitId: v('unitId'), status: v('status'), dueBy: v('dueBy'), notes: v('notes'), replyTo: reply ? { id: reply.id, no: reply.no } : null,
    ...(dir === 'in' ? { received: v('received') } : {}) };
  await ctx.busy($('button[type=submit]', f), async () => {
    try {
      let id = editing?.id, no = editing?.no;
      if (editing && editing.fy !== recFy) return ctx.setMsg(f, `The date is in another financial year than ${esc(editing.no)}. Record it again as a new entry instead.`);
      if (!editing) {
        const ref = F.doc(F.collection(db, 'correspondence'));
        no = await F.runTransaction(db, async (tx) => {
          const cRef = F.doc(db, 'counters', `${dir === 'in' ? 'inward' : 'outward'}-${recFy}`), c = await tx.get(cRef);
          const n = c.exists() ? Number(c.data().next) || 1 : 1;
          const number = `${dir === 'in' ? 'IN' : 'OUT'}/${recFy}/${String(n).padStart(4, '0')}`;
          tx.set(cRef, { next: n + 1 });
          tx.set(ref, { ...data, no: number, files: [], createdAt: F.serverTimestamp(), createdBy: ctx.uid(), createdByName: ctx.me()?.name || '' });
          return number;
        });
        id = ref.id;
      }
      const added = [];
      for (let i = 0; i < newFiles.length; i++) {
        ctx.setMsg(f, `${esc(no)} saved. Uploading scan ${i + 1} of ${newFiles.length}…`, true);
        const file = await prepareFile(newFiles[i]);
        const ext = (file.name.match(/\.(\w+)$/)?.[1] || (file.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
        const r = await driveCall(ctx.fb, 'upload', { kind: 'correspondence', dir, fy: recFy,
          name: `${no.replace(/\//g, '-')} ${data.date} ${safeName(data.party, 40)} - ${safeName(data.subject, 60)} - ${safeName(file.name.replace(/\.\w+$/, ''), 40)}.${ext}`,
          mimeType: file.type, data: await toBase64(file), note: `${no}: ${data.subject}` });
        added.push(r.file);
      }
      const files = [...keepFiles.filter((x) => x.keep).map(({ keep, ...x }) => x), ...added];
      await F.updateDoc(F.doc(db, 'correspondence', id), { ...data, files, updatedAt: F.serverTimestamp(), updatedBy: ctx.uid() });
      // A reply sent: mark the letter it answers as replied.
      if (dir === 'out' && reply && reply.status === 'open') await F.updateDoc(F.doc(db, 'correspondence', reply.id), { status: 'replied', updatedAt: F.serverTimestamp(), updatedBy: ctx.uid() });
      $('#cr-dialog').close();
      fy = recFy;
      await loadCorrespondence();
      const m = $('#cr-msg'); m.className = 'form-msg ok'; m.textContent = `${no} saved${added.length ? ` with ${added.length} scan${added.length > 1 ? 's' : ''}` : ''}.`;
      backupRegister().catch((err) => console.warn('register backup', err));
    } catch (err) { ctx.setMsg(f, esc(ctx.errorText(err))); }
  });
}

async function openFile(id, fid) {
  const rec = list.find((x) => x.id === id), f = rec?.files?.find((x) => x.id === fid);
  if (!f) return;
  $('#crdoc-title').textContent = f.name;
  $('#crdoc-body').textContent = 'Loading from the Society’s Google Drive…';
  $('#crdoc-save').disabled = true;
  $('#crdoc-dialog').showModal();
  try {
    const url = await driveFileUrl(ctx.fb, { correspondenceId: id, fileId: fid });
    $('#crdoc-body').innerHTML = f.mime?.startsWith('image/') ? `<img alt="${esc(f.name)}" src="${url}">` : '<p>PDF document. Use <strong>Save / open</strong> to see it.</p>';
    $('#crdoc-save').disabled = false;
    $('#crdoc-save').onclick = async () => { try { await ctx.saveBlob(await (await fetch(url)).blob(), f.name); } catch (err) { alert(ctx.errorText(err)); } };
  } catch (err) { $('#crdoc-body').textContent = ctx.errorText(err); }
}

/** The year's register as JSON in Correspondence/FY …, replacing the previous copy. */
async function backupRegister() {
  if (!driveReady() || !ctx.canDo('correspondence')) return;
  const json = JSON.stringify({ format: 'sunshree-suntec-correspondence', formatVersion: 1, fy, savedAt: new Date().toISOString(), entries: list.map((x) => toJSONValue(x)) }, null, 1);
  await driveCall(ctx.fb, 'backupRegister', { fy, json });
}

function downloadCsv() {
  const rows = shown().slice().sort((a, b) => String(a.no).localeCompare(String(b.no)));
  const head = ['No.', 'Inward / outward', 'Date', 'Received on', 'Type', 'From / to', 'Subject', 'Reference', 'How', 'Unit', 'In reply to', 'Status', 'Due by', 'Summary / action', 'Scans'];
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const csv = [head, ...rows.map((x) => [x.no, x.dir === 'in' ? 'Inward' : 'Outward', ddmmyyyy(x.date), x.received ? ddmmyyyy(x.received) : '', x.partyType, x.party, x.subject, x.reference,
    x.mode, x.unitId ? unitLabel(x.unitId) : '', x.replyTo?.no || '', STATUS[x.status] || '', x.dueBy ? ddmmyyyy(x.dueBy) : '', x.notes, (x.files || []).length])].map((r) => r.map(q).join(',')).join('\r\n');
  ctx.saveBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), `Correspondence register FY ${fy}.csv`);
}

/** For the unit file: letters about a unit. */
export async function lettersForUnit(fb, unitId) {
  const { F, db } = fb;
  const snap = await F.getDocs(F.query(F.collection(db, 'correspondence'), F.where('unitId', '==', unitId))).catch(() => ({ docs: [] }));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
export const statusText = (s) => STATUS[s] || '';
