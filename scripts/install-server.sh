#!/bin/bash
set -e

echo ""
echo "============================================"
echo "  Kisisel Notlar - Sunucu Kurulumu"
echo "============================================"
echo ""

if ! command -v docker &> /dev/null; then
  echo "[!] Docker bulunamadi. Kuruluyor..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "[+] Docker kuruldu."
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  echo "[!] Docker Compose bulunamadi. Kuruluyor..."
  apt-get update && apt-get install -y docker-compose-plugin
  echo "[+] Docker Compose kuruldu."
fi

APP_DIR="/opt/personal-notes"
echo "[*] Uygulama dizini: $APP_DIR"
mkdir -p "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$APP_DIR/.env" << ENVEOF
PORT=3000
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=degistir-beni
JWT_SECRET=$JWT_SECRET
DB_TYPE=sqlite
SQLITE_PATH=/app/data/notes.db
ALLOWED_ORIGINS=
RATE_LIMIT_MAX=100
ENVEOF
  echo "[+] .env dosyasi olusturuldu. Lutfen sifreleri degistirin: $APP_DIR/.env"
else
  echo "[*] .env zaten mevcut, dokunulmadi."
fi

cp -r "$(dirname "$0")/../"* "$APP_DIR/" 2>/dev/null || true
cp "$(dirname "$0")/../.env.example" "$APP_DIR/.env.example" 2>/dev/null || true
cp "$(dirname "$0")/../.dockerignore" "$APP_DIR/.dockerignore" 2>/dev/null || true

cd "$APP_DIR"

echo "[*] Docker imaji olusturuluyor..."
docker compose build

echo "[*] Uygulama baslatiliyor..."
docker compose up -d

echo ""
echo "============================================"
echo "  Kurulum Tamamlandi!"
echo "============================================"
echo ""
echo "  Uygulama: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "  Onemli: $APP_DIR/.env dosyasindaki sifreleri degistirin!"
echo ""
echo "  Yonetim komutlari:"
echo "    Baslat : cd $APP_DIR && docker compose up -d"
echo "    Durdur : cd $APP_DIR && docker compose down"
echo "    Loglar : cd $APP_DIR && docker compose logs -f"
echo "    Yedekle: bash $APP_DIR/scripts/backup.sh"
echo ""
