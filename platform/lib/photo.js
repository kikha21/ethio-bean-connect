'use strict';
/* ------------------------------------------------------------------
   Sample photographs.

   The browser resizes and re-encodes the picture before sending it, so
   what arrives here is a small JPEG rather than the four-megabyte file a
   phone camera produces. That is done for the supplier's sake - most of
   them are on mobile data, and a full-size upload over a slow connection
   is the difference between posting a lot and giving up halfway - but it
   has a second effect worth keeping: drawing a photograph onto a canvas
   and re-encoding it discards the EXIF block, and with it the GPS
   coordinates a phone writes into every picture. A farmer should be able
   to show their coffee without publishing where they live.

   None of that is trusted. The client decides what to send; this decides
   what to keep. Every check below assumes the sender is hostile, because
   an upload endpoint is the part of a site people try first.
   ------------------------------------------------------------------ */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { UPLOAD_DIR } = require('./db');

/* A phone photo resized to 1400px and re-encoded lands around 150-250 kB.
   This leaves room for a detailed one without leaving room for somebody
   filling the disk a megabyte at a time. */
const MAX_BYTES = 900 * 1024;

/* What the first bytes of a file say it is. Extensions and declared
   content types are both just claims by the sender; these are not. */
const SIGNATURES = [
  { ext: 'jpg',  type: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { ext: 'png',  type: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: 'webp', type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50] }
];

function sniff(buf) {
  for (const s of SIGNATURES) {
    if (buf.length < s.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < s.bytes.length; i++) if (buf[i] !== s.bytes[i]) { ok = false; break; }
    if (ok && s.at8) {
      for (let i = 0; i < s.at8.length; i++) if (buf[8 + i] !== s.at8[i]) { ok = false; break; }
    }
    if (ok) return s;
  }
  return null;
}

/* Accepts the data URL the form sends. Returns a stored file name, or a
   reason it was refused - never a half-written file. */
function accept(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return { ok: true, photo: null };

  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return { ok: false, reason: 'That did not arrive as a picture. Try choosing it again.' };

  /* the encoded length is known before decoding, so an oversized payload
     is refused without ever being turned into a buffer */
  if (m[2].length > MAX_BYTES * 1.4) {
    return { ok: false, reason: 'That picture is too large. Try a smaller one.' };
  }

  let buf;
  try { buf = Buffer.from(m[2], 'base64'); }
  catch (e) { return { ok: false, reason: 'That picture could not be read.' }; }

  if (!buf.length) return { ok: true, photo: null };
  if (buf.length > MAX_BYTES) {
    return { ok: false, reason: 'That picture is too large. Try a smaller one.' };
  }

  /* what it claims to be, against what it actually is */
  const sig = sniff(buf);
  if (!sig) return { ok: false, reason: 'That file is not a picture.' };
  if (sig.type !== m[1]) return { ok: false, reason: 'That file is not the kind of picture it claims to be.' };

  /* The name is ours, never the sender's. A supplied filename is a path
     traversal waiting to happen, and a guessable one lets somebody walk
     the folder reading other people's samples before they are approved. */
  const name = crypto.randomBytes(16).toString('hex') + '.' + sig.ext;
  const dest = path.join(UPLOAD_DIR, name);
  if (path.dirname(path.resolve(dest)) !== path.resolve(UPLOAD_DIR)) {
    return { ok: false, reason: 'That picture could not be stored.' };
  }

  try { fs.writeFileSync(dest, buf, { flag: 'wx' }); }
  catch (e) { return { ok: false, reason: 'That picture could not be stored.' }; }

  return { ok: true, photo: name, bytes: buf.length, type: sig.type };
}

/* Reading one back out. The name comes off a listing row, but it is
   checked anyway: a row is only as trustworthy as whatever last wrote it. */
const NAME_RE = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

function read(name) {
  if (!NAME_RE.test(String(name || ''))) return null;
  const file = path.join(UPLOAD_DIR, name);
  if (path.dirname(path.resolve(file)) !== path.resolve(UPLOAD_DIR)) return null;
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return null; }
  /* what is served is decided by the bytes, not by the name on disk */
  const sig = sniff(buf);
  if (!sig) return null;
  return { buf, type: sig.type };
}

function remove(name) {
  if (!NAME_RE.test(String(name || ''))) return false;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, name)); return true; }
  catch (e) { return false; }
}

module.exports = { accept, read, remove, MAX_BYTES, NAME_RE };
