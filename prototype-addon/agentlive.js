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
})();
