/* zero1office add-on: a real Find button on Leads > How it's going (Paolo, 2026-11-27: "Find button in the app";
   later the same day: "Make search using website, facebook and linkedin work").
   Nico searches for a business type in a city through the viewer's Firecrawl connector, in one of four places:
   - Google Maps listings (firecrawl-maps businesses/search, 10 credits per 20 businesses)
   - company websites, Facebook pages or LinkedIn company pages (firecrawl_search, about 4 credits per 20 results)
   "Check website" reads one business's website (firecrawl_scrape, 1 to 2 credits) for an email, phone and hiring page.
   The viewer ticks the ones to keep and they go to GoHighLevel as contacts tagged "lead-finder", and onto the
   Leads list. Nothing is sent to the businesses. Found leads are kept in S.data.found. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.finder || window.__z1Finder) return;
  window.__z1Finder = true;
  if (!Array.isArray(S.data.found)) S.data.found = [];
  var SRC = [
    ["maps", "Google Maps", "Name, phone, rating", "10 Firecrawl credits per 20 businesses"],
    ["web", "Websites", "Company sites, then emails", "about 4 Firecrawl credits per 20 results"],
    ["fb", "Facebook", "Business pages", "about 4 Firecrawl credits per 20 results"],
    ["li", "LinkedIn", "Company pages", "about 4 Firecrawl credits per 20 results"]
  ];
  var SRC_TAG = { maps: "source-google-maps", web: "source-website", fb: "source-facebook", li: "source-linkedin" };
  var F = { src: "maps", q: "", city: "", busy: false, err: "", res: [], pick: {}, cursor: null, more: false, adding: false, msg: "", checking: {} };

  function payload(r) {
    var p = r && r.payload; if (p && typeof p === "object") return p;
    try { var t = (r.content || []).filter(function (b) { return b.type === "text"; })[0]; return JSON.parse(t.text); } catch (err) { return {}; }
  }
  function site(u) { return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }
  function score(b) {
    var s = 0;
    if (b.phone) s += 15;
    if (b.website) s += 12;
    if (b.email) s += 20;
    if (b.hiring) s += 8;
    if (b.fb || b.li) s += 5;
    if (b.rating >= 4.5) s += 5;
    if (b.reviews >= 20) s += 10;
    return s;
  }
  // Put saved finds on the Leads list (LEADS is emptied at load, so add them back once).
  function toLead(b) { return { n: b.name, k: b.kind || "", c: b.city || "", staff: "", s: score(b), tags: ["lead-finder"].concat(b.inGhl ? ["in GoHighLevel"] : []) }; }
  if (typeof LEADS !== "undefined" && Array.isArray(LEADS)) S.data.found.forEach(function (b) { LEADS.push(toLead(b)); });

  /* ---------- reading phone numbers, emails and names out of search text ---------- */
  var PHONE = /(?:\+?63[\s.-]?|0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|\(?0?2\)?[\s.-]?[38]\d{3}[\s.-]?\d{4}/;
  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var NOT_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|@2x/i;
  function phoneIn(t) { var m = PHONE.exec(String(t || "")); return m ? m[0].trim() : ""; }
  function emailsIn(t) { return (String(t || "").match(EMAIL) || []).filter(function (e) { return !NOT_EMAIL.test(e); }); }
  function bestEmail(list) {
    var hr = list.filter(function (e) { return /^(hr|careers?|jobs|recruit|hiring|people|talent)/i.test(e); })[0];
    return hr || list.filter(function (e) { return /^(info|hello|contact|admin|sales|inquir)/i.test(e); })[0] || list[0] || "";
  }
  var GENERIC = /^(home|contact( us)?|about( us)?|welcome|index|official (website|site)|services|page \d+)$/i;
  function nameFrom(title, url, src) {
    var t = String(title || "").replace(/\s*[|·–-]\s*(LinkedIn|Facebook)\s*$/i, "").replace(/\s*\(@[^)]*\)\s*$/, "").trim();
    var parts = t.split(/\s+[|·–-]\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var n = parts.filter(function (p) { return !GENERIC.test(p); })[0] || "";
    if (src === "web" && (!n || n.length > 70)) { var h = site(url).split("/")[0].split("."); n = h[0].length > 2 ? h[0] : h.slice(0, 2).join("."); n = n.charAt(0).toUpperCase() + n.slice(1); }
    return (n || t || site(url)).slice(0, 90);
  }
  // one row per page or company, and skip lists, job boards and posts
  var SKIP_WEB = /(facebook|linkedin|instagram|tiktok|youtube|twitter|x)\.com|jobstreet|indeed|kalibrr|glassdoor|yellow-?pages|scribd|wikipedia|google\.|yelp|tripadvisor|foursquare|waze|dti\.gov|\.gov\.ph|grab\.com|shopee|lazada|reddit|quora|medium\.com|wordpress\.com\/tag|zoominfo|rocketreach|apollo\.io|crunchbase|opencorporates|businesslist|cybo|infobel|ph\.kompass|top10|bestin|nextpax|spot\.ph/i;
  function canon(url, src) {
    var u; try { u = new URL(url); } catch (e) { return ""; }
    if (!/^https?:$/.test(u.protocol)) return "";
    var segs = u.pathname.split("/").filter(Boolean);
    if (src === "fb") {
      if (!/(^|\.)facebook\.com$/i.test(u.hostname) || !segs.length) return "";
      if (/^(groups|events|watch|marketplace|reel|photo|photos|story\.php|permalink\.php|sharer|hashtag|search|login|people)$/i.test(segs[0])) return "";
      if (segs[0] === "p" && segs[1]) return "https://www.facebook.com/p/" + segs[1] + "/";
      if (segs[0] === "profile.php") { var id = u.searchParams.get("id"); return id ? "https://www.facebook.com/profile.php?id=" + id : ""; }
      return "https://www.facebook.com/" + segs[0] + "/";
    }
    if (src === "li") {
      if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || segs[0] !== "company" || !segs[1]) return "";
      return "https://www.linkedin.com/company/" + segs[1] + "/";
    }
    if (SKIP_WEB.test(u.hostname) || /\/(jobs?|careers?)\/[^/]+/i.test(u.pathname) && segs.length > 2) return "";
    return "https://" + u.hostname.replace(/^www\./, "") + "/";
  }

  function callFirecrawl(tool, input) {
    var cl = window.claude, host = window.Z1Host;
    if (host && typeof host.firecrawl === "function") return host.firecrawl(tool, input).then(payload); // app.ask-karla.com
    if (!cl || !cl.use) return Promise.reject({ code: "unavailable_here" });
    return cl.use("mcp").then(function (m) { if (!m) throw { code: "unavailable_here" }; return m.callTool("Firecrawl", tool, input); }).then(payload);
  }
  function errText(e) {
    var c = e && e.code;
    return c === "not_granted" ? "Allow Firecrawl for this app to search." : c === "server_not_connected" ? "Connect Firecrawl in claude.ai Settings > Connectors to search." :
      c === "unavailable_here" ? "Searching isn't available in this view yet." : (e && e.message) || "The search failed. Try again.";
  }
  function haveIds() { var have = {}; S.data.found.forEach(function (b) { have[b.id] = 1; }); return have; }
  function addResult(b, seen, have) {
    if (!b.id || seen[b.id]) return; seen[b.id] = 1; b.saved = !!have[b.id];
    F.res.push(b); if (!b.saved && (b.phone || b.email || b.src !== "maps")) F.pick[b.id] = true;
  }

  function searchMaps(next) {
    var opts = { query: F.q + " " + F.city, country: "ph", include_opening_hours: false };
    if (next && F.cursor) opts.cursor = F.cursor;
    return callFirecrawl("alexandria_library_read", { objective: "Find Philippine businesses to offer group HMO plans to", calls: [{ provider: "firecrawl-maps", capability: "businesses/search", options: opts }] }).then(function (p) {
      var a = ((p.data || p).alexandria || [])[0] || {};
      if (a.error) throw { message: a.error.message || a.error.code || "The search failed." };
      var d = a.data || {}, seen = {}, have = haveIds();
      F.res.forEach(function (b) { seen[b.id] = 1; });
      (d.results || []).forEach(function (x) {
        if (!x || !x.feature_id || x.business_status === "permanently_closed") return;
        addResult({ id: x.feature_id, src: "maps", name: String(x.name || ""), kind: (x.categories || [])[0] || "", addr: String(x.address || ""), city: F.city,
          phone: String(x.phone_e164 || x.phone || ""), website: /^https?:\/\//.test(x.website || "") ? String(x.website) : "", rating: +x.rating || 0, reviews: +x.review_count || 0 }, seen, have);
      });
      F.cursor = d.next_cursor || null; F.more = !!d.has_more;
    });
  }
  function searchWeb() {
    var q = F.q + " " + F.city;
    var query = F.src === "fb" ? q + " site:facebook.com" : F.src === "li" ? q + " Philippines site:linkedin.com/company" : q + " Philippines contact us -site:facebook.com -site:linkedin.com -site:jobstreet.com.ph -site:indeed.com";
    return callFirecrawl("firecrawl_search", { query: query, limit: 20, sources: ["web"], location: "Philippines", domainTools: false, objective: "Find Philippine businesses to offer group HMO plans to" }).then(function (p) {
      if (p.success === false) throw { message: p.error || "The search failed." };
      var rows = ((p.data && p.data.web) || p.web || []), seen = {}, have = haveIds();
      F.res.forEach(function (b) { seen[b.id] = 1; });
      rows.forEach(function (x) {
        var url = canon(x && x.url, F.src); if (!url) return;
        var text = String(x.description || "").replace(/[#*_>\[\]]/g, " ").replace(/\s+/g, " ").trim();
        var b = { id: F.src + ":" + site(url).toLowerCase(), src: F.src, name: nameFrom(x.title, url, F.src), kind: F.q, addr: text.slice(0, 140), city: F.city,
          phone: phoneIn(text), email: bestEmail(emailsIn(text)), website: F.src === "web" ? url : "", rating: 0, reviews: 0 };
        if (F.src === "fb") b.fb = url; if (F.src === "li") b.li = url;
        addResult(b, seen, have);
      });
      F.cursor = null; F.more = false;
    });
  }
  function search(next) {
    if (F.busy) return;
    if (!F.q || !F.city) { F.err = "Type a business type and a city."; render(); return; }
    F.busy = true; F.err = ""; F.msg = ""; if (!next) { F.res = []; F.pick = {}; F.cursor = null; F.more = false; } render();
    (F.src === "maps" ? searchMaps(next) : searchWeb()).then(function () {
      if (!F.res.length) F.err = "Nothing found. Try another business type or city.";
    }).catch(function (e) { F.err = errText(e); }).then(function () { F.busy = false; render(); });
  }

  // Read one business's website for an email, a phone and a hiring page.
  function scrape(url) {
    return callFirecrawl("firecrawl_scrape", { url: url, formats: ["markdown"], onlyMainContent: false, objective: "Find a business email for an HMO group plan offer" }).then(function (p) {
      var d = p.data || p; return String(d.markdown || "");
    });
  }
  function checkSite(b) {
    var base = b.website; if (!base || F.checking[b.id]) return;
    F.checking[b.id] = true; b.checkMsg = ""; render();
    var found = [], hiring = "";
    function read(md) {
      found = found.concat(emailsIn(md));
      if (!b.phone) b.phone = phoneIn(md);
      if (!hiring) { var h = /\]\((https?:\/\/[^)\s]*(career|jobs|hiring|join-us|work-with-us)[^)\s]*)\)/i.exec(md); if (h) hiring = h[1]; }
      if (!b.fb) { var f = /https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.\-_\/?=]+/i.exec(md); if (f) b.fb = canon(f[0], "fb"); }
      if (!b.li) { var l = /https?:\/\/([a-z]+\.)?linkedin\.com\/company\/[A-Za-z0-9\-_%]+/i.exec(md); if (l) b.li = canon(l[0], "li"); }
      var c = /\]\((https?:\/\/[^)\s]*contact[^)\s]*)\)/i.exec(md); return c ? c[1] : "";
    }
    scrape(base).then(function (md) {
      var contact = read(md);
      if (!found.length && contact && site(contact).split("/")[0] === site(base).split("/")[0]) return scrape(contact).then(read);
    }).then(function () {
      b.email = bestEmail(found) || b.email || ""; if (hiring) b.hiring = hiring;
      b.checkMsg = b.email ? "" : "No email on the website.";
      if (b.email || b.phone) F.pick[b.id] = !b.saved;
    }).catch(function (e) { b.checkMsg = errText(e).replace("search", "check websites"); })
      .then(function () { delete F.checking[b.id]; render(); });
  }

  function addPicked() {
    var cl = window.claude, list = F.res.filter(function (b) { return F.pick[b.id] && !b.saved; });
    if (!list.length || F.adding) return;
    F.adding = true; F.msg = ""; render();
    var ok = 0, fail = 0;
    var localOnly = false;
    cl.use("mcp").then(function (m) {
      if (!m) {
        // app.ask-karla.com has no GoHighLevel connection yet: keep them on the Leads list only
        if (!window.Z1Host) throw { code: "unavailable_here" };
        localOnly = true;
        list.forEach(function (b) { b.saved = true; S.data.found.push(b); if (typeof LEADS !== "undefined") LEADS.push(toLead(b)); ok++; });
        return;
      }
      return list.reduce(function (p, b) {
        return p.then(function () {
          var body = { firstName: b.name, companyName: b.name, source: "Zero1Office leads finder", tags: ["lead-finder", SRC_TAG[b.src || "maps"]], country: "PH" };
          var web = b.website || b.fb || b.li;
          if (b.phone) body.phone = b.phone; if (b.email) body.email = b.email; if (web) body.website = web;
          if (b.src === "maps" && b.addr) body.address1 = b.addr; if (b.city) body.city = b.city;
          return m.callTool("GHL", "execute_operation", { operationId: "upsert-contact", reason: "Add a business Nico found to GoHighLevel", idempotencyKey: "z1lf-" + b.id.replace(/[^0-9a-zA-Z]/g, "").slice(0, 60), params: { body: body } })
            .then(function () { b.saved = true; b.inGhl = true; S.data.found.push(b); if (typeof LEADS !== "undefined") LEADS.push(toLead(b)); ok++; }, function () { fail++; });
        });
      }, Promise.resolve());
    }).catch(function () { fail = list.length - ok; }).then(function () {
      F.adding = false; F.pick = {}; save();
      F.msg = localOnly ? ok + (ok === 1 ? " business" : " businesses") + " added to Leads. GoHighLevel isn't connected on this site yet." : ok ? ok + (ok === 1 ? " business" : " businesses") + " added to GoHighLevel and Leads." + (fail ? " " + fail + " could not be added." : "") : "None could be added. Check GoHighLevel in Accesses.";
      render(); if (ok) toast(F.msg);
    });
  }

  function link(u, label) { return /^https:\/\//.test(u || "") ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label) + '</a>' : esc(label); }
  function card() {
    var picked = F.res.filter(function (b) { return F.pick[b.id] && !b.saved; }).length, cur = SRC.filter(function (s) { return s[0] === F.src; })[0];
    var h = '<div class="card pad stack" style="margin-bottom:14px"><div><h3 style="margin:0">Find businesses</h3><p class="muted small" style="margin:4px 0 0">Nico searches in the Philippines. This search uses ' + esc(cur[3]) + '. Nothing is sent to the businesses.</p></div>' +
      '<div class="seg" role="group" aria-label="Search on" style="flex-wrap:wrap">' + SRC.map(function (s) {
        return '<button type="button" data-lfsrc="' + s[0] + '" aria-pressed="' + (F.src === s[0]) + '" title="' + esc(s[2]) + '">' + esc(s[1]) + '</button>';
      }).join("") + '</div>' +
      '<form data-form="z1find" class="two" style="align-items:end"><label class="fld" for="lf-q">Business type<input class="inp" id="lf-q" maxlength="60" placeholder="e.g. logistics company" value="' + esc(F.q) + '"></label>' +
      '<label class="fld" for="lf-city">City<input class="inp" id="lf-city" maxlength="60" placeholder="e.g. Pasig City" value="' + esc(F.city) + '"></label>' +
      '<button class="btn pri" type="submit"' + (F.busy ? " disabled" : "") + '>' + (F.busy ? "Searching…" : "Search " + esc(cur[1])) + '</button></form>' +
      (F.err ? '<p class="small" role="alert" style="color:var(--bad,#c0392b);margin:0">' + esc(F.err) + '</p>' : "") +
      (F.msg ? '<p class="small" role="status" style="margin:0"><b>' + esc(F.msg) + '</b></p>' : "");
    if (F.res.length) {
      h += '<div class="tblwrap" style="max-height:460px;overflow:auto"><table class="t" style="min-width:780px"><tr><th></th><th>Business</th><th>Phone</th><th>Email</th><th>Links</th><th class="r">Rating</th><th class="r">Score</th></tr>' +
        F.res.map(function (b) {
          var links = [];
          if (b.website) links.push(link(b.website, site(b.website).split("/")[0]));
          if (b.fb) links.push(link(b.fb, "Facebook")); if (b.li) links.push(link(b.li, "LinkedIn")); if (b.hiring) links.push(link(b.hiring, "Hiring page"));
          var chk = b.website && !b.email ? (F.checking[b.id] ? '<span class="muted small">Checking…</span>' : '<button class="btn sm" data-lfcheck="' + esc(b.id) + '" title="Reads their website for an email (1 to 2 credits)">Check website</button>') : "";
          return '<tr><td>' + (b.saved ? '<span class="muted small">Added</span>' : '<input type="checkbox" data-lfpick="' + esc(b.id) + '" aria-label="Keep ' + esc(b.name) + '"' + (F.pick[b.id] ? " checked" : "") + ">") + '</td>' +
            '<td><b>' + esc(b.name) + '</b><div class="muted small">' + esc(b.kind ? b.kind + " · " : "") + esc(b.addr) + '</div></td><td class="num">' + (esc(b.phone) || '<span class="muted">none</span>') + '</td>' +
            '<td>' + (b.email ? esc(b.email) : chk || '<span class="muted">none</span>') + (b.checkMsg ? '<div class="muted small">' + esc(b.checkMsg) + '</div>' : "") + '</td>' +
            '<td>' + (links.length ? links.join("<br>") : '<span class="muted">none</span>') + '</td>' +
            '<td class="r num">' + (b.rating ? b.rating.toFixed(1) + " (" + b.reviews + ")" : "—") + '</td><td class="r">' + (typeof gbadge === "function" ? gbadge(score(b)) : score(b)) + '</td></tr>';
        }).join("") + '</table></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn gold" data-lf="add"' + (picked && !F.adding ? "" : " disabled") + '>' + (F.adding ? "Adding…" : "Add " + picked + (window.Z1Host ? " to Leads" : " to GoHighLevel")) + '</button>' +
        (F.more ? '<button class="btn" data-lf="more"' + (F.busy ? " disabled" : "") + '>Search 20 more (10 credits)</button>' : "") +
        '<span class="muted small">Check website finds an email and a hiring page, and raises the score.</span></div>';
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
    var t = ev.target && ev.target.closest && ev.target.closest("[data-lf],[data-lfsrc],[data-lfcheck]"); if (!t) return;
    ev.preventDefault();
    if (t.hasAttribute("data-lfsrc")) {
      if (F.busy || F.src === t.getAttribute("data-lfsrc")) return;
      var q = document.getElementById("lf-q"), c = document.getElementById("lf-city");
      if (q) F.q = q.value.trim(); if (c) F.city = c.value.trim();
      F.src = t.getAttribute("data-lfsrc"); F.res = []; F.pick = {}; F.err = ""; F.msg = ""; F.more = false; F.cursor = null; render(); return;
    }
    if (t.hasAttribute("data-lfcheck")) { var id = t.getAttribute("data-lfcheck"); checkSite(F.res.filter(function (b) { return b.id === id; })[0] || {}); return; }
    if (t.getAttribute("data-lf") === "more") search(true); else addPicked();
  });
  if (S.view === "finder") render();
})();
