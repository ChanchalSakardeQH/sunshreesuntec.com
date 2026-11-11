# Changelog

All notable changes to the Sunshree Suntec CHS website and accounting software (sunshreesuntec.com).
Versions follow `MAJOR.MINOR.PATCH`: MAJOR for a new module, MINOR for new features or changed billing rules, PATCH for fixes.
Every change to how an amount is calculated is listed under **Billing rules** so a bill can always be traced to the rules in force when it was generated.

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
