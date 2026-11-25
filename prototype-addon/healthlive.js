/* zero1office add-on: real connection checks on App health (Paolo, 2026-11-25: "Lets do the connections first").
   The Accesses page already makes live, read-only checks for each connection (liveRows / liveTest / liveBadge).
   App health now uses those results: "Tools connected" counts real failures, a Connections card lists each one,
   and Check now re-checks every switched-on connection live. Nothing in the original page is edited. */
(function () {
  if (typeof healthChecks !== "function" || typeof vHealth !== "function" || window.__z1HealthLive) return;
  window.__z1HealthLive = true;
  var running = false, done = 0, total = 0;
  function live() { return typeof liveRows === "function" && typeof liveTest === "function"; }
  function rows() { try { return liveRows().filter(function (x) { return x.on; }); } catch (err) { return []; } }
  function sum() {
    var on = rows(), ok = 0, bad = [], unk = 0;
    on.forEach(function (x) { if (!x.st) unk++; else if (x.st.ok || x.st.warn) ok++; else bad.push(x); });
    return { on: on, ok: ok, bad: bad, unk: unk };
  }
  function when(t) { try { return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }); } catch (err) { return ""; } }

  var origChecks = healthChecks;
  healthChecks = function () {
    var list = origChecks.apply(this, arguments);
    if (!live()) return list;
    var s = sum(), pass = s.on.length > 0 && !s.bad.length && !s.unk;
    var note = !s.on.length ? "No connections are switched on. Turn them on in Accesses." :
      s.bad.length ? s.bad.length + " of " + s.on.length + " not connected: " + s.bad.map(function (x) { return x.n; }).join(", ") + ". See Connections below." :
      s.unk ? s.ok + " of " + s.on.length + " connected, " + s.unk + " not checked yet. Press Check now." :
      "All " + s.on.length + " connections answered a live check.";
    return list.map(function (x) { return x[0] === "Tools connected" ? ["Tools connected", pass, note] : x; });
  };

  function card() {
    var s = sum();
    var h = '<div class="card pad" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap"><h3 style="margin:0">Connections</h3><span class="muted small">' +
      (running ? "Checking " + Math.min(done + 1, total) + " of " + total + "…" : s.ok + " of " + s.on.length + " connected · live checks") + '</span></div>';
    h += s.on.map(function (x) {
      var b = typeof liveBadge === "function" ? liveBadge(x) : "";
      var sub = x.st ? (x.st.ok ? "Checked " + when(x.st.at) : (x.st.msg || "") + (x.st.at ? " · " + when(x.st.at) : "")) : "Not checked yet";
      return '<div class="row" style="align-items:flex-start"><span style="min-width:0"><b class="small">' + esc(x.n) + '</b><br><span class="muted" style="font-size:11px">' + esc(sub) + '</span></span>' + b + '</div>';
    }).join("");
    var off = (function () { try { return liveRows().filter(function (x) { return !x.on; }).length; } catch (err) { return 0; } })();
    h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-go="accesses">Fix or change in Accesses</button>' + (off ? '<span class="muted small">' + off + " switched off</span>" : "") + "</div></div>";
    return h;
  }
  var origView = vHealth;
  vHealth = function () {
    var h = origView.apply(this, arguments);
    if (!live()) return h;
    var at = h.indexOf('<div class="grid2">');
    if (running) h = h.replace(/(data-act="hcheck")([^>]*)>Check now</, '$1$2 disabled>Checking…<');
    return at < 0 ? h + card() : h.slice(0, at) + card() + h.slice(at);
  };
  if (typeof VIEWS === "object" && VIEWS) VIEWS.health = vHealth;

  // Check now: run every switched-on connection's live check, one at a time, then stamp the check.
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-act="hcheck"]'); if (!b || !live()) return;
    ev.preventDefault(); ev.stopPropagation();
    if (running) return;
    var on = rows(); running = true; done = 0; total = on.length; render();
    (function next() {
      if (done >= on.length) {
        running = false;
        try { S.data.health.last = nowLabel() + " today"; save(); } catch (err) { /* optional */ }
        var s = sum(); toast("Checks finished: " + s.ok + " of " + s.on.length + " connections answered.");
        if (S.view === "health") render(); return;
      }
      liveTest(on[done].id, true).then(function () { done++; if (S.view === "health") render(); next(); }, function () { done++; next(); });
    })();
  }, true);
  if (S.view === "health") render();
})();

/* App health, part 2 (Paolo, 2026-11-25, "continues"): the remaining sample items.
   - The outreach inbox brake check is set aside until outreach email is really connected (its inboxes are sample).
   - New real checks: file storage and the proposal product files.
   - "AI spend (sample)" is replaced by live AI use this month: real Claude replies counted per employee, kept in the
     page's shared storage (meta/aiuse). Claude usage is part of the Claude plan, so the page counts replies, not pesos. */
(function () {
  if (typeof healthChecks !== "function" || typeof vHealth !== "function" || window.__z1HealthLive2) return;
  window.__z1HealthLive2 = true;
  function month() { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7); } catch (err) { return new Date().toISOString().slice(0, 7); } }
  var U = { month: month(), total: 0, by: {} }, DB = null, KEY = "zero1office:aiuse:v1", writing = false, again = false;
  function fresh(x) {
    var m = month(), o = { month: m, total: 0, by: {} };
    if (x && x.month === m) { o.total = Number(x.total) || 0; var b = x.by || {}; for (var k in b) o.by[k] = Number(b[k]) || 0; }
    return o;
  }
  try { U = fresh(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (err) { /* optional */ }
  function rer() { if (S.view === "health") render(); }
  var cl = window.claude;
  if (cl && cl.use) cl.use("db").then(function (db) {
    DB = db; if (!DB) return;
    try {
      DB.doc("meta/aiuse").onSnapshot(function (d) {
        var x = d && d.exists ? (typeof d.data === "function" ? d.data() : d.data) : null;
        var f = fresh(x); if (f.total >= U.total || U.month !== f.month) U = f; rer();
      }, function () { /* keep the local count */ });
    } catch (err) { /* keep the local count */ }
  }, function () { /* local only */ });
  function push() {
    try { localStorage.setItem(KEY, JSON.stringify(U)); } catch (err) { /* optional */ }
    if (!DB) return;
    if (writing) { again = true; return; }
    writing = true;
    DB.doc("meta/aiuse").set({ month: U.month, total: U.total, by: U.by }).then(done, done);
    function done() { writing = false; if (again) { again = false; push(); } }
  }
  window.Z1AIUse = {
    add: function (id, n) { if (U.month !== month()) U = fresh(null); n = n || 1; U.total += n; if (id) U.by[id] = (U.by[id] || 0) + n; push(); rer(); },
    get: function () { return U; }
  };

  var origChecks = healthChecks;
  healthChecks = function () {
    var list = origChecks.apply(this, arguments).filter(function (x) { return x[0] !== "No inbox stopped by the brake"; });
    var F = window.Z1Files, ready = !!(F && F.ready && F.ready()), n = F && F.rows ? F.rows().length : 0;
    list.push(["File storage works", ready, ready ? n + " uploaded file" + (n === 1 ? "" : "s") + " in Settings > Files, saved for everyone with access." : "File storage isn't reachable in this view. Open Zero1Office on claude.ai."]);
    if (typeof window.Z1PG_missing === "function") {
      var miss = window.Z1PG_missing(), prods = [];
      miss.forEach(function (m) { if (prods.indexOf(m.prod) < 0) prods.push(m.prod); });
      list.push(["Proposal files uploaded", !miss.length, miss.length ? miss.length + " file" + (miss.length === 1 ? "" : "s") + " not uploaded yet, for " + prods.join(", ") + ". Add them in Settings > Files." : "Every product in the Proposal generator has its files."]);
    }
    return list.map(function (x) { return x[0] === "Team on duty" ? ["Team on duty", x[1], x[2].replace("today.", "today in the office.")] : x; });
  };

  function usageCard() {
    var u = U.month === month() ? U : fresh(null), ids = Object.keys(u.by).sort(function (a, b) { return u.by[b] - u.by[a]; });
    var mname = ""; try { mname = new Date().toLocaleDateString("en-US", { month: "long", timeZone: "Asia/Manila" }); } catch (err) { /* optional */ }
    var h = '<div class="card pad"><h3>Live AI use in ' + esc(mname || "this month") + '</h3>' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin:8px 0 4px"><b style="font-size:24px">' + u.total.toLocaleString() + '</b><span class="muted small">Claude replies in chat this month</span></div>' +
      '<p class="muted" style="font-size:11px;margin:0 0 10px">Counted as they happen. Claude use is part of your Claude plan, so there\'s no peso amount per reply.</p>';
    h += ids.length ? ids.slice(0, 8).map(function (id) { var e = typeof byId === "function" ? byId(id) : null; return '<div class="row"><span>' + esc(e ? e.n : id) + (e ? ' · <span class="muted">' + esc(e.r) + '</span>' : '') + '</span><b class="num">' + u.by[id] + '</b></div>'; }).join("") :
      '<p class="muted small" style="margin:0">No live replies yet this month. Message any employee in the chat to start.</p>';
    return h + '</div>';
  }
  var origView = vHealth;
  vHealth = function () {
    var h = origView.apply(this, arguments);
    var i = h.indexOf('<div class="card pad"><h3>AI spend this month (sample)</h3>');
    if (i > -1) h = h.slice(0, i) + usageCard() + '</div>';
    h = h.replace("Checks that keep the office running, and what the AI costs this month.", "Live checks that keep the office running, and how much live AI was used this month.");
    h = h.replace('<h3>What gets checked</h3>', '<h3>What gets checked</h3><p class="muted" style="font-size:11px;margin:2px 0 6px">The outreach inbox bounce check comes back once outreach email is connected for real.</p>');
    return h;
  };
  if (typeof VIEWS === "object" && VIEWS) VIEWS.health = vHealth;
  if (S.view === "health") render();
})();
