#!/usr/bin/env bash
# Send the current site to the live server.
#
#   bash deploy/push.sh root@1.2.3.4                # every edit after the first
#   bash deploy/push.sh root@1.2.3.4 --first-time   # also carries the database over
#
# What it never sends is platform/data. That folder is the accounts, the
# lots and the conversations, and on the server it lives somewhere else
# entirely. Sending it would replace real customer data with whatever
# happens to be on this laptop.
set -euo pipefail

TARGET="${1:-}"
FIRST="${2:-}"
[ -z "$TARGET" ] && { echo "usage: bash deploy/push.sh user@server [--first-time]"; exit 1; }

cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d-%H%M%S)

echo "== packing the site =="
tar czf "/tmp/ebc-$STAMP.tgz" \
  --exclude='platform/data' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='review' \
  --exclude='*.log' \
  ethio-bean-connect platform package.json deploy

echo "== sending it =="
scp -q "/tmp/ebc-$STAMP.tgz" "$TARGET:/tmp/"

if [ "$FIRST" = "--first-time" ]; then
  echo "== carrying the database over, this once =="
  # the running site must be stopped first, or we copy a half-written file
  ssh "$TARGET" "systemctl stop ethiobean 2>/dev/null || true"
  scp -q platform/data/ethiobean.db "$TARGET:/var/lib/ethiobean/ethiobean.db"
fi

echo "== putting it live =="
ssh "$TARGET" bash -s <<REMOTE
set -euo pipefail

# keep the last version, so a bad push can be undone in one command
if [ -d /srv/ethiobean/platform ]; then
  rm -rf /srv/ethiobean.previous
  cp -a /srv/ethiobean /srv/ethiobean.previous
fi

rm -rf /srv/ethiobean/ethio-bean-connect /srv/ethiobean/platform
tar xzf /tmp/ebc-$STAMP.tgz -C /srv/ethiobean
rm -f /tmp/ebc-$STAMP.tgz
chown -R ebc:ebc /srv/ethiobean /var/lib/ethiobean

install -m644 /srv/ethiobean/deploy/ethiobean.service /etc/systemd/system/ethiobean.service
install -m644 /srv/ethiobean/deploy/Caddyfile /etc/caddy/Caddyfile

chmod +x /srv/ethiobean/deploy/backup.sh
install -m644 /srv/ethiobean/deploy/ethiobean-backup.service /etc/systemd/system/
install -m644 /srv/ethiobean/deploy/ethiobean-backup.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now ethiobean
systemctl enable --now ethiobean-backup.timer
systemctl restart ethiobean
systemctl reload caddy 2>/dev/null || systemctl restart caddy

sleep 2
systemctl is-active --quiet ethiobean && echo "   the site is running" || {
  echo "   IT DID NOT START:"; journalctl -u ethiobean -n 20 --no-pager; exit 1;
}
REMOTE

rm -f "/tmp/ebc-$STAMP.tgz"
echo
echo "Live. Check https://ethiobeanconnect.com"
echo "To undo this push:  ssh $TARGET 'rm -rf /srv/ethiobean && mv /srv/ethiobean.previous /srv/ethiobean && systemctl restart ethiobean'"
