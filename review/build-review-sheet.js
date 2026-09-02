const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('review/i18n-pairs.json', 'utf8'));

// group by the part of the site the key belongs to
const GROUPS = [
  ['Navigation and buttons',       k => /^(nav|cta)\./.test(k)],
  ['The opening screen',           k => /^(hero|static)\./.test(k)],
  ['The three problems',           k => /^walls\./.test(k)],
  ['How it works',                 k => /^how\./.test(k)],
  ['The market table',             k => /^market\./.test(k)],
  ['Origins',                      k => /^origins\./.test(k)],
  ['The sealed lot',               k => /^seal\./.test(k)],
  ['What we check',                k => /^checks\./.test(k)],
  ['Questions and answers',        k => /^faq\./.test(k)],
  ['The form',                     k => /^(post|f)\./.test(k)],
  ['Error messages',               k => /^e\./.test(k)],
  ['Contact and footer',           k => /^(chat|foot)\./.test(k)],
  ['Everything else',              () => true]
];

const used = new Set();
const grouped = GROUPS.map(([title, test]) => {
  const items = pairs.filter(p => !used.has(p.key) && test(p.key));
  items.forEach(p => used.add(p.key));
  return { title, items };
}).filter(g => g.items.length);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let n = 0;
const body = grouped.map(g => `
  <section>
    <h2>${esc(g.title)} <span class="count">${g.items.length}</span></h2>
    <div class="rows">
      ${g.items.map(p => {
        n++;
        return `<div class="row">
          <div class="num">${n}</div>
          <div class="pair">
            <p class="en">${esc(p.en)}</p>
            <p class="am" lang="am">${esc(p.am)}</p>
          </div>
          <div class="mark" aria-hidden="true"></div>
        </div>`;
      }).join('')}
    </div>
  </section>`).join('');

fs.writeFileSync('review/amharic-review-sheet.body.html', body, 'utf8');
console.log('sections:', grouped.length, ' strings:', n);
