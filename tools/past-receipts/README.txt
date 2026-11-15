How past-receipts-2011-2016.json was made from "MS EXCEL SHEET FROM PAST COMMITTEE.zip"
(kept so the conversion can be repeated or checked; the Excel files and the JSON are private and are not in this repository)

  python3 -I parse.py "<folder with the Excel files>" receipts-raw.json
  python3 -I dates.py receipts-raw.json receipts-dated.json
  python3 -I build.py receipts-dated.json past-receipts-2011-2016.json

parse.py   reads every per-unit sheet in A-D-WING.xlsx, C-WING -SUNTEC.xlsx, BASEMENT-SHOPS.xlsx, GROUND-FLOOR-SHOPS.xlsx
           (sheet C001 = C 100, the C wing stilt parking unit).
dates.py   Excel (US settings) read dates typed as dd/mm/yy as mm/dd/yy whenever the day was 12 or less, so those
           cells hold day and month swapped. Text cells kept what was typed. Receipt numbers rise with time across
           the Society, so each date is checked against nearby receipts; year slips (e.g. 2017 for 2015, 2023 for
           2013) are corrected and flagged for checking.
build.py   classifies each line (maintenance, lift AMC, builder pending, transfer fee …), marks duplicates,
           cancelled and repeated lines (not counted), and flags anything that needs checking against the
           physical receipt book. GF 18's sheet is a copy of GF 19's and is skipped.
