/* zero1office add-on: small work lists (Paolo, 2026-11-27: "Small lists in the app" for the last agents).
   Each list is a simple table Karla or the assistant fills in, like Renewals. Only names, counts and dates
   are kept, never member details. The agents that work each list live in agentlive.js.
   Enrollments (Gia), LOA requests (Rina), Referral partners (Carlo), Applicants (Leo), Market notes (Rex).
   Saved in S.data.lists[key].
   Applicants also keep a resume (Paolo, 2026-11-27: "Add upload resume under applicants"): the file goes to
   Files > Resumes through window.Z1Files, and the row keeps only {id, name} of that file. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || typeof NAV === "undefined" || window.Z1Lists) return;
  if (!S.data.lists || typeof S.data.lists !== "object") S.data.lists = {};

  function pad(n) { return String(n).padStart(2, "0"); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function nice(d) { return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4) : ""; }
  function insurers() {
    var n = (S.data.companies || []).map(function (c) { return c.n; });
    ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"].forEach(function (x) { if (n.indexOf(x) < 0) n.push(x); });
    return n;
  }
  function who(id, fb) { return typeof nn === "function" ? nn(id) : fb; }

  /* f: [key, label, type, options|placeholder, required]. type: text, num, date, sel, ins (insurer select). */
  var CFG = [
    { key: "enrollments", nav: "Numbers", after: "renewals", label: "Enrollments", agent: "gia", agentName: "Gia", one: "enrollment",
      intro: "Member additions and removals to send to each insurer. Keep counts only.",
      works: "follows up anything not done",
      f: [["acct", "Client account", "text", "e.g. Northpoint Logistics", 1], ["ins", "Insurer", "ins"], ["chg", "Change", "sel", ["Additions", "Removals", "Additions and removals"]],
        ["heads", "Number of members", "num", "e.g. 6"], ["date", "Date sent to insurer", "date"], ["st", "Status", "sel", ["To send", "Sent, waiting", "Done"]]],
      done: function (r) { return r.st === "Done"; } },
    { key: "loa", nav: "Numbers", after: "enrollments", label: "LOA requests", agent: "rina", agentName: "Rina", one: "LOA request",
      intro: "Letters of Authorization members asked for. Use the account and the procedure only, no member names.",
      works: "chases each open request",
      f: [["acct", "Client account", "text", "e.g. Northpoint Logistics", 1], ["ins", "Insurer", "ins"], ["what", "Procedure and hospital", "text", "e.g. MRI at St. Luke's BGC", 1],
        ["date", "Date asked", "date"], ["st", "Status", "sel", ["Open", "Sent to insurer", "Approved", "Denied"]]],
      done: function (r) { return r.st === "Approved" || r.st === "Denied"; } },
    { key: "partners", nav: "Numbers", after: "loa", label: "Referral partners", agent: "carlo", agentName: "Carlo", one: "partner",
      intro: "Referral partners and sub-agents, the leads they send and when they last got a statement.",
      works: "sends each partner a monthly statement",
      f: [["name", "Partner name", "text", "e.g. Juan Dela Cruz", 1], ["type", "Type", "sel", ["Referral partner", "Sub-agent"]], ["leads", "Leads this month", "num", "e.g. 3"],
        ["date", "Last statement sent", "date"], ["st", "Status", "sel", ["Active", "Paused"]]],
      done: function (r) { return r.st === "Paused"; } },
    { key: "applicants", nav: "Team", after: "agents", label: "Applicants", agent: "leo", agentName: "Leo", one: "applicant",
      intro: "People who applied to work with Ask Karla, staff or sales.", files: "Resumes",
      works: "screens and follows up each open applicant",
      f: [["name", "Applicant name", "text", "e.g. Maria Santos", 1], ["role", "Role", "sel", ["Secretary", "Financial advisor", "Licensed agent", "Sub-agent"]], ["date", "Applied on", "date"],
        ["st", "Stage", "sel", ["New", "Screening", "Interview", "Hired", "Not a fit"]]],
      done: function (r) { return r.st === "Hired" || r.st === "Not a fit"; } },
    { key: "market", nav: "Numbers", after: "partners", label: "Market notes", agent: "rex", agentName: "Rex", one: "market note",
      intro: "New plans, price changes, IC circulars and questions clients keep asking.",
      works: "looks into each open note",
      f: [["what", "What to look into", "text", "e.g. Maxicare 2027 rate changes", 1], ["src", "Insurer or source", "text", "e.g. Maxicare, IC circular"], ["date", "Date noted", "date"],
        ["st", "Status", "sel", ["Open", "Looked into"]]],
      done: function (r) { return r.st === "Looked into"; } },
  ];

  var E = { key: null, edit: null, err: "" };
  function rows(c) { if (!Array.isArray(S.data.lists[c.key])) S.data.lists[c.key] = []; return S.data.lists[c.key]; }
  function byKey(k) { return CFG.filter(function (c) { return c.key === k; })[0]; }

  CFG.forEach(function (c) {
    var g = NAV.filter(function (x) { return x[0] === c.nav; })[0];
    if (!g || g[1].some(function (it) { return it[0] === c.key; })) return;
    var at = g[1].length; g[1].forEach(function (it, i) { if (it[0] === c.after) at = i + 1; });
    g[1].splice(at, 0, [c.key, c.label]);
  });

  function cell(c, r, f) {
    var v = r[f[0]];
    if (f[2] === "date") return esc(nice(v));
    return esc(v == null ? "" : String(v));
  }
  function input(f, r) {
    var id = "zl-" + f[0], v = r ? r[f[0]] : "";
    if (f[2] === "sel" || f[2] === "ins") {
      var opts = f[2] === "ins" ? insurers() : f[3];
      return '<select class="inp" id="' + id + '">' + opts.map(function (o) { return "<option" + (v === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    }
    return '<input class="inp" id="' + id + '"' + (f[2] === "date" ? ' type="date"' : f[2] === "num" ? ' type="number" min="0" step="1"' : ' maxlength="120"') +
      ' value="' + esc(v == null ? "" : String(v)) + '"' + (f[3] && typeof f[3] === "string" ? ' placeholder="' + esc(f[3]) + '"' : "") + ">";
  }
  /* ---------- resumes (applicants) ---------- */
  var CV_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
  var CV = { busy: {} };
  function filesOn() { return !!(window.Z1Files && window.Z1Files.upload && window.Z1Files.ready && window.Z1Files.ready()); }
  function cvCell(c, r) {
    if (CV.busy[r.id]) return '<span class="muted small">Uploading…</span>';
    if (r.cv && r.cv.id) return '<button class="btn sm" data-zli="cv-view" data-id="' + r.id + '" title="Open ' + esc(r.cv.name || "resume") + '">View</button> ' +
      '<button class="btn sm" data-zli="cv-pick" data-id="' + r.id + '" title="Upload a newer resume">Replace</button>';
    return '<button class="btn sm" data-zli="cv-pick" data-id="' + r.id + '">Upload</button>';
  }
  function uploadCv(c, r, file) {
    if (!file) return;
    if (!filesOn()) { toast("Uploading works when Zero1Office is opened on claude.ai by its owner or an editor."); return; }
    if (!/\.(pdf|docx?|jpe?g|png)$/i.test(file.name)) { toast("Use a PDF, Word file or photo of the resume."); return; }
    CV.busy[r.id] = true; render();
    var folder = window.Z1Files.folder ? window.Z1Files.folder(c.files, "resumes") : "";
    window.Z1Files.upload([file], { folder: folder, note: "Resume of " + String(r.name || "an applicant").slice(0, 80),
      done: function (row) {
        delete CV.busy[r.id];
        var cur = rows(c).filter(function (x) { return x.id === r.id; })[0];
        if (cur) { cur.cv = { id: row.id, name: String(row.name || file.name).slice(0, 180) }; save(); }
        render(); toast("Resume saved for " + (r.name || "the applicant") + ".");
      },
      failed: function (m) { delete CV.busy[r.id]; render(); toast("Resume not uploaded: " + m); } });
  }
  function pickCv(c, r) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = CV_ACCEPT; inp.style.display = "none";
    inp.addEventListener("change", function () { uploadCv(c, r, inp.files && inp.files[0]); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  }

  function form(c) {
    var r = E.edit && E.edit !== "new" ? rows(c).filter(function (x) { return x.id === E.edit; })[0] : null;
    var flds = c.f.map(function (f) { return '<label class="fld" for="zl-' + f[0] + '">' + esc(f[1]) + input(f, r) + "</label>"; });
    if (c.files) flds.push('<label class="fld" for="zl-cv">' + (r && r.cv ? "Replace resume (optional)" : "Resume (optional)") +
      '<input class="inp" type="file" id="zl-cv" accept="' + CV_ACCEPT + '"><span class="muted small">PDF, Word or a photo. Kept in Files &gt; ' + esc(c.files) + '.</span></label>');
    var pairs = []; for (var i = 0; i < flds.length; i += 2) pairs.push('<div class="two">' + flds[i] + (flds[i + 1] || "") + "</div>");
    return '<form class="card pad stack" data-form="z1list" style="margin-bottom:12px"><h3 style="margin:0">' + (r ? "Edit " : "Add ") + esc(c.one) + "</h3>" + pairs.join("") +
      '<p class="small" style="color:var(--bad,#c0392b);margin:0" role="alert">' + esc(E.err) + '</p>' +
      '<div style="display:flex;gap:8px"><button class="btn pri" type="submit">' + (r ? "Save changes" : "Add " + esc(c.one)) + '</button><button class="btn" type="button" data-zli="cancel">Cancel</button></div></form>';
  }

  CFG.forEach(function (c) {
    VIEWS[c.key] = function () {
      if (E.key !== c.key) { E.key = c.key; E.edit = null; E.err = ""; }
      var list = rows(c).slice().sort(function (a, b) { return (c.done(a) - c.done(b)) || String(b.date || "").localeCompare(String(a.date || "")); });
      var open = list.filter(function (r) { return !c.done(r); }).length;
      var head = "<tr>" + c.f.map(function (f) { return "<th>" + esc(f[1]) + "</th>"; }).join("") + (c.files ? "<th>Resume</th>" : "") + "<th></th></tr>";
      var body = list.map(function (r) {
        return '<tr' + (c.done(r) ? ' class="muted"' : "") + ">" + c.f.map(function (f, i) { return "<td>" + (i === 0 ? "<b>" + cell(c, r, f) + "</b>" : cell(c, r, f)) + "</td>"; }).join("") +
          (c.files ? '<td style="white-space:nowrap">' + cvCell(c, r) + "</td>" : "") +
          '<td style="white-space:nowrap;text-align:right"><button class="btn sm" data-zli="edit" data-id="' + r.id + '">Edit</button> <button class="btn sm danger" data-zli="del" data-id="' + r.id + '">Delete</button></td></tr>';
      }).join("");
      return '<div class="ph"><div><h2>' + esc(c.label) + "</h2><p>" + esc(c.intro) + " " + esc(who(c.agent, c.agentName)) + " " + esc(c.works) + "." + (open ? " <b>" + open + " open.</b>" : "") + "</p></div>" +
        (E.edit ? "" : '<button class="btn gold" data-zli="add">+ Add ' + esc(c.one) + "</button>") + "</div>" + (E.edit ? form(c) : "") +
        '<div class="card pad">' + (list.length ? '<div class="tblwrap"><table class="t" style="min-width:700px">' + head + body + "</table></div>"
          : '<div class="empty">Nothing here yet. Use + Add ' + esc(c.one) + " to add the first one.</div>") + "</div>";
    };
  });

  window.Z1Lists = {};
  CFG.forEach(function (c) { window.Z1Lists[c.key] = { rows: function () { return rows(c); }, open: function () { return rows(c).filter(function (r) { return !c.done(r); }); }, nice: nice, today: today }; });

  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-zli]"); if (!b) return;
    var c = byKey(S.view); if (!c) return;
    ev.preventDefault();
    var k = b.getAttribute("data-zli"), id = b.getAttribute("data-id"), r = rows(c).filter(function (x) { return x.id === id; })[0];
    if (k === "add") { E.edit = "new"; E.err = ""; render(); var f = document.getElementById("zl-" + c.f[0][0]); if (f) f.focus(); }
    else if (k === "cancel") { E.edit = null; render(); }
    else if (k === "cv-pick" && r && c.files) pickCv(c, r);
    else if (k === "cv-view" && r && r.cv) { if (window.Z1Files && window.Z1Files.view) window.Z1Files.view(r.cv.id); }
    else if (k === "edit" && r) { E.edit = id; E.err = ""; render(); }
    else if (k === "del" && r) {
      ask("Delete this " + c.one + "?", "<b>" + esc(String(r[c.f[0][0]] || "")) + "</b> will be removed.", "Delete", function () {
        S.data.lists[c.key] = rows(c).filter(function (x) { return x.id !== id; }); save(); render(); toast("Deleted.");
      });
    }
  });
  document.addEventListener("submit", function (ev) {
    var fm = ev.target; if (!fm || fm.getAttribute("data-form") !== "z1list") return;
    var c = byKey(S.view); if (!c) return;
    ev.preventDefault();
    var v = {};
    c.f.forEach(function (f) { var el = document.getElementById("zl-" + f[0]); var x = el ? el.value.trim() : ""; v[f[0]] = f[2] === "num" ? (x === "" ? "" : Math.max(0, Math.round(+x) || 0)) : x; });
    var miss = c.f.filter(function (f) { return f[4] && !v[f[0]]; })[0];
    E.err = miss ? "Fill in " + miss[1].toLowerCase() + "." : "";
    if (E.err) { render(); return; }
    var cvIn = c.files ? document.getElementById("zl-cv") : null, cvFile = cvIn && cvIn.files && cvIn.files[0], row;
    if (E.edit === "new") { v.id = uid("zl"); v.at = today(); rows(c).push(v); row = v; toast(c.one.charAt(0).toUpperCase() + c.one.slice(1) + " added."); }
    else { row = rows(c).filter(function (x) { return x.id === E.edit; })[0]; if (row) Object.keys(v).forEach(function (k) { row[k] = v[k]; }); toast("Saved changes."); }
    E.edit = null; save(); render();
    if (cvFile && row) uploadCv(c, row, cvFile);
  });
  if (byKey(S.view)) render();
})();
