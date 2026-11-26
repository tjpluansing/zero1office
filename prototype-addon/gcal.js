/* zero1office add-on: your real Google Calendar on the Calendar page (Paolo, 2026-11-25: "Update calendar").
   Reads events for the month on screen through the Google Calendar connector (list_events, read-only) and shows
   them next to the office's own events, in purple. Nothing is written to Google, and nothing is stored: events are
   kept in memory for this visit only. The first load waits for a click, because it asks you to allow the connector. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.calendar || window.__z1GCal) return;
  window.__z1GCal = true;
  var SERVER = "Google Calendar", KEY = "zero1office:gcal:on";
  var G = { on: false, busy: false, err: "", byMonth: {}, at: {}, asked: {} };
  try { G.on = localStorage.getItem(KEY) === "1"; } catch (err) { /* optional */ }
  var css = document.createElement("style");
  css.textContent = ".ev-gcal{background:#f1eafd;border-color:#7c4dff;color:#4b2a9e}" +
    ":root[data-theme=dark] .ev-gcal{background:#2c2342;color:#d6c8ff}" +
    "@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .ev-gcal{background:#2c2342;color:#d6c8ff}}" +
    ".z1g-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border-radius:10px;background:var(--sunken);font-size:12.5px}";
  document.head.appendChild(css);

  function mkey() { return S.calY + "-" + S.calM; }
  function pad(n) { return String(n).padStart(2, "0"); }
  // Grid range: the 6 weeks the month view shows.
  function range() {
    var first = new Date(S.calY, S.calM, 1), start = new Date(S.calY, S.calM, 1 - first.getDay()), end = new Date(start); end.setDate(start.getDate() + 42);
    var f = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T00:00:00"; };
    return { s: f(start), e: f(end) };
  }
  // Day key and HH:MM in Manila time.
  function manila(iso) {
    try {
      var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
      return { d: p.year + "-" + p.month + "-" + p.day, tm: (p.hour === "24" ? "00" : p.hour) + ":" + p.minute };
    } catch (err) { return null; }
  }
  function toEvents(res) {
    var p = res && res.payload, list = p && Array.isArray(p.events) ? p.events : [];
    if (!list.length && res && Array.isArray(res.content)) res.content.forEach(function (b) { if (b && b.type === "text") { try { var j = JSON.parse(b.text); if (j && Array.isArray(j.events)) list = list.concat(j.events); } catch (err) { /* skip */ } } });
    var out = [];
    list.forEach(function (ev, i) {
      if (!ev || ev.status === "cancelled") return;
      var title = String(ev.summary || "(No title)").slice(0, 120), link = /^https:\/\//.test(ev.htmlLink || "") ? ev.htmlLink : "";
      if (ev.start && ev.start.dateTime) {
        var m = manila(ev.start.dateTime); if (!m) return;
        out.push({ id: "g_" + i + "_" + String(ev.id || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40), d: m.d, tm: m.tm, t: title, k: "gcal", link: link });
      } else if (ev.start && ev.start.date) {
        out.push({ id: "g_" + i + "_" + String(ev.id || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40), d: String(ev.start.date).slice(0, 10), tm: "00:00", t: title + " (all day)", k: "gcal", link: link, allDay: true });
      }
    });
    return out;
  }
  function load(force) {
    var k = mkey(); if (G.busy || (!force && G.byMonth[k])) return;
    var cl = window.claude; if (!cl || !cl.use) { G.err = "Open Zero1Office on claude.ai to see your Google Calendar."; rer(); return; }
    G.busy = true; G.err = ""; rer();
    var r = range();
    cl.use("mcp").then(function (mcp) {
      if (!mcp) throw { code: "unavailable_here" };
      return mcp.callTool(SERVER, "list_events", { startTime: r.s, endTime: r.e, pageSize: 250, orderBy: "startTime", timeZone: "Asia/Manila" });
    }).then(function (res) {
      G.busy = false; G.byMonth[k] = toEvents(res); G.at[k] = Date.now(); G.on = true;
      try { localStorage.setItem(KEY, "1"); } catch (err) { /* optional */ }
      rer();
    }, function (err) {
      G.busy = false; var c = err && err.code;
      G.err = c === "needs_reauth" ? "Your Google sign-in expired. Reconnect Google Calendar in claude.ai Settings, Connectors." :
        c === "server_not_connected" || c === "selection_required" ? "Google Calendar isn't connected for you. Add it in claude.ai Settings, Connectors." :
        c === "not_in_manifest" ? "Google Calendar isn't switched on for this page yet." :
        c === "not_granted" || c === "consent_required" ? "Google Calendar was turned off for this page. Allow it in the page's permissions, then press Refresh." :
        c === "unavailable_here" ? "Open Zero1Office on claude.ai to see your Google Calendar." :
        c === "rate_limited" ? "Google is busy. Wait a minute, then press Refresh." : "Google Calendar didn't load" + (c ? " (" + c + ")" : "") + ". Press Refresh to try again.";
      rer();
    });
  }
  function rer() { if (S.view === "calendar") render(); }
  function when(t) { try { return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }); } catch (err) { return ""; } }

  var prev = VIEWS.calendar;
  function vCalendarG() {
    var k = mkey(), mine = G.byMonth[k] || [], keep = S.data.events, h;
    if (G.on && !G.byMonth[k] && !G.busy && !G.err && !G.asked[k]) { G.asked[k] = 1; setTimeout(function () { load(false); }, 0); }
    try { S.data.events = keep.concat(mine); h = prev(); } finally { S.data.events = keep; }
    // Google events open in Google instead of Edit/Remove.
    var links = {}; mine.forEach(function (e) { links[e.id] = e.link; });
    h = h.replace(/<span class="actions" style="margin:0"><button class="btn sm" data-ex="evedit" data-v="(g_[^"]+)">Edit<\/button><button class="btn sm" data-act="evdel" data-id="g_[^"]+">Remove<\/button><\/span>/g, function (_, id) {
      return links[id] ? '<a class="btn sm" href="' + esc(links[id]) + '" target="_blank" rel="noopener">Open in Google</a>' : '<span class="muted small">Google Calendar</span>';
    }).replace(/<button class="btn sm" data-act="evdel" data-id="g_[^"]+">Remove<\/button>/g, '<span class="muted small">Google Calendar</span>');
    h = h.split('border-left-color:undefined').join('border-left-color:#7c4dff');
    h = h.replace('<span class="ev ev-red">Deadline</span>', '<span class="ev ev-red">Deadline</span><span class="ev ev-gcal">Google Calendar</span>');
    var bar = '<div class="z1g-bar" role="status"><b>Google Calendar</b>';
    if (G.busy) bar += '<span class="muted">Loading your events…</span>';
    else if (G.err) bar += '<span>' + esc(G.err) + '</span><button class="btn sm" data-zg="load">Refresh</button>';
    else if (G.byMonth[k]) bar += '<span class="muted">' + mine.length + ' event' + (mine.length === 1 ? '' : 's') + ' on screen · read-only · updated ' + esc(when(G.at[k])) + '</span><button class="btn sm" data-zg="load">Refresh</button>';
    else bar += '<span class="muted">See your real Google events here. Nothing is changed in Google.</span><button class="btn sm pri" data-zg="load">Show my Google Calendar</button>';
    bar += '</div>';
    var at = h.indexOf('<div class="cal">');
    return at < 0 ? h + bar : h.slice(0, at) + bar + h.slice(at);
  }
  VIEWS.calendar = vCalendarG;

  // The next 7 days, for Dom's live work. Only runs once Paolo has turned the calendar on, and refreshes every 30 minutes.
  var U = { list: null, at: 0, busy: false };
  function loadUpcoming() {
    if (!G.on || U.busy || Date.now() - U.at < 30 * 60000) return;
    var cl = window.claude; if (!cl || !cl.use) return;
    U.busy = true;
    var f = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T00:00:00"; };
    var a = new Date(), b = new Date(a.getTime() + 8 * 864e5);
    cl.use("mcp").then(function (mcp) {
      if (!mcp) throw { code: "unavailable_here" };
      return mcp.callTool(SERVER, "list_events", { startTime: f(a), endTime: f(b), pageSize: 100, orderBy: "startTime", timeZone: "Asia/Manila" });
    }).then(function (res) { U.busy = false; U.list = toEvents(res); U.at = Date.now(); },
      function () { U.busy = false; U.at = Date.now(); });
  }
  window.Z1GCal = { upcoming: function () { loadUpcoming(); return U.list; }, on: function () { return G.on; } };
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zg]"); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (b.getAttribute("data-zg") === "load") { G.err = ""; load(true); }
  }, true);
  if (S.view === "calendar") render();
})();
