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
 */
var MAX_BYTES = 15 * 1024 * 1024;
var MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv'];
var STATUS_FOLDER = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
/* Unit file records → their folder inside the unit's folder. */
var UNIT_FOLDER = { members: 'Members and shares', tenants: 'Tenants and agreements', comms: 'Communication',
  electricity: 'Electricity (MSEB)', propertyTax: 'Property tax (PMC)' };
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
  if (!c.apiKey || !c.project) throw new Error('The storage script is not set up: add FIREBASE_API_KEY and FIREBASE_PROJECT_ID in its Script properties.');
  return c;
}

function doGet() {
  return json_({ ok: true, service: 'Sunshree Suntec records', version: 5 });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var cfg = config_();
    var who = verifyToken_(cfg, req.idToken);
    var memberActions = { memberUpload: memberUpload_, memberFetch: memberFetch_, memberAgreement: memberAgreement_ };
    var out;
    if (memberActions[req.action]) {
      out = memberActions[req.action](cfg, req, who, memberRecord_(cfg, who, req.idToken));
    } else {
      var team = teamRecord_(cfg, who, req.idToken);
      var actions = { ping: ping_, upload: upload_, fetch: fetchFile_, move: move_, backup: backup_, readBackup: readBackup_, resendAgreement: resendAgreement_,
        backupRegister: backupRegister_ };
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
  return { committee: committee, role: a.role || (committee ? 'Committee' : 'Staff'), name: a.name || who.email,
    can: function (p) { return committee || perms[p] === true; } };
}

function any_(team, list) { return list.some(function (p) { return team.can(p); }); }

/* ---------------- folders ---------------- */

function rootFolder_(cfg) {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ } }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    id = p.getProperty('ROOT_FOLDER_ID');
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
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
    var d = readDoc_(cfg, req.idToken, 'units/' + encodeURIComponent(req.unitId) + '/memberDocs/' + encodeURIComponent(req.recordId));
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
    MailApp.sendEmail({
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
    ' (India time). Confirmations ticked: ' + esc_((a.confirmations || []).join('; ')) + '. Agreement reference: ' + esc_(a.ref || '') + '.</div>';
  h += '<p class="meta">This copy was generated by the Society’s records system and is kept in the Society’s records for the unit. Accepted under section 10A of the Information Technology Act, 2000.</p></body></html>';
  return h;
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
  Logger.log('Now: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy, and copy the Web app URL.');
}
