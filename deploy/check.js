'use strict';
/* ------------------------------------------------------------------
   The build step.

   There is nothing to compile - the application has no dependencies and
   ships the source it runs. So rather than leave `build` as a no-op that
   always succeeds, this checks the things that actually break a deploy:
   the wrong Node, a file that does not parse, a missing asset, or a
   module that throws the moment it is loaded.

   It exits non-zero on a real problem, which is what stops a broken
   version from replacing a working one.
   ------------------------------------------------------------------ */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.join(__dirname, '..');
let bad = 0;
const ok = m => console.log('  ok    ' + m);
const no = m => { console.log('  FAIL  ' + m); bad++; };

/* 1. node:sqlite is built in from 22. On anything older the app does not
      merely run badly, it cannot open its database at all. */
const major = Number(process.versions.node.split('.')[0]);
major >= 22 ? ok('node ' + process.versions.node)
            : no('node ' + process.versions.node + ' is too old, 22 or newer is required');

/* 2. every file the server will load must parse */
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'data' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}
const files = walk(path.join(root, 'platform'));
let parsed = 0;
for (const f of files) {
  try { cp.execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); parsed++; }
  catch (e) { no('does not parse: ' + path.relative(root, f)); }
}
if (parsed === files.length) ok(parsed + ' javascript files parse');

/* 3. the things the server reads at runtime and cannot invent */
for (const rel of [
  'ethio-bean-connect/index.html',
  'ethio-bean-connect/assets/hero-poster.jpg',
  'platform/server.js',
  'platform/lib/db.js'
]) {
  fs.existsSync(path.join(root, rel)) ? ok('present: ' + rel) : no('missing: ' + rel);
}

/* 3b. The site's scripts live inside index.html, so --check never saw
      them. A single bad character in there takes the whole page down: the
      class that reveals content is set by that script, so a parse error
      leaves a black screen rather than a broken feature. That happened,
      and it reached a browser because nothing here was looking. */
const html = fs.readFileSync(path.join(root, 'ethio-bean-connect/index.html'), 'utf8');
/* built with RegExp rather than written as literals: a backslash typed
   into this file is exactly the thing that keeps getting lost */
/* The backslashes are built at runtime, not typed. Written as literals
   they are swallowed by the surrounding string, the pattern silently
   becomes something that matches nothing, and the check passes by
   looking at no scripts at all. */
const BS = String.fromCharCode(92);
const scriptRe = new RegExp('<script([^>]*)>([' + BS + 's' + BS + 'S]*?)<' + BS + '/script>', 'g');
const hasSrc = new RegExp(BS + 'bsrc=');
const isData = new RegExp('type=[' + String.fromCharCode(34, 39) + '](application|text' + BS + '/template)');
let sm, checked = 0, broke = 0;
while ((sm = scriptRe.exec(html)) !== null) {
  const attrs = sm[1] || '';
  if (hasSrc.test(attrs)) continue;      // fetched separately, not inline
  if (isData.test(attrs)) continue;      // JSON-LD and templates are not javascript
  checked++;
  const line = html.slice(0, sm.index).split(String.fromCharCode(10)).length;
  try { new Function(sm[2]); }
  catch (e) { broke++; no('index.html script at line ' + line + ' does not parse: ' + e.message); }
}
if (!broke) ok(checked + ' inline script' + (checked === 1 ? '' : 's') + ' in index.html parse');

/* 4. loading the modules is where a bad require or a syntax-valid but
      broken file actually shows itself. Done against a scratch database so
      a check can never touch real customer data. */
const scratch = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ebc-check-'));
process.env.EBC_DATA_DIR = scratch;
try {
  require(path.join(root, 'platform/lib/db'));
  require(path.join(root, 'platform/lib/render'));
  ok('the modules load');
} catch (e) {
  no('a module threw on load: ' + e.message);
}
try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) {}

console.log('');
if (bad) { console.log('  ' + bad + ' problem(s). Not fit to deploy.'); process.exit(1); }
console.log('  Ready to deploy.');
