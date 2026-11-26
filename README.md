# zero1office

Ask Karla's office app. Built so far:

1. **Sign-in and user permissions**: login, forced password change, Manage Users, a page and feature
   permission matrix, two-step verification, the agreement, access reviews and an audit log.
2. **Billing & SOA, the collections tracker**: every SOA from release to client payment, provider receipt
   and 2307, commission payout, and Karla's receipt to the provider (see below).

3. **AI Office home screen**: the 3D office (`public/office/`) is the first page after sign-in. Nina and
   Sol work from the real SOA tracker, and the office's "From your trackers" list opens the matching page.

## AI Office

`public/office/index.html` is the 3D office from the prototype, served as a static page and shown in a
same-origin frame by `src/pages/Office.tsx`. Every minute the app sends it live work built by
`src/lib/officeLive.ts`; `public/office/live.js` swaps the named agents' sample work for it. Only people with
`billing.view` get SOA details in the office. The other 36 agents still run on sample work until their
modules are built (follow-ups, quotes, proposals).

## Billing & SOA

One row per SOA. Its stage is worked out by the database from the dates filled in, so nobody moves cards by hand:

Draft → SOA released, awaiting client payment → Paid, awaiting provider receipt / 2307 → Awaiting commission →
Commission received, Karla's receipt due → Receipt issued to provider → Closed.

- Stage cards with totals, an aging strip of unpaid SOAs (not yet due, 1–30, 31–60, 61–90, over 90 days past due),
  and flags for overdue payments, missing 2307s and SOAs stuck too long in a stage (`STUCK_AFTER` in `src/lib/soa.ts`).
- Per SOA: quick steps (released, paid, receipt in, 2307 in, close), a timeline of stage changes, and follow-up notes.
  Anyone who can view Billing can log a follow-up, so the assistant works the list without edit rights.
- **Commission payouts**: record what a provider paid, tick the SOAs it covers (same provider only, with a warning
  when the SOA commissions don't add up to the payout), copy the details Karla puts on her receipt, and record the
  receipt number. Only `billing.approve` (Karla) can record or change her receipt.
- CSV import (with a template) and a logged export. No member names or health details are stored.

Tables: `soas`, `disbursements`, `soa_events` in `supabase/migrations/20261124000008_soa_collections.sql`.

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
| Integration alerts: banner, alert list, daily re-test and email to Super Admins, key age and Microsoft secret expiry | migration 7, `supabase/functions/integrations` (health) |
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

<<<<<<< HEAD
## Follow-up queue

**Follow-ups** (`/followups`) lists every pending requirement or reply Ask Karla is chasing from a client or an
insurer. Felix, the AI employee, drafts each chase (firmer with every try, short for Viber/Messenger, full for
email); the assistant checks it, sends it from the usual channel and clicks **I sent it**. The next chase is
scheduled 2 business days later, and after 3 tries with no reply the item moves to Karla ("With Karla").
Only users with `followups.approve` (Karla, Super Admins) can waive or cancel a requirement.

Only a short description of what is missing is stored. ID, card, account and phone numbers are refused, and
documents go straight to the insurer. The rules live in `followup_settings` (`chase_every_days`,
`max_attempts`, `escalate_overdue_days`). Karla or an admin changes them with **Chase rules** on the Follow-ups page; each change is in the audit log.
Escalate items that are past their due date every morning (8 AM Manila = 00:00 UTC):

```sql
select cron.schedule('z1-followups-overdue', '0 0 * * *', $$select public.escalate_overdue_followups()$$);
=======
### Daily health check and alerts

Admins see a banner and an alert list on Admin → Integrations when a connection breaks, GHL updates fail or get
stuck, webhooks go quiet for 7 days, a key is over 90 days old, or the Microsoft client secret is within 30 days
of expiring. Once a day the `integrations` function re-tests every active connection and emails new alerts to the
Super Admins from the Microsoft 365 mailbox (needs *Allow sending email* on that card).

```bash
supabase secrets set HEALTH_CHECK_SECRET=$(openssl rand -hex 32)
```

Turn on `pg_net`, save the same value in Vault, and schedule it (8:00 AM Manila = 00:00 UTC):

```sql
select vault.create_secret('<the same value>', 'z1_health_secret');
select cron.schedule('z1-health-check', '0 0 * * *', $$
  select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/integrations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <anon key>',
      'X-Health-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'z1_health_secret')),
    body := '{}'::jsonb)
$$);
>>>>>>> origin/claude/project-thread-bhgdym
```

## Tests

```bash
PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
```

Runs the migrations against a scratch database with a stand-in `auth` schema and checks
the rules: domain restriction, forced password change, page and action blocking, self-lockout,
last Super Admin, no privilege escalation, suspension and the audit log. `followups_test.sql` covers the
follow-up queue (assistant limits, chase counter, escalation, waive/reopen by Karla only, no ID numbers).
Pass a test name to run just one: `npm run test:db -- followups_test`.
