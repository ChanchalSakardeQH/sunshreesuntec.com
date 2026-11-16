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
 */
var MAX_BYTES = 15 * 1024 * 1024;
var MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv'];
var STATUS_FOLDER = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function config_() {
  var p = PropertiesService.getScriptProperties();
  var c = { apiKey: p.getProperty('FIREBASE_API_KEY'), project: p.getProperty('FIREBASE_PROJECT_ID'),
    root: p.getProperty('ROOT_FOLDER') || 'Sunshree Suntec Society Records', site: p.getProperty('SITE_ADDRESS') || 'https://sunshreesuntec.com/' };
  if (!c.apiKey || !c.project) throw new Error('The storage script is not set up: add FIREBASE_API_KEY and FIREBASE_PROJECT_ID in its Script properties.');
  return c;
}

function doGet() {
  return json_({ ok: true, service: 'Sunshree Suntec records', version: 1 });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var cfg = config_();
    var who = verifyToken_(cfg, req.idToken);
    var team = teamRecord_(cfg, who, req.idToken);
    var actions = { ping: ping_, upload: upload_, fetch: fetchFile_, move: move_ };
    var fn = actions[req.action];
    if (!fn) throw new Error('Unknown request.');
    var out = fn(cfg, req, who, team);
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
  return { uid: u.localId, email: String(u.email || '').toLowerCase() };
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
  if (req.settlementId) {
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
