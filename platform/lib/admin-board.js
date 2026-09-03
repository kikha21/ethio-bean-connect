'use strict';
/* ------------------------------------------------------------------
   The marketplace, from the inside.

   This is the only place a poster's real name, phone and email are
   ever shown. The public renderer never selects those columns; here
   they are the whole point, because matching the two sides of a deal
   is the business.
   ------------------------------------------------------------------ */
const { db, nowIso, log, GRADES, PROCESSES, UNITS, QTY_UNIT_KEYS, PRICE_UNIT_KEYS, TIERS, MARKETS, SUPPLY,
        quantityText, priceText, contactHints, nextRef } = require('./db');
const { layout, esc } = require('./ui');

const ORIGINS = ['Yirgacheffe', 'Guji', 'Sidamo', 'Limu', 'Jimma', 'Nekemte', 'Harar',
                 'Kaffa', 'Bench Maji', 'Illubabor', 'Gimbi', 'Lekempti', 'Tepi', 'Gomma'];
/* birr first: it is what the local trade quotes and what the price table
   shows. USD stays on the list for an export deal priced FOB. */
const CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP'];
const STATUSES = {
  pending: 'Waiting for you to check it',
  live: 'On the board',
  matched: 'Matched, off the board',
  closed: 'Closed'
};

const opts = (list, sel, blank) =>
  (blank ? '<option value="">' + esc(blank) + '</option>' : '') +
  list.map(v => {
    const pair = Array.isArray(v) ? v : [v, v];
    const on = String(sel) === String(pair[0]) ? ' selected' : '';
    return '<option value="' + esc(pair[0]) + '"' + on + '>' + esc(pair[1]) + '</option>';
  }).join('');

const qtyUnitOpts   = sel => opts(QTY_UNIT_KEYS.map(k => [k, UNITS[k].label]), sel);
const priceUnitOpts = sel => opts(PRICE_UNIT_KEYS.map(k => [k, UNITS[k].label]), sel);
const tierOpts   = sel => opts(Object.keys(TIERS).map(k => [k, TIERS[k].label]), sel);
const marketOpts = sel => opts(Object.keys(MARKETS).map(k => [k, MARKETS[k].label]), sel);
const supplyOpts = sel => opts(Object.keys(SUPPLY).map(k => [k, SUPPLY[k].label]), sel, 'Not stated');

function counts() {
  const live = k => db.prepare(
    "SELECT COUNT(*) n FROM listings WHERE kind=? AND published=1 AND status='live'").get(k).n;
  return {
    offers: live('offer'),
    needs: live('need'),
    pending: db.prepare("SELECT COUNT(*) n FROM listings WHERE status='pending'").get().n,
    drafts: db.prepare("SELECT COUNT(*) n FROM listings WHERE published=0 AND status<>'pending'").get().n,
    examples: db.prepare('SELECT COUNT(*) n FROM listings WHERE is_example=1').get().n
  };
}

/* ---------------- the list ---------------- */
function boardPage(user, flash, filter) {
  const c = counts();
  const where = filter === 'pending' ? "WHERE status='pending'"
              : filter === 'draft'   ? "WHERE published=0 AND status<>'pending'"
              : filter === 'offer'   ? "WHERE kind='offer'"
              : filter === 'need'    ? "WHERE kind='need'"
              : filter === 'example' ? 'WHERE is_example=1' : '';
  const rows = db.prepare('SELECT * FROM listings ' + where +
  " ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, published DESC, sort, id DESC").all();

  const tab = (id, label, n) =>
    '<a href="/admin/marketplace' + (id ? '?show=' + id : '') + '" class="pill' +
    ((filter || '') === id ? ' on' : '') + '">' + esc(label) +
    (n === undefined ? '' : ' <b>' + n + '</b>') + '</a>';

  const body = rows.map(r => {
    const q = quantityText(r.quantity_val, r.quantity_unit);
    const p = priceText(r.price, r.price_unit, r.currency);
    const hints = contactHints(r.notes);
    const who = [r.poster_name, r.poster_org].filter(Boolean).join(' · ') || '—';
    const priceCell = p.main === null
      ? '<span class="dim">On request</span>'
      : esc(p.main) + '<span class="dim">/' + esc(p.per) + '</span>' +
        (p.alt ? '<br><span class="dim">' + esc(p.alt) + '</span>' : '');
    return '<tr>' +
      '<td class="mono">' + esc(r.ref) + '</td>' +
      '<td><span class="kind ' + (r.kind === 'need' ? 'need' : 'offer') + '">' +
        (r.kind === 'need' ? 'Wanted' : 'For sale') + '</span>' +
        '<br><span class="dim">' + esc(MARKETS[r.market] ? MARKETS[r.market].label : r.market) + '</span></td>' +
      '<td><b>' + esc(r.origin) + ' ' + esc(r.grade) + '</b><br><span class="dim">' +
        esc(r.process || '—') + (SUPPLY[r.supply] ? ' · ' + esc(SUPPLY[r.supply].short) : '') + '</span></td>' +
      '<td>' + esc(q.main || '—') + (q.alt ? '<br><span class="dim">' + esc(q.alt) + '</span>' : '') + '</td>' +
      '<td>' + priceCell + '</td>' +
      '<td><span class="tierdot ' + esc(r.tier) + '"></span>' +
        esc(TIERS[r.tier] ? TIERS[r.tier].short : r.tier) +
        (r.rating ? ' <span class="dim">' + r.rating + '/5</span>' : '') + '</td>' +
      '<td class="private">' + esc(who) +
        (r.poster_phone ? '<br><span class="dim">' + esc(r.poster_phone) + '</span>' : '') + '</td>' +
      '<td>' +
        (r.status === 'pending' ? '<span class="badge new">From the site</span>'
          : r.published ? '<span class="badge live">Live</span>' : '<span class="badge draft">Draft</span>') +
        (r.status !== 'live' ? '<br><span class="dim">' + esc(STATUSES[r.status] || r.status) + '</span>' : '') +
        (r.is_example ? '<br><span class="badge ex">Example</span>' : '') +
        (hints.length ? '<br><span class="badge warnb" title="' + esc(hints.map(h => h.text).join(', ')) +
          '">' + hints.length + ' contact detail' + (hints.length === 1 ? '' : 's') + ' in notes</span>' : '') +
      '</td>' +
      '<td class="right nowrap">' +
        '<a class="btn btn-ghost btn-sm" href="/admin/marketplace/edit?id=' + r.id + '">Edit</a> ' +
        '<form method="post" action="/admin/marketplace" style="display:inline">' +
          '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
          '<input type="hidden" name="do" value="toggle">' +
          '<input type="hidden" name="id" value="' + r.id + '">' +
          '<button class="btn btn-ghost btn-sm" type="submit">' +
            (r.published ? 'Unpublish' : 'Publish') + '</button>' +
        '</form>' +
      '</td></tr>';
  }).join('');

  const exampleWarning = c.examples ? (
    '<div class="flash bad" style="margin-top:1rem"><b>' + c.examples + ' example post' +
    (c.examples === 1 ? ' is' : 's are') + ' in here.</b> They are drafts, so nothing invented is on the ' +
    'public site. They exist so you can see how the board looks. Delete them once you have real lots.' +
    '<form method="post" action="/admin/marketplace" style="display:inline;margin-left:.6rem">' +
    '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
    '<input type="hidden" name="do" value="clear_examples">' +
    '<button class="btn btn-ghost btn-sm" type="submit">Delete all examples</button></form></div>') : '';

  const waiting = c.pending ? (
    '<div class="flash ok" style="margin-top:1rem"><b>' + c.pending + ' post' +
    (c.pending === 1 ? '' : 's') + ' came in from the site.</b> ' +
    'Nothing is on the public board until you publish it. Open one to check the details, ' +
    'set which board it belongs on, then publish. ' +
    '<a href="/admin/marketplace?show=pending">Show them</a></div>') : '';

  const table = rows.length
    ? '<div class="card" style="margin-top:1.1rem;overflow-x:auto;padding:.4rem .7rem">' +
      '<table><thead><tr><th>Ref</th><th>Side</th><th>Coffee</th><th>Quantity</th><th>Price</th>' +
      '<th>Standing</th><th class="private">Who posted it</th><th>State</th><th></th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>'
    : '<div class="card" style="margin-top:1.1rem;text-align:center;padding:2.6rem">' +
      '<p class="lede" style="margin:0 auto 1.1rem">Nothing here yet. Add the first post and it appears ' +
      'on the board the moment you publish it.</p>' +
      '<a class="btn btn-primary" href="/admin/marketplace/edit">Add a post</a></div>';

  return layout({
    title: 'Marketplace', user, active: 'board', flash,
    body:
      '<div class="head"><h1>Marketplace</h1><span class="sub">' +
        c.offers + ' for sale and ' + c.needs + ' wanted are live. ' +
        c.drafts + ' draft' + (c.drafts === 1 ? '' : 's') + '.</span></div>' +
      '<p class="lede">Everything on the public board, plus the one thing the board never shows: who posted it. ' +
      'A visitor sees a reference and a rating. You see the name and the phone number.</p>' +
      '<div class="pills">' +
        tab('', 'Everything') + (c.pending ? tab('pending', 'Waiting for you', c.pending) : '') +
        tab('offer', 'For sale', c.offers) + tab('need', 'Wanted', c.needs) +
        tab('draft', 'Drafts', c.drafts) + (c.examples ? tab('example', 'Examples', c.examples) : '') +
        '<a class="btn btn-primary btn-sm" href="/admin/marketplace/edit" style="margin-left:auto">Add a post</a>' +
      '</div>' + waiting + exampleWarning + table
  });
}

/* ---------------- create and edit ---------------- */
function editPage(user, flash, id) {
  const r = id ? db.prepare('SELECT * FROM listings WHERE id=?').get(id) : null;
  if (id && !r) return null;
  const v = r || {
    kind: 'offer', market: 'export', supply: '', origin: '', grade: '', process: '', quantity_val: '', quantity_unit: 'mt',
    price: '', price_unit: 'kg', currency: 'USD', harvest: '', notes: '',
    poster_name: '', poster_org: '', poster_phone: '', poster_email: '', poster_region: '',
    tier: 'unverified', rating: '', deals: 0, status: 'live', published: 0
  };
  const hints = r ? contactHints(r.notes) : [];

  const noteWarning = hints.length
    ? '<div class="flash bad" style="margin:.7rem 0 0"><b>Contact details in the notes.</b> ' +
      esc(hints.map(h => h.text).join(', ')) + ' — stripped from the public board automatically, ' +
      'but worth a word with the poster. Going around you is exactly what this prevents.</div>'
    : '';

  const deleteForm = r
    ? '<form method="post" action="/admin/marketplace" style="margin-top:1.7rem" ' +
      'onsubmit="return confirm(\'Delete ' + esc(r.ref) + '? This cannot be undone.\')">' +
      '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
      '<input type="hidden" name="do" value="delete">' +
      '<input type="hidden" name="id" value="' + r.id + '">' +
      '<button class="btn btn-ghost btn-sm" type="submit">Delete this post</button></form>'
    : '';

  return layout({
    title: r ? 'Edit ' + r.ref : 'Add a post', user, active: 'board', flash,
    body:
      '<div class="head"><h1>' + (r ? esc(r.ref) : 'Add a post') + '</h1><span class="sub">' +
        (r ? (r.published ? 'Live on the board' : 'A draft, not on the site')
           : 'It stays a draft until you publish it') + '</span></div>' +

      '<form method="post" action="/admin/marketplace">' +
      '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
      '<input type="hidden" name="do" value="save">' +
      (r ? '<input type="hidden" name="id" value="' + r.id + '">' : '') +

      '<div class="sec"><h2>The post <span class="n">what everyone sees</span></h2><div class="card">' +
        '<div class="row2">' +
          '<label><span class="lb">Which side</span><select name="kind">' +
            opts([['offer', 'Has coffee to sell'], ['need', 'Is looking for coffee']], v.kind) +
          '</select></label>' +
          '<label><span class="lb">Which board</span><select name="market">' + marketOpts(v.market) +
            '</select><span class="hint">Export standard, or the local and reject board.</span></label>' +
        '</div>' +
        '<div class="row2">' +
          '<label><span class="lb">Harvest</span><input type="text" name="harvest" value="' +
            esc(v.harvest) + '" placeholder="2025/26"></label>' +
          '<label><span class="lb">Where the coffee is</span><select name="supply">' + supplyOpts(v.supply) +
            '</select><span class="hint">Horizontal is already in Addis. Vertical is still at the farm or the supplier store. Leave unstated on a wanted post.</span></label>' +
        '</div>' +
        '<div class="row2">' +
          '<label><span class="lb">Origin</span><input type="text" name="origin" list="origins" value="' +
            esc(v.origin) + '" required><datalist id="origins">' +
            ORIGINS.map(o => '<option value="' + esc(o) + '">').join('') + '</datalist></label>' +
          '<label><span class="lb">Grade</span><select name="grade">' + opts(GRADES, v.grade, 'Not stated') +
            '</select><span class="hint">Ethiopian grades run 1 to 5.</span></label>' +
        '</div>' +
        '<div class="row2">' +
          '<label><span class="lb">Process</span><input type="text" name="process" list="processes" value="' +
            esc(v.process) + '" placeholder="Washed"><datalist id="processes">' +
            PROCESSES.map(p => '<option value="' + esc(p) + '">').join('') + '</datalist>' +
            '<span class="hint">However the supplier described it. Tidy it if you want.</span></label>' +
          '<label><span class="lb">Quantity</span>' +
            '<div class="two"><input type="text" name="quantity_val" value="' + esc(v.quantity_val) +
            '" placeholder="1000"><select name="quantity_unit">' + qtyUnitOpts(v.quantity_unit) + '</select></div>' +
            '<span class="hint">Optional. The board shows the kg equivalent itself.</span></label>' +
        '</div>' +
        '<div class="row2">' +
          '<label><span class="lb">Price</span>' +
            '<div class="three"><input type="text" name="price" value="' +
            esc(v.price == null ? '' : v.price) + '" placeholder="8500">' +
            '<select name="price_unit">' + priceUnitOpts(v.price_unit) + '</select>' +
            '<select name="currency">' + opts(CURRENCIES, v.currency) + '</select></div>' +
            '<span class="hint">Leave the figure empty to show “On request”. 1 Faresula = 17 kg, and the per-kg reading is shown beside it.</span></label>' +
          '<label><span class="lb">Notes</span><textarea name="notes" ' +
            'placeholder="Cup score, screen size, where it is stored.">' + esc(v.notes) + '</textarea>' +
            '<span class="hint">Phone numbers, emails and links are stripped from the public board.</span></label>' +
        '</div>' + noteWarning +
      '</div></div>' +

      '<div class="sec"><h2>Who posted it <span class="n">never leaves this screen</span></h2><div class="card">' +
        '<div class="row2">' +
          '<label><span class="lb">Name</span><input type="text" name="poster_name" value="' + esc(v.poster_name) + '"></label>' +
          '<label><span class="lb">Company or union</span><input type="text" name="poster_org" value="' + esc(v.poster_org) + '"></label>' +
        '</div><div class="row2">' +
          '<label><span class="lb">Phone</span><input type="text" name="poster_phone" value="' + esc(v.poster_phone) + '"></label>' +
          '<label><span class="lb">Email</span><input type="text" name="poster_email" value="' + esc(v.poster_email) + '"></label>' +
        '</div>' +
        '<label><span class="lb">Where they are</span><input type="text" name="poster_region" value="' +
          esc(v.poster_region) + '" placeholder="Gedeo, or Trieste"></label>' +
      '</div></div>' +

      '<div class="sec"><h2>Standing <span class="n">the badge on the post</span></h2><div class="card">' +
        '<div class="row2">' +
          '<label><span class="lb">Verification</span><select name="tier">' + tierOpts(v.tier) + '</select></label>' +
          '<label><span class="lb">Rating</span><select name="rating">' +
            opts([['', 'Not rated yet'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']],
                 v.rating == null ? '' : String(v.rating)) + '</select></label>' +
        '</div><div class="row2">' +
          '<label><span class="lb">Deals closed with us</span><input type="text" name="deals" value="' +
            esc(String(v.deals || 0)) + '"></label>' +
          '<label><span class="lb">State</span><select name="status">' +
            opts(Object.keys(STATUSES).map(k => [k, STATUSES[k]]), v.status) + '</select></label>' +
        '</div>' +
        '<label class="check"><input type="checkbox" name="published" value="1"' +
          (v.published ? ' checked' : '') + '><span>Show this on the public board</span></label>' +
      '</div></div>' +

      '<div class="sticky-save"><button class="btn btn-primary" type="submit">' +
        (r ? 'Save' : 'Create') + '</button> ' +
        '<a class="btn btn-ghost" href="/admin/marketplace">Cancel</a></div></form>' + deleteForm
  });
}

/* ---------------- writes ---------------- */
const FIELDS = ['kind', 'market', 'supply', 'origin', 'grade', 'process', 'quantity_val', 'quantity_unit',
                'price', 'price_unit', 'currency', 'harvest', 'notes',
                'poster_name', 'poster_org', 'poster_phone', 'poster_email', 'poster_region',
                'tier', 'status'];

function handlePost(f, user, ip) {
  const act = f.do;

  if (act === 'clear_examples') {
    const n = db.prepare('DELETE FROM listings WHERE is_example=1').run().changes;
    log(user, 'examples removed', n + ' post(s)', '', ip);
    return { to: '/admin/marketplace', kind: 'ok',
             msg: 'Removed ' + n + ' example post' + (n === 1 ? '' : 's') + '.' };
  }

  if (act === 'toggle') {
    const r = db.prepare('SELECT id, ref, published, status FROM listings WHERE id=?').get(f.id);
    if (!r) return { to: '/admin/marketplace', kind: 'bad', msg: 'That post no longer exists.' };
    const now = r.published ? 0 : 1;
    db.prepare("UPDATE listings SET published=?, is_example=0," +
      " status=CASE WHEN status='pending' AND ?=1 THEN 'live' ELSE status END," +
      ' updated_at=?, updated_by=? WHERE id=?')
      .run(now, now, nowIso(), user.id, r.id);
    log(user, now ? 'listing published' : 'listing unpublished', r.ref, '', ip);
    return { to: '/admin/marketplace', kind: 'ok',
             msg: now ? r.ref + ' is on the board now.' : r.ref + ' is off the board.' };
  }

  if (act === 'delete') {
    const r = db.prepare('SELECT id, ref FROM listings WHERE id=?').get(f.id);
    if (!r) return { to: '/admin/marketplace', kind: 'bad', msg: 'That post no longer exists.' };
    db.prepare('DELETE FROM listings WHERE id=?').run(r.id);
    log(user, 'listing deleted', r.ref, '', ip);
    return { to: '/admin/marketplace', kind: 'ok', msg: r.ref + ' deleted.' };
  }

  if (act === 'save') {
    const origin = String(f.origin || '').trim();
    if (!origin) {
      return { to: '/admin/marketplace/edit' + (f.id ? '?id=' + f.id : ''),
               kind: 'bad', msg: 'An origin is needed before this can be saved.' };
    }

    const v = {};
    FIELDS.forEach(k => { v[k] = String(f[k] == null ? '' : f[k]).trim(); });
    v.kind = v.kind === 'need' ? 'need' : 'offer';
    v.market = MARKETS[v.market] ? v.market : 'export';
    /* a wanted post has no warehouse, so it never carries one */
    v.supply = (v.kind === 'offer' && SUPPLY[v.supply]) ? v.supply : '';
    v.status = STATUSES[v.status] ? v.status : 'live';
    v.tier = TIERS[v.tier] ? v.tier : 'unverified';
    if (QTY_UNIT_KEYS.indexOf(v.quantity_unit) === -1) v.quantity_unit = 'mt';
    if (PRICE_UNIT_KEYS.indexOf(v.price_unit) === -1) v.price_unit = 'kg';
    const price = v.price === '' ? null : v.price;
    const rating = (f.rating === '' || f.rating == null)
      ? null : Math.max(1, Math.min(5, Number(f.rating) || 1));
    const deals = Math.max(0, Number(String(f.deals || '0').replace(/\D/g, '')) || 0);
    const published = f.published ? 1 : 0;
    const state = published ? ' and it is on the board' : ' as a draft';

    if (f.id) {
      const r = db.prepare('SELECT id, ref FROM listings WHERE id=?').get(f.id);
      if (!r) return { to: '/admin/marketplace', kind: 'bad', msg: 'That post no longer exists.' };
      db.prepare(
        'UPDATE listings SET kind=?, market=?, supply=?, origin=?, grade=?, process=?, quantity_val=?, quantity_unit=?,' +
        ' price=?, price_unit=?, currency=?, harvest=?, notes=?,' +
        ' poster_name=?, poster_org=?, poster_phone=?, poster_email=?, poster_region=?,' +
        ' tier=?, rating=?, deals=?, status=?, published=?, is_example=0, updated_at=?, updated_by=?' +
        ' WHERE id=?'
      ).run(v.kind, v.market, v.supply, origin, v.grade, v.process, v.quantity_val, v.quantity_unit,
            price, v.price_unit, v.currency || 'USD', v.harvest, v.notes,
            v.poster_name, v.poster_org, v.poster_phone, v.poster_email, v.poster_region,
            v.tier, rating, deals, v.status, published, nowIso(), user.id, r.id);
      log(user, 'listing edited', r.ref, published ? 'live' : 'draft', ip);
      return { to: '/admin/marketplace', kind: 'ok', msg: r.ref + ' saved' + state + '.' };
    }

    const ref = nextRef(v.kind);
    db.prepare(
      'INSERT INTO listings (ref, kind, market, supply, origin, grade, process, quantity_val, quantity_unit,' +
      ' price, price_unit, currency, harvest, notes,' +
      ' poster_name, poster_org, poster_phone, poster_email, poster_region,' +
      ' tier, rating, deals, status, published, is_example, sort, created_at, updated_by)' +
      ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)'
    ).run(ref, v.kind, v.market, v.supply, origin, v.grade, v.process, v.quantity_val, v.quantity_unit,
          price, v.price_unit, v.currency || 'USD', v.harvest, v.notes,
          v.poster_name, v.poster_org, v.poster_phone, v.poster_email, v.poster_region,
          v.tier, rating, deals, v.status, published, nowIso(), user.id);
    log(user, 'listing created', ref, published ? 'live' : 'draft', ip);
    return { to: '/admin/marketplace', kind: 'ok', msg: ref + ' created' + state + '.' };
  }

  return null;
}

module.exports = { boardPage, editPage, handlePost, STATUSES, ORIGINS };
