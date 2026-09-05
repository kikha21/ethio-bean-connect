'use strict';
const crypto = require('node:crypto');
const { db, nowIso, log } = require('./db');

const SESSION_DAYS = 14;

/* scrypt, from Node's own crypto. No dependency, and deliberately slow so a
   stolen database is not a list of passwords. */
function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { hash: hash.toString('hex'), salt: salt.toString('hex') };
}

function verifyPassword(password, storedHashHex, saltHex) {
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHashHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);   /* constant time, so timing cannot leak the hash */
}

/* What a password has to be depends on what it protects. The admin account
   holds every member's details and can put anything on the board, so it
   keeps the longer rule. A member account can post a lot that waits for
   review and hold a conversation, and the real cost of a strict rule there
   is somebody on a phone giving up before they have joined. */
function passwordProblem(pw, forRole) {
  const min = forRole === 'member' ? 6 : 10;
  if (typeof pw !== 'string' || pw.length < min) return 'Use at least ' + min + ' characters.';
  if (forRole === 'member') return null;
  if (!/[a-z]/i.test(pw)) return 'Include at least one letter.';
  if (!/[0-9]/.test(pw)) return 'Include at least one number.';
  return null;
}

function createAdmin({ email, name, password }) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const { hash, salt } = hashPassword(password);
  const info = db.prepare(
    `INSERT INTO users (email, name, password_hash, password_salt, role, status, created_at)
     VALUES (?,?,?,?,'super_admin','active',?)`
  ).run(String(email).trim().toLowerCase(), name || '', hash, salt, nowIso());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function authenticate(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?')
                 .get(String(email || '').trim().toLowerCase(), 'active');
  if (!user) {
    /* spend the same time as a real check so a missing account is not
       detectable by how fast the answer comes back */
    hashPassword(password || '', crypto.randomBytes(16).toString('hex'));
    return null;
  }
  if (!verifyPassword(password || '', user.password_hash, user.password_salt)) return null;
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  return user;
}

function startSession(user, ip) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, ip) VALUES (?,?,?,?,?)')
    .run(id, user.id, nowIso(), expires, ip || '');
  return { id, expires };
}

function userForSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ? AND u.status = 'active'`
  ).get(sessionId, nowIso());
  return row || null;
}

function endSession(sessionId) {
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function purgeExpired() {
  const n = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso()).changes;
  return n;
}

/* a token tied to the session, so a page on another site cannot post to us */
function csrfFor(sessionId) {
  return crypto.createHmac('sha256', 'ebc-csrf').update(String(sessionId)).digest('hex').slice(0, 32);
}
function csrfOk(sessionId, token) {
  const want = csrfFor(sessionId);
  const a = Buffer.from(String(token || ''));
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  hashPassword, verifyPassword, passwordProblem, createAdmin,
  authenticate, startSession, userForSession, endSession, purgeExpired,
  csrfFor, csrfOk, SESSION_DAYS
};
