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
- **Browser-tab icon**: upload `assets/acbc-icon-512.png` to Google Drive, Share → *Anyone with the link*,
  copy the link and paste it into **Settings → Icon URL**. The app converts Drive links automatically.
- The title comes from **Settings → App Title** (default "ACBC Juvenile League 2026-27").
- The footer shows the version, e.g. `v1.8.0 · 21 Oct 2026 · 65d2fe6`. The date and commit are stamped
  automatically by each deploy; bump `APP_VERSION` in `src/Code.gs` for bigger releases.

## Match reports link

**Settings → Match Reports URL** (default: the Dublin Juvenile League match-reports page) appears as a
**📝 Match reports & scoring sheets** button on the Fixtures tab, in each match's details, and in the Monday email.
Change or clear it in Settings; it must start with https://.

## Line-ups & match sheets

Captains fill the line-up in the app and get the league score sheet filled in and ready to print.

- **Players tab** (created automatically): `Team | Player | Gender (B/G)`, one row per player. Team must match the
  Teams tab. Gender is needed for mixed teams. Row order is the default order in the dropdowns.
- **Captain codes**: Admin → Teams & managers → tap our team → *Captain code*. A code only works for its own team;
  admins can do every team. Codes are never sent to the page.
- **On a match**: tap it → **📝 Line-up & match sheet** → enter the captain code (remembered on that phone) →
  age group / division / section / team names are pre-filled → pick players from dropdowns (our team's pool first,
  other club players listed as subs) → **↻ Fill pairs** builds the doubles and mixed pairs from the singles →
  the rules check warns if anyone doesn't play exactly two matches (mixed: one must be mixed doubles).
- **Create match sheet** copies the template, fills it (our players in the home or away column), saves it in the
  *Match Sheets* folder in Drive (view-only link) and shows **🖨 Open PDF to print**. Creating it again replaces it.
- The line-up, section and our team's name on the sheet are remembered (Lineups and Teams tabs).

Templates (`templates/` in this repo) are the league sheets with `{{placeholders}}`:
`{{AGE}} {{DIVISION}} {{SECTION}} {{HOME_TEAM}} {{AWAY_TEAM}} {{LOCATION}} {{DATE}}`, and `{{H1}}…` / `{{A1}}…` for the
home / away player rows (Boys: 6 rows, Mixed: 7 rows).
Setup: upload both to Google Drive, open each with Google Docs (File → Save as Google Docs), paste the links into
**Settings → Boys / Mixed Match Sheet Template**, then sheet menu **Fixtures App → Match sheets: check setup**
(this also asks for the Drive/Docs permission the first time).

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
