/**
 * Sunshree Suntec – keeps expense bills and reports in the Society's Google Drive.
 *
 * Install once in the Society's Google account (see README.md in this folder), deploy as a Web app
 * (Execute as: Me, Who has access: Anyone) and paste its address in Accounts → Expenses → Set-up.
 *
 * Every request carries the signed-in person's Firebase ID token. The script checks the token with Firebase,
 * then reads that person's access record WITH THEIR OWN TOKEN, so the database's security rules decide what
 * they may do. Files are never public: they are read back only through this script, for people the rules allow.
 *
 * Folders:  <ROOT_FOLDER>/Expenses/FY 2026-27/2026-11 November/Submitted | Approved | Rejected | Payments
 *           <ROOT_FOLDER>/Reports/FY 2026-27/2026-11 November
 *           <ROOT_FOLDER>/Units/C Wing/C 202/Members and shares | Tenants and agreements | Communication |
 *                                            Electricity (MSEB) | Property tax (PMC)
 *           <ROOT_FOLDER>/Units/C Wing/C 202/C 202 unit file backup.json   (everything about the unit, kept up to date)
 *           <ROOT_FOLDER>/Units/C Wing/C 202/Ownership (sale deeds and Index II) | Occupants | Agreements   (3.13)
 *           <ROOT_FOLDER>/Correspondence/FY 2026-27/Inward | Outward   (3.14, the Society's letters and documents)
 *           <ROOT_FOLDER>/Correspondence/FY 2026-27/Correspondence register FY 2026-27.json   (backup of the register)
 *           <ROOT_FOLDER>/Reference documents/Interest on arrears   (3.15: rules, circulars, articles shown to members,
 *                                                                   and a copy of each interest calculation)
 *
 * Members (3.13) use three actions of their own: memberUpload (documents of their unit), memberFetch (open them)
 * and memberAgreement (their accepted portal agreement → PDF in the unit's Agreements folder, emailed to them
 * with a copy to the Society). Everything else needs a committee or staff account.
 *
 * Version 6 (3.16): memberMail sends reminders and invitations to members from the Society's account
 * (committee, or staff allowed to look after members; at most 25 at a time, each email separately).
 *
 * Version 7 (3.18): accessRequest (member) emails the Society a member's application to view the Society's
 * accounts, with an acknowledgement to the member; accessDecision (Chairman, Secretary, Treasurer or Accountant)
 * emails the member the decision. Both read the application from the database, so the wording can't be changed.
 *
 * Version 8 (3.19): committeeUndertaking makes the PDF of a committee member's accepted undertaking (Drive:
 * Committee/Undertakings) and emails it to them with a copy to the Society; uploads of kind 'committee' keep the
 * signed M-20 bonds (Committee/M-20 bonds) and the letter informing the Registrar (Committee/Registrar intimation).
 *
 * Version 9 (3.20): the Rules, GRs and forms library. Uploads of kind 'library' (Library/<category>), libraryFromLink
 * (saves a copy of a document from its official web address), and opening a library document (the team, and approved
 * members) — committee or staff with the 'library' permission add documents.
 *
 * Version 10 (3.21): a test copy. Make a copy of this script project, set its Script properties to the TEST Firebase
 * project, ROOT_FOLDER to e.g. "TEST Sunshree Suntec Records" (or TEST = yes) and SITE_ADDRESS to the test site:
 * its files then go into that separate folder and every email it sends is marked [TEST].
 *
 * Version 11 (3.22): the agreement PDF says "Declaration accepted" (the website shows the declaration as text above
 * the signature instead of tick boxes).
 *
 * Version 12 (3.23): unit records of kind 'transfers' (membership transfer sets on death or sale) keep their scans in
 * the unit's folder "Membership transfer"; members can open their own unit's transfer scans (memberFetch, record 'transfers').
 *
 * Version 13 (3.25): FULL BACKUP AND RESTORE. On a schedule (a time-driven trigger made by setupBackups) and on request
 * (fullBackup, committee), every document in the database and the list of sign-in accounts are saved as one
 * compressed file in <ROOT_FOLDER>/Backups/Full ("Full backup 2026-11-25 0200.json.gz"). Old copies are removed
 * after the number of days set on the website, except the first of each month, which is kept. listBackups and
 * restoreBackup (committee) list them and put documents back: only the missing ones, or everything as it was.
 * restoreLatestBackup() can be run from this editor when the website itself is not available. These use the
 * script owner's own Google access to the Firebase project (the account must be an Editor of it), not a member's
 * sign-in, so they can read and write everything: they are limited to the committee and every run is recorded in
 * settings/fullBackup and emailed to the Society.
 */
var MAX_BYTES = 15 * 1024 * 1024;
var MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv'];
var STATUS_FOLDER = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
/* Unit file records → their folder inside the unit's folder. */
var UNIT_FOLDER = { members: 'Members and shares', tenants: 'Tenants and agreements', comms: 'Communication',
  electricity: 'Electricity (MSEB)', propertyTax: 'Property tax (PMC)', transfers: 'Membership transfer' };
var MAX_BACKUP = 20 * 1024 * 1024;
/* Documents members upload (units/<id>/memberDocs) → folder in the unit's folder. */
var MEMBER_DOC_FOLDER = { ownership: 'Ownership (sale deeds and Index II)', rental: 'Tenants and agreements', police: 'Tenants and agreements',
  pastRental: 'Tenants and agreements', occupants: 'Occupants', other: 'Communication' };
var MAX_MEMBER_PDF = 25 * 1024 * 1024;   // a complete sale deed scan can be large
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function config_() {
  var p = PropertiesService.getScriptProperties();
  var c = { apiKey: p.getProperty('FIREBASE_API_KEY'), project: p.getProperty('FIREBASE_PROJECT_ID'),
    root: p.getProperty('ROOT_FOLDER') || 'Sunshree Suntec Society Records', site: p.getProperty('SITE_ADDRESS') || 'https://sunshreesuntec.com/' };
  // 3.21: a test copy of the script (Script property TEST = yes, or a root folder named TEST…) marks its emails.
  c.test = String(p.getProperty('TEST') || '').toLowerCase() === 'yes' || /^test/i.test(c.root);
  if (!c.apiKey || !c.project) throw new Error('The storage script is not set up: add FIREBASE_API_KEY and FIREBASE_PROJECT_ID in its Script properties.');
  return c;
}

function doGet() {
  var test = false;
  try { test = config_().test; } catch (e) { /* not set up */ }
  return json_({ ok: true, service: 'Sunshree Suntec records', version: 13, test: test });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var cfg = config_();
    var who = verifyToken_(cfg, req.idToken);
    var memberActions = { memberUpload: memberUpload_, memberFetch: memberFetch_, memberAgreement: memberAgreement_, accessRequest: accessRequest_ };
    var out;
    if (req.action === 'fetch' && req.libraryId) req.action = 'libraryFetch';   // anyone signed in opening a library document
    if (req.action === 'libraryFetch') {
      out = libraryFetch_(cfg, req, who);
    } else if (memberActions[req.action]) {
      out = memberActions[req.action](cfg, req, who, memberRecord_(cfg, who, req.idToken));
    } else {
      var team = teamRecord_(cfg, who, req.idToken);
      var actions = { ping: ping_, upload: upload_, fetch: fetchFile_, move: move_, backup: backup_, readBackup: readBackup_, resendAgreement: resendAgreement_,
        backupRegister: backupRegister_, memberMail: memberMail_, accessDecision: accessDecision_, committeeUndertaking: committeeUndertaking_, libraryFromLink: libraryFromLink_,
        fullBackup: fullBackupAction_, listBackups: listBackups_, restoreBackup: restoreBackupAction_ };
      var fn = actions[req.action];
      if (!fn) throw new Error('Unknown request.');
      out = fn(cfg, req, who, team);
    }
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ---------------- who is asking ---------------- */

function verifyToken_(cfg, idToken) {
  if (!idToken) throw new Error('Please sign in again.');
  var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(cfg.apiKey), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }),
    headers: { Referer: cfg.site }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Your sign-in has expired. Please sign in again.');
  var u = (JSON.parse(r.getContentText()).users || [])[0];
  if (!u || !u.localId) throw new Error('Unknown user.');
  return { uid: u.localId, email: String(u.email || '').toLowerCase(), verified: u.emailVerified === true };
}

/** Reads a document as the signed-in person (their token), so the security rules apply. Returns null if not allowed or missing. */
function readDoc_(cfg, idToken, path) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.project) + '/databases/(default)/documents/' + path;
  var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  return plain_({ mapValue: { fields: JSON.parse(r.getContentText()).fields || {} } });
}

/** Firestore REST values → plain values. */
function plain_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain_);
  if ('mapValue' in v) {
    var o = {}, f = v.mapValue.fields || {};
    Object.keys(f).forEach(function (k) { o[k] = plain_(f[k]); });
    return o;
  }
  return null;
}

function teamRecord_(cfg, who, idToken) {
  var a = readDoc_(cfg, idToken, 'admins/' + who.uid);
  if (!a) throw new Error('This account has no access to the Society’s accounts.');
  if (a.active === false) throw new Error('Your access has been suspended.');
  if (a.validUntil && new Date(a.validUntil) <= new Date()) throw new Error('Your access has ended.');
  var committee = a.kind !== 'staff';
  if (!committee && a.agreementRequired !== false) {
    var ag = readDoc_(cfg, idToken, 'settings/staffAgreement');
    if (!ag || Number(a.agreementVersion || 0) !== Number(ag.version)) throw new Error('Please accept the staff agreement on the accounts page first.');
  }
  var perms = a.perms || {};
  var role = a.role || (committee ? 'Committee' : 'Staff');
  return { committee: committee, role: role, name: a.name || who.email,
    can: function (p) { return committee || perms[p] === true; },
    // 3.18: decides members' applications to view the Society's accounts (same list as the database rules).
    approver: committee ? ['Chairman', 'Secretary', 'Treasurer'].indexOf(role) >= 0 : role === 'Accountant' };
}

function any_(team, list) { return list.some(function (p) { return team.can(p); }); }

/* ---------------- folders ---------------- */

function rootFolder_(cfg) {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('ROOT_FOLDER_ID');
  // In a test copy, a folder remembered by id is used only if it is the folder named in ROOT_FOLDER, so a copy made
  // from the real script can never write into the Society's real records folder.
  var known = function (fid) { try { var f = DriveApp.getFolderById(fid); return !cfg.test || f.getName() === cfg.root ? f : null; } catch (e) { return null; } };
  var hit = id && known(id);
  if (hit) return hit;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    id = p.getProperty('ROOT_FOLDER_ID');
    hit = id && known(id);
    if (hit) return hit;
    var it = DriveApp.getRootFolder().getFoldersByName(cfg.root);
    var f = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(cfg.root);
    p.setProperty('ROOT_FOLDER_ID', f.getId());
    return f;
  } finally { lock.releaseLock(); }
}

function child_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  } finally { lock.releaseLock(); }
}

function fyName_(month) {
  var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)), s = m >= 4 ? y : y - 1;
  return 'FY ' + s + '-' + ('0' + ((s + 1) % 100)).slice(-2);
}
function monthName_(month) { return month + ' ' + MONTHS[Number(month.slice(5, 7)) - 1]; }

function folderFor_(cfg, area, month, status) {
  var f = child_(child_(child_(rootFolder_(cfg), area), fyName_(month)), monthName_(month));
  return status ? child_(f, status) : f;
}

function insideRoot_(cfg, file) {
  var rootId = rootFolder_(cfg).getId();
  var parents = file.getParents(), seen = 0;
  while (parents.hasNext() && seen < 50) {
    var f = parents.next(); seen++;
    for (var depth = 0; f && depth < 8; depth++) {
      if (f.getId() === rootId) return true;
      var up = f.getParents();
      f = up.hasNext() ? up.next() : null;
    }
  }
  return false;
}

function cleanName_(s) { return String(s || 'file').replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'file'; }
function validMonth_(m) { return /^20\d{2}-(0[1-9]|1[0-2])$/.test(String(m || '')); }

/* ---------------- actions ---------------- */

function ping_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can connect the storage.');
  var root = rootFolder_(cfg);
  return { folder: root.getName(), owner: Session.getEffectiveUser().getEmail() };
}

function upload_(cfg, req, who, team) {
  if (req.kind === 'unit') return uploadUnit_(cfg, req, who, team);
  if (req.kind === 'correspondence') return uploadLetter_(cfg, req, who, team);
  if (req.kind === 'reference') return uploadReference_(cfg, req, who, team);
  if (req.kind === 'committee') return uploadCommittee_(cfg, req, who, team);
  if (req.kind === 'library') return uploadLibrary_(cfg, req, who, team);
  var report = req.kind === 'report', payment = req.kind === 'payment';
  var need = report ? ['view', 'approveExpenses', 'payExpenses'] : payment ? ['payExpenses'] : ['submitExpenses', 'approveExpenses', 'payExpenses'];
  if (!any_(team, need)) throw new Error('You don’t have permission to add ' + (report ? 'reports.' : payment ? 'payment proofs.' : 'expenses.'));
  if (MIME_OK.indexOf(req.mimeType) < 0) throw new Error('Only photos (JPEG, PNG, WebP), PDF and CSV files can be kept.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_BYTES) throw new Error('The file is larger than 15 MB.');
  var month = validMonth_(req.month) ? req.month : Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM');
  var folder = report ? folderFor_(cfg, 'Reports', month, null) : folderFor_(cfg, 'Expenses', month, payment ? 'Payments' : STATUS_FOLDER.submitted);
  var file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Added by ' + team.name + ' <' + who.email + '> (' + team.role + ') on ' +
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') + (req.note ? '\n' + String(req.note) : '')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}

/**
 * Gives back a bill or a payment proof, only if the person may read the expense (or the payback / advance)
 * it belongs to: the record is read with their own sign-in, so the rules decide.
 */
function fetchFile_(cfg, req, who, team) {
  var rec, list;
  if (req.unitId) {
    // A unit file document: the record it belongs to is read with the person's own sign-in.
    if (!validUnitId_(req.unitId) || !(UNIT_FOLDER[req.record] || req.record === 'memberDocs') || !/^[A-Za-z0-9_-]{1,60}$/.test(String(req.recordId || ''))) throw new Error('Unknown unit record.');
    rec = readDoc_(cfg, req.idToken, 'units/' + encodeURIComponent(req.unitId) + '/' + req.record + '/' + encodeURIComponent(req.recordId));
    if (!rec) throw new Error('You can’t see this unit record.');
    list = rec.files || [];
  } else if (req.referenceId) {
    list = siteReferences_(cfg, req.idToken);
  } else if (req.committeeUid || req.undertakingId || req.committeeRegister) {
    // 3.19: a committee member's M-20 bond or undertaking, or the letter to the Registrar (committee only, by the rules).
    var path = req.committeeUid ? 'admins/' + encodeURIComponent(String(req.committeeUid))
      : req.undertakingId ? 'committeeUndertakings/' + encodeURIComponent(String(req.undertakingId)) : 'settings/committeeRegister';
    rec = readDoc_(cfg, req.idToken, path);
    if (!rec) throw new Error('You can’t see this committee record.');
    list = req.committeeUid ? [rec.m20 && rec.m20.file] : req.undertakingId ? [rec.pdf] : [rec.letterFile];
  } else if (req.correspondenceId) {
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(String(req.correspondenceId))) throw new Error('Unknown letter.');
    rec = readDoc_(cfg, req.idToken, 'correspondence/' + encodeURIComponent(req.correspondenceId));
    if (!rec) throw new Error('You can’t see this letter.');
    list = rec.files || [];
  } else if (req.agreementId) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(req.agreementId))) throw new Error('Unknown agreement.');
    rec = readDoc_(cfg, req.idToken, 'memberAgreements/' + encodeURIComponent(req.agreementId));
    if (!rec) throw new Error('You can’t see this agreement.');
    list = rec.pdf ? [rec.pdf] : [];
  } else if (req.settlementId) {
    rec = readDoc_(cfg, req.idToken, 'staffSettlements/' + encodeURIComponent(String(req.settlementId)));
    if (!rec) throw new Error('You can’t see this payment.');
    list = rec.files || [];
  } else {
    rec = readDoc_(cfg, req.idToken, 'expenses/' + encodeURIComponent(String(req.expenseId || '')));
    if (!rec) throw new Error('You can’t see this expense.');
    list = (rec.files || []).concat(rec.payFiles || []);
  }
  var ok = list.some(function (f) { return f && f.id === req.fileId; });
  if (!ok) throw new Error('This file doesn’t belong to that expense.');
  var file = DriveApp.getFileById(req.fileId);
  if (!insideRoot_(cfg, file)) throw new Error('This file isn’t in the Society’s records folder.');
  if (file.getSize() > MAX_BYTES) throw new Error('The file is too large to show here.');
  var blob = file.getBlob();
  return { name: file.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/** After approval or rejection: moves the bills to that folder of the month, approved ones named with the voucher number. */
function move_(cfg, req, who, team) {
  if (!team.can('approveExpenses')) throw new Error('Only approvers can do this.');
  var exp = readDoc_(cfg, req.idToken, 'expenses/' + encodeURIComponent(String(req.expenseId || '')));
  if (!exp) throw new Error('Expense not found.');
  var status = STATUS_FOLDER[exp.status];
  if (!status || !validMonth_(String(exp.date || '').slice(0, 7))) throw new Error('The expense has no valid status or date.');
  // A sheet shared by several expenses stays in the month it was stored in and keeps its name.
  var month = validMonth_(exp.fileMonth) ? exp.fileMonth : exp.date.slice(0, 7);
  var target = folderFor_(cfg, 'Expenses', month, status);
  var voucher = exp.status === 'approved' && exp.voucherNo && !exp.groupId ? String(exp.voucherNo).replace(/\//g, '-') + ' ' : '';
  var moved = 0;
  (exp.files || []).forEach(function (f) {
    try {
      var file = DriveApp.getFileById(f.id);
      if (!insideRoot_(cfg, file)) return;
      file.moveTo(target);
      var name = file.getName().replace(/^EXP-\d{4}-\d{2}-\d{4} /, '');
      file.setName(voucher + name);
      moved++;
    } catch (e) { /* a missing file is skipped */ }
  });
  return { moved: moved, folder: target.getName() };
}

/* ---------------- unit files ---------------- */

function validUnitId_(id) { return /^[A-Za-z0-9-]{1,12}$/.test(String(id || '')); }

/** The unit's folder: Units/<wing>/<unit>. The unit is read with the person's sign-in, so only units they may see. */
function unitFolder_(cfg, req) {
  if (!validUnitId_(req.unitId)) throw new Error('Unknown unit.');
  var u = readDoc_(cfg, req.idToken, 'units/' + encodeURIComponent(req.unitId));
  if (!u) throw new Error('You can’t see this unit.');
  var wing = cleanName_(req.wing || (u.block ? u.block + ' Wing' : 'Other'));
  return { folder: child_(child_(child_(rootFolder_(cfg), 'Units'), wing), cleanName_(u.unit || req.unitId)), unit: u };
}

function uploadUnit_(cfg, req, who, team) {
  if (!team.can('unitRecords')) throw new Error('You don’t have permission to add documents to unit files.');
  if (!UNIT_FOLDER[req.record]) throw new Error('Unknown kind of unit record.');
  if (MIME_OK.indexOf(req.mimeType) < 0 || req.mimeType === 'text/csv') throw new Error('Only photos (JPEG, PNG, WebP) and PDF files can be kept.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_BYTES) throw new Error('The file is larger than 15 MB.');
  var folder = child_(unitFolder_(cfg, req).folder, UNIT_FOLDER[req.record]);
  var file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Added by ' + team.name + ' <' + who.email + '> (' + team.role + ') on ' +
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') + (req.note ? '\n' + String(req.note) : '')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}

/** Saves (replaces) "<unit> unit file backup.json" in the unit's folder. */
function backup_(cfg, req, who, team) {
  if (!team.can('unitRecords')) throw new Error('You don’t have permission to back up unit files.');
  var text = String(req.json || '');
  if (!text || text.length > MAX_BACKUP) throw new Error('The backup is empty or too large.');
  var parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error('The backup is not valid.'); }
  if (!parsed || parsed.unitId !== req.unitId) throw new Error('The backup is for another unit.');
  var uf = unitFolder_(cfg, req), name = cleanName_((uf.unit.unit || req.unitId) + ' unit file backup.json');
  var it = uf.folder.getFilesByName(name), file;
  if (it.hasNext()) { file = it.next(); file.setContent(text); }
  else file = uf.folder.createFile(name, text, 'application/json');
  file.setDescription('Backup of the unit file from the Society website. Last saved by ' + team.name + ' <' + who.email + '> on ' +
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') + '.');
  return { file: { id: file.getId(), name: name, size: text.length } };
}

/** Gives back a unit's backup (committee only), to restore records from it. */
function readBackup_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can restore from a backup.');
  var uf = unitFolder_(cfg, req), name = cleanName_((uf.unit.unit || req.unitId) + ' unit file backup.json');
  var it = uf.folder.getFilesByName(name);
  if (!it.hasNext()) throw new Error('There is no backup of this unit in the Drive yet.');
  var file = it.next();
  return { json: file.getBlob().getDataAsString('UTF-8'), updated: file.getLastUpdated().toISOString() };
}

/* ---------------- reference documents (3.15) ---------------- */

var REFERENCE_TOPICS = ['Interest on arrears'];

function uploadReference_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can add reference documents.');
  if (REFERENCE_TOPICS.indexOf(req.topic) < 0) throw new Error('Unknown topic.');
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv'].indexOf(req.mimeType) < 0) throw new Error('Only photos, PDF and CSV files can be kept.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_MEMBER_PDF) throw new Error('The file is larger than 25 MB.');
  var folder = child_(child_(rootFolder_(cfg), 'Reference documents'), req.topic);
  var file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Added by ' + team.name + ' <' + who.email + '> on ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') +
    (req.note ? '\n' + String(req.note) : '')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}

/** The reference documents the Society shows on its pages (public/site.interestRefs). */
function siteReferences_(cfg, idToken) {
  var site = readDoc_(cfg, idToken, 'public/site') || {};
  return (site.interestRefs || []).filter(function (r) { return r && r.id; });
}

/* ---------------- Rules, GRs and forms library (3.20) ---------------- */

var LIB_TYPES = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'application/msword': 1,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 1, 'application/vnd.ms-excel': 1,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 1, 'application/vnd.oasis.opendocument.text': 1, 'text/plain': 1 };
var LIB_MAX = 30 * 1024 * 1024;
function libraryFolder_(cfg, category) {
  return child_(child_(rootFolder_(cfg), 'Library'), cleanName_(String(category || 'Other')).slice(0, 60) || 'Other');
}
function uploadLibrary_(cfg, req, who, team) {
  if (!team.can('library')) throw new Error('You don’t have permission to add documents to the library.');
  if (!LIB_TYPES[req.mimeType]) throw new Error('Only PDF, Word, Excel, text files and photos can be added.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > LIB_MAX) throw new Error('The file is larger than 30 MB.');
  var file = libraryFolder_(cfg, req.category).createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Library: ' + (req.note || '') + '\nAdded by ' + team.name + ' <' + who.email + '> on ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}
/** Saves a copy of a document from its official address (e.g. the Co-operation Department's website). */
function libraryFromLink_(cfg, req, who, team) {
  if (!team.can('library')) throw new Error('You don’t have permission to add documents to the library.');
  var url = String(req.url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Give the full web address, starting with https://');
  var r;
  try { r = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true, validateHttpsCertificates: true }); }
  catch (e) { throw new Error('Couldn’t reach that address (' + String((e && e.message) || e).slice(0, 120) + '). Download the document and add the file instead.'); }
  if (r.getResponseCode() !== 200) throw new Error('That website answered ' + r.getResponseCode() + '. Download the document and add the file instead.');
  var blob = r.getBlob(), type = String(blob.getContentType() || '').split(';')[0].toLowerCase();
  if ((!LIB_TYPES[type] || type === 'text/plain') && /\.pdf(\?|#|$)/i.test(url)) type = 'application/pdf';
  if (!LIB_TYPES[type]) throw new Error('That address gives a ' + (type || 'web page') + ', not a document. Open it, download the PDF and add the file instead.');
  var bytes = blob.getBytes();
  if (type === 'application/pdf' && String.fromCharCode.apply(null, bytes.slice(0, 4)) !== '%PDF') throw new Error('That address didn’t give a PDF (the site may need a browser). Download it and add the file instead.');
  if (bytes.length > LIB_MAX) throw new Error('The document is larger than 30 MB.');
  var ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' }[type] || '';
  var name = cleanName_(String(req.name || url.split('/').pop().split('?')[0] || 'Document')).replace(/\.\w{2,4}$/, '') + ext;
  var file = libraryFolder_(cfg, req.category).createFile(Utilities.newBlob(bytes, type, name));
  file.setDescription(('Library: saved from ' + url + '\nBy ' + team.name + ' <' + who.email + '> on ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm')).slice(0, 1500));
  var out = { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: type } };
  if (bytes.length <= 20 * 1024 * 1024) out.data = Utilities.base64Encode(bytes);   // so the browser can read the words
  return out;
}
/** Opens a library document: anyone on the team, or an approved member (the rules decide who may read the entry). */
function libraryFetch_(cfg, req, who) {
  var id = String(req.libraryId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Unknown document.');
  var e = readDoc_(cfg, req.idToken, 'libraryDocs/' + id);
  if (!e || e.removed) throw new Error('This document isn’t in the library.');
  var a = readDoc_(cfg, req.idToken, 'admins/' + encodeURIComponent(who.uid)), ok = a && a.active !== false;
  if (!ok) { var m = readDoc_(cfg, req.idToken, 'users/' + encodeURIComponent(who.uid)); ok = m && m.status === 'approved' && !m.removed && who.verified; }
  if (!ok) throw new Error('Sign in as a member to open the Society’s copy.');
  if (!e.file || e.file.id !== req.fileId) throw new Error('That file doesn’t belong to this document.');
  var blob = DriveApp.getFileById(req.fileId).getBlob();
  return { name: blob.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- Managing Committee (3.19) ---------------- */

var COMMITTEE_FOLDER = { m20: 'M-20 bonds', registrar: 'Registrar intimation' };
function uploadCommittee_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can keep committee records.');
  if (!COMMITTEE_FOLDER[req.sub]) throw new Error('Unknown committee record.');
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(req.mimeType) < 0) throw new Error('Only photos (JPEG, PNG, WebP) and PDF files can be kept.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_MEMBER_PDF) throw new Error('The file is larger than 25 MB.');
  var folder = child_(child_(rootFolder_(cfg), 'Committee'), COMMITTEE_FOLDER[req.sub]);
  var file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Kept by ' + team.name + ' <' + who.email + '> (' + team.role + ') on ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') +
    (req.note ? '\n' + String(req.note) : '')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}

/** A committee member's accepted undertaking: PDF in Committee/Undertakings, emailed to them with a copy to the Society. */
function committeeUndertaking_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only committee members give the committee undertaking.');
  var id = String(req.undertakingId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Unknown undertaking.');
  var u = readDoc_(cfg, req.idToken, 'committeeUndertakings/' + encodeURIComponent(id));
  if (!u) throw new Error('Undertaking not found.');
  var props = PropertiesService.getScriptProperties(), key = 'undertaking_' + id, done = props.getProperty(key);
  if (done && !req.again) return JSON.parse(done);
  var at = u.acceptedAt ? new Date(u.acceptedAt) : new Date();
  u.acceptedText = Utilities.formatDate(at, 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');
  var name = cleanName_(u.signedName + ' - ' + u.role + ' - Committee undertaking v' + u.version + ' - ' + Utilities.formatDate(at, 'Asia/Kolkata', 'yyyy-MM-dd') + '.pdf');
  var folder = child_(child_(rootFolder_(cfg), 'Committee'), 'Undertakings');
  var file, it = folder.getFilesByName(name);
  if (it.hasNext()) file = it.next();
  else {
    file = folder.createFile(Utilities.newBlob(undertakingHtml_(u, id), 'text/html', 'undertaking.html').getAs('application/pdf').setName(name));
    file.setDescription('Committee undertaking accepted electronically by ' + u.signedName + ' <' + u.email + '>, ' + u.role + ', version ' + u.version + '.');
  }
  var society = Session.getEffectiveUser().getEmail(), emailed = false, note = '';
  try {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Daily email limit reached; send it again tomorrow.');
    sendMail_(cfg, { to: u.email, cc: society, replyTo: society, name: 'Sunshree Suntec CHS',
      subject: 'Your committee undertaking – ' + u.role + ' – Sunshree Suntec CHS',
      htmlBody: '<p>Dear ' + esc_(u.signedName) + ',</p><p>Thank you for accepting the ' + esc_(u.title) + ' (version ' + esc_(u.version) + ') as ' + esc_(u.role) + ' on ' + esc_(u.acceptedText) +
        '. A copy is attached and kept in the Society’s records.</p><p>Please remember to hand the Secretary your bond in <strong>Form M-20</strong> on stamp paper within fifteen days of taking office (Rule 58A of the MCS Rules 1961).</p>' +
        '<p>Managing Committee<br>Sunshree Suntec Co-operative Housing Society Ltd.<br>' + esc_(society) + '</p>',
      attachments: [file.getBlob()] });
    emailed = true;
  } catch (e) { note = String((e && e.message) || e); }
  var out = { pdf: { id: file.getId(), name: file.getName(), mime: 'application/pdf', size: file.getSize() }, emailed: emailed, emailedTo: u.email, cc: society, note: note };
  if (emailed) props.setProperty(key, JSON.stringify(out));
  return out;
}

function undertakingHtml_(u, id) {
  var h = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.45;color:#1b1f24;margin:18mm 16mm}' +
    'h1{font-size:15pt;margin:0 0 4pt}h2{font-size:11.5pt;margin:12pt 0 4pt}.meta{color:#555;font-size:9pt}li{margin:3pt 0}.box{border:1px solid #999;padding:6pt 8pt;margin:8pt 0}</style></head><body>';
  h += '<p class="meta">SUNSHREE SUNTEC CO-OP. HSG. SOC. LTD. · Regd. No. PNA/PNA(4)/HSG/(TC)/12471/2012-13 dated 30-10-2012 · S. No. 19/2, 20/1, NIBM Road, Kondhwa Khurd, Pune 411 048</p>';
  h += '<h1>' + esc_(u.title) + '</h1><p class="meta">Version ' + esc_(u.version) + '</p><p>' + esc_(u.intro) + '</p>';
  h += '<div class="box"><strong>Committee member:</strong> ' + esc_(u.name) + '<br><strong>Post:</strong> ' + esc_(u.role) + (u.unitLabel ? '<br><strong>Unit:</strong> ' + esc_(u.unitLabel) : '') +
    (u.tookOfficeOn ? '<br><strong>Took office:</strong> ' + esc_(fmtDay_(u.tookOfficeOn + 'T12:00:00+05:30')) : '') + '<br><strong>Email:</strong> ' + esc_(u.email) + '</div>';
  if ((u.roleLines || []).length) { h += '<h2>My responsibilities as ' + esc_(u.role) + '</h2><ol>'; u.roleLines.forEach(function (l) { h += '<li>' + esc_(l) + '</li>'; }); h += '</ol>'; }
  h += '<h2>My undertakings</h2><ol>'; (u.common || []).forEach(function (l) { h += '<li>' + esc_(l) + '</li>'; }); h += '</ol>';
  h += '<p><strong>' + esc_(u.closing || '') + '</strong></p>';
  h += '<div class="box"><strong>Accepted electronically</strong> by ' + esc_(u.signedName) + ' (' + esc_(u.email) + ') on ' + esc_(u.acceptedText) + ' (India time). Reference: ' + esc_(id) + '.</div>';
  h += '<p class="meta">Generated by the Society’s records system. Accepted under section 10A of the Information Technology Act, 2000. This undertaking is in addition to, and does not replace, the bond in Form M-20.</p></body></html>';
  return h;
}

/* ---------------- Society correspondence (3.14) ---------------- */

function validFy_(fy) { return /^20\d{2}-\d{2}$/.test(String(fy || '')); }
function letterFolder_(cfg, fy) { return child_(child_(rootFolder_(cfg), 'Correspondence'), 'FY ' + fy); }

function uploadLetter_(cfg, req, who, team) {
  if (!team.can('correspondence')) throw new Error('You don’t have permission to add Society correspondence.');
  if (!validFy_(req.fy) || ['in', 'out'].indexOf(req.dir) < 0) throw new Error('Unknown register.');
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(req.mimeType) < 0) throw new Error('Only photos (JPEG, PNG, WebP) and PDF files can be kept.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > (req.mimeType === 'application/pdf' ? MAX_MEMBER_PDF : MAX_BYTES)) throw new Error('The file is too large (PDF up to 25 MB, photos up to 15 MB).');
  var folder = child_(letterFolder_(cfg, req.fy), req.dir === 'in' ? 'Inward' : 'Outward');
  var file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Added by ' + team.name + ' <' + who.email + '> (' + team.role + ') on ' +
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') + (req.note ? '\n' + String(req.note) : '')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}

/** "Correspondence register FY 2026-27.json" in that year's folder, replaced on each save. */
function backupRegister_(cfg, req, who, team) {
  if (!team.can('correspondence')) throw new Error('You don’t have permission to back up the correspondence register.');
  if (!validFy_(req.fy)) throw new Error('Unknown year.');
  var text = String(req.json || '');
  if (!text || text.length > MAX_BACKUP) throw new Error('The backup is empty or too large.');
  var parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error('The backup is not valid.'); }
  if (!parsed || parsed.format !== 'sunshree-suntec-correspondence' || parsed.fy !== req.fy) throw new Error('The backup is for another year.');
  var folder = letterFolder_(cfg, req.fy), name = 'Correspondence register FY ' + req.fy + '.json';
  var it = folder.getFilesByName(name), file;
  if (it.hasNext()) { file = it.next(); file.setContent(text); } else file = folder.createFile(name, text, 'application/json');
  return { file: { id: file.getId(), name: name, size: text.length } };
}

/* ---------------- members (3.13) ---------------- */

/** An approved member (users/<uid>), read with their own sign-in. */
function memberRecord_(cfg, who, idToken) {
  var p = readDoc_(cfg, idToken, 'users/' + who.uid);
  if (!p) throw new Error('This account is not registered for a unit.');
  if (p.status !== 'approved' || p.removed) throw new Error('Your access to the unit hasn’t been approved.');
  if (!who.verified) throw new Error('Please verify your email address first.');
  return { name: p.name || who.email, unit: p.unit, relation: p.relation || '', access: p.access || 'full' };
}

/** "C 202" must be the same unit as "C-202". */
function sameUnit_(label, unitId) {
  return String(label || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() === String(unitId || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
function memberUnitFolder_(cfg, unitId, label, wing) {
  if (!validUnitId_(unitId) || !sameUnit_(label, unitId)) throw new Error('Unknown unit.');
  return child_(child_(child_(rootFolder_(cfg), 'Units'), cleanName_(wing || 'Other')), cleanName_(label));
}

function memberUpload_(cfg, req, who, m) {
  if (req.unitId !== m.unit) throw new Error('You can add documents only for your own unit.');
  if (!MEMBER_DOC_FOLDER[req.record]) throw new Error('Unknown kind of document.');
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(req.mimeType) < 0) throw new Error('Only photos (JPEG, PNG, WebP) and PDF files can be added.');
  var bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > (req.mimeType === 'application/pdf' ? MAX_MEMBER_PDF : MAX_BYTES)) throw new Error('The file is too large (PDF up to 25 MB, photos up to 15 MB).');
  var folder = child_(memberUnitFolder_(cfg, req.unitId, req.unitLabel, req.wing), MEMBER_DOC_FOLDER[req.record]);
  var file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, cleanName_(req.name)));
  file.setDescription(('Uploaded by ' + m.name + ' <' + who.email + '> (' + (m.relation || 'member') + ' of ' + req.unitLabel + ') on ' +
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm') + (req.note ? '\n' + String(req.note) : '')).slice(0, 1500));
  return { file: { id: file.getId(), name: file.getName(), size: file.getSize(), mime: req.mimeType } };
}

function memberFetch_(cfg, req, who, m) {
  var list;
  if (req.referenceId) {
    list = siteReferences_(cfg, req.idToken);
  } else if (req.agreementId) {
    var a = readDoc_(cfg, req.idToken, 'memberAgreements/' + encodeURIComponent(String(req.agreementId)));
    if (!a || a.uid !== who.uid) throw new Error('You can’t see this agreement.');
    list = a.pdf ? [a.pdf] : [];
  } else {
    if (req.unitId !== m.unit || !/^[A-Za-z0-9_-]{1,60}$/.test(String(req.recordId || ''))) throw new Error('You can open only your own unit’s documents.');
    // 3.23: also the scans of the unit's membership transfer (record 'transfers'); the rules decide who reads it.
    var rk = req.record === 'transfers' ? 'transfers' : 'memberDocs';
    var d = readDoc_(cfg, req.idToken, 'units/' + encodeURIComponent(req.unitId) + '/' + rk + '/' + encodeURIComponent(req.recordId));
    if (!d) throw new Error('You can’t see this document.');
    list = d.files || [];
  }
  if (!list.some(function (f) { return f && f.id === req.fileId; })) throw new Error('That file doesn’t belong to this record.');
  var blob = DriveApp.getFileById(req.fileId).getBlob();
  return { name: blob.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/** The member's accepted agreement: PDF in Units/<wing>/<unit>/Agreements, emailed to them with a copy to the Society. Once only. */
function memberAgreement_(cfg, req, who, m) {
  var a = readDoc_(cfg, req.idToken, 'memberAgreements/' + encodeURIComponent(String(req.agreementId || '')));
  if (!a || a.uid !== who.uid) throw new Error('Agreement not found.');
  return archiveAgreement_(cfg, req.idToken, String(req.agreementId), a, false);
}

/** Committee (or staff who look after members): make and send the copy again, e.g. if the email bounced. */
function resendAgreement_(cfg, req, who, team) {
  if (!team.can('members')) throw new Error('You don’t have permission to send agreements.');
  var a = readDoc_(cfg, req.idToken, 'memberAgreements/' + encodeURIComponent(String(req.agreementId || '')));
  if (!a) throw new Error('Agreement not found.');
  return archiveAgreement_(cfg, req.idToken, String(req.agreementId), a, true);
}

function archiveAgreement_(cfg, idToken, id, a, again) {
  var props = PropertiesService.getScriptProperties(), key = 'agreement_' + id, done = props.getProperty(key);
  if (done && !again) return JSON.parse(done);
  // The time recorded by the database when the member accepted, shown in India time.
  var at = a.acceptedAt ? new Date(a.acceptedAt) : new Date();
  a.acceptedText = Utilities.formatDate(at, 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');
  a.acceptedOn = Utilities.formatDate(at, 'Asia/Kolkata', 'yyyy-MM-dd');
  a.ref = id;
  var ver = readDoc_(cfg, idToken, 'memberAgreementVersions/' + encodeURIComponent(String(a.version)));
  if (!ver) throw new Error('The agreement text (version ' + a.version + ') was not found.');
  var name = cleanName_(a.unitLabel + ' Portal agreement v' + a.version + ' - ' + a.signedName + ' - ' + String(a.acceptedOn || '').slice(0, 10) + '.pdf');
  var folder = child_(memberUnitFolder_(cfg, a.unit, a.unitLabel, a.wing), 'Agreements');
  var file, it = folder.getFilesByName(name);
  if (it.hasNext()) file = it.next();
  else {
    var pdf = Utilities.newBlob(agreementHtml_(ver, a), 'text/html', 'agreement.html').getAs('application/pdf').setName(name);
    file = folder.createFile(pdf);
    file.setDescription('Member portal agreement accepted electronically by ' + a.signedName + ' <' + a.email + '>, ' + a.unitLabel + ', version ' + a.version + '.');
  }
  var society = Session.getEffectiveUser().getEmail(), emailed = false, note = '';
  try {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Daily email limit reached; send it again tomorrow.');
    sendMail_(cfg, {
      to: a.email, cc: society, name: 'Sunshree Suntec CHS', replyTo: society,
      subject: 'Your member portal agreement – ' + a.unitLabel + ' – Sunshree Suntec CHS',
      htmlBody: '<p>Dear ' + esc_(a.signedName) + ',</p><p>Thank you for accepting the Member Portal Use Agreement (version ' + a.version + ') for unit ' + esc_(a.unitLabel) +
        ' on ' + esc_(a.acceptedText || '') + '. A copy is attached for your records and is kept in the Society’s records for your unit.</p>' +
        '<p>Please visit <a href="https://www.sunshreesuntec.com">www.sunshreesuntec.com</a> regularly for your bills, receipts and the Society’s notices, and upload your unit’s documents under <em>My unit’s documents</em>.</p>' +
        '<p>Managing Committee<br>Sunshree Suntec Co-operative Housing Society Ltd.<br>' + esc_(society) + '</p>',
      attachments: [file.getBlob()]
    });
    emailed = true;
  } catch (e) { note = String((e && e.message) || e); }
  var out = { pdf: { id: file.getId(), name: file.getName(), mime: 'application/pdf', size: file.getSize() }, emailed: emailed, emailedTo: a.email, cc: society, note: note };
  if (emailed) props.setProperty(key, JSON.stringify(out));
  return out;
}

/** Reminders and invitations to members, from the Society's account (3.16). Each email goes separately; nobody sees the others. */
function memberMail_(cfg, req, who, team) {
  if (!team.can('members')) throw new Error('You don’t have permission to send reminders to members.');
  var items = req.items || [];
  if (!items.length || items.length > 25) throw new Error('Send between 1 and 25 emails at a time.');
  var society = Session.getEffectiveUser().getEmail(), sent = [], failed = [];
  items.forEach(function (it) {
    var to = String((it && it.to) || '').trim();
    try {
      if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[A-Za-z]{2,}$/.test(to)) throw new Error('Not a valid email address.');
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Google’s daily email limit is reached; send the rest tomorrow.');
      var subject = String(it.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
      if (subject.indexOf('Sunshree Suntec') < 0) subject = 'Sunshree Suntec: ' + subject;
      var body = String(it.body || '').slice(0, 6000);
      var html = esc_(body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
      sendMail_(cfg, { to: to, name: 'Sunshree Suntec CHS', replyTo: society, subject: subject, body: body,
        htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">' + html +
          '<p style="color:#777;font-size:12px;margin-top:18px">Sent by ' + esc_(team.name) + ' (' + esc_(team.role) + ') for the Managing Committee of Sunshree Suntec CHS. Reply to this email to reach the Society.</p></div>' });
      sent.push(to);
    } catch (e) { failed.push({ to: to, error: String((e && e.message) || e) }); }
  });
  return { sent: sent, failed: failed, left: MailApp.getRemainingDailyQuota(), from: society };
}

/* ---------------- applications to view the Society's accounts (3.18) ---------------- */

var ACCESS_WHAT = { accounts: 'The Society’s audited accounts and documents', allDues: 'Maintenance amounts of all units' };
function accessText_(r) { return (r.what || []).map(function (w) { return ACCESS_WHAT[w] || w; }).join('; '); }
function accessUnit_(u) { return String(u || '').replace('-', ' '); }
function fmtDay_(iso) { return iso ? Utilities.formatDate(new Date(iso), 'Asia/Kolkata', 'dd/MM/yyyy') : ''; }

/** A member's application: to the Society (reply goes to the member) and an acknowledgement to the member. Once only. */
function accessRequest_(cfg, req, who, m) {
  var id = String(req.requestId || '');
  if (!/^[A-Za-z0-9]+_[0-9]+$/.test(id) || id.split('_')[0] !== who.uid) throw new Error('Unknown application.');
  var props = PropertiesService.getScriptProperties(), key = 'access_' + id, done = props.getProperty(key);
  if (done) return JSON.parse(done);
  var r = readDoc_(cfg, req.idToken, 'accessRequests/' + id);
  if (!r || r.uid !== who.uid) throw new Error('Unknown application.');
  var society = Session.getEffectiveUser().getEmail(), unit = accessUnit_(r.unit), when = fmtDay_(r.at);
  var lines = ['Application to view the Society’s accounts', '', 'Member: ' + r.name + ' (' + unit + ')', 'Relation to the unit: ' + (r.relation || 'not given'),
    'Email: ' + r.email, 'Mobile: +91 ' + r.mobile, 'Date: ' + when, 'Application no.: ' + id, '', 'Asked to see: ' + accessText_(r), '', 'Purpose:', r.purpose, '',
    'Decide it on the Society accounts page → Members → Applications to view the Society’s accounts (Chairman, Secretary, Treasurer or Accountant).',
    'Under Section 32 of the MCS Act 1960 a member may inspect the Society’s records; copies are given on payment of the fees in the bye-laws.'];
  var body = lines.join('\n');
  sendMail_(cfg, { to: society, replyTo: r.email, name: 'Sunshree Suntec CHS portal', subject: 'Application to view the Society’s accounts: ' + unit + ', ' + r.name,
    body: body, htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">' + esc_(body).replace(/\n/g, '<br>') + '</div>' });
  var ack = 'Dear ' + r.name + ',\n\nThe Society has received your application (no. ' + id + ', ' + when + ') to see: ' + accessText_(r) + '.\n\n' +
    'The Chairman, Secretary, Treasurer or Accountant will decide it and you will receive an email. You can also follow it on the portal under “Society accounts”.\n\n' +
    'Regards,\nManaging Committee, Sunshree Suntec Co-op. Housing Society Ltd.';
  sendMail_(cfg, { to: r.email, replyTo: society, name: 'Sunshree Suntec CHS', subject: 'Sunshree Suntec: your application to view the Society’s accounts (' + unit + ')', body: ack });
  var out = { emailed: true, to: society, ack: r.email };
  props.setProperty(key, JSON.stringify(out));
  return out;
}

/** The decision, emailed to the member by an approver. Once per decision. */
function accessDecision_(cfg, req, who, team) {
  if (!team.approver) throw new Error('Only the Chairman, Secretary, Treasurer or Accountant decide these applications.');
  var id = String(req.requestId || '');
  if (!/^[A-Za-z0-9]+_[0-9]+$/.test(id)) throw new Error('Unknown application.');
  var r = readDoc_(cfg, req.idToken, 'accessRequests/' + id);
  if (!r || ['approved', 'rejected'].indexOf(r.status) < 0) throw new Error('This application hasn’t been decided yet.');
  var props = PropertiesService.getScriptProperties(), key = 'accessDecision_' + id + '_' + r.status, done = props.getProperty(key);
  if (done) return JSON.parse(done);
  var society = Session.getEffectiveUser().getEmail(), unit = accessUnit_(r.unit);
  var granted = (r.granted && r.granted.length) ? accessText_({ what: r.granted }) : accessText_(r);
  var body = r.status === 'approved'
    ? 'Dear ' + r.name + ',\n\nYour application no. ' + id + ' is approved. You can now see: ' + granted + (r.until ? ', until ' + fmtDay_(r.until) : '') + '.\n\n' +
      'Sign in at ' + cfg.site + '#member and open “Society accounts”. Please keep the information confidential and use it only for the Society’s affairs, as in the portal agreement.\n\n' +
      'For certified copies of any document, write to the Society; copies are given on payment of the fees in the bye-laws (Section 32(2) of the MCS Act 1960).'
    : 'Dear ' + r.name + ',\n\nYour application no. ' + id + ' to see ' + accessText_(r) + ' was not approved' + (r.reason ? ' for this reason: ' + r.reason : '') + '.\n\n' +
      'As a member you may still inspect the Society’s records at the office under Section 32 of the MCS Act 1960. Please write to the Society to fix a time, or reply to this email.';
  body += '\n\nRegards,\n' + (r.decidedByName || team.name) + ', ' + (r.decidedRole || team.role) + '\nSunshree Suntec Co-op. Housing Society Ltd.';
  sendMail_(cfg, { to: r.email, cc: society, replyTo: society, name: 'Sunshree Suntec CHS',
    subject: 'Sunshree Suntec: your application to view the Society’s accounts is ' + (r.status === 'approved' ? 'approved' : 'not approved') + ' (' + unit + ')', body: body });
  var out = { emailed: true, to: r.email, cc: society };
  props.setProperty(key, JSON.stringify(out));
  return out;
}

/** Every email goes through here: a test copy marks the subject [TEST] and says so at the top. */
function sendMail_(cfg, o) {
  if (cfg && cfg.test) {
    o.subject = '[TEST] ' + o.subject;
    var note = 'TEST COPY: this email comes from the test copy of the Society’s website, not from the Society’s records.';
    if (o.htmlBody) o.htmlBody = '<p style="background:#b3261e;color:#fff;padding:6px 10px;font-weight:bold">' + note + '</p>' + o.htmlBody;
    if (o.body) o.body = note + '\n\n' + o.body;
  }
  return MailApp.sendEmail(o);
}

function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/** Same layout as agreementHTML() in docs/assets/js/memberagreement.js, for an A4 PDF. */
function agreementHtml_(v, a) {
  var rel = { owner: 'Owner (member)', jointOwner: 'Joint owner / associate member', family: 'Family member of the owner', tenant: 'Tenant / licensee', caretaker: 'Caretaker / authorised person' };
  var h = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.45;color:#1b1f24;margin:18mm 16mm}' +
    'h1{font-size:15pt;margin:0 0 4pt}h2{font-size:11.5pt;margin:12pt 0 4pt}.meta{color:#555;font-size:9pt}.clause{margin:3pt 0}.no{font-weight:bold;margin-right:4pt}' +
    '.box{border:1px solid #999;padding:6pt 8pt;margin:8pt 0}</style></head><body>';
  h += '<p class="meta">SUNSHREE SUNTEC CO-OP. HSG. SOC. LTD. · Regd. No. PNA/PNA(4)/HSG/(TC)/12471/2012-13 dated 30-10-2012 · S. No. 19/2, 20/1, NIBM Road, Kondhwa Khurd, Pune 411 048</p>';
  h += '<h1>' + esc_(v.title) + '</h1><p class="meta">Version ' + esc_(a.version) + (v.publishedOn ? ', published ' + esc_(v.publishedOn) : '') + '</p>';
  (v.intro || []).forEach(function (p) { h += '<p>' + esc_(p) + '</p>'; });
  h += '<div class="box"><strong>User:</strong> ' + esc_(a.name) + (a.relation ? ', ' + esc_(rel[a.relation] || a.relation) : '') + '<br><strong>Unit:</strong> ' + esc_(a.unitLabel) +
    '<br><strong>Email:</strong> ' + esc_(a.email) + (a.mobile ? ' · <strong>Mobile:</strong> +91 ' + esc_(a.mobile) : '') + '</div>';
  (v.sections || []).forEach(function (s, i) {
    h += '<h2>' + (i + 1) + '. ' + esc_(s.heading) + '</h2>';
    (s.clauses || []).forEach(function (c, j) { h += '<p class="clause"><span class="no">' + (i + 1) + '.' + (j + 1) + '</span>' + esc_(c) + '</p>'; });
  });
  h += '<p><strong>' + esc_(v.closing || '') + '</strong></p>';
  h += '<div class="box"><strong>Accepted electronically</strong> by ' + esc_(a.signedName) + ' (' + esc_(a.email) + '), ' + esc_(a.unitLabel) + ', on ' + esc_(a.acceptedText || a.acceptedOn || '') +
    ' (India time). Declaration accepted: ' + esc_((a.confirmations || []).join('; ')) + '. Agreement reference: ' + esc_(a.ref || '') + '.</div>';
  h += '<p class="meta">This copy was generated by the Society’s records system and is kept in the Society’s records for the unit. Accepted under section 10A of the Information Technology Act, 2000.</p></body></html>';
  return h;
}

/* ---------------- full backup and restore (3.25) ---------------- */

var BACKUP_FORMAT = 'sunshree-suntec-full-backup';
var BACKUP_DEFAULTS = { frequency: 'daily', hour: 2, keepDays: 30, weekday: 0 };

/** Calls a Firestore / Identity Toolkit REST address with the script owner's own access (IAM, not the security rules). */
function ownerFetch_(cfg, url, method, body) {
  var o = { method: method || 'get', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': cfg.project } };
  if (body !== undefined) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var r = UrlFetchApp.fetch(url, o), code = r.getResponseCode(), text = r.getContentText();
  if (code !== 200) {
    var msg = text;
    try { msg = JSON.parse(text).error.message; } catch (e) { /* keep text */ }
    if (code === 403) msg = 'The Society’s Google account has no access to the database (' + msg + '). In the Firebase console → Project settings → Users and permissions, add ' + Session.getEffectiveUser().getEmail() + ' as Editor.';
    throw new Error('Database ' + code + ': ' + String(msg).slice(0, 400));
  }
  return text ? JSON.parse(text) : {};
}
function dbBase_(cfg) { return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.project) + '/databases/(default)/documents'; }

/** Every document: one query over all collections, 300 at a time, in order of their path. */
function allDocs_(cfg) {
  var base = dbBase_(cfg), out = [], last = null;
  for (var page = 0; page < 2000; page++) {
    var q = { from: [{ allDescendants: true }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 300 };
    if (last) q.startAt = { values: [{ referenceValue: last }], before: false };
    var res = ownerFetch_(cfg, base + ':runQuery', 'post', { structuredQuery: q }), n = 0;
    (res || []).forEach(function (x) { if (x.document) { out.push(x.document); last = x.document.name; n++; } });
    if (n < 300) return out;
  }
  throw new Error('Too many documents to back up in one go.');
}

/** The sign-in accounts (uid, email, name, Google link), so members keep their records if the project must be rebuilt. */
function allUsers_(cfg) {
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' + encodeURIComponent(cfg.project) + '/accounts:batchGet?maxResults=500', out = [], tok = '';
  for (var i = 0; i < 200; i++) {
    var res = ownerFetch_(cfg, url + (tok ? '&nextPageToken=' + encodeURIComponent(tok) : ''));
    (res.users || []).forEach(function (u) {
      out.push({ localId: u.localId, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, createdAt: u.createdAt, disabled: u.disabled,
        providerUserInfo: (u.providerUserInfo || []).map(function (p) { return { providerId: p.providerId, rawId: p.rawId, email: p.email, displayName: p.displayName }; }) });
    });
    tok = res.nextPageToken;
    if (!tok) return out;
  }
  return out;
}

function backupFolder_(cfg) { return child_(child_(rootFolder_(cfg), 'Backups'), 'Full'); }
function istNow_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd HHmm"); }

/** Firestore REST value ↔ plain value, for the settings documents this script reads and writes. */
function fsVal_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal_) } };
  if (typeof v === 'object') { var f = {}; Object.keys(v).forEach(function (k) { f[k] = fsVal_(v[k]); }); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function ownerRead_(cfg, path) {
  try { var d = ownerFetch_(cfg, dbBase_(cfg) + '/' + path); return plain_({ mapValue: { fields: d.fields || {} } }); }
  catch (e) { if (/Database 404/.test(e.message)) return null; throw e; }
}
function ownerWrite_(cfg, path, data) {
  var mask = Object.keys(data).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  ownerFetch_(cfg, dbBase_(cfg) + '/' + path + '?' + mask, 'patch', { fields: fsVal_(data).mapValue.fields });
}
function backupConfig_(cfg) {
  var c = ownerRead_(cfg, 'settings/fullBackupConfig') || {}, o = {};
  Object.keys(BACKUP_DEFAULTS).forEach(function (k) { o[k] = c[k] != null && c[k] !== '' ? c[k] : BACKUP_DEFAULTS[k]; });
  return o;
}

/** Makes the backup file. Returns a summary; records it in settings/fullBackup; emails the Society if it fails. */
function runFullBackup_(cfg, kind, byName) {
  var t0 = Date.now(), status;
  try {
    var docs = allDocs_(cfg), users = [], usersNote = '';
    try { users = allUsers_(cfg); } catch (e) { usersNote = String(e.message || e).slice(0, 300); }
    var prefix = 'projects/' + cfg.project + '/databases/(default)/documents/', counts = {};
    var list = docs.map(function (d) {
      var path = d.name.slice(d.name.indexOf('/documents/') + 11), top = path.split('/')[0];
      counts[top] = (counts[top] || 0) + 1;
      return { path: path, fields: d.fields || {}, createTime: d.createTime, updateTime: d.updateTime };
    });
    var data = JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1, project: cfg.project, prefix: prefix, createdAt: new Date().toISOString(),
      kind: kind, by: byName || '', counts: counts, documents: list, users: users, usersNote: usersNote });
    var name = 'Full backup ' + istNow_() + '.json.gz';
    var blob = Utilities.gzip(Utilities.newBlob(data, 'application/json', name.replace(/\.gz$/, '')), name);
    var file = backupFolder_(cfg).createFile(blob);
    file.setDescription('Everything in the Society website’s database (' + list.length + ' documents, ' + users.length + ' sign-in accounts), ' +
      (kind === 'scheduled' ? 'scheduled backup' : 'backed up on request by ' + byName) + '. Restore from the website (Settings → Full backups) or with restoreLatestBackup in the storage script.');
    var removed = pruneBackups_(cfg);
    status = { ok: true, kind: kind, by: byName || '', at: new Date(), docs: list.length, users: users.length, usersNote: usersNote, bytes: file.getSize(), fileId: file.getId(), fileName: name,
      seconds: Math.round((Date.now() - t0) / 1000), removed: removed, collections: counts, error: '', failedAt: null };
  } catch (err) {
    status = { ok: false, kind: kind, by: byName || '', at: new Date(), error: String(err.message || err).slice(0, 500), seconds: Math.round((Date.now() - t0) / 1000) };
    try { sendMail_(cfg, { to: Session.getEffectiveUser().getEmail(), subject: 'Sunshree Suntec: the full backup failed', body: 'The ' + kind + ' backup of the website’s database failed on ' + istNow_() + ' (India time):\n\n' + status.error + '\n\nThe earlier backups are still in the Drive folder Backups / Full. See Settings → Full backups on the accounts page.' }); } catch (e) { /* no mail */ }
  }
  try { ownerWrite_(cfg, 'settings/fullBackup', status.ok ? status : { ok: false, failedAt: status.at, error: status.error, kind: kind, by: status.by }); } catch (e) { if (status.ok) status.statusNote = String(e.message || e).slice(0, 200); }
  return status;
}

/** Keeps the newest copies for `keepDays` days, and every first-of-the-month copy. */
function pruneBackups_(cfg) {
  var keep = Number(backupConfig_(cfg).keepDays) || BACKUP_DEFAULTS.keepDays, cut = new Date(Date.now() - keep * 864e5), n = 0;
  var it = backupFolder_(cfg).getFiles();
  while (it.hasNext()) {
    var f = it.next(), m = f.getName().match(/^Full backup (\d{4})-(\d{2})-(\d{2}) /);
    if (!m || m[3] === '01' || f.isTrashed()) continue;
    if (new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T23:59:59+05:30') < cut) { f.setTrashed(true); n++; }
  }
  return n;
}

/** The time-driven trigger (every hour): backs up when the schedule set on the website says it is due. */
function scheduledBackup() {
  var cfg = config_(), c = backupConfig_(cfg);
  if (c.frequency === 'off') return;
  var now = new Date(), hour = Number(Utilities.formatDate(now, 'Asia/Kolkata', 'H')), day = Number(Utilities.formatDate(now, 'Asia/Kolkata', 'u')) % 7;
  if (hour !== Number(c.hour)) return;
  if (c.frequency === 'weekly' && day !== Number(c.weekday)) return;
  var last = ownerRead_(cfg, 'settings/fullBackup') || {};
  if (last.ok && last.at && Date.now() - new Date(last.at).getTime() < 20 * 3600e3) return;   // already done today
  runFullBackup_(cfg, 'scheduled', '');
}

/** Run once from the editor (Run → setupBackups): asks for the permissions and starts the schedule. */
function setupBackups() {
  var cfg = config_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'scheduledBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('scheduledBackup').timeBased().everyHours(1).create();
  Logger.log('Schedule set: the script looks every hour and backs up at the time set on the website (default ' + BACKUP_DEFAULTS.hour + ':00 India time, daily).');
  var s = runFullBackup_(cfg, 'manual', 'setupBackups');
  Logger.log(s.ok ? 'First backup made: ' + s.fileName + ' — ' + s.docs + ' documents, ' + s.users + ' sign-in accounts' + (s.usersNote ? ' (accounts not saved: ' + s.usersNote + ')' : '') + '.' : 'The first backup failed: ' + s.error);
}

function fullBackupAction_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can start a full backup.');
  var s = runFullBackup_(cfg, 'manual', team.name);
  if (!s.ok) throw new Error(s.error);
  return { backup: { fileName: s.fileName, docs: s.docs, users: s.users, bytes: s.bytes, seconds: s.seconds, usersNote: s.usersNote } };
}

function listBackups_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can see the full backups.');
  var it = backupFolder_(cfg).getFiles(), out = [];
  while (it.hasNext()) { var f = it.next(); if (/^Full backup .*\.json\.gz$/.test(f.getName()) && !f.isTrashed()) out.push({ id: f.getId(), name: f.getName(), bytes: f.getSize() }); }
  out.sort(function (a, b) { return a.name < b.name ? 1 : -1; });
  return { backups: out.slice(0, 120) };
}

function readFullBackup_(cfg, fileId) {
  var f = DriveApp.getFileById(fileId), p = f.getParents();
  if (!p.hasNext() || p.next().getId() !== backupFolder_(cfg).getId()) throw new Error('That file is not one of the full backups.');
  var b = Utilities.ungzip(f.getBlob()), data = JSON.parse(b.getDataAsString());
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.documents)) throw new Error('That file is not a full backup.');
  data.fileName = f.getName();
  return data;
}

/**
 * Puts documents back from a backup. mode 'missing': only documents that no longer exist (nothing is changed);
 * mode 'all': every document in the backup as it was then (documents made since are left alone). `only`: limit to
 * these top-level collections. dryRun: just count.
 */
function restoreFull_(cfg, data, mode, only, dryRun) {
  var docs = data.documents.filter(function (d) { return !only || !only.length || only.indexOf(d.path.split('/')[0]) >= 0; });
  var res = { total: docs.length, restored: 0, existed: 0, failed: 0, errors: [] };
  if (dryRun) return res;
  var oldPrefix = data.prefix, newPrefix = 'projects/' + cfg.project + '/databases/(default)/documents/';
  var batch = [], size = 0;
  var flush = function () {
    if (!batch.length) return;
    var r = ownerFetch_(cfg, dbBase_(cfg) + ':batchWrite', 'post', { writes: batch });
    (r.status || []).forEach(function (st) {
      var c = st && st.code || 0;
      if (!c) res.restored++; else if (c === 9 || c === 6) res.existed++; else { res.failed++; if (res.errors.length < 5) res.errors.push(st.message || ('code ' + c)); }
    });
    batch = []; size = 0;
  };
  docs.forEach(function (d) {
    var fields = d.fields;
    if (oldPrefix && oldPrefix !== newPrefix) fields = JSON.parse(JSON.stringify(fields).split('"' + oldPrefix).join('"' + newPrefix));   // references into a new project
    var w = { update: { name: newPrefix + d.path, fields: fields } };
    if (mode !== 'all') w.currentDocument = { exists: false };
    var n = JSON.stringify(w).length;
    if (batch.length >= 400 || size + n > 8e6) flush();
    batch.push(w); size += n;
  });
  flush();
  return res;
}

/** Recreates the sign-in accounts (same uid) in a new, empty Firebase project. */
function restoreUsers_(cfg, users) {
  var url = 'https://identitytoolkit.googleapis.com/v1/projects/' + encodeURIComponent(cfg.project) + '/accounts:batchCreate', made = 0, errors = [];
  for (var i = 0; i < users.length; i += 500) {
    var r = ownerFetch_(cfg, url, 'post', { users: users.slice(i, i + 500), allowOverwrite: false });
    made += users.slice(i, i + 500).length - (r.error || []).length;
    (r.error || []).slice(0, 5).forEach(function (e) { errors.push(e.message); });
  }
  return { made: made, errors: errors };
}

function restoreBackupAction_(cfg, req, who, team) {
  if (!team.committee) throw new Error('Only the committee can restore from a full backup.');
  if (req.mode === 'all' && req.confirm !== 'RESTORE') throw new Error('Type RESTORE to put everything back as it was.');
  var data = readFullBackup_(cfg, req.fileId);
  var only = Array.isArray(req.collections) ? req.collections.map(String) : [];
  if (req.info) return { info: { fileName: data.fileName, createdAt: data.createdAt, counts: data.counts, users: (data.users || []).length, project: data.project } };
  var res = restoreFull_(cfg, data, req.mode === 'all' ? 'all' : 'missing', only, false);
  var note = { at: new Date(), by: team.name, file: data.fileName, mode: req.mode === 'all' ? 'all' : 'missing', collections: only.join(', ') || 'everything', restored: res.restored, existed: res.existed, failed: res.failed };
  try { ownerWrite_(cfg, 'settings/fullBackup', { lastRestore: note }); } catch (e) { /* recorded by email below */ }
  try { sendMail_(cfg, { to: Session.getEffectiveUser().getEmail(), subject: 'Sunshree Suntec: data restored from a full backup',
    body: team.name + ' <' + who.email + '> restored from ' + data.fileName + ' (' + (note.mode === 'all' ? 'everything as it was' : 'only what was missing') + '; ' + note.collections + ') on ' + istNow_() + ' (India time).\n\n' +
      res.restored + ' documents written, ' + res.existed + ' already there, ' + res.failed + ' failed.' }); } catch (e) { /* no mail */ }
  return { restore: res };
}

/**
 * For a disaster, run from this editor (the website is not needed). Puts back the documents missing from the
 * database from the newest backup. To rebuild in a NEW Firebase project: change FIREBASE_PROJECT_ID and
 * FIREBASE_API_KEY in Script properties to the new project, then run restoreLatestBackupEverything.
 */
function restoreLatestBackup() { restoreLatest_('missing'); }
function restoreLatestBackupEverything() { restoreLatest_('all'); }
function restoreLatest_(mode) {
  var cfg = config_(), list = listBackups_(cfg, {}, null, { committee: true }).backups;
  if (!list.length) throw new Error('There is no full backup in the Drive folder Backups / Full.');
  var data = readFullBackup_(cfg, list[0].id);
  Logger.log('Restoring from ' + data.fileName + ' (' + data.documents.length + ' documents, made ' + data.createdAt + ') into project ' + cfg.project + ', ' + (mode === 'all' ? 'everything as it was' : 'only what is missing') + '…');
  var res = restoreFull_(cfg, data, mode, [], false);
  Logger.log(res.restored + ' documents written, ' + res.existed + ' already there, ' + res.failed + ' failed. ' + res.errors.join(' | '));
  if (data.project !== cfg.project && (data.users || []).length) {
    var u = restoreUsers_(cfg, data.users);
    Logger.log('Sign-in accounts recreated in the new project: ' + u.made + ' of ' + data.users.length + '. ' + u.errors.join(' | '));
  }
}

/* ---------------- helpers ---------------- */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor (Run → setup) to give the script access to Drive and create the records folder. */
function setup() {
  var cfg = config_();
  var root = rootFolder_(cfg);
  Logger.log('Records folder: ' + root.getName() + ' — ' + root.getUrl());
  // Also asks for (and checks) the permission to send email, needed for member agreement copies.
  Logger.log('Email permission: allowed. Emails left today: ' + MailApp.getRemainingDailyQuota() + ' (sent as ' + Session.getEffectiveUser().getEmail() + ').');
  Logger.log('Now: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy, and copy the Web app URL.');
}
