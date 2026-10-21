/**
 * Club Fixtures – Google Sheets + Apps Script web app
 * Reads the match list from the sheet, shows it to everyone with the link
 * (optionally behind a viewer code), and lets admins add/edit/delete with a PIN.
 *
 * Sheet format:
 *   Our Team | Opponent | Venue | Home Team | Away Team | Status | Time | Date | Location
 *   - Venue: Home / Away;  Time: HH:MM;  Date: a date, or a note like TBC / Internal
 *   - Location: where it's played (Celbridge, Terenure…), TBC or Internal
 *   - Result: Won / Lost / Draw (blank until played);  Score: free text, e.g. 5-3
 *     (both columns are added automatically if missing)
 * Older sheets with "Celbridge @ 18:00" in the time column still read correctly;
 * run splitIntoSeparateColumns() once to convert them.
 */

const MATCHES_SHEET = 'Matches';     // falls back to any tab with "Our Team" + "Opponent" headers
const SETTINGS_SHEET = 'Settings';
const PLACES_SHEET = 'Places';

const FIELDS = [
  { key: 'ourTeam',  header: 'our team' },
  { key: 'opponent', header: 'opponent' },
  { key: 'venue',    header: 'venue' },
  { key: 'homeTeam', header: 'home team' },
  { key: 'awayTeam', header: 'away team' },
  { key: 'status',   header: 'status' },
  { key: 'time',     header: 'time' },
  { key: 'date',     header: 'date' },
  { key: 'location', header: 'location' },
  { key: 'result',   header: 'result' },
  { key: 'score',    header: 'score' }
];
const TEXT_FIELDS = ['ourTeam', 'opponent', 'venue', 'homeTeam', 'awayTeam', 'status', 'result', 'score'];

const DEFAULT_SETTINGS = [
  ['Club Name', 'My Club', 'Shown at the top of the app'],
  ['Admin PINs', '', 'Comma-separated, one per admin (e.g. 4821, 7730). Blank = editing disabled'],
  ['Viewer Code', '', 'Optional code managers enter once to view. Blank = anyone with the link'],
  ['Statuses', 'Not Scheduled, Scheduled, Confirmed, Postponed, Cancelled, Played', 'Options in the status dropdown']
];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/* ---------------- Web app entry ---------------- */

function doGet() {
  ensureSettings_();
  ensurePlaces_();
  ensureResultColumns_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(getSettings_().clubName + ' Fixtures')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Fixtures App')
    .addItem('Set up Settings & Places tabs', 'setup')
    .addItem('Split time into Time + Location columns', 'splitIntoSeparateColumns')
    .addToUi();
}

/** Run once from the editor (or the sheet menu) to create the Settings and Places tabs. */
function setup() {
  getMatchesSheet_(); // throws a clear error if the match tab can't be found
  ensureResultColumns_();
  ensureSettings_();
  ensurePlaces_();
}

/* ---------------- Public (client-callable) ---------------- */

function getBootstrap(viewerCode) {
  const s = getSettings_();
  if (s.viewerCode && String(viewerCode || '').trim() !== s.viewerCode) {
    return { locked: true, clubName: s.clubName };
  }
  return Object.assign({ locked: false }, payload_(s));
}

function verifyAdmin(pin) {
  return isAdmin_(pin);
}

function saveMatch(pin, match, rowNumber, fp) {
  assertAdmin_(pin);
  const m = validate_(match);
  ensureResultColumns_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getMatchesSheet_();
    const lastCol = sh.getLastColumn();
    const map = headerMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
    let row;
    if (rowNumber) {
      row = Number(rowNumber);
      checkFingerprint_(sh, row, lastCol, fp);
    } else {
      row = lastDataRow_(sh) + 1;
    }
    const set = (key, value, fmt) => {
      const c = map[key];
      if (c === undefined) return;
      const cell = sh.getRange(row, c + 1);
      if (fmt) cell.setNumberFormat(fmt);
      cell.setValue(value);
    };
    TEXT_FIELDS.forEach(k => set(k, m[k]));

    // Date: real date, or a note such as TBC / Internal
    if (m.date) set('date', toDate_(m.date), 'd-mmm-yyyy');
    else set('date', m.dateNote, '@');

    // Time + place: separate columns if a location column exists, else "Place @ HH:MM"
    if (map.location !== undefined) {
      set('location', m.place);
      set('time', m.time, '@');
    } else {
      set('time', joinTimeCell_(m.place, m.time), '@');
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
}

function deleteMatch(pin, rowNumber, fp) {
  assertAdmin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getMatchesSheet_();
    const row = Number(rowNumber);
    checkFingerprint_(sh, row, sh.getLastColumn(), fp);
    sh.deleteRow(row);
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
}

/* ---------------- Reading ---------------- */

function payload_(s) {
  const matches = readMatches_();
  const statuses = s.statuses.slice();
  matches.forEach(m => { if (m.status && statuses.indexOf(m.status) < 0) statuses.push(m.status); });
  const teams = Array.from(new Set(matches.map(m => m.ourTeam).filter(Boolean))).sort();
  return {
    clubName: s.clubName,
    adminEnabled: s.adminPins.length > 0,
    statuses: statuses,
    teams: teams,
    places: readPlaces_(),
    matches: matches,
    loadedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')
  };
}

function readMatches_() {
  const sh = getMatchesSheet_();
  const range = sh.getDataRange();
  const values = range.getValues();
  const display = range.getDisplayValues();
  if (values.length < 2) return [];
  const map = headerMap_(values[0]);
  const tz = Session.getScriptTimeZone();
  const cell = (i, key) => map[key] === undefined ? '' : String(display[i][map[key]]).trim();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (display[i].every(v => String(v).trim() === '')) continue;
    const m = { row: i + 1, fp: fingerprint_(display[i]) };
    TEXT_FIELDS.forEach(k => { m[k] = cell(i, k); });

    const rawDate = map.date === undefined ? '' : values[i][map.date];
    const d = parseDateCell_(rawDate, cell(i, 'date'), tz);
    m.date = d.iso; m.dateNote = d.note;

    const t = splitTimeCell_(cell(i, 'time'));
    m.time = t.time;
    m.place = map.location !== undefined && cell(i, 'location') ? cell(i, 'location') : t.place;
    out.push(m);
  }
  return out;
}

/** Returns { iso: 'yyyy-MM-dd' or '', note: text when not a date (TBC, Internal…) } */
function parseDateCell_(raw, shown, tz) {
  if (raw instanceof Date && !isNaN(raw)) return { iso: Utilities.formatDate(raw, tz, 'yyyy-MM-dd'), note: '' };
  const s = String(shown || raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { iso: m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]), note: '' };
  m = s.match(/^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/);           // 1-Nov-2026
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon) return { iso: fullYear_(m[3]) + '-' + pad_(mon) + '-' + pad_(m[1]), note: '' };
  }
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);                       // 01/11/2026 (Irish)
  if (m) return { iso: fullYear_(m[3]) + '-' + pad_(m[2]) + '-' + pad_(m[1]), note: '' };
  return { iso: '', note: s };
}

/** "Celbridge @ 18:00" → {place:'Celbridge', time:'18:00'}; "Ace" → {place:'Ace'}; "18:00" → {time:'18:00'} */
function splitTimeCell_(s) {
  s = String(s || '').trim();
  if (!s) return { place: '', time: '' };
  let m = s.match(/^(.*?)\s*@\s*(.+)$/);
  if (m) {
    const t = normTime_(m[2]);
    if (t) return { place: m[1].trim(), time: t };
    return { place: s, time: '' };
  }
  const t = normTime_(s);
  if (t) return { place: '', time: t };
  return { place: s, time: '' };
}

function joinTimeCell_(place, time) {
  if (place && time) return place + ' @ ' + time;
  return place || time || '';
}

/** Returns 'HH:mm' or '' if s isn't a time */
function normTime_(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'pm';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h > 23 || Number(m[2]) > 59) return '';
  return pad_(h) + ':' + m[2];
}

/* ---------------- One-time migration ---------------- */

/**
 * Splits the old combined "time" cells ("Celbridge @ 18:00") into a separate
 * Location column + a clean Time column, and turns date text ("1-Nov-2026")
 * into real dates. Safe to run more than once.
 */
function splitIntoSeparateColumns() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getMatchesSheet_();
    const tz = Session.getScriptTimeZone();
    let lastCol = sh.getLastColumn();
    const map = headerMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
    if (map.time === undefined || map.date === undefined) throw new Error('Need "time" and "Date" headers in row 1.');

    if (map.location === undefined) {
      const header = sh.getRange(1, lastCol + 1);
      sh.getRange(1, lastCol).copyFormatToRange(sh, lastCol + 1, lastCol + 1, 1, 1);
      header.setValue('Location');
      map.location = lastCol;
    }
    const n = lastDataRow_(sh) - 1;
    if (n < 1) return;

    const timeR = sh.getRange(2, map.time + 1, n, 1);
    const locR = sh.getRange(2, map.location + 1, n, 1);
    const dateR = sh.getRange(2, map.date + 1, n, 1);
    const timeShown = timeR.getDisplayValues();
    const locShown = locR.getDisplayValues();
    const dateRaw = dateR.getValues();
    const dateShown = dateR.getDisplayValues();

    const times = [], locs = [], dates = [];
    for (let i = 0; i < n; i++) {
      const t = splitTimeCell_(timeShown[i][0]);
      times.push([t.time]);
      locs.push([String(locShown[i][0]).trim() || t.place]);
      const d = parseDateCell_(dateRaw[i][0], dateShown[i][0], tz);
      dates.push([d.iso ? toDate_(d.iso) : d.note]);
    }
    timeR.setNumberFormat('@').setValues(times);
    locR.setValues(locs);
    dateR.setValues(dates).setNumberFormat('d-mmm-yyyy');
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  try { SpreadsheetApp.getUi().alert('Done – Location, Date and Time are now separate columns.'); } catch (e) {}
}

/** Adds "Result" and "Score" header columns to the match tab if they're missing. */
function ensureResultColumns_() {
  const sh = getMatchesSheet_();
  const lastCol = sh.getLastColumn();
  const map = headerMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  let col = lastCol;
  [['result', 'Result'], ['score', 'Score']].forEach(([key, label]) => {
    if (map[key] !== undefined) return;
    sh.getRange(1, lastCol).copyFormatToRange(sh, col + 1, col + 1, 1, 1);
    sh.getRange(1, col + 1).setValue(label);
    col++;
  });
}

/* ---------------- Places (for Google Maps links) ---------------- */

function readPlaces_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(PLACES_SHEET);
  if (!sh) return {};
  const out = {};
  sh.getDataRange().getDisplayValues().slice(1).forEach(r => {
    const name = String(r[0]).trim().toLowerCase();
    if (name) out[name] = String(r[1]).trim();
  });
  return out;
}

/** Creates the Places tab once, pre-filled with every place found in the fixtures. */
function ensurePlaces_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(PLACES_SHEET)) return;
  const sh = ss.insertSheet(PLACES_SHEET);
  sh.getRange(1, 1, 1, 2).setValues([['Place', 'Address or Eircode (for Google Maps)']]).setFontWeight('bold');
  const skip = ['', 'tbc', 'internal'];
  const seen = {};
  readMatches_().forEach(m => {
    const k = m.place.toLowerCase();
    if (skip.indexOf(k) < 0 && !seen[k]) seen[k] = m.place;
  });
  const rows = Object.keys(seen).sort().map(k => [seen[k], '']);
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 420);
}

/* ---------------- Helpers ---------------- */

function validate_(match) {
  const src = match || {};
  const m = {};
  ['ourTeam', 'opponent', 'venue', 'homeTeam', 'awayTeam', 'status', 'result', 'score', 'date', 'dateNote', 'time', 'place']
    .forEach(k => { m[k] = String(src[k] || '').trim().slice(0, 200); });
  if (!m.ourTeam) throw new Error('Our Team is required.');
  if (!m.opponent) throw new Error('Opponent is required.');
  if (m.date && !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) throw new Error('Date must be a valid date.');
  if (m.time && !normTime_(m.time)) throw new Error('Time must be HH:MM.');
  if (m.result && ['Won', 'Lost', 'Draw'].indexOf(m.result) < 0) throw new Error('Result must be Won, Lost or Draw.');
  if (m.date) m.dateNote = '';
  m.time = m.time ? normTime_(m.time) : '';
  return m;
}

function toDate_(iso) {
  const p = iso.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]); // V8 uses the script time zone
}

function checkFingerprint_(sh, row, lastCol, fp) {
  if (!row || row < 2 || row > sh.getLastRow()) {
    throw new Error('That match no longer exists. Tap refresh and try again.');
  }
  const current = sh.getRange(row, 1, 1, lastCol).getDisplayValues()[0];
  if (fingerprint_(current) !== fp) {
    throw new Error('This match was changed in the sheet since you loaded it. Tap refresh and try again.');
  }
}

function fingerprint_(displayRow) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(displayRow));
  return Utilities.base64Encode(bytes);
}

function lastDataRow_(sh) {
  const vals = sh.getDataRange().getDisplayValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i].some(v => String(v).trim() !== '')) return i + 1;
  }
  return 1;
}

function headerMap_(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const norm = String(h).trim().toLowerCase();
    FIELDS.forEach(f => { if (norm === f.header && map[f.key] === undefined) map[f.key] = i; });
  });
  return map;
}

function getMatchesSheet_() {
  const ss = SpreadsheetApp.getActive();
  const named = ss.getSheetByName(MATCHES_SHEET);
  if (named) return named;
  const found = ss.getSheets().find(sh => {
    if (sh.getLastColumn() < 1) return false;
    const map = headerMap_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
    return map.ourTeam !== undefined && map.opponent !== undefined;
  });
  if (!found) throw new Error('Could not find a tab with "Our Team" and "Opponent" headers in row 1.');
  return found;
}

function ensureSettings_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]).setFontWeight('bold');
    sh.getRange(2, 2, DEFAULT_SETTINGS.length, 1).setNumberFormat('@'); // keep PINs like 0420 intact
    sh.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
    sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 360); sh.setColumnWidth(3, 460);
  }
  return sh;
}

function getSettings_() {
  const rows = ensureSettings_().getDataRange().getDisplayValues();
  const kv = {};
  rows.slice(1).forEach(r => { kv[String(r[0]).trim().toLowerCase()] = String(r[1]).trim(); });
  const list = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    clubName: kv['club name'] || 'My Club',
    adminPins: list(kv['admin pins']),
    viewerCode: kv['viewer code'] || '',
    statuses: list(kv['statuses'] || DEFAULT_SETTINGS[3][1])
  };
}

function isAdmin_(pin) {
  const pins = getSettings_().adminPins;
  const ok = pins.length > 0 && pins.indexOf(String(pin || '').trim()) >= 0;
  if (!ok) Utilities.sleep(1200); // slows down PIN guessing
  return ok;
}

function assertAdmin_(pin) {
  if (!isAdmin_(pin)) throw new Error('Admin PIN not recognised.');
}

function fullYear_(y) { return String(y).length === 2 ? '20' + y : String(y); }
function pad_(n) { return ('0' + n).slice(-2); }
