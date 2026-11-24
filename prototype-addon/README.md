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

`propgen.js` adds Today > Proposal generator. For Maxicare Individual and Family it greets the client by name, uses the subject "Maxicare Individual Plan Proposal" (or Family), and saves the proposal as a PDF named "Client Name_Client Age_MyMaxicare.pdf" (html2pdf.js 0.10.1 from cdnjs, loaded on demand), attached second. The PDF follows Karla's MyMaxicare proposal template (cover letter, Healthcare Benefits Summary 1-9, plan and fees, riders, then Accredited providers near you) and needs `files/pdf/` (maxicare-logo.png, consultant-banner.jpg, karla-signature.jpg, maxicare-bear.png; copies in `data/files/pdf/`) published with the page. When a proposal is generated, the assigned Proposals agent checks it (fees recomputed from the rate tables, family totals, ages, client email, nearby providers, email template, files for the product). Once it is approved, it waits in Approvals (held in memory only, never saved to the browser) and the Outlook draft can be made only after the user approves it there. The Microsoft 365 connector can't attach files, so the user saves the product files from the page and attaches them in Outlook before sending.

Publish these with the page under `files/` (Paolo, 2026-11-24: the attachments for Maxicare Individual and Family, in this order): `karla-luansing-maxicare-pubmat.jpg` (Karla's Maxicare pubmat), `mymaxicare-primer-with-rates.pdf` (from "MyMaxicare_Primer with Rates.pdf") and `maxicare-pccs-and-other-services.pdf` (from "Maxicare_PCCs_and_Other_Services.pdf").
Also publish `files/karla-luansing-email-signature.jpg` (Karla's email signature image; shown above the "Please consider the environment" line in the preview and inserted by the user from their Outlook signature, because connector drafts can't hold images).
Also publish `data/providers.json` and `data/doctors.json` at the page root. Capabilities: `{mcp: {servers: [{server: "Microsoft 365", tools: ["outlook_create_draft"]}]}, downloads: true}`.

`extras.js` (appended last) adds: Client stats period switch (Whole year, Semi-annual, Quarterly) with colour mix bars and a "When renewals fall" chart; "Government Offices" shown as "Government" and a Personnel account type; Workflows create, edit and delete (saved in this browser under `zero1office:workflows:v1`); and Edit on calendar events.
