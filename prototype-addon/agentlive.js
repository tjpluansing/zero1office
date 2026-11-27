/*
 * Live agents, one at a time (Paolo, 2026-11-26: "Lets make them all active 1 at a time").
 * Each agent here works from real app data instead of sample work. addon.js picks these up:
 * the agent's card goes Active with the real "now" while there is real work, and the
 * 3D office shows the same work and adds rows to "From your trackers".
 */
(function () {
  "use strict";
  if (typeof S === "undefined" || !S.data) return;
  var list = window.Z1LiveAgents = window.Z1LiveAgents || [];
  function peso(n) { return "₱" + (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* ---- Abby, Expenses & Receipts Keeper: expenses that still have no receipt ---- */
  list.push(function () {
    var ex = (S.data.expenses || []).filter(function (r) { return !r.rcpt && !r.rcptFile; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var all = (S.data.expenses || []).length;
    var amt = ex.reduce(function (t, r) { return t + (Number(r.amt) || 0); }, 0);
    var abby = {
      now: ex.length ? "Getting receipts for " + plural(ex.length, "expense") + " (" + peso(amt) + ")" : all ? "Every expense has its receipt" : "No expenses logged yet",
      say: ex.length ? plural(ex.length, "expense") + " still need a receipt." : undefined,
      tasks: ex.slice(0, 6).map(function (r) { return "Get the receipt for " + r.x + " (" + peso(r.amt) + ", " + r.date + ")"; }),
      k: "Expenses with a receipt", kc: all - ex.length, kg: Math.max(1, all),
    };
    var items = ex.length ? [{ who: "abby", title: plural(ex.length, "expense") + " without a receipt", tone: "info", badge: "Receipts", sub: peso(amt) + " · newest: " + ex[0].x, path: "view:spend:exp" }] : [];
    return { agents: { abby: abby }, items: items };
  });
  /* ---- Dom, Calendar & Admin Assistant: the next 7 days on Google Calendar and the office calendar ---- */
  list.push(function () {
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var d0 = new Date(), today = d0.getFullYear() + "-" + pad(d0.getMonth() + 1) + "-" + pad(d0.getDate());
    var d7 = new Date(d0.getTime() + 7 * 864e5), end = d7.getFullYear() + "-" + pad(d7.getMonth() + 1) + "-" + pad(d7.getDate());
    var g = window.Z1GCal ? window.Z1GCal.upcoming() || [] : [];
    var own = (S.data.events || []).filter(function (e) { return e.d >= today && e.d <= end; });
    var seen = {}, evs = own.concat(g).filter(function (e) { var k = e.d + e.tm + e.t; if (seen[k]) return false; seen[k] = 1; return e.d >= today && e.d <= end; })
      .sort(function (a, b) { return (a.d + a.tm).localeCompare(b.d + b.tm); });
    var nowTm = pad(d0.getHours()) + ":" + pad(d0.getMinutes());
    evs = evs.filter(function (e) { return e.d > today || e.allDay || e.tm >= nowTm; });
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var label = function (e) {
      var day = e.d === today ? "today" : MON[+e.d.slice(5, 7) - 1] + " " + (+e.d.slice(8, 10));
      return String(e.t).replace(/ \(all day\)$/, "") + " (" + day + (e.allDay ? ", all day" : " " + e.tm) + ")";
    };
    var nToday = evs.filter(function (e) { return e.d === today; }).length;
    var dom = {
      now: evs.length ? "Preparing for " + label(evs[0]) : window.Z1GCal && window.Z1GCal.on() ? "Calendar is clear for the next 7 days" : "Waiting for the Google Calendar to be shown once",
      tasks: evs.slice(0, 6).map(function (e) { return "Get ready for " + label(e); }),
      k: "Events today", kc: nToday, kg: Math.max(1, nToday),
    };
    var items = nToday ? [{ who: "dom", title: plural(nToday, "event") + " left today", tone: "info", badge: "Calendar", sub: "Next: " + label(evs[0]), path: "view:calendar" }] : [];
    return { agents: { dom: dom }, items: items };
  });
  /* ---- Ivan, IT & App Checker: the App health checks that are failing right now ---- */
  list.push(function () {
    if (typeof healthChecks !== "function") return {};
    var all = healthChecks() || [], bad = all.filter(function (c) { return !c[1]; });
    var ivan = {
      now: bad.length ? "Fixing " + plural(bad.length, "failed check") + ": " + bad[0][0] : "All " + all.length + " app health checks pass",
      say: bad.length ? plural(bad.length, "health check") + " failing." : undefined,
      tasks: bad.slice(0, 6).map(function (c) { return "Fix " + c[0] + (c[2] ? ": " + String(c[2]).replace(/<[^>]*>/g, "").slice(0, 90) : ""); }),
      k: "Health checks passing", kc: all.length - bad.length, kg: Math.max(1, all.length),
    };
    var items = bad.length ? [{ who: "ivan", title: plural(bad.length, "app health check") + " failing", tone: "need", badge: "Health", sub: bad.map(function (c) { return c[0]; }).slice(0, 3).join(", "), path: "view:health" }] : [];
    return { agents: { ivan: ivan }, items: items };
  });
  /* ---- Felix, Client Follow-Up: proposals drafted 2 to 10 days ago, so Karla checks the client got back ---- */
  list.push(function () {
    var h = []; try { h = JSON.parse(localStorage.getItem("zero1office-proposals:v1") || "[]") || []; } catch (err) { h = []; }
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var now = Date.now(), due = h.filter(function (x) { var d = (now - new Date(x.at).getTime()) / 864e5; return d >= 2 && d <= 10; });
    var day = function (x) { var d = new Date(x.at); return MON[d.getMonth()] + " " + d.getDate(); };
    var felix = {
      now: due.length ? "Following up " + plural(due.length, "proposal") + " from " + day(due[due.length - 1]) + " on" : h.length ? "No proposal is due for a follow-up yet" : "No proposals sent yet",
      tasks: due.slice(0, 6).map(function (x) { return "Check if " + x.co + " " + x.type + " client replied (proposal of " + day(x) + ")"; }),
      k: "Proposals in follow-up", kc: due.length, kg: Math.max(1, h.length),
    };
    var items = due.length ? [{ who: "felix", title: plural(due.length, "proposal") + " to follow up", tone: "info", badge: "Follow-up", sub: due.slice(0, 2).map(function (x) { return x.co + " " + x.type; }).join(", "), path: "view:propgen" }] : [];
    return { agents: { felix: felix }, items: items };
  });
  /* ---- Vince, Reels & Video Editor: raw clips in Files > Raw videos that have no edited reel in Files > Reels ---- */
  // Vince was Offline in the sample data. Paolo asked for every agent to be live, so he comes back once.
  try { var v0 = typeof byId === "function" && byId("vince"); if (v0 && v0.s === "offline" && !S.data.vinceBack) { v0.s = "idle"; S.data.vinceBack = true; save(); } } catch (err) { /* optional */ }
  list.push(function () {
    var F = window.Z1Files; if (!F || !F.rows || !F.ready || !F.ready()) return {};
    var raw = F.folder("Raw videos", "rawvideos"), reels = F.folder("Reels", "reels");
    var isVid = function (d) { return /^video\//.test(d.mime || "") || /\.(mp4|mov|m4v|webm)$/i.test(d.name || ""); };
    var base = function (n) { return String(n || "").replace(/\.[^.]+$/, "").toLowerCase(); };
    var rows = F.rows(), done = rows.filter(function (d) { return d.folder === reels; }).map(function (d) { return base(d.name); });
    var todo = rows.filter(function (d) { return d.folder === raw && isVid(d); })
      .filter(function (d) { var b = base(d.name); return !done.some(function (r) { return r.indexOf(b) > -1; }); });
    var vince = {
      now: todo.length ? "Editing " + plural(todo.length, "raw clip") + " into reels, next: " + todo[0].name : "No raw clips waiting. Upload them to Files > Raw videos",
      tasks: todo.slice(0, 6).map(function (d) { return "Edit " + d.name + " into a reel (cuts, captions, end card)"; }),
      k: "Clips edited into reels", kc: done.length, kg: Math.max(1, done.length + todo.length),
    };
    var items = todo.length ? [{ who: "vince", title: plural(todo.length, "raw clip") + " to edit", tone: "info", badge: "Reels", sub: todo[0].name, path: "view:files" }] : [];
    return { agents: { vince: vince }, items: items };
  });
  /* ---- Tess, Outreach Writer: GoHighLevel contacts from the last 14 days not tagged "contacted" yet ---- */
  // Read-only: one contact search every 15 minutes. Tag a contact "contacted" in GoHighLevel once the first message is out.
  var T = { list: null, at: 0, busy: false };
  function ghlData(r) {
    if (typeof liveGhl === "function") return liveGhl(r);
    var p = r && r.payload; if (p && p.data) return p.data;
    try { var t = (r.content || []).filter(function (b) { return b.type === "text"; })[0]; var j = JSON.parse(t.text); return j.data || j; } catch (err) { return {}; }
  }
  function loadTess() {
    var cl = window.claude; if (T.busy || Date.now() - T.at < 15 * 60000 || !cl || !cl.use) return;
    T.busy = true;
    cl.use("mcp").then(function (m) {
      if (!m) throw { code: "unavailable_here" };
      return m.callTool("GHL", "execute_operation", { operationId: "search-contacts-advanced", reason: "Tess checks new leads for a first message",
        params: { body: { pageLimit: 50, sort: [{ field: "dateAdded", direction: "desc" }], projection: ["id", "firstName", "lastName", "companyName", "dateAdded", "tags", "dateOfBirth", "source", "attributionSource"] } } });
    }).then(function (r) { T.busy = false; T.at = Date.now(); T.list = (ghlData(r).contacts || []); },
      function () { T.busy = false; T.at = Date.now(); });
  }
  list.push(function () {
    loadTess();
    if (!T.list) return {};
    var cut = Date.now() - 14 * 864e5;
    var recent = T.list.filter(function (c) {
      var n = String(c.firstNameLowerCase || c.firstName || "");
      return new Date(c.dateAdded).getTime() >= cut && !/^\(example\)/i.test(n);
    });
    var todo = recent.filter(function (c) { return !(c.tags || []).some(function (t) { return /^contacted$/i.test(t); }); });
    var nm = function (c) { var n = ((c.firstName || c.firstNameLowerCase || "") + " " + (c.lastName || "")).trim() || "a new lead"; return n.replace(/\b\w/g, function (x) { return x.toUpperCase(); }) + (c.companyName ? " (" + c.companyName + ")" : ""); };
    var tess = {
      now: todo.length ? "Writing first messages for " + plural(todo.length, "new lead") : "Every new lead has had a first message",
      tasks: todo.slice(0, 6).map(function (c) { return "Write the first message to " + nm(c); }),
      k: "New leads messaged (14 days)", kc: recent.length - todo.length, kg: Math.max(1, recent.length),
    };
    var items = todo.length ? [{ who: "tess", title: plural(todo.length, "new lead") + " to message", tone: "info", badge: "Outreach", sub: todo.slice(0, 2).map(nm).join(", "), path: "view:leads" }] : [];
    return { agents: { tess: tess }, items: items };
  });
  /* ---- Owen, Renewals Manager: Numbers > Renewals, starting 60 days before each date ---- */
  list.push(function () {
    var RN = window.Z1Renewals; if (!RN) return {};
    var due = RN.open().filter(function (r) { return RN.daysTo(r.date) <= 60; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var all = (S.data.renewals || []).length, late = due.filter(function (r) { return RN.daysTo(r.date) < 0; });
    var when = function (r) { var n = RN.daysTo(r.date); return n < 0 ? (-n) + " d overdue" : n === 0 ? "today" : "in " + n + " d"; };
    var owen = {
      now: due.length ? "Starting the " + due[0].acct + " renewal (" + due[0].ins + ", " + when(due[0]) + ")" : all ? "No renewal within 60 days" : "Waiting for renewals in Numbers > Renewals",
      say: late.length ? plural(late.length, "renewal") + " overdue." : undefined,
      tasks: due.slice(0, 6).map(function (r) { return "Renew " + r.acct + " with " + r.ins + " (" + RN.nice(r.date) + ", " + when(r) + ")"; }),
      k: "Renewals done", kc: all - RN.open().length, kg: Math.max(1, all),
    };
    var items = due.length ? [{ who: "owen", title: plural(due.length, "renewal") + " within 60 days", tone: late.length ? "need" : "info", badge: late.length ? late.length + " overdue" : "Renewals", sub: due.slice(0, 2).map(function (r) { return r.acct + " " + when(r); }).join(", "), path: "view:renewals" }] : [];
    return { agents: { owen: owen }, items: items };
  });
  /* ---- Enzo, Licensing & Training: Settings > Licenses, starting 90 days before each expiry ---- */
  list.push(function () {
    var L = window.Z1Licenses; if (!L) return {};
    var due = L.open().filter(function (r) { return L.daysTo(r.date) <= 90; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var all = (S.data.licenses || []).length, late = due.filter(function (r) { return L.daysTo(r.date) < 0; });
    var when = function (r) { var n = L.daysTo(r.date); return n < 0 ? "expired " + (-n) + " d ago" : n === 0 ? "expires today" : "expires in " + n + " d"; };
    var enzo = {
      now: due.length ? "Renewing " + due[0].acct + " (" + when(due[0]) + ")" : all ? "No license expires within 90 days" : "Waiting for licenses in Settings > Licenses",
      say: late.length ? plural(late.length, "license") + " expired." : undefined,
      tasks: due.slice(0, 6).map(function (r) { return "Renew " + r.acct + (r.ins ? " with " + r.ins : "") + " (" + when(r) + ")"; }),
      k: "Licenses current", kc: all - due.length, kg: Math.max(1, all),
    };
    var items = due.length ? [{ who: "enzo", title: plural(due.length, "license") + " to renew", tone: late.length ? "need" : "info", badge: late.length ? late.length + " expired" : "Licenses", sub: due.slice(0, 2).map(function (r) { return r.acct + ", " + when(r); }).join("; "), path: "view:licenses" }] : [];
    return { agents: { enzo: enzo }, items: items };
  });
  /* ---- Iris, Graphic Designer: Carousel and Static posts in Content approvals that need design work ---- */
  list.push(function () {
    var posts = (S.data.posts || []).filter(function (x) { return x.fmt === "Carousel" || x.fmt === "Static"; });
    var fix = posts.filter(function (x) { return x.state === "changes"; });
    var pad = function (n) { return String(n).padStart(2, "0"); }, d0 = new Date(), d7 = new Date(d0.getTime() + 7 * 864e5);
    var t0 = d0.getFullYear() + "-" + pad(d0.getMonth() + 1) + "-" + pad(d0.getDate()), t7 = d7.getFullYear() + "-" + pad(d7.getMonth() + 1) + "-" + pad(d7.getDate());
    var soon = posts.filter(function (x) { return x.state === "scheduled" && x.date >= t0 && x.date <= t7; });
    var work = fix.concat(soon);
    var iris = {
      now: fix.length ? "Redesigning " + plural(fix.length, "post") + " you asked to change" : soon.length ? "Finishing graphics for " + plural(soon.length, "post") + " going out this week" : posts.length ? "No design work waiting" : "Waiting for Carousel or Static posts in Content approvals",
      tasks: fix.map(function (x) { return "Redo the " + x.fmt + " \u201c" + x.title + "\u201d with your changes"; })
        .concat(soon.map(function (x) { return "Final graphics for \u201c" + x.title + "\u201d (" + x.fmt + ", posts " + x.date + ")"; })).slice(0, 6),
      k: "Design posts approved", kc: posts.filter(function (x) { return x.state === "scheduled"; }).length, kg: Math.max(1, posts.length),
    };
    var items = fix.length ? [{ who: "iris", title: plural(fix.length, "post") + " being redesigned", tone: "info", badge: "Design", sub: fix.slice(0, 2).map(function (x) { return x.title; }).join(", "), path: "view:content" }] : [];
    return { agents: { iris: iris }, items: items };
  });

  /* ---- Dante, Chief Marketing Officer: everything in marketing that is waiting on someone ---- */
  list.push(function () {
    var posts = S.data.posts || [], wait = posts.filter(function (x) { return x.state === "waiting"; }), fix = posts.filter(function (x) { return x.state === "changes"; });
    var leads = T.list ? T.list.filter(function (c) { return new Date(c.dateAdded).getTime() >= Date.now() - 14 * 864e5 && !/^\(example\)/i.test(String(c.firstNameLowerCase || c.firstName || "")) && !(c.tags || []).some(function (t) { return /^contacted$/i.test(t); }); }) : [];
    var tasks = [];
    if (wait.length) tasks.push("Get your OK on " + plural(wait.length, "post") + " in Content approvals");
    if (fix.length) tasks.push("Make sure your changes reach " + plural(fix.length, "post"));
    if (leads.length) tasks.push("Check Tess messages " + plural(leads.length, "new lead") + " this week");
    var dante = {
      now: tasks.length ? tasks[0] : "Marketing is up to date",
      tasks: tasks,
      k: "Posts scheduled", kc: posts.filter(function (x) { return x.state === "scheduled"; }).length, kg: Math.max(1, posts.length),
    };
    var items = wait.length ? [{ who: "dante", title: plural(wait.length, "post") + " waiting for your OK", tone: "need", badge: "Content", sub: wait.slice(0, 2).map(function (x) { return x.title; }).join(", "), path: "view:content" }] : [];
    return { agents: { dante: dante }, items: items };
  });
  /* ---- Proposal writers (Maya, Quinn, Jade, Hana, Theo): Proposal generator proposals waiting for Karla or sent back ---- */
  function pgAps() { return (S.data.approvals || []).filter(function (a) { return a.pg; }); }
  // Each proposal writer (Maya, Quinn, Jade, Hana, Theo...) works the proposals the generator assigned to them.
  // Maya also takes any proposal whose writer is no longer on the team.
  function propAgent(id) {
    return function () {
      var team = (S.team || []).filter(function (e) { return e.d === "Proposals"; }).map(function (e) { return e.id; });
      var aps = pgAps().filter(function (a) { return a.who === id || (id === "maya" && team.indexOf(a.who) < 0); });
      var wait = aps.filter(function (a) { return a.state === "waiting"; }), fix = aps.filter(function (a) { return a.state === "changes"; });
      var e = typeof byId === "function" ? byId(id) : null, what = e && e.r ? e.r.replace(/^.*·\s*/, "") : "";
      var ag = {
        now: fix.length ? "Fixing " + plural(fix.length, "proposal") + " Karla sent back" : wait.length ? plural(wait.length, "proposal") + " waiting for Karla's OK" : aps.length ? "No proposal waiting" : "Waiting for a proposal from the Proposal generator",
        tasks: fix.map(function (a) { return "Redo " + a.title + " with Karla's changes"; }).concat(wait.map(function (a) { return "Get Karla's OK on " + a.title; })).slice(0, 6),
        k: "Proposals approved", kc: aps.filter(function (a) { return a.state === "approved" || a.state === "sent"; }).length, kg: Math.max(1, aps.length),
      };
      var out = {}; out[id] = ag;
      // Waiting proposals already show in Approvals; the office row only flags ones sent back.
      return { agents: out, items: fix.length ? [{ who: id, title: plural(fix.length, "proposal") + " sent back for changes", tone: "info", badge: "Proposals", sub: fix.slice(0, 2).map(function (a) { return a.title; }).join(", "), path: "view:approvals" }] : [] };
    };
  }
  ["maya", "quinn", "jade", "hana", "theo"].forEach(function (id) { list.push(propAgent(id)); });

  /* ---- Pia, Compliance Checker: waiting proposals whose checks flagged something to watch ---- */
  list.push(function () {
    var aps = pgAps().filter(function (a) { return a.state === "waiting"; });
    var flagged = aps.filter(function (a) { return (a.checks || []).some(function (c) { return c[0] !== "ok"; }); });
    var pia = {
      now: flagged.length ? "Re-checking " + plural(flagged.length, "proposal") + " with flags" : aps.length ? "Every waiting proposal passed its checks" : "No proposal to check",
      tasks: flagged.slice(0, 6).map(function (a) { var w = (a.checks || []).filter(function (c) { return c[0] !== "ok"; })[0]; return "Check " + a.title + ": " + String(w ? w[1] : "").slice(0, 80); }),
      k: "Waiting proposals with clean checks", kc: aps.length - flagged.length, kg: Math.max(1, aps.length),
    };
    var items = flagged.length ? [{ who: "pia", title: plural(flagged.length, "proposal") + " flagged by checks", tone: "need", badge: "Check", sub: flagged.slice(0, 2).map(function (a) { return a.title; }).join(", "), path: "view:approvals" }] : [];
    return { agents: { pia: pia }, items: items };
  });

  /* ---- Lia (Inbox) and Bea (Messenger/DMs): unread GoHighLevel conversations, read-only, every 10 minutes ---- */
  var C = { list: null, at: 0, busy: false };
  function loadConvs() {
    var cl = window.claude; if (C.busy || Date.now() - C.at < 10 * 60000 || !cl || !cl.use) return;
    C.busy = true;
    cl.use("mcp").then(function (m) {
      if (!m) throw { code: "unavailable_here" };
      return m.callTool("GHL", "execute_operation", { operationId: "search-conversation", reason: "Lia and Bea check unread messages", params: { query: { limit: 50, status: "unread" } } });
    }).then(function (r) { C.busy = false; C.at = Date.now(); C.list = ghlData(r).conversations || []; }, function () { C.busy = false; C.at = Date.now(); });
  }
  var DM = /^TYPE_(FACEBOOK|INSTAGRAM|WHATSAPP|GMB|LIVE_CHAT)$/;
  function convAgent(id, isDm, label, page) {
    return function () {
      loadConvs();
      if (!C.list) return {};
      var un = C.list.filter(function (c) { return (c.unreadCount || 0) > 0 && !/^\(example\)/i.test(String(c.fullName || c.contactName || "")) && DM.test(c.lastMessageType || "") === isDm; });
      var who = function (c) { return c.fullName || c.contactName || "a contact"; };
      var ch = function (c) { return String(c.lastMessageType || "").replace("TYPE_", "").toLowerCase().replace(/_/g, " "); };
      var a = {
        now: un.length ? "Answering " + plural(un.length, "unread " + label) : "No unread " + label + "s",
        tasks: un.slice(0, 6).map(function (c) { return "Reply to " + who(c) + " (" + ch(c) + ", " + c.unreadCount + " unread)"; }),
        k: "Unread " + label + "s", kc: un.length, kg: Math.max(1, un.length),
      };
      var out = {}; out[id] = a;
      return { agents: out, items: un.length ? [{ who: id, title: plural(un.length, "unread " + label), tone: "info", badge: isDm ? "DMs" : "Inbox", sub: un.slice(0, 2).map(who).join(", "), path: "view:" + page }] : [] };
    };
  }
  list.push(convAgent("lia", false, "message", "inbox"));
  list.push(convAgent("bea", true, "DM", "inbox"));

  /* ---- Fiona, CFO: subscriptions due in the next 7 days and this month's spending ---- */
  list.push(function () {
    var pad = function (n) { return String(n).padStart(2, "0"); }, d0 = new Date(), d7 = new Date(d0.getTime() + 7 * 864e5);
    var t0 = d0.getFullYear() + "-" + pad(d0.getMonth() + 1) + "-" + pad(d0.getDate()), t7 = d7.getFullYear() + "-" + pad(d7.getMonth() + 1) + "-" + pad(d7.getDate()), mk = t0.slice(0, 7);
    var subs = (S.data.subs || []).filter(function (x) { return x.on !== false && x.next && x.next <= t7; }).sort(function (a, b) { return a.next.localeCompare(b.next); });
    var spent = (S.data.expenses || []).filter(function (x) { return String(x.date).slice(0, 7) === mk; }).reduce(function (t, x) { return t + (Number(x.amt) || 0); }, 0);
    var due = subs.reduce(function (t, x) { return t + (Number(x.cost) || 0); }, 0);
    var fiona = {
      now: subs.length ? "Lining up " + plural(subs.length, "payment") + " due this week (" + peso(due) + ")" : spent ? "Tracking " + peso(spent) + " spent this month" : "No payments due this week",
      tasks: subs.slice(0, 6).map(function (x) { return (x.next < t0 ? "Overdue: pay " : "Pay ") + x.n + " (" + peso(x.cost) + ", due " + x.next + ")"; }),
      k: "Spent this month", kc: Math.round(spent), kg: Math.max(1, Math.round(spent + due)),
    };
    var late = subs.filter(function (x) { return x.next < t0; });
    var items = subs.length ? [{ who: "fiona", title: plural(subs.length, "subscription") + " due this week", tone: late.length ? "need" : "info", badge: peso(due), sub: subs.slice(0, 2).map(function (x) { return x.n + " " + x.next; }).join(", "), path: "view:spend:subs" }] : [];
    return { agents: { fiona: fiona }, items: items };
  });

  /* ---- Marco, Chief Sales Officer: open GoHighLevel opportunities, oldest first (read-only, every 15 minutes) ---- */
  var O = { list: null, at: 0, busy: false };
  list.push(function () {
    var cl = window.claude;
    if (!O.busy && Date.now() - O.at > 15 * 60000 && cl && cl.use) {
      O.busy = true;
      cl.use("mcp").then(function (m) {
        if (!m) throw { code: "unavailable_here" };
        return m.callTool("GHL", "execute_operation", { operationId: "search-opportunity", reason: "Marco reviews the open pipeline", params: { query: { limit: 50, status: "open" } } });
      }).then(function (r) { O.busy = false; O.at = Date.now(); O.list = ghlData(r).opportunities || []; }, function () { O.busy = false; O.at = Date.now(); });
    }
    if (!O.list) return {};
    var age = function (o) { var t = new Date(o.lastStageChangeAt || o.updatedAt || o.createdAt).getTime(); return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 864e5); };
    var opps = O.list.filter(function (o) { return !/^\(example\)/i.test(String(o.name || "")); }).sort(function (a, b) { return age(b) - age(a); });
    var val = opps.reduce(function (t, o) { return t + (Number(o.monetaryValue) || 0); }, 0);
    var stuck = opps.filter(function (o) { return age(o) >= 7; });
    var marco = {
      now: opps.length ? "Reviewing " + plural(opps.length, "open deal") + (val ? " (" + peso(val) + ")" : "") : "No open deals in GoHighLevel",
      tasks: opps.slice(0, 6).map(function (o) { return "Move " + (o.name || "a deal") + " forward" + (o.monetaryValue ? " (" + peso(o.monetaryValue) + ")" : "") + (age(o) ? ", no change in " + age(o) + " d" : ""); }),
      k: "Open deals moving", kc: opps.length - stuck.length, kg: Math.max(1, opps.length),
    };
    var items = stuck.length ? [{ who: "marco", title: plural(stuck.length, "deal") + " with no change in 7+ days", tone: "info", badge: "Pipeline", sub: stuck.slice(0, 2).map(function (o) { return o.name; }).join(", "), path: "view:proposals" }] : [];
    return { agents: { marco: marco }, items: items };
  });

  var ymd = function (d) { var p2 = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); };
  var notEx = function (c) { return !/^\(example\)/i.test(String(c.firstNameLowerCase || c.firstName || c.name || c.fullName || "")); };

  /* ---- Joy, Client Celebrations: GoHighLevel contacts with a birthday in the next 7 days ---- */
  list.push(function () {
    if (!T.list) return {};
    var now = new Date(), soon = [];
    T.list.filter(notEx).forEach(function (c) {
      if (!c.dateOfBirth) return; var b = new Date(c.dateOfBirth); if (isNaN(b)) return;
      for (var i = 0; i <= 7; i++) { var d = new Date(now.getTime() + i * 864e5); if (d.getMonth() === b.getUTCMonth() && d.getDate() === b.getUTCDate()) { soon.push({ c: c, i: i }); break; } }
    });
    var nm = function (c) { return ((c.firstName || "") + " " + (c.lastName || "")).trim() || "a client"; };
    var joy = {
      now: soon.length ? "Preparing " + plural(soon.length, "birthday greeting") : "No client birthdays in the next 7 days",
      tasks: soon.slice(0, 6).map(function (x) { return "Birthday greeting for " + nm(x.c) + (x.i === 0 ? " (today)" : " (in " + x.i + " d)"); }),
      k: "Birthdays this week", kc: soon.length, kg: Math.max(1, soon.length),
    };
    return { agents: { joy: joy }, items: soon.some(function (x) { return x.i === 0; }) ? [{ who: "joy", title: "Client birthday today", tone: "info", badge: "Greeting", sub: soon.filter(function (x) { return x.i === 0; }).map(function (x) { return nm(x.c); }).join(", "), path: "view:leads" }] : [] };
  });

  /* ---- Nico, Lead Finder: how many new GoHighLevel leads came in this week (aims for 5) ---- */
  list.push(function () {
    if (!T.list) return {};
    var wk = T.list.filter(notEx).filter(function (c) { return new Date(c.dateAdded).getTime() >= Date.now() - 7 * 864e5; }).length;
    var nico = {
      now: wk < 5 ? "Finding more leads: " + plural(wk, "new lead") + " this week, aiming for 5" : plural(wk, "new lead") + " this week",
      tasks: wk < 5 ? ["Find " + (5 - wk) + " more leads to reach 5 this week"] : [],
      k: "New leads this week", kc: wk, kg: 5,
    };
    return { agents: { nico: nico }, items: [] };
  });

  /* ---- Ben, Needs Analysis: GoHighLevel deals opened in the last 14 days ---- */
  list.push(function () {
    if (!O.list) return {};
    var fresh = O.list.filter(notEx).filter(function (o) { return new Date(o.createdAt || o.dateAdded || 0).getTime() >= Date.now() - 14 * 864e5; });
    var ben = {
      now: fresh.length ? "Preparing needs questions for " + plural(fresh.length, "new deal") : "No new deals to prepare for",
      tasks: fresh.slice(0, 6).map(function (o) { return "Prepare needs questions for " + (o.name || "a new deal"); }),
      k: "New deals prepared", kc: 0, kg: Math.max(1, fresh.length),
    };
    return { agents: { ben: ben }, items: [] };
  });

  /* ---- Tina, Documents Archivist: uploads in Files that are not in a folder yet ---- */
  list.push(function () {
    var F = window.Z1Files; if (!F || !F.rows || !F.ready || !F.ready()) return {};
    var loose = F.rows().filter(function (d) { return !d.builtin && !d.folder; });
    var tina = {
      now: loose.length ? "Filing " + plural(loose.length, "upload") + " into folders" : "Every file is in a folder",
      tasks: loose.slice(0, 6).map(function (d) { return "File " + d.name + " into the right folder"; }),
      k: "Files in folders", kc: F.rows().length - loose.length, kg: Math.max(1, F.rows().length),
    };
    return { agents: { tina: tina }, items: loose.length ? [{ who: "tina", title: plural(loose.length, "file") + " not in a folder", tone: "info", badge: "Files", sub: loose.slice(0, 2).map(function (d) { return d.name; }).join(", "), path: "view:files" }] : [] };
  });

  /* ---- Cora (content plan) and Nadia (Reel scripts): Content approvals ---- */
  list.push(function () {
    var posts = S.data.posts || [], t0 = ymd(new Date()), t7 = ymd(new Date(Date.now() + 7 * 864e5));
    var wk = posts.filter(function (x) { return x.state === "scheduled" && x.date >= t0 && x.date <= t7; });
    var cora = {
      now: wk.length < 3 ? "Planning posts: " + plural(wk.length, "post") + " scheduled this week, aiming for 3" : plural(wk.length, "post") + " scheduled this week",
      tasks: (wk.length < 3 ? ["Plan " + (3 - wk.length) + " more posts for this week"] : []).concat(wk.slice(0, 5).map(function (x) { return "Check “" + x.title + "” goes out " + x.date; })),
      k: "Posts scheduled this week", kc: wk.length, kg: 3,
    };
    var reels = posts.filter(function (x) { return x.fmt === "Reel" && (x.state === "changes" || x.state === "waiting"); });
    var nadia = {
      now: reels.length ? "Working on " + plural(reels.length, "Reel script") : "No Reel scripts waiting",
      tasks: reels.slice(0, 6).map(function (x) { return (x.state === "changes" ? "Rewrite the script for “" : "Get your OK on the script for “") + x.title + "”"; }),
      k: "Reels approved", kc: posts.filter(function (x) { return x.fmt === "Reel" && x.state === "scheduled"; }).length, kg: Math.max(1, posts.filter(function (x) { return x.fmt === "Reel"; }).length),
    };
    return { agents: { cora: cora, nadia: nadia }, items: [] };
  });

  /* ---- Joel, HR & People Lead: AI employees with no real work right now ---- */
  list.push(function () {
    var idle = (S.team || []).filter(function (e) { return !e.human && e.s === "idle"; });
    var hr = window.Z1HR ? window.Z1HR.next() : [];
    var joel = {
      now: hr.length ? "HR: " + hr[0].it[1] : idle.length ? "Reviewing " + plural(idle.length, "idle AI employee") : "Every AI employee has real work",
      tasks: hr.slice(0, 3).map(function (x) { return x.it[1] + " (" + x.step.t + ")"; }).concat(idle.slice(0, 3).map(function (e) { return "Check why " + e.n + " is idle: " + (e.now || ""); })),
      k: "AI employees with work", kc: (S.team || []).filter(function (e) { return !e.human && e.s === "active"; }).length, kg: Math.max(1, (S.team || []).filter(function (e) { return !e.human; }).length),
    };
    return { agents: { joel: joel }, items: hr.length ? [{ who: "joel", title: "HR: " + hr[0].it[1], tone: "info", badge: "HR", sub: hr[0].step.t + " · " + plural(hr.length, "step") + " left", path: "view:hr" }] : [] };
  });

  /* ---- Ella, Newsletter & Email Writer: Email items in Approvals, and this month's newsletter ---- */
  list.push(function () {
    var MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var em = (S.data.approvals || []).filter(function (a) { return !a.pg && a.kind === "Email"; });
    var open = em.filter(function (a) { return a.state === "waiting" || a.state === "changes"; });
    var nx = MN[(new Date().getMonth() + 1) % 12], has = em.some(function (a) { return (a.title || "").toLowerCase().indexOf(nx.toLowerCase()) >= 0; });
    var tasks = open.map(function (a) { return (a.state === "changes" ? "Rewrite “" : "Get your OK on “") + a.title + "”"; });
    if (!has) tasks.unshift("Draft the " + nx + " newsletter");
    var ella = {
      now: !has ? "Drafting the " + nx + " newsletter" : open.length ? "Waiting on " + plural(open.length, "email") + " in Approvals" : "The " + nx + " newsletter is done",
      tasks: tasks.slice(0, 6),
      k: "Emails approved", kc: em.filter(function (a) { return a.state === "approved"; }).length, kg: Math.max(1, em.length),
    };
    return { agents: { ella: ella }, items: [] };
  });

  /* ---- Mateo, Ads Specialist: GoHighLevel leads from the last 30 days that came in from ads ---- */
  list.push(function () {
    if (!T.list) return {};
    var src = function (c) { var a = c.attributionSource || {}; return [c.source, a.medium, a.utmSource, a.utmMedium, a.sessionSource, a.adSource].filter(Boolean).join(" ").toLowerCase(); };
    var m30 = T.list.filter(notEx).filter(function (c) { return new Date(c.dateAdded).getTime() >= Date.now() - 30 * 864e5; });
    var ads = m30.filter(function (c) { return /facebook|fb|instagram|google|paid|cpc|\bads?\b/.test(src(c)); });
    var fb = ads.filter(function (c) { return /facebook|fb|instagram/.test(src(c)); }).length;
    var mateo = {
      now: ads.length ? "Tracking " + plural(ads.length, "ad lead") + " from the last 30 days" : "No ad leads in the last 30 days",
      tasks: ads.length ? ["Check cost per lead: " + fb + " from Facebook/Instagram, " + (ads.length - fb) + " from Google and other ads"] : [],
      k: "Ad leads (30 days)", kc: ads.length, kg: Math.max(1, m30.length),
    };
    return { agents: { mateo: mateo }, items: [] };
  });

  /* ---- Gia, Rina, Carlo, Leo and Rex work the small lists in lists.js ---- */
  function zl(k) { var L = window.Z1Lists && window.Z1Lists[k]; return L ? L : null; }
  function agoDays(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? Math.round((new Date(ymd(new Date()) + "T00:00:00") - new Date(d + "T00:00:00")) / 864e5) : 0; }
  list.push(function () {
    var L = zl("enrollments"); if (!L) return {};
    var open = L.open(), late = open.filter(function (r) { return r.st === "Sent, waiting" && agoDays(r.date) > 7; });
    var gia = {
      now: open.length ? "Working on " + plural(open.length, "enrollment") : "No enrollments open",
      tasks: open.slice(0, 6).map(function (r) {
        var what = (r.heads ? r.heads + " " : "") + (r.chg || "changes").toLowerCase() + " for " + r.acct;
        return r.st === "To send" ? "Send " + what + " to " + r.ins : "Follow up " + r.ins + " on " + what;
      }),
      k: "Enrollments done", kc: L.rows().length - open.length, kg: Math.max(1, L.rows().length),
    };
    return { agents: { gia: gia }, items: late.length ? [{ who: "gia", title: plural(late.length, "enrollment") + " waiting over 7 days", tone: "info", badge: "Enrollment", sub: late.slice(0, 2).map(function (r) { return r.acct + " (" + r.ins + ")"; }).join(", "), path: "view:enrollments" }] : [] };
  });
  list.push(function () {
    var L = zl("loa"); if (!L) return {};
    var open = L.open(), toSend = open.filter(function (r) { return r.st === "Open"; });
    var rina = {
      now: open.length ? "Working on " + plural(open.length, "LOA request") : "No LOA requests open",
      tasks: open.slice(0, 6).map(function (r) { return (r.st === "Open" ? "Send the LOA request for " : "Chase " + r.ins + " on the LOA for ") + r.what + " (" + r.acct + ")"; }),
      k: "LOAs closed", kc: L.rows().length - open.length, kg: Math.max(1, L.rows().length),
    };
    return { agents: { rina: rina }, items: toSend.length ? [{ who: "rina", title: plural(toSend.length, "LOA request") + " to send", tone: "need", badge: "LOA", sub: toSend.slice(0, 2).map(function (r) { return r.what + " (" + r.acct + ")"; }).join(", "), path: "view:loa" }] : [] };
  });
  list.push(function () {
    var L = zl("partners"); if (!L) return {};
    var mo = ymd(new Date()).slice(0, 7), MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][new Date().getMonth()];
    var act = L.open(), due = act.filter(function (r) { return String(r.date || "").slice(0, 7) !== mo; });
    var leads = act.reduce(function (n, r) { return n + (+r.leads || 0); }, 0);
    var carlo = {
      now: due.length ? "Sending " + MN + " statements to " + plural(due.length, "partner") : act.length ? "Every partner has their " + MN + " statement" : "No referral partners yet",
      tasks: due.slice(0, 6).map(function (r) { return "Send the " + MN + " statement to " + r.name + (r.leads ? " (" + plural(+r.leads, "lead") + ")" : ""); }),
      k: "Partner leads this month", kc: leads, kg: Math.max(1, leads),
    };
    return { agents: { carlo: carlo }, items: [] };
  });
  list.push(function () {
    var L = zl("applicants"); if (!L) return {};
    var open = L.open(), fresh = open.filter(function (r) { return r.st === "New"; });
    var leo = {
      now: open.length ? "Working with " + plural(open.length, "applicant") : "No applicants open",
      tasks: open.slice(0, 6).map(function (r) { return (r.st === "New" ? "Screen " : r.st === "Screening" ? "Finish screening " : "Set up the interview with ") + r.name + " (" + (r.role || "applicant").toLowerCase() + ")"; }),
      k: "Applicants hired", kc: L.rows().filter(function (r) { return r.st === "Hired"; }).length, kg: Math.max(1, L.rows().length),
    };
    return { agents: { leo: leo }, items: fresh.length ? [{ who: "leo", title: plural(fresh.length, "new applicant"), tone: "info", badge: "Hiring", sub: fresh.slice(0, 2).map(function (r) { return r.name; }).join(", "), path: "view:applicants" }] : [] };
  });
  list.push(function () {
    var L = zl("market"); if (!L) return {};
    var open = L.open();
    var rex = {
      now: open.length ? "Looking into " + plural(open.length, "market note") : "No market notes open",
      tasks: open.slice(0, 6).map(function (r) { return "Look into " + r.what + (r.src ? " (" + r.src + ")" : ""); }),
      k: "Notes looked into", kc: L.rows().length - open.length, kg: Math.max(1, L.rows().length),
    };
    return { agents: { rex: rex }, items: [] };
  });

  /* ---- Client stats, Proposals and Leads: the old "Sample … (not live yet)" headings now sit over empty
     sections (all sample data was removed), so they name what the section waits for instead. ---- */
  if (typeof lnSampleNote === "function" && !window.__z1NoSampleNote) {
    window.__z1NoSampleNote = true;
    var LN = { "Sample leads from the leads finder (not live yet)": "From the Leads finder", "Sample proposals (not live yet)": "From the Proposal generator", "Sample accounts (not live yet)": "Premiums and members, from Billing & SOA" };
    var lnOrig = lnSampleNote;
    lnSampleNote = function (t) { return lnOrig(LN[t] || t); };
  }

  /* ---- Kara, Chief of Staff: rolls up what needs Paolo or Karla across every live agent. Registered last. ---- */
  var others = list.slice();
  list.push(function () {
    var need = [];
    others.forEach(function (fn) { try { (fn().items || []).forEach(function (it) { if (it.tone === "need") need.push(it); }); } catch (err) { /* skip */ } });
    var aps = (S.data.approvals || []).filter(function (a) { return a.state === "waiting"; }).length;
    var tasks = need.map(function (it) { return it.title; });
    if (aps) tasks.unshift("Remind you about " + plural(aps, "approval") + " waiting");
    var kara = {
      now: tasks.length ? "Chasing " + plural(tasks.length, "thing") + " that need you" : "Nothing needs you right now",
      tasks: tasks.slice(0, 6),
      k: "Items needing you", kc: tasks.length, kg: Math.max(1, tasks.length),
    };
    var slow = [];
    others.forEach(function (fn) { try { (fn().items || []).forEach(function (it) { if (it.tone !== "need") slow.push(it); }); } catch (err) { /* skip */ } });
    var celine = {
      now: slow.length ? "Clearing " + plural(slow.length, "open step") + " across the team" : "No open steps across the team",
      tasks: slow.slice(0, 6).map(function (it) { return it.title; }),
      k: "Open steps", kc: slow.length, kg: Math.max(1, slow.length),
    };
    return { agents: { aria: kara, celine: celine }, items: [] };
  });
})();
