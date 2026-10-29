#!/usr/bin/env bash
set -euo pipefail
# Run on an Oracle Cloud Always Free Ubuntu ARM64 VM as a sudo-capable user.
REPO_URL="https://github.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser.git"
BRANCH="fix/free-api-local-gguf-engine-20261018"
APP_DIR="/opt/goldfiredragon"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo mkdir -p "$APP_DIR"
sudo chown "$(id -un):$(id -gn)" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi
cd "$APP_DIR"
rm -rf site-dist
node scripts/build-static-site.mjs
sudo tee /etc/systemd/system/goldfiredragon.service >/dev/null <<'EOF'
[Unit]
Description=GoldFireDragon Node.js Browser Server
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/goldfiredragon
Environment=NODE_ENV=production
Environment=PORT=8787
Environment=GFD_WEB_GATEWAY_HOST=127.0.0.1
Environment=GFD_STATIC_ROOT=/opt/goldfiredragon/site-dist
ExecStart=/usr/bin/node /opt/goldfiredragon/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
sudo chmod -R a+rX "$APP_DIR"
sudo tee /etc/nginx/sites-available/goldfiredragon >/dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/goldfiredragon /etc/nginx/sites-enabled/goldfiredragon
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now goldfiredragon
sudo systemctl enable --now nginx
sudo systemctl restart goldfiredragon nginx
curl -fsS http://127.0.0.1:8787/api/gateway/status
echo
echo "Node.js server is running. Open TCP 80 in Oracle VCN security rules, and configure HTTPS using your domain before production use."
