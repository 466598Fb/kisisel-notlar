#!/bin/bash
set -e

APP_DIR="/opt/personal-notes"

if [ -z "$1" ]; then
  echo "Kullanim: bash restore.sh <yedek_dosyasi>"
  echo ""
  echo "Mevcut yedekler:"
  ls -lh "$APP_DIR/backups/" 2>/dev/null || echo "  Yedek bulunamadi."
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  BACKUP_FILE="$APP_DIR/backups/$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[!] Yedek dosyasi bulunamadi: $1"
  exit 1
fi

echo "[!] Bu islem mevcut verilerin uzerine yazacak!"
read -p "Devam etmek istiyor musunuz? (e/h): " CONFIRM
if [ "$CONFIRM" != "e" ]; then
  echo "Iptal edildi."
  exit 0
fi

echo "[*] Uygulama durduruluyor..."
cd "$APP_DIR"
docker compose down

echo "[*] Yedek geri yukleniyor: $BACKUP_FILE"
tar -xzf "$BACKUP_FILE" -C "$APP_DIR"

echo "[*] Uygulama yeniden baslatiliyor..."
docker compose up -d

echo "[+] Geri yukleme tamamlandi!"
