/* zero1office add-on: Licenses list, for Enzo (Licensing & Training Coordinator), built like Renewals (Paolo, 2026-11-26:
   "Lets make them all active 1 at a time"). Settings > Licenses: each license or accreditation, who holds it, who issues it
   and when it expires. Enzo starts the renewal 90 days before; that part lives in agentlive.js. Saved in S.data.licenses. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || typeof NAV === "undefined" || window.__z1Lic) return;
  window.__z1Lic = true;
  if (!Array.isArray(S.data.licenses)) S.data.licenses = [];

  (function () {
    var num = NAV.filter(function (g) { return g[0] === "Settings"; })[0];
    if (!num || num[1].some(function (it) { return it[0] === "licenses"; })) return;
    var at = num[1].length; num[1].forEach(function (it, i) { if (it[0] === "companies") at = i + 1; });
    num[1].splice(at, 0, ["licenses", "Licenses"]);
  })();

  var R = { edit: null, err: "" };
  function pad(n) { return String(n).padStart(2, "0"); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function daysTo(d) { return Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function nice(d) { return MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4); }
  function insurers() {
    var n = ["Insurance Commission"].concat((S.data.companies || []).map(function (c) { return c.n; }));
    ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"].forEach(function (x) { if (n.indexOf(x) < 0) n.push(x); });
    return n;
  }
  function status(r) {
    if (r.done) return '<span class="muted">Renewed</span>';
    var n = daysTo(r.date);
    if (n < 0) return '<b style="color:var(--bad,#c0392b)">Expired ' + (-n) + " d ago</b>";
    if (n <= 90) return "<b>In " + n + " d</b>";
    return '<span class="muted">In ' + n + " d</span>";
  }

  window.Z1Licenses = {
    open: function () { return S.data.licenses.filter(function (r) { return !r.done; }); },
    daysTo: daysTo, nice: nice,
  };

  function form() {
    var r = R.edit && R.edit !== "new" ? S.data.licenses.filter(function (x) { return x.id === R.edit; })[0] : null;
    return '<form class="card pad stack" data-form="z1lic" style="margin-bottom:12px">' +
      '<h3 style="margin:0">' + (r ? "Edit license" : "Add a license or accreditation") + '</h3>' +
      '<div class="two"><label class="fld" for="lc-acct">License or accreditation<input class="inp" id="lc-acct" maxlength="100" value="' + esc(r ? r.acct : "") + '" placeholder="e.g. IC agent license, Maxicare accreditation"></label>' +
      '<label class="fld" for="lc-ins">Issued by<input class="inp" id="lc-ins" list="lc-insl" maxlength="80" value="' + esc(r ? r.ins : "") + '" placeholder="e.g. Insurance Commission"><datalist id="lc-insl">' + insurers().map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") + '</datalist></label></div>' +
      '<div class="two"><label class="fld" for="lc-date">Expires on<input class="inp" type="date" id="lc-date" value="' + esc(r ? r.date : "") + '"></label>' +
      '<label class="fld" for="lc-note">Held by (optional)<input class="inp" id="lc-note" maxlength="140" value="' + esc(r ? r.note || "" : "") + '" placeholder="e.g. Karla, or Ask Karla Insurance Agency"></label></div>' +
      '<p class="small" style="color:var(--bad,#c0392b);margin:0" role="alert">' + esc(R.err) + '</p>' +
      '<div style="display:flex;gap:8px"><button class="btn pri" type="submit">' + (r ? "Save changes" : "Add license") + '</button><button class="btn" type="button" data-zl="cancel">Cancel</button></div></form>';
  }

  VIEWS.licenses = function () {
    var list = S.data.licenses.slice().sort(function (a, b) { return (a.done - b.done) || a.date.localeCompare(b.date); });
    var soon = list.filter(function (r) { return !r.done && daysTo(r.date) <= 90; }).length;
    var rows = list.map(function (r) {
      return '<tr><td><b>' + esc(r.acct) + '</b>' + (r.note ? '<div class="muted small">' + esc(r.note) + '</div>' : '') + '</td><td>' + esc(r.ins) + '</td><td>' + esc(nice(r.date)) + '</td><td>' + status(r) + '</td>' +
        '<td style="white-space:nowrap;text-align:right">' + (r.done ? '<button class="btn sm" data-zl="undo" data-id="' + r.id + '">Not renewed</button> ' : '<button class="btn sm pri" data-zl="done" data-id="' + r.id + '">Renewed</button> ') +
        '<button class="btn sm" data-zl="edit" data-id="' + r.id + '">Edit</button> <button class="btn sm danger" data-zl="del" data-id="' + r.id + '">Delete</button></td></tr>';
    }).join("");
    return '<div class="ph"><div><h2>Licenses</h2><p>Every license and accreditation, and when it expires. ' + (typeof nn === "function" ? nn("enzo") : "Enzo") + ' starts each renewal 90 days before.' + (soon ? " <b>" + soon + " expiring within 90 days.</b>" : "") + '</p></div>' +
      (R.edit ? "" : '<button class="btn gold" data-zl="add">+ Add license</button>') + '</div>' +
      (R.edit ? form() : "") +
      '<div class="card pad">' + (list.length ? '<div class="tblwrap"><table class="t" style="min-width:700px"><tr><th>License</th><th>Issued by</th><th>Expires</th><th>Status</th><th></th></tr>' + rows + '</table></div>'
        : '<div class="empty">No licenses yet. Use + Add license to add the first one.</div>') +
      '</div>';
  };

  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zl]"); if (!b) return;
    ev.preventDefault();
    var k = b.getAttribute("data-zl"), id = b.getAttribute("data-id"), r = S.data.licenses.filter(function (x) { return x.id === id; })[0];
    if (k === "add") { R.edit = "new"; R.err = ""; render(); var f = document.getElementById("lc-acct"); if (f) f.focus(); }
    else if (k === "cancel") { R.edit = null; render(); }
    else if (k === "edit" && r) { R.edit = id; R.err = ""; render(); }
    else if ((k === "done" || k === "undo") && r) { r.done = k === "done"; save(); render(); toast(r.done ? r.acct + " marked renewed." : r.acct + " is open again."); }
    else if (k === "del" && r) {
      ask("Delete this license?", "<b>" + esc(r.acct) + "</b> (" + esc(r.ins) + ", " + esc(nice(r.date)) + ") will be removed.", "Delete", function () {
        S.data.licenses = S.data.licenses.filter(function (x) { return x.id !== id; }); save(); render(); toast("Deleted.");
      });
    }
  });
  document.addEventListener("submit", function (ev) {
    var f = ev.target; if (!f || f.getAttribute("data-form") !== "z1lic") return;
    ev.preventDefault();
    var g = function (i) { return document.getElementById(i).value.trim(); };
    var acct = g("lc-acct"), ins = g("lc-ins"), date = g("lc-date"), note = g("lc-note");
    R.err = !acct ? "Name the license or accreditation." : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick the expiry date." : "";
    if (R.err) { render(); return; }
    if (R.edit === "new") { S.data.licenses.push({ id: uid("lc"), acct: acct, ins: ins, date: date, note: note, done: false }); toast(acct + " added."); }
    else { var r = S.data.licenses.filter(function (x) { return x.id === R.edit; })[0]; if (r) { r.acct = acct; r.ins = ins; r.date = date; r.note = note; } toast("Saved changes to " + acct + "."); }
    R.edit = null; save(); render();
  });
  if (S.view === "licenses") render();
})();
