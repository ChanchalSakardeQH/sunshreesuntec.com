# Records in the Society's Google Drive

Expense bills (photos, scans), saved monthly reports and, since 3.12, the unit files' documents and backups
are kept in the Society's own Google account (sunshreesuntec@gmail.com), in a private folder:

```
Sunshree Suntec Society Records/
  Expenses/
    FY 2026-27/
      2026-11 November/
        Submitted/   ← new bills, waiting for approval
        Approved/    ← approved bills, named with their voucher number (EXP-2026-27-0007 …)
        Rejected/
  Reports/
    FY 2026-27/
      2026-11 November/   ← monthly reports saved from Expenses → Monthly report
  Units/
    C Wing/
      C 202/
        C 202 unit file backup.json   ← everything about the unit; updated whenever a unit record is saved
        Members and shares/           ← Index II, share certificate, nomination …
        Tenants and agreements/       ← leave and licence agreement, police verification …
        Communication/                ← members' applications, the Society's replies, notices to the unit
        Electricity (MSEB)/           ← electricity bills
        Property tax (PMC)/           ← property tax bills and receipts
        Ownership (sale deeds and Index II)/   ← uploaded by the member (3.13)
        Occupants/                    ← who lives in the unit, uploaded by the member
        Agreements/                   ← member portal agreements as accepted (PDF), also emailed to the member
  Correspondence/
    FY 2026-27/
      Inward/                         ← letters and documents received (DDR, PMC, MSEDCL, banks, AMC vendors …), IN-2026-27-0001 …
      Outward/                        ← letters sent, OUT-2026-27-0001 …
      Correspondence register FY 2026-27.json   ← backup of the year's register
  Reference documents/
    Interest on arrears/              ← rules, articles, resolutions shown to members; a copy of each interest calculation (INT-2026-27-001 …)
```

Unit documents are seen on the accounts page by those who may read the unit's records; they are added by those
with *maintain unit files*. Only the committee can read a backup back (Settings → Restore).

Nothing in the folder is shared or public. People see a bill only on the accounts page, and only if the
accounts' security rules let them read that expense (the person who added it, approvers, payers, and those with *view accounts*).

A small Google Apps Script, installed once in the Society's account, puts the files there. It takes about 15 minutes.

## Install (once)

1. Sign in to Google **as sunshreesuntec@gmail.com** (use a private / incognito window if you have several accounts).
2. Open <https://script.google.com> → **New project**. Name it *Sunshree Suntec records*.
3. Delete what is in `Code.gs` and paste the whole of [`Code.gs`](Code.gs) from this folder. Save.
4. **Project Settings** (gear icon):
   - tick **Show "appsscript.json" manifest file in editor**, then open `appsscript.json` in the editor and replace it with [`appsscript.json`](appsscript.json) from this folder. Save;
   - under **Script Properties** → *Add script property*, add:
     | Property | Value |
     |---|---|
     | `FIREBASE_API_KEY` | the `apiKey` from `docs/assets/js/firebase-config.js` |
     | `FIREBASE_PROJECT_ID` | `sunshreesuntec-74743` |
     | `ROOT_FOLDER` | *(optional)* folder name, default `Sunshree Suntec Society Records` |
5. In the editor choose the function **setup** and press **Run**. Google asks for permission:
   *Review permissions* → choose sunshreesuntec@gmail.com → *Advanced* → *Go to Sunshree Suntec records (unsafe)* → **Allow**.
   (The warning appears because the script is the Society's own, not published by Google. It asks for access to the
   account's Drive, to make the folder and save bills, and to reach the accounts database, to check who is asking.)
   The log shows the new folder.
6. **Deploy** → **New deployment** → type **Web app**:
   - *Execute as*: **Me (sunshreesuntec@gmail.com)**
   - *Who has access*: **Anyone**
   → **Deploy** → copy the **Web app URL** (ends in `/exec`).
   "Anyone" lets the accounts pages reach it; the script itself refuses anyone who isn't signed in to the
   accounts with permission.
7. On the website: Accounts → **Expenses** → **Set-up** → paste the URL → **Test and connect**. It answers with the
   folder name and the account. Done.

## Updating the script later

**3.20 (script version 9):** the Rules, GRs and forms library: uploads of kind *library* (*Library › category*),
*libraryFromLink* (saves a copy of a document from its web address; uses the existing permission to fetch web addresses)
and opening library documents for the team and approved members. No new permission is needed.

**3.19 (script version 8):** adds *committeeUndertaking* (PDF of a committee member's accepted undertaking in
*Committee › Undertakings*, emailed to them with a copy to the Society), uploads of kind *committee* (*Committee › M-20 bonds*
and *Committee › Registrar intimation*) and opening those files (committee only). No new permission is needed.

**3.18 (script version 7):** adds *accessRequest* (a member's application to view the Society's accounts, emailed to the
Society with an acknowledgement to the member) and *accessDecision* (the Chairman, Secretary, Treasurer or Accountant
emails the decision). No new permission is needed.

**3.16 (script version 6):** adds *memberMail*, used by Members → *Reminders and invitations* → **Email the selected
from the Society's account**. No new permission is needed (email was allowed for 3.13). Paste the new `Code.gs`, save,
and deploy a new version as below. Until then the Members tab says *Needs the Google Drive script version 6* and the
WhatsApp and Email buttons (from your own phone or computer) still work.

If Google's permission screen offers a list of permissions with tick boxes, tick **Select all** (or at least *Send email
as you*); an unticked permission gives *You do not have permission to call MailApp…*.

**3.13 needs this once, with one extra step:** the script now also emails members their portal agreement, so it needs
permission to send email from the Society's account. After pasting the new `Code.gs`:
1. open `appsscript.json` in the editor and replace it with the new [`appsscript.json`](appsscript.json) (it adds the
   `script.send_mail` permission); save;
2. choose the function **setup** and press **Run**; Google asks for permission again: *Review permissions* →
   sunshreesuntec@gmail.com → *Advanced* → *Go to Sunshree Suntec records* → **Allow** (it now lists *Send email as you*);
3. deploy a new version as below.
Agreements are emailed from sunshreesuntec@gmail.com with a copy to the same address. A free Gmail account can send
about 100 such emails a day; if the limit is reached the copy is still saved in Drive and can be sent again the next
day from the unit file (*From the member → Send copy again*).

**3.12 needs this once:** the script gained unit documents and backups (`version: 2`). Until the new version is
deployed, adding a scan to a unit record says *Unknown request* or files it wrongly, and backups fail.


Paste the new `Code.gs`, save, then **Deploy** → **Manage deployments** → pencil icon → *Version: New version* → **Deploy**.
The URL stays the same, so nothing changes on the website.

## If something goes wrong

| Message | Fix |
|---|---|
| *The storage script is not set up* | Step 4: the two Script Properties are missing or misspelt. |
| *Your sign-in has expired* (for everyone) | The `FIREBASE_API_KEY` property is wrong, or the key is restricted to websites in Google Cloud console: allow the Identity Toolkit API for it. |
| *This account has no access to the Society's accounts* | The person isn't committee or staff, or their access was removed. |
| *Please accept the staff agreement* | The staff member must sign in to the accounts page and accept the agreement first. |
| *Bill storage isn't connected yet* | Step 7. |
| Uploads fail after the script was edited | Deploy a **new version** (see *Updating*). |

Moving the records folder elsewhere in the Drive is fine (the script remembers it by its ID). Don't delete it, and
don't delete or rename the files inside; the vouchers point to them.
