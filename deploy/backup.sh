#!/usr/bin/env bash
# A backup of the whole business, taken while the site keeps running.
#
# Copying a live SQLite file with cp is not a backup: writes can land
# halfway through the copy and what you keep is a file that will not
# open. ".backup" asks SQLite to make a consistent copy of its own,
# which is safe to take at any moment without stopping the site.
set -euo pipefail

DB="${EBC_DATA_DIR:-/var/lib/ethiobean}/ethiobean.db"
OUT="/var/backups/ethiobean"
KEEP_DAYS=30

mkdir -p "$OUT"
STAMP=$(date +%Y-%m-%d-%H%M)
FILE="$OUT/ethiobean-$STAMP.db"

sqlite3 "$DB" ".backup '$FILE'"
gzip -f "$FILE"

# a backup nobody ever restored is a guess. Prove this one opens.
gunzip -c "$FILE.gz" > /tmp/verify-$STAMP.db
COUNT=$(sqlite3 /tmp/verify-$STAMP.db "SELECT COUNT(*) FROM users;")
rm -f /tmp/verify-$STAMP.db
if [ "$COUNT" -lt 1 ]; then
  echo "BACKUP LOOKS WRONG: no users in $FILE.gz" >&2
  exit 1
fi

find "$OUT" -name 'ethiobean-*.db.gz' -mtime +$KEEP_DAYS -delete
echo "$(date -Is)  backed up $COUNT accounts -> $FILE.gz"
