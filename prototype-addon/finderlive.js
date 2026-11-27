/* zero1office add-on: a real Find button on Leads > How it's going (Paolo, 2026-11-27: "Find button in the app").
   Nico searches Maps listings for a business type in a city through the viewer's Firecrawl connector
   (firecrawl-maps businesses/search, 10 credits per 20 businesses). The viewer ticks the ones to keep and
   they go to GoHighLevel as contacts tagged "lead-finder", and onto the Leads list. Nothing is sent to the
   businesses. Found leads are kept in S.data.found. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.finder || window.__z1Finder) return;
  window.__z1Finder = true;
  if (!Array.isArray(S.data.found)) S.data.found = [];
  var F = { q: "", city: "", busy: false, err: "", res: [], pick: {}, cursor: null, more: false, adding: false, msg: "" };

  function payload(r) {
    var p = r && r.payload; if (p && typeof p === "object") return p;
    try { var t = (r.content || []).filter(function (b) { return b.type === "text"; })[0]; return JSON.parse(t.text); } catch (err) { return {}; }
  }
  function site(u) { return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }
  function score(b) {
    var s = 0;
    if (b.phone) s += 15;
    if (b.website) s += 12;
    if (b.rating >= 4.5) s += 5;
    if (b.reviews >= 20) s += 10;
    return s;
  }
  // Put saved finds on the Leads list (LEADS is emptied at load, so add them back once).
  function toLead(b) { return { n: b.name, k: b.kind || "", c: b.city || "", staff: "", s: score(b), tags: ["lead-finder"].concat(b.inGhl ? ["in GoHighLevel"] : []) }; }
  if (typeof LEADS !== "undefined" && Array.isArray(LEADS)) S.data.found.forEach(function (b) { LEADS.push(toLead(b)); });

  function search(next) {
    var cl = window.claude; if (F.busy) return;
    if (!F.q || !F.city) { F.err = "Type a business type and a city."; render(); return; }
    if (!cl || !cl.use) { F.err = "The search only works inside the published app."; render(); return; }
    F.busy = true; F.err = ""; F.msg = ""; if (!next) { F.res = []; F.pick = {}; F.cursor = null; } render();
    var opts = { query: F.q + " " + F.city, country: "ph", include_opening_hours: false };
    if (next && F.cursor) opts.cursor = F.cursor;
    cl.use("mcp").then(function (m) {
      if (!m) throw { code: "unavailable_here" };
      return m.callTool("Firecrawl", "alexandria_library_read", { objective: "Find Philippine businesses to offer group HMO plans to", calls: [{ provider: "firecrawl-maps", capability: "businesses/search", options: opts }] });
    }).then(function (r) {
      var p = payload(r), a = ((p.data || p).alexandria || [])[0] || {};
      if (a.error) throw { message: a.error.message || a.error.code || "The search failed." };
      var d = a.data || {}, seen = {};
      F.res.forEach(function (b) { seen[b.id] = 1; });
      var have = {}; S.data.found.forEach(function (b) { have[b.id] = 1; });
      (d.results || []).forEach(function (x) {
        if (!x || !x.feature_id || seen[x.feature_id] || x.business_status === "permanently_closed") return;
        var b = { id: x.feature_id, name: String(x.name || ""), kind: (x.categories || [])[0] || "", addr: String(x.address || ""), city: F.city,
          phone: String(x.phone_e164 || x.phone || ""), website: /^https?:\/\//.test(x.website || "") ? String(x.website) : "", rating: +x.rating || 0, reviews: +x.review_count || 0, saved: !!have[x.feature_id] };
        F.res.push(b); if (!b.saved && b.phone) F.pick[b.id] = true;
      });
      F.cursor = d.next_cursor || null; F.more = !!d.has_more;
      if (!F.res.length) F.err = "No businesses found. Try another type or city.";
    }).catch(function (e) {
      var c = e && e.code;
      F.err = c === "not_granted" ? "Allow Firecrawl for this app to search." : c === "server_not_connected" ? "Connect Firecrawl in claude.ai Settings > Connectors to search." :
        c === "unavailable_here" ? "Searching isn't available in this view." : (e && e.message) || "The search failed. Try again.";
    }).then(function () { F.busy = false; render(); });
  }

  function addPicked() {
    var cl = window.claude, list = F.res.filter(function (b) { return F.pick[b.id] && !b.saved; });
    if (!list.length || F.adding) return;
    F.adding = true; F.msg = ""; render();
    var ok = 0, fail = 0;
    cl.use("mcp").then(function (m) {
      if (!m) throw { code: "unavailable_here" };
      return list.reduce(function (p, b) {
        return p.then(function () {
          var body = { firstName: b.name, companyName: b.name, source: "Zero1Office leads finder", tags: ["lead-finder"], country: "PH" };
          if (b.phone) body.phone = b.phone; if (b.website) body.website = b.website; if (b.addr) body.address1 = b.addr; if (b.city) body.city = b.city;
          return m.callTool("GHL", "execute_operation", { operationId: "upsert-contact", reason: "Add a business Nico found to GoHighLevel", idempotencyKey: "z1lf-" + b.id.replace(/[^0-9a-zA-Z]/g, ""), params: { body: body } })
            .then(function () { b.saved = true; b.inGhl = true; S.data.found.push(b); if (typeof LEADS !== "undefined") LEADS.push(toLead(b)); ok++; }, function () { fail++; });
        });
      }, Promise.resolve());
    }).catch(function () { fail = list.length - ok; }).then(function () {
      F.adding = false; F.pick = {}; save();
      F.msg = ok ? ok + (ok === 1 ? " business" : " businesses") + " added to GoHighLevel and Leads." + (fail ? " " + fail + " could not be added." : "") : "None could be added. Check GoHighLevel in Accesses.";
      render(); if (ok) toast(F.msg);
    });
  }

  function card() {
    var picked = F.res.filter(function (b) { return F.pick[b.id] && !b.saved; }).length;
    var h = '<div class="card pad stack" style="margin-bottom:14px"><div><h3 style="margin:0">Find businesses</h3><p class="muted small" style="margin:4px 0 0">Nico searches Maps listings in the Philippines. Each search of 20 businesses uses 10 Firecrawl credits. Nothing is sent to them.</p></div>' +
      '<form data-form="z1find" class="two" style="align-items:end"><label class="fld" for="lf-q">Business type<input class="inp" id="lf-q" maxlength="60" placeholder="e.g. logistics company" value="' + esc(F.q) + '"></label>' +
      '<label class="fld" for="lf-city">City<input class="inp" id="lf-city" maxlength="60" placeholder="e.g. Pasig City" value="' + esc(F.city) + '"></label>' +
      '<button class="btn pri" type="submit"' + (F.busy ? " disabled" : "") + '>' + (F.busy ? "Searching…" : "Search") + '</button></form>' +
      (F.err ? '<p class="small" role="alert" style="color:var(--bad,#c0392b);margin:0">' + esc(F.err) + '</p>' : "") +
      (F.msg ? '<p class="small" role="status" style="margin:0"><b>' + esc(F.msg) + '</b></p>' : "");
    if (F.res.length) {
      h += '<div class="tblwrap" style="max-height:420px;overflow:auto"><table class="t" style="min-width:720px"><tr><th></th><th>Business</th><th>Kind</th><th>Phone</th><th>Website</th><th class="r">Rating</th><th class="r">Score</th></tr>' +
        F.res.map(function (b) {
          return '<tr><td>' + (b.saved ? '<span class="muted small">Added</span>' : '<input type="checkbox" data-lfpick="' + esc(b.id) + '" aria-label="Keep ' + esc(b.name) + '"' + (F.pick[b.id] ? " checked" : "") + ">") + '</td>' +
            '<td><b>' + esc(b.name) + '</b><div class="muted small">' + esc(b.addr) + '</div></td><td>' + esc(b.kind) + '</td><td class="num">' + (esc(b.phone) || '<span class="muted">none</span>') + '</td>' +
            '<td>' + (b.website ? (/^https:\/\//.test(b.website) ? '<a href="' + esc(b.website) + '" target="_blank" rel="noopener">' + esc(site(b.website)) + '</a>' : esc(site(b.website))) : '<span class="muted">none</span>') + '</td>' +
            '<td class="r num">' + (b.rating ? b.rating.toFixed(1) + " (" + b.reviews + ")" : "—") + '</td><td class="r">' + (typeof gbadge === "function" ? gbadge(score(b)) : score(b)) + '</td></tr>';
        }).join("") + '</table></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn gold" data-lf="add"' + (picked && !F.adding ? "" : " disabled") + '>' + (F.adding ? "Adding…" : "Add " + picked + " to GoHighLevel") + '</button>' +
        (F.more ? '<button class="btn" data-lf="more"' + (F.busy ? " disabled" : "") + '>Search 20 more (10 credits)</button>' : "") +
        '<span class="muted small">Scores rise once an HR email is found on their website.</span></div>';
    }
    return h + "</div>";
  }

  var base = VIEWS.finder;
  VIEWS.finder = function () {
    var h = base.apply(this, arguments), k = h.indexOf('<div class="card pad stack">');
    return k < 0 ? card() + h : h.slice(0, k) + card() + h.slice(k);
  };

  document.addEventListener("submit", function (ev) {
    var f = ev.target; if (!f || f.getAttribute("data-form") !== "z1find") return;
    ev.preventDefault();
    F.q = document.getElementById("lf-q").value.trim(); F.city = document.getElementById("lf-city").value.trim();
    search(false);
  });
  document.addEventListener("change", function (ev) {
    var c = ev.target; if (!c || !c.getAttribute || !c.hasAttribute("data-lfpick")) return;
    F.pick[c.getAttribute("data-lfpick")] = c.checked; render();
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-lf]"); if (!b) return;
    ev.preventDefault();
    if (b.getAttribute("data-lf") === "more") search(true); else addPicked();
  });
  if (S.view === "finder") render();
})();
