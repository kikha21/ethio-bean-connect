# Putting Ethio Bean Connect online

The site and the platform are one program. `platform/server.js` serves the
public site, substituting the text, contact details, prices and the
marketplace board out of the database as it goes. So this needs a host that
**runs Node**, not the static hosting a plain website would use.

## What a host has to provide

| | |
|---|---|
| **Node 22.5 or newer** | The platform uses `node:sqlite`, which arrived in 22.5. Node 24 is what it was built on. |
| **A disk that survives restarts** | Everything lives in `platform/data/ethiobean.db`. A host that wipes the filesystem on every deploy will throw away every account, post and conversation. This is the one thing to check before paying anyone. |
| **HTTPS** | Needed for phone notifications, and for anyone to trust the form. Every host below does this for free. |

No dependencies to install. `npm install` is only needed if you want to run
the design checker, which is a development tool and not part of the site.

## Starting it

```
npm start
```

That is `node platform/server.js`. It listens on `PORT` if the host sets one,
and on 4400 otherwise, which is what hosts expect.

## The first run

1. Open `/setup`. Make your account. This page closes itself the moment an
   account exists and never opens again.
2. Open `/admin/settings` and put in the real **Website address**, for example
   `https://ethiobeanconnect.com`. Until that is set the link preview tags are
   left out rather than pointing at a placeholder.
3. Check `/admin/prices`. Every row says "On request" until you type a figure.

## Hosts that fit

The thing to look for is a **persistent disk**. Plenty of cheap hosts give you
Node and then quietly reset the filesystem on each deploy, which would lose the
database.

- **A small VPS** (Hetzner, DigitalOcean, Linode) is the most predictable: an
  ordinary machine with an ordinary disk, roughly five to ten dollars a month.
  You install Node, clone this, and keep it running with `systemd` or `pm2`.
- **Render, Railway, Fly.io** will run it from the repository, but the disk must
  be added deliberately as a volume mounted at `platform/data`. Their default
  filesystems do not survive a deploy.
- **Shared hosting and static hosts** (Netlify, Vercel, GitHub Pages, cPanel)
  cannot run this. They can serve the pretty page and nothing behind it.

## Keeping it running on a VPS

```
sudo useradd -r -s /bin/false ebc
sudo mkdir -p /srv/ebc && sudo chown ebc /srv/ebc
```

Put the project in `/srv/ebc`, then a unit file at
`/etc/systemd/system/ebc.service`:

```
[Unit]
Description=Ethio Bean Connect
After=network.target

[Service]
Type=simple
User=ebc
WorkingDirectory=/srv/ebc
Environment=PORT=4400
ExecStart=/usr/bin/node platform/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl enable --now ebc
```

Then put Caddy or nginx in front of it for HTTPS. Caddy is two lines:

```
ethiobeanconnect.com {
    reverse_proxy localhost:4400
}
```

## Backing up

The whole business is one file. Copy it somewhere else on a schedule:

```
sqlite3 platform/data/ethiobean.db ".backup '/backups/ebc-$(date +%F).db'"
```

Accounts, posts, conversations, prices and the site's own wording are all in
there. Losing it loses everything except the design.

## Before you go live

- [ ] Website address set in `/admin/settings`, so link previews work
- [ ] Real prices in `/admin/prices`, or leave them all on "On request"
- [ ] The Amharic in `review/amharic-new-strings.txt` filled in and returned
- [ ] A backup running somewhere that is not the same machine
