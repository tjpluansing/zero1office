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

Tables: `soas`, `disbursements`, `soa_events` in `supabase/migrations/20261124000005_soa_collections.sql`.

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
| Written access control and password policy | `docs/policies/access-control-and-password-policy.md` |

Edit the agreement wording in migration 4 before launch. To change it later, run
`select publish_policy('2027-01-15', 'Acceptable Use and Privacy Agreement', '<text>');` in the Supabase SQL editor;
everyone accepts again at their next request.

## Tests

```bash
PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
```

Runs the migrations against a scratch database with a stand-in `auth` schema and checks
the rules: domain restriction, forced password change, page and action blocking, self-lockout,
last Super Admin, no privilege escalation, suspension and the audit log.
