'use strict';
/* ------------------------------------------------------------------
   Posting, straight into the site.

   A supplier fills the form and the lot lands in the database as a
   pending post. Nobody re-types it out of a WhatsApp message, and
   nothing they send reaches the public board until it has been looked
   at: every submission arrives unpublished, with status 'pending'.

   This is the one endpoint a stranger can write to, so it is the one
   place that has to assume bad faith: rate limits per address, a
   honeypot, hard length caps, and validation that never trusts a value
   just because the browser sent it.
   ------------------------------------------------------------------ */
const { db, nowIso, log, GRADES, QTY_UNIT_KEYS, SUPPLY, MARKETS, nextRef } = require('./db');

/* what one address may do in an hour, and what the whole site may take.
   Held in memory: a restart forgives everyone, which is the right
   trade for a board this size. */
const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_HOUR = 200;
const HOUR = 3600e3;

const seen = new Map();          /* ip -> { n, resetAt } */
let globalN = 0, globalReset = Date.now() + HOUR;

function sweep(now) {
  if (now > globalReset) { globalN = 0; globalReset = now + HOUR; }
  if (seen.size > 5000) {        /* never let the map grow without bound */
    for (const [k, v] of seen) if (now > v.resetAt) seen.delete(k);
  }
}

function rateCheck(ip) {
  const now = Date.now();
  sweep(now);
  if (globalN >= GLOBAL_PER_HOUR) return 'The board is taking a lot of posts right now. Try again shortly.';
  const row = seen.get(ip);
  if (!row || now > row.resetAt) { seen.set(ip, { n: 1, resetAt: now + HOUR }); globalN++; return null; }
  if (row.n >= PER_IP_PER_HOUR) return 'That is several posts from here in the last hour. Try again later, or send them to us on WhatsApp.';
  row.n++; globalN++;
  return null;
}

/* every field is trimmed and capped; a caller cannot make the database
   hold a novel */
const CAP = {
  name: 120, company: 160, email: 160, phone: 40,
  type: 80, type_other: 80, origin: 80, origin_other: 80,
  grade: 40, grade_other: 40, quantity: 24, notes: 2000
};
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* the form offers "Other, let me type it" on three of its lists */
function pick(f, name) {
  const v = clean(f[name], CAP[name]);
  return v === '__other__' ? clean(f[name + '_other'], CAP[name + '_other']) : v;
}

function validate(f) {
  const mode = f.mode === 'need' ? 'need' : 'have';
  const out = { mode, errors: {} };
  const need = (k, v, msg) => { if (!v) out.errors[k] = msg || 'This is needed.'; return v; };

  out.name    = need('name', clean(f.name, CAP.name));
  out.company = need('company', clean(f.company, CAP.company));
  out.email   = clean(f.email, CAP.email);
  out.phone   = clean(f.phone, CAP.phone);
  out.type    = need('type', pick(f, 'type'));
  out.origin  = need('origin', pick(f, 'origin'));
  out.grade   = need('grade', pick(f, 'grade'));

  if (!out.email) out.errors.email = 'This is needed.';
  else if (!EMAIL_RE.test(out.email)) out.errors.email = 'That does not look like an email address.';
  if (!out.phone) out.errors.phone = 'This is needed.';
  else if (out.phone.replace(/\D/g, '').length < 7) out.errors.phone = 'That does not look like a phone number.';

  /* someone offering coffee must say where it is; someone asking for
     coffee has no warehouse to declare */
  out.supply = SUPPLY[f.supply] ? f.supply : '';
  if (mode === 'have' && !out.supply) out.errors.supply = 'This is needed.';
  if (mode !== 'have') out.supply = '';

  out.quantity_val  = clean(f.quantity, CAP.quantity).replace(/[^\d.,]/g, '');
  out.quantity_unit = QTY_UNIT_KEYS.indexOf(f.quantity_unit) === -1 ? 'mt' : f.quantity_unit;
  if (!out.quantity_val) out.quantity_unit = '';
  out.notes = clean(f.notes, CAP.notes);

  /* a grade off the list is kept as typed, because "Other" exists for
     exactly that; it is the admin who decides what it really is */
  out.gradeKnown = GRADES.indexOf(out.grade) !== -1;
  return out;
}

/* a lot below export grade belongs on the other board. This is only the
   opening guess: the admin sets the board for real when reviewing. */
function guessMarket(v) {
  if (/local market grade/i.test(v.type)) return 'local';
  if (/^ungraded$/i.test(v.grade)) return 'local';
  return 'export';
}

function submit(f, ip) {
  /* a bot fills every field it finds, including the one nobody can see.
     Accept it so the bot learns nothing, and store nothing. */
  if (clean(f.website, 200)) {
    return { ok: true, ref: null, silent: true };
  }

  const limited = rateCheck(ip || 'unknown');
  if (limited) return { ok: false, rateLimited: true, message: limited };

  const v = validate(f);
  if (Object.keys(v.errors).length) return { ok: false, errors: v.errors };

  const kind = v.mode === 'have' ? 'offer' : 'need';
  const ref = nextRef(kind);
  const market = guessMarket(v);

  db.prepare(
    'INSERT INTO listings (ref, kind, market, supply, origin, grade, process,' +
    ' quantity_val, quantity_unit, price, price_unit, currency, harvest, notes,' +
    ' poster_name, poster_org, poster_phone, poster_email, poster_region,' +
    ' tier, rating, deals, status, published, is_example, sort, created_at)' +
    " VALUES (?,?,?,?,?,?,?,?,?,NULL,'kg','USD','',?,?,?,?,?,'','unverified',NULL,0,'pending',0,0,0,?)"
  ).run(ref, kind, market, v.supply, v.origin, v.grade, v.type,
        v.quantity_val, v.quantity_unit, v.notes,
        v.name, v.company, v.phone, v.email, nowIso());

  /* the log records that a post arrived and from where, never the body */
  log(null, 'post received', ref, kind === 'offer' ? 'offering coffee' : 'looking for coffee', ip);

  return { ok: true, ref };
}

module.exports = { submit, validate, PER_IP_PER_HOUR };
