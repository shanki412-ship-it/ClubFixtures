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

**Places tab** (created automatically, pre-filled with every location found): holds an address or
Eircode for each place so the 📍 link opens the exact hall in Google Maps. Without one, the link
searches "<place>, Ireland". Admins normally manage this from the app's **Locations** tab instead.

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

- **Managers**: Upcoming / Results / All / Stats tabs, team filter (remembered on their phone), search,
  tap a location to open Google Maps.
- **List or Calendar** on every fixtures tab. Colour = venue (blue Home, orange Away);
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
  A match with a result moves to the Results tab and counts in Stats.
- **Locations tab (admins only)**: every location with its address and how many matches use it.
  **+ Add location** to create one; tap one to set its address or rename it (renaming can also fix the
  name in every match, e.g. Knocklyn → Knocklyon). Places used in fixtures but missing from the list
  are shown underneath so you can add them in one tap.
- Edits write straight into the sheet; admins can also keep editing the sheet directly.
- If someone changed a row in the sheet after the app loaded, the save is blocked with
  "refresh and try again", so nobody overwrites anyone else's change.

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
