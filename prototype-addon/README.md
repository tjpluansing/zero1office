# zero1office page add-on

The main zero1office artifact (the original prototype page) stays exactly as it is.
This folder holds what is added on top of it, appended after the page's own scripts:

- `addon.css`, `addon.js`: sign-in (sample accounts, password `demo`), the Billing & SOA page
  (SOA tracker, payouts, Karla's receipts) under "Back office" in the menu, and the live feed
  that gives Nina and Sol their work in the 3D office plus "From your trackers".
- `../public/office/live.js` is embedded as the office-side bridge.

Build: `prototype-addon/build.sh <original page source> <out.html>`. The output starts with the
original page byte for byte; check that before publishing.

## Proposal generator files

`propgen.js` adds Numbers > Proposal generator. When a proposal is generated, the assigned Proposals agent checks it (fees recomputed from the rate tables, family totals, ages, client email, nearby providers, email template, files for the product). Once it is approved, the page creates an Outlook draft. The Microsoft 365 connector can't attach files, so the user saves the product files from the page and attaches them in Outlook before sending.

Publish these with the page under `files/` (Paolo, 2026-11-24: the attachments for Maxicare Individual and Family, in this order): `karla-luansing-maxicare-pubmat.jpg` (Karla's Maxicare pubmat), `mymaxicare-primer-with-rates.pdf` (from "MyMaxicare_Primer with Rates.pdf") and `maxicare-pccs-and-other-services.pdf` (from "Maxicare_PCCs_and_Other_Services.pdf").
Also publish `data/providers.json` and `data/doctors.json` at the page root. Capabilities: `{mcp: {servers: [{server: "Microsoft 365", tools: ["outlook_create_draft"]}]}, downloads: true}`.
