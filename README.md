# Club Fixtures

A phone-friendly fixtures app for the club, built on Google Sheets + Apps Script.
Team managers open one link to see matches; admins unlock editing with a PIN.

**Changes to `src/` on `main` go live automatically** (GitHub Actions → `clasp`), the same way as FitBull.
No copy-paste, no Deploy clicks, and the app link stays the same.

| Repo file | Goes to Apps Script as |
|---|---|
| `src/Code.gs` | Code.gs |
| `src/Index.html` | Index (the page) |
| `src/appsscript.json` | Project settings (time zone, web-app access) |

## Sheet layout

**Matches tab** (named `Matches`, or any tab whose row 1 has these headers — order doesn't matter):

| Our Team | Opponent | Venue | Home Team | Away Team | Status | Time | Date | Location |
|---|---|---|---|---|---|---|---|---|

- `Venue`: Home / Away / Neutral (blue / orange in the app)
- `Time`: HH:MM, or blank
- `Date`: a real date (shown as 1-Nov-2026), or a note such as **TBC** or **Internal**
- `Location`: where it's played (Celbridge, Terenure, Kadka…), or TBC / Internal
- `Result`: Won / Lost / Draw (blank until played) · `Score`: e.g. 5-3 — both columns are added automatically
- Extra columns are fine — the app ignores them and never overwrites them.

**Converting the current sheet** (where `time` holds "Celbridge @ 18:00"): after setup, use the
sheet menu **Fixtures App → Split time into Time + Location columns**. It adds the Location column,
moves the place names into it, leaves clean times, and turns date text into real dates.
It's safe to run again. Until you run it, the app still reads the old format correctly.

**Places tab** (created automatically, pre-filled with every location found): `Place | Address or Eircode |
Google Maps link | Type (Home/Away)`. Home venues are offered in the match form's Location dropdown for home
matches, away venues for away matches. With a link, 📍 opens that exact pin; otherwise it searches the saved address; with neither, "address TBC" and no link.
Celbridge is pre-set to Scoil na Mainistreach, Oldtown Rd, Celbridge, with its map pin.
**Home matches with no location use Settings → Home Location (Celbridge).** Without one, the link
searches "<place>, Ireland". Admins normally manage this from the app's **Locations** tab instead.

**Teams tab** (created automatically, pre-filled from the fixtures): `Our Team | Division | Manager | Manager Phone`.
The manager's name shows under the Team dropdown and in each match's details.

**Divisions tab** (created automatically, pre-filled from the fixtures): `Division | Team | Team Manager |
Manager Phone`, one row per team in each division (ours and opponents). Every match shows a line with both managers
(ours vs theirs); a name with a phone number is a **WhatsApp link** that opens a chat with a message about that
match already started. Irish numbers like 087 123 4567 are converted to +353 automatically. Opponent contacts are
per division, so "Kerela 1" in U15 and "Kerela 1" in U17 can have different managers. The match form's **Opponent** dropdown lists the teams in our team's division,
with an *Other…* option; a new opponent typed there is added to the division automatically.

Admins normally manage both from the app: **Admin → Teams & managers**.

**Settings tab** (created automatically):

| Setting | What it does |
|---|---|
| Club Name | Title at the top of the app |
| Admin Passwords | One per admin, comma-separated (letters/numbers, case-sensitive). Blank = no editing in the app |
| Viewer Code | Optional code managers enter once. Blank = anyone with the link can view |
| Statuses | Options in the status dropdown |

## How a change goes live

1. A change to `src/` is pushed to `main` (by Claude, or by you editing on GitHub).
2. **Actions → Deploy to Apps Script** runs. It takes about 1 minute:
   - It checks the code for mistakes. If it finds one, it stops and the live app stays as it was.
   - It sends the files to Apps Script (`clasp push`).
   - It updates the existing web-app deployment to a new version, so the link stays the same.
3. Managers refresh the app to see the change.

## One-time setup for auto-deploy (≈5 minutes)

You need the app already deployed once as a web app (Deploy → New deployment → Web app,
Execute as **Me**, access **Anyone**).

1. On this repo's GitHub page: **Code → Codespaces → Create codespace on main**.
2. In the terminal at the bottom, run:
   ```
   bash tools/setup.sh
   ```
3. Follow the prompts:
   1. Check the Apps Script API is on at script.google.com/home/usersettings (it is already, from FitBull).
   2. Sign in to Google with the account that **owns the fixtures sheet**.
   3. Paste the Apps Script project address (fixtures sheet → Extensions → Apps Script → copy the browser address).
   4. Your web-app deployment is found automatically. If there's more than one, pick the link the managers use.
   5. A secret called `CLASPRC_JSON` is added to the repo. If the script can't add it, it shows the text to
      paste under **Settings → Secrets and variables → Actions**.
4. The script then saves the project link to GitHub, which runs the first deploy. Check it on the **Actions** tab.
5. Delete the codespace at github.com/codespaces.

Any files in the Apps Script project that aren't in this repo are copied into `src/` first, so the first deploy
doesn't delete them.

## First-time sheet setup

1. In the Apps Script editor, run `splitIntoSeparateColumns` once (converts "Celbridge @ 18:00" cells).
2. Run `setup`. This creates the **Settings** and **Places** tabs.
3. In the sheet, fill in **Settings** (club name, admin PINs, optional viewer code) and the addresses in **Places**.
4. Share the web-app link in the managers' WhatsApp group. On a phone: open it → Share → **Add to Home Screen**.

Both functions are also in the sheet's **Fixtures App** menu.

## How it works

- **Managers**: **Fixtures** and **Stats** tabs, a **Team ▼** dropdown (grouped U13–U19, remembered on their phone), search,
  tap a location to open Google Maps.
- **Fixtures** is one season list: *Results & earlier* (with a W/L summary), then *Upcoming*, then *No date yet*.
  For All teams, results fold into one line so you land on what's next; picking a team shows its whole season.
- **List or Calendar** on the Fixtures tab. Colour = venue (blue Home, orange Away);
  solid = confirmed (Scheduled/Confirmed/Played with a date), dashed = TBC / not scheduled.
  Tap a calendar day to see its matches; undated fixtures are listed under the calendar.
- **Stats**: played / won / lost / drawn / win rate, wins-vs-losses bar, home vs away record,
  a per-team table with last-5 form, and how many remaining fixtures are confirmed vs TBC.
  Follows the team filter.
- **Compact list**: one line per match (date, time, H/A, opponent @ location, result or ✓ when confirmed),
  so a team's full season fits on one phone screen. Tap a match for full details and the Maps link.
- **Admins**: tap 🔒 and sign in with an admin password (tick *Keep me signed in* on your own phone).
  Tap a match → **Edit match** to change or delete it; **+ Add match** to create one.
  Choosing Home/Away auto-fills Home Team / Away Team, and Home pre-fills your usual home location.
  Use the date picker, or pick TBC / Internal when there's no date yet.
  Enter the Result and Score after a match; picking a result sets Status to Played.
  A match with a result moves into *Results & earlier* and counts in Stats.
- **Admin tab (admins only) → Teams & managers**: one card per division. Tap our team to set its manager or
  division; **+ Add team** adds an opponent to a division, ✕ removes one (only teams with no fixtures in that division –
teams with fixtures show their match count instead, and the server refuses the removal); **+ Add our team** creates a new team.
- **Admin tab → Locations**: grouped into Home venues and Away venues, each with ✏️ Edit and 🗑 Delete.
  Set a venue's type (🏠 Home / 🚌 Away) in its edit form; you can have more than one home venue.
- **Team managers** are pre-filled from the club team sheet (only into blank Manager cells).
- (Locations, continued): every location with its address and how many matches use it.
  **+ Add location** to create one; tap one to set its address or rename it (renaming can also fix the
  name in every match, e.g. Knocklyn → Knocklyon). Places used in fixtures but missing from the list
  are shown underneath so you can add them in one tap.
- Edits write straight into the sheet; admins can also keep editing the sheet directly.
- If someone changed a row in the sheet after the app loaded, the save is blocked with
  "refresh and try again", so nobody overwrites anyone else's change.

## Look, title and version

- **Theme button** (◐ / ☀️ / 🌙 in the header) switches Auto (follows the phone) → Light → Dark; each phone
  remembers its own choice.
- Colours follow the ACBC jersey (navy with mint triangles); the logo is a vector redraw in
  `assets/acbc-logo.svg` (a 1024px PNG is alongside for printing or WhatsApp).
- **Browser-tab icon**: shows the ACBC badge (`assets/acbc-icon-512.png`, served from this public repo)
  automatically. To use a different image, paste its link (Drive links work) into **Settings → Icon URL**.
- The title comes from **Settings → App Title** (default "ACBC Juvenile League 2026-27").
- The footer shows the version, e.g. `v1.8.0 · 21 Oct 2026 · 65d2fe6`. The date and commit are stamped
  automatically by each deploy; bump `APP_VERSION` in `src/Code.gs` for bigger releases.

## Match reports link

**Settings → Match Reports URL** (default: the Dublin Juvenile League match-reports page) appears as a
**📝 Match reports & scoring sheets** button on the Fixtures tab and in the Monday email.
Change or clear it in Settings; it must start with https://.

## Team names

One standard everywhere (Fixtures, Teams, Divisions, Players):
- **Our teams**: the division, plus A1/A2 only when we have two teams in it – `U13 Boys Div 5 - A1`, `U17 Mixed Div 1`.
  Managers belong in the Teams tab's Manager column, not in the team name.
- **Opponents**: club and team number as the league writes them – `Dunboyne 1`, `Kerela 1`.
- **Internal matches**: the opponent is our other team – `U13 Boys Div 5 - A2` (shown and printed as **ACBC A2**).

The app also understands common variants (`U17 Mixed Div 1 - Dev`, `U13 Boys Div 5 - A1 - Prashanth`,
`ACBC - A1 - U13 Boys Div 5`, `Dunboyne - U17 Mixed Div 1`, `U15 Mixed Team Div 2`, `U17 Div 6`) – rules in `src/Names.gs`.
**Fixtures App → Tidy team names** lists every rename and duplicate it would fix and only changes the sheet when you
click **Yes** (managers/phones on removed duplicates are kept; saved line-ups follow the new names).

WhatsApp: tapping a manager's name opens an **empty chat**; the **✉** next to it opens the chat with the match details:
`Hi Prashanth,` / `About U13 Boys Div 5: ACBC A1 vs ACE on Fri 13 Nov at 18:30, Celbridge.` / `Venue: <address>` / `Map: <link>`
(venue lines only when the location has an address or map link). The Monday email works the same way.

**Share location**: in a match's details, **Share** next to the 📍 address opens the phone's share menu with the match,
venue address and map link (on a computer it copies the text instead).

## Line-ups & match sheets

Captains fill the line-up in the app and get the league score sheet filled in and ready to print.

- **Players tab** (created automatically, pre-loaded with the 2026-27 club squads): either a list
  `Team | Player | Gender (B/G) | Sub`, or the club team-sheet layout (one column per team, team name in a top row
  such as "U15 Mixed Team Div 2" or the Age group row, a "Subs" row, girls in pink cells). Team names are matched
  loosely ("Team"/"Boys" and punctuation ignored). **Fixtures App → Match sheets: check setup** shows players per team. Team must match the
  Teams tab. Gender is needed for mixed teams. Row order is the default order in the dropdowns.
- **Who can fill line-ups**: anyone with the app link (plus the Viewer Code, if one is set in Settings).
- **On a match**: tap it → **📝 Line-up & match sheet** →
  age group / division / section / team names are pre-filled → pick players from dropdowns (our team's pool first,
  only that team's players, plus **+ Add a new name…**, which is saved to that team's list) → **↻ Fill pairs** builds the doubles and mixed pairs from the singles →
  the rules check warns if anyone doesn't play exactly two matches (mixed: one must be mixed doubles).
- **Create sheet** shows progress ("preparing… / building the Word file…"), then downloads a Word file
  (`2026-11-07 U15 Mixed Div 2 v Kerela 1 (Away).docx`) in the league's own Boys or Mixed format, with our players in
  the home or away column. Open it from Downloads and print. No Google Drive set-up or permission is needed.
- The line-up, section and our team's name on the sheet are remembered (Lineups and Teams tabs), and the match shows
  "✓ ready" in its details.

The templates are built into the app (`src/SheetTemplates.gs`, made from `templates/*.docx`): the league sheets with
`{{AGE}} {{DIVISION}} {{SECTION}} {{HOME_TEAM}} {{AWAY_TEAM}} {{LOCATION}} {{DATE}}` and `{{H1}}…` / `{{A1}}…` for the
home / away player rows (Boys: 6 rows, Mixed: 7). The QR code was reduced to print resolution (it still scans to the
same link); the Roboto fonts are kept so the sheet looks the same in Word. To change a template, edit the .docx in
`templates/` and ask Claude to rebuild `SheetTemplates.gs`.

## Monday fixtures email

Every Monday around 7–8am (Dublin time) the app emails that week's matches (Monday–Sunday): grouped by day,
home/away colours, solid = confirmed / dashed = not yet, location with a Maps link (or "address TBC"), our
manager and the opponent's manager (WhatsApp links where phones are saved), and an **Open the fixtures app**
button. A week with no matches says so and names the next match.

Setup (owner of the sheet, once):
1. **Settings → Weekly Email To**: email addresses, comma-separated.
2. Sheet menu **Fixtures App → Weekly email: send a test now (next week)**. Google asks for permission
   (send email, run on a schedule) the first time; approve it. The web app needs this approval too.
3. **Fixtures App → Weekly email: turn ON (Mondays ~7am)**. **Turn OFF** stops it.

Emails are sent from the sheet owner's Gmail (Apps Script limit: 100 recipients a day on a free account).

## Staying up to date

The page checks for changes every 30 minutes and whenever it comes back to the foreground (e.g. reopened from
the home screen):
- **Fixtures, locations, teams or settings changed** → the list refreshes quietly ("Fixtures updated").
  If an admin is in the middle of editing, a banner offers **Refresh** instead, so nothing is lost.
- **A new version was deployed** → a banner offers **Reload** to load the new app.

## Good to know

- **Changes made in the Apps Script editor get overwritten by the next deploy.** Make code changes here instead.
  (Editing the *sheet* — fixtures, Settings, Places — is always fine.)
- **The `CLASPRC_JSON` secret** is a sign-in for your Google account's Apps Script projects. GitHub stores it
  encrypted, and only this repo's Actions can read it. To cancel it, go to myaccount.google.com/permissions and
  remove "clasp – The Apps Script CLI", then run `tools/setup.sh` again. Doing that also cancels FitBull's
  sign-in if it's the same Google account, so re-run setup there too.
- **Apps Script keeps up to 200 versions.** If a deploy says the limit is reached, delete old versions in the
  Apps Script editor (Project history), then use **Run workflow** again.

## Security notes

- The script runs as the sheet owner, so **don't share the sheet itself** with managers — just the app link.
- Passwords are checked on the server for every edit; a wrong one adds a delay to slow guessing.
- Changing or removing a password in Settings signs that admin out on their next visit.
- Password/link security is fine for fixtures; it isn't bank-grade.
- Manager phone numbers are visible to everyone with the app link. Set a **Viewer Code** in Settings if the
  link may travel beyond team managers.
