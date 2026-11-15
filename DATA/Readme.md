

15 Nov 2026

I’ll start by opening the 2011–2018 accounts zip to see what’s inside, then build it into the archive, the yearly reports and the unit files.

These are scans (no text layer), 206 pages in all. I’ll look at them page by page to see what each year’s file contains.

The sheets landed in a subfolder. I also see work in the scratchpad from the earlier (interrupted) attempt at this request — let me check what it already found.

The earlier attempt got quite far: compact copies of the 7 PDFs and extracted data files. Let me see how much of it reached the site code before it was interrupted.

The scan confirms B 10 = ₹4,800 on 31 March 2018, so the audit figure is right and the Tally opening (₹300) is a genuine difference to flag. Now internal consistency checks across every year:

The 2011-12 to 2017-18 audited accounts are now part of the accounts (version 3.1.0), so every year from 2011-12 to today can be viewed. I tested it with a stand-in for Firebase, not your live database.

**1. Archived PDFs for logged-in users**

- I made compact copies of the 7 audit reports: 25–33 pages each, about 0.6–0.85 MB instead of 14–27 MB, still clear to read.
- The committee uploads them in a new **Documents** tab.
- Only approved members and the accounts team can open them. Members find them in **My account → Society documents**.
- The files are stored inside the Society’s database, because Firebase’s file storage would need the paid plan. An uploaded report opens back exactly as it was.

**2. Year-wise accounting**

- Reports

   now start from 2011-12. For 2011-12 to 2017-18 they use the audited figures:

  - **Year summary** and **Member-wise statement**, based on the audited figures;
  - **Audited statements**, showing the full income & expenditure, balance sheet, debtors, auditor’s remarks and committee for the year, with a button to open that year’s report;
  - **Over the years**, a new view with every year side by side: income, expenditure, surplus, billing, collections, members’ dues and builder-pending.

- Billing by head and collections aren’t available for those years, because no individual bills or receipts exist for them.

**3. More transparency for members**

- **Unit file and My account** show each unit’s balance on 31 March of every year: from the audits, then Tally, then these accounts.
- They also show the builder-pending amount by year, and the name the unit was listed under in each audit.
- Members can see each audited year’s summary, statements and auditor’s remarks.

**Checks on the figures**

- All 7 balance sheets balance to the paisa, and each year’s surplus carries forward correctly into the next.
- The member-wise dues add up to the audited totals in every year that has a complete list.
- The audited dues on 31 March 2018 (₹16,11,920) agree with the Tally opening on 1 April 2018 for **58 units, to the rupee**. Four units differ:

| Unit  | Difference (₹) | Why                                                          |
| ----- | -------------- | ------------------------------------------------------------ |
| A 103 | 30,500         | Tally ledger starts later, under a new owner                 |
| C 100 | 31,500         | Tally ledger starts later, under a new owner                 |
| C 502 | 43,000         | Tally ledger starts later, under a new owner                 |
| B 10  | 4,500          | Audit shows ₹4,800, Tally ₹300; I confirmed the ₹4,800 on the scan |

These four are marked **Check** in their unit files.

**Pages missing from the scans** (the reports show a note for each year):

- **2012-13:** the file contains the 2011-12 income & expenditure page. The surplus for that year comes from the balance sheet.
- **2013-14:** the residential members’ list is missing, so flat-wise balances for 31 March 2014 aren’t available.
- **2014-15:** a page of the members list is missing.

If you have complete copies of those years, the committee can upload them as well.

**To install:**

1. Unzip `sunshreesuntec.com.zip` over your repo and push.
2. **Publish the new `firestore.rules`** in Firebase.
3. In Accounts, go to **Settings → Audited accounts** and load `audited-accounts-2011-2018.json`.
4. In **Documents**, upload the 7 PDFs from `audited-accounts-pdfs-2011-2018.zip`. Their file names already carry the year, so each report links to its year automatically.

Keep both `.json` files private and out of GitHub, because they contain every member’s balances. `tally-ledgers-2018-2026.json` is included again because my workspace was reset and this is the regenerated copy (same 63 units and 2,329 entries). The Tally export tool for the accountant’s laptop, from last time, is also in the site zip under `tools/tally-export`.