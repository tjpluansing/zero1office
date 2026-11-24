/*
 * zero1office add-on, loaded after the original page's own scripts.
 * Adds, without changing anything already there:
 *   1. Sign-in in front of the office (demo accounts, password "demo").
 *   2. A "Billing & SOA" page: the SOA collections tracker and provider payouts with Karla's receipts.
 *   3. Nina and Sol in the 3D office working from that tracker, plus "From your trackers" in the office panel.
 * Everything is sample data kept in this browser only.
 */
(function () {
  "use strict";

  /* ---------- small helpers ---------- */
  var DAY = 86400000;
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function daysAgo(n) { var d = new Date(Date.now() - n * DAY); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function daysBetween(fromIso) { return Math.floor((Date.now() - new Date(fromIso).getTime()) / DAY); }
  function peso(n) { return n == null || n === "" ? "—" : "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(d) { return d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—"; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function e(s) { return esc(s); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (err) { return null; } }
  function say(msg) { try { toast(msg); } catch (err) { /* toast is optional */ } }

  /* ---------- 1. sign-in ---------- */
  var USERS = [
    { email: "paolo@ask-karla.com", name: "Paolo", role: "Super Admin", perms: ["billing.view", "billing.create", "billing.edit", "billing.delete", "billing.export", "billing.approve"] },
    { email: "karla@ask-karla.com", name: "Karla", role: "Agent", perms: ["billing.view", "billing.create", "billing.edit", "billing.delete", "billing.export", "billing.approve"] },
    { email: "assistant@ask-karla.com", name: "New Assistant", role: "Assistant", perms: ["billing.view"] },
  ];
  var AUTH_KEY = "zero1office-auth:v1";
  var me = null;
  (function () { var s = store(AUTH_KEY); if (s && s.email) me = USERS.filter(function (u) { return u.email === s.email; })[0] || null; })();
  function can(p) { return !!me && me.perms.indexOf(p) > -1; }

  var gate = document.createElement("div");
  gate.className = "z1-login";
  gate.innerHTML =
    '<div class="card"><div class="logo"><div class="mark">0<b>1</b></div><div class="word">zero<span>1</span>office</div></div>' +
    '<div><h2>Sign in</h2><p class="muted small">Use your Ask Karla account.</p></div>' +
    '<form id="z1LoginForm" novalidate>' +
    '<label class="fld" for="z1Email">Email<input class="inp" id="z1Email" type="email" autocomplete="username" placeholder="you@ask-karla.com"></label>' +
    '<label class="fld" for="z1Pw">Password<input class="inp" id="z1Pw" type="password" autocomplete="current-password"></label>' +
    '<span class="err" id="z1LoginErr" role="alert"></span>' +
    '<button class="btn pri" type="submit" style="justify-content:center;padding:10px">Sign in</button></form>' +
    '<p class="hint">Sample accounts, password <b>demo</b>: <b>karla@ask-karla.com</b> (Agent), <b>paolo@ask-karla.com</b> (Super Admin), <b>assistant@ask-karla.com</b> (Assistant, view and follow-ups only).</p></div>';
  document.body.appendChild(gate);
  gate.querySelector("form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var em = document.getElementById("z1Email").value.trim().toLowerCase(), pw = document.getElementById("z1Pw").value;
    var u = USERS.filter(function (x) { return x.email === em; })[0];
    if (!u || pw !== "demo") { document.getElementById("z1LoginErr").textContent = "Wrong email or password."; return; }
    me = u; store(AUTH_KEY, { email: u.email }); document.getElementById("z1Pw").value = ""; document.getElementById("z1LoginErr").textContent = "";
    lock(); render(); pushLive();
  });
  function lock() {
    gate.hidden = !!me;
    document.body.classList.toggle("z1-locked", !me);
    renderMe();
    if (!me) setTimeout(function () { var i = document.getElementById("z1Email"); if (i) i.focus(); }, 0);
  }
  var meBox = document.createElement("div");
  meBox.className = "z1-me";
  document.getElementById("side").appendChild(meBox);
  function renderMe() {
    meBox.innerHTML = me ? '<span><b>' + e(me.name) + '</b><small>' + e(me.role) + '</small></span><button class="btn sm" data-z1="signout">Sign out</button>' : "";
  }

  /* ---------- 2. SOA tracker data ---------- */
  var PROV = ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"];
  var STAGES = [
    { id: "draft", label: "Draft", short: "Draft", next: "Add the release date once the SOA goes to the client" },
    { id: "awaiting_payment", label: "SOA released, awaiting client payment", short: "Awaiting payment", next: "Follow up the client for payment" },
    { id: "awaiting_docs", label: "Paid, awaiting provider receipt / 2307", short: "Receipt / 2307", next: "Get the provider's receipt and the client's 2307" },
    { id: "awaiting_commission", label: "Awaiting commission", short: "Awaiting commission", next: "Wait for the provider's commission payout" },
    { id: "receipt_due", label: "Commission received, Karla's receipt due", short: "Karla's receipt due", next: "Karla issues her receipt to the provider" },
    { id: "receipt_issued", label: "Receipt issued to provider", short: "Receipt issued", next: "Close once everything is filed" },
    { id: "closed", label: "Closed", short: "Closed", next: "" },
  ];
  function stageInfo(id) { return STAGES.filter(function (s) { return s.id === id; })[0]; }
  function stageIdx(id) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i; return 0; }
  var STUCK_AFTER = { draft: 3, awaiting_docs: 14, awaiting_commission: 45, receipt_due: 3, receipt_issued: 14 };
  var AGING = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"];

  var DATA_KEY = "zero1office-billing:v1";
  var B = store(DATA_KEY);
  if (!B || !Array.isArray(B.soas) || !Array.isArray(B.payouts)) B = seed();

  function payout(id) { return B.payouts.filter(function (d) { return d.id === id; })[0] || null; }
  function soa(id) { return B.soas.filter(function (s) { return s.id === id; })[0] || null; }
  function computeStage(s) {
    var d = s.disbursement_id ? payout(s.disbursement_id) : null;
    if (s.closed_on) return "closed";
    if (d && d.receipt_issued_on) return "receipt_issued";
    if (d) return "receipt_due";
    if (!s.released_on) return "draft";
    if (!s.paid_on) return "awaiting_payment";
    if (!s.provider_receipt_on || (s.cwt_applicable && !s.form_2307_on)) return "awaiting_docs";
    return "awaiting_commission";
  }
  function flags(s) {
    var overdue = s.stage === "awaiting_payment" && s.due_on ? Math.max(0, daysBetween(s.due_on)) : 0;
    var inStage = daysBetween(s.stage_changed_at), lim = STUCK_AFTER[s.stage];
    var stuck = lim !== undefined && inStage > lim ? inStage : 0;
    var m2307 = !!s.cwt_applicable && !!s.paid_on && !s.form_2307_on && s.stage !== "closed";
    return { overdue: overdue, stuck: stuck, m2307: m2307, need: overdue > 0 || stuck > 0 || m2307 };
  }
  function aging(s) {
    if (s.stage !== "awaiting_payment") return null;
    var d = s.due_on ? daysBetween(s.due_on) : 0;
    return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4;
  }
  function addEvent(soaId, kind, body) {
    B.events.push({ id: "e" + Date.now() + Math.random().toString(36).slice(2, 6), soa_id: soaId, at: new Date().toISOString(), who: me ? me.name : "System", kind: kind, body: body });
  }
  /** Tidy, validate, fill defaults and work out the stage, logging a stage change. Throws on bad input. */
  function writeSoa(r) {
    ["soa_no", "provider", "account_name"].forEach(function (k) { r[k] = String(r[k] || "").trim(); });
    if (!r.soa_no || !r.provider || !r.account_name) throw new Error("SOA number, provider and account are required.");
    if (!(r.amount >= 0)) throw new Error("Amount must be zero or more.");
    if (B.soas.some(function (x) { return x.id !== r.id && x.provider.toLowerCase() === r.provider.toLowerCase() && x.soa_no === r.soa_no; }))
      throw new Error("SOA " + r.soa_no + " from " + r.provider + " already exists.");
    if (r.due_on && r.released_on && r.due_on < r.released_on) throw new Error("The due date can't be before the release date.");
    if (r.paid_on && !r.released_on) throw new Error("Add the release date before the payment date.");
    if (r.disbursement_id) { var d = payout(r.disbursement_id); if (d && d.provider.toLowerCase() !== r.provider.toLowerCase()) throw new Error("SOA " + r.soa_no + " is from " + r.provider + ", but this payout is from " + d.provider + "."); }
    if (r.paid_on && r.paid_amount == null) r.paid_amount = r.amount;
    if (r.commission_rate != null && (r.commission_expected == null || r.auto_comm)) { r.commission_expected = Math.round(r.amount * r.commission_rate * 100) / 100; r.auto_comm = true; }
    var old = soa(r.id), st = computeStage(r);
    if (!old || old.stage !== st) { r.stage_changed_at = new Date().toISOString(); r.stage = st; addEvent(r.id, "stage", stageInfo(st).label); }
    else { r.stage = st; r.stage_changed_at = old.stage_changed_at; }
    if (old) Object.assign(old, r); else B.soas.push(r);
  }
  function restage() { B.soas.forEach(function (s) { var st = computeStage(s); if (st !== s.stage) { s.stage = st; s.stage_changed_at = new Date().toISOString(); addEvent(s.id, "stage", stageInfo(st).label); } }); }
  function blank() {
    return { id: "s" + Date.now(), soa_no: "", provider: "Maxicare", account_name: "", product: null, coverage_period: null, amount: 0, released_on: null, due_on: null,
      paid_on: null, paid_amount: null, payment_ref: null, provider_receipt_no: null, provider_receipt_on: null, cwt_applicable: false, cwt_amount: null,
      form_2307_on: null, commission_rate: null, commission_expected: null, auto_comm: false, disbursement_id: null, commission_amount: null,
      closed_on: null, ghl_link: null, notes: null, stage: "draft", stage_changed_at: new Date().toISOString() };
  }
  function commit(msg) { store(DATA_KEY, B); if (msg) say(msg); render(); pushLive(); }

  function seed() {
    B = { soas: [], events: [], payouts: [
      { id: "d1", provider: "Maxicare", received_on: daysAgo(4), reference: "DV-24-1188", gross_amount: 23500, withholding_amount: 2350, net_amount: 21150, receipt_no: null, receipt_issued_on: null, notes: null },
      { id: "d2", provider: "Intellicare", received_on: daysAgo(30), reference: "CV-0931", gross_amount: 8400, withholding_amount: 840, net_amount: 7560, receipt_no: "AK-0042", receipt_issued_on: daysAgo(28), notes: null },
    ] };
    var rows = [
      { soa_no: "MX-2026-0412", provider: "Maxicare", account_name: "Dela Cruz Trading", product: "HMO – Corporate", amount: 185000, commission_rate: 0.1, released_on: daysAgo(70), due_on: daysAgo(40) },
      { soa_no: "MC-88120", provider: "Medicard", account_name: "Santos Bakery", product: "HMO – SME", amount: 64000, commission_rate: 0.1, released_on: daysAgo(20), due_on: daysAgo(5) },
      { soa_no: "IC-55102", provider: "Intellicare", account_name: "Bayani Logistics", product: "HMO – Corporate", amount: 120000, commission_rate: 0.08, released_on: daysAgo(12), due_on: daysAgo(-18) },
      { soa_no: "MX-2026-0398", provider: "Maxicare", account_name: "Luzon Dental Group", product: "HMO – Corporate", amount: 96000, commission_rate: 0.1, released_on: daysAgo(50), due_on: daysAgo(20), paid_on: daysAgo(25), payment_ref: "BDO 22831", cwt_applicable: true, cwt_amount: 1920 },
      { soa_no: "KHL-7781", provider: "KHL", account_name: "Mabuhay Prints", product: "HMO – SME", amount: 38000, commission_rate: 0.1, released_on: daysAgo(40), due_on: daysAgo(10), paid_on: daysAgo(12), provider_receipt_no: "OR 1123", provider_receipt_on: daysAgo(9) },
      { soa_no: "MX-2026-0377", provider: "Maxicare", account_name: "Rizal Builders", product: "HMO – Corporate", amount: 150000, commission_rate: 0.1, released_on: daysAgo(60), due_on: daysAgo(30), paid_on: daysAgo(32), provider_receipt_no: "OR 88231", provider_receipt_on: daysAgo(28), cwt_applicable: true, cwt_amount: 3000, form_2307_on: daysAgo(20), disbursement_id: "d1", commission_amount: 15000 },
      { soa_no: "MX-2026-0380", provider: "Maxicare", account_name: "Cebu Seafoods", product: "HMO – SME", amount: 85000, commission_rate: 0.1, released_on: daysAgo(58), due_on: daysAgo(28), paid_on: daysAgo(29), provider_receipt_no: "OR 88240", provider_receipt_on: daysAgo(26), disbursement_id: "d1", commission_amount: 8500 },
      { soa_no: "IC-54990", provider: "Intellicare", account_name: "Tala Cafe", product: "HMO – SME", amount: 105000, commission_rate: 0.08, released_on: daysAgo(90), due_on: daysAgo(60), paid_on: daysAgo(62), provider_receipt_no: "OR 5521", provider_receipt_on: daysAgo(58), disbursement_id: "d2", commission_amount: 8400 },
      { soa_no: "FWD-GL-301", provider: "FWD", account_name: "Ana Reyes", product: "Group Life", amount: 42000, commission_rate: 0.15 },
    ];
    rows.forEach(function (r, i) {
      var s = Object.assign(blank(), r, { id: "s" + (i + 1) });
      if (s.paid_on) s.paid_amount = s.amount;
      s.commission_expected = Math.round(s.amount * s.commission_rate * 100) / 100; s.auto_comm = true;
      s.stage = computeStage(s);
      var last = [s.form_2307_on, s.provider_receipt_on, s.paid_on, s.released_on].filter(Boolean)[0];
      s.stage_changed_at = s.disbursement_id ? new Date(payout(s.disbursement_id).received_on).toISOString() : last ? new Date(last).toISOString() : new Date(Date.now() - 5 * DAY).toISOString();
      B.soas.push(s);
      B.events.push({ id: "e" + (i + 1), soa_id: s.id, at: s.stage_changed_at, who: "Karla", kind: "stage", body: stageInfo(s.stage).label });
    });
    B.events.push({ id: "e100", soa_id: "s1", at: new Date(Date.now() - 50 * 3600000).toISOString(), who: "New Assistant", kind: "follow_up", body: "Emailed accounting, promised payment next week." });
    return B;
  }

  /* ---------- page state ---------- */
  var Z = { tab: "soas", fStage: "all", fProv: "all", fNeed: false, q: "", modal: null, err: "", step: null };

  function needCount() { return B.soas.filter(function (s) { return s.stage !== "closed" && flags(s).need; }).length + B.payouts.filter(function (d) { return !d.receipt_no; }).length; }

  /* ---------- views ---------- */
  function vBilling() {
    if (!can("billing.view")) return '<div class="card empty">You don\'t have access to Billing & SOA. Ask Paolo to grant it.</div>';
    var btns = "";
    if (Z.tab === "soas") {
      if (can("billing.export")) btns += '<button class="btn sm" data-z1="export">Export CSV</button>';
      if (can("billing.create")) btns += '<button class="btn sm" data-z1="import">Import CSV</button><button class="btn sm pri" data-z1="newsoa">Add SOA</button>';
    } else if (can("billing.create")) btns += '<button class="btn sm pri" data-z1="newpayout">Record payout</button>';
    var tabs = '<div class="chips"><button class="chip" data-z1="tab" data-v="soas" aria-pressed="' + (Z.tab === "soas") + '">SOAs (' + B.soas.length + ')</button>' +
      '<button class="chip" data-z1="tab" data-v="payouts" aria-pressed="' + (Z.tab === "payouts") + '">Payouts and Karla\'s receipts (' + B.payouts.length + ')</button></div>';
    return '<div class="ph"><div><h2>Billing & SOA</h2><p>Every SOA from release to client payment, provider receipt, 2307, commission and Karla\'s receipt. Sample data, kept in this browser.</p></div><div class="actions">' + btns + '</div></div>' +
      tabs + (Z.tab === "soas" ? soaList() : payoutList());
  }

  function soaList() {
    var open = B.soas.filter(function (s) { return s.stage !== "closed"; });
    var unpaid = open.filter(function (s) { return s.stage === "awaiting_payment"; });
    var overdue = unpaid.filter(function (s) { return flags(s).overdue > 0; });
    var need = open.filter(function (s) { return flags(s).need; });
    var sum = function (a, f) { return a.reduce(function (t, s) { return t + (Number(f(s)) || 0); }, 0); };
    var tiles = '<div class="tiles">' +
      tile("Unpaid by clients", peso(sum(unpaid, function (s) { return s.amount; })), plural(unpaid.length, "SOA")) +
      tile("Overdue", peso(sum(overdue, function (s) { return s.amount; })), plural(overdue.length, "SOA")) +
      tile("Commission expected", peso(sum(open.filter(function (s) { return stageIdx(s.stage) <= 3; }), function (s) { return s.commission_expected; })), "on open SOAs") +
      tile("Needs attention", String(need.length), "overdue, stuck or missing 2307") + '</div>';
    var stages = '<div class="z1-stages">' + STAGES.map(function (st) {
      var rows = B.soas.filter(function (s) { return s.stage === st.id; });
      return '<button class="z1-stage" data-z1="fstage" data-v="' + st.id + '" aria-pressed="' + (Z.fStage === st.id) + '"><span class="k">' + e(st.short) + '</span><span class="v">' + rows.length + '</span><span class="h">' + peso(sum(rows, function (s) { return s.amount; })) + '</span></button>';
    }).join("") + '</div>';
    var buckets = [0, 0, 0, 0, 0], bAmt = [0, 0, 0, 0, 0];
    B.soas.forEach(function (s) { var b = aging(s); if (b != null) { buckets[b]++; bAmt[b] += s.amount; } });
    var maxA = Math.max.apply(null, bAmt.concat([1]));
    var agingHtml = '<div class="card pad" style="margin-bottom:12px"><div class="secth">Unpaid SOAs by days past due</div><div class="stack" style="gap:6px">' +
      AGING.map(function (lbl, i) { return '<div style="display:grid;grid-template-columns:110px minmax(0,1fr) 140px;gap:10px;align-items:center;font-size:12.5px"><span>' + lbl + '</span><div class="bar"><i style="width:' + Math.round(bAmt[i] / maxA * 100) + '%"></i></div><span class="num" style="text-align:right">' + peso(bAmt[i]) + ' · ' + buckets[i] + '</span></div>'; }).join("") + '</div></div>';
    var rows = B.soas.filter(function (s) {
      if (Z.fStage !== "all" && s.stage !== Z.fStage) return false;
      if (Z.fProv !== "all" && s.provider !== Z.fProv) return false;
      if (Z.fNeed && !(s.stage !== "closed" && flags(s).need)) return false;
      if (Z.q) { var q = Z.q.toLowerCase(); if ((s.soa_no + " " + s.account_name + " " + s.provider).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    }).sort(function (a, b) { return stageIdx(a.stage) - stageIdx(b.stage) || (a.due_on || "").localeCompare(b.due_on || ""); });
    var filters = '<div class="z1-filters"><input class="inp" id="z1Q" data-z1f="q" placeholder="Search SOA no. or account" value="' + e(Z.q) + '" aria-label="Search SOAs">' +
      '<select class="inp" data-z1f="prov" aria-label="Provider"><option value="all">All providers</option>' + PROV.map(function (p) { return '<option' + (Z.fProv === p ? " selected" : "") + '>' + p + '</option>'; }).join("") + '</select>' +
      '<select class="inp" data-z1f="stage" aria-label="Stage"><option value="all">All stages</option>' + STAGES.map(function (st) { return '<option value="' + st.id + '"' + (Z.fStage === st.id ? " selected" : "") + '>' + e(st.short) + '</option>'; }).join("") + '</select>' +
      '<button class="chip" data-z1="fneed" aria-pressed="' + Z.fNeed + '">Needs attention only</button>' +
      (Z.fStage !== "all" || Z.fProv !== "all" || Z.fNeed || Z.q ? '<button class="btn sm" data-z1="fclear">Clear filters</button>' : "") + '</div>';
    var table = rows.length ? '<div class="tblwrap"><table class="t"><thead><tr><th>SOA</th><th>Account</th><th>Provider</th><th class="r">Amount</th><th>Due</th><th>Stage</th><th>Flags</th></tr></thead><tbody>' +
      rows.map(function (s) {
        return '<tr class="z1-tr" data-z1="opensoa" data-id="' + s.id + '"><td><b>' + e(s.soa_no) + '</b></td><td>' + e(s.account_name) + '<div class="muted small">' + e(s.product || "") + '</div></td><td>' + e(s.provider) +
          '</td><td class="r num">' + peso(s.amount) + '</td><td>' + fmtDate(s.due_on) + '</td><td><span class="s ' + stageTone(s.stage) + '">' + e(stageInfo(s.stage).short) + '</span></td><td>' + flagChips(s) + '</td></tr>';
      }).join("") + '</tbody></table></div>' : '<div class="empty">No SOAs match these filters.</div>';
    return tiles + stages + agingHtml + '<div class="card pad">' + filters + table + '</div>';
  }
  function tile(k, v, h) { return '<div class="tile"><span class="k">' + e(k) + '</span><span class="v">' + e(v) + '</span><span class="h">' + e(h) + '</span></div>'; }
  function stageTone(st) { return st === "closed" ? "s-off" : st === "receipt_issued" ? "s-ok" : st === "receipt_due" ? "s-need" : st === "awaiting_commission" ? "s-info" : st === "draft" ? "s-off" : "s-warn"; }
  function flagChips(s) {
    if (s.stage === "closed") return "";
    var f = flags(s), h = "";
    if (f.overdue) h += '<span class="s s-bad">' + f.overdue + ' d overdue</span> ';
    if (f.m2307) h += '<span class="s s-warn">2307 missing</span> ';
    if (f.stuck) h += '<span class="s s-warn">' + f.stuck + ' d in stage</span>';
    return h;
  }

  function payoutList() {
    if (!B.payouts.length) return '<div class="card empty">No payouts yet. Record one when a provider pays out commission.</div>';
    var rows = B.payouts.slice().sort(function (a, b) { return b.received_on.localeCompare(a.received_on); });
    return '<div class="card pad"><div class="tblwrap"><table class="t"><thead><tr><th>Received</th><th>Provider</th><th>Reference</th><th class="r">Gross</th><th class="r">Net</th><th>SOAs</th><th>Karla\'s receipt</th></tr></thead><tbody>' +
      rows.map(function (d) {
        var n = B.soas.filter(function (s) { return s.disbursement_id === d.id; }).length;
        return '<tr class="z1-tr" data-z1="openpayout" data-id="' + d.id + '"><td>' + fmtDate(d.received_on) + '</td><td><b>' + e(d.provider) + '</b></td><td>' + e(d.reference || "—") + '</td><td class="r num">' + peso(d.gross_amount) +
          '</td><td class="r num">' + peso(d.net_amount) + '</td><td>' + n + '</td><td>' + (d.receipt_no ? '<span class="s s-ok">' + e(d.receipt_no) + ' · ' + fmtDate(d.receipt_issued_on) + '</span>' : '<span class="s s-need">Due</span>') + '</td></tr>';
      }).join("") + '</tbody></table></div></div>';
  }

  /* ---------- modals ---------- */
  var scrim = document.createElement("div");
  scrim.className = "scrim"; scrim.hidden = true; scrim.id = "z1Scrim";
  document.getElementById("app").appendChild(scrim);
  function openModal(m) { Z.modal = m; Z.err = ""; Z.step = null; Z.sure = null; drawModal(); var f = scrim.querySelector("input,select,textarea,button"); if (f) f.focus(); }
  function closeModal() { Z.modal = null; Z.sure = null; scrim.hidden = true; scrim.innerHTML = ""; }
  function drawModal() {
    if (!Z.modal) return closeModal();
    var m = Z.modal, h = "";
    if (m.kind === "soa") h = soaModal(soa(m.id));
    else if (m.kind === "soaform") h = soaForm(m.row);
    else if (m.kind === "payout") h = payoutModal(payout(m.id));
    else if (m.kind === "payoutform") h = payoutForm(m.row);
    else if (m.kind === "link") h = linkModal(payout(m.id));
    else if (m.kind === "import") h = importModal();
    else if (m.kind === "export") h = '<div class="modal z1-wide" role="dialog" aria-modal="true" aria-label="Export SOAs">' + head("Export SOAs (" + B.soas.length + ")") +
      '<div class="mbd"><p class="small">Copy this and paste it into Excel or Google Sheets.</p><pre class="z1-pre" id="z1Csv">' + e(m.csv) + '</pre></div>' +
      '<div class="mft"><button class="btn" data-z1="close">Close</button><button class="btn pri" data-z1="copycsv">Copy CSV</button></div></div>';
    if (!h) return closeModal();
    scrim.innerHTML = h; scrim.hidden = false;
  }
  function head(t) { return '<div class="mhd"><h2 style="font-size:17px">' + t + '</h2><button type="button" class="dots" data-z1="close" aria-label="Close">✕</button></div>'; }
  function errLine() { return Z.err ? '<p class="err" role="alert" style="font-size:12px">' + e(Z.err) + '</p>' : ""; }
  function kv(label, val) { return '<div><small>' + e(label) + '</small><span>' + val + '</span></div>'; }

  function soaModal(s) {
    if (!s) return "";
    var idx = stageIdx(s.stage), d = s.disbursement_id ? payout(s.disbursement_id) : null;
    var track = '<div class="z1-track" aria-label="Stage ' + (idx + 1) + ' of ' + STAGES.length + '">' + STAGES.map(function (st, i) { return '<i class="' + (i < idx ? "done" : i === idx ? "on" : "") + '" title="' + e(st.label) + '"></i>'; }).join("") + '</div>';
    var info = stageInfo(s.stage);
    var steps = "";
    if (can("billing.edit")) {
      if (s.stage === "draft") steps += stepBtn("release", "Mark released to client");
      if (s.stage === "awaiting_payment") steps += stepBtn("paid", "Mark paid by client");
      if (s.stage === "awaiting_docs" && !s.provider_receipt_on) steps += stepBtn("preceipt", "Provider receipt received");
      if (s.paid_on && s.cwt_applicable && !s.form_2307_on) steps += stepBtn("f2307", "2307 received");
      if (s.stage === "receipt_issued") steps += stepBtn("close", "Close SOA");
    }
    if (s.stage === "awaiting_commission" && can("billing.edit")) steps += '<button class="btn sm" data-z1="gopayouts">Link to a payout</button>';
    if (d) steps += '<button class="btn sm" data-z1="openpayout" data-id="' + d.id + '">Open the ' + e(d.provider) + ' payout</button>';
    var stepForm = Z.step ? quickStep(Z.step, s) : "";
    var evs = B.events.filter(function (x) { return x.soa_id === s.id; }).sort(function (a, b) { return b.at.localeCompare(a.at); });
    var timeline = evs.map(function (x) {
      var k = x.kind === "follow_up" ? "Follow-up" : x.kind === "note" ? "Note" : "Stage";
      return '<div class="z1-ev"><span><span class="s ' + (x.kind === "stage" ? "s-info" : x.kind === "follow_up" ? "s-warn" : "s-off") + '">' + k + '</span> ' + e(x.body) + '</span><small>' + e(x.who) + ' · ' + new Date(x.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) + '</small></div>';
    }).join("");
    return '<div class="modal z1-wide" role="dialog" aria-modal="true" aria-label="SOA ' + e(s.soa_no) + '">' + head("SOA " + e(s.soa_no) + ' <span class="muted small" style="font-weight:500">' + e(s.provider) + '</span>') +
      '<div class="mbd"><div><div class="z1-flags"><span class="s ' + stageTone(s.stage) + '">' + e(info.label) + '</span>' + flagChips(s) + '</div>' + track +
      (info.next ? '<p class="small muted">Next: ' + e(info.next) + '</p>' : "") + '</div>' +
      (steps ? '<div class="actions">' + steps + '</div>' : "") + stepForm + errLine() +
      '<div class="z1-kv">' + kv("Account", e(s.account_name)) + kv("Product", e(s.product || "—")) + kv("Coverage", e(s.coverage_period || "—")) + kv("Amount", peso(s.amount)) +
      kv("Released", fmtDate(s.released_on)) + kv("Due", fmtDate(s.due_on)) + kv("Client paid", fmtDate(s.paid_on) + (s.paid_on ? " · " + peso(s.paid_amount) : "")) + kv("Payment ref.", e(s.payment_ref || "—")) +
      kv("Provider receipt", e(s.provider_receipt_no || "—") + (s.provider_receipt_on ? " · " + fmtDate(s.provider_receipt_on) : "")) +
      kv("CWT / 2307", s.cwt_applicable ? peso(s.cwt_amount) + " · 2307 " + (s.form_2307_on ? fmtDate(s.form_2307_on) : "missing") : "Not applicable") +
      kv("Commission", (s.commission_rate != null ? (Math.round(s.commission_rate * 10000) / 100) + "% · " : "") + peso(s.commission_expected) + " expected" + (s.commission_amount != null ? " · " + peso(s.commission_amount) + " received" : "")) +
      kv("GoHighLevel", s.ghl_link ? '<a href="' + e(s.ghl_link) + '" target="_blank" rel="noopener">Open in GHL</a>' : "—") + '</div>' +
      (s.notes ? '<p class="small"><b>Notes:</b> ' + e(s.notes) + '</p>' : "") +
      '<div class="z1-box"><div class="z1-sect">Timeline and follow-ups</div>' +
      '<form class="give" data-z1form="note"><select class="inp" id="z1NoteKind" style="flex:none;width:auto" aria-label="Entry type"><option value="follow_up">Follow-up</option><option value="note">Note</option></select><input class="inp" id="z1NoteBody" maxlength="500" placeholder="e.g. Called accounting, payment Friday" aria-label="Follow-up or note"><button class="btn sm pri" type="submit">Add</button></form>' +
      (timeline || '<p class="small muted">Nothing logged yet.</p>') + '</div></div>' +
      '<div class="mft">' + (can("billing.delete") ? '<button class="btn danger" data-z1="delsoa" data-id="' + s.id + '" style="margin-right:auto">Delete</button>' : "") +
      (can("billing.edit") ? '<button class="btn" data-z1="editsoa" data-id="' + s.id + '">Edit details</button>' : "") + '<button class="btn pri" data-z1="close">Done</button></div></div>';
  }
  function stepBtn(step, label) { return '<button class="btn sm' + (Z.step === step ? " pri" : "") + '" data-z1="step" data-v="' + step + '">' + label + '</button>'; }
  function quickStep(step, s) {
    var t = today(), f = "";
    if (step === "release") f = fld("Released on", '<input class="inp" type="date" id="z1sD" value="' + t + '" max="' + t + '">') + fld("Due date", '<input class="inp" type="date" id="z1sDue" value="' + (s.due_on || daysAgo(-30)) + '">');
    if (step === "paid") f = fld("Paid on", '<input class="inp" type="date" id="z1sD" value="' + t + '" max="' + t + '">') + fld("Amount paid (₱)", '<input class="inp" id="z1sA" inputmode="decimal" value="' + s.amount + '">') + fld("Payment ref.", '<input class="inp" id="z1sR" maxlength="60">');
    if (step === "preceipt") f = fld("Receipt date", '<input class="inp" type="date" id="z1sD" value="' + t + '" max="' + t + '">') + fld("Receipt no.", '<input class="inp" id="z1sR" maxlength="60">');
    if (step === "f2307") f = fld("2307 received on", '<input class="inp" type="date" id="z1sD" value="' + t + '" max="' + t + '">');
    if (step === "close") f = fld("Closed on", '<input class="inp" type="date" id="z1sD" value="' + t + '" max="' + t + '">');
    return '<form class="z1-box" data-z1form="step"><div class="z1-three">' + f + '</div><div class="actions"><button class="btn sm pri" type="submit">Save</button><button class="btn sm" type="button" data-z1="step" data-v="">Cancel</button></div></form>';
  }
  function fld(label, input) { return '<label class="fld">' + label + input + '</label>'; }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function num(v, label) { if (v === "") return null; var n = Number(String(v).replace(/[₱,\s]/g, "")); if (isNaN(n)) throw new Error(label + " must be a number."); return n; }

  var FORM_FIELDS = [
    ["soa_no", "SOA number", "text"], ["provider", "Provider", "prov"], ["amount", "Amount (₱)", "money"],
    ["account_name", "Account (company or client)", "text"], ["product", "Product", "text", "HMO – Corporate"], ["coverage_period", "Coverage period", "text", "Jan–Dec 2027"],
    ["released_on", "Released to client", "date"], ["due_on", "Due", "date"], ["paid_on", "Client paid", "date"],
    ["paid_amount", "Amount paid (₱, blank = SOA amount)", "money"], ["payment_ref", "Payment ref.", "text"], ["provider_receipt_no", "Provider receipt no.", "text"],
    ["provider_receipt_on", "Provider receipt date", "date"], ["cwt_amount", "CWT amount (₱)", "money"], ["form_2307_on", "2307 received", "date"],
    ["commission_rate", "Commission rate (%)", "pct"], ["commission_expected", "Expected commission (₱, blank = amount × rate)", "money"], ["closed_on", "Closed on", "date"],
  ];
  function soaForm(r) {
    var inputs = FORM_FIELDS.map(function (f) {
      var k = f[0], v = r[k], inp;
      if (f[2] === "prov") inp = '<select class="inp" id="z1f-' + k + '">' + PROV.map(function (p) { return '<option' + (v === p ? " selected" : "") + '>' + p + '</option>'; }).join("") + '</select>';
      else if (f[2] === "date") inp = '<input class="inp" type="date" id="z1f-' + k + '" value="' + e(v || "") + '">';
      else if (f[2] === "pct") inp = '<input class="inp" id="z1f-' + k + '" inputmode="decimal" value="' + (v == null ? "" : Math.round(v * 10000) / 100) + '">';
      else if (f[2] === "money") inp = '<input class="inp" id="z1f-' + k + '" inputmode="decimal" value="' + (v == null || (k === "commission_expected" && r.auto_comm) ? "" : v) + '">';
      else inp = '<input class="inp" id="z1f-' + k + '" maxlength="120" placeholder="' + e(f[3] || "") + '" value="' + e(v || "") + '">';
      return fld(f[1], inp);
    });
    return '<form class="modal z1-wide" data-z1form="soa" role="dialog" aria-modal="true" aria-label="SOA details" novalidate>' + head(r.soa_no ? "Edit SOA " + e(r.soa_no) : "Add SOA") +
      '<div class="mbd"><div class="z1-three">' + inputs.join("") + '</div>' +
      '<label class="z1-check"><input type="checkbox" id="z1f-cwt"' + (r.cwt_applicable ? " checked" : "") + '> CWT applies (the client\'s 2307 is needed)</label>' +
      fld("GoHighLevel link (the contact or opportunity in GHL)", '<input class="inp" id="z1f-ghl_link" maxlength="300" placeholder="https://app.gohighlevel.com/..." value="' + e(r.ghl_link || "") + '">') +
      fld("Notes", '<input class="inp" id="z1f-notes" maxlength="300" value="' + e(r.notes || "") + '">') + errLine() +
      '<p class="small muted">The stage is worked out from the dates you fill in.</p></div>' +
      '<div class="mft"><button type="button" class="btn" data-z1="close">Cancel</button><button type="submit" class="btn pri">' + (r.soa_no ? "Save changes" : "Add SOA") + '</button></div></form>';
  }
  function readSoaForm(r) {
    var o = Object.assign({}, r);
    FORM_FIELDS.forEach(function (f) {
      var k = f[0], v = val("z1f-" + k);
      if (f[2] === "money") o[k] = num(v, f[1]);
      else if (f[2] === "pct") { var n = num(v.replace("%", ""), f[1]); o[k] = n == null ? null : n / 100; }
      else o[k] = v || null;
    });
    o.amount = o.amount == null ? NaN : o.amount;
    o.auto_comm = o.commission_expected == null;
    o.cwt_applicable = document.getElementById("z1f-cwt").checked;
    o.ghl_link = val("z1f-ghl_link") || null; o.notes = val("z1f-notes") || null;
    if (o.ghl_link && !/^https:\/\//i.test(o.ghl_link)) throw new Error("The GHL link should start with https://");
    return o;
  }

  function payoutModal(d) {
    if (!d) return "";
    var linked = B.soas.filter(function (s) { return s.disbursement_id === d.id; });
    var tot = linked.reduce(function (t, s) { return t + (Number(s.commission_amount) || 0); }, 0);
    var receipt = d.receipt_no
      ? '<p><span class="s s-ok">Issued</span> Receipt <b>' + e(d.receipt_no) + '</b> on ' + fmtDate(d.receipt_issued_on) + '</p>' + (can("billing.approve") ? '<div><button class="btn sm" data-z1="undoreceipt">Undo receipt</button></div>' : "")
      : can("billing.approve")
        ? '<form class="z1-three" data-z1form="receipt">' + fld("Receipt no. (Karla's series)", '<input class="inp" id="z1rNo" maxlength="40">') + fld("Date issued", '<input class="inp" type="date" id="z1rOn" value="' + today() + '" max="' + today() + '">') + '<div style="align-self:end"><button class="btn pri" type="submit">Record Karla\'s receipt</button></div></form>'
        : '<p class="small muted">Only Karla (or someone with approval rights) records her receipt.</p>';
    return '<div class="modal z1-wide" role="dialog" aria-modal="true" aria-label="Payout">' + head(e(d.provider) + " payout " + e(d.reference || "")) +
      '<div class="mbd"><div class="z1-kv">' + kv("Received", fmtDate(d.received_on)) + kv("Gross commission", peso(d.gross_amount)) + kv("Withholding tax", peso(d.withholding_amount)) + kv("Net received", peso(d.net_amount)) + '</div>' +
      (d.notes ? '<p class="small"><b>Notes:</b> ' + e(d.notes) + '</p>' : "") +
      '<div class="z1-box"><div class="z1-sect">SOAs covered (' + linked.length + ')' + (linked.length ? ' · ' + peso(tot) + ' of ' + peso(d.gross_amount) + ' gross matched' : "") + '</div>' +
      (linked.length ? '<table class="t"><tbody>' + linked.map(function (s) {
        return '<tr><td><button class="prown" data-z1="opensoa" data-id="' + s.id + '">' + e(s.soa_no) + '</button></td><td>' + e(s.account_name) + '</td><td class="r num">' + peso(s.commission_amount) + '</td><td class="r">' +
          (can("billing.edit") && !d.receipt_no ? '<button class="btn sm" data-z1="unlink" data-id="' + s.id + '">Unlink</button>' : "") + '</td></tr>';
      }).join("") + '</tbody></table>' : '<p class="small muted">No SOAs linked yet.</p>') +
      (can("billing.edit") && !d.receipt_no ? '<div><button class="btn sm" data-z1="link">Link SOAs</button></div>' : "") + '</div>' +
      '<div class="z1-box"><div class="z1-sect">Karla\'s receipt to ' + e(d.provider) + '</div>' + receipt +
      '<details><summary class="small" style="cursor:pointer">Receipt details to copy into Karla\'s template</summary><pre class="z1-pre" id="z1Rcpt">' + e(receiptText(d, linked)) + '</pre><button class="btn sm" data-z1="copyrcpt">Copy</button></details></div>' + errLine() + '</div>' +
      '<div class="mft">' + (can("billing.delete") ? '<button class="btn danger" data-z1="delpayout" style="margin-right:auto">Delete payout</button>' : "") +
      (can("billing.edit") ? '<button class="btn" data-z1="editpayout">Edit</button>' : "") + '<button class="btn pri" data-z1="close">Done</button></div></div>';
  }
  function receiptText(d, soas) {
    return ["Received from: " + d.provider, "Payout received: " + fmtDate(d.received_on) + (d.reference ? " (ref. " + d.reference + ")" : ""),
      "Gross commission: " + peso(d.gross_amount), "Less withholding tax: " + peso(d.withholding_amount), "Net received: " + peso(d.net_amount), "",
      "Covers " + plural(soas.length, "SOA") + ":"].concat(soas.map(function (s) { return "  " + s.soa_no + " · " + s.account_name + " · " + peso(s.commission_amount != null ? s.commission_amount : s.commission_expected); })).join("\n");
  }
  function payoutForm(d) {
    return '<form class="modal confirm" data-z1form="payout" role="dialog" aria-modal="true" aria-label="Payout" novalidate>' + head(d.id ? "Edit payout" : "Record payout") +
      '<div class="mbd"><div class="two">' + fld("Provider", '<select class="inp" id="z1p-provider">' + PROV.map(function (p) { return '<option' + (d.provider === p ? " selected" : "") + '>' + p + '</option>'; }).join("") + '</select>') +
      fld("Date received", '<input class="inp" type="date" id="z1p-received_on" value="' + e(d.received_on || today()) + '" max="' + today() + '">') + '</div>' +
      fld("Provider's reference (voucher or advice no.)", '<input class="inp" id="z1p-reference" maxlength="60" value="' + e(d.reference || "") + '">') +
      '<div class="two">' + fld("Gross commission (₱)", '<input class="inp" id="z1p-gross_amount" inputmode="decimal" value="' + (d.gross_amount == null ? "" : d.gross_amount) + '">') +
      fld("Withholding tax (₱)", '<input class="inp" id="z1p-withholding_amount" inputmode="decimal" value="' + (d.withholding_amount == null ? "" : d.withholding_amount) + '">') + '</div>' +
      fld("Notes", '<input class="inp" id="z1p-notes" maxlength="200" value="' + e(d.notes || "") + '">') + errLine() + '</div>' +
      '<div class="mft"><button type="button" class="btn" data-z1="close">Cancel</button><button type="submit" class="btn pri">Save payout</button></div></form>';
  }
  function linkModal(d) {
    if (!d) return "";
    var cands = B.soas.filter(function (s) { return s.provider.toLowerCase() === d.provider.toLowerCase() && !s.disbursement_id && s.stage === "awaiting_commission"; });
    return '<form class="modal z1-wide" data-z1form="link" role="dialog" aria-modal="true" aria-label="Link SOAs">' + head("Link " + e(d.provider) + " SOAs to this payout") +
      '<div class="mbd"><p class="small muted">SOAs from ' + e(d.provider) + ' that are paid, have their receipt and 2307, and are waiting for commission.</p>' +
      (cands.length ? '<table class="t"><thead><tr><th></th><th>SOA</th><th>Account</th><th class="r">Commission in this payout (₱)</th></tr></thead><tbody>' + cands.map(function (s) {
        return '<tr><td><input type="checkbox" class="z1-lk" data-id="' + s.id + '" aria-label="Select ' + e(s.soa_no) + '"></td><td>' + e(s.soa_no) + '</td><td>' + e(s.account_name) + '</td><td class="r"><input class="inp z1-lka" data-id="' + s.id + '" inputmode="decimal" style="width:130px;text-align:right" value="' + (s.commission_expected == null ? "" : s.commission_expected) + '"></td></tr>';
      }).join("") + '</tbody></table>' : '<div class="empty">No ' + e(d.provider) + ' SOAs are waiting for commission.</div>') + errLine() + '</div>' +
      '<div class="mft"><button type="button" class="btn" data-z1="backpayout">Back</button><button type="submit" class="btn pri"' + (cands.length ? "" : " disabled") + '>Link selected</button></div></form>';
  }
  var IMPORT_COLS = ["soa_no", "provider", "account_name", "product", "coverage_period", "amount", "released_on", "due_on", "paid_on", "paid_amount", "payment_ref",
    "provider_receipt_no", "provider_receipt_on", "cwt_applicable", "cwt_amount", "form_2307_on", "commission_rate", "commission_expected", "notes"];
  function importModal() {
    return '<form class="modal z1-wide" data-z1form="import" role="dialog" aria-modal="true" aria-label="Import SOAs">' + head("Import SOAs from a CSV") +
      '<div class="mbd"><p class="small">The first row holds the column names. <b>soa_no, provider, account_name</b> and <b>amount</b> are required; dates as YYYY-MM-DD.</p>' +
      '<p class="small muted">Columns: ' + IMPORT_COLS.join(", ") + '</p>' +
      fld("CSV file", '<input class="inp" type="file" id="z1ImpFile" accept=".csv,text/csv">') +
      fld("Or paste the CSV here", '<textarea class="inp" id="z1ImpText" rows="6" placeholder="soa_no,provider,account_name,amount&#10;MX-2026-0500,Maxicare,Sample Co,50000"></textarea>') + errLine() +
      '<p class="small muted">Nothing is added if any row has a problem.</p></div>' +
      '<div class="mft"><button type="button" class="btn" data-z1="close">Cancel</button><button type="submit" class="btn pri">Import</button></div></form>';
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(function (c) { return c.trim(); })) rows.push(row); row = []; }
      else cell += ch;
    }
    row.push(cell); if (row.some(function (c) { return c.trim(); })) rows.push(row);
    return rows;
  }
  function importCsv(text) {
    var t = parseCsv(text.replace(/^﻿/, ""));
    if (t.length < 2) throw new Error("The file has no data rows.");
    var hd = t[0].map(function (h) { return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); });
    var miss = ["soa_no", "provider", "account_name", "amount"].filter(function (c) { return hd.indexOf(c) < 0; });
    if (miss.length) throw new Error("Missing column(s): " + miss.join(", "));
    var errs = [], out = [];
    function date(v) { if (!v) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; var d = new Date(v); if (isNaN(d)) throw new Error('"' + v + '" is not a date (use YYYY-MM-DD)'); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    t.slice(1).forEach(function (cells, i) {
      function g(c) { return (cells[hd.indexOf(c)] || "").trim(); }
      try {
        var r = Object.assign(blank(), { id: "s" + Date.now() + "-" + i, soa_no: g("soa_no"), provider: g("provider"), account_name: g("account_name"), amount: num(g("amount"), "amount"),
          product: g("product") || null, coverage_period: g("coverage_period") || null, released_on: date(g("released_on")), due_on: date(g("due_on")), paid_on: date(g("paid_on")),
          paid_amount: num(g("paid_amount"), "paid_amount"), payment_ref: g("payment_ref") || null, provider_receipt_no: g("provider_receipt_no") || null,
          provider_receipt_on: date(g("provider_receipt_on")), cwt_applicable: /^(y|yes|true|1)$/i.test(g("cwt_applicable")), cwt_amount: num(g("cwt_amount"), "cwt_amount"),
          form_2307_on: date(g("form_2307_on")), commission_expected: num(g("commission_expected"), "commission_expected"), notes: g("notes") || null });
        var rt = g("commission_rate"); if (rt) { var n = num(rt.replace("%", ""), "commission_rate"); r.commission_rate = rt.indexOf("%") > -1 || n > 1 ? n / 100 : n; }
        if (r.amount == null) throw new Error("amount is required");
        out.push(r);
      } catch (err) { errs.push("Row " + (i + 2) + ": " + err.message); }
    });
    if (errs.length) throw new Error(errs.slice(0, 5).join(" · ") + (errs.length > 5 ? " · and " + (errs.length - 5) + " more" : ""));
    var snapshot = JSON.stringify(B);
    try { out.forEach(function (r) { writeSoa(r); }); } catch (err) { B = JSON.parse(snapshot); throw err; }
    return out.length;
  }

  /* ---------- events ---------- */
  var app = document.getElementById("app");
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-z1]");
    if (!t) { if (ev.target === scrim) { ev.stopPropagation(); closeModal(); } return; }
    ev.stopPropagation(); ev.preventDefault();
    var a = t.getAttribute("data-z1"), id = t.getAttribute("data-id"), v = t.getAttribute("data-v");
    try { act(a, id, v); } catch (err) { Z.err = err.message; drawModal(); }
  }, true);
  function act(a, id, v) {
    var m = Z.modal, s, d;
    switch (a) {
      case "signout": me = null; try { localStorage.removeItem(AUTH_KEY); } catch (err) { /* private mode */ } closeModal(); lock(); return;
      case "tab": Z.tab = v; render(); return;
      case "fstage": Z.fStage = Z.fStage === v ? "all" : v; render(); return;
      case "fneed": Z.fNeed = !Z.fNeed; render(); return;
      case "fclear": Z.fStage = "all"; Z.fProv = "all"; Z.fNeed = false; Z.q = ""; render(); return;
      case "close": closeModal(); return;
      case "opensoa": openModal({ kind: "soa", id: id }); return;
      case "openpayout": openModal({ kind: "payout", id: id }); return;
      case "newsoa": openModal({ kind: "soaform", row: blank() }); return;
      case "editsoa": openModal({ kind: "soaform", row: Object.assign({}, soa(id)) }); return;
      case "newpayout": openModal({ kind: "payoutform", row: { provider: "Maxicare" } }); return;
      case "editpayout": openModal({ kind: "payoutform", row: Object.assign({}, payout(m.id)) }); return;
      case "import": openModal({ kind: "import" }); return;
      case "link": openModal({ kind: "link", id: m.id }); return;
      case "backpayout": openModal({ kind: "payout", id: m.id }); return;
      case "gopayouts": closeModal(); Z.tab = "payouts"; render(); return;
      case "step": Z.step = v || null; Z.err = ""; drawModal(); var f = scrim.querySelector("[data-z1form=step] input"); if (f) f.focus(); return;
      case "delsoa":
        s = soa(id); if (!s) return;
        if (Z.sure !== "soa:" + id) { Z.sure = "soa:" + id; Z.err = "Click Delete again to remove SOA " + s.soa_no + " and its timeline. This can't be undone."; drawModal(); return; }
        B.soas = B.soas.filter(function (x) { return x.id !== id; }); B.events = B.events.filter(function (x) { return x.soa_id !== id; });
        closeModal(); commit("SOA " + s.soa_no + " deleted"); return;
      case "delpayout":
        d = payout(m.id); if (!d) return;
        if (Z.sure !== "payout:" + d.id) { Z.sure = "payout:" + d.id; Z.err = "Click Delete payout again to remove it. Its SOAs go back to awaiting commission."; drawModal(); return; }
        B.soas.forEach(function (x) { if (x.disbursement_id === d.id) { x.disbursement_id = null; x.commission_amount = null; } });
        B.payouts = B.payouts.filter(function (x) { return x.id !== d.id; }); restage(); closeModal(); commit("Payout deleted"); return;
      case "unlink":
        s = soa(id); s.disbursement_id = null; s.commission_amount = null; restage(); commit(); drawModal(); return;
      case "undoreceipt":
        d = payout(m.id); d.receipt_no = null; d.receipt_issued_on = null; restage(); commit("Receipt removed"); drawModal(); return;
      case "copyrcpt":
        var txt = document.getElementById("z1Rcpt").textContent;
        try { navigator.clipboard.writeText(txt).then(function () { say("Receipt details copied"); }, function () { say("Select the text and copy it"); }); } catch (err) { say("Select the text and copy it"); }
        return;
      case "export": exportCsv(); return;
      case "copycsv":
        try { navigator.clipboard.writeText(document.getElementById("z1Csv").textContent).then(function () { say("CSV copied"); }, function () { say("Select the text and copy it"); }); } catch (err) { say("Select the text and copy it"); }
        return;
    }
  }
  scrim.addEventListener("submit", function (ev) {
    ev.preventDefault(); ev.stopPropagation();
    var kind = ev.target.getAttribute("data-z1form"), m = Z.modal;
    try {
      if (kind === "note") {
        var body = val("z1NoteBody"); if (!body) throw new Error("Write the follow-up or note first.");
        addEvent(m.id, document.getElementById("z1NoteKind").value, body); commit(); drawModal(); return;
      }
      if (kind === "step") {
        var s = Object.assign({}, soa(m.id)), dt = val("z1sD"); if (!dt) throw new Error("Pick the date.");
        if (Z.step === "release") { s.released_on = dt; s.due_on = val("z1sDue") || null; }
        if (Z.step === "paid") { s.paid_on = dt; s.paid_amount = num(val("z1sA"), "Amount paid"); s.payment_ref = val("z1sR") || null; }
        if (Z.step === "preceipt") { s.provider_receipt_on = dt; s.provider_receipt_no = val("z1sR") || null; }
        if (Z.step === "f2307") s.form_2307_on = dt;
        if (Z.step === "close") s.closed_on = dt;
        writeSoa(s); Z.step = null; Z.err = ""; commit("SOA " + s.soa_no + " updated"); drawModal(); return;
      }
      if (kind === "soa") { var r = readSoaForm(m.row); writeSoa(r); commit("SOA " + r.soa_no + " saved"); openModal({ kind: "soa", id: r.id }); return; }
      if (kind === "payout") {
        var p = Object.assign({ id: "d" + Date.now(), receipt_no: null, receipt_issued_on: null }, m.row);
        p.provider = val("z1p-provider"); p.received_on = val("z1p-received_on"); p.reference = val("z1p-reference") || null; p.notes = val("z1p-notes") || null;
        p.gross_amount = num(val("z1p-gross_amount"), "Gross commission"); p.withholding_amount = num(val("z1p-withholding_amount"), "Withholding tax") || 0;
        if (!p.received_on) throw new Error("Pick the date received.");
        if (p.gross_amount == null || p.gross_amount < 0) throw new Error("Enter the gross commission.");
        if (p.withholding_amount > p.gross_amount) throw new Error("Withholding tax can't be more than the gross commission.");
        var old = payout(p.id);
        if (old && old.provider !== p.provider && B.soas.some(function (x) { return x.disbursement_id === old.id; })) throw new Error("Unlink its SOAs before changing the provider.");
        p.net_amount = Math.round((p.gross_amount - p.withholding_amount) * 100) / 100;
        if (old) Object.assign(old, p); else B.payouts.push(p);
        commit("Payout saved"); Z.tab = "payouts"; render(); openModal({ kind: "payout", id: p.id }); return;
      }
      if (kind === "link") {
        var picks = [].slice.call(scrim.querySelectorAll(".z1-lk:checked"));
        if (!picks.length) throw new Error("Tick at least one SOA.");
        var snapshot = JSON.stringify(B);
        try {
          picks.forEach(function (cb) {
            var sid = cb.getAttribute("data-id"), amtEl = scrim.querySelector('.z1-lka[data-id="' + sid + '"]');
            var x = Object.assign({}, soa(sid)); x.disbursement_id = m.id; x.commission_amount = num(amtEl.value.trim(), "Commission"); writeSoa(x);
          });
        } catch (err) { B = JSON.parse(snapshot); throw err; }
        commit(plural(picks.length, "SOA") + " linked"); openModal({ kind: "payout", id: m.id }); return;
      }
      if (kind === "receipt") {
        if (!can("billing.approve")) throw new Error("Only Karla records her receipt.");
        var no = val("z1rNo"), on = val("z1rOn"); if (!no || !on) throw new Error("Enter the receipt number and date.");
        var d = payout(m.id); d.receipt_no = no; d.receipt_issued_on = on; restage(); commit("Karla's receipt " + no + " recorded"); drawModal(); return;
      }
      if (kind === "import") {
        var file = document.getElementById("z1ImpFile").files[0], text = document.getElementById("z1ImpText").value;
        var run = function (tx) { try { var n = importCsv(tx); closeModal(); commit(plural(n, "SOA") + " imported"); } catch (err) { Z.err = err.message; drawModal(); } };
        if (file) { var rd = new FileReader(); rd.onload = function () { run(String(rd.result)); }; rd.readAsText(file); } else if (text.trim()) run(text); else throw new Error("Choose a file or paste the CSV.");
        return;
      }
    } catch (err) { Z.err = err.message; drawModal(); }
  }, true);
  app.addEventListener("input", function (ev) {
    if (ev.target.getAttribute && ev.target.getAttribute("data-z1f") === "q") { Z.q = ev.target.value; render(); }
  }, true);
  app.addEventListener("change", function (ev) {
    var f = ev.target.getAttribute && ev.target.getAttribute("data-z1f");
    if (f === "prov") { Z.fProv = ev.target.value; render(); } else if (f === "stage") { Z.fStage = ev.target.value; render(); }
  }, true);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && Z.modal) { ev.stopImmediatePropagation(); closeModal(); } }, true);

  function exportCsv() {
    var cols = ["soa_no", "provider", "account_name", "product", "coverage_period", "amount", "stage", "released_on", "due_on", "paid_on", "paid_amount", "payment_ref",
      "provider_receipt_no", "provider_receipt_on", "cwt_applicable", "cwt_amount", "form_2307_on", "commission_rate", "commission_expected", "commission_amount", "closed_on", "notes"];
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = [cols.join(",")].concat(B.soas.map(function (s) { return cols.map(function (c) { return q(c === "stage" ? stageInfo(s.stage).label : s[c]); }).join(","); })).join("\n");
    openModal({ kind: "export", csv: csv });
  }

  /* ---------- hook into the original page ---------- */
  // Billing & SOA sits under Numbers, right after Proposals (Paolo, 2026-11-24).
  (function () {
    var num = NAV.filter(function (g) { return g[0] === "Numbers"; })[0];
    if (!num) { NAV.push(["Numbers", [["billing", "Billing & SOA", "so"]]]); return; }
    var at = num[1].length; num[1].forEach(function (it, i) { if (it[0] === "proposals") at = i + 1; });
    num[1].splice(at, 0, ["billing", "Billing & SOA", "so"]);
  })();
  var baseBadge = badgeCount;
  badgeCount = function (k) { return k === "so" ? needCount() : baseBadge(k); };
  VIEWS.billing = vBilling;
  var baseRender2 = render;
  render = function () { baseRender2(); renderMe(); };

  /* ---------- Leads and Leads finder as one page with two tabs (Paolo, 2026-11-24) ---------- */
  NAV.forEach(function (g) { g[1] = g[1].filter(function (it) { return it[0] !== "finder"; }); });
  // Email campaigns and Outreach inboxes sit under Numbers, right after Leads (Paolo, 2026-11-24).
  (function () {
    var moved = [];
    NAV.forEach(function (g) { g[1] = g[1].filter(function (it) { if (it[0] === "campaigns" || it[0] === "outreach") { moved.push(it); return false; } return true; }); });
    var num = NAV.filter(function (g) { return g[0] === "Numbers"; })[0];
    if (!num) return;
    var at = 0; num[1].forEach(function (it, i) { if (it[0] === "leads") at = i + 1; });
    moved.sort(function (a) { return a[0] === "campaigns" ? -1 : 1; });
    num[1].splice.apply(num[1], [at || num[1].length, 0].concat(moved));
  })();
  function leadTabs(html, on) {
    var tabs = '<div class="chips"><button class="chip" data-go="leads" aria-pressed="' + (on === "leads") + '">List</button>' +
      '<button class="chip" data-go="finder" aria-pressed="' + (on === "finder") + '">How it\'s going</button></div>';
    html = html.replace("<h2>Leads finder</h2>", "<h2>Leads</h2>");
    var cut = html.indexOf("</button></div>");
    return cut > -1 ? html.slice(0, cut + 15) + tabs + html.slice(cut + 15) : tabs + html;
  }
  var baseLeads = VIEWS.leads, baseFinder = VIEWS.finder;
  VIEWS.leads = function () { return leadTabs(baseLeads(), "leads"); };
  VIEWS.finder = function () { return leadTabs(baseFinder(), "finder"); };
  var baseNav = renderNav;
  renderNav = function () {
    baseNav();
    if (S.view !== "finder") return;
    var b = document.querySelector('#nav [data-go="leads"]');
    if (b) { b.classList.add("on"); b.setAttribute("aria-current", "page"); }
  };

  /* ---------- 3. live office: Nina and Sol work the tracker ---------- */
  function buildLive() {
    var open = B.soas.filter(function (s) { return s.stage !== "closed"; });
    var wf = open.map(function (s) { return { s: s, f: flags(s) }; });
    var overdue = wf.filter(function (x) { return x.f.overdue > 0; }).sort(function (a, b) { return b.f.overdue - a.f.overdue; });
    var unpaid = open.filter(function (s) { return s.stage === "awaiting_payment"; });
    var docs = wf.filter(function (x) { return x.s.stage === "awaiting_docs" || x.f.m2307; });
    var released = B.soas.filter(function (s) { return s.released_on; });
    var onTime = released.filter(function (s) { return s.paid_on && (!s.due_on || s.paid_on <= s.due_on); }).length;
    var odAmt = overdue.reduce(function (t, x) { return t + x.s.amount; }, 0);
    var nina = {
      role: "SOA Collections Tracker",
      desc: "Tracks every SOA from release to client payment, the provider's receipt and the 2307, and chases what is late.",
      now: overdue.length ? "Chasing " + plural(overdue.length, "overdue SOA") + " (" + peso(odAmt) + ")" : docs.length ? "Collecting receipts and 2307s for " + plural(docs.length, "paid SOA") : unpaid.length ? "Watching " + plural(unpaid.length, "unpaid SOA") + ", none overdue" : "All SOAs are paid up",
      say: overdue.length ? plural(overdue.length, "SOA") + " overdue. I'm on it." : undefined,
      tasks: overdue.slice(0, 4).map(function (x) { return "Follow up " + x.s.account_name + " on SOA " + x.s.soa_no + " (" + x.f.overdue + " days overdue)"; })
        .concat(docs.slice(0, 3).map(function (x) { return !x.s.provider_receipt_on ? "Get " + x.s.provider + "'s receipt for SOA " + x.s.soa_no : "Get the 2307 from " + x.s.account_name + " for SOA " + x.s.soa_no; }))
        .concat(unpaid.filter(function (s) { return !flags(s).overdue; }).slice(0, 2).map(function (s) { return "Watch SOA " + s.soa_no + " from " + s.account_name + ", due " + (s.due_on || "soon"); })),
      k: "Released SOAs paid on time", kc: onTime, kg: Math.max(1, released.length),
    };
    var due = B.payouts.filter(function (d) { return !d.receipt_no; });
    var waitC = open.filter(function (s) { return s.stage === "awaiting_commission"; });
    var cnt = function (d) { return B.soas.filter(function (s) { return s.disbursement_id === d.id; }).length; };
    var sol = {
      role: "Commissions & Receipts",
      desc: "Matches each provider's commission payout to its SOAs and prepares the details for Karla's receipt.",
      now: due.length ? "Preparing Karla's receipt for the " + due[0].provider + " payout (" + peso(due[0].net_amount) + ")" : waitC.length ? "Waiting for commission on " + plural(waitC.length, "SOA") : "Every payout has Karla's receipt",
      say: due.length ? "A payout needs Karla's receipt." : undefined,
      tasks: due.map(function (d) { return ("Get Karla's receipt for " + d.provider + " " + (d.reference || "") + " (" + plural(cnt(d), "SOA") + ", " + peso(d.net_amount) + " net)").replace("  ", " "); })
        .concat(waitC.slice(0, 4).map(function (s) { return "Watch for " + s.provider + " commission on SOA " + s.soa_no + " (" + peso(s.commission_expected) + " expected)"; })),
      k: "Payouts with Karla's receipt", kc: B.payouts.length - due.length, kg: Math.max(1, B.payouts.length),
    };
    var items = due.map(function (d) { return { who: "sol", title: "Karla's receipt for " + d.provider + " payout", tone: "need", badge: "Karla", sub: plural(cnt(d), "SOA") + " · " + peso(d.net_amount) + " net · received " + daysBetween(d.received_on) + " d ago", path: "payout:" + d.id }; })
      .concat(overdue.slice(0, 3).map(function (x) { return { who: "nina", title: x.s.account_name + ": SOA " + x.s.soa_no, tone: "need", badge: x.f.overdue + " d overdue", sub: x.s.provider + " · " + peso(x.s.amount) + " unpaid", path: "soa:" + x.s.id }; }))
      .concat(docs.filter(function (x) { return x.f.m2307; }).slice(0, 2).map(function (x) { return { who: "nina", title: "2307 missing: " + x.s.account_name, tone: "info", badge: "2307", sub: "SOA " + x.s.soa_no + " · " + x.s.provider, path: "soa:" + x.s.id }; }));
    if (overdue.length > 3) items.push({ who: "nina", title: (overdue.length - 3) + " more overdue SOAs", tone: "info", badge: "View all", path: "billing" });
    return { type: "z1-live", agents: { nina: nina, sol: sol }, items: items, empty: "SOAs and payouts are all on track" };
  }

  var LIVE_SRC = (document.getElementById("z1LiveSrc") || {}).textContent || "";
  function officeWin() { var fr = document.getElementById("officeFrame"); try { return fr && fr.contentWindow; } catch (err) { return null; } }
  function pushLive() {
    var w = officeWin();
    if (!w || !me || !can("billing.view")) return;
    try {
      if (typeof w.renderPanel !== "function") return;
      if (!w.__z1live && LIVE_SRC) { var sc = w.document.createElement("script"); sc.textContent = LIVE_SRC; w.document.body.appendChild(sc); w.__z1live = true; }
      w.postMessage(buildLive(), "*");
    } catch (err) { /* office not ready yet */ }
  }
  window.addEventListener("message", function (ev) {
    var w = officeWin(); if (!w || ev.source !== w) return;
    var m = ev.data;
    if (m && m.type === "z1-office-ready") { pushLive(); return; }
    if (m && m.type === "z1-open" && typeof m.path === "string") {
      var p = m.path.split(":");
      if (p[0] === "soa") { Z.tab = "soas"; go("billing"); openModal({ kind: "soa", id: p[1] }); }
      else if (p[0] === "payout") { Z.tab = "payouts"; go("billing"); openModal({ kind: "payout", id: p[1] }); }
      else { Z.tab = "soas"; Z.fNeed = true; go("billing"); }
    }
  });
  // The office frame loads on its own schedule; feed it once it is ready, and refresh the dates every minute.
  var tries = 0, boot = setInterval(function () { var w = officeWin(); tries++; if ((w && w.__z1live) || tries > 120) { clearInterval(boot); return; } pushLive(); }, 1000);
  setInterval(pushLive, 60000);

  lock();
  render();
})();
