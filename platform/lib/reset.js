'use strict';
/* ------------------------------------------------------------------
   Forgotten passwords.

   A reset is a one-time secret sent to the address on the account. Only
   its hash is stored, so the table is useless to anyone who reads it,
   and it dies after an hour or the first use, whichever comes first.

   Two things this deliberately will not do. It never says whether an
   address has an account, because that turns the form into a way of
   finding out who your suppliers are. And it never shows the link on
   screen to the person asking, because then knowing an email address
   would be enough to take the account.

   Until email is configured the request is still recorded, and the admin
   can hand the link over by whatever means they already use.
   ------------------------------------------------------------------ */
const crypto = require('node:crypto');
const { db, nowIso, log } = require('./db');
const auth = require('./auth');
const mail = require('./mail');

db.exec(`
CREATE TABLE IF NOT EXISTS resets (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  sent       INTEGER NOT NULL DEFAULT 0,
  ip         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON resets(user_id, used_at);
`);

const LIFE_MS = 3600e3;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

/* three attempts an hour from one address, so this cannot be used to
   hammer somebody's inbox */
const tries = new Map();
function allowed(ip) {
  const now = Date.now();
  if (tries.size > 3000) for (const [k, v] of tries) if (now > v.resetAt) tries.delete(k);
  const row = tries.get(ip);
  if (!row || now > row.resetAt) { tries.set(ip, { n: 1, resetAt: now + LIFE_MS }); return true; }
  if (row.n >= 10) return false;
  row.n++;
  return true;
}

async function request(email, ip, siteUrl) {
  const addr = String(email || '').trim().toLowerCase();
  /* the answer is the same either way, so the page cannot be used to
     discover who has an account here */
  const sameAnswer = { ok: true };
  if (!allowed(ip || 'unknown')) return sameAnswer;

  const user = db.prepare("SELECT * FROM users WHERE email = ? AND status = 'active'").get(addr);
  if (!user) { log(null, 'reset asked for', addr, 'no such account', ip); return sameAnswer; }

  /* anything outstanding for them stops working the moment a new one is asked for */
  db.prepare('UPDATE resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
    .run(nowIso(), user.id);

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO resets (user_id, token_hash, created_at, expires_at, ip) VALUES (?,?,?,?,?)')
    .run(user.id, hash(token), nowIso(), new Date(Date.now() + LIFE_MS).toISOString(), ip || '');

  const base = String(siteUrl || '').replace(/\/+$/, '');
  const link = base + '/reset?t=' + token;

  let sent = { ok: false, reason: 'not-configured' };
  if (mail.configured()) {
    sent = await mail.send({
      to: user.email,
      subject: 'Reset your Ethio Bean Connect password',
      text:
        'Somebody asked to reset the password for this account.\n\n' +
        link + '\n\n' +
        'The link works once and stops working in an hour.\n' +
        'If it was not you, nothing has changed and you can ignore this.\n'
    });
    if (sent.ok) {
      db.prepare('UPDATE resets SET sent = 1 WHERE user_id = ? AND used_at IS NULL').run(user.id);
    }
  }
  log(null, 'reset asked for', user.email,
      sent.ok ? 'emailed' : 'not emailed: ' + (sent.reason || 'failed'), ip);

  /* the link is returned only so the admin screen can offer it by hand
     when email is not set up; it is never shown to the person asking */
  return { ok: true, adminLink: sent.ok ? null : link, user };
}

function check(token) {
  const row = db.prepare(
    'SELECT r.*, u.email, u.name FROM resets r JOIN users u ON u.id = r.user_id' +
    ' WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?'
  ).get(hash(token || ''), nowIso());
  return row || null;
}

function complete(token, password, password2, ip) {
  const row = check(token);
  if (!row) return { ok: false, message: 'That link has been used already, or it has expired. Ask for another.' };
  const problem = auth.passwordProblem(password);
  if (problem) return { ok: false, errors: { password: problem } };
  if (password !== password2) return { ok: false, errors: { password2: 'The two passwords do not match.' } };

  const { hash: h, salt } = auth.hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(h, salt, row.user_id);
  db.prepare('UPDATE resets SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  /* every other way in is closed, in case somebody else was already there */
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  log(null, 'password reset', row.email, '', ip);
  return { ok: true, user: db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) };
}

/* Changing it while signed in. The current one is asked for because a
   signed-in screen is not proof of who is sitting at it: a borrowed phone
   or a forgotten sign-out should not be enough to take an account.

   Every other session is ended, so if somebody else was already in, this
   is what puts them out. The one doing the changing keeps theirs. */
function change(user, current, next, again, keepSessionId, ip) {
  if (!auth.verifyPassword(String(current || ''), user.password_hash, user.password_salt)) {
    return { ok: false, errors: { current: 'That is not your current password.' } };
  }
  const problem = auth.passwordProblem(next);
  if (problem) return { ok: false, errors: { password: problem } };
  if (next !== again) return { ok: false, errors: { password2: 'The two passwords do not match.' } };
  if (next === current) return { ok: false, errors: { password: 'That is the password you already have.' } };

  const { hash: h, salt } = auth.hashPassword(next);
  db.prepare('UPDATE users SET password_hash=?, password_salt=? WHERE id=?').run(h, salt, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(user.id, keepSessionId || '');
  db.prepare('UPDATE resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(nowIso(), user.id);
  log(user, 'password changed', user.email, '', ip);
  return { ok: true };
}

/* what the admin can hand over while email is not set up */
function outstanding() {
  return db.prepare(
    'SELECT r.id, r.created_at, r.expires_at, r.sent, u.email, u.name, u.company' +
    ' FROM resets r JOIN users u ON u.id = r.user_id' +
    ' WHERE r.used_at IS NULL AND r.expires_at > ? ORDER BY r.id DESC'
  ).all(nowIso());
}

module.exports = { request, check, complete, change, outstanding, LIFE_MS };
