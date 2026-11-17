/**
 * Member portal agreement (3.13). Published versions are kept in memberAgreementVersions/<n> (never changed);
 * settings/memberAgreement points to the current one. Members accept it before using the portal; the accepted
 * copy is made into a PDF by the Drive script, kept in the unit's Drive folder and emailed to the member.
 *
 * The default text below is Version 1.0 as reviewed on 17/11/2026 (same text as the Society's Agreement document).
 * It must be vetted by the Society's advocate and adopted by Managing Committee resolution before it is published.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SOCIETY = {
  name: 'Sunshree Suntec Co-operative Housing Society Ltd.',
  reg: 'Regd. No. PNA/PNA(4)/HSG/(TC)/12471/2012-13 dated 30-10-2012',
  address: 'S. No. 19/2, 20/1, NIBM Road, Kondhwa Khurd, Pune 411 048'
};

export const DEFAULT_MEMBER_AGREEMENT = {
  "title": "Member Portal Use Agreement and Undertaking",
  "intro": [
    "This Member Portal Use Agreement and Undertaking (“Agreement”) is made between Sunshree Suntec Co-operative Housing Society Ltd., Kondhwa Khurd, Pune, registered under the Maharashtra Co-operative Societies Act, 1960 (Maharashtra Act No. XXIV of 1961) (“Society”), acting through its duly authorised Managing Committee, and the member or other person authorised by the Society to access the Society’s online member portal at www.sunshreesuntec.com (“Portal”).",
    "The Portal gives access to unit-related information, maintenance bills, receipts, account statements, Society notices, communications and other records or services made available by the Society.",
    "Access to the Portal is subject to this Agreement. A person who does not accept this Agreement may continue to obtain bills, receipts, notices and other information through the Society’s office or other applicable communication channels. Not using the Portal shall not, by itself, affect membership rights, statutory rights or obligations under applicable law."
  ],
  "sections": [
    {
      "heading": "Applicable law and Society bye-laws",
      "clauses": [
        "This Agreement shall be read with, and shall remain subject to: (a) the Maharashtra Co-operative Societies Act, 1960, including Chapter XIII-B relating to co-operative housing societies; (b) the Maharashtra Co-operative Societies Rules, 1961; (c) the registered bye-laws of the Society; (d) applicable Government notifications, circulars and directions; and (e) lawful resolutions passed by the General Body and the Managing Committee within their respective powers.",
        "If this Agreement is inconsistent with applicable legislation, the Rules, the registered bye-laws or a lawful resolution of the competent authority, the law, Rules, bye-laws or resolution shall prevail.",
        "Nothing in this Agreement shall be interpreted as: (a) taking away or restricting any statutory right of a member; (b) creating a charge, penalty, fee or financial liability not lawfully levied by the Society; (c) replacing statutory registers, books of account or records maintained by the Society; (d) preventing a member from exercising lawful inspection, complaint, appeal or dispute-resolution rights; or (e) giving the Portal any authority superior to the General Body, the Managing Committee or a competent statutory authority."
      ]
    },
    {
      "heading": "Portal access and use",
      "clauses": [
        "Each authorised user shall use their own login credentials and shall not share passwords, authentication codes or login credentials with anyone.",
        "The user shall take reasonable precautions to protect their account and registered email address, and shall report any suspected unauthorised access, account compromise or misuse to the Society promptly.",
        "The Portal may give access to information relating to the user’s unit, including: (a) maintenance bills and payment history; (b) receipts and outstanding balances; (c) Society notices and circulars; (d) Society accounts and reports made available for member access; (e) unit-related documents and correspondence; and (f) other administrative information approved by the Managing Committee.",
        "Portal notifications, emails, messages and mobile communications are supplementary communication facilities. They shall not replace any statutory mode of service or notice required under applicable law, the Rules or the registered bye-laws.",
        "The user agrees to visit the Portal regularly to view the unit’s bills, receipts, balance and the Society’s notices, and to keep their registered contact details up to date. Failure to access the Portal or to receive an electronic notification shall not, by itself, invalidate or establish service of a notice where the law prescribes a particular mode of service.",
        "Information displayed on the Portal is subject to verification and correction against the Society’s original records and supporting documents. A user may report any discrepancy to the Society for verification.",
        "The Society may temporarily restrict or suspend Portal access in case of suspected misuse, unauthorised access, security risk or material breach of this Agreement. Wherever reasonably practicable, the user shall be informed in writing of the reason and the steps required to restore access.",
        "Suspension or withdrawal of Portal access shall not affect the user’s membership, statutory rights or lawful obligations, or access to the Society’s other communication and administrative processes."
      ]
    },
    {
      "heading": "Maintenance charges, payments and financial records",
      "clauses": [
        "Members shall pay maintenance charges and other lawful dues levied by the Society within the due dates specified in the relevant bills or notices.",
        "Payments shall be made through the payment methods authorised by the Society. Immediately after paying, members shall share the payment details (date, amount, mode and transaction reference) on the Portal or with the Society’s office, so that the payment can be reconciled and a receipt issued on time.",
        "An online payment entry or transaction reference shall not, by itself, confirm that the Society has received the amount. A payment is recognised on successful realisation and reconciliation in the Society’s bank account and books of account.",
        "Receipts, balances and statements displayed on the Portal are provided for information and administrative convenience. Any discrepancy shall be verified against the Society’s bank records, books of account, supporting vouchers and other relevant records. A member may obtain a physical copy of any receipt from the Society’s office.",
        "The Society’s properly maintained books of account and duly audited financial statements remain the authoritative financial records, subject to applicable law and the rights of members to raise objections or seek inspection.",
        "The Portal shall not by itself create, alter, waive or extinguish any maintenance charge, interest, penalty or other liability. Such amounts must be supported by applicable law, the registered bye-laws and lawful resolutions or decisions of the competent Society authority.",
        "A Portal outage, technical error, failure to upload a bill, missing notification or temporary unavailability of an online payment facility shall not waive a lawful payment obligation. Members may obtain bills and payment instructions directly from the Society’s office or through another authorised method.",
        "Any dispute about a bill, payment, receipt, outstanding balance or financial entry may be submitted to the Managing Committee with supporting documents. The Society shall examine it and respond in accordance with applicable law and its established procedures.",
        "Interest on delayed payments and other consequences of default apply only as permitted by applicable law, the Rules, the registered bye-laws and valid resolutions of the competent Society authority."
      ]
    },
    {
      "heading": "Records relating to the member’s unit",
      "clauses": [
        "Members shall provide the Society with the documents and information reasonably required for maintaining statutory registers, ownership records, occupancy records, accounts and other Society records, including: (a) the complete chain of registered title documents of the unit, from the builder’s agreement for sale to the latest owner, each with its Index II, to the extent available with the member; (b) relevant transfer, nomination or ownership-change documents; (c) the current registered leave-and-licence agreement and the police intimation or verification of each licensee; (d) details of past licensees and occupants, with their agreements and police intimation where available; (e) details of all persons currently occupying the unit, as required under applicable law or the registered bye-laws; (f) applications, declarations and correspondence relating to the unit; and (g) other documents lawfully required by the Society.",
        "The Society may request additional supporting documents where reasonably necessary to verify ownership, transfer, occupancy, permitted use or compliance with applicable law and the registered bye-laws.",
        "Members using the Portal shall upload these documents on the Portal and also hand over a self-attested physical copy at the Society’s office. The Society shall acknowledge each physical submission in writing, with an acknowledgment number and date recorded on the Portal. Members not using the Portal may submit physical copies at the office against the same acknowledgment.",
        "Before giving a unit on leave and licence, or permitting occupation by persons for whom prior intimation or documentation is required, the member shall inform the Society in writing and submit the applicable documents in accordance with law and the registered bye-laws.",
        "Members shall inform the Society in writing of relevant changes relating to ownership, transfer, nomination, mortgage, occupancy, leave and licence arrangements or use of the unit (including any change from residential to commercial use), as required by applicable law and the registered bye-laws.",
        "Documents submitted by a member shall be true, complete and unaltered copies to the best of the member’s knowledge. Any later correction or change shall be communicated to the Society.",
        "A member providing personal information about occupants, licensees or other persons shall do so only to the extent reasonably required for lawful Society purposes, and shall give those persons any notice, or obtain any authorisation, required under applicable data-protection law.",
        "The Society shall take reasonable steps to restrict access to title documents, identity documents and other confidential records to persons authorised for legitimate Society functions.",
        "The Portal is a supplementary record-management facility. Uploading a document shall not, by itself, constitute verification, acceptance, registration, approval or amendment of any statutory Society record.",
        "The Society’s statutory registers and records shall continue to be maintained as required by law. Members shall keep their own copies of important documents, applications and correspondence relating to their unit."
      ]
    },
    {
      "heading": "Grievances, complaints and disputes",
      "clauses": [
        "As a first step, members shall submit any grievance, complaint or request about Society administration, accounts, maintenance, records, services, staff or management in writing to the Managing Committee through: (a) the Portal, where the facility is available; (b) the Society’s registered email address or other officially notified email address; or (c) a written application at the Society’s office, against acknowledgment.",
        "The complaint should, wherever possible, include the relevant facts, dates, unit details and supporting documents.",
        "The Society shall acknowledge complaints and endeavour to give a written response within 30 days, depending on the nature and complexity of the matter and the availability of relevant records.",
        "The 30-day period is an administrative target. It is not a mandatory waiting period where a shorter statutory period, urgent relief, a limitation period or another legal remedy applies.",
        "Nothing in this Agreement prevents a member from approaching the Registrar or other competent authority, the Co-operative Court, the police, a consumer forum, a civil court or any other authority having jurisdiction, in accordance with applicable law.",
        "Submitting an internal complaint does not waive any statutory right, limitation period, legal remedy or right to seek urgent intervention."
      ]
    },
    {
      "heading": "Responsible communication and conduct",
      "clauses": [
        "Members and authorised users shall use the Portal and Society communication channels responsibly, and shall not knowingly submit or circulate fabricated information, forged documents or materially false statements.",
        "Users shall not impersonate another person, or threaten, intimidate, harass or unlawfully target any member, office-bearer, Managing Committee member, employee, watchman or security guard, housekeeping, garbage-collection or cleaning worker, service provider or other person associated with the Society.",
        "Users shall not knowingly make, publish, post, forward or circulate, by any means – including the Portal, Society communication channels, WhatsApp or other messaging groups, social media, email, print, posters or videos – any content about the Society or the persons named in clause 6.2 that is false, defamatory, abusive, obscene, threatening or discriminatory.",
        "Personal information, identity documents, bank details, private correspondence, photographs and CCTV footage relating to other members, occupants, employees or visitors shall not be accessed, copied, published or circulated without lawful authority or a legitimate permitted purpose.",
        "Members shall treat Society employees and service personnel with reasonable courtesy, and shall submit complaints about their conduct in writing to the Managing Committee.",
        "Nothing in this section restricts or prohibits: (a) truthful statements made in good faith; (b) bona fide opinions and fair comment on Society affairs; (c) raising questions or objections at General Body meetings; (d) lawful inspection of Society records; (e) good-faith complaints or representations to the Managing Committee; (f) complaints or representations to the Registrar or other competent authorities; or (g) any other activity protected under applicable law.",
        "Where a breach of this section is established, the Society may take proportionate action available under applicable law, the Rules, the registered bye-laws and lawful resolutions. Portal access may be restricted where reasonably necessary to protect the Portal, Society records or users, after following an appropriate process wherever practicable."
      ]
    },
    {
      "heading": "Personal data, privacy and confidentiality",
      "clauses": [
        "The Society may collect and process personal data reasonably necessary for legitimate Society functions, including: (a) maintaining member and unit records; (b) ownership, transfer and occupancy administration; (c) maintenance billing, payment reconciliation and receipts; (d) communication of notices and Society information; (e) security and administration of Society premises; (f) statutory and regulatory compliance; (g) audit, accounting and legal proceedings; and (h) other lawful functions of the Society.",
        "The Society shall make available a Member Privacy Notice explaining the categories of personal data collected, the purposes of processing, sharing arrangements, retention practices, available rights and how to raise a privacy request or grievance.",
        "Access to personal data shall be restricted to authorised Managing Committee members, employees, auditors, professional advisers, service providers or other persons who need it for legitimate Society functions, or as otherwise permitted or required by law.",
        "The Society shall not sell members’ personal data or allow its use for unrelated advertising, profiling or commercial purposes.",
        "Where data must be shared with auditors, statutory authorities, the Registrar, the police, courts, legal advisers or other competent authorities, the Society shall share only what is reasonably required for that lawful purpose.",
        "Members shall not use the Portal to collect, download, extract, disclose or circulate personal data of other members or occupants for unauthorised or unrelated purposes.",
        "Members may ask the Society to give access to, correct or update their personal information, subject to applicable law, verification and the Society’s statutory record-keeping obligations.",
        "Records required by law, including statutory registers, accounts, ownership records and relevant occupancy documents, shall be retained for the legally required period. Other records shall be retained in accordance with the Society’s documented retention practices and applicable law.",
        "Where consent is the legal basis for a particular processing activity, withdrawal of consent shall not require the Society to erase, or stop processing, records it is legally required or otherwise lawfully entitled to keep or process.",
        "The Society shall handle personal data in accordance with applicable law, including the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023 and the rules under it, to the extent applicable and in force."
      ]
    },
    {
      "heading": "Portal security and availability",
      "clauses": [
        "The Society shall take reasonable administrative and technical measures to protect the Portal and Society records against unauthorised access, alteration, disclosure, loss or destruction.",
        "Users shall not attempt to bypass authentication, access another user’s account, probe or exploit Portal vulnerabilities, interfere with Portal availability, alter records without authorisation or introduce malicious code.",
        "Users shall promptly report any suspected account compromise, unauthorised disclosure, alteration or deletion, or other security incident to the Society through its officially notified contact channel.",
        "The Society shall assess reported security incidents and take reasonable steps to contain and recover from them, and shall make any notification required by applicable law.",
        "The Society may temporarily suspend Portal services for maintenance, upgrades, security incidents, technical failures or circumstances beyond its reasonable control, and shall endeavour to restore services within a reasonable period.",
        "The Society shall endeavour to keep backups of essential Portal information. The Portal is not the sole repository of the statutory registers, financial books or records the Society must maintain separately.",
        "The Portal, its records and its administration remain under the control of the Society. No developer or service provider acquires ownership of Society records, or any right to use member data for its own purposes, by providing services for the Portal."
      ]
    },
    {
      "heading": "Authority, access rights and user responsibility",
      "clauses": [
        "Portal access shall be granted to a member, or other person authorised by the Society, after reasonable verification of identity and authority.",
        "Access granted to a joint owner, family member, representative, occupant, licensee or other authorised user is limited to the permissions assigned by the Society.",
        "Portal access does not, by itself, confer membership, voting rights, ownership rights, management authority or the right to represent the member before the Society.",
        "A person using the Portal on behalf of a member does not acquire any independent membership right by holding Portal credentials.",
        "The member shall inform the Society of changes in ownership, authorised representation or occupancy that may require access to be changed, transferred or withdrawn.",
        "The Society may review and update access permissions to keep its records accurate and to protect the confidentiality and security of the Portal."
      ]
    },
    {
      "heading": "Suspension, withdrawal and alternative access",
      "clauses": [
        "The Society may suspend, restrict or withdraw Portal access for reasons including: (a) suspected unauthorised access or account compromise; (b) material misuse of the Portal; (c) a security or operational risk; (d) material breach of this Agreement; or (e) a change in ownership, occupancy or authorisation.",
        "Except where immediate action is reasonably necessary to protect security, records or users, the Society shall endeavour to inform the user of the reason and give an opportunity to clarify or rectify the issue.",
        "Any restriction shall be proportionate to its reason, and shall not be used to deny statutory rights or lawful access to Society records.",
        "During suspension or unavailability of the Portal, members may use the Society’s office or other officially notified channels for bills, receipts, notices, correspondence, record inspection and other lawful requests."
      ]
    },
    {
      "heading": "Electronic acceptance and record of the Agreement",
      "clauses": [
        "The user may accept this Agreement electronically by ticking the acceptance confirmations and typing their full name, or by another authentication process approved by the Society.",
        "The Portal shall record the user’s name and registered email address, the unit, the date and time of acceptance, the Agreement version, the confirmations ticked and the sign-in used.",
        "Electronic acceptance is governed by applicable law, including section 10A of the Information Technology Act, 2000.",
        "A copy of the accepted Agreement shall be emailed to the user’s registered email address, with a copy to the Society’s official email address, and kept in the Society’s records for the unit. The user may also download it from the Portal or ask the Society’s office for a copy.",
        "Acceptance by a person who is not the member applies to that person’s own use of the Portal within the authority granted. It does not, by itself, amend or replace the member’s statutory obligations."
      ]
    },
    {
      "heading": "Amendments to this Agreement",
      "clauses": [
        "The Managing Committee may amend this Agreement where required for legal compliance, administration, privacy, security or operational improvement, within its powers and subject to any General Body approval required under applicable law or the registered bye-laws.",
        "Material amendments shall be communicated to users through the Portal, registered email or another appropriate channel.",
        "Where renewed electronic acceptance is required, the Society shall keep the revised version and each user’s acceptance record.",
        "No amendment shall retrospectively remove statutory rights, create an unauthorised financial liability, override applicable law or restrict lawful remedies.",
        "If a user does not accept a revised version, the Society may pause that user’s use of the Portal until it is accepted. Alternative means of obtaining bills, receipts, notices and information, and of exercising statutory rights, shall remain available."
      ]
    },
    {
      "heading": "Official records and inspection rights",
      "clauses": [
        "The Portal facilitates access to information and records. It does not replace the Society’s statutory registers, original supporting documents, books of account or other records required by law.",
        "Whether a record is available online does not, by itself, decide whether a member is legally entitled to inspect or obtain a copy of it.",
        "Members may request inspection or copies of records in accordance with applicable law, the Rules and the registered bye-laws. The Society shall process such requests through the prescribed procedure.",
        "Where records contain confidential or personal information of other persons, the Society may apply lawful safeguards, such as redaction or controlled inspection, provided these do not defeat a member’s statutory inspection rights.",
        "Corrections to official Society records shall be made only by an authorised person, supported by appropriate documents and in accordance with applicable law and Society procedure. A Portal entry alone does not amend a statutory record."
      ]
    },
    {
      "heading": "Society control of Portal records",
      "clauses": [
        "The Portal, its Society identity, domain administration, official notices, member database and records kept for Society functions remain under the administrative control of the Society, subject to applicable law and third-party contractual rights.",
        "Only persons authorised by the Managing Committee shall publish, modify, remove, export or distribute official Society information through the Portal.",
        "Members shall not present personal views or unofficial communications as formal decisions, resolutions or notices of the Society."
      ]
    },
    {
      "heading": "General provisions",
      "clauses": [
        "This Agreement is governed by the laws of India.",
        "Subject to the jurisdiction and powers of statutory authorities and forums under applicable law, courts and authorities at Pune shall have jurisdiction in matters arising from this Agreement.",
        "If any provision of this Agreement is held invalid or unenforceable by a competent authority, the remaining provisions continue to operate to the extent legally permissible.",
        "This Agreement shall be read reasonably and in good faith, having regard to the lawful objectives of the Society and the rights of its members.",
        "Nothing in this Agreement creates an employer–employee relationship, partnership, agency or transfer of ownership between the Society and a Portal user."
      ]
    }
  ],
  "closing": "I confirm that I have read and understood this Member Portal Use Agreement and Undertaking and agree to comply with its terms while using the Portal. I understand that the Portal is an additional digital facility and that my rights and obligations under the Maharashtra Co-operative Societies Act, 1960, the Rules, the registered bye-laws and the lawful resolutions of the Society are not affected. I understand that the Society may use and process my personal data for legitimate Society functions in accordance with the Member Privacy Notice and applicable law. Where I am not the member of the unit, I accept this Agreement for my own use of the Portal, and the member remains responsible for the member’s obligations."
};

export const RELATION_TEXT = { owner: 'Owner (member)', jointOwner: 'Joint owner / associate member', family: 'Family member of the owner', tenant: 'Tenant / licensee', caretaker: 'Caretaker / authorised person' };

/** Editor text: "## Heading" lines start a section; every other non-empty line is a clause. */
export function sectionsToText(sections) {
  return (sections || []).map((s) => [`## ${s.heading}`, ...s.clauses].join('\n')).join('\n\n');
}
export function textToSections(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('##')) out.push({ heading: line.replace(/^#+\s*/, ''), clauses: [] });
    else if (out.length) out[out.length - 1].clauses.push(line.replace(/^(\d+[.)]|[-•*])\s+/, ''));
    else out.push({ heading: 'Terms', clauses: [line] });
  }
  return out.filter((s) => s.heading && s.clauses.length);
}

/**
 * The agreement as HTML. person: { name, email, unit, relation, mobile }; accepted: { signedName, when } or null.
 * The Drive script (Code.gs, agreementHtml_) renders the same layout for the PDF.
 */
export function agreementHTML(ag, person = {}, accepted = null) {
  let n = 0;
  return `<h1>${esc(ag.title)}</h1>
    <p class="meta-line">${esc(SOCIETY.name)}, ${esc(SOCIETY.reg)}. ${esc(SOCIETY.address)}. Version ${esc(ag.version ?? 'draft')}${ag.publishedOn ? `, published ${esc(ag.publishedOn)}` : ''}.</p>
    ${(ag.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>User</h2>
    <p><strong>${esc(person.name || '')}</strong>${person.relation ? `, ${esc(RELATION_TEXT[person.relation] || person.relation)}` : ''}<br>
      Unit ${esc(person.unit || '')}${person.email ? ` · ${esc(person.email)}` : ''}${person.mobile ? ` · +91 ${esc(person.mobile)}` : ''}</p>
    ${(ag.sections || []).map((s) => { n++; let c = 0; return `<h2>${n}. ${esc(s.heading)}</h2>${s.clauses.map((cl) => `<p class="clause"><span class="clause-no">${n}.${++c}</span> ${esc(cl)}</p>`).join('')}`; }).join('')}
    <p><strong>${esc(ag.closing || '')}</strong></p>
    ${accepted ? `<p class="meta-line"><strong>Accepted electronically</strong> by ${esc(accepted.signedName)} (${esc(person.email || '')}) on ${esc(accepted.when)}, version ${esc(ag.version)}.</p>` : ''}`;
}
