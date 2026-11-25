# Changelog

All notable changes to the Sunshree Suntec CHS website and accounting software (sunshreesuntec.com).
Versions follow `MAJOR.MINOR.PATCH`: MAJOR for a new module, MINOR for new features or changed billing rules, PATCH for fixes.
Every change to how an amount is calculated is listed under **Billing rules** so a bill can always be traced to the rules in force when it was generated.

---

## [3.30.0] – 2026-11-25 – Charges recovered from units: deemed conveyance fee, legal notice and other expenses

### Added
- **Bills → Charges to recover from units** (committee, and staff with *corrections*, e.g. the Accountant; others with *view* see the list):
  - **Head on the bill:** two new heads, *Deemed Conveyance Legal Fee* and *Legal Notice & Recovery Expenses*, besides *Cheque Return Charges*, *Penalty / Other Charges* (at most ₹5,000 a year, Bye-law 165) and *Any Others Charges*. They are printed on the bill only when there is an amount.
  - **Description** (shown on the bill's *How this bill is worked out* page and in the statement). Choosing the conveyance head fills *Deemed conveyance legal-process fee (notice dated 15/10/2026)*.
  - **Amounts per unit:** every active unit with its dues; type an amount against each unit, or *Put it for all units shown* (e.g. ₹6,500), or take **the units of a recovery notice** (e.g. ₹350 each for registered post, printing and copies; the description is filled from the notice). Show all units, units with dues, or units with an amount.
  - **When:** **on the bills of a month** not yet billed (default the next month; a separate line on each unit's bill, made by the monthly run or *Generate*; several charges of the same head in a month add up, their descriptions joined), or **debited at once** with a date (a ledger entry of kind *charge*, the balance and website dues updated; in the arrears of the next bill).
  - Warnings for a charge already added for the same unit, head, description and month; a month already billed is refused.
  - **Charges added:** grouped by head, description and month, with units, total and status (*Waiting for the bills*, *On the bills*, *Cancelled*); charges not yet billed can be cancelled.
- *How this bill is worked out* counts charges debited at once under *Charged*.

### Notes
- Once on a bill (or debited), a charge is part of the unit's dues like any other: unpaid, it is in the arrears and attracts penal interest as the bills do.

---

Version 3.30.0 is ready: you can now add the ₹6,500 deemed conveyance fee and the legal notice expenses to individual units. A new test suite (15 checks) and all 28 earlier suites pass, but only on test data, so nothing has been charged to your live units yet.

**Where:** Bills → **Charges to recover from units**. The committee and the Accountant can use it.

**1. The ₹6,500 deemed conveyance fee (notice dated 15 October 2026)**

1. Choose the head **Deemed Conveyance Legal Fee**. The description fills itself in: "Deemed conveyance legal-process fee (notice dated 15/10/2026)".
2. Type 6500 and press **Put it for all units shown**. Clear the amount for any unit that shouldn't pay.
3. Choose **On the bills of December 2026**. October and November are already billed, so the form won't accept an earlier month.
4. On the December bill, each unit gets a separate line, "Deemed Conveyance Legal Fee ₹6,500". The description appears on the "How this bill is worked out" page.

**2. Expenses for particular units (legal notice, post, printing, stationery, xerox)**

1. Choose the head **Legal Notice & Recovery Expenses** and describe what it was for, for example "Final notice 25/11/2026: registered post, printing and copies".
2. Type the amount against each unit. Or pick a recovery notice you prepared, and its units get the same amount each, e.g. ₹350.
3. Choose either **on the next bill** or **debit the account now** with a date. Debiting now updates the balance immediately and shows in the member's statement; it then appears in the arrears on the next bill.

**Other points**

- **Other heads:** Cheque Return Charges, Penalty (limited to ₹5,000 a year per member under Bye-law 165) and Any Others Charges.
- **Cancelling:** charges waiting for a bill are listed with their totals and can be cancelled until the bill is made.
- **Interest:** once billed or debited, a charge is part of the unit's dues. If it stays unpaid, it attracts penal interest like everything else, which fits the October notice saying interest may be levied on overdue charges. If the fee should never attract interest, tell me and I'll keep it separate.

Your notice lists A 100, C 100 and D 202 as "Not listed" but still shows ₹6,500 for them, and keeps a provisional 66th unit. Untick any unit before saving if the committee hasn't confirmed it.

---



### Rules
- `billAdjustments`: besides the committee's interest on past arrears, the committee or *corrections* create charges of the heads above (with a description of up to 200 characters, amount up to ₹10,00,000, only for a month after the last billed) and cancel them while not yet billed.

### Tested
- New suite t330 (15 checks): heads and month, conveyance description, ₹6,500 for all units, one left out, added to December's bills, listed; ₹350 for the units of a notice, debited at once (ledger kind *charge*, balances up); cancelling; penalty limit; a billed month refused; the Accountant can add; view-only staff can't; the bill shows the fee on its own line and the calculation page its description. All earlier suites pass.

---

## [3.29.0] – 2026-11-25 – Payments reported by members, verified by the Treasurer / Accountant

### Added
- **Member page → Paid maintenance? Tell the Society.** Any approved member of the unit — owner, family member or tenant (also with basic access) — reports a payment: date, amount, how (NEFT, IMPS, UPI, cheque, cash deposit in the bank, demand draft), UTR / transaction / cheque no. (required except for cash), from which bank / account, paid by, against which bill (optional), note, and the **proof** (screenshot, bank slip or statement; photos or PDF, up to 3, kept in the unit's Drive folder *Payments reported*).
  - The Society's mailbox is emailed at once (to check the bank) and the member gets an acknowledgement. It is **not** in the balance until verified.
  - The member's list shows each report: *Waiting for the Treasurer to check the bank*, *More details needed* (with the question; *Add details* sends it back with more proof), *Verified* (receipt no., with a link to it), *Not found in the bank* (with the reason). Waiting reports can be changed or withdrawn. Members with the unit's full account also see reports made by others of the unit (e.g. the owner sees the tenant's).
- **Accounts → Payments → Payments reported by members** (those who record payments, e.g. the Treasurer and the Accountant; the box opens with a red count when something is waiting).
  - Each report with the proof (*Proof*), the reference, bank and who paid.
  - **Verify…**: the payment form filled from the report (correct the date or amount to what the bank shows); a warning when a receipt with the same reference, or the same amount within 5 days, is already recorded for the unit; *I have found this amount in the Society's bank statement* must be ticked; then the receipt is made as for any payment (balance, ledger, interest cleared first, public dues), linked to the report (`claimId`), and the member is emailed the receipt number (the Society copied).
  - **Ask for details** (the question is emailed and shown to the member) or **Not found** (the reason is emailed).

### Rules
- `paymentClaims/{id}`: created by an approved member of the unit for themselves (status *submitted*, amount, date, mode, reference, up to 5 files, server time); read by the member who made it, the unit's members with full access and the team with *view*; the member changes or withdraws it while it is waiting or answers a question; those who record payments set *verified* (only with the receipt no.), *rejected* or *query*. Never deleted.

### Drive script (version 16)
- Member uploads of kind `payment` (*Units › wing › unit › Payments reported*); `paymentClaim` (member: emails the Society and acknowledges, once per round); `claimDecision` (record payments: emails the member the outcome, Society cc, once per decision); proofs open for the member (`memberFetch` with `claimId`) and the team (`fetch` with `claimId`).

### Tested
- New suite t329 (22 checks): tenant reports (reference and proof required; proof uploaded as *payment*; Society told), listed as waiting; owner sees it, can't change it; Accountant sees it with a count, opens the proof, asks for details (emailed); member adds details (round 2, two proofs, Society told again); verify window filled, no false duplicate, bank check required, receipt made (balance down, linked), member emailed; member sees *Verified* with the receipt; a report matching an existing receipt is flagged and marked not found; a watchman sees nothing.
- 11 new Drive script checks (191 in all). All earlier suites pass.

---

## [3.28.0] – 2026-11-25 – Recovery notices, pausing the website, library categories, copies of member emails

### Added
- **Bills → Demand / recovery notices.** The Society's bilingual notice (Marathi page, English page, as sent on 17/01/2026 and 22/10/2026), filled in for every unit with dues and printed as one set per unit: **notice (Marathi) + notice (English) + the unit's bill + How this bill is worked out**.
  - Form: subject (English / Marathi; default *Final Recovery Notice – Outstanding Society Maintenance Dues* / *थकित सोसायटी मेंटेनन्स भरणा – अंतिम वसुली नोटीस*), letter date, reference (the unit is added: `SSSCHS/MAINT/RP/2026-27/003/C101`), the month whose bills are enclosed, days to pay (7), minimum dues, the earlier notices mentioned (default the 1st Demand Notice of 17/01/2026 and the 2nd of 22/10/2026, by Registered Post), the interest clause in English and Marathi (built from the rate periods: **18% per annum from 13/04/2013 and 12% per annum from 01/07/2026**, replacing the 21% of the earlier letters), and who signs (default the Chairman from the website's committee list, with mobile).
  - *List the units with dues* shows every unit whose dues today are at least the minimum, with the bill to be enclosed (or *no bill for this month*); untick any; *Prepare the notices* saves them (`noticeRuns/{id}`), with each unit's dues today as the amount (and, when something was paid after the bill, *less ₹… received after the bill*).
  - Each prepared set: **Open all (one PDF to print)** for posting, and **Open / save PDF** per unit (`print.html?notice=<id>&unit=<unit>`). Shops say *Shop / दुकान*, offices *Office / ऑफिस*, flats *Flat / फ्लॅट*. The English letter gives the amount in words.
  - After posting: type the **Registered post numbers** and *Save*; **Record in the correspondence register** adds one outward letter per unit (OUT/2026-27/…, mode *Registered post*, reference and post number, the unit linked), so each unit's file lists the notice.
- **Website → Pause the website (emergency).** Visitors and members (website and app) see only a *Website under maintenance* page, in English and Marathi, with an optional *expected back by* date and the Society's contacts. Nothing is deleted; bills and backups carry on; the accounts page keeps working, with a red bar; signed-in committee and staff still see the website with a red bar. **Resume the website** ends it. Stored in `public/status` (*website* permission).
- **Library:**
  - New categories: *Application sent / received*, *Letter sent / received*, *Scanned copy*.
  - **Move to another category:** tick documents (or all shown) → *Move to* → *Move*; changing the category in *Edit* does the same. The file is moved to the matching Drive folder too (storage script 15; with an older script only the website's category changes, and the page says so).
  - **Public / private:** each entry's *Public* / *Private* button switches it in one click (with its words, so search follows); *Make public* / *Make private* for the ticked ones.
- **Emails to members copy the Society:** invitations to pre-registered members, reminders and the other *Email* buttons open the mail with **cc sunshreesuntec@gmail.com**; emails sent from the Society's account by the storage script are copied to it too, so every email to a member is on record in the Society's mailbox.

### Rules
- `public/status`: written with the *website* permission (read by everyone, like the rest of `public`).
- `noticeRuns`: read with *view*; prepared and updated with *generate bills* or by the committee; deleted by the committee.

### Drive script (version 15)
- `libraryMove`: moves a library file to its new category's folder (only files kept in the Library, only the entry's own file). Member emails (`memberMail`) cc the Society's address.

### Tested
- New suite t328 (24 checks): new categories, ticking and moving (with the Drive move), one-click private with its words, bulk public, move with an older script, cc on member emails, pausing (accounts page banner; visitor and member see only the maintenance page in both languages; committee sees the website with the bar; resuming clears it for visitors), notices (defaults with 18% / 12%, earlier notices, signer; units listed; prepared; Marathi and English pages filled in; one set = Marathi, English, bill, calculation; all units in one document; shop wording; no bill → notice only; registered post numbers; recorded in the correspondence register).
- 5 new Drive script checks (180 in all). All earlier suites pass.

---

## [3.27.0] – 2026-11-25 – "How this bill is worked out": a second page with every bill

### Added
- **A second page printed with each bill** (`print.html?bill=…`, opened from the member page and the accounts page), for members who ask how the bill and its arrears are calculated:
  - **The sum:** arrears (balance before this bill) + this month's charges = total payable by the due date.
  - **1. Your unit, as recorded:** premises, occupancy, carpet area, water inlets, vehicles, construction cost (if recorded), lift, and whether charges follow the General Body's rates or the 2026 Rules' cost sharing, with the Society's basis note.
  - **2. This month's charges:** each head with how it is worked out (e.g. *₹2.1 per sq ft × 950 sq ft*, *equal share among 61 units using water*, *0.25% p.a. of construction cost*), or *rate fixed by the General Body*; lift costs shared by the units served.
  - **3. Penal interest:** this month's interest and its base, why it is simple (never on interest already charged), and the rates fixed by the General Body with their dates and the legal ceilings.
  - **4. Arrears, how they built up:** year by year (April–March) from the first record — audited years 2011-12 to 2017-18, Tally, these accounts — brought forward, charged (with the interest in it), paid, other entries (opening balances, corrections, differences between the records), carried forward, ending at the arrears on the bill; the last payment before the bill and the payments in the 12 months before it; the latest 12 entries with a running balance. Entries recorded after the bill was made (e.g. a payment entered later with an earlier date) are left out, as they were not in the bill; if the figures still differ, the page says by how much and why.
  - Contact line: questions or corrections within 7 days, quoting the bill number; payments after the bill date appear in the next bill.
- **Toolbar box** *With "How this bill is worked out"*: ticked for one bill (untick to print the bill alone); for *Print all bills* of a month it is unticked, and ticking it reloads with the page after every bill (`&explain=1`; it reads each unit's whole account, so it takes longer).

### Notes
- Read from the same records as the member's statement (`units/{id}/ledger`, the unit's Tally history and audited years, the unit's bills); nothing new is stored. No rules or script changes.

### Tested
- New suite t327 (13 checks): the sum, the unit, charges with their workings, interest and rates, the year-by-year table from Tally to this bill adding up exactly, a payment entered after the bill left out, this bill's own entry left out, last payment and 12-month payments, running balance, hiding the page, month print without and with the pages, a unit with nothing overdue. All earlier suites pass.

---

## [3.26.0] – 2026-11-24 – Website settings: backup and restore

### Added
- **Settings → Website settings: backup and restore** (committee). The website's configuration as one small file:
  maintenance charges, billing and interest and the Society's details (`settings/billing`); website content (`public/site`); member portal agreement in force and every published version; staff agreement; staff access by role; committee undertaking; committee register details; reminder and invitation messages; membership transfer lists; full backup schedule; Google Drive connection; the Library catalogue (entries with their guides and the words read from each document — the documents stay in the Drive). Dates are kept as dates.
  - **Back up the settings now** saves the file in the Drive (*Backups / Settings*, `Website settings 2026-11-24 2318.json`); **Download the settings file** saves it on the computer (keep it private).
  - **Restore from the Drive…** (choose a saved copy) or **Restore from a file…** first **compares** each item with the website now: *Same*, *Different* (naming the fields that changed; changes only in who / when last saved are ignored), *Not on the website now*, *Only on the website now* (left as it is), *published version can't be changed* (agreement versions are permanent), and *from another site* for the Drive connection (never restored from another Firebase project, so a test site can't be connected to the Society's Drive or the reverse).
  - Tick what to put back (or all that differ) → **Restore the ticked items**. The present settings are first saved in the Drive as *before restore* (or downloaded if the Drive can't be reached), so a restore can be undone the same way.
  - Copying the settings to the test site: download on the real site, *Restore from a file…* on the test site.

### Drive script (version 14)
- `settingsBackup`, `listSettingsBackups`, `readSettingsBackup` (committee): settings files in *Backups / Settings*. Without version 14 the download and restore-from-file still work.

### Rules
- No change (the committee writes settings, the website content and the library; published agreement versions stay permanent).

### Tested
- New suite t326 (18 checks): download (name, items, library words, dates; no records), save in the Drive, compare a file from another site (different with fields, missing, only on the website, permanent, Drive connection skipped), only differing items tickable, restore (only ticked; others untouched), the before-restore copy saved first, undo from the Drive copy with dates kept, wrong file refused, old storage script.
- 7 new Drive script checks (176 in all). All earlier suites pass.

---

## [3.25.0] – 2026-11-24 – Scheduled full backups and disaster recovery

### Added
- **Full backups of all the website's data, on a schedule.** Every document in the database (units, bills, receipts, ledgers, members, staff, expenses, correspondence, documents' records, library, settings…) and the list of sign-in accounts, saved by the storage script as one compressed file in the Society's Drive (*Backups / Full*, `Full backup 2026-11-25 0200.json.gz`). Values are kept exactly as stored (dates, numbers, references), so they come back unchanged.
  - **Schedule (Settings → Full backups):** every day or every week (day), at an hour (India time), keeping daily copies 7–90 days; the copy of the 1st of each month is always kept. The script checks every hour and backs up when due; *Off* stops it.
  - **Status:** last backup (when, scheduled or by whom, records, sign-in accounts, size), a failed attempt in red with the reason (also emailed to the Society), a warning when no backup is newer than the schedule, the last restore, and whether the storage script needs updating.
  - **Back up everything now** (committee).
- **Restore (committee).** *Show the backups…* lists them (newest first, monthly copies marked); *Restore…* shows what a backup holds (records per part, sign-in accounts) and puts back **only what is missing** (deleted records return; nothing existing changes), or **everything as it was** (type RESTORE; changes made since are undone, records added since are kept), for all parts or only those ticked. Every restore is recorded and emailed to the Society.
- **Disaster recovery without the website** (storage script editor): *restoreLatestBackup* puts back what is missing from the newest backup; *restoreLatestBackupEverything* rebuilds a new Firebase project from it, including the sign-in accounts with the same ids, so members and staff keep their records. Can be practised in the test copy.
- The unit file's *not saved yet* note explains when a unit's own copy is made and that all units are in the full backup.

### Drive script (version 13)
- `fullBackup`, `listBackups`, `restoreBackup` (committee); `scheduledBackup` (hourly trigger), `setupBackups`, `restoreLatestBackup`, `restoreLatestBackupEverything` (run from the editor). These use the script owner's own Google access to the Firebase project (sunshreesuntec@gmail.com must be its Editor), not a member's sign-in: reading everything needs it. New permissions in `appsscript.json`: database, sign-in accounts (Identity Toolkit) and triggers.
- Status in `settings/fullBackup`; the schedule in `settings/fullBackupConfig` (committee; read with *view*, as other settings).

### Rules
- No change.

### Tested
- New suite t325 (15 checks): status before the first backup, defaults, weekly schedule saved, back up now, list, restore window, RESTORE required, restore request, status with a backup, a failed one, an old storage script.
- 27 new Drive script checks (169 in all): committee only, everything backed up with typed values and accounts, compressed in Backups/Full, owner access with the project for quota, status, paging past 300 records, setupBackups (one trigger), schedule (hour, done today, weekly, off), pruning (monthly kept, Bin), list, restore info, missing-only, everything with RESTORE for one part, restore recorded and emailed, files outside the folder refused, staff refused, rebuild in a new project with sign-in accounts, no access (clear error and email), accounts unreadable (documents still saved).
- All earlier suites pass.

---

## [3.24.0] – 2026-11-24 – Bye-law forms in the Library, with a plain guide to each and "Which forms do I need?"

### Added
- **The model bye-law forms (appendices) in the Library**, kept in the Society's Drive (*Library › Statutory form*), each with a **guide**: form number (and the other number it goes by), what it is for in plain words, the bye-law / section / rule it is under, who signs it, stamp paper, what to attach.
  - **Library → Add the bye-law forms (appendices) in one go:** choose the PDF files; each recognised by its file name (*appendix-15.pdf*, *appendix-20-1.pdf*, *model-bye-laws.pdf* …) is listed in bye-law order with its number and law, then uploaded, given its title, number, keywords and guide, made public (optional), and its words read for the search. Files already in the library are skipped; files not recognised are shown, to add with the usual form.
  - **Catalogue** (`forms.js`): Appendices 1–19, 20(1) and 20(2), 21–29 (29 = Form M-20), the model bye-laws, the MCS Rules 1961 and the housing society election rules. The numbering of Appendices 2–10 and 28 differs between editions; the other number is shown (e.g. *Appendix 4 — Appendix 3 / Form No. 3 in the 2014 booklet*), and searching either finds it. Appendices 20(1) and 20(2) (*Form 20A / 20B*) are taken from the model bye-laws.
  - **Library add / edit form:** a *Guide for members* section: choose the bye-law form (fills the guide and, if empty, the title, description and category) and change any of it.
- **Library page → Which forms do I need?** Ten tasks: death with a nomination, death without a nomination, sale / purchase, direct membership, joint (associate) member, letting the flat, nomination, resignation, more than one flat, elected to the committee. Each shows the law it is under, a short explanation, the forms in order (with *if …* where a form applies only sometimes), each with its guide and *Open the form* (members) / *Sign in to open* (visitors) / *Issued by the Society* / *Ask the Society office*, and what else is needed. Every library entry that is a form shows its guide too.
- **Transfers: the lists use the forms.** Each standard document that is a bye-law form knows which (*Form No. 15* → Appendix 15; *Form No. 3* and *Form 03* → Appendix 4; *Form No. 4* → Appendix 5; *New nomination* → Appendix 14; *Appendix 13*; *Form 20A / 20B* → 20(1) / 20(2); *Form 21-1* → 21; *Form 23*; *Form 25* → 25; *Form 26* → 26), so its blank form is found in the Library without linking it by hand. **Use the bye-law forms from the Library** (checklist editor) links them all at once and lists the forms not yet in the Library; saving asks whether to use the new links in the transfers in progress too (what was received stays as it is). The case window and the member page show each form's number, law, signer and stamp paper; the member's lists also explain each in plain words and point to *Which forms do I need?*.

### Not linked automatically
- *Affidavit on ₹500 stamp paper, notarised* (death) and *Undertaking from the prospective member on ₹500 stamp paper* (sale) are the Society's own formats, not appendices: add the Society's format to the Library (category *Society's own format*) and link it in the checklist.

### Rules
- No change: `libraryDocs` carries the new `formKey` and `guide` fields under the existing rules.

### Tested
- New suite t324 (26 checks): recognising the files (order, other names, already there, unknown), adding three real forms (Drive category, title, number, guide, public, words read), guide line and search by *Form 20A*, editing a guide; linking the transfer lists (replacing links to the Rules by hand, unlinked documents left alone, missing forms listed), saving and updating the transfer in progress, the case and member page showing each form's guide and opening the blank form; *Which forms do I need?* for a member (order, law, missing ones) and a visitor (sign in to open, issued by the Society).
- All earlier suites pass.

---

## [3.23.0] – 2026-11-24 – Membership transfer documents (death and sale), tracked unit by unit

### Added
- **Accounts → Transfers.** The set of documents a unit must submit when a member dies (transmission) or the unit is sold (transfer), tracked for every unit.
  - **Tracker:** every unit with its transfer: kind, outgoing → new member, *n of m* documents with a bar, what is *still to come*, status (*In progress* / *Completed*, with the committee resolution and the share certificate endorsement). Filters: *in progress*, *completed*, *units with no transfer recorded*, *all units*; search by unit or name. The summary counts each.
  - **A transfer (case):** started per unit (*Start…*) as *sale* or *death*, with the outgoing / deceased member, the new member(s) or nominee(s) / legal heir(s), date of the deed or of death, deed registration no., possession date, share certificate no. Each document gets a *received on* date or *not needed*, and its scan (PDF or photos, kept in the unit's Drive folder *Membership transfer*; a scan marks the document received today if no date is entered). Then the committee resolution (date, number / meeting), share certificate endorsed on, new certificate no., notes. **Save and mark completed** asks first if documents or the resolution are missing; **Cancel this transfer** keeps it on record as cancelled. A completed case is read-only.
  - **The standard lists** (as the Society's circular): *death* — Form No. 15; affidavit on ₹500 stamp paper, notarised; Form No. 3 and Form No. 4 on ₹100 stamp paper; new nomination form; application to the Managing Committee; copies of the previous nomination and the death certificate; the original share certificate; ₹100 cheque for the new membership. *Sale* — submission letter; possession letter; Appendix 13; resignation by the outgoing member; Forms 20A, 20B, 21-1, 23; Forms 25, 26 and 03 on ₹100 stamp paper; undertaking from the prospective member on ₹500 stamp paper.
  - **The checklists and their formats** (committee): rename, add or remove documents, change the notes, and link each to a **blank form in the Library** or to one of the **Society's letters**. Transfers already started keep the list they started with (`items` saved in the case).
  - **The Society's letters**, printed filled in with the case's details (blanks to write in for the rest) and the list of enclosures: *application to the Managing Committee for transmission*, *submission of documents for transfer*, *letter of possession*, *resignation from membership*. The numbered forms and the documents on stamp paper are the formats prescribed under the bye-laws: keep the Society's blank copies in the Library and link them.
- **Member page → Membership transfer documents.** Members see their unit's transfer: each document received (date), not yet, or not needed, its scan, the committee resolution and the certificate endorsement. Below, both lists with their formats (*Blank form* from the Library, *Print letter* filled in with their unit and name). With no transfer recorded, a note asks them to submit the list that applies if the share certificate is not in their name.

### Rules
- `units/{id}/transfers/{caseId}`: read by those who see unit files (*view*) and the unit's approved members; created and changed with *maintain unit files* (`unitRecords`); deleted by the committee only.
- `settings/transferChecklists`: read by approved members and the team; written by the committee (as other settings).

### Drive script (version 12)
- Unit records of kind `transfers` keep their scans in *Units › wing › unit › Membership transfer*; members can open their own unit's transfer scans (`memberFetch` with `record: 'transfers'`). The unit backup includes transfer cases.

### Tested
- New suite t323 (28 checks): tracker, start a sale case from a unit with no transfer, death list and labels, letters printed filled in, received / not-needed / scan (uploaded as kind *transfers*, backed up), still-to-come, checklist editor (library link, note, new item; the case keeps its own list), completion with resolution and endorsement, completed read-only, view-only staff, watchman without the tab, member view (own unit only, scan via *memberFetch*, blank form from the Library, application letter with their name).
- 6 new Drive script checks (142 in all); all earlier suites pass.

---

## [3.22.0] – 2026-11-24 – Pre-register members by email; agreement declaration instead of tick boxes

### Added
- **Members → Pre-register members by email.** For owners, family members and tenants whose email is in the Society's records but who don't register themselves.
  - **What the committee enters:** the unit, name, relation, their Google email and (optionally) the mobile, plus whether they see the unit account. This is saved as a pre-registration (`memberInvites/{email in lower case}`).
  - **Their first sign-in:** when they sign in on the member page with Google **using that email** (verified), they see *Welcome to the Society portal* with the unit and relation as entered. They only confirm their name and mobile, under a written declaration, and are **approved at once** (`users.invited`, decided by the committee member who pre-registered them).
  - **Then the agreement:** they go straight to the member portal agreement.
  - **The list:** pre-registrations show as *Waiting for their first sign-in* or *Signed in (agreement accepted / not yet)*, with **WhatsApp** / **Email** invitation buttons (*your access … is ready: sign in with Google using this email*, recorded) and **Cancel** / **Reopen**.
  - **Checks:** the email must not already be a member, a waiting request or a used pre-registration.
  - **Approved list:** pre-registered members are marked *Pre-registered*.
  - **If the email doesn't match:** someone signing in with another email, or whose pre-registration was cancelled, registers and waits for approval as before.
- **Reminders → Not registered:**
  - **Pre-register** on each contact with an email in the unit file (relation taken from the record: tenant, joint member, family, otherwise owner);
  - **Pre-register everyone listed with an email** at once;
  - pre-registered contacts are marked and get the *access is ready* message instead of *please register*.

### Changed
- **Member portal agreement: no tick boxes.** The four statements are printed as a **Declaration** above the signature ("By typing my full name below and pressing I accept, I declare that: …"). Typing one's name and pressing *I accept* accepts the agreement and the declaration. The statements are saved with the acceptance as before (`confirmations`), and the PDF copy says *Declaration accepted* (Drive script version 11).
- The standard agreement text says acceptance is by reading the agreement with its declaration and typing one's name. To show this wording to members, publish it as a new version (Members → Member portal agreement).

### Rules
- `memberInvites`: created and changed by *approve members* (email as id, valid relation and access); read by the person signing in with that verified email, who marks it *used* once their record exists. Never deleted.
- `users`: besides a pending request, a person with an open pre-registration for their verified email may create an **approved** record that matches it exactly (unit, relation, access, decided by), with a valid mobile and server time.

### Tested
- New suite t322 (20 checks): pre-register by form (email in lower case, access from the relation); invitation text and record; existing member and bad email refused; from the unit files one by one and all at once (joint member → joint owner, no email skipped); the first sign-in confirms the mobile (typed with +91 and spaces), is approved as entered, the pre-registration is used, then the agreement with the declaration and no tick boxes, accepted by typing the name; the committee sees *Signed in, agreement accepted*; cancelling; a cancelled or unverified email gets no shortcut.
- t313 and t3153 updated for the declaration; 1 new Drive script check (136 in all).

---

## [3.21.0] – 2026-11-21 – Test copy: try every role without touching the Society's records

### Added
- **Test copy of the website** (`TESTING.md` explains the set-up and has a checklist from registration to daily use for owner, tenant or family, Accountant, watchman and committee).
  - **The switch:** `firebase-config.js` may also hold `testFirebaseConfig` (a separate Firebase project) and `testSites` (addresses of a test website).
    - **Where it applies:** the test project is used only on this computer (`localhost`, `127.0.0.1`) or on those listed addresses.
    - **Where it never applies:** sunshreesuntec.com, www.sunshreesuntec.com, the Android app, or any other address.
    - **Without a test config,** nothing changes anywhere.
  - **Red banner:** every page of the test copy, printed receipts included, shows a **TEST COPY (project)** banner, and the page title starts with *TEST ·*.
- **Drive script version 10: a test copy of the script.**
  - **Recognised by:** Script property `TEST = yes`, or a `ROOT_FOLDER` named *TEST…*.
  - **Emails:** it marks every email with **[TEST]** in the subject and a red note at the top. The script's version answer says `test: true`.
  - **Folders:** a test copy uses a remembered folder only if it carries the test folder's name, so a copy made from the real script can never write into the Society's real records folder.
  - **The real script's behaviour is unchanged.** All emails now go through one helper.

### Fixed
- **Agreement copies retried too often.** A member's visit retries an agreement copy that wasn't emailed. A retry that finished now isn't repeated for 10 minutes, even if the page is reloaded; an interrupted one is tried again. The Drive script already sent each copy only once, so no duplicate emails went out.

### Tested
- New suite t321 (8 checks): test project and banner on localhost (website, accounts page, receipts) and on a listed test site; never on sunshreesuntec.com or www, or an unlisted address; nothing without a test config.
- 5 new Drive script checks (135 in all): [TEST] emails, version answer, a test copy that remembers the real folder still writes only to its TEST folder, and the real script unchanged.

---

## [3.20.0] – 2026-11-20 – Rules, GRs and forms library, searchable by the words inside

### Added
- **Website → Library** (new menu item): the Society's collection of Acts, Rules, bye-laws, Government Resolutions, circulars and orders, court judgments, statutory forms, application formats (member → Society, member → Registrar / DDR) and the Society's own formats.
  - **Search:** type any words and every word must be found as the start of a word.
    - **Where it looks:** the title, number or reference, issuer, date, keywords and description, **and the words inside the documents**, in English or Marathi.
    - **Matching:** Marathi numerals match typed numbers (१९६० = 1960), and ligatures match plain letters.
    - **Results:** say *Found inside the document* with a hint to use Find (Ctrl + F) after opening. Filters for the kind of document and the language.
  - **Visitors** see the entries marked public, each with its **Official source** link where given.
  - **Members (approved) and the team** see every entry and **open the Society's copy** from the Google Drive.
- **Accounts → Library** (committee, and staff with the new permission *Rules, GRs and forms library*; given by default to the Society Manager and Office Assistant).
  - **Adding:** add a document from a file (PDF, Word, Excel, text or photo, up to 30 MB) or **save a copy from its official web address** (for example a PDF on the Co-operation Department's website), with:
    - title and category;
    - issued by, number / reference, date and language;
    - keywords (English and Marathi) and what it is about;
    - official source;
    - **Public** (listed to everyone) or members and team only.
  - **Storage:** files go into the Society's Google Drive under *Library › category*.
  - **Search inside:** the **words inside each PDF** are read in the browser when it is added (pdf.js 4.10, Mozilla, Apache-2.0, kept with the site in `assets/vendor/pdfjs`). They are saved as a word list with the entry (`libraryDocs/{id}/index/{n}`), so documents are found by what they say. Scanned PDFs have no words, which the list shows, so add keywords for them.
  - **Managing:** **Edit** (details, public or not, replace the file) and **Read words again**. **Remove** takes the entry off the website; the file stays in the Drive and it can be restored. Search the library, filter by category, show removed entries.
- **Drive script version 9:**
  - uploads of kind `library`;
  - `libraryFromLink`: the script fetches the document from its web address, refuses web pages and login pages that aren't the document, and returns the bytes so the words can be read;
  - opening a library document for any team member or approved member, checked against the entry.

  No new Google permission is needed (fetching web addresses was already allowed).

### Rules
- `libraryDocs` and their word lists: readable by everyone when public, otherwise by approved members and the team. They are written by those with the *library* permission and never deleted (removed by marking; a removed entry is never public).

### Notes
- The extraction keeps both the text as written and as spaced, and puts the Devanagari vowel sign ि after its consonant, because PDFs store it in drawing order. Some PDFs made with old Marathi fonts give no usable text; keywords cover those.
- If *Access by role* was saved before, tick *Rules, GRs and forms library* for the Society Manager and Office Assistant there. Saved role settings take precedence over the new defaults.

### Tested
- New suite t320 (22 checks): a real two-page PDF with English and Marathi text made in the test; words read (including सहकारी, नियम); copy from a link; a members-only Word format; admin search by words inside; a visitor sees only public entries and finds “bond M-20” inside and a Marathi GR number; a member sees all, finds by keywords and opens; remove, restore, edit, make public; staff without the permission don't see the tab.
- 15 new Drive script checks (130 in all).

---

## [3.19.0] – 2026-11-20 – Managing Committee: make a member a committee member, committee undertaking, M-20 bonds

### Added
- **Accounts → Staff → Managing Committee.**
  - **Make a member a committee member:** choose an approved member, their post (Chairman, Vice-Chairman, Secretary, Joint Secretary, Treasurer, Committee member), the date they took office and optionally the date the term ends. No Firebase console needed.
    - It creates their committee login (`admins/{uid}` with `role`, `unit`, `tookOfficeOn`, `termEnds`, `postHistory`). They sign in to the accounts page with the same Gmail.
    - For a post one person holds (all but Committee member), it asks before making the present holder a Committee member.
    - *Also show them on the website's Committee page* keeps `public/site.committee` in step.
  - **The committee list:**
    - each member's post (the Chairman, Secretary and Treasurer are marked as deciding applications to view the accounts);
    - their term;
    - whether they accepted the current undertaking, with a copy;
    - their M-20 bond: *Due by … (n days left)*, *Overdue since …*, *Received … (stamp paper ₹, no.)* with **Open scan**, or *Date of taking office not recorded*.
  - **Actions on each member:**
    - **Edit** changes the post or the dates.
    - **End term…** asks for the reason and date, ends committee access at once, and moves them to *Past committee members*. It can remove them from the website, and nobody can end their own term.
    - **WhatsApp reminder** / **Email reminder** ask them to accept the undertaking and hand over the M-20 bond by the due date.
- **Committee undertaking.** Every committee member accepts it at their first sign-in to the accounts page, and again when a new version is published.
  - **What it contains:** the member's details and M-20 due date; their access (every permission, including the committee-only ones); the **responsibilities of their post**; and ten undertakings. These cover acting within the Act, Rules, bye-laws and resolutions, the M-20 bond and joint responsibility, decisions only in meetings, declaring personal interest, confidentiality (DPDP Act 2023), no personal gain or gifts, paying one's own dues, attending meetings and training, being recorded, and handing over at the end of the term.
  - **Records:** each acceptance is kept permanently with the exact text accepted (`committeeUndertakings`). A PDF goes into the Drive (*Committee › Undertakings*) and is emailed to the member with a copy to the Society (Drive script version 8, `committeeUndertaking`).
  - **Editing:** the committee edits the text, including each post's responsibilities, and publishes new versions (`settings/committeeUndertaking`).
  - **If the acceptance can't be saved** (for example the new rules aren't published yet), *Continue for now* lets the committee member work for that visit instead of being locked out.
- **M-20 bonds** (Rule 58A, MCS Rules 1961: bond in Form M-20 on stamp paper within 15 days of taking office, kept by the Secretary).
  - **M-20…** records the date received, the stamp paper value and number, and the scan of the signed bond (Drive: *Committee › M-20 bonds*), with who recorded it (`admins.m20`).
  - **Banner on the accounts page:** each committee member sees their own bond's due date until it is recorded. The Chairman and Secretary also see whose bonds are still due, and when the Registrar is still to be informed.
- **Informing the Registrar:** the date the committee was formed, the date the Registrar was informed (due 15 days later), the letter reference and a copy of the letter (Drive: *Committee › Registrar intimation*; `settings/committeeRegister`).
- **Drive script version 8:**
  - `committeeUndertaking`;
  - uploads of kind `committee` (`m20`, `registrar`);
  - opening an M-20 scan, an undertaking PDF or the Registrar letter (committee only, checked against the record).

### Changed
- The *Staff* list no longer repeats committee members; they are in *Managing Committee* above it.

### Rules
- `committeeUndertakings`: the committee member creates their own acceptance (fixed fields, server time, signed name 3–100 letters). Only the PDF and email fields are added later, and it is never deleted.

### Tested
- New suite t319 (28 checks):
  - the undertaking before work;
  - the banner about an overdue bond;
  - making Saji Rajan Panikkassery (C 503) Chairman, with the previous Chairman becoming Committee member and the website list updated;
  - the reminder;
  - recording and opening an M-20 bond;
  - ending a term (not one's own);
  - informing the Registrar;
  - a new undertaking version asked again;
  - the new Chairman deciding applications;
  - staff not asked.
- 11 new Drive script checks (115 in all). The older suites' committee fixtures now carry an accepted undertaking.

---

## [3.18.0] – 2026-11-20 – Who sees other units and the Society's accounts; applications to view the accounts

### Changed
- **Other units' maintenance amounts are no longer shown to every approved member.**
  - On *Maintenance dues → Show amounts*, a member now sees **their own unit's amount**; other units stay masked.
  - A member sees all units only when given **Maintenance amounts of all units** (`users.seeAllDues`).
  - Committee and staff with *view* see everything as before.
- **The Society's audited accounts and documents are no longer shown to every approved member.** The audit file lists every unit's year-end dues, and the documents include audit reports.
  - A member sees them only when given **The Society's audited accounts and documents** (`users.societyAccounts`), optionally until a date (`users.accountsUntil`).
  - The permission comes either from an approved application or from the member window.
- **A member's own year-end figures still show without that permission.** Each unit now has its own audited year-end figures (`units/{id}/history/audited`), prepared automatically by the committee's page from the audit file whenever the audited years change, so a member's account history shows them as before.
- **Only the Chairman, Secretary, Treasurer or Accountant give or withdraw these two permissions.** The rules enforce it (`accessApprover()`). A staff member allowed to approve members can still edit everything else.
- **Wording:** *Can see* in the member window is now *Unit account* (sees the unit's bills, receipts and balance, or not, e.g. for a caretaker). The approval message no longer promises the Society's accounts.

### Added
- **Members' page → Society accounts → application to view the Society's accounts.**
  - The member ticks what they want to see (audited accounts and documents; maintenance amounts of all units), writes the purpose and accepts confidentiality.
  - The application (`accessRequests/{uid}_{time}`) is emailed to the Society with the reply going to the member, and the member gets an acknowledgement (Drive script version 7, `accessRequest`).
  - The member sees each application's decision, who made it and the reason. They can withdraw an application still waiting, and only one can wait at a time.
  - The page explains the member's right under Section 32 of the MCS Act 1960 and the bye-laws.
- **Accounts → Members → Applications to view the Society's accounts** (shown to the Chairman, Secretary, Treasurer and Accountant).
  - The Accountant's *Members* tab shows only this section.
  - **Decide**: tick what to give and for how long (until withdrawn, until 31 March, 3 months, 30 days or a date), then **Approve** or **Not approve**. Not approving needs a reason, which the member sees.
  - The member is emailed the decision with a copy to the Society (`accessDecision`). Decided applications are kept and listed.
  - Other committee members see the applications but can't decide them.
- **Member window → Beyond their own unit**: the two permissions and the end date, for approvers. The change is written to the member's history. The approved list shows *+ all units' amounts* and *+ Society accounts till …*.
- **Drive script version 7**: `accessRequest` (member) and `accessDecision` (approvers). Both build the email from the database record, and each is sent only once.

### Rules
- `private/dues`: *view*, or an approved member with `seeAllDues`.
- `auditYears`, `archiveDocs` (+ parts): *view*, or an approved member with `societyAccounts` (before `accountsUntil` if set).
- `users`: the view permissions change only by an approver. An approver may change only those fields, stamped with who and when.
- `accessRequests`: the member creates their own (fixed fields, own unit and email, 10–1,000-letter purpose) and may withdraw it while waiting. Approvers decide (approved / rejected, stamped). It is never deleted.

### Tested
- New suite t318 (26 checks):
  - each unit's own history is prepared;
  - a member sees only their own amount, and their own audited year-end figures without the audit file;
  - applying and the emails;
  - a non-approver can't decide;
  - the Accountant approves the audited accounts only, until 31 March;
  - the member then sees the accounts and may apply for all units;
  - the Chairman gives all units' amounts in the member window;
  - a tenant is refused with a reason, also on a phone.
- The Drive script checks rose to 104.

---

## [3.17.0] – 2026-11-19 – Who closed Google sign-in during registration

### Added
- **What the person typed is kept with their sign-in attempt.** When someone fills in *New here? Register* and presses *Continue with Google and send request*, the name, unit and mobile they typed are saved with the attempt (`signInLog.name`, `.unit`, `.mobile`). This includes when Google's window is closed or fails, and the redirect sign-in used on phones. A plain *Sign in* carries none.
- **Sign-in history** shows *Form: name · unit · +91 mobile* on those rows.
- **Tried but never registered** now also lists people who filled in the form and closed Google, by name, unit and mobile, with what happened:
  - **WhatsApp the steps**: a message to finish registering, by first name and unit;
  - **Call**;
  - **Email the steps** when the Gmail is known.

  Each follow-up is recorded (*Followed up: WhatsApp, date, who*). The person drops off the list once a request with that mobile or email exists.

### Rules
- `signInLog` accepts the optional `name` (100), `unit` (40) and `mobile` (digits, 15). `memberReminders.kind` accepts `unfinished`.

### Tested
- New suite t317 (9 checks).

---

## [3.16.0] – 2026-11-19 – Reminders and invitations

### Added
- **Members → Reminders and invitations**, with three lists:
  - **Agreement not accepted**: approved members who haven't accepted the current portal agreement.
  - **Not visiting**: no visit for 30, 60 or 90 days or 6 months.
  - **Not registered**: current owners and tenants with a mobile or email in the unit file (Members and Tenants records) who haven't registered. Units with someone already approved can be left out.
- **Sending a reminder:**
  - Each person has **WhatsApp** and **Email** buttons, which open a ready message on the committee member's own phone or computer.
  - Up to 25 at a time can be **emailed from the Society's account** (Drive script version 6, `memberMail`, about 100 a day).
  - **Copy for a WhatsApp group.**
- **Recording reminders:** every reminder is recorded (`memberReminders`). *Don't remind again within 7 / 15 / 30 days* hides those reminded recently. A request from someone invited is labelled *Invited (date)*.
- **The committee can edit the wording** of each message (`settings/memberReminders`).
- **Visits:** a member's visit is recorded at most once a day (`users.lastSeenAt`).

### Rules
- `users`: the member may update only `lastSeenAt` (server time).
- `memberReminders`: created by *approve members* (stamped), never changed; the committee may delete.
- `settings/memberReminders` is readable by *approve members*.

### Tested
- New suite t316 (24 checks), plus 7 Drive script checks.

---

## [3.15.3] – 2026-11-18 – Agreement copies that weren't emailed: shown and sent again

### Fixed
- **A failed agreement copy is no longer silent.** If the PDF copy of an accepted agreement couldn't be saved or emailed (for example the Drive script was an older version, or Google's email permission wasn't given), the reason is now kept on the acceptance record (`memberAgreements.emailNote`). The member's next visit tries again once.

### Added
- **Members → Approved members:** each accepted agreement shows *Copy emailed* or *Copy not emailed: reason*, with **Send copy now** / **Email copy again**.
- **Members tab warning:** when the Drive script in use is older than the website needs (it reads the script's version), or copies are waiting to be sent, with the steps to update the script.
- **Drive script `setup`** also asks for, and checks, the email permission (*Email permission: allowed. Emails left today: …*).

### Tested
- New suite t3153 (7 checks).

---

## [3.15.2] – 2026-11-17 – Maintenance exactly as the AGM of 25/01/2015; rate history for members

### Changed
- **Charges follow the AGM held on 25/01/2015 (minutes Ref. AGM-MOM/20150225 dated 25/02/2015), effective 01/04/2015**, as the Society's basis from then until today. Before, they followed an amendment of 07/07/2015.
  - Residential A & C: ₹1,300 + lift (C wing) ₹1,000 a year (unchanged).
  - **Residential used as commercial:** ₹2,000 + water pump ₹500 + lift (C wing) **₹500 a month**.
  - **D wing gym (D 201):** **₹3 per sq ft** + water ₹2,000. **D wing clinic (D 101 A & B):** **₹3 per sq ft** + water ₹1,000.
  - Shops: ₹1,000; with water tap + **₹500**; beauty parlour / pet shop / clinic / food shop / chicken centre + **₹900**.
- New in the categories: **₹ per sq ft** (maintenance = rate × carpet area; the fixed amount until the unit's carpet area is recorded) and **lift per month**.
- Settings: **Use the rates of the AGM of 25/01/2015** puts these rates in the table; nothing changes until *Save charges*. The default *Basis of charges* text names the AGM and the interest rates.
- Suggested interest periods: **18% from 13/04/2013** (members' meeting, effective April 2013), continued under the 2015 maintenance **to 30/06/2026**; **12% from 01/07/2026** with the same maintenance.

### Added
- **Members' page → Maintenance and interest as passed by the General Body:**
  - the rates of 01/04/2013 to 31/03/2015 (members' meeting of 13/04/2013: residential ₹1,000, used as commercial ₹1,500, commercial ₹600 / ₹700 with water tap, restaurants and others ₹900, 10% extra on rented properties, 18% per year beyond the calendar month);
  - the rates from 01/04/2015 (AGM 25/01/2015);
  - then the interest periods and references.

### Tested
- Per sq ft (D 201 with 650 sq ft → ₹1,950), the fixed amount without an area, lift ₹500 a month in C wing only, and yearly lift in April.
- 2 new browser checks: the AGM 2015 rates saved through Settings, and members see both rate tables. All suites pass: 273 browser checks.

---

## [3.15.1] – 2026-11-17 – Penal interest at 18% as resolved by the members (13/04/2013), 12% from 01/07/2026

### Changed
- The suggested rate periods now follow the Society's own resolutions:
  - **18% per year from 13/04/2013 to 30/06/2026.** Members' meeting of 13/04/2013, Ref. RES_PASSED/130413/002, item 9: *"For late payment i.e. beyond the calendar month, 18% extra would be charged per year"*. Penalty on defaulters confirmed at the AGM of 25/01/2015 (Ref. AGM-MOM/20150225).
  - **12% per year from 01/07/2026** (MCS (Amendment) Rules, 2026, Rule 106C-12(4)-6).
- *Interest on past arrears* starts by default in the month after the resolution (May 2013), which matches *beyond the calendar month*: each month's interest is on dues still unpaid from earlier months. It shows a warning when the months counted go back before April 2018, where balances are rebuilt from the audited year-end figures and the past committee's receipts.

### Tested
- The interest suite now runs at 18%: C 202 gets 15 months at 18% = ₹2,250 plus 4 months at 12% = ₹400, total ₹2,650; C 101 gets ₹900. The December bill charges ₹100 + ₹2,650 = ₹2,750. There are 2 new checks for the pre-April 2018 warning: 24 checks in all.

---

## [3.15.0] – 2026-11-17 – Penal interest by rate period (21% to 30/06/2026, 12% from 01/07/2026); interest on past arrears

### Added
- **Settings → Penal interest on arrears: rate periods.** Each rate (% simple per year) applies from its date until the next one starts, with its authority (AGM resolution, MCS Rules) shown to members.
  - *Fill in 21% to 30/06/2026, 12% from 01/07/2026* keeps the start date entered (the date of the General Body resolution that fixed 21%).
  - Legal ceilings are checked by date: 21% before 18/07/2026, and 12% from 18/07/2026 (MCS (Amendment) Rules, 2026, Rule 106C-12(4)-6). A rate above 12% running past 17/07/2026 is refused.
  - Monthly bills use the rate for their month, split by days when a month spans two rates. The bill line says which rate.
- **Reference documents for members** (same section): the notification, rule, article or resolution behind the rates. They are saved in the Society's Google Drive (*Reference documents › Interest on arrears*) and shown to signed-in members.
- **Bills → Interest on past arrears** (committee):
  - **The calculation:** for each unit, simple interest month by month from the ledger (the old Tally books joined to these accounts). It uses the balance at the start of each month, less interest already billed, × that month's rate ÷ 12.
  - **What's left out:** months whose bill already charged interest, months covered by an earlier calculation, and units in credit.
  - **Before charging:** a preview per unit (months, highest arrears, interest at each rate, total), each unit's months, and CSV downloads.
  - **Charging:** *Add to the bills of <month>* records **INT/2026-27/001** and one pending amount per unit, and saves a copy of the calculation in the Drive. The amount is charged on that month's bill (made on screen or automatically on the 1st) as part of *Penal Interest On Arrears*, with an explanation. It is kept out of later interest (simple interest only).
  - **Cancelling:** possible until the bills are made.
- **Members' account page → Interest on late payment:** the rates with their dates and authority, the reference documents, and the calculation for their unit month by month, with the bill it was charged on.
- **Printed bills:** the interest note now gives the current rate and the earlier one, e.g. *Simple interest @12% p.a. … (21% p.a. up to 30/06/2026), as fixed by the General Body under MCS Rule 106C-12(4)-6*.

### Changed
- The automatic monthly bill run also adds approved interest on past arrears.

### Drive script (version 5)
- `upload` with `kind: reference` (committee): *Reference documents/Interest on arrears* for PDFs, photos and calculation CSVs. `fetch` / `memberFetch` with `referenceId` opens only documents listed on the website. **Deploy a new version of the script.**

### Security rules
- `interestRuns`: the committee creates and cancels them.
- `billAdjustments`:
  - created by the committee, only for a month not yet billed;
  - cancelled by the committee while still pending;
  - marked billed when the bills are made;
  - read by the accounts team and the unit's approved member;
  - never deleted.
- Counter `interest-<year>`.

### Tested
- 22 browser checks:
  - a 21% rate running past 17/07/2026 is refused, and the suggested periods and their summary are saved for bills and members;
  - two reference documents are filed in the Drive;
  - **C 202** (₹10,000 overdue since April 2025): 15 months at 21% = ₹2,625 and 4 months at 12% = ₹400, total ₹3,025;
  - **C 101**, paid in January 2026: 10 months = ₹1,050; a unit in credit is left out;
  - month-by-month view and CSV;
  - INT/2026-27/001 with pending amounts and a Drive copy, and a repeat run finds the months already covered;
  - the December bill charges ₹100 (12% on ₹10,000) + ₹3,025 = ₹3,125 with the explanation, marks the amounts billed and keeps interest out of the base;
  - the member sees the rates, references and their calculation, and opens a reference;
  - the printed bill note is right.
- 8 Drive-script checks for reference documents.
- All earlier suites pass: 269 browser checks and 88 script checks.
- The automatic monthly bill script was only checked for syntax; it can't be run here.

---

## [3.14.0] – 2026-11-17 – Correspondence register; committee list editor

### Added
- **Correspondence** tab: the Society's inward / outward register for letters and documents received from or sent to:
  - the DDR / Registrar, PMC, MSEDCL and the police;
  - banks, other housing societies and the builder;
  - contractors and AMC vendors, advocates, auditors, members and others.
  - **Each entry:** a number (**IN/2026-27/0001**, **OUT/2026-27/0001**), the date of the letter and the date received, type and name of the office or person, subject, reference no., how it came or went, the unit it concerns (optional), what it replies to, status (waiting for reply / action, replied, closed, no action needed), a due date and a summary, plus scans.
  - **Scans** are saved in the Society's Google Drive under *Correspondence › FY 2026-27 › Inward / Outward*. After each save, the year's register is also saved there as *Correspondence register FY 2026-27.json*.
  - **Record reply** fills in a reply to a received letter and marks that letter *Replied* when it is saved.
  - **Finding entries:** filters by year, register, type of office, status and a search. Summary figures show the year's letters received and sent, and those still waiting (with overdue ones flagged).
  - *Download register (CSV)* for printing or filing.
- **Unit file → Communication** also lists the register's letters about that unit.
- New staff permission *Society correspondence*: given by default to the Society Manager and Office Assistant roles. Staff already set up need it ticked in the Staff tab. Those with *view accounts* can read the register.
- **Committee list editor** (Accounts → Website → Committee and contact): *Add a person*, *Remove*, ↑ ↓ to reorder, and an optional unit shown after the name on the website's Committee page. Before, people could not be added or removed.

### Drive script (version 4)
- `upload` with `kind: correspondence` (needs the new permission), `fetch` by `correspondenceId`, and `backupRegister`. **Deploy a new version of the script.** It needs no new Google permission beyond the 3.13 one.

### Security rules
- `correspondence/<id>`:
  - read by *view accounts* or *Society correspondence*;
  - created and edited with *Society correspondence*; its number, register, year and creator cannot change;
  - deleted by the committee only.
- Counters `inward-<year>` and `outward-<year>`.

### Tested
- 17 browser checks:
  - the committee editor removes two people, adds four with units and reorders them, and the website shows the new list;
  - a DDR letter is recorded with its scan as IN/2026-27/0001, the register backup is saved, and the summary and overdue flag show;
  - a reply is pre-filled, saved as OUT/2026-27/0001 and marks the letter replied;
  - filters, search, opening a scan and the CSV download work;
  - the letter shows in the unit file, and the watchman sees no Correspondence tab.
- 12 Drive-script checks: folders, permissions, bad registers and years, opening through the entry, and the register backup replacing itself and refusing another year.
- All earlier suites pass: 247 browser checks and 80 script checks.

---

## [3.13.0] – 2026-11-17 – Member portal agreement; members upload their unit's documents

### Added
- **Member portal agreement** (Members → *Member portal agreement*):
  - A draft *Member Portal Use Agreement and Undertaking* covering:
    - the Act (including Chapter XIII-B), the Rules and the registered bye-laws, which prevail; members' statutory rights are not affected;
    - using the portal and checking it regularly; receipts are subject to realisation, and the books are the final record;
    - paying dues on time and sharing payment details at once;
    - the unit's records: the full title chain with Index II, leave and licence agreements, police intimation, occupants and past tenants, each uploaded and handed over as a physical copy against acknowledgment; telling the Society before letting the unit or changing its use;
    - writing to the committee first, with 30 days for a reply, without limiting recourse to the Registrar, the Co-operative Court, the police or the courts;
    - not defaming the Society, its committee, staff, watchmen, housekeeping, garbage collection or cleaning personnel, or members, by any means including social media; true statements in good faith, fair comment and complaints to authorities stay free;
    - consent for the use of personal data;
    - electronic acceptance (IT Act section 10A), revisions, severability and jurisdiction.
  - Members who do not accept still get their bills and receipts from the office.
  - The text is Version 1.0 as reviewed on 17/11/2026 (15 sections, the same as the Society's Agreement document). Among its clauses, the user:
    - agrees to visit regularly (2.5);
    - provides the full title chain with Index II from the builder to the latest owner, plus past tenants with their police intimation (4.1);
    - uploads and hands over a self-attested physical copy against a numbered acknowledgment (4.3);
    - writes to the Committee as a first step, with 5.4–5.6 keeping the Registrar and the courts open (5.1);
    - names watchmen, housekeeping, garbage-collection and cleaning staff among those not to be targeted (6.2), and not to defame them by any means, including WhatsApp and social media, with the good-faith exceptions in 6.6 (6.3);
    - gets a copy emailed with a copy to the Society (11.4).
  - The committee edits the text, previews it and publishes it as a numbered version. Published versions are kept unchanged. The draft carries a note to have it checked by the Society's advocate and adopted by a Managing Committee resolution.
  - **Every approved member, new or existing, accepts the current version before using the portal.** They tick four confirmations and type their name. Their name, email, unit, version, confirmations and the server's time are recorded.
  - **The copy is saved as a PDF** in the unit's Drive folder (*Units › wing › unit › Agreements*) and **emailed to the member with a copy to sunshreesuntec@gmail.com**, once. If emailing fails, it is tried again at the member's next visit; the committee can also *Send copy again* from the unit file.
  - The members list shows who has accepted; the agreement box lists who hasn't. A new version asks everyone again.
- **My unit's documents** (member's account page): members upload, with details:
  - sale deed / agreement and Index II (each document of the chain from the builder to the latest owner);
  - leave and licence agreement;
  - police intimation / verification;
  - who lives in the unit now;
  - past tenancies;
  - applications and other documents.

  PDFs up to 25 MB and photos are filed in the unit's Drive folder (*Ownership (sale deeds and Index II)*, *Tenants and agreements*, *Occupants*, *Communication*). Members see each upload's status and can edit or withdraw it until it is acknowledged, and download their agreement copy.
- **Unit file → From the member:** the uploads with their files, a count of those waiting, and two actions:
  - **Acknowledge** when the physical copy is received: date, remarks and a number **ACK/2026-27/0001**, which the member sees;
  - **Return** with what to correct.

  This tab also lists the unit's portal agreements with the PDF and the email status.
- Unit file backups now include the member's uploads and agreements.

### Drive script (version 3)
- Members' own actions: `memberUpload` (only their unit, approved and verified), `memberFetch` (their uploads and their agreement) and `memberAgreement` (PDF and email, once). Committee: `resendAgreement`; `fetch` also opens member uploads and agreements.
- New permission to send email: **replace appsscript.json, run setup again to allow it, and deploy a new version** (README → *Updating the script later*).

### Security rules
- `memberAgreementVersions` (committee creates; never changed), `memberAgreements/<uid>_v<version>` (created only by the member for the current version, with the server's time; afterwards only the PDF and email details may be added), the member's own `agreementVersion` on their record (only together with that acceptance), `units/<id>/memberDocs` (the unit's approved member adds, edits and withdraws until acknowledged; the accounts team acknowledges or returns), counter `acks-<year>`, and `settings/files` readable by approved members for uploads.

### Tested
- 36 browser checks across the whole flow:
  - nothing is asked before publishing;
  - the draft's key clauses, the preview and publishing version 1;
  - members who haven't accepted are listed;
  - the member sees the agreement with their details, and all four boxes are needed;
  - the acceptance record, the member's version, one copy saved and emailed, and the account opening afterwards;
  - uploads to the right unit and folder, with required details checked;
  - the committee's count, acknowledgment number and return with a reason, opening a scan and sending the copy again;
  - the member sees the acknowledgment, can't change an acknowledged upload, corrects a returned one and downloads the agreement;
  - version 2 asks again while version 1 stays unchanged.
- 25 new Drive-script checks: member folders, permissions, other units, unapproved or unverified accounts, size limits, the PDF content, email once with CC, resend, and the email quota.
- All earlier suites pass: 230 browser checks and 68 script checks.

---

## [3.12.0] – 2026-11-17 – Electricity and property tax in the unit file; unit documents and backups in Google Drive

### Added
- **Unit file → Electricity and property tax:**
  - **Electricity (MSEB / MSEDCL):** consumer no., name on the bill, meter no., tariff category (LT-I Residential, LT-II Non-residential / Commercial, LT-V Industrial, HT, other), sanctioned load, bill month, units, amount, due date, with a scan of the bill.
  - **Property tax (PMC):** property no., name in the PMC record, use as assessed (residential, non-residential / commercial, mixed), assessed area, year, tax, arrears, paid on and PMC receipt no., with a scan.
  - **Possible commercial use:** a unit recorded as a *Residential Flat* is flagged when its latest electricity bill is at a commercial or industrial tariff, its latest property tax assessment is non-residential or mixed, or a current tenancy is for commercial use. The flag says what was found and what to do; the unit's card shows *Commercial use?*. Units already recorded as *Residential, using as Commercial* are not flagged.
  - **All units:** *Check all units* lists every residential flat with such signs, with a link to each.
- **Scans on every unit file record** (members, tenants, communication, electricity, property tax): add photos or PDFs in the record's form; they are saved in the Society's Google Drive under *Sunshree Suntec Society Records › Units › wing › unit › Members and shares / Tenants and agreements / Communication / Electricity (MSEB) / Property tax (PMC)*, and open from the record (📎). Removing a scan from a record leaves the file in the Drive.
- **Communication: what it is:** application or request from the member, the Society's reply, notice from the Society, complaint, letter, other.
- **Unit file backup in Google Drive:** *<unit> unit file backup.json* in each unit's folder, with the unit's details, member, tenant, communication, electricity and property tax records (with their scans' Drive references), ledger, bills, receipts, duplicate receipts, old receipts and Tally history. Saved by itself whenever a unit record is saved, or with *Back up now* (time and person shown under the unit file's tabs).
- **Settings → Unit files in Google Drive:** *Back up all unit files now*, and *Restore a unit's records from its backup*: shows what is in the backup and what is missing here, and puts the missing records back with their original identity (existing records are not changed; bills, receipts and ledger stay permanent).

### Drive script (tools/drive-upload/Code.gs, version 2)
- New: unit documents (`upload` with `kind: unit`, needs *maintain unit files*), opening them (`fetch` with the unit record, checked with the person's own sign-in), `backup` (replaces the unit's backup file) and `readBackup` (committee only). **Deploy a new version of the script** (README → *Updating the script later*).

### Security rules
- Unit records `electricity` and `propertyTax`, same as members, tenants and communication (read: accounts team and the unit's approved member; write: *maintain unit files*; delete: committee).
- New `driveBackups/<unit>`: when each unit was last backed up.

### Fixed
- The unit record form no longer runs off the right edge of a phone screen.

### Tested
- 19 checks in the browser: the new tab; scan box and where it goes; an MSEB bill at LT-II with its scan filed under *Units › C Wing › C 202 › Electricity (MSEB)*; the flag and the *Commercial use?* card; automatic backup with everything about the unit and the time shown; the scan opens; property tax with the year list and a PDF; a notice from the Society under Communication; a scan removed from a record but kept in Drive; *Check all units* flags a tariff and a commercial tenancy but not a unit recorded as commercial use; back up all units; a deleted record found missing and restored with its id and scan; scans disabled with a note when the Drive isn't connected. 18 new checks of the Drive script (folders, permissions, wrong units and kinds, opening through the record, backup replace, restore committee-only). All earlier suites pass: 194 browser checks and 43 script checks.

---

## [3.11.0] – 2026-11-17 – Duplicate receipts for any past payment; receipts worded for any purpose

### Changed
- **Receipt wording:** *towards maintenance charges against Bill No. …* is now *on the Shop / Flat / Office Unit’s account*, because members also pay for conveyance deed, AMC and other charges. The bill number, when there is one, moves to the details box as **Bill No.**; the purpose stays in **Note**. Applies to every receipt, old and new.

### Added
- **Duplicate receipts** (Unit file → *Duplicate receipts*), for when a member asks for a copy:
  - lists every payment recorded for the unit: receipts from these accounts, receipt vouchers in the Society’s Tally books (2018–2026) and the past committee’s receipts (2011–2016; cancelled and duplicate lines left out), filtered by financial year and by where they are recorded;
  - tick the payments, check the name and choose the reason (member’s request, original lost, for a bank or loan, for sale or transfer, for the member’s records, other) and press **Print duplicate receipts**;
  - each copy is headed **DUPLICATE RECEIPT** and keeps the original date, number and amount; Tally copies show the Tally balance before and after; copies from the past committee show what the payment was towards and no balance; below each copy: date issued, by whom, the reason and a reference **DUP/2026-27/0001**;
  - every issue is kept permanently under *Duplicates issued for this unit* and can be opened and printed again; it cannot be changed or deleted.
- Who: committee members and staff with the *record payments* permission (Accountant by default); others with access to the unit file see the list but not the print form.

### Security rules
- New `receiptCopies`: created by those who record payments (with their own user id, a reason and 1–60 receipts); read by the accounts team and the unit’s approved member; never changed or deleted. Counter `duplicates-<year>`.

### Tested
- 18 checks: every payment listed from all three sources with the cancelled old receipt left out; filters; select all with count and total; the DUP number and its record (who, when, why, each receipt); four copies oldest first, each a DUPLICATE RECEIPT; the old receipt with what it was towards and no balance; the Tally copy with voucher No. and Tally balances; the website copy with its bill and note; the note under each copy; the new wording everywhere; the issued list; a normal receipt with the new wording and its Bill No.; staff without the payments permission see no print form. Earlier suites (3.4–3.10) pass: 175 checks in all.

---

## [3.10.1] – 2026-11-17 – Disclaimer on receipts

### Added
- **Disclaimer under every receipt** (on screen, printed and saved as PDF), below *This is a computer-generated receipt … valid without a signature*: digitally generated receipts are for members’ tracking; members can obtain a physical copy from the Society’s Accountant; the amount shown is subject to clearance in the Society’s bank account.

### Tested
- A receipt opened by a signed-in member shows both lines; the disclaimer also appears in the print/PDF view and the receipt still fits on one A4 page.

---

## [3.10.0] – 2026-11-17 – Calendar on the Notices page; notices keep their bullet points

### Added
- **Calendar beside the notices** (Notices page, right side; above the notices on a phone):
  - opens on the current month, with **‹ ›** to move between months and *Back to this month*;
  - every date on which a notice was published is highlighted, with a small count when one day has more than one notice, and today is circled;
  - choosing a highlighted date brings its notice into view and highlights it for a moment;
  - below the calendar, the notices of the month shown, each a link to the notice; a month without notices offers a link to the nearest month that has some.

### Fixed
- **Notice text now appears as typed:** lines starting with •, - or * show as bullet points, lines starting with 1. 2. 3. as numbered steps, and other lines keep their own line (bank details, addresses). Before, the lines of a paragraph ran together.
- The notice form in Accounts → Website explains how to type bullets and steps.

### Tested
- 19 checks on a computer screen and a phone: current month shown, published date highlighted together with today, bullets and numbered steps as lists, bank details on separate lines, a day with two notices with its count and both listed, choosing a date shows its notice, an empty month points to the next month with notices, *Back to this month*, and on a phone the heading, then the calendar, then the notices.

---

## [3.9.0] – 2026-11-16 – Register first with Gmail; people who tried but never registered

### Changed
- **Member login redesigned for first-time users:** two clear choices, *New here? Register* and *Already registered? Sign in*.
  - **Register** is one form in three numbered steps: who you are, your details, then **Continue with Google and send request**. The Gmail chosen becomes the login and the request reaches the committee in the same step. Details are checked before Google opens and kept if Google is closed.
  - **Sign in** is **Sign in with Google**; anyone who signs in without having registered is asked to finish the registration there.
  - Email-and-password: no new accounts; existing ones still sign in under *Registered earlier with an email and password?* (with *Forgot password?*).
- App sign-in problems now point to the website in the phone's browser instead of password sign-in.

### Added
- **Tried but never registered** (Members tab): people in the sign-in history with no request or login, what happened, and **Send the steps by email**. Example: prasadanuja07@gmail.com tried email and password and a password reset on 16 Nov 2026 without registering, so no request reached *Requests waiting*.

### Tested
- 14 new checks: the two choices; the three-step form without passwords; details checked before Google; request saved straight after Google with the Gmail, unit and relation; nothing left pending; Google closed keeps the details; *Sign in with Google* without registering leads to *Finish your registration* and *Send request*; a watchman's staff request in one go; an older password account still signs in; the list of people who tried but never registered, with the right explanation, excluding members, and the email with the steps. The 3.4–3.8 suites pass (their sign-in steps now go through *Sign in*).

---

## [3.8.0] – 2026-11-16 – Bill sheets with several items, payment proofs, lift costs recovered from members

### Added
- **Several items on one sheet** (Expenses → Add expense → *The bill is for: several items on one sheet*): a line per item (date, head, what for, paid to, amount) with a running total and one photo of the sheet; each line is saved as its own expense, all sharing the photo. Example: the watchman's list of 5 expenses (₹9,550) paid from his pocket.
- **Approve all on this sheet**: the expense window lists every line of the sheet with its status, and approves all waiting lines at once with consecutive voucher numbers in date order.
- **Proof of payment**: a photo of the cheque or transfer can be attached when paying someone back, giving an advance, or recording a vendor payment; shown in the expense window and the paybacks list, kept in the month's `Payments` folder.
- **Recover from members' bills**: an approved lift expense (e.g. the C wing lift AMC) can be shared among the units served by that lift and added to their maintenance bills, in one month or monthly instalments, from the expense window. The Lift register shows the voucher and opens the expense with its contract / bill.

### Changed
- A payback's vouchers are listed in order; switching tabs closes any open window.
- Bill storage script: payment proofs (payers only) in `Payments`; proofs readable through their expense or payback; a sheet shared by several lines stays in the month it was stored in and keeps its name. **Deploy the new `Code.gs` as a new version** (Deploy → Manage deployments → edit → New version).

### Security rules
- Payers may also set `payFiles` on an approved expense; people with *Lift expenses* may link an approved expense to its lift recovery (`liftExpenseId`, `recovery`).
- **Publish the new `firestore.rules`.**

### Tested
- 24 checks walking through the three real cases with the actual photos: the watchman enters 5 lines from his sheet (₹9,550, own money) with one photo; five expenses with their own dates and heads share it; the chairman approves all five (vouchers 0002–0006 in date order); the accountant pays Ramesh back by one cheque with its photo, all five marked paid back, *Payments made* shows one cheque linked to the five vouchers, each expense shows the payback and the cheque; the ₹14,000 C wing lift AMC is added as *not paid yet* with the contract photo, approved by the Treasurer, recovered from the C wing units only (12 monthly instalments from December), linked in the Lift register, then paid by cheque with proof.
- 25 checks of the storage script (6 new); the 3.7.0 (27), 3.6.0 (20) and 3.5.0 (17) suites still pass.

---

## [3.7.0] – 2026-11-16 – Daily expenses with bill photos, approvals, staff paybacks, monthly report

### Added
- **Expenses tab** (Accounts → Expenses) for the Manager, Accountant, Housekeeping, Watchman and the committee:
  - **Add expense**: date, amount, head, paid to, bill no., what for, **who paid** (the Society with mode and reference; a person from their own money; not paid yet), and photos or PDFs of the bill (photos reduced before sending);
  - **Expenses** list with month, status, paid-by and search filters, totals and CSV; each expense opens with its bill photos, details, payment / payback and step-by-step history;
  - **Approve** (voucher number `EXP/FY/nnnn`) or **Reject** with a reason; nobody can approve their own expense; corrections and deletion by the person who added it while it waits;
  - **Record payment** for vendor bills paid later;
  - **Staff paybacks**: what is owed to each person who paid from their own money, advances they hold, **Pay back** (choosing the bills, optionally setting part against an advance; `PB/FY/nnnn`) and **Give advance** (`ADV/FY/nnnn`);
  - **Payments made**: every payment of the month linked to its vouchers and bill photos;
  - **Monthly report**: totals, by head, vouchers, payments, owed to staff at month end; print / PDF, CSV, save to the Society's records;
  - **Set-up** (committee): connect the bill storage.
- **Bill storage in the Society's Google Drive** (`tools/drive-upload`: Apps Script, manifest and step-by-step README): files are kept privately in the Society's account in `Expenses/FY/month/Submitted|Approved|Rejected` (approved ones renamed with the voucher number) and `Reports/FY/month`. Each request is checked with Firebase and the person's own access; bills are shown only to people the rules let read that expense.
- New permissions: *Add expenses*, *Approve or reject expenses*, *Record expense payments, staff advances and paybacks*. Role defaults: Manager, Office Assistant, Housekeeping and Watchman get *Add expenses*; Accountant also gets *Record payments*. Existing staff: add them with Staff → Edit.

### Security rules
- `expenses`: create by people with an expense permission, as themselves, status *submitted*, valid amount / date / fields, no decision fields; update by the person who added it (details only, while waiting), by approvers (decision fields only, never their own), by payers (payment and payback fields only, after approval); delete by the person who added it while waiting, or the committee if not approved. `expenses/{id}/log`: create only.
- `staffSettlements`: create by payers with server time; read by the expense team and the person concerned.
- `counters`: expense vouchers (approvers), paybacks and advances (payers). `settings/files` readable by the team.
- **Publish the new `firestore.rules`.**

### Android app
- The file picker offers **take a photo** with the camera as well as choosing files, for photographing bills.

### Tested
- 27 checks in the browser with a stand-in for Firebase and the storage script: storage connected by the committee; the watchman sees only Add, Expenses and Staff paybacks; bill photo required; expense saved with the stored file using the watchman's own sign-in; history written; watchman sees only his own; the bill photo shows for the approver; approval gives the next voucher number and moves the files; the Chairman can't approve his own, the Treasurer can; the Accountant can't approve but records the vendor's cheque; payback of the watchman's bill linked to it; advance held; payments made lists vendor, bank, payback and advance with references; the report totals, heads and month-end dues; report CSV and saving to the records.
- 19 checks of the storage script in Node with stand-ins for Google Drive and Firebase: folders by FY and month, March in the previous FY, file types, refusals (no account, bad sign-in, agreement not accepted, no permission, someone else's expense, a file not on that expense, files outside the records folder), moving and renaming on approval and rejection.
- The 3.6.0 (20), 3.5.0 (17) and 3.4.0 (31) checks still pass (the 3.6 test now expects watchmen to also have *Add expenses*).

---

## [3.6.0] – 2026-11-16 – Staff and officials can ask for access; access by role; residents directory

### Added
- **Registration for staff and officials:** the Member page's registration form asks *I am registering as: a member of a unit / Society staff or an official*. Staff and officials choose a role (Society Manager, Accountant, Office Assistant, Housekeeping, Watchman / Security, Auditor, Government official (DDR / Registrar), Other), give their organisation or office and mobile, and see what the role usually gets. Requests go to the new `staffRequests` collection, separate from member requests.
- **Requests from staff and officials** (Accounts → Staff): **Approve** opens the access form filled from the role's policy (adjustable), creating their staff login in one step with the request and history; **Reject** with a reason; rejected requests can go back to waiting or be deleted; **Send email / WhatsApp** to tell them.
- **Access by role** (`settings/rolePolicies`, Staff tab): each role has its own permissions, whether the staff agreement is required, and how long access lasts. Defaults: auditors and government officials get read-only access without the staff agreement, for 90 and 30 days; housekeeping and watchmen get only the residents directory.
- **Access until** and **Must accept the staff agreement** per person (Staff → Edit). Expired access is refused by the rules and explained on sign-in.
- **Residents directory** (new permission and Accounts → Directory tab): units, names in the Society's records and approved people with relation and tap-to-call mobile, with search; no money information.
- The accounts page tells someone with a pending or rejected staff request what is happening, and points others to the registration form.

### Changed
- The registration tick box wording depends on the choice (staff: confidentiality commitment).
- The Member page tells a signed-in staff member which role their account has.

### Security rules
- `active()` also checks `validUntil`; `perm()` skips the agreement check when `agreementRequired` is false.
- New `staffRequests`: create only for oneself, with the listed fields, a role from the list, a valid mobile and one's own email; read by oneself and the committee; decided by the committee.
- `users` can be read by staff with *Residents directory*.
- **Publish the new `firestore.rules`.**

### Android app
- New icon: the Society's seal on white, sized to Android's safe zone (whole seal visible in round, square and rounded launcher shapes), also used for Android 13+ themed icons; 512 px Play Store icon in `app/src/main/ic_launcher-playstore.png`; source SVG in `branding/`.

### Tested
- 20 new checks: staff registration fields and role note; request saved without a unit record; waiting message on both pages; three requests listed; approval form filled from the Auditor policy (view only, no agreement, 90 days) and the Watchman policy (directory, agreement); staff login created, request marked approved, notice shown, list shows the end date; rejection with reason, kept and shown to the person; role policy saved; auditor signs in without the agreement and sees only view tabs; watchman accepts the agreement and sees only the directory, with search; expired access refused. The 3.5.0 (17) and 3.4.0 (31) checks still pass.

---

## [3.5.0] – 2026-11-16 – Several people per unit, telling members, deleting test records

### Added
- **Who you are, when registering:** *Owner*, *Joint owner*, *Family member of the owner*, *Tenant* or *Caretaker / agent* (`relation`), with a short note on what each will see. Several people can register for one unit, each with their own email.
- **What each approved person can see** (`access`, set by the committee): *Unit account and Society documents* (full) or *Society accounts and documents only* (basic). Suggested: full for owners, joint owners and family; basic for tenants and caretakers. Changed any time with **Edit**.
- Members tab: relation label on every request and member, *Can see* column for approved members, the duplicate warning names relations, relation and access in the edit form and the rejected CSV.
- **Tell the member** after approve, reject or remove: **Send email** and **Send WhatsApp** open a ready message (with the reason) in the committee member's own email or WhatsApp; recorded in the history as *Member told*.
- **Delete permanently** (committee only): a rejected or removed record with its history, from *Open*; and ticked entries in the sign-in history (**Delete selected**). For test or mistaken entries.

### Changed
- A basic-access member's account page shows their unit and relation, a note on what they can see, and the Society's accounts and documents, without the unit's balance, bills, receipts or ledger.
- Registration: the tick box now reads "The details above are true…" (it previously said "I am the owner…").
- The message after the dues-page eye for someone without unit-account access explains why.

### Security rules
- Unit account data and `private/dues` need `access` full (records without it count as full, so existing members are unaffected).
- `users` create may include `relation` (one of the five values); members can't set `access` themselves.
- `memberLog`: action `notified` allowed; the committee may delete (used only by *Delete permanently*).
- **Publish the new `firestore.rules`.**

### Not included
- Emails aren't sent automatically: that needs a mail server (for example a paid Firebase plan with a mail extension, or a scheduled job with a mail account). The ready-made email / WhatsApp message is the way for now.

### Tested
- 17 new checks: tenant registration with its note; pending label and duplicate warning with relations; approve gives a tenant documents-only access; email and WhatsApp links with the right address, number and wording (removal includes the reason); *Member told* recorded; permanent delete removes the record and its history but keeps others'; access changed with Edit; sign-in entries ticked and deleted; a basic-access tenant sees the note and no unit money; with full access the account shows. The 32 checks of 3.4.0 still pass.

---

## [3.4.0] – 2026-11-16 – Sign-in feedback, sign-in history, rejected list

### Added
- **Clear feedback on sign-in** (`assets/js/signin.js`, used by the member and committee sign-in screens):
  - after *Continue with Google* the button turns busy (turning ring) and can't be pressed again;
  - a message under it says what is happening (*Opening Google sign-in…*, *Google account chosen. Signing you in…*, *Signed in as …*);
  - failures are explained in plain words, with a small details line (code, time, app version, phone, the app's signing SHA-1) to screenshot for the committee;
  - closing Google's window, being offline, and wrong passwords all get their own message.
- **Sign-in history** (new collection `signInLog`; Members tab):
  - every sign-in, registration and password-reset attempt, on the website and in the app, including failed and closed ones (never passwords or tokens);
  - filters for period, result, method and website/app; counts (attempts, people or devices, signed in, failed, closed, still not in); Export CSV;
  - a red box lists the most frequent failure codes with what to do (e.g. the app's SHA-1 to add in Firebase).
- **Rejected and removed list** (Members tab): rejected requests and removed members are kept, with decision date, who decided and a reason. **Open** to correct details or change the status and see the history, **Back to waiting**, **Approve**, **Export CSV**.
- **Reason when rejecting or removing:** *Reason* (the member sees it on their status page) and *Note for the history* (committee only). Members can also be edited from the waiting and approved lists.
- **Decision history** (new collection `memberLog`, permanent): every approve, reject, remove, restore and edit with what changed, reason, note, who and when; saved in one batch with the decision.

### Changed
- The member's status page says *Access removed* or *Request not approved* and shows the committee's reason.
- The Members tab loads all member records once (one query) instead of two.
- The Google message on the member page is directly under the button.
- The version at the foot of the accounts page comes from one place (`SITE_VERSION` in `firebase.js`).
- Inside the app: Google sign-in answers with full details (needs app version built from this site version; older app copies still work, with less detail).

### Security rules
- `signInLog`: create only, also before sign-in, with exactly the listed fields, short texts, server time, and a user ID only for oneself; read by *approve members*; delete by the committee.
- `memberLog`: create only by *approve members*, as oneself, with server time; read by *approve members*; never changed or deleted.
- **Publish the new `firestore.rules`**, or the history isn't saved and rejecting/approving shows "This action isn't allowed".

### Tested
- 32 checks with a stand-in for Firebase and the app: busy button and message right after the click; a second tap doesn't start a second Google request; "closed at once" explained, with SHA-1 in the details and in the history; a slow success shows progress and is logged with the user; a person closing Google is logged as closed; wrong password logged with the email but not the password; website pop-up closed logged; reject with reason and note; edit; back to waiting; approve; remove access; decision history in order; both CSV exports; sign-in summary, problem box and filter; the removed member sees the reason. The 3.3.0 app checks (offline, files, print, sign-out) give the same results.

---

## [3.3.0] – 2026-11-16 – Ready for the Android app

### Added (active only inside the Society's Android app; the website in a browser is unchanged)
- **Offline copy:** inside the app, everything read from the accounts is kept on the phone (persistent cache, up to 100 MB). Without internet the pages show the saved copy.
- `assets/js/offline.js`:
  - a bar at the top while offline ("You're offline. Showing information saved on this phone on … Changes need internet.");
  - after a member's account loads, the Society documents and audited accounts are also saved for offline use (at most every 12 hours);
  - changes on the accounts screens (payments, bills, edits) are refused while offline, with a message.
- **Google sign-in in the app** uses the phone's Google account (the app hands a Google ID token to the page, which signs in with it). Google doesn't allow its sign-in page inside apps. The redirect check is skipped in the app.
- **Files and printing in the app:**
  - Society documents and CSV reports are saved on the phone and opened in the phone's apps (`saveBlob` in `firebase.js`, used for all CSV downloads and document opening);
  - *Print* uses Android printing.
- **Sign-out** (`signOutUser` in `firebase.js`, used by every sign-out button): in the app it also deletes the offline copy and saved files, so the next person using the phone can't see them.

### Tested
- With a stand-in for the app on a phone-sized screen: Google sign-in through the app; offline cache switched on; account, documents and audited accounts saved; offline bar with the saved time; account reopens offline; document handed to the app as a PDF; print handed to the app; sign-out clears the offline copy and saved files; a payment can't be recorded offline. In an ordinary browser nothing changed (no bar, no offline cache), and last version's committee walk-through gives identical results.

---

## [3.2.1] – 2026-11-15 – No hosting or data-location details on the website

### Changed
- Accounts footer shows only “Software version 3.2.1” (no links or mentions of the documentation, changelog or repository).
- Messages shown on screen no longer name the hosting or database services, setup files or access rules: the monthly-bills note, the “accounts not available” and “no permission” messages, the two Google sign-in errors, the opening-balances import error, and the note in the public `data/dues.json`. Members and staff are referred to the committee instead.
- Code comments in the published scripts no longer name the hosting or database services.
- Not changeable: the browser must load the sign-in/database library and connect with the site's configuration, so these remain visible to anyone reading the page source. Data stays protected by the server's access rules, not by hiding where it is.

---

## [3.2.0] – 2026-11-15 – Past committee's receipts (2011–2016) in every unit ledger

### Added
- **Old receipts 2011–2016**: the per-unit receipt sheets kept by the past committee (MS EXCEL SHEET FROM PAST COMMITTEE.zip) are loaded into each unit as `units/{id}/pastReceipts/*` (Settings → *Past committee receipts*, from `past-receipts-2011-2016.json`, kept private). 1,099 lines for 57 units, 20 Oct 2011 to 22 Oct 2016: 1,088 payments (₹25,23,600 towards maintenance and lift AMC; ₹1,19,600 other: builder pending, transfer fees, society formation & share, drainage, property tax), plus 8 duplicate copies, 2 cancelled receipts and 1 line listed twice, kept on record but not counted.
- **Unit ledgers now run from 2011.** For each audited year (2011-12 to 2017-18) the ledger shows the old receipts towards maintenance and, on 31 March, a balancing figure to the audited balance (charges for the year less any payments not in the receipt archive). Other payments are listed without changing the balance. At 1 April 2018 any difference with the Tally opening is shown as a line marked *Check* (A 103 ₹30,500, C 100 ₹31,500, C 502 ₹43,000, B 10 ₹4,500), so reports from 2018-19 onwards follow Tally exactly and every ledger still ends at today's balance. Members see the same full ledger in *My account*.
- **Unit file → Old receipts 2011–2016**: every line with date, receipt no., what it was for, mode/remark, amount and status; filters (to check, not yet checked, checked, discrepancies, not counted); totals; receipts by year compared with the audit (2015-16 lists receipts by unit); change log.
- **Check / edit** (committee and staff with the *corrections* permission): correct receipt no., date, cash/cheque amount, head, months, remark or status (payment, duplicate, cancelled, listed twice, removed after checking); record the result of checking the physical receipt book (matches / corrected / discrepancy) with a note; a reason is required. **Add a receipt from the book** for receipts missing from the sheets. Every change is written to `pastReceiptEdits` (who, when, before → after, reason) and can't be altered or deleted. Records are never deleted; mark them *Removed after checking* instead. Re-loading the file keeps lines already checked or corrected.
- **Reports** for 2011-12 to 2016-17: *Member-wise statement* adds an *Old receipts* column (highlighted in 2015-16 where it differs from the audit's figure for the unit); *Year summary* adds receipts totals; *Collections* shows the old receipt register by head and mode; *Over the years* fills *Received* for those years.
- `tools/past-receipts/`: the scripts that converted the Excel sheets, with notes.
- `firestore.rules`: `units/{id}/pastReceipts` (read: accounts team and the unit's approved member; create/update: *corrections*; no delete) and `pastReceiptEdits` (read: *view*; create only, by the signed-in person; no update/delete).

### How the Excel data was read (and what to check)
- **Dates:** Excel had read dates typed as dd/mm/yy as mm/dd/yy whenever the day was 12 or less, storing day and month swapped (678 cells, corrected); 398 dates were typed as text and kept; 19 were already right. Receipt numbers run in time order across the Society, which confirmed each fix. 15 year slips were corrected (e.g. GF 17 receipt 403 typed as 2023 → March 2013; C 402 receipt 1023 typed 2017 → July 2015), 6 dates remain out of order with nearby receipts (receipts 210–215 read as 1 Sep 2012 but sit among July 2012 receipts), 4 lines had no date (estimated from receipt order). All are flagged *To check*.
- **Other flags (34 lines in all):** amounts entered in the "Duplicate" column that are real payments (GF 07 ₹55,000 builder pending; C 102 ₹3,000 society formation & share and ₹5,000 drainage; C 403 ₹5,000 drainage and ₹1,000 property tax); C 403 receipt 1047 shows ₹23,700 but its remark and the 2015-16 audit say ₹18,700; C 403 receipt 834 listed twice (counted once); two lines on receipt 1169; the past committee's own notes ("NEED TO CHECK months", "Ch no to find").
- **Sheets:** GF 18's sheet is a copy of GF 19's and was not loaded (GF 18 has no receipts in the files). No sheets with receipts for A 100, B 21, D 101 B, D 202, GF 01, GF 02, GF 03. Sheet "C001" is C 100 (stilt parking unit).
- **Check against the audit (2015-16, the year the audit lists receipts by unit):** 39 of 63 units match to the rupee; the others are highlighted (e.g. A 101 audit ₹51,000 vs sheets ₹30,000; GF 17 has a ₹4,200 receipt the audit credits to GF 18; B 21 ₹20,800 with no sheet).
- Not loaded: the expense sheets, lift collection 2013-14, electricity meter list, phone list and society-formation list (the last includes PAN numbers and sale prices, which should not go on the website).

### Checked
- For all 65 units, the ledger equals the audited balance on every 31 March from 2012 to 2018 (431 checks) and ends at today's balance.

---

## [3.1.0] – 2026-11-15 – Audited accounts 2011-12 to 2017-18 and document archive

### Added
- **Documents** tab (accounts team) and **Society documents** in *My account* (approved members only): scanned reports and other Society records, opened in a new tab. PDFs are kept in the Society's database in parts of under 1 MB, so they stay private without Firebase's paid plan; the committee uploads (up to 15 MB each) and deletes. The 2011–2018 audit reports are supplied as compact black-and-white copies (25–33 pages, 0.6–0.85 MB each, down from 14–27 MB).
- **Audited accounts 2011-12 to 2017-18** (`auditYears/{year}`), loaded by the committee from `audited-accounts-2011-2018.json` (Settings → Audited accounts). For each year: audit class, auditor, report and AGM dates, committee meetings, office bearers, audit fee; income & expenditure and balance sheet as printed; sundry debtors (commercial, residential, builder pending); member-wise year-end dues; builder pending per flat; list of members and committee; auditor's remarks; notes on gaps in the scanned files.
- **Reports** now start from 2011-12:
  - *Year summary* and *Member-wise statement* for 2011-12 to 2017-18 come from the audited figures (opening = previous audited year end; 2015-16 also shows billed and received per unit).
  - *Audited statements*: the full income & expenditure, balance sheet, debtors, remarks and committee for the year, with a button to open the scanned report.
  - *Over the years*: income, expenditure, surplus, billing, receipts, members' dues and builder pending for every year 2011-12 to today, with a bar for dues.
- **Unit file → Account**: balance on 31 March of every year from 2011-12 (audited lists, then Tally, then these accounts), the 2018 audit-to-Tally handover check, builder pending by year, and names the unit was listed under in the audited member lists.
- **My account** (members): the same year-end history for their unit, plus *Society accounts* (each audited year's summary, statements and auditor's remarks, and the over-the-years table) and *Society documents*.
- `firestore.rules`: `archiveDocs/*` and `auditYears/*` readable by approved members and the accounts team; written by the committee only.

### Checked
- All 7 balance sheets balance to the paisa; every group adds up to its total; each year's surplus equals the balance-sheet "current period"; the Income & Expenditure account carries forward correctly from 2011-12 to 2017-18.
- Member-wise dues add up to the audited debtors in every year with a complete list; builder-pending lists add up to the audited totals.
- Audited dues on 31 March 2018 (₹16,11,920) vs Tally opening on 1 April 2018 (₹15,02,420): 58 units match to the rupee; the ₹1,09,500 difference is A 103 ₹30,500, C 100 ₹31,500 and C 502 ₹43,000 (Tally ledger starts later under a new owner) and B 10 ₹4,500 (audited ₹4,800, Tally ₹300; confirmed on the scan).
- An uploaded PDF reopens byte-for-byte identical.

### Gaps in the scanned files (shown in the reports)
- 2012-13: the income & expenditure page is 2011-12's; the surplus (₹1,73,412) is taken from the balance sheet.
- 2013-14: the residential members' list is missing (commercial list printed twice); unit-wise residential balances for 31 March 2014 are not available.
- 2014-15: the middle page of the list of members is missing.
- 2011-12: printed I&E totals (₹2,27,579) don't equal income; line items and surplus are consistent.

---

## [3.0.0] – 2026-11-13 – Full Tally migration

### Added
- **`tools/tally-export/`** for the accountant's Windows laptop: `Export-TallyData.bat` (double-click) runs `Export-TallyData.ps1` (built-in Windows PowerShell; TallyPrime or Tally.ERP 9 with port 9000 enabled). It exports the company, all groups, all ledgers with opening / closing balances and contact details, and every voucher with all its ledger lines, month by month from the start of the books; checks opening + vouchers = Tally closing for every ledger; saves `tally-export-<company>-<date>.json`, a log and Tally's raw replies. Read-only towards Tally. See `tools/tally-export/README.txt`.
- **Settings → Tally migration** (committee) loads that file:
  - shows company, period, counts and the balance check;
  - matches each member ledger to a unit by the unit number at the start of its name (editable), including old ledgers of previous owners, which are combined into the unit's history; BPM ledgers are recognised;
  - writes each unit's Tally history up to a chosen cut-off date (default 30 Sep 2026) into the unit ledger, as before;
  - optionally keeps the **whole Tally books** (every ledger and voucher) as a read-only archive, and optionally updates builder pending maintenance from the BPM ledgers;
  - lists units whose Tally balance on the cut-off date differs from the opening balance taken over.
- **Reports → Tally books:** any Tally ledger (bank, expenses, funds, members …) for any financial year, with opening, every voucher and closing balance; print and CSV.
- `firestore.rules`: `tallyArchive/*` read with *view accounts*, written by the committee.

### Tested
- Against a test Tally server built from the 63 ledger statements: 2,329 vouchers exported and re-imported; every ledger balance agrees; every unit's merged ledger ends at its balance today.

### Data note
- C 502: the current Tally ledger is **“C 502 Mr Rajanedra Unecha”**; on 19 Jan 2026 the balance of “C 502 Mr Lokandwala(x)” (₹30,900) was transferred to it. The society member list still shows Mr Lokandwala.

---

## [2.9.0] – 2026-11-13 – Tally ledger history 2018–2026

### Added
- **Tally ledger history.** Settings → *Tally ledger history*: the committee loads `tally-ledgers-2018-2026.json` (kept privately, never on the website). Each unit gets its Tally ledger from 1 Apr 2018 up to 30 Sep 2026 in `units/{id}/history/tally` (2,329 entries for 63 units).
  - Unit file → Account and the member's own account show one continuous ledger: Tally entries (marked *Tally*, with voucher type and number) up to 30 Sep 2026, then these accounts. The Financial year filter now goes back to 2018-19.
  - Reports cover every year from 2018-19: year summary and month-by-month from the merged ledgers; member-wise statement; billing by head (Tally ledger names for old years); collections including Tally receipts.
  - Where the Tally balance on 30 Sep 2026 differs from the opening balance taken over, the ledger shows a *Difference* line marked **Check** so today's balance stays the same; the loader lists those units.
- `firestore.rules`: `units/{id}/history/*` readable by the accounts team and the approved member of that unit; written by the committee only.

### Data notes (from Ledger_statement.zip)
- 63 unit ledgers read (no Tally ledger for A 100 and D 202). Every ledger reconciles with Tally's own opening and closing balance for every year.
- 56 units: Tally balance on 30 Sep 2026 = opening balance taken over, to the rupee.
- 7 units differ (Tally higher): A 101 +8,100; A 102 +8,100; A 103 +3,900; C 100 +16,000; D 101 A +16,200; D 101 B +16,200; D 201 +16,200 — each equal to one or two quarterly maintenance entries of 2026 in Tally.
- Tally also has the 1 Oct 2026 quarterly maintenance entry for all 63 units; entries after 30 Sep 2026 are shown for reference and not carried over.
- Builder Pending Maintenance group summary (1 Oct 2026): all 47 BPM figures match the units.

---

## [2.8.0] – 2026-11-13 – Financial-year accounts and reports

### Added
- **Reports** tab (anyone with *view accounts*), for a chosen financial year (1 April – 31 March):
  - **Year summary:** opening balance, billed, received (net of cancelled receipts), net corrections, closing balance (or balance so far for the current year), collection percentage, and month-by-month billed vs received.
  - **Member-wise statement:** for every unit, opening on 1 April (including balances taken over on 30 Sep 2026), billed, received, cancelled receipts, corrections + / −, closing on 31 March, with totals; laid out like the Sundry Debtors group summary.
  - **Billing by head:** total billed under each bill head (maintenance, sinking fund, repairs fund, water, lift, non-occupancy, interest, one-off heads) with share of the total.
  - **Collections:** received by mode (NEFT, UPI, cheque, cash …), cancelled receipts, and the full receipt register for the year.
  - **Year closing** (committee): after 31 March, close the year with a note (e.g. “audited by …”). The member-wise closing balances are frozen in `fyClosing/{year}` and no bill, payment or correction can be dated on or before that 31 March. A closed year can be reopened with a recorded reason.
  - Every report can be printed or downloaded as CSV.
- Unit file → Account: **Financial year** filter on the ledger, with opening balance on 1 April and closing balance on 31 March (or balance so far).

### Changed – security rules (`firestore.rules`, must be re-published)
- Ledger entries, bills and payments can't be created with a date on or before the closed-year date (`settings/billing.lockedUpTo`).
- New `fyClosing` collection: read with *view accounts*, written by the committee.

### Checked
- The member-wise closing total equals the sum of all unit balances (reconciles to the rupee on test data).

---

## [2.7.0] – 2026-11-13 – Hidden amounts, water usage, unit file

### Added
- **Unit file** (Accounts → Units → *Unit file*, or `#unitfile`): everything about one unit on one page, printable.
  - **Account:** balance, unpaid interest, BPM, occupancy, last bill; full ledger with running balance; all bills and receipts; buttons to record a payment for the unit or edit it / add a correction.
  - **Members (I & J register):** every member of the unit, current and past: type of membership, name, address, contact, occupation, age on admission, admission date, entrance fee date and receipt, share certificate no., share numbers and value, I and J register serial nos., nominee and nomination date, cessation date and reason, document link, remarks.
  - **Tenants and rental history:** every tenancy, current and past: tenant, contact, residential / commercial use and business name, occupied from / vacated on, leave and licence agreement (type, registration no., date, valid from / till), police verification (date, police station, acknowledgement no.), society NOC date, document link, remarks. Warnings for an expired agreement, missing police verification or missing agreement. Adding or ending a tenancy offers to set the unit to Rented / Own Occupied, which drives non-occupancy charges.
  - **Communication:** letters, notices, emails, WhatsApp, SMS, calls, registered post and meetings, with direction, subject, details, reference no., follow-up date (highlighted when due) and document link.
- New staff permission **Maintain unit files** (default for Society Manager and Office Assistant).

### Changed
- **Maintenance amounts are hidden on the public website.** Visitors see each amount as x's with the same number of digits and commas (₹ 1,17,500 → x,xx,xxx), including totals. The **eye** button (and *Show amounts*) shows the real figures to a signed-in, approved member with a confirmed email, or to committee / staff; anyone else is taken to Member login and returned to the dues once approved and signed in.
  - Real amounts now live in `private/dues`, readable only by approved members and the accounts team (enforced by `firestore.rules`). `public/dues` keeps names and masks only. The switch happens automatically the first time a committee member opens Accounts after updating.
  - `data/dues.json` no longer contains amounts. Note: earlier versions of that file, with amounts, remain in the GitHub repository history.
- **Water usage is Yes / No** instead of a tap count. Under the Monthly Maintenance Calculation, the monthly water expense is shared equally among units marked Yes. Units → area grid: “Water usage” column; Two-wheelers and Four-wheelers columns removed (vehicles can still be set per unit under Edit, for parking).
- Masked totals of zero show as 0.

### Security rules (`firestore.rules`, must be re-published)
- New `private/dues` (approved members and accounts team read; money / unit editors write).
- New unit-file records `units/{id}/members`, `/tenants`, `/comms`: read by accounts team and the approved member of that unit; create / update with *Maintain unit files*; delete by committee only.

---

## [2.6.2] – 2026-11-12 – Easier area grid

### Changed
- Units → Enter area, inlets and parking: all columns now fit on a laptop screen (1366 px) without sideways scrolling. Unit number and member name are shown together, and the Index II / plan note sits on its own line under each unit.
- Plain column names: “Where the area comes from”, “Water taps”, lift shown as “C wing” / “D wing”.
- **Find unit or name** box, **Show only units without a carpet area**, and a count of how many units have an area.
- **Save all units** bar stays at the bottom of the screen while scrolling.
- On phones and narrow windows each unit is shown as a card with labelled fields.
- Accounts pages use a wider layout (up to 1320 px).

---

## [2.6.1] – 2026-11-12 – Carpet areas checked against the PMC-approved plans

### Added
- `docs/data/plan-areas.json`: carpet of every shop and store from the dimensions written on the PMC-approved revised plans (Laxman Thite, Building 'T'): 21 lower ground stores (B 01–21) and 20 upper ground shops (GF 01–20). Main room only; attached WC / mori and loft not included.
- Units → Enter area…: **Fill shops from approved plan** (41 units, source “PMC approved plan”) and the plan figure shown beside the Index II figure, flagged when they differ by more than 5%.
- Unit dialog: **Remove this unit** (committee), only for a unit with no bills, payments or entries.

### Fixed
- **GF 21 was wrong.** The approved plan has only 20 upper ground shops. The Index II for “shop 21” (Murli Daryanomal, 492 sq ft, area type not stated) matches lower ground store 21 = **B 21** (society list: Dr Sagar Ganpat Bhogale). GF 21 removed from `data/dues.json` (back to 65 units) and the Index II entry moved to B 21. If GF 21 was added in the accounts, open it in Units and click Remove this unit.

### Verification result (plan vs Index II carpet)
- Within 2%: B 02, 03, 04, 07, 08, 09, 15, 16, 17, 18, 19, 20; GF 04, 05, 11, 12, 16, 19, 20.
- 2–5%: B 11, B 14 (Index II higher).
- More than 5%: B 01 (plan 278 vs 324; Index II likely includes the attached WC), B 05 (186.5 vs 247.22, type not stated), GF 06 (371.8 vs 650 saleable), GF 13 (164.5 vs 184), GF 14 (224.8 vs 380, type not stated), GF 15 (333.8 vs 450.1).
- Flats and offices: the plans give room sizes and floor totals, not a carpet total per flat, so they are not verified here.

---

## [2.6.0] – 2026-11-12 – Carpet areas from Index II; unit GF 21

### Added
- `docs/data/index2.json`: areas read from the 44-page Index II file (41 documents; pages 42–44 repeat GF 11, GF 12 and C 502): area in sq ft, whether it is carpet / built-up / saleable / not stated, loft, terrace, page number, owner named in the Index II and remarks.
- Units → Enter area, inlets and parking: **Fill carpet areas from Index II** (31 units with carpet area; optional “replace areas already entered”), an **Area source** column (e.g. “Index II p. 12”, Agreement, Measured) saved on each unit, and an **Index II** column showing the document's figure, page, loft / terrace, owner if different from the society list, and remarks. Built-up, saleable and unstated areas are shown but never filled automatically.
- **Add a unit missing from the list** (committee): starts at ₹0, flagged “Under verification”.
- Unit **GF 21** (Murli Daryanomal, per Index II p. 28, 492 sq ft, area type not stated) added to `data/dues.json`; the society now has 66 units.

### Data notes from the Index II file
- Carpet stated: B 01, 02, 03, 04, 07, 08, 09, 11, 14, 15, 16, 17, 18, 19, 20; GF 04, 05, 11, 12, 13, 15, 16, 19, 20; C 101, 201, 203, 403, 502; D 101 A, D 101 B.
- Built-up only: A 101, C 303, C 401, C 402. Saleable only: A 102, C 202, GF 06. Type not stated: B 05, GF 14, GF 21.
- Inconsistent sq m in document: B 04, B 18. Converted from sq m: C 403. Faint digit: C 201. Shop number cut off: GF 19 (matched by owner).
- Owner differs from society list: GF 04 (sold to Pawan Shyam Gupta, 2011), GF 05 (sold to Anshu & Pooja Gupta, 2010), C 202, C 502, B 14, D 101 A.
- No Index II yet: A 100, A 103, B 06, B 10, B 12, B 13, B 21, C 100, C 102, C 103, C 301, C 302, C 501, C 503, D 201, D 202, GF 01, 02, 03, 07, 08, 09, 10, 17, 18.

### Changed
- `firestore.rules`: staff with *edit units* may also set `areaSource` (re-publish the rules).

---

## [2.5.0] – 2026-11-11 – Google sign-in, staff roles and agreement

### Added
- **Continue with Google** for members (website → Member login) and for committee / staff (admin.html). Members signing in with Google still add their name, unit and 10-digit mobile number and wait for committee approval; the Members tab marks these requests “Google”.
- **Staff** tab (committee only): invite an Accountant, Society Manager or Office Assistant by Gmail address with a role and a chosen set of permissions; edit access, suspend, or remove; cancel unused invitations.
- **Permissions** (each can be given or withheld per person): view accounts; record payments and issue receipts; cancel receipts; generate monthly bills; add corrections; edit unit details (not amounts); record lift expenses; approve member logins; publish notices and contact details. Committee-only: Settings, opening import, staff management, agreement.
- Default access by role – Accountant: view, payments, cancel receipts, bills, corrections, lift expenses. Society Manager: view, payments, unit details, lift expenses, member approvals, website. Office Assistant: view, payments.
- **Commitment, Confidentiality and Work Responsibilities Agreement**: shown to each staff member at first sign-in with their name, role, the exact access given, role responsibilities and general commitments (confidentiality, data protection, accurate same-day entries, no back-dating, cash deposit by next working day, conflict of interest, handover). Staff must tick acceptance and type their full name; access starts only after acceptance.
- Agreement editor with versioning: publishing a new version requires every staff member to accept again. Permanent **acceptance record** (name signed, email, role, access, version, date and time, device).
- **My profile** page for everyone: role, sign-in email, what they can access and update, and (for staff) the accepted agreement.
- Last sign-in time shown for each committee member and staff.

### Changed – security rules (`firestore.rules`, must be re-published)
- Every operation now checks a specific permission instead of “is admin”. Staff permissions apply only after they accept the current agreement; suspended accounts have no access.
- Unit records: money operations may change only balance fields; unit editors may change only name, type, status, area, inlets, vehicles and lift. Rates, charge category, per-unit amounts, BPM, construction cost and billing on/off stay committee-only.
- **Ledger entries and bills can no longer be changed or deleted by anyone** from the website (corrections are new entries). Receipts can only be marked cancelled. Settings: bill generators may update only the last-billed month.
- Committee records are `admins` documents without `kind: 'staff'` (existing committee entries keep full access, no change needed).

---

## [2.4.0] – 2026-11-11

### Added
- **Guidance when the accounts are empty.** Payments, Bills, Units and Lift show a notice with a link to **Settings → Import opening balances** until the 65 units exist. The unit drop-downs say “No units yet” instead of showing empty wing headings.
- Clearer error after a failed import (`permission-denied`): points to publishing `firestore.rules` and the `admins` entry.
- `DOCUMENTATION.md`: how the system works, data model, every billing formula, audit trail, operating procedures, FAQ for member queries.
- This changelog.

### Fixed
- Payments → Unit drop-down appeared blank before the opening import (it listed wing names with no units under them).

---

## [2.3.0] – 2026-11-11 – Monthly Maintenance Calculation (MCS Rules 2026)

### Added
- **Charge basis switch** in Settings: *AGM 2015 rates per charge category* (default) or *Monthly Maintenance Calculation (MMC) as per Bye-laws 65–71 and Rule 106C-12 of the MCS Rules, 1961 (as amended 2026)*.
- MMC inputs: list of monthly common expenses (each shared by *all units*, *C wing lift units*, *D wing lift units* or *all lift units*), monthly water expense, construction cost per sq ft, yearly property tax and insurance (if paid by the society), parking rates per two-wheeler / four-wheeler.
- Live summary of rates (service charge per unit, lift per unit, water per inlet, total carpet area, units missing data).
- **Preview next month’s bills** for every unit, head by head, with totals and **CSV download** for the General Body.
- **Units → Enter area, inlets and parking for all units**: one grid to fill carpet area, water inlets, two-wheelers, four-wheelers and lift for all units.
- Unit fields: carpet area, inlets, two-wheelers, four-wheelers; per-unit overrides for monthly lift (MMC) and voluntary Welfare Fund.
- One-off charges on the Bills page can be charged as *same amount per unit*, *total divided equally* or *total by carpet area* (for Major Repairs Fund).
- New optional bill head: **Welfare Fund (voluntary)**.
- Every bill line can carry a short calculation note printed under the head (e.g. “4 inlets × ₹78”, “Equal to all 65 units”, “10% of service charges”).
- Bills record the method used (`method: agm | mmc`) and print the matching legal basis line.

### Billing rules
- MMC service charge = total monthly common expenses ÷ number of active units, rounded to the rupee.
- MMC lift = monthly lift expenses of that lift ÷ units served by it (+ share of items marked “all lift units”).
- MMC water = round(monthly water expense ÷ total inlets) × inlets of the unit.
- Repairs fund = construction cost × 0.75% ÷ 12; sinking fund = construction cost × 0.25% ÷ 12. Construction cost = amount entered on the unit, else cost per sq ft × carpet area. Applies in both methods.
- Property tax / insurance (MMC) = yearly amount × unit carpet area ÷ total carpet area ÷ 12.
- Parking (both methods) = two-wheelers × rate + four-wheelers × rate, unless fixed on the unit.
- Penalty (one-off) refused above ₹5,000 per member (Bye-law 165).

---

## [2.2.0] – 2026-11-11 – Lift expenses

### Added
- **Lift** tab: record lift expenses other than the yearly lift charge (AMC, repair, wear & tear / parts, licence / inspection, electricity, other) with date, lift, description, vendor, invoice no., payment reference and amount.
- Recovery from a chosen bill month in 1–24 monthly instalments; live preview of the per-unit share.
- Lift expense register with per-unit share, billing status and totals per lift for the financial year.
- Each unit is served by the **C wing lift**, **D wing lift** or **no lift** (Units → Open → Served by lift). Defaults: C wing → C lift (16 units), D wing → D lift (4 units), A wing and shops → none.
- New bill head **Lift AMC / Repairs (shared)** with a note on the bill naming each expense, invoice, total, number of units, instalment and share.
- `lastBilledMonth` kept in settings; expenses can only start in a month not yet billed, and can be deleted only before they reach a bill.
- Firestore rules: new `liftExpenses` collection (committee only).

### Billing rules
- Per-unit share = round(expense ÷ units served at the time the expense is recorded); instalment = floor(share ÷ n), last instalment takes the remainder, so each unit pays exactly its share.

---

## [2.1.0] – 2026-11-11 – Bill heads as per bye-laws; AGM 2015 rates

### Changed
- Bill heads re-ordered and extended to follow Bye-laws 65–67: **Water Charges** and **Lift Charges** are now separate lines; “Water / Wastage Penalty / Charges” renamed **Penalty / Other Charges**; “Education Fund” renamed **Education & Training Fund**.
- Optional heads printed only when used: Property Tax, Insurance Charges, Election Fund, Major Repairs Fund, Loan Instalment & Interest, Lease Rent / N.A. Tax.
- Rates moved from “premises type” to **charge categories** taken from the AGM of 25 Jan 2015 (MOM AGM-MOM/20150225) as amended on 07 Jul 2015 (AmendmentOfMom/20150707), effective 1 April 2015.
- Interest setting limited to 12% simple per year; non-occupancy limited to 10% of service charges.

### Added
- Unit fields: charge category, status (Own Occupied / Rented / Tenant / Commercial), construction cost certified by architect.
- Lift billing option: full year in one bill (default April) or spread monthly.
- Bills print a “basis of charges” line (editable in Settings).

### Billing rules
- AGM categories (₹ per month; lift ₹ per year): Residential flat A & C 1,300 / water 0 / lift 1,000; Residential used as commercial A & C 2,000 / 300 / 2,000; Commercial D wing (Gym D 201) 2,000 / 500; D wing clinic (D 101 A & B) 2,000 / 500; Shop without water 1,000 / 0; Shop with water tap 1,000 / 300; Shop (beauty parlour, pet shop, clinic, food shop, chicken centre) 1,000 / 500. Education & Training Fund ₹10 per unit per month.
- Non-occupancy = 10% of service charges for units marked Rented or Tenant.
- Penal interest is **simple**: base = arrears − unpaid interest already billed; payments clear unpaid interest first.

---

## [2.0.0] – 2026-11-11 – Accounting module

### Added
- **admin.html** (committee only): Dashboard, Bills, Payments, Units, Members, Website, Settings.
- Monthly bills in the Society’s printed format with bill numbers `UNIT/DDMMYYYY` (same as the October 2026 bills, e.g. `A101/01102026`); bills are never created twice for the same unit and month.
- Payments with numbered digital receipts `SS/<financial year>/<serial>` (e.g. `SS/2026-27/0001`), print / save as PDF, WhatsApp share, cancellation (receipt kept, marked Cancelled).
- Unit ledgers with running balance; corrections (debit / credit) with “opening balance verified” flag.
- Receipt register with monthly CSV download.
- **print.html**: one bill, one receipt, or all bills of a month (one per A4 page).
- One-time **opening import**: 65 units with balances as on 30 Sep 2026 and the October 2026 bill (arrears + ₹6,500 “Any Others Charges”).
- Public dues page reads live balances (`public/dues`) and falls back to `data/dues.json`.
- Notices, committee and contact details editable from Website tab (`public/site`).
- Member accounts show bills, receipts and ledger with download links.
- **GitHub Actions** workflow `monthly-bills.yml`: generates bills at 06:00 IST on the 1st of each month.
- Firestore rules for units, ledgers, bills, payments, settings, counters.

### Data corrections from the October 2026 bills
- B 01 (Rehana Inamdar): owner outstanding ₹2,06,500 (statement row had only one figure); BPM ₹24,800.
- A 100 named Mr/Mrs Patwari; D 202 named Mr Mahmood.
- A 100, C 100, D 202 had no balance in the statement: imported at ₹0 opening + October bill, flagged “Under verification”.

### Deployment
- Site moved from `public/` (GitLab) to `docs/` for GitHub Pages; `.nojekyll` added.

---

## [1.1.0] – 2026-11-11 – GitHub Pages

### Changed
- Hosting changed from GitLab Pages to GitHub Pages (`main` branch, `/docs` folder) with custom domain sunshreesuntec.com (DNS at Hostycare: four A records to GitHub Pages, `www` CNAME to chanchalsakardeqh.github.io).

### Fixed (deployment note)
- `firebase-config.js` must contain only `export const firebaseConfig = {…}`. Pasting Firebase’s full snippet (`import … from "firebase/app"`) stops every page from loading (“Loading…”).

---

## [1.0.0] – 2026-11-11 – Website

### Added
- Public website: Home, About, Maintenance dues, Notices, Committee, Contact.
- Maintenance dues published with member names and amounts, grouped by A Wing, C Wing, D Wing, Upper Ground Floor shops and Lower Basement shops; owner outstanding and Builder Pending Maintenance (BPM) shown separately; search and block filter.
- Member registration with mobile number and email (both required), email verification, committee approval; approved members see only their own unit.
- Firebase Authentication + Firestore with security rules.
- Source data: Sundry Debtors – Group Summary 1 Apr 2018 – 30 Sep 2026 and the notice dated 16 Oct 2026.
