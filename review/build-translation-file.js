const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('review/i18n-pairs.json', 'utf8'));

const GROUPS = [
  ['NAVIGATION AND BUTTONS',   k => /^(nav|cta)\./.test(k)],
  ['THE OPENING SCREEN',       k => /^(hero|static)\./.test(k)],
  ['THE THREE PROBLEMS',       k => /^walls\./.test(k)],
  ['HOW IT WORKS',             k => /^how\./.test(k)],
  ['THE MARKET TABLE',         k => /^market\./.test(k)],
  ['ORIGINS',                  k => /^origins\./.test(k)],
  ['THE SEALED LOT',           k => /^seal\./.test(k)],
  ['WHAT WE CHECK',            k => /^checks\./.test(k)],
  ['QUESTIONS AND ANSWERS',    k => /^faq\./.test(k)],
  ['THE FORM',                 k => /^(post|f)\./.test(k)],
  ['ERROR MESSAGES',           k => /^e\./.test(k)],
  ['CONTACT AND FOOTER',       k => /^(chat|foot)\./.test(k)],
  ['EVERYTHING ELSE',          () => true]
];

// the ones I am least confident about, so they get looked at first
const UNSURE = new Set([
  'hero.b3','cta.post','post.h','post.hNeed','seal.slip','seal.lot','seal.f5v',
  'checks.1h','checks.3h','market.th4','market.ask','f.type','f.grade','f.qty',
  'f.origin','origins.season','faq.a3','e.required','e.other','f.okh','f.okp'
]);

const NOTES = {
  'hero.b3':      'the whole site turns on the word "lot". I used ጭነት (cargo/load). Is there a better trade word?',
  'cta.post':     'the main button. Everything funnels here.',
  'post.h':       'same word again, as a heading.',
  'seal.slip':    'the paper record a washing station would recognise.',
  'market.th4':   'I used ዋጋ (price) in Amharic but "Level" in English. Which is right for an indicative figure?',
  'market.ask':   'shown in every price cell until you set real prices.',
  'checks.1h':    'screen size is a specific grading term.',
  'checks.3h':    'washing-station-level traceability, for EU buyers.',
  'f.type':       'the process names in this dropdown stay in English. Should they?',
  'origins.season':'about this season being short in the south.',
  'faq.a3':       'about suppliers waiting to be paid. The tone here matters most.',
  'e.required':   'shown when a field is left empty. Should be firm but not rude.'
};

const used = new Set();
let out = [];
out.push('ETHIO BEAN CONNECT - AMHARIC STRINGS');
out.push('====================================');
out.push('');
out.push('HOW TO USE THIS FILE');
out.push('  - Edit the AM: lines only. Do not change the KEY: lines.');
out.push('  - The AM already has my first attempt. Overwrite it with yours.');
out.push('  - Do not try to match the English word for word. If a shorter or');
out.push('    different Amharic sentence works better, that is the right answer.');
out.push('  - Leave a line as it is if it is already fine.');
out.push('  - Send the file back and it goes straight into the site.');
out.push('');
out.push('  Lines marked [CHECK THIS] are the ones I am least sure about.');
out.push('');
out.push('  128 strings. The form and the questions sections matter most,');
out.push('  because that is where people decide whether to trust you.');
out.push('');

let n = 0;
GROUPS.forEach(([title, test]) => {
  const items = pairs.filter(p => !used.has(p.key) && test(p.key));
  items.forEach(p => used.add(p.key));
  if (!items.length) return;
  out.push('');
  out.push('-----------------------------------------------------------');
  out.push('  ' + title + '   (' + items.length + ')');
  out.push('-----------------------------------------------------------');
  items.forEach(p => {
    n++;
    out.push('');
    out.push('[' + n + '] KEY: ' + p.key + (UNSURE.has(p.key) ? '   [CHECK THIS]' : ''));
    if (NOTES[p.key]) out.push('    note: ' + NOTES[p.key]);
    out.push('EN:  ' + p.en);
    out.push('AM:  ' + p.am);
  });
});

out.push('');
out.push('');
out.push('END - ' + n + ' strings');
fs.writeFileSync('review/amharic-strings.txt', out.join('\r\n'), 'utf8');
console.log('written review/amharic-strings.txt  (' + n + ' strings)');
