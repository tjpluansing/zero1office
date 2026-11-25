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
