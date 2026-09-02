'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, quantityText, priceText, scrubNotes, TIERS, SUPPLY, KG_PER_FARESULA } = require('./db');

const SITE_DIR = path.join(__dirname, '..', '..', 'ethio-bean-connect');
const TEMPLATE = path.join(SITE_DIR, 'index.html');

const escHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escHtml(s).replace(/"/g, '&quot;');
const jsStr = s => JSON.stringify(String(s));

let cache = null;

function invalidate() { cache = null; }

function contentMaps() {
  const rows = db.prepare('SELECT key, value_en, value_am FROM content').all();
  const en = {}, am = {};
  rows.forEach(r => { en[r.key] = r.value_en; if (r.value_am) am[r.key] = r.value_am; });
  return { en, am };
}

function settingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return s;
}

function marketJson() {
  const s = settingsMap();
  const rows = db.prepare(
    'SELECT origin, grade, process, price FROM market_prices WHERE published = 1 ORDER BY sort, id'
  ).all();
  return {
    updated: s.market_updated || '',
    currency: s.market_currency || 'USD',
    unit: s.market_price_unit || 'kg',
    rows: rows.map(r => ({
      origin: r.origin, grade: r.grade, process: r.process,
      price: (r.price === null || r.price === '') ? null : r.price
    }))
  };
}

/* A price is quoted per Faresula in the local trade and per kg by the
   buyer, so the table gives both: Faresula first, then kg. Whichever one
   was typed in the admin, the other is derived. Kept identical to
   marketPair() in ethio-bean-connect/index.html so the no-JS markup and
   the scripted redraw agree exactly. */
const marketMoney = n => n >= 100
  ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function marketPair(price, unit) {
  const v = Number(String(price).replace(/,/g, ''));
  if (!isFinite(v) || v <= 0) return escHtml(String(price));
  const perKg = unit === 'faresula' ? v / KG_PER_FARESULA : v;
  const perFar = perKg * KG_PER_FARESULA;
  return marketMoney(perFar) + '<span class="sep">/</span><span class="kg">' +
         marketMoney(perKg) + '</span>';
}

/* the seeded market rows are also written into the markup, so the table is
   readable with scripting switched off */
function marketTableRows(data) {
  return data.rows.map(r => {
    const g1 = /^G1$/i.test(r.grade) ? ' g1' : '';
    const price = (r.price === null)
      ? '<td class="p ask">On request</td>'
      : `<td class="p">${escHtml(data.currency)} ${marketPair(r.price, data.unit)}</td>`;
    return `          <tr><td class="o">${escHtml(r.origin)}</td>` +
           `<td><span class="chip${g1}">${escHtml(r.grade)}</span></td>` +
           `<td>${escHtml(r.process)}</td>${price}</tr>`;
  }).join('\n');
}

/* ------------------------------------------------------------------
   The public board.

   The SELECT below names its columns one by one and none of the
   poster_* columns are among them. That is deliberate and it is the
   whole anonymity guarantee: a name cannot reach the page because it
   is never loaded, not because a template forgot to print it. If you
   ever add a field here, check it is one a stranger may see.
   ------------------------------------------------------------------ */
const TIER_MARK = {
  trusted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 2.6 4.6 5.8v5.6c0 4.6 3.1 8.4 7.4 9.9 4.3-1.5 7.4-5.3 7.4-9.9V5.8z"/><path d="m8.7 12 2.3 2.3 4.4-4.6"/></svg>',
  verified: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/></svg>',
  unverified: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>'
};

function stars(rating) {
  if (rating === null || rating === undefined || rating === '') return '';
  const n = Math.max(0, Math.min(5, Number(rating)));
  if (!n) return '';
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= n ? '★' : '<span class="off">★</span>';
  return `<span class="stars" role="img" aria-label="Rated ${n} out of 5">${out}</span>`;
}

function boardCards(en) {
  const T = (k, d) => (en && en[k]) || d;
  const rows = db.prepare(
    `SELECT ref, kind, market, supply, origin, grade, process, quantity_val, quantity_unit,
            price, price_unit, currency, harvest, notes, tier, rating, deals
       FROM listings
      WHERE published = 1 AND status = 'live'
      ORDER BY sort, id DESC`
  ).all();

  if (!rows.length) return { count: 0, groups: null, counts: { export: 0, local: 0 } };

  const card = r => {
    const q = quantityText(r.quantity_val, r.quantity_unit);
    const p = priceText(r.price, r.price_unit, r.currency);
    const isOffer = r.kind !== 'need';
    const tier = TIERS[r.tier] ? r.tier : 'unverified';

    const chips = [];
    if (r.process)  chips.push(`<span class="chip">${escHtml(r.process)}</span>`);
    if (q.main)     chips.push(`<span class="chip">${escHtml(q.main)}</span>`);
    if (q.alt)      chips.push(`<span class="chip soft">${escHtml(q.alt)}</span>`);
    if (r.harvest)  chips.push(`<span class="chip">${escHtml(r.harvest)}</span>`);
    if (SUPPLY[r.supply])
      chips.push(`<span class="chip where ${escHtml(r.supply)}" data-i18n="supply.${escHtml(r.supply)}">` +
                 `${escHtml(T('supply.' + r.supply, SUPPLY[r.supply].short))}</span>`);

    const priceBlock = p.main === null
      ? `<p class="lot-price ask" data-i18n="board.onRequest">${escHtml(T('board.onRequest', 'On request'))}</p>`
      : `<p class="lot-price"><span class="cur">${escHtml(r.currency || 'USD')}</span>` +
        `${escHtml(p.main.replace(/^\S+\s/, ''))}<span class="per"><span data-i18n="board.per">${escHtml(T('board.per', 'per'))}</span> ${escHtml(p.per)}</span></p>` +
        (p.alt ? `<p class="lot-alt">${escHtml(p.alt)}</p>` : '');

    const deals = r.deals > 0
      ? `<span class="lot-deals">${r.deals} <span data-i18n="board.dealsWithUs">${escHtml(T('board.dealsWithUs', 'closed with us'))}</span></span>` : '';

    return `      <article class="lot" data-kind="${isOffer ? 'offer' : 'need'}">
        <div class="lot-top">
          <span class="lot-ref">${escHtml(r.ref)}</span>
          <span class="lot-kind ${isOffer ? 'offer' : 'need'}" data-i18n="${isOffer ? 'board.forSale' : 'board.wanted'}">${escHtml(isOffer ? T('board.forSale', 'For sale') : T('board.wanted', 'Wanted'))}</span>
        </div>
        <h3>${escHtml(r.origin)}${r.grade ? ' ' + escHtml(r.grade) : ''}</h3>
        <div class="lot-spec">${chips.join('')}</div>
        ${priceBlock}
        ${r.notes ? `<p class="lot-note">${escHtml(scrubNotes(r.notes))}</p>` : ''}
        <div class="lot-foot">
          <span class="tier ${tier}">${TIER_MARK[tier]}<span data-i18n="tier.${tier}">${escHtml(T('tier.' + tier, TIERS[tier].short))}</span>${deals}</span>
          ${stars(r.rating)}
          <a class="lot-ask" href="#contact" data-ref="${escAttr(r.ref)}" data-i18n="board.ask">${escHtml(T('board.ask', 'Ask about this'))}</a>
        </div>
      </article>`;
  };

  /* one block of markup per board. A market value that is neither of the
     two falls back to export rather than dropping off the page. */
  const groups = { export: [], local: [] };
  rows.forEach(r => { (groups[r.market] || groups.export).push(card(r)); });

  return {
    count: rows.length,
    groups: { export: groups.export.join('\n'), local: groups.local.join('\n') },
    counts: { export: groups.export.length, local: groups.local.length }
  };
}

function render() {
  if (cache) return cache;

  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const { en, am } = contentMaps();
  const s = settingsMap();

  /* 1. every data-i18n element's visible text, so the English in the markup
        is whatever the admin last saved and no-JS visitors see it too */
  html = html.replace(
    /(<([a-zA-Z0-9]+)([^>]*\bdata-i18n="([a-zA-Z0-9._]+)"[^>]*)>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, attrs, key, inner, close) => {
      if (!(key in en)) return m;
      if (/</.test(inner)) return m;          /* leave elements with markup inside alone */
      return open + escHtml(en[key]) + close;
    }
  );

  /* 2. placeholders */
  html = html.replace(
    /(<input[^>]*\bdata-i18n-ph="([a-zA-Z0-9._]+)"[^>]*\bplaceholder=")([^"]*)(")/g,
    (m, pre, key, old, post) => (key in en) ? pre + escAttr(en[key]) + post : m
  );

  /* 3. the Amharic dictionary */
  const amStart = html.indexOf('  am:{');
  if (amStart !== -1) {
    const amEnd = html.indexOf('\n  }', amStart);
    if (amEnd !== -1) {
      const body = Object.keys(am).sort()
        .map(k => `    ${jsStr(k)}:${jsStr(am[k])}`).join(',\n');
      html = html.slice(0, amStart) + '  am:{\n' + body + '\n  }' + html.slice(amEnd + 4);
    }
  }

  /* 4. contact details */
  const cStart = html.indexOf('var CONTACT = {');
  if (cStart !== -1) {
    const cEnd = html.indexOf('};', cStart);
    if (cEnd !== -1) {
      const block = 'var CONTACT = {\n' +
        `  email:    ${jsStr(s.contact_email || '')},\n` +
        `  whatsapp: ${jsStr(s.contact_whatsapp || '')},\n` +
        `  phone:    ${jsStr(s.contact_phone || '')},\n` +
        `  phone2:   ${jsStr(s.contact_phone2 || '')},\n` +
        `  address:  ${jsStr(s.contact_address || '')}\n` +
        '}';
      html = html.slice(0, cStart) + block + html.slice(cEnd + 1);
    }
  }

  /* 4b. the link preview. Until the address is set the two tags are
        dropped rather than left pointing at a placeholder domain, because
        a broken preview reads worse than none. */
  const siteUrl = String(s.site_url || '').trim().replace(/\/+$/, '');
  if (siteUrl) {
    html = html.split('https://REPLACE-AT-DEPLOY').join(siteUrl);
  } else {
    html = html
      .split('<meta property="og:url" content="https://REPLACE-AT-DEPLOY/">\n').join('')
      .split('<meta property="og:image" content="https://REPLACE-AT-DEPLOY/assets/hero-poster.jpg">\n').join('');
  }

  /* 5. the market table body and its date, in the markup */
  const data = marketJson();
  const UNIT_LABEL = { kg: 'kg', faresula: 'Faresula', quintal: 'quintal', bag60: '60 kg bag', mt: 'tonne', container: 'container' };
  html = html.replace(
    /(<tbody id="mkt-body">)([\s\S]*?)(<\/tbody>)/,
    (m, open, inner, close) => open + '\n' + marketTableRows(data) + '\n        ' + close
  );

  /* 6. the footer contact list, also in the markup for the no-JS path */
  const footItems = [];
  if (s.contact_phone)    footItems.push(`<li><a href="tel:${escAttr(s.contact_phone.replace(/\s/g, ''))}">${escHtml(s.contact_phone)}</a></li>`);
  if (s.contact_phone2)   footItems.push(`<li><a href="tel:${escAttr(s.contact_phone2.replace(/\s/g, ''))}">${escHtml(s.contact_phone2)}</a></li>`);
  if (s.contact_whatsapp) footItems.push(`<li><a href="https://wa.me/${escAttr(s.contact_whatsapp)}" target="_blank" rel="noopener">${escHtml(en['chat.wa'] || 'Chat on WhatsApp')}</a></li>`);
  if (s.contact_email)    footItems.push(`<li><a href="mailto:${escAttr(s.contact_email)}">${escHtml(s.contact_email)}</a></li>`);
  if (s.contact_address)  footItems.push(`<li>${escHtml(s.contact_address)}</li>`);
  html = html.replace(
    /(<ul class="foot-list" id="footcontact">)([\s\S]*?)(<\/ul>)/,
    (m, open, inner, close) => open + '\n          ' + footItems.join('\n          ') + '\n        ' + close
  );
  /* 7. the two boards. Each grid is bounded by its own end marker, so the
        fill does not depend on how the template happens to be indented.
        With nothing published every grid stays empty and the big empty
        card is left showing instead. */
  const board = boardCards(en);
  ['export', 'local'].forEach(k => {
    const cards = board.groups ? board.groups[k] : '';
    const re = new RegExp('(<div class="board-grid" id="grid-' + k + '">)([\\s\\S]*?)(<!--/grid-' + k + '-->)');
    html = html.replace(re, (m, open, inner, close) =>
      open + (cards ? '\n' + cards + '\n' : '\n') + close);
    html = html.replace(
      new RegExp('(<b data-count="' + k + '">)([^<]*)(</b>)'),
      (m, open, inner, close) => open + board.counts[k] + close);
  });
  html = html.replace(
    /(<b id="board-count">)([^<]*)(<\/b>)/,
    (m, open, inner, close) => open + board.count + close
  );
  /* the whole-board empty card only belongs there when both boards are bare */
  if (board.count > 0) {
    html = html.replace('<div class="board-empty rise" id="board-empty">',
                        '<div class="board-empty rise" id="board-empty" hidden>');
  }
  /* and a board with nothing on it says so, rather than showing a bare heading */
  ['export', 'local'].forEach(k => {
    if (board.counts[k] === 0 && board.count > 0) {
      const re = new RegExp('(<div class="board-group" data-market="' + k + '">[\\s\\S]*?)<p class="board-group-empty" data-i18n="board.groupEmpty" hidden>');
      html = html.replace(re, (m, head) => head + '<p class="board-group-empty" data-i18n="board.groupEmpty">');
    }
  });


  cache = html;
  return html;
}

module.exports = { render, invalidate, marketJson, SITE_DIR, contentMaps, settingsMap };
