/* zero1office add-on: Client stats periods, account type names, workflow create/edit/delete, calendar event edit
   (Paolo, 2026-11-25). Appended after addon.js and propgen.js; the original page stays byte for byte the same. */
(function () {
  "use strict";
  if (typeof S === "undefined" || typeof VIEWS === "undefined") return;
  function e(s) { return esc(s == null ? "" : String(s)); }
  function say(m) { try { toast(m); } catch (err) { /* optional */ } }
  function store(k, v) { try { if (arguments.length > 1) localStorage.setItem(k, JSON.stringify(v)); else return JSON.parse(localStorage.getItem(k) || "null"); } catch (err) { return null; } }

  /* ---------- account types: "Government Offices" is now "Government"; Personnel added ---------- */
  function rename(x, depth) {
    if (depth > 5 || !x || typeof x !== "object") return;
    Object.keys(x).forEach(function (k) {
      var v = x[k];
      if (typeof v === "string" && v.indexOf("Government Offices") > -1) x[k] = v.replace(/Government Offices/g, "Government");
      else if (v && typeof v === "object") rename(v, depth + 1);
    });
  }
  [typeof ACC_TYPES !== "undefined" && ACC_TYPES, typeof PR_TYPES !== "undefined" && PR_TYPES, typeof CLIENTS !== "undefined" && CLIENTS,
    typeof PROPOSALS !== "undefined" && PROPOSALS, typeof LEADS !== "undefined" && LEADS, S.team, S.data].forEach(function (x) { if (x) rename(x, 0); });
  if (typeof ACC_TYPES !== "undefined" && ACC_TYPES.indexOf("Personnel") < 0) ACC_TYPES.push("Personnel");
  if (typeof PR_TYPES !== "undefined" && PR_TYPES.indexOf("Personnel") < 0) PR_TYPES.push("Personnel");

  /* ---------- Client stats: whole year, semi-annual and quarterly ---------- */
  var PER = { year: { n: "Whole year", d: 1, days: 365, each: "a year", short: "/ yr" }, half: { n: "Semi-annual", d: 2, days: 182, each: "every 6 months", short: "/ half" }, quarter: { n: "Quarterly", d: 4, days: 91, each: "every 3 months", short: "/ qtr" } };
  var MIXC = ["#002C6C", "#1E5190", "#3E7BD1", "#7FA8E6", "#D3A13B", "#E8C477", "#10B981", "#8B5CF6", "#E05555", "#94A3B8"];
  function vClientsX() {
    var ALL = CLIENTS, f = S.clF || { type: "all", prod: "all", co: "all" }, grp = S.clGroup || "type", sort = S.clSort || "prem";
    var pk = S.clPer || "year", P = PER[pk];
    var C = ALL.filter(function (c) { return (f.type === "all" || c.type === f.type) && (f.prod === "all" || c.prod === f.prod) && (f.co === "all" || c.co === f.co); });
    var sum = function (a, k) { return a.reduce(function (s, c) { return s + c[k]; }, 0); };
    var mem = sum(C, "m"), prem = sum(C, "prem"), hmo = C.filter(function (c) { return c.use != null; });
    var avgUse = hmo.length ? Math.round(sum(hmo, "use") / hmo.length) : 0, hi = C.filter(function (c) { return c.g === "high"; }).length;
    var ren = C.filter(function (c) { return c.days >= 0 && c.days <= P.days; });
    function per(n) { return peso(Math.round(n / P.d)); }
    function mix(title, key, keys) {
      var tot = prem || 1, parts = keys.map(function (k, i) { var a = C.filter(function (c) { return c[key] === k; }); return { k: k, a: a, p: sum(a, "prem"), col: MIXC[i % MIXC.length] }; });
      var bar = '<div class="exbar" aria-hidden="true">' + parts.filter(function (x) { return x.p; }).map(function (x) { return '<i style="width:' + (x.p / tot * 100) + '%;background:' + x.col + '"></i>'; }).join("") + "</div>";
      return '<div class="card pad stack"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3>' + title + '</h3><span class="muted small">' + e(P.n.toLowerCase()) + " premium</span></div>" + bar + parts.map(function (x) {
        return '<button class="mixrow' + (f[key] === x.k ? " on" : "") + '" data-act="clf" data-k="' + key + '" data-v="' + e(x.k) + '"><span class="mn"><i class="exdot" style="background:' + x.col + '"></i>' + e(x.k) + '</span><span class="mc">' + x.a.length + '</span><span class="bar"><i style="width:' + Math.round(x.p / tot * 100) + '%;background:' + x.col + '"></i></span><span class="mp">' + (x.p ? per(x.p) : "—") + "</span></button>";
      }).join("") + "</div>";
    }
    function rows(arr) {
      return '<div class="tblwrap"><table class="t" style="min-width:820px"><tr><th>Account</th><th>Type</th><th>Product</th><th>Company</th><th>Plan</th><th class="r">Lives</th><th class="r">Premium ' + P.short + "</th>" + (pk !== "year" ? '<th class="r">Premium / yr</th>' : "") + '<th>Renews</th><th style="min-width:120px">Benefit used</th></tr>' + arr.map(function (c) {
        return "<tr><td><b>" + e(c.n) + "</b>" + (c.g === "renew" ? ' <span class="tag" style="background:var(--warn-soft);color:var(--warn)">renewing</span>' : c.g === "high" ? ' <span class="tag" style="background:var(--bad-soft);color:var(--bad)">high use</span>' : c.g === "quiet" ? ' <span class="tag">quiet</span>' : "") + "</td><td>" + e(c.type) + "</td><td>" + e(c.prod) + "</td><td>" + e(c.co) + "</td><td>" + e(c.plan) + '</td><td class="r num">' + c.m + '</td><td class="r num"><b>' + per(c.prem) + "</b></td>" + (pk !== "year" ? '<td class="r num muted">' + peso(c.prem) + "</td>" : "") + "<td>" + e(fmtDate(c.ren)) + "</td><td>" + (c.use == null ? '<span class="muted small">n/a</span>' : '<div style="display:flex;gap:8px;align-items:center"><div class="bar" style="flex:1"><i style="width:' + c.use + '%"></i></div><span class="num small">' + c.use + "%</span></div>") + "</td></tr>";
      }).join("") + "</table></div>";
    }
    var keys = grp === "type" ? ACC_TYPES : grp === "prod" ? PRODUCTS : PROVIDERS.map(function (p) { return p[0]; });
    var sorter = sort === "prem" ? function (a, b) { return b.prem - a.prem; } : sort === "ren" ? function (a, b) { return a.days - b.days; } : sort === "m" ? function (a, b) { return b.m - a.m; } : function (a, b) { return a.n.localeCompare(b.n); };
    var groups = keys.map(function (k) {
      var a = C.filter(function (c) { return c[grp] === k; }).sort(sorter); if (!a.length) return "";
      return '<div class="card pad stack"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><h3>' + e(k) + " · " + a.length + '</h3><span class="muted small">' + sum(a, "m") + " lives · " + per(sum(a, "prem")) + " " + P.each + "</span></div>" + rows(a) + "</div>";
    }).join("");
    var sel = function (id, label, val, opts) { return '<label class="small muted" style="display:grid;gap:3px">' + label + '<select class="inp" id="' + id + '"><option value="all">All</option>' + opts.map(function (o) { return "<option" + (val === o ? " selected" : "") + ">" + e(o) + "</option>"; }).join("") + "</select></label>"; };
    var filtered = f.type !== "all" || f.prod !== "all" || f.co !== "all";
    // the three periods side by side; click one to see every number below in that period
    var hero = '<div class="exper" role="group" aria-label="Show figures for">' + ["year", "half", "quarter"].map(function (k) {
      var q = PER[k];
      return '<button class="expc' + (k === pk ? " on" : "") + '" data-ex="clper" data-v="' + k + '" aria-pressed="' + (k === pk) + '"><span class="k">' + q.n + '</span><span class="v">' + peso(Math.round(prem / q.d)) + '</span><span class="h">premium ' + q.each + "</span></button>";
    }).join("") + "</div>";
    // renewals coming up, in the chosen period's steps over the next 12 months
    var steps = P.d === 1 ? [[0, 365, "Next 12 months"]] : P.d === 2 ? [[0, 182, "Next 6 months"], [183, 365, "6 to 12 months"]] : [[0, 91, "Next 3 months"], [92, 182, "3 to 6 months"], [183, 273, "6 to 9 months"], [274, 365, "9 to 12 months"]];
    var buckets = steps.map(function (s) { var a = C.filter(function (c) { return c.days >= s[0] && c.days <= s[1]; }); return { l: s[2], n: a.length, p: sum(a, "prem") }; });
    var bmax = Math.max.apply(null, buckets.map(function (b) { return b.p; }).concat([1]));
    var renCard = '<div class="card pad stack"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h3>When renewals fall</h3><span class="muted small">annual premium up for renewal</span></div><div class="exren">' + buckets.map(function (b) {
      return '<div class="exrb"><span class="l">' + b.l + '</span><span class="b"><i style="width:' + Math.round(b.p / bmax * 100) + '%"></i></span><span class="n">' + b.n + " account" + (b.n === 1 ? "" : "s") + " · <b>" + peso(b.p) + "</b></span></div>";
    }).join("") + "</div></div>";
    var rec = S.data.clientRec;
    var recCard = '<div class="card pad" style="background:var(--gold-soft);border-color:transparent;display:grid;gap:6px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>Recommendation from ' + e(nameOf("owen")) + " · Renewals</b>" + apState(rec === "approved" ? "approved" : rec) + '</div><p class="small">Seaside Family Clinic renews in 3 days and hasn\'t confirmed. Send the renewal offer today with Quinn\'s re-benchmark (Essential stays the best fit, +3% premium), and ask Dom to book a 10-minute call.</p>' +
      (rec === "waiting" || rec === "changes" ? '<div class="actions"><button class="btn pri sm" data-act="rec" data-v="approved">Approve</button><button class="btn sm" data-act="rec" data-v="changes">Ask for changes</button><button class="btn sm" data-act="rec" data-v="declined">Decline</button></div><p class="muted" style="font-size:11px">Approving gives Owen the go-ahead. Nothing is sent to the client from this page.</p>' : '<div><button class="btn sm" data-act="rec" data-v="waiting">Undo</button></div>') + "</div>";
    return '<div class="ph"><div><h2>Client stats</h2><p>Every account you handle, by account type, product and company. Pick a period to see premiums for the whole year, each half or each quarter. Sample accounts.</p></div><button class="btn sm" data-go="office">Back to the office</button></div>' +
      '<h3 class="secth">Overall · ' + e(P.n) + "</h3>" + hero +
      '<div class="tiles"><div class="tile"><span class="k">Accounts</span><span class="v">' + C.length + '</span><span class="h">' + (filtered ? "matching your filter" : "all products") + '</span></div><div class="tile"><span class="k">Lives covered</span><span class="v">' + mem.toLocaleString() + '</span><span class="h">members and insureds</span></div><div class="tile"><span class="k">Premium ' + P.each + '</span><span class="v">' + per(prem) + '</span><span class="h">' + (pk === "year" ? "in force" : peso(prem) + " a year ÷ " + P.d) + '</span></div><div class="tile"><span class="k">Renewing in ' + (pk === "year" ? "12" : pk === "half" ? "6" : "3") + ' months</span><span class="v">' + ren.length + '</span><span class="h">' + peso(sum(ren, "prem")) + ' a year at stake</span></div><div class="tile"><span class="k">HMO benefit used</span><span class="v">' + avgUse + '%</span><span class="h">' + hi + " with high use</span></div></div>" +
      '<div class="mixgrid">' + mix("By account type", "type", ACC_TYPES) + mix("By product", "prod", PRODUCTS) + mix("By company", "co", PROVIDERS.map(function (p) { return p[0]; })) + "</div>" + renCard +
      (C.some(function (c) { return c.g === "renew" && c.n === "Seaside Family Clinic"; }) ? recCard : "") +
      '<div class="card pad clbar"><div class="clsel">' + sel("clType", "Account type", f.type, ACC_TYPES) + sel("clProd", "Product", f.prod, PRODUCTS) + sel("clCo", "Company", f.co, PROVIDERS.map(function (p) { return p[0]; })) + "</div>" +
      '<div class="clsel"><div class="small muted" style="display:grid;gap:3px">Group by<div class="seg" role="group" aria-label="Group by">' + [["type", "Account type"], ["prod", "Product"], ["co", "Company"]].map(function (g) { return '<button data-act="clgroup" data-v="' + g[0] + '" aria-pressed="' + (grp === g[0]) + '">' + g[1] + "</button>"; }).join("") + "</div></div>" +
      '<label class="small muted" style="display:grid;gap:3px">Sort by<select class="inp" id="clSort">' + [["prem", "Premium, highest first"], ["ren", "Renewal date, soonest first"], ["m", "Lives, most first"], ["n", "Name, A to Z"]].map(function (o) { return '<option value="' + o[0] + '"' + (sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      (filtered ? '<button class="btn sm" data-act="clclear" style="align-self:end">Clear filters</button>' : "") + "</div></div>" +
      '<div class="stack">' + (groups || '<div class="card pad empty">No accounts match these filters.</div>') + "</div>";
  }
  if (VIEWS.clients) VIEWS.clients = vClientsX;

  /* ---------- Workflows: create, edit and delete (kept in this browser) ---------- */
  var WF_KEY = "zero1office:workflows:v1";
  var saved = store(WF_KEY);
  if (Array.isArray(saved) && typeof FLOWS !== "undefined") { FLOWS.length = 0; saved.forEach(function (f) { FLOWS.push(f); }); }
  var WF = { edit: null, draft: null, err: "" }; // edit: index, or -1 for a new workflow
  function saveFlows() { store(WF_KEY, FLOWS); }
  function people() { return [["you", "You"]].concat(S.team.map(function (x) { return [x.id, x.n + " · " + x.r]; })); }
  function chain(f) {
    return '<div class="chain">' + f[1].map(function (s, ix) {
      var p = s.split(":"), id = p[0], txt = p.slice(1).join(":"), html;
      if (id === "you") html = '<span class="step you">' + e(txt) + "</span>";
      else { var x = byId(id); html = x ? '<span class="step">' + av(x) + "<b>" + e(x.n) + "</b>&nbsp;" + e(txt) + "</span>" : '<span class="step gone" title="This employee was removed">' + e(id.charAt(0).toUpperCase() + id.slice(1)) + " " + e(txt) + "</span>"; }
      return (ix ? '<span class="arr">→</span>' : "") + html;
    }).join("") + "</div>";
  }
  function editor() {
    var d = WF.draft, opts = people();
    return '<form class="card pad stack" data-wfform="1" novalidate><h3>' + (WF.edit === -1 ? "Create a workflow" : "Edit workflow") + '</h3>' +
      '<label class="fld">Workflow name<input class="inp" data-wff="name" maxlength="80" value="' + e(d.name) + '" placeholder="e.g. New SME HMO client"></label>' +
      '<div class="stack" style="gap:8px">' + d.steps.map(function (s, i) {
        return '<div class="exstep"><span class="num muted">' + (i + 1) + '</span><select class="inp" data-wfs="who" data-i="' + i + '" aria-label="Step ' + (i + 1) + ' done by">' + opts.map(function (o) { return '<option value="' + e(o[0]) + '"' + (o[0] === s.who ? " selected" : "") + ">" + e(o[1]) + "</option>"; }).join("") + '</select>' +
          '<input class="inp" data-wfs="what" data-i="' + i + '" maxlength="80" value="' + e(s.what) + '" placeholder="what they do, e.g. sends the proposal" aria-label="Step ' + (i + 1) + ' task">' +
          '<span class="exbtns"><button class="btn sm" type="button" data-ex="wfup" data-v="' + i + '" aria-label="Move step ' + (i + 1) + ' up"' + (i ? "" : " disabled") + '>↑</button><button class="btn sm" type="button" data-ex="wfdelstep" data-v="' + i + '" aria-label="Remove step ' + (i + 1) + '"' + (d.steps.length > 1 ? "" : " disabled") + ">✕</button></span></div>";
      }).join("") + "</div>" +
      (d.steps.length < 12 ? '<div><button class="btn sm" type="button" data-ex="wfaddstep">+ Add a step</button></div>' : "") +
      (WF.err ? '<p class="err" role="alert" style="margin:0">' + e(WF.err) + "</p>" : "") +
      '<p class="muted small" style="margin:0">Steps done by "You" show in gold: they need your OK. For those, write the whole step, e.g. "You approve".</p>' +
      '<div class="actions"><button class="btn pri" type="submit">' + (WF.edit === -1 ? "Create workflow" : "Save changes") + '</button><button class="btn" type="button" data-ex="wfcancel">Cancel</button></div></form>';
  }
  function vWorkflowsX() {
    var h = '<div class="ph"><div><h2>Workflows</h2><p>How work moves between your AI employees. Gold steps need you. Removed employees show crossed out.</p></div>' + (WF.edit === null ? '<button class="btn pri sm" data-ex="wfnew">+ Create workflow</button>' : "") + "</div>";
    if (WF.edit === -1) h += editor();
    h += FLOWS.map(function (f, i) {
      if (WF.edit === i) return editor();
      return '<div class="card pad" style="margin-bottom:12px;display:grid;gap:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3>' + e(f[0]) + '</h3><div class="actions" style="margin:0"><button class="btn sm" data-ex="wfedit" data-v="' + i + '">Edit</button><button class="btn sm danger" data-ex="wfdel" data-v="' + i + '">Delete</button></div></div>' + chain(f) + "</div>";
    }).join("");
    if (!FLOWS.length && WF.edit === null) h += '<div class="card pad empty">No workflows yet. Use + Create workflow to add one.</div>';
    return h;
  }
  if (VIEWS.workflows) VIEWS.workflows = vWorkflowsX;
  function startEdit(i) {
    WF.edit = i; WF.err = "";
    var f = i === -1 ? ["", []] : FLOWS[i];
    WF.draft = { name: f[0], steps: f[1].map(function (s) { var p = s.split(":"); return { who: p[0], what: p.slice(1).join(":") }; }) };
    if (i === -1) WF.draft.steps = [{ who: (S.team[0] && S.team[0].id) || "you", what: "" }, { who: "you", what: "You approve" }];
  }
  function submitFlow() {
    var d = WF.draft, name = d.name.trim();
    var steps = d.steps.map(function (s) { return { who: s.who, what: s.what.replace(/:/g, " ").trim() }; }).filter(function (s) { return s.what; });
    if (!name) { WF.err = "Give the workflow a name."; return render(); }
    if (steps.length < 2) { WF.err = "Add at least two steps, each with what is done."; return render(); }
    if (FLOWS.some(function (f, i) { return i !== WF.edit && f[0].toLowerCase() === name.toLowerCase(); })) { WF.err = "There's already a workflow with that name."; return render(); }
    var flow = [name, steps.map(function (s) { return s.who + ":" + s.what; })];
    if (WF.edit === -1) FLOWS.unshift(flow); else FLOWS[WF.edit] = flow;
    var made = WF.edit === -1; WF.edit = null; WF.draft = null; WF.err = ""; saveFlows(); render(); say(made ? "Workflow created." : "Workflow saved.");
  }

  /* ---------- Calendar: edit an event ---------- */
  var EV = { id: null };
  function vCalendarX() {
    var h = vCalendar0();
    return h.replace(/<button class="btn sm" data-act="evdel" data-id="([^"]+)">Remove<\/button>/g, '<span class="actions" style="margin:0"><button class="btn sm" data-ex="evedit" data-v="$1">Edit</button><button class="btn sm" data-act="evdel" data-id="$1">Remove</button></span>');
  }
  var vCalendar0 = VIEWS.calendar;
  if (vCalendar0) VIEWS.calendar = vCalendarX;
  function evModal(editing) {
    var hd = document.getElementById("evTitle"), sb = document.querySelector("#eventForm button[type=submit]");
    if (hd) hd.textContent = editing ? "Edit event" : "Add to calendar";
    if (sb) sb.textContent = editing ? "Save changes" : "Add event";
  }
  function openEdit(id) {
    var x = (S.data.events || []).filter(function (v) { return v.id === id; })[0]; if (!x) return;
    EV.id = id; evModal(true);
    document.getElementById("ev-title").value = x.t; document.getElementById("ev-date").value = x.d; document.getElementById("ev-time").value = x.tm || "09:00"; document.getElementById("ev-kind").value = x.k;
    document.getElementById("e-ev").textContent = ""; document.getElementById("eventScrim").hidden = false; document.getElementById("ev-title").focus();
  }
  document.addEventListener("submit", function (ev) {
    if (!ev.target || ev.target.id !== "eventForm" || !EV.id) return;
    ev.preventDefault(); ev.stopPropagation();
    var x = (S.data.events || []).filter(function (v) { return v.id === EV.id; })[0];
    var t = document.getElementById("ev-title").value.trim(), dt = document.getElementById("ev-date").value, tm = document.getElementById("ev-time").value || "09:00", k = document.getElementById("ev-kind").value;
    if (!t) { document.getElementById("e-ev").textContent = "Give the event a name."; document.getElementById("ev-title").focus(); return; }
    if (!dt) { document.getElementById("e-ev").textContent = "Pick a date."; return; }
    if (x) { x.t = t; x.d = dt; x.tm = tm; x.k = k; }
    EV.id = null; evModal(false); S.calSel = dt; var p = dt.split("-"); S.calY = +p[0]; S.calM = +p[1] - 1;
    save(); closeModals(); render(); say("Event updated.");
  }, true);

  /* ---------- clicks and typing ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-ex],[data-act]"); if (!t) return;
    if (t.dataset.act === "evadd" || (t.dataset.act === "close" && EV.id)) { EV.id = null; evModal(false); return; }
    var a = t.dataset.ex; if (!a) return;
    var v = t.dataset.v;
    ev.preventDefault();
    if (a === "clper") { S.clPer = v; render(); return; }
    if (a === "evedit") { openEdit(v); return; }
    if (a === "wfnew") { startEdit(-1); render(); return; }
    if (a === "wfedit") { startEdit(+v); render(); return; }
    if (a === "wfcancel") { WF.edit = null; WF.draft = null; WF.err = ""; render(); return; }
    if (a === "wfaddstep") { WF.draft.steps.push({ who: (S.team[0] && S.team[0].id) || "you", what: "" }); render(); return; }
    if (a === "wfdelstep") { WF.draft.steps.splice(+v, 1); render(); return; }
    if (a === "wfup") { var i = +v, s = WF.draft.steps; if (i > 0) { var tmp = s[i - 1]; s[i - 1] = s[i]; s[i] = tmp; } render(); return; }
    if (a === "wfdel") {
      var f = FLOWS[+v]; if (!f) return;
      var go2 = function () { FLOWS.splice(+v, 1); saveFlows(); render(); say("Workflow deleted."); };
      if (typeof ask === "function") ask("Delete this workflow?", "<b>" + e(f[0]) + "</b> will be removed. This can't be undone.", "Delete", go2); else go2();
    }
  }, true);
  document.addEventListener("input", function (ev) {
    var t = ev.target; if (!WF.draft || !t.closest || !t.closest("[data-wfform]")) return;
    if (t.dataset.wff === "name") WF.draft.name = t.value;
    if (t.dataset.wfs) WF.draft.steps[+t.dataset.i][t.dataset.wfs] = t.value;
  }, true);
  document.addEventListener("change", function (ev) {
    var t = ev.target; if (!WF.draft || !t.closest || !t.closest("[data-wfform]")) return;
    if (t.dataset.wfs) WF.draft.steps[+t.dataset.i][t.dataset.wfs] = t.value;
  }, true);
  document.addEventListener("submit", function (ev) {
    if (!ev.target || !ev.target.dataset || !ev.target.dataset.wfform) return;
    ev.preventDefault(); ev.stopPropagation(); submitFlow();
  }, true);

  if (S.view === "clients" || S.view === "workflows" || S.view === "calendar") render();
})();
