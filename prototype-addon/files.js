/* zero1office add-on: Settings > Files, the central file repository (Paolo, 2026-11-25).
   Built-in files (published with the page) plus files uploaded from here (stored with the artifact,
   indexed in its shared database). View, save, rename, move to a folder, link to a proposal
   attachment, delete. Excel, Word and other types the store doesn't take are kept as base64 text
   and turned back into the real file when viewed or saved.
   Also renames the "Setup" menu group to "Settings" (Paolo, 2026-11-25). */
(function () {
  "use strict";
  function e(s) { return esc(s == null ? "" : String(s)); }
  function say(m) { try { toast(m); } catch (err) { /* optional */ } }

  var FOLDERS = ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD", "Templates", "Marketing", "Office", "Other"];
  var XLSX_T = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  var NATIVE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm", csv: "text/csv", md: "text/markdown", json: "application/json", txt: "text/plain" };
  var WRAPPED = { xlsx: XLSX_T, xls: "application/vnd.ms-excel", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ppt: "application/vnd.ms-powerpoint", zip: "application/zip", rtf: "application/rtf", heic: "image/heic" };
  var BLOCKED = ["exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "html", "htm", "sh"];
  var MB = 1048576;

  var BUILTIN = [
    { id: "b1", path: "files/karla-luansing-maxicare-pubmat.jpg", name: "Karla Luansing_Maxicare_HMO Pubmat.jpg", folder: "Maxicare", size: 207877 },
    { id: "b2", path: "files/mymaxicare-primer-with-rates.pdf", name: "MyMaxicare_Primer with Rates.pdf", folder: "Maxicare", size: 3708482 },
    { id: "b3", path: "files/maxicare-pccs-and-other-services.pdf", name: "Maxicare_PCCs_and_Other_Services.pdf", folder: "Maxicare", size: 7145177 },
    { id: "b4", path: "files/corp/corporate-standard-plan.pdf", name: "Maxicare_Corporate_Standard Plan.pdf", folder: "Maxicare", size: 968316 },
    { id: "b5", path: "files/corp/corporate-set-up-template.xlsx.b64.txt", b64: true, mime: XLSX_T, name: "Maxicare_Corporate Set Up_Template.xlsx", folder: "Maxicare", size: 28383 },
    { id: "b6", path: "files/corp/pcaf.pdf", name: "Maxicare_Prospective Corporate Account Form (PCAF).pdf", folder: "Maxicare", size: 247310 },
    { id: "b7", path: "files/karla-luansing-email-signature.jpg", name: "Karla Luansing - MAXICARE Email Signature.jpg", folder: "Templates", size: 206733 },
    { id: "b8", path: "files/pdf/maxicare-logo.png", name: "Maxicare logo.png", folder: "Marketing", size: 52869 },
    { id: "b9", path: "files/pdf/consultant-banner.jpg", name: "Consultant banner.jpg", folder: "Marketing", size: 79307 },
    { id: "b10", path: "files/pdf/maxicare-bear.png", name: "Maxicare bear.png", folder: "Marketing", size: 107565 },
    { id: "b11", path: "files/pdf/karla-signature.jpg", name: "Karla signature.jpg", folder: "Templates", size: 12098 },
  ];
  BUILTIN.forEach(function (b) { b.builtin = true; b.at = "2026-11-24T00:00:00Z"; b.ext = extOf(b.name); });

  var F = { db: null, assets: null, docs: [], ready: false, err: "", folder: "", q: "", sort: "new", edit: null, up: [], usage: null, sel: {}, folders: null, bmap: {}, fform: null, ferr: "" };

  function extOf(n) { var m = /\.([a-z0-9]{1,6})$/i.exec(n || ""); return m ? m[1].toLowerCase() : ""; }
  function mimeOf(f) { return f.mime || NATIVE[f.ext] || WRAPPED[f.ext] || "application/octet-stream"; }
  function kb(n) { return n >= MB ? (n / MB).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function when(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); }
  function who() { try { var s = JSON.parse(localStorage.getItem("zero1office-auth:v1") || "null"); return s && s.email ? (s.email.split("@")[0].replace(/^./, function (c) { return c.toUpperCase(); })) : ""; } catch (err) { return ""; } }
  function kindOf(f) {
    var x = f.ext;
    if (/^(png|jpe?g|gif|webp|svg)$/.test(x)) return "img";
    if (x === "pdf") return "pdf";
    if (/^(xlsx|xls|csv)$/.test(x)) return "sheet";
    if (/^(mp4|webm)$/.test(x)) return "video";
    if (/^(txt|md|json)$/.test(x)) return "text";
    if (/^(docx?|rtf)$/.test(x)) return "doc";
    if (/^pptx?$/.test(x)) return "slides";
    return "other";
  }
  var BADGE = { img: ["IMG", "#2F7D5B"], pdf: ["PDF", "#B23B3B"], sheet: ["XLS", "#1E7145"], video: ["VID", "#6B4FA0"], text: ["TXT", "#5A6472"], doc: ["DOC", "#2B579A"], slides: ["PPT", "#C55A11"], other: ["FILE", "#5A6472"] };

  /* ---------- the proposal attachment slots a file can fill ---------- */
  function slots() { return window.Z1PG_SLOTS || []; }
  function bySlot(label) { var d = F.docs.filter(function (x) { return x.slot === label; })[0]; return d || null; }

  /* ---------- bytes ---------- */
  function b64ToBlob(txt, type) {
    var bin = atob(String(txt).replace(/\s+/g, "")), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: type });
  }
  function bufToB64(buf) {
    var u = new Uint8Array(buf), s = "", CH = 0x8000;
    for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function srcOf(f) { return f.builtin ? f.path : "/_blob/" + f.asset; }
  function blobOf(f) {
    var src = f.path && !f.asset ? f.path : srcOf(f), wrapped = f.b64 || f.wrap;
    return fetch(src).then(function (r) { if (!r.ok) throw new Error("missing"); return wrapped ? r.text() : r.blob(); })
      .then(function (x) { return wrapped ? b64ToBlob(x, mimeOf(f)) : x; });
  }
  window.Z1Files = { blob: blobOf, forSlot: bySlot }; // upload, view and chatFolder are added below (v77)

  /* ---------- connect to the artifact's storage ---------- */
  // Reads are hardened (v71): any snapshot shape, errors shown on the page, and a one-off read as a fallback.
  function toRows(docs) {
    return (docs || []).map(function (d) {
      var raw = typeof d.data === "function" ? d.data() : d.data, o = {};
      for (var k in (raw || {})) o[k] = raw[k]; // snapshots are frozen: copy before adding fields
      o.id = d.id; o.ext = extOf(o.name); return o;
    }).filter(function (o) { return o.name && o.asset; });
  }
  function take(snap, from) {
    try { F.docs = toRows(snap && snap.docs); F.ready = true; F.err = ""; F.dbg = ""; }
    catch (err) { F.ready = true; F.dbg = from + ": " + (err && err.message || err); F.err = "Your uploaded files couldn't be shown. Press Refresh, or reload the page."; }
    rer();
  }
  function refresh() {
    if (!F.db) return Promise.resolve();
    return F.db.collection("files").get().then(function (snap) { take(snap, "read"); }, function (err) { F.ready = true; F.dbg = "read: " + (err && (err.code || err.message) || err); F.err = "Your uploaded files didn't load. Press Refresh, or reload the page."; rer(); });
  }
  (function connect() {
    var cl = window.claude;
    if (!cl || !cl.use) { F.ready = true; return; }
    var timer = setTimeout(function () { if (!F.ready) refresh(); }, 6000);
    Promise.all([cl.use("db"), cl.use("assets")]).then(function (x) {
      F.db = x[0]; F.assets = x[1];
      if (!F.db) { clearTimeout(timer); F.ready = true; rer(); return; }
      try {
        F.db.collection("files").onSnapshot(function (snap) { clearTimeout(timer); take(snap, "live"); },
          function (err) { clearTimeout(timer); F.dbg = "live: " + (err && (err.code || err.message) || err); refresh(); });
      } catch (err) { F.dbg = "subscribe: " + (err && err.message || err); refresh(); }
      try { // folders and built-in file names (v72)
        F.db.doc("meta/folders").onSnapshot(function (d) { var x = d && d.exists ? (typeof d.data === "function" ? d.data() : d.data) : null; F.folders = x && Array.isArray(x.list) ? x.list.map(function (f) { return { id: String(f.id), name: String(f.name || ""), parent: String(f.parent || "") }; }).filter(function (f) { return f.id && f.name; }) : null; rer(); }, function () { /* defaults stay */ });
        F.db.doc("meta/builtins").onSnapshot(function (d) { var x = d && d.exists ? (typeof d.data === "function" ? d.data() : d.data) : null; F.bmap = x && x.map ? x.map : {}; rer(); }, function () { /* defaults stay */ });
      } catch (err) { /* defaults stay */ }
      meter();
    }, function () { clearTimeout(timer); F.ready = true; rer(); });
  })();
  function meter() { if (F.assets) F.assets.list().then(function (r) { F.usage = r.usage; rer(); }, function () { /* housekeeping only */ }); }
  function rer() { if (S.view === "files") render(); }

  /* ---------- upload ---------- */
  // opts (v77, chat attachments): { folder, note, done(row), failed(message) }
  function upload(list, opts) {
    opts = opts || {};
    if (!F.assets || !F.db) { say("Uploading works when the page is opened on claude.ai by its owner or an editor"); if (opts.failed) opts.failed("not available"); return; }
    var folder = opts.folder != null ? opts.folder : F.folder || "";
    Array.prototype.forEach.call(list, function (file) {
      var ext = extOf(file.name), job = { name: file.name, state: "Uploading…" }; F.up.push(job);
      var fail = function (m) { if (opts.failed) opts.failed(m, file); job.state = m; job.bad = true; rer(); setTimeout(function () { F.up = F.up.filter(function (j) { return j !== job; }); rer(); }, 6000); };
      if (!ext || BLOCKED.indexOf(ext) > -1) { fail("This type of file can't be stored here"); return; }
      var native = NATIVE[ext], max = native ? (ext === "svg" ? 2 * MB : 20 * MB) : 15 * MB;
      if (file.size > max) { fail("Too big: the limit is " + Math.round(max / MB) + " MB for this type"); return; }
      var body = native ? Promise.resolve(file) : file.arrayBuffer().then(function (b) { return new Blob([bufToB64(b)], { type: "text/plain" }); });
      body.then(function (blob) { return F.assets.upload(blob, { type: native || "text/plain" }); })
        .then(function (r) {
          var row = { name: file.name.slice(0, 180), folder: folder, size: file.size, mime: native || WRAPPED[ext] || "application/octet-stream", asset: r.id, wrap: !native, slot: "", note: String(opts.note || "").slice(0, 200), at: new Date().toISOString(), by: who() };
          return F.db.collection("files").add(row).then(function (ref) {
            var o = {}; for (var k in row) o[k] = row[k]; o.id = ref && ref.id; o.ext = extOf(o.name);
            if (o.id && !F.docs.some(function (d) { return d.asset === row.asset; })) F.docs = F.docs.concat([o]);
            if (opts.done) opts.done(o);
          });
        })
        .then(function () { F.up = F.up.filter(function (j) { return j !== job; }); say(file.name + " uploaded"); meter(); rer(); setTimeout(refresh, 1500); },
          function (err) {
            var c = err && err.code;
            fail(c === "too_large" ? "Too big to store" : c === "unsupported_type" ? "This type of file can't be stored here" : c === "quota_or_state" ? "Storage is full. Delete files you no longer need." : c === "rate_limited" ? "Too many uploads at once. Try again in a minute." : "Didn't upload. Try again.");
          });
      rer();
    });
  }

  /* ---------- view ---------- */
  var LIBS = { pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" }, libP = {};
  function lib(k) {
    var ready = k === "pdf" ? window.pdfjsLib : window.XLSX; if (ready) return Promise.resolve(ready);
    return libP[k] || (libP[k] = new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = LIBS[k]; sc.async = true;
      sc.onload = function () { var g = k === "pdf" ? window.pdfjsLib : window.XLSX; if (!g) return no(new Error(k)); if (k === "pdf") g.GlobalWorkerOptions.workerSrc = LIBS.pdf.replace("pdf.min.js", "pdf.worker.min.js"); ok(g); };
      sc.onerror = function () { libP[k] = null; no(new Error(k)); };
      document.head.appendChild(sc);
    }));
  }
  function find(id) { return builtins(true).concat(F.docs).filter(function (x) { return x.id === id; })[0]; }
  function viewFile(id) {
    var f = find(id); if (!f) return;
    closeView();
    var k = kindOf(f), sc = document.createElement("div");
    sc.id = "z1fView"; sc.setAttribute("role", "dialog"); sc.setAttribute("aria-modal", "true"); sc.setAttribute("aria-label", f.name);
    sc.innerHTML = '<div class="z1fv-bar"><b>' + e(f.name) + '</b><span class="muted small" id="z1fvInfo">' + kb(f.size || 0) + '</span><span style="flex:1"></span><button class="btn sm" type="button" data-zf="save" data-v="' + e(f.id) + '">Save file</button><button class="btn sm" type="button" data-zf="vclose">Close ✕</button></div><div class="z1fv-body" id="z1fvBody"><p class="muted">Opening…</p></div>';
    document.body.appendChild(sc);
    sc.querySelector("[data-zf=vclose]").focus();
    var body = sc.querySelector("#z1fvBody"), info = sc.querySelector("#z1fvInfo");
    var none = function (m) { body.innerHTML = '<div class="z1fv-none"><p>' + e(m) + '</p><button class="btn pri" type="button" data-zf="save" data-v="' + e(f.id) + '">Save file</button></div>'; };
    if (k === "doc" || k === "slides" || k === "other") { none("There's no preview for " + (k === "doc" ? "Word" : k === "slides" ? "PowerPoint" : "this type of") + " files here. Save it to open it on your computer."); return; }
    blobOf(f).then(function (blob) {
      if (!document.getElementById("z1fView")) return;
      if (k === "img") { var im = new Image(); im.alt = f.name; im.src = URL.createObjectURL(blob); im.className = "z1fv-img"; body.innerHTML = ""; body.appendChild(im); return; }
      if (k === "video") { var v = document.createElement("video"); v.controls = true; v.src = URL.createObjectURL(blob); v.className = "z1fv-img"; body.innerHTML = ""; body.appendChild(v); return; }
      if (k === "text") return blob.text().then(function (t) { var pre = document.createElement("pre"); pre.className = "z1fv-text"; pre.textContent = t.length > 200000 ? t.slice(0, 200000) + "\n…" : t; body.innerHTML = ""; body.appendChild(pre); });
      if (k === "sheet") return Promise.all([lib("xlsx"), blob.arrayBuffer()]).then(function (x) { showSheet(x[0], x[1], body, info, f); });
      if (k === "pdf") return Promise.all([lib("pdf"), blob.arrayBuffer()]).then(function (x) { showPdf(x[0], x[1], body, info, f); });
    }).catch(function () { if (document.getElementById("z1fView")) none("The preview didn't open. Save the file to open it on your computer."); });
  }
  function showSheet(X, buf, body, info, f) {
    var wb = X.read(buf, { type: "array" }), names = wb.SheetNames, cur = 0;
    function draw() {
      var rows = X.utils.sheet_to_json(wb.Sheets[names[cur]], { header: 1, blankrows: false, defval: "" }), cols = 0;
      rows = rows.slice(0, 300); rows.forEach(function (r) { cols = Math.max(cols, Math.min(r.length, 40)); });
      body.innerHTML = '<div class="chips" role="tablist" style="margin-bottom:10px">' + names.map(function (n, i) { return '<button class="chip" type="button" data-sheet="' + i + '" aria-pressed="' + (i === cur) + '">' + e(n) + '</button>'; }).join("") + '</div>' +
        (rows.length ? '<div class="tblwrap"><table class="t z1fv-sheet">' + rows.map(function (r, i) { var c = ""; for (var j = 0; j < cols; j++) c += (i === 0 ? "<th>" : "<td>") + e(r[j]) + (i === 0 ? "</th>" : "</td>"); return "<tr>" + c + "</tr>"; }).join("") + '</table></div>' : '<p class="muted">This sheet is empty.</p>');
      info.textContent = kb(f.size || 0) + " · " + names.length + " sheet" + (names.length === 1 ? "" : "s");
      body.querySelectorAll("[data-sheet]").forEach(function (b) { b.onclick = function () { cur = +b.dataset.sheet; draw(); }; });
    }
    draw();
  }
  function showPdf(P, buf, body, info, f) {
    P.getDocument({ data: new Uint8Array(buf) }).promise.then(function (doc) {
      var shown = 0, STEP = 12; body.innerHTML = "";
      info.textContent = kb(f.size || 0) + " · " + doc.numPages + " page" + (doc.numPages === 1 ? "" : "s");
      function more() {
        var end = Math.min(doc.numPages, shown + STEP), chain = Promise.resolve(), w = Math.min(860, body.clientWidth - 8);
        var btn = body.querySelector("[data-zf=more]"); if (btn) btn.remove();
        for (var n = shown + 1; n <= end; n++) (function (n) {
          chain = chain.then(function () { return doc.getPage(n); }).then(function (pg) {
            if (!document.getElementById("z1fView")) return;
            var vp0 = pg.getViewport({ scale: 1 }), sc = w / vp0.width, dpr = Math.min(2, window.devicePixelRatio || 1), vp = pg.getViewport({ scale: sc * dpr });
            var cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.width = Math.round(vp.width / dpr) + "px"; cv.className = "z1fv-page"; cv.setAttribute("aria-label", "Page " + n);
            body.appendChild(cv);
            return pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
          });
        })(n);
        shown = end;
        chain.then(function () {
          if (shown < doc.numPages && document.getElementById("z1fView")) {
            var b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.dataset.zf = "more"; b.textContent = "Show more pages (" + shown + " of " + doc.numPages + ")"; b.onclick = more; body.appendChild(b);
          }
        });
      }
      more();
    });
  }
  function closeView() { var s = document.getElementById("z1fView"); if (s) s.remove(); }

  /* ---------- save ---------- */
  function saveFile(id) {
    var f = find(id); if (!f) return;
    var cl = window.claude;
    Promise.all([cl && cl.use ? cl.use("downloads") : Promise.resolve(null), blobOf(f)]).then(function (x) {
      if (!x[0]) { say("Saving files isn't available in this view"); return; }
      return x[0].save({ filename: f.name, data: x[1] }).then(function () { say(f.name + " saved"); }, function (err) { if (err && err.code !== "dismissed" && err.code !== "declined") say("The file wasn't saved"); });
    }, function () { say("That file isn't available right now"); });
  }

  /* ---------- folders (Paolo, 2026-11-25: add, rename, move, save, delete) ---------- */
  // Folders live in the shared database as one list, meta/folders = {list: [{id, name, parent}]}.
  // A file's `folder` holds the folder id; the starting folders use their names as ids.
  function folders() { return F.folders || FOLDERS.map(function (n) { return { id: n, name: n, parent: "" }; }); }
  function fById(id) { return folders().filter(function (x) { return x.id === id; })[0] || null; }
  function fName(id) { var x = fById(id); return x ? x.name : ""; }
  function kids(pid) { return folders().filter(function (x) { return (fById(x.parent) ? x.parent : "") === pid; }).sort(function (a, b) { return a.name.localeCompare(b.name); }); }
  function under(id) { var out = [id]; kids(id).forEach(function (k) { out = out.concat(under(k.id)); }); return out; }
  function trail(id) { var t = [], x = fById(id), guard = 0; while (x && guard++ < 20) { t.unshift(x); x = fById(x.parent); } return t; }
  function where(f) { return fById(f.folder) ? f.folder : ""; }
  function pathName(id) { return trail(id).map(function (x) { return x.name; }).join(" / "); }
  function saveFolders(list) {
    F.folders = list; render();
    if (!F.db) return Promise.resolve();
    return F.db.doc("meta/folders").set({ list: list }).catch(function () { say("The folder change didn't save. Try again."); });
  }
  function newId() { return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function folderOptions(sel, skip) {
    var out = '<option value=""' + (sel === "" ? " selected" : "") + ">Top level (no folder)</option>";
    (function walk(pid, depth) {
      kids(pid).forEach(function (x) {
        if (skip && skip.indexOf(x.id) > -1) return;
        out += '<option value="' + e(x.id) + '"' + (x.id === sel ? " selected" : "") + ">" + "  ".repeat(depth) + e(x.name) + "</option>";
        walk(x.id, depth + 1);
      });
    })("", 0);
    return out;
  }

  /* ---------- built-in files: rename, move and hide (meta/builtins = {map: {b1: {name, folder, hidden}}}) ---------- */
  function builtins(all) {
    return BUILTIN.map(function (b) {
      var o = (F.bmap || {})[b.id] || {}, c = {}; for (var k in b) c[k] = b[k];
      if (o.name) { c.name = o.name; c.ext = extOf(o.name) || b.ext; }
      if (o.folder !== undefined) c.folder = o.folder;
      c.hidden = !!o.hidden; return c;
    }).filter(function (b) { return all || !b.hidden; });
  }
  function setBuiltin(id, patch) {
    var m = {}; for (var k in (F.bmap || {})) m[k] = F.bmap[k];
    var o = {}; for (var j in (m[id] || {})) o[j] = m[id][j]; for (var p in patch) o[p] = patch[p];
    m[id] = o; F.bmap = m;
    return F.db ? F.db.doc("meta/builtins").set({ map: m }) : Promise.resolve();
  }
  function setBuiltins(ids, patch) {
    var m = {}; for (var k in (F.bmap || {})) m[k] = F.bmap[k];
    ids.forEach(function (id) { var o = {}; for (var j in (m[id] || {})) o[j] = m[id][j]; for (var p in patch) o[p] = patch[p]; m[id] = o; });
    F.bmap = m;
    return F.db ? F.db.doc("meta/builtins").set({ map: m }) : Promise.resolve();
  }
  function allFiles() { return builtins().concat(F.docs); }

  /* ---------- moving files ---------- */
  function moveFiles(ids, to) {
    var b = ids.filter(function (id) { return /^b\d+$/.test(id); }), u = ids.filter(function (id) { return !/^b\d+$/.test(id); });
    var jobs = u.map(function (id) { return F.db.collection("files").doc(id).update({ folder: to }); });
    F.docs = F.docs.map(function (d) { if (u.indexOf(d.id) < 0) return d; var c = {}; for (var k in d) c[k] = d[k]; c.folder = to; return c; });
    if (b.length) jobs.push(setBuiltins(b, { folder: to }));
    render();
    return Promise.all(jobs);
  }

  /* ---------- zip (save a folder, or several files, as one file) ---------- */
  var ZIP_LIB = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", zipP = null;
  function zipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return zipP || (zipP = new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = ZIP_LIB; sc.async = true;
      sc.onload = function () { window.JSZip ? ok(window.JSZip) : no(new Error("zip")); };
      sc.onerror = function () { zipP = null; no(new Error("zip")); };
      document.head.appendChild(sc);
    }));
  }
  function saveZip(list, zipName, base) {
    if (!list.length) { say("There are no files to save here"); return; }
    var cl = window.claude, used = {};
    say("Packing " + list.length + " file" + (list.length === 1 ? "" : "s") + "…");
    Promise.all([cl && cl.use ? cl.use("downloads") : Promise.resolve(null), zipLib()]).then(function (x) {
      if (!x[0]) { say("Saving files isn't available in this view"); return; }
      var zip = new x[1]();
      return Promise.all(list.map(function (f) {
        return blobOf(f).then(function (blob) {
          var dir = base === undefined ? "" : trail(where(f)).slice(trail(base).length).map(function (t) { return t.name; }).join("/");
          var p = (dir ? dir + "/" : "") + f.name.replace(/[\\/:*?"<>|]+/g, " "), n = 2;
          while (used[p]) p = p.replace(/(\.[a-z0-9]+)?$/i, " (" + n++ + ")$1");
          used[p] = 1; zip.file(p, blob);
        }, function () { /* skip a file that won't load */ });
      })).then(function () { return zip.generateAsync({ type: "blob" }); })
        .then(function (blob) { return x[0].save({ filename: zipName.replace(/[\\/:*?"<>|]+/g, " ") + ".zip", data: blob }); })
        .then(function () { say(zipName + ".zip saved"); }, function (err) { if (err && err.code !== "dismissed" && err.code !== "declined") say("The zip file wasn't saved"); });
    }, function () { say("Saving as a zip file isn't available right now"); });
  }

  /* ---------- deleting files ---------- */
  function delFiles(ids) {
    var list = ids.map(find).filter(Boolean); if (!list.length) return;
    var ups = list.filter(function (f) { return !f.builtin; }), bis = list.filter(function (f) { return f.builtin; });
    var linked = ups.filter(function (f) { return f.slot; });
    var body = (list.length === 1 ? "<b>" + e(list[0].name) + "</b>" : "<b>" + list.length + " files</b>") + " will be removed for everyone. " +
      (bis.length ? "Built-in files are only hidden from this list and can be shown again. " : "") +
      (linked.length ? "Proposals will stop attaching " + linked.map(function (f) { return e(f.name); }).join(", ") + ". " : "") +
      (ups.length ? "Uploaded files can't be brought back." : "");
    ask(list.length === 1 ? "Delete this file?" : "Delete " + list.length + " files?", body, "Delete", function () {
      if (!F.db) { say("Deleting works when the page is opened on claude.ai by its owner or an editor"); return; }
      var jobs = ups.map(function (d) {
        return (F.assets ? F.assets.delete(d.asset) : Promise.resolve()).then(function () { return F.db.collection("files").doc(d.id).delete(); })
          .then(function () { F.docs = F.docs.filter(function (x) { return x.id !== d.id; }); return true; }, function (err) { return err && err.code === "not_uploader" ? "owner" : "fail"; });
      });
      if (bis.length) jobs.push(setBuiltins(bis.map(function (b) { return b.id; }), { hidden: true }).then(function () { return true; }, function () { return "fail"; }));
      Promise.all(jobs).then(function (r) {
        var bad = r.filter(function (x) { return x !== true; }).length;
        F.sel = {}; F.edit = null; meter(); render();
        say(bad ? bad + " couldn't be deleted. Try again." : (list.length === 1 ? list[0].name : list.length + " files") + " deleted");
      });
    });
  }

  /* ---------- editing one file ---------- */
  function saveEdit(form) {
    var d = find(F.edit); if (!d || !F.db) return;
    var name = form.querySelector("[name=name]").value.trim(), folder = form.querySelector("[name=folder]").value;
    var slotEl = form.querySelector("[name=slot]"), noteEl = form.querySelector("[name=note]");
    if (!name) { F.err = "Enter a file name."; render(); return; }
    var ext = extOf(d.name); if (ext && extOf(name) !== ext) name += "." + ext;
    name = name.slice(0, 180);
    var job;
    if (d.builtin) job = setBuiltin(d.id, { name: name, folder: folder });
    else {
      var slot = slotEl ? slotEl.value : d.slot || "", note = noteEl ? noteEl.value.trim().slice(0, 300) : d.note || "";
      var jobs = [F.db.collection("files").doc(d.id).update({ name: name, folder: folder, slot: slot, note: note })];
      if (slot) F.docs.forEach(function (o) { if (o.id !== d.id && o.slot === slot) jobs.push(F.db.collection("files").doc(o.id).update({ slot: "" })); });
      job = Promise.all(jobs);
    }
    job.then(function () { F.edit = null; F.err = ""; say("Saved"); render(); }, function () { F.err = "That didn't save. Try again."; render(); });
  }

  /* ---------- folder form: new, rename, move ---------- */
  function submitFolder(form) {
    var m = F.fform; if (!m) return;
    var list = folders().map(function (x) { return { id: x.id, name: x.name, parent: x.parent || "" }; });
    if (m.mode === "new" || m.mode === "rename") {
      var name = form.querySelector("[name=fname]").value.trim().replace(/\s+/g, " ").slice(0, 60);
      if (!name) { F.ferr = "Enter a folder name."; render(); return; }
      var parent = m.mode === "new" ? F.folder : (fById(m.id) || {}).parent || "";
      if (list.some(function (x) { return x.id !== m.id && (x.parent || "") === parent && x.name.toLowerCase() === name.toLowerCase(); })) { F.ferr = "There's already a folder called " + name + " here."; render(); return; }
      if (m.mode === "new") { list.push({ id: newId(), name: name, parent: parent }); say("Folder " + name + " added"); }
      else list.forEach(function (x) { if (x.id === m.id) x.name = name; });
    } else if (m.mode === "move") {
      var to = form.querySelector("[name=fparent]").value;
      if (under(m.id).indexOf(to) > -1) { F.ferr = "A folder can't go inside itself."; render(); return; }
      list.forEach(function (x) { if (x.id === m.id) x.parent = to; });
      say("Moved to " + (to ? fName(to) : "the top level"));
    }
    F.fform = null; F.ferr = ""; saveFolders(list);
  }
  function delFolder(id) {
    var x = fById(id); if (!x) return;
    var files = allFiles().filter(function (f) { return where(f) === id; }), subs = kids(id), up = x.parent && fById(x.parent) ? x.parent : "";
    ask("Delete the " + x.name + " folder?", "The folder is removed. " + (files.length || subs.length ? "Its " + (files.length ? files.length + " file" + (files.length === 1 ? "" : "s") : "") + (files.length && subs.length ? " and " : "") + (subs.length ? subs.length + " folder" + (subs.length === 1 ? "" : "s") : "") + (files.length + subs.length === 1 ? " moves to " : " move to ") + (up ? "<b>" + e(fName(up)) + "</b>" : "the top level") + ". No files are deleted." : "It's empty."), "Delete folder", function () {
      var list = folders().filter(function (f) { return f.id !== id; }).map(function (f) { return { id: f.id, name: f.name, parent: f.parent === id ? up : f.parent || "" }; });
      var go2 = files.length ? moveFiles(files.map(function (f) { return f.id; }), up) : Promise.resolve();
      go2.then(function () { if (F.folder === id) F.folder = up; F.fform = null; saveFolders(list); say("Folder " + x.name + " deleted"); }, function () { say("The files didn't move, so the folder was kept. Try again."); });
    });
  }

  /* ---------- the page ---------- */
  function vFiles() {
    var all = allFiles(), q = F.q.trim().toLowerCase(), can = !!(F.assets && F.db), cur = fById(F.folder) ? F.folder : "";
    if (cur !== F.folder) F.folder = cur;
    var list = q ? all.filter(function (f) { return (f.name + " " + (f.note || "") + " " + (f.slot || "")).toLowerCase().indexOf(q) > -1; }) : all.filter(function (f) { return where(f) === cur; });
    list.sort(F.sort === "name" ? function (a, b) { return a.name.localeCompare(b.name); } : F.sort === "size" ? function (a, b) { return (b.size || 0) - (a.size || 0); } : function (a, b) { return String(b.at).localeCompare(String(a.at)) || a.name.localeCompare(b.name); });
    var subs = q ? [] : kids(cur);
    function count(id) { var ids = under(id); return all.filter(function (f) { return ids.indexOf(where(f)) > -1; }).length; }

    var h = '<div class="card pad" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><div style="flex:1;min-width:220px"><h3>Files</h3><div class="muted small">One place for the team\'s templates, plan files and marketing files. Files linked to a proposal attachment are attached by the Proposal generator.</div></div>' +
      (F.db ? '<button class="btn" type="button" data-zf="refresh">Refresh</button>' : '') + (can ? '<button class="btn pri" type="button" data-zf="pick">Upload files</button><input type="file" id="z1fPick" multiple hidden>' : '') + '</div>';
    if (!can && F.ready) h += '<div class="card pad small" style="margin-bottom:12px;background:var(--info-soft);border-color:transparent">You can view and save every file here. Uploading and managing files and folders work when this page is opened on claude.ai by its owner or an editor.</div>';
    if (F.err) h += '<p class="err" role="alert" style="font-size:12px">' + e(F.err) + (F.dbg ? ' <span class="muted">(' + e(F.dbg) + ')</span>' : '') + '</p>';
    var tot = all.reduce(function (a, f) { return a + (f.size || 0); }, 0);
    h += '<div class="tiles"><div class="tile"><span class="k">Files</span><span class="v">' + all.length + '</span><span class="h">' + folders().length + " folders · " + F.docs.length + ' uploaded</span></div><div class="tile"><span class="k">Size</span><span class="v">' + kb(tot) + '</span><span class="h">' + (F.usage ? kb(F.usage.bytes) + " of " + kb(F.usage.maxBytes) + " upload space used" : "Built-in files don't use upload space") + '</span></div><div class="tile"><span class="k">Linked to proposals</span><span class="v">' + F.docs.filter(function (x) { return x.slot; }).length + " of " + slots().length + '</span><span class="h">Attachment slots filled by your uploads</span></div></div>';
    if (can) h += '<div class="z1f-drop" id="z1fDrop" data-zf="pick" role="button" tabindex="0" aria-label="Upload files">Drop files here or click to upload' + (cur ? " to <b>" + e(pathName(cur)) + "</b>" : "") + '<span class="muted small">PDF, images, Excel, Word, PowerPoint, CSV and text. Up to 15 MB (20 MB for PDFs and images). Don\'t upload clients\' IDs, medical records or member lists.</span></div>';
    if (F.up.length) h += '<div class="card pad stack small" style="margin-bottom:12px">' + F.up.map(function (j) { return '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + e(j.name) + '</b><span class="' + (j.bad ? "err" : "muted") + '">' + e(j.state) + "</span></div>"; }).join("") + "</div>";

    // folder tree
    var tree = '<nav class="z1f-tree" aria-label="Folders"><button type="button" class="z1f-node' + (cur === "" ? " on" : "") + '" data-zf="folder" data-v=""><span>All files</span><span class="muted">' + all.length + "</span></button>";
    (function walk(pid, depth) { kids(pid).forEach(function (x) { tree += '<button type="button" class="z1f-node' + (cur === x.id ? " on" : "") + '" data-zf="folder" data-v="' + e(x.id) + '" style="padding-left:' + (10 + depth * 14) + 'px"><span>📁 ' + e(x.name) + '</span><span class="muted">' + count(x.id) + "</span></button>"; walk(x.id, depth + 1); }); })("", 0);
    tree += (can ? '<button type="button" class="btn sm" data-zf="fnew" style="margin-top:6px">+ New folder</button>' : "") + "</nav>";

    // right pane: breadcrumb, folder actions, forms, bulk bar, table
    var crumbs = '<div class="z1f-crumbs"><button type="button" class="linkish" data-zf="folder" data-v="">All files</button>' + trail(cur).map(function (x) { return ' <span class="muted">›</span> <button type="button" class="linkish" data-zf="folder" data-v="' + e(x.id) + '">' + e(x.name) + "</button>"; }).join("") + "</div>";
    var acts = '<div class="actions" style="margin:0;flex-wrap:wrap">' + (can ? '<button class="btn sm" type="button" data-zf="fnew">New folder' + (cur ? " here" : "") + "</button>" : "") +
      (cur && can ? '<button class="btn sm" type="button" data-zf="fren">Rename</button><button class="btn sm" type="button" data-zf="fmove">Move</button>' : "") +
      '<button class="btn sm" type="button" data-zf="fzip">Save ' + (cur ? "folder" : "all") + " as zip</button>" +
      (cur && can ? '<button class="btn sm" type="button" data-zf="fdel" style="color:var(--bad)">Delete folder</button>' : "") + "</div>";
    var fform = "";
    if (F.fform && can) {
      var m = F.fform, fx = fById(m.id);
      fform = '<form class="z1f-form" data-zfform="folder" novalidate>' +
        (m.mode === "move" ? '<label class="fld">Move <b>' + e(fx ? fx.name : "") + '</b> into<select class="inp" name="fparent">' + folderOptions(fx ? fx.parent || "" : "", under(m.id)) + "</select></label>"
          : '<label class="fld">' + (m.mode === "new" ? "New folder name" + (cur ? " (inside " + e(fName(cur)) + ")" : "") : "Rename " + e(fx ? fx.name : "") + " to") + '<input class="inp" name="fname" id="z1fName" maxlength="60" value="' + e(m.mode === "rename" && fx ? fx.name : "") + '" autocomplete="off"></label>') +
        (F.ferr ? '<p class="err" role="alert" style="margin:0">' + e(F.ferr) + "</p>" : "") +
        '<div class="actions" style="margin:0"><button class="btn pri sm" type="submit">' + (m.mode === "new" ? "Add folder" : m.mode === "move" ? "Move folder" : "Save name") + '</button><button class="btn sm" type="button" data-zf="fcancel">Cancel</button></div></form>';
    }
    var selIds = Object.keys(F.sel || {}).filter(function (id) { return find(id); }), nSel = selIds.length;
    var bulk = nSel ? '<div class="z1f-bulk" role="region" aria-label="Selected files"><b>' + nSel + " selected</b>" +
      (can ? '<label class="small" style="display:flex;gap:6px;align-items:center">Move to<select class="inp" data-zf="bulkmove" style="width:auto;font-size:12px;padding:4px 8px"><option value="-">Choose a folder…</option>' + folderOptions("-") + "</select></label>" : "") +
      '<button class="btn sm" type="button" data-zf="bulkzip">Save as zip</button>' + (can ? '<button class="btn sm" type="button" data-zf="bulkdel" style="color:var(--bad)">Delete</button>' : "") + '<button class="btn sm" type="button" data-zf="bulkclear">Clear</button></div>' : "";
    var head = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + crumbs + '<span style="flex:1"></span>' +
      '<input class="inp" id="z1fQ" type="search" placeholder="Search all files" aria-label="Search all files" value="' + e(F.q) + '" style="width:200px;font-size:12.5px;padding:6px 10px">' +
      '<select class="inp" data-zf="sort" aria-label="Sort" style="width:auto;font-size:12.5px;padding:6px 8px"><option value="new"' + (F.sort === "new" ? " selected" : "") + '>Newest first</option><option value="name"' + (F.sort === "name" ? " selected" : "") + '>Name</option><option value="size"' + (F.sort === "size" ? " selected" : "") + ">Largest first</option></select></div>";
    var body = "";
    if (!F.ready) body += '<p class="muted small">Loading your files…</p>';
    if (q) body += '<p class="muted small" style="margin:0">Searching every folder for “' + e(F.q.trim()) + "”.</p>";
    if (!list.length && !subs.length) body += '<p class="muted small" style="margin:6px 0">' + (q ? "No files match your search." : "This folder is empty.") + "</p>";
    else {
      var allOn = list.length && list.every(function (f) { return F.sel[f.id]; });
      body += '<div class="tblwrap"><table class="t" style="min-width:760px"><tr><th style="width:26px"><input type="checkbox" data-zf="selall" aria-label="Select all files here"' + (allOn ? " checked" : "") + '></th><th>Name</th><th>' + (q ? "Folder" : "Used for") + '</th><th class="r">Size</th><th>Added</th><th class="r"></th></tr>' +
        subs.map(function (x) { return '<tr class="z1f-frow"><td></td><td colspan="2"><button type="button" class="linkish" data-zf="folder" data-v="' + e(x.id) + '"><span class="z1f-badge" style="background:#C9A227">DIR</span> <b>' + e(x.name) + '</b></button></td><td class="r muted small">' + count(x.id) + ' files</td><td></td><td class="r"><button class="btn sm" type="button" data-zf="folder" data-v="' + e(x.id) + '">Open</button></td></tr>'; }).join("") +
        list.map(function (f) { return row(f, q, can); }).join("") + "</table></div>";
    }
    var hidden = builtins(true).filter(function (b) { return b.hidden; });
    if (hidden.length && can) body += '<p class="muted small" style="margin:6px 0 0">' + hidden.length + ' built-in file' + (hidden.length === 1 ? " is" : "s are") + ' hidden. <button type="button" class="linkish" data-zf="unhide">Show ' + (hidden.length === 1 ? "it" : "them") + " again</button></p>";
    h += '<div class="z1f-cols">' + '<div class="card pad">' + tree + "</div>" + '<div class="card pad stack">' + head + acts + fform + bulk + body + "</div></div>";
    return h;
  }
  function row(f, q, can) {
    var b = BADGE[kindOf(f)];
    var r = '<tr' + (F.sel[f.id] ? ' class="z1f-on"' : "") + '><td><input type="checkbox" data-zf="sel" data-v="' + e(f.id) + '" aria-label="Select ' + e(f.name) + '"' + (F.sel[f.id] ? " checked" : "") + "></td>" +
      '<td><div style="display:flex;gap:8px;align-items:center"><span class="z1f-badge" style="background:' + b[1] + '">' + b[0] + '</span><span><b style="word-break:break-word">' + e(f.name) + "</b>" + (f.note ? '<br><span class="muted small">' + e(f.note) + "</span>" : "") + "</span></div></td>" +
      '<td class="small">' + (q ? e(pathName(where(f)) || "Top level") : f.slot ? '<span class="s s-info">' + e(f.slot) + "</span>" : f.builtin ? '<span class="muted">Built in</span>' : '<span class="muted">—</span>') + "</td>" +
      '<td class="r num">' + kb(f.size || 0) + '</td><td class="small">' + (f.builtin ? '<span class="muted">Comes with the page</span>' : e(when(f.at)) + (f.by ? '<br><span class="muted">' + e(f.by) + "</span>" : "")) + "</td>" +
      '<td class="r" style="white-space:nowrap"><button class="btn sm" type="button" data-zf="view" data-v="' + e(f.id) + '">View</button> <button class="btn sm" type="button" data-zf="save" data-v="' + e(f.id) + '">Save</button>' + (can ? ' <button class="btn sm" type="button" data-zf="edit" data-v="' + e(f.id) + '" aria-expanded="' + (F.edit === f.id) + '">Edit</button>' : "") + "</td></tr>";
    if (F.edit === f.id && can) {
      var base = f.name.replace(/\.[a-z0-9]{1,6}$/i, "");
      r += '<tr><td colspan="6" style="background:var(--sunken);padding:12px"><form data-zfform="edit" class="stack" novalidate><div class="z1-three">' +
        '<label class="fld">File name<input class="inp" name="name" maxlength="170" value="' + e(base) + '"></label>' +
        '<label class="fld">Folder<select class="inp" name="folder">' + folderOptions(where(f)) + "</select></label>" +
        (f.builtin ? '<p class="muted small" style="margin:0;align-self:end">Built-in file: the Proposal generator keeps using it under its own name.</p>'
          : '<label class="fld">Use for proposal attachment<select class="inp" name="slot"><option value="">Not linked</option>' + slots().map(function (s) { var o = bySlot(s); return '<option value="' + e(s) + '"' + (s === f.slot ? " selected" : "") + ">" + e(s) + (o && o.id !== f.id ? " (replaces " + e(o.name) + ")" : "") + "</option>"; }).join("") + "</select></label>") + "</div>" +
        (f.builtin ? "" : '<label class="fld">Note<input class="inp" name="note" maxlength="300" value="' + e(f.note || "") + '" placeholder="What it\'s for, which plan year, and so on"></label>') +
        '<div class="actions" style="margin:0"><button class="btn pri" type="submit">Save changes</button><button class="btn" type="button" data-zf="cancel">Cancel</button><span style="flex:1"></span><button class="btn" type="button" data-zf="del" data-v="' + e(f.id) + '" style="color:var(--bad)">' + (f.builtin ? "Hide file" : "Delete file") + "</button></div></form></td></tr>";
    }
    return r;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-zf]");
    if (!t) { if (ev.target && ev.target.id === "z1fView") closeView(); return; }
    var a = t.dataset.zf, v = t.dataset.v;
    if (t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type === "checkbox")) return;
    if (a === "pick") { var p = document.getElementById("z1fPick"); if (p) p.click(); return; }
    if (a === "refresh") { refresh().then(function () { meter(); say("Files refreshed"); }); return; }
    if (a === "folder") { F.folder = v || ""; F.edit = null; F.fform = null; F.q = ""; render(); return; }
    if (a === "view") { viewFile(v); return; }
    if (a === "vclose") { closeView(); return; }
    if (a === "save") { saveFile(v); return; }
    if (a === "edit") { F.edit = F.edit === v ? null : v; F.err = ""; render(); return; }
    if (a === "cancel") { F.edit = null; F.err = ""; render(); return; }
    if (a === "del") { delFiles([v]); return; }
    if (a === "fnew") { F.fform = { mode: "new" }; F.ferr = ""; render(); focusName(); return; }
    if (a === "fren") { F.fform = { mode: "rename", id: F.folder }; F.ferr = ""; render(); focusName(); return; }
    if (a === "fmove") { F.fform = { mode: "move", id: F.folder }; F.ferr = ""; render(); return; }
    if (a === "fcancel") { F.fform = null; F.ferr = ""; render(); return; }
    if (a === "fdel") { delFolder(F.folder); return; }
    if (a === "fzip") { var ids = under(F.folder), fl = allFiles().filter(function (f) { return F.folder ? ids.indexOf(where(f)) > -1 : true; }); saveZip(fl, F.folder ? fName(F.folder) : "All files", F.folder || ""); return; }
    if (a === "bulkzip") { saveZip(Object.keys(F.sel).map(find).filter(Boolean), "Selected files"); return; }
    if (a === "bulkdel") { delFiles(Object.keys(F.sel)); return; }
    if (a === "bulkclear") { F.sel = {}; render(); return; }
    if (a === "unhide") { setBuiltins(builtins(true).filter(function (b) { return b.hidden; }).map(function (b) { return b.id; }), { hidden: false }).then(function () { say("Built-in files shown again"); render(); }); return; }
  });
  function focusName() { setTimeout(function () { var n = document.getElementById("z1fName"); if (n) n.focus(); }, 0); }
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "z1fPick") { upload(t.files); t.value = ""; return; }
    if (!t.dataset) return;
    if (t.dataset.zf === "sort") { F.sort = t.value; render(); return; }
    if (t.dataset.zf === "sel") { if (t.checked) F.sel[t.dataset.v] = 1; else delete F.sel[t.dataset.v]; render(); return; }
    if (t.dataset.zf === "selall") {
      var q = F.q.trim().toLowerCase(), here = allFiles().filter(function (f) { return q ? (f.name + " " + (f.note || "") + " " + (f.slot || "")).toLowerCase().indexOf(q) > -1 : where(f) === F.folder; });
      here.forEach(function (f) { if (t.checked) F.sel[f.id] = 1; else delete F.sel[f.id]; }); render(); return;
    }
    if (t.dataset.zf === "bulkmove" && t.value !== "-") {
      var to = t.value, ids = Object.keys(F.sel).filter(function (id) { return find(id); });
      moveFiles(ids, to).then(function () { F.sel = {}; say(ids.length + " file" + (ids.length === 1 ? "" : "s") + " moved to " + (to ? fName(to) : "the top level")); render(); }, function () { say("Some files didn't move. Try again."); render(); });
    }
  });
  document.addEventListener("input", function (ev) { if (ev.target.id === "z1fQ") { F.q = ev.target.value; render(); } });
  document.addEventListener("submit", function (ev) {
    var f = ev.target; if (!f || !f.dataset) return;
    if (f.dataset.zfform === "edit") { ev.preventDefault(); ev.stopPropagation(); saveEdit(f); }
    if (f.dataset.zfform === "folder") { ev.preventDefault(); ev.stopPropagation(); submitFolder(f); }
  }, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && document.getElementById("z1fView")) { ev.stopPropagation(); closeView(); }
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.id === "z1fDrop") { ev.preventDefault(); var p = document.getElementById("z1fPick"); if (p) p.click(); }
  }, true);
  document.addEventListener("dragover", function (ev) { var d = ev.target.closest && ev.target.closest("#z1fDrop"); if (d) { ev.preventDefault(); d.classList.add("on"); } });
  document.addEventListener("dragleave", function (ev) { var d = ev.target.closest && ev.target.closest("#z1fDrop"); if (d) d.classList.remove("on"); });
  document.addEventListener("drop", function (ev) { var d = ev.target.closest && ev.target.closest("#z1fDrop"); if (d) { ev.preventDefault(); d.classList.remove("on"); upload(ev.dataTransfer.files); } });

  var css = document.createElement("style");
  css.textContent = ".z1f-badge{display:inline-grid;place-items:center;min-width:34px;height:20px;border-radius:5px;color:#fff;font:700 9.5px var(--body);letter-spacing:.04em;flex:none}" +
    ".z1f-drop{display:grid;gap:4px;justify-items:center;text-align:center;border:2px dashed var(--line);border-radius:12px;padding:18px 12px;margin-bottom:12px;cursor:pointer;font-weight:600;font-size:13px;color:var(--ink,inherit);background:var(--surface)}.z1f-drop.on,.z1f-drop:hover{border-color:var(--brand);background:var(--brand-soft)}" +
    "#z1fView{position:fixed;inset:0;z-index:9999;background:rgba(10,20,40,.72);display:flex;flex-direction:column;align-items:center;overflow:auto;padding:14px 10px 40px}" +
    ".z1fv-bar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface,#fff);color:var(--ink,#111);border-radius:10px;padding:8px 12px;margin-bottom:12px;max-width:900px;width:100%;box-shadow:0 2px 10px rgba(0,0,0,.25)}.z1fv-bar b{word-break:break-word}" +
    ".z1fv-body{max-width:900px;width:100%;display:grid;gap:14px;justify-items:center}.z1fv-body>.tblwrap,.z1fv-body>.chips,.z1fv-body>pre,.z1fv-body>p{justify-self:stretch}" +
    ".z1fv-body>.tblwrap,.z1fv-text,.z1fv-none{background:var(--surface,#fff);color:var(--ink,#111);border-radius:10px;padding:12px}.z1fv-body>.chips{background:var(--surface,#fff);border-radius:10px;padding:8px;margin:0}" +
    ".z1fv-sheet td,.z1fv-sheet th{white-space:pre-wrap;min-width:60px;max-width:280px}.z1fv-text{white-space:pre-wrap;word-break:break-word;font-size:12px;margin:0;max-height:none}" +
    ".z1f-cols{display:grid;grid-template-columns:230px minmax(0,1fr);gap:12px;align-items:start}@media (max-width:820px){.z1f-cols{grid-template-columns:1fr}}" +
    ".z1f-tree{display:grid;gap:2px}.z1f-node{display:flex;justify-content:space-between;gap:8px;text-align:left;border:0;background:transparent;color:inherit;font:600 12.5px var(--body);padding:6px 10px;border-radius:8px;cursor:pointer}.z1f-node:hover{background:var(--sunken)}.z1f-node.on{background:var(--brand-soft);color:var(--brand)}" +
    ".z1f-crumbs{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:13px}.linkish{border:0;background:none;padding:0;color:var(--brand);font:600 13px var(--body);cursor:pointer;text-align:left}.linkish:hover{text-decoration:underline}" +
    ".z1f-form{display:grid;gap:8px;background:var(--sunken);border-radius:10px;padding:12px}.z1f-bulk{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--brand-soft);border-radius:10px;padding:8px 12px}" +
    "tr.z1f-on td{background:var(--brand-soft)}.z1f-frow td{background:var(--surface)}" +
    ".z1fv-img{max-width:100%;border-radius:8px;background:#fff}.z1fv-page{max-width:100%;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.35)}.z1fv-none{display:grid;gap:10px;justify-items:center;text-align:center;max-width:460px}";
  document.head.appendChild(css);

  /* ---------- menu: Settings > Files, and Setup renamed Settings ---------- */
  (function () {
    var g = NAV.filter(function (x) { return x[0] === "Setup" || x[0] === "Settings"; })[0];
    if (!g) { g = ["Settings", []]; NAV.push(g); }
    g[0] = "Settings";
    if (!g[1].some(function (it) { return it[0] === "files"; })) g[1].unshift(["files", "Files"]);
  })();
  VIEWS.files = vFiles;
  if (S.view === "files") render(); else if (typeof renderNav === "function") renderNav();
  // For the chat box (v77): give files to the AI employees. They land in a "Chat files" folder here.
  window.Z1Files.upload = upload;
  window.Z1Files.view = function (id) { viewFile(id); };
  window.Z1Files.ready = function () { return !!(F.assets && F.db); };
  window.Z1Files.rows = function () { return F.docs.slice(); };
  window.Z1Files.chatFolder = function () {
    var list = folders(), hit = list.filter(function (x) { return x.name === "Chat files" && !fById(x.parent); })[0];
    if (hit) return hit.id;
    var id = "chat-files"; saveFolders(list.concat([{ id: id, name: "Chat files", parent: "" }])); return id;
  };
  // Subscriptions & expenses receipts (2026-11-26): a top-level folder by name, made if missing.
  window.Z1Files.folder = function (name, id) {
    var list = folders(), hit = list.filter(function (x) { return x.name === name && !fById(x.parent); })[0];
    if (hit) return hit.id;
    saveFolders(list.concat([{ id: id, name: name, parent: "" }])); return id;
  };
})();
