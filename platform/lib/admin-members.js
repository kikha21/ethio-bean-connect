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

function page(user, flash, filter) {
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
      '<td><b>' + esc(m.company || m.name) + '</b><br><span class="dim">' + esc(m.name) + '</span></td>' +
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
      '<div class="pills">' + tab('', 'Everyone', n('')) + tab('seller', 'Sellers', n('seller')) +
        tab('buyer', 'Buyers', n('buyer')) + tab('unverified', 'Not yet verified', n('unverified')) +
      '</div>' + table
  });
}

module.exports = { page };
