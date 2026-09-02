'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'ethiobean.db'));
const nowIso = () => new Date().toISOString();

db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

/* ------------------------------------------------------------------
   Schema. Stage 2 only: the admin account, the content it can edit,
   and the log of what was changed. Supplier and exporter accounts,
   listings, deals and commission arrive in stages 3 to 6 and will be
   added here as further migrations.
   ------------------------------------------------------------------ */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'super_admin',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT
);

/* every viewer-facing string, in both languages */
CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value_en   TEXT NOT NULL DEFAULT '',
  value_am   TEXT NOT NULL DEFAULT '',
  section    TEXT NOT NULL DEFAULT 'other',
  updated_at TEXT,
  updated_by INTEGER REFERENCES users(id)
);

/* contact details and anything else that is one value, not a translation pair */
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  label      TEXT NOT NULL DEFAULT '',
  hint       TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS market_prices (
  id         INTEGER PRIMARY KEY,
  origin     TEXT NOT NULL,
  grade      TEXT NOT NULL,
  process    TEXT NOT NULL,
  price      TEXT,
  published  INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
`);

/* ------------------------------------------------------------------
   The marketplace board. Two kinds of post share one table because
   they carry the same fields and are read together:
     offer  a supplier has coffee to sell
     need   an exporter is looking for coffee

   Identity is deliberately split from the post. Everything a visitor
   sees is in the first group of columns; the poster_* columns are
   never rendered on the public page, only in the admin. That is the
   whole point of the board: buyers and sellers meet through us, not
   around us.
   ------------------------------------------------------------------ */
db.exec(`
CREATE TABLE IF NOT EXISTS listings (
  id            INTEGER PRIMARY KEY,
  ref           TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL DEFAULT 'offer',
  origin        TEXT NOT NULL DEFAULT '',
  grade         TEXT NOT NULL DEFAULT '',
  process       TEXT NOT NULL DEFAULT '',
  quantity      TEXT NOT NULL DEFAULT '',
  price         TEXT,
  currency      TEXT NOT NULL DEFAULT 'USD',
  harvest       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',

  poster_name   TEXT NOT NULL DEFAULT '',
  poster_org    TEXT NOT NULL DEFAULT '',
  poster_phone  TEXT NOT NULL DEFAULT '',
  poster_email  TEXT NOT NULL DEFAULT '',
  poster_region TEXT NOT NULL DEFAULT '',

  tier          TEXT NOT NULL DEFAULT 'unverified',
  rating        INTEGER,
  deals         INTEGER NOT NULL DEFAULT 0,

  status        TEXT NOT NULL DEFAULT 'live',
  is_example    INTEGER NOT NULL DEFAULT 0,
  published     INTEGER NOT NULL DEFAULT 0,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,
  updated_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_listings_board ON listings(published, status, kind, sort);
`);

/* ------------------------------------------------------------------
   Weight units used in the Ethiopian trade. Faresula (ፈረሱላ) is the
   traditional unit still quoted at farmgate and in local commodity
   dealing: 1 Faresula = 17 kg. A price of 8,500 birr per Faresula is
   500 birr per kg. It sits beside kg everywhere a quantity or a price
   is entered or shown, because a supplier thinks in Faresula and an
   overseas buyer thinks in tonnes, and neither should have to convert
   in their head.

   kg === null means the unit is not a weight and cannot be converted.
   ------------------------------------------------------------------ */
const KG_PER_FARESULA = 17;
const UNITS = {
  kg:        { label: 'Kg',              am: 'ኪሎ ግራም', kg: 1,    short: 'kg' },
  faresula:  { label: 'Faresula',        am: 'ፈረሱላ',    kg: 17,   short: 'Faresula' },
  quintal:   { label: 'Quintal, 100 kg', am: 'ኩንታል',    kg: 100,  short: 'quintal' },
  bag60:     { label: 'Bag, 60 kg',      am: 'ከረጢት',    kg: 60,   short: 'bags' },
  mt:        { label: 'Metric ton',      am: 'ቶን',      kg: 1000, short: 'MT' },
  container: { label: 'Container, 20ft', am: 'ኮንቴነር',   kg: null, short: 'containers' }
};

const QTY_UNIT_KEYS   = ['kg', 'quintal', 'bag60', 'mt', 'container'];
const PRICE_UNIT_KEYS = ['kg', 'faresula', 'quintal', 'bag60', 'mt'];

const num = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* what a quantity reads as on the board: the figure as entered, plus the
   one conversion that actually helps. Entered in Faresula, show kg.
   Entered in kg, show Faresula. Anything else, show kg. */
function quantityText(value, unit) {
  const v = Number(String(value ?? '').replace(/,/g, ''));
  const u = UNITS[unit] || null;
  if (!u || !isFinite(v) || v <= 0) return { main: String(value || '').trim(), alt: '' };
  const main = `${num(v)} ${u.short}`;
  if (u.kg === null || unit === 'kg') return { main, alt: '' };
  return { main, alt: `${num(v * u.kg)} kg` };
}


/* A price is always quoted per unit, and the two sides of a deal quote
   different ones. Show what was entered, and the complement beside it:
   per Faresula gains a per-kg reading, per kg gains a per-Faresula one. */
function priceText(price, priceUnit, currency) {
  const raw = String(price ?? '').trim();
  if (raw === '') return { main: null, alt: '' };
  const v = Number(raw.replace(/,/g, ''));
  const u = UNITS[priceUnit] || UNITS.kg;
  const cur = currency || 'USD';
  const money = n => n >= 100 ? num(Math.round(n)) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!isFinite(v) || v <= 0 || u.kg === null) return { main: `${cur} ${raw}`, alt: '' };
  const main = `${cur} ${money(v)}`;
  const perKg = v / u.kg;
  if (priceUnit === 'kg')
    return { main, per: 'kg', alt: `${cur} ${money(perKg * KG_PER_FARESULA)} per Faresula` };
  if (priceUnit === 'faresula')
    return { main, per: 'Faresula', alt: `${cur} ${money(perKg)} per kg` };
  return { main, per: u.short, alt: `${cur} ${money(perKg)} per kg` };
}

/* ------------------------------------------------------------------
   Notes are free text, and free text is where the anonymity actually
   leaks. The schema can guarantee a name column never reaches the page;
   it cannot stop someone typing "call me on 0921..." into the notes.

   So notes are scrubbed on the way out: phone numbers, emails, links
   and @handles are removed from the public board. The admin always sees
   the original, and contactHints() tells them what was found so they can
   have a word with the poster.

   Deliberately conservative about what counts as a phone number: a run
   of seven or more digits. "cup score 86", "screen 15+" and "2025/26"
   must survive untouched.
   ------------------------------------------------------------------ */
const CONTACT_PATTERNS = [
  { name: 'email',  re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: 'link',   re: /\b(?:https?:\/\/|www\.)[^\s<]+/gi },
  { name: 'handle', re: /(^|[\s(])@[A-Za-z0-9._]{3,}/g },
  { name: 'phone',  re: /\+?\d[\d\s().-]{5,}\d/g }
];

function isPhoneish(s) {
  return (s.match(/\d/g) || []).length >= 7;
}

function scrubNotes(text) {
  let out = String(text || '');
  CONTACT_PATTERNS.forEach(p => {
    out = out.replace(p.re, m => {
      if (p.name === 'phone' && !isPhoneish(m)) return m;
      if (p.name === 'handle') return m.charAt(0) === '@' ? '[removed]' : m.charAt(0) + '[removed]';
      return '[removed]';
    });
  });
  return out;
}

/* what the admin is warned about, before they publish */
function contactHints(text) {
  const found = [];
  CONTACT_PATTERNS.forEach(p => {
    const hits = String(text || '').match(p.re) || [];
    hits.forEach(h => {
      if (p.name === 'phone' && !isPhoneish(h)) return;
      found.push({ kind: p.name, text: h.trim() });
    });
  });
  return found;
}

/* One source of truth for the pickers, so the public form and the
   admin can never drift apart. Ethiopian coffee grades run 1 to 5. */
const GRADES    = ['G1', 'G2', 'G3', 'G4', 'G5', 'Ungraded'];
const PROCESSES = ['Washed', 'Natural', 'Honey', 'Semi-washed'];
/* Coffee that meets export grade and coffee that does not are two
   different trades with different buyers, so the board keeps them
   apart rather than mixing them and making both harder to read. */
const MARKETS = {
  export: { label: 'Export standard', note: 'Graded for export, G1 to G5.' },
  local:  { label: 'Local and reject', note: 'Below export grade, or sold on the domestic market.' }
};

/* Where the coffee physically is, which decides who moves it and when
   it can ship. Horizontal is already down in the Addis warehouse and
   ready to go; vertical is still up at the farm or the supplier's own
   store and has to be brought down first. A buyer needs to know which
   before quoting, so the form makes it required. */
const SUPPLY = {
  horizontal: { label: 'Horizontal, in Addis Ababa',
                short: 'In Addis',
                note: 'Already in the Addis Ababa warehouse.' },
  vertical:   { label: 'Vertical, at the farm or supplier store',
                short: 'At the farm',
                note: 'Still at the farm or the supplier own warehouse.' }
};

const TIERS = {
  unverified: { label: 'Not yet verified', short: 'Unverified' },
  verified:   { label: 'ID and licence checked', short: 'Verified' },
  trusted:    { label: 'Trusted partner', short: 'Trusted' }
};

/* refs are what a visitor quotes when they enquire, so they have to be
   short, unambiguous out loud, and never reused */
function nextRef(kind) {
  const prefix = kind === 'need' ? 'EBC-R-' : 'EBC-L-';
  const row = db.prepare(
    "SELECT ref FROM listings WHERE ref LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(prefix + '%');
  const n = row ? Number(String(row.ref).slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

/* ------------------------------------------------------------------
   Seed. Runs once, from the strings already in the built site so the
   database starts as an exact copy of what is live rather than empty.
   ------------------------------------------------------------------ */
function sectionFor(key) {
  if (/^(nav|cta)\./.test(key)) return 'Navigation and buttons';
  if (/^(hero|static)\./.test(key)) return 'The opening screen';
  if (/^walls\./.test(key)) return 'The three problems';
  if (/^how\./.test(key)) return 'How it works';
  if (/^market\./.test(key)) return 'The market table';
  if (/^origins\./.test(key)) return 'Origins';
  if (/^seal\./.test(key)) return 'The sealed lot';
  if (/^checks\./.test(key)) return 'What we check';
  if (/^faq\./.test(key)) return 'Questions and answers';
  if (/^(post|f)\./.test(key)) return 'The form';
  if (/^e\./.test(key)) return 'Error messages';
  if (/^(chat|foot)\./.test(key)) return 'Contact and footer';
  return 'Everything else';
}

function seed() {
  const already = db.prepare('SELECT COUNT(*) AS n FROM content').get().n;
  if (already > 0) return { seeded: false };

  const pairsPath = path.join(__dirname, '..', '..', 'review', 'i18n-pairs.json');
  let pairs = [];
  try {
    pairs = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
  } catch (e) {
    console.warn('  could not read i18n-pairs.json, content starts empty:', e.message);
  }

  const insContent = db.prepare(
    'INSERT OR IGNORE INTO content (key, value_en, value_am, section) VALUES (?,?,?,?)'
  );
  pairs.forEach(p => insContent.run(p.key, p.en || '', p.am || '', sectionFor(p.key)));

  const insSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, label, hint, sort) VALUES (?,?,?,?,?)'
  );
  [
    ['contact_email',    'ethiobeanconnect@gmail.com',                    'Email',            'Where form enquiries are sent', 1],
    ['contact_whatsapp', '251929383806',                                  'WhatsApp number',  'Digits only, country code, no plus sign', 2],
    ['contact_phone',    '+251 92 938 3806',                              'Phone',            'Shown in the footer and the chat panel', 3],
    ['contact_phone2',   '+251 91 000 6869',                              'Second phone',     'Optional', 4],
    ['contact_address',  "Adam's Pavilion, Sarbet, Addis Ababa, Ethiopia",'Address',          'Shown in the footer', 5],
    ['market_updated',   '2026-08-31',                                    'Prices last updated', 'The date shown beside the market table', 6],
    ['market_currency',  'USD',                                           'Currency',         'Shown before each price', 7],
    ['market_price_unit','kg',                                            'Prices are quoted per', 'kg, or Faresula for the local trade. 1 Faresula = 17 kg.', 8]
  ].forEach(r => insSetting.run(...r));

  const insPrice = db.prepare(
    'INSERT INTO market_prices (origin, grade, process, price, published, sort) VALUES (?,?,?,?,1,?)'
  );
  [
    ['Yirgacheffe', 'G1', 'Washed',  null],
    ['Yirgacheffe', 'G1', 'Natural', null],
    ['Guji',        'G1', 'Washed',  null],
    ['Guji',        'G1', 'Natural', null],
    ['Sidamo',      'G2', 'Washed',  null],
    ['Limu',        'G2', 'Washed',  null],
    ['Jimma',       'G4', 'Natural', null],
    ['Nekemte',     'G4', 'Natural', null],
    ['Harar',       'G4', 'Natural', null]
  ].forEach((r, i) => insPrice.run(r[0], r[1], r[2], r[3], i));

  return { seeded: true, strings: pairs.length };
}


/* Six worked examples so the board can be seen working before the first
   real lot arrives. They are drafts, never published, and flagged so the
   admin can clear them all in one action. Nothing invented is ever shown
   to a visitor. */
function seedExamples() {
  if (db.prepare('SELECT COUNT(*) n FROM listings').get().n > 0) return { seeded: false };
  const ins = db.prepare(
    `INSERT INTO listings (ref, kind, origin, grade, process, quantity_val, quantity_unit, price, price_unit,
       currency, harvest, notes, poster_name, poster_org, poster_phone, poster_region,
       tier, rating, deals, status, is_example, published, market, sort, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'live',1,0,?,?,?)`
  );
  const rows = [
    ['offer','Yirgacheffe','G1','Washed','30','mt','6.40','kg','USD','2025/26',
     'Screen 15+, cup score 86. Warehouse in Addis, ready to move.',
     'Abebe Tadesse','Kochere Farmers Union','+251 91 234 5678','Gedeo','trusted',5,11],
    ['offer','Guji','G1','Natural','17','mt','8500','faresula','ETB','2025/26',
     'Lot from Hambela. Cup score 87.5, jasmine and peach. Priced at farmgate.',
     'Meseret Bekele','Hambela Estate','+251 92 111 2233','Guji','verified',4,3],
    ['offer','Sidamo','G2','Washed','45','mt',null,'kg','USD','2025/26',
     'Bulk lot, price on application. Sample available on request.',
     'Tesfaye Alemu','Bensa Coffee Supply','+251 91 887 6655','Sidama','verified',4,2],
    ['need','Yirgacheffe','G1','Washed','2','container',null,'kg','USD','2025/26',
     'Buyer in Trieste. Washed G1 only, EU MRL compliant.',
     'Marco Fenaroli','Adriatica Caffe SRL','+39 040 555 1212','Italy','trusted',5,7],
    ['need','Guji','G1','Natural','10','mt',null,'kg','USD','2025/26',
     'Roaster in Seoul looking for a single natural lot, cup 86+.',
     'Ji-woo Park','Seongsu Roasters','+82 10 5555 8888','South Korea','verified',4,1],
    ['need','Limu','G2','Washed','25','mt',null,'kg','USD','2025/26',
     'Blender needs steady volume, repeat contract if the first lot lands well.',
     'Sarah Whitfield','Northbridge Trading','+44 7700 900123','United Kingdom','unverified',null,0]
  ];
  const now = nowIso();
  rows.forEach((r, i) => ins.run(nextRef(r[0]), ...r, r[18] || 'export', i, now));
  return { seeded: true, n: rows.length };
}


function log(actor, action, subject, detail, ip) {
  db.prepare(
    'INSERT INTO activity_log (actor_id, actor_name, action, subject, detail, ip, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(actor ? actor.id : null, actor ? actor.name || actor.email : 'system',
        action, subject || '', detail || '', ip || '', nowIso());
}

function hasAdmin() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='super_admin'").get().n > 0;
}

module.exports = { db, seed, log, nowIso, hasAdmin, sectionFor, seedExamples, GRADES, UNITS, QTY_UNIT_KEYS, PRICE_UNIT_KEYS, KG_PER_FARESULA, quantityText, priceText, scrubNotes, contactHints, PROCESSES, TIERS, MARKETS, SUPPLY, nextRef };
