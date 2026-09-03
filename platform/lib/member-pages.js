'use strict';
/* ------------------------------------------------------------------
   The pages a supplier or exporter sees.

   Deliberately plain. Somebody arriving here is trying to sell coffee,
   not admire a website, and they may be doing it on a phone on a bad
   connection at the edge of a washing station. So: one column, real
   labels, no scripting needed for anything that matters.
   ------------------------------------------------------------------ */
const { db, TIERS, RATINGS, UNITS, quantityText, priceText } = require('./db');
const members = require('./members');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root{
  --canvas:#F1F4F2;--canvas-2:#E5EAE7;--panel:#FBFCFB;--line:#D2DAD5;--strong:#62806A;
  --ink:#15201A;--ink-2:#525C55;--gold:#C8A44A;--gold-ink:#8A6B1F;--on-gold:#15201A;
  --green:#2F7D32;--green-deep:#225C25;--warn:#A6412A;--warn-bg:rgba(166,65,42,.08);
  --edge-ui:#868C88;
  --display:"Archivo",system-ui,sans-serif;--body:"Source Sans 3",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --canvas:#0E130F;--canvas-2:#141B15;--panel:#1A231B;--line:#2B3A2C;--strong:#62806A;
  --ink:#F3F0E6;--ink-2:#B4BFB0;--gold-ink:#E6CC85;--green:#5FA867;--green-deep:#93CE94;
  --warn:#E8836A;--warn-bg:rgba(232,131,106,.1);--edge-ui:#8FA294;
  color-scheme:dark;
}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--ink);font-family:var(--body);
  font-size:1rem;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2{font-family:var(--display);margin:0;line-height:1.15;letter-spacing:-.02em}
a{color:var(--gold-ink)}
option{background-color:var(--panel);color:var(--ink)}
.wrap{width:min(560px,100% - 2rem);margin:0 auto;padding:2.4rem 0 4rem}
.wide{width:min(880px,100% - 2rem)}
.brand{display:flex;align-items:center;gap:.55rem;text-decoration:none;color:var(--ink);
  font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  font-size:.95rem;margin-bottom:1.8rem}
.brand i{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--gold);flex:0 0 22px;position:relative}
.brand i::after{content:"";position:absolute;inset:4px 6px;border-radius:50%;background:#8A5028}
.brand span{color:var(--gold-ink)}
h1{font-size:clamp(1.5rem,4vw,2rem);margin-bottom:.4rem}
.lede{color:var(--ink-2);margin:0 0 1.6rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.3rem 1.35rem}
label{display:block;margin-bottom:1rem}
.lb{display:block;font-weight:600;font-size:.94rem;margin-bottom:.35rem}
.hint{display:block;font-weight:400;color:var(--ink-2);font-size:.84rem;margin-top:.3rem}
input,select,textarea{width:100%;font-family:var(--body);font-size:1rem;color:var(--ink);
  background:var(--canvas);border:1px solid var(--strong);border-radius:10px;padding:.6rem .75rem}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--gold-ink);background:var(--panel)}
.two{display:grid;gap:.9rem}
@media(min-width:520px){.two{grid-template-columns:1fr 1fr}}
.btn{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--body);font-weight:600;
  border:1px solid transparent;border-radius:999px;padding:.62rem 1.3rem;cursor:pointer;
  text-decoration:none;font-size:.98rem;min-height:44px}
.btn-primary{background:var(--gold);color:var(--on-gold)}
.btn-primary:hover{background:var(--gold-ink);color:#fff}
.btn-ghost{border-color:var(--strong);color:var(--ink);background:transparent}
.btn-ghost:hover{border-color:var(--gold-ink);color:var(--gold-ink)}
.foot{margin-top:1.3rem;color:var(--ink-2);font-size:.92rem}
.err{color:var(--warn);font-size:.86rem;margin-top:.3rem;display:block}
.flash{border-radius:11px;padding:.75rem 1rem;margin-bottom:1.3rem;font-size:.95rem;
  border:1px solid var(--green);background:color-mix(in srgb,var(--green) 10%,transparent)}
.flash.bad{border-color:var(--warn);background:var(--warn-bg)}
.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.6rem}
.who{font-size:.9rem;color:var(--ink-2)}
.badge{display:inline-block;font-family:var(--mono);font-size:.7rem;letter-spacing:.05em;
  border:1px solid;border-radius:999px;padding:.12rem .5rem;white-space:nowrap}
.badge.live{color:var(--green-deep);border-color:var(--green)}
.badge.wait{color:var(--gold-ink);border-color:var(--gold)}
.badge.off{color:var(--ink-2);border-color:var(--line)}
.post{border:1px solid var(--line);border-radius:12px;padding:.9rem 1.05rem;margin-bottom:.6rem;background:var(--panel)}
.post-top{display:flex;justify-content:space-between;gap:.7rem;align-items:baseline;flex-wrap:wrap}
.post .mono{font-family:var(--mono);font-size:.74rem;color:var(--ink-2)}
.post b{font-size:1.05rem}
.post .spec{color:var(--ink-2);font-size:.9rem;margin-top:.2rem}
.standing{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.5rem}
.medal{font-family:var(--mono);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
  border:1px solid;border-radius:999px;padding:.14rem .55rem}
.medal.bronze{color:#63380F;border-color:rgba(124,74,36,.85);background:rgba(196,124,74,.4)}
.medal.silver{color:#3D444D;border-color:rgba(86,93,102,.85);background:rgba(170,178,188,.45)}
.medal.gold{color:#54400B;border-color:rgba(160,128,44,.9);background:rgba(232,204,124,.6)}
`;

function page({ title, body, wide }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Ethio Bean Connect</title>
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Mono:wght@400&family=Source+Sans+3:wght@400;600&display=swap">
<style>${STYLE}</style></head><body>
<div class="wrap${wide ? ' wide' : ''}">
<a class="brand" href="/"><i></i>Ethio<span>Bean</span> Connect</a>
${body}
</div></body></html>`;
}

const field = (name, label, value, errors, type, hint, extra) =>
  '<label><span class="lb">' + esc(label) + '</span>' +
  '<input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(value || '') + '"' +
  (extra || '') + '>' +
  (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
  (errors && errors[name] ? '<span class="err">' + esc(errors[name]) + '</span>' : '') +
  '</label>';

/* ---------------- join ---------------- */
function joinPage(f, errors, flash) {
  f = f || {};
  const sideOpt = v => '<option value="' + v + '"' + (f.side === v ? ' selected' : '') + '>' +
    (v === 'seller' ? 'I sell coffee' : v === 'buyer' ? 'I buy coffee' : 'Both') + '</option>';
  return page({ title: 'Create an account', body:
    '<h1>Create an account</h1>' +
    '<p class="lede">You need one to put coffee on the board. It takes a minute, and it is what lets us ' +
    'come back to you about a lot and keep your standing on everything you post.</p>' +
    (flash ? '<div class="flash bad">' + esc(flash) + '</div>' : '') +
    '<form method="post" action="/join"><div class="card">' +
      '<label><span class="lb">Which are you</span><select name="side">' +
        '<option value="">Choose one</option>' + sideOpt('seller') + sideOpt('buyer') + sideOpt('both') +
      '</select>' + (errors && errors.side ? '<span class="err">' + esc(errors.side) + '</span>' : '') + '</label>' +
      '<div class="two">' + field('name', 'Your name', f.name, errors) +
                            field('company', 'Company or union', f.company, errors) + '</div>' +
      '<div class="two">' + field('email', 'Email', f.email, errors, 'email') +
                            field('phone', 'Phone', f.phone, errors, 'tel') + '</div>' +
      field('region', 'Where you are', f.region, errors, 'text', 'Gedeo, Addis Ababa, Trieste. Optional.') +
      '<div class="two">' +
        field('password', 'Password', '', errors, 'password', 'At least 10 characters, with a letter and a number.') +
        field('password2', 'Password again', '', errors, 'password') + '</div>' +
      '<button class="btn btn-primary" type="submit">Create it</button>' +
    '</div></form>' +
    '<p class="foot">Already have one? <a href="/signin">Sign in</a>.</p>'
  });
}

/* ---------------- sign in ---------------- */
function signinPage(err, email) {
  return page({ title: 'Sign in', body:
    '<h1>Sign in</h1>' +
    '<p class="lede">To post a lot, or to see the ones you have already put up.</p>' +
    (err ? '<div class="flash bad">' + esc(err) + '</div>' : '') +
    '<form method="post" action="/signin"><div class="card">' +
      field('email', 'Email', email, null, 'email', '', ' required autocomplete="username"') +
      field('password', 'Password', '', null, 'password', '', ' required autocomplete="current-password"') +
      '<button class="btn btn-primary" type="submit">Sign in</button>' +
    '</div></form>' +
    '<p class="foot"><a href="/forgot">Forgotten your password?</a> &nbsp;·&nbsp; ' +
    'No account yet? <a href="/join">Create one</a>.</p>'
  });
}

/* ---------------- their own area ---------------- */
function myPage(user, flash) {
  const st = members.standing(user);
  const posts = members.postsOf(user.id);

  const medal = st.rating && RATINGS[st.rating]
    ? '<span class="medal ' + RATINGS[st.rating].key + '">' + esc(RATINGS[st.rating].label) + '</span>' : '';

  const list = posts.length ? posts.map(p => {
    const q = quantityText(p.quantity_val, p.quantity_unit);
    const pr = priceText(p.price, p.price_unit, p.currency);
    const state = p.status === 'pending' ? '<span class="badge wait">Waiting for us to check it</span>'
                : p.published ? '<span class="badge live">On the board</span>'
                : '<span class="badge off">Not on the board</span>';
    return '<div class="post"><div class="post-top"><span class="mono">' + esc(p.ref) + '</span>' + state + '</div>' +
      '<b>' + esc(p.origin) + ' ' + esc(p.grade) + '</b>' +
      '<div class="spec">' + esc([p.process, q.main, p.harvest].filter(Boolean).join(' · ')) +
      (pr.main ? ' · ' + esc(pr.main + ' per ' + pr.per) : ' · price on request') + '</div></div>';
  }).join('') : '<div class="card"><p class="lede" style="margin:0">Nothing yet. ' +
      '<a href="/#post">Post your first lot</a> and it appears here.</p></div>';

  return page({ wide: true, title: 'Your account', body:
    '<div class="top"><div><h1>' + esc(user.company || user.name) + '</h1>' +
      '<span class="who">' + esc(user.email) + ' · ' +
      esc(user.side === 'seller' ? 'selling' : user.side === 'buyer' ? 'buying' : 'buying and selling') +
      '</span></div>' +
      '<form method="post" action="/signout"><button class="btn btn-ghost" type="submit">Sign out</button></form>' +
    '</div>' +
    (flash ? '<div class="flash">' + esc(flash) + '</div>' : '') +
    '<div class="card" style="margin-bottom:1.4rem"><b>Your standing</b>' +
      '<div class="standing">' +
        '<span class="badge ' + (st.tier === 'unverified' ? 'off' : 'live') + '">' + esc(st.tierLabel) + '</span>' +
        medal +
        (st.deals ? '<span class="who">' + st.deals + ' closed with us</span>' : '') +
      '</div>' +
      '<span class="hint">' + (st.tier === 'unverified'
        ? 'We verify accounts as we get to know them. It shows on everything you post.'
        : 'This shows on every lot you put up.') + '</span>' +
    '</div>' +
    '<h2 style="font-size:1.15rem;margin-bottom:.7rem">Your posts</h2>' + list +
    '<p class="foot"><a class="btn btn-primary" href="/#post">Post another lot</a></p>'
  });
}

/* ---------------- forgotten password ---------------- */
function forgotPage(done, email) {
  if (done) {
    return page({ title: 'Check your email', body:
      '<h1>Check your email</h1>' +
      '<p class="lede">If there is an account for that address, a link to set a new password is on its way. ' +
      'It works once and stops working in an hour.</p>' +
      '<div class="card"><p style="margin:0;color:var(--ink-2);font-size:.93rem">' +
      'Nothing arrived? Look in spam, or ask us on the chat and we will sort it out.</p></div>' +
      '<p class="foot"><a href="/signin">Back to sign in</a></p>'
    });
  }
  return page({ title: 'Forgotten password', body:
    '<h1>Forgotten your password?</h1>' +
    '<p class="lede">Put in the address you signed up with and we will send a link to set a new one.</p>' +
    '<form method="post" action="/forgot"><div class="card">' +
      field('email', 'Email', email, null, 'email', '', ' required autocomplete="username"') +
      '<button class="btn btn-primary" type="submit">Send the link</button>' +
    '</div></form>' +
    '<p class="foot">Remembered it? <a href="/signin">Sign in</a>.</p>'
  });
}

function resetPage(token, errors, dead) {
  if (dead) {
    return page({ title: 'Link expired', body:
      '<h1>That link has expired</h1>' +
      '<p class="lede">A reset link works once, and only for an hour. Ask for another and we will send a fresh one.</p>' +
      '<p><a class="btn btn-primary" href="/forgot">Send me another</a></p>'
    });
  }
  return page({ title: 'Set a new password', body:
    '<h1>Set a new password</h1>' +
    '<p class="lede">Choose something you will remember. Signing in anywhere else will be ended.</p>' +
    '<form method="post" action="/reset"><div class="card">' +
      '<input type="hidden" name="t" value="' + esc(token) + '">' +
      field('password', 'New password', '', errors, 'password', 'At least 10 characters, with a letter and a number.', ' required autocomplete="new-password"') +
      field('password2', 'Again', '', errors, 'password', '', ' required autocomplete="new-password"') +
      '<button class="btn btn-primary" type="submit">Set it</button>' +
    '</div></form>'
  });
}

module.exports = { joinPage, signinPage, myPage, forgotPage, resetPage, page, esc };
