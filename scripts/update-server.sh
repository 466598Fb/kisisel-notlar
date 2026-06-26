#!/bin/bash
set -e

APP_DIR="/opt/personal-notes"
cd "$APP_DIR"

echo ""
echo "[*] Kisisel Notlar - Guncelleme"
echo ""

echo "[*] Once yedek aliniyor..."
bash "$APP_DIR/scripts/backup.sh"

echo "[*] Docker imaji yeniden olusturuluyor..."
docker compose build --no-cache

echo "[*] Konteyner yeniden baslatiliyor..."
docker compose down
docker compose up -d

echo ""
echo "[+] Guncelleme tamamlandi!"
echo "[*] Eski imajlari temizlemek icin: docker image prune -f"
echo ""
