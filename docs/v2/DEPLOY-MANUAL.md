# Deploying MindSpace v2 by hand, without Docker

For one Ubuntu 24.04 server with a domain. **Written from the code, not yet run on a real server.** Do one dry run on a fresh VM first.

Suggested server: 2 vCPU, 4 GB RAM, 40 GB disk. The heavy AI work runs at the provider.

## 1. Packages

```bash
sudo apt update && sudo apt install -y curl git ffmpeg build-essential ufw
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash - && sudo apt install -y nodejs
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-18 redis-server
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Check versions: `node -v` should be 26, `psql --version` 18, and `ffmpeg -version` must work.

## 2. Database and Redis

```bash
sudo -u postgres createuser mindspace -P
sudo -u postgres createdb -O mindspace mindspace
```
Redis: in `/etc/redis/redis.conf` keep `bind 127.0.0.1` and set `requirepass`. Then `sudo systemctl restart redis-server`.

## 3. Code and build

```bash
sudo useradd -r -m -d /srv/mindspace mindspace
sudo -iu mindspace git clone <your repo> app && cd app && git checkout v2/backend
npm ci
npm run build -w @mindspace/contracts && npm run build -w @mindspace/api && npm run build -w @mindspace/web
sudo install -d -o mindspace -g mindspace /srv/mindspace/audio /etc/mindspace
```
Commit the root `package-lock.json` before deploying, since `npm ci` requires it. It is currently gitignored.

## 4. Secrets: `/etc/mindspace/api.env`, mode 600

```
NODE_ENV=production
PORT=18080
DATABASE_URL=postgres://mindspace:<db password>@127.0.0.1:5432/mindspace
REDIS_URL=redis://:<redis password>@127.0.0.1:6379
DB_POOL_MAX=20
JWT_SECRET=<openssl rand -hex 32>
BYOK_MASTER_KEY=<openssl rand -base64 32>
CORS_ORIGINS=https://yourdomain.com
AUDIO_DIR=/srv/mindspace/audio
OPENROUTER_API_KEY=<your key>
```
Never set `ALLOW_TEST_PAY` in production; the API refuses to start with it. Back up `BYOK_MASTER_KEY`: losing it makes every saved user key unreadable.

Load the schema: `sudo -iu mindspace bash -c 'cd app && set -a && . /etc/mindspace/api.env && node apps/api/dist/main.migrate.js'`. Use this instead of `docs/v2/sql/mindspace.sql`, so later migrations keep applying.

## 5. Services

`/etc/systemd/system/mindspace-api.service`:
```
[Unit]
After=network.target postgresql.service redis-server.service
[Service]
User=mindspace
WorkingDirectory=/srv/mindspace/app/apps/api
EnvironmentFile=/etc/mindspace/api.env
ExecStart=/usr/bin/node dist/main.http.js
Restart=always
[Install]
WantedBy=multi-user.target
```
Copy it to `mindspace-worker.service` with `ExecStart=/usr/bin/node dist/main.worker.js`, and to `mindspace-web.service` with `WorkingDirectory=/srv/mindspace/app/apps/web`, the web variables from `apps/web/.env.example`, and `ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3000`. Then:
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now mindspace-api mindspace-worker mindspace-web
```

## 6. HTTPS: `/etc/caddy/Caddyfile`

```
yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
api.yourdomain.com {
  reverse_proxy 127.0.0.1:18080 {
    flush_interval -1
  }
}
```
`flush_interval -1` keeps live recording status working. Point both DNS A records at the server, then `sudo systemctl reload caddy`. Caddy obtains certificates automatically.

## 7. Firewall and backups

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```
Nightly cron for the `mindspace` user:
```
0 3 * * * pg_dump -Fc mindspace > /srv/mindspace/backups/db-$(date +\%F).dump && tar czf /srv/mindspace/backups/audio-$(date +\%F).tgz -C /srv/mindspace audio && find /srv/mindspace/backups -mtime +14 -delete
```
Copy backups off the server, and test a restore with `pg_restore -d <empty db>`.

## 8. Updating

```bash
cd /srv/mindspace/app && git pull && npm ci && npm run build -w @mindspace/contracts -w @mindspace/api -w @mindspace/web
set -a && . /etc/mindspace/api.env && node apps/api/dist/main.migrate.js
sudo systemctl restart mindspace-api mindspace-worker mindspace-web
```
