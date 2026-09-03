'use strict';
/* ------------------------------------------------------------------
   Sending an email, with nothing installed.

   SMTP is a line protocol over a socket, so node:tls is enough. This
   speaks the small part of it that matters: greet, authenticate, hand
   over one message, quit. Implicit TLS on 465, which is what Gmail and
   most providers offer and what avoids the STARTTLS upgrade dance.

   The credentials live in settings, not in the code, and until they are
   filled in nothing is sent and the caller is told so plainly rather
   than being left to assume a letter went out.
   ------------------------------------------------------------------ */
const tls = require('node:tls');
const { db } = require('./db');

const setting = k => {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
  return r ? String(r.value).trim() : '';
};

function config() {
  return {
    host: setting('smtp_host'),
    port: Number(setting('smtp_port')) || 465,
    user: setting('smtp_user'),
    pass: setting('smtp_pass'),
    from: setting('smtp_from') || setting('contact_email')
  };
}

const configured = () => {
  const c = config();
  return !!(c.host && c.user && c.pass && c.from);
};

/* a header must not be able to carry a second header into the message */
const oneLine = s => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();

/* SMTP ends a message with a lone dot, so any line that is already a lone
   dot has to be doubled or it would end the message early */
const dotStuff = body => String(body).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

function talk(socket, expect, line) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = d => {
      buf += d.toString('utf8');
      /* a reply is finished when its last line has a space after the code */
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      socket.removeListener('data', onData);
      socket.removeListener('error', onErr);
      const code = Number(last.slice(0, 3));
      if (expect && expect.indexOf(code) === -1) {
        return reject(new Error('server said: ' + last));
      }
      resolve(buf);
    };
    const onErr = e => {
      socket.removeListener('data', onData);
      reject(e);
    };
    socket.on('data', onData);
    socket.once('error', onErr);
    if (line !== undefined) socket.write(line + '\r\n');
  });
}

function send({ to, subject, text }) {
  const c = config();
  if (!configured()) {
    return Promise.resolve({ ok: false, reason: 'not-configured' });
  }
  return new Promise(resolve => {
    let socket;
    const fail = e => resolve({ ok: false, reason: 'failed', error: e && e.message });
    try {
      socket = tls.connect({ host: c.host, port: c.port, servername: c.host });
    } catch (e) { return fail(e); }

    socket.setTimeout(15000, () => { socket.destroy(); fail(new Error('timed out')); });
    socket.on('error', fail);

    socket.once('secureConnect', async () => {
      try {
        await talk(socket, [220]);
        await talk(socket, [250], 'EHLO ethiobeanconnect');
        await talk(socket, [334], 'AUTH LOGIN');
        await talk(socket, [334], Buffer.from(c.user).toString('base64'));
        await talk(socket, [235], Buffer.from(c.pass).toString('base64'));
        await talk(socket, [250], 'MAIL FROM:<' + oneLine(c.from) + '>');
        await talk(socket, [250, 251], 'RCPT TO:<' + oneLine(to) + '>');
        await talk(socket, [354], 'DATA');

        const msg = [
          'From: Ethio Bean Connect <' + oneLine(c.from) + '>',
          'To: <' + oneLine(to) + '>',
          'Subject: ' + oneLine(subject),
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          'Date: ' + new Date().toUTCString(),
          '',
          dotStuff(text)
        ].join('\r\n');

        await talk(socket, [250], msg + '\r\n.');
        socket.write('QUIT\r\n');
        socket.end();
        resolve({ ok: true });
      } catch (e) {
        try { socket.destroy(); } catch (x) {}
        fail(e);
      }
    });
  });
}

/* so the admin can prove the settings work without waiting for somebody
   to forget a password */
function test(to) {
  return send({
    to,
    subject: 'Ethio Bean Connect: test',
    text: 'This is a test from your own site.\n\n' +
          'If it arrived, password resets will reach people too.\n'
  });
}

module.exports = { send, test, configured, config };
