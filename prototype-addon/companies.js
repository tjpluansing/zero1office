/* zero1office add-on: Companies page fields (Paolo, 2026-11-26: "Under Companies. Remove Contact and Agent on it.
   Replace with Manager and Branch Head.")
   Settings > Companies now shows Company, Product, Manager, Branch Head, Clients and Proposals. The "Contact" and
   "Agents on it" columns are gone, and the add/edit form asks for Manager and Branch Head instead of a contact.
   Agents still cover companies as before (Proposals filters and agent coverage are unchanged); the column is only hidden.
   Saved companies keep working: an old contact moves into Manager the first time this runs. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.companies || window.__z1CoFields) return;
  window.__z1CoFields = true;

  function migrate() {
    var cs = S.data && S.data.companies, moved = false;
    if (!Array.isArray(cs)) return;
    cs.forEach(function (c) {
      if (c.manager == null) { c.manager = c.contact || ""; moved = true; }
      if (c.branchHead == null) { c.branchHead = ""; moved = true; }
      if ("contact" in c) { delete c.contact; moved = true; }
    });
    if (moved) save();
  }
  migrate();

  function cell(v) { return v ? esc(v) : '<span class="muted">Not set</span>'; }

  VIEWS.companies = function () {
    migrate();
    var cs = S.data.companies;
    var rows = cs.map(function (c) {
      var u = companyUse(c.n);
      return '<tr><td><b>' + esc(c.n) + '</b>' + (c.notes ? '<div class="muted small">' + esc(c.notes) + '</div>' : '') + '</td>' +
        '<td>' + esc(c.prod) + '</td><td>' + cell(c.manager) + '</td><td>' + cell(c.branchHead) + '</td>' +
        '<td class="num">' + u.cl + '</td><td class="num">' + u.pr + '</td>' +
        '<td style="white-space:nowrap;text-align:right"><button class="btn sm" data-act="coedit" data-id="' + c.id + '">Edit</button> ' +
        '<button class="btn sm danger" data-act="codel" data-id="' + c.id + '">Delete</button></td></tr>';
    }).join("");
    var by = PRODUCTS.map(function (p) {
      var n = cs.filter(function (c) { return c.prod === p; }).length;
      return '<div class="card pad" style="display:grid;gap:2px"><span class="muted small">' + esc(p) + '</span><b class="num" style="font-size:22px">' + n + '</b></div>';
    }).join("");
    return '<div class="ph"><div><h2>Companies</h2><p>The insurance, HMO and pre-need companies you sell for. They feed the company lists and filters on Client stats, Proposals and your agents.</p></div><button class="btn gold" data-act="coadd">+ Add company</button></div>' +
      '<div class="cogrid">' + by + '</div>' +
      '<div class="card pad">' + (cs.length
        ? '<div class="tblwrap"><table class="t" style="min-width:760px"><tr><th>Company</th><th>Product</th><th>Manager</th><th>Branch Head</th><th>Clients</th><th>Proposals</th><th></th></tr>' + rows + '</table></div>'
        : '<div class="empty">No companies yet. Use + Add company to add the first one.</div>') +
      '<p class="small muted" style="margin-top:10px">Renaming a company updates its clients, proposals and agents. Deleting one keeps old records but removes it from lists and filters.</p></div>';
  };

  /* Swap the form's Contact field for Manager + Branch Head, and drop the original submit handler by cloning the form. */
  var oldForm = document.getElementById("coForm");
  var contactInp = document.getElementById("co-contact");
  if (oldForm && contactInp) {
    var lbl = contactInp.closest("label");
    var wrap = document.createElement("div");
    wrap.className = "two";
    wrap.innerHTML =
      '<label class="fld" for="co-manager">Manager (optional)<input class="inp" id="co-manager" maxlength="80" placeholder="e.g. Ms. Reyes, 0917 000 0000"></label>' +
      '<label class="fld" for="co-branchhead">Branch Head (optional)<input class="inp" id="co-branchhead" maxlength="80" placeholder="e.g. Mr. Santos, Makati branch"></label>';
    lbl.parentNode.replaceChild(wrap, lbl);
    var form = oldForm.cloneNode(true);
    oldForm.parentNode.replaceChild(form, oldForm);
    form.addEventListener("submit", submit);
  }

  function val(id) { return document.getElementById(id).value.trim(); }

  openCo = function (id) {
    migrate();
    var c = id ? S.data.companies.filter(function (x) { return x.id === id; })[0] : null;
    lastFocus = document.activeElement; S.coEdit = id || null;
    document.getElementById("coTitle").textContent = c ? "Edit " + c.n : "Add company";
    document.getElementById("coSave").textContent = c ? "Save changes" : "Add company";
    document.getElementById("co-name").value = c ? c.n : "";
    document.getElementById("co-prod").innerHTML = PRODUCTS.map(function (p) { return '<option' + (c && c.prod === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join("");
    document.getElementById("co-manager").value = c ? c.manager || "" : "";
    document.getElementById("co-branchhead").value = c ? c.branchHead || "" : "";
    document.getElementById("co-notes").value = c ? c.notes || "" : "";
    document.getElementById("e-co").textContent = "";
    document.getElementById("coScrim").hidden = false;
    document.getElementById("co-name").focus();
  };

  function submit(ev) {
    ev.preventDefault();
    var cs = S.data.companies, id = S.coEdit, n = val("co-name"), prod = document.getElementById("co-prod").value,
      manager = val("co-manager"), branchHead = val("co-branchhead"), notes = val("co-notes");
    if (!n) { document.getElementById("e-co").textContent = "Give the company a name."; document.getElementById("co-name").focus(); return; }
    var dup = cs.filter(function (c) { return c.id !== id && c.n.toLowerCase() === n.toLowerCase(); })[0];
    if (dup) { document.getElementById("e-co").textContent = "You already have " + dup.n + "."; document.getElementById("co-name").focus(); return; }
    if (id) {
      var c = cs.filter(function (x) { return x.id === id; })[0], old = c.n;
      c.n = n; c.prod = prod; c.manager = manager; c.branchHead = branchHead; c.notes = notes; delete c.contact;
      if (old !== n) {
        S.team.forEach(function (e) { if (e.covers) { var i = e.covers.co.indexOf(old); if (i > -1) e.covers.co[i] = n; } });
        resetCoFilters();
      }
      syncCompanies(); save(); closeModals(); render(); toast("Saved changes to " + n);
    } else {
      var used = cs.some(function (c) { return c.orig === n; });
      cs.push({ id: uid("co"), n: n, prod: prod, orig: used ? uid("x") : n, manager: manager, branchHead: branchHead, notes: notes });
      syncCompanies(); save(); closeModals(); render(); toast(n + " added to your companies");
    }
  }

  if (S.view === "companies") render();
})();
