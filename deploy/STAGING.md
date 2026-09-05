# Staging deployment — Lunch Management System

Self-hosted deployment guide for Ubuntu with **Apache 2**, HTTPS (later), systemd, and an externally hosted Supabase project.

This application is **not** deployed to Vercel. The production build runs on the server with:

```bash
npm ci
npm run build
npm run start
```

---

## Architecture

```text
Internet
   │
   ▼
Apache 2 (port 80/443, public)
   │  reverse proxy
   ▼
Next.js (127.0.0.1:3000, localhost only)
   │
   ▼
Supabase (hosted externally)
```

The staging Apache vhost is **additive**. Existing sites under `/etc/apache2/sites-available` are not modified.

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| OS | Ubuntu 22.04 LTS or 24.04 LTS |
| Node.js | **>= 20.9.0** (Next.js 16 minimum). **Recommended: Node.js 22 LTS** |
| npm | Bundled with Node.js (npm 10+) |
| Apache | 2.4+ (already installed on staging server) |
| Git | 2.x |
| Supabase | Hosted project with migrations applied |

The repository includes `.nvmrc` (`20.9.0`) as the documented minimum. Use Node 22 LTS on new servers when possible.

---

## Server directory layout

```text
/var/www/lunch-management-system/              Application checkout (owned by lunchapp)
/etc/lunch-management/staging.env                Environment file (outside repo, not in Git)
/etc/systemd/system/lunch-management-staging.service
/etc/apache2/sites-available/lunch-management-staging.conf
/etc/apache2/sites-enabled/lunch-management-staging.conf -> ../sites-available/...
/var/www/certbot/                                Optional ACME webroot for Certbot
```

Templates in this repository:

```text
deploy/
├── STAGING.md
├── apache/lunch-management-staging.conf
├── env/staging.env.example
├── nginx/DEPRECATED.md                          (old Nginx template removed)
└── systemd/lunch-management-staging.service
```

---

## 1. Ubuntu prerequisites

Apache is already installed on the staging server. Install remaining packages:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git certbot python3-certbot-apache
```

Optional firewall (adjust if ufw is already configured for Apache):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full'
sudo ufw enable
```

---

## 2. Install Node.js

**Recommended: Node.js 22 LTS via NodeSource**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # should be v22.x
npm -v
```

**Alternative: nvm (same user that deploys)**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

If Node is installed outside `/usr/bin`, update `ExecStart` in the systemd unit to use the correct `node`/`npm` path.

Verify minimum version:

```bash
node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]>20||(v[0]===20&&v[1]>=9)?0:1)"
```

---

## 3. Create dedicated service account

```bash
sudo useradd --system --create-home --home-dir /var/www/lunch-management-system --shell /usr/sbin/nologin lunchapp
sudo mkdir -p /var/www/lunch-management-system
sudo chown -R lunchapp:lunchapp /var/www/lunch-management-system
```

---

## 4. Clone the repository

As a deploy user with sudo access:

```bash
sudo -u lunchapp git clone <YOUR_GIT_REPOSITORY_URL> /var/www/lunch-management-system
cd /var/www/lunch-management-system
sudo -u lunchapp git checkout master   # or your staging branch
```

---

## 5. Configure environment (outside repository)

```bash
sudo mkdir -p /etc/lunch-management
sudo cp /var/www/lunch-management-system/deploy/env/staging.env.example /etc/lunch-management/staging.env
sudo nano /etc/lunch-management/staging.env
sudo chown root:lunchapp /etc/lunch-management/staging.env
sudo chmod 640 /etc/lunch-management/staging.env
```

Required variables (use real values on the server only):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `NODE_ENV` | `production` |
| `HOSTNAME` | `127.0.0.1` (localhost bind) |
| `PORT` | `3000` |

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to this application.

---

## 6. Install dependencies and build

```bash
cd /var/www/lunch-management-system
sudo -u lunchapp npm ci
sudo -u lunchapp npm run build
```

Quick smoke test (optional, bind locally):

```bash
sudo -u lunchapp env $(grep -v '^#' /etc/lunch-management/staging.env | xargs) npm run start
# Ctrl+C after verifying: curl http://127.0.0.1:3000
```

---

## 7. Install systemd service

```bash
sudo cp /var/www/lunch-management-system/deploy/systemd/lunch-management-staging.service \
  /etc/systemd/system/lunch-management-staging.service

# If npm is not at /usr/bin/npm, edit ExecStart before enabling.
sudo systemctl daemon-reload
sudo systemctl enable lunch-management-staging
sudo systemctl start lunch-management-staging
sudo systemctl status lunch-management-staging
```

The service binds Next.js to **127.0.0.1:3000** only. Port 3000 must remain free on the server.

---

## 8. Enable required Apache modules

On the staging server, `rewrite_module` is already enabled. Enable proxy and header modules before adding the vhost:

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod headers
```

Enable `ssl` only when configuring HTTPS (section 9):

```bash
sudo a2enmod ssl
```

Reload Apache after enabling modules:

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### Apache modules summary

| Module | Required when | Purpose |
|--------|---------------|---------|
| `proxy` | Always | Core reverse proxy |
| `proxy_http` | Always | HTTP reverse proxy to Next.js |
| `proxy_wstunnel` | Always | WebSocket / upgrade support |
| `headers` | Always | `RequestHeader` for forwarded proto/port |
| `rewrite` | Always | WebSocket rewrite rules (already enabled) |
| `ssl` | HTTPS only | TLS termination |

---

## 9. Configure Apache virtual host

Replace `STAGING_HOSTNAME` in the template (e.g. `lunch-staging.comp.com`):

```bash
sudo cp /var/www/lunch-management-system/deploy/apache/lunch-management-staging.conf \
  /etc/apache2/sites-available/lunch-management-staging.conf

sudo nano /etc/apache2/sites-available/lunch-management-staging.conf

sudo a2ensite lunch-management-staging.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Verify:

```bash
curl -I http://STAGING_HOSTNAME
curl http://127.0.0.1:3000
```

### Apache logs (separate from other sites)

```bash
sudo tail -f /var/log/apache2/lunch-management-staging-access.log \
             /var/log/apache2/lunch-management-staging-error.log
```

---

## 10. HTTPS with Certbot (configure later)

Ensure DNS for `STAGING_HOSTNAME` points to this server before proceeding.

**Recommended — Apache plugin (after HTTP vhost works):**

```bash
sudo a2enmod ssl
sudo certbot --apache -d STAGING_HOSTNAME
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Certbot will obtain certificates and update Apache configuration. Do **not** hardcode certificate paths in the repository template until certificates exist on the server.

**Alternative — webroot (HTTP-only vhost already includes `/.well-known/acme-challenge/`):**

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d STAGING_HOSTNAME
```

After certificates exist, either run `certbot --apache` or manually add a `:443` VirtualHost using paths such as:

- `/etc/letsencrypt/live/STAGING_HOSTNAME/fullchain.pem`
- `/etc/letsencrypt/live/STAGING_HOSTNAME/privkey.pem`

Set `RequestHeader set X-Forwarded-Proto "https"` and `X-Forwarded-Port "443"` on the SSL vhost.

Verify renewal:

```bash
sudo certbot renew --dry-run
```

Update Supabase **Site URL** to `https://STAGING_HOSTNAME` after HTTPS is live.

---

## 11. Supabase dashboard (staging)

Configure the hosted Supabase project:

1. **Authentication → URL Configuration**
   - Site URL: `http://STAGING_HOSTNAME` initially, then `https://STAGING_HOSTNAME` after TLS
   - Redirect URLs: `https://STAGING_HOSTNAME/**`
2. **Authentication → Emails** — SMTP (SMTP2Go) and email confirmation enabled
3. **Confirm signup email template** — token-hash link:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
4. Apply all database migrations to the hosted project
5. Promote at least one staging admin in `public.profiles`

---

## 12. Operating the application

### Start / stop / restart

```bash
sudo systemctl start lunch-management-staging
sudo systemctl stop lunch-management-staging
sudo systemctl restart lunch-management-staging
sudo systemctl status lunch-management-staging
```

### Application logs

```bash
sudo journalctl -u lunch-management-staging -f
sudo journalctl -u lunch-management-staging --since "1 hour ago"
```

### Apache reload after config changes

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

## 13. Safe update procedure

```bash
cd /var/www/lunch-management-system

# Record current commit for rollback
sudo -u lunchapp git rev-parse HEAD | sudo tee /var/backups/lunch-management-last-good-commit.txt

sudo -u lunchapp git fetch origin
sudo -u lunchapp git checkout master        # or staging branch
sudo -u lunchapp git pull origin master

sudo -u lunchapp npm ci
sudo -u lunchapp npm run build

sudo systemctl restart lunch-management-staging
sudo systemctl status lunch-management-staging
```

Verify the site, login, and a sample order flow.

---

## 14. Rollback procedure

```bash
cd /var/www/lunch-management-system
PREVIOUS=$(cat /var/backups/lunch-management-last-good-commit.txt)

sudo -u lunchapp git checkout "$PREVIOUS"
sudo -u lunchapp npm ci
sudo -u lunchapp npm run build
sudo systemctl restart lunch-management-staging
```

If the previous commit is unknown:

```bash
sudo -u lunchapp git log --oneline -10
sudo -u lunchapp git checkout <known-good-commit>
sudo -u lunchapp npm ci && sudo -u lunchapp npm run build
sudo systemctl restart lunch-management-staging
```

---

## Security considerations

- Next.js listens on **127.0.0.1:3000 only**; Apache is public-facing
- Secrets live in `/etc/lunch-management/staging.env`, not in Git
- No service-role key in the Next.js app
- systemd unit uses a dedicated non-root `lunchapp` user
- Staging vhost uses separate Apache access/error logs
- Existing Apache sites are untouched; only the new vhost is enabled
- Keep Ubuntu, Node.js, and Apache patched
- Restrict SSH access; use key-based authentication
- Supabase RLS and RPC authorization enforce data access server-side

---

## Production (HostGator dedicated server)

Use the same pattern:

1. Copy templates to `lunch-management-production.service` and a production Apache vhost
2. Use `/etc/lunch-management/production.env`
3. Point Supabase Site URL / redirect URLs to the production hostname
4. Use separate Supabase project or branch strategy if staging and production must be isolated
