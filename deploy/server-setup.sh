#!/usr/bin/env bash
# Run this ONCE on a fresh Ubuntu server, as root.
#   scp deploy/server-setup.sh root@YOUR_SERVER:/tmp/
#   ssh root@YOUR_SERVER bash /tmp/server-setup.sh
set -euo pipefail

DOMAIN="${DOMAIN:-ethiobeanconnect.com}"

echo "== a user that is not root, because the site does not need to be =="
id ebc >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/ebc --shell /usr/sbin/nologin ebc

echo "== node 22, which is what node:sqlite needs =="
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "== caddy, for a certificate that renews itself =="
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

echo "== the two folders: code here, data somewhere a deploy never touches =="
mkdir -p /srv/ethiobean /var/lib/ethiobean /var/log/caddy
chown -R ebc:ebc /srv/ethiobean /var/lib/ethiobean

echo "== sqlite3, so backups can be taken while the site runs =="
apt-get install -y sqlite3

echo "== a nightly backup, kept for 30 days =="
mkdir -p /var/backups/ethiobean

echo "== only ssh and the web are reachable from outside =="
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; ufw --force enable
fi

echo
echo "Server is ready. Now push the site from your machine:"
echo "    bash deploy/push.sh root@THIS_SERVER --first-time"
