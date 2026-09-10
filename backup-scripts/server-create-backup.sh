#!/bin/bash
# ============================================================
# Ethio Bean Connect - server-side backup (run on Oracle Cloud)
# Creates a daily snapshot of the database in /backups.
#
# To run this automatically, add a cron job:
#   crontab -e
#   # daily at 06:10
#   10 6 * * * /srv/ebc/backup-scripts/server-create-backup.sh
#
# Keep the last 30 snapshots and delete older ones.
# ============================================================

BACKUP_DIR=/backups
DB_DIR=${EBC_DATA_DIR:-/var/data}
DB_FILE="$DB_DIR/ethiobean.db"

# A timestamped copy. This is a filesystem copy (SQLite's .backup
# command would be cleaner, but a quick copy is fine for a small site
# and doesn't need sqlite3 installed).
datepart=$(date +%F-%H%M)
cp "$DB_FILE" "$BACKUP_DIR/ethiobean-$datepart.db"

# Keep only the 30 most recent snapshots.
ls -1t "$BACKUP_DIR"/ethiobean-*.db | tail -n +31 | xargs -r rm -f

echo "Backup written: $BACKUP_DIR/ethiobean-$datepart.db"
echo "Snapshots kept: $(ls -1 "$BACKUP_DIR"/ethiobean-*.db | wc -l)"