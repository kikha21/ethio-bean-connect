'use strict';
/* ------------------------------------------------------------------
   Inviting somebody to help run the board.

   Two ways to make a helper. Pick an existing member off the list, or
   send a link to somebody who is not here yet. The link is for the
   second case: it survives being forwarded on WhatsApp, and it does not
   require the owner to be awake when the person accepts.

   What the link is NOT: it is not a sign-in. Opening it while signed out
   sends you to make an account first, and the invitation is spent only
   once a real account accepts it. A link that signed somebody in would
   be a password sent over WhatsApp.

   Only the hash is stored, so the table is useless to anyone who reads
   it, and one invitation is one helper: it dies on first use.
   ------------------------------------------------------------------ */
const crypto = require('node:crypto');
const { db, nowIso, log } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS invites (
  id         INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL,
  made_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
`);

/* Two days. Long enough to reach somebody who is travelling, short
   enough that a forwarded message does not stay dangerous for a month. */
const LIFE_MS = 48 * 3600e3;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function make(actor, note, siteUrl, ip) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO invites (token_hash, made_by, note, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(hash(token), actor.id, String(note || '').slice(0, 120), nowIso(),
         new Date(Date.now() + LIFE_MS).toISOString());
  log(actor, 'helper invited', note || '(no name)', '', ip);
  const base = String(siteUrl || '').replace(/\/+$/, '');
  return { ok: true, link: base + '/invite?t=' + token };
}

function check(token) {
  return db.prepare(
    'SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
  ).get(hash(token || ''), nowIso()) || null;
}

/* Accepting. The caller must already be signed in as a real account -
   that is what ties the invitation to a person rather than to whoever
   holds the link. */
function accept(token, user, ip) {
  const row = check(token);
  if (!row) return { ok: false, message: 'That invitation has been used already, or it has expired. Ask for another.' };
  if (!user) return { ok: false, needAccount: true };
  if (user.role === 'super_admin') return { ok: false, message: 'You already own this account.' };

  db.prepare("UPDATE users SET role = 'helper' WHERE id = ?").run(user.id);
  db.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?').run(nowIso(), user.id, row.id);
  /* their sessions end, so the new powers begin at a fresh sign-in */
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  log(user, 'became a helper', user.company || user.name, user.email, ip);
  return { ok: true };
}

/* what the owner can see and take back */
function outstanding() {
  return db.prepare(
    'SELECT i.id, i.note, i.created_at, i.expires_at FROM invites i' +
    ' WHERE i.used_at IS NULL AND i.expires_at > ? ORDER BY i.id DESC'
  ).all(nowIso());
}

function cancel(id, actor, ip) {
  const row = db.prepare('SELECT * FROM invites WHERE id = ? AND used_at IS NULL').get(id);
  if (!row) return { ok: false, message: 'That invitation is already gone.' };
  db.prepare('UPDATE invites SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  log(actor, 'invitation cancelled', row.note || '(no name)', '', ip);
  return { ok: true, message: 'Invitation cancelled. That link no longer works.' };
}

module.exports = { make, check, accept, outstanding, cancel, LIFE_MS };
