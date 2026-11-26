/* zero1office add-on: Ask Kara, a command bar on every page (Paolo, 2026-11-26: "Yes" to a Jarvis-like assistant).
   Kara (id "aria", the Chief of Staff) grows into the assistant rather than adding a new agent.
   - Open it with the "Ask Kara" button in the top bar, or Ctrl+K / Cmd+K. Type, or press the microphone and speak
     (the page's dictation capability, where this view offers it).
   - "What's pending" answers from the app's own trackers: Approvals, Content approvals, Inbox, To do list,
     Billing & SOA (overdue SOAs, missing 2307s, payouts waiting for Karla's receipt) and the Calendar (today and
     tomorrow; Google Calendar too once it has been switched on there).
   - "Open billing" goes to that page. "Ask Maya to …" hands a task to that AI employee through the page's own giveTask.
     "Add to do …" adds to the To do list. Kara shows what she is about to do and waits for Do it (Enter).
   - Anything else goes to Claude (the sample capability) when it is available, with counts and page and agent names
     only: no client names or details leave the page.
   Guardrails: Kara never sends, posts or pays. Anything outbound becomes a task for the right agent, and its result
   still waits in Approvals for Karla. The assistant account may only hand out follow-ups. Every Kara action is logged
   (this browser, last 200, the Log tab) and in Kara's own feed in the office. */
(function () {
  if (typeof S === "undefined" || typeof VIEWS !== "object" || !VIEWS || window.__z1Kara) return;
  window.__z1Kara = true;
  var KARA = "aria", LOG_KEY = "zero1office:kara:log:v1", SPEAK_KEY = "zero1office:kara:speak";
  var AI = null, D = null, T = null, mine = false, listening = false, base = "";
  var K = { open: false, tab: "ask", busy: false, out: null, plan: null, speak: false };
  try { K.speak = localStorage.getItem(SPEAK_KEY) === "1"; } catch (err) { /* optional */ }

  var cl = window.claude;
  if (cl && cl.use) {
    cl.use("sample").then(function (s) { AI = s || null; paint(); }, function () { AI = null; });
    cl.use("tts").then(function (t) { T = t || null; }, function () { T = null; });
    cl.use("dictation").then(function (d) {
      D = d || null; if (!D) return;
      D.onPartial(function (p) { if (!mine) return; var i = inp(); if (i) i.value = (base ? base + " " : "") + (p && p.text || ""); });
      D.onFinal(function (p) { if (!mine) return; var t = p && p.text ? String(p.text).trim() : ""; if (t) base = (base ? base + " " : "") + t; var i = inp(); if (i) i.value = base; });
      D.onState(function (s) {
        if (!mine) return;
        listening = s && (s.state === "listening" || s.state === "starting");
        if (s && s.state === "idle") {
          mine = false; listening = false; paintMic();
          var i = inp(); if (i) { i.value = base; i.focus(); }
          if (base && s.reason !== "not_granted" && s.reason !== "dismissed") run(base, true); // a spoken command runs when you stop talking
          return;
        }
        paintMic();
      });
      paint();
    }, function () { D = null; });
  }

  /* ---------- helpers ---------- */
  function h(s) { return esc(s); }
  function say(m) { try { toast(m); } catch (err) { /* optional */ } }
  function inp() { return document.getElementById("z1kIn"); }
  function kara() { return byId(KARA); }
  function who() { try { var s = JSON.parse(localStorage.getItem("zero1office-auth:v1") || "null"); return s && s.email ? s.email : ""; } catch (err) { return ""; } }
  function whoName() { var e = who(); return e ? e.split("@")[0].replace(/^./, function (c) { return c.toUpperCase(); }) : "You"; }
  function isAssistant() { return /^assistant@/i.test(who()); }
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
    calendar: ["calendar", "schedule", "events", "meetings today"], office: ["office", "home", "3d office"], agents: ["agents", "team", "employees", "my agents"],
    propgen: ["proposal generator", "generator", "make a proposal", "new proposal"], proposals: ["proposals", "proposal pipeline"], clients: ["clients", "client stats"],
    leads: ["leads", "lead"], reports: ["reports", "report", "ads"], spend: ["subscriptions", "expenses", "spend"], files: ["files", "documents", "file repository"],
    companies: ["companies", "providers", "insurers"], accesses: ["accesses", "connectors", "connections"], health: ["app health", "health"], settings: ["settings"],
    meetings: ["meetings", "board room"], workflows: ["workflows"] };
  function pages() {
    var out = [];
    try { NAV.forEach(function (g) { g[1].forEach(function (it) { if (VIEWS[it[0]]) out.push({ id: it[0], label: it[1] }); }); }); } catch (err) { /* optional */ }
    return out;
  }
  function pageLabel(id) { var p = pages().filter(function (x) { return x.id === id; })[0]; return p ? p.label : id; }
  function findPage(q) {
    q = norm(q); if (!q) return null;
    var ps = pages(), best = null, score = 0;
    ps.forEach(function (p) {
      var names = [norm(p.label), p.id].concat(ALIAS[p.id] || []), s = 0;
      names.forEach(function (n) { if (q === n) s = Math.max(s, 100); else if ((" " + q + " ").indexOf(" " + n + " ") > -1) s = Math.max(s, 40 + n.length); else if (n.indexOf(q) === 0 && q.length > 2) s = Math.max(s, 30 + q.length); });
      if (s > score) { score = s; best = p; }
    });
    return best;
  }
  function findAgent(q) {
    var words = " " + norm(q) + " ", hit = null;
    S.team.forEach(function (e) { if (!hit && words.indexOf(" " + norm(e.n) + " ") > -1) hit = e; });
    return hit;
  }

  /* ---------- what's pending, from the app's own trackers ---------- */
  function billing() {
    var B = null; try { B = JSON.parse(localStorage.getItem("zero1office-billing:v1") || "null"); } catch (err) { /* optional */ }
    var r = { overdue: [], m2307: [], receipts: [] }; if (!B || !Array.isArray(B.soas)) return r;
    var t = todayKey(0);
    B.soas.forEach(function (s) {
      if (!s || s.stage === "closed") return;
      if (s.stage === "awaiting_payment" && s.due_on && s.due_on < t) r.overdue.push(s);
      if (s.cwt_applicable && s.paid_on && !s.form_2307_on) r.m2307.push(s);
    });
    (B.payouts || []).forEach(function (d) { if (d && !d.receipt_no) r.receipts.push(d); });
    return r;
  }
  var gcal = { at: 0, list: null };
  function loadGoogle() {
    var on = false; try { on = localStorage.getItem("zero1office:gcal:on") === "1"; } catch (err) { /* optional */ }
    if (!on || !cl || !cl.use || Date.now() - gcal.at < 300000) return;
    gcal.at = Date.now();
    var a = todayKey(0) + "T00:00:00", b = todayKey(2) + "T00:00:00";
    cl.use("mcp").then(function (m) {
      if (!m) return null;
      return m.callTool("Google Calendar", "list_events", { startTime: a, endTime: b, pageSize: 50, orderBy: "startTime", timeZone: "Asia/Manila" });
    }).then(function (res) {
      if (!res) return;
      var p = res.payload, list = p && Array.isArray(p.events) ? p.events : [];
      gcal.list = list.filter(function (e) { return e && e.status !== "cancelled"; }).map(function (e) {
        var st = e.start || {}, d = (st.dateTime || st.date || "").slice(0, 10), tm = st.dateTime ? new Date(st.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "All day";
        return { d: d, tm: tm, t: String(e.summary || "(No title)").slice(0, 120), g: 1 };
      });
      if (K.open && K.out && K.out.kind === "pending") { K.out = pendingOut(); paint(); }
    }).catch(function () { /* Google Calendar is optional here */ });
  }
  function pending() {
    var d = S.data || {}, p = [];
    var ap = (d.approvals || []).filter(function (a) { return a.state === "waiting"; });
    var po = (d.posts || []).filter(function (x) { return x.state === "waiting"; });
    var th = (d.threads || []).filter(function (x) { return x.needs && !x.arch; });
    var td = (d.todos || []).filter(function (x) { return !x.done; });
    var urgent = td.filter(function (x) { return x.p === "urgent"; });
    var b = billing();
    if (ap.length) p.push({ go: "approvals", n: ap.length, t: plural(ap.length, "approval") + " waiting for you", sub: ap.slice(0, 3).map(function (a) { return a.t || a.title || a.n || ""; }).filter(Boolean).join(" · ") });
    if (po.length) p.push({ go: "content", n: po.length, t: plural(po.length, "post") + " waiting in Content approvals", sub: "" });
    if (th.length) p.push({ go: "inbox", n: th.length, t: plural(th.length, "inbox thread") + " need your OK", sub: th.slice(0, 3).map(function (x) { return x.title || x.s || ""; }).filter(Boolean).join(" · ") });
    if (b.overdue.length) p.push({ go: "billing", n: b.overdue.length, t: plural(b.overdue.length, "SOA") + " overdue for payment", sub: b.overdue.slice(0, 3).map(function (s) { return s.provider + " " + s.soa_no; }).join(" · ") });
    if (b.receipts.length) p.push({ go: "billing", n: b.receipts.length, t: plural(b.receipts.length, "payout") + " waiting for Karla's receipt", sub: b.receipts.slice(0, 3).map(function (x) { return x.provider + (x.reference ? " " + x.reference : ""); }).join(" · ") });
    if (b.m2307.length) p.push({ go: "billing", n: b.m2307.length, t: plural(b.m2307.length, "paid SOA") + " missing the 2307", sub: "" });
    if (td.length) p.push({ go: "todo", n: td.length, t: plural(td.length, "open to-do") + (urgent.length ? ", " + urgent.length + " urgent" : ""), sub: (urgent.length ? urgent : td).slice(0, 3).map(function (x) { return x.x; }).join(" · ") });
    var t0 = todayKey(0), t1 = todayKey(1);
    var ev = (d.events || []).filter(function (e) { return e.d === t0 || e.d === t1; }).map(function (e) { return { d: e.d, tm: e.tm ? fmtTime(e.tm) : "", t: e.t }; })
      .concat((gcal.list || []).filter(function (e) { return e.d === t0 || e.d === t1; }));
    return { items: p, ev: ev, t0: t0, counts: { approvals: ap.length, posts: po.length, inbox: th.length, todos: td.length, urgentTodos: urgent.length, soasOverdue: b.overdue.length, payoutsNeedReceipt: b.receipts.length, missing2307: b.m2307.length, eventsTodayTomorrow: ev.length } };
  }
  function pendingOut() {
    var P = pending(), n = P.items.reduce(function (t, x) { return t + x.n; }, 0);
    var line = !P.items.length ? "Nothing is waiting on you right now." + (P.ev.length ? " You have " + plural(P.ev.length, "event") + " today and tomorrow." : "")
      : "Here's what's waiting: " + P.items.map(function (x) { return x.t; }).join("; ") + "." + (P.ev.length ? " Plus " + plural(P.ev.length, "event") + " today and tomorrow." : "");
    return { kind: "pending", text: line, P: P, n: n };
  }

  /* ---------- understanding a command ---------- */
  var OUTBOUND = /\b(send|email|e-mail|mail|post|publish|reply|message|text|viber|messenger|call|pay|transfer|submit)\b/;
  function parse(raw) {
    var q = String(raw || "").trim(), n = norm(q);
    if (!n) return null;
    if (/^(what s|whats|what is|anything|show|give me|any)?\s*(pending|waiting|on my plate|need me|needs me|my day|brief|briefing|status|update|summary)\b/.test(n) || /\b(what s pending|whats pending|what needs me|what do i need|morning brief|catch me up)\b/.test(n))
      return { type: "pending" };
    var m = n.match(/^(open|go to|goto|show me|show|take me to|navigate to)\s+(the\s+)?(.+?)( page)?$/);
    if (m) { var pg = findPage(m[3]); if (pg) return { type: "open", view: pg.id }; }
    m = q.match(/^(?:add|put|remind me)\s+(?:to\s+(?:my\s+)?(?:to ?do(?: list)?)\s*[:,-]?\s*|a to ?do\s*[:,-]?\s*|to ?do\s*[:,-]?\s*|to\s+)?(.+)$/i);
    if (m && /^(add|put|remind me)/i.test(q) && /to ?do|remind me/i.test(q)) return { type: "todo", text: m[1].replace(/\s+to (my )?to ?do( list)?$/i, "").trim(), urgent: /\burgent\b/i.test(q) };
    var ag = findAgent(q);
    if (ag && /^(ask|tell|have|get|let|assign|give)\b/i.test(q)) {
      var rx = new RegExp("^(ask|tell|have|get|let|assign|give)\\s+" + ag.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(to\\s+|a task\\s*:?\\s*|:|,)?\\s*", "i");
      var txt = q.replace(rx, "").trim();
      if (txt) return { type: "task", id: ag.id, text: txt.charAt(0).toUpperCase() + txt.slice(1) };
    }
    if (n.split(" ").length <= 3) { var p2 = findPage(n); if (p2) return { type: "open", view: p2.id }; }
    return null;
  }
  // What Kara will do, shown before she does it.
  function planFor(a, cmd) {
    if (!a) return null;
    if (a.type === "open") return { a: a, cmd: cmd, label: "Open " + pageLabel(a.view), auto: true };
    if (a.type === "todo") return a.text ? { a: a, cmd: cmd, label: "Add to your to do list: “" + a.text + "”" + (a.urgent ? " (urgent)" : "") } : null;
    if (a.type === "task") {
      var e = byId(a.id); if (!e) return null;
      var guard = OUTBOUND.test(norm(a.text)) ? "Nothing goes out from here. " + e.n + " prepares it, and it waits in Approvals for Karla before anything is sent." : "";
      if (isAssistant() && !/\b(follow|remind|chase|check on|ask for)\b/i.test(a.text))
        return { a: a, cmd: cmd, blocked: "The assistant account can only hand out follow-ups on pending items and requirements. Ask Paolo or Karla for anything else." };
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
    if (!AI) { K.out = { kind: "help", text: "I didn't catch that. Try “What's pending?”, “Open billing”, “Ask Maya to compare Maxicare and Medicard for a family of 4”, or “Add to do: call Maxicare”." }; paint(); return; }
    K.busy = true; paint();
    var P = pending();
    var prompt = "You are Kara, Chief of Staff at Ask Karla (a Philippine HMO and insurance agency; Karla is the licensed agent and the only one who approves anything client-facing). " +
      "You run a command bar inside the Zero1Office app. The user is " + whoName() + (isAssistant() ? " (the assistant: may only hand out follow-ups)" : "") + ". " +
      "Today is " + new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " in Manila.\n" +
      "Counts from the app's trackers right now: " + JSON.stringify(P.counts) + "\n" +
      "Pages (id: label): " + pages().map(function (p) { return p.id + ": " + p.label; }).join("; ") + "\n" +
      "AI employees (id: name, role): " + S.team.map(function (e) { return e.id + ": " + e.n + ", " + e.r; }).join("; ") + "\n\n" +
      "Rules: reply in 1-3 plain sentences, no markdown. Never claim you sent, posted, paid or emailed anything; you cannot. Client-facing work is a task for the right employee and waits for Karla's approval. " +
      "Never invent numbers, prices, clients or events; use only the counts above. If the request is real work, pick the one best employee and write a short imperative task (max 14 words).\n\n" +
      "Request: " + String(cmd).slice(0, 600) + "\n\n" +
      'Answer with JSON only: {"reply": string, "action": {"type": "open", "view": page id} | {"type": "task", "id": employee id, "text": string} | {"type": "todo", "text": string} | {"type": "pending"} | null}';
    AI.json(prompt, { modelTier: "default" }).then(function (v) {
      K.busy = false;
      if (window.Z1AIUse) try { window.Z1AIUse.add(KARA, 1); } catch (err) { /* optional */ }
      var reply = String(v && v.reply || "").replace(/\s+/g, " ").trim().slice(0, 600), act = v && v.action, a = null;
      if (act && act.type === "open" && VIEWS[act.view]) a = { type: "open", view: act.view };
      else if (act && act.type === "task" && byId(act.id) && act.text) a = { type: "task", id: act.id, text: String(act.text).slice(0, 160) };
      else if (act && act.type === "todo" && act.text) a = { type: "todo", text: String(act.text).slice(0, 200) };
      else if (act && act.type === "pending") { K.out = pendingOut(); if (reply) K.out.text = reply + " " + K.out.text; paint(); speak(K.out.text); return; }
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
      K.out = { kind: "help", text: c === "rate_limited" ? "Give me a moment, then ask again." : c === "not_granted" ? "Claude is switched off for this page, so I can only do the built-in commands: what's pending, open a page, give a task, add a to-do." : "I couldn't think that through just now. The built-in commands still work." };
      paint();
    });
  }

  /* ---------- run ---------- */
  function run(cmd, voiced) {
    cmd = String(cmd || "").trim(); if (!cmd || K.busy) return;
    base = ""; K.plan = null; K.out = null;
    var a = parse(cmd);
    if (a && a.type === "pending") { loadGoogle(); K.out = pendingOut(); logIt(cmd, "Read out what's pending for " + whoName()); paint(); speak(K.out.text); return; }
    var pl = planFor(a, cmd);
    if (pl && pl.blocked) { K.out = { kind: "help", text: pl.blocked }; paint(); return; }
    if (pl && pl.auto && !voiced) { doPlan(pl); return; }
    if (pl) { K.plan = pl; K.out = { kind: "plan", text: "Here's what I'll do. Press Enter or Do it." }; var i = inp(); if (i) i.value = ""; paint(); return; }
    askClaude(cmd);
  }

  /* ---------- speaking (off by default) ---------- */
  function speak(text) {
    if (!K.speak || !text) return;
    if (T) { T.speak(String(text).slice(0, 1900)).catch(function (err) { if (err && err.code === "not_granted") T = null; }); return; }
    try { var u = new SpeechSynthesisUtterance(String(text).slice(0, 600)); u.lang = "en-US"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (err) { /* optional */ }
  }

  /* ---------- UI ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".z1k-btn{gap:6px}.z1k-btn kbd{font:600 10px var(--body);border:1px solid var(--line);border-radius:5px;padding:0 4px;color:var(--muted)}" +
    ".z1k-scrim{position:fixed;inset:0;z-index:150;background:var(--scrim);display:flex;justify-content:center;align-items:flex-start;padding:min(12vh,90px) 16px 16px}" +
    ".z1k{width:min(640px,100%);max-height:100%;overflow:auto;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 30px 80px -30px rgb(0 0 0 / .55);display:flex;flex-direction:column}" +
    ".z1k-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}" +
    ".z1k-hd form{flex:1;display:flex;gap:6px;min-width:0}.z1k-hd .inp{flex:1;font-size:15px;padding:9px 11px;min-width:0}" +
    ".z1k-mic{width:38px;flex:none;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);cursor:pointer;display:grid;place-items:center}" +
    ".z1k-mic svg{width:17px;height:17px}.z1k-mic.on{background:var(--bad);border-color:var(--bad);color:#fff}" +
    ".z1k-tabs{display:flex;gap:4px;padding:8px 14px 0}.z1k-bd{padding:12px 14px 14px;display:grid;gap:10px}" +
    ".z1k-say{font-size:14px;line-height:1.5}.z1k-say b{color:var(--brand)}" +
    ".z1k-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:9px 11px;cursor:pointer;font:inherit}" +
    ".z1k-row:hover{border-color:var(--gold)}.z1k-row .t{display:grid;gap:1px;min-width:0}.z1k-row small{color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".z1k-n{min-width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font:800 12px var(--display);background:var(--bad-soft);color:var(--bad);flex:none}" +
    ".z1k-plan{border:1px solid var(--gold);background:var(--gold-soft);border-radius:12px;padding:11px 12px;display:grid;gap:8px;font-size:13px}" +
    ".z1k-guard{font-size:12px;color:var(--muted)}.z1k-ex{display:flex;flex-wrap:wrap;gap:6px}" +
    ".z1k-ft{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}" +
    ".z1k-log{display:grid;gap:6px;font-size:12px}.z1k-log div{border-bottom:1px solid var(--line);padding-bottom:6px}.z1k-log small{color:var(--muted)}" +
    ".z1k-ev{display:flex;gap:8px;font-size:12.5px;padding:3px 0}.z1k-ev span{color:var(--muted);min-width:110px}" +
    "@media (max-width:760px){.z1k-btn kbd{display:none}.z1k-scrim{padding-top:16px}}";
  document.head.appendChild(css);

  var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>';
  var scrim = document.createElement("div");
  scrim.className = "z1k-scrim"; scrim.hidden = true;
  scrim.innerHTML = '<div class="z1k" role="dialog" aria-modal="true" aria-label="Ask Kara" id="z1k"></div>';
  document.body.appendChild(scrim);

  // The button sits in the top bar, before Board room / Call Kara.
  (function addButton() {
    var top = document.querySelector("#app .top"); if (!top || top.querySelector(".z1k-btn")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "btn pri z1k-btn"; b.setAttribute("data-z1k", "open");
    b.innerHTML = "Ask Kara <kbd>" + (/Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K") + "</kbd>";
    b.title = "Ask Kara: what's pending, open a page, or give someone a task";
    var sp = top.querySelector(".sp"); if (sp && sp.nextSibling) top.insertBefore(b, sp.nextSibling); else top.appendChild(b);
  })();

  var lastFocus = null;
  function open(prefill) {
    if (K.open) { var i0 = inp(); if (i0) i0.focus(); return; }
    lastFocus = document.activeElement; K.open = true; K.tab = "ask"; scrim.hidden = false;
    if (!K.out) { loadGoogle(); K.out = pendingOut(); K.out.kind = "pending"; K.out.text = greet() + " " + K.out.text; }
    paint();
    var i = inp(); if (i) { if (prefill) i.value = prefill; i.focus(); }
  }
  function close() {
    if (mine && D) { try { D.stop().catch(function () {}); } catch (err) { /* optional */ } }
    mine = false; listening = false; K.open = false; K.plan = null; K.out = null; scrim.hidden = true; base = ""; var i = inp(); if (i) i.value = "";
    try { if (T) T.stop(); else speechSynthesis.cancel(); } catch (err) { /* optional */ }
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (err) { /* optional */ }
  }
  function greet() { var hr = +new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }); return (hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening") + ", " + whoName() + "."; }

  function paintMic() {
    var b = document.querySelector("#z1k [data-z1k=mic]"); if (!b) return;
    b.classList.toggle("on", listening); b.setAttribute("aria-pressed", String(listening));
    b.setAttribute("aria-label", listening ? "Stop listening" : "Speak to Kara"); b.title = listening ? "Listening… press to stop, and Kara runs it" : "Speak to Kara";
  }
  function paint() {
    if (!K.open) return;
    var box = document.getElementById("z1k"), i = inp(), keep = i ? i.value : "";
    var k = kara(), hd = '<div class="z1k-hd">' + (k ? av(k, 30) : "") +
      '<form data-z1k="form" autocomplete="off"><input class="inp" id="z1kIn" placeholder="Ask Kara… “What\'s pending?”, “Open billing”, “Ask Maya to…”" aria-label="Ask Kara">' +
      (D ? '<button type="button" class="z1k-mic" data-z1k="mic">' + MIC + "</button>" : "") + '<button class="btn pri" type="submit">Go</button></form>' +
      '<button type="button" class="dots" data-z1k="close" aria-label="Close">✕</button></div>';
    var tabs = '<div class="z1k-tabs"><button class="chip" data-z1k="tab" data-v="ask" aria-pressed="' + (K.tab === "ask") + '">Kara</button><button class="chip" data-z1k="tab" data-v="log" aria-pressed="' + (K.tab === "log") + '">Log</button></div>';
    var bd = '<div class="z1k-bd">' + (K.tab === "log" ? logHtml() : askHtml()) + "</div>";
    var ft = '<div class="z1k-ft"><span>Kara never sends, posts or pays. Client-facing work waits in Approvals for Karla. Every action is logged.</span>' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-z1k="speak"' + (K.speak ? " checked" : "") + "> Read replies aloud</label></div>";
    box.innerHTML = hd + tabs + bd + ft;
    var ni = inp(); if (ni) { ni.value = keep; }
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
      if (o.P.ev.length) h1 += '<div class="card pad"><div class="secth">Today and tomorrow</div>' + o.P.ev.slice(0, 8).map(function (e) { return '<div class="z1k-ev"><span>' + (e.d === o.P.t0 ? "Today" : "Tomorrow") + (e.tm ? ", " + h(e.tm) : "") + "</span><b>" + h(e.t) + "</b>" + (e.g ? ' <small class="muted">Google</small>' : "") + "</div>"; }).join("") + "</div>";
    }
    if (!K.plan) h1 += '<div class="z1k-ex">' + ["What's pending?", "Open billing", "Ask Felix to follow up pending requirements", "Add to do: call Maxicare about SOA"].map(function (x) { return '<button class="chip" data-z1k="ex">' + h(x) + "</button>"; }).join("") + "</div>";
    if (!AI) h1 += '<p class="z1k-guard">Built-in commands only. Open Zero1Office on claude.ai and allow Claude for this page for anything else.</p>';
    return h1;
  }
  function logHtml() {
    var l = readLog();
    if (!l.length) return '<p class="muted small">Nothing yet. Everything Kara does for you shows here.</p>';
    return '<div class="z1k-log">' + l.slice(0, 60).map(function (x) {
      var t = new Date(x.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
      return "<div><b>" + h(x.did) + "</b><br><small>" + h(t) + " · " + h(x.by) + " asked: “" + h(x.cmd) + "”</small></div>";
    }).join("") + '</div><div class="actions"><button class="btn sm" data-z1k="clearlog">Clear the log</button></div>';
  }

  scrim.addEventListener("click", function (ev) {
    if (ev.target === scrim) { close(); return; }
    var b = ev.target.closest("[data-z1k]"); if (!b) return;
    var a = b.getAttribute("data-z1k");
    if (a === "close") close();
    else if (a === "tab") { K.tab = b.getAttribute("data-v"); paint(); }
    else if (a === "go") { var v = b.getAttribute("data-v"); logIt("What's pending → " + pageLabel(v), "Opened " + pageLabel(v) + " for " + whoName()); close(); go(v); }
    else if (a === "do") { if (K.plan) doPlan(K.plan); }
    else if (a === "cancel") { K.plan = null; K.out = { kind: "help", text: "Okay, nothing done." }; paint(); }
    else if (a === "ex") { var i = inp(); if (i) i.value = b.textContent; run(b.textContent); }
    else if (a === "clearlog") { ask("Clear Kara's log?", "This removes Kara's action history from this browser.", "Clear", function () { try { localStorage.removeItem(LOG_KEY); } catch (err) { /* optional */ } }); close(); }
    else if (a === "speak") { K.speak = b.checked; try { localStorage.setItem(SPEAK_KEY, K.speak ? "1" : "0"); } catch (err) { /* optional */ } if (!K.speak) try { if (T) T.stop(); else speechSynthesis.cancel(); } catch (err) { /* optional */ } }
    else if (a === "mic") {
      if (!D) return;
      if (listening) { D.stop().catch(function () { /* already stopped */ }); return; }
      var i2 = inp(); base = i2 ? i2.value.trim() : ""; mine = true; listening = true; paintMic();
      D.start().catch(function (err) {
        mine = false; listening = false; paintMic();
        var c = err && err.code;
        say(c === "not_granted" ? "Voice is off for this page. Type instead." : c === "no_gesture" ? "Press the microphone again." : "Voice isn't available right now. Type instead.");
      });
    }
  });
  scrim.addEventListener("submit", function (ev) { ev.preventDefault(); var i = inp(); if (K.plan && i && !i.value.trim()) { doPlan(K.plan); return; } run(i ? i.value : ""); });
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-z1k=open]"); if (b) open(); });
  document.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && (ev.key === "k" || ev.key === "K")) { if (document.querySelector(".z1-login:not([hidden])") && getComputedStyle(document.querySelector(".z1-login")).display !== "none") return; ev.preventDefault(); if (K.open) close(); else open(); return; }
    if (!K.open) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); return; }
    if (ev.key === "Enter" && K.plan && ev.target === inp() && !inp().value.trim()) { ev.preventDefault(); doPlan(K.plan); }
  }, true);

  window.Z1Kara = { open: open, run: function (c) { open(); run(c); }, pending: function () { return pending().counts; } };
})();
