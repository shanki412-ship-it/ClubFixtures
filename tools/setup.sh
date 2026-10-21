#!/usr/bin/env bash
# One-time setup. Run it in a GitHub Codespace (or any computer with Node):
#   bash tools/setup.sh
# It signs clasp in to your Google account, links this repo to the fixtures sheet's
# Apps Script project, finds your web-app deployment, and saves the one secret GitHub needs.
set -euo pipefail
cd "$(dirname "$0")/.."
CLASP="npx --yes @google/clasp@3.4.1"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
# always read answers from the keyboard (the Google sign-in tool can close normal input)
ask(){ local __v; read -rp "$1" __v < /dev/tty || true; printf '%s' "$__v"; }
# you can also pass the project address straight away:  bash tools/setup.sh https://script.google.com/.../edit
ARG_URL="${1:-}"

say "Step 1 of 5 – Apps Script API"
echo "Open https://script.google.com/home/usersettings and check 'Google Apps Script API' is ON"
echo "(it already is if you set up FitBull with the same Google account)."
if [ -f ~/.clasprc.json ]; then echo "Already signed in – skipping."; else ask "Press Enter when it's on… " >/dev/null; fi

say "Step 2 of 5 – Sign in to Google"
echo "Use the Google account that OWNS the fixtures sheet."
echo "A link appears below. Open it, pick that account and tap Allow."
echo "Your browser then shows an error page ('site can't be reached') – that's expected."
echo "Copy the WHOLE address from the address bar (it starts with http://localhost:8888/?…) and paste it here."
if [ -f ~/.clasprc.json ] && grep -q refresh_token ~/.clasprc.json; then
  echo "✅ Already signed in to Google – skipping."
else
  $CLASP login --no-localhost < /dev/tty
fi

say "Step 3 of 5 – Which Apps Script project?"
echo "Open the fixtures Google Sheet → Extensions → Apps Script, and copy the address from the browser"
echo "(…/projects/<ID>/edit) – or paste just the Script ID from Project Settings."
RAW="$ARG_URL"; [ -n "$RAW" ] || RAW=$(ask "Paste it here: ")
SCRIPT_ID=$(printf '%s' "$RAW" | grep -oE '[A-Za-z0-9_-]{40,}' | head -1 || true)
[ -n "$SCRIPT_ID" ] || { echo "That doesn't look like a Script ID. Run the script again."; exit 1; }

REMOTE=$(mktemp -d)
( cd "$REMOTE" && $CLASP clone "$SCRIPT_ID" >/dev/null )
echo "Files in your project now:"; ls "$REMOTE" | sed 's/^/  /'
EXTRA=$(ls "$REMOTE" | grep -vE '^(\.clasp\.json|appsscript\.json|Code\.(gs|js)|Index\.html)$' || true)
if [ -n "$EXTRA" ]; then
  echo "⚠  These files are in Apps Script but not in this repo, and would be DELETED by the first deploy:"
  echo "$EXTRA" | sed 's/^/     /'
  echo "   Copying them into src/ so nothing is lost."
  for f in $EXTRA; do cp "$REMOTE/$f" "src/${f%.js}$( [[ $f == *.js ]] && echo .gs )"; done
fi
node -e "const f='.clasp.json',j=JSON.parse(require('fs').readFileSync(f));j.scriptId=process.argv[1];require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')" "$SCRIPT_ID"
rm -rf "$REMOTE"

say "Step 4 of 5 – Your web-app deployment"
DEPS=$($CLASP --json list-deployments "$SCRIPT_ID")
DEP_ID=$(node -e '
  const d = JSON.parse(process.argv[1]).filter(x => x.versionNumber);   // skip the @HEAD test deployment
  if (!d.length) { process.exit(0); }
  if (d.length === 1) { console.log(d[0].deploymentId); process.exit(0); }
  d.forEach((x, i) => console.error(`  ${i + 1}) version ${x.versionNumber}  ${x.description || ""}  ${x.deploymentId.slice(0, 12)}…`));
  console.log("ASK:" + d.map(x => x.deploymentId).join(","));
' "$DEPS")
if [[ "$DEP_ID" == ASK:* ]]; then
  IFS=',' read -ra ALL <<< "${DEP_ID#ASK:}"
  N=$(ask "Which one is the link you shared with managers? Type its number: ")
  DEP_ID=${ALL[$((N-1))]}
fi
if [ -z "$DEP_ID" ]; then
  echo "No web-app deployment found. In Apps Script: Deploy → New deployment → Web app, then run this again."; exit 1
fi
node -e "require('fs').writeFileSync('deploy.json', JSON.stringify({deploymentId: process.argv[1]}, null, 2) + '\n')" "$DEP_ID"
echo "Using deployment ${DEP_ID:0:12}…"

say "Step 5 of 5 – The one secret GitHub needs"
if gh secret set CLASPRC_JSON < ~/.clasprc.json 2>/dev/null; then
  echo "✅ Secret CLASPRC_JSON saved to this repo automatically."
else
  echo "Add it by hand: repo → Settings → Secrets and variables → Actions → New repository secret"
  echo "  Name:   CLASPRC_JSON"
  echo "  Value:  everything between the lines below"
  echo "----------8<----------"; cat ~/.clasprc.json; echo; echo "---------->8----------"
  ask "Press Enter once the secret is saved… " >/dev/null
fi

say "Saving the project link to GitHub (this starts the first deploy)"
node tools/check.js
git add -A src .clasp.json deploy.json
git -c user.name="${GITHUB_USER:-setup}" -c user.email="setup@users.noreply.github.com" commit -qm "Link to the fixtures Apps Script project" || true
git push -q && echo "Saved."

say "All set"
echo "Watch the first deploy on the Actions tab (about 1 minute)."
echo "From now on, any change to src/ on main updates the app automatically."
echo "Then delete this Codespace (github.com/codespaces) so the sign-in file doesn't stay around."
