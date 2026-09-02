const fs = require('fs');
const html = fs.readFileSync('ethio-bean-connect/index.html', 'utf8');

// the Amharic dictionary block
const start = html.indexOf('am:{');
const end = html.indexOf('};', start);
const block = html.slice(start, end);

const am = {};
let m;
const reAm = /"([a-zA-Z0-9._]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
while ((m = reAm.exec(block))) am[m[1]] = m[2];

// English from the markup
const en = {};
const reEl = /data-i18n="([a-zA-Z0-9._]+)"[^>]*>([^<]*)</g;
while ((m = reEl.exec(html))) if (en[m[1]] === undefined) en[m[1]] = m[2].trim();

// English placeholders
const rePh = /data-i18n-ph="([a-zA-Z0-9._]+)"[^>]*placeholder="([^"]*)"/g;
while ((m = rePh.exec(html))) if (en[m[1]] === undefined) en[m[1]] = m[2];

// English declared in JS
const reJs = /I18N\.en\['([a-zA-Z0-9._]+)'\]\s*=\s*'((?:[^'\\]|\\.)*)'/g;
while ((m = reJs.exec(html))) if (en[m[1]] === undefined) en[m[1]] = m[2];

const keys = Object.keys(am).sort();
const pairs = keys.map(k => ({ key: k, en: en[k] || '', am: am[k] }));

console.log('amharic strings:', keys.length);
console.log('matched to english:', pairs.filter(p => p.en).length);
const missing = pairs.filter(p => !p.en).map(p => p.key);
console.log('unmatched:', missing.length ? missing.join(', ') : 'none');

fs.writeFileSync('review/i18n-pairs.json', JSON.stringify(pairs, null, 1));
console.log('written review/i18n-pairs.json');
