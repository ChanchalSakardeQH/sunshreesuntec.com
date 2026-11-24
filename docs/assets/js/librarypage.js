/**
 * 3.20: the website's Library page — search the Rules, GRs and forms library. Visitors see the entries marked public
 * (with their official source); signed-in members and the team see all and open the Society's copies.
 */
import { initFirebase, errorText } from './firebase.js';
import { loadDriveCfg, driveReady, driveFileUrl } from './drive.js';
import { LIB_CATEGORIES, LIB_LANGS, loadIndex, searchLibrary, words, fmtSize, extOf } from './library.js';
import { FORMS, TASKS, guideOf } from './forms.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

let fb = null, entries = [], canOpen = false, loadedFor = undefined, loading = null;
const indexes = new Map();

function highlight(text, terms) {
  let out = esc(text);
  if (!terms.length) return out;
  // Marks the starts of words that match what was typed (letters only, so the HTML stays intact).
  const re = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  return out.replace(re, '$1<mark>$2</mark>');
}

async function load() {
  fb = fb || await initFirebase();
  if (!fb) { $('#libp-status').textContent = 'The library isn’t available just now.'; return; }
  const user = await new Promise((res) => { const stop = fb.A.onAuthStateChanged(fb.auth, (u) => { stop(); res(u); }); });
  const who = user ? user.uid : null;
  if (loadedFor === who && entries.length) return;
  const { F, db } = fb;
  $('#libp-status').textContent = 'Loading the library…';
  let snap = null;
  canOpen = false;
  if (user) {
    // Members and the team may read every entry (the rules refuse anyone else, who then sees the public ones).
    snap = await F.getDocs(F.collection(db, 'libraryDocs')).catch(() => null);
    canOpen = Boolean(snap);
  }
  if (!snap) snap = await F.getDocs(F.query(F.collection(db, 'libraryDocs'), F.where('public', '==', true))).catch(() => ({ docs: [] }));
  entries = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.removed);
  indexes.clear();
  loadedFor = who;
  $('#libp-signin').hidden = canOpen;
  const used = (k) => [...new Set(entries.map((e) => e[k]).filter(Boolean))];
  $('#libp-cat').innerHTML = '<option value="">All</option>' + LIB_CATEGORIES.filter((c) => used('category').includes(c)).map((c) => `<option>${esc(c)}</option>`).join('');
  $('#libp-lang').innerHTML = '<option value="">All</option>' + LIB_LANGS.filter((c) => used('lang').includes(c)).map((c) => `<option>${esc(c)}</option>`).join('');
  renderTasks();
  await render();
}

let seq = 0;
async function render() {
  const my = ++seq;
  const q = $('#libp-q').value.trim(), cat = $('#libp-cat').value, lang = $('#libp-lang').value;
  const list = entries.filter((e) => (!cat || e.category === cat) && (!lang || e.lang === lang));
  if (q.length >= 2) {
    const need = list.filter((e) => e.textWords && !indexes.has(e.id));
    for (let i = 0; i < need.length; i++) {
      $('#libp-status').textContent = `Searching inside the documents (${i + 1} of ${need.length})…`;
      indexes.set(need[i].id, await loadIndex(fb, need[i].id));
      if (my !== seq) return;   // a newer search started
    }
  }
  const hits = searchLibrary(list, q, indexes);
  const terms = words(q).filter((t) => t.length >= 2);
  $('#libp-status').textContent = !entries.length ? 'The library is empty for now; the committee adds documents as they become available.'
    : q ? `${hits.length} of ${list.length} document${list.length === 1 ? '' : 's'} match “${q}”.` : `${list.length} document${list.length === 1 ? '' : 's'}.`;
  $('#libp-list').innerHTML = hits.map(({ e, inside }) => `<li class="lib-item">
      <h2>${highlight(e.title, terms)}</h2>
      <p class="lib-meta"><span class="lib-cat">${esc(e.category)}</span>${esc([e.number, e.date && dmy(e.date), e.issuer, e.lang].filter(Boolean).join(' · '))}</p>
      ${e.description ? `<p>${highlight(e.description, terms)}</p>` : ''}
      ${guideHTML(e)}
      ${(e.keywords || []).length ? `<p class="lib-kw">Keywords: ${highlight(e.keywords.join(', '), terms)}</p>` : ''}
      ${inside ? '<p class="lib-inside">Found inside the document: open it and use Find (Ctrl + F) to go to the place.</p>' : ''}
      <div class="lib-actions">
        ${e.file && canOpen ? `<button class="btn btn-primary btn-small" type="button" data-libp-open="${esc(e.id)}">Open${extOf(e) ? ` (${esc(extOf(e))}${e.file.size ? `, ${fmtSize(e.file.size)}` : ''})` : ''}</button>` : ''}
        ${e.link ? `<a class="btn btn-small" href="${esc(e.link)}" target="_blank" rel="noopener">Official source</a>` : ''}
        ${e.file && !canOpen ? '<a class="btn btn-small" href="#member">Sign in to open the Society’s copy</a>' : ''}
      </div></li>`).join('');
}

/* 3.24: the guide to a bye-law form (number, law, who signs, stamp paper, what to attach) */
function guideHTML(e) {
  if (!e.formKey && !e.guide?.no) return '';
  const g = guideOf(e);
  const rows = [['Form', g.no + (g.aka ? ` (also called ${g.aka})` : '')], ['Under', g.law], ['Signed by', g.signedBy], ['Stamp paper', g.stamp], ['Attach', g.attach]].filter(([, v]) => v);
  return `<dl class="lib-guide">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
/* 3.24: "Which forms do I need?": the forms for each task, in order, with their guide and the Society's copy */
let taskKey = '';
function renderTasks() {
  $('#libp-task-buttons').innerHTML = TASKS.map((t) => `<button class="btn btn-small${t.key === taskKey ? ' btn-primary' : ''}" type="button" data-task="${t.key}" aria-pressed="${t.key === taskKey}">${esc(t.title)}</button>`).join('');
  const t = TASKS.find((x) => x.key === taskKey);
  if (!t) { $('#libp-task').innerHTML = ''; return; }
  const byKey = new Map(entries.filter((e) => e.formKey).map((e) => [e.formKey, e]));
  $('#libp-task').innerHTML = `<div class="lib-task-card"><h3>${esc(t.title)}</h3><p class="lib-meta">Under ${esc(t.law)}</p><p>${esc(t.intro)}</p>
    <ol class="lib-task-forms">${t.forms.map(([k, when]) => {
      const e = byKey.get(k), f = FORMS[k] || {}, g = e ? guideOf(e) : { ...f };
      return `<li><p><strong>${esc(g.no)}</strong>${g.aka ? ` <span class="muted">(${esc(g.aka)})</span>` : ''} — ${esc(f.title || e?.title || '')}${when ? ` <em class="muted">— ${esc(when)}</em>` : ''}</p>
        ${g.use ? `<p class="small-note">${esc(g.use)}</p>` : ''}
        <p class="lib-kw">${esc([g.law && `Under ${g.law}`, g.signedBy && `Signed by: ${g.signedBy}`, g.stamp, g.attach && `Attach: ${g.attach}`].filter(Boolean).join(' · '))}</p>
        <div class="lib-actions">${e?.file && canOpen ? `<button class="btn btn-primary btn-small" type="button" data-libp-open="${esc(e.id)}">Open the form</button>`
          : e?.file ? '<a class="btn btn-small" href="#member">Sign in to open the form</a>' : f.society ? '<span class="muted small-note">Issued by the Society</span>' : '<span class="muted small-note">Ask the Society office for this form</span>'}</div></li>`;
    }).join('')}</ol>
    ${t.also ? `<p><strong>Also needed:</strong> ${esc(t.also)}</p>` : ''}
    ${t.transfer ? '<p class="small-note">Members: your unit’s list and what the Society has received are on your page under <a href="#member">Membership transfer documents</a>.</p>' : ''}
    <p class="small-note">A guide, not legal advice. Fees and stamp duty change from time to time (the forms show the amounts when they were printed); the Society office will tell you the current ones. The Society’s registered bye-laws prevail.</p></div>`;
}
$('#libp-task-buttons').addEventListener('click', (e) => {
  const b = e.target.closest('[data-task]');
  if (!b) return;
  taskKey = taskKey === b.dataset.task ? '' : b.dataset.task;
  renderTasks();
});
$('#libp-task').addEventListener('click', (e) => { const b = e.target.closest('[data-libp-open]'); if (b) openEntry(b); });

let timer = 0;
$('#libp-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 250); });
$('#libp-cat').addEventListener('change', render);
$('#libp-lang').addEventListener('change', render);
$('#libp-list').addEventListener('click', (e) => { const b = e.target.closest('[data-libp-open]'); if (b) openEntry(b); });
async function openEntry(b) {
  const ent = entries.find((x) => x.id === b.dataset.libpOpen);
  const w = window.open('', '_blank');
  b.disabled = true;
  try {
    await loadDriveCfg(fb);
    if (!driveReady()) throw new Error('The Society’s copies can’t be opened just now.');
    const url = await driveFileUrl(fb, { libraryId: ent.id, fileId: ent.file.id });
    if (w) w.location = url; else location.href = url;
  } catch (err) { if (w) w.close(); alert(errorText(err)); }
  finally { b.disabled = false; }
}

function maybeLoad() {
  if (location.hash !== '#library') return;
  loading = loading || load().catch((err) => { console.error(err); $('#libp-status').textContent = errorText(err); }).finally(() => { loading = null; });
}
window.addEventListener('hashchange', maybeLoad);
maybeLoad();
// Someone signing in or out sees the right set next time they open the page.
initFirebase().then((f) => f && f.A.onAuthStateChanged(f.auth, () => { loadedFor = undefined; maybeLoad(); })).catch(() => {});
