'use strict';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root{
  --canvas:#F1F4F2;--canvas-2:#E5EAE7;--panel:#FBFCFB;--line:#D2DAD5;--strong:#67736C;
  --ink:#15201A;--ink-2:#525C55;
  --gold:#C8A44A;--gold-ink:#8A6B1F;--on-gold:#15201A;
  --green:#2F7D32;--green-deep:#225C25;--bean:#8A5028;--warn:#A6412A;--warn-bg:rgba(166,65,42,.08);
  --display:"Archivo",system-ui,sans-serif;--body:"Source Sans 3",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
  /* the dropdowns here are drawn by the browser, and without this it
     draws them light whatever the palette says: light text landing on
     a white list */
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --canvas:#0E130F;--canvas-2:#141B15;--panel:#1A231B;--line:#2B3A2C;--strong:#62806A;
  --ink:#F3F0E6;--ink-2:#B4BFB0;--gold-ink:#E6CC85;--green:#5FA867;--green-deep:#93CE94;
  --bean:#C08A5A;--warn:#E8836A;--warn-bg:rgba(232,131,106,.1);
  color-scheme:dark;
}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--ink);font-family:var(--body);font-size:1rem;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--display);margin:0;line-height:1.12;letter-spacing:-.02em}
a{color:var(--gold-ink)}
code,.mono{font-family:var(--mono);font-size:.86em}
:focus-visible{outline:2px solid var(--gold-ink);outline-offset:2px}
.shell{width:min(1120px,100% - 2rem);margin-inline:auto}

.top{background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
.top .shell{display:flex;align-items:center;gap:1rem;padding:.7rem 0;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:.55rem;font-family:var(--display);font-weight:700;font-size:.95rem;text-transform:uppercase;letter-spacing:.03em;text-decoration:none;color:var(--ink)}
.brand i{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--gold);position:relative;flex:0 0 22px}
.brand i::after{content:"";position:absolute;inset:4px 6px;border-radius:50%;background:var(--bean)}
.brand span{color:var(--gold-ink)}
nav.tabs{display:flex;gap:.15rem;margin-left:auto;flex-wrap:wrap}
nav.tabs a{font-size:.92rem;text-decoration:none;color:var(--ink-2);padding:.4rem .7rem;border-radius:8px}
nav.tabs a:hover{background:var(--canvas-2);color:var(--ink)}
nav.tabs a.on{background:var(--ink);color:var(--canvas)}
.navdot{background:var(--gold);color:var(--on-gold);font-family:var(--mono);font-size:.68rem;font-weight:600;
  border-radius:999px;padding:.05rem .4rem;margin-left:-.4rem;align-self:center}
.who{font-size:.86rem;color:var(--ink-2);display:flex;align-items:center;gap:.6rem}

main{padding:1.8rem 0 4rem}
.head{display:flex;align-items:baseline;gap:1rem;flex-wrap:wrap;margin-bottom:.4rem}
.head h1{font-size:clamp(1.5rem,3.4vw,2.1rem)}
.head .sub{color:var(--ink-2);font-size:.95rem}
.lede{color:var(--ink-2);max-width:70ch;margin:0 0 1.4rem}

.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.1rem 1.2rem}
.cards{display:grid;gap:.7rem}
@media(min-width:700px){.cards.c3{grid-template-columns:repeat(3,1fr)}.cards.c2{grid-template-columns:repeat(2,1fr)}.cards.c4{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1040px){.cards.c4{grid-template-columns:repeat(4,1fr)}}
.stat b{display:block;font-family:var(--mono);font-size:.72rem;color:var(--ink-2);letter-spacing:.06em;text-transform:uppercase}
.stat span{display:block;font-family:var(--display);font-size:1.9rem;line-height:1.1;margin-top:.3rem}
.stat small{display:block;color:var(--ink-2);font-size:.86rem;margin-top:.2rem}

label{display:block;margin-bottom:.9rem}
label .lb{display:block;font-weight:600;font-size:.93rem;margin-bottom:.3rem}
label .hint{display:block;font-weight:400;color:var(--ink-2);font-size:.85rem}
input[type=text],input[type=email],input[type=password],textarea,select{
  width:100%;font-family:var(--body);font-size:1rem;color:var(--ink);background:var(--canvas);
  border:1px solid var(--strong);border-radius:9px;padding:.55rem .7rem}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--gold-ink);background:var(--panel)}
option{background-color:var(--panel);color:var(--ink)}
textarea{resize:vertical;min-height:76px}
.row2{display:grid;gap:.7rem}
@media(min-width:760px){.row2{grid-template-columns:1fr 1fr}}

.btn{display:inline-flex;align-items:center;gap:.45rem;font-family:var(--body);font-weight:600;font-size:.95rem;
  border:1px solid transparent;border-radius:99px;padding:.55rem 1.15rem;cursor:pointer;text-decoration:none}
.btn-primary{background:var(--gold);color:var(--on-gold)}
.btn-primary:hover{background:var(--gold-ink);color:#fff}
.btn-ghost{border-color:var(--strong);color:var(--ink);background:transparent}
.btn-ghost:hover{border-color:var(--gold-ink);color:var(--gold-ink)}
.btn-sm{font-size:.86rem;padding:.35rem .8rem}

table{width:100%;border-collapse:collapse;font-size:.94rem}
th,td{text-align:left;padding:.5rem .55rem;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-family:var(--mono);font-size:.74rem;letter-spacing:.05em;color:var(--ink-2);font-weight:400}
tr:last-child td{border-bottom:0}
td input[type=text]{padding:.35rem .5rem;font-size:.92rem}

.flash{border-radius:11px;padding:.7rem .95rem;margin-bottom:1.2rem;font-size:.95rem}
.flash.ok{border:1px solid var(--green);background:color-mix(in srgb,var(--green) 10%,transparent);color:var(--ink)}
.flash.bad{border:1px solid var(--warn);background:var(--warn-bg);color:var(--ink)}

.sec{margin-top:1.6rem}
.sec h2{font-size:1.08rem;margin-bottom:.6rem;display:flex;align-items:baseline;gap:.6rem}
.sec h2 .n{font-family:var(--mono);font-size:.75rem;color:var(--ink-2);font-weight:400}
.pair{border:1px solid var(--line);border-radius:11px;padding:.75rem .9rem;margin-bottom:.5rem;background:var(--panel)}
.pair .k{font-family:var(--mono);font-size:.72rem;color:var(--ink-2);margin-bottom:.4rem}
.pair .fields{display:grid;gap:.5rem}
@media(min-width:820px){.pair .fields{grid-template-columns:1fr 1fr}}
.pair .fl{font-size:.78rem;color:var(--ink-2);font-family:var(--mono);margin-bottom:.2rem;display:block}

.log{font-size:.9rem}
.log td:first-child{font-family:var(--mono);font-size:.78rem;color:var(--ink-2);white-space:nowrap}
.tag{font-family:var(--mono);font-size:.72rem;border:1px solid var(--line);border-radius:99px;padding:.1rem .45rem;color:var(--ink-2)}


/* the inbox: conversations on the left, the open one on the right */
.resetlink{display:block;margin-top:.5rem;padding:.5rem .65rem;background:var(--canvas);
  border:1px solid var(--line);border-radius:8px;font-family:var(--mono);font-size:.78rem;
  word-break:break-all;user-select:all}
.standing-form{display:flex;gap:.3rem;align-items:center;flex-wrap:nowrap}
.standing-form select,.standing-form input{width:auto;padding:.3rem .45rem;font-size:.84rem}
.convo-search{display:flex;gap:.35rem;align-items:center;margin-left:auto}
.convo-search input[type=search]{width:min(16rem,42vw);padding:.32rem .6rem;font-size:.86rem;border-radius:999px}
@media(max-width:760px){.convo-search{margin-left:0;width:100%}.convo-search input[type=search]{width:100%}}
.chat-wrap{display:grid;grid-template-columns:1fr;gap:1rem;margin-top:1.2rem}
@media(min-width:900px){.convo-search{display:flex;gap:.35rem;align-items:center;margin-left:auto}
.convo-search input[type=search]{width:min(16rem,42vw);padding:.32rem .6rem;font-size:.86rem;border-radius:999px}
@media(max-width:760px){.convo-search{margin-left:0;width:100%}.convo-search input[type=search]{width:100%}}
.chat-wrap{grid-template-columns:22rem 1fr;align-items:start}}
.convo-list{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;max-height:34rem;overflow-y:auto}
.convo{display:block;padding:.85rem 1rem;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}
.convo:last-child{border-bottom:0}
.convo:hover{background:var(--canvas-2)}
.convo.on{background:var(--canvas-2);box-shadow:inset 3px 0 0 var(--gold)}
.convo.unread b{font-weight:700}
.convo-top{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.convo .mono{display:block;font-family:var(--mono);font-size:.72rem;color:var(--ink-2);margin:.15rem 0 .3rem}
.convo .preview{display:block;font-size:.86rem;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.convo .when{font-family:var(--mono);font-size:.72rem;color:var(--ink-2);white-space:nowrap}
.convo .dot{background:var(--gold);color:var(--on-gold);font-family:var(--mono);font-size:.7rem;font-weight:600;
  border-radius:999px;padding:.05rem .45rem;white-space:nowrap}

.chat-panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;display:flex;flex-direction:column;min-height:24rem}
.chat-empty{padding:2.4rem;display:grid;place-items:center;text-align:center;min-height:24rem}
.chat-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;
  padding:.9rem 1.1rem;border-bottom:1px solid var(--line)}
.chat-head b{display:block}
.chat-head .mono{font-family:var(--mono);font-size:.74rem;color:var(--ink-2)}
.chat-about-admin{padding:.5rem 1.1rem;border-bottom:1px solid var(--line);background:var(--canvas-2);
  font-size:.84rem;color:var(--ink-2)}
.chat-about-admin a{font-family:var(--mono);font-size:.8rem}
.convo .kind{font-size:.64rem;padding:.05rem .35rem;margin-top:.25rem;display:inline-block}
.chat-thread{padding:1.1rem;display:flex;flex-direction:column;gap:.7rem;max-height:26rem;overflow-y:auto}
.bubble{max-width:78%;padding:.6rem .85rem;border-radius:14px;font-size:.94rem;line-height:1.5}
.bubble p{margin:0}
.bubble .stamp{display:block;margin-top:.3rem;font-family:var(--mono);font-size:.68rem;opacity:.7}
.bubble.them{align-self:flex-start;background:var(--canvas-2);border:1px solid var(--line);border-bottom-left-radius:5px}
.bubble.us{align-self:flex-end;background:var(--gold);color:var(--on-gold);border-bottom-right-radius:5px}
.chat-reply{display:flex;gap:.6rem;align-items:flex-end;padding:.9rem 1.1rem;border-top:1px solid var(--line)}
.chat-reply textarea{flex:1;min-height:60px;margin:0}

.center{min-height:100vh;display:grid;place-items:center;padding:2rem 1rem}
.auth{width:min(430px,100%)}
.auth h1{font-size:1.5rem;margin-bottom:.3rem}
.auth p.sub{color:var(--ink-2);font-size:.95rem;margin-bottom:1.2rem}
/* the marketplace screens */
.pills{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:1.1rem 0 0}
.pill{font-size:.9rem;text-decoration:none;color:var(--ink-2);border:1px solid var(--line);
  border-radius:999px;padding:.36rem .85rem;background:var(--panel)}
.pill:hover{border-color:var(--strong);color:var(--ink)}
.pill.on{background:var(--ink);border-color:var(--ink);color:var(--canvas)}
.pill b{font-weight:600;opacity:.75;margin-left:.2rem}
.dim{color:var(--ink-2);font-size:.86em}
.right{text-align:right}
.nowrap{white-space:nowrap}
.mono{font-family:var(--mono);font-size:.8rem;letter-spacing:.04em}
th.private,td.private{background:color-mix(in srgb,var(--warn) 7%,transparent)}
th.private{color:var(--warn)}
.kind{font-family:var(--mono);font-size:.7rem;letter-spacing:.05em;text-transform:uppercase;
  border:1px solid;border-radius:6px;padding:.14rem .45rem;white-space:nowrap}
.kind.offer{color:var(--green-deep);border-color:var(--green)}
.kind.need{color:var(--bean);border-color:var(--bean)}
.badge{display:inline-block;font-family:var(--mono);font-size:.7rem;letter-spacing:.04em;
  border-radius:6px;padding:.14rem .45rem;border:1px solid;white-space:nowrap}
.badge.live{color:var(--green-deep);border-color:var(--green);background:color-mix(in srgb,var(--green) 10%,transparent)}
.badge.draft{color:var(--ink-2);border-color:var(--line)}
.badge.new{color:var(--gold-ink);border-color:var(--gold);background:color-mix(in srgb,var(--gold) 16%,transparent);font-weight:600}
.badge.ex{color:var(--gold-ink);border-color:var(--gold)}
.badge.warnb{color:var(--warn);border-color:var(--warn);background:var(--warn-bg);white-space:normal}
.tierdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:.4rem;vertical-align:middle}
.shot{float:left;margin:0 .6rem .3rem 0;line-height:0}
.shot img{width:56px;height:40px;object-fit:cover;border-radius:5px;border:1px solid var(--line)}
.shot:hover img{border-color:var(--accent)}
.tierdot.trusted{background:var(--gold)}
.tierdot.verified{background:var(--green)}
.tierdot.unverified{background:transparent;border:1px solid var(--line)}
.two{display:grid;grid-template-columns:1fr 10rem;gap:.5rem}
.three{display:grid;grid-template-columns:1fr 9rem 6rem;gap:.5rem}
@media(max-width:560px){.two,.three{grid-template-columns:1fr}}
label.check{display:flex;align-items:center;gap:.55rem;margin-top:.4rem}
label.check input{width:auto;margin:0}
label.check span{font-weight:600;font-size:.93rem}
.sticky-save{position:sticky;bottom:0;background:linear-gradient(to top,var(--canvas) 62%,transparent);padding:1rem 0 .6rem;margin-top:1rem}
`;

function layout({ title, user, active, body, flash }) {
  /* the badge is read here rather than passed in, so every page shows it */
  /* the four owner-only tabs are left out for a helper, so they are not
     shown doors that will turn them away */
  const owner = user && user.role === 'super_admin';
  
  let waiting = 0;
  try { waiting = require('./chat').waiting(); } catch (e) {}
  const tab = (href, label, id) =>
    `<a href="${href}"${active === id ? ' class="on"' : ''}>${esc(label)}</a>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Ethio Bean Connect</title>
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Mono:wght@400&family=Source+Sans+3:wght@400;600&display=swap">
<style>${STYLE}</style></head><body>
${user ? `<header class="top"><div class="shell">
  <a class="brand" href="/admin"><i></i>Ethio<span>Bean</span> admin</a>
  <nav class="tabs">
    ${tab('/admin', 'Overview', 'home')}
    ${tab('/admin/chat', 'Chat', 'chat')}${waiting ? `<span class="navdot">${waiting}</span>` : ''}
    ${tab('/admin/marketplace', 'Marketplace', 'board')}
    ${owner ? `${tab('/admin/members', 'Members', 'members')}` : ""}
    ${tab('/admin/prices', 'Market prices', 'prices')}
    ${owner ? `${tab('/admin/content', 'Site text', 'content')}` : ""}
    ${owner ? `${tab('/admin/settings', 'Contact details', 'settings')}` : ""}
    ${owner ? `${tab('/admin/activity', 'Activity', 'activity')}` : ""}
  </nav>
  <span class="who"><a href="/" target="_blank" rel="noopener">View site</a>
  <form method="post" action="/admin/logout" style="display:inline">
    <input type="hidden" name="csrf" value="${esc(user.csrf)}">
    <button class="btn btn-ghost btn-sm" type="submit">Sign out</button>
  </form></span>
</div></header>` : ''}
<main><div class="shell">
${flash ? `<div class="flash ${flash.kind === 'bad' ? 'bad' : 'ok'}">${esc(flash.text)}</div>` : ''}
${body}
</div></main></body></html>`;
}

module.exports = { layout, esc, STYLE };
