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
})();
