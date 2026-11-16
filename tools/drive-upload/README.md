# Bill storage in the Society's Google Drive

Expense bills (photos, scans) and saved monthly reports are kept in the Society's own Google account
(sunshreesuntec@gmail.com), in a private folder:

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
```

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
