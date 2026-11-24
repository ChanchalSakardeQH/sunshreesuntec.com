/**
 * 3.23: membership transfer sets — the documents a unit's new member submits on the death of a member (transmission)
 * or on the sale of the unit, tracked per unit (units/{id}/transfers/{caseId}) with scans in the unit's Drive folder
 * (Membership transfer). The checklists are the Society's own (settings/transferChecklists) and the committee can
 * change them; each item may point to a blank form kept in the Library, or to one of the letters below.
 */
export const TRANSFER_TYPES = { death: 'Transmission on the death of a member', sale: 'Transfer on sale of the unit' };

export const DEFAULT_CHECKLISTS = {
  death: {
    title: 'Transmission on the death of a member (share certificate transfer)',
    intro: 'To be submitted to the Society when a member dies, for the transfer of the shares and interest and the share certificate.',
    items: [
      { id: 'd1', name: 'Form No. 15', note: '' },
      { id: 'd2', name: 'Affidavit', note: 'On ₹500 stamp paper, notarised' },
      { id: 'd3', name: 'Form No. 3', note: 'On ₹100 stamp paper' },
      { id: 'd4', name: 'Form No. 4', note: 'On ₹100 stamp paper' },
      { id: 'd5', name: 'New nomination form', note: '' },
      { id: 'd6', name: 'Application to the Managing Committee', note: '', letter: 'deathApplication' },
      { id: 'd7', name: 'Copy of the previous nomination form', note: 'Photocopy' },
      { id: 'd8', name: 'Copy of the death certificate', note: 'Photocopy' },
      { id: 'd9', name: 'Original share certificate', note: '' },
      { id: 'd10', name: 'Cheque for the new membership', note: '₹100' }
    ]
  },
  sale: {
    title: 'Transfer of membership on sale of the unit',
    intro: 'To be submitted to the Society when a unit is sold, for the transfer of the shares and interest to the new member.',
    items: [
      { id: 's1', name: 'Submission letter', note: '', letter: 'submission' },
      { id: 's2', name: 'Possession letter', note: '', letter: 'possession' },
      { id: 's3', name: 'Appendix 13', note: '' },
      { id: 's4', name: 'Resignation from membership by the outgoing member', note: '', letter: 'resignation' },
      { id: 's5', name: 'Form 20A', note: '' },
      { id: 's6', name: 'Form 20B', note: '' },
      { id: 's7', name: 'Form 21-1', note: '' },
      { id: 's8', name: 'Form 23', note: '' },
      { id: 's9', name: 'Form 25', note: 'On ₹100 stamp paper' },
      { id: 's10', name: 'Form 26', note: 'On ₹100 stamp paper' },
      { id: 's11', name: 'Form 03', note: 'On ₹100 stamp paper' },
      { id: 's12', name: 'Undertaking from the prospective member', note: 'On ₹500 stamp paper' }
    ]
  }
};

/** Progress of a case: items received (or not applicable) out of all items. */
export function caseProgress(c) {
  const items = c.items || [], got = c.got || {};
  const done = items.filter((i) => got[i.id]?.on || got[i.id]?.na);
  return { done: done.length, total: items.length, missing: items.filter((i) => !(got[i.id]?.on || got[i.id]?.na)) };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const blank = (v, w = 14) => (v ? `<strong>${esc(v)}</strong>` : `<span class="b" style="min-width:${w}em"></span>`);
const SOCIETY = 'Sunshree Suntec Co-operative Housing Society Ltd.';
const SOC_ADDR = 'Sr. No. 19/2, 20/1, NIBM Road, Kondhwa Khurd, Pune 411 048';

/**
 * Letters the Society provides (its own formats; the numbered forms and stamp-paper documents are the prescribed
 * formats, kept as blank forms in the Library). Filled with what is known; the rest left blank to write in.
 */
export const LETTERS = {
  deathApplication: {
    title: 'Application to the Managing Committee for transmission of shares and interest',
    body: (x) => `<p>To,<br>The Secretary,<br>${SOCIETY}<br>${SOC_ADDR}</p>
      <p><strong>Subject: Transfer of the shares and interest of late ${blank(x.from)} in unit ${blank(x.unit, 6)} to me / us, and admission to membership.</strong></p>
      <p>Respected Sir / Madam,</p>
      <p>Late ${blank(x.from)}, a member of the Society holding share certificate no. ${blank(x.cert, 6)} in respect of unit ${blank(x.unit, 6)}, died on ${blank(x.eventDate, 8)}.
      I / We, ${blank(x.to, 20)}, being the nominee(s) / legal heir(s) of the deceased member, request the Managing Committee to transfer the shares and interest of the deceased member in the said unit to my / our name(s) and to admit me / us as member(s) of the Society.</p>
      <p>I / We enclose the documents required by the Society for transmission, as listed below, and undertake to abide by the Maharashtra Co-operative Societies Act, 1960, the Rules and the bye-laws of the Society, and to pay the Society’s dues in respect of the unit.</p>
      ${x.list}
      <p>Yours faithfully,</p>`,
    sign: ['Applicant(s)']
  },
  submission: {
    title: 'Submission of documents for transfer of membership',
    body: (x) => `<p>To,<br>The Secretary,<br>${SOCIETY}<br>${SOC_ADDR}</p>
      <p><strong>Subject: Transfer of the shares and interest in unit ${blank(x.unit, 6)} from ${blank(x.from)} to ${blank(x.to)}.</strong></p>
      <p>Respected Sir / Madam,</p>
      <p>The above unit has been sold by ${blank(x.from)} (transferor) to ${blank(x.to)} (transferee) by an agreement / deed dated ${blank(x.eventDate, 8)}, registered under no. ${blank(x.deedNo, 10)}.
      We submit the following documents for the transfer of the shares and interest in the unit and for the admission of the transferee as a member of the Society, and request the Managing Committee to approve the transfer.</p>
      ${x.list}
      <p>Yours faithfully,</p>`,
    sign: ['Transferor', 'Transferee']
  },
  possession: {
    title: 'Letter of possession',
    body: (x) => `<p>To,<br>The Secretary,<br>${SOCIETY}<br>${SOC_ADDR}</p>
      <p><strong>Subject: Handing over of possession of unit ${blank(x.unit, 6)}.</strong></p>
      <p>I, ${blank(x.from)} (transferor), have on ${blank(x.possessionDate || '', 8)} handed over vacant and peaceful possession of unit ${blank(x.unit, 6)} of the Society to ${blank(x.to)} (transferee),
      who has taken possession of it, in pursuance of the agreement / deed dated ${blank(x.eventDate, 8)}.</p>
      <p>Yours faithfully,</p>`,
    sign: ['Transferor (handed over)', 'Transferee (taken over)', 'Witness 1', 'Witness 2']
  },
  resignation: {
    title: 'Resignation from membership',
    body: (x) => `<p>To,<br>The Secretary,<br>${SOCIETY}<br>${SOC_ADDR}</p>
      <p><strong>Subject: Resignation from membership on transfer of unit ${blank(x.unit, 6)}.</strong></p>
      <p>Respected Sir / Madam,</p>
      <p>I, ${blank(x.from)}, a member of the Society holding share certificate no. ${blank(x.cert, 6)} in respect of unit ${blank(x.unit, 6)}, have transferred my shares and interest in the said unit to ${blank(x.to)}.
      I therefore resign my membership of the Society, to take effect when the Managing Committee approves the transfer and admits the transferee as a member, in accordance with the bye-laws of the Society.</p>
      <p>I confirm that I have paid / will pay all dues of the Society in respect of the unit up to the date of transfer.</p>
      <p>Yours faithfully,</p>`,
    sign: ['Outgoing member']
  }
};

/** Opens a letter ready to print, filled with the case's details (blank lines for the rest). */
export function letterHTML(key, x) {
  const L = LETTERS[key];
  if (!L) return '';
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const d = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const ctx = { ...x, eventDate: d(x.eventDate), possessionDate: d(x.possessionDate),
    list: x.items?.length ? `<p>Enclosures:</p><ol>${x.items.map((i) => `<li>${esc(i.name)}${i.note ? ` (${esc(i.note)})` : ''}</li>`).join('')}</ol>` : '' };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(L.title)} – ${esc(x.unit || '')}</title>
    <style>body{font:12pt/1.55 Georgia,'Times New Roman',serif;color:#111;max-width:46em;margin:2em auto;padding:0 1.5em}
    h1{font-size:14pt;text-align:center;margin:0 0 1.2em;text-transform:uppercase;letter-spacing:.03em}
    .b{display:inline-block;border-bottom:1px solid #444;height:1.1em;vertical-align:bottom}
    .sig{display:grid;grid-template-columns:repeat(2,1fr);gap:2.2em 2em;margin-top:2.5em}.sig div{border-top:1px solid #444;padding-top:.3em;font-size:10.5pt}
    .meta{display:flex;justify-content:space-between;margin-bottom:1.5em}.note{font:9pt system-ui,sans-serif;color:#666;margin-top:3em;border-top:1px solid #ccc;padding-top:.5em}
    .bar{font:13px system-ui,sans-serif;background:#f4f1ea;padding:.6em 1em;border-radius:8px;margin-bottom:1.5em}
    @media print{.bar{display:none}body{margin:0 auto}}</style></head><body>
    <div class="bar">Fill in the blanks by hand if needed, print, sign and hand it to the Society office. <button onclick="print()">Print</button></div>
    <h1>${esc(L.title)}</h1>
    <div class="meta"><span>Unit: ${blank(x.unit, 6)}</span><span>Date: ${blank(d(today), 8)}</span></div>
    ${L.body(ctx)}
    <div class="sig">${L.sign.map((s) => `<div>${esc(s)}<br><span style="font-size:9.5pt;color:#555">Name and signature</span></div>`).join('')}</div>
    <p class="note">A format provided by the Society. The numbered forms and the documents on stamp paper follow the formats prescribed under the bye-laws; ask the Society office for them.</p>
    </body></html>`;
}
export function openLetter(key, x) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(letterHTML(key, x)); w.document.close();
  return true;
}
