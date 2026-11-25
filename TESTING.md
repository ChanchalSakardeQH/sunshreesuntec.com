# Testing with a test copy (3.21)

A **test copy** is the same website connected to a **separate Firebase project** (its own database and sign-ins) and a
**separate copy of the Drive script** (its own folder, *TEST Sunshree Suntec Records*). You can register, approve,
pay, upload and email as an owner, a tenant, the Accountant, a watchman or the Chairman. Nothing reaches the Society's
real records, real Drive folder or real members.

- **Same Gmail, different role.** Sign-ins belong to a project, so the same Gmail can be the Secretary on the real site and a plain owner on the test copy.
- **The test switch is opt-in.** The test project is used only:
  - on your own computer (`localhost`), or
  - on test addresses you list yourself.

  It is **never** used on sunshreesuntec.com or in the Android app, and every test page shows a red **TEST COPY** banner, printed receipts included.
- **Test emails are marked.** Every email the test copy sends has **[TEST]** in the subject and a red note at the top.
- **The two copies can't mix.** A test page can't use the real Drive script (the real script doesn't accept sign-ins from the test project), and the test script never writes into the real folder.

---

## A. One-time set-up (about 30 minutes)

### 1. A Firebase project for testing
1. Sign in to Firebase console with **sunshreesuntec@gmail.com** → **Add project** → name it `suntec-test` (Google Analytics off). The free Spark plan is enough.
2. **Build → Authentication → Get started → Sign-in method**: enable **Google** (support email: the Society's), and **Email/Password** if you want to test password sign-in.
   **Settings → Authorized domains**: `localhost` is already there; add `chanchalsakardeqh.github.io` only if you also make the phone test site (step 5).
3. **Build → Firestore Database → Create database**: choose the same location as the real project, start in production mode. Then **Rules**: paste the website's `firestore.rules` and **Publish**.
4. **Project settings (gear) → General → Your apps → Web (</>)**: register an app called `suntec-test web` and copy the `firebaseConfig` it shows.

### 2. Tell the website about it
Open `docs/assets/js/firebase-config.js` and **add** these lines below the existing real `firebaseConfig`, which stays exactly as it is:

```js
export const testFirebaseConfig = {
  apiKey: '…', authDomain: 'suntec-test.firebaseapp.com', projectId: 'suntec-test',
  storageBucket: '…', messagingSenderId: '…', appId: '…'
};
// Optional: addresses of a test website for phones (step 5). Leave the list empty if you test only on the computer.
export const testSites = ['chanchalsakardeqh.github.io/suntec-test'];
```

Push it. The real site and the Android app don't change.

### 3. A test copy of the Drive script
1. In the Society's Google Drive, open the Apps Script project → **Overview (ⓘ) → Make a copy**. Rename the copy **TEST Sunshree Suntec records**.
2. In the copy: **Project Settings → Script properties**. Set:

   | Property | Value |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `suntec-test` |
   | `FIREBASE_API_KEY` | the test `apiKey` |
   | `ROOT_FOLDER` | `TEST Sunshree Suntec Records` |
   | `SITE_ADDRESS` | `http://localhost:8080/` (or your test site) |
   | `TEST` | `yes` |

   If `ROOT_FOLDER_ID` was copied across, **delete it**. The test copy would refuse to use the real folder anyway, but this keeps things clear.
3. Run **setup** once and allow the permissions. The log shows the new *TEST Sunshree Suntec Records* folder.
4. **Deploy → New deployment → Web app** (Execute as: Me; Who has access: Anyone) → copy the web app address.

### 4. Open the test site on your computer
In a Command Prompt or PowerShell:

```
cd <your website folder>\docs
python -m http.server 8080
```

Open **http://localhost:8080**. The red **TEST COPY (suntec-test)** banner must be at the top. If it isn't, check step 2.

### 5. (Optional) A test site for phones
1. Make a second GitHub repository named **suntec-test** and copy the contents of `docs` into it (including your `firebase-config.js`).
2. Turn on **Pages**. The address is `https://chanchalsakardeqh.github.io/suntec-test/`.
3. Add `chanchalsakardeqh.github.io` to the test project's authorized domains (step 1.2).

### 6. The first committee member and some data (on the test site)
1. Open **http://localhost:8080/admin.html** and sign in with your Gmail. It says you have no access, which is expected.
2. In the test Firebase project: **Authentication → Users**, copy your UID. Then **Firestore → Start collection `admins`**, document ID = that UID, with these fields:
   - `name` (string)
   - `role` (string): `Secretary`
   - `email` (string)
   - `active` (boolean): true
3. Reload. Accept the committee undertaking.
4. **Settings → Import opening balances** loads the units and opening balances, so the test copy looks like the real one. You can import again at any time.
5. **Expenses → Set-up**: paste the **test** script's web app address and **Test connection**. It must show the *TEST Sunshree Suntec Records* folder.

---

## B. Playing different people

Each person needs their own Google account, but any accounts you already have will do: your personal Gmail, the Society's Gmail, a family member's. Open each in its **own Chrome profile** (or an Incognito window) so several can be signed in at once.

| Role to test | Suggested account | How they get in |
|---|---|---|
| Secretary or Chairman | your Gmail | step A.6 |
| Owner of a flat | a second Gmail | registers on the member page; you approve |
| Family member or tenant | a third Gmail | registers as family or tenant; you approve |
| Accountant | the second or third Gmail, after removing its member login | registers as *Society staff*; you approve in Staff with role Accountant |
| Watchman or Housekeeping | any spare Gmail | same as the Accountant, with that role |

---

## C. Checklist: registration to daily use

Tick each line. If anything differs from **Expected**, note the step and send a screenshot.

### Owner (member)
| # | Do | Expected |
|---|---|---|
| 1 | Member page → **New here? Register** → owner of C 402, name, mobile → Continue with Google | *Request sent*; the committee sees it under Members → Requests waiting |
| 2 | Close Google's window halfway on another try | Members → *Tried but never registered* shows the name, unit and mobile with **WhatsApp the steps** |
| 3 | Committee: **Approve** | Approval message to send; the owner's next visit opens the member portal agreement |
| 4 | Owner: accept the agreement | Account opens; a **[TEST]** email with the PDF; the PDF in *TEST … › Units › C Wing › C 402 › Agreements* |
| 5 | Owner: Maintenance dues → Show amounts | Own unit's amount shown, other units masked |
| 6 | Owner: My unit's documents → upload a sale deed photo | Saved; committee sees it in Unit file → Member documents |
| 7 | Owner: Society accounts → apply (purpose) | *Waiting for the decision*; **[TEST]** email to the Society and to the owner |
| 8 | Committee (Chairman, Secretary or Treasurer): Members → Decide → Approve | Owner sees the audited accounts and documents; **[TEST]** decision email |
| 9 | Library: search a word inside a PDF | Found, with *Found inside the document*; **Open** works |

### Pre-registered member (3.22)
| # | Do | Expected |
|---|---|---|
| 1 | Committee: Members → Pre-register members by email → unit, name, relation, a spare Gmail | Listed as *Waiting for their first sign-in*; Email / WhatsApp invitation buttons |
| 2 | That Gmail: member page → Sign in with Google | *Welcome to the Society portal* with the unit and relation; confirm mobile |
| 3 | Confirm and continue | Straight to the agreement: declaration as text, no tick boxes; type name → I accept → account opens |
| 4 | Committee: Members | *Signed in, Agreement accepted*; the member is marked *Pre-registered* |

### Tenant or family member
| # | Do | Expected |
|---|---|---|
| 1 | Register as tenant of C 402 | Request shows *Tenant* |
| 2 | Approve with *Doesn't see the unit account* | Sees notices and the Library, no bills; can apply for Society accounts |
| 3 | Committee: decide *Not approve* with a reason | Tenant sees *Not approved* and the reason |

### Staff
| # | Do | Expected |
|---|---|---|
| 1 | Register as Society staff → committee approves in Staff as **Accountant** | First sign-in shows the staff agreement with the Accountant's access |
| 2 | Accountant: record a payment | Receipt (with the red TEST banner when printed) |
| 3 | Accountant: Members tab | Only *Applications to view the Society's accounts*, with **Decide** |
| 4 | Watchman: sign in | Only the Directory and expense photos; no money pages |
| 5 | Staff → Access by role: untick a permission for Watchman | Watchman loses it at the next sign-in |

### Committee
| # | Do | Expected |
|---|---|---|
| 1 | Staff → Managing Committee → make the owner **Chairman** | Asks before moving the present holder; the website Committee page updates |
| 2 | New Chairman signs in to the accounts page | Committee undertaking with the Chairman's responsibilities and the M-20 due date |
| 3 | Record the M-20 bond with a scan | *Received …*; scan in *TEST … › Committee › M-20 bonds* |
| 4 | End a term | Moved to Past committee members; no more access |

### Reminders and library
| # | Do | Expected |
|---|---|---|
| 1 | Members → Reminders → Agreement not accepted → WhatsApp | WhatsApp opens with the message; *Last reminded* updates |
| 2 | Accounts → Library → add a PDF from a link | Saved in *TEST … › Library › category*; *n words, p pages* |

### Membership transfers (3.23)
| # | Do | Expected |
|---|---|---|
| 1 | Accounts → Transfers → *Units with no transfer recorded* → Start… on a test unit (sale) | 12 documents; outgoing member prefilled |
| 2 | Mark two received, one *not needed*, add a scan, Save | *3 of 12*; scan in *TEST … › Units › wing › unit › Membership transfer* |
| 3 | *Print letter* on the submission letter | Letter with the unit, names, deed no. and the enclosures |
| 4 | Sign in as the test owner of that unit | *Membership transfer documents* shows the case and the scan opens |

### Bye-law forms (3.24)
| # | Do | Expected |
|---|---|---|
| 1 | Library → Add the bye-law forms in one go → choose all the PDFs of the set | Each listed with its number and law; *Add n forms* |
| 2 | Add them | Saved in *TEST … › Library › Statutory form*; words read |
| 3 | Transfers → checklists → *Use the bye-law forms from the Library* → Save | Forms linked; asks to update transfers in progress |
| 4 | Library page → *Which forms do I need?* → *Selling or buying a flat* | Forms in order with their guide; *Open the form* when signed in |

### Full backups and restore drill (3.25)
| # | Do | Expected |
|---|---|---|
| 1 | Test copy of the storage script: new `appsscript.json` and `Code.gs`; the Society account Editor of the TEST Firebase project; run **setupBackups** | Log: *First backup made* with the TEST project's counts; file in *TEST …/Backups/Full* |
| 2 | Test site → Settings → Full backups | Status shows that backup; set weekly, save |
| 3 | Delete a test payment, then *Restore… → Only what is missing* | The payment is back; nothing else changes |
| 4 | Move the test copy's own backups out of *TEST …/Backups/Full*, copy a real backup in, and run **restoreLatestBackupEverything** in the test copy | The TEST project holds the real data (the drill); clear it afterwards (section D) |

### Website settings (3.26)
| # | Do | Expected |
|---|---|---|
| 1 | Real site → Settings → *Download the settings file* | File *Website settings … .json* |
| 2 | Test site → Settings → *Restore from a file…* → that file | Compare: *Google Drive connection — from another site: not restored*; others Different / Not on the website |
| 3 | Tick all that differ → Restore | Test site has the real charges, agreements, roles and website content; *before restore* copy in *TEST …/Backups/Settings* |

### Notices, pause, library (3.28)
| # | Do | Expected |
|---|---|---|
| 1 | Bills → Demand / recovery notices → List the units with dues → Prepare | One set per unit: Marathi, English, bill, calculation; 18% / 12% clause |
| 2 | Website → Pause the website now; open the test site in a private window | Only the maintenance page; Resume brings it back |
| 3 | Library → tick two → Move to *Scanned copy*; click *Public* on one | Category and Drive folder change; it becomes Private |

### Payments reported by members (3.29)
| # | Do | Expected |
|---|---|---|
| 1 | Test member → My page → *Paid maintenance? Tell the Society* with a screenshot | Listed as waiting; emails to the TEST Society mailbox and the member |
| 2 | Test site accounts → Payments → *Payments reported by members* → Verify… → tick found → Verify | Receipt made, balance down; member sees *Verified* with the receipt; email |
| 3 | Another report → *Ask for details* → member adds a file | Back to waiting, round 2 |

### Charges to recover (3.30)
| # | Do | Expected |
|---|---|---|
| 1 | Bills → Charges to recover → Deemed Conveyance Legal Fee → ₹6,500 for all → on the bills of next month | Listed as waiting; next month's bills have the line |
| 2 | Legal Notice & Recovery Expenses → the units of a notice at ₹350 → debit now | Ledger entries; balances up by ₹350 |

### Bills for posting (3.35)
| # | Do | Expected |
|---|---|---|
| 1 | Bills → December 2026 | “N bills were revised …” with *Not sent before the correction: print without the note*; revised rows marked *Revised* |
| 2 | Press it | Rows say *Revised, no note*; Activity has *Revised-bill note shown or hidden* |
| 3 | **Print for posting** | For each unit: bill (no “Revised bill” line, corrected total), How this bill is worked out, annexures, ledger; the ledger's last balance equals the bill's total payable |
| 4 | Open one bill as a member | No revised note; *With the ledger* box shows the ledger |
| 5 | Print → Save as PDF, A4 | Each unit starts on a new page; **each bill is one page**, no “The page didn't start” box; long ledgers and Annexure A run over several pages with the column headings repeated, nothing overlapping |

### Page start check (3.34.1)
| # | Do | Expected |
|---|---|---|
| 1 | After uploading, open the accounts page and press Ctrl + F5 | Accounts open; footer *Software version 3.34.1* |
| 2 | (Test copy only) rename `assets/js/signin.js` on the test copy, open the accounts page, wait 12 s | *The page didn't start*, naming the missing file; rename it back |

### Activity trail (3.34) — on the test copy
| # | Do | Expected |
|---|---|---|
| 1 | Sign in as a test Accountant (staff) → record a payment, add a correction, edit a unit's rate | Accounts → Activity (as committee): three entries with the Accountant's name and role, *staff*, balance before → after, the receipt no., the old → new rate |
| 2 | On the correction → **Reverse with an opposite entry** | Ledger has the opposite entry dated today; balance back; original shows *Corrected … by …*; the new entry says *Correction of an earlier entry* |
| 3 | On the receipt → **Cancel this receipt** | Receipt marked cancelled with the reason; balance back |
| 4 | **Check all balances against their ledgers** | “All … balances match” (or the units that don't) |
| 5 | Unit file → **Who changed this account** | The trail for that unit only |
| 6 | **Export CSV** | Opens in Excel with all columns |
| 7 | Turn on *Require an entry*; record a payment with website 3.34 | Works. (With a pre-3.34 copy it is refused: “Missing or insufficient permissions”.) |
| 8 | Sign in as a staff member without *See the activity trail* | No Activity tab |

### App: Google refusing the app (3.33.1)
| # | Do | Expected |
|---|---|---|
| 1 | Install a test APK signed with a key whose SHA-1 is **not** in the test Firebase project → *Continue with Google* | Red “Google didn’t accept the sign-in from this app…”, grey line with *app-not-accepted* and the SHA-1, then “Open sunshreesuntec.com in the phone’s browser?” |
| 2 | Accounts → Members → Sign-in history | *Failed*, *app-not-accepted (Google refused the app…)*, red box with the SHA-1 to add |
| 3 | Add that SHA-1 in the test Firebase project, wait 5 minutes, try again | Signed in |

### Member agreement – dues of the unit (3.33)
| # | Do | Expected |
|---|---|---|
| 1 | Accounts → Members → Member portal agreement → *Add the section on dues of the unit* → Preview | Section *Dues of the unit, detailed statements and reconciliation* after maintenance charges; pressing again says it is already there |
| 2 | Publish as the next version; sign in as a test owner | Asked to accept again; the declaration has five lines, the third about arrears and the 10-day dispute |
| 3 | Print a bill with *How this bill is worked out* | A box on disputing within 10 days with proof, on the explanation and on Annexure B; the bill note says 10 days |

---

## D. Clearing the test copy

- **Data:** in the **test** Firebase project, Firestore → delete the collections, or delete the whole `suntec-test` project and make a new one.
- **Files:** delete the *TEST Sunshree Suntec Records* folder in Drive.
- **To stop testing:** remove `testFirebaseConfig` from `firebase-config.js`; nothing else changes.

Check the project name in the Firebase console header before deleting anything: **suntec-test**, never the real project.
