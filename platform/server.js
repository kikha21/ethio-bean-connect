'use strict';
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const { db, seed, log, nowIso, hasAdmin, seedExamples, PRICE_UNIT_KEYS, UNITS, GRADES, PROCESSES } = require('./lib/db');
const { ORIGINS } = require('./lib/admin-board');
const auth = require('./lib/auth');
const { render, invalidate, marketJson, SITE_DIR } = require('./lib/render');
const { layout, esc } = require('./lib/ui');
const board = require('./lib/admin-board');
const adminChat = require('./lib/admin-chat');
const adminMembers = require('./lib/admin-members');
const publicPost = require('./lib/public-post');
const chat = require('./lib/chat');
const members = require('./lib/members');
const reset = require('./lib/reset');
const invite = require('./lib/invite');
const photo = require('./lib/photo');
const mail = require('./lib/mail');
const memberPages = require('./lib/member-pages');
const push = require('./lib/push');

const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml',
  '.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon'
};

/* ---------------- helpers ---------------- */
const send = (res, code, type, body, extra = {}) => {
  res.writeHead(code, Object.assign({
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  }, extra));
  res.end(body);
};
const html = (res, code, body) => send(res, code, 'text/html; charset=utf-8', body);
const redirect = (res, to, extra = {}) => { res.writeHead(302, Object.assign({ Location: to }, extra)); res.end(); };

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const sessionCookie = (id, maxAgeDays) =>
  `ebc_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(maxAgeDays * 86400)}`;

function body(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => {
      const out = {};
      new URLSearchParams(data).forEach((v, k) => {
        if (k in out) { out[k] = [].concat(out[k], v); } else { out[k] = v; }
      });
      resolve(out);
    });
    req.on('error', reject);
  });
}
/* Who is actually calling.

   Straight to node, the socket is the caller and that is the end of it.
   Behind a proxy it is not: every request arrives from localhost, so all
   the limits in here would count the whole country as one visitor and shut
   the door on everybody at once.

   The forwarded header fixes that, but only if it cannot be forged. A
   visitor who can set their own address walks past every limit, so the
   header is read only when the connection really did come from the proxy
   on this machine, and only when we have been told a proxy is there. */
const TRUST_PROXY = process.env.EBC_TRUST_PROXY === '1';
const ipOf = req => {
  const direct = (req.socket.remoteAddress || '').replace('::ffff:', '');
  if (TRUST_PROXY && (direct === '127.0.0.1' || direct === '::1')) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd.replace('::ffff:', '');
  }
  return direct;
};

/* flash messages, carried in a short-lived cookie */
const flashCookie = (kind, text) =>
  `ebc_flash=${encodeURIComponent(kind + '|' + text)}; Path=/; Max-Age=20; SameSite=Lax`;
function takeFlash(req, res) {
  const raw = cookies(req).ebc_flash;
  if (!raw) return null;
  res.setHeader('Set-Cookie', 'ebc_flash=; Path=/; Max-Age=0');
  const i = raw.indexOf('|');
  return { kind: raw.slice(0, i), text: raw.slice(i + 1) };
}

/* ---------------- pages ---------------- */

function setupPage(err) {
  return layout({ title: 'Set up your account', body: `
  <div class="center"><div class="auth">
    <h1>Create your admin account</h1>
    <p class="sub">This runs once. Nobody can reach the admin until it is done, and this page stops working the moment an account exists.</p>
    ${err ? `<div class="flash bad">${esc(err)}</div>` : ''}
    <form method="post" action="/setup" class="card">
      <label><span class="lb">Your name</span><input type="text" name="name" required autocomplete="name"></label>
      <label><span class="lb">Email<span class="hint">This is what you sign in with.</span></span>
        <input type="email" name="email" required autocomplete="username"></label>
      <label><span class="lb">Password<span class="hint">At least 10 characters, with a letter and a number. Use something you do not use anywhere else.</span></span>
        <input type="password" name="password" required autocomplete="new-password" minlength="10"></label>
      <label><span class="lb">Password again</span>
        <input type="password" name="password2" required autocomplete="new-password"></label>
      <button class="btn btn-primary" type="submit">Create account</button>
    </form>
  </div></div>` });
}

function loginPage(err) {
  return layout({ title: 'Sign in', body: `
  <div class="center"><div class="auth">
    <h1>Ethio Bean Connect</h1>
    <p class="sub">Sign in to manage the site.</p>
    ${err ? `<div class="flash bad">${esc(err)}</div>` : ''}
    <form method="post" action="/admin/login" class="card">
      <label><span class="lb">Email</span><input type="email" name="email" required autocomplete="username"></label>
      <label><span class="lb">Password</span><input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
  </div></div>` });
}

function dashboard(user, flash) {
  /* single quotes: SQLite reads "" as an empty identifier, not an empty string */
  const priced = db.prepare("SELECT COUNT(*) n FROM market_prices WHERE price IS NOT NULL AND price <> ''").get().n;
  const total  = db.prepare('SELECT COUNT(*) n FROM market_prices').get().n;
  const strings = db.prepare('SELECT COUNT(*) n FROM content').get().n;
  const untranslated = db.prepare("SELECT COUNT(*) n FROM content WHERE value_am = ''").get().n;
  const pending = db.prepare("SELECT COUNT(*) n FROM listings WHERE status='pending'").get().n;
  const live = db.prepare("SELECT COUNT(*) n FROM listings WHERE published=1 AND status='live'").get().n;
  const recent = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 8').all();

  return layout({ title: 'Overview', user, active: 'home', flash, body: `
  <div class="head"><h1>Overview</h1><span class="sub">Signed in as ${esc(user.email)}</span></div>
  <p class="lede">Everything here changes the live site the moment you save it.</p>

  ${pending ? `<div class="flash ok"><b>${pending} post${pending === 1 ? '' : 's'} waiting for you.</b>
    Someone filled in the form on the site. Nothing is on the public board until you publish it.
    <a href="/admin/marketplace?show=pending">Open the queue</a></div>` : ''}

  <div class="cards c4">
    <div class="card stat"><b>On the board</b><span>${live}</span>
      <small>${pending ? pending + ' more waiting to be checked' : live === 0 ? 'nothing published yet' : 'lots and requirements, live now'}</small></div>
    <div class="card stat"><b>Market prices</b><span>${priced} / ${total}</span>
      <small>${priced === 0 ? 'Every row still shows “On request”' : 'rows with a published price'}</small></div>
    <div class="card stat"><b>Site text</b><span>${strings}</span>
      <small>editable strings, English and Amharic</small></div>
    <div class="card stat"><b>Awaiting Amharic</b><span>${untranslated}</span>
      <small>${untranslated === 0 ? 'all strings translated' : 'strings with no Amharic yet'}</small></div>
  </div>

  <div class="sec">
    <h2>Recent activity</h2>
    ${recent.length ? `<div class="card"><table class="log"><tbody>
      ${recent.map(r => `<tr><td>${esc(r.created_at.replace('T',' ').slice(0,16))}</td>
        <td>${esc(r.actor_name)}</td><td>${esc(r.action)}</td><td>${esc(r.subject)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card"><p class="lede" style="margin:0">Nothing yet.</p></div>'}
  </div>` });
}

function pricesPage(user, flash) {
  const rows = db.prepare('SELECT * FROM market_prices ORDER BY sort, id').all();
  const s = db.prepare("SELECT value FROM settings WHERE key='market_updated'").get();
  const cur = db.prepare("SELECT value FROM settings WHERE key='market_currency'").get();
  const pu = db.prepare("SELECT value FROM settings WHERE key='market_price_unit'").get();
  const puNow = pu ? pu.value : 'kg';
  return layout({ title: 'Market prices', user, active: 'prices', flash, body: `
  <div class="head"><h1>Market prices</h1></div>
  <p class="lede">Leave a price empty and that row shows “On request” on the site. The date below is what visitors see beside the table, so move it whenever you update the numbers.</p>
  <form method="post" action="/admin/prices">
    <input type="hidden" name="csrf" value="${esc(user.csrf)}">
    <div class="card">
      <div class="row2">
        <label><span class="lb">Prices last updated</span><input type="text" name="market_updated" value="${esc(s ? s.value : '')}" readonly>
          <span class="hint">Set for you whenever a price changes.</span></label>
        <label><span class="lb">Currency</span><input type="text" name="market_currency" value="${esc(cur ? cur.value : '')}"></label>
        <label><span class="lb">Prices are quoted per</span><select name="market_price_unit">${PRICE_UNIT_KEYS.map(k => `<option value="${k}"${puNow === k ? ' selected' : ''}>${esc(UNITS[k].label)}</option>`).join('')}</select>
          <span class="hint">1 Faresula = 17 kg. Whatever you pick is stated above the table.</span></label>
      </div>
      <table>
        <tr><th>Origin</th><th>Grade</th><th>Process</th><th>Price</th><th>Show</th><th>Changed</th><th></th></tr>
        ${rows.map(r => `<tr>
          <td>${esc(r.origin)}</td><td>${esc(r.grade)}</td><td>${esc(r.process)}</td>
          <td><input type="text" name="price_${r.id}" value="${esc(r.price || '')}" placeholder="On request" inputmode="decimal"></td>
          <td><input type="checkbox" name="pub_${r.id}" ${r.published ? 'checked' : ''}></td>
          <td class="dim mono">${r.updated_at ? esc(r.updated_at.replace('T', ' ').slice(0, 16)) : '—'}</td>
          <td class="right"><button class="btn btn-ghost btn-sm" type="submit" name="drop" value="${r.id}"
            onclick="return confirm('Remove ${esc(r.origin)} ${esc(r.grade)} ${esc(r.process)} from the table?')">Remove</button></td>
        </tr>`).join('')}
      </table>
      <div class="sticky-save"><button class="btn btn-primary" type="submit">Save prices</button></div>
    </div>
  </form>

  <div class="sec"><h2>Add a coffee <span class="n">a new line in the table</span></h2>
    <form method="post" action="/admin/prices" class="card">
      <input type="hidden" name="csrf" value="${esc(user.csrf)}">
      <input type="hidden" name="add" value="1">
      <div class="row2">
        <label><span class="lb">Origin</span><input type="text" name="new_origin" list="priceorigins" required placeholder="Yirgacheffe">
          <datalist id="priceorigins">${ORIGINS.map(o => `<option value="${esc(o)}">`).join('')}</datalist></label>
        <label><span class="lb">Grade</span><select name="new_grade">${
          GRADES.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select></label>
      </div>
      <div class="row2">
        <label><span class="lb">Process</span><input type="text" name="new_process" list="priceprocs" placeholder="Washed">
          <datalist id="priceprocs">${PROCESSES.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
        <label><span class="lb">Price <span class="hint" style="display:inline">optional</span></span>
          <input type="text" name="new_price" inputmode="decimal" placeholder="Leave empty for On request"></label>
      </div>
      <div class="sticky-save"><button class="btn btn-primary" type="submit">Add it</button></div>
    </form>
  </div>` });
}

function contentPage(user, flash, q) {
  const all = db.prepare('SELECT * FROM content ORDER BY section, key').all();
  const filtered = q
    ? all.filter(r => (r.key + ' ' + r.value_en + ' ' + r.value_am).toLowerCase().includes(q.toLowerCase()))
    : all;
  const bySection = {};
  filtered.forEach(r => { (bySection[r.section] = bySection[r.section] || []).push(r); });

  return layout({ title: 'Site text', user, active: 'content', flash, body: `
  <div class="head"><h1>Site text</h1><span class="sub">${filtered.length} of ${all.length} strings</span></div>
  <p class="lede">Every word on the public site. Edit either language and save. Leaving Amharic empty makes that string fall back to English on the site rather than showing a blank.</p>
  <form method="get" action="/admin/content" style="margin-bottom:1rem">
    <div class="row2"><label style="margin:0"><input type="text" name="q" value="${esc(q || '')}" placeholder="Search the text..."></label>
    <div><button class="btn btn-ghost" type="submit">Search</button>
    ${q ? ' <a class="btn btn-ghost" href="/admin/content">Clear</a>' : ''}</div></div>
  </form>
  <form method="post" action="/admin/content">
    <input type="hidden" name="csrf" value="${esc(user.csrf)}">
    <input type="hidden" name="q" value="${esc(q || '')}">
    ${Object.keys(bySection).map(sec => `
      <div class="sec"><h2>${esc(sec)} <span class="n">${bySection[sec].length}</span></h2>
      ${bySection[sec].map(r => `<div class="pair">
        <div class="k">${esc(r.key)}</div>
        <div class="fields">
          <div><span class="fl">ENGLISH</span>
            <textarea name="en_${esc(r.key)}" rows="2">${esc(r.value_en)}</textarea></div>
          <div><span class="fl">አማርኛ</span>
            <textarea name="am_${esc(r.key)}" rows="2">${esc(r.value_am)}</textarea></div>
        </div></div>`).join('')}
      </div>`).join('')}
    <div class="sticky-save"><button class="btn btn-primary" type="submit">Save all changes</button></div>
  </form>` });
}

function settingsPage(user, flash) {
  const rows = db.prepare('SELECT * FROM settings WHERE key LIKE ? OR key = ? OR key LIKE ? ORDER BY sort').all('contact_%','site_url','smtp_%');
  return layout({ title: 'Contact details', user, active: 'settings', flash, body: `
  <div class="head"><h1>Contact details</h1></div>
  <p class="lede">These drive five places at once: the chat button, both routes out of the enquiry form, the footer, and the data search engines read. Change one here and it changes everywhere.</p>
  <form method="post" action="/admin/settings">
    <input type="hidden" name="csrf" value="${esc(user.csrf)}">
    <div class="card">
      ${rows.map(r => `<label><span class="lb">${esc(r.label)}${r.hint ? `<span class="hint">${esc(r.hint)}</span>` : ''}</span>
        <input type="text" name="set_${esc(r.key)}" value="${esc(r.value)}"></label>`).join('')}
      <div class="sticky-save"><button class="btn btn-primary" type="submit">Save contact details</button></div>
    </div>
  </form>

  <div class="sec"><h2>Your password <span class="n">the one you sign in with</span></h2>
    <form method="post" action="/password" class="card">
      <input type="hidden" name="csrf" value="${esc(user.csrf)}">
      <div class="row2">
        <label><span class="lb">Your password now</span>
          <input type="password" name="current" required autocomplete="current-password"></label>
        <label><span class="lb">New password</span>
          <input type="password" name="password" required autocomplete="new-password">
          <span class="hint">At least 10 characters, with a letter and a number.</span></label>
      </div>
      <label><span class="lb">New password again</span>
        <input type="password" name="password2" required autocomplete="new-password"></label>
      <div class="sticky-save"><button class="btn btn-primary" type="submit">Change it</button>
        <span class="hint">Anywhere else you are signed in will be signed out.</span></div>
    </form>
  </div>` });
}

function activityPage(user, flash) {
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200').all();
  return layout({ title: 'Activity', user, active: 'activity', flash, body: `
  <div class="head"><h1>Activity</h1><span class="sub">last ${rows.length}</span></div>
  <p class="lede">Every change, who made it and when. This becomes far more useful once suppliers and exporters have accounts of their own.</p>
  <div class="card"><table class="log"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Detail</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.created_at.replace('T',' ').slice(0,16))}</td><td>${esc(r.actor_name)}</td>
    <td><span class="tag">${esc(r.action)}</span></td><td>${esc(r.subject)}</td><td>${esc(r.detail)}</td></tr>`).join('')
    || '<tr><td colspan="5">Nothing yet.</td></tr>'}
  </tbody></table></div>` });
}

/* ---------------- server ---------------- */


/* Someone with scripting switched off still has to be told what happened,
   and given a way back. */
function plainResult(out) {
  const ok = out.ok;
  const list = ok ? '' :
    '<ul>' + Object.keys(out.errors || {}).map(k =>
      '<li>' + esc(k) + ': ' + esc(out.errors[k]) + '</li>').join('') + '</ul>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'Posted' : 'Not posted'} · Ethio Bean Connect</title>
<style>
 body{margin:0;background:#F1F4F2;color:#15201A;font:1rem/1.6 system-ui,sans-serif;
      display:grid;place-items:center;min-height:100vh;padding:2rem}
 .c{width:min(520px,100%);background:#FBFCFB;border:1px solid #D2DAD5;border-radius:16px;padding:2rem}
 h1{font-size:1.4rem;margin:0 0 .6rem} p{color:#525C55;margin:0 0 1.2rem}
 a{display:inline-block;background:#C8A44A;color:#15201A;text-decoration:none;
   font-weight:600;border-radius:999px;padding:.6rem 1.3rem}
 ul{color:#A6412A;margin:0 0 1.2rem;padding-left:1.1rem}
 code{font-family:ui-monospace,monospace;background:#E5EAE7;border-radius:5px;padding:.1rem .35rem}
</style></head><body><div class="c">
${ok
  ? '<h1>Posted.</h1><p>Your reference is <code>' + esc(out.ref || '') + '</code>. ' +
    'We check every post before it goes on the board, and we will come back to you within a working day. ' +
    'Your name is never shown on the board.</p>'
  : '<h1>Not posted.</h1><p>' + esc(out.message || 'Some of it needs another look.') + '</p>' + list}
<a href="/#post">Back to the form</a>
</div></body></html>`;
}

let lastResetLink = null;
let lastInviteLink = null;

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'text/plain', 'bad request'); }
  const p = url.pathname;
  const jar = cookies(req);
  const user = auth.userForSession(jar.ebc_session);
  if (user) user.csrf = auth.csrfFor(jar.ebc_session);

  try {
    /* ---- first run ---- */
    if (p === '/setup') {
      if (hasAdmin()) return redirect(res, '/admin/login');
      if (req.method === 'GET') return html(res, 200, setupPage(null));
      const f = await body(req);
      if (f.password !== f.password2) return html(res, 200, setupPage('The two passwords do not match.'));
      try {
        const u = auth.createAdmin({ email: f.email, name: f.name, password: f.password });
        log(u, 'account created', u.email, 'first admin account', ipOf(req));
        const s = auth.startSession(u, ipOf(req));
        return redirect(res, '/admin', { 'Set-Cookie': sessionCookie(s.id, auth.SESSION_DAYS) });
      } catch (e) {
        return html(res, 200, setupPage(e.message));
      }
    }

    /* ---- auth ---- */
    if (p === '/admin/login') {
      if (!hasAdmin()) return redirect(res, '/setup');
      if (user) return redirect(res, '/admin');
      if (req.method === 'GET') return html(res, 200, loginPage(null));
      const f = await body(req);
      const u = auth.authenticate(f.email, f.password);
      if (!u) {
        log(null, 'sign in failed', String(f.email || '').slice(0, 60), '', ipOf(req));
        return html(res, 200, loginPage('Those details did not match. Try again.'));
      }
      const s = auth.startSession(u, ipOf(req));
      log(u, 'signed in', u.email, '', ipOf(req));
      return redirect(res, '/admin', { 'Set-Cookie': sessionCookie(s.id, auth.SESSION_DAYS) });
    }

    if (p === '/admin/logout' && req.method === 'POST') {
      if (user) {
        const f = await body(req);
        if (!auth.csrfOk(jar.ebc_session, f.csrf)) return send(res, 403, 'text/plain', 'bad token');
        log(user, 'signed out', user.email, '', ipOf(req));
      }
      auth.endSession(jar.ebc_session);
      return redirect(res, '/admin/login', { 'Set-Cookie': 'ebc_session=; Path=/; HttpOnly; Max-Age=0' });
    }

    /* ---- everything below needs a session ---- */
    if (p.startsWith('/admin')) {
      if (!hasAdmin()) return redirect(res, '/setup');
      if (!user) return redirect(res, '/admin/login');

      /* A helper is stopped here, at the address, not by leaving the link out
         of the menu. Hiding a page is decoration: the address is guessable and
         the form posts to it either way. Checked on GET and POST alike, before
         anything reads the body. */
      if (!members.mayReach(user, p)) {
        return redirect(res, '/admin', { 'Set-Cookie': flashCookie('bad',
          'That part is for the owner of this account. Ask them if you need it.') });
      }
      const flash = takeFlash(req, res);

      if (req.method === 'POST') {
        const f = await body(req);
        if (!auth.csrfOk(jar.ebc_session, f.csrf)) return send(res, 403, 'text/plain', 'bad token');

        if (p === '/admin/prices') {
          /* a new line in the table */
          if (f.add) {
            const origin = String(f.new_origin || '').trim();
            if (!origin) return redirect(res, '/admin/prices',
              { 'Set-Cookie': flashCookie('bad', 'An origin is needed.') });
            const grade = GRADES.indexOf(f.new_grade) === -1 ? '' : f.new_grade;
            const priceRaw = String(f.new_price || '').trim();
            const sortMax = db.prepare('SELECT COALESCE(MAX(sort), -1) m FROM market_prices').get().m;
            db.prepare('INSERT INTO market_prices (origin, grade, process, price, published, sort, updated_at, updated_by)' +
                       ' VALUES (?,?,?,?,1,?,?,?)')
              .run(origin, grade, String(f.new_process || '').trim(), priceRaw === '' ? null : priceRaw,
                   sortMax + 1, nowIso(), user.id);
            /* a new priced line is a price change like any other */
            if (priceRaw !== '') db.prepare("UPDATE settings SET value=?, updated_at=?, updated_by=? WHERE key='market_updated'")
              .run(nowIso().slice(0, 10), nowIso(), user.id);
            log(user, 'price row added', origin + ' ' + grade, '', ipOf(req));
            invalidate();
            return redirect(res, '/admin/prices',
              { 'Set-Cookie': flashCookie('ok', origin + ' ' + grade + ' added to the table.') });
          }
          /* removing one */
          if (f.drop) {
            const r = db.prepare('SELECT origin, grade FROM market_prices WHERE id=?').get(f.drop);
            if (r) {
              db.prepare('DELETE FROM market_prices WHERE id=?').run(f.drop);
              log(user, 'price row removed', r.origin + ' ' + r.grade, '', ipOf(req));
              invalidate();
              return redirect(res, '/admin/prices',
                { 'Set-Cookie': flashCookie('ok', r.origin + ' ' + r.grade + ' removed.') });
            }
          }
          const rows = db.prepare('SELECT id, price, published FROM market_prices').all();
          let changed = 0;
          const upd = db.prepare('UPDATE market_prices SET price=?, published=?, updated_at=?, updated_by=? WHERE id=?');
          rows.forEach(r => {
            const raw = (f['price_' + r.id] || '').trim();
            const val = raw === '' ? null : raw;
            const pub = f['pub_' + r.id] ? 1 : 0;
            if (val !== r.price || pub !== r.published) { upd.run(val, pub, nowIso(), user.id, r.id); changed++; }
          });
          if (changed) {
            /* the date beside the table is what tells a visitor these numbers
               are current, so it is stamped by the change rather than left to
               be remembered */
            db.prepare("UPDATE settings SET value=?, updated_at=?, updated_by=? WHERE key='market_updated'")
              .run(nowIso().slice(0, 10), nowIso(), user.id);
          }
          ['market_currency', 'market_price_unit'].forEach(k => {
            if (typeof f[k] === 'string')
              db.prepare('UPDATE settings SET value=?, updated_at=?, updated_by=? WHERE key=?').run(f[k].trim(), nowIso(), user.id, k);
          });
          log(user, 'prices updated', changed + ' row(s)', '', ipOf(req));
          invalidate();
          return redirect(res, '/admin/prices', { 'Set-Cookie': flashCookie('ok', `Saved. ${changed} row${changed === 1 ? '' : 's'} changed, and the site is already showing it.`) });
        }

        if (p === '/admin/content') {
          const rows = db.prepare('SELECT key, value_en, value_am FROM content').all();
          const upd = db.prepare('UPDATE content SET value_en=?, value_am=?, updated_at=?, updated_by=? WHERE key=?');
          let changed = 0;
          rows.forEach(r => {
            const en = f['en_' + r.key], am = f['am_' + r.key];
            if (en === undefined && am === undefined) return;
            const nEn = en === undefined ? r.value_en : String(en);
            const nAm = am === undefined ? r.value_am : String(am);
            if (nEn !== r.value_en || nAm !== r.value_am) { upd.run(nEn, nAm, nowIso(), user.id, r.key); changed++; }
          });
          log(user, 'text updated', changed + ' string(s)', '', ipOf(req));
          invalidate();
          const back = f.q ? '/admin/content?q=' + encodeURIComponent(f.q) : '/admin/content';
          return redirect(res, back, { 'Set-Cookie': flashCookie('ok', `Saved. ${changed} string${changed === 1 ? '' : 's'} changed.`) });
        }

        if (p === '/admin/settings') {
          const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ? OR key = ? OR key LIKE ?').all('contact_%','site_url','smtp_%');
          const upd = db.prepare('UPDATE settings SET value=?, updated_at=?, updated_by=? WHERE key=?');
          let changed = 0;
          rows.forEach(r => {
            const v = f['set_' + r.key];
            if (v !== undefined && String(v).trim() !== r.value) { upd.run(String(v).trim(), nowIso(), user.id, r.key); changed++; }
          });
          log(user, 'contact details updated', changed + ' field(s)', '', ipOf(req));
          invalidate();
          return redirect(res, '/admin/settings', { 'Set-Cookie': flashCookie('ok', 'Saved. The footer, chat button and form all updated.') });
        }
        if (p === '/admin/members') {
          /* Making somebody an admin, or taking it back. members.setRole refuses
             the two ways this locks everybody out - your own admin, and the last
             one standing - so this only has to carry the answer back. */
          if (f.do === 'invite') {
            const site = (db.prepare("SELECT value FROM settings WHERE key='site_url'").get() || {}).value ||
                         ('http://localhost:' + PORT);
            const made = invite.make(user, f.note, site, ipOf(req));
            lastInviteLink = { link: made.link, at: Date.now() };
            return redirect(res, '/admin/members');
          }
          if (f.do === 'uninvite') {
            const out = invite.cancel(f.id, user, ipOf(req));
            return redirect(res, '/admin/members',
              { 'Set-Cookie': flashCookie(out.ok ? 'ok' : 'bad', out.message) });
          }
          if (f.do === 'role') {
            const out = members.setRole(f.id, f.admin === '1', user, ipOf(req));
            return redirect(res, '/admin/members',
              { 'Set-Cookie': flashCookie(out.ok ? 'ok' : 'bad', out.message) });
          }

          if (f.do === 'reset') {
            const site = (db.prepare("SELECT value FROM settings WHERE key='site_url'").get() || {}).value ||
                         ('http://localhost:' + PORT);
            const made = reset.issue(f.id, user, ipOf(req), site);
            if (!made.ok) return redirect(res, '/admin/members',
              { 'Set-Cookie': flashCookie('bad', 'That member no longer exists.') });
            /* the link is long, so it goes in the page rather than a cookie */
            lastResetLink = { who: made.user.company || made.user.name, link: made.link, at: Date.now() };
            return redirect(res, '/admin/members');
          }
          const out = members.setStanding(f.id, f, user, ipOf(req));
          invalidate();
          return redirect(res, '/admin/members' + (f.show ? '?show=' + encodeURIComponent(f.show) : ''),
            { 'Set-Cookie': flashCookie(out.ok ? 'ok' : 'bad',
              out.ok ? 'Saved, and written onto everything they have posted.' : 'That member no longer exists.') });
        }

        if (p === '/admin/chat') {
          const id = f.id;
          let msg = 'Sent.';
          if (f.do === 'reply') {
            const out = chat.reply(id, f.body, user, ipOf(req));
            if (!out.ok) return redirect(res, '/admin/chat', { 'Set-Cookie': flashCookie('bad', out.message) });
            /* not awaited: the push service is somebody else's server and
               the person clicking Send should not wait for it */
            push.sendTo('convo:' + id, 'Ethio Bean Connect',
                        String(f.body).slice(0, 140), '/#chat').catch(() => {});
          } else if (f.do === 'close') { chat.setStatus(id, 'closed', user, ipOf(req)); msg = 'Marked done.'; }
          else if (f.do === 'open')  { chat.setStatus(id, 'open', user, ipOf(req)); msg = 'Opened again.'; }
          else if (f.do === 'archive') {
            /* archived, not deleted: a conversation is the record of a deal
               being made or lost, and it stays in the history */
            chat.archive(id, user, ipOf(req));
            return redirect(res, '/admin/chat',
              { 'Set-Cookie': flashCookie('ok', 'Moved to the history. Nothing was deleted.') });
          }
          else if (f.do === 'restore') { chat.restore(id, user, ipOf(req)); msg = 'Back in the inbox.'; }
          return redirect(res, '/admin/chat?id=' + encodeURIComponent(id),
                          { 'Set-Cookie': flashCookie('ok', msg) });
        }

        if (p === '/admin/marketplace') {
          const out = board.handlePost(f, user, ipOf(req));
          if (!out) return send(res, 400, 'text/plain', 'unknown action');
          invalidate();
          return redirect(res, out.to, { 'Set-Cookie': flashCookie(out.kind, out.msg) });
        }

        return send(res, 404, 'text/plain', 'not found');
      }

      if (p === '/admin')          return html(res, 200, dashboard(user, flash));
      if (p === '/admin/prices')   return html(res, 200, pricesPage(user, flash));
      if (p === '/admin/content')  return html(res, 200, contentPage(user, flash, url.searchParams.get('q')));
      if (p === '/admin/settings') return html(res, 200, settingsPage(user, flash));
      if (p === '/admin/activity') return html(res, 200, activityPage(user, flash));
      if (p === '/admin/chat/poll') {
        /* what changed since the browser last looked: the number waiting,
           and any new messages in the thread that is open */
        const cid = url.searchParams.get('id');
        const since = Number(url.searchParams.get('since') || 0);
        const out = { waiting: chat.waiting(), messages: [] };
        if (cid) {
          const c = chat.conversation(cid);
          if (c) {
            out.messages = c.messages.filter(m => m.id > since)
              .map(m => ({ id: m.id, side: m.side, body: m.body, created_at: m.created_at }));
            /* looking at it is what marks it read */
            if (out.messages.length) chat.openConversation(cid);
          }
        }
        return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(out));
      }
      if (p === '/admin/members') {
        /* shown once, to whoever asked for it, and only for a few minutes */
        const link = (lastResetLink && Date.now() - lastResetLink.at < 300e3) ? lastResetLink : null;
        lastResetLink = null;
        /* the link is long, so it goes in the page rather than a cookie, and
           it is shown once then forgotten */
        const inviteLink = (lastInviteLink && Date.now() - lastInviteLink.at < 300e3) ? lastInviteLink.link : null;
        lastInviteLink = null;
        return html(res, 200, adminMembers.page(user, flash, url.searchParams.get('show') || '', link, invite.outstanding(), inviteLink));
      }
      if (p === '/admin/chat')
        return html(res, 200, adminChat.page(user, flash, url.searchParams.get('id'),
                    url.searchParams.get('show') || '', url.searchParams.get('q') || ''));
      if (p === '/admin/marketplace')
        return html(res, 200, board.boardPage(user, flash, url.searchParams.get('show') || ''));
      if (p === '/admin/marketplace/edit') {
        const page = board.editPage(user, flash, url.searchParams.get('id'));
        if (!page) return redirect(res, '/admin/marketplace',
          { 'Set-Cookie': flashCookie('bad', 'That post no longer exists.') });
        return html(res, 200, page);
      }
      return send(res, 404, 'text/plain', 'not found');
    }

    /* ---- the service worker, and push subscriptions ---- */
    if (p === '/sw.js') {
      const sw = path.join(SITE_DIR, 'sw.js');
      if (fs.existsSync(sw)) {
        return send(res, 200, 'application/javascript; charset=utf-8', fs.readFileSync(sw),
                    { 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-cache' });
      }
      return send(res, 404, 'text/plain', 'not found');
    }
    if (p === '/push/key') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ key: push.publicKey() }));
    }
    if (p === '/push/subscribe' && req.method === 'POST') {
      const f = await body(req, 8e3);
      let sub = null;
      try { sub = JSON.parse(f.sub || 'null'); } catch (e) {}
      /* a visitor may only attach a subscription to their own conversation,
         which is what holding the token proves */
      let owner = null;
      if (f.token) {
        const c = chat.byToken(f.token);
        if (c) owner = 'convo:' + c.id;
      } else {
        const who = auth.userForSession(cookies(req).ebc_session);
        if (who) owner = 'user:' + who.id;
      }
      if (!owner || !sub) return send(res, 400, 'application/json', JSON.stringify({ ok: false }));
      const out = push.subscribe(owner, sub);
      return send(res, out.ok ? 200 : 400, 'application/json', JSON.stringify(out));
    }
    if (p === '/push/unsubscribe' && req.method === 'POST') {
      const f = await body(req, 8e3);
      push.unsubscribe(f.endpoint);
      return send(res, 200, 'application/json', JSON.stringify({ ok: true }));
    }

    /* who is reading, so the form can ask for the coffee and not for the
       four things the account already knows */
    if (p === '/me') {
      /* Who is reading is not a cacheable fact. With no header a browser is
         free to keep this, and it does: a visitor who arrives signed out gets
         {in:false} stored, signs in, comes back to the page and is told they
         have no account - because the page never asks again. The whole gate
         hangs off this answer, so it must be the current one. */
      const who = auth.userForSession(cookies(req).ebc_session);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(
        who ? { in: true, admin: members.isAdmin(who), name: who.name,
                company: who.company, side: who.side }
            : { in: false }), { 'Cache-Control': 'no-store, private' });
    }

    /* ---- suppliers and exporters: their own way in ---- */
    if (p === '/join') {
      const who = auth.userForSession(cookies(req).ebc_session);
      if (who) return redirect(res, members.isAdmin(who) ? '/admin' : '/my');
      if (req.method === 'GET') return html(res, 200, memberPages.joinPage(null, null, null));
      const f = await body(req);
      const out = members.join(f, ipOf(req));
      if (!out.ok) {
        return html(res, out.message ? 429 : 400,
          memberPages.joinPage(f, out.errors, out.message));
      }
      const sess = auth.startSession(out.user, ipOf(req));
      return redirect(res, '/my', { 'Set-Cookie': sessionCookie(sess.id, auth.SESSION_DAYS) });
    }

    if (p === '/signin') {
      const who = auth.userForSession(cookies(req).ebc_session);
      if (who) return redirect(res, members.isAdmin(who) ? '/admin' : '/my');
      if (req.method === 'GET') return html(res, 200, memberPages.signinPage(null, ''));
      const f = await body(req);
      const u = auth.authenticate(f.email, f.password);
      if (!u) {
        log(null, 'sign in failed', String(f.email || '').slice(0, 80), 'member', ipOf(req));
        return html(res, 401, memberPages.signinPage('That email and password did not match.', f.email));
      }
      log(u, 'signed in', u.email, u.role, ipOf(req));
      const sess = auth.startSession(u, ipOf(req));
      return redirect(res, members.isAdmin(u) ? '/admin' : '/my',
        { 'Set-Cookie': sessionCookie(sess.id, auth.SESSION_DAYS) });
    }

    if (p === '/forgot') {
      if (req.method === 'GET') return html(res, 200, memberPages.forgotPage(false, ''));
      const f = await body(req);
      const site = (db.prepare("SELECT value FROM settings WHERE key='site_url'").get() || {}).value ||
                   ('http://localhost:' + PORT);
      const out = await reset.request(f.email, ipOf(req), site);
      /* the same page either way: whether an address has an account here is
         not something a form should be willing to tell a stranger */
      if (out.adminLink) invalidate();
      return html(res, 200, memberPages.forgotPage(true, ''));
    }

    /* An invitation to help run the board. Opening it only shows the page;
       accepting is the POST behind the button, so a link preview cannot
       spend somebody's invitation before they have read it. */
    if (p === '/invite') {
      const who = auth.userForSession(cookies(req).ebc_session);
      if (req.method !== 'POST') {
        const token = String(url.searchParams.get('t') || '');
        if (!invite.check(token)) return html(res, 200, memberPages.invitePage("dead"));
        if (!who) return html(res, 200, memberPages.invitePage("needAccount"));
        return html(res, 200, memberPages.invitePage("ready", who, token));
      }
      const f = await body(req);
      const out = invite.accept(f.t, who, ipOf(req));
      if (out.needAccount) return html(res, 200, memberPages.invitePage("needAccount"));
      if (!out.ok) return html(res, 200, memberPages.invitePage("dead"));
      return redirect(res, '/signin', { 'Set-Cookie': flashCookie('ok',
        'You can help run the board now. Sign in again to begin.') });
    }

    if (p === '/reset') {
      const token = req.method === 'GET' ? (url.searchParams.get('t') || '') : null;
      if (req.method === 'GET') {
        return html(res, 200, reset.check(token)
          ? memberPages.resetPage(token, null, false)
          : memberPages.resetPage('', null, true));
      }
      const f = await body(req);
      const out = reset.complete(f.t, f.password, f.password2, ipOf(req));
      if (!out.ok && out.errors) return html(res, 400, memberPages.resetPage(f.t, out.errors, false));
      if (!out.ok) return html(res, 400, memberPages.resetPage('', null, true));
      const sess = auth.startSession(out.user, ipOf(req));
      return redirect(res, members.isAdmin(out.user) ? '/admin' : '/my',
        { 'Set-Cookie': sessionCookie(sess.id, auth.SESSION_DAYS) });
    }

    /* A member editing their own details. The account is the one source
       for who they are, so this is also what keeps the phone number on an
       old lot from going stale. */
    if (p === '/profile' && req.method === 'POST') {
      const who = auth.userForSession(cookies(req).ebc_session);
      if (!who) return redirect(res, '/signin');
      if (members.isAdmin(who)) return redirect(res, '/admin');
      const f = await body(req);
      const out = members.update(who.id, f, ipOf(req));
      if (!out.ok) {
        return html(res, 400, memberPages.myPage(who, null, null,
                                                 { errors: out.errors, values: out.values }));
      }
      return redirect(res, '/my', { 'Set-Cookie': flashCookie('ok', 'Your details are saved.') });
    }

    if (p === '/password' && req.method === 'POST') {
      const jar = cookies(req);
      const who = auth.userForSession(jar.ebc_session);
      if (!who) return redirect(res, '/signin');
      const f = await body(req);
      const out = reset.change(who, f.current, f.password, f.password2, jar.ebc_session, ipOf(req));
      if (!out.ok) {
        return members.isAdmin(who)
          ? redirect(res, '/admin/settings', { 'Set-Cookie': flashCookie('bad',
              out.errors.current || out.errors.password || out.errors.password2) })
          : html(res, 400, memberPages.myPage(who, null, out.errors));
      }
      return members.isAdmin(who)
        ? redirect(res, '/admin/settings', { 'Set-Cookie': flashCookie('ok', 'Password changed. Anywhere else you were signed in has been signed out.') })
        : redirect(res, '/my', { 'Set-Cookie': flashCookie('ok', 'Password changed. Anywhere else you were signed in has been signed out.') });
    }

    if (p === '/signout' && req.method === 'POST') {
      const jar = cookies(req);
      auth.endSession(jar.ebc_session);
      return redirect(res, '/', { 'Set-Cookie': sessionCookie('', 0) });
    }

    if (p === '/my') {
      const who = auth.userForSession(cookies(req).ebc_session);
      if (!who) return redirect(res, '/signin');
      if (members.isAdmin(who)) return redirect(res, '/admin');
      const flash = takeFlash(req, res);
      return html(res, 200, memberPages.myPage(who, flash ? flash.text : null));
    }

    /* ---- chat, on the website ---- */
    if (p.indexOf('/chat/') === 0 && req.method === 'POST') {
      const f = await body(req, 8e3);
      const json = (code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

      if (p === '/chat/start') {
        const out = chat.start(f, ipOf(req));
        return json(out.ok ? 200 : 429, out);
      }
      if (p === '/chat/send') {
        const out = chat.send(f, ipOf(req));
        return json(out.ok ? 200 : 400, out);
      }
      if (p === '/chat/poll') {
        const out = chat.thread(f.token, f.since);
        if (out.ok && !f.since) chat.markSeen(f.token);
        if (out.ok && f.since) chat.markSeen(f.token);
        return json(200, out);
      }
      return json(404, { ok: false });
    }

    /* ---- posting, straight into the board ---- */
    if (p === '/post' && req.method === 'POST') {
      /* posting is for members now: it is what lets us come back to them
         about a lot, and what keeps a standing attached to a person */
      const who = auth.userForSession(cookies(req).ebc_session);
      if (!who || members.isAdmin(who)) {
        const wantsJson = String(req.headers.accept || '').indexOf('application/json') !== -1;
        if (wantsJson) return send(res, 401, 'application/json; charset=utf-8',
          JSON.stringify({ ok: false, needsAccount: true,
            message: 'Sign in to post. It takes a minute to create an account.' }));
        return redirect(res, '/signin');
      }
      /* 32 kB was right when a post was words. A local-market lot can now
         carry a photograph, and a picture the browser has already shrunk to
         900 kB becomes about 1.4 MB once it is base64 and then percent
         encoded. This is raised only here: every other route keeps the small
         limit, because nothing else has a reason to send more.
      
         Too large is answered plainly rather than as a server error. Somebody
         whose photograph was slightly over should be told to try a smaller
         one, not shown a page saying something went wrong. */
      let f;
      try {
        f = await body(req, 2e6);
      } catch (e) {
        const wantsJson = String(req.headers.accept || '').indexOf('application/json') !== -1;
        const msg = 'That was too big to send. If you attached a picture, try a smaller one.';
        return wantsJson
          ? send(res, 413, 'application/json; charset=utf-8', JSON.stringify({ ok: false, message: msg }))
          : send(res, 413, 'text/plain; charset=utf-8', msg);
      }
      const out = publicPost.submit(f, ipOf(req), who);
      const wantsJson = String(req.headers.accept || '').indexOf('application/json') !== -1;
      if (out.ok) invalidate();
      if (wantsJson) {
        return send(res, out.ok ? 200 : (out.rateLimited ? 429 : 400),
                    'application/json; charset=utf-8', JSON.stringify(out));
      }
      /* no scripting: a real page, so the post is never silently lost */
      return html(res, out.ok ? 200 : 400, plainResult(out));
    }
    if (p === '/post' && req.method === 'GET') return redirect(res, '/#post');

    /* ---- the public site ---- */
    /* The host polls this to decide whether the instance is healthy and
       whether a new deploy may replace the old one. It has to be cheap and
       it has to touch the database, because a process that is running but
       cannot read its own data is not actually up. */
    /* Sample photographs. Served out of the data folder, never from
       anywhere the site itself is served from, so an uploaded file cannot
       end up sitting beside the code and be reached as though it were
       part of it.

       The content type is decided by reading the bytes, not by trusting
       the name, and nosniff is already on every response. Between them, a
       file that somehow talked its way past the checks still cannot be
       run as a script by a browser, and the sandbox header makes sure of
       it a third time. Cached hard, because the name is random and the
       bytes behind a given name never change. */
    if (p.indexOf('/uploads/') === 0) {
      const got = photo.read(p.slice(9));
      if (!got) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
      return send(res, 200, got.type, got.buf, {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox"
      });
    }

    if (p === '/healthz') {
      const T = 'application/json; charset=utf-8';
      try {
        require('./lib/db').db.prepare('SELECT 1').get();
        return send(res, 200, T, JSON.stringify({ ok: true }));
      } catch (e) {
        return send(res, 503, T, JSON.stringify({ ok: false }));
      }
    }

    if (p === '/' || p === '/index.html') {
      return send(res, 200, 'text/html; charset=utf-8', render(), { 'Cache-Control': 'no-cache' });
    }
    if (p === '/assets/market.json') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(marketJson()), { 'Cache-Control': 'no-cache' });
    }
    if (p.startsWith('/assets/')) {
      const file = path.join(SITE_DIR, path.normalize(decodeURIComponent(p)).replace(/^[\\/]+/, ''));
      if (!file.startsWith(SITE_DIR)) return send(res, 403, 'text/plain', 'no');
      return fs.readFile(file, (err, buf) => {
        if (err) return send(res, 404, 'text/plain', 'not found');
        send(res, 200, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', buf,
             { 'Cache-Control': 'public, max-age=3600' });
      });
    }
    return send(res, 404, 'text/plain', 'not found');

  } catch (e) {
    console.error('request failed:', e);
    return send(res, 500, 'text/plain', 'something went wrong');
  }
});

const s = seed();
seedExamples();
if (s.seeded) console.log(`  seeded ${s.strings} strings from the built site`);
auth.purgeExpired();

server.listen(PORT, () => {
  console.log('');
  console.log('  Ethio Bean Connect');
  console.log('  ------------------');
  console.log(`  public site   http://localhost:${PORT}/`);
  console.log(`  admin         http://localhost:${PORT}/admin`);
  if (!hasAdmin()) console.log(`  FIRST RUN     http://localhost:${PORT}/setup   <- create your account here`);
  console.log('');
});
