/* zero1office add-on: Ask Kara, the Jarvis-like assistant (Paolo, 2026-11-26: "Yes"; 2026-11-27: "lets go back to
   making Kara like Jarvis"). Kara (id "aria", the Chief of Staff) grows into the assistant rather than a new agent.

   Ask her (top bar "Ask Kara", Ctrl+K / Cmd+K, or the microphone):
   - "What's pending?" / "Brief me": the whole office's picture. Every live agent's "needs you" items (the same rows as
     "From your trackers", through window.Z1Live), plus Approvals, Content approvals, Inbox, To do list and the
     calendar for today and tomorrow (office events plus Google through window.Z1GCal).
   - "How's the team?" / "Who's busy?" / "What is Nina doing?": answered from each agent's real work (S.team).
   - "Open billing", "Ask Maya to …", "Add to do: …". Kara shows the step and waits for Do it (Enter). A typed
     "open …" runs straight away.
   - Anything else goes to the office's AI (the sample capability: Claude on claude.ai; Claude, ChatGPT or Gemini on
     app.ask-karla.com, picked in Settings > AI brain) when it is there, with counts, page names and agent names
     and roles only: no client names, amounts or details leave the page.

   Kara also speaks up on her own:
   - Daily briefing: the first time each person opens the app each day, a small card says what needs them today.
   - Nudges: while the app is open, a new "needs you" item (a new approval, an overdue SOA, a payout waiting for
     Karla's receipt, …) gets a small card from Kara with an Open button.
   Both can be switched off in the bar. "Read replies aloud" speaks her answers (tts capability, else the browser).
   Voice: the dictation capability on claude.ai; on app.ask-karla.com, the browser's own speech recognition where it
   exists (Chrome, Edge).

   Guardrails: Kara never sends, posts or pays. Anything outbound becomes a task for the right agent and still waits in
   Approvals for Karla. Only Super Admins (and the old Agent demo account) can hand out any task; everyone else can
   hand out follow-ups only, and can only open pages they're allowed. Every action is logged (the Log tab, shared with
   the team on the hosted app) and in Kara's feed in the office. Personal settings use "ak-" keys so they stay on this
   browser and aren't shared. */
(function () {
  if (typeof S === "undefined" || typeof VIEWS !== "object" || !VIEWS || window.__z1Kara) return;
  window.__z1Kara = true;
  var KARA = "aria", LOG_KEY = "zero1office:kara:log:v1";
  var PREF = { speak: "ak-kara-speak", float: "ak-kara-float", brief: "ak-kara-brief", nudge: "ak-kara-nudge", briefDay: "ak-kara-brief-day" };
  var AI = null, D = null, T = null, mine = false, listening = false, base = "";
  var K = { open: false, tab: "ask", busy: false, out: null, plan: null };
  function pref(k, def) { try { var v = localStorage.getItem(PREF[k]); return v == null ? def : v === "1"; } catch (err) { return def; } }
  function setPref(k, on) { try { localStorage.setItem(PREF[k], on ? "1" : "0"); } catch (err) { /* optional */ } }

  /* ---------- capabilities: Claude, voice in, voice out ---------- */
  function hookDictation(d) {
    D = d || null; if (!D) return;
    D.onPartial(function (p) { if (!mine) return; var i = inp(); if (i) i.value = (base ? base + " " : "") + (p && p.text || ""); });
    D.onFinal(function (p) { if (!mine) return; var t = p && p.text ? String(p.text).trim() : ""; if (t) base = (base ? base + " " : "") + t; var i = inp(); if (i) i.value = base; });
    D.onState(function (s) {
      if (!mine) return;
      listening = !!s && (s.state === "listening" || s.state === "starting");
      if (s && s.state === "idle") {
        mine = false; listening = false; paintMic();
        var i = inp(); if (i) { i.value = base; i.focus(); }
        if (base && s.reason !== "not_granted" && s.reason !== "dismissed") run(base, true); // a spoken command runs when you stop talking
        return;
      }
      paintMic();
    });
    paint();
  }
  // The browser's own speech recognition, shaped like the dictation capability (used where that capability is absent).
  function browserDictation() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null;
    var cb = { p: [], f: [], s: [] }, rec = null, stopping = null;
    function emit(k, v) { cb[k].forEach(function (fn) { try { fn(v); } catch (err) { /* optional */ } }); }
    return {
      onPartial: function (fn) { cb.p.push(fn); }, onFinal: function (fn) { cb.f.push(fn); }, onState: function (fn) { cb.s.push(fn); },
      start: function () {
        try {
          rec = new SR(); rec.lang = "en-PH"; rec.interimResults = true; rec.continuous = false;
          rec.onresult = function (ev) {
            var interim = "";
            for (var i = ev.resultIndex; i < ev.results.length; i++) {
              var r = ev.results[i]; if (r.isFinal) emit("f", { text: r[0].transcript }); else interim += r[0].transcript;
            }
            if (interim) emit("p", { text: interim });
          };
          rec.onerror = function (ev) { stopping = ev && (ev.error === "not-allowed" || ev.error === "service-not-allowed") ? "not_granted" : "upstream_error"; };
          rec.onend = function () { emit("s", { state: "idle", reason: stopping || "stopped" }); rec = null; stopping = null; };
          rec.start(); emit("s", { state: "listening" });
          return Promise.resolve();
        } catch (err) { return Promise.reject({ code: "unavailable" }); }
      },
      stop: function () { if (rec) { stopping = "stopped"; rec.stop(); } return Promise.resolve(); },
    };
  }
  var cl = window.claude;
  if (cl && cl.use) {
    cl.use("sample").then(function (s) { AI = s || null; paint(); }, function () { AI = null; });
    cl.use("tts").then(function (t) { T = t || null; }, function () { T = null; });
    cl.use("dictation").then(function (d) { hookDictation(d || browserDictation()); }, function () { hookDictation(browserDictation()); });
  } else hookDictation(browserDictation());

  /* ---------- helpers ---------- */
  function h(s) { return esc(s); }
  function say(m) { try { toast(m); } catch (err) { /* optional */ } }
  function inp() { return document.getElementById("z1kIn"); }
  function kara() { return byId(KARA); }
  function me() { try { return window.Z1Auth && window.Z1Auth.me ? window.Z1Auth.me() : null; } catch (err) { return null; } }
  function whoName() { var m = me(); return m ? (m.name || m.email.split("@")[0]).split(" ")[0] : "there"; }
  function canAssignAny() { var m = me(); return !m || m.role === "Super Admin" || m.role === "Agent"; }
  function canOpen(v) { try { return !window.Z1Users || !window.Z1Users.allowed || window.Z1Users.allowed(v); } catch (err) { return true; } }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function todayKey(off) { var d = new Date(); d.setDate(d.getDate() + (off || 0)); return dkey(d); }

  /* ---------- the log ---------- */
  function readLog() { try { var l = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (err) { return []; } }
  function logIt(cmd, did) {
    var l = readLog(); l.unshift({ at: new Date().toISOString(), by: whoName(), cmd: String(cmd || "").slice(0, 200), did: String(did || "").slice(0, 240) });
    try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, 200))); } catch (err) { /* optional */ }
    var k = kara(); if (k) { try { addFeed(k, did); save(); } catch (err) { /* optional */ } }
  }

  /* ---------- pages and people ---------- */
  var ALIAS = { billing: ["soa", "soas", "billing", "collections", "receipts", "2307", "payouts", "commission"], approvals: ["approval", "approvals", "approve"],
    content: ["content", "posts", "content approvals"], inbox: ["inbox", "messages", "emails", "mail"], todo: ["to do", "todo", "todos", "tasks list", "to do list"],
    calendar: ["calendar", "schedule", "events"], office: ["office", "home", "3d office"], agents: ["agents", "employees", "my agents"],
    propgen: ["proposal generator", "generator", "make a proposal", "new proposal"], proposals: ["proposals", "proposal pipeline"], clients: ["clients", "client stats"],
    leads: ["leads", "lead"], finder: ["leads finder", "finder", "find leads"], reports: ["reports", "report", "ads"], spend: ["subscriptions", "expenses", "spend"],
    files: ["files", "documents", "file repository"], companies: ["companies", "providers", "insurers"], accesses: ["accesses", "connectors", "connections"],
    health: ["app health", "health"], settings: ["settings"], meetings: ["meetings", "board room"], workflows: ["workflows"], renewals: ["renewals", "renewal"],
    licenses: ["licenses", "license"], hr: ["hr", "hiring", "recruitment", "applicants"], users: ["users", "user management"] };
  function pages() {
    var out = [];
    try { NAV.forEach(function (g) { g[1].forEach(function (it) { if (VIEWS[it[0]] && canOpen(it[0])) out.push({ id: it[0], label: it[1] }); }); }); } catch (err) { /* optional */ }
    return out;
  }
  function pageLabel(id) { var p = null; try { NAV.forEach(function (g) { g[1].forEach(function (it) { if (it[0] === id) p = it[1]; }); }); } catch (err) { /* optional */ } return p || id; }
  function findPage(q) {
    q = norm(q); if (!q) return null;
    var best = null, score = 0;
    pages().forEach(function (p) {
      var names = [norm(p.label), p.id].concat(ALIAS[p.id] || []), s = 0;
      names.forEach(function (n) { if (q === n) s = Math.max(s, 100); else if ((" " + q + " ").indexOf(" " + n + " ") > -1) s = Math.max(s, 40 + n.length); else if (n.indexOf(q) === 0 && q.length > 2) s = Math.max(s, 30 + q.length); });
      if (s > score) { score = s; best = p; }
    });
    return best;
  }
  function findAgent(q) {
    var words = " " + norm(q) + " ", hit = null;
    S.team.forEach(function (e) { if (!hit && e.id !== KARA && words.indexOf(" " + norm(e.n) + " ") > -1) hit = e; });
    return hit;
  }
  // "soa:<id>", "view:spend:exp", "billing" -> the page to open
  function pathView(p) { p = String(p || ""); if (/^soa:/.test(p)) return "billing"; if (/^view:/.test(p)) return p.split(":")[1]; return VIEWS[p] ? p : "office"; }

  /* ---------- the office's picture, from the app's own trackers ---------- */
  function live() { try { return window.Z1Live && window.Z1Live.build ? window.Z1Live.build() : null; } catch (err) { return null; } }
  function pending() {
    var d = S.data || {}, p = [], L = live();
    var ap = (d.approvals || []).filter(function (a) { return a.state === "waiting"; });
    var po = (d.posts || []).filter(function (x) { return x.state === "waiting"; });
    var th = (d.threads || []).filter(function (x) { return x.needs && !x.arch; });
    var td = (d.todos || []).filter(function (x) { return !x.done; });
    var urgent = td.filter(function (x) { return x.p === "urgent"; });
    if (ap.length) p.push({ key: "ap", go: "approvals", n: ap.length, t: plural(ap.length, "approval") + " waiting for you", sub: ap.slice(0, 3).map(function (a) { return a.title || ""; }).filter(Boolean).join(" · ") });
    if (po.length) p.push({ key: "po", go: "content", n: po.length, t: plural(po.length, "post") + " waiting in Content approvals", sub: "" });
    if (th.length) p.push({ key: "in", go: "inbox", n: th.length, t: plural(th.length, "inbox thread") + " need your OK", sub: th.slice(0, 3).map(function (x) { return x.title || ""; }).filter(Boolean).join(" · ") });
    // Every live agent's "needs you" rows (SOAs, payouts, renewals, licenses, leads, …), grouped by agent.
    var needs = L ? L.items.filter(function (x) { return x.tone === "need"; }) : [];
    var byWho = {};
    needs.forEach(function (x) { (byWho[x.who] = byWho[x.who] || []).push(x); });
    Object.keys(byWho).forEach(function (id) {
      var xs = byWho[id], e = byId(id);
      p.push({ key: "lv:" + id, go: pathView(xs[0].path), n: xs.length, who: id, t: (e ? e.n + ": " : "") + (xs.length === 1 ? xs[0].title : plural(xs.length, "item") + " need you"), sub: xs.slice(0, 3).map(function (x) { return xs.length === 1 ? x.sub || "" : x.title; }).filter(Boolean).join(" · ") });
    });
    if (td.length) p.push({ key: "td", go: "todo", n: td.length, t: plural(td.length, "open to-do") + (urgent.length ? ", " + urgent.length + " urgent" : ""), sub: (urgent.length ? urgent : td).slice(0, 3).map(function (x) { return x.x; }).join(" · ") });
    var t0 = todayKey(0), t1 = todayKey(1), seen = {};
    var g = []; try { g = window.Z1GCal && window.Z1GCal.upcoming ? window.Z1GCal.upcoming() || [] : []; } catch (err) { /* optional */ }
    var ev = (d.events || []).concat(g).filter(function (e) { var k = e.d + e.tm + e.t; if (seen[k] || (e.d !== t0 && e.d !== t1)) return false; seen[k] = 1; return true; })
      .sort(function (a, b) { return (a.d + (a.tm || "")).localeCompare(b.d + (b.tm || "")); })
      .map(function (e) { return { d: e.d, tm: e.allDay ? "All day" : e.tm ? fmtTime(e.tm) : "", t: String(e.t).replace(/ \(all day\)$/, "") }; });
    var needIds = needs.map(function (x) { return x.who + "|" + x.title; });
    return { items: p, ev: ev, t0: t0, needIds: needIds, apIds: ap.map(function (a) { return a.id; }), needs: needs, ap: ap,
      counts: { approvals: ap.length, posts: po.length, inbox: th.length, todos: td.length, urgentTodos: urgent.length, agentNeeds: needs.length, eventsTodayTomorrow: ev.length } };
  }
  function pendingText(P, lead) {
    var line = !P.items.length ? "Nothing is waiting on you right now." : "Here's what's waiting: " + P.items.map(function (x) { return x.t; }).join("; ") + ".";
    var today = P.ev.filter(function (e) { return e.d === P.t0; });
    if (today.length) line += " Today: " + today.slice(0, 3).map(function (e) { return e.t + (e.tm ? " at " + e.tm : ""); }).join(", ") + (today.length > 3 ? ", and more" : "") + ".";
    return (lead ? lead + " " : "") + line;
  }
  function pendingOut(lead) { var P = pending(); return { kind: "pending", text: pendingText(P, lead), P: P }; }

  /* ---------- the team ---------- */
  function teamOut(q) {
    var e = findAgent(q);
    if (e) {
      var st = e.s === "active" ? "working" : e.s === "idle" ? "free" : "offline";
      var t = e.n + " (" + e.r + ") is " + st + (e.now ? ": " + e.now : "") + ".";
      var nx = (e.queue || []).slice(0, 3);
      if (nx.length) t += " Next up: " + nx.join("; ") + ".";
      return { kind: "agent", text: t, agent: e.id };
    }
    var act = S.team.filter(function (x) { return x.s === "active"; }), idle = S.team.filter(function (x) { return x.s === "idle"; }), off = S.team.filter(function (x) { return x.s === "offline"; });
    return { kind: "team", text: plural(S.team.length, "AI employee") + ": " + act.length + " working on real work, " + idle.length + " free" + (off.length ? ", " + off.length + " offline" : "") + "." + (idle.length ? " Free now: " + idle.slice(0, 8).map(function (x) { return x.n; }).join(", ") + (idle.length > 8 ? " and more" : "") + "." : ""), act: act };
  }

  /* ---------- understanding a command ---------- */
  var OUTBOUND = /\b(send|email|e-mail|mail|post|publish|reply|message|text|viber|messenger|call|pay|transfer|submit)\b/;
  function parse(raw) {
    var q = String(raw || "").trim().replace(/^(hey|hi|ok|okay)?\s*kara[,!.:]?\s*/i, ""), n = norm(q);
    if (!n) return { type: "pending" };
    if (/^(what s|whats|what is|anything|show|give me|any)?\s*(pending|waiting|on my plate|need me|needs me|my day|brief|briefing|status|update|summary)\b/.test(n) || /\b(what s pending|whats pending|what needs me|what do i need|morning brief|catch me up|brief me|plan my day|prep my day)\b/.test(n))
      return { type: "pending" };
    if (/\b(team|everyone|who s busy|whos busy|who is busy|who s free|whos free|who is free|agents doing|who s working|whos working)\b/.test(n) && !/^(ask|tell|have|open|go to)\b/.test(n)) return { type: "team" };
    var ag0 = findAgent(q);
    if (ag0 && /^(what s|whats|what is|how s|hows|how is|where s|wheres|status of|check on)\b/.test(n)) return { type: "team", q: q };
    var m = n.match(/^(open|go to|goto|show me|show|take me to|navigate to)\s+(the\s+)?(.+?)( page)?$/);
    if (m) { var pg = findPage(m[3]); if (pg) return { type: "open", view: pg.id }; }
    m = q.match(/^(?:add|put|remind me)\s+(?:to\s+(?:my\s+)?(?:to ?do(?: list)?)\s*[:,-]?\s*|a to ?do\s*[:,-]?\s*|to ?do\s*[:,-]?\s*|to\s+)?(.+)$/i);
    if (m && /^(add|put|remind me)/i.test(q) && /to ?do|remind me/i.test(q)) return { type: "todo", text: m[1].replace(/\s+to (my )?to ?do( list)?$/i, "").trim(), urgent: /\burgent\b/i.test(q) };
    if (ag0 && /^(ask|tell|have|get|let|assign|give)\b/i.test(q)) {
      var rx = new RegExp("^(ask|tell|have|get|let|assign|give)\\s+" + ag0.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(to\\s+|a task\\s*:?\\s*|:|,)?\\s*", "i");
      var txt = q.replace(rx, "").trim();
      if (txt) return { type: "task", id: ag0.id, text: txt.charAt(0).toUpperCase() + txt.slice(1) };
    }
    if (n.split(" ").length <= 3) { var p2 = findPage(n); if (p2) return { type: "open", view: p2.id }; }
    return null;
  }
  // What Kara will do, shown before she does it.
  function planFor(a, cmd) {
    if (!a) return null;
    if (a.type === "open") return canOpen(a.view) ? { a: a, cmd: cmd, label: "Open " + pageLabel(a.view), auto: true } : { a: a, cmd: cmd, blocked: "Your account can't open " + pageLabel(a.view) + ". A Super Admin can add it in Settings > Users." };
    if (a.type === "todo") return a.text ? { a: a, cmd: cmd, label: "Add to your to do list: “" + a.text + "”" + (a.urgent ? " (urgent)" : "") } : null;
    if (a.type === "task") {
      var e = byId(a.id); if (!e) return null;
      if (!canAssignAny() && !/\b(follow|remind|chase|check on|ask for)\b/i.test(a.text))
        return { a: a, cmd: cmd, blocked: "Your account can hand out follow-ups on pending items and requirements. Ask Paolo or Karla for anything else." };
      var guard = OUTBOUND.test(norm(a.text)) ? "Nothing goes out from here. " + e.n + " prepares it, and it waits in Approvals for Karla before anything is sent." : "";
      return { a: a, cmd: cmd, label: "Give " + e.n + " (" + e.r + ") this task: “" + a.text + "”", guard: guard };
    }
    return null;
  }
  function doPlan(pl) {
    var a = pl.a, did = "";
    if (a.type === "open") { did = "Opened " + pageLabel(a.view) + " for " + whoName(); logIt(pl.cmd, did); close(); go(a.view); return; }
    if (a.type === "todo") {
      S.data.todos = S.data.todos || [];
      S.data.todos.unshift({ id: uid("td"), x: a.text.slice(0, 200), p: a.urgent ? "urgent" : "medium", done: false });
      did = "Added a to-do: " + a.text.slice(0, 120);
    }
    if (a.type === "task") { var e = byId(a.id); if (!e) return; giveTask(e, a.text.slice(0, 160)); did = "Gave " + e.n + " a task: " + a.text.slice(0, 120); }
    logIt(pl.cmd, did);
    try { save(); } catch (err) { /* optional */ }
    try { render(); } catch (err) { /* optional */ }
    K.plan = null; K.out = { kind: "done", text: "Done. " + did + "." }; paint(); speak(K.out.text);
  }

  /* ---------- Claude for everything else ---------- */
  function askClaude(cmd) {
    if (!AI) { K.out = { kind: "help", text: "I didn't catch that. Try “Brief me”, “Who's free?”, “What is Nina doing?”, “Open billing”, “Ask Maya to compare Maxicare and Medicard for a family of 4” or “Add to do: call Maxicare”." }; paint(); return; }
    K.busy = true; paint();
    var P = pending();
    var prompt = "You are Kara, Chief of Staff at Ask Karla (a Philippine HMO and insurance agency; Karla is the licensed agent and the only one who approves anything client-facing). " +
      "You run the voice and command assistant inside the Zero1Office app, like Jarvis: brief, calm, helpful. The user is " + whoName() + (canAssignAny() ? "" : " (may only hand out follow-ups)") + ". " +
      "Today is " + new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " in Manila.\n" +
      "Counts from the app's trackers right now: " + JSON.stringify(P.counts) + "\n" +
      "Pages the user can open (id: label): " + pages().map(function (p) { return p.id + ": " + p.label; }).join("; ") + "\n" +
      "AI employees (id: name, role, status): " + S.team.map(function (e) { return e.id + ": " + e.n + ", " + e.r + ", " + (e.s === "active" ? "busy" : e.s === "idle" ? "free" : "offline"); }).join("; ") + "\n\n" +
      "Rules: reply in 1-3 plain sentences, no markdown. Never claim you sent, posted, paid or emailed anything; you cannot. Client-facing work is a task for the right employee and waits for Karla's approval. " +
      "Never invent numbers, prices, clients or events; use only the counts above. If the request is real work, pick the one best employee (prefer a free one with the right role) and write a short imperative task (max 14 words).\n\n" +
      "Request: " + String(cmd).slice(0, 600) + "\n\n" +
      'Answer with JSON only: {"reply": string, "action": {"type": "open", "view": page id} | {"type": "task", "id": employee id, "text": string} | {"type": "todo", "text": string} | {"type": "pending"} | null}';
    AI.json(prompt, { modelTier: "default" }).then(function (v) {
      K.busy = false;
      if (window.Z1AIUse) try { window.Z1AIUse.add(KARA, 1); } catch (err) { /* optional */ }
      var reply = String(v && v.reply || "").replace(/\s+/g, " ").trim().slice(0, 600), act = v && v.action, a = null;
      if (act && act.type === "open" && VIEWS[act.view]) a = { type: "open", view: act.view };
      else if (act && act.type === "task" && byId(act.id) && act.text) a = { type: "task", id: act.id, text: String(act.text).slice(0, 160) };
      else if (act && act.type === "todo" && act.text) a = { type: "todo", text: String(act.text).slice(0, 200) };
      else if (act && act.type === "pending") { K.out = pendingOut(reply); paint(); speak(K.out.text); return; }
      var pl = planFor(a, cmd);
      if (pl && pl.auto) pl.auto = false; // from Claude, even opening a page waits for Do it
      K.plan = pl && !pl.blocked ? pl : null;
      if (K.plan) { var i = inp(); if (i) i.value = ""; }
      K.out = { kind: "ai", text: reply || (pl ? "Here's what I'd do." : "I'm not sure. Try rephrasing."), blocked: pl && pl.blocked };
      paint(); speak(K.out.text);
    }).catch(function (err) {
      K.busy = false;
      var c = err && err.code;
      if (c === "not_granted") AI = null;
      K.out = { kind: "help", text: c === "rate_limited" ? "Give me a moment, then ask again." : c === "not_granted" ? "The AI is switched off for this page, so I can only do the built-in commands: brief you, the team, open a page, give a task, add a to-do." : "I couldn't think that through just now. The built-in commands still work." };
      paint();
    });
  }

  /* ---------- run ---------- */
  function run(cmd, voiced) {
    cmd = String(cmd || "").trim(); if (!cmd || K.busy) return;
    base = ""; K.plan = null; K.out = null;
    var a = parse(cmd);
    if (a && a.type === "pending") { K.out = pendingOut(); logIt(cmd, "Briefed " + whoName() + " on what's pending"); clearInput(); paint(); speak(K.out.text); return; }
    if (a && a.type === "team") { K.out = teamOut(a.q || ""); clearInput(); paint(); speak(K.out.text); return; }
    var pl = planFor(a, cmd);
    if (pl && pl.blocked) { K.out = { kind: "help", text: pl.blocked }; paint(); return; }
    if (pl && pl.auto && !voiced) { doPlan(pl); return; }
    if (pl) { K.plan = pl; K.out = { kind: "plan", text: "Here's what I'll do. Press Enter or Do it." }; clearInput(); paint(); return; }
    askClaude(cmd);
  }
  function clearInput() { var i = inp(); if (i) i.value = ""; }

  /* ---------- speaking (off by default) ---------- */
  function speak(text, caption) {
    var said = String(text || ""); if (!said) return;
    var voice = pref("speak", false);
    talk(caption || said, voice);
    if (!voice) return;
    if (T) {
      T.speak(said.slice(0, 1900)).then(function () { talkDone(); }, function (err) { if (err && err.code === "not_granted") T = null; talkDone(); });
      return;
    }
    try {
      var u = new SpeechSynthesisUtterance(said.slice(0, 600)); u.lang = "en-US";
      u.onboundary = function () { beat(); }; u.onend = u.onerror = function () { talkDone(); };
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (err) { talkDone(); }
  }

  /* ---------- the floating talking Kara (Paolo, 2026-11-27: "Create a floating talking Kara when she is talking") ----------
     Whenever Kara says something (an answer, the daily briefing, a nudge), her avatar floats up in the corner with a
     caption that types out, and her rings and sound bars move while she talks. With "Read replies aloud" on, she moves
     in time with the voice; otherwise for as long as the caption takes to type. Drag her anywhere (remembered on this
     browser), click her to open Ask Kara, or switch her off with "Floating Kara" in the bar. */
  var tk = { el: null, timer: null, hide: null, voice: false, typing: false, hover: false };
  function talker() {
    if (tk.el) return tk.el;
    var el = document.createElement("div"); el.className = "z1k-talk"; el.hidden = true; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    el.innerHTML = '<div class="z1k-tface" data-z1k="talkopen" title="Ask Kara"><span class="z1k-ring"></span><span class="z1k-ring r2"></span><span class="z1k-tav"></span>' +
      '<span class="z1k-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>' +
      '<div class="z1k-tcap"><b>Kara</b><span class="z1k-ttext"></span></div><button class="z1k-tx" data-z1k="talkx" aria-label="Hide Kara">✕</button>';
    document.body.appendChild(el);
    el.addEventListener("mouseenter", function () { tk.hover = true; });
    el.addEventListener("mouseleave", function () { tk.hover = false; schedHide(); });
    el.addEventListener("click", onClick);
    // drag by the face
    var face = el.querySelector(".z1k-tface"), drag = null;
    face.addEventListener("pointerdown", function (ev) { var r = face.getBoundingClientRect(); drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, moved: false }; face.setPointerCapture(ev.pointerId); });
    face.addEventListener("pointermove", function (ev) {
      if (!drag) return; var x = ev.clientX - drag.dx, y = ev.clientY - drag.dy;
      var f = face.getBoundingClientRect();
      if (!drag.moved && Math.abs(x - f.left) + Math.abs(y - f.top) < 4) return;
      drag.moved = true; setPos(el, x, y);
    });
    face.addEventListener("pointerup", function () {
      if (drag && drag.moved) { var r = face.getBoundingClientRect(); try { localStorage.setItem("ak-kara-pos", JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (err) { /* optional */ } face.__dragged = true; setTimeout(function () { face.__dragged = false; }, 0); }
      drag = null;
    });
    tk.el = el; return el;
  }
  // Where she was dragged to, kept on screen when the window is smaller (or a phone).
  function place(el) {
    var pos = null; try { pos = JSON.parse(localStorage.getItem("ak-kara-pos") || "null"); } catch (err) { /* optional */ }
    if (!pos || !(pos.x >= 0) || !(pos.y >= 0)) return;
    setPos(el, pos.x, pos.y);
  }
  // x, y = top-left of her face. On the right half of the screen the caption goes to her left so it stays on screen.
  function setPos(el, x, y) {
    var fw = el.querySelector(".z1k-tface").offsetWidth || 80;
    x = Math.max(0, Math.min(innerWidth - fw, x)); y = Math.max(0, Math.min(innerHeight - fw, y));
    var flip = x + fw / 2 > innerWidth / 2; el.classList.toggle("flip", flip);
    el.style.left = flip ? "auto" : x + "px"; el.style.right = flip ? Math.max(0, innerWidth - x - fw) + "px" : "auto";
    el.style.top = y + "px"; el.style.bottom = "auto";
  }
  addEventListener("resize", function () { if (tk.el) place(tk.el); });
  function talk(text, voice) {
    if (!pref("float", true)) return;
    var t = String(text).replace(/\s+/g, " ").trim(); if (t.length > 220) t = t.slice(0, 217) + "…";
    // With the Ask Kara bar open her answer is already on screen: animate her face in the bar instead.
    if (K.open) {
      talkHide(); scrim.classList.add("z1k-speaking"); clearTimeout(tk.bar); tk.voice = !!voice;
      if (!voice) tk.bar = setTimeout(barDone, Math.min(6000, 900 + t.length * 30));
      return;
    }
    var el = talker(), k = kara(), box = el.querySelector(".z1k-tav"), cap = el.querySelector(".z1k-ttext");
    box.innerHTML = k ? av(k, 64) : ""; if (el.hidden) place(el);
    clearInterval(tk.timer); clearTimeout(tk.hide);
    el.hidden = false; el.classList.add("talking"); tk.voice = !!voice; tk.typing = true;
    var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (err) { /* optional */ }
    if (reduce) { cap.textContent = t; tk.typing = false; if (!voice) talkDone(); return; }
    var i = 0; cap.textContent = "";
    tk.timer = setInterval(function () {
      i = Math.min(t.length, i + 2); cap.textContent = t.slice(0, i);
      if (!voice && /\s/.test(t.charAt(i))) beat();
      if (i >= t.length) { clearInterval(tk.timer); tk.typing = false; if (!tk.voice) talkDone(); }
    }, 33);
  }
  function beat() { var el = tk.el; if (!el) return; el.classList.remove("beat"); void el.offsetWidth; el.classList.add("beat"); }
  function barDone() { clearTimeout(tk.bar); scrim.classList.remove("z1k-speaking"); }
  function talkDone() { barDone(); if (!tk.el) return; if (tk.voice && tk.typing) { tk.voice = false; return; } tk.el.classList.remove("talking"); schedHide(); }
  function schedHide() { clearTimeout(tk.hide); tk.hide = setTimeout(function () { if (tk.hover || !tk.el || tk.el.classList.contains("talking")) return; tk.el.hidden = true; }, 7000); }
  function talkHide() { clearInterval(tk.timer); clearTimeout(tk.hide); if (tk.el) { tk.el.hidden = true; tk.el.classList.remove("talking"); } }

  function hush() { try { if (T) T.stop(); else speechSynthesis.cancel(); } catch (err) { /* optional */ } if (tk.el) { tk.voice = false; talkDone(); } }

  /* ---------- UI ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".z1k-btn{gap:6px}.z1k-btn kbd{font:600 10px var(--body);border:1px solid currentColor;opacity:.75;border-radius:5px;padding:0 4px}" +
    ".z1k-scrim{position:fixed;inset:0;z-index:150;background:var(--scrim);display:flex;justify-content:center;align-items:flex-start;padding:min(12vh,90px) 16px 16px}" +
    ".z1k{width:min(640px,100%);max-height:100%;overflow:auto;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 30px 80px -30px rgb(0 0 0 / .55);display:flex;flex-direction:column}" +
    ".z1k-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}" +
    ".z1k-hd form{flex:1;display:flex;gap:6px;min-width:0}.z1k-hd .inp{flex:1;font-size:15px;padding:9px 11px;min-width:0}" +
    ".z1k-mic{width:38px;flex:none;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);cursor:pointer;display:grid;place-items:center}" +
    ".z1k-mic svg{width:17px;height:17px}.z1k-mic.on{background:var(--bad);border-color:var(--bad);color:#fff}" +
    ".z1k-tabs{display:flex;gap:4px;padding:8px 14px 0}.z1k-bd{padding:12px 14px 14px;display:grid;gap:10px}" +
    ".z1k-say{font-size:14px;line-height:1.5}" +
    ".z1k-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:9px 11px;cursor:pointer;font:inherit}" +
    ".z1k-row:hover{border-color:var(--gold)}.z1k-row .t{display:grid;gap:1px;min-width:0}.z1k-row small{color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".z1k-n{min-width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font:800 12px var(--display);background:var(--bad-soft);color:var(--bad);flex:none}" +
    ".z1k-plan{border:1px solid var(--gold);background:var(--gold-soft);border-radius:12px;padding:11px 12px;display:grid;gap:8px;font-size:13px}" +
    ".z1k-guard{font-size:12px;color:var(--muted)}.z1k-ex{display:flex;flex-wrap:wrap;gap:6px}" +
    ".z1k-ft{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:9px 14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}" +
    ".z1k-ft label{display:flex;gap:5px;align-items:center;cursor:pointer}.z1k-ft .z1k-rule{flex-basis:100%}" +
    ".z1k-log{display:grid;gap:6px;font-size:12px}.z1k-log div{border-bottom:1px solid var(--line);padding-bottom:6px}.z1k-log small{color:var(--muted)}" +
    ".z1k-ev{display:flex;gap:8px;font-size:12.5px;padding:3px 0}.z1k-ev span{color:var(--muted);min-width:110px}" +
    ".z1k-team{display:flex;flex-wrap:wrap;gap:6px}.z1k-team button{display:flex;gap:6px;align-items:center;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:3px 10px 3px 3px;font:600 12px var(--body);cursor:pointer}" +
    ".z1k-card{position:fixed;right:16px;bottom:80px;z-index:140;width:min(340px,calc(100% - 32px));background:var(--surface);color:var(--ink);border:1px solid var(--gold);border-radius:14px;box-shadow:0 20px 50px -20px rgb(0 0 0 / .5);padding:12px;display:grid;gap:8px;font-size:13px}" +
    ".z1k-card .hd{display:flex;gap:8px;align-items:center}.z1k-card .hd b{flex:1}.z1k-card p{margin:0;line-height:1.45}" +
    "@media (prefers-reduced-motion:no-preference){.z1k-card{animation:z1kIn .2s ease-out}@keyframes z1kIn{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}}" +
    ".z1k-talk{position:fixed;left:16px;bottom:16px;z-index:160;display:flex;align-items:flex-end;gap:10px;max-width:min(420px,calc(100% - 32px));pointer-events:none}" +
    ".z1k-talk>*{pointer-events:auto}.z1k-tface{position:relative;width:76px;height:76px;flex:none;cursor:grab;touch-action:none;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 50% 40%,var(--gold-soft),var(--surface));box-shadow:0 14px 34px -12px rgb(0 0 0 / .5);border:2px solid var(--gold)}" +
    ".z1k-tface:active{cursor:grabbing}.z1k-tav .av{width:64px;height:64px;border-radius:50%}.z1k-tav .av img{border-radius:50%}.z1k-tav .av .st{display:none}" +
    ".z1k-ring{position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--gold);opacity:0}" +
    ".z1k-bars{position:absolute;bottom:-6px;left:50%;translate:-50% 0;display:flex;gap:2px;align-items:flex-end;height:14px;padding:2px 5px;border-radius:999px;background:var(--surface);border:1px solid var(--line);opacity:0;transition:opacity .2s}" +
    ".z1k-bars i{width:3px;height:30%;border-radius:2px;background:var(--gold)}" +
    ".z1k-tcap{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px 14px 14px 4px;padding:8px 11px;font-size:13px;line-height:1.45;box-shadow:0 14px 34px -14px rgb(0 0 0 / .45);margin-bottom:22px;min-width:0}" +
    ".z1k-tcap b{display:block;font:700 11px var(--body);color:var(--brand);letter-spacing:.04em;text-transform:uppercase;margin-bottom:1px}" +
    ".z1k-tx{align-self:flex-start;border:0;background:var(--surface);color:var(--muted);border-radius:50%;width:22px;height:22px;cursor:pointer;box-shadow:0 4px 12px -6px rgb(0 0 0 / .4);font-size:11px;flex:none}" +
    ".z1k-talk.flip{flex-direction:row-reverse}" +
    ".z1k-hav{display:inline-flex;border-radius:50%;flex:none}.z1k-speaking .z1k-hav{box-shadow:0 0 0 3px var(--gold)}" +
    "@media (prefers-reduced-motion:no-preference){.z1k-speaking .z1k-hav{animation:z1kTalk .45s ease-in-out infinite alternate}}" +
    "@media (prefers-reduced-motion:no-preference){.z1k-talk:not([hidden]){animation:z1kFloat .3s ease-out}@keyframes z1kFloat{from{opacity:0;translate:0 12px}to{opacity:1;translate:0 0}}" +
    ".z1k-talk .z1k-tface{animation:z1kBob 4s ease-in-out infinite}@keyframes z1kBob{50%{translate:0 -4px}}" +
    ".z1k-talk.talking .z1k-ring{animation:z1kRing 1.4s ease-out infinite}.z1k-talk.talking .z1k-ring.r2{animation-delay:.7s}@keyframes z1kRing{0%{opacity:.7;scale:.95}100%{opacity:0;scale:1.35}}" +
    ".z1k-talk.talking .z1k-bars{opacity:1}.z1k-talk.talking .z1k-bars i{animation:z1kBar .5s ease-in-out infinite alternate}.z1k-talk.talking .z1k-bars i:nth-child(2){animation-delay:.12s}.z1k-talk.talking .z1k-bars i:nth-child(3){animation-delay:.24s}.z1k-talk.talking .z1k-bars i:nth-child(4){animation-delay:.08s}@keyframes z1kBar{to{height:100%}}" +
    ".z1k-talk.talking .z1k-tav{animation:z1kTalk .28s ease-in-out infinite alternate}@keyframes z1kTalk{to{scale:1.04}}.z1k-talk.beat .z1k-tav{animation:z1kBeat .18s ease-out}@keyframes z1kBeat{50%{scale:1.07}}}" +
    "@media (prefers-reduced-motion:reduce){.z1k-talk.talking .z1k-bars{opacity:1}}" +
    "@media (max-width:760px){.z1k-btn kbd{display:none}.z1k-scrim{padding-top:16px}.z1k-card{bottom:76px}.z1k-tface{width:60px;height:60px}.z1k-tav .av{width:50px;height:50px}.z1k-tcap{font-size:12px}}";
  document.head.appendChild(css);

  var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>';
  var scrim = document.createElement("div");
  scrim.className = "z1k-scrim"; scrim.hidden = true;
  scrim.innerHTML = '<div class="z1k" role="dialog" aria-modal="true" aria-label="Ask Kara" id="z1k"></div>';
  document.body.appendChild(scrim);
  var card = document.createElement("div");
  card.className = "z1k-card"; card.hidden = true; card.setAttribute("role", "status"); card.setAttribute("aria-live", "polite");
  document.body.appendChild(card);

  // The button sits in the top bar, right after the spacer.
  function addButton() {
    var top = document.querySelector("#app .top"); if (!top || top.querySelector(".z1k-btn")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "btn pri z1k-btn"; b.setAttribute("data-z1k", "open");
    b.innerHTML = "Ask Kara <kbd>" + (/Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K") + "</kbd>";
    b.title = "Ask Kara: brief me, the team, open a page, or give someone a task";
    var sp = top.querySelector(".sp"); if (sp && sp.nextSibling) top.insertBefore(b, sp.nextSibling); else top.appendChild(b);
  }
  addButton();

  var lastFocus = null;
  function open(prefill) {
    hideCard(); talkHide();
    if (K.open) { var i0 = inp(); if (i0) i0.focus(); return; }
    lastFocus = document.activeElement; K.open = true; K.tab = "ask"; scrim.hidden = false;
    if (!K.out) K.out = pendingOut(greet());
    paint();
    var i = inp(); if (i) { if (prefill) i.value = prefill; i.focus(); }
  }
  function close() {
    if (mine && D) { try { D.stop().catch(function () {}); } catch (err) { /* optional */ } }
    mine = false; listening = false; K.open = false; K.plan = null; K.out = null; base = ""; clearInput(); scrim.hidden = true; hush();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (err) { /* optional */ }
  }
  function hour() { return +new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }); }
  function greet() { var hr = hour(); return (hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening") + ", " + whoName() + "."; }

  function paintMic() {
    var b = document.querySelector("#z1k [data-z1k=mic]"); if (!b) return;
    b.classList.toggle("on", listening); b.setAttribute("aria-pressed", String(listening));
    b.setAttribute("aria-label", listening ? "Stop listening" : "Speak to Kara"); b.title = listening ? "Listening… press to stop, and Kara runs it" : "Speak to Kara";
  }
  function paint() {
    if (!K.open) return;
    var box = document.getElementById("z1k"), i = inp(), keep = i ? i.value : "";
    var k = kara(), hd = '<div class="z1k-hd">' + (k ? '<span class="z1k-hav">' + av(k, 30) + "</span>" : "") +
      '<form data-z1k="form" autocomplete="off"><input class="inp" id="z1kIn" placeholder="Ask Kara… “Brief me”, “Who\'s free?”, “Ask Maya to…”" aria-label="Ask Kara">' +
      (D ? '<button type="button" class="z1k-mic" data-z1k="mic">' + MIC + "</button>" : "") + '<button class="btn pri" type="submit">Go</button></form>' +
      '<button type="button" class="dots" data-z1k="close" aria-label="Close">✕</button></div>';
    var tabs = '<div class="z1k-tabs"><button class="chip" data-z1k="tab" data-v="ask" aria-pressed="' + (K.tab === "ask") + '">Kara</button><button class="chip" data-z1k="tab" data-v="log" aria-pressed="' + (K.tab === "log") + '">Log</button></div>';
    var bd = '<div class="z1k-bd">' + (K.tab === "log" ? logHtml() : askHtml()) + "</div>";
    var sw = function (k2, label, def) { return '<label><input type="checkbox" data-z1k="pref" data-v="' + k2 + '"' + (pref(k2, def) ? " checked" : "") + "> " + label + "</label>"; };
    var ft = '<div class="z1k-ft"><span class="z1k-rule">Kara never sends, posts or pays. Client-facing work waits in Approvals for Karla. Every action is logged.</span>' +
      sw("brief", "Daily briefing", true) + sw("float", "Floating Kara", true) + sw("nudge", "Tell me when something new needs me", true) + sw("speak", "Read replies aloud", false) + "</div>";
    box.innerHTML = hd + tabs + bd + ft;
    var ni = inp(); if (ni) ni.value = keep;
    paintMic();
  }
  function askHtml() {
    if (K.busy) return '<p class="z1k-say muted">Kara is thinking…</p>';
    var o = K.out, h1 = "";
    if (o) h1 += '<p class="z1k-say">' + h(o.text) + "</p>";
    if (o && o.blocked) h1 += '<p class="z1k-guard">' + h(o.blocked) + "</p>";
    if (K.plan) h1 += '<div class="z1k-plan"><b>' + h(K.plan.label) + "</b>" + (K.plan.guard ? '<span class="z1k-guard">' + h(K.plan.guard) + "</span>" : "") +
      '<div class="actions"><button class="btn pri" data-z1k="do">Do it</button><button class="btn" data-z1k="cancel">Cancel</button></div></div>';
    if (o && o.kind === "pending") {
      o.P.items.forEach(function (x) { h1 += '<button class="z1k-row" data-z1k="go" data-v="' + h(x.go) + '"><span class="z1k-n">' + x.n + '</span><span class="t"><b>' + h(x.t) + "</b>" + (x.sub ? "<small>" + h(x.sub) + "</small>" : "") + "</span></button>"; });
      if (o.P.ev.length) h1 += '<div class="card pad"><div class="secth">Today and tomorrow</div>' + o.P.ev.slice(0, 8).map(function (e) { return '<div class="z1k-ev"><span>' + (e.d === o.P.t0 ? "Today" : "Tomorrow") + (e.tm ? ", " + h(e.tm) : "") + "</span><b>" + h(e.t) + "</b></div>"; }).join("") + "</div>";
    }
    if (o && o.kind === "team" && o.act.length) h1 += '<div class="z1k-team">' + o.act.slice(0, 18).map(function (e) { return '<button data-z1k="agent" data-v="' + h(e.id) + '" title="' + h(e.now || "") + '">' + av(e, 22, "xs") + h(e.n) + "</button>"; }).join("") + "</div>";
    if (o && o.kind === "agent") h1 += '<div class="actions"><button class="btn sm" data-z1k="ex" data-v="Ask ' + h(byId(o.agent).n) + ' to ">Give ' + h(byId(o.agent).n) + ' a task</button><button class="btn sm" data-z1k="go" data-v="agents">Open My agents</button></div>';
    if (!K.plan) h1 += '<div class="z1k-ex">' + ["Brief me", "Who's free?", "What is Nina doing?", "Open billing", "Ask Felix to follow up pending requirements", "Add to do: call Maxicare about SOA"].map(function (x) { return '<button class="chip" data-z1k="ex">' + h(x) + "</button>"; }).join("") + "</div>";
    if (!AI) h1 += '<p class="z1k-guard">Built-in commands for now. For questions in your own words, connect an AI (Claude, ChatGPT or Gemini) in Settings &gt; AI brain.</p>';
    return h1;
  }
  function logHtml() {
    var l = readLog();
    if (!l.length) return '<p class="muted small">Nothing yet. Everything Kara does for you shows here.</p>';
    return '<div class="z1k-log">' + l.slice(0, 60).map(function (x) {
      var t = new Date(x.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
      return "<div><b>" + h(x.did) + "</b><br><small>" + h(t) + " · " + h(x.by) + " asked: “" + h(x.cmd) + "”</small></div>";
    }).join("") + "</div>";
  }

  /* ---------- Kara speaks up: daily briefing and nudges ---------- */
  var cardFor = null, seenNeeds = null, seenAp = null;
  function hideCard() { card.hidden = true; cardFor = null; }
  function showCard(title, text, go2, kind) {
    if (K.open) return;
    var k = kara();
    card.innerHTML = '<div class="hd">' + (k ? av(k, 26, "xs") : "") + "<b>" + h(title) + '</b><button class="dots" data-z1k="cardx" aria-label="Dismiss">✕</button></div><p>' + h(text) + '</p><div class="actions">' +
      (go2 ? '<button class="btn pri sm" data-z1k="cardgo" data-v="' + h(go2) + '">Open</button>' : "") + '<button class="btn sm" data-z1k="cardopen">Ask Kara</button></div>';
    card.hidden = false; cardFor = kind;
    speak(title + ". " + text, title);
  }
  function signedIn() { return !!me() && !document.body.classList.contains("z1-locked"); }
  function briefing() {
    if (!signedIn() || !pref("brief", true)) return false;
    var day = todayKey(0), who = (me() || {}).email || "", key = day + "|" + who, last = "";
    try { last = localStorage.getItem(PREF.briefDay) || ""; } catch (err) { /* optional */ }
    if (last === key) return false;
    try { localStorage.setItem(PREF.briefDay, key); } catch (err) { /* optional */ }
    var P = pending(), n = P.items.reduce(function (t, x) { return t + x.n; }, 0), today = P.ev.filter(function (e) { return e.d === P.t0; });
    var txt = (n ? (n === 1 ? "1 thing needs" : n + " things need") + " you: " + P.items.slice(0, 3).map(function (x) { return x.t; }).join("; ") + (P.items.length > 3 ? "; and more" : "") + "." : "Nothing needs you right now.") +
      (today.length ? " " + plural(today.length, "event") + " today, first " + today[0].t + (today[0].tm ? " at " + today[0].tm : "") + "." : "");
    showCard(greet() + " Here's your day", txt, null, "brief");
    logIt("(daily briefing)", "Gave " + whoName() + " the daily briefing");
    return true;
  }
  function watch() {
    if (!signedIn()) { seenNeeds = null; seenAp = null; return; }
    var P = pending();
    if (seenNeeds === null) { seenNeeds = P.needIds; seenAp = P.apIds; return; } // the first look only sets the baseline
    var newAp = P.ap.filter(function (a) { return seenAp.indexOf(a.id) < 0; });
    var newNeeds = P.needs.filter(function (x) { return seenNeeds.indexOf(x.who + "|" + x.title) < 0; });
    seenNeeds = P.needIds; seenAp = P.apIds;
    if (!pref("nudge", true) || K.open || (cardFor === "brief" && !card.hidden)) return;
    if (newAp.length) { var a = newAp[0], e = byId(a.who); showCard("New approval" + (e ? " from " + e.n : ""), (a.title || "Something is waiting for your OK.") + (newAp.length > 1 ? " (+" + (newAp.length - 1) + " more)" : ""), "approvals", "nudge"); return; }
    if (newNeeds.length) { var x = newNeeds[0], e2 = byId(x.who); showCard((e2 ? e2.n : "Kara") + " needs you", x.title + (x.sub ? " · " + x.sub : "") + (newNeeds.length > 1 ? " (+" + (newNeeds.length - 1) + " more)" : ""), pathView(x.path), "nudge"); }
  }
  setTimeout(function () { briefing(); watch(); }, 4000);
  setInterval(function () { if (!briefing()) watch(); }, 30000);

  /* ---------- events ---------- */
  function onClick(ev) {
    var b = ev.target.closest("[data-z1k]"); if (!b) return;
    var a = b.getAttribute("data-z1k");
    if (a === "open") open();
    else if (a === "close") close();
    else if (a === "tab") { K.tab = b.getAttribute("data-v"); paint(); }
    else if (a === "go") { var v = b.getAttribute("data-v"); logIt("Briefing → " + pageLabel(v), "Opened " + pageLabel(v) + " for " + whoName()); close(); go(v); }
    else if (a === "agent") { K.out = teamOut(byId(b.getAttribute("data-v")).n); paint(); }
    else if (a === "do") { if (K.plan) doPlan(K.plan); }
    else if (a === "cancel") { K.plan = null; K.out = { kind: "help", text: "Okay, nothing done." }; paint(); }
    else if (a === "ex") { var i = inp(), t = b.getAttribute("data-v"); if (t) { if (i) { i.value = t; i.focus(); } return; } if (i) i.value = b.textContent; run(b.textContent); }
    else if (a === "pref") { var k2 = b.getAttribute("data-v"); setPref(k2, b.checked); if (k2 === "speak" && !b.checked) hush(); if (k2 === "float" && !b.checked) talkHide(); }
    else if (a === "talkx") { hush(); talkHide(); }
    else if (a === "talkopen") { if (!b.__dragged) open(); }
    else if (a === "cardx") hideCard();
    else if (a === "cardgo") { var v2 = b.getAttribute("data-v"); hideCard(); hush(); go(v2); }
    else if (a === "cardopen") { hideCard(); open(); }
    else if (a === "mic") {
      if (!D) return;
      if (listening) { D.stop().catch(function () { /* already stopped */ }); return; }
      var i2 = inp(); base = i2 ? i2.value.trim() : ""; mine = true; listening = true; paintMic(); hush();
      D.start().catch(function (err) {
        mine = false; listening = false; paintMic();
        var c = err && err.code;
        say(c === "not_granted" ? "Voice is off for this page. Type instead." : c === "no_gesture" ? "Press the microphone again." : "Voice isn't available right now. Type instead.");
      });
    }
  }
  scrim.addEventListener("click", function (ev) { if (ev.target === scrim) { close(); return; } onClick(ev); });
  card.addEventListener("click", onClick);
  scrim.addEventListener("submit", function (ev) { ev.preventDefault(); var i = inp(); if (K.plan && i && !i.value.trim()) { doPlan(K.plan); return; } run(i ? i.value : ""); });
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-z1k=open]"); if (b && !scrim.contains(b) && !card.contains(b)) open(); });
  document.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && (ev.key === "k" || ev.key === "K")) { if (!signedIn() && window.Z1Auth) return; ev.preventDefault(); if (K.open) close(); else open(); return; }
    if (!K.open) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); return; }
    if (ev.key === "Enter" && K.plan && ev.target === inp() && !inp().value.trim()) { ev.preventDefault(); doPlan(K.plan); }
  }, true);

  window.Z1Kara = { open: open, run: function (c) { open(); run(c); }, pending: function () { return pending().counts; }, brief: function () { try { localStorage.removeItem(PREF.briefDay); } catch (err) { /* optional */ } return briefing(); } };
})();
