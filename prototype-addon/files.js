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

  var F = { db: null, assets: null, docs: [], ready: false, err: "", folder: "All", q: "", sort: "new", edit: null, up: [], usage: null };

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
  window.Z1Files = { blob: blobOf, forSlot: bySlot };

  /* ---------- connect to the artifact's storage ---------- */
  (function connect() {
    var cl = window.claude;
    if (!cl || !cl.use) { F.ready = true; return; }
    var timer = setTimeout(function () { if (!F.ready) { F.ready = true; F.err = "Your uploaded files didn't load. Reload the page to try again."; rer(); } }, 10000);
    Promise.all([cl.use("db"), cl.use("assets")]).then(function (x) {
      F.db = x[0]; F.assets = x[1];
      if (!F.db) { clearTimeout(timer); F.ready = true; rer(); return; }
      F.db.collection("files").onSnapshot(function (snap) {
        clearTimeout(timer); F.ready = true; F.err = "";
        F.docs = snap.docs.map(function (d) { var o = Object.assign({}, d.data() || {}); o.id = d.id; o.ext = extOf(o.name); return o; })  // snapshots are frozen: copy before adding fields.filter(function (o) { return o.name && o.asset; });
        rer();
      }, function () { clearTimeout(timer); F.ready = true; F.err = "Your uploaded files didn't load. Reload the page to try again."; rer(); });
      meter();
    }, function () { clearTimeout(timer); F.ready = true; rer(); });
  })();
  function meter() { if (F.assets) F.assets.list().then(function (r) { F.usage = r.usage; rer(); }, function () { /* housekeeping only */ }); }
  function rer() { if (S.view === "files") render(); }

  /* ---------- upload ---------- */
  function upload(list) {
    if (!F.assets || !F.db) { say("Uploading works when the page is opened on claude.ai by its owner or an editor"); return; }
    var folder = F.folder === "All" ? "Other" : F.folder;
    Array.prototype.forEach.call(list, function (file) {
      var ext = extOf(file.name), job = { name: file.name, state: "Uploading…" }; F.up.push(job);
      var fail = function (m) { job.state = m; job.bad = true; rer(); setTimeout(function () { F.up = F.up.filter(function (j) { return j !== job; }); rer(); }, 6000); };
      if (!ext || BLOCKED.indexOf(ext) > -1) { fail("This type of file can't be stored here"); return; }
      var native = NATIVE[ext], max = native ? (ext === "svg" ? 2 * MB : 20 * MB) : 15 * MB;
      if (file.size > max) { fail("Too big: the limit is " + Math.round(max / MB) + " MB for this type"); return; }
      var body = native ? Promise.resolve(file) : file.arrayBuffer().then(function (b) { return new Blob([bufToB64(b)], { type: "text/plain" }); });
      body.then(function (blob) { return F.assets.upload(blob, { type: native || "text/plain" }); })
        .then(function (r) {
          return F.db.collection("files").add({ name: file.name.slice(0, 180), folder: folder, size: file.size, mime: native || WRAPPED[ext] || "application/octet-stream", asset: r.id, wrap: !native, slot: "", note: "", at: new Date().toISOString(), by: who() });
        })
        .then(function () { F.up = F.up.filter(function (j) { return j !== job; }); say(file.name + " uploaded"); meter(); rer(); },
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
  function find(id) { return BUILTIN.concat(F.docs).filter(function (x) { return x.id === id; })[0]; }
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

  /* ---------- edit and delete ---------- */
  function saveEdit(form) {
    var d = F.docs.filter(function (x) { return x.id === F.edit; })[0]; if (!d || !F.db) return;
    var name = form.querySelector("[name=name]").value.trim(), folder = form.querySelector("[name=folder]").value, slot = form.querySelector("[name=slot]").value, note = form.querySelector("[name=note]").value.trim().slice(0, 300);
    if (!name) { F.err = "Enter a file name."; render(); return; }
    var ext = extOf(d.name); if (ext && extOf(name) !== ext) name += "." + ext;
    var jobs = [F.db.collection("files").doc(d.id).update({ name: name.slice(0, 180), folder: folder, slot: slot, note: note })];
    if (slot) F.docs.forEach(function (o) { if (o.id !== d.id && o.slot === slot) jobs.push(F.db.collection("files").doc(o.id).update({ slot: "" })); });
    Promise.all(jobs).then(function () { F.edit = null; F.err = ""; say("Saved"); render(); }, function () { F.err = "That didn't save. Try again."; render(); });
  }
  function del(id) {
    var d = F.docs.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var go2 = function () {
      if (!F.assets || !F.db) { say("Deleting works when the page is opened on claude.ai by its owner or an editor"); return; }
      F.assets.delete(d.asset).then(function () { return F.db.collection("files").doc(d.id).delete(); })
        .then(function () { if (F.edit === id) F.edit = null; say(d.name + " deleted"); meter(); render(); }, function (err) { say(err && err.code === "not_uploader" ? "Only the person who uploaded it can delete it" : "It wasn't deleted. Try again."); });
    };
    ask("Delete this file?", "<b>" + e(d.name) + "</b> will be removed for everyone" + (d.slot ? ", and proposals will stop attaching it as " + e(d.slot) : "") + ". This can't be undone.", "Delete", go2);
  }

  /* ---------- the page ---------- */
  function vFiles() {
    var all = BUILTIN.concat(F.docs), q = F.q.toLowerCase();
    var counts = {}; all.forEach(function (f) { counts[f.folder] = (counts[f.folder] || 0) + 1; });
    var list = all.filter(function (f) { return (F.folder === "All" || f.folder === F.folder) && (!q || (f.name + " " + (f.note || "") + " " + (f.slot || "")).toLowerCase().indexOf(q) > -1); });
    list.sort(F.sort === "name" ? function (a, b) { return a.name.localeCompare(b.name); } : F.sort === "size" ? function (a, b) { return (b.size || 0) - (a.size || 0); } : function (a, b) { return String(b.at).localeCompare(String(a.at)) || a.name.localeCompare(b.name); });
    var can = !!(F.assets && F.db);
    var h = '<div class="card pad" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><div style="flex:1;min-width:220px"><h3>Files</h3><div class="muted small">One place for the team\'s templates, plan files and marketing files. Files linked to a proposal attachment are attached by the Proposal generator.</div></div>' +
      (can ? '<button class="btn pri" type="button" data-zf="pick">Upload files</button><input type="file" id="z1fPick" multiple hidden>' : '') + '</div>';
    if (!can && F.ready) h += '<div class="card pad small" style="margin-bottom:12px;background:var(--info-soft);border-color:transparent">You can view and save every file here. Uploading, renaming and deleting work when this page is opened on claude.ai by its owner or an editor.</div>';
    if (F.err) h += '<p class="err" role="alert" style="font-size:12px">' + e(F.err) + '</p>';
    var tot = all.reduce(function (a, f) { return a + (f.size || 0); }, 0);
    h += '<div class="tiles"><div class="tile"><span class="k">Files</span><span class="v">' + all.length + '</span><span class="h">' + BUILTIN.length + " built in · " + F.docs.length + ' uploaded</span></div><div class="tile"><span class="k">Size</span><span class="v">' + kb(tot) + '</span><span class="h">' + (F.usage ? kb(F.usage.bytes) + " of " + kb(F.usage.maxBytes) + " upload space used" : "Built-in files don't use upload space") + '</span></div><div class="tile"><span class="k">Linked to proposals</span><span class="v">' + F.docs.filter(function (x) { return x.slot; }).length + " of " + slots().length + '</span><span class="h">Attachment slots filled by your uploads</span></div></div>';
    if (can) h += '<div class="z1f-drop" id="z1fDrop" data-zf="pick" role="button" tabindex="0" aria-label="Upload files">Drop files here or click to upload' + (F.folder !== "All" ? " to <b>" + e(F.folder) + "</b>" : "") + '<span class="muted small">PDF, images, Excel, Word, PowerPoint, CSV and text. Up to 15 MB (20 MB for PDFs and images). Don\'t upload clients\' IDs, medical records or member lists.</span></div>';
    if (F.up.length) h += '<div class="card pad stack small" style="margin-bottom:12px">' + F.up.map(function (j) { return '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + e(j.name) + '</b><span class="' + (j.bad ? "err" : "muted") + '">' + e(j.state) + "</span></div>"; }).join("") + "</div>";
    h += '<div class="card pad stack"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class="chips" role="group" aria-label="Folder" style="flex:1;margin:0">' + ["All"].concat(FOLDERS).filter(function (x) { return x === "All" || counts[x] || x === F.folder; }).map(function (x) {
      return '<button class="chip" type="button" data-zf="folder" data-v="' + e(x) + '" aria-pressed="' + (F.folder === x) + '">' + e(x) + ' <span class="muted">' + (x === "All" ? all.length : counts[x] || 0) + "</span></button>";
    }).join("") + (can ? '<select class="inp" data-zf="folderAny" aria-label="Other folders" style="width:auto;font-size:12px;padding:4px 8px"><option value="">More folders…</option>' + FOLDERS.filter(function (x) { return !counts[x] && x !== F.folder; }).map(function (x) { return "<option>" + e(x) + "</option>"; }).join("") + "</select>" : "") + '</div>' +
      '<input class="inp" id="z1fQ" type="search" placeholder="Search files" aria-label="Search files" value="' + e(F.q) + '" style="width:200px;font-size:12.5px;padding:6px 10px">' +
      '<select class="inp" data-zf="sort" aria-label="Sort" style="width:auto;font-size:12.5px;padding:6px 8px"><option value="new"' + (F.sort === "new" ? " selected" : "") + '>Newest first</option><option value="name"' + (F.sort === "name" ? " selected" : "") + '>Name</option><option value="size"' + (F.sort === "size" ? " selected" : "") + ">Largest first</option></select></div>";
    if (!F.ready) h += '<p class="muted small">Loading your files…</p>';
    if (!list.length) h += '<p class="muted small" style="margin:6px 0">' + (q ? "No files match your search." : "No files in this folder yet.") + "</p>";
    else h += '<div class="tblwrap"><table class="t" style="min-width:720px"><tr><th>Name</th><th>Folder</th><th>Used for</th><th class="r">Size</th><th>Added</th><th class="r"></th></tr>' + list.map(row).join("") + "</table></div>";
    h += "</div>";
    return h;
  }
  function row(f) {
    var b = BADGE[kindOf(f)];
    var r = '<tr><td><div style="display:flex;gap:8px;align-items:center"><span class="z1f-badge" style="background:' + b[1] + '">' + b[0] + '</span><span><b style="word-break:break-word">' + e(f.name) + "</b>" + (f.note ? '<br><span class="muted small">' + e(f.note) + "</span>" : "") + "</span></div></td>" +
      "<td>" + e(f.folder) + "</td><td class=\"small\">" + (f.slot ? '<span class="s s-info">' + e(f.slot) + "</span>" : f.builtin ? '<span class="muted">Built in</span>' : '<span class="muted">—</span>') + "</td>" +
      '<td class="r num">' + kb(f.size || 0) + '</td><td class="small">' + (f.builtin ? '<span class="muted">Comes with the page</span>' : e(when(f.at)) + (f.by ? '<br><span class="muted">' + e(f.by) + "</span>" : "")) + "</td>" +
      '<td class="r" style="white-space:nowrap"><button class="btn sm" type="button" data-zf="view" data-v="' + e(f.id) + '">View</button> <button class="btn sm" type="button" data-zf="save" data-v="' + e(f.id) + '">Save</button>' + (!f.builtin && F.assets ? ' <button class="btn sm" type="button" data-zf="edit" data-v="' + e(f.id) + '">Edit</button>' : "") + "</td></tr>";
    if (F.edit === f.id) {
      var base = f.name.replace(/\.[a-z0-9]{1,6}$/i, "");
      r += '<tr><td colspan="6" style="background:var(--sunken);padding:12px"><form data-zfform="edit" class="stack" novalidate><div class="z1-three">' +
        '<label class="fld">File name<input class="inp" name="name" maxlength="170" value="' + e(base) + '"></label>' +
        '<label class="fld">Folder<select class="inp" name="folder">' + FOLDERS.map(function (x) { return "<option" + (x === f.folder ? " selected" : "") + ">" + e(x) + "</option>"; }).join("") + "</select></label>" +
        '<label class="fld">Use for proposal attachment<select class="inp" name="slot"><option value="">Not linked</option>' + slots().map(function (s) { var o = bySlot(s); return '<option value="' + e(s) + '"' + (s === f.slot ? " selected" : "") + ">" + e(s) + (o && o.id !== f.id ? " (replaces " + e(o.name) + ")" : "") + "</option>"; }).join("") + "</select></label></div>" +
        '<label class="fld">Note<input class="inp" name="note" maxlength="300" value="' + e(f.note || "") + '" placeholder="What it\'s for, which plan year, and so on"></label>' +
        '<div class="actions" style="margin:0"><button class="btn pri" type="submit">Save changes</button><button class="btn" type="button" data-zf="cancel">Cancel</button><span style="flex:1"></span><button class="btn" type="button" data-zf="del" data-v="' + e(f.id) + '" style="color:var(--bad)">Delete file</button></div></form></td></tr>';
    }
    return r;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-zf]");
    if (!t) { if (ev.target && ev.target.id === "z1fView") closeView(); return; }
    var a = t.dataset.zf, v = t.dataset.v;
    if (t.tagName === "SELECT") return;
    if (a === "pick") { var p = document.getElementById("z1fPick"); if (p) p.click(); return; }
    if (a === "folder") { F.folder = v; F.edit = null; render(); return; }
    if (a === "view") { viewFile(v); return; }
    if (a === "vclose") { closeView(); return; }
    if (a === "save") { saveFile(v); return; }
    if (a === "edit") { F.edit = F.edit === v ? null : v; F.err = ""; render(); return; }
    if (a === "cancel") { F.edit = null; F.err = ""; render(); return; }
    if (a === "del") { del(v); return; }
  });
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "z1fPick") { upload(t.files); t.value = ""; return; }
    if (t.dataset && t.dataset.zf === "sort") { F.sort = t.value; render(); return; }
    if (t.dataset && t.dataset.zf === "folderAny" && t.value) { F.folder = t.value; render(); }
  });
  document.addEventListener("input", function (ev) { if (ev.target.id === "z1fQ") { F.q = ev.target.value; render(); } });
  document.addEventListener("submit", function (ev) { if (ev.target && ev.target.dataset && ev.target.dataset.zfform === "edit") { ev.preventDefault(); ev.stopPropagation(); saveEdit(ev.target); } }, true);
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
})();
