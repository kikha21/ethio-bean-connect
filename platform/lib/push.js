'use strict';
/* ------------------------------------------------------------------
   Web Push, written against the specs rather than a library.

   A notification reaches a phone through the browser vendor's own push
   service: Google's for Chrome, Mozilla's for Firefox, Apple's for
   Safari. We never talk to the phone. We hand an encrypted blob to that
   service and it wakes the browser, which is why the payload has to be
   encrypted to a key only that browser holds, and why the request has to
   be signed so the service knows who we are.

     RFC 8291  message encryption  (ECDH P-256, HKDF, AES-128-GCM)
     RFC 8292  VAPID               (an ES256 JWT identifying the sender)

   node:crypto has every piece, so this stays dependency free.
   ------------------------------------------------------------------ */
const crypto = require('node:crypto');
const https = require('node:https');
const { db, nowIso, log } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS push_subs (
  id         INTEGER PRIMARY KEY,
  owner      TEXT NOT NULL,          -- 'convo:<id>' for a visitor, 'user:<id>' for us
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  failed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_owner ON push_subs(owner);
`);

const b64 = buf => Buffer.from(buf).toString('base64url');
const unb64 = s => Buffer.from(String(s), 'base64url');

/* ---------------- the sender's identity ---------------- */

/* One keypair for the whole site, made on first use and kept in settings.
   The public half is handed to every browser that subscribes; change it
   and every existing subscription stops working. */
function keys() {
  const get = k => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
    return r ? r.value : '';
  };
  let pub = get('vapid_public'), priv = get('vapid_private');
  if (!pub || !priv) {
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = pair.publicKey.export({ format: 'jwk' });
    pub = b64(Buffer.concat([Buffer.from([4]), unb64(jwk.x), unb64(jwk.y)]));
    priv = pair.privateKey.export({ format: 'jwk' }).d;
    const ins = db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, label, hint, sort) VALUES (?,?,?,?,?)');
    ins.run('vapid_public', pub, '', 'internal, do not edit', 90);
    ins.run('vapid_private', priv, '', 'internal, do not edit', 91);
  }
  return { pub, priv };
}

const publicKey = () => keys().pub;

/* rebuild a KeyObject from the stored halves */
function privateKeyObject() {
  const { pub, priv } = keys();
  const raw = unb64(pub);
  return crypto.createPrivateKey({
    key: {
      kty: 'EC', crv: 'P-256',
      x: b64(raw.subarray(1, 33)), y: b64(raw.subarray(33, 65)), d: priv
    },
    format: 'jwk'
  });
}

/* RFC 8292: a short-lived ES256 token saying who is asking for the push */
function vapidHeader(endpoint, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || 'mailto:admin@localhost'
  }));
  const signing = header + '.' + claims;
  /* the JWT wants the raw r||s pair, not the DER wrapper node produces by default */
  const sig = crypto.sign('sha256', Buffer.from(signing), {
    key: privateKeyObject(), dsaEncoding: 'ieee-p1363'
  });
  return { jwt: signing + '.' + b64(sig), key: keys().pub };
}

/* ---------------- the message ---------------- */

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/* RFC 8291 aes128gcm. The browser can only decrypt this with the private
   half of the key it gave us when it subscribed. */
function encrypt(plaintext, p256dhB64, authB64) {
  const uaPublic = unb64(p256dhB64);
  const authSecret = unb64(authB64);

  const eph = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ephJwk = eph.publicKey.export({ format: 'jwk' });
  const asPublic = Buffer.concat([Buffer.from([4]), unb64(ephJwk.x), unb64(ephJwk.y)]);

  const uaKey = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64(uaPublic.subarray(1, 33)), y: b64(uaPublic.subarray(33, 65)) },
    format: 'jwk'
  });
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: uaKey });

  /* the key derivation is two HKDFs: one to fold in the auth secret, one
     to produce the content key and nonce */
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])
  ]);
  const ikm = hmac(prkKey, keyInfo);

  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  /* 0x02 is the delimiter that says "this record is the last one" */
  const body = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const out = Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, out]);
}

/* ---------------- sending ---------------- */

function post(sub, payload, subject) {
  return new Promise(resolve => {
    let body, auth;
    try {
      body = encrypt(payload, sub.p256dh, sub.auth);
      auth = vapidHeader(sub.endpoint, subject);
    } catch (e) {
      return resolve({ ok: false, status: 0, error: e.message });
    }
    const u = new URL(sub.endpoint);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST',
      headers: {
        'TTL': '86400',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
        'Authorization': 'vapid t=' + auth.jwt + ', k=' + auth.key
      }
    }, res => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
    });
    req.on('error', e => resolve({ ok: false, status: 0, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.end(body);
  });
}

/* ---------------- what the rest of the platform calls ---------------- */

function subscribe(owner, sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return { ok: false };
  db.prepare(
    'INSERT INTO push_subs (owner, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)' +
    ' ON CONFLICT(endpoint) DO UPDATE SET owner=excluded.owner, p256dh=excluded.p256dh,' +
    ' auth=excluded.auth, failed_at=NULL'
  ).run(String(owner), String(sub.endpoint), String(sub.keys.p256dh), String(sub.keys.auth), nowIso());
  return { ok: true };
}

function unsubscribe(endpoint) {
  db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String(endpoint || ''));
}

/* 404 and 410 mean the browser threw the subscription away; anything else
   might be temporary, so only the dead ones are removed */
async function sendTo(owner, title, body, url) {
  const subs = db.prepare('SELECT * FROM push_subs WHERE owner = ?').all(String(owner));
  if (!subs.length) return { sent: 0, gone: 0 };
  const subject = 'mailto:' +
    ((db.prepare("SELECT value FROM settings WHERE key='contact_email'").get() || {}).value || 'admin@localhost');
  const payload = JSON.stringify({ title, body, url: url || '/' });
  let sent = 0, gone = 0;
  for (const s of subs) {
    const r = await post(s, payload, subject);
    if (r.ok) sent++;
    else if (r.status === 404 || r.status === 410) { unsubscribe(s.endpoint); gone++; }
    else db.prepare('UPDATE push_subs SET failed_at=? WHERE id=?').run(nowIso(), s.id);
  }
  return { sent, gone };
}

const countFor = owner => db.prepare('SELECT COUNT(*) n FROM push_subs WHERE owner = ?').get(String(owner)).n;

module.exports = { publicKey, subscribe, unsubscribe, sendTo, countFor, encrypt, vapidHeader };
