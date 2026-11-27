/* Zero1Office on app.ask-karla.com (2026-11-27, Paolo: "I'll be uploading this to my domain ask-karla.com ...
   and want to login using ask-karla.com email address").
   The app was written for claude.ai, where window.claude.use() gives it shared storage, files and connectors.
   This file gives it the same things from the office's own Supabase project, so the app's code stays the same:
   - sign-in (Microsoft or email and password) before the app starts; only people in Settings > Users get in
   - claude.use("db")     -> table app_docs (documents by path, live updates)
   - claude.use("assets") -> private storage bucket "files", served at /_blob/<id> by sw.js
   - each page's saved records (browser storage keys starting zero1office / z1) are shared through app_docs
     ls/<key>/..., so everyone sees the same SOAs, renewals, lists and HR records
   - mcp, sample (AI) and dictation are not here yet (phases 2 and 3): use() resolves null and the app says so.
   The app's own <script> tags are turned off by build.sh (type="text/z1-app") and run here once ready. */
(function () {
  "use strict";
  var CFG = window.Z1_CONFIG || {};
  var PERSONAL = ["zero1office-auth:v1", "zero1office:navFolded:v1", "z1pg-via"];
  var SEG_OK = /^[A-Za-z0-9:.-]+$/;
  var H = window.Z1Host = { ready: false, email: "", provider: "", sb: null };
  var nativeSet = Storage.prototype.setItem, nativeRemove = Storage.prototype.removeItem;

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  /* last few things that happened during opening, shown on the "taking too long" screen */
  var DIAG = [], T0 = Date.now();
  function diag(m) { DIAG.push(((Date.now() - T0) / 1000).toFixed(1) + "s " + String(m).replace(/^GoTrueClient@\d+ \([\d.]+\) \S+ /, "").slice(0, 160)); if (DIAG.length > 40) DIAG.splice(5, 1); }
  window.addEventListener("error", function (e) { diag("error: " + (e.message || (e.target && (e.target.src || e.target.href)) || "?")); }, true);
  window.addEventListener("unhandledrejection", function (e) { diag("rejected: " + ((e.reason && e.reason.message) || e.reason)); });
  function escH(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function enc(seg) { return SEG_OK.test(seg) ? seg : String(seg).replace(/[^A-Za-z0-9:.-]/g, function (c) { return "_" + c.charCodeAt(0).toString(16) + "_"; }); }
  function dec(seg) { return String(seg).replace(/_([0-9a-f]{1,4})_/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  function hex32() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function synced(k) { return /^(zero1office|z1)/.test(k) && PERSONAL.indexOf(k) < 0; }

  /* ---------- screen shown before the app (sign-in, messages) ---------- */
  var CSS = "#z1h{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:#F4F6F9;font:14px Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#1F2937}" +
    "@media (prefers-color-scheme:dark){#z1h{background:#0B1220;color:#E8EDF5}#z1h .c{background:#111A2C;border-color:#24324B}#z1h input{background:#172238;color:#E8EDF5;border-color:#24324B}}" +
    "#z1h .c{width:min(400px,100%);background:#fff;border:1px solid #E1E6EE;border-radius:16px;padding:26px 24px;display:grid;gap:14px;box-shadow:0 18px 50px -24px rgb(0 44 108/.35)}" +
    "#z1h h2{margin:0;font:800 20px Montserrat,system-ui,sans-serif;color:#002C6C}#z1h p{margin:0;color:#5F6B7E;font-size:13px}" +
    "#z1h .lg{display:flex;align-items:center;gap:8px}#z1h .mk{width:34px;height:34px;border-radius:10px;background:#002C6C;color:#fff;display:grid;place-items:center;font:800 15px Montserrat,sans-serif}#z1h .mk b{color:#D3A13B}" +
    "#z1h form{display:grid;gap:12px}#z1h label{display:grid;gap:5px;font-size:12px;font-weight:600}#z1h input{font:13px inherit;padding:9px 10px;border:1px solid #E1E6EE;border-radius:8px}" +
    "#z1h button{font:600 13px inherit;border-radius:9px;padding:10px 12px;border:1px solid #E1E6EE;background:#fff;color:#1F2937;cursor:pointer;display:flex;gap:8px;align-items:center;justify-content:center}" +
    "#z1h button.pri{background:#002C6C;border-color:#002C6C;color:#fff}#z1h button:disabled{opacity:.6}#z1h .err{color:#C93A3A;font-size:12px;min-height:1em}" +
    "#z1h .or{display:flex;align-items:center;gap:10px;color:#97A4BA;font-size:12px}#z1h .or:before,#z1h .or:after{content:'';flex:1;height:1px;background:#E1E6EE}";
  function screen(html) {
    var w = $("z1h");
    if (!w) { var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); w = document.createElement("div"); w.id = "z1h"; document.body.appendChild(w); }
    w.innerHTML = '<div class="c"><div class="lg"><div class="mk">0<b>1</b></div><b style="font:800 16px Montserrat,sans-serif;color:#002C6C">zero1office</b></div>' + html + "</div>";
    w.hidden = false;
    return w;
  }
  function hideScreen() { var w = $("z1h"); if (w) w.hidden = true; }
  var MS = '<svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true"><rect width="10" height="10" fill="#F25022"/><rect x="11" width="10" height="10" fill="#7FBA00"/><rect y="11" width="10" height="10" fill="#00A4EF"/><rect x="11" y="11" width="10" height="10" fill="#FFB900"/></svg>';
  function loginScreen(msg) {
    stepDone();
    screen('<div><h2>Sign in</h2><p>Use your @ask-karla.com account.</p></div>' +
      '<button type="button" id="z1hMs">' + MS + " Sign in with Microsoft</button><div class=\"or\">or</div>" +
      '<form id="z1hForm" novalidate><label for="z1hE">Email<input id="z1hE" type="email" autocomplete="username" placeholder="you@ask-karla.com"></label>' +
      '<label for="z1hP">Password<input id="z1hP" type="password" autocomplete="current-password"></label>' +
      '<span class="err" id="z1hErr" role="alert">' + escH(msg || "") + '</span><button class="pri" type="submit" id="z1hGo">Sign in</button></form>' +
      "<p>Forgot your password or need an account? Ask Paolo or Karla.</p>");
    $("z1hMs").onclick = function () {
      H.sb.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: location.origin + location.pathname } })
        .then(function (r) { if (r.error) $("z1hErr").textContent = r.error.message; });
    };
    $("z1hForm").onsubmit = function (ev) {
      ev.preventDefault();
      var em = $("z1hE").value.trim().toLowerCase(), pw = $("z1hP").value, err = $("z1hErr");
      if (!/^[^@\s]+@ask-karla\.com$/.test(em)) { err.textContent = "Use your @ask-karla.com email."; return; }
      $("z1hGo").disabled = true; err.textContent = "";
      H.sb.auth.signInWithPassword({ email: em, password: pw }).then(function (r) {
        $("z1hGo").disabled = false;
        if (r.error) { err.textContent = /invalid/i.test(r.error.message) ? "Wrong email or password." : /banned/i.test(r.error.message) ? "This account is paused. Ask Paolo or Karla." : r.error.message; return; }
        start(r.data.session);
      });
    };
    setTimeout(function () { var e = $("z1hE"); if (e) e.focus(); }, 0);
  }

  /* ---------- db: documents in app_docs ---------- */
  var listeners = []; // {kind:"doc"|"coll", path, fire}
  function snapDoc(path, row) {
    var data = row ? clone(row.data) : undefined;
    return { id: path.split("/").pop(), exists: !!row, data: function () { return clone(data); }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function fetchDoc(path) { return H.sb.from("app_docs").select("path,data").eq("path", path).maybeSingle().then(function (r) { if (r.error) throw dbErr(r.error); return r.data; }); }
  function fetchColl(path) { return H.sb.from("app_docs").select("path,data").eq("parent", path).then(function (r) { if (r.error) throw dbErr(r.error); return r.data || []; }); }
  function dbErr(e) { return { code: /permission|security|42501/i.test((e && (e.message + e.code)) || "") ? "invalid_argument" : "unavailable", message: (e && e.message) || "Database error" }; }
  function notify(path) {
    var parent = path.replace(/\/[^/]+$/, "");
    listeners.forEach(function (l) { if ((l.kind === "doc" && l.path === path) || (l.kind === "coll" && l.path === parent)) l.fire(); });
  }
  function debounce(fn, ms) { var t = null; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function docRef(path) {
    return {
      id: path.split("/").pop(), path: path,
      get: function () { return fetchDoc(path).then(function (row) { return snapDoc(path, row); }); },
      set: function (d) { return H.sb.from("app_docs").upsert({ path: path, data: clone(d) }).then(function (r) { if (r.error) throw dbErr(r.error); notify(path); }); },
      update: function (d) {
        return fetchDoc(path).then(function (row) {
          if (!row) throw { code: "invalid_argument", message: "No such document" };
          var m = Object.assign({}, row.data, clone(d));
          return H.sb.from("app_docs").update({ data: m }).eq("path", path).then(function (r) { if (r.error) throw dbErr(r.error); notify(path); });
        });
      },
      delete: function () { return H.sb.from("app_docs").delete().eq("path", path).then(function (r) { if (r.error) throw dbErr(r.error); notify(path); }); },
      onSnapshot: function (next, error) {
        var on = true, l = { kind: "doc", path: path, fire: debounce(function () { if (on) fetchDoc(path).then(function (row) { if (on) next(snapDoc(path, row)); }, function (e) { if (error) error(e); }); }, 150) };
        listeners.push(l); l.fire();
        return function () { on = false; listeners = listeners.filter(function (x) { return x !== l; }); };
      },
      collection: function (sub) { return collRef(path + "/" + sub); },
      acquire: function () { return Promise.resolve({ acquired: true }); },
    };
  }
  function query(path, ops) {
    function run(rows) {
      var docs = rows.map(function (r) { return snapDoc(r.path, r); });
      ops.forEach(function (o) {
        if (o[0] === "where") docs = docs.filter(function (d) { var v = (d.data() || {})[o[1]]; return o[2] === "==" ? v === o[3] : o[2] === "!=" ? v !== o[3] : o[2] === ">" ? v > o[3] : o[2] === "<" ? v < o[3] : o[2] === ">=" ? v >= o[3] : o[2] === "<=" ? v <= o[3] : o[2] === "in" ? (o[3] || []).indexOf(v) > -1 : o[2] === "array-contains" ? (v || []).indexOf(o[3]) > -1 : true; });
        if (o[0] === "orderBy") docs.sort(function (a, b) { var x = (a.data() || {})[o[1]], y = (b.data() || {})[o[1]]; return (x > y ? 1 : x < y ? -1 : 0) * (o[2] === "desc" ? -1 : 1); });
        if (o[0] === "limit") docs = docs.slice(0, o[1]);
      });
      return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return docs.map(function (d, i) { return { type: "added", doc: d, oldIndex: -1, newIndex: i }; }); }, metadata: { fromCache: false, hasPendingWrites: false } };
    }
    var q = {
      where: function (f, op, v) { return query(path, ops.concat([["where", f, op, v]])); },
      orderBy: function (f, dir) { return query(path, ops.concat([["orderBy", f, dir]])); },
      limit: function (n) { return query(path, ops.concat([["limit", n]])); },
      get: function () { return fetchColl(path).then(run); },
      onSnapshot: function (next, error) {
        var on = true, l = { kind: "coll", path: path, fire: debounce(function () { if (on) fetchColl(path).then(function (rows) { if (on) next(run(rows)); }, function (e) { if (error) error(e); }); }, 150) };
        listeners.push(l); l.fire();
        return function () { on = false; listeners = listeners.filter(function (x) { return x !== l; }); };
      },
    };
    return q;
  }
  function collRef(path) {
    var c = query(path, []);
    c.path = path;
    c.doc = function (id) { return docRef(path + "/" + (id || hex32())); };
    c.add = function (d) { var ref = docRef(path + "/" + hex32()); return ref.set(d).then(function () { return ref; }); };
    return c;
  }
  var DB = Object.freeze({ doc: docRef, collection: collRef });

  /* ---------- assets: private bucket "files", read back at /_blob/<id> through sw.js ---------- */
  var ASSETS = Object.freeze({
    upload: function (blob, opts) {
      var id = hex32(), type = (opts && opts.type) || blob.type || "application/octet-stream";
      if (blob.size > 20 * 1024 * 1024) return Promise.reject({ code: "too_large", message: "Over 20 MB" });
      return H.sb.storage.from("files").upload(id, blob, { contentType: type, upsert: false }).then(function (r) {
        if (r.error) throw { code: /size|large/i.test(r.error.message) ? "too_large" : "unavailable", message: r.error.message };
        return { id: id, url: "/_blob/" + id, sizeBytes: blob.size, contentType: type };
      });
    },
    list: function () {
      return H.sb.storage.from("files").list("", { limit: 1000 }).then(function (r) {
        if (r.error) throw { code: "unavailable", message: r.error.message };
        var used = 0, list = (r.data || []).map(function (o) { var m = o.metadata || {}; used += m.size || 0; return { id: o.name, url: "/_blob/" + o.name, sizeBytes: m.size || 0, contentType: m.mimetype || "" }; });
        return { assets: list, usage: { bytes: used } };
      });
    },
    delete: function (id) { return H.sb.storage.from("files").remove([id]).then(function (r) { if (r.error) throw { code: "unavailable", message: r.error.message }; }); },
  });

  /* ---------- downloads: plain browser download ---------- */
  var DOWNLOADS = Object.freeze({
    save: function (o) {
      var b = o.data instanceof Blob ? o.data : new Blob([o.data], { type: o.type || "application/octet-stream" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = o.filename || "download"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return Promise.resolve({ saved: true });
    },
  });
  var PERMS = Object.freeze({ state: function () { return Promise.resolve("denied"); }, request: function () { return Promise.resolve({}); }, manage: function () { return Promise.reject({ code: "unavailable" }); } });

  window.claude = Object.freeze({
    use: function (name) {
      return new Promise(function (res) {
        var go = function () { res(name === "db" ? DB : name === "assets" ? ASSETS : name === "downloads" ? DOWNLOADS : name === "permissions" ? PERMS : null); };
        if (H.ready) setTimeout(go, 0); else (H.waiting = H.waiting || []).push(go);
      });
    },
  });

  /* ---------- shared page records: browser storage <-> app_docs ls/<key>/... ---------- */
  var last = {}; // key -> {part: json string} as last synced
  function split(str) {
    var parts = {}, v;
    try { v = JSON.parse(str); } catch (e) { parts._raw = JSON.stringify(str); return parts; }
    if (!isObj(v)) { parts._raw = JSON.stringify(str); return parts; }
    Object.keys(v).forEach(function (f) {
      if (f === "data" && isObj(v.data) && Object.keys(v.data).length) Object.keys(v.data).forEach(function (s) { parts["data/" + enc(s)] = JSON.stringify(v.data[s] === undefined ? null : v.data[s]); });
      else parts[enc(f)] = JSON.stringify(v[f] === undefined ? null : v[f]);
    });
    return parts;
  }
  function join(parts) {
    if (parts._raw != null) return JSON.parse(parts._raw);
    var o = {};
    Object.keys(parts).forEach(function (p) {
      var val = JSON.parse(parts[p]);
      if (p.indexOf("data/") === 0) { o.data = o.data || {}; o.data[dec(p.slice(5))] = val; } else o[dec(p)] = val;
    });
    return JSON.stringify(o);
  }
  function lsPath(key, part) { return "ls/" + enc(key) + "/" + part; }
  function loadShared() {
    return H.sb.from("app_docs").select("path,data").like("path", "ls/%").then(function (r) {
      if (r.error) throw r.error;
      var byKey = {};
      (r.data || []).forEach(function (row) {
        var m = /^ls\/([^/]+)\/(.+)$/.exec(row.path); if (!m) return;
        var key = dec(m[1]); (byKey[key] = byKey[key] || {})[m[2]] = JSON.stringify(row.data && "v" in row.data ? row.data.v : null);
      });
      Object.keys(byKey).forEach(function (key) { last[key] = byKey[key]; try { nativeSet.call(localStorage, key, join(byKey[key])); } catch (e) { /* full */ } });
      // records only this browser had before go up once
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (synced(k) && !last[k]) queue(k); }
    });
  }
  var pending = {}, flushT = null;
  function queue(key) { pending[key] = 1; clearTimeout(flushT); flushT = setTimeout(flush, 1200); }
  function flush() {
    var keys = Object.keys(pending); pending = {};
    keys.forEach(function (key) {
      var cur = localStorage.getItem(key), now = cur == null ? {} : split(cur), was = last[key] || {}, ups = [], dels = [];
      Object.keys(now).forEach(function (p) { if (now[p] !== was[p]) ups.push({ path: lsPath(key, p), data: { v: JSON.parse(now[p]) } }); });
      Object.keys(was).forEach(function (p) { if (!(p in now)) dels.push(lsPath(key, p)); });
      last[key] = now;
      if (ups.length) H.sb.from("app_docs").upsert(ups).then(function (r) { if (r.error) { saveFailed(r.error); delete last[key]; } });
      if (dels.length) H.sb.from("app_docs").delete().in("path", dels).then(function (r) { if (r.error) saveFailed(r.error); });
    });
  }
  window.addEventListener("beforeunload", function () { if (Object.keys(pending).length) flush(); });
  function saveFailed(e) { banner("Some changes couldn't be saved to the server. Check your connection, then refresh.", true); console.warn("[z1host] save failed", e); }
  Storage.prototype.setItem = function (k, v) {
    nativeSet.call(this, k, v);
    if (this === window.localStorage && H.ready && synced(k)) queue(k);
  };
  Storage.prototype.removeItem = function (k) {
    nativeRemove.call(this, k);
    if (this !== window.localStorage || !H.ready) return;
    if (k === "zero1office-auth:v1" && H.email) { H.sb.auth.signOut().then(function () { location.reload(); }); return; }
    if (synced(k)) queue(k);
  };

  /* someone else changed a shared record */
  function remoteLs(path, data, deleted) {
    var m = /^ls\/([^/]+)\/(.+)$/.exec(path); if (!m) return;
    var key = dec(m[1]), part = m[2], parts = Object.assign({}, last[key] || {});
    if (deleted) delete parts[part]; else parts[part] = JSON.stringify(data && "v" in data ? data.v : null);
    last[key] = parts;
    try { nativeSet.call(localStorage, key, join(parts)); } catch (e) { /* full */ }
    var S = window.S, val = deleted ? undefined : data && data.v;
    var live = S && typeof S === "object" && S.data && key === H.mainKey;
    if (live && part.indexOf("data/") === 0) { S.data[dec(part.slice(5))] = clone(val); softRender(); }
    else if (live && part === "team") { S.team = clone(val); softRender(); }
    else banner("Your team made changes. Refresh to see them.");
  }
  var softRender = debounce(function () {
    var a = document.activeElement, typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest && a.closest("#content");
    if (typing) { banner("Your team made changes. Refresh to see them."); return; }
    try { if (typeof window.render === "function") window.render(); } catch (e) { /* app redraw */ }
  }, 400);
  function banner(msg, bad) {
    var b = $("z1hBanner");
    if (!b) { b = document.createElement("div"); b.id = "z1hBanner"; b.setAttribute("role", "status"); b.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:900;background:#002C6C;color:#fff;border-radius:10px;padding:8px 12px;font:600 12.5px Inter,system-ui,sans-serif;display:flex;gap:10px;align-items:center;box-shadow:0 10px 30px -10px rgb(0 0 0/.4)"; document.body.appendChild(b); }
    b.style.background = bad ? "#C93A3A" : "#002C6C";
    b.innerHTML = escH(msg) + ' <button type="button" style="font:600 12px inherit;border:0;border-radius:7px;padding:4px 10px;cursor:pointer">Refresh</button>';
    b.querySelector("button").onclick = function () { flush(); setTimeout(function () { location.reload(); }, 300); };
  }

  /* ---------- live updates ---------- */
  function listen() {
    H.sb.channel("z1docs").on("postgres_changes", { event: "*", schema: "public", table: "app_docs" }, function (p) {
      var row = p.new && p.new.path ? p.new : p.old || {}, path = row.path; if (!path) return;
      if (p.eventType !== "DELETE" && row.updated_by === H.email) return; // our own write
      if (path.indexOf("ls/") === 0) remoteLs(path, p.new && p.new.data, p.eventType === "DELETE");
      else notify(path);
    }).subscribe();
    // fallback when live updates are blocked: re-read open lists every 60 seconds
    setInterval(function () { listeners.forEach(function (l) { l.fire(); }); }, 60000);
  }

  /* ---------- service worker for /_blob/ files ---------- */
  function worker() {
    if (!("serviceWorker" in navigator)) return Promise.resolve();
    navigator.serviceWorker.addEventListener("message", function (ev) {
      if (ev.data && ev.data.z1 === "token" && ev.ports[0]) H.sb.auth.getSession().then(function (r) {
        ev.ports[0].postMessage({ token: r.data.session ? r.data.session.access_token : "", url: CFG.url, key: CFG.anonKey });
      });
    });
    return navigator.serviceWorker.register("sw.js").then(function () { return navigator.serviceWorker.ready; }).then(function () {
      if (navigator.serviceWorker.controller) return;
      return new Promise(function (res) { navigator.serviceWorker.addEventListener("controllerchange", res, { once: true }); setTimeout(res, 3000); });
    }).catch(function (e) { console.warn("[z1host] files will not show", e); });
  }

  /* ---------- start the app once signed in ---------- */
  function runApp() {
    var list = Array.prototype.slice.call(document.querySelectorAll('script[type="text/z1-app"]'));
    list.forEach(function (old) { var s = document.createElement("script"); s.textContent = old.textContent; old.replaceWith(s); });
    ["DOMContentLoaded", "load"].forEach(function (n) { (n === "load" ? window : document).dispatchEvent(new Event(n)); });
  }
  /* what the opening screen is waiting on; after 15 s offer a way out instead of spinning forever */
  var stepName = "", stepTimer = null;
  function step(name, sub) {
    stepName = name;
    screen("<div><h2>Opening…</h2><p>" + escH(name) + "…" + (sub ? "<br>" + escH(sub) : "") + "</p></div>");
    clearTimeout(stepTimer);
    stepTimer = setTimeout(stuck, 15000);
  }
  function stepDone() { clearTimeout(stepTimer); stepTimer = null; }
  function stuck() {
    screen('<div><h2>This is taking too long</h2><p>Stuck at: ' + escH(stepName) + '. Check your internet, then try again. If it keeps happening, sign in again.</p>' +
      '<p style="font:11px/1.4 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;max-height:180px;overflow:auto;background:rgb(127 127 127/.1);padding:8px;border-radius:8px">' +
      escH("Details for Claude:\n" + navigator.userAgent + "\nlocks:" + !!navigator.locks + " sw:" + ("serviceWorker" in navigator) + " online:" + navigator.onLine + "\n" + DIAG.join("\n")) + '</p></div>' +
      '<button class="pri" type="button" id="z1hRetry">Try again</button><button type="button" id="z1hReset">Sign in again</button>');
    $("z1hRetry").onclick = function () { location.reload(); };
    $("z1hReset").onclick = function () {
      for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (/^sb-/.test(k) || k === "zero1office-auth:v1") nativeRemove.call(localStorage, k); }
      location.reload();
    };
  }
  var started = false;
  function start(session) {
    if (started || !session) return; started = true;
    var email = String(session.user.email || "").toLowerCase();
    H.email = email; H.provider = (session.user.app_metadata && session.user.app_metadata.provider) || "email";
    step("Loading your account", "Signed in as " + email);
    if (!/@ask-karla\.com$/.test(email)) { notMember("Only @ask-karla.com accounts can open Zero1Office."); return; }
    fetchDoc("z1users/" + email.replace(/[^a-z0-9]/g, "_")).then(function (rec) {
      if (!rec) { notMember("Your account isn't set up yet. Ask Paolo or Karla to add you in Settings > Users."); return; }
      if (rec.data && rec.data.status === "suspended") { notMember("This account is paused. Ask Paolo or Karla."); return; }
      step("Loading shared data", "Signed in as " + email);
      return Promise.all([worker(), loadShared()]).then(function () {
        stepDone();
        nativeSet.call(localStorage, "zero1office-auth:v1", JSON.stringify({ email: email }));
        H.ready = true; (H.waiting || []).forEach(function (f) { f(); }); H.waiting = [];
        listen(); hideScreen(); runApp();
        H.mainKey = (function () { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^zero1office-mock:/.test(k)) return k; } return "zero1office-mock:v3"; })();
      });
    }).catch(function (e) { started = false; stepDone(); screen('<div><h2>Couldn\'t open Zero1Office</h2><p>' + escH((e && e.message) || "Check your connection and try again.") + '</p></div><button class="pri" type="button" onclick="location.reload()">Try again</button>'); });
  }
  function notMember(msg) {
    stepDone();
    screen('<div><h2>No access</h2><p>' + escH(msg) + '</p></div><button type="button" id="z1hOut">Sign out</button>');
    $("z1hOut").onclick = function () { H.sb.auth.signOut().then(function () { location.reload(); }); };
  }

  /* ---------- admin actions for Settings > Users ---------- */
  H.admin = function (action, email) {
    return H.sb.functions.invoke("z1-admin", { body: { action: action, email: email } }).then(function (r) {
      if (r.error) return (r.error.context && r.error.context.json ? r.error.context.json() : Promise.resolve({})).then(function (b) { throw new Error((b && b.error) || r.error.message || "That didn't work."); });
      return r.data;
    });
  };
  H.changePassword = function (oldPw, newPw) {
    var p = H.provider === "azure" ? Promise.resolve({}) : H.sb.auth.signInWithPassword({ email: H.email, password: oldPw });
    return p.then(function (r) {
      if (r.error) throw new Error("Your current password is wrong.");
      return H.sb.auth.updateUser({ password: newPw });
    }).then(function (r) { if (r.error) throw new Error(r.error.message); });
  };

  var booted = false;
  function boot() {
    // runApp() replays DOMContentLoaded for the app's scripts; without this guard that replay started a second
    // sign-in check on top of the running app, which then showed "This is taking too long"
    if (booted) return; booted = true;
    if (!CFG.url || !CFG.anonKey || !window.supabase) { screen("<div><h2>Setup needed</h2><p>config.js is missing the Supabase Project URL and anon key.</p></div>"); return; }
    // lock: run auth steps directly instead of through the browser's cross-tab lock, which can stay held by a stuck tab
    H.sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce",
      debug: function () { diag(Array.prototype.slice.call(arguments).map(function (a) { return typeof a === "string" ? a : (a && a.message) || ""; }).join(" ")); },
      lock: function (name, timeout, fn) { return fn(); } } });
    diag("supabase " + (window.supabase && window.supabase.SupabaseClient ? "loaded" : "?") + ", " + location.href.replace(/[?#].*/, ""));
    step("Checking your sign-in");
    H.sb.auth.getSession().catch(function (e) { return { data: { session: null }, error: e }; }).then(function (r) {
      var err = /error_description=([^&]+)/.exec(location.hash + "&" + location.search);
      if (started) { stepDone(); return; }
      if (r.data.session) start(r.data.session);
      else loginScreen(err ? decodeURIComponent(err[1].replace(/\+/g, " ")) : "");
    });
    // supabase-js runs this callback while holding its auth lock; calling the client inside it hangs every tab,
    // so act on the event only after the callback has returned
    H.sb.auth.onAuthStateChange(function (ev, session) { setTimeout(function () { if (ev === "SIGNED_IN" && session) start(session); if (ev === "SIGNED_OUT" && started) location.reload(); }, 0); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
