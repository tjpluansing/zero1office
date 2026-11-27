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

`extras.js` (appended last) adds: Client stats period switch (Whole year, Semi-annual, Quarterly, Monthly) with colour mix bars and a "When renewals fall" chart; "Government Offices" shown as "Government" and a Personnel account type; Workflows create, edit and delete (saved in this browser under `zero1office:workflows:v1`); Edit on calendar events; and a Reports > Ads tab (spend, reach, leads, cost per lead, calls, clients won, by platform, by month, campaigns and Mateo's suggestions, all sample numbers until ad accounts are connected); and secretary routing: Approvals and Content approvals show a "Screened by <secretary>" card, each approval says "via <secretary>" and shows her routing step (Liza, id `secretary`, looked up in HUMANS_TOP then S.team, falls back to "Your secretary").

PDF preview (v57): "Preview the PDF" on the generator's approval box and on the proposal's card in Approvals opens the same A4 pages the PDF is made from (paginate()), scaled to the screen, before anyone approves. Close with the button, Escape or a click outside.
Generator approval box (v58): Approve, Ask for changes (inline note form) and Decline act on the proposal right there, next to Preview the PDF; they reuse the Approvals handlers.

Nearest providers (v59): nearby() drops closed facilities, fills each list to at least 3 PCCs, 5 hospitals, 5 clinics and 5 dental clinics from the nearest cities (Metro Manila uses approximate city centres in NCR_XY; elsewhere the province, then the region), and lists physicians at those facilities nearest first. Maya's check recounts every category against the proposal and sends a MyMaxicare proposal back when the location is missing or a category is absent.

Edit the email before approval (v63, replaces v62's template editor): after generating, "Edit the email" opens that client's email (prefilled from Karla's template) for editing with B/I/U/List while the approval is waiting or sent back. Saving cleans it to simple tags, updates the Approvals card text and reruns Maya's checks. Once approved it is locked. The template itself stays fixed; the v62 localStorage key is removed on load.

Maxicare SME (v64): kind "mxs". The form asks for the plan option (Starter, MPlus Group, MPlus Small, MPlus, MPlus Rated), the client name, an optional company name and the email. Karla's MaxicarePlus email is used word for word (SME_BODY, "Dear <name>,"). Attachments: the pubmat, the PCCs guide, then the option's proposal and template (SME_OPTS). Their files aren't uploaded yet (SME_PATHS is empty), so they show "Not uploaded yet". There's no generated PDF. Subject: "Maxicare SME Plan Proposal[ for <company>]". Maxicare also has a "MPlus vs Corporate" type after Corporate, which uses the generic group form until its content is defined.

Maxicare Corporate (v65): kind "mxc". The form asks for the client name, the company name and the email. Karla's Corporate email (CORP_BODY) has its line breaks rebuilt from Paolo's pasted text and starts "Dear <name>,". There are 5 attachments in his order (corpFiles()). The Standard Plan, the Set Up template and the PCAF aren't uploaded yet. Subject: "Maxicare Corporate Plan Proposal for <company>". smeChecks() covers both mxs and mxc.
- v66: Maxicare Corporate attachments wired in. The Standard Plan and PCAF PDFs are published at files/corp/. The Set Up Template is an .xlsx, and the artifact host can't serve .xlsx, so the generator tells the user to attach it from OneDrive.
- v67: Settings > Files (files.js), the central file repository. It lists the built-in published files and files uploaded from the page, which are stored as artifact assets and indexed in the db collection "files". You can view, save, rename, move to a folder, link to a proposal attachment slot, and delete. Excel, Word and PowerPoint files are stored as base64 text/plain and decoded when viewed or saved. Previews use pdf.js 3.11.174 and SheetJS 0.18.5 from cdnjs. The Corporate Set Up Template is published as files/corp/corporate-set-up-template.xlsx.b64.txt. The "Setup" menu group was renamed "Settings". Capabilities are now downloads, mcp (Microsoft 365 outlook_create_draft), db and assets, so pass that full set if you ever redeclare.
- v68: fixed uploads not listing (db snapshot data is frozen; files.js now copies it). Added the HMO Pubmat attachment slot. Paolo's SME uploads are linked to their slots.
- v69: Maxicare Prepaid (kind mxp): client name and email, Karla's Prepaid email (LifesavER and PRIMA), attachments are the pubmat and the Maxicare_Prepaid Health Cards_2026_Proposal slot (upload it in Files). Subject: "Maxicare Prepaid Health Cards Proposal" (a guess).
- v70: Maxicare MPlus vs Corporate (kind mxv): client and company name, Karla's two-option email, 8 attachments. Option 1 reuses the SME MPlus slots and Option 2 the Corporate files, with OPTION 1_/OPTION 2_ name prefixes. New slot Maxicare_CORP_Primer. Subject: "Maxicare HMO Plan Proposal for <company>" (a guess).
- v71: hardened Files loading: accepts any snapshot shape, falls back to a one-off read, adds a Refresh button, shows new uploads straight away, and shows the error detail on the page. MPlus vs Corporate OPTION files have their own slots and fall back to the SME or Corporate files.
- v72: folder management in Files. Folders are stored in db doc meta/folders {list:[{id,name,parent}]} and a file's folder field holds the folder id. Folders can be added, renamed, moved, saved as a zip (JSZip 3.10.1 from cdnjs) and deleted (contents move up a level). Files have checkboxes for bulk move, zip and delete. Built-in files can be renamed, moved and hidden via db doc meta/builtins {map:{b1:{name,folder,hidden}}}.

v75 (2026-11-25): Proposal generator can send with Outlook (Microsoft 365) or Gmail. Gmail drafts use the Gmail connector's create_draft and carry the product files plus Karla's signature image inline (up to ~17 MB raw; if Gmail refuses the attachments the draft is retried text-only). Needs "Gmail" [create_draft] in the page's mcp capability, which the office thread declares once Paolo connects Gmail.

v77 (2026-11-25): chat box add-ons in chatplus.js (wraps the original renderChat, never edits it): a search field (people, teams and message text, with highlights), a paperclip that uploads files into Settings > Files > "Chat files" and sends them to the AI employee with an Open button, and a microphone that uses the dictation capability to write a voice message into the box. files.js now exposes Z1Files.upload/view/ready/chatFolder. Capabilities redeclared: v74 set + dictation{}.

v78 (2026-11-25): chatai.js makes chat replies live. When the sample capability is available, the add-on takes the chat form first (capture phase), and Claude replies in the agent's role (persona from S.team: n, r, d, desc, k, now, tasks, plus Ask Karla business rules). It returns JSON {reply, task}, and a task calls the page's giveTask. Team chats get 1-3 replies plus one owner. Text, CSV and PDF files given in the chat (Z1Files.rows/blob, pdf.js) are included, up to about 16k characters. Without sample, the original scripted replies run.

v79 (2026-11-25): healthlive.js. App health uses the Accesses page's live checks (liveRows, liveTest, liveBadge from the office thread's code). "Tools connected" now counts real failures, a Connections card lists each switched-on connection, and Check now re-runs every live check one at a time. healthChecks and vHealth are wrapped, and VIEWS.health is repointed.

v80 (built, waiting on the office thread's Google publish): App health part 2 in healthlive.js. The sample inbox-brake check is set aside, and new checks cover file storage and proposal files (window.Z1PG_missing in propgen.js). "AI spend (sample)" is replaced by live AI use: chatai.js counts replies through window.Z1AIUse into the db doc meta/aiuse {month, total, by}, with a localStorage fallback.

- **v82 (2026-11-25), gcal.js:** the Calendar page shows real Google Calendar events (read-only, `list_events` on the 6-week grid, Manila time) in purple beside the office's events. Google events open in Google instead of Edit/Remove. The first load waits for a "Show my Google Calendar" click; nothing is stored or written to Google.

- **v84 (2026-11-25), no dummy data (Paolo: "Remove all dummy data"):** Billing & SOA starts empty. A one-time migration (`noDummy` on the billing store) removes the old sample SOAs and payouts by id plus number, and keeps anything added by hand. Reports > Ads shows an empty state until an ads account is connected. Client stats loses its "Sample accounts" note and has an empty state. Real reference data stays: insurer plans, rates, benefits, provider and doctor lists, and Karla's built-in files.

- **v86 (2026-11-25), SOAs from Gmail (Paolo: "For SOAs and Billing refer to karlaluansing.maxicare@gmail.com"):** Billing & SOA gets "Find SOAs in Gmail". It reads Maxicare billing-statement subjects through Gmail `search_threads` (read-only), with the subject `"Billing Statement Number: BS… Due: <date> for Account <no> - <NAME>"`. It shows each BS number once and ticks the ones due in the last 30 days or later. Only the ticked ones are added, as Maxicare SOAs with the email date, due date, account name and Gmail link. The amount is in the PDF, so it starts at 0. After the first use, a status bar re-checks on each visit. Nina and Sol work from the added SOAs.

- **v87 (2026-11-25), proposals into GoHighLevel (Paolo picked "New Proposals pipeline"):** after a proposal draft is made, propgen.js calls GHL `execute_operation`. It finds the pipeline named "Proposals" (`get-pipelines`), upserts the contact by email (name, and the company for group plans), creates an open opportunity at the "Proposal drafted" stage (falling back to the first stage) with the lowest annual option as its value, and adds a contact note. Every write has an idempotency key. Family members and health details are never sent. If there's no Proposals pipeline, it says so and offers Try again.

- **v88 (2026-11-25):** proposals are now drafted automatically once approved (Maya's check plus your Approve), once per proposal, with "Create draft" kept as a retry. Proposals are Outlook-only from karla@ask-karla.com (Paolo: "All proposals should be sent using karla@ask-karla.com"). Before drafting, the page calls Microsoft 365 `get_me` and flags a draft that landed in someone else's mailbox. The Gmail draft code stays but isn't offered.
- **v90 (2026-11-25):** the Microsoft 365 connector can't attach files, so each brochure or primer can carry a OneDrive link (Add a link, https only, saved once in the db doc `meta/filelinks`) that goes into the draft body above the sign-off. "Save all files (.zip)" saves the unlinked files, the client's proposal PDF always included, as one zip (JSZip 3.10.1).

- **Several calendars and all-day events (2026-11-27, gcal.js rewritten):** the Calendar page has a "Show" row of checkboxes, one per calendar: the Office calendar (the app's own events), every Google calendar that `list_calendars` returns (yours, shared, subscribed), your own Outlook calendar, other calendars in your Outlook by name (`calendarName`, stored in `liveCfg().calNames`), and other people's Outlook calendars (the existing `liveCfg().cal` list, `calendarOwnerEmail`). Ticks are kept in localStorage `zero1office:cal:show`; by default Office, the main Google calendar and your own Outlook calendar are on. Each outside calendar gets its own colour (ev-x0..ev-x7) and its events open in Google or Outlook. Outlook is paged 25 at a time, up to 150 events per month view. Accesses gets a "Calendars" card listing them all with the same checkboxes and Add forms. The Add/Edit event form has an "All day" box (events get `allDay:true`, `tm:"00:00"`), and all-day events from Google and Outlook show on every day they cover. Everything outside the app stays read-only. `window.Z1GCal` (upcoming, on) is unchanged for Dom's live work.
## Ask Kara, the Jarvis-like assistant (`kara.js`, appended last, after agentlive.js)

Paolo, 2026-11-26: "Yes" to a Jarvis-like assistant; 2026-11-27: "lets go back to making Kara like Jarvis".
Kara (Chief of Staff, id `aria`) is the assistant: "Ask Kara" in the top bar, Ctrl+K / Cmd+K, or the microphone.

- "Brief me" / "What's pending?": Approvals, Content approvals, Inbox items needing your OK, To do, today and tomorrow's
  events (office + `window.Z1GCal`), and every live agent's "needs you" rows through `window.Z1Live.build()` (added to
  addon.js; the same data as "From your trackers"). Rows open their page.
- "Who's free?", "How's the team?", "What is Nina doing?": from each agent's real status and work (S.team).
- "Open renewals", "Ask Maya to …" (`giveTask`), "Add to do: …". Kara shows the step and waits for Do it / Enter
  (a typed "open" runs straight away). Pages are limited to what the person may open (`Z1Users.allowed`).
- Anything else goes to Claude (sample) with counts, page names and agent names, roles and busy/free only.
- Speaks up on her own: a daily briefing card the first time each person opens the app each day, and a nudge card
  when a new approval or a new "needs you" item appears (checked every 30 s). Both can be switched off in the bar.
- Voice: the dictation capability on claude.ai, else the browser's SpeechRecognition (Chrome, Edge), so the
  microphone also works on app.ask-karla.com. "Read replies aloud" uses tts if declared, else speechSynthesis.
- Guardrails: never sends, posts or pays; outbound tasks say they wait in Approvals for Karla; only Super Admins (and
  the old Agent account) hand out any task, others follow-ups only; every action logged in `zero1office:kara:log:v1`
  (shared on the hosted app) and Kara's feed. Personal switches use `ak-kara-*` keys (not shared).
- No capability changes.
