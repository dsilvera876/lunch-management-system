# Authentication hooks and email delivery

Signup domains and SMTP delivery are managed in **Admin → Settings** (`private.signup_email_domains`, `private.email_delivery_settings`). Outbound mail follows:

**Supabase Auth email event → Send Email Hook → Lunch mail service → Admin-managed SMTP configuration → Vault-backed credential**

Routine provider or sender changes do **not** require application redeployment or Supabase Dashboard SMTP edits.

## Managed Supabase (hosted)

1. **Before User Created** — `supabase/config.toml` → `public.hook_before_user_created` (Postgres function).
2. **Send Email** — HTTP hook to a **publicly reachable** HTTPS endpoint (hosted Supabase must POST to your app):
   - Path: `/api/auth/hooks/send-email`
   - **Hook URL is not necessarily `APP_ORIGIN`.** On internal staging, use an existing **Tailscale Funnel** (or similar) hostname that reaches the Next.js server. Email links in user inboxes still use **`APP_ORIGIN`** (internal DNS is fine for browsers on the corporate network).
   - Hook secret (`v1,whsec_…`) from **Auth → Hooks** → set on the Next.js server as `SEND_EMAIL_HOOK_SECRET` (must match the dashboard).
3. **Auth redirect URLs** — see **Password recovery configuration** below and `deploy/STAGING.md` §11.
4. Configure SMTP only in **Admin → Settings → Email delivery** (not Dashboard SMTP). While the Send Email hook is enabled, **Dashboard email template bodies are bypassed**; the app builds auth mail in `src/lib/mail/auth-email-templates.ts`.

### Password recovery configuration (staging / production)

| Item | Requirement |
|------|-------------|
| **A. `APP_ORIGIN`** | Canonical browser-visible origin (server env). Used for `resetPasswordForEmail` `redirectTo`, and for links in recovery emails (`/auth/confirm?…`). |
| **B. Supabase Site URL** | Must match **`APP_ORIGIN`** (scheme + host). |
| **C. Redirect allow-list** | Must permit the recovery callback used by the app: `{APP_ORIGIN}/auth/confirm?type=recovery` (add this exact URL, or a documented wildcard policy your project uses). Also allow `/auth/confirm` and `/account/update-password` as needed. |
| **D. Send Email hook** | Public HTTPS URL → `/api/auth/hooks/send-email`; `SEND_EMAIL_HOOK_SECRET` on the app server. |
| **E. Mail worker** | Enable `lunch-management-mail-queue` timer/service so queued `auth_hook` mail is delivered (see `deploy/STAGING.md`). |
| **F. SMTP** | Admin → Settings → Email delivery (Vault-backed); authoritative for queued mail. |
| **G. Hosted password minimum** | **Authentication → Settings** → minimum password length **8** (matches app and `supabase/config.toml`). |
| **H. OTP / recovery expiry** | Default **~1 hour** (`otp_expiry` / Auth email OTP settings). Recovery emails state this in copy; links stop working after expiry. |

The Send Email hook **enqueues** mail in `private.email_delivery_queue` and returns HTTP 200 immediately (well under Supabase’s 5s hook limit). A background worker (`npm run worker:mail-queue`) performs SMTP delivery using the same Admin-managed configuration.

If enqueue fails, the hook returns a non-success HTTP status so Auth does not treat the message as sent. If SMTP fails later, the worker retries with backoff and updates signup invite state (`invite_last_error` / `invite_sent_at`). Admin **Send test email** remains synchronous for immediate feedback.

## Self-hosted Supabase

```toml
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/hook_before_user_created"

[auth.hook.send_email]
enabled = true
uri = "http://host.docker.internal:3000/api/auth/hooks/send-email"
secrets = "env(SEND_EMAIL_HOOK_SECRET)"
```

Adjust the Send Email URI so the Auth container can reach Next.js.

## Server environment variables (infrastructure only)

| Variable | Purpose |
|----------|---------|
| `APP_ORIGIN` | Public app URL for auth links |
| `SEND_EMAIL_HOOK_SECRET` | Verify Supabase Send Email hook payloads |
| `SUPABASE_SECRET_KEY` | Service role for server/worker mail config + Vault decryption RPC |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase client |

SMTP host, port, username, password, and From address are **not** environment variables. They live in `private.email_delivery_settings` with passwords in **Supabase Vault**.

## Secret storage (Supabase Vault)

- Migration enables `supabase_vault` only (no separate `pgsodium` extension requirement in application migrations).
- `vault.create_secret()` stores the SMTP password; the settings row stores `smtp_password_secret_id` (UUID reference).
- `service_get_email_delivery_runtime()` (service role only) reads `vault.decrypted_secrets` for sending.
- Admin RPCs return `smtp_password_configured` only; blank password on update preserves the existing Vault secret.
- Audit tables record actions/categories, never secret values.

## Local development

Same semantics as production: **Admin → Settings → Email delivery** must be **enabled** with valid SMTP settings before auth or application mail sends.

1. Set `SEND_EMAIL_HOOK_SECRET` in `.env.local` (`v1,whsec_<base64>`).
2. Run Next.js on port 3000 for the Send Email hook URI in `config.toml`.
3. Configure SMTP in Admin settings. For capture-only testing, point SMTP at the local Supabase mail interface (`[local_smtp]` in `supabase/config.toml`, Studio mail UI on port **55424**) or your org’s dev SMTP relay — not `SMTP2GO_*` env vars.

Workers and supplemental order email use the same mail service and database configuration (service role).

Never commit real secrets or hook keys.

## Auth link safety (invite, signup, recovery)

- User-facing Auth links always use **`APP_ORIGIN/auth/confirm`** with `token_hash`, `type`, and a safe internal `next` route. They **never** point at `https://<project>.supabase.co/auth/v1/verify`.
- **`APP_ORIGIN`** is the internal staging/production app URL. A public Tailscale Funnel hostname is only for the **Send Email webhook** (`/api/auth/hooks/send-email`), not for links in email bodies.
- **EmailOtpType mapping** in our Send Email hook:
  - `invite` → `type=invite` → password setup (`/account/update-password?invite=1`)
  - `signup` / `email` → `type=signup` or `type=email` → post-login handling
  - `recovery` → `type=recovery` → password reset flow
  - `email_change` → `type=email_change`
  - `magiclink` → `type=magiclink`
- The `/auth/confirm` route calls `supabase.auth.verifyOtp({ token_hash, type })` server-side and then redirects to `next` when present.
- Token hashes must not appear in application logs.

## SMTP link tracking

The application SMTP transport (Nodemailer) does **not** enable click/open tracking or rewrite links. If your organization uses a relay such as SMTP2GO, **disable click/link tracking** for Auth mail so confirmation URLs are not prefetched or rewritten by the provider.
