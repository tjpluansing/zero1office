/* zero1office add-on: several calendars on the Calendar page, with checkboxes, and all-day events
   (Paolo, 2026-11-25: "Update calendar"; 2026-11-27: "Have the ability to connect multiple calendars under connections.
   In Calendar have the option to choose which calendar to show using check boxes." and "Add All Day scheduling in Calendar").
   Sources: the office's own events, every Google calendar the Google Calendar connector lists (yours, shared and
   subscribed ones), your own Outlook calendar, other named calendars in your Outlook, and other people's Outlook calendars
   added in Accesses. Everything is read-only: nothing is written to Google or Outlook, and outside events are kept in
   memory for this visit only. Which calendars are ticked is remembered in this browser. The first load waits for a click,
   because it asks you to allow the connectors. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.calendar || window.__z1GCal) return;
  window.__z1GCal = true;
  var ONKEY = "zero1office:gcal:on", SHOWKEY = "zero1office:cal:show";
  var PAL = ["#7c4dff", "#0078d4", "#0b8043", "#e8710a", "#d50000", "#8e24aa", "#00838f", "#795548"];
  var C = { on: false, show: {}, ev: {}, at: {}, busy: {}, err: {}, gcals: null, glBusy: false, glErr: "" };
  try { C.on = localStorage.getItem(ONKEY) === "1"; } catch (err) { /* optional */ }
  try { C.show = JSON.parse(localStorage.getItem(SHOWKEY) || "{}") || {}; } catch (err) { C.show = {}; }
  var css = document.createElement("style");
  css.textContent = PAL.map(function (c, i) { return ".ev-x" + i + "{background:" + c + "1f;border-color:" + c + ";color:inherit}"; }).join("") +
    ".ev-gcal{background:#f1eafd;border-color:#7c4dff;color:#4b2a9e}" +
    ".z1g-bar{display:grid;gap:6px;padding:8px 10px;border-radius:10px;background:var(--sunken);font-size:12.5px}" +
    ".z1c-cks{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}" +
    ".z1c-ck{display:inline-flex;gap:6px;align-items:center;cursor:pointer;min-height:28px}" +
    ".z1c-ck input{width:16px;height:16px;margin:0;accent-color:var(--navy,#1E5190)}" +
    ".z1c-sw{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}" +
    ".z1c-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0;border-top:1px solid var(--line)}" +
    ".z1c-row:first-child{border-top:0}" +
    ".z1c-ad{display:flex!important;flex-direction:row!important;align-items:center;gap:8px;cursor:pointer}" +
    ".z1c-ad input{width:16px;height:16px;margin:0}#ev-time:disabled{opacity:.45}";
  document.head.appendChild(css);

  function pad(n) { return String(n).padStart(2, "0"); }
  function mkey() { return S.calY + "-" + S.calM; }
  function saveShow() { try { localStorage.setItem(SHOWKEY, JSON.stringify(C.show)); } catch (err) { /* optional */ } }
  function claudeOk() { var cl = window.claude; return !!(cl && cl.use); }
  function rowOn(id) { var a = S.data && S.data.accesses; if (!Array.isArray(a)) return true; var r = a.filter(function (x) { return x.id === id; })[0]; return !r || r.on !== false; }
  function cfg() { var c = typeof liveCfg === "function" ? liveCfg() : (S.data.liveCfg = S.data.liveCfg || {}); if (!Array.isArray(c.cal)) c.cal = []; if (!Array.isArray(c.calNames)) c.calNames = []; return c; }
  function gList() { var g = window.LIVE_GCAL && Array.isArray(LIVE_GCAL.cals) ? LIVE_GCAL.cals : null; return g || C.gcals; }
  function hid(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  // Every calendar Zero1Office can show. Office is always there; the others depend on the Accesses rows.
  function sources() {
    var out = [{ id: "office", n: "Office calendar", kind: "office", def: true }];
    if (rowOn("la_gcal")) (gList() || []).forEach(function (c) { out.push({ id: "g:" + c.id, n: c.name + (c.primary ? " (Google, main)" : " (Google)"), kind: "google", cal: c.id, primary: c.primary, def: !!c.primary }); });
    if (rowOn("la_cal")) {
      var c = cfg();
      out.push({ id: "o:me", n: "My Outlook calendar", kind: "outlook", def: true });
      c.calNames.forEach(function (x) { if (x && x.n) out.push({ id: "on:" + x.n.toLowerCase(), n: x.n + " (Outlook)", kind: "outlook", name: x.n }); });
      c.cal.forEach(function (x) { if (x && x.e && x.on !== false) out.push({ id: "o:" + x.e, n: (x.label || x.e) + " (Outlook)", kind: "outlook", owner: x.e }); });
    }
    var j = 0; out.forEach(function (s) { if (s.kind !== "office") s.ci = j++ % PAL.length; });
    return out;
  }
  function shown(s) { return C.show[s.id] === undefined ? !!s.def : !!C.show[s.id]; }

  // Grid range: the 6 weeks the month view shows.
  function range() {
    var first = new Date(S.calY, S.calM, 1), start = new Date(S.calY, S.calM, 1 - first.getDay()), end = new Date(start); end.setDate(start.getDate() + 42);
    var f = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    return { s: f(start), e: f(end) };
  }
  // Day key and HH:MM in Manila time.
  function manila(iso) {
    try {
      var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
      if (!p.year) return null;
      return { d: p.year + "-" + p.month + "-" + p.day, tm: (p.hour === "24" ? "00" : p.hour) + ":" + p.minute };
    } catch (err) { return null; }
  }
  // Outlook gives a wall-clock time in the mailbox's zone. UTC is converted; anything else is taken as Manila time.
  function wall(dt, tz) {
    dt = String(dt || ""); if (!dt) return null;
    if (/Z$|[+-]\d\d:\d\d$/.test(dt)) return manila(dt);
    if (/^(UTC|GMT|Etc\/UTC|Coordinated Universal Time)$/i.test(String(tz || ""))) return manila(dt.replace(/\.\d+$/, "") + "Z");
    var m = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)/.exec(dt); return m ? { d: m[1], tm: m[2] } : null;
  }
  function addDays(d, n) { var p = d.split("-"), x = new Date(+p[0], +p[1] - 1, +p[2] + n); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); }
  // An all-day event shows on every day it covers (end is the day after, as Google and Outlook send it), up to 31 days.
  function spread(base, d, endD, out) {
    var n = 0, cur = d;
    do { out.push(Object.assign({}, base, { id: base.id + (n ? "_" + n : ""), d: cur })); cur = addDays(cur, 1); n++; } while (endD && cur < endD && n < 31);
  }
  function link(u) { return /^https:\/\//.test(u || "") ? u : ""; }
  function googleEvents(res, s) {
    var p = res && res.payload, list = p && Array.isArray(p.events) ? p.events : [];
    if (!list.length && res && Array.isArray(res.content)) res.content.forEach(function (b) { if (b && b.type === "text") { try { var j = JSON.parse(b.text); if (j && Array.isArray(j.events)) list = list.concat(j.events); } catch (err) { /* skip */ } } });
    var out = [];
    list.forEach(function (ev, i) {
      if (!ev || ev.status === "cancelled") return;
      var base = { id: "x_" + hid(s.id) + "_" + i + "_" + String(ev.id || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 30), t: String(ev.summary || "(No title)").slice(0, 120), k: "x" + s.ci, link: link(ev.htmlLink), src: s.id, srcN: s.n, ext: "google" };
      if (ev.start && ev.start.dateTime) { var m = manila(ev.start.dateTime); if (m) out.push(Object.assign(base, { d: m.d, tm: m.tm })); }
      else if (ev.start && ev.start.date) spread(Object.assign(base, { tm: "00:00", allDay: true }), String(ev.start.date).slice(0, 10), ev.end && ev.end.date ? String(ev.end.date).slice(0, 10) : "", out);
    });
    return out;
  }
  function blocks(r) { var out = []; (r && r.content || []).forEach(function (b) { if (b && b.type === "text") { try { var j = JSON.parse(b.text); if (Array.isArray(j)) out = out.concat(j); else out.push(j); } catch (err) { /* skip */ } } }); if (!out.length && r && r.payload) { var p = r.payload; out = Array.isArray(p) ? p : Array.isArray(p.events) ? p.events : Array.isArray(p.value) ? p.value : [p]; } return out; }
  function outlookEvents(items, s) {
    var out = [];
    items.forEach(function (ev, i) {
      if (!ev || ev.subject === undefined || ev.isCancelled) return;
      var base = { id: "x_" + hid(s.id) + "_" + i + "_" + hid(ev.id || ev.uri || ev.subject + i), t: String(ev.subject || "(No title)").slice(0, 120), k: "x" + s.ci, link: link(ev.webLink), src: s.id, srcN: s.n, ext: "outlook" };
      var st = ev.start || {}, en = ev.end || {};
      if (ev.isAllDay) { var a = String(st.dateTime || st || "").slice(0, 10), b = String(en.dateTime || en || "").slice(0, 10); if (/^\d{4}-\d\d-\d\d$/.test(a)) spread(Object.assign(base, { tm: "00:00", allDay: true }), a, b, out); }
      else { var m = wall(st.dateTime || st, st.timeZone); if (m) out.push(Object.assign(base, { d: m.d, tm: m.tm })); }
    });
    return out;
  }

  function errMsg(err, kind) {
    var c = err && err.code, n = kind === "outlook" ? "Microsoft 365" : "Google Calendar";
    if (typeof liveErrMsg === "function" && c && c !== "tool_error") return liveErrMsg(err, n);
    if (c === "tool_error") return n + " said: " + String(err.message || "error").slice(0, 140);
    return n + " didn't load" + (c ? " (" + c + ")" : "") + ". Press Refresh to try again.";
  }
  function mcp() { var cl = window.claude; if (!cl || !cl.use) return Promise.reject({ code: "unavailable_here" }); return cl.use("mcp").then(function (m) { if (!m) throw { code: "unavailable_here" }; return m; }); }

  function fetchSource(s, r) {
    if (s.kind === "google") {
      var inp = { startTime: r.s + "T00:00:00", endTime: r.e + "T00:00:00", pageSize: 250, orderBy: "startTime", timeZone: "Asia/Manila" };
      if (!s.primary) inp.calendarId = s.cal;
      return mcp().then(function (m) { return m.callTool("Google Calendar", "list_events", inp, { cache: false }); }).then(function (res) { return googleEvents(res, s); });
    }
    // Outlook returns at most 25 events a call; page through up to 150 for the 6 weeks on screen.
    var got = [];
    function page(m, off) {
      var inp = { query: "*", afterDateTime: r.s, beforeDateTime: r.e, limit: 25, offset: off, order: "oldest" };
      if (s.owner) inp.calendarOwnerEmail = s.owner;
      if (s.name) inp.calendarName = s.name;
      return m.callTool("Microsoft 365", "outlook_calendar_search", inp, { cache: false }).then(function (res) {
        var b = blocks(res), tail = b.filter(function (x) { return x && x.nextOffset != null; })[0];
        got = got.concat(b.filter(function (x) { return x && x.subject !== undefined; }));
        return tail && +tail.nextOffset > off && got.length < 150 ? page(m, +tail.nextOffset) : got;
      });
    }
    return mcp().then(function (m) { return page(m, 0); }).then(function (items) { return outlookEvents(items, s); });
  }

  // Load the Google calendar list once (also fills the Accesses page's list).
  function loadGList() {
    if (C.glBusy || gList() || !rowOn("la_gcal")) return Promise.resolve();
    C.glBusy = true; C.glErr = ""; rer();
    return mcp().then(function (m) { return m.callTool("Google Calendar", "list_calendars", {}, { cache: false }); }).then(function (r) {
      var d = typeof liveObj === "function" ? liveObj(r) : (r.payload || {});
      var cals = typeof liveGCals === "function" ? liveGCals(d) : (d.calendars || d.items || []).map(function (c) { return { id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary }; });
      C.gcals = cals; if (window.LIVE_GCAL) LIVE_GCAL.cals = cals;
    }, function (err) { C.glErr = errMsg(err, "google"); }).then(function () { C.glBusy = false; rer(); });
  }

  var queue = [], running = false;
  function want(s, force) {
    var k = mkey(), key = s.id + "|" + k;
    if (C.busy[key] || (!force && (C.ev[s.id] && C.ev[s.id][k] || C.err[s.id]))) return;
    if (queue.some(function (q) { return q.key === key; })) return;
    C.busy[key] = 1; delete C.err[s.id]; queue.push({ s: s, key: key, k: k, r: range() }); pump();
  }
  function pump() {
    if (running || !queue.length) return; running = true;
    var q = queue.shift();
    fetchSource(q.s, q.r).then(function (list) { (C.ev[q.s.id] = C.ev[q.s.id] || {})[q.k] = list; C.at[q.s.id] = Date.now(); },
      function (err) { C.err[q.s.id] = errMsg(err, q.s.kind); })
      .then(function () { delete C.busy[q.key]; running = false; rer(); pump(); });
  }
  function loadAll(force) {
    if (!claudeOk()) { rer(); return; }
    C.on = true; try { localStorage.setItem(ONKEY, "1"); } catch (err) { /* optional */ }
    if (force) { C.err = {}; C.glErr = ""; }
    loadGList().then(function () { sources().forEach(function (s) { if (s.kind !== "office" && shown(s)) want(s, force); }); });
  }
  function rer() { if (S.view === "calendar" || S.view === "accesses") render(); }
  function when(t) { try { return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }); } catch (err) { return ""; } }

  // ---------- Calendar page ----------
  var AD = "\u0001AD";
  var prev = VIEWS.calendar;
  function vCalendarM() {
    var k = mkey(), src = sources(), keep = S.data.events || [], ext = [], h;
    // Once turned on, any ticked calendar not loaded for this month yet is fetched (errors wait for Refresh).
    if (C.on && claudeOk()) {
      var miss = (rowOn("la_gcal") && !gList() && !C.glBusy && !C.glErr) || src.some(function (s) { return s.kind !== "office" && shown(s) && !(C.ev[s.id] && C.ev[s.id][k]) && !C.err[s.id] && !C.busy[s.id + "|" + k]; });
      if (miss) setTimeout(function () { loadAll(false); }, 0);
    }
    src.forEach(function (s) { if (s.kind !== "office" && shown(s)) ext = ext.concat(C.ev[s.id] && C.ev[s.id][k] || []); });
    var showOffice = shown(src[0]);
    var all = (showOffice ? keep : []).concat(ext).map(function (e) { return e.allDay ? Object.assign({}, e, { tm: AD }) : e; });
    var ft = window.fmtTime;
    try {
      S.data.events = all;
      window.fmtTime = function (t) { return t === AD ? "All day" : ft(t); };
      h = prev();
    } finally { S.data.events = keep; window.fmtTime = ft; }
    // Outside events: coloured by their calendar, named, and opened in Google or Outlook instead of Edit/Remove.
    var byId = {}; ext.forEach(function (e) { byId[e.id] = e; });
    h = h.replace(/<div class="ag" style="border-left-color:undefined">([\s\S]*?)(?:<span class="actions" style="margin:0"><button class="btn sm" data-ex="evedit" data-v="(x_[^"]+)">Edit<\/button><button class="btn sm" data-act="evdel" data-id="x_[^"]+">Remove<\/button><\/span>|<button class="btn sm" data-act="evdel" data-id="(x_[^"]+)">Remove<\/button>)<\/div>/g, function (all0, mid, id1, id2) {
      var e = byId[id1 || id2]; if (!e) return all0;
      var col = PAL[+String(e.k).slice(1)] || PAL[0], app = e.ext === "outlook" ? "Outlook" : "Google";
      mid = mid.replace(/<\/span>$/, ' <span class="muted small">· ' + esc(e.srcN) + '</span></span>');
      return '<div class="ag" style="border-left-color:' + col + '">' + mid + (e.link ? '<a class="btn sm" href="' + esc(e.link) + '" target="_blank" rel="noopener">Open in ' + app + '</a>' : '<span class="muted small">' + app + '</span>') + '</div>';
    });
    // The checkbox bar replaces nothing: it sits above the month grid.
    var anyExt = src.length > 1 || rowOn("la_gcal");
    var bar = '<div class="z1g-bar" role="group" aria-label="Calendars to show"><div class="z1c-cks"><b>Show</b>' + src.map(function (s) {
      var sw = s.kind === "office" ? "linear-gradient(135deg,#1E5190 50%,#D3A13B 50%)" : PAL[s.ci], key = s.id + "|" + k;
      var st = C.busy[key] ? ' <span class="muted">loading…</span>' : C.err[s.id] && shown(s) ? ' <span style="color:var(--bad)">not loaded</span>' : "";
      return '<label class="z1c-ck"><input type="checkbox" data-zc="show" data-id="' + esc(s.id) + '"' + (shown(s) ? " checked" : "") + '><i class="z1c-sw" style="background:' + sw + '"></i>' + esc(s.n) + st + '</label>';
    }).join("") + '</div>';
    var errs = src.filter(function (s) { return C.err[s.id] && shown(s); });
    if (C.glErr) bar += '<div style="color:var(--bad)">' + esc(C.glErr) + '</div>';
    errs.forEach(function (s) { bar += '<div><b>' + esc(s.n) + ':</b> <span style="color:var(--bad)">' + esc(C.err[s.id]) + '</span></div>'; });
    var acts = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
    if (!claudeOk()) acts += '<span class="muted">Google and Outlook calendars show when Zero1Office is opened in Claude.</span>';
    else if (!C.on && anyExt) acts += '<span class="muted">See your Google and Outlook events here too. Nothing is changed in them.</span><button class="btn sm pri" data-zc="load">Show my connected calendars</button>';
    else { var busy = Object.keys(C.busy).length || C.glBusy, n = ext.length, last = Math.max.apply(null, [0].concat(Object.keys(C.at).map(function (x) { return C.at[x]; })));
      acts += '<span class="muted">' + (busy ? "Loading calendars…" : n + " outside event" + (n === 1 ? "" : "s") + " on screen · read-only" + (last ? " · updated " + esc(when(last)) : "")) + '</span><button class="btn sm" data-zc="load"' + (busy ? " disabled" : "") + '>Refresh</button>'; }
    acts += '<button class="btn sm" data-go="accesses">Add or manage calendars</button></div>';
    bar += acts + '</div>';
    var at = h.indexOf('<div class="cal">');
    return at < 0 ? h + bar : h.slice(0, at) + bar + h.slice(at);
  }
  VIEWS.calendar = vCalendarM;

  // ---------- Accesses: one card listing every calendar ----------
  var prevAcc = VIEWS.accesses;
  function calCard() {
    var src = sources(), gl = gList(), g = rowOn("la_gcal"), o = rowOn("la_cal");
    var rows = src.map(function (s) {
      var tag = s.kind === "office" ? "Zero1Office" : s.kind === "google" ? "Google" : "Outlook", sw = s.kind === "office" ? "linear-gradient(135deg,#1E5190 50%,#D3A13B 50%)" : PAL[s.ci];
      var del = s.id.indexOf("on:") === 0 ? '<button class="btn sm" data-zc="delname" data-v="' + esc(s.name) + '">Remove</button>' : s.owner ? '<span class="muted small">Remove it under Calendar (Outlook) below</span>' : "";
      return '<div class="z1c-row"><i class="z1c-sw" style="background:' + sw + '"></i><b style="flex:1;min-width:150px;word-break:break-word">' + esc(s.n.replace(/ \((Google|Outlook)(, main)?\)$/, "")) + (s.primary ? ' <span class="s s-info">Main</span>' : '') + '</b><span class="tag">' + tag + '</span>' +
        '<label class="z1c-ck small"><input type="checkbox" data-zc="show" data-id="' + esc(s.id) + '"' + (shown(s) ? " checked" : "") + '>Show on Calendar</label>' + del + '</div>';
    }).join("");
    var gnote = !g ? '<div class="muted small">Calendar (Google) is switched off below, so Google calendars are hidden.</div>' :
      !gl ? '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><span class="muted small">' + (C.glErr ? esc(C.glErr) : "Your Google calendars aren't loaded yet.") + '</span><button class="btn sm" data-zc="glist"' + (C.glBusy || !claudeOk() ? " disabled" : "") + '>' + (C.glBusy ? "Loading…" : "Load my Google calendars") + '</button></div>' : "";
    var add = o ? '<div class="lbl" style="margin:12px 0 4px">Add a calendar</div>' +
      '<div class="small" style="margin-bottom:4px"><b>Someone else\'s Outlook calendar</b> <span class="muted">(they share it with your Microsoft 365 account first)</span></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><input class="inp" id="z1c-oe" type="email" placeholder="e.g. assistant@ask-karla.com" style="flex:2;min-width:180px" aria-label="Their email"><input class="inp" id="z1c-ol" placeholder="Label (optional)" maxlength="40" style="flex:1;min-width:110px" aria-label="Label"><button class="btn sm pri" data-zc="addowner">Add</button></div>' +
      '<div class="small" style="margin:10px 0 4px"><b>Another calendar in your own Outlook</b> <span class="muted">(for example Birthdays or a team calendar, by its name in Outlook)</span></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><input class="inp" id="z1c-on" placeholder="Calendar name, e.g. Birthdays" maxlength="80" style="flex:2;min-width:180px" aria-label="Calendar name"><button class="btn sm pri" data-zc="addname">Add</button></div>' :
      '<div class="muted small" style="margin-top:8px">Calendar (Outlook) is switched off below, so Outlook calendars are hidden.</div>';
    return '<div class="card pad" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap"><h3 style="margin:0">Calendars · ' + src.length + '</h3><button class="btn sm" data-go="calendar">Open Calendar</button></div>' +
      '<div class="muted small" style="margin:2px 0 6px">Every calendar Zero1Office can read. Tick the ones to show on the Calendar page. Read-only: nothing is changed in Google or Outlook.</div>' +
      rows + gnote + add +
      '<div class="muted" style="font-size:11px;margin-top:10px"><b>Google:</b> calendars shared with your Google account, and ones you subscribe to in Google Calendar, show up here after you press Load again. <b>Apple iCloud, Yahoo, Zoho and other apps:</b> copy the calendar\'s link from that app, then add it in Google Calendar (Other calendars, From URL) or Outlook (Add calendar, Subscribe from web). It then shows up here.</div></div>';
  }
  if (prevAcc) VIEWS.accesses = function () {
    var h = prevAcc(), at = h.indexOf('<div class="card pad">');
    return at < 0 ? h + calCard() : h.slice(0, at) + calCard() + h.slice(at);
  };

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  document.addEventListener("change", function (ev) {
    var t = ev.target; if (!t || t.getAttribute("data-zc") !== "show") return;
    var id = t.getAttribute("data-id"); C.show[id] = !!t.checked; saveShow();
    var s = sources().filter(function (x) { return x.id === id; })[0];
    if (s && s.kind !== "office" && t.checked && claudeOk() && (C.on || S.view === "calendar")) { C.on = true; try { localStorage.setItem(ONKEY, "1"); } catch (err) { /* optional */ } delete C.err[id]; want(s, false); }
    render();
  }, true);
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zc]"); if (!b || b.tagName === "INPUT") return;
    ev.preventDefault(); ev.stopPropagation();
    var a = b.getAttribute("data-zc"), c = cfg();
    if (a === "load") { loadAll(true); return; }
    if (a === "glist") { C.glErr = ""; loadGList(); return; }
    if (a === "addowner") {
      var em = val("z1c-oe").toLowerCase(), lb = val("z1c-ol");
      if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(em)) { toast("Type a full email address."); return; }
      if (/@gmail\.com$|@yahoo\.|@outlook\.com$|@hotmail\./i.test(em)) { toast("That's a personal address. Share it into Google Calendar or Outlook instead (see the note below)."); return; }
      if (window.LIVE_ME && em === LIVE_ME) { toast("That's already your own calendar."); return; }
      if (c.cal.some(function (x) { return x.e === em; })) { toast("Already in the list."); return; }
      c.cal.push({ e: em, label: lb.slice(0, 40), on: true }); C.show["o:" + em] = true; saveShow(); save();
      if (typeof liveAcctCheck === "function") liveAcctCheck("cal", em); else render();
      toast(em + " added. Tick or untick it any time."); return;
    }
    if (a === "addname") {
      var nm = val("z1c-on").replace(/\s+/g, " ");
      if (!nm) { toast("Type the calendar's name as it shows in Outlook."); return; }
      if (c.calNames.some(function (x) { return x.n.toLowerCase() === nm.toLowerCase(); })) { toast("Already in the list."); return; }
      c.calNames.push({ n: nm.slice(0, 80) }); C.show["on:" + nm.toLowerCase()] = true; saveShow(); save(); render();
      toast(nm + " added."); return;
    }
    if (a === "delname") {
      var v = b.getAttribute("data-v") || "";
      c.calNames = c.calNames.filter(function (x) { return x.n !== v; }); delete C.show["on:" + v.toLowerCase()]; delete C.ev["on:" + v.toLowerCase()]; saveShow(); save(); render(); toast("Removed. Nothing in Outlook was changed."); return;
    }
  }, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" || !ev.target) return;
    var m = { "z1c-oe": "addowner", "z1c-ol": "addowner", "z1c-on": "addname" }[ev.target.id];
    if (m) { ev.preventDefault(); var b = document.querySelector('[data-zc="' + m + '"]'); if (b) b.click(); }
  }, true);

  // ---------- All-day events in the Add / Edit event form ----------
  var form = document.getElementById("eventForm"), tmIn = document.getElementById("ev-time"), adIn = null, editId = null;
  if (form && tmIn && !document.getElementById("ev-allday")) {
    var lab = document.createElement("label"); lab.className = "fld z1c-ad"; lab.setAttribute("for", "ev-allday");
    lab.innerHTML = '<input type="checkbox" id="ev-allday"> All day <span class="muted small">(no set time)</span>';
    var two = tmIn.closest(".two") || tmIn.parentNode; two.parentNode.insertBefore(lab, two.nextSibling);
    adIn = document.getElementById("ev-allday");
    adIn.addEventListener("change", function () { tmIn.disabled = adIn.checked; });
  }
  function setAd(on) { if (!adIn) return; adIn.checked = !!on; tmIn.disabled = !!on; }
  window.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest && ev.target.closest("[data-act],[data-ex]"); if (!t) return;
    if (t.getAttribute("data-act") === "evadd") { editId = null; setTimeout(function () { setAd(false); }, 0); }
    else if (t.getAttribute("data-ex") === "evedit") { editId = t.getAttribute("data-v"); setTimeout(function () { var x = (S.data.events || []).filter(function (v) { return v.id === editId; })[0]; setAd(x && x.allDay); }, 0); }
  }, true);
  window.addEventListener("submit", function (ev) {
    if (!adIn || !ev.target || ev.target.id !== "eventForm") return;
    var ad = adIn.checked, before = {}, eid = editId;
    (S.data.events || []).forEach(function (x) { before[x.id] = 1; });
    if (ad) { tmIn.disabled = false; tmIn.value = "00:00"; }
    setTimeout(function () {
      var sc = document.getElementById("eventScrim"); if (sc && !sc.hidden) { tmIn.disabled = adIn.checked; return; }
      var ch = false;
      (S.data.events || []).forEach(function (x) {
        if ((!before[x.id] || x.id === eid) && !!x.allDay !== ad) { if (ad) { x.allDay = true; x.tm = "00:00"; } else delete x.allDay; ch = true; }
      });
      editId = null; setAd(false);
      if (ch) { save(); render(); }
    }, 0);
  }, true);

  // ---------- The next 7 days of your main Google calendar, for Dom's live work (every 30 minutes once turned on) ----------
  var U = { list: null, at: 0, busy: false };
  function loadUpcoming() {
    if (!C.on || U.busy || Date.now() - U.at < 30 * 60000 || !claudeOk() || !rowOn("la_gcal")) return;
    U.busy = true;
    var f = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    var a = new Date(), b = new Date(a.getTime() + 8 * 864e5);
    fetchSource({ id: "g:primary", n: "Google", kind: "google", primary: true, ci: 0 }, { s: f(a), e: f(b) })
      .then(function (list) { U.busy = false; U.list = list; U.at = Date.now(); }, function () { U.busy = false; U.at = Date.now(); });
  }
  window.Z1GCal = { upcoming: function () { loadUpcoming(); return U.list; }, on: function () { return C.on; } };
  if (S.view === "calendar" || S.view === "accesses") render();
})();
