import { getDues, getNotices, fmt, esc, fmtDate, ownerCell, bpmCell, totals, normalise } from './data.js';
import { initFirebase } from './firebase.js';
import { DEFAULT_SITE } from './defaults.js';

const TABS = ['home', 'about', 'dues', 'notices', 'committee', 'contact', 'member'];
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Tabs (hash routing) ---------- */
function showTab() {
  let id = location.hash.slice(1);
  if (!TABS.includes(id)) id = 'home';
  $$('.tab').forEach((s) => (s.hidden = s.dataset.tab !== id));
  $$('.site-nav a').forEach((a) => {
    if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#site-nav').classList.remove('open');
  $('.nav-toggle').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
  const h1 = $(`.tab[data-tab="${id}"] h1`);
  if (h1 && document.activeElement !== document.body) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
}
window.addEventListener('hashchange', showTab);
showTab();

$('.nav-toggle').addEventListener('click', (e) => {
  const open = $('#site-nav').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

/* ---------- Dues ---------- */
const state = { block: 'all', q: '' };

function renderFilter(data) {
  const btns = [{ id: 'all', name: 'All' }, ...data.blocks]
    .map((b) => `<button type="button" data-block="${b.id}" aria-pressed="${state.block === b.id}">${esc(b.name)}</button>`)
    .join('');
  $('#block-filter').innerHTML = btns;
}

function summaryHTML(t) {
  return `
    <div><dt>Units shown</dt><dd>${t.count}</dd></div>
    <div><dt>Member outstanding (₹)</dt><dd class="due">${fmt(t.due)}</dd></div>
    <div><dt>Credit balances (₹)</dt><dd class="credit">${fmt(t.credit)}</dd></div>
    <div><dt>Builder pending maintenance (₹)</dt><dd>${fmt(t.bpm)}</dd></div>`;
}

function renderDues(data) {
  const q = normalise(state.q.trim());
  const match = (u) => !q || normalise(u.name).includes(q) || normalise(u.unit).includes(q);
  const blocks = data.blocks.filter((b) => state.block === 'all' || b.id === state.block);

  const shown = [];
  let html = '';
  for (const b of blocks) {
    const rows = data.units.filter((u) => u.block === b.id && match(u));
    if (!rows.length) continue;
    shown.push(...rows);
    const t = totals(rows);
    html += `
      <section class="block-section" aria-labelledby="blk-${b.id}">
        <h2 id="blk-${b.id}">${esc(b.name)} <small>${rows.length} unit${rows.length > 1 ? 's' : ''}</small></h2>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th scope="col">Unit</th><th scope="col">Member / owner</th><th scope="col">Premises</th>
              <th scope="col" class="num">Member outstanding (₹)</th><th scope="col" class="num">BPM (₹)</th>
            </tr></thead>
            <tbody>
              ${rows.map((u) => `
                <tr>
                  <td class="unit">${esc(u.unit)}</td>
                  <td>${u.name ? esc(u.name) : '<span class="muted">Name not on statement</span>'}${u.verify ? '<span class="flag">Under verification</span>' : ''}</td>
                  <td class="type">${esc(u.type)}</td>
                  <td class="num">${ownerCell(u.owner)}</td>
                  <td class="num">${bpmCell(u.bpm)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td colspan="3">Total, ${esc(b.name)}${t.credit ? ` <span class="muted">(credits ${fmt(t.credit)} not deducted)</span>` : ''}</td>
              <td class="num">${fmt(t.due)}</td>
              <td class="num">${fmt(t.bpm)}</td>
            </tr></tfoot>
          </table>
        </div>
      </section>`;
  }
  $('#dues-tables').innerHTML = html || '<p class="empty">No unit matches that search. Try a unit number like “GF 05” or part of a name.</p>';
  $('#dues-summary').innerHTML = summaryHTML(totals(shown));
}

function renderHomeBlocks(data) {
  $('#block-list').innerHTML = data.blocks.map((b) => {
    const units = data.units.filter((u) => u.block === b.id);
    const t = totals(units);
    return `<li><a href="#dues" data-goto-block="${b.id}">
      <span class="bname">${esc(b.name)}</span>
      <span class="bcount">${units.length} units</span>
      <span class="bdue">₹ ${fmt(t.due)}<small>outstanding</small></span>
    </a></li>`;
  }).join('');
}

/** Live balances from the accounts (public/dues in Firestore); falls back to data/dues.json. */
async function loadLiveDues() {
  const fallback = await getDues();
  try {
    const fb = await initFirebase();
    if (!fb) return { data: fallback, live: false };
    const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'public', 'dues'));
    if (!snap.exists() || !snap.data().units?.length) return { data: fallback, live: false };
    const d = snap.data();
    return { data: { ...d, blocks: d.blocks?.length ? d.blocks : fallback.blocks }, live: true };
  } catch (err) {
    console.warn('Live dues unavailable, showing saved statement', err);
    return { data: fallback, live: false };
  }
}

async function loadSiteContent() {
  try {
    const fb = await initFirebase();
    if (fb) {
      const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'public', 'site'));
      if (snap.exists()) return { ...DEFAULT_SITE, ...snap.data() };
    }
  } catch (err) { console.warn('Site content unavailable', err); }
  return { ...DEFAULT_SITE, notices: await getNotices().catch(() => []) };
}

loadLiveDues().then(({ data, live }) => {
  $('#dues-lede').textContent = live
    ? `Balances as on ${fmtDate(data.asOn)}, updated whenever the Society records a bill or a payment. No interest has been added unless shown on your bill.`
    : `Closing balances from the Society’s ${data.statement} for ${fmtDate(data.periodFrom)} to ${fmtDate(data.periodTo)}. No interest has been added.`;
  renderFilter(data);
  renderDues(data);
  renderHomeBlocks(data);

  $('#block-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-block]');
    if (!btn) return;
    state.block = btn.dataset.block;
    $$('#block-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderDues(data);
  });
  $('#dues-search').addEventListener('input', (e) => { state.q = e.target.value; renderDues(data); });
  $('#block-list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto-block]');
    if (!a) return;
    state.block = a.dataset.gotoBlock;
    renderFilter(data);
    renderDues(data);
  });
}).catch((err) => {
  console.error(err);
  $('#dues-lede').textContent = 'The dues statement could not be loaded. Refresh the page to try again.';
});

/* ---------- Notices, committee, contact ---------- */
loadSiteContent().then((site) => {
  const list = [...(site.notices || [])].sort((a, b) => b.date.localeCompare(a.date));
  $('#notice-list').innerHTML = list.map((n) => `
    <article class="notice" id="notice-${esc(n.id)}">
      <time datetime="${esc(n.date)}">${fmtDate(n.date)}</time>
      <h2>${esc(n.title)}</h2>
      ${(n.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    </article>`).join('') || '<p class="empty">No notices yet.</p>';

  const n = list[0];
  $('#latest-notice').innerHTML = n ? `
    <time datetime="${esc(n.date)}">${fmtDate(n.date)}</time>
    <h3>${esc(n.title)}</h3>
    <p>${esc(n.summary)}</p>
    <a href="#notices">Read the notice</a>` : '<p class="muted">No notices yet.</p>';

  $('#committee-list').innerHTML = (site.committee || []).map((c) => `<li><span class="role">${esc(c.role)}</span>
    <span class="who">${c.name ? esc(c.name) : '<span class="muted">To be added</span>'}${c.phone ? ` <a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>` : ''}</span></li>`).join('');

  const s = site.society || DEFAULT_SITE.society, b = site.bank || DEFAULT_SITE.bank;
  $('#contact-facts').innerHTML = `
    <div><dt>Society office</dt><dd>${esc(s.address)}</dd></div>
    <div><dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd></div>
    ${s.contactNo ? `<div><dt>Phone</dt><dd><a href="tel:${esc(s.contactNo.replace(/\s/g, ''))}">${esc(s.contactNo)}</a></dd></div>` : ''}
    ${site.contact?.hours ? `<div><dt>Office hours</dt><dd>${esc(site.contact.hours)}</dd></div>` : ''}
    <div><dt>Pay by NEFT</dt><dd>${esc(b.accountName)}<br>A/c ${esc(b.accountNo)}, IFSC ${esc(b.ifsc)}<br>${esc(b.name)}</dd></div>`;
}).catch(() => {
  $('#latest-notice').innerHTML = '<p class="muted">Notices could not be loaded.</p>';
});
