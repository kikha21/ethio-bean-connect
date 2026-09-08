'use strict';
/* ------------------------------------------------------------------
   The people who post.

   This is where standing is decided. Setting it here writes it onto
   everything they have already put up, so the board never shows one
   person at two different standings depending on when they posted.
   ------------------------------------------------------------------ */
const { db, TIERS, RATINGS } = require('./db');
const members = require('./members');
const { layout, esc } = require('./ui');

const opts = (list, sel) => list.map(v => {
  const pair = Array.isArray(v) ? v : [v, v];
  return '<option value="' + esc(pair[0]) + '"' +
         (String(sel) === String(pair[0]) ? ' selected' : '') + '>' + esc(pair[1]) + '</option>';
}).join('');

function when(iso) {
  const d = new Date(iso);
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function page(user, flash, filter, resetLink, invites, inviteLink) {
  const rows = members.all(filter);
  const n = f => members.all(f).length;

  const tab = (id, label, count) =>
    '<a class="pill' + ((filter || '') === id ? ' on' : '') + '" href="/admin/members' +
    (id ? '?show=' + id : '') + '">' + esc(label) + ' <b>' + count + '</b></a>';

  const body = rows.map(m => {
    const st = members.standing(m);
    const medal = st.rating && RATINGS[st.rating]
      ? '<span class="badge ' + (RATINGS[st.rating].key === 'gold' ? 'ex' : 'draft') + '">' +
        esc(RATINGS[st.rating].label) + '</span>' : '';
    return '<tr>' +
      '<td><b>' + esc(m.company || m.name) + '</b>' + (m.role === 'super_admin' ? ' <span class="badge ex">Owner</span>' : m.role === 'helper' ? ' <span class="badge new">Helper</span>' : '') + '<br><span class="dim">' + esc(m.name) + '</span></td>' +
      '<td><span class="kind ' + (m.side === 'buyer' ? 'need' : 'offer') + '">' +
        esc(m.side === 'seller' ? 'Sells' : m.side === 'buyer' ? 'Buys' : 'Both') + '</span></td>' +
      '<td class="private">' + esc(m.email) + '<br><span class="dim">' + esc(m.phone) +
        (m.region ? ' · ' + esc(m.region) : '') + '</span></td>' +
      '<td>' + m.posts + (m.waiting ? ' <span class="badge new">' + m.waiting + ' waiting</span>' : '') + '</td>' +
      '<td><span class="tierdot ' + esc(st.tier) + '"></span>' + esc(st.tierLabel) + ' ' + medal +
        (st.deals ? '<br><span class="dim">' + st.deals + ' closed</span>' : '') + '</td>' +
      '<td class="dim mono">' + when(m.created_at) + '</td>' +
      '<td class="right nowrap">' +
        '<form method="post" action="/admin/members" class="standing-form">' +
        '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
        '<input type="hidden" name="id" value="' + m.id + '">' +
        '<select name="tier">' + opts(Object.keys(TIERS).map(k => [k, TIERS[k].short]), st.tier) + '</select>' +
        '<select name="rating">' + opts([['', 'No stage']].concat(
            Object.keys(RATINGS).map(k => [k, RATINGS[k].label])), m.rating == null ? '' : m.rating) + '</select>' +
        '<input type="text" name="deals" value="' + esc(String(m.deals || 0)) + '" size="2" title="Deals closed with us">' +
        '<select name="status">' + opts([['active', 'Active'], ['suspended', 'Suspended']], m.status) + '</select>' +
        '<button class="btn btn-primary btn-sm" type="submit">Save</button>' +
        '</form>' +
        '<form method="post" action="/admin/members" style="display:inline">' +
          '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
          '<input type="hidden" name="id" value="' + m.id + '">' +
          '<input type="hidden" name="do" value="reset">' +
          '<button class="btn btn-ghost btn-sm" type="submit" ' +
            'title="Make a link so they can set a new password">Password link</button>' +
        '</form>' +
        '<form method="post" action="/admin/members" style="display:inline">' +
          '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
          '<input type="hidden" name="id" value="' + m.id + '">' +
          '<input type="hidden" name="do" value="role">' +
          '<input type="hidden" name="admin" value="' + (m.role === 'helper' ? '0' : '1') + '">' +
          '<button class="btn btn-ghost btn-sm" type="submit" onclick="return confirm(' +
            esc(JSON.stringify(m.role === 'helper'
              ? 'Stop ' + (m.company || m.name) + ' helping? They lose the admin straight away.'
              : 'Let ' + (m.company || m.name) + ' help run the board? They will be able to answer the chat, look after the lots and keep the prices. They will NOT see the member list or the settings.')) +
          ')">' + (m.role === 'helper' ? 'Stop helping' : 'Let them help') + '</button>' +
        '</form>' +
      '</td></tr>';
  }).join('');

  const table = rows.length
    ? '<div class="card" style="margin-top:1.1rem;overflow-x:auto;padding:.4rem .7rem">' +
      '<table><thead><tr><th>Who</th><th>Side</th><th class="private">How to reach them</th>' +
      '<th>Posts</th><th>Standing</th><th>Joined</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>'
    : '<div class="card" style="margin-top:1.1rem;text-align:center;padding:2.4rem">' +
      '<p class="lede" style="margin:0">' +
      (filter ? 'Nobody here yet.' :
       'Nobody has joined yet. Anyone who wants to post has to make an account first, and they appear here.') +
      '</p></div>';

  return layout({
    title: 'Members', user, active: 'members', flash,
    body:
      '<div class="head"><h1>Members</h1><span class="sub">' + n('') + ' signed up</span></div>' +
      '<p class="lede">The suppliers and exporters who post. Standing set here is written onto everything ' +
      'they have already put up, so one person never shows two different standings on the board.</p>' +
      (resetLink ? '<div class="flash ok"><b>A link for ' + esc(resetLink.who) + '.</b> ' +
        'Send it to them however you already talk. It works once and stops working in an hour.' +
        '<br><code class="resetlink">' + esc(resetLink.link) + '</code></div>' : '') +
      /* Two ways to hand out the work: pick somebody already here, or
         send a link to somebody who is not. The second is for the person
         you have on WhatsApp and not on the board. */
      '<div class="card" style="margin-bottom:1.2rem">' +
        '<b>Somebody to help run the board</b>' +
        '<p class="lede" style="margin:.4rem 0 .9rem">A helper can answer the chat, look after the lots and keep the market prices. ' +
        'They cannot see this member list, change the site text or the contact details, and cannot appoint anybody. ' +
        'Use the button on a row for somebody already here, or send a link to somebody who is not.</p>' +
        '<form method="post" action="/admin/members" class="standing-form">' +
          '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
          '<input type="hidden" name="do" value="invite">' +
          '<input type="text" name="note" placeholder="Who is it for? For your own notes" size="30">' +
          '<button class="btn btn-primary btn-sm" type="submit">Make an invitation link</button>' +
        '</form>' +
        (inviteLink ? '<div class="flash ok" style="margin-top:.9rem"><b>Send this to them.</b> ' +
          'It works once and stops working in two days.<br><code class="resetlink">' + esc(inviteLink) + '</code></div>' : '') +
        ((invites && invites.length) ? '<p class="dim" style="margin:.9rem 0 .3rem">Waiting to be accepted:</p>' +
          invites.map(function(i){
            return '<form method="post" action="/admin/members" style="display:block;margin:.3rem 0">' +
              '<input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
              '<input type="hidden" name="do" value="uninvite">' +
              '<input type="hidden" name="id" value="' + i.id + '">' +
              '<span class="dim mono">' + esc(i.note || '(no name)') + ' · until ' + when(i.expires_at) + '</span> ' +
              '<button class="btn btn-ghost btn-sm" type="submit">Cancel it</button></form>';
          }).join('') : '') +
      '</div>' +
      '<div class="pills">' + tab('', 'Everyone', n('')) + tab('seller', 'Sellers', n('seller')) +
        tab('buyer', 'Buyers', n('buyer')) + tab('unverified', 'Not yet verified', n('unverified')) +
      '</div>' + table
  });
}

module.exports = { page };
