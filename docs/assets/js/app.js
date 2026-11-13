import { getDues, getNotices, fmt, esc, fmtDate, ownerCell, bpmCell, totals, normalise } from './data.js';
import { initFirebase, currentUser } from './firebase.js';
import { maskAmount } from './billing-core.js';
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
// Visitors see names with masked amounts ("x,xx,xxx", one x per digit). The eye button shows the real
// amounts to signed-in approved members and the committee, read from private/dues (protected by the rules).
const state = { block: 'all', q: '', revealed: false };
let masked = null;   // public data (names + masks)
let full = null;     // real amounts, once revealed

const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7C21.3 9.1 17.5 5 12 5Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>';
const eyeBtn = () => `<button type="button" class="eye" data-reveal title="${state.revealed ? 'Hide amounts' : 'Show amounts (members only)'}" aria-label="${state.revealed ? 'Hide amounts' : 'Show amounts'}">${EYE}</button>`;

/** Accepts the masked public format, older documents with amounts, or the fallback file, and returns masked rows. */
function toMasked(d) {
  const units = d.units.map((u) => (u.ownerMask !== undefined || u.owner === undefined ? u : {
    ...u, ownerMask: u.owner == null ? null : maskAmount(u.owner), cr: Number(u.owner) < 0, bpmMask: u.bpm ? maskAmount(u.bpm) : null
  }));
  return { ...d, units };
}

function renderFilter(data) {
  const btns = [{ id: 'all', name: 'All' }, ...data.blocks]
    .map((b) => `<button type="button" data-block="${b.id}" aria-pressed="${state.block === b.id}">${esc(b.name)}</button>`)
    .join('');
  $('#block-filter').innerHTML = btns;
}

const realRow = (u) => (state.revealed && full ? full.units.find((x) => x.id === u.id) : null);

function ownerHTML(u) {
  const r = realRow(u);
  if (r) return ownerCell(r.owner);
  if (u.ownerMask == null) return '<span class="not-listed">Not listed</span>';
  return `<span class="masked">${u.ownerMask}${u.cr ? ' Cr' : ''}</span>`;
}
function bpmHTML(u) {
  const r = realRow(u);
  if (r) return bpmCell(r.bpm);
  return u.bpmMask ? `<span class="masked">${u.bpmMask}</span>` : '<span class="muted">—</span>';
}

/** Totals: real when revealed; otherwise the masks published for the whole society or a block. */
function totalsFor(rows, blockId) {
  if (state.revealed && full) {
    const t = totals(rows.map((u) => full.units.find((x) => x.id === u.id) || u));
    return { due: fmt(t.due), credit: fmt(t.credit), bpm: fmt(t.bpm), creditN: t.credit };
  }
  const m = state.q ? null : blockId ? masked.masks?.blocks?.[blockId] : masked.masks?.all;
  return m ? { due: m.due, credit: m.credit, bpm: m.bpm, creditN: /x/.test(m.credit) && m.credit !== 'x' ? 1 : 0, masked: true }
    : { due: '—', credit: '—', bpm: '—', creditN: 0, masked: true };
}

function summaryHTML(count, t) {
  const cls = t.masked ? ' masked' : '';
  return `
    <div><dt>Units shown</dt><dd>${count}</dd></div>
    <div><dt>Member outstanding (₹)</dt><dd class="due${cls}">${t.due}</dd></div>
    <div><dt>Credit balances (₹)</dt><dd class="credit${cls}">${t.credit}</dd></div>
    <div><dt>Builder pending maintenance (₹)</dt><dd class="${cls}">${t.bpm}</dd></div>`;
}

function renderDues() {
  const data = masked;
  const q = normalise(state.q.trim());
  const match = (u) => !q || normalise(u.name).includes(q) || normalise(u.unit).includes(q);
  const blocks = data.blocks.filter((b) => state.block === 'all' || b.id === state.block);
  const shown = [];
  let html = '';
  for (const b of blocks) {
    const rows = data.units.filter((u) => u.block === b.id && match(u));
    if (!rows.length) continue;
    shown.push(...rows);
    const t = totalsFor(rows, b.id);
    html += `
      <section class="block-section" aria-labelledby="blk-${b.id}">
        <h2 id="blk-${b.id}">${esc(b.name)} <small>${rows.length} unit${rows.length > 1 ? 's' : ''}</small></h2>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th scope="col">Unit</th><th scope="col">Member / owner</th><th scope="col">Premises</th>
              <th scope="col" class="num">Member outstanding (₹) ${eyeBtn()}</th><th scope="col" class="num">BPM (₹)</th>
            </tr></thead>
            <tbody>
              ${rows.map((u) => `
                <tr>
                  <td class="unit">${esc(u.unit)}</td>
                  <td>${u.name ? esc(u.name) : '<span class="muted">Name not on statement</span>'}${u.verify ? '<span class="flag">Under verification</span>' : ''}</td>
                  <td class="type">${esc(u.type)}</td>
                  <td class="num">${ownerHTML(u)}</td>
                  <td class="num">${bpmHTML(u)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td colspan="3">Total, ${esc(b.name)}</td>
              <td class="num${t.masked ? ' masked' : ''}">${t.due}</td>
              <td class="num${t.masked ? ' masked' : ''}">${t.bpm}</td>
            </tr></tfoot>
          </table>
        </div>
      </section>`;
  }
  $('#dues-tables').innerHTML = html || '<p class="empty">No unit matches that search. Try a unit number like “GF 05” or part of a name.</p>';
  $('#dues-summary').innerHTML = summaryHTML(shown.length, totalsFor(shown, state.block === 'all' ? null : state.block));
  $('#amounts-toggle').innerHTML = `${EYE} ${state.revealed ? 'Hide amounts' : 'Show amounts'}`;
  $('#amounts-note').textContent = state.revealed ? 'Amounts shown because you are signed in as an approved member.'
    : 'Amounts are hidden. Members can sign in to see them.';
}

function renderHomeBlocks() {
  $('#block-list').innerHTML = masked.blocks.map((b) => {
    const units = masked.units.filter((u) => u.block === b.id);
    const t = totalsFor(units, b.id);
    return `<li><a href="#dues" data-goto-block="${b.id}">
      <span class="bname">${esc(b.name)}</span>
      <span class="bcount">${units.length} units</span>
      <span class="bdue${t.masked ? ' masked' : ''}">₹ ${t.due}<small>outstanding</small></span>
    </a></li>`;
  }).join('');
}

let watching = false;
/** After the eye sends someone to log in, show the amounts as soon as an approved member is signed in. */
function watchForLogin() {
  if (watching) return;
  watching = true;
  initFirebase().then((fb) => fb && fb.A.onAuthStateChanged(fb.auth, (u) => {
    if (!u || !sessionStorage.getItem('revealAfterLogin')) return;
    fb.F.getDoc(fb.F.doc(fb.db, 'private', 'dues')).then((snap) => {
      if (!snap.exists()) return;
      sessionStorage.removeItem('revealAfterLogin');
      full = snap.data(); state.revealed = true;
      if (masked) { renderDues(); renderHomeBlocks(); }
      if (location.hash === '#member') location.hash = '#dues';
    }).catch(() => {});   // not approved yet: stay on the member page, which explains the status
  }));
}

/** Shows real amounts to signed-in approved members; anyone else is sent to the login page. */
async function toggleAmounts() {
  if (state.revealed) { state.revealed = false; renderDues(); renderHomeBlocks(); return; }
  const fb = await initFirebase();
  const toLogin = (msg) => {
    sessionStorage.setItem('revealAfterLogin', '1');
    const note = $('#member-note');
    if (note) { note.textContent = msg; note.hidden = false; }
    watchForLogin();
    location.hash = '#member';
  };
  if (!fb) return toLogin('Member login isn’t switched on yet.');
  const user = await currentUser(fb);
  if (!user) return toLogin('Sign in or register to see the maintenance amounts.');
  try {
    const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'private', 'dues'));
    if (!snap.exists()) throw new Error('not ready');
    full = snap.data();
    state.revealed = true;
    sessionStorage.removeItem('revealAfterLogin');
    renderDues(); renderHomeBlocks();
  } catch {
    toLogin('Amounts are shown after the committee approves your login and your email is confirmed.');
  }
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-reveal], #amounts-toggle')) { e.preventDefault(); toggleAmounts(); }
});

/** Public (masked) balances from Firestore; falls back to data/dues.json (which has no amounts). */
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
  masked = toMasked(data);
  $('#dues-lede').textContent = live
    ? `Balances as on ${fmtDate(data.asOn)}, updated whenever the Society records a bill or a payment. No interest has been added unless shown on your bill.`
    : 'Balances from the Society’s accounts. No interest has been added.';
  renderFilter(masked);
  renderDues();
  renderHomeBlocks();

  $('#block-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-block]');
    if (!btn) return;
    state.block = btn.dataset.block;
    $$('#block-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderDues();
  });
  $('#dues-search').addEventListener('input', (e) => { state.q = e.target.value; renderDues(); });
  $('#block-list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto-block]');
    if (!a) return;
    state.block = a.dataset.gotoBlock;
    renderFilter(masked);
    renderDues();
  });

  // Came back from login after pressing the eye: show the amounts once signed in.
  if (sessionStorage.getItem('revealAfterLogin')) watchForLogin();
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
