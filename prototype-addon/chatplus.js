/* zero1office add-on: search in the chat box (Paolo, 2026-11-25).
   Adds a search field at the top of the chat panel's people list. Typing filters the people and teams by name,
   role or team, and finds conversations whose messages contain the words. Matching words are highlighted in the
   open conversation and it scrolls to the first match. The original renderChat is wrapped, never changed. */
(function () {
  if (typeof renderChat !== "function" || window.__z1ChatSearch) return;
  window.__z1ChatSearch = true;
  var Q = "";
  var css = document.createElement("style");
  css.textContent =
    ".z1cs{position:sticky;top:0;z-index:1;background:var(--surface);padding:2px 0 6px}" +
    ".z1cs input{width:100%;box-sizing:border-box;font-size:12.5px;padding:6px 26px 6px 8px}" +
    ".z1cs .z1cs-x{position:absolute;right:4px;top:4px;border:0;background:none;color:var(--muted);cursor:pointer;font-size:13px;padding:3px 6px;border-radius:6px}" +
    ".z1cs .z1cs-x:hover{background:var(--sunken)}" +
    ".z1cs-none{font-size:11.5px;color:var(--muted);padding:6px 4px}" +
    ".chatp .z1cs-hit{color:var(--ink)}" +
    "#chatmsgs mark.z1cs-m{background:#ffe38a;color:#1a1a1a;border-radius:3px;padding:0 1px}" +
    "@media (max-width:760px){.z1cs{position:static;flex:none;width:160px;padding:2px 0}}";
  document.head.appendChild(css);

  function norm(s) { return String(s || "").toLowerCase(); }
  function info(key) {
    var e = typeof byId === "function" ? byId(key) : null, t = !e && typeof chatTeam === "function" ? chatTeam(key || "") : null;
    var label = e ? [e.n, e.r, e.d].join(" ") : t ? t.d + " team " + t.ppl.map(function (x) { return x.n; }).join(" ") : "";
    var msgs = (S.data && S.data.chats && S.data.chats[key]) || [];
    return { label: label, msgs: msgs };
  }
  function hitMsg(msgs, q) {
    for (var i = msgs.length - 1; i >= 0; i--) if (norm(msgs[i].x).indexOf(q) > -1) return msgs[i].x;
    return "";
  }
  function snippet(text, q) {
    var i = norm(text).indexOf(q), a = Math.max(0, i - 24);
    return (a > 0 ? "…" : "") + text.slice(a, i + q.length + 40) + (i + q.length + 40 < text.length ? "…" : "");
  }
  function apply() {
    var c = document.getElementById("chat"); if (!c || c.hidden) return;
    var list = c.querySelector(".chatlist"); if (!list) return;
    var q = norm(Q).trim(), shown = 0;
    list.querySelectorAll(".chatp").forEach(function (b) {
      var key = b.getAttribute("data-id"), d = info(key), sm = b.querySelector("small");
      if (sm && !sm.hasAttribute("data-z1cs")) sm.setAttribute("data-z1cs", sm.textContent);
      if (!q) { b.hidden = false; if (sm) { sm.textContent = sm.getAttribute("data-z1cs"); sm.classList.remove("z1cs-hit"); } shown++; return; }
      var byName = norm(d.label).indexOf(q) > -1, m = hitMsg(d.msgs, q);
      b.hidden = !(byName || m);
      if (sm) {
        if (m) { sm.textContent = snippet(m, q); sm.classList.add("z1cs-hit"); }
        else { sm.textContent = sm.getAttribute("data-z1cs"); sm.classList.remove("z1cs-hit"); }
      }
      if (!b.hidden) shown++;
    });
    var none = list.querySelector(".z1cs-none");
    if (q && !shown) { if (!none) { none = document.createElement("div"); none.className = "z1cs-none"; list.appendChild(none); } none.textContent = "No one or no message matches “" + Q.trim() + "”."; }
    else if (none) none.remove();
    var x = list.querySelector(".z1cs-x"); if (x) x.hidden = !Q;
    mark(q);
  }
  // Highlight matches in the open conversation (text nodes only, so nothing from the messages becomes markup).
  function mark(q) {
    var box = document.getElementById("chatmsgs"); if (!box) return;
    box.querySelectorAll("mark.z1cs-m").forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
    box.normalize();
    if (!q) return;
    var first = null;
    box.querySelectorAll(".msg").forEach(function (msg) {
      var w = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT, null), nodes = [], n;
      while ((n = w.nextNode())) { if (n.parentNode && n.parentNode.tagName !== "SMALL" && n.parentNode.tagName !== "B") nodes.push(n); }
      nodes.forEach(function (t) {
        var s = t.nodeValue, low = norm(s), i = low.indexOf(q); if (i < 0) return;
        var frag = document.createDocumentFragment(), at = 0;
        while (i > -1) {
          frag.appendChild(document.createTextNode(s.slice(at, i)));
          var mk = document.createElement("mark"); mk.className = "z1cs-m"; mk.textContent = s.slice(i, i + q.length); frag.appendChild(mk);
          if (!first) first = mk;
          at = i + q.length; i = low.indexOf(q, at);
        }
        frag.appendChild(document.createTextNode(s.slice(at)));
        t.parentNode.replaceChild(frag, t);
      });
    });
    if (first) { try { first.scrollIntoView({ block: "center" }); } catch (err) { /* older browsers */ } }
  }
  function inject() {
    var c = document.getElementById("chat"); if (!c || c.hidden) return;
    var list = c.querySelector(".chatlist"); if (!list || list.querySelector(".z1cs")) return;
    var w = document.createElement("div"); w.className = "z1cs"; w.setAttribute("role", "search");
    var inp = document.createElement("input"); inp.className = "inp"; inp.id = "z1ChatSearch"; inp.type = "search";
    inp.placeholder = "Search chats"; inp.setAttribute("aria-label", "Search chats"); inp.autocomplete = "off"; inp.maxLength = 80; inp.value = Q;
    var x = document.createElement("button"); x.type = "button"; x.className = "z1cs-x"; x.setAttribute("aria-label", "Clear search"); x.textContent = "✕"; x.hidden = !Q;
    w.appendChild(inp); w.appendChild(x); list.insertBefore(w, list.firstChild);
    apply();
  }
  var orig = renderChat;
  renderChat = function () { var r = orig.apply(this, arguments); try { inject(); } catch (err) { /* keep chat working */ } return r; };
  // Events stay inside the search box so the page's own chat handlers never see them.
  document.addEventListener("input", function (ev) { if (ev.target && ev.target.id === "z1ChatSearch") { Q = ev.target.value; apply(); } }, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.target && ev.target.id === "z1ChatSearch") {
      ev.stopPropagation();
      if (ev.key === "Escape" && Q) { ev.preventDefault(); Q = ""; ev.target.value = ""; apply(); }
      if (ev.key === "Enter") { ev.preventDefault(); var b = document.querySelector("#chat .chatp:not([hidden])"); if (b) b.click(); }
    }
  }, true);
  document.addEventListener("click", function (ev) {
    var x = ev.target && ev.target.closest && ev.target.closest(".z1cs-x");
    if (x) { ev.stopPropagation(); ev.preventDefault(); Q = ""; var i = document.getElementById("z1ChatSearch"); if (i) { i.value = ""; i.focus(); } apply(); }
  }, true);
  try { renderChat(); } catch (err) { /* chat closed */ }
})();

/* zero1office add-on: files and voice messages in the chat box (Paolo, 2026-11-25).
   Files: the paperclip uploads to Settings > Files, folder "Chat files", and sends the AI employee a message
   with the file attached; the message has an Open button. Voice: the microphone uses the page's dictation, so what
   you say is written into the message box; you can fix it, then Send. It's marked as a voice message.
   Nothing in the original chat code changes: the add-on fills the message box and submits the page's own form. */
(function () {
  if (typeof renderChat !== "function" || window.__z1ChatPlus) return;
  window.__z1ChatPlus = true;
  var D = null, listening = false, base = "", voiced = false, pending = null;
  var css = document.createElement("style");
  css.textContent =
    ".chatform .z1c-b{flex:none;width:34px;height:34px;padding:0;display:inline-grid;place-items:center;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px;cursor:pointer}" +
    ".chatform .z1c-b:hover{background:var(--sunken)}.chatform .z1c-b svg{width:17px;height:17px}" +
    ".chatform .z1c-b.on{background:#d93838;border-color:#d93838;color:#fff;animation:z1cPulse 1.2s infinite}" +
    "@keyframes z1cPulse{50%{opacity:.65}}" +
    "@media (prefers-reduced-motion:reduce){.chatform .z1c-b.on{animation:none}}" +
    ".msg .z1c-att{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}" +
    ".msg .z1c-att button{font-size:11.5px;padding:2px 8px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}" +
    ".msg .z1c-tag{display:block;font-size:10.5px;opacity:.8;margin-bottom:2px}" +
    ".z1c-note{font-size:11px;color:var(--muted);padding:0 10px 6px}";
  document.head.appendChild(css);
  var CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.5 3.5 0 015 5l-8.6 8.6a2 2 0 01-2.8-2.8l7.9-7.9"/></svg>';
  var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>';
  function say(m) { try { toast(m); } catch (err) { /* optional */ } }

  // The dictation helper, if this view offers it (Chrome-based browsers and the Claude desktop app).
  var cl = window.claude;
  if (cl && cl.use) cl.use("dictation").then(function (d) {
    D = d; if (!D) return;
    D.onPartial(function (p) { var i = document.getElementById("chatInput"); if (i && listening) i.value = (base ? base + " " : "") + (p && p.text || ""); });
    D.onFinal(function (p) { var t = p && p.text ? String(p.text).trim() : ""; if (t) { base = (base ? base + " " : "") + t; voiced = true; } var i = document.getElementById("chatInput"); if (i) i.value = base; });
    D.onState(function (s) { listening = s && s.state === "listening"; paintMic(); if (!listening) { var i = document.getElementById("chatInput"); if (i) { i.value = base; i.focus(); } } });
    try { renderChat(); } catch (err) { /* chat closed */ }
  }, function () { /* no dictation here */ });

  function paintMic() {
    var b = document.querySelector(".chatform [data-zc=mic]"); if (!b) return;
    b.classList.toggle("on", listening); b.setAttribute("aria-pressed", String(listening));
    b.setAttribute("aria-label", listening ? "Stop the voice message" : "Record a voice message"); b.title = listening ? "Listening… press to stop" : "Voice message: speak and it's written into the message";
  }
  function decorate() {
    var c = document.getElementById("chat"); if (!c || c.hidden) return;
    var f = c.querySelector("form.chatform");
    if (f && !f.querySelector("[data-zc]")) {
      var send = f.querySelector("button[type=submit]");
      var clip = document.createElement("button"); clip.type = "button"; clip.className = "z1c-b"; clip.setAttribute("data-zc", "clip");
      clip.setAttribute("aria-label", "Give a file"); clip.title = "Give a file (no client IDs, medical records or member lists)"; clip.innerHTML = CLIP;
      var pick = document.createElement("input"); pick.type = "file"; pick.multiple = true; pick.hidden = true; pick.id = "z1ChatFile";
      f.insertBefore(clip, send); f.insertBefore(pick, send);
      if (D) { var mic = document.createElement("button"); mic.type = "button"; mic.className = "z1c-b"; mic.setAttribute("data-zc", "mic"); mic.innerHTML = MIC; f.insertBefore(mic, send); paintMic(); }
      if (listening || voiced) { var i = document.getElementById("chatInput"); if (i && !i.value) i.value = base; }
    }
    // Attachments and voice tags on the messages, matched by position.
    var key = S.chatWith, msgs = (S.data && S.data.chats && S.data.chats[key]) || [], els = c.querySelectorAll("#chatmsgs .msg");
    if (els.length !== msgs.length) return;
    msgs.forEach(function (m, n) {
      var el = els[n];
      if (m.zv && !el.querySelector(".z1c-tag")) { var tg = document.createElement("span"); tg.className = "z1c-tag"; tg.textContent = "🎤 Voice message"; el.insertBefore(tg, el.firstChild); }
      if (m.za && m.za.length && !el.querySelector(".z1c-att")) {
        var box = document.createElement("div"); box.className = "z1c-att";
        m.za.forEach(function (a) { var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-zc", "open"); b.setAttribute("data-v", a.id); b.textContent = "Open " + a.name; box.appendChild(b); });
        var sm = el.querySelector("small"); el.insertBefore(box, sm || null);
      }
    });
  }
  var orig = renderChat;
  renderChat = function () { var r = orig.apply(this, arguments); try { decorate(); } catch (err) { /* keep chat working */ } return r; };

  // Send through the page's own chat form, then tag the message it just added.
  function sendVia(text, tag) {
    var f = document.querySelector("#chat form.chatform"), i = document.getElementById("chatInput"); if (!f || !i) return;
    var key = S.chatWith, before = ((S.data.chats || {})[key] || []).length;
    i.value = text; pending = { key: key, before: before, tag: tag };
    if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    var arr = (S.data.chats || {})[key] || [], m = arr[before];
    if (m && m.f === "me") { for (var k in tag) m[k] = tag[k]; try { save(); } catch (err) { /* optional */ } try { renderChat(); } catch (err) { /* optional */ } }
    pending = null;
  }
  function giveFiles(list) {
    if (!list || !list.length) return;
    var key = S.chatWith, who = (typeof byId === "function" && byId(key)) ? byId(key).n : (typeof chatTeam === "function" && chatTeam(key || "")) ? "the " + chatTeam(key).d + " team" : "";
    if (!who) return;
    if (!window.Z1Files || !window.Z1Files.upload || !window.Z1Files.ready()) { say("Giving files works when Zero1Office is opened on claude.ai by its owner or an editor"); return; }
    var i = document.getElementById("chatInput"), typed = i ? i.value.trim() : "", folder = window.Z1Files.chatFolder(), got = [], left = list.length;
    say("Uploading " + (list.length === 1 ? list[0].name : list.length + " files") + "…");
    function fin() {
      if (--left > 0) return;
      if (!got.length) return;
      if (S.chatWith !== key) { S.chatWith = key; try { render(); } catch (err) { /* optional */ } }
      var names = got.map(function (g) { return g.name; });
      var text = "📎 " + (names.length === 1 ? "Here's a file for you: " + names[0] : "Here are " + names.length + " files for you: " + names.join(", ")) + (typed ? ". " + typed : "");
      sendVia(text, { za: got, zv: voiced && !!typed });
      voiced = false; base = "";
    }
    Array.prototype.forEach.call(list, function (file) {
      window.Z1Files.upload([file], { folder: folder, note: "Given to " + who + " in chat", done: function (row) { got.push({ id: row.id, name: row.name }); fin(); }, failed: function (m) { say(file.name + ": " + m); fin(); } });
    });
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zc]"); if (!b || !b.closest("#chat")) return;
    var a = b.getAttribute("data-zc");
    if (a === "clip") { ev.preventDefault(); ev.stopPropagation(); var p = document.getElementById("z1ChatFile"); if (p) p.click(); }
    else if (a === "open") { ev.preventDefault(); ev.stopPropagation(); if (window.Z1Files && window.Z1Files.view) window.Z1Files.view(b.getAttribute("data-v")); }
    else if (a === "mic") {
      ev.preventDefault(); ev.stopPropagation(); if (!D) return;
      if (listening) { D.stop().catch(function () { /* already stopped */ }); return; }
      var i = document.getElementById("chatInput"); base = i ? i.value.trim() : "";
      D.start().then(function () { listening = true; paintMic(); }, function (err) {
        listening = false; paintMic();
        var c = err && err.code;
        say(c === "not_granted" ? "The microphone is off for this page. You can still type." : c === "dismissed" ? "Voice message cancelled" : "Voice messages aren't available right now. You can still type.");
      });
    }
  }, true);
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.id === "z1ChatFile") { var files = Array.prototype.slice.call(ev.target.files || []); ev.target.value = ""; giveFiles(files); }
  }, true);
  // Mark a dictated message as a voice message when it's sent with the page's Send button.
  document.addEventListener("submit", function (ev) {
    var f = ev.target; if (!f || f.getAttribute("data-form") !== "chat" || pending) return;
    if (listening && D) { try { D.stop(); } catch (err) { /* optional */ } listening = false; }
    var i = document.getElementById("chatInput"); if (!voiced || !i || !i.value.trim()) return;
    var key = S.chatWith, before = ((S.data.chats || {})[key] || []).length;
    voiced = false; base = "";
    setTimeout(function () { var m = ((S.data.chats || {})[key] || [])[before]; if (m && m.f === "me") { m.zv = true; try { save(); } catch (err) { /* optional */ } try { renderChat(); } catch (err) { /* optional */ } } }, 0);
  }, true);
  // Typing by hand after dictating keeps the voice tag; clearing the box drops it.
  document.addEventListener("input", function (ev) { if (ev.target && ev.target.id === "chatInput" && !listening) { base = ev.target.value; if (!base.trim()) voiced = false; } }, true);
  try { renderChat(); } catch (err) { /* chat closed */ }
})();
