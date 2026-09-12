'use strict';
/* ------------------------------------------------------------------
   Chat, on the website.

   A visitor types in the panel, the message is stored here, and it is
   answered from the admin. Nothing leaves for WhatsApp or email: the
   whole conversation lives on the site and in this database.

   A visitor has no account, so a conversation is identified by a random
   token held in their browser. The token is the only thing that can read
   the thread, which is why it is 32 random bytes and never appears in a
   URL that might end up in a log or a shared link.
   ------------------------------------------------------------------ */
const crypto = require('node:crypto');
const { db, nowIso, log } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  ref         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  contact     TEXT NOT NULL DEFAULT '',
  about       TEXT NOT NULL DEFAULT '',
  side        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  unread_us   INTEGER NOT NULL DEFAULT 0,
  unread_them INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  last_at     TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY,
  convo_id   INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  side       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_convo ON messages(convo_id, id);
CREATE INDEX IF NOT EXISTS idx_convo_last ON conversations(status, last_at DESC);
`);

const MAX_BODY = 2000;
const MAX_NAME = 80;
const PER_MIN = 12;               /* messages a minute from one conversation */
const NEW_PER_HOUR_PER_IP = 40;   /* see members.js: one address is not one person here */

const sends = new Map();          /* token -> { n, resetAt } */
const starts = new Map();         /* ip -> { n, resetAt } */

function bump(map, key, limit, windowMs) {
  const now = Date.now();
  if (map.size > 4000) for (const [k, v] of map) if (now > v.resetAt) map.delete(k);
  const row = map.get(key);
  if (!row || now > row.resetAt) { map.set(key, { n: 1, resetAt: now + windowMs }); return true; }
  if (row.n >= limit) return false;
  row.n++;
  return true;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
const nextRef = () => {
  const row = db.prepare('SELECT ref FROM conversations ORDER BY id DESC LIMIT 1').get();
  const n = row ? Number(String(row.ref).slice(2)) + 1 : 1;
  return 'C-' + String(n).padStart(4, '0');
};

/* Every admin who turned notifications on gets the message on their phone.
   Loaded lazily because push.js requires this module back for its settings. */
function notifyUs(convo, body) {
  let push;
  try { push = require('./push'); } catch (e) { return; }
  const who = convo.name ? convo.name : 'Someone on the site';
  db.prepare("SELECT id FROM users WHERE status='active'").all().forEach(u => {
    push.sendTo('user:' + u.id, who + ' · ' + (convo.ref || ''),
                String(body).slice(0, 140), '/admin/chat').catch(() => {});
  });
}

/* ---------------- what a visitor can do ---------------- */

function start(f, ip) {
  if (!bump(starts, ip || 'unknown', NEW_PER_HOUR_PER_IP, 3600e3)) {
    return { ok: false, message: 'A lot of conversations have started from this connection. Wait a few minutes and try again.' };
  }
  const body = clean(f.body, MAX_BODY);
  if (!body) return { ok: false, message: 'Type a message first.' };

  const token = crypto.randomBytes(32).toString('hex');
  const ref = nextRef();
  const now = nowIso();
  /* which side of the trade they are on. A stranger may not say, and that
     is fine; it is a hint for whoever answers, not a gate. */
  const side = (f.side === 'seller' || f.side === 'buyer') ? f.side : '';
  const info = db.prepare(
    'INSERT INTO conversations (token, ref, name, contact, about, side, status, unread_us, created_at, last_at, ip)' +
    " VALUES (?,?,?,?,?,?,'open',1,?,?,?)"
  ).run(token, ref, clean(f.name, MAX_NAME), clean(f.contact, MAX_NAME), clean(f.about, 40), side, now, now, ip || '');

  db.prepare('INSERT INTO messages (convo_id, side, body, created_at) VALUES (?,?,?,?)')
    .run(info.lastInsertRowid, 'visitor', body, now);

  notifyUs({ ref, name: clean(f.name, MAX_NAME) }, body);
  log(null, 'chat started', ref, [side, clean(f.about, 40)].filter(Boolean).join(' · '), ip);
  return { ok: true, token, ref, messages: thread(token).messages };
}

function send(f, ip) {
  const convo = byToken(f.token);
  if (!convo) return { ok: false, message: 'That conversation is no longer open.' };
  if (!bump(sends, convo.token, PER_MIN, 60e3)) {
    return { ok: false, message: 'Slow down a moment.' };
  }
  const body = clean(f.body, MAX_BODY);
  if (!body) return { ok: false, message: 'Type a message first.' };
  const now = nowIso();
  db.prepare('INSERT INTO messages (convo_id, side, body, created_at) VALUES (?,?,?,?)')
    .run(convo.id, 'visitor', body, now);
  db.prepare("UPDATE conversations SET unread_us = unread_us + 1, last_at = ?, status='open' WHERE id = ?")
    .run(now, convo.id);
  notifyUs(convo, body);
  return { ok: true, messages: thread(convo.token).messages };
}

/* the visitor polls this; `since` keeps the answer small */
function thread(token, since) {
  const convo = byToken(token);
  if (!convo) return { ok: false, messages: [] };
  const rows = since
    ? db.prepare('SELECT id, side, body, created_at FROM messages WHERE convo_id=? AND id>? ORDER BY id').all(convo.id, Number(since) || 0)
    : db.prepare('SELECT id, side, body, created_at FROM messages WHERE convo_id=? ORDER BY id').all(convo.id);
  return { ok: true, ref: convo.ref, status: convo.status, about: convo.about, messages: rows };
}

/* reading the thread is what marks our replies as seen */
function markSeen(token) {
  const convo = byToken(token);
  if (convo && convo.unread_them) {
    db.prepare('UPDATE conversations SET unread_them = 0 WHERE id = ?').run(convo.id);
  }
}

function byToken(token) {
  const t = String(token || '');
  if (t.length !== 64) return null;
  return db.prepare('SELECT * FROM conversations WHERE token = ?').get(t) || null;
}

/* ---------------- what the admin can do ---------------- */

/* what each filter would hold, so the tabs can carry their own numbers */
function counts() {
  const n = s => db.prepare('SELECT COUNT(*) n FROM conversations WHERE ' + s).get().n;
  return {
    all: n("status <> 'archived'"),
    waiting: n('unread_us > 0'),
    seller: n("side = 'seller' AND status <> 'archived'"),
    buyer: n("side = 'buyer' AND status <> 'archived'"),
    done: n("status = 'closed'"),
    archived: n("status = 'archived'")
  };
}

/* One list, narrowed by a filter and by a search across both the person and
   everything either side ever wrote. Archived threads are out of the way but
   never gone: ask for them and they are there. */
function inbox(filter, q) {
  const clauses = [];
  if (filter === 'seller' || filter === 'buyer') clauses.push("c.side = '" + filter + "'");
  if (filter === 'waiting') clauses.push('c.unread_us > 0');
  else if (filter === 'done') clauses.push("c.status = 'closed'");
  else if (filter === 'archived') clauses.push("c.status = 'archived'");
  else clauses.push("c.status <> 'archived'");

  const term = String(q || '').trim().toLowerCase();
  if (term) {
    clauses.push('(LOWER(c.name) LIKE @q OR LOWER(c.ref) LIKE @q OR LOWER(c.about) LIKE @q' +
                 ' OR EXISTS (SELECT 1 FROM messages m WHERE m.convo_id = c.id AND LOWER(m.body) LIKE @q))');
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const stmt = db.prepare(
    'SELECT c.*, (SELECT body FROM messages WHERE convo_id=c.id ORDER BY id DESC LIMIT 1) AS last_body,' +
    ' (SELECT side FROM messages WHERE convo_id=c.id ORDER BY id DESC LIMIT 1) AS last_side,' +
    ' (SELECT COUNT(*) FROM messages WHERE convo_id=c.id) AS n' +
    ' FROM conversations c' + where + ' ORDER BY (unread_us > 0) DESC, last_at DESC'
  );
  return term ? stmt.all({ q: '%' + term + '%' }) : stmt.all();
}

const waiting = () => db.prepare("SELECT COUNT(*) n FROM conversations WHERE unread_us > 0 AND status <> 'archived'").get().n;

function conversation(id) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return null;
  c.messages = db.prepare('SELECT * FROM messages WHERE convo_id=? ORDER BY id').all(c.id);
  return c;
}

function openConversation(id) {
  const c = conversation(id);
  if (c) db.prepare('UPDATE conversations SET unread_us = 0 WHERE id = ?').run(c.id);
  return c;
}

function reply(id, body, user, ip) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return { ok: false, message: 'That conversation no longer exists.' };
  const text = clean(body, MAX_BODY);
  if (!text) return { ok: false, message: 'Nothing to send.' };
  const now = nowIso();
  db.prepare('INSERT INTO messages (convo_id, side, body, created_at) VALUES (?,?,?,?)')
    .run(c.id, 'us', text, now);
  db.prepare("UPDATE conversations SET unread_them = unread_them + 1, unread_us = 0, last_at=?, status='open' WHERE id=?")
    .run(now, c.id);
  log(user, 'chat replied', c.ref, '', ip);
  return { ok: true };
}

function setSide(id, side, user, ip) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return { ok: false };
  const s = (side === 'seller' || side === 'buyer') ? side : '';
  db.prepare('UPDATE conversations SET side=? WHERE id=?').run(s, c.id);
  log(user, 'chat side set', c.ref, s || 'not stated', ip);
  return { ok: true, side: s };
}

function setStatus(id, status, user, ip) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return { ok: false };
  const s = status === 'closed' ? 'closed' : 'open';
  db.prepare('UPDATE conversations SET status=? WHERE id=?').run(s, c.id);
  log(user, s === 'closed' ? 'chat closed' : 'chat reopened', c.ref, '', ip);
  return { ok: true, status: s };
}

/* Archiving, not deleting. A conversation is the record of a deal being
   made or lost, and a broker who cannot show what was said has nothing to
   stand on later. It leaves the inbox and stays in the history. */
function archive(id, user, ip) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return { ok: false };
  db.prepare("UPDATE conversations SET status='archived', unread_us=0 WHERE id=?").run(c.id);
  log(user, 'chat archived', c.ref, '', ip);
  return { ok: true };
}

function restore(id, user, ip) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return { ok: false };
  db.prepare("UPDATE conversations SET status='open' WHERE id=?").run(c.id);
  log(user, 'chat restored', c.ref, '', ip);
  return { ok: true };
}

module.exports = {
  start, send, thread, markSeen, byToken,
  inbox, waiting, counts, conversation, openConversation, reply, setStatus, setSide, archive, restore,
  MAX_BODY
};
