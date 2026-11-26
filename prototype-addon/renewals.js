/* zero1office add-on: Renewals list (Paolo, 2026-11-26, for Owen: "A Renewals list in the app").
   Numbers > Renewals: Karla or the assistant enters each client account, its insurer and its renewal date.
   Only names and dates are kept, no member details. Owen (Renewals Manager) starts work 60 days before each
   renewal; that part lives in agentlive.js. Saved in S.data.renewals. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || typeof NAV === "undefined" || window.__z1Renew) return;
  window.__z1Renew = true;
  if (!Array.isArray(S.data.renewals)) S.data.renewals = [];

  (function () {
    var num = NAV.filter(function (g) { return g[0] === "Numbers"; })[0];
    if (!num || num[1].some(function (it) { return it[0] === "renewals"; })) return;
    var at = num[1].length; num[1].forEach(function (it, i) { if (it[0] === "clients") at = i + 1; });
    num[1].splice(at, 0, ["renewals", "Renewals"]);
  })();

  var R = { edit: null, err: "" };
  function pad(n) { return String(n).padStart(2, "0"); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function daysTo(d) { return Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function nice(d) { return MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4); }
  function insurers() {
    var n = (S.data.companies || []).map(function (c) { return c.n; });
    ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"].forEach(function (x) { if (n.indexOf(x) < 0) n.push(x); });
    return n;
  }
  function status(r) {
    if (r.done) return '<span class="muted">Renewed</span>';
    var n = daysTo(r.date);
    if (n < 0) return '<b style="color:var(--bad,#c0392b)">' + (-n) + " d overdue</b>";
    if (n <= 60) return "<b>In " + n + " d</b>";
    return '<span class="muted">In ' + n + " d</span>";
  }

  window.Z1Renewals = {
    open: function () { return S.data.renewals.filter(function (r) { return !r.done; }); },
    daysTo: daysTo, nice: nice,
  };

  function form() {
    var r = R.edit && R.edit !== "new" ? S.data.renewals.filter(function (x) { return x.id === R.edit; })[0] : null;
    return '<form class="card pad stack" data-form="z1renew" style="margin-bottom:12px">' +
      '<h3 style="margin:0">' + (r ? "Edit renewal" : "Add a renewal") + '</h3>' +
      '<div class="two"><label class="fld" for="rn-acct">Client account<input class="inp" id="rn-acct" maxlength="100" value="' + esc(r ? r.acct : "") + '" placeholder="e.g. Northpoint Logistics"></label>' +
      '<label class="fld" for="rn-ins">Insurer<select class="inp" id="rn-ins">' + insurers().map(function (n) { return "<option" + (r && r.ins === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + '</select></label></div>' +
      '<div class="two"><label class="fld" for="rn-date">Renewal date<input class="inp" type="date" id="rn-date" value="' + esc(r ? r.date : "") + '"></label>' +
      '<label class="fld" for="rn-note">Note (optional)<input class="inp" id="rn-note" maxlength="140" value="' + esc(r ? r.note || "" : "") + '" placeholder="e.g. 40 heads, wants a lower MBL"></label></div>' +
      '<p class="small" style="color:var(--bad,#c0392b);margin:0" role="alert">' + esc(R.err) + '</p>' +
      '<div style="display:flex;gap:8px"><button class="btn pri" type="submit">' + (r ? "Save changes" : "Add renewal") + '</button><button class="btn" type="button" data-zr="cancel">Cancel</button></div></form>';
  }

  VIEWS.renewals = function () {
    var list = S.data.renewals.slice().sort(function (a, b) { return (a.done - b.done) || a.date.localeCompare(b.date); });
    var soon = list.filter(function (r) { return !r.done && daysTo(r.date) <= 60; }).length;
    var rows = list.map(function (r) {
      return '<tr><td><b>' + esc(r.acct) + '</b>' + (r.note ? '<div class="muted small">' + esc(r.note) + '</div>' : '') + '</td><td>' + esc(r.ins) + '</td><td>' + esc(nice(r.date)) + '</td><td>' + status(r) + '</td>' +
        '<td style="white-space:nowrap;text-align:right">' + (r.done ? '<button class="btn sm" data-zr="undo" data-id="' + r.id + '">Not renewed</button> ' : '<button class="btn sm pri" data-zr="done" data-id="' + r.id + '">Renewed</button> ') +
        '<button class="btn sm" data-zr="edit" data-id="' + r.id + '">Edit</button> <button class="btn sm danger" data-zr="del" data-id="' + r.id + '">Delete</button></td></tr>';
    }).join("");
    return '<div class="ph"><div><h2>Renewals</h2><p>Each client account and when its plan renews. ' + (typeof nn === "function" ? nn("owen") : "Owen") + ' starts work 60 days before each date.' + (soon ? " <b>" + soon + " due within 60 days.</b>" : "") + '</p></div>' +
      (R.edit ? "" : '<button class="btn gold" data-zr="add">+ Add renewal</button>') + '</div>' +
      (R.edit ? form() : "") +
      '<div class="card pad">' + (list.length ? '<div class="tblwrap"><table class="t" style="min-width:700px"><tr><th>Account</th><th>Insurer</th><th>Renews</th><th>Status</th><th></th></tr>' + rows + '</table></div>'
        : '<div class="empty">No renewals yet. Use + Add renewal to add the first account.</div>') +
      '<p class="small muted" style="margin-top:10px">Only the account name, insurer and date are kept here. Member details stay with the insurer.</p></div>';
  };

  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zr]"); if (!b) return;
    ev.preventDefault();
    var k = b.getAttribute("data-zr"), id = b.getAttribute("data-id"), r = S.data.renewals.filter(function (x) { return x.id === id; })[0];
    if (k === "add") { R.edit = "new"; R.err = ""; render(); var f = document.getElementById("rn-acct"); if (f) f.focus(); }
    else if (k === "cancel") { R.edit = null; render(); }
    else if (k === "edit" && r) { R.edit = id; R.err = ""; render(); }
    else if ((k === "done" || k === "undo") && r) { r.done = k === "done"; save(); render(); toast(r.done ? r.acct + " marked renewed." : r.acct + " is open again."); }
    else if (k === "del" && r) {
      ask("Delete this renewal?", "<b>" + esc(r.acct) + "</b> (" + esc(r.ins) + ", " + esc(nice(r.date)) + ") will be removed.", "Delete", function () {
        S.data.renewals = S.data.renewals.filter(function (x) { return x.id !== id; }); save(); render(); toast("Deleted.");
      });
    }
  });
  document.addEventListener("submit", function (ev) {
    var f = ev.target; if (!f || f.getAttribute("data-form") !== "z1renew") return;
    ev.preventDefault();
    var g = function (i) { return document.getElementById(i).value.trim(); };
    var acct = g("rn-acct"), ins = g("rn-ins"), date = g("rn-date"), note = g("rn-note");
    R.err = !acct ? "Name the client account." : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick the renewal date." : "";
    if (R.err) { render(); return; }
    if (R.edit === "new") { S.data.renewals.push({ id: uid("rn"), acct: acct, ins: ins, date: date, note: note, done: false }); toast(acct + " added."); }
    else { var r = S.data.renewals.filter(function (x) { return x.id === R.edit; })[0]; if (r) { r.acct = acct; r.ins = ins; r.date = date; r.note = note; } toast("Saved changes to " + acct + "."); }
    R.edit = null; save(); render();
  });
  if (S.view === "renewals") render();
})();
