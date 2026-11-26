/* zero1office add-on: Kara's morning report and editable report times (Paolo, 2026-11-26: "Add Kara's morning report
   under Settings. Time should be editable for both morning and daily report.")
   - Settings: "Kara's morning report" (on/off + time, default 8:00 AM) and "Kara's daily report" (time, default 7:00 PM).
     Saved in S.data.settings.morningOn / morningTime / reportTime, Manila time.
   - The office home panel shows both reports with their times and a countdown; the morning one has a Preview
     (what's waiting on you, renewals this week, missing receipts, and each team's queue).
   - Kara's instructions follow the chosen times, so her chat replies say the right hours. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.settings || window.__z1Reports) return;
  window.__z1Reports = true;
  function st() { return S.data.settings || (S.data.settings = {}); }
  function okT(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || ""); }
  function daily() { return okT(st().reportTime) ? st().reportTime : "19:00"; }
  function morning() { return okT(st().morningTime) ? st().morningTime : "08:00"; }
  function mOn() { return st().morningOn !== false; }
  function dOn() { return st().dailyOn !== false; }
  function label(t) { var h = +t.slice(0, 2), m = t.slice(3); return (h % 12 || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM"); }
  function short(t) { var h = +t.slice(0, 2), m = t.slice(3); return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + " " + (h < 12 ? "AM" : "PM"); }
  function until(t) {
    try {
      var d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })), x = new Date(d);
      x.setHours(+t.slice(0, 2), +t.slice(3), 0, 0); if (x < d) x.setDate(x.getDate() + 1);
      var m = Math.round((x - d) / 60000); return Math.floor(m / 60) + "h " + (m % 60) + "m";
    } catch (err) { return ""; }
  }
  function publish() { window.Z1_REPORTS = { daily: daily(), morning: morning(), morningOn: mOn(), dailyOn: dOn() }; }

  /* Kara's instructions and card follow the chosen times. */
  function syncKara() {
    var k = (S.team || []).filter(function (e) { return e.id === "aria"; })[0]; if (!k) return false;
    var before = JSON.stringify([k.p, k.desc, k.tasks]), D = short(daily()), M = short(morning());
    if (typeof k.p === "string") {
      // Daily report sentence: drop it when off, put it back (with the chosen time) when on.
      k.p = k.p.replace(/ ?Every day at [^,]*? Manila time, send Paolo a short report: [^.]*\./, "");
      if (dOn()) k.p = k.p.replace(/(Be calm and brief)/, "Every day at " + D + " Manila time, send Paolo a short report: what got done, what needs his OK, and what is at risk. $1");
      k.p = k.p.replace(/ ?Every morning at [^.]*? Manila time, send Paolo a short morning report[^.]*\./, "");
      if (mOn()) k.p = k.p.replace(/(Every day at [^,]*? Manila time, send Paolo a short report|Be calm and brief)/, "Every morning at " + M + " Manila time, send Paolo a short morning report: what is waiting on him today, renewals this week and missing receipts. $1");
    }
    if (typeof k.desc === "string") k.desc = k.desc.replace(/sends your [0-9: APM]+ daily report/, "sends your " + D + " daily report");
    if (Array.isArray(k.tasks)) k.tasks = k.tasks.map(function (t) { return t.replace(/Write the [0-9: APM]+ wrap-up/, "Write the " + D + " wrap-up"); });
    return JSON.stringify([k.p, k.desc, k.tasks]) !== before;
  }

  function sw(on, id, lbl) { return '<button class="switch" role="switch" aria-checked="' + on + '" aria-label="' + lbl + '" id="' + id + '"></button>'; }
  function tin(id, v, lbl, dis) { return '<input type="time" class="inp" id="' + id + '" value="' + v + '" aria-label="' + lbl + '" style="width:auto"' + (dis ? " disabled" : "") + ">"; }

  var origSettings = VIEWS.settings;
  VIEWS.settings = function () {
    var h = origSettings.apply(this, arguments);
    var oldRow = h.indexOf("<b>Kara's daily report</b>");
    if (oldRow < 0) oldRow = h.indexOf("<b>Kara\\'s daily report</b>");
    var rows =
      '<div class="setrow"><div><b>Kara\'s morning report</b><div class="muted small">A short start-of-day report: what\'s waiting on you, renewals this week and missing receipts. ' +
      (mOn() ? "Next one in " + until(morning()) + "." : "Off.") + '</div></div><span style="display:flex;gap:10px;align-items:center">' + tin("z1MornT", morning(), "Morning report time", !mOn()) + sw(mOn(), "z1MornOn", "Kara's morning report") + "</span></div>" +
      '<div class="setrow"><div><b>Kara\'s daily report</b><div class="muted small">The end-of-day report: what got done, what needs your OK and what is at risk. ' +
      (dOn() ? "Next one in " + until(daily()) + "." : "Off.") + '</div></div><span style="display:flex;gap:10px;align-items:center">' + tin("z1DailyT", daily(), "Daily report time", !dOn()) + sw(dOn(), "z1DailyOn", "Kara's daily report") + "</span></div>";
    if (oldRow > -1) {
      var s = h.lastIndexOf('<div class="setrow">', oldRow), e = h.indexOf("</span></div>", oldRow);
      if (s > -1 && e > -1) return h.slice(0, s) + rows + h.slice(e + "</span></div>".length);
    }
    return h.replace("</div>" + "<h3 class=\"secth\">App checks</h3>", rows + "</div><h3 class=\"secth\">App checks</h3>");
  };

  function saved(msg) { publish(); syncKara(); save(); render(); toast(msg); }
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "z1DailyT" && okT(t.value)) { st().reportTime = t.value; saved("Kara's daily report moved to " + label(t.value)); }
    if (t.id === "z1MornT" && okT(t.value)) { st().morningTime = t.value; saved("Kara's morning report moved to " + label(t.value)); }
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("#z1MornOn, #z1DailyOn"); if (!b) return;
    if (b.id === "z1MornOn") { st().morningOn = !mOn(); saved(mOn() ? "Kara's morning report is on at " + label(morning()) : "Kara's morning report is off"); }
    else { st().dailyOn = !dOn(); saved(dOn() ? "Kara's daily report is on at " + label(daily()) : "Kara's daily report is off"); }
  });

  /* Office home panel (inside the 3D office frame): both reports, with the chosen times. */
  function morningItems(w) {
    var out = [], P = window.S || {}, d = P.data || {};
    try { var n = w.eval("aps().length"); out.push(n ? n + " approval" + (n > 1 ? "s" : "") + " waiting on you" : "Nothing waiting for your OK"); } catch (err) { /* office not ready */ }
    try { var ib = w.eval("S.inbox.length"); if (ib) out.push(ib + " finished item" + (ib > 1 ? "s" : "") + " in your inbox"); } catch (err) { /* optional */ }
    try {
      var soon = (d.subs || []).filter(function (s) { if (!s.on || !s.next) return false; var x = (new Date(s.next + "T00:00:00") - new Date(new Date().toDateString())) / 864e5; return x >= 0 && x <= 7; });
      out.push(soon.length ? "Renewing this week: " + soon.map(function (s) { return esc(s.n); }).join(", ") : "No renewals this week");
      var miss = (d.expenses || []).filter(function (e) { return !e.rcpt; }).length; if (miss) out.push(miss + " expense" + (miss > 1 ? "s" : "") + " missing a receipt");
    } catch (err) { /* optional */ }
    try {
      w.eval("DEPT_ROOMS2.map(function (r) { return [r.dept, pendingFor(r.dept)]; })").forEach(function (x) { if (x[1]) out.push(esc(x[0]) + ": " + x[1] + " waiting on you"); });
    } catch (err) { /* optional */ }
    return out;
  }
  // The office's own scripts re-wrap VIEWS.home after load, so check every tick and wrap again when needed.
  function patchOffice() {
    var fr = document.getElementById("officeFrame"), w = fr && fr.contentWindow;
    var V = null;
    try { V = w && w.eval("typeof VIEWS === 'object' ? VIEWS : null"); } catch (err) { return; } // office globals are script-scoped
    if (!w || typeof w.reportIn !== "function" || !V || typeof V.home !== "function") return;
    if (!w.__z1Rep) {
      w.__z1Rep = true;
      w.reportIn = function () { return until(daily()); };
      w.document.addEventListener("click", function (ev) {
        var b = ev.target.closest && ev.target.closest("[data-z1morn]"); if (!b) return;
        ev.preventDefault(); ev.stopPropagation(); w.__z1MornOpen = !w.__z1MornOpen;
        try { w.renderPanel(true); } catch (err) { /* panel redraws on its own tick */ }
      }, true);
    }
    if (V.home.__z1Rep) return;
    var base = V.home;
    var wrapped = function () {
      var h = withMorning(base.apply(this, arguments).replace("Every day at 7:00 PM", "Every day at " + label(daily())));
      return dOn() ? h : h.replace(/<div class="rep"><div[^>]*><b>Kara's daily report<\/b>[\s\S]*?<\/span>(<ul>[\s\S]*?<\/ul>)?<\/div>/, "");
    };
    function withMorning(h) {
      if (!mOn() || h.indexOf("data-z1morn") > -1) return h; // already added by an inner copy of this wrapper
      var open = !!w.__z1MornOpen, at = h.indexOf('<div class="rep">');
      var card = '<div class="rep"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>Kara\'s morning report</b><button class="btn sm" data-z1morn="1">' + (open ? "Hide" : "Preview") + "</button></div>" +
        '<span class="muted small">Every day at ' + label(morning()) + " · in " + until(morning()) + "</span>" +
        (open ? "<ul>" + morningItems(w).map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "") + "</div>";
      return at > -1 ? h.slice(0, at) + card + h.slice(at) : h;
    }
    wrapped.__z1Rep = true;
    V.home = wrapped;
    try { if (w.eval("S.panel && S.panel.v === 'home'")) w.renderPanel(true); } catch (err) { /* not ready yet */ }
  }
  setInterval(patchOffice, 1500);

  publish();
  if (syncKara()) save();
  if (S.view === "settings") render();
})();
