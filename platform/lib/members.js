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

/* One address is not one person here. Ethiopian mobile carriers put very
   large numbers of people behind a single address, so a whole town of
   suppliers can arrive looking like one caller. A tight per-address limit
   turns real customers away and stops almost no abuse, because the real
   guard is elsewhere: nothing a stranger posts reaches the board until it
   has been checked, an email may only be used once, and an account can be
   suspended. These numbers exist to stop a runaway script, nothing more. */
const JOINS_PER_HOUR = 40;
const joins = new Map();
function joinAllowed(ip) {
  const now = Date.now();
  if (joins.size > 5000) for (const [k, v] of joins) if (now > v.resetAt) joins.delete(k);
  const row = joins.get(ip);
  if (!row || now > row.resetAt) { joins.set(ip, { n: 1, resetAt: now + 3600e3 }); return true; }
  if (row.n >= JOINS_PER_HOUR) return false;
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
    const problem = auth.passwordProblem(f.password, 'member');
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
    return { ok: false, message: 'A lot of accounts have been made from this connection in the last hour. Wait a few minutes and try again, or message us on the chat and we will make it for you.' };
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
  /* Every lot keeps its own copy of who posted it, taken at the time. That
     copy is what we ring when a buyer asks about it, so leaving it behind
     means a changed number is changed everywhere except the one place it
     matters. Standing already works this way; contact details have to as
     well, or the board and the account slowly tell different stories. */
  db.prepare('UPDATE listings SET poster_name=?, poster_org=?, poster_email=?,' +
             ' poster_phone=?, poster_region=? WHERE posted_by=?')
    .run(values.name, values.company, values.email, values.phone, values.region, id);
  log(null, 'member edited their details', values.company || values.name, '', ip);
  return { ok: true };
}

const isMember = u => !!u && u.role === 'member';
/* Two kinds of admin.

   The owner is the account that set this up: they hold the member list,
   the words on the site, the contact details and the power to appoint.

   A helper runs the board day to day - the chat, the lots, the prices.
   That is the work there is a lot of, and it is the work that does not
   need somebody's phone number or the ability to lock the owner out.

   isAdmin answers "may they into the admin at all". isOwner answers "may
   they do the things that cannot be undone by the person they were done
   to". Anything dangerous asks the second one. */
const isOwner  = u => !!u && u.role === 'super_admin';
const isHelper = u => !!u && u.role === 'helper';
const isAdmin  = u => isOwner(u) || isHelper(u);

/* what a helper may not reach, by address */
const OWNER_ONLY = ['/admin/members', '/admin/content', '/admin/settings', '/admin/activity'];
const mayReach = (u, path) =>
  isOwner(u) || (isHelper(u) && !OWNER_ONLY.some(p => path === p || path.indexOf(p + '/') === 0));

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
    " FROM users u WHERE u.role IN ('member','helper','super_admin')" + where + ' ORDER BY u.created_at DESC'
  ).all();
}

function setStanding(id, f, actor, ip) {
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role IN ('member','helper')").get(id);
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

/* Handing over the keys.

   An admin is not a senior member: they see every member's phone number
   and email, can edit or remove any lot, change what the site says, and
   make other admins. There is no smaller version of it here, so this is
   all or nothing and worth being deliberate about.

   Two things are refused rather than trusted to care. Nobody can take
   their own admin away, because the usual way to lose a site is to do
   that and then find nobody else can let you back in. And the last admin
   cannot be demoted by anyone, for the same reason from the other side. */
function setRole(id, makeAdmin, actor, ip) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return { ok: false, message: 'That account no longer exists.' };

  if (String(u.id) === String(actor.id) && !makeAdmin) {
    return { ok: false, message: 'You cannot remove your own admin. Ask the other admin to do it.' };
  }
  /* taking help away from a helper cannot strand anybody: the owner is
     still there by definition, and an owner is not demoted by this at all. */
  if (!makeAdmin && u.role === 'super_admin') {
    return { ok: false, message: 'That is the owner of this account, not a helper.' };
  }

  /* helper, never super_admin. The owner role is not handed out by a
     button: it is the account that set this up, and there is no screen
     that should be able to create a second one by accident. */
  const role = makeAdmin ? 'helper' : 'member';
  if (u.role === role) return { ok: true, message: 'Nothing to change.' };

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
  /* every session they hold is ended, so the new powers begin at a fresh
     sign-in rather than halfway through a page they already had open */
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  log(actor, makeAdmin ? 'made a helper' : 'helper removed', u.company || u.name, u.email, ip);
  return { ok: true, message: makeAdmin
    ? (u.company || u.name) + ' can help run the board now. They must sign in again.'
    : (u.company || u.name) + ' is a member again. They must sign in again.' };
}

module.exports = {
  join, update, validate, isMember, isAdmin, postsOf, standing, all, setStanding, emailTaken, setRole, isOwner, isHelper, mayReach, OWNER_ONLY
};
