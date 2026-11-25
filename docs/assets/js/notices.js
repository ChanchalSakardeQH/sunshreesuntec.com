/**
 * 3.28: demand / recovery notices to members with dues — the Society's bilingual notice (Marathi and English), filled in
 * for each unit, printed with the unit's bill and "How this bill is worked out" as one set per unit.
 *
 * noticeRuns/{id} { no, title, titleMr, letterDate, refPrefix, month, days, previous: [{ date, label, labelMr }],
 *   interestEn, interestMr, sign: { name, role, mobile }, minAmount,
 *   units: [{ unitId, unit, name, type, amount, billId, billNo, billDate, billTotal, regPost }],
 *   recorded: { unitId: 'OUT/2026-27/0012' }, createdBy, createdByName, createdAt }
 */
import { esc } from './data.js';
import { money, ddmmyyyy, amountInWords } from './billing-core.js';

const DEV = '०१२३४५६७८९';
const toDev = (s) => String(s).replace(/[0-9]/g, (d) => DEV[d]);
const DAY_WORDS = { 3: ['Three', 'तीन'], 5: ['Five', 'पाच'], 7: ['Seven', 'सात'], 10: ['Ten', 'दहा'], 15: ['Fifteen', 'पंधरा'], 21: ['Twenty-one', 'एकवीस'], 30: ['Thirty', 'तीस'] };
const ROLE_MR = { Chairman: 'अध्यक्ष', Secretary: 'सचिव', Treasurer: 'खजिनदार', 'Joint Secretary': 'सहसचिव', 'Vice Chairman': 'उपाध्यक्ष' };
const rs = (n) => `₹ ${money(Math.round(n), { slash: false })}/-`;

/** The interest sentence from the rate periods (e.g. 18% from 13/04/2013, 12% from 01/07/2026). */
export function interestClauses(periods) {
  const list = (periods || []).filter((p) => p && p.from && Number(p.rate) > 0).sort((a, b) => a.from.localeCompare(b.from));
  if (!list.length) return { en: 'Levy interest on the outstanding amount as per the Society’s Bye-laws.', mr: 'सोसायटीच्या उपविधीनुसार थकबाकी रकमेवर व्याज आकारले जाईल.' };
  const en = list.map((p) => `${p.rate}% per annum from ${ddmmyyyy(p.from)}`).join(' and ');
  const mr = list.map((p) => `दिनांक ${ddmmyyyy(p.from)} पासून ${p.rate}% वार्षिक`).join(' व ');
  const first = list[0].from;
  return {
    en: `Levy interest on the outstanding amount at ${en}, as resolved by the members (resolution of ${ddmmyyyy(first)}) and as per the Society’s Bye-laws and the MCS Rules.`,
    mr: `सभासदांच्या दिनांक ${ddmmyyyy(first)} च्या ठरावानुसार व सोसायटीच्या उपविधीनुसार थकबाकी रकमेवर ${mr} दराने व्याज आकारले जाईल.`
  };
}

export const DEFAULT_PREVIOUS = [
  { date: '2026-01-17', label: '1st Demand Notice', labelMr: 'पहिली मागणी नोटीस' },
  { date: '2026-10-22', label: '2nd Demand Notice', labelMr: 'दुसरी मागणी नोटीस' }
];

const premises = (type) => /shop/i.test(type || '') ? ['Shop', 'दुकान'] : /office|commercial|hotel/i.test(type || '') ? ['Office', 'ऑफिस'] : ['Flat', 'फ्लॅट'];
const join = (list, and) => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} ${and} ${list.at(-1)}`;

/** The two pages of the notice (Marathi, then English) for one unit. */
export function noticePages(run, u, site, head) {
  const s = site.society || {}, b = site.bank || {};
  const [pe, pm] = premises(u.type);
  const ref = `${run.refPrefix ? `${run.refPrefix}/` : ''}${String(u.unit).replace(/\s+/g, '')}`;
  const days = Number(run.days) || 7, dw = DAY_WORDS[days] || [String(days), toDev(days)];
  const asOn = ddmmyyyy(run.letterDate);
  const paidSince = Math.round((u.billTotal || 0) - (u.amount || 0));
  const billRefEn = u.billNo ? ` (Bill No. ${esc(u.billNo)} dated ${ddmmyyyy(u.billDate)}${paidSince > 0 ? `, less ${rs(paidSince)} received after the bill` : ''})` : '';
  const billRefMr = u.billNo ? ` (बिल क्र. ${esc(u.billNo)}, दिनांक ${ddmmyyyy(u.billDate)}${paidSince > 0 ? `; बिलानंतर जमा झालेले ${rs(paidSince)} वजा करून` : ''})` : '';
  const prev = (run.previous || []).filter((p) => p.date);
  const prevEn = prev.length ? `Despite our earlier notices — ${join(prev.map((p) => `the ${esc(p.label)} dated ${ddmmyyyy(p.date)}`), 'and')}, sent by Registered Post — and multiple reminders, the dues remain unpaid.` : 'Despite multiple reminders, the dues remain unpaid.';
  const prevMr = prev.length ? `यापूर्वी ${join(prev.map((p) => `दिनांक ${ddmmyyyy(p.date)} रोजीची ${esc(p.labelMr || p.label)}`), 'व')} नोंदणीकृत टपालाद्वारे पाठवूनही, तसेच अनेक वेळा तोंडी व लेखी सूचना देऊनही सदर रक्कम अद्याप जमा झालेली नाही.` : 'यापूर्वी अनेक वेळा तोंडी व लेखी सूचना देऊनही सदर रक्कम अद्याप जमा झालेली नाही.';
  const role = run.sign?.role || 'Chairman', roleMr = ROLE_MR[role] || role;
  const unitAddrMr = `${esc(u.unit)} (${pm})`, unitAddrEn = `${esc(u.unit)} (${pe})`;

  const mr = `<section class="sheet notice" lang="mr"><div class="n-wrap">
    ${head}
    <div class="n-top"><span><b>नोंदणीकृत टपालाद्वारे</b> (BY REGISTERED POST)</span><span>दिनांक: <b>${asOn}</b></span></div>
    <p class="n-ref">संदर्भ क्र.: ${esc(ref)}</p>
    <p>प्रति,<br>सभासद नाव: <b>${esc(u.name || '')}</b><br>युनिट नं.: <b>${unitAddrMr}</b><br>सनश्री सनटेक को-ऑप. हौसिंग सोसायटी लि.<br>स. नं. 19/2, 20/1, NIBM रोड, कोंढवा खुर्द, पुणे – 411048</p>
    <p class="n-sub"><b>विषय:</b> ${esc(run.titleMr || 'थकित सोसायटी मेंटेनन्स भरणा – अंतिम वसुली नोटीस')}</p>
    <p>महोदय / महोदया,</p>
    <p>सोसायटीच्या नोंदीप्रमाणे आपल्या युनिट नं. <b>${unitAddrMr}</b> वर दिनांक <b>${asOn}</b> पर्यंत <b>${rs(u.amount)}</b> इतकी मेंटेनन्स थकबाकी बाकी आहे${billRefMr}. संबंधित डिमांड बिल व थकबाकीचे सविस्तर विवरण या पत्रासोबत जोडलेले आहे.</p>
    <p>${prevMr} मेंटेनन्स न भरल्यामुळे सोसायटीच्या मूलभूत सेवा जसे सुरक्षा, हाऊसकीपिंग, पाणीपुरवठा, कॉमन एरिया देखभाल इत्यादींवर परिणाम होत आहे.</p>
    <p>म्हणून हे पत्र आपणास <b>अंतिम नोटीस</b> म्हणून पाठविण्यात येत आहे. कृपया हे पत्र प्राप्त झाल्यापासून <b>${toDev(days)} (${dw[1]}) दिवसांच्या</b> आत संपूर्ण थकबाकी रक्कम जमा करावी.</p>
    <p>जर विहित मुदतीत भरणा केला नाही तर व्यवस्थापन समिती खालीलप्रमाणे कार्यवाही करेल:</p>
    <ol class="n-list"><li>${esc(run.interestMr)}</li><li>महाराष्ट्र सहकारी संस्था अधिनियमांतर्गत / सहकारी न्यायालयात वसुलीची कायदेशीर कारवाई करण्यात येईल.</li><li>कायदेशीर, प्रशासकीय व वसुली संदर्भातील सर्व खर्च आपल्या खात्यावर जोडून वसूल करण्यात येईल.</li></ol>
    <p class="n-pay"><b>भरणा करण्याचा तपशील:</b><br>खाते नाव: ${esc(b.accountName || '')}<br>बँक: ${esc(b.name || '')}<br>खाते क्रमांक: ${esc(b.accountNo || '')}<br>IFSC कोड: ${esc(b.ifsc || '')}<br>(भरणा करताना आपल्या युनिट नं. चा उल्लेख करावा)<br>
      भरणा केल्यानंतर कृपया पेमेंटचा पुरावा: ईमेल: ${esc(s.email || '')} किंवा सनटेक सोसायटी अध्यक्ष / सचिव यांना थेट माहिती द्यावी.</p>
    <div class="n-sign"><p>आपला विश्वासू,<br>सोसायटीकडून,<br>सनश्री सनटेक को-ऑप. हौसिंग सोसायटी लि.</p><p class="n-line"></p>
      <p>${esc(run.sign?.name || '')} (${esc(roleMr)})<br>मोबाईल नं.: ${esc(run.sign?.mobile || '')}</p></div>
    <p class="n-encl">संलग्न: डिमांड बिल / थकबाकी विवरण</p>
  </div></section>`;

  const en = `<section class="sheet notice" lang="en"><div class="n-wrap">
    ${head}
    <div class="n-top"><span><b>BY REGISTERED POST</b></span><span>Date: <b>${asOn}</b></span></div>
    <p class="n-ref">Ref. No.: ${esc(ref)}</p>
    <p>To,<br>Member Name: <b>${esc(u.name || '')}</b><br>Unit No.: <b>${unitAddrEn}</b><br>Sunshree Suntec Co-operative Housing Society Ltd.<br>S.No.19/2, 20/1, NIBM Road, Kondhwa Khurd, Pune – 411048</p>
    <p class="n-sub"><b>Subject:</b> ${esc(run.title || 'Final Recovery Notice – Outstanding Society Maintenance Dues')}</p>
    <p>Respected Member,</p>
    <p>As per society records, your Unit No. <b>${unitAddrEn}</b> has outstanding maintenance dues of <b>${rs(u.amount)}</b> (${esc(amountInWords(Math.round(u.amount)).replace(/\.$/, ''))}) up to <b>${asOn}</b>${billRefEn}. The detailed demand bill and the statement of how it is worked out are enclosed for your reference.</p>
    <p>${prevEn} Non-payment directly affects essential society services including security, housekeeping, water supply, and common area maintenance.</p>
    <p>Accordingly, this letter serves as a <b>FINAL NOTICE</b> to clear the outstanding amount within <b>${days} (${dw[0]}) days</b> from receipt of this letter.</p>
    <p>If payment is not received within the stipulated period, the Managing Committee shall be constrained to:</p>
    <ol class="n-list"><li>${esc(run.interestEn)}</li><li>Initiate recovery proceedings under the Maharashtra Co-operative Societies Act / Co-operative Court without further notice.</li><li>Recover all legal, administrative, and recovery expenses incurred from your account in addition to the outstanding dues.</li></ol>
    <p class="n-pay"><b>Payment Details:</b><br>Account Name: ${esc(b.accountName || '')}<br>Bank: ${esc(b.name || '')}<br>Account No.: ${esc(b.accountNo || '')}<br>IFSC Code: ${esc(b.ifsc || '')}<br>(Please mention your Unit No. in payment remarks)<br>
      After making payment, kindly share payment confirmation: Email: ${esc(s.email || '')} or inform Suntec Society Chairman / Secretary directly.</p>
    <p>We request your immediate cooperation to avoid additional charges and legal action.</p>
    <div class="n-sign"><p>Yours faithfully,<br>For Sunshree Suntec Co-operative Housing Society Ltd.</p><p class="n-line"></p>
      <p>${esc(run.sign?.name || '')} (${esc(role)})<br>Mobile No.: ${esc(run.sign?.mobile || '')}</p></div>
    <p class="n-encl">Encl.: Demand Bill / Outstanding Statement (How this bill is worked out)</p>
  </div></section>`;
  return mr + en;
}
