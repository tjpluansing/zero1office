# zero1office page add-on

The main zero1office artifact (the original prototype page) stays exactly as it is.
This folder holds what is added on top of it, appended after the page's own scripts:

- `addon.css`, `addon.js`: sign-in (sample accounts, password `demo`), the Billing & SOA page
  (SOA tracker, payouts, Karla's receipts) under "Back office" in the menu, and the live feed
  that gives Nina and Sol their work in the 3D office plus "From your trackers".
- `../public/office/live.js` is embedded as the office-side bridge.

Build: `prototype-addon/build.sh <original page source> <out.html>`. The output starts with the
original page byte for byte; check that before publishing.
