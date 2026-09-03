'use strict';
/* ------------------------------------------------------------------
   The inbox.

   Conversations that are waiting come first, because that is the only
   ordering that matters when someone is sitting on the other end of one.
   Opening a conversation is what marks it read, so the count cannot drift
   away from what you have actually looked at.
   ------------------------------------------------------------------ */
const chat = require('./chat');
const { layout, esc } = require('./ui');
const { db } = require('./db');

/* a message is plain text and stays plain text; the only markup it gets
   is the line breaks the person typed */
const lines = t => esc(t).split('\n').join('<br>');

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return sameDay ? hh : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hh;
}

function listItem(c, activeId) {
  const on = String(c.id) === String(activeId);
  const who = c.name || 'Someone on the site';
  const sideTag = c.side === 'seller' ? '<span class="kind offer">Selling</span>'
                : c.side === 'buyer'  ? '<span class="kind need">Buying</span>' : '';
  const preview = (c.last_side === 'us' ? 'You: ' : '') + String(c.last_body || '').slice(0, 60);
  return '<a class="convo' + (on ? ' on' : '') + (c.unread_us ? ' unread' : '') +
    '" href="/admin/chat?id=' + c.id + '">' +
    '<div class="convo-top"><b>' + esc(who) + '</b>' +
    (c.unread_us ? '<span class="dot">' + c.unread_us + '</span>' : '<span class="when">' + when(c.last_at) + '</span>') +
    '</div>' +
    '<span class="mono">' + esc(c.ref) + (c.about ? ' · ' + esc(c.about) : '') + '</span>' + sideTag +
    '<span class="preview">' + esc(preview) + '</span>' +
    (c.status === 'closed' ? '<span class="badge draft">Done</span>' : '') +
    (c.status === 'archived' ? '<span class="badge draft">History</span>' : '') +
    '</a>';
}

function page(user, flash, id, filter, q) {
  const c = chat.counts();
  const all = chat.inbox(filter, q);
  const active = id ? chat.openConversation(id) : null;

  const list = all.length
    ? all.map(cv => listItem(cv, id)).join('')
    : '<p class="lede" style="padding:1rem">' +
      (q ? 'Nothing matches “' + esc(q) + '”.'
         : filter === 'archived' ? 'Nothing in the history yet.'
         : filter ? 'Nothing here right now.'
         : 'Nothing yet. When someone writes to you from the site it appears here.') + '</p>';

  let panel;
  if (!active) {
    panel = '<div class="chat-empty"><p class="lede" style="margin:0">' +
      (all.length ? 'Pick a conversation on the left.'
                  : 'The chat button is on every page of the site. A visitor types, it lands here, and your reply appears on their screen. Nothing goes out by email or WhatsApp.') +
      '</p></div>';
  } else {
    const bubbles = active.messages.map(m =>
      '<div class="bubble ' + (m.side === 'us' ? 'us' : 'them') + '">' +
      '<p>' + lines(m.body) + '</p>' +
      '<span class="stamp">' + when(m.created_at) + '</span></div>').join('');

    const who = active.name || 'Someone on the site';
    const meta = [active.ref, active.contact].filter(Boolean).map(esc).join(' · ');
    /* the lot they are asking about, as a link, so you can read it while
       you answer instead of hunting for the reference */
    const lot = active.about
      ? db.prepare('SELECT id, origin, grade, kind FROM listings WHERE ref = ?').get(active.about)
      : null;
    const aboutLine = active.about
      ? '<div class="chat-about-admin">About ' +
        (lot ? '<a href="/admin/marketplace/edit?id=' + lot.id + '">' + esc(active.about) + ' · ' +
               esc(lot.origin) + ' ' + esc(lot.grade) + '</a>'
             : esc(active.about) + ' <span class="dim">(no longer on the board)</span>') +
        (active.side ? ' · they are <b>' + esc(active.side === 'seller' ? 'selling' : 'buying') + '</b>' : '') +
        '</div>'
      : (active.side ? '<div class="chat-about-admin">They are <b>' +
                       esc(active.side === 'seller' ? 'selling' : 'buying') + '</b></div>' : '');

    panel =
      '<div class="chat-head"><div><b>' + esc(who) + '</b><span class="mono">' + meta + '</span></div>' +
      '<form method="post" action="/admin/chat" class="chat-acts">' +
        '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
        '<input type="hidden" name="id" value="' + active.id + '">' +
        (active.status === 'archived'
          ? '<button class="btn btn-ghost btn-sm" type="submit" name="do" value="restore">Back to the inbox</button>'
          : '<button class="btn btn-ghost btn-sm" type="submit" name="do" value="' +
            (active.status === 'closed' ? 'open">Reopen' : 'close">Mark done') + '</button>' +
            '<button class="btn btn-ghost btn-sm" type="submit" name="do" value="archive" ' +
            'style="margin-left:.4rem">Archive</button>') +
      '</form></div>' +
      aboutLine +
      '<div class="chat-thread" id="thread">' + bubbles + '</div>' +
      '<form method="post" action="/admin/chat" class="chat-reply">' +
        '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
        '<input type="hidden" name="id" value="' + active.id + '">' +
        '<input type="hidden" name="do" value="reply">' +
        '<textarea name="body" rows="3" required placeholder="Write your reply" ' +
          'maxlength="' + chat.MAX_BODY + '"></textarea>' +
        '<button class="btn btn-primary" type="submit">Send</button>' +
      '</form>';
  }

  const waiting = chat.waiting();
  return layout({
    title: 'Chat', user, active: 'chat', flash,
    body:
      '<div class="head"><h1>Chat</h1><span class="sub">' +
        (waiting ? waiting + ' waiting for a reply' : 'nothing waiting') + '</span></div>' +
      '<p class="lede">People writing to you from the website. Your reply appears on their screen where they are ' +
      'reading; it does not go out by email or WhatsApp.</p>' +
      /* the whole history is reachable: what is waiting, what is done, and
         what has been put away, none of it deleted */
      '<div class="pills">' +
        [['', 'Everything', c.all], ['waiting', 'Waiting', c.waiting],
         ['seller', 'Sellers', c.seller], ['buyer', 'Buyers', c.buyer],
         ['done', 'Done', c.done], ['archived', 'History', c.archived]]
          .filter(t => t[2] || t[0] === '' || t[0] === (filter || ''))
          .map(t => '<a class="pill' + ((filter || '') === t[0] ? ' on' : '') + '" href="/admin/chat' +
                    (t[0] ? '?show=' + t[0] : '') + '">' + esc(t[1]) +
                    ' <b>' + t[2] + '</b></a>').join('') +
        '<form method="get" action="/admin/chat" class="convo-search">' +
          (filter ? '<input type="hidden" name="show" value="' + esc(filter) + '">' : '') +
          '<input type="search" name="q" value="' + esc(q || '') + '" placeholder="Search names and messages">' +
          '<button class="btn btn-ghost btn-sm" type="submit">Search</button>' +
          (q ? '<a class="btn btn-ghost btn-sm" href="/admin/chat' +
               (filter ? '?show=' + esc(filter) : '') + '">Clear</a>' : '') +
        '</form>' +
      '</div>' +
      '<div class="chat-wrap"><div class="convo-list">' + list + '</div>' +
      '<div class="chat-panel">' + panel + '</div></div>' +
      /* The inbox keeps itself current: a reply that arrives while you are
         reading appears without a reload, and the tab title carries the
         number waiting so you can leave this open in a background tab and
         still notice. */
      '<script>(function(){' +
      'var t=document.getElementById("thread"); if(t) t.scrollTop=t.scrollHeight;' +
      'var r=document.querySelector(".chat-reply textarea"); if(r) r.focus();' +
      'var id=' + (active ? active.id : 'null') + ';' +
      'var last=' + (active && active.messages.length ? active.messages[active.messages.length - 1].id : 0) + ';' +
      'var base=document.title.replace(/^\\(\\d+\\)\\s*/,"");' +
      'function stamp(iso){var d=new Date(iso);return isNaN(d)?"":String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}' +
      'function draw(m){var el=document.createElement("div");el.className="bubble "+(m.side==="us"?"us":"them");' +
      'var p=document.createElement("p");p.textContent=m.body;var s=document.createElement("span");' +
      's.className="stamp";s.textContent=stamp(m.created_at);el.appendChild(p);el.appendChild(s);return el;}' +
      'function tick(){' +
      'fetch("/admin/chat/poll?id="+(id||"")+"&since="+last,{headers:{"Accept":"application/json"}})' +
      '.then(function(res){return res.json();}).then(function(out){' +
      'document.title=(out.waiting?"("+out.waiting+") ":"")+base;' +
      'var dot=document.querySelector(".navdot");' +
      'if(dot){ if(out.waiting){dot.textContent=out.waiting;dot.hidden=false;} else dot.hidden=true; }' +
      'if(out.messages&&out.messages.length&&t){out.messages.forEach(function(m){last=Math.max(last,m.id);t.appendChild(draw(m));});' +
      't.scrollTop=t.scrollHeight;}' +
      '}).catch(function(){});}' +
      'setInterval(tick,5000); tick();' +
      '})();</script>'
  });
}

module.exports = { page };
