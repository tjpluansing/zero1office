/* zero1office add-on: receipts on Subscriptions & expenses (Paolo, 2026-11-26: 'Add a "Upload receipts" button').
   - "Upload receipts" button at the top of the page: pick one or more photos or PDFs; they are stored in
     Settings > Files > Receipts (through Z1Files, the Files page's uploader).
   - The add/edit form gets a "Receipt" file field: the file is uploaded and linked to that subscription or expense,
     and an expense with a receipt is marked "Filed".
   - Rows with a linked receipt get a "Receipt" button that opens it. Needs files.js (Z1Files). */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.spend || window.__z1Rcpt || !window.Z1Files) return;
  window.__z1Rcpt = true;
  var ACCEPT = "image/*,application/pdf";
  function g(id) { return document.getElementById(id); }
  function folder() { return Z1Files.folder ? Z1Files.folder("Receipts", "receipts") : ""; }
  function canUp() { return Z1Files.ready && Z1Files.ready(); }

  var picker = document.createElement("input");
  picker.type = "file"; picker.multiple = true; picker.accept = ACCEPT; picker.hidden = true; picker.id = "z1RcptPick";
  document.body.appendChild(picker);
  picker.addEventListener("change", function () {
    var files = picker.files; if (!files || !files.length) return;
    var n = files.length, ok = 0, bad = 0;
    toast("Uploading " + n + " receipt" + (n > 1 ? "s" : "") + "…");
    Z1Files.upload(files, {
      folder: folder(), note: "Receipt",
      done: function () { ok++; if (ok + bad === n) toast(ok + " receipt" + (ok > 1 ? "s" : "") + " saved in Settings > Files > Receipts" + (bad ? ", " + bad + " didn't upload" : "")); },
      failed: function (m) { bad++; if (ok + bad === n) toast((ok ? ok + " saved, " : "") + bad + " didn't upload: " + m); }
    });
    picker.value = "";
  });

  /* Receipt field in the add/edit form (the form may have been replaced by usdspend.js, so look it up by id). */
  var form = g("spForm"), payLbl = g("sp-pay") && g("sp-pay").closest("label");
  if (form && payLbl) {
    var fld = document.createElement("div");
    fld.className = "fld";
    fld.innerHTML = 'Receipt (optional)<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="sp-rfile" accept="' + ACCEPT + '" style="font-size:12px;max-width:100%"><span class="muted" id="sp-rcur" style="font-weight:500;font-size:11.5px"></span></span>';
    payLbl.parentNode.insertBefore(fld, payLbl.nextSibling);
  }

  function recOf(kind, id) { var arr = kind === "subs" ? S.data.subs : S.data.expenses; return arr.filter(function (r) { return r.id === id; })[0]; }
  function fileName(fid) { var r = (Z1Files.rows ? Z1Files.rows() : []).filter(function (d) { return d.id === fid; })[0]; return r ? r.name : "a receipt"; }

  var origOpen = openSp;
  openSp = function (kind, id) {
    origOpen(kind, id);
    var x = id ? recOf(kind, id) : null, f = g("sp-rfile"), cur = g("sp-rcur");
    if (f) { f.value = ""; f.disabled = !canUp(); }
    if (cur) cur.textContent = !canUp() ? "Uploading works when the page is opened on claude.ai by its owner or an editor." : x && x.rcptFile ? "Linked: " + fileName(x.rcptFile) + ". Pick a file to replace it." : "";
  };

  if (form) form.addEventListener("submit", function () {
    var f = g("sp-rfile"), k = S.spEdit;
    if (!f || !f.files || !f.files.length || !k || !g("spScrim").hidden) return; // nothing picked, or the form didn't save
    var arr = k.kind === "subs" ? S.data.subs : S.data.expenses, rec = k.id ? recOf(k.kind, k.id) : arr[arr.length - 1];
    if (!rec) return;
    var files = f.files, recId = rec.id, kind = k.kind;
    toast("Uploading the receipt…");
    Z1Files.upload(files, {
      folder: folder(), note: "Receipt for " + (rec.n || rec.x || ""),
      done: function (row) {
        var r = recOf(kind, recId); if (!r || !row || !row.id) return;
        r.rcptFile = row.id; if (kind === "exp") r.rcpt = true;
        save(); render(); toast("Receipt linked to " + (r.n || r.x));
      },
      failed: function (m) { toast("The receipt didn't upload: " + m); }
    });
    f.value = "";
  });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-z1rc]");
    if (b) { ev.preventDefault(); ev.stopPropagation(); Z1Files.view(b.getAttribute("data-z1rc")); return; }
    var u = ev.target.closest && ev.target.closest("[data-z1rup]");
    if (u) {
      ev.preventDefault(); ev.stopPropagation();
      if (!canUp()) { toast("Uploading works when the page is opened on claude.ai by its owner or an editor"); return; }
      picker.click();
    }
  }, true);

  var origView = VIEWS.spend;
  VIEWS.spend = function () {
    var h = origView.apply(this, arguments);
    var add = h.indexOf('data-act="spadd"'), btnStart = add > -1 ? h.lastIndexOf("<button", add) : -1;
    if (btnStart > -1) {
      h = h.slice(0, btnStart) + '<span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-z1rup="1">Upload receipts</button>' +
        h.slice(btnStart).replace("</button>", "</button></span>");
    }
    [["subs", S.data.subs || []], ["exp", S.data.expenses || []]].forEach(function (p) {
      p[1].forEach(function (r) {
        if (!r.rcptFile) return;
        var key = '<button class="btn sm" data-act="spedit" data-v="' + p[0] + '" data-id="' + r.id + '">';
        h = h.replace(key, '<button class="btn sm" type="button" data-z1rc="' + r.rcptFile + '" title="Open the receipt">Receipt</button> ' + key);
      });
    });
    return h;
  };

  if (S.view === "spend") render();
})();
