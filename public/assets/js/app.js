import { getDues, getNotices, fmt, esc, fmtDate, ownerCell, bpmCell, totals, normalise } from './data.js';

const TABS = ['home', 'about', 'dues', 'notices', 'committee', 'contact', 'member', 'admin'];
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

getDues().then((data) => {
  $('#dues-lede').textContent =
    `Closing balances from the Society’s ${data.statement} for ${fmtDate(data.periodFrom)} to ${fmtDate(data.periodTo)}. No interest has been added.`;
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

/* ---------- Notices ---------- */
getNotices().then((list) => {
  list.sort((a, b) => b.date.localeCompare(a.date));
  $('#notice-list').innerHTML = list.map((n) => `
    <article class="notice" id="notice-${esc(n.id)}">
      <time datetime="${esc(n.date)}">${fmtDate(n.date)}</time>
      <h2>${esc(n.title)}</h2>
      ${n.body.map((p) => `<p>${esc(p)}</p>`).join('')}
    </article>`).join('') || '<p class="empty">No notices yet.</p>';

  const n = list[0];
  $('#latest-notice').innerHTML = n ? `
    <time datetime="${esc(n.date)}">${fmtDate(n.date)}</time>
    <h3>${esc(n.title)}</h3>
    <p>${esc(n.summary)}</p>
    <a href="#notices">Read the notice</a>` : '<p class="muted">No notices yet.</p>';
}).catch(() => {
  $('#latest-notice').innerHTML = '<p class="muted">Notices could not be loaded.</p>';
});
