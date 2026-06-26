#!/bin/bash
set -e

APP_DIR="/opt/personal-notes"
BACKUP_DIR="$APP_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[*] Yedekleme basliyor..."

tar -czf "$BACKUP_FILE" \
  -C "$APP_DIR" \
  data/ \
  .env \
  2>/dev/null || true

echo "[+] Yedek olusturuldu: $BACKUP_FILE"

BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 10 ]; then
  echo "[*] Eski yedekler temizleniyor (son 10 tutuluyor)..."
  ls -1t "$BACKUP_DIR"/backup_*.tar.gz | tail -n +11 | xargs rm -f
fi

echo "[+] Yedekleme tamamlandi."
