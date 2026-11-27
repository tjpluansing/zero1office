# Zero1Office on app.ask-karla.com

The same app that runs on claude.ai, hosted on our own domain. People sign in with their
@ask-karla.com account (Microsoft or a password). No Claude accounts are needed to use it.

| Part | What it does |
| --- | --- |
| `supabase.sql` | Shared data table `app_docs`, the rules for who can read and change it, the private `files` bucket, Paolo and Karla as Super Admins |
| `functions/z1-admin/index.ts` | Server function Super Admins use for temporary passwords, pause and remove |
| `shim.js` | Sign-in screen, and the stand-in for claude.ai's database, file uploads and downloads |
| `sw.js` | Serves uploaded files (`/_blob/<id>`) from the private bucket to signed-in people only |
| `config.js` | Project URL and anon key (public values only) |
| `build.py` | Turns the published claude.ai page into the upload folder |

## One-time setup (Paolo)

Keep every password and key in Bitwarden. Never paste the `service_role` key into chat or into `config.js`.

1. **Supabase project.** Create one at supabase.com (Singapore region). Free plan is fine to start.
2. **Database.** SQL Editor > New query > paste `supabase.sql` > Run.
3. **Sign-in settings.** Authentication > Sign In / Providers: turn **off** "Allow new users to sign up".
   URL Configuration: Site URL `https://app.ask-karla.com`, add the same to Redirect URLs.
4. **Microsoft sign-in (optional, recommended).** In Microsoft Entra admin center register an app
   (single tenant, redirect URI from Supabase's Azure provider page). In Supabase turn on the Azure
   provider with its client id, secret and `https://login.microsoftonline.com/<tenant id>` as the URL.
5. **Server function.** Edge Functions > Deploy a new function > name `z1-admin` > paste
   `functions/z1-admin/index.ts` > Deploy. Then in its Settings turn **off** "Verify JWT with legacy secret"
   (newer projects sign tokens with keys that check rejects; the function checks for a Super Admin itself).
6. **First password (only if not using Microsoft).** Authentication > Users > Add user >
   `paolo@ask-karla.com` with a password, "Auto confirm" on. After that, add everyone else from
   Settings > Users in the app.
7. **Subdomain.** In Hostinger, create `app.ask-karla.com` and turn on its free SSL.
8. **Send Claude** the Project URL and the anon public key (Project Settings > API). Nothing else.

## Build and upload

```
python3 hosted/build.py <app page .html> <artifact files folder> dist-hosted
# put the Project URL and anon key in dist-hosted/config.js
```

The live site does not follow claude.ai edits by itself. To update it, build into `hosted/site/` and merge to
`Primary`: the GitHub Action `deploy-hosted.yml` uploads the changed files to Hostinger by FTP. It needs the
repository secret `FTP_PASSWORD` for the Hostinger FTP account `u779592699.z1app` (server and username are in the workflow). It can also be run by hand from Actions > "Deploy app.ask-karla.com" > Run workflow.

Without the Action: zip the folder and upload its contents to `public_html/app` in Hostinger's File Manager
(keep `.htaccess`).

## What to know

- Everyone signed in shares the same data. If two people edit the same record at the same time, the later save wins.
- Billing changes made by someone else show after a Refresh (a banner offers it).
- Files copied into the folder (signature images, PDFs, `doctors.json`) can be opened by anyone who has the link.
  Move anything sensitive into the app's file uploads, which are private.
- AI features (Ask Kara, drafting) and connectors (GHL, Microsoft 365, Google) are switched off here until
  phases 2 and 3.

## Tests

- `tests/docs_test.sql`: database rules, run on Postgres after `supabase.sql`.
- `tests/e2e.cjs` with `tests/fake-supabase.js`: sign-in, users, staff pages, company profile, live sync, sign out.
