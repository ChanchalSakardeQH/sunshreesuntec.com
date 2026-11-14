##### SUNSHREE SUNTEC CHS - EXPORT ALL TALLY DATA FOR 

##### ***sunshreesuntec.com***

**What this does**
  Reads the Society's books from Tally on the accountant's laptop and saves them in ONE file
  that the committee loads in sunshreesuntec.com/admin.html. Nothing in Tally is changed.
  It exports the company details, all groups, all ledgers (opening/closing balance, address,
  phone, email) and every voucher from the start of the books, then checks that every
  ledger's opening balance + vouchers = Tally's closing balance.

**Works with**
  **TallyPrime** (any release) and **Tally.ERP 9**, on Windows 10 / 11. Uses Windows PowerShell,
  which is already on every Windows PC. No installation needed.

**STEP 1 - Let Tally answer on port 9000 (one time)**
  TallyPrime:  Help (F1) > Settings > Connectivity > Client/Server configuration
               TallyPrime acts as: Both      Enable ODBC: Yes      Port: 9000
  Tally.ERP 9: Gateway of Tally > F12 Configure > Advanced Configuration
               Tally.ERP 9 is acting as: Both      Enable ODBC Server: Yes      Port: 9000
  Close and reopen Tally. To check: open http://localhost:9000 in a browser on the same
  laptop; it should say the Tally server is running.

**STEP 2 - Open the Society company in Tally**
  Keep only the Society company open if possible.

**STEP 3 - Run the export**
  Copy this folder to the laptop and double-click  Export-TallyData.bat

  - If several companies are open it asks which one.
  - It reads month by month; a few minutes for 8 years.
  - At the end it prints "Balance check: every ledger agrees with Tally." (or lists the ledgers
    that differ).
    The result is on the Desktop in the folder TallyExport:
     tally-export-<company>-<date>.json   <- the file to load
     export-log.txt                       <- what happened (send it if something looks wrong)
     raw\                                 <- Tally's original replies, for checking

  **Optional, from PowerShell:**
     .\Export-TallyData.ps1 -Company "Sunshree Suntec Co Op Hsg Society LTD" -FromDate 2018-04-01 -ToDate 2026-11-13

**STEP 4 - Load it on the website**
  sunshreesuntec.com/admin.html -> Settings -> Tally migration -> choose the .json file.
  Check the member ledger -> unit matches, set "Tally history up to" (normally 30-09-2026,
  the day before these accounts took over), keep "Also keep the whole Tally books" ticked,
  and click Migrate Tally data.

**KEEP THE FILE PRIVATE**
  It contains every member's account and the Society's bank and expense entries. Do not
  e-mail it widely, and never put it in the GitHub repository or on the website.
  Delete the TallyExport folder from the laptop once it is loaded and a copy is kept in the
  Society's own records.

**If it does not work**
  "Could not reach Tally"         -> Tally is closed, the company is not open, or Step 1 not done.
  Windows blocks the script       -> right-click Export-TallyData.ps1 > Properties > Unblock, then run the .bat again.
  "could not be read as XML"      -> send raw\<file>.xml and export-log.txt to the person maintaining the website.
