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

const APP_VERSION = '1.19.0';
const BUILD = '__BUILD__';           // replaced with "date · commit" by the GitHub deploy

const MATCHES_SHEET = 'Matches';     // falls back to any tab with "Our Team" + "Opponent" headers
const SETTINGS_SHEET = 'Settings';
const PLACES_SHEET = 'Places';
const TEAMS_SHEET = 'Teams';         // Our Team | Division | Manager
const DIV_SHEET = 'Divisions';       // Division | Team  (every team in each division, ours and opponents)

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
  ['Club Name', 'ACBC', 'Short club name (browser tab)'],
  ['App Title', 'ACBC Juvenile League 2026-27', 'Title at the top of the app'],
  ['Admin Passwords', '', 'One per admin, separated by commas (letters/numbers, e.g. Shuttle24, Smash99). Case-sensitive. Blank = editing disabled'],
  ['Viewer Code', '', 'Optional code managers enter once to view. Blank = anyone with the link'],
  ['Icon URL', '', 'Browser-tab icon: upload acbc-icon-512.png to Google Drive, share "Anyone with the link", paste the link here'],
  ['Home Location', 'Celbridge', 'Location used for home matches that have no location filled in'],
  ['Match Reports URL', 'https://sites.google.com/view/dubjuvleague/match-reports', 'League page with the match scoring sheets (shown in the app and the Monday email)'],
  ['Weekly Email To', '', 'Who gets the Monday fixtures email: email addresses separated by commas'],
  ['Statuses', 'Not Scheduled, Scheduled, Confirmed, Postponed, Cancelled, Played', 'Options in the status dropdown']
];

// Filled into the Places tab when the place is missing or its address/link is blank (admin edits are kept).
const DEFAULT_PLACES = [
  { name: 'Celbridge',
    address: 'Scoil na Mainistreach, Oldtown Rd, Oakleypark, Celbridge, Co. Kildare',
    link: 'https://maps.app.goo.gl/41RpdT8dCLgGDKfJ9',
    type: 'Home' }
];

// Team managers (from the club's team sheet). Only fills blank Manager cells in the Teams tab.
const DEFAULT_MANAGERS = {
  'U13 Boys Div 5 - A1': 'Prashanth',
  'U13 Boys Div 5 - A2': 'RaviKant',
  'U15 Mixed Div 2': 'Rishi',
  'U15 Boys Div 5': 'Shobit',
  'U15 Boys Div 6': 'Tony',
  'U17 Mixed Div 1': 'Gaurav',
  'U17 Mixed Div 2': 'Chandru',
  'U17 Boys Div 6': 'Shankar',
  'U19 Mixed Div 1': 'Rajnish'
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/* ---------------- Web app entry ---------------- */

function doGet() {
  ensureSettings_();
  ensurePlaces_();
  ensureResultColumns_();
  ensureTeamSheets_();
  const s = getSettings_();
  const page = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(s.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  const icon = iconHref_(s.iconUrl);
  if (icon) { try { page.setFaviconUrl(icon); } catch (e) { console.warn('Icon URL not accepted: ' + e); } }
  return page;
}

/**
 * Turns a Google Drive share link into a direct image link the browser can use as the tab icon.
 * Other https image links are used as they are. Apps Script only accepts icon links that end in
 * an image extension, so a "#.png" ending is added when needed (browsers ignore it).
 */
function iconHref_(url) {
  url = String(url || '').trim();
  if (!/^https:\/\//i.test(url)) return '';
  const id = (url.match(/\/d\/([A-Za-z0-9_-]{20,})/) || url.match(/[?&]id=([A-Za-z0-9_-]{20,})/) || [])[1];
  if (/drive\.google\.com|docs\.google\.com/i.test(url) && id) url = 'https://lh3.googleusercontent.com/d/' + id;
  return /\.(png|ico|gif|jpe?g)(\?|#|$)/i.test(url) ? url : url + '#.png';
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Fixtures App')
    .addItem('Set up Settings, Places, Teams & Divisions tabs', 'setup')
    .addItem('Split time into Time + Location columns', 'splitIntoSeparateColumns')
    .addSeparator()
    .addItem('Weekly email: send a test now (next week)', 'sendWeeklyEmailTest')
    .addItem('Weekly email: turn ON (Mondays ~7am)', 'turnOnWeeklyEmail')
    .addItem('Weekly email: turn OFF', 'turnOffWeeklyEmail')
    .addToUi();
}

/** Run once from the editor (or the sheet menu) to create the Settings and Places tabs. */
function setup() {
  getMatchesSheet_(); // throws a clear error if the match tab can't be found
  ensureResultColumns_();
  ensureSettings_();
  ensurePlaces_();
  ensureTeamSheets_();
}

/* ---------------- Monday email ---------------- */

/** Trigger target: runs every Monday morning and emails this week's (Mon–Sun) matches. */
function sendWeeklyEmail() {
  const s = getSettings_();
  if (!s.weeklyEmailTo.length) { console.warn('Weekly email: no addresses in Settings → Weekly Email To'); return; }
  const mail = buildWeeklyEmail_(mondayOf_(new Date()));
  MailApp.sendEmail({ to: s.weeklyEmailTo.join(','), subject: mail.subject, htmlBody: mail.html, body: mail.text, name: s.title });
}

/** Menu: send next week's email now (to the Settings list, or to you if it's empty). */
function sendWeeklyEmailTest() {
  const s = getSettings_();
  if (!s.weeklyEmailTo.length) {
    try { SpreadsheetApp.getUi().alert('Add at least one email address in Settings → Weekly Email To, then try again.'); } catch (e) {}
    return;
  }
  const to = s.weeklyEmailTo.join(',');
  const next = mondayOf_(new Date()); next.setDate(next.getDate() + 7);
  const mail = buildWeeklyEmail_(next);
  MailApp.sendEmail({ to: to, subject: '[TEST] ' + mail.subject, htmlBody: mail.html, body: mail.text, name: s.title });
  try { SpreadsheetApp.getUi().alert('Test email sent to ' + to); } catch (e) {}
}

function turnOnWeeklyEmail() {
  turnOffWeeklyEmail(true);
  ScriptApp.newTrigger('sendWeeklyEmail').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone('Europe/Dublin').create();
  const to = getSettings_().weeklyEmailTo;
  try { SpreadsheetApp.getUi().alert('Monday email is ON (around 7–8am).' + (to.length ? '\nGoes to: ' + to.join(', ') : '\n⚠ Add addresses in Settings → Weekly Email To.')); } catch (e) {}
}

function turnOffWeeklyEmail(quiet) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendWeeklyEmail').forEach(t => ScriptApp.deleteTrigger(t));
  if (quiet !== true) { try { SpreadsheetApp.getUi().alert('Monday email is OFF.'); } catch (e) {} }
}

function mondayOf_(d) { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }

/** Builds the email for the week starting on `monday` (Mon–Sun). Returns {subject, html, text, count}. */
function buildWeeklyEmail_(monday) {
  const s = getSettings_(), tz = Session.getScriptTimeZone();
  const iso = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  const from = iso(monday), to = iso(sunday);
  const fmt = (d, p) => Utilities.formatDate(d, tz, p);
  const range = fmt(monday, 'd MMM') + ' – ' + fmt(sunday, 'd MMM yyyy');
  const appUrl = (() => { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } })();

  const places = {}; readPlaceList_().forEach(p => places[p.name.toLowerCase()] = p);
  const teams = {}; readTeamInfo_().forEach(t => teams[t.team.toLowerCase()] = t);
  const opps = readOpponentInfo_();
  const all = readMatches_();
  const week = all.filter(m => m.date && m.date >= from && m.date <= to && !m.result)
    .sort((a, b) => (a.date + (a.time || '99:99') + a.ourTeam).localeCompare(b.date + (b.time || '99:99') + b.ourTeam));
  const nextAfter = all.filter(m => m.date && m.date > to && !m.result).sort((a, b) => a.date.localeCompare(b.date))[0];

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wa = (phone, name, m) => {
    let d = String(phone || '').replace(/[^0-9+]/g, '');
    if (d[0] === '+') d = d.slice(1); else if (d.slice(0, 2) === '00') d = d.slice(2); else if (d[0] === '0') d = '353' + d.slice(1);
    if (d.length < 8) return esc(name || '');
    const txt = 'Hi ' + (name || '') + ', about ' + m.ourTeam + ' v ' + m.opponent + ' – ';
    return '<a href="https://wa.me/' + d + '?text=' + encodeURIComponent(txt) + '" style="color:#128c4a;font-weight:bold;text-decoration:none">' + esc(name || phone) + '</a>';
  };
  const mapLink = m => {
    const p = places[(m.place || '').toLowerCase()];
    if (!m.place || /^(tbc|internal)$/i.test(m.place)) return esc(m.place || 'Location TBC');
    const href = p && (p.link || (p.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.address) : ''));
    return href ? '<a href="' + esc(href) + '" style="color:#0f7a5c">' + esc(m.place) + '</a>' : esc(m.place) + ' <span style="color:#8a8f98">(address TBC)</span>';
  };
  const confirmed = m => /^(sched|conf|play)/i.test(m.status || '');

  let rows = '', text = s.title + '\nFixtures ' + range + '\n\n', lastDay = '';
  week.forEach(m => {
    const day = fmt(new Date(m.date + 'T12:00:00'), 'EEEE d MMMM');
    if (day !== lastDay) {
      rows += '<tr><td colspan="3" style="padding:16px 0 6px;font:bold 13px Arial,sans-serif;color:#5b6478;text-transform:uppercase;letter-spacing:.5px">' + esc(day) + '</td></tr>';
      text += day + '\n'; lastDay = day;
    }
    const home = /^home/i.test(m.venue), colour = home ? '#2563eb' : '#ea580c';
    const t = teams[m.ourTeam.toLowerCase()] || {}, o = opps.find(x => x.team.toLowerCase() === m.opponent.toLowerCase() && x.division === t.division) || {};
    const mgrs = [t.manager ? '👤 ' + wa(t.phone, t.manager, m) : '', o.manager ? 'vs ' + wa(o.phone, o.manager, m) : ''].filter(Boolean).join(' &nbsp; ');
    rows += '<tr><td style="padding:8px 10px;border-left:4px ' + (confirmed(m) ? 'solid' : 'dashed') + ' ' + colour + ';background:#fff;vertical-align:top;width:56px;font:bold 15px Arial,sans-serif;color:#151a30">' + esc(m.time || 'TBC') + '</td>' +
      '<td style="padding:8px 6px;background:#fff;vertical-align:top;font:14px Arial,sans-serif;color:#151a30">' +
        '<span style="display:inline-block;background:' + colour + ';color:#fff;font:bold 10px Arial,sans-serif;padding:1px 5px;border-radius:3px;margin-right:6px">' + (home ? 'HOME' : 'AWAY') + '</span>' +
        '<b>' + esc(m.ourTeam) + '</b> v <b>' + esc(m.opponent) + '</b><br>' +
        '<span style="font-size:13px;color:#5b6478">📍 ' + mapLink(m) + (mgrs ? '<br>' + mgrs : '') + '</span></td>' +
      '<td style="padding:8px 10px;background:#fff;vertical-align:top;text-align:right;font:bold 11px Arial,sans-serif;color:' + (confirmed(m) ? '#0b7a4b' : '#8a8f98') + ';white-space:nowrap">' + esc(m.status || '') + '</td></tr>' +
      '<tr><td colspan="3" style="height:4px;font-size:0;line-height:0">&nbsp;</td></tr>';
    text += '  ' + (m.time || 'TBC') + '  ' + (home ? 'HOME' : 'AWAY') + '  ' + m.ourTeam + ' v ' + m.opponent + '  @ ' + (m.place || 'TBC') + '  [' + (m.status || '') + ']' +
      (t.manager ? '  Manager: ' + t.manager + (t.phone ? ' ' + t.phone : '') : '') + '\n';
  });
  if (!week.length) {
    rows = '<tr><td style="padding:18px;background:#fff;font:14px Arial,sans-serif;color:#151a30">No matches this week.' +
      (nextAfter ? ' Next match: <b>' + esc(fmt(new Date(nextAfter.date + 'T12:00:00'), 'EEE d MMM')) + '</b> – ' + esc(nextAfter.ourTeam) + ' v ' + esc(nextAfter.opponent) + '.' : '') + '</td></tr>';
    text += 'No matches this week.\n';
  }
  const unconfirmed = week.filter(m => !confirmed(m)).length;
  const html =
    '<div style="background:#eef3f2;padding:16px 8px"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto;border-collapse:collapse">' +
    '<tr><td colspan="3" style="background:#1b2140;border-bottom:3px solid #7fd8b6;padding:16px 18px;border-radius:10px 10px 0 0">' +
      (s.iconUrl ? '<img src="' + esc(iconHref_(s.iconUrl).replace('#.png', '')) + '" width="40" height="40" alt="" style="vertical-align:middle;border-radius:8px;margin-right:10px">' : '') +
      '<span style="font:bold 18px Arial,sans-serif;color:#fff;vertical-align:middle">' + esc(s.title) + '</span><br>' +
      '<span style="font:14px Arial,sans-serif;color:#7fd8b6">Fixtures this week · ' + esc(range) + '</span></td></tr>' +
    '<tr><td colspan="3" style="padding:10px 4px 0;font:13px Arial,sans-serif;color:#5b6478">' +
      (week.length ? '<b style="color:#151a30">' + week.length + ' match' + (week.length === 1 ? '' : 'es') + '</b>' + (unconfirmed ? ' · ' + unconfirmed + ' not confirmed yet (dashed)' : ' · all confirmed') : '') +
      '</td></tr>' + rows +
    '<tr><td colspan="3" style="padding:16px 4px;font:12px Arial,sans-serif;color:#5b6478;text-align:center">' +
      (appUrl ? '<a href="' + esc(appUrl) + '" style="display:inline-block;background:#7fd8b6;color:#1b2140;font:bold 14px Arial,sans-serif;padding:10px 18px;border-radius:8px;text-decoration:none">Open the fixtures app</a><br><br>' : '') +
      (s.reportsUrl ? '<a href="' + esc(s.reportsUrl) + '" style="color:#0f7a5c;font:bold 13px Arial,sans-serif">📝 Match reports &amp; scoring sheets</a><br><br>' : '') +
      'Blue = home · Orange = away · Dashed = not confirmed yet<br>Sent every Monday by the ' + esc(s.clubName) + ' fixtures app · v' + esc(appVersion_()) + '</td></tr>' +
    '</table></div>';
  return { subject: s.clubName + ' fixtures ' + range + ' (' + (week.length ? week.length + ' match' + (week.length === 1 ? '' : 'es') : 'no matches') + ')',
           html: html, text: text + (appUrl ? '\nApp: ' + appUrl + '\n' : '') + (s.reportsUrl ? 'Match reports: ' + s.reportsUrl + '\n' : ''), count: week.length };
}

/* ---------------- Public (client-callable) ---------------- */

function getBootstrap(viewerCode) {
  const s = getSettings_();
  if (s.viewerCode && String(viewerCode || '').trim() !== s.viewerCode) {
    return { locked: true, clubName: s.clubName };
  }
  return Object.assign({ locked: false }, payload_(s));
}

/**
 * Cheap check the page calls every 30 min (and when it comes back to the foreground):
 * the app version, and a fingerprint of everything the page shows.
 */
function getStamp(viewerCode) {
  const s = getSettings_();
  if (s.viewerCode && String(viewerCode || '').trim() !== s.viewerCode) return { locked: true };
  return { version: appVersion_(), stamp: dataStamp_() };
}

function appVersion_() { return APP_VERSION + (BUILD.indexOf('__') === 0 ? '' : ' · ' + BUILD); }

/** Fingerprint of the sheets the page displays (Settings without passwords). */
function dataStamp_() {
  const ss = SpreadsheetApp.getActive();
  const parts = [getMatchesSheet_().getDataRange().getDisplayValues()];
  [PLACES_SHEET, TEAMS_SHEET, DIV_SHEET].forEach(n => { const sh = ss.getSheetByName(n); parts.push(sh ? sh.getDataRange().getDisplayValues() : []); });
  const st = ss.getSheetByName(SETTINGS_SHEET);
  parts.push(st ? st.getDataRange().getDisplayValues().filter(r => !/password|pin|viewer code/i.test(r[0])) : []);
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(parts)));
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
    addToDivision_(divisionOfTeam_(m.ourTeam), m.opponent);   // new opponents join the division list
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
  const teams = Array.from(new Set(matches.map(m => m.ourTeam).concat(readTeamInfo_().map(t => t.team)).filter(Boolean))).sort();
  return {
    clubName: s.clubName,
    title: s.title,
    homeLocation: s.homeLocation,
    reportsUrl: s.reportsUrl,
    version: appVersion_(),
    stamp: dataStamp_(),
    appUrl: ScriptApp.getService().getUrl(),
    statuses: statuses,
    teams: teams,
    places: readPlaces_(),
    placeList: readPlaceList_(),
    teamInfo: readTeamInfo_(),
    divisions: readDivisions_(),
    oppInfo: readOpponentInfo_(),
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
  const homeLoc = getSettings_().homeLocation;
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
    if (!m.place && /^home/i.test(m.venue) && homeLoc) m.place = homeLoc;   // default for home matches
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

function readPlaceList_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(PLACES_SHEET);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().slice(1)
    .map((r, i) => ({ name: String(r[0]).trim(), address: String(r[1]).trim(), link: String(r[2] || '').trim(),
                      type: /^home/i.test(String(r[3] || '').trim()) ? 'Home' : 'Away', row: i + 2 }))
    .filter(p => p.name);
}

/**
 * Adds or edits a location in the Places tab. If an existing location is renamed and
 * renameMatches is true, matches using the old name are updated too.
 */
function savePlace(pin, original, name, address, renameMatches, link, type) {
  type = /^home/i.test(String(type || '')) ? 'Home' : 'Away';
  link = String(link || '').trim().slice(0, 500);
  if (link && !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(link)) {
    throw new Error('The map link must be a Google Maps link (from Share → Copy link).');
  }
  assertAdmin_(pin);
  name = String(name || '').trim().slice(0, 100);
  address = String(address || '').trim().slice(0, 300);
  original = String(original || '').trim();
  if (!name) throw new Error('Location name is required.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensurePlaces_();
    const sh = SpreadsheetApp.getActive().getSheetByName(PLACES_SHEET);
    const list = readPlaceList_();
    const lower = name.toLowerCase(), origLower = original.toLowerCase();
    if (list.some(p => p.name.toLowerCase() === lower && p.name.toLowerCase() !== origLower)) {
      throw new Error('There is already a location called "' + name + '".');
    }
    const existing = original ? list.find(p => p.name.toLowerCase() === origLower) : null;
    if (existing) sh.getRange(existing.row, 1, 1, 4).setValues([[name, address, link, type]]);
    else sh.appendRow([name, address, link, type]);

    if (existing && renameMatches && origLower !== lower) renamePlaceInMatches_(origLower, name);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
}

function deletePlace(pin, name) {
  assertAdmin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(PLACES_SHEET);
    const p = readPlaceList_().find(x => x.name.toLowerCase() === String(name || '').trim().toLowerCase());
    if (!p) throw new Error('That location no longer exists. Tap refresh.');
    sh.deleteRow(p.row);
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
}

function renamePlaceInMatches_(oldLower, newName) {
  const sh = getMatchesSheet_();
  const lastCol = sh.getLastColumn();
  const map = headerMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  const n = lastDataRow_(sh) - 1;
  if (n < 1) return;
  if (map.location !== undefined) {
    const r = sh.getRange(2, map.location + 1, n, 1);
    const v = r.getDisplayValues().map(x => [String(x[0]).trim().toLowerCase() === oldLower ? newName : x[0]]);
    r.setValues(v);
  } else if (map.time !== undefined) {               // old "Place @ HH:MM" format
    const r = sh.getRange(2, map.time + 1, n, 1);
    const v = r.getDisplayValues().map(x => {
      const t = splitTimeCell_(x[0]);
      return [t.place.toLowerCase() === oldLower ? joinTimeCell_(newName, t.time) : x[0]];
    });
    r.setNumberFormat('@').setValues(v);
  }
}

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
  const existingSheet = ss.getSheetByName(PLACES_SHEET);
  if (existingSheet) { fillDefaultPlaces_(existingSheet); return; }
  const sh = ss.insertSheet(PLACES_SHEET);
  sh.getRange(1, 1, 1, 4).setValues([['Place', 'Address or Eircode', 'Google Maps link (optional)', 'Type (Home/Away)']]).setFontWeight('bold');
  const skip = ['', 'tbc', 'internal'];
  const seen = {};
  readMatches_().forEach(m => {
    const k = m.place.toLowerCase();
    if (skip.indexOf(k) < 0 && !seen[k]) seen[k] = m.place;
  });
  const rows = Object.keys(seen).sort().map(k => [seen[k], '']);
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 420); sh.setColumnWidth(3, 300);
  fillDefaultPlaces_(sh);
}

/** Adds the link column header if missing, and fills DEFAULT_PLACES into blank cells only. */
function fillDefaultPlaces_(sh) {
  if (!String(sh.getRange(1, 3).getDisplayValue()).trim()) {
    sh.getRange(1, 3).setValue('Google Maps link (optional)').setFontWeight('bold');
    sh.setColumnWidth(3, 300);
  }
  if (!String(sh.getRange(1, 4).getDisplayValue()).trim()) {
    sh.getRange(1, 4).setValue('Type (Home/Away)').setFontWeight('bold');
    sh.setColumnWidth(4, 130);
  }
  // blank Type cells: the Settings home location is Home, everything else Away
  const home = getSettings_().homeLocation.toLowerCase();
  const vals = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() && !String(vals[i][3] || '').trim()) {
      sh.getRange(i + 1, 4).setValue(String(vals[i][0]).trim().toLowerCase() === home ? 'Home' : 'Away');
    }
  }
  const list = readPlaceList_();
  DEFAULT_PLACES.forEach(d => {
    const p = list.find(x => x.name.toLowerCase() === d.name.toLowerCase());
    if (!p) { sh.appendRow([d.name, d.address, d.link, d.type]); return; }
    if (!p.address) sh.getRange(p.row, 2).setValue(d.address);
    if (!p.link) sh.getRange(p.row, 3).setValue(d.link);
  });
}

/* ---------------- Teams & divisions ---------------- */

/** "U13 Boys Div 5 - A1" → "U13 Boys Div 5" (first-time guess; admins can change it) */
function guessDivision_(team) {
  return String(team).replace(/\s*-\s*[A-Za-z]?\d+\s*$/, '').trim() || team;
}

/** Creates Teams and Divisions tabs once, pre-filled from the fixtures. */
function ensureTeamSheets_() {
  const ss = SpreadsheetApp.getActive();
  const needTeams = !ss.getSheetByName(TEAMS_SHEET), needDivs = !ss.getSheetByName(DIV_SHEET);
  if (!needTeams && !needDivs) { addContactHeaders_(); fillDefaultManagers_(); return; }
  const matches = readMatches_();
  const ours = Array.from(new Set(matches.map(m => m.ourTeam).filter(Boolean))).sort();
  if (needTeams) {
    const sh = ss.insertSheet(TEAMS_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['Our Team', 'Division', 'Manager', 'Manager Phone']]).setFontWeight('bold');
    if (ours.length) sh.getRange(2, 1, ours.length, 3).setValues(ours.map(t => [t, guessDivision_(t), '']));
    sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 180); sh.setColumnWidth(3, 200);
    sh.setFrozenRows(1);
    fillDefaultManagers_();
  }
  if (needDivs) {
    const divOf = {}; readTeamInfo_().forEach(t => divOf[t.team] = t.division);
    const seen = {}, rows = [];
    matches.forEach(m => {
      const d = divOf[m.ourTeam] || guessDivision_(m.ourTeam);
      [m.ourTeam, m.opponent].forEach(t => {
        const k = d + '|' + String(t).toLowerCase();
        if (t && !seen[k]) { seen[k] = 1; rows.push([d, t]); }
      });
    });
    rows.sort((a, b) => a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]));
    const sh = ss.insertSheet(DIV_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['Division', 'Team', 'Team Manager', 'Manager Phone']]).setFontWeight('bold');
    if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 220);
    sh.setFrozenRows(1);
  }
}

/** Older sheets: add the manager/phone header cells if they're missing (data untouched). */
function addContactHeaders_() {
  const ss = SpreadsheetApp.getActive();
  [[TEAMS_SHEET, [[3, 'Manager'], [4, 'Manager Phone']]], [DIV_SHEET, [[3, 'Team Manager'], [4, 'Manager Phone']]]].forEach(([n, cols]) => {
    const sh = ss.getSheetByName(n);
    if (!sh) return;
    cols.forEach(([c, label]) => {
      if (!String(sh.getRange(1, c).getDisplayValue()).trim()) { sh.getRange(1, c).setValue(label).setFontWeight('bold'); sh.setColumnWidth(c, 160); }
    });
  });
}

/** Phone numbers: digits, spaces, + ( ) - only. */
function cleanPhone_(p) {
  p = String(p || '').trim().slice(0, 25);
  if (p && !/^[0-9+()\-\s]{6,25}$/.test(p)) throw new Error('Phone number can only contain digits, spaces, + ( ) -');
  return p;
}

/** Fills DEFAULT_MANAGERS into blank Manager cells only. */
function fillDefaultManagers_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TEAMS_SHEET);
  if (!sh) return;
  readTeamInfo_().forEach(t => {
    const key = Object.keys(DEFAULT_MANAGERS).find(k => k.toLowerCase() === t.team.toLowerCase());
    if (key && !t.manager) sh.getRange(t.row, 3).setValue(DEFAULT_MANAGERS[key]);
  });
}

function readTeamInfo_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TEAMS_SHEET);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().slice(1)
    .map((r, i) => ({ team: String(r[0]).trim(), division: String(r[1]).trim(), manager: String(r[2] || '').trim(),
                      phone: String(r[3] || '').trim(), row: i + 2 }))
    .filter(t => t.team);
}

/** { "U15 Mixed Div 2": ["Kadca 1", "Kerela 1", …], … } */
function readDivisions_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DIV_SHEET);
  const out = {};
  if (!sh) return out;
  sh.getDataRange().getDisplayValues().slice(1).forEach(r => {
    const d = String(r[0]).trim(), t = String(r[1]).trim();
    if (d && t) (out[d] = out[d] || []).push(t);
  });
  Object.keys(out).forEach(d => out[d].sort((a, b) => a.localeCompare(b)));
  return out;
}

/** Opponent contacts: [{ division, team, manager, phone }] from the Divisions tab. */
function readOpponentInfo_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DIV_SHEET);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().slice(1)
    .map(r => ({ division: String(r[0]).trim(), team: String(r[1]).trim(), manager: String(r[2] || '').trim(), phone: String(r[3] || '').trim() }))
    .filter(o => o.division && o.team && (o.manager || o.phone));
}

/** Set the manager name and phone for a team in a division (normally an opponent). */
function saveOpponent(pin, division, team, manager, phone) {
  assertAdmin_(pin);
  manager = String(manager || '').trim().slice(0, 100);
  phone = cleanPhone_(phone);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    addContactHeaders_();
    addToDivision_(division, team);
    const sh = SpreadsheetApp.getActive().getSheetByName(DIV_SHEET);
    const rows = sh.getDataRange().getDisplayValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === division && String(rows[i][1]).trim().toLowerCase() === String(team).trim().toLowerCase()) {
        sh.getRange(i + 1, 3, 1, 2).setNumberFormat('@').setValues([[manager, phone]]);
      }
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
}

/** How many fixtures in a division involve this team (as opponent, or as our team). */
function fixturesUsingTeam_(division, team) {
  const k = String(team || '').trim().toLowerCase();
  const divOf = {}; readTeamInfo_().forEach(t => divOf[t.team.toLowerCase()] = t.division);
  return readMatches_().filter(m => (divOf[m.ourTeam.toLowerCase()] || guessDivision_(m.ourTeam)) === division &&
    (m.opponent.toLowerCase() === k || m.ourTeam.toLowerCase() === k)).length;
}

function divisionOfTeam_(team) {
  const t = readTeamInfo_().find(x => x.team.toLowerCase() === String(team).toLowerCase());
  return t ? t.division : '';
}

function addToDivision_(division, team) {
  division = String(division || '').trim(); team = String(team || '').trim();
  if (!division || !team) return;
  const list = readDivisions_()[division] || [];
  if (list.some(t => t.toLowerCase() === team.toLowerCase())) return;
  let sh = SpreadsheetApp.getActive().getSheetByName(DIV_SHEET);
  if (!sh) { ensureTeamSheets_(); sh = SpreadsheetApp.getActive().getSheetByName(DIV_SHEET); }
  sh.appendRow([division, team]);
}

/** Add or edit one of our teams (manager, division). */
function saveTeam(pin, original, team, division, manager, phone) {
  phone = cleanPhone_(phone);
  assertAdmin_(pin);
  team = String(team || '').trim().slice(0, 100);
  division = String(division || '').trim().slice(0, 100);
  manager = String(manager || '').trim().slice(0, 100);
  original = String(original || '').trim();
  if (!team) throw new Error('Team name is required.');
  if (!division) throw new Error('Division is required.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureTeamSheets_();
    const sh = SpreadsheetApp.getActive().getSheetByName(TEAMS_SHEET);
    const list = readTeamInfo_();
    const key = (original || team).toLowerCase();
    const existing = list.find(t => t.team.toLowerCase() === key);
    if (!existing && list.some(t => t.team.toLowerCase() === team.toLowerCase())) {
      throw new Error('There is already a team called "' + team + '".');
    }
    addContactHeaders_();
    const row = existing ? existing.row : sh.getLastRow() + 1;
    sh.getRange(row, 4).setNumberFormat('@');                // keep leading 0 in phone numbers
    sh.getRange(row, 1, 1, 4).setValues([[existing ? existing.team : team, division, manager, phone]]);
    addToDivision_(division, existing ? existing.team : team);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
}

/** Add a team (usually an opponent) to a division. */
function addDivisionTeam(pin, division, team) {
  assertAdmin_(pin);
  team = String(team || '').trim().slice(0, 100);
  if (!team) throw new Error('Team name is required.');
  if ((readDivisions_()[division] || []).some(t => t.toLowerCase() === team.toLowerCase())) {
    throw new Error('"' + team + '" is already in ' + division + '.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { addToDivision_(division, team); SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  return payload_(getSettings_());
}

/** Remove a team from a division list (matches are not changed). */
function removeDivisionTeam(pin, division, team) {
  assertAdmin_(pin);
  const n = fixturesUsingTeam_(division, team);
  if (n > 0) {
    throw new Error('Can\'t remove ' + team + ': ' + n + ' fixture' + (n === 1 ? '' : 's') + ' in ' + division +
      ' use' + (n === 1 ? 's' : '') + ' it. Change or delete ' + (n === 1 ? 'that match' : 'those matches') + ' first.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(DIV_SHEET);
    if (!sh) return payload_(getSettings_());
    const rows = sh.getDataRange().getDisplayValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === division && String(rows[i][1]).trim().toLowerCase() === String(team).toLowerCase()) {
        sh.deleteRow(i + 1);
      }
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return payload_(getSettings_());
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
  if (sh) {                                         // older sheets: rename "Admin PINs" → "Admin Passwords"
    const col = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getDisplayValues();
    const i = col.findIndex(r => String(r[0]).trim().toLowerCase() === 'admin pins');
    if (i >= 0) {
      sh.getRange(i + 1, 1).setValue('Admin Passwords');
      sh.getRange(i + 1, 3).setValue(DEFAULT_SETTINGS.find(r => r[0] === 'Admin Passwords')[2]);
    }
    // add any settings rows that newer versions introduced (e.g. App Title)
    const have = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getDisplayValues().map(r => String(r[0]).trim().toLowerCase());
    DEFAULT_SETTINGS.filter(r => have.indexOf(r[0].toLowerCase()) < 0).forEach(r => sh.appendRow(r));
  }
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
    clubName: kv['club name'] || 'ACBC',
    title: kv['app title'] || 'ACBC Juvenile League 2026-27',
    homeLocation: kv['home location'] || 'Celbridge',
    iconUrl: kv['icon url'] || '',
    reportsUrl: /^https:\/\//i.test(kv['match reports url'] || '') ? kv['match reports url'] : '',
    weeklyEmailTo: list(kv['weekly email to']).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
    adminPins: list(kv['admin passwords'] || kv['admin pins']),
    viewerCode: kv['viewer code'] || '',
    statuses: list(kv['statuses'] || DEFAULT_SETTINGS.find(r => r[0] === 'Statuses')[1])
  };
}

function isAdmin_(pin) {
  const pins = getSettings_().adminPins;
  const ok = pins.length > 0 && pins.indexOf(String(pin || '').trim()) >= 0;
  if (!ok) Utilities.sleep(1200); // slows down PIN guessing
  return ok;
}

function assertAdmin_(pin) {
  if (!isAdmin_(pin)) throw new Error('Admin password not recognised.');
}

function fullYear_(y) { return String(y).length === 2 ? '20' + y : String(y); }
function pad_(n) { return ('0' + n).slice(-2); }
