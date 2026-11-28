// 3.36: every table can be sorted by clicking a column heading — Date, Unit, Name, Amount, any column.
// First click: ascending (oldest date, A→Z, smallest), second: descending, third: back to the page's own order.
// Works on tables that are redrawn (filters, month change): the chosen order is applied again after each redraw.
// Rows that belong to the row above (a detail row spanning the table) move with it; "Total" rows stay at the bottom;
// footers (<tfoot>) are not touched. Not used for ledgers (running balance), or tables of inputs (rates, areas…).

const SKIP = 'table.ledger, table.rates, table.measure, table.items-table, table.tr-items, table.libset-table, .pi-months table, [data-nosort]';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** A cell's value for sorting: { t: 'date'|'num'|'text'|'', v }. data-sort on the cell wins. */
export function cellValue(td) {
  if (!td) return { t: '', v: '' };
  const raw = (td.dataset?.sort ?? td.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!raw || raw === '—' || raw === '-') return { t: '', v: '' };
  let m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/); // 02/11/2026, 02/11/2026, 10:15
  if (m) return { t: 'date', v: Number(m[3]) * 1e8 + Number(m[2]) * 1e6 + Number(m[1]) * 1e4 + (m[4] ? Number(m[4]) * 100 + Number(m[5]) : 0) };
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); // 2026-11-02
  if (m) return { t: 'date', v: Number(m[1]) * 1e8 + Number(m[2]) * 1e6 + Number(m[3]) * 1e4 };
  m = raw.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})(?:,? (\d{1,2}):(\d{2})(?: ?([ap]m))?)?/i); // 25 Nov 2026, 07:43 am
  if (m && MONTHS[m[2].toLowerCase()]) {
    let h = Number(m[4] || 0);
    if (m[6]) h = h % 12 + (/pm/i.test(m[6]) ? 12 : 0);
    return { t: 'date', v: Number(m[3]) * 1e8 + MONTHS[m[2].toLowerCase()] * 1e6 + Number(m[1]) * 1e4 + (m[4] ? h * 100 + Number(m[5]) : 0) };
  }
  m = raw.match(/^([A-Za-z]{3})[a-z]* (\d{4})$/); // Nov 2026 / November 2026
  if (m && MONTHS[m[1].toLowerCase()]) return { t: 'date', v: Number(m[2]) * 1e8 + MONTHS[m[1].toLowerCase()] * 1e6 };
  const n = raw.replace(/[₹,\s]|\/-$|Rs\.?/gi, '');
  m = n.match(/^([-−+]?)(\d+(?:\.\d+)?)(Cr|Dr)?$/i);
  if (m) return { t: 'num', v: (m[1] === '-' || m[1] === '−' || /cr/i.test(m[3] || '') ? -1 : 1) * Number(m[2]) };
  return { t: 'text', v: raw.toLowerCase() };
}

const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' });

/** The cell at a column position, counting colspans. */
function cellAt(tr, col) {
  let i = 0;
  for (const c of tr.cells) { const span = c.colSpan || 1; if (col < i + span) return span > 1 && tr.cells.length === 1 ? null : c; i += span; }
  return null;
}
function columnOf(th) {
  let i = 0;
  for (const c of th.parentElement.cells) { if (c === th) return i; i += c.colSpan || 1; }
  return i;
}
const isDetail = (tr) => tr.cells.length === 1 && (tr.cells[0].colSpan || 1) > 1 || tr.classList.contains('pi-months') || tr.classList.contains('m-note');
const isTotal = (tr) => tr.classList.contains('total') || /^total\b/i.test((tr.cells[0]?.textContent || '').trim());
const usable = (table) => table.tHead && !table.matches(SKIP) && !table.closest('.sheet')
  && !table.querySelector('tbody input:not([type=checkbox]), tbody select, tbody textarea');

let busy = false;

/** Sort one table by the column of `th`, in `dir` (1 / -1 / 0 = page order). */
export function sortTable(table, col, dir) {
  busy = true;
  try {
    for (const tb of table.tBodies) {
      const rows = [...tb.rows];
      if (rows.length < 2) continue;
      // groups: a row and the detail rows under it
      const groups = [], tail = [];
      rows.forEach((tr, i) => {
        if (tr.dataset.sortIdx === undefined || tr.dataset.sortGen !== tb.dataset.sortGen) { tr.dataset.sortIdx = String(i); tr.dataset.sortGen = tb.dataset.sortGen || ''; }
        if (isTotal(tr)) tail.push(tr);
        else if (isDetail(tr) && groups.length) groups[groups.length - 1].rows.push(tr);
        else groups.push({ rows: [tr], key: dir ? cellValue(cellAt(tr, col)) : null, idx: Number(tr.dataset.sortIdx) });
      });
      if (groups.length < 2) continue;
      const kinds = groups.map((g) => g.key?.t).filter(Boolean);
      const kind = ['date', 'num'].find((k) => kinds.length && kinds.filter((x) => x === k).length >= kinds.length * 0.6) || 'text';
      groups.sort((a, b) => {
        if (!dir) return a.idx - b.idx;
        const ea = !a.key.t, eb = !b.key.t;
        if (ea !== eb) return ea ? 1 : -1; // empty cells last, either way
        let c;
        if (kind === 'text' || a.key.t !== b.key.t) c = collator.compare(String(a.key.v), String(b.key.v));
        else c = a.key.v - b.key.v;
        return (c || a.idx - b.idx) * (c ? dir : 1);
      });
      const order = [...groups.flatMap((g) => g.rows), ...tail];
      if (order.every((tr, i) => tb.rows[i] === tr)) continue;
      const frag = document.createDocumentFragment();
      order.forEach((tr) => frag.appendChild(tr));
      tb.appendChild(frag);
    }
  } finally { Promise.resolve().then(() => { busy = false; }); }
}

function mark(table) {
  if (table.dataset.sortReady || !usable(table)) return;
  table.dataset.sortReady = '1';
  const head = table.tHead.rows[table.tHead.rows.length - 1];
  for (const th of head?.cells || []) {
    if (!th.textContent.trim() || th.querySelector('input, button, select')) continue;
    th.classList.add('sortable');
    th.tabIndex = 0;
    th.setAttribute('aria-sort', 'none');
    th.title = th.title || 'Sort by this column';
  }
}

function onHead(e) {
  const th = e.target.closest('th.sortable');
  if (!th || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
  if (e.type === 'keydown') e.preventDefault();
  const table = th.closest('table');
  if (!usable(table)) return;
  const col = columnOf(th);
  const was = Number(table.dataset.sortCol) === col ? Number(table.dataset.sortDir) : 0;
  const dir = was === 0 ? 1 : was === 1 ? -1 : 0;
  table.querySelectorAll('thead th.sortable').forEach((h) => h.setAttribute('aria-sort', 'none'));
  if (dir) th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
  table.dataset.sortCol = dir ? String(col) : '';
  table.dataset.sortDir = String(dir);
  sortTable(table, col, dir);
}

/** Turns on sorting for every suitable table in the page, now and as tables are drawn. */
export function enableTableSort(root = document.body) {
  root.querySelectorAll('table').forEach(mark);
  root.addEventListener('click', onHead);
  root.addEventListener('keydown', onHead);
  const pending = new Set();
  new MutationObserver((records) => {
    if (busy) return;
    for (const r of records) {
      const t = r.target.closest?.('table') || (r.target.tagName === 'TABLE' ? r.target : null);
      r.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.tagName === 'TABLE') pending.add(n); n.querySelectorAll?.('table').forEach((x) => pending.add(x)); } });
      if (t) pending.add(t);
    }
    if (!pending.size) return;
    queueMicrotask(() => {
      for (const table of pending) {
        mark(table);
        // a redrawn table keeps the chosen order; its rows get a fresh page order
        for (const tb of table.tBodies) tb.dataset.sortGen = String((Number(tb.dataset.sortGen) || 0) + 1);
        if (table.dataset.sortDir && table.dataset.sortDir !== '0' && table.dataset.sortCol !== '') sortTable(table, Number(table.dataset.sortCol), Number(table.dataset.sortDir));
      }
      pending.clear();
    });
  }).observe(root, { childList: true, subtree: true });
}
