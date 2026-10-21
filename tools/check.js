// Catches typing mistakes before anything reaches Apps Script:
// the .gs files must parse together, every <script> in the .html files must parse,
// and appsscript.json must be valid JSON.
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = path.join(__dirname, '..', 'src');
let bad = 0;

const gs = fs.readdirSync(src).filter(f => f.endsWith('.gs')).sort();
try {
  new vm.Script(gs.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n;\n'), { filename: gs.join('+') });
  console.log('ok  ' + gs.join(', '));
} catch (e) { bad++; console.error('::error::Problem in the .gs files – ' + e.message); }

fs.readdirSync(src).filter(f => f.endsWith('.html')).forEach(f => {
  const html = fs.readFileSync(path.join(src, f), 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  let ok = true;
  blocks.forEach((code, i) => {
    try { new vm.Script(code, { filename: f + ' script ' + (i + 1) }); }
    catch (e) { bad++; ok = false; console.error('::error::Problem in ' + f + ' – ' + e.message); }
  });
  if (ok) console.log('ok  ' + f + ' (' + blocks.length + ' script block' + (blocks.length === 1 ? '' : 's') + ')');
});

try {
  const m = JSON.parse(fs.readFileSync(path.join(src, 'appsscript.json'), 'utf8'));
  if (!m.webapp) { bad++; console.error('::error::appsscript.json has no "webapp" section – the app link would stop working.'); }
  else console.log('ok  appsscript.json');
} catch (e) { bad++; console.error('::error::appsscript.json is missing or not valid JSON – ' + e.message); }

process.exit(bad ? 1 : 0);
