# Ethio Bean Connect on a DigitalOcean droplet

## What you do

### 1. Make the droplet

At **cloud.digitalocean.com** -> Create -> Droplets:

| choose | value |
|---|---|
| Image | **Ubuntu 24.04 LTS** |
| Type | Basic, Regular SSD |
| Size | **$6/month** - 1 GB RAM, 1 CPU, 25 GB |
| Region | **Frankfurt** or **London** (closest to Ethiopia of what they offer) |
| Authentication | **SSH Key** - paste the key below |
| Hostname | ethiobean |

The SSH key from this machine:

    ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICrl8HoT1OIK2nmADrvqtkTHACzi3Id+8jwZyOzXfqot kikharobi21@gmail.com

Choose SSH Key, not password. A password droplet on a public address is
found by scanners within the hour, every hour, forever.

### 2. Buy the domain

At **dash.cloudflare.com** -> Domain Registration -> register
`ethiobeanconnect.com`. Around $10.44 for the year, sold at cost.

### 3. Point the domain at the droplet

In Cloudflare -> DNS, two records, using the droplet's IP address:

| type | name | content | proxy |
|---|---|---|---|
| A | `@` | your droplet IP | **DNS only (grey cloud)** |
| A | `www` | your droplet IP | **DNS only (grey cloud)** |

Grey cloud matters. Caddy gets its certificate by answering a challenge
on port 80, and Cloudflare's orange cloud intercepts that and the
certificate never arrives. Turn the proxy on afterwards if you want it.

### 4. Send me the IP address

## What I do

    scp deploy/server-setup.sh root@YOUR_IP:/tmp/
    ssh root@YOUR_IP bash /tmp/server-setup.sh
    bash deploy/push.sh root@YOUR_IP --first-time

That installs Node 22, Caddy, sqlite3, the firewall, the service and the
nightly backup, then sends the site and starts it.

## Afterwards

Publishing a change is one command:

    bash deploy/push.sh root@YOUR_IP

It keeps the previous version, and prints the command to undo the push if
something looks wrong.

## What is protecting you

| | |
|---|---|
| `Restart=always` | node coming back by itself if it dies at 3am |
| `WantedBy=multi-user.target` | the site returning by itself after a reboot |
| `EBC_DATA_DIR=/var/lib/ethiobean` | the database living where a deploy cannot overwrite it |
| `EBC_TRUST_PROXY=1` | real visitor addresses through Caddy, so the rate limits do not treat the whole country as one person |
| nightly `backup.sh` | 30 days of backups, each one opened and counted before it is kept |
| `ufw` | only ssh and the web reachable |

## The backup is the important one

Read it once, because it is the difference between a bad day and losing
the business: copying a live SQLite file with `cp` gives you a file that
may not open. The backup uses SQLite's own `.backup`, which is safe to
take while customers are using the site, then unzips the result and
counts the accounts in it before keeping it. A backup nobody has ever
opened is a guess.

They land in `/var/backups/ethiobean`. To bring one down to your machine:

    scp root@YOUR_IP:/var/backups/ethiobean/ethiobean-2026-09-05-0300.db.gz .

Do that occasionally. Backups that only exist on the same machine as the
thing they are backing up are not backups.
