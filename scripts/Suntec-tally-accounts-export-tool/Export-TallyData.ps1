<#
  Sunshree Suntec CHS - export all accounting data from Tally for sunshreesuntec.com

  Run on the accountant's Windows laptop, with TallyPrime (or Tally.ERP 9) OPEN and the
  Society's company LOADED. Tally must allow connections on port 9000 (see README.txt).

  What it exports (read-only: nothing in Tally is changed):
    - company details, all groups, all ledgers (opening / closing balance, address, phone, email)
    - every voucher (date, type, number, narration, all ledger lines) from the start of the books
  Output (on the Desktop, folder TallyExport):
    - tally-export-<company>-<date>.json   -> load this in sunshreesuntec.com/admin.html, Settings -> Tally migration
    - raw\*.xml                             -> Tally's original replies, kept for checking
    - export-log.txt                        -> what was done and the balance check

  Usage:  double-click Export-TallyData.bat
     or:  powershell -ExecutionPolicy Bypass -File Export-TallyData.ps1 [-Company "Name"] [-FromDate 2018-04-01] [-ToDate 2026-11-13]
#>
param(
  [string]$TallyUrl = "http://localhost:9000",
  [string]$Company = "",
  [string]$FromDate = "",
  [string]$ToDate = "",
  [string]$OutDir = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'TallyExport')
)

$ErrorActionPreference = 'Stop'
$script:Log = New-Object System.Collections.Generic.List[string]
function Say([string]$msg, [string]$color = 'Gray') {
  Write-Host $msg -ForegroundColor $color
  $script:Log.Add(("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg))
}
function XmlEsc([string]$s) { return [Security.SecurityElement]::Escape($s) }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$RawDir = Join-Path $OutDir 'raw'
New-Item -ItemType Directory -Force -Path $RawDir | Out-Null

# ---------- talking to Tally ----------
function Invoke-Tally([string]$xml, [string]$rawName) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($xml)
  try {
    $req = [Net.HttpWebRequest]::Create($TallyUrl)
    $req.Method = 'POST'; $req.ContentType = 'text/xml;charset=utf-8'; $req.Timeout = 900000; $req.ReadWriteTimeout = 900000
    $req.ContentLength = $bytes.Length
    $st = $req.GetRequestStream(); $st.Write($bytes, 0, $bytes.Length); $st.Close()
    $resp = $req.GetResponse(); $rs = $resp.GetResponseStream()
    $ms = New-Object IO.MemoryStream; $rs.CopyTo($ms); $resp.Close()
    $raw = $ms.ToArray()
  } catch {
    throw "Could not reach Tally at $TallyUrl. Is Tally open with the company loaded, and is it set to act as Server/Both on port 9000? ($($_.Exception.Message))"
  }
  # Tally may answer in UTF-16 (Unicode) or UTF-8
  if ($raw.Length -ge 2 -and $raw[0] -eq 0xFF -and $raw[1] -eq 0xFE) { $text = [Text.Encoding]::Unicode.GetString($raw, 2, $raw.Length - 2) }
  elseif ($raw.Length -ge 2 -and $raw[1] -eq 0x00) { $text = [Text.Encoding]::Unicode.GetString($raw) }
  else { $text = [Text.Encoding]::UTF8.GetString($raw) }
  if ($rawName) { [IO.File]::WriteAllText((Join-Path $RawDir "$rawName.xml"), $text, (New-Object Text.UTF8Encoding $false)) }
  # remove characters that are not allowed in XML (Tally sometimes sends them)
  $text = [regex]::Replace($text, '&#(0*([0-8]|1[124-9]|2[0-9]|3[01])|x0*([0-8bBcCeEfF]|1[0-9a-fA-F]));', '')
  $text = [regex]::Replace($text, '[\x00-\x08\x0B\x0C\x0E-\x1F]', '')
  try { return [xml]$text } catch { throw "Tally's reply could not be read as XML (saved in raw\$rawName.xml). $($_.Exception.Message)" }
}

function Collection-Request([string]$name, [string]$type, [string]$fetch, [string]$company) {
  $co = ''
  if ($company) { $co = "<SVCURRENTCOMPANY>$(XmlEsc $company)</SVCURRENTCOMPANY>" }
  return @"
<ENVELOPE>
 <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>$name</ID></HEADER>
 <BODY><DESC>
  <STATICVARIABLES><SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>$co</STATICVARIABLES>
  <TDL><TDLMESSAGE><COLLECTION NAME="$name" ISMODIFY="No"><TYPE>$type</TYPE><FETCH>$fetch</FETCH></COLLECTION></TDLMESSAGE></TDL>
 </DESC></BODY>
</ENVELOPE>
"@
}

function T([object]$node, [string]$name) {
  if ($null -eq $node) { return '' }
  $n = $node.SelectSingleNode($name)
  if ($null -eq $n) { return '' }
  return $n.InnerText.Trim()
}
function Amount([string]$s) {
  # Tally writes amounts like "-12500.00" (negative = Debit) or "12500.00 Cr"
  if (-not $s) { return 0.0 }
  $v = $s -replace '[^0-9\.\-]', ''
  if (-not $v) { return 0.0 }
  return [double]::Parse($v, [Globalization.CultureInfo]::InvariantCulture)
}
function IsoDate([string]$d) {   # 20180401 -> 2018-04-01
  if ($d -match '^(\d{4})(\d{2})(\d{2})$') { return "$($matches[1])-$($matches[2])-$($matches[3])" }
  return $d
}
function TallyDate([datetime]$d) { return $d.ToString('d-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture) }

# ---------- 1. company ----------
Say "Connecting to Tally at $TallyUrl ..." 'Cyan'
$cx = Invoke-Tally (Collection-Request 'SSCompanies' 'Company' 'NAME, BOOKSFROM, STARTINGFROM, GUID' '') 'companies'
$companies = @($cx.SelectNodes('//COMPANY'))
if ($companies.Count -eq 0) { throw 'No company is open in Tally. Open the Society company and run this again.' }
if (-not $Company) {
  if ($companies.Count -eq 1) { $Company = $companies[0].GetAttribute('NAME'); if (-not $Company) { $Company = T $companies[0] 'NAME' } }
  else {
    Say 'Companies open in Tally:' 'Yellow'
    for ($i = 0; $i -lt $companies.Count; $i++) { $n = $companies[$i].GetAttribute('NAME'); if (-not $n) { $n = T $companies[$i] 'NAME' }; Write-Host "  $($i + 1). $n" }
    $pick = Read-Host 'Type the number of the Society company'
    $c = $companies[[int]$pick - 1]; $Company = $c.GetAttribute('NAME'); if (-not $Company) { $Company = T $c 'NAME' }
  }
}
$co = $companies | Where-Object { ($_.GetAttribute('NAME') -eq $Company) -or ((T $_ 'NAME') -eq $Company) } | Select-Object -First 1
$booksFrom = IsoDate (T $co 'BOOKSFROM')
if (-not $booksFrom) { $booksFrom = IsoDate (T $co 'STARTINGFROM') }
Say "Company: $Company   (books from $booksFrom)" 'Green'

if (-not $FromDate) { $FromDate = $booksFrom }
if (-not $FromDate) { $FromDate = '2018-04-01' }
if (-not $ToDate) { $ToDate = (Get-Date).ToString('yyyy-MM-dd') }
$from = [datetime]::ParseExact($FromDate, 'yyyy-MM-dd', $null)
$to = [datetime]::ParseExact($ToDate, 'yyyy-MM-dd', $null)

# ---------- 2. groups and ledgers ----------
Say 'Reading groups ...'
$gx = Invoke-Tally (Collection-Request 'SSGroups' 'Group' 'NAME, PARENT, PRIMARYGROUP, ISREVENUE, GUID' $Company) 'groups'
$groups = @(foreach ($g in $gx.SelectNodes('//GROUP')) {
  $n = $g.GetAttribute('NAME'); if (-not $n) { $n = T $g 'NAME' }
  [ordered]@{ name = $n; parent = (T $g 'PARENT'); primary = (T $g 'PRIMARYGROUP'); guid = (T $g 'GUID') }
})
Say "  $($groups.Count) groups"

Say 'Reading ledgers ...'
$lx = Invoke-Tally (Collection-Request 'SSLedgers' 'Ledger' 'NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS, LEDGERPHONE, LEDGERMOBILE, EMAIL, LEDGERCONTACT, INCOMETAXNUMBER, GUID' $Company) 'ledgers'
$ledgers = @(foreach ($l in $lx.SelectNodes('//LEDGER')) {
  $n = $l.GetAttribute('NAME'); if (-not $n) { $n = T $l 'NAME' }
  $addr = @($l.SelectNodes('.//ADDRESS') | ForEach-Object { $_.InnerText.Trim() } | Where-Object { $_ }) -join ', '
  # Tally: negative = Debit. Stored here as Debit positive, Credit negative (like the society's statements).
  [ordered]@{
    name = $n; parent = (T $l 'PARENT')
    opening = -1 * (Amount (T $l 'OPENINGBALANCE')); closing = -1 * (Amount (T $l 'CLOSINGBALANCE'))
    address = $addr; phone = (T $l 'LEDGERPHONE'); mobile = (T $l 'LEDGERMOBILE'); email = (T $l 'EMAIL')
    contact = (T $l 'LEDGERCONTACT'); pan = (T $l 'INCOMETAXNUMBER'); guid = (T $l 'GUID')
  }
})
Say "  $($ledgers.Count) ledgers"

# ---------- 3. vouchers, month by month ----------
$vouchers = New-Object System.Collections.Generic.List[object]
$m = New-Object DateTime ($from.Year, $from.Month, 1)
while ($m -le $to) {
  $mEnd = $m.AddMonths(1).AddDays(-1)
  $a = $m; if ($a -lt $from) { $a = $from }
  $b = $mEnd; if ($b -gt $to) { $b = $to }
  $req = @"
<ENVELOPE>
 <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>Day Book</ID></HEADER>
 <BODY><DESC><STATICVARIABLES>
  <SVCURRENTCOMPANY>$(XmlEsc $Company)</SVCURRENTCOMPANY>
  <SVFROMDATE TYPE="Date">$(TallyDate $a)</SVFROMDATE>
  <SVTODATE TYPE="Date">$(TallyDate $b)</SVTODATE>
  <EXPLODEFLAG>Yes</EXPLODEFLAG>
  <SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>
 </STATICVARIABLES></DESC></BODY>
</ENVELOPE>
"@
  $vx = Invoke-Tally $req ("daybook-{0:yyyy-MM}" -f $m)
  $count = 0
  foreach ($v in $vx.SelectNodes('//VOUCHER')) {
    if ((T $v 'ISCANCELLED') -eq 'Yes' -or (T $v 'ISOPTIONAL') -eq 'Yes') { continue }
    $date = IsoDate (T $v 'DATE')
    if ($date -lt $a.ToString('yyyy-MM-dd') -or $date -gt $b.ToString('yyyy-MM-dd')) { continue }
    $lines = @(foreach ($e in $v.SelectNodes('ALLLEDGERENTRIES.LIST | LEDGERENTRIES.LIST')) {
      $amt = Amount (T $e 'AMOUNT')
      if ($amt -eq 0) { continue }
      [ordered]@{ ledger = (T $e 'LEDGERNAME'); debit = [math]::Round([math]::Max(-$amt, 0), 2); credit = [math]::Round([math]::Max($amt, 0), 2) }
    })
    if ($lines.Count -eq 0) { continue }
    $vt = $v.GetAttribute('VCHTYPE'); if (-not $vt) { $vt = T $v 'VOUCHERTYPENAME' }
    $vouchers.Add([ordered]@{
      date = $date; type = $vt; number = (T $v 'VOUCHERNUMBER'); narration = (T $v 'NARRATION')
      party = (T $v 'PARTYLEDGERNAME'); reference = (T $v 'REFERENCE'); guid = (T $v 'GUID'); lines = $lines
    })
    $count++
  }
  Say ("  {0:MMM yyyy}: {1} vouchers" -f $m, $count)
  $m = $m.AddMonths(1)
}
Say "Total vouchers: $($vouchers.Count)" 'Green'

# ---------- 4. check: opening + vouchers = Tally closing, for every ledger ----------
$net = @{}
foreach ($v in $vouchers) { foreach ($e in $v.lines) { $net[$e.ledger] = [double]($net[$e.ledger]) + $e.debit - $e.credit } }
$bad = 0
foreach ($l in $ledgers) {
  $calc = [math]::Round($l.opening + [double]($net[$l.name]), 2)
  if ([math]::Abs($calc - $l.closing) -gt 0.5) { $bad++; if ($bad -le 20) { Say ("  CHECK  {0}: opening+vouchers {1:N2}, Tally closing {2:N2}" -f $l.name, $calc, $l.closing) 'Yellow' } }
}
if ($ToDate -ne (Get-Date).ToString('yyyy-MM-dd')) { Say '  (Closing balances are as on today in Tally, so differences are expected when -ToDate is earlier.)' }
if ($bad -eq 0) { Say 'Balance check: every ledger agrees with Tally.' 'Green' } else { Say "Balance check: $bad ledgers differ (see above). The export is still saved; send export-log.txt with it." 'Yellow' }

# ---------- 5. save ----------
$out = [ordered]@{
  format = 'sunshreesuntec-tally-export/1'; source = 'Tally XML (HTTP port)'; exportedAt = (Get-Date).ToString('s')
  computer = $env:COMPUTERNAME; company = $Company; booksFrom = $booksFrom; fromDate = $FromDate; toDate = $ToDate
  check = [ordered]@{ ledgers = $ledgers.Count; vouchers = $vouchers.Count; ledgersDiffering = $bad }
  groups = $groups; ledgers = $ledgers; vouchers = $vouchers
}
$safe = ($Company -replace '[^A-Za-z0-9]+', '-').Trim('-')
$file = Join-Path $OutDir ("tally-export-{0}-{1:yyyy-MM-dd}.json" -f $safe, (Get-Date))
Say 'Writing the export file (this can take a minute) ...'
[IO.File]::WriteAllText($file, ($out | ConvertTo-Json -Depth 8 -Compress), (New-Object Text.UTF8Encoding $false))
[IO.File]::WriteAllLines((Join-Path $OutDir 'export-log.txt'), $script:Log)
Say ''
Say "Done. File: $file" 'Green'
Say 'Load it in sunshreesuntec.com/admin.html -> Settings -> Tally migration. Keep it private: it contains every member''s accounts.' 'Cyan'
