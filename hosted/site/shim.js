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
   The app's own <script> tags are turned off by build.sh (type="text/z1-app") and run here once ready.
   DEMO | LIVE: visitors who aren't signed in land on a demo with sample records held in the tab's memory (no database
   calls, no reading of real browser storage). LIVE opens sign-in. Super Admins pick the demo's pages, or turn it off,
   in Settings > Demo mode (document meta/demo, read before sign-in through z1_demo() from supabase-demo.sql). */
(function () {
  "use strict";
  var CFG = window.Z1_CONFIG || {};
  var PERSONAL = ["zero1office-auth:v1", "zero1office:navFolded:v1", "z1pg-via"];
  var SEG_OK = /^[A-Za-z0-9:.-]+$/;
  var H = window.Z1Host = { ready: false, email: "", provider: "", sb: null };
  var nativeSet = Storage.prototype.setItem, nativeRemove = Storage.prototype.removeItem, nativeGet = Storage.prototype.getItem;

  /* ---------- DEMO | LIVE (Paolo, 2026-11-27: "app.ask-karla.com goes to the DEMO page ... Demo - Sample activity.
     No real data. If you click LIVE - it goes to the sign in or login page. Under Settings have DEMO options")
     Demo runs the same app on sample records kept in this tab's memory. In demo nothing is read from or written to the
     office's Supabase data, and nothing this browser saved while signed in is read: browser storage is swapped for an
     empty in-memory copy before the app starts, in the page and in the office frame. */
  var MODE_KEY = "ak-view-mode", DEMO_EMAIL = "demo@ask-karla.com";
  var MEM = new Map(), MEMDB = new Map();
  H.demo = false; H.demoCfg = { on: true, pages: null }; H.demoCfgFrom = "default";
  function getMode() { try { return nativeGet.call(localStorage, MODE_KEY) || ""; } catch (e) { return ""; } }
  H.go = function (m) {
    try { nativeSet.call(localStorage, MODE_KEY, m); } catch (e) { /* private mode: this visit only */ }
    var wait = 0;
    if (!H.demo && H.ready && Object.keys(pending).length) { flush(); wait = 900; } // unsaved live changes go up first
    setTimeout(function () { location.replace(location.pathname); }, wait);
  };
  /* swap a window's browser storage for the in-memory demo copy */
  function patchWin(w) {
    var P, ls;
    try { P = w.Storage.prototype; ls = w.localStorage; } catch (e) { return; }
    if (!P || P.__z1demo) return;
    P.__z1demo = 1;
    var g = P.getItem, s = P.setItem, r = P.removeItem, k = P.key, c = P.clear, len = Object.getOwnPropertyDescriptor(P, "length");
    P.getItem = function (key) { if (this !== ls) return g.call(this, key); key = String(key); return MEM.has(key) ? MEM.get(key) : null; };
    P.setItem = function (key, v) { if (this !== ls) return s.call(this, key, v); MEM.set(String(key), String(v)); };
    P.removeItem = function (key) {
      if (this !== ls) return r.call(this, key);
      MEM.delete(String(key));
      if (String(key) === "zero1office-auth:v1" && H.ready) H.go("live"); // "Sign out" in the demo opens the real sign-in
    };
    P.key = function (i) { if (this !== ls) return k.call(this, i); var a = Array.from(MEM.keys()); return i >= 0 && i < a.length ? a[i] : null; };
    P.clear = function () { if (this === ls) MEM.clear(); else c.call(this); };
    if (len && len.get) Object.defineProperty(P, "length", { configurable: true, enumerable: true, get: function () { return this === ls ? MEM.size : len.get.call(this); } });
  }
  H.patchWin = patchWin;
  function hookFrames() { // frames the app builds from text (the 3D office) get the demo storage too
    var d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "srcdoc");
    if (!d || !d.set) return;
    Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) {
      d.set.call(this, "<script>try{(parent.Z1Host||top.Z1Host).patchWin(window)}catch(e){}<\/script>" + v);
    } });
  }

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
    modeCss();
    screen((H.demoCfg.on ? '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:12px;color:#5F6B7E">Just looking? Open the demo.</span>' + switchHtml(false) + "</div>" : "") +
      '<div><h2>Sign in</h2><p>Use your @ask-karla.com account.</p></div>' +
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
  function memRows(test) { var out = []; MEMDB.forEach(function (v, k) { if (test(k)) out.push({ path: k, data: clone(v) }); }); return out; }
  function fetchDoc(path) { if (H.demo) return Promise.resolve(memRows(function (k) { return k === path; })[0] || null); return H.sb.from("app_docs").select("path,data").eq("path", path).maybeSingle().then(function (r) { if (r.error) throw dbErr(r.error); return r.data; }); }
  function fetchColl(path) { if (H.demo) return Promise.resolve(memRows(function (k) { return k.replace(/\/[^/]+$/, "") === path; })); return H.sb.from("app_docs").select("path,data").eq("parent", path).then(function (r) { if (r.error) throw dbErr(r.error); return r.data || []; }); }
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
      set: function (d) { if (H.demo) { MEMDB.set(path, clone(d) || {}); notify(path); return Promise.resolve(); } return H.sb.from("app_docs").upsert({ path: path, data: clone(d) }).then(function (r) { if (r.error) throw dbErr(r.error); notify(path); }); },
      update: function (d) {
        return fetchDoc(path).then(function (row) {
          if (!row) throw { code: "invalid_argument", message: "No such document" };
          var m = Object.assign({}, row.data, clone(d));
          if (H.demo) { MEMDB.set(path, m); notify(path); return; }
          return H.sb.from("app_docs").update({ data: m }).eq("path", path).then(function (r) { if (r.error) throw dbErr(r.error); notify(path); });
        });
      },
      delete: function () { if (H.demo) { MEMDB.delete(path); notify(path); return Promise.resolve(); } return H.sb.from("app_docs").delete().eq("path", path).then(function (r) { if (r.error) throw dbErr(r.error); notify(path); }); },
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

  /* demo: files people add stay in this tab only */
  var MEMFILES = {};
  var DEMO_ASSETS = Object.freeze({
    upload: function (blob, opts) {
      var id = hex32(), type = (opts && opts.type) || blob.type || "application/octet-stream";
      if (blob.size > 20 * 1024 * 1024) return Promise.reject({ code: "too_large", message: "Over 20 MB" });
      var url = URL.createObjectURL(new Blob([blob], { type: type }));
      MEMFILES[id] = { id: id, url: url, sizeBytes: blob.size, contentType: type };
      return Promise.resolve(MEMFILES[id]);
    },
    list: function () { var l = Object.keys(MEMFILES).map(function (k) { return MEMFILES[k]; }); return Promise.resolve({ assets: l, usage: { bytes: l.reduce(function (a, x) { return a + x.sizeBytes; }, 0) } }); },
    delete: function (id) { delete MEMFILES[id]; return Promise.resolve(); },
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
        var go = function () { res(name === "db" ? DB : name === "assets" ? (H.demo ? DEMO_ASSETS : ASSETS) : name === "downloads" ? DOWNLOADS : name === "permissions" ? PERMS : null); };
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

  /* ---------- demo: settings, sample records, the DEMO | LIVE switch ---------- */
  var HIDDEN_IN_DEMO = ["profile", "users", "company"];
  function normCfg(d) {
    d = d || {};
    return { on: d.on !== false, pages: Array.isArray(d.pages) ? d.pages.filter(function (x) { return typeof x === "string"; }) : null };
  }
  /* public read of meta/demo through the z1_demo() function (hosted/supabase-demo.sql), so visitors who are not
     signed in still get Paolo's choices; if it is missing the demo shows with every page */
  function loadDemoCfg() {
    var timeout = new Promise(function (res) { setTimeout(function () { res({ error: { message: "timed out" } }); }, 5000); });
    var call = H.sb.rpc ? Promise.resolve(H.sb.rpc("z1_demo")) : Promise.resolve({ error: { message: "no rpc" } });
    return Promise.race([call, timeout]).then(function (r) {
      if (!r || r.error) { H.demoCfgFrom = "error"; diag("demo settings: " + ((r && r.error && r.error.message) || "?")); return; }
      H.demoCfg = normCfg(r.data); H.demoCfgFrom = r.data ? "server" : "default";
    }, function (e) { H.demoCfgFrom = "error"; diag("demo settings: " + ((e && e.message) || e)); });
  }
  function demoCatalog() {
    var out = [];
    (window.NAV || []).forEach(function (g) { (g[1] || []).forEach(function (it) { if (HIDDEN_IN_DEMO.indexOf(it[0]) < 0) out.push({ group: g[0], key: it[0], label: it[1] }); }); });
    return out;
  }
  function demoPages() {
    var all = demoCatalog().map(function (c) { return c.key; });
    return H.demoCfg.pages ? H.demoCfg.pages.filter(function (k) { return all.indexOf(k) > -1; }) : all;
  }
  function dOff(n) { var d = new Date(Date.now() + n * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function isoOff(n) { return new Date(Date.now() + n * 864e5).toISOString(); }

  /* before the app starts: who is "signed in" and the billing tracker */
  function seedDemo() {
    MEM.set("zero1office-auth:v1", JSON.stringify({ email: DEMO_EMAIL }));
    function soa(id, no, prov, acct, amt, o) {
      return Object.assign({ id: id, soa_no: no, provider: prov, account_name: acct, product: "HMO", coverage_period: null, amount: amt, released_on: null, due_on: null,
        paid_on: null, paid_amount: null, payment_ref: null, provider_receipt_no: null, provider_receipt_on: null, cwt_applicable: false, cwt_amount: null,
        form_2307_on: null, commission_rate: 0.1, commission_expected: Math.round(amt * 10) / 100, auto_comm: true, disbursement_id: null, commission_amount: null,
        closed_on: null, ghl_link: null, notes: "Sample record", stage: "draft", stage_changed_at: isoOff(-2) }, o);
    }
    var soas = [
      soa("dm_s1", "MX-SAMPLE-0412", "Maxicare", "Northpoint Logistics", 96000, { released_on: dOff(-20), due_on: dOff(-5), stage: "awaiting_payment", stage_changed_at: isoOff(-20) }),
      soa("dm_s2", "MC-SAMPLE-8812", "Medicard", "Seaside Family Clinic", 41250, { released_on: dOff(-30), due_on: dOff(-10), paid_on: dOff(-8), paid_amount: 41250, provider_receipt_on: dOff(-6), provider_receipt_no: "OR-SAMPLE-221", cwt_applicable: true, cwt_amount: 825, stage: "awaiting_docs", stage_changed_at: isoOff(-8) }),
      soa("dm_s3", "IC-SAMPLE-5510", "Intellicare", "Brightpath Learning Center", 69600, { released_on: dOff(-40), due_on: dOff(-25), paid_on: dOff(-24), paid_amount: 69600, provider_receipt_on: dOff(-20), provider_receipt_no: "OR-SAMPLE-118", stage: "awaiting_commission", stage_changed_at: isoOff(-20) }),
      soa("dm_s4", "MX-SAMPLE-0398", "Maxicare", "Harborview Café Group", 85250, { released_on: dOff(-60), due_on: dOff(-45), paid_on: dOff(-44), paid_amount: 85250, provider_receipt_on: dOff(-40), provider_receipt_no: "OR-SAMPLE-090", disbursement_id: "dm_d1", commission_amount: 8525, stage: "receipt_due", stage_changed_at: isoOff(-3) }),
      soa("dm_s5", "KHL-SAMPLE-7781", "KHL", "Juniper Dental", 32670, { stage: "draft", stage_changed_at: isoOff(-1) }),
    ];
    var payouts = [{ id: "dm_d1", provider: "Maxicare", received_on: dOff(-3), reference: "DV-SAMPLE-1188", notes: "Sample payout", gross_amount: 8525, withholding_amount: 426.25, net_amount: 8098.75, receipt_no: null, receipt_issued_on: null }];
    MEM.set("zero1office-billing:v1", JSON.stringify({ soas: soas, events: [], payouts: payouts, noDummy: true }));
  }

  /* after the app starts: sample work for the AI employees (the app reads these from S.data) */
  function fillDemo() {
    var S = window.S;
    if (!S || !S.data) return;
    var d = S.data, t = function (n) { return dOff(n); };
    var check = function (a, b, c) { return [["ok", a], ["ok", b], ["watch", c]]; };
    d.approvals = [
      { id: "dm_ap1", who: "maya", kind: "Proposal", title: "Northpoint Logistics: 3 Maxicare HMO options", aud: "HR Manager, Northpoint Logistics", count: 1, when: "Today, 10:40 AM", state: "waiting",
        doc: { eyebrow: "Proposal · Corporate HMO", head: "Health cover for 48 Northpoint team members", lines: ["Three Maxicare options side by side for 48 regular employees.", "Every option has outpatient care, ER and a yearly check-up. Dental comes with Plus and Premier."],
          table: [["Option", "Room", "Yearly limit", "Per member a year"], ["Essential", "Ward", "₱150,000", "₱18,500"], ["Plus", "Semi-private", "₱200,000", "₱24,000"], ["Premier", "Private", "₱300,000", "₱33,500"]], cta: "Book a 15-minute walk-through" },
        checks: check("Rates match the current rate sheet", "No benefits promised outside the plan", "Confirm the headcount before sending") },
      { id: "dm_ap2", who: "felix", kind: "Email", title: "Follow-up: Harborview Café Group renewal", aud: "Owner, Harborview Café Group", count: 1, when: "Today, 9:15 AM", state: "waiting",
        doc: { eyebrow: "Email · Renewal", head: "Your HMO renews in 20 days", lines: ["Hi! Your team's HMO with Maxicare renews in 20 days.", "We compared this year's rates with two other providers. The short version: staying is still the best value, and adding dental costs ₱1,200 a member a year.", "Can we walk you through it this week?"], cta: "Reply with a time that works" },
        checks: check("Renewal date matches the client record", "Prices are from this year's rate sheet", "Owner asked for Viber last time, not email") },
      { id: "dm_ap3", who: "maya", kind: "Proposal", title: "Rivera Family: Family Plus HMO", aud: "Rivera Family", count: 1, when: "Yesterday, 4:05 PM", state: "sent",
        doc: { eyebrow: "Proposal · Family HMO", head: "Cover for a family of 5", lines: ["Family Plus HMO for two adults and three kids, with dental and a yearly check-up."], cta: "Sign the application form" },
        checks: [["ok", "Ages and plan match the rate table"], ["ok", "Waiting periods explained"]] },
      { id: "dm_ap4", who: "tess", kind: "Email", title: "Newsletter: 5 HMO benefits people miss", aud: "Newsletter list", count: 412, when: "Fri, 7:00 PM", state: "approved",
        doc: { eyebrow: "Email · Newsletter", head: "5 things your HMO already pays for", lines: ["Most members only use their HMO when they're sick. Here's what else is already covered."], cta: "Read the full list" },
        checks: [["ok", "Unsubscribe link included"], ["ok", "No medical advice given"]] },
    ];
    d.posts = [
      { id: "dm_p1", who: "cora", title: "5 things your HMO covers that most people miss", fmt: "Carousel", plat: "Instagram and Facebook", v: "", slides: ["5 things your HMO covers", "1. A yearly check-up", "2. ER at any hospital in the network", "3. Dental on most plans", "4. Teleconsult any time", "5. A free financial wellness talk"],
        cap: "Most members only use their HMO when they're sick. Here's what else is already paid for.", tags: "#HMO #AskKarla #HealthTips", date: t(1), time: "19:00", state: "waiting" },
      { id: "dm_p2", who: "vince", title: "What is an LOA? Explained in 30 seconds", fmt: "Reel", plat: "TikTok and Reels", v: "v2", slides: ["Your doctor asks for an LOA. Now what?", "What an LOA is", "How to get one in 2 minutes"],
        cap: "LOA = Letter of Authorization. Here's how to get one fast so your HMO pays the hospital directly.", tags: "#LOA #HMO101", date: t(2), time: "12:00", state: "scheduled" },
      { id: "dm_p3", who: "iris", title: "Myth vs fact: pre-existing conditions", fmt: "Static", plat: "Facebook", v: "v3", slides: ["Myth: HMOs never cover pre-existing conditions"],
        cap: "Many plans cover them after a waiting period. Ask us which ones.", tags: "#MythVsFact #HMO", date: t(3), time: "20:00", state: "waiting" },
    ];
    var msg = function (x, tm) { return ["e", x, tm]; };
    d.threads = [
      { id: "dm_t1", who: "rina", title: "LOA request for a Northpoint member", needs: true, unread: true, arch: false, msgs: [msg("A Northpoint member needs an LOA for an MRI tomorrow. Their Plus plan covers it. OK to send the request?", "8:52 AM")] },
      { id: "dm_t2", who: "nina", title: "3 SOAs paid this week", needs: false, unread: true, arch: false, msgs: [msg("Seaside, Brightpath and Harborview paid. Two still need the provider's receipt and one needs a 2307.", "9:30 AM")] },
      { id: "dm_t3", who: "quinn", title: "Plan comparison ready: Harborview Café Group", needs: false, unread: false, arch: false, msgs: [msg("Maxicare, Medicard and Intellicare side by side for 31 members. Maxicare is still the best value.", "Yesterday")] },
      { id: "dm_t4", who: "dom", title: "Call booked with Kidzone Learning", needs: false, unread: true, arch: false, msgs: [msg("Thursday 2 PM, 20 minutes, on Zoom. I added it to your calendar.", "10:05 AM")] },
    ];
    d.todos = [
      { id: "dm_td1", x: "Approve the Northpoint proposal", p: "urgent", done: false },
      { id: "dm_td2", x: "Call Harborview about the renewal date", p: "important", done: false },
      { id: "dm_td3", x: "Send receipts to Maxicare for last month's payouts", p: "medium", done: false },
      { id: "dm_td4", x: "Update the rate sheets folder", p: "low", done: false },
      { id: "dm_td5", x: "Read Kara's 7 PM report", p: "medium", done: true },
    ];
    d.events = [
      { id: "dm_e1", t: "Proposal walk-through: Northpoint", d: t(0), tm: "15:30", k: "navy" },
      { id: "dm_e2", t: "Call: Kidzone Learning", d: t(1), tm: "14:00", k: "green" },
      { id: "dm_e3", t: "SOA cut-off", d: t(3), tm: "17:00", k: "red" },
      { id: "dm_e4", t: "Renewal: Harborview Café Group", d: t(5), tm: "10:00", k: "gold" },
    ];
    d.subs = [
      { id: "dm_sb1", n: "CRM and pipeline", cat: "Marketing", cost: 5600, cyc: "Monthly", next: t(6), who: "Felix, Owen", pay: "Company card", note: "", on: true },
      { id: "dm_sb2", n: "Email and office apps", cat: "AI & software", cost: 4200, cyc: "Monthly", next: t(12), who: "Everyone", pay: "Company card", note: "", on: true },
      { id: "dm_sb3", n: "Design tool", cat: "Marketing", cost: 6500, cyc: "Yearly", next: t(40), who: "Cora, Iris", pay: "Company card", note: "Two seats, one unused", on: true },
      { id: "dm_sb4", n: "Website hosting", cat: "Website", cost: 2400, cyc: "Yearly", next: t(90), who: "Paolo", pay: "Company card", note: "", on: true },
    ];
    d.expenses = [
      { id: "dm_ex1", x: "Grab to the insurer's office", cat: "Travel & meals", amt: 420, date: t(-1), pay: "GCash", rcpt: true },
      { id: "dm_ex2", x: "Printer ink", cat: "Supplies", amt: 1850, date: t(-2), pay: "Cash", rcpt: false },
      { id: "dm_ex3", x: "Boosted post: SME HMO", cat: "Marketing", amt: 3000, date: t(-3), pay: "Company card", rcpt: true },
    ];
    d.renewals = [
      { id: "dm_rn1", acct: "Seaside Family Clinic", ins: "Medicard", date: t(3), note: "15 members", done: false },
      { id: "dm_rn2", acct: "Harborview Café Group", ins: "Maxicare", date: t(20), note: "Ask about adding dental", done: false },
      { id: "dm_rn3", acct: "Mendoza Family", ins: "Oona", date: t(14), note: "Home and car", done: false },
    ];
    d.licenses = [
      { id: "dm_lc1", acct: "Agent license (sample)", ins: "Insurance Commission", date: t(75), note: "Renew 30 days early", done: false },
      { id: "dm_lc2", acct: "Broker accreditation (sample)", ins: "Maxicare", date: t(40), note: "", done: false },
    ];
    try { if (typeof window.save === "function") window.save(); } catch (e) { /* demo only */ }
    try { if (typeof window.render === "function") window.render(); } catch (e) { /* demo only */ }
  }

  /* the DEMO | LIVE switch in the top bar */
  var MODE_CSS = "#z1mode{display:inline-flex;align-items:center;gap:8px;flex:none;min-width:0}" +
    "#z1mode .sw,#z1h .sw{display:inline-flex;border:1px solid var(--brand,#002C6C);border-radius:999px;overflow:hidden;flex:none}" +
    "#z1mode .sw button,#z1h .sw button{font:700 11px Inter,system-ui,sans-serif;letter-spacing:.05em;padding:5px 11px;border:0;border-radius:0;background:transparent;color:var(--brand,#002C6C);cursor:pointer;min-height:26px}" +
    "#z1mode .sw button[aria-pressed=true],#z1h .sw button[aria-pressed=true]{background:var(--brand,#002C6C);color:var(--surface,#fff)}" +
    "#z1mode small{font-size:11.5px;color:var(--muted,#5F6B7E);white-space:nowrap}@media (max-width:760px){#z1mode small{display:none}}" +
    "#z1demoCard .pgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 14px;margin-top:8px}" +
    "#z1demoCard .pgs h4{grid-column:1/-1;margin:8px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#5F6B7E)}" +
    "#z1demoCard label{display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 0}#z1demoCard .warn{background:var(--gold-soft,#FBF3E2);border-radius:10px;padding:8px 10px;font-size:12.5px}";
  function switchHtml(demo) {
    return '<span class="sw" role="group" aria-label="Demo or live"><button type="button" data-z1mode="demo" aria-pressed="' + demo + '">DEMO</button><button type="button" data-z1mode="live" aria-pressed="' + !demo + '">LIVE</button></span>';
  }
  function modeCss() { if (!$("z1modeCss")) { var st = document.createElement("style"); st.id = "z1modeCss"; st.textContent = MODE_CSS; document.head.appendChild(st); } }
  function modeSwitch() {
    modeCss();
    var top = document.querySelector("#app .top"); if (!top || $("z1mode")) return;
    var old = top.querySelector(".pill.demo"); if (old) old.hidden = true; // the app's own "Live data" label
    if (!H.demo && !H.demoCfg.on) return;
    var w = document.createElement("span"); w.id = "z1mode";
    w.innerHTML = switchHtml(H.demo) + (H.demo ? "<small>Sample activity. No real data.</small>" : "");
    var clock = $("clock"); if (clock && clock.parentNode === top) clock.after(w); else top.insertBefore(w, top.firstChild);
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-z1mode]");
    if (b) { ev.preventDefault(); var m = b.getAttribute("data-z1mode"); if ((m === "demo") !== H.demo) H.go(m); return; }
    // "Sign out" in the demo opens the real sign-in instead
    if (H.demo && ev.target.closest && ev.target.closest('[data-z1="signout"]')) { ev.preventDefault(); ev.stopPropagation(); H.go("live"); }
  }, true);

  /* Settings > Demo mode (Super Admins, live only) */
  function isSuper() { var m = window.Z1Auth && window.Z1Auth.me && window.Z1Auth.me(); return !!(m && m.role === "Super Admin"); }
  function demoCard() {
    if (H.demo) return '<div class="card pad" id="z1demoCard"><div class="setrow"><div><b>Demo mode</b><div class="muted small">You are looking at the demo: sample activity, no real data. Click LIVE and sign in as a Super Admin to change what the demo shows.</div></div>' + switchHtml(true) + "</div></div>";
    if (!isSuper()) return "";
    var c = H.demoCfg, pages = demoPages(), groups = {}, order = [];
    demoCatalog().forEach(function (x) { if (!groups[x.group]) { groups[x.group] = []; order.push(x.group); } groups[x.group].push(x); });
    var boxes = order.map(function (g) {
      return "<h4>" + escH(g) + "</h4>" + groups[g].map(function (x) {
        return '<label><input type="checkbox" data-z1pg="' + escH(x.key) + '"' + (pages.indexOf(x.key) > -1 ? " checked" : "") + (c.on ? "" : " disabled") + ">" + escH(x.label) + "</label>";
      }).join("");
    }).join("");
    return '<div class="card pad" id="z1demoCard" style="display:grid;gap:10px">' +
      '<div class="setrow"><div><b>Demo mode</b><div class="muted small">When on, app.ask-karla.com opens on a demo with sample activity and no real data. Clicking LIVE goes to sign in. When off, everyone goes straight to sign in.</div></div>' +
      '<button class="switch" role="switch" aria-checked="' + c.on + '" aria-label="Demo mode" data-z1demo="on"></button></div>' +
      (H.demoCfgFrom === "error" ? '<div class="warn">People who aren\'t signed in can\'t read these settings yet, so the demo shows every page. Run <b>hosted/supabase-demo.sql</b> once in Supabase to fix it.</div>' : "") +
      '<div><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><b>Pages in the demo</b><div class="muted small">Ticked pages show in the demo with sample data. Unticked pages are hidden there. Users and Company profile never show in the demo.</div></div>' +
      '<span class="actions" style="margin:0"><button class="btn sm" type="button" data-z1demo="all"' + (c.on ? "" : " disabled") + '>Tick all</button><button class="btn sm" type="button" data-z1demo="none"' + (c.on ? "" : " disabled") + '>Untick all</button><button class="btn sm" type="button" data-z1mode="demo"' + (c.on ? "" : " disabled") + ">Open the demo</button></span></div>" +
      '<div class="pgs">' + boxes + "</div></div></div>";
  }
  function saveDemoCfg(next, msg) {
    var prev = H.demoCfg; H.demoCfg = next; try { window.render(); } catch (e) { /* redraw */ }
    DB.doc("meta/demo").set({ on: next.on, pages: next.pages, updated: new Date().toISOString(), by: H.email }).then(function () {
      try { window.toast(msg); } catch (e) { /* toast optional */ }
      var w = $("z1mode"); if (w) w.remove(); modeSwitch();
    }, function (e) { H.demoCfg = prev; try { window.render(); window.toast("Couldn't save: " + ((e && e.message) || "try again")); } catch (x) { /* redraw */ } });
  }
  function settingsCard() {
    var V = window.VIEWS;
    if (!V || typeof V.settings !== "function" || V.settings.__z1demo) return;
    var base = V.settings;
    V.settings = function () {
      var h = base.apply(this, arguments), card = demoCard();
      if (!card) return h;
      var at = h.indexOf('<div class="card');
      return at < 0 ? card + h : h.slice(0, at) + card + h.slice(at);
    };
    V.settings.__z1demo = 1;
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-z1demo]"); if (!b || H.demo || !isSuper()) return;
    var c = H.demoCfg, a = b.getAttribute("data-z1demo");
    if (a === "on") saveDemoCfg({ on: !c.on, pages: c.pages }, c.on ? "Demo mode is off. Visitors go straight to sign in." : "Demo mode is on.");
    if (a === "all") saveDemoCfg({ on: c.on, pages: demoCatalog().map(function (x) { return x.key; }) }, "Every page shows in the demo.");
    if (a === "none") saveDemoCfg({ on: c.on, pages: [] }, "No pages show in the demo.");
  });
  document.addEventListener("change", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-z1pg]"); if (!b || H.demo || !isSuper()) return;
    var k = b.getAttribute("data-z1pg"), pages = demoPages().filter(function (x) { return x !== k; });
    if (b.checked) pages.push(k);
    saveDemoCfg({ on: H.demoCfg.on, pages: pages }, b.checked ? "Shown in the demo." : "Hidden from the demo.");
  });

  /* scripts are changed only in the demo: the sample clients, proposals and leads that are already in the app's code
     stay in, and the "remove dummy data" clean-up is skipped (Paolo's live data stays sample-free) */
  var DEMO_PATCHES = [
    [/LEADS\.length=0;PROPOSALS\.length=0;CLIENTS\.length=0;/, ""],
    [/\nSCRAPE=\{goal:350,daily:\[0,0,0[^\n]*/, "\n"],
    [/\nSOCIALS=\{plats:\[\],[^\n]*/, "\n"],
    [/var d=S\.data;if\(!d\|\|d\.noDummy\)return;/, "return;"],
    [/function vSocials\(\)\{return ndEmpty\(/, "function vSocialsNd(){return ndEmpty("],
    [/function vScraped\(\)\{return ndEmpty\(/, "function vScrapedNd(){return ndEmpty("],
  ];
  function startDemo() {
    stepDone();
    H.demo = true; H.email = DEMO_EMAIL; H.provider = "demo";
    try { if (H.sb.auth.stopAutoRefresh) H.sb.auth.stopAutoRefresh(); } catch (e) { /* not needed in the demo */ }
    patchWin(window); hookFrames(); seedDemo();
    H.ready = true; (H.waiting || []).forEach(function (f) { f(); }); H.waiting = [];
    hideScreen();
    runApp(DEMO_PATCHES);
    // the visitor is a staff account limited to the pages chosen in Settings > Demo mode
    MEMDB.set("z1users/" + DEMO_EMAIL.replace(/[^a-z0-9]/g, "_"), { email: DEMO_EMAIL, name: "Demo visitor", title: "Sample account", phone: "", photo: "", role: "Staff", status: "active",
      pages: demoPages(), mustChange: false, created: dOff(0), lastLogin: dOff(0) });
    fillDemo(); modeSwitch(); settingsCard();
    document.title = "Demo · " + (document.title || "Zero1Office");
  }

  /* ---------- start the app once signed in ---------- */
  function runApp(patches) {
    var list = Array.prototype.slice.call(document.querySelectorAll('script[type="text/z1-app"]'));
    list.forEach(function (old) {
      var s = document.createElement("script"), txt = old.textContent;
      (patches || []).forEach(function (p) { txt = txt.replace(p[0], p[1]); });
      s.textContent = txt; old.replaceWith(s);
    });
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
        listen(); hideScreen(); runApp(); modeSwitch(); settingsCard();
        fetchDoc("meta/demo").then(function (row) { if (row) { H.demoCfg = normCfg(row.data); var w = $("z1mode"); if (w) w.remove(); modeSwitch(); } }, function () { /* keep what boot read */ });
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
    if (H.demo) return Promise.reject(new Error("Not available in the demo. Click LIVE and sign in."));
    return H.sb.functions.invoke("z1-admin", { body: { action: action, email: email } }).then(function (r) {
      if (r.error) return (r.error.context && r.error.context.json ? r.error.context.json() : Promise.resolve({})).then(function (b) { throw new Error((b && b.error) || r.error.message || "That didn't work."); });
      return r.data;
    });
  };
  H.changePassword = function (oldPw, newPw) {
    if (H.demo) return Promise.reject(new Error("Not available in the demo. Click LIVE and sign in."));
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
    var mode = getMode();
    Promise.all([H.sb.auth.getSession().catch(function (e) { return { data: { session: null }, error: e }; }), loadDemoCfg()]).then(function (x) {
      var r = x[0], err = /error_description=([^&]+)/.exec(location.hash + "&" + location.search);
      if (started) { stepDone(); return; }
      // DEMO for visitors (and anyone who picked it); LIVE for people already signed in or who clicked LIVE
      if (H.demoCfg.on && !err && (mode === "demo" || (mode !== "live" && !r.data.session))) { startDemo(); return; }
      if (r.data.session) start(r.data.session);
      else loginScreen(err ? decodeURIComponent(err[1].replace(/\+/g, " ")) : "");
    });
    // supabase-js runs this callback while holding its auth lock; calling the client inside it hangs every tab,
    // so act on the event only after the callback has returned
    H.sb.auth.onAuthStateChange(function (ev, session) { setTimeout(function () { if (H.demo) return; if (ev === "SIGNED_IN" && session) start(session); if (ev === "SIGNED_OUT" && started) location.reload(); }, 0); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
