/* zero1office add-on: Settings > AI brain (Paolo, 2026-11-27: "I also want the option connect different AI's such as
   Chatgpt etc."). Picks which AI the office thinks with: Claude (Anthropic), ChatGPT (OpenAI) or Gemini (Google).
   - On app.ask-karla.com the choice is real: it is saved in the shared document meta/ai {provider, models} and the
     z1-ai server function (hosted/functions/z1-ai) calls that AI with its key from Supabase secrets. Keys never reach
     the browser or this page. Super Admins pick and test; everyone else sees which AI is in use.
   - On claude.ai the page can only use Claude (the sample capability through the viewer's Claude account), so the
     page says so and points to the hosted app for ChatGPT or Gemini.
   Ask Kara and the live chat replies (chatai.js) both use whatever is picked here. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || typeof NAV === "undefined" || window.__z1AiBrain) return;
  window.__z1AiBrain = true;

  (function () {
    var g = NAV.filter(function (x) { return x[0] === "Settings"; })[0];
    if (!g || g[1].some(function (it) { return it[0] === "aibrain"; })) return;
    var at = g[1].length; g[1].forEach(function (it, i) { if (it[0] === "accesses") at = i + 1; });
    g[1].splice(at, 0, ["aibrain", "AI brain"]);
  })();

  var P = [
    { id: "anthropic", n: "Claude", by: "Anthropic", def: "claude-sonnet-5-5", keyUrl: "https://console.anthropic.com/settings/keys", secret: "ANTHROPIC_API_KEY" },
    { id: "openai", n: "ChatGPT", by: "OpenAI", def: "gpt-5", keyUrl: "https://platform.openai.com/api-keys", secret: "OPENAI_API_KEY" },
    { id: "gemini", n: "Gemini", by: "Google", def: "gemini-2.5-pro", keyUrl: "https://aistudio.google.com/apikey", secret: "GEMINI_API_KEY" },
  ];
  var SECRETS_URL = "https://supabase.com/dashboard/project/oebtcmkejanxobwxohee/functions/secrets";
  var A = { loaded: false, busy: false, err: "", st: null, cfg: { provider: "", models: {} }, pick: "", models: {}, test: {}, saving: false };
  function host() { return window.Z1Host && window.Z1Host.ai ? window.Z1Host : null; }
  function isAdmin() { try { var m = window.Z1Auth && window.Z1Auth.me(); return !!m && m.role === "Super Admin"; } catch (err) { return false; } }
  function rer() { if (S.view === "aibrain") try { render(); } catch (err) { /* optional */ } }
  function name(id) { var p = P.filter(function (x) { return x.id === id; })[0]; return p ? p.n : id; }

  function load(fresh) {
    var H = host(); if (!H || A.busy) return;
    if (H.demo) { A.loaded = true; A.err = "The AI brain isn't available in the demo. Click LIVE and sign in."; rer(); return; }
    A.busy = true; A.err = ""; rer();
    var cl = window.claude;
    Promise.all([
      H.ai.status(fresh),
      cl.use("db").then(function (db) { return db ? db.doc("meta/ai").get().then(function (s) { return s.exists ? s.data() : null; }) : null; }),
    ]).then(function (r) {
      A.busy = false; A.loaded = true; A.st = r[0] || { providers: {} };
      A.cfg = r[1] || { provider: "", models: {} };
      A.pick = A.cfg.provider || (A.st && A.st.provider) || "";
      A.models = Object.assign({}, A.cfg.models || {});
      rer();
    }, function (e) {
      A.busy = false; A.loaded = true; A.err = (e && e.message) || "Couldn't reach the AI server function. Is z1-ai deployed?"; rer();
    });
  }

  function claudeAiPage() {
    var on = window.Z1ChatAI && window.Z1ChatAI.on && window.Z1ChatAI.on();
    return '<div class="card pad stack"><h3>Here on claude.ai, the AI is Claude</h3>' +
      '<p class="small">On claude.ai the AI employees and Ask Kara think with Claude, through your own Claude account. ' + (on ? "Claude is on for this page." : "Claude isn't switched on for this page yet; it asks the first time someone chats with an agent.") + "</p>" +
      '<p class="small">To use <b>ChatGPT</b> or <b>Gemini</b> instead, open the office on <b>app.ask-karla.com</b> and choose it under Settings &gt; AI brain there. Each AI needs its own API key, added once in Supabase.</p></div>';
  }
  function card(p) {
    var st = A.st && A.st.providers || {}, has = !!st[p.id], active = (A.st && A.st.provider) === p.id, picked = A.pick === p.id, t = A.test[p.id], adm = isAdmin();
    var badge = active ? '<span class="s s-ok">In use</span>' : has ? '<span class="s s-info">Connected</span>' : '<span class="s s-off">No key yet</span>';
    var h = '<div class="card pad stack" style="' + (picked ? "border-color:var(--gold);box-shadow:0 0 0 2px var(--gold-soft)" : "") + '">' +
      '<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><label style="display:flex;gap:8px;align-items:center;cursor:' + (adm && has ? "pointer" : "default") + '">' +
      '<input type="radio" name="z1aiP" data-zai="pick" value="' + p.id + '"' + (picked ? " checked" : "") + (adm && has ? "" : " disabled") + '> <span><b style="font-size:14px">' + p.n + '</b> <span class="muted small">by ' + p.by + "</span></span></label>" + badge + "</div>";
    if (has) {
      h += '<label class="fld">Model <input class="inp" data-zai="model" data-p="' + p.id + '" placeholder="' + esc(p.def) + ' (default)" value="' + esc(A.models[p.id] || "") + '"' + (adm ? "" : " disabled") + ' maxlength="80"></label>';
      if (adm) h += '<div class="actions"><button class="btn sm" data-zai="test" data-p="' + p.id + '"' + (t && t.busy ? " disabled" : "") + ">" + (t && t.busy ? "Testing…" : "Test") + "</button>" +
        (t && !t.busy ? '<span class="small" style="color:' + (t.ok ? "var(--ok)" : "var(--bad)") + '">' + esc(t.msg) + "</span>" : "") + "</div>";
    } else {
      h += '<p class="small muted">To connect ' + p.n + ': get an API key at <a href="' + p.keyUrl + '" target="_blank" rel="noopener">' + p.keyUrl.replace("https://", "") + "</a>, then add it in " +
        '<a href="' + SECRETS_URL + '" target="_blank" rel="noopener">Supabase &gt; Edge Functions &gt; Secrets</a> with the name <code>' + p.secret + "</code>. Then press Check again.</p>";
    }
    return h + "</div>";
  }
  VIEWS.aibrain = function () {
    var head = '<div class="ph"><div><h2>AI brain</h2><p>Choose which AI your AI employees and Ask Kara think with: Claude, ChatGPT or Gemini.</p></div>' +
      (host() && !host().demo ? '<button class="btn" data-zai="reload"' + (A.busy ? " disabled" : "") + ">" + (A.busy ? "Checking…" : "Check again") + "</button>" : "") + "</div>";
    if (!host()) return head + claudeAiPage();
    if (!A.loaded && !A.busy) setTimeout(function () { load(false); }, 0);
    if (A.err) return head + '<div class="card pad"><p class="small" style="color:var(--bad)">' + esc(A.err) + "</p></div>";
    if (!A.loaded) return head + '<div class="card pad empty">Checking which AIs are connected…</div>';
    var none = !P.some(function (p) { return A.st.providers && A.st.providers[p.id]; });
    var changed = A.pick !== (A.cfg.provider || (A.st && A.st.provider) || "") || JSON.stringify(A.models) !== JSON.stringify(A.cfg.models || {});
    return head +
      (none ? '<div class="card pad" style="margin-bottom:12px;border-color:var(--gold)"><b>No AI is connected yet.</b><p class="small">Until one is, Ask Kara uses her built-in commands and the AI employees use their scripted replies. Add one key below to switch the AI on.</p></div>' : "") +
      '<div class="mixgrid">' + P.map(card).join("") + "</div>" +
      (isAdmin() ? '<div class="actions" style="margin-bottom:12px"><button class="btn pri" data-zai="save"' + (!changed || A.saving || !A.pick ? " disabled" : "") + ">" + (A.saving ? "Saving…" : "Save") + "</button>" +
        (A.st && A.st.provider ? '<span class="small muted" style="align-self:center">In use now: <b>' + esc(name(A.st.provider)) + "</b> (" + esc(A.st.model || "") + ")</span>" : "") + "</div>"
        : '<p class="small muted" style="margin-bottom:12px">Only a Super Admin can change the AI brain.' + (A.st && A.st.provider ? " In use now: <b>" + esc(name(A.st.provider)) + "</b>." : "") + "</p>") +
      '<div class="card pad stack"><h3>What the AI sees</h3><p class="small">Your messages to the AI employees (with the chat so far and text from files you give them in chat), and for Ask Kara only counts, page names and the team\'s names and roles. ' +
      "Never give an AI employee client IDs, medical records or member lists. The Claude, ChatGPT and Gemini APIs don't train on what you send when you use a paid API key; use a paid key for Gemini, because Google's free tier may use it.</p>" +
      '<p class="small muted">Each answer costs a little on that AI\'s bill. App health shows this month\'s AI use.</p></div>';
  };

  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zai]"); if (!b || S.view !== "aibrain") return;
    var k = b.getAttribute("data-zai"), p = b.getAttribute("data-p");
    if (k === "reload") load(true);
    else if (k === "pick") { A.pick = b.value; rer(); }
    else if (k === "test" && p && isAdmin()) {
      var H = host(); if (!H) return;
      A.test[p] = { busy: true }; rer();
      var t0 = Date.now();
      H.ai.ask("Reply with exactly five words saying hello to the Ask Karla team.", { provider: p, model: (A.models[p] || "").trim() || undefined, modelTier: "quick" }).then(function (d) {
        A.test[p] = { ok: true, msg: "Works (" + ((Date.now() - t0) / 1000).toFixed(1) + " s, " + (d.model || "") + "): " + String(d.text || "").slice(0, 80) }; rer();
      }, function (e) { A.test[p] = { ok: false, msg: (e && e.message) || "That didn't work." }; rer(); });
    } else if (k === "save" && isAdmin() && A.pick) {
      A.saving = true; rer();
      var models = {}; Object.keys(A.models).forEach(function (x) { var v = String(A.models[x] || "").trim(); if (v) models[x] = v.slice(0, 80); });
      var doc = { provider: A.pick, models: models, at: new Date().toISOString() };
      window.claude.use("db").then(function (db) { if (!db) throw new Error("Saving needs the live app."); return db.doc("meta/ai").set(doc); }).then(function () {
        A.saving = false; A.cfg = doc; A.models = Object.assign({}, models);
        toast(name(A.pick) + " is now the AI brain. Reload the page to switch the chats over.");
        load(true);
      }, function (e) { A.saving = false; A.err = ""; toast((e && e.message) || "Couldn't save. Only a Super Admin can change this."); rer(); });
    }
  });
  document.addEventListener("input", function (ev) {
    var t = ev.target; if (!t || !t.getAttribute || t.getAttribute("data-zai") !== "model") return;
    A.models[t.getAttribute("data-p")] = t.value; var sv = document.querySelector('[data-zai="save"]'); if (sv) sv.disabled = false;
  });
  if (S.view === "aibrain") render();
})();
