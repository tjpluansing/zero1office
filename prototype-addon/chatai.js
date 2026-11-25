/* zero1office add-on: live AI replies in the chat box (Paolo, 2026-11-25: "Yes" to making the agents live).
   When the page can ask Claude (the sample capability), a message to an AI employee is answered by Claude in that
   employee's role, with the conversation so far and any text or PDF files given in the chat. If the message is real
   work, the employee also takes it as a task (the page's own giveTask). Team chats get answers from the 1-3 people it
   concerns. Without Claude (outside claude.ai), the page's original scripted replies run unchanged.
   The original chat code is not edited: the add-on handles the chat form before the page does, only when Claude is available. */
(function () {
  if (typeof renderChat !== "function" || window.__z1ChatAI) return;
  window.__z1ChatAI = true;
  var AI = null, busy = {}, lastErr = "";
  var cl = window.claude;
  if (cl && cl.use) cl.use("sample").then(function (s) { AI = s || null; }, function () { AI = null; });

  var css = document.createElement("style");
  css.textContent =
    ".msg.z1ai-typing{opacity:.75;font-style:italic}" +
    ".msg.z1ai-typing .z1ai-dots::after{content:'…';animation:z1aiDots 1.2s steps(4) infinite}" +
    "@keyframes z1aiDots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}" +
    "@media (prefers-reduced-motion:reduce){.msg.z1ai-typing .z1ai-dots::after{animation:none;content:'…'}}" +
    ".z1ai-live{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.02em;padding:1px 6px;border-radius:999px;background:#e5f6ec;color:#11713b;margin-left:6px;vertical-align:middle}";
  document.head.appendChild(css);

  var BUSINESS = [
    "You work for Ask Karla, a Philippine health insurance (HMO) agency run by Karla Luansing, the licensed agent.",
    "Ask Karla is a bridge: it submits applications, requirements and requests between clients and insurers (Maxicare, Medicard, Intellicare, IMS, KHL, FWD). Client personal data stays with the insurers.",
    "Paolo handles IT and lead generation and is the person messaging you. Only Karla approves proposals and anything client-facing (prices, advice, emails to clients).",
    "Volume is about 100+ items a month. Big pain points: proposals and provider matching, tracing SOA to payment to receipt to CWT (BIR 2307) to commission, Karla's receipts to Maxicare, and follow-up emails.",
    "A free financial wellness program is offered to all clients and prospects."
  ].join(" ");
  var RULES = [
    "Reply like a capable colleague in a work chat: plain, warm, short (1-4 sentences), first person, no headings, no markdown.",
    "Stay in your role. If something belongs to a teammate, say who and why.",
    "Never invent prices, premiums, benefits, policy terms, client details or numbers you weren't given. Say what you'd need instead.",
    "Don't claim you already sent anything to a client or insurer. Client-facing work goes to Karla for approval first.",
    "Never ask for or repeat client IDs, medical records or member lists. If a file looks like one, say it shouldn't be shared here.",
    "If the message asks for real work (drafting, checking, researching, following up, preparing something), set task to a short to-do (max 12 words) in the imperative. For greetings, questions you can answer now, or thanks, set task to null."
  ].join(" ");

  function esc2(s) { return String(s == null ? "" : s); }
  function persona(e) {
    return "You are " + e.n + ", " + e.r + " in the " + e.d + " team." + (e.desc ? " What you do: " + e.desc + "." : "") +
      (e.k ? " You're measured by: " + e.k + "." : "") + (e.now ? " Right now you're on: " + e.now + "." : " You have no task right now.") +
      (e.tasks && e.tasks.length ? " Your usual work: " + e.tasks.slice(0, 6).join("; ") + "." : "");
  }
  function transcript(arr, people) {
    return arr.slice(-14).map(function (m) {
      var who = m.f === "me" ? "Paolo" : m.w ? (people[m.w] || nameOf(m.w)) : "You";
      return who + ": " + esc2(m.x).slice(0, 1200);
    }).join("\n");
  }
  // Text from files given in this chat (text, CSV, JSON, Markdown and PDF), newest first, up to ~16k characters.
  var TEXTY = /\.(txt|csv|md|json|tsv|log)$/i, PDF = /\.pdf$/i, PDFLIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", pdfP = null;
  function pdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return pdfP || (pdfP = new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = PDFLIB; sc.async = true;
      sc.onload = function () { var g = window.pdfjsLib; if (!g) return no(new Error("pdf")); g.GlobalWorkerOptions.workerSrc = PDFLIB.replace("pdf.min.js", "pdf.worker.min.js"); ok(g); };
      sc.onerror = function () { pdfP = null; no(new Error("pdf")); };
      document.head.appendChild(sc);
    }));
  }
  function fileText(a) {
    if (!window.Z1Files || !window.Z1Files.blob) return Promise.resolve("");
    var docs = window.Z1Files.rows ? window.Z1Files.rows() : [];
    var full = docs.filter(function (d) { return d.id === a.id; })[0]; if (!full) return Promise.resolve("");
    if (TEXTY.test(a.name)) return window.Z1Files.blob(full).then(function (b) { return b.text(); }, function () { return ""; });
    if (PDF.test(a.name)) return Promise.all([pdfLib(), window.Z1Files.blob(full).then(function (b) { return b.arrayBuffer(); })]).then(function (x) {
      return x[0].getDocument({ data: x[1] }).promise.then(function (pdf) {
        var n = Math.min(pdf.numPages, 8), jobs = [];
        for (var i = 1; i <= n; i++) jobs.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { return tc.items.map(function (t) { return t.str; }).join(" "); }));
        return Promise.all(jobs).then(function (t) { return t.join("\n"); });
      });
    }).catch(function () { return ""; });
    return Promise.resolve("");
  }
  function filesContext(arr) {
    var atts = [];
    arr.forEach(function (m) { (m.za || []).forEach(function (a) { atts.push(a); }); });
    atts = atts.slice(-4).reverse();
    if (!atts.length) return Promise.resolve("");
    return Promise.all(atts.map(function (a) { return fileText(a).then(function (t) { return { a: a, t: String(t || "").replace(/\s+\n/g, "\n").trim() }; }); })).then(function (got) {
      var left = 16000, out = [];
      got.forEach(function (g) {
        if (!g.t) { out.push("File " + g.a.name + ": (contents can't be read here; only text, CSV and PDF files can be read)"); return; }
        var t = g.t.slice(0, Math.max(0, left)); left -= t.length;
        out.push("File " + g.a.name + ":\n" + t + (t.length < g.t.length ? "\n[cut]" : ""));
      });
      return "\n\nFiles Paolo gave in this chat:\n" + out.join("\n\n");
    });
  }

  function ask(key, e, tm, arr) {
    var people = {}; (tm ? tm.ppl : [e]).forEach(function (p) { people[p.id] = p.n; });
    return filesContext(arr).then(function (files) {
      var head = "Today is " + new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " (Manila).\n" + BUSINESS + "\n" + RULES + "\n\n";
      var prompt;
      if (e) {
        prompt = head + persona(e) + "\n\nThe chat so far (most recent last):\n" + transcript(arr, people) + files +
          '\n\nWrite your next reply to Paolo. Answer with JSON only: {"reply": string, "task": string or null}.';
      } else {
        prompt = head + "This is the " + tm.d + " team chat. Everyone sees it. The people:\n" +
          tm.ppl.map(function (p) { return "- id " + p.id + ": " + persona(p); }).join("\n") +
          "\n\nThe chat so far (most recent last):\n" + transcript(arr, people) + files +
          "\n\nChoose the 1 to 3 people this message concerns most (for a greeting, the team lead only) and write each one's short reply in their own voice. If it's real work, exactly one of them owns it." +
          '\nAnswer with JSON only: {"replies": [{"id": string, "reply": string}], "task": {"id": string, "text": string} or null}.';
      }
      return AI.json(prompt, { modelTier: "default" });
    });
  }

  function clean(s, max) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max || 900); }
  function after() { try { save(); } catch (err) { /* optional */ } try { render(); } catch (err) { /* optional */ } var c = document.getElementById("chatInput"); if (c) c.focus(); }

  function handle(key, e, tm, arr) {
    busy[key] = true; lastErr = ""; try { renderChat(); } catch (err) { /* optional */ }
    ask(key, e, tm, arr).then(function (v) {
      busy[key] = false;
      if (e) {
        var r = clean(v && v.reply); if (!r) throw { code: "empty" };
        arr.push({ f: "e", x: r, t: nowLabel(), zai: 1 });
        var t = v && typeof v.task === "string" ? clean(v.task, 140) : "";
        if (t) giveTask(e, t);
      } else {
        var ids = {}; tm.ppl.forEach(function (p) { ids[p.id] = p; });
        var reps = (v && Array.isArray(v.replies) ? v.replies : []).filter(function (x) { return x && ids[x.id] && clean(x.reply); }).slice(0, 3);
        if (!reps.length) throw { code: "empty" };
        reps.forEach(function (x) { arr.push({ f: "e", w: x.id, x: clean(x.reply), t: nowLabel(), zai: 1 }); });
        var tk = v && v.task && ids[v.task.id] && clean(v.task.text, 140);
        if (tk) giveTask(ids[v.task.id], tk);
      }
      after();
    }).catch(function (err) {
      busy[key] = false;
      var c = err && err.code;
      if (c === "not_granted") AI = null; // Paolo said no to Claude for this page: back to scripted replies
      var who = e ? e.n : "The team";
      arr.push({ f: "e", w: e ? undefined : tm.ppl[0].id, x: c === "rate_limited" ? "Give me a minute, lots of messages at once. Send that again shortly?" : c === "not_granted" ? "I can't think live without Claude switched on for this page. Allow it in the page's permissions to get real answers." : "Sorry, I couldn't answer just now. Please send that again.", t: nowLabel(), zai: 1 });
      lastErr = who + ": " + (c || (err && err.message) || "error");
      after();
    });
  }

  // Take the chat form first, only when Claude is available. Otherwise the page's own handler runs.
  document.addEventListener("submit", function (ev) {
    var f = ev.target; if (!f || f.getAttribute("data-form") !== "chat" || !AI) return;
    var ci = document.getElementById("chatInput"), msg = ci ? ci.value.trim() : "", key = S.chatWith;
    var e = byId(key), tm = !e && key ? chatTeam(key) : null;
    if (!msg || (!e && !tm)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (busy[key]) return;
    var d = S.data; d.chats = d.chats || {};
    var arr = d.chats[key] = d.chats[key] || [];
    arr.push({ f: "me", x: msg, t: nowLabel() });
    ci.value = "";
    busy[key] = true;
    try { save(); } catch (err) { /* optional */ } try { render(); } catch (err) { /* optional */ }
    setTimeout(function () { handle(key, e, tm, arr); }, 0); // after other add-ons tag the message (files, voice)
  }, true);

  // "typing…" while Claude answers, and a small Live label in the chat header.
  var orig = renderChat;
  renderChat = function () {
    var r = orig.apply(this, arguments);
    try {
      var c = document.getElementById("chat"); if (!c || c.hidden) return r;
      var hd = c.querySelector(".chathd b.small");
      if (AI && hd && !hd.querySelector(".z1ai-live")) { var lv = document.createElement("span"); lv.className = "z1ai-live"; lv.textContent = "Live"; lv.title = "Replies come from Claude"; hd.appendChild(lv); }
      var key = S.chatWith, box = document.getElementById("chatmsgs");
      if (busy[key] && box && !box.querySelector(".z1ai-typing")) {
        var e = byId(key), m = document.createElement("div"); m.className = "msg z1ai-typing";
        var sp = document.createElement("span"); sp.className = "z1ai-dots"; sp.textContent = (e ? e.n : "The team") + " is typing"; m.appendChild(sp);
        var empty = box.querySelector(".empty"); if (empty) empty.remove();
        box.appendChild(m); box.scrollTop = box.scrollHeight;
      }
    } catch (err) { /* keep chat working */ }
    return r;
  };
  window.Z1ChatAI = { on: function () { return !!AI; }, lastError: function () { return lastErr; } };
})();
