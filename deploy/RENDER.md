# Putting Ethio Bean Connect on Render

## Read this first

Render wipes the filesystem on **every deploy and every restart**. This
application keeps everything - accounts, lots, conversations, settings -
in a single SQLite file. Put the two together without a disk and every
customer you have is destroyed each time you publish a change, and it
looks like data loss rather than a setting nobody turned on.

So there is one hard requirement:

> **The service must be a paid instance with a disk attached.**
> Render has no free plan that keeps a file between restarts.

`render.yaml` already asks for that disk. Do not remove it, and do not
move the service to the free plan later "to save money" - the money it
saves is the customer list.

Roughly $7 a month for the instance, plus about $0.25 for the 1 GB disk.

## Steps

1. Put this project in a GitHub repository.

2. On **dashboard.render.com** choose **New -> Blueprint** and point it at
   that repository. Render reads `render.yaml` and creates the service,
   the disk and the environment variables by itself.

3. Deploy. The first boot copies `deploy/seed/ethiobean.db` onto the empty
   disk, so the site comes up with your existing accounts and lots rather
   than blank. Every deploy after that leaves the disk alone.

4. Your own domain: **Settings -> Custom Domain**, add
   `ethiobeanconnect.com`, and Render tells you the DNS record to create.
   The certificate is handled for you.

## What the settings do

| setting | why |
|---|---|
| `disk` at `/var/data` | the only thing standing between you and losing every customer on the next deploy |
| `EBC_DATA_DIR=/var/data` | tells the app to keep its database on that disk, not beside the code |
| `EBC_TRUST_PROXY=1` | Render terminates TLS in front, so the visitor's real address arrives in a header. Without this every visitor looks like one person and the rate limits lock out the whole country at once |
| `healthCheckPath: /healthz` | reads the database, not just the process, so an instance that is running but cannot see its data is treated as down |
| `buildCommand` | `npm run build` runs `deploy/check.js`, which fails the deploy on a file that does not parse or a missing asset, instead of publishing it |

## The seed, after the first deploy

`deploy/seed/ethiobean.db` is a snapshot taken when this was packaged. It
is used **only** when the disk is empty. Once real customers are using the
live site, that file is stale by definition - it is a starting point, not
a backup, and it is never written back over live data.

Take real backups from the running service instead:

    render ssh <service>            # then, on the instance:
    sqlite3 /var/data/ethiobean.db ".backup /tmp/backup.db"

## Still unfinished

- Email is not configured, so password resets are handed over by hand
  from the admin members screen.
- Some newer wording is English only; see `review/amharic-new-strings.txt`.
