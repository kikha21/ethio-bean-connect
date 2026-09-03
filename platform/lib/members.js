'use strict';
/* ------------------------------------------------------------------
   Members: the suppliers and exporters who post.

   They share the users table with the admin, because signing in is the
   same act whoever does it, and `role` decides what happens next. What
   separates them is everything after: a member reaches /my and nothing
   else, an admin reaches /admin and nothing of a member's is hidden
   from them.

   Standing lives here rather than on each post. Somebody who has traded
   with us three times is Silver, and every lot they put up says so
   without anyone re-typing it.
   ------------------------------------------------------------------ */
const { db, nowIso, log, TIERS, RATINGS } = require('./db');
const auth = require('./auth');

const MAX = { name: 120, company: 160, email: 160, phone: 40, region: 80 };
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 160);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* one new account an hour from an address, so the join page cannot be
   used to fill the table */
const joins = new Map();
function joinAllowed(ip) {
  const now = Date.now();
  if (joins.size > 3000) for (const [k, v] of joins) if (now > v.resetAt) joins.delete(k);
  const row = joins.get(ip);
  if (!row || now > row.resetAt) { joins.set(ip, { n: 1, resetAt: now + 3600e3 }); return true; }
  if (row.n >= 3) return false;
  row.n++;
  return true;
}

function validate(f, forUpdate) {
  const e = {};
  const out = {
    name: clean(f.name, MAX.name),
    company: clean(f.company, MAX.company),
    email: clean(f.email, MAX.email).toLowerCase(),
    phone: clean(f.phone, MAX.phone),
    region: clean(f.region, MAX.region),
    side: (f.side === 'seller' || f.side === 'buyer' || f.side === 'both') ? f.side : ''
  };
  if (!out.name) e.name = 'This is needed.';
  if (!out.company) e.company = 'This is needed.';
  if (!out.email) e.email = 'This is needed.';
  else if (!EMAIL_RE.test(out.email)) e.email = 'That does not look like an email address.';
  if (!out.phone) e.phone = 'This is needed.';
  else if (out.phone.replace(/\D/g, '').length < 7) e.phone = 'That does not look like a phone number.';
  if (!out.side) e.side = 'Say which you are.';

  if (!forUpdate) {
    const problem = auth.passwordProblem(f.password);
    if (problem) e.password = problem;
    else if (f.password !== f.password2) e.password2 = 'The two passwords do not match.';
  }
  return { values: out, errors: e };
}

function emailTaken(email, exceptId) {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  return row && String(row.id) !== String(exceptId || '');
}

function join(f, ip) {
  if (!joinAllowed(ip || 'unknown')) {
    return { ok: false, message: 'That is several accounts from here already. Try again later.' };
  }
  const { values, errors } = validate(f, false);
  if (emailTaken(values.email)) errors.email = 'There is already an account with that address.';
  if (Object.keys(errors).length) return { ok: false, errors, values };

  const { hash, salt } = auth.hashPassword(f.password);
  const info = db.prepare(
    'INSERT INTO users (email, name, company, phone, region, side, password_hash, password_salt,' +
    " role, status, tier, deals, created_at) VALUES (?,?,?,?,?,?,?,?,'member','active','unverified',0,?)"
  ).run(values.email, values.name, values.company, values.phone, values.region, values.side,
        hash, salt, nowIso());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  log(null, 'member joined', values.company || values.name, values.side, ip);
  return { ok: true, user };
}

function update(id, f, ip) {
  const { values, errors } = validate(f, true);
  if (emailTaken(values.email, id)) errors.email = 'There is already an account with that address.';
  if (Object.keys(errors).length) return { ok: false, errors, values };
  db.prepare('UPDATE users SET name=?, company=?, email=?, phone=?, region=?, side=? WHERE id=?')
    .run(values.name, values.company, values.email, values.phone, values.region, values.side, id);
  return { ok: true };
}

const isMember = u => !!u && u.role === 'member';
const isAdmin  = u => !!u && u.role === 'super_admin';

/* what a member has put up, newest first */
function postsOf(id) {
  return db.prepare(
    'SELECT * FROM listings WHERE posted_by = ? ORDER BY CASE status WHEN \'pending\' THEN 0 ELSE 1 END, id DESC'
  ).all(id);
}

/* their standing, as it will appear on everything they post */
function standing(u) {
  return {
    tier: TIERS[u.tier] ? u.tier : 'unverified',
    tierLabel: (TIERS[u.tier] || TIERS.unverified).short,
    rating: u.rating,
    ratingLabel: RATINGS[u.rating] ? RATINGS[u.rating].label : null,
    deals: u.deals || 0
  };
}

/* the admin's list of everyone who has joined */
function all(filter) {
  const where = filter === 'seller' ? " AND side IN ('seller','both')"
              : filter === 'buyer'  ? " AND side IN ('buyer','both')"
              : filter === 'unverified' ? " AND tier='unverified'" : '';
  return db.prepare(
    "SELECT u.*, (SELECT COUNT(*) FROM listings WHERE posted_by=u.id) AS posts," +
    " (SELECT COUNT(*) FROM listings WHERE posted_by=u.id AND status='pending') AS waiting" +
    " FROM users u WHERE u.role='member'" + where + ' ORDER BY u.created_at DESC'
  ).all();
}

function setStanding(id, f, actor, ip) {
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role='member'").get(id);
  if (!u) return { ok: false };
  const tier = TIERS[f.tier] ? f.tier : 'unverified';
  const rating = (f.rating === '' || f.rating == null) ? null : (RATINGS[Number(f.rating)] ? Number(f.rating) : null);
  const deals = Math.max(0, Number(String(f.deals || '0').replace(/\D/g, '')) || 0);
  const status = f.status === 'suspended' ? 'suspended' : 'active';
  db.prepare('UPDATE users SET tier=?, rating=?, deals=?, status=? WHERE id=?')
    .run(tier, rating, deals, status, u.id);
  /* everything they have already posted inherits it, so the board never
     shows one person at two different standings */
  db.prepare('UPDATE listings SET tier=?, rating=?, deals=? WHERE posted_by=?')
    .run(tier, rating, deals, u.id);
  log(actor, 'member standing set', u.company || u.name, tier + (rating ? ' / ' + RATINGS[rating].label : ''), ip);
  return { ok: true };
}

module.exports = {
  join, update, validate, isMember, isAdmin, postsOf, standing, all, setStanding, emailTaken
};
