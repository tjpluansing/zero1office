# zero1office

Ask Karla's office app. This first piece is **sign-in and user permissions**:
login, forced password change, Manage Users, a page and feature permission
matrix, and an audit log.

- Frontend: React 18 + TypeScript + Vite + Tailwind (static files)
- Backend: Supabase (Postgres, Auth, Edge Functions), Singapore region recommended
- Hosting: `app.ask-karla.com` on Hostinger (static upload); Supabase does the server work

## Try it without Supabase

```bash
npm install
npm run dev:demo
```

Sign in as `paolo@ask-karla.com`, `karla@ask-karla.com` or `assistant@ask-karla.com`,
password `demo`. Demo data lives in your browser only and is **not** security.

## How access is enforced

| Layer | What it does |
|---|---|
| Postgres row level security (`supabase/migrations`) | **The real lock.** Every table checks `has_permission('<page>.<action>')` on every request. |
| Triggers | Self-lockout protection, "last Super Admin" protection, no privilege escalation, audit log. |
| Edge Function `admin-users` | Create / invite / suspend / delete / reset password. Asks the DB *as the caller* before using the service key. |
| React route guards (`src/auth/guards.tsx`) | Redirects to login, forced password change, or "no access" page. |
| Sidebar (`src/components/Layout.tsx`) | Hides pages you can't open. Convenience only. |

Permission keys are `<page>.<action>` (e.g. `clients.export`, `quotes.approve`).
A user's access = role preset + per-user grants − per-user denies. An action
without its page's `view` is dropped. Super Admins get everything.

To add a new page: add rows to `public.permissions`, give roles their defaults
in `public.role_permissions`, add RLS policies on the new table using
`has_permission(...)`, then add it to `src/lib/nav.ts` and `src/App.tsx`.
The matrix picks it up automatically.

## Setup (one time, about an hour)

1. **Create a Supabase project** (region: Southeast Asia / Singapore).
2. **Run the migrations** in order: `supabase db push`, or paste each file in
   `supabase/migrations/` into the SQL editor.
3. **Auth settings** (Authentication → Settings / Providers):
   - Site URL `https://app.ask-karla.com`; add `http://localhost:5173` to redirect URLs for development.
   - Turn **off** "Allow new users to sign up". Only people you add in Manage Users can get in.
   - Email provider: minimum password length 12; turn on "Secure password change" and leaked-password protection if your plan has it.
   - SMTP: use Microsoft 365 (`smtp.office365.com:587`, e.g. `noreply@ask-karla.com`) so invites come from your domain.
   - MFA: enable TOTP (required for admin and export permissions).
4. **Sign in with Microsoft**: in Entra ID (portal.azure.com → App registrations) create a
   *single-tenant* app, redirect URI `https://<project>.supabase.co/auth/v1/callback`,
   create a client secret. In Supabase → Providers → Azure, paste the client ID, secret and
   `https://login.microsoftonline.com/<your-tenant-id>`.
5. **Deploy the Edge Function**
   ```bash
   supabase functions deploy admin-users
   supabase functions deploy integrations
   supabase functions deploy ghl-webhook --no-verify-jwt   # GHL has no Supabase login; it checks its own signature or secret
   supabase secrets set APP_URL=https://app.ask-karla.com
   ```
6. **Create Paolo's Super Admin** (on your own computer; the service key never goes in the app):
   ```bash
   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run seed:admin
   ```
   It prints a one-time temporary password. The account has no access until a new password is chosen
   and the Acceptable Use and Privacy Agreement is accepted.
   Run it again for a **second Super Admin** (`npm run seed:admin karla@ask-karla.com Karla`) and for an
   **emergency (break-glass) account** (`npm run seed:admin breakglass@ask-karla.com "Emergency Admin"`), whose
   password and two-step recovery go in a Bitwarden item shared only by the two Super Admins.
   Then turn on MFA (TOTP) under Authentication → Multi-Factor in Supabase. Admin and export features stay
   locked until each person sets up two-step verification under *Sign-in security*.
7. **Build and upload**
   ```bash
   cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   npm run build
   ```
   In Hostinger hPanel create the subdomain `app.ask-karla.com`, turn on SSL, and upload the
   contents of `dist/` (it includes the `.htaccess` that routes every path to the app and forces HTTPS).

## Security features before launch

| Feature | Where |
|---|---|
| Two-step verification required for user admin, settings and exports | `session_permissions()` in migration 4; *Sign-in security* page; banner until set up |
| Acceptable Use and Privacy Agreement at first sign-in (and after each new version) | `policy_versions`, `accept_policy()`; `/agreement` |
| Monthly access review with sign-off and snapshot | `access_review_data()`, `complete_access_review()`; *Access Review* page |
| Warning while only one Super Admin exists | Manage Users |
| Admin reset of a lost authenticator | Manage Users → Reset sign-in |
| Admin → Integrations: GoHighLevel, Microsoft 365, Claude API with keys in Supabase Vault, test connection, pause, disconnect | migration 5, `supabase/functions/integrations`, `src/pages/admin/Integrations.tsx` |
| GHL webhooks: signature or secret checked, each event stored once, retries with backoff, Sync log with Retry | migration 6, `supabase/functions/ghl-webhook`, Integrations page |
| Written access control and password policy | `docs/policies/access-control-and-password-policy.md` |

Edit the agreement wording in migration 4 before launch. To change it later, run
`select publish_policy('2027-01-15', 'Acceptable Use and Privacy Agreement', '<text>');` in the Supabase SQL editor;
everyone accepts again at their next request.

## GHL webhooks

GHL sends contact changes to `https://<project>.supabase.co/functions/v1/ghl-webhook`. Each delivery must carry
GHL's Ed25519 `X-GHL-Signature` or the `X-Webhook-Secret` created on Admin → Integrations → GoHighLevel (only its
hash is stored). Events are stored once and turned into Client Masterlist rows; a GHL delete never deletes a client.

Turn on `pg_cron` (Database → Extensions) and schedule the retries and the 30/180-day clean-up in the SQL editor:

```sql
select cron.schedule('z1-sync-retries', '* * * * *', $$select public.process_integration_events(50, 'schedule')$$);
select cron.schedule('z1-sync-purge', '15 3 * * *', $$select public.purge_integration_events()$$);
```

## Tests

```bash
PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
```

Runs the migrations against a scratch database with a stand-in `auth` schema and checks
the rules: domain restriction, forced password change, page and action blocking, self-lockout,
last Super Admin, no privilege escalation, suspension and the audit log.
