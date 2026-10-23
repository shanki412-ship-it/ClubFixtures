/**
 * Team names – one set of rules used everywhere (fixtures, Teams, Divisions, Players, score sheet, WhatsApp, email).
 *
 * The standard:
 *   our teams   "U13 Boys Div 5 - A1", "U17 Mixed Div 1"   (division, plus A1/A2 only when we have two teams)
 *   opponents   "Dunboyne 1", "Kerela 1"                    (club + team number, as the league writes them)
 *   internal    the opponent is our other team's name, e.g. "U13 Boys Div 5 - A2"
 *
 * Variants seen in the sheets are understood too:
 *   "U17 Mixed Div 1 - Dev"            manager's name added          → U17 Mixed Div 1
 *   "U13 Boys Div 5 - A1 - Prashanth"  manager's name after the code → U13 Boys Div 5 - A1
 *   "ACBC - A1 - U13 Boys Div 5"       club first                    → U13 Boys Div 5 - A1
 *   "U15 Mixed Team Div 2", "U17 Div 6" extra/missing words          → U15 Mixed Div 2, U17 Boys Div 6
 *   "Dunboyne - U17 Mixed Div 1"       division added to an opponent → Dunboyne 1 (if that's in the division list)
 */

/** "u13div5|a1": division (loosely) + team code. '' if the name has no division in it. */
function teamKey_(name) {
  const parts = String(name || '').split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  let div = parts.find(p => /\bU\s?\d{1,2}\b/i.test(p)) || '';
  let code = parts.find(p => /^(?!U\d)[A-Z]\d{1,2}$/i.test(p)) || '';
  const tail = div.match(/\s((?!U\d)[A-Z]\d{1,2})$/i);                     // "U13 Boys Div 5 A1"
  if (tail) { if (!code) code = tail[1]; div = div.slice(0, -tail[0].length); }
  return div ? normTeam_(div) + '|' + code.toLowerCase() : '';
}

/** The Teams-tab row for one of our teams, however it's written; null if unknown or ambiguous (e.g. "U13 … - Dev"). */
function findOurTeam_(name, list) {
  list = list || readTeamInfo_();
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  const exact = list.find(t => t.team.toLowerCase() === n);
  if (exact) return exact;
  const loose = list.filter(t => normTeam_(t.team) === normTeam_(name));
  if (loose.length === 1) return loose[0];
  const k = teamKey_(name);
  if (!k) return null;
  const byKey = list.filter(t => teamKey_(t.team) === k);
  return byKey.length === 1 ? byKey[0] : null;
}
function canonicalOurTeam_(name, list) { const t = findOurTeam_(name, list); return t ? t.team : String(name || '').trim(); }

/** Like findOurTeam_, but a name without a division ("ACBC - A2") is read in the given division. */
function findOurTeamIn_(name, division, list) {
  list = list || readTeamInfo_();
  const t = findOurTeam_(name, list);
  if (t || !division) return t;
  const parts = String(name || '').split(/\s+-\s+|\s+/).map(x => x.trim());
  const code = (parts.find(p => /^(?!U\d)[A-Z]\d{1,2}$/i.test(p)) || '').toLowerCase();
  const k = normTeam_(division) + '|' + code;
  const inDiv = list.filter(x => normTeam_(x.division) === normTeam_(division));
  const byKey = inDiv.filter(x => teamKey_(x.team) === k);
  if (byKey.length === 1) return byKey[0];
  return !code && inDiv.length === 1 ? inDiv[0] : null;
}

/** Is this (opponent-column) name actually one of our teams? Club name in it, or it starts with a division. */
function isOurName_(name, list) {
  const s = String(name || '').trim(), club = getSettings_().clubName;
  if (!s) return false;
  if (club && new RegExp('(^|[^a-z])' + club.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)', 'i').test(s)) return true;
  const first = s.split(/\s+-\s+/)[0];
  return /\bU\s?\d{1,2}\b/i.test(first) && !!findOurTeam_(s, list);
}

/** An opponent without any division text: "Dunboyne - U17 Mixed Div 1" → "Dunboyne". */
function oppBase_(name) {
  const parts = String(name || '').split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  const keep = parts.filter(p => !/\bU\s?\d{1,2}\b/i.test(p));
  return (keep.length ? keep : parts).join(' ');
}

/**
 * The standard name for an opponent in a division: our own team's name for internal matches, otherwise the
 * name used in the Divisions tab ("Dunboyne" → "Dunboyne 1" if that's the only Dunboyne there).
 */
function canonicalOpp_(name, division, divLists, teamList) {
  if (isOurName_(name, teamList)) { const t = findOurTeamIn_(name, division, teamList); return t ? t.team : String(name || '').trim(); }
  const base = oppBase_(name);
  const inDiv = ((divLists || readDivisions_())[division] || []).filter(t => !isOurName_(t, teamList));
  const nb = normTeam_(base);
  const clean = t => !/\s+-\s+/.test(t);                              // prefer "Dunboyne 1" over "Dunboyne - U17 …"
  const pick = arr => arr.filter(clean).concat(arr.filter(t => !clean(t)));
  const same = pick(inDiv.filter(t => normTeam_(oppBase_(t)) === nb));
  if (same.length && clean(same[0])) return same[0];
  const starts = inDiv.filter(t => clean(t) && normTeam_(t).indexOf(nb) === 0);   // "Dunboyne" → "Dunboyne 1"
  return starts.length === 1 ? starts[0] : base;
}

/** Score-sheet / message names. Ours: club + A1/A2. Theirs: club + number; our own team if internal. */
function ourSheetName_(team) {
  const code = (teamKey_(canonicalOurTeam_(team)).split('|')[1] || '').toUpperCase() ||
    (String(team || '').split(/\s+-\s+|\s+/).find(p => /^(?!U\d)[A-Z]\d{1,2}$/i.test(p)) || '').toUpperCase();
  return getSettings_().clubName + (code ? ' ' + code : '');
}
function oppSheetName_(opponent) {
  return isOurName_(opponent) ? ourSheetName_(canonicalOurTeam_(opponent)) : oppBase_(opponent);
}

/* ---------------- One-off tidy-up of names in the sheet ---------------- */

/** Menu: shows every name change it would make, and applies them only if you click Yes. */
function tidyTeamNames() {
  const plan = planTidy_();
  const ui = SpreadsheetApp.getUi();
  if (!plan.lines.length) { ui.alert('Team names', 'Everything already uses the standard names. Nothing to change.', ui.ButtonSet.OK); return; }
  const shown = plan.lines.slice(0, 40).join('\n') + (plan.lines.length > 40 ? '\n… and ' + (plan.lines.length - 40) + ' more' : '');
  const ok = ui.alert('Tidy team names – please check',
    'These changes would be made (you can undo with File → Version history):\n\n' + shown +
    (plan.unknown.length ? '\n\nNot recognised (left as they are): ' + plan.unknown.join(', ') : '') +
    '\n\nApply these changes?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  applyTidy_(plan);
  ui.alert('Team names', '✓ Done – ' + plan.lines.length + ' change' + (plan.lines.length === 1 ? '' : 's') + ' made.', ui.ButtonSet.OK);
}

function planTidy_() {
  const ss = SpreadsheetApp.getActive();
  const teams = readTeamInfo_();
  const divLists = readDivisions_();
  const lines = [], unknown = new Set();
  const plan = { lines: lines, unknown: [], matchCells: [], divRows: null, playerCells: [], lineupRows: [] };

  // 1. Fixtures: Our Team, Opponent, Home Team, Away Team
  const msh = getMatchesSheet_();
  const mvals = msh.getDataRange().getDisplayValues();
  const map = headerMap_(mvals[0]);
  const counts = {};
  const note = (what, from, to) => { const k = what + '\u0000' + from + '\u0000' + to; counts[k] = (counts[k] || 0) + 1; };
  for (let r = 1; r < mvals.length; r++) {
    const row = mvals[r];
    const ours = String(row[map.ourTeam] || '').trim(), opp = String(row[map.opponent] || '').trim();
    if (!ours && !opp) continue;
    const t = findOurTeam_(ours, teams);
    if (ours && !t) unknown.add(ours);
    const newOurs = t ? t.team : ours;
    const div = t ? t.division : '';
    const newOpp = opp ? canonicalOpp_(opp, div, divLists, teams) : opp;
    const set = (key, val) => { if (map[key] !== undefined && String(row[map[key]]).trim() !== val) { plan.matchCells.push([r + 1, map[key] + 1, val]); } };
    if (newOurs !== ours) { set('ourTeam', newOurs); note('Fixtures – our team', ours, newOurs); }
    if (newOpp !== opp) { set('opponent', newOpp); note('Fixtures – opponent', opp, newOpp); }
    ['homeTeam', 'awayTeam'].forEach(k => {
      if (map[k] === undefined) return;
      const v = String(row[map[k]] || '').trim();
      if (v && v === ours && newOurs !== ours) set(k, newOurs);
      else if (v && v === opp && newOpp !== opp) set(k, newOpp);
    });
  }

  // 2. Divisions: standard names, then one row per team (keeping any manager / phone)
  const dsh = ss.getSheetByName(DIV_SHEET);
  if (dsh) {
    const dvals = dsh.getDataRange().getDisplayValues();
    const width = Math.max(4, dvals[0].length);
    const divName = d => { const t = teams.find(x => normTeam_(x.division) === normTeam_(d)); return t ? t.division : d; };
    const out = [], seen = {};
    let changed = false;
    for (let r = 1; r < dvals.length; r++) {
      const row = dvals[r].slice(); while (row.length < width) row.push('');
      const d0 = String(row[0]).trim(), t0 = String(row[1]).trim();
      if (!d0 && !t0) continue;
      const d = divName(d0);
      const ourT = (isOurName_(t0, teams) || /\bU\s?\d/i.test(t0.split(/\s+-\s+/)[0])) ? findOurTeamIn_(t0, d, teams) : null;
      const t = ourT ? ourT.team : canonicalOpp_(t0, d, divLists, teams);
      const key = normTeam_(d) + '\u0000' + t.toLowerCase();
      if (seen[key] !== undefined) {                                   // duplicate: merge contacts, drop the row
        const keep = out[seen[key]];
        for (let c = 2; c < width; c++) if (!String(keep[c]).trim() && String(row[c]).trim()) keep[c] = row[c];
        changed = true; lines.push('Divisions – remove duplicate: ' + d + ' / ' + t0 + (t0 !== t ? '  (same as ' + t + ')' : ''));
        continue;
      }
      if (d !== d0 || t !== t0) { changed = true; note('Divisions – rename', d0 + ' / ' + t0, d + ' / ' + t); }
      row[0] = d; row[1] = t; seen[key] = out.length; out.push(row);
    }
    if (changed) plan.divRows = { width: width, rows: out, oldCount: dvals.length - 1 };
  }

  // 3. Players (list layout only; the wide layout already matches loosely)
  const psh = ss.getSheetByName(PLAYERS_SHEET);
  if (psh && psh.getLastRow() > 1) {
    const pvals = psh.getDataRange().getDisplayValues();
    if (pvals[0].some(h => /^player/i.test(String(h).trim()))) {
      for (let r = 1; r < pvals.length; r++) {
        const v = String(pvals[r][0]).trim(); if (!v) continue;
        const t = findOurTeam_(v, teams);
        if (t && t.team !== v) { plan.playerCells.push([r + 1, 1, t.team]); note('Players – team', v, t.team); }
      }
    }
  }

  // 4. Saved line-ups follow the new names (so they still open for the same match)
  readLineups_().forEach(l => {
    const t = findOurTeam_(l.ourTeam, teams); if (!t) return;
    const opp = canonicalOpp_(l.opponent, t.division, divLists, teams);
    if (t.team !== l.ourTeam || opp !== l.opponent) {
      const key = matchKey_({ ourTeam: t.team, opponent: opp, venue: l.venue });
      plan.lineupRows.push([l.row, key, t.team, opp]);
    }
  });

  Object.keys(counts).forEach(k => { const [what, from, to] = k.split('\u0000'); lines.push(what + ': ' + from + ' → ' + to + (counts[k] > 1 ? '  (' + counts[k] + ')' : '')); });
  lines.sort();
  plan.unknown = Array.from(unknown);
  return plan;
}

function applyTidy_(plan) {
  const ss = SpreadsheetApp.getActive();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const msh = getMatchesSheet_();
    plan.matchCells.forEach(([r, c, v]) => msh.getRange(r, c).setValue(v));
    if (plan.divRows) {
      const dsh = ss.getSheetByName(DIV_SHEET), w = plan.divRows.width;
      if (plan.divRows.oldCount) dsh.getRange(2, 1, plan.divRows.oldCount, w).clearContent();
      if (plan.divRows.rows.length) dsh.getRange(2, 1, plan.divRows.rows.length, w).setNumberFormat('@').setValues(plan.divRows.rows);
    }
    const psh = ss.getSheetByName(PLAYERS_SHEET);
    plan.playerCells.forEach(([r, c, v]) => psh.getRange(r, c).setValue(v));
    const lsh = ss.getSheetByName(LINEUPS_SHEET);
    plan.lineupRows.forEach(([r, key, ours, opp]) => lsh.getRange(r, 1, 1, 3).setValues([[key, ours, opp]]));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}
