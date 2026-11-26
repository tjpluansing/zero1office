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
        params: { body: { pageLimit: 50, sort: [{ field: "dateAdded", direction: "desc" }], projection: ["id", "firstName", "lastName", "companyName", "dateAdded", "tags"] } } });
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
  /* ---- Maya, Proposals Lead: proposals from the Proposal generator waiting for Karla or sent back with changes ---- */
  function pgAps() { return (S.data.approvals || []).filter(function (a) { return a.pg; }); }
  list.push(function () {
    var aps = pgAps(), wait = aps.filter(function (a) { return a.state === "waiting"; }), fix = aps.filter(function (a) { return a.state === "changes"; });
    var maya = {
      now: fix.length ? "Fixing " + plural(fix.length, "proposal") + " Karla sent back" : wait.length ? plural(wait.length, "proposal") + " waiting for Karla's OK" : aps.length ? "No proposal waiting" : "Waiting for a proposal from the Proposal generator",
      tasks: fix.map(function (a) { return "Redo " + a.title + " with Karla's changes"; }).concat(wait.map(function (a) { return "Get Karla's OK on " + a.title; })).slice(0, 6),
      k: "Proposals approved", kc: aps.filter(function (a) { return a.state === "approved" || a.state === "sent"; }).length, kg: Math.max(1, aps.length),
    };
    // Waiting proposals already show in Approvals; the office row only flags ones sent back.
    var items = fix.length ? [{ who: "maya", title: plural(fix.length, "proposal") + " sent back for changes", tone: "info", badge: "Proposals", sub: fix.slice(0, 2).map(function (a) { return a.title; }).join(", "), path: "view:approvals" }] : [];
    return { agents: { maya: maya }, items: items };
  });

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
    return { agents: { aria: kara }, items: [] };
  });
})();
