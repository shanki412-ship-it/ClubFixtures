# Club Fixtures

A phone-friendly fixtures app for the club, built on Google Sheets + Apps Script.
Team managers open one link to see matches; admins unlock editing with a PIN.

## Sheet layout

**Matches tab** (named `Matches`, or any tab whose row 1 has these headers — order doesn't matter):

| Our Team | Opponent | Venue | Home Team | Away Team | Status | Time | Date | Location |
|---|---|---|---|---|---|---|---|---|

- `Venue`: Home / Away / Neutral (drives the green/blue badge)
- `Time`: HH:MM, or blank
- `Date`: a real date (shown as 1-Nov-2026), or a note such as **TBC** or **Internal**
- `Location`: where it's played (Celbridge, Terenure, Kadka…), or TBC / Internal
- `Result`: Won / Lost / Draw (blank until played) · `Score`: e.g. 5-3 — both columns are added automatically
- Extra columns are fine — the app ignores them and never overwrites them.

**Converting the current sheet** (where `time` holds "Celbridge @ 18:00"): after setup, use the
sheet menu **Fixtures App → Split time into Time + Location columns**. It adds the Location column,
moves the place names into it, leaves clean times, and turns date text into real dates.
It's safe to run again. Until you run it, the app still reads the old format correctly.

**Places tab** (created automatically, pre-filled with every location found): add an address or
Eircode next to each place so the 📍 link opens the exact hall in Google Maps. Without one, the link
searches "<place>, Ireland".

**Settings tab** (created automatically):

| Setting | What it does |
|---|---|
| Club Name | Title at the top of the app |
| Admin PINs | Comma-separated, one per admin. Blank = no editing in the app |
| Viewer Code | Optional code managers enter once. Blank = anyone with the link can view |
| Statuses | Options in the status dropdown |

## Setup (≈5 minutes)

1. Open the fixtures Google Sheet → **Extensions → Apps Script**.
2. Replace `Code.gs` with this repo's `Code.gs`. Add an HTML file named `Index` and paste `Index.html`.
3. Project Settings → tick **Show "appsscript.json"** → paste `appsscript.json`.
4. Select `splitIntoSeparateColumns` in the function dropdown → **Run** → authorise (one-time conversion).
5. Select `setup` → **Run**. This creates the **Settings** and **Places** tabs.
6. Back in the sheet, fill in **Settings** (club name, admin PINs, optional viewer code) and the addresses in **Places**.
7. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Copy the web app URL and share it in the managers' WhatsApp group. On a phone: open it → Share → **Add to Home Screen**.

After code changes: **Deploy → Manage deployments → Edit → New version** (keeps the same URL).

## How it works

- **Managers**: Upcoming / Results / All / Stats tabs, team filter (remembered on their phone), search,
  tap a location to open Google Maps.
- **List or Calendar** on every fixtures tab. Colour = venue (blue Home, orange Away);
  solid = confirmed (Scheduled/Confirmed/Played with a date), dashed = TBC / not scheduled.
  Tap a calendar day to see its matches; undated fixtures are listed under the calendar.
- **Stats**: played / won / lost / drawn / win rate, wins-vs-losses bar, home vs away record,
  a per-team table with last-5 form, and how many remaining fixtures are confirmed vs TBC.
  Follows the team filter.
- **Admins**: tap 🔒, enter PIN → tap any match to edit or delete, **+ Add match** to create.
  Choosing Home/Away auto-fills Home Team / Away Team, and Home pre-fills your usual home location.
  Use the date picker, or pick TBC / Internal when there's no date yet.
  Enter the Result and Score after a match; picking a result sets Status to Played.
  A match with a result moves to the Results tab and counts in Stats.
- Edits write straight into the sheet; admins can also keep editing the sheet directly.
- If someone changed a row in the sheet after the app loaded, the save is blocked with
  "refresh and try again", so nobody overwrites anyone else's change.

## Security notes

- The script runs as the sheet owner, so **don't share the sheet itself** with managers — just the app link.
- PINs are checked on the server for every edit; a wrong PIN adds a delay to slow guessing.
- PIN/link security is fine for fixtures; it isn't bank-grade. Change PINs in Settings anytime.
