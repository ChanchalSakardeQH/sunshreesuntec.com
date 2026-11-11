# sunshreesuntec.com – website and society accounts

> How it works: [DOCUMENTATION.md](DOCUMENTATION.md). What changed: [CHANGELOG.md](CHANGELOG.md).

Website and maintenance accounting for **Sunshree Suntec Co-op. Hsg. Soc. Ltd.**, NIBM Road, Kondhwa Khurd, Pune 411048.

- **Website (public):** Home, About, Maintenance dues, Notices, Committee, Contact. Dues update by themselves whenever a bill, payment or correction is saved.
- **Accounts (`/admin.html`, committee only):** monthly bills in the Society's bill format, payments with numbered digital receipts, unit ledgers, corrections, member access approvals, notices and contact details.
- **Members:** register with mobile + email → committee approves → member downloads their own bills and receipts.
- **Hosting:** GitHub Pages (from the `docs/` folder). Data and logins: Firebase (free Spark plan). Monthly bills: GitHub Actions.

```
docs/                         ← the website (GitHub Pages source: main /docs)
  index.html                  public site + member login
  admin.html                  committee accounts
  print.html                  bill / receipt / all bills of a month, print or save as PDF
  assets/js/billing-core.js   billing rules (bill no., charges, amount in words) – shared with the GitHub Action
  assets/js/accounts.js       bills, payments, receipts, corrections (Firestore transactions)
  assets/js/defaults.js       society, bank and October 2026 bill details used at first set-up
  assets/js/firebase-config.js← paste your Firebase web config here
  data/dues.json              balances as on 30 Sep 2026 (used for the one-time import and as fallback)
scripts/generate-bills.mjs    monthly bill run used by GitHub Actions
.github/workflows/monthly-bills.yml   runs on the 1st of every month, 06:00 IST
firestore.rules               paste into Firebase console → Firestore → Rules
```

---

## 1. Publish the website

1. Push this folder to the GitHub repo (`ChanchalSakardeQH/sunshreesuntec.com`).
2. Repo → **Settings → Pages** → Branch `main`, folder **`/docs`** → Save.
3. Keep `sunshreesuntec.com` in **Custom domain** and tick **Enforce HTTPS** once it's available.

To try it on your PC first: `cd docs` then `python -m http.server 8000` and open http://localhost:8000

## 2. Firebase (database and logins)

1. https://console.firebase.google.com → **Add project**.
2. **Authentication → Get started → Email/Password → Enable.**
3. **Authentication → Settings → Authorized domains:** add `sunshreesuntec.com`, `www.sunshreesuntec.com`, `chanchalsakardeqh.github.io` (and `localhost` is already there).
4. **Firestore Database → Create database** → production mode → location `asia-south1 (Mumbai)`.
5. **Firestore → Rules:** paste the whole of `firestore.rules` → **Publish**. Do this again whenever the file changes.
6. **Project settings → Your apps → Web (`</>`)** → register → copy the values into `docs/assets/js/firebase-config.js` → commit and push.
7. **Make the committee accounts admins:**
   - Create each committee member's login: **Authentication → Users → Add user** (email + password).
   - Copy their **User UID**.
   - **Firestore → Start collection** `admins` → Document ID = that UID → field `role` (string) = `Treasurer` / `Chairman` / `Secretary`.
   - They can now sign in at `https://sunshreesuntec.com/admin.html`.

## 3. First day in Accounts

1. **Settings → Import opening balances.** Creates the 65 units with their balance as on 30 Sep 2026 and posts the October 2026 bill (arrears + ₹6,500 any other charges) with the same bill numbers that were sent (`A101/01102026` …). Runs once.
   - A 100, C 100 and D 202 had no balance in the statement. They start at ₹6,500 and show "Under verification" until you add a correction with **Opening balance is now verified** ticked (Units → Open → Add a correction).
2. **Settings → Charge categories and rates.** Pre-filled with the AGM rates of 25 Jan 2015 as amended on 07 Jul 2015:

   | Category | Maintenance | Water | Lift (per year) |
   |---|---|---|---|
   | Residential flat (A & C wing) | 1,300 | – | 1,000 |
   | Residential flat used as commercial (A & C wing) | 2,000 | 300 | 2,000 |
   | Commercial D wing (Gym D 201) | 2,000 | 500 | – |
   | Commercial D wing clinic (D 101 A & B) | 2,000 | 500 | – |
   | Shop without water | 1,000 | – | – |
   | Shop with only water tap | 1,000 | 300 | – |
   | Shop: beauty parlour / pet shop / clinic / food shop / chicken centre | 1,000 | 500 | – |

   Education & Training Fund is ₹10 per unit per month. Change any figure when the General Body revises it.
3. **Units → Open** for each unit: check the **charge category** (all shops start as "without water"; move the ones with a tap or heavy use), choose **Served by lift** (C wing units start on the C wing lift, D wing units on the D wing lift, A wing and shops on none), set **status** (Rented / Tenant adds non-occupancy charges at 10% of service charges) and, once adopted, the **construction cost certified by the architect** (sinking fund 0.25% and repairs fund 0.75% per year are then billed monthly).
4. **Settings → Penal interest** stays 0 until the General Body fixes a rate (maximum 12% simple per year). Lift is billed once a year in April by default; you can switch to monthly.
5. **Website → Committee and contact.** Fill in Secretary and Treasurer names and the contact number printed on bills.
6. **Bills → Generate bills** for November 2026 (the current month), then **Print all bills** to save one PDF for everyone.

## 3a. Monthly Maintenance Calculation (MCS Rules 2026)

**Settings → How bills are calculated** has two methods. Bills keep using the AGM 2015 category rates until you switch.

| Head | How it is calculated | Basis |
|---|---|---|
| Service charges | Monthly common expenses ÷ number of units (equal) | Bye-laws 65(g), 66, 67; Rule 106C-12 |
| Lift | Monthly lift expenses ÷ units served by that lift (shops without a lift excluded); AMC / repair invoices shared through the **Lift** tab | Rule 106C-12 |
| Water | Monthly water expense ÷ total inlets × inlets of the unit | Bye-law 67(a)(2) |
| Repairs & maintenance fund | Construction cost per sq ft × carpet area × 0.75% ÷ 12 | Bye-law 13(a) |
| Sinking fund | Construction cost per sq ft × carpet area × 0.25% ÷ 12 | Bye-law 13(c) |
| Property tax, insurance | Yearly amount × unit area ÷ total area ÷ 12 (only if the society pays them) | Bye-law 67(a) |
| Non-occupancy | 10% of service charges for Rented / Tenant units | Bye-law 43, 67(a)(10) |
| Parking | Vehicles × rate fixed by the General Body | Bye-law 67(a)(7) |
| Major repairs fund | **Bills** → extra charge → "Total, by carpet area" | Rule 106C-12 |
| Welfare fund | Voluntary amount on the unit | Rule 106C-12 |
| Interest | Simple interest on unpaid principal, maximum 12% p.a. | Bye-law 71; Rule 106C-12 |
| Penalty | At most ₹5,000 a year per member | Bye-law 165 |

Steps:
1. **Units → Enter area, inlets and parking for all units**: fill carpet area, water inlets, vehicles and lift for every unit → **Save all units**.
2. **Settings → How bills are calculated**: enter the society's monthly expenses (service and lift), monthly water expense, construction cost per sq ft, property tax / insurance if paid by the society, and parking rates → **Save calculation**.
3. **Preview next month's bills** and **Download CSV** to place before the General Body.
4. After the General Body approves, set **Charge basis** to the Monthly Maintenance Calculation and save. Every bill shows how each line was worked out (e.g. "4 inlets × ₹78").

## 4. Monthly bills on GitHub (automatic)

The workflow `.github/workflows/monthly-bills.yml` runs at 06:00 IST on the 1st of every month and creates that month's bills, exactly like **Bills → Generate bills**. A month is never billed twice, so running it by hand as well is safe.

One-time set-up:
1. Firebase console → **Project settings → Service accounts → Generate new private key**. A JSON file downloads. **Never commit this file** (`.gitignore` already blocks the usual names).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the entire contents of the JSON file.
3. Test it: **Actions → Monthly maintenance bills → Run workflow** (optionally type a month like `2026-12`).

GitHub pauses scheduled workflows in a repo with no commits for 60 days. If that happens, GitHub emails you; click **Enable workflow** on the Actions tab, or just generate bills from the Accounts page.

## 5. Day-to-day

| Task | Where |
|---|---|
| Payment received (NEFT, UPI, cheque, cash) | **Payments** → choose unit → amount, date, UTR / cheque no. → **Save payment and create receipt**. Receipt numbers run per financial year: `SS/2026-27/0001`. |
| Send the receipt | Open receipt → **Print / Save as PDF**, or **Share on WhatsApp** (the member opens it after signing in). |
| Cheque bounced / wrong entry | **Payments → Cancel** on that receipt. It stays in the register marked Cancelled and the amount goes back on the unit. |
| Correct a balance | **Units → Open → Add a correction** (debit adds to dues, credit reduces them). |
| Month's collection for the accountant | **Payments → Download CSV** (opens in Excel / Tally import). |
| Lift AMC invoice, repair, wear & tear, parts, licence | **Lift** → amount, which lift, bill month to start, number of instalments. Shared equally by the units served by that lift and shown on their bills as “Lift AMC / Repairs (shared)” with the invoice details. Add it before that month's bills are generated. |
| One-off charge for a month (e.g. repairs levy) | **Bills** → Extra one-off charge + amount, for all units or one block, before generating. |
| New notice on the website | **Website → Notices**. |
| Approve a member's login request | **Members**. |

Every bill, payment, cancellation and correction updates the unit's ledger, its balance and the public dues page together in one database transaction.

## 6. What members see

1. They register on the website (**Member login → Register**) with name, unit, 10-digit mobile and email, and confirm their email.
2. The committee approves the request under **Members** (a warning shows if someone is already approved for that unit).
3. After approval they see their current balance, every bill and receipt (view / download as PDF) and the full account, for their own unit only. `firestore.rules` enforces this on the server.

## 7. Costs and limits

The free Firebase Spark plan allows 50,000 database reads and 20,000 writes per day. A visit to the dues page uses 2 reads; a full month of 65 bills uses about 300 writes. A society of this size stays well inside the free limits. GitHub Pages and GitHub Actions are free for public repositories.

Keep a monthly backup: download the receipt CSV each month and print the month's bills to PDF.
