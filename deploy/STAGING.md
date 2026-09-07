# Staging deployment — Lunch Management System

Self-hosted **internal staging** on Ubuntu with **Apache 2.4.58**, **HTTPS (self-signed)**, **systemd**, and an externally hosted Supabase project.

This application is **not** deployed to Vercel. The production build runs on the server with:

```bash
npm ci
npm run build
npm run start
```

> **Internal staging only.** Staging uses **internal DNS** and a **self-signed TLS certificate** by design. Staging admins manually trust the certificate on their workstations. This is not a public internet deployment.

---

## Architecture

```text
Staging admin browser (internal DNS, trusts self-signed cert)
   │
   ▼
Apache 2.4.58
   │  :80  → permanent redirect to HTTPS
   │  :443 → TLS termination + reverse proxy
   ▼
Next.js 16.3.4 (127.0.0.1:3000 only)
   │
   ▼
Supabase (hosted externally)
```

Confirmed working behavior:

- Next.js bound only to `127.0.0.1:3000` via systemd
- Apache proxies HTTPS to Next.js
- HTTP port 80 redirects permanently to HTTPS
- `APP_ORIGIN` uses the HTTPS staging URL
- Supabase Site URL and Auth redirect URLs use HTTPS
- Server reboot restores Apache and `lunch-management-staging` automatically

The staging Apache vhost is **additive**. Existing sites under `/etc/apache2/sites-available` are not modified.

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| OS | Ubuntu 22.04 LTS or 24.04 LTS |
| Node.js | **>= 20.9.0** (Next.js 16 minimum). **Recommended: Node.js 22 LTS** |
| npm | Bundled with Node.js (npm 10+) |
| Apache | **2.4.58** (verified on staging) |
| Git | 2.x |
| Supabase | Hosted project with migrations applied |
| DNS | Internal hostname resolving to staging server (internal DNS only) |

The repository includes `.nvmrc` (`20.9.0`) as the documented minimum.

---

## Server directory layout

```text
/var/www/lunch-management-system/              Application checkout (owned by lunchapp)
/etc/lunch-management/staging.env                Environment file (outside repo)
/etc/systemd/system/lunch-management-staging.service
/etc/apache2/sites-available/lunch-management-staging.conf
/etc/apache2/sites-enabled/lunch-management-staging.conf -> ../sites-available/...
/etc/ssl/lunch-management/                       Self-signed staging TLS files
    lunch-staging.crt
    lunch-staging.key
```

Templates in this repository:

```text
deploy/
├── STAGING.md
├── apache/lunch-management-staging.conf
├── env/staging.env.example
├── nginx/DEPRECATED.md
└── systemd/lunch-management-staging.service
```

---

## 1. Ubuntu prerequisites

Apache is already installed on the staging server. Install remaining packages:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git openssl
```

Optional firewall (adjust if ufw is already configured):

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

Verify minimum version:

```bash
node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]>20||(v[0]===20&&v[1]>=9)?0:1)"
```

If Node is installed outside `/usr/bin`, update `ExecStart` in the systemd unit.

---

## 3. Create dedicated service account

```bash
sudo useradd --system --create-home --home-dir /var/www/lunch-management-system --shell /usr/sbin/nologin lunchapp
sudo mkdir -p /var/www/lunch-management-system
sudo chown -R lunchapp:lunchapp /var/www/lunch-management-system
```

---

## 4. Clone the repository

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
| `APP_ORIGIN` | Browser-visible **HTTPS** origin (e.g. `https://STAGING_HOSTNAME`). **Required on staging.** |

Example (replace placeholder on the server):

```bash
APP_ORIGIN=https://STAGING_HOSTNAME
```

Do **not** set `NODE_ENV` in this file — it breaks builds if forced during `npm run build`.

Do **not** set `HOSTNAME` or `PORT` — the systemd unit binds Next.js to `127.0.0.1:3000`.

`APP_ORIGIN` is server-only (not `NEXT_PUBLIC_*`). It pins auth redirect targets and prevents Host-header open redirects.

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to this application.

---

## 6. Install dependencies and build

```bash
cd /var/www/lunch-management-system
sudo -u lunchapp npm ci
sudo -u lunchapp npm run build
```

Optional local smoke test:

```bash
sudo -u lunchapp npm run start -- --hostname 127.0.0.1 --port 3000
# Ctrl+C after: curl http://127.0.0.1:3000
```

---

## 7. Install systemd service

```bash
sudo cp /var/www/lunch-management-system/deploy/systemd/lunch-management-staging.service \
  /etc/systemd/system/lunch-management-staging.service

sudo systemctl daemon-reload
sudo systemctl enable lunch-management-staging
sudo systemctl start lunch-management-staging
sudo systemctl status lunch-management-staging
```

The service:

- Runs as `lunchapp`
- Starts on boot (`enabled`)
- Restarts on failure
- Binds Next.js explicitly: `npm run start -- --hostname 127.0.0.1 --port 3000`

---

## 8. Enable required Apache modules

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo a2enmod ssl
sudo apache2ctl configtest
sudo systemctl reload apache2
```

| Module | Purpose |
|--------|---------|
| `proxy` | Core reverse proxy |
| `proxy_http` | HTTP reverse proxy to Next.js (WebSocket upgrade on 2.4.x) |
| `headers` | `X-Forwarded-Proto` / `X-Forwarded-Port` |
| `ssl` | TLS termination on port 443 |

`proxy_wstunnel` is **not** required on Apache 2.4.58.

---

## 9. Create self-signed TLS certificate (internal staging)

Replace `STAGING_HOSTNAME` with your internal staging hostname.

```bash
sudo mkdir -p /etc/ssl/lunch-management
sudo chmod 755 /etc/ssl/lunch-management

sudo openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/ssl/lunch-management/lunch-staging.key \
  -out /etc/ssl/lunch-management/lunch-staging.crt \
  -subj "/CN=STAGING_HOSTNAME" \
  -addext "subjectAltName=DNS:STAGING_HOSTNAME"

sudo chmod 640 /etc/ssl/lunch-management/lunch-staging.key
sudo chmod 644 /etc/ssl/lunch-management/lunch-staging.crt
sudo chown root:root /etc/ssl/lunch-management/lunch-staging.crt /etc/ssl/lunch-management/lunch-staging.key
```

Certificate paths used by the Apache template:

- `/etc/ssl/lunch-management/lunch-staging.crt`
- `/etc/ssl/lunch-management/lunch-staging.key`

This self-signed certificate is **intentional** for internal staging. Production on HostGator may use a publicly trusted certificate instead.

---

## 10. Configure Apache virtual hosts

Replace `STAGING_HOSTNAME` in the template, then install:

```bash
sudo cp /var/www/lunch-management-system/deploy/apache/lunch-management-staging.conf \
  /etc/apache2/sites-available/lunch-management-staging.conf

sudo nano /etc/apache2/sites-available/lunch-management-staging.conf

sudo a2ensite lunch-management-staging.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

The template provides:

- **Port 80** — permanent redirect to `https://STAGING_HOSTNAME/`
- **Port 443** — SSL + reverse proxy to `http://127.0.0.1:3000/`
- Separate access/error logs for HTTP and HTTPS vhosts

### Apache logs

```bash
sudo tail -f /var/log/apache2/lunch-management-staging-ssl-access.log \
             /var/log/apache2/lunch-management-staging-ssl-error.log
```

---

## 11. Supabase dashboard (staging)

Configure the hosted Supabase project for **HTTPS**:

1. **Authentication → URL Configuration**
   - **Site URL:** `https://STAGING_HOSTNAME`
   - **Redirect URLs** — add each explicit route required by auth flows (use these on staging; do not rely on a broad wildcard as the primary deployed configuration):
     - `https://STAGING_HOSTNAME/auth/confirm`
     - `https://STAGING_HOSTNAME/account/update-password`

   > A wildcard such as `https://STAGING_HOSTNAME/**` may be convenient for local Supabase CLI or preview environments, but **staging should use the explicit routes above.**

2. **Authentication → Emails** — SMTP (SMTP2Go) and email confirmation enabled

3. **Authentication → Email Templates → Confirm signup** — token-hash link:

   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`

4. **Authentication → Email Templates → Reset Password** — configure the recovery link for SSR token-hash verification. Use this exact href in the template body (plain link or button):

   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

   Example button:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>
   ```

5. Apply all database migrations to the hosted project
6. Promote at least one staging admin in `public.profiles`

Ensure `APP_ORIGIN` in `/etc/lunch-management/staging.env` matches the Supabase Site URL scheme and host.

After changing env vars:

```bash
sudo systemctl restart lunch-management-staging
```

### Local development (password recovery)

Local development validates password recovery through automated checks only:

```bash
npm run lint
npm run build
npx supabase test db
npx tsx --test src/lib/*.test.ts
```

The auth-recovery unit tests cover redirect construction, email validation, anti-user-enumeration messaging, recovery vs signup routing, and password policy — without sending email.

**Do not require actual password-reset email delivery on a development PC.** End-to-end recovery acceptance (SMTP2Go delivery, link click-through, password change) is performed on **staging** (section 18).

Optional: Supabase CLI local Auth can capture outbound mail in Inbucket/Mailpit for individual developer inspection. This is optional tooling, not a required project workflow.

---

## 12. Trust the staging certificate on Windows 11

Staging admins must trust the self-signed certificate on their workstation.

1. Copy `/etc/ssl/lunch-management/lunch-staging.crt` from the server to the workstation (secure internal transfer only).
2. Open **PowerShell as Administrator** on Windows 11.
3. Import into the **Trusted Root Certification Authorities** store:

```powershell
Import-Certificate `
  -FilePath "C:\Path\To\lunch-staging.crt" `
  -CertStoreLocation Cert:\LocalMachine\Root
```

4. Restart the browser.
5. Browse to `https://STAGING_HOSTNAME` — the connection should be trusted internally.

Do not commit certificate files or internal paths to Git.

---

## 13. Boot and recovery verification

After installation or a server reboot, confirm services start automatically:

```bash
sudo systemctl is-enabled apache2
sudo systemctl is-enabled lunch-management-staging
sudo systemctl status apache2
sudo systemctl status lunch-management-staging
```

Both should be `enabled` and `active (running)`.

---

## 14. Smoke tests

Run on the staging server (replace `STAGING_HOSTNAME`):

```bash
# systemd services
sudo systemctl status lunch-management-staging
sudo systemctl status apache2

# Next.js bound to localhost only (not *:3000)
ss -ltnp | grep 3000

# HTTP → HTTPS permanent redirect
curl -I http://STAGING_HOSTNAME

# HTTPS app response (self-signed cert — use -k on server, or trust cert on workstation)
curl -k -I https://STAGING_HOSTNAME

# Local Next.js direct (should respond)
curl -I http://127.0.0.1:3000
```

Expected:

- `ss` shows `127.0.0.1:3000`, not `0.0.0.0:3000`
- HTTP returns `301`/`308` redirect to `https://STAGING_HOSTNAME/`
- HTTPS returns a Next.js response (e.g. `200`, `302`, or `307` depending on auth state)
- Sign out redirects to `https://STAGING_HOSTNAME/login` (not `localhost:3000`)

---

## 15. Operating the application

### Start / stop / restart

```bash
sudo systemctl restart lunch-management-staging
sudo systemctl restart apache2
sudo systemctl status lunch-management-staging
```

### Application logs

```bash
sudo journalctl -u lunch-management-staging -f
sudo journalctl -u lunch-management-staging --since "1 hour ago"
```

### Apache config changes

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

## 16. Safe update procedure

```bash
cd /var/www/lunch-management-system

sudo -u lunchapp git rev-parse HEAD | sudo tee /var/backups/lunch-management-last-good-commit.txt

sudo -u lunchapp git fetch origin
sudo -u lunchapp git pull origin master

sudo -u lunchapp npm ci
sudo -u lunchapp npm run build

sudo systemctl restart lunch-management-staging
sudo systemctl status lunch-management-staging
```

Re-run smoke tests (section 14).

---

## 17. Rollback procedure

```bash
cd /var/www/lunch-management-system
PREVIOUS=$(cat /var/backups/lunch-management-last-good-commit.txt)

sudo -u lunchapp git checkout "$PREVIOUS"
sudo -u lunchapp npm ci
sudo -u lunchapp npm run build
sudo systemctl restart lunch-management-staging
```

---

## 18. Password recovery — staging acceptance

After deploying password recovery changes, run this checklist on staging (replace `STAGING_HOSTNAME`):

1. Visit `/login` → click **Forgot password?**
2. Submit an **existing** staging account email
3. Receive the reset email via SMTP2Go
4. Confirm the reset link stays on `https://STAGING_HOSTNAME` (not localhost)
5. Set a new password on `/account/update-password`
6. Confirm redirect to `/login` with the password-updated success message
7. Sign in with the **old** password → must fail
8. Sign in with the **new** password → must succeed
9. Confirm role and navigation are unchanged (Owner remains Owner, etc.)
10. Reuse the same reset link → friendly invalid/expired message with option to request a new link
11. Submit a **nonexistent** email on `/forgot-password` → same neutral reset-request success message as step 2

---

## Security considerations

- **Internal staging only** — self-signed TLS, internal DNS, not public internet
- Next.js listens on **127.0.0.1:3000 only**; Apache terminates TLS and proxies
- Secrets in `/etc/lunch-management/staging.env`, not in Git
- `APP_ORIGIN=https://STAGING_HOSTNAME` pins auth redirects
- No service-role key in the Next.js app
- systemd runs as dedicated non-root `lunchapp` user
- Staging vhost uses separate Apache logs
- Existing Apache sites are untouched

---

## Production (HostGator dedicated server)

Use the same Apache + systemd pattern. Production will likely use a **publicly trusted certificate** (Let's Encrypt or commercial CA) instead of self-signed staging TLS. Copy templates to production-specific names and set `APP_ORIGIN` to the production HTTPS URL.
