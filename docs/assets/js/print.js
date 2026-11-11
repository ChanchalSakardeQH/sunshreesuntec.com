// print.html?bill=<id>        one bill
// print.html?month=YYYY-MM    every bill for that month (admin only), one per page
// print.html?receipt=<id>     one receipt
import { initFirebase, currentUser, errorText } from './firebase.js';
import { loadSite } from './accounts.js';
import { PARTICULARS, OPTIONAL, STATUSES, LIFT_GROUPS, money, amountInWords, ddmmyyyy, longDate, monthLabel } from './billing-core.js';
import { esc } from './data.js';

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
  } else if (params.get('bill')) {
    const s = await F.getDoc(F.doc(db, 'bills', params.get('bill')));
    if (!s.exists()) throw new Error('Bill not found.');
    html = billHTML(s.data(), site);
    title = `Bill ${s.data().billNo}`;
    document.title = `${title} – ${s.data().unit}`;
  } else if (params.get('month')) {
    const month = params.get('month');
    const snap = await F.getDocs(F.query(F.collection(db, 'bills'), F.where('month', '==', month)));
    const bills = snap.docs.map((d) => d.data());
    const order = new Map(); // keep the society's unit order
    try {
      const pub = await F.getDoc(F.doc(db, 'public', 'dues'));
      (pub.data()?.units || []).forEach((u, i) => order.set(u.id, i));
    } catch { /* ignore */ }
    bills.sort((a, b) => (order.get(a.unitId) ?? 999) - (order.get(b.unitId) ?? 999));
    if (!bills.length) throw new Error(`No bills found for ${monthLabel(month)}.`);
    html = bills.map((b) => billHTML(b, site)).join('');
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

function billHTML(b, site) {
  const amounts = Object.fromEntries((b.lines || []).map((l) => [l.code, l.amount]));
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
    return `<tr><td>${i + 1}.</td><td>${label}</td><td class="fill">${val}</td></tr>`;
  }).join('');

  const total = b.total;
  const words = total < 0 ? `Credit balance of ${amountInWords(-total)}` : amountInWords(total);
  const rate = site.interestRatePA;
  const interestNote = rate ? `Simple interest @${rate}% p.a. will be Charged on Outstanding Dues.`
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
    ${site.chargesBasis ? `<div class="basis">${esc(site.chargesBasis)}</div>` : ''}
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

function receiptHTML(r, site) {
  const cancelled = r.status === 'cancelled';
  const chequeNote = /cheque|draft/i.test(r.mode) ? ' (subject to realisation)' : '';
  const after = r.balanceAfter;
  return `<section class="sheet receipt"><div class="form">
    ${head(site)}
    <div class="title">RECEIPT${cancelled ? '<span class="cancelled">CANCELLED</span>' : ''}</div>
    <div class="meta">
      <div><p><b>Receipt No.:</b><span class="blank fill">${esc(r.receiptNo)}</span></p></div>
      <div class="right"><p><b>Date :</b><span class="blank fill">${ddmmyyyy(r.date)}</span></p></div>
    </div>
    <div class="r-body">
      Received with thanks from <span class="blank fill">${esc(r.name) || '—'}</span>,
      Flat / Shop / Unit No. <span class="blank fill">${esc(r.unit)}</span>,
      the sum of <span class="blank fill">${amountInWords(r.amount)}</span>
      by <span class="blank fill">${esc(r.mode)}${r.reference ? (/cheque|draft/i.test(r.mode) ? ' No. ' : ' Ref. ') + esc(r.reference) : ''}</span>${r.bank ? `, ${esc(r.bank)}` : ''}${chequeNote}
      towards maintenance charges${r.billNo ? ` against Bill No. <span class="blank fill">${esc(r.billNo)}</span>` : ''}.
    </div>
    <div class="r-grid">
      <div class="r-details"><dl>
        <dt>Balance before</dt><dd>₹ ${money(r.balanceBefore)}</dd>
        <dt>Amount received</dt><dd>₹ ${money(r.amount)}</dd>
        <dt>Balance after</dt><dd>₹ ${after < 0 ? money(after) + ' (advance)' : money(after)}</dd>
        ${r.note ? `<dt>Note</dt><dd>${esc(r.note)}</dd>` : ''}
        ${cancelled ? `<dt>Cancelled</dt><dd>${esc(r.cancelReason || 'Yes')}</dd>` : ''}
      </dl></div>
      <div class="r-amount"><span>Amount</span><span class="big">₹ ${money(r.amount)}</span></div>
    </div>
    <div class="notes" style="border-top:2px solid var(--line)">
      <div class="left">${bankBlock(site)}</div>
      ${signBlock(site)}
    </div>
  </div>
  <p class="digital">This is a computer-generated receipt from sunshreesuntec.com and is valid without a signature.</p>
  </section>`;
}
