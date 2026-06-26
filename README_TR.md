# Kisisel Notlar v3.0

PC ve telefondan erisilen, gercek zamanli senkronize, self-hosted not uygulamasi.

## Ozellikler

- Zengin metin editoru (Quill): kalin, italik, baslik, liste, renk, link
- Koyu / acik tema
- Not icinde ve tum notlarda arama
- Notlari sabitleme ve renklendirme
- PWA destegi (telefona kurulabilir)
- Socket.IO ile gercek zamanli senkronizasyon
- JWT ile guvenli kimlik dogrulama
- SQLite (basit) veya PostgreSQL (production) secenegi
- Docker ile kolay VPS kurulumu

---

## 1. Windows'ta Lokal Test

```
1. install.bat calistirin (Node.js gerekli)
2. start.bat calistirin
3. Tarayicida http://localhost:3000 acin
4. Kullanici: admin / Sifre: 1234
```

---

## 2. VPS Kurulumu (Docker)

### On Kosullar
- Ubuntu 20.04+ veya Debian 11+ VPS
- Root veya sudo erisimi

### Adimlar

```bash
# 1. Dosyalari sunucuya yukleyin
scp personal-notes.zip root@SUNUCU_IP:/root/

# 2. Sunucuya baglanin
ssh root@SUNUCU_IP

# 3. Dosyalari acin
apt install -y unzip
unzip personal-notes.zip -d /opt/personal-notes

# 4. Kurulum scriptini calistirin
cd /opt/personal-notes
bash scripts/install-server.sh

# 5. .env dosyasini duzenleyin (sifreleri degistirin!)
nano /opt/personal-notes/.env
```

### .env Ayarlari (Onemli!)

```env
ADMIN_USERNAME=kullanici_adiniz
ADMIN_PASSWORD=guclu_sifre_buraya
JWT_SECRET=openssl-rand-hex-32-ile-olusturun
```

JWT_SECRET olusturmak icin:
```bash
openssl rand -hex 32
```

---

## 3. Domain Baglama (Opsiyonel)

### Secenekler:

### A) Cloudflare Tunnel (En Kolay - Port acmaya gerek yok)

```bash
# 1. cloudflared kurun
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared

# 2. Cloudflare hesabiniza baglayin
cloudflared tunnel login

# 3. Tunnel olusturun
cloudflared tunnel create notlarim

# 4. DNS kaydi ekleyin
cloudflared tunnel route dns notlarim notlarim.domain.com

# 5. Yapilandirma dosyasi
cat > ~/.cloudflared/config.yml << EOF
tunnel: TUNNEL_ID_BURAYA
credentials-file: /root/.cloudflared/TUNNEL_ID_BURAYA.json
ingress:
  - hostname: notlarim.domain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# 6. Servisi baslatin
cloudflared service install
systemctl start cloudflared
```

Artik `https://notlarim.domain.com` adresinden erisin.

### B) Nginx Reverse Proxy + Let's Encrypt

```bash
# 1. Nginx ve Certbot kurun
apt install -y nginx certbot python3-certbot-nginx

# 2. Nginx yapilandirmasi
cat > /etc/nginx/sites-available/notlarim << 'EOF'
server {
    listen 80;
    server_name notlarim.domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/notlarim /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 3. SSL sertifikasi
certbot --nginx -d notlarim.domain.com
```

---

## 4. PostgreSQL Kullanimi (Opsiyonel)

docker-compose.yml icindeki postgres bolumunu aktif edin, ardindan:

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://notlar:sifre123@postgres:5432/notlar
```

```bash
docker compose down
docker compose up -d
```

---

## 5. Yedekleme ve Geri Yukleme

```bash
# Yedekle
bash /opt/personal-notes/scripts/backup.sh

# Yedekleri listele
ls -lh /opt/personal-notes/backups/

# Geri yukle
bash /opt/personal-notes/scripts/restore.sh backup_20240101_120000.tar.gz
```

---

## 6. Guncelleme

```bash
# Yeni dosyalari sunucuya yukleyin, sonra:
bash /opt/personal-notes/scripts/update-server.sh
```

---

## 7. Yonetim Komutlari

```bash
# Durum
docker compose ps

# Loglar
docker compose logs -f

# Yeniden baslat
docker compose restart

# Durdur
docker compose down

# Baslat
docker compose up -d
```

---

## 8. PWA (Telefona Kurma)

1. Telefondan `https://notlarim.domain.com` adresini acin
2. Chrome: Menu > "Ana ekrana ekle"
3. Safari: Paylas > "Ana Ekrana Ekle"
4. Artik uygulamayi ana ekrandan acabilirsiniz

---

## 9. Guvenlik Onerileri

- `.env` dosyasindaki sifreleri mutlaka degistirin
- JWT_SECRET icin `openssl rand -hex 32` kullanin
- ALLOWED_ORIGINS'e sadece kendi domaininizi yazin
- Duzenliu yedek alin
- VPS'te firewall (ufw) aktif edin:
  ```bash
  ufw allow 22
  ufw allow 80
  ufw allow 443
  ufw enable
  ```
