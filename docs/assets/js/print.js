// print.html?bill=<id>        one bill
// print.html?month=YYYY-MM    every bill for that month (admin only), one per page
// print.html?receipt=<id>     one receipt
import { initFirebase, currentUser, errorText } from './firebase.js';
import { initOfflineUi } from './offline.js';
initOfflineUi();
import { loadSite } from './accounts.js';
import { PARTICULARS, OPTIONAL, STATUSES, LIFT_GROUPS, money, amountInWords, ddmmyyyy, longDate, monthLabel } from './billing-core.js';
import { esc } from './data.js';
import { DEFAULT_SITE } from './defaults.js';
import { loadExplainData, explainHTML } from './billexplain.js';
import { checkSitePause } from './sitepause.js';
import { noticePages } from './notices.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

main().catch((err) => { console.error(err); $('#msg').textContent = errorText(err); });

async function main() {
  const fb = await initFirebase();
  if (!fb) { $('#msg').textContent = 'Member login isn’t switched on yet.'; return; }
  const user = await currentUser(fb);
  if (!user) {
    $('#msg').innerHTML = `Sign in to see this document. <a href="index.html#member">Go to member login</a>`;
    return;
  }
  const site = await loadSite(fb);
  if (await checkSitePause(site.society)) return;   // 3.28: paused by the committee
  const { F, db } = fb;
  let html = '', title = '';

  if (params.get('receipt')) {
    const s = await F.getDoc(F.doc(db, 'payments', params.get('receipt')));
    if (!s.exists()) throw new Error('Receipt not found.');
    const r = s.data();
    html = receiptHTML(r, site);
    title = `Receipt ${r.receiptNo}`;
    document.title = `${title} – ${r.unit}`;
    const text = `${site.society.name}\nReceipt ${r.receiptNo} dated ${ddmmyyyy(r.date)}\nUnit ${r.unit}, ${r.name}\nAmount received: Rs ${money(r.amount)}\nBalance after this payment: Rs ${money(r.balanceAfter)}\nView: ${location.href}`;
    const share = $('#tb-share');
    share.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    share.hidden = false;
  } else if (params.get('copies')) {
    // Duplicate receipts issued from the unit file (receiptCopies/<id>), one per page.
    const s = await F.getDoc(F.doc(db, 'receiptCopies', params.get('copies')));
    if (!s.exists()) throw new Error('These duplicate receipts were not found.');
    const c = s.data();
    const dup = { issuedOn: c.issuedOn, issuedBy: c.issuedByName || '', reason: c.reason || '', ref: c.ref || params.get('copies') };
    html = (c.receipts || []).map((r) => receiptHTML({ ...r, unit: c.unit }, site, { ...dup, recordedIn: r.recordedIn || '' })).join('');
    title = `${c.receipts.length} duplicate receipt${c.receipts.length > 1 ? 's' : ''}, ${c.unit}`;
    document.title = `Duplicate receipts – ${c.unit}`;
  } else if (params.get('bill')) {
    const s = await F.getDoc(F.doc(db, 'bills', params.get('bill')));
    if (!s.exists()) throw new Error('Bill not found.');
    // 3.27: with a second page explaining the calculation and the arrears (hide it with the toolbar box).
    const b = { id: s.id, ...s.data() };
    html = billHTML(b, site) + explainHTML(b, await loadExplainData(fb, b), site, basisText(b, site));
    explainToggle(true);
    title = `Bill ${s.data().billNo}`;
    document.title = `${title} – ${s.data().unit}`;
  } else if (params.get('notice')) {
    // 3.28: demand / recovery notices: for each unit the notice (Marathi, English), its bill and the calculation.
    const s = await F.getDoc(F.doc(db, 'noticeRuns', params.get('notice')));
    if (!s.exists()) throw new Error('These notices were not found.');
    const run = s.data(), only = params.get('unit');
    const list = (run.units || []).filter((u) => !only || u.unitId === only);
    if (!list.length) throw new Error('That unit is not in these notices.');
    $('#msg').textContent = `Preparing ${list.length} notice${list.length > 1 ? 's' : ''}…`;
    const parts = [];
    for (const u of list) {
      const bs = u.billId ? await F.getDoc(F.doc(db, 'bills', u.billId)).catch(() => null) : null;
      const b = bs?.exists() ? { id: bs.id, ...bs.data() } : null;
      parts.push(`<div class="n-set" data-unit="${esc(u.unitId)}">${noticePages(run, u, site, head(site))}${b ? billHTML(b, site) + explainHTML(b, await loadExplainData(fb, b), site, basisText(b, site)) : ''}</div>`);
    }
    html = parts.join('');
    explainToggle(true);
    title = only ? `${run.title || 'Notice'} – ${list[0].unit}` : `${list.length} notices: ${run.title || ''}`;
    document.title = only ? `Notice ${list[0].unit} – ${ddmmyyyy(run.letterDate)}` : `Notices ${ddmmyyyy(run.letterDate)}`;
  } else if (params.get('month')) {
    const month = params.get('month');
    const snap = await F.getDocs(F.query(F.collection(db, 'bills'), F.where('month', '==', month)));
    const bills = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const order = new Map(); // keep the society's unit order
    try {
      const pub = await F.getDoc(F.doc(db, 'public', 'dues'));
      (pub.data()?.units || []).forEach((u, i) => order.set(u.id, i));
    } catch { /* ignore */ }
    bills.sort((a, b) => (order.get(a.unitId) ?? 999) - (order.get(b.unitId) ?? 999));
    if (!bills.length) throw new Error(`No bills found for ${monthLabel(month)}.`);
    // 3.27: the explanation page for every bill only when asked (…&explain=1): it reads each unit's whole account.
    const withX = params.get('explain') === '1';
    const xs = withX ? await Promise.all(bills.map((b) => loadExplainData(fb, b))) : [];
    html = bills.map((b, i) => billHTML(b, site) + (withX ? explainHTML(b, xs[i], site, basisText(b, site)) : '')).join('');
    explainToggle(withX, true);
    title = `${bills.length} bills for ${monthLabel(month)}`;
    document.title = `Bills ${monthLabel(month)}`;
  } else {
    throw new Error('Nothing to show. Open a bill or receipt from your account.');
  }

  $('#docs').innerHTML = html;
  $('#tb-title').textContent = title;
  $('#toolbar').hidden = false;
  $('#msg').hidden = true;
}

/** Toolbar box: show or hide the "How this bill is worked out" pages (for the month, reloads with them). */
function explainToggle(on, reload = false) {
  const box = document.getElementById('tb-explain');
  if (!box) return;
  box.hidden = false;
  const cb = box.querySelector('input');
  cb.checked = on;
  cb.addEventListener('change', () => {
    if (reload) { const p = new URLSearchParams(location.search); if (cb.checked) p.set('explain', '1'); else p.delete('explain'); location.search = p.toString(); return; }
    document.body.classList.toggle('no-explain', !cb.checked);
  });
}

function head(site) {
  const s = site.society;
  return `<div class="f-head">
    <h1>${esc(s.name)}</h1>
    <p>${esc(s.regd)}</p>
    <p class="addr">${esc(s.address)}</p>
    <p class="contact"><span><b>Email :</b> ${esc(s.email)}</span><span><b>Website :</b> ${esc(s.website)}</span></p>
  </div>`;
}

function statusLine(status) {
  return `<span class="status-opts">Status : ${STATUSES.map((s) => `<span class="${s === status ? 'on' : ''}">${s}</span>`).join(' / ')}</span>`;
}

function bankBlock(site) {
  const b = site.bank;
  return `<div class="bank">Bank Name :- ${esc(b.name)}<br>Account Name :- ${esc(b.accountName)}<br>Account No.:- ${esc(b.accountNo)} / IFSC CODE : ${esc(b.ifsc)}</div>`;
}

function signBlock(site) {
  return `<div class="sign">
    <p class="for">For ${esc(site.society.name)}</p>
    <p class="line">Chairman</p><p class="line">Secretary</p><p class="line">Treasurer</p>
  </div>`;
}

function basisText(b, site) {
  return b.method === 'mmc' ? (site.chargesBasisMmc || DEFAULT_SITE.chargesBasisMmc) : site.chargesBasis;
}

function billHTML(b, site) {
  const amounts = Object.fromEntries((b.lines || []).map((l) => [l.code, l.amount]));
  const details = Object.fromEntries((b.lines || []).filter((l) => l.detail).map((l) => [l.code, l.detail]));
  // Older bills may carry heads from before the bill format changed; show them under their own label.
  const known = new Set(PARTICULARS.map(([c]) => c));
  const legacy = (b.lines || []).filter((l) => !known.has(l.code)).map((l) => [l.code, l.label]);
  const heads = [...PARTICULARS.filter(([code]) => !OPTIONAL.has(code) || amounts[code]), ...legacy];
  const rows = heads.map(([code, label], i) => {
    let val = '';
    if (code === 'arrears') {
      val = b.arrears ? money(b.arrears) : (b.unverified ? 'Not verified' : '');
      if (b.unverified && b.arrears) val += '<span class="sub">to be verified</span>';
    } else if (amounts[code]) {
      val = money(amounts[code]);
    }
    return `<tr><td>${i + 1}.</td><td>${label}${details[code] ? `<span class="sub">${esc(details[code])}</span>` : ''}</td><td class="fill">${val}</td></tr>`;
  }).join('');

  const total = b.total;
  const words = total < 0 ? `Credit balance of ${amountInWords(-total)}` : amountInWords(total);
  const rate = site.interestRatePA;
  // 3.15: the rate in force now, and the earlier rate(s) for older dues.
  const periods = (site.interestPeriods || []).filter((p) => Number(p.rate) > 0);
  const nowP = periods.filter((p) => p.from <= (b.billDate || '9999')).at(-1);
  const older = periods.filter((p) => p !== nowP && p.from < (nowP?.from || '')).map((p) => `${p.rate}% p.a. up to ${ddmmyyyy(p.to)}`);
  const interestNote = nowP ? `Simple interest @${nowP.rate}% p.a. will be charged on outstanding dues${older.length ? ` (${older.join('; ')})` : ''}, as fixed by the General Body under MCS Rule 106C-12(4)-6.`
    : rate ? `Simple interest @${rate}% p.a. will be Charged on Outstanding Dues.`
    : 'Interest on outstanding dues will be charged at the rate fixed by the General Body.';
  const contactNo = site.society.contactNo || '__________________';

  return `<section class="sheet"><div class="form">
    ${head(site)}
    <div class="meta">
      <div>
        <p><b>Name :</b><span class="blank fill">${esc(b.name) || '&nbsp;'}</span></p>
        <p><b>Flat / Shop / Unit No.:</b><span class="blank fill" style="flex:0 0 28mm">${esc(b.unit)}</span>${statusLine(b.status)}</p>
        <p><b>Bill for the Period</b><span class="blank fill">${longDate(b.periodFrom)}</span> to <span class="blank fill">${longDate(b.periodTo)}</span></p>
      </div>
      <div class="right">
        <p><b>Bill No.:</b><span class="blank fill">${esc(b.billNo)}</span></p>
        <p><b>Date :</b><span class="blank fill">${ddmmyyyy(b.billDate)}</span></p>
        <p><b>Due Date :</b><span class="blank fill">${ddmmyyyy(b.dueDate) || '&nbsp;'}</span></p>
      </div>
    </div>
    <table class="parts">
      <thead><tr><th>No.</th><th>PARTICULARS</th><th>AMOUNT (In Rs.)</th></tr></thead>
      <tbody>${rows}
        <tr class="total"><td></td><td>TOTAL</td><td class="fill">${money(total)}</td></tr>
      </tbody>
    </table>
    ${(b.liftNotes || []).length ? `<div class="basis"><b>Lift AMC / repairs shared equally by the units served by the lift:</b> ${b.liftNotes.map((n) =>
      `${esc(n.lift === 'CD' ? 'C & D wing lifts' : LIFT_GROUPS[n.lift] || n.lift)} – ${esc(n.kind)}: ${esc(n.description)}${n.invoiceNo ? ` (inv. ${esc(n.invoiceNo)}, ${ddmmyyyy(n.date)})` : ''}, ₹ ${money(n.amount, { slash: false })} ÷ ${n.units} units${n.instalment !== '1/1' ? `, instalment ${n.instalment}` : ''} = ₹ ${money(n.share, { slash: false })}`).join('; ')}</div>` : ''}
    ${basisText(b, site) ? `<div class="basis">${esc(basisText(b, site))}</div>` : ''}
    <div class="words"><b>Rs. In words</b><span class="fill">${words}${b.unverified ? ' <span class="flag">Opening balance to be verified.</span>' : ''}</span></div>
    <div class="notes">
      <div class="left">
        <ol>
          <li>Please Inform the Society Office in case of any discrepancies in this Bill within 7 days. Point of Contact No. ${esc(contactNo)}</li>
          <li>Please Mention your Bill No./ Flat No./ Shop No./ Unit on the Reverse of the Cheque.</li>
          <li>${interestNote}</li>
          <li>Pay online through NEFT as per the Details Mentioned Below.</li>
        </ol>
        ${bankBlock(site)}
        <div class="ack">
          <div>In case of make Payments through NEFT Please send Payments Details on :<br><b>Email : ${esc(site.society.email)}</b></div>
          <div>OWNER'S Acknowledgment for Acceptance:<br><br>Signature,<br>(Please Refer P.T.O. Points And Society By Laws)</div>
        </div>
      </div>
      ${signBlock(site)}
    </div>
  </div>
  <p class="digital">This is a computer-generated bill from sunshreesuntec.com.</p>
  </section>`;
}

/* r: a payment. dup (optional): { issuedOn, issuedBy, reason, recordedIn } for a duplicate copy. */
function receiptHTML(r, site, dup = null) {
  const cancelled = r.status === 'cancelled';
  const chequeNote = /cheque|draft/i.test(r.mode) ? ' (subject to realisation)' : '';
  const after = r.balanceAfter;
  const hasBal = typeof r.balanceBefore === 'number' && typeof r.balanceAfter === 'number';
  return `<section class="sheet receipt${dup ? ' duplicate' : ''}"><div class="form">
    ${head(site)}
    <div class="title">${dup ? 'DUPLICATE RECEIPT' : 'RECEIPT'}${cancelled ? '<span class="cancelled">CANCELLED</span>' : ''}</div>
    <div class="meta">
      <div><p><b>Receipt No.:</b><span class="blank fill">${esc(r.receiptNo)}</span></p></div>
      <div class="right"><p><b>Date :</b><span class="blank fill">${ddmmyyyy(r.date)}</span></p></div>
    </div>
    <div class="r-body">
      Received with thanks from <span class="blank fill">${esc(r.name) || '—'}</span>,
      Flat / Shop / Unit No. <span class="blank fill">${esc(r.unit)}</span>,
      the sum of <span class="blank fill">${amountInWords(r.amount)}</span>
      by <span class="blank fill">${esc(r.mode)}${r.reference ? (/cheque|draft/i.test(r.mode) ? ' No. ' : ' Ref. ') + esc(r.reference) : ''}</span>${r.bank ? `, ${esc(r.bank)}` : ''}${chequeNote}
      on the Shop / Flat / Office Unit’s account.
    </div>
    <div class="r-grid">
      <div class="r-details"><dl>
        ${hasBal ? `<dt>Balance before</dt><dd>₹ ${money(r.balanceBefore)}</dd>` : ''}
        <dt>Amount received</dt><dd>₹ ${money(r.amount)}</dd>
        ${hasBal ? `<dt>Balance after</dt><dd>₹ ${after < 0 ? money(after) + ' (advance)' : money(after)}</dd>` : ''}
        ${r.billNo ? `<dt>Bill No.</dt><dd>${esc(r.billNo)}</dd>` : ''}
        ${r.towards ? `<dt>Towards</dt><dd>${esc(r.towards)}</dd>` : ''}
        ${r.note ? `<dt>Note</dt><dd>${esc(r.note)}</dd>` : ''}
        ${dup ? `<dt>Recorded in</dt><dd>${esc(dup.recordedIn)}</dd>` : ''}
        ${cancelled ? `<dt>Cancelled</dt><dd>${esc(r.cancelReason || 'Yes')}</dd>` : ''}
      </dl></div>
      <div class="r-amount"><span>Amount</span><span class="big">₹ ${money(r.amount)}</span></div>
    </div>
    <div class="notes" style="border-top:2px solid var(--line)">
      <div class="left">${bankBlock(site)}</div>
      ${signBlock(site)}
    </div>
  </div>
  ${dup ? `<p class="dup-note"><strong>Duplicate copy</strong> of the receipt dated ${ddmmyyyy(r.date)}, issued on ${ddmmyyyy(dup.issuedOn)}${dup.issuedBy ? ` by ${esc(dup.issuedBy)}` : ''}${dup.reason ? ` (${esc(dup.reason)})` : ''}. Reference ${esc(dup.ref)}.</p>` : ''}
  <p class="digital">This is a computer-generated receipt from sunshreesuntec.com and is valid without a signature.</p>
  <p class="disclaimer"><strong>Disclaimer:</strong> Digitally generated receipts are for members’ tracking. Members can obtain a physical copy from the Sunshree Suntec Society’s Accountant. The amount shown is subject to clearance in the Sunshree Suntec Society’s bank account.</p>
  </section>`;
}
