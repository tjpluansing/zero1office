/* zero1office add-on: Proposal generator (Paolo, 2026-11-24).
   Company -> type -> form -> proposal preview -> email to the client through the viewer's Microsoft 365.
   Maxicare Individual and Family have full forms with age-based 2026 rates (MyMaxicare primer).
   Every other company and type gets a generic form until their own forms are built.
   Accredited hospitals, clinics, dental clinics, Maxicare PCCs and physicians come from providers.json and
   doctors.json (Maxicare lists as of Sep 2026), published next to the page. */
(function () {
  "use strict";
  var DAY = 864e5;
  function e(s) { return esc(s == null ? "" : String(s)); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (err) { return null; } }
  function say(m) { try { toast(m); } catch (err) { /* optional */ } }
  function peso0(n) { return "₱" + Math.round(n).toLocaleString("en-PH"); }
  function todayIso() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function longDate(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }); }
  function title(s) { return String(s || "").toLowerCase().replace(/(^|[\s(\-\/])([a-zñ])/g, function (m, a, b) { return a + b.toUpperCase(); }); }

  /* ---------- companies and types (Paolo's list) ---------- */
  var COMPANIES = [
    ["Maxicare", ["Prepaid", "Individual", "Family", "SME", "Corporate", "MPlus vs Corporate"]],
    ["Medicard", ["Prepaid", "Individual", "Family", "SME", "Corporate"]],
    ["Intellicare", ["SME", "Corporate"]],
    ["IMS", ["Group Plan", "Corporate", "Teacher", "Government", "Personnel"]],
    ["KHL", ["Individual", "Corporate"]],
  ];
  var GROUP_TYPES = ["SME", "Corporate", "MPlus vs Corporate", "Group Plan", "Teacher", "Government", "Personnel"];

  /* ---------- MyMaxicare 2026 rates, checked against the primer and the summary proposals ---------- */
  var PLANS = [
    { id: "pp", n: "Platinum Plus", mbl: 250000, room: "Large Private", pecD: [20000, 24000, 28000, 32000, 36000, 40000], pecN: 20000 },
    { id: "pl", n: "Platinum", mbl: 200000, room: "Regular Private", pecD: [15000, 18000, 21000, 24000, 27000, 30000], pecN: 15000 },
    { id: "go", n: "Gold", mbl: 150000, room: "Regular Private", pecD: [10000, 12000, 14000, 16000, 18000, 20000], pecN: 10000 },
    { id: "si", n: "Silver", mbl: 100000, room: "Semi-Private", pecD: [5000, 6000, 7000, 8000, 9000, 10000], pecN: 5000 },
  ];
  var BRACKETS = ["15 days – 5 yrs", "6 – 10 yrs", "11 – 15 yrs", "16 – 20 yrs", "21 – 25 yrs", "26 – 30 yrs", "31 – 35 yrs", "36 – 40 yrs", "41 – 45 yrs", "46 – 50 yrs", "51 – 55 yrs", "56 – 60 yrs"];
  // [annual, semi-annual] per bracket, per plan (Platinum Plus, Platinum, Gold, Silver). Inclusive of 12% VAT.
  var RATES = {
    individual: [
      [[72403, 39098], [42443, 22919], [37573, 20289], [27843, 15035]],
      [[59282, 32012], [34001, 18361], [29415, 15884], [23199, 12527]],
      [[48852, 26380], [27365, 14777], [24201, 13069], [19632, 10601]],
      [[47322, 25554], [25271, 13646], [23159, 12506], [18674, 10084]],
      [[47055, 25410], [26364, 14237], [22623, 12216], [18674, 10084]],
      [[48852, 26380], [29152, 15742], [26542, 14333], [21245, 11472]],
      [[58543, 31613], [34553, 18659], [32009, 17285], [22884, 12357]],
      [[73603, 39746], [45522, 24582], [42014, 22688], [27866, 15048]],
      [[93488, 50484], [61893, 33422], [53800, 29052], [41774, 22558]],
      [[111362, 60135], [83525, 45104], [64494, 34827], [50006, 27003]],
      [[125647, 67849], [101796, 54970], [67461, 36429], [50020, 27011]],
      [[138743, 74921], [115275, 62249], [78660, 42476], [55571, 30008]],
    ],
    family: [
      [[59205, 31971], [38563, 20824], [31019, 16750], [24405, 13179]],
      [[48449, 26162], [30980, 16729], [25001, 13501], [19882, 10736]],
      [[42206, 22791], [25125, 13568], [20616, 11133], [17068, 9217]],
      [[38506, 20793], [22992, 12416], [18417, 9945], [16217, 8757]],
      [[38885, 20998], [24574, 13270], [18157, 9805], [16162, 8727]],
      [[40723, 21990], [27073, 14619], [21374, 11542], [17930, 9682]],
      [[46057, 24871], [32579, 17593], [24954, 13475], [19422, 10488]],
      [[52564, 28385], [41188, 22242], [31625, 17078], [23129, 12490]],
      [[68051, 36748], [53520, 28901], [39408, 21280], [33317, 17991]],
      [[91302, 49303], [71555, 38640], [50194, 27105], [41512, 22416]],
      [[107329, 57958], [87296, 47140], [52712, 28464], [41697, 22516]],
      [[123308, 66586], [102724, 55471], [61019, 32950], [46303, 25004]],
    ],
  };
  // Quarterly is "subject for approval": 28% of the annual fee, as in Karla's proposals.
  function quarterly(annual) { return Math.round(annual * 0.28); }
  var RIDERS = [
    { id: "dental", n: "Standard Dental Benefit", fee: [387, 209, 108], note: "Optional every year" },
    { id: "ci", n: "Critical Illness (42) up to ₱300,000", fee: [3610, 1950, 1011], note: "Optional in years 1–2, built in from year 3" },
    { id: "cash", n: "Daily Hospital Cash Benefit of ₱500", fee: [627, 339, 176], note: "Optional in years 1–2, built in from year 3" },
  ];
  (function selfCheck() { // semi-annual is 54% of annual, rounded; flag any typo in the tables above
    ["individual", "family"].forEach(function (k) { RATES[k].forEach(function (row, b) { row.forEach(function (r, p) {
      if (Math.abs(Math.round(r[0] * 0.54) - r[1]) > 1) console.warn("[proposal generator] check rate", k, BRACKETS[b], PLANS[p].n, r);
    }); }); });
  })();

  /* ---------- ages ---------- */
  // The Individual and Family forms ask for age in years (Paolo, 2026-11-24): 0 means under one year old.
  function ageYears(v, who) {
    var t = String(v == null ? "" : v).trim();
    if (t === "") throw new Error("Enter " + who + " age.");
    if (!/^\d{1,2}$/.test(t)) throw new Error("Enter " + who + " age in whole years (0 for a baby under one).");
    var y = Number(t);
    if (y > 60) throw new Error(who.charAt(0).toUpperCase() + who.slice(1) + " age is over 60. MyMaxicare takes new members up to 60 years old.");
    return { y: y };
  }
  function ageText(a) { return a.y === 0 ? "under 1 yr" : a.y + " yr" + (a.y === 1 ? "" : "s"); }
  function bracketOf(a) { return a.y <= 5 ? 0 : Math.ceil((a.y - 5) / 5); }
  /* ---------- provider data ---------- */
  var PD = null, DD = null, pdErr = "", ddErr = "", pdLoading = false, ddLoading = null;
  function loadProviders() {
    if (PD || pdLoading) return; pdLoading = true;
    fetch("providers.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { PD = j; buildLoc(); if (S.view === "propgen") render(); })
      .catch(function () { pdErr = "The provider list didn't load. Reload the page to try again."; if (S.view === "propgen") render(); })
      .then(function () { pdLoading = false; });
  }
  function loadDoctors() {
    if (DD) return Promise.resolve(DD);
    if (!ddLoading) ddLoading = fetch("doctors.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { DD = j; return j; }, function () { ddErr = "The physician list didn't load."; ddLoading = null; return null; });
    return ddLoading;
  }
  var LOC = {};
  function buildLoc() {
    LOC = {};
    PD.f.forEach(function (f) {
      var r = PD.regions[f[2]]; if (!f[3] || !f[4]) return;
      LOC[r] = LOC[r] || {}; LOC[r][f[3]] = LOC[r][f[3]] || {}; LOC[r][f[3]][f[4]] = 1;
    });
  }
  var REGION_ORDER = ["NCR", "CAR", "REGION 1", "REGION 2", "REGION 3", "REGION 4-A", "REGION 4-B", "REGION 5", "REGION 6", "REGION 7", "REGION 8", "REGION 9", "REGION 10", "REGION 11", "REGION 12", "REGION 13", "BARMM"];
  var REGION_NAME = { "NCR": "NCR (Metro Manila)", "CAR": "CAR (Cordillera)", "REGION 1": "Region 1 (Ilocos)", "REGION 2": "Region 2 (Cagayan Valley)", "REGION 3": "Region 3 (Central Luzon)", "REGION 4-A": "Region 4-A (CALABARZON)", "REGION 4-B": "Region 4-B (MIMAROPA)", "REGION 5": "Region 5 (Bicol)", "REGION 6": "Region 6 (Western Visayas)", "REGION 7": "Region 7 (Central Visayas)", "REGION 8": "Region 8 (Eastern Visayas)", "REGION 9": "Region 9 (Zamboanga Peninsula)", "REGION 10": "Region 10 (Northern Mindanao)", "REGION 11": "Region 11 (Davao)", "REGION 12": "Region 12 (SOCCSKSARGEN)", "REGION 13": "Region 13 (Caraga)", "BARMM": "BARMM" };
  var KIND = { H: "Hospitals", P: "Maxicare Primary Care Clinics", C: "Clinics", D: "Dental clinics" };
  var LIMIT = { H: 15, P: 6, C: 12, D: 12 };
  // Facilities in the client's city first; when the city has fewer than 3, add the rest of the province, then the region.
  // Location is optional (Paolo, 2026-11-24). With a city, list facilities there first; with only a province or a region, list from there.
  // When the chosen place has fewer than 3, add the rest of the province, then the region.
  // Approximate city centres for Metro Manila, so fill-ins from other cities come nearest first (Paolo, 2026-11-25: "nearest").
  var NCR_XY = { "MANILA CITY": [14.5995, 120.9842], "QUEZON CITY": [14.676, 121.0437], "MAKATI CITY": [14.5547, 121.0244], "PASAY CITY": [14.5378, 121.0014], "TAGUIG CITY": [14.5176, 121.0509],
    "PASIG CITY": [14.5764, 121.0851], "MANDALUYONG CITY": [14.5794, 121.0359], "SAN JUAN": [14.6019, 121.0355], "MARIKINA CITY": [14.6507, 121.1029], "KALOOKAN CITY": [14.6488, 120.983],
    "MALABON CITY": [14.6625, 120.9567], "NAVOTAS": [14.6667, 120.9417], "VALENZUELA CITY": [14.7011, 120.983], "PARAÑAQUE CITY": [14.4793, 121.0198], "LAS PIÑAS CITY": [14.4445, 120.9939],
    "MUNTINLUPA CITY": [14.4081, 121.0415], "PATEROS": [14.5446, 121.0687] };
  function cityGap(a, b) { var p = NCR_XY[a], q = NCR_XY[b]; if (!p || !q) return 99; var dx = (p[0] - q[0]), dy = (p[1] - q[1]); return dx * dx + dy * dy; }
  function byNearCity(city) { return function (x, y) { return cityGap(city, x.f[4]) - cityGap(city, y.f[4]) || x.i - y.i; }; }
  var MIN = { H: 5, P: 3, C: 5, D: 5 };
  function nearby(loc) {
    if (!loc || !loc.region) return null;
    var out = {};
    ["H", "P", "C", "D"].forEach(function (k) {
      var all = PD.f.map(function (f, i) { return { i: i, f: f }; }).filter(function (x) { return x.f[1] === k && PD.regions[x.f[2]] === loc.region && !/temporarily closed|permanently closed/i.test(x.f[0]); });
      var here = all.filter(function (x) { return (!loc.prov || x.f[3] === loc.prov) && (!loc.city || x.f[4] === loc.city); });
      var prov = loc.city ? all.filter(function (x) { return x.f[3] === loc.prov && x.f[4] !== loc.city; }).sort(byNearCity(loc.city)) : [];
      var reg = loc.prov ? all.filter(function (x) { return x.f[3] !== loc.prov; }) : [];
      var pick = here.slice(0, LIMIT[k]).map(function (x) { x.where = loc.city ? "" : title(x.f[4] || x.f[3]); return x; });
      [prov, reg].forEach(function (g) {
        if (pick.length >= MIN[k]) return;
        g.slice(0, MIN[k] - pick.length).forEach(function (x) { x.where = title(x.f[4] || x.f[3]); pick.push(x); });
      });
      out[k] = { list: pick, inCity: here.length };
    });
    return out;
  }
  function nearFac(n) { // the client's own city first, then the nearest fill-ins
    var L = n.P.list.concat(n.H.list).concat(n.C.list);
    return L.filter(function (x) { return !x.where; }).concat(L.filter(function (x) { return x.where; })).map(function (x) { return x.i; });
  }
  function placeName(loc) {
    if (!loc || !loc.region) return "";
    if (loc.city) return title(loc.city) + ", " + title(loc.prov);
    if (loc.prov) return title(loc.prov);
    return REGION_NAME[loc.region] || loc.region;
  }
  function doctorsAt(facIdx, specs, perSpec) {
    if (!DD) return [];
    var set = {}; facIdx.forEach(function (i) { set[i] = 1; });
    var rank = {}; facIdx.forEach(function (i, r) { if (!(i in rank)) rank[i] = r; });
    var want = {}; specs.forEach(function (s) { var j = DD.specs.indexOf(s); if (j > -1) want[j] = []; });
    DD.d.forEach(function (d) {
      if (!(d[1] in want)) return;
      var at = d[3].filter(function (i) { return set[i]; }).sort(function (a, b) { return rank[a] - rank[b]; });
      if (at.length) want[d[1]].push({ n: d[0], sub: d[2], r: rank[at[0]], at: at.map(function (i) { return PD.f[i][0]; }) });
    });
    // physicians at the client's nearest hospitals and clinics first
    return Object.keys(want).map(function (j) { return { spec: DD.specs[j], docs: want[j].sort(function (a, b) { return a.r - b.r; }).slice(0, perSpec) }; });
  }

  /* ---------- state ---------- */
  var HIST_KEY = "zero1office-proposals:v1"; // company, type, date and status only: no client or member data is kept
  var G = { co: "", type: "", f: {}, members: [], specs: ["INTERNAL MEDICINE", "PEDIATRICS", "OBSTETRICS & GYNECOLOGY"], out: null, err: "", warn: [], sending: false, draft: null, review: null, tab: "email", mailErr: "" };
  function reset(keepPick) { var co = G.co, ty = G.type; G.f = {}; G.members = []; G.out = null; G.err = ""; G.warn = []; G.sending = false; G.draft = null; G.review = null; G.tab = "email"; G.mailErr = ""; G.mailEdit = false; G.tplDraft = null; G.ghl = null; G.ghlInfo = null; G.ghlStamp = null; if (!keepPick) { G.co = ""; G.type = ""; } else { G.co = co; G.type = ty; } }
  function formKind() { if (G.co === "Maxicare" && G.type === "SME") return "mxs"; if (G.co === "Maxicare" && G.type === "Corporate") return "mxc"; if (G.co === "Maxicare" && G.type === "Prepaid") return "mxp"; if (G.co === "Maxicare" && G.type === "MPlus vs Corporate") return "mxv"; if (G.co === "Maxicare" && G.type === "Individual") return "mxi"; if (G.co === "Maxicare" && G.type === "Family") return "mxf"; return G.type ? "generic" : ""; }

  /* ---------- view ---------- */
  function vPropgen() {
    loadProviders();
    var h = '<div class="ph"><div><h2>Proposal generator</h2><p>Pick the company and the plan type, fill in the form, check the proposal, then email it to the client.</p></div><button class="btn sm" data-go="proposals">All proposals</button></div>';
    h += '<div class="card pad stack"><h3>1. Company</h3><div class="chips" role="group" aria-label="Company">' + COMPANIES.map(function (c) {
      return '<button class="chip" data-pg="co" data-v="' + e(c[0]) + '" aria-pressed="' + (G.co === c[0]) + '">' + e(c[0]) + '</button>'; }).join("") + '</div>';
    if (G.co) {
      var types = COMPANIES.filter(function (c) { return c[0] === G.co; })[0][1];
      h += '<h3>2. Type</h3><div class="chips" role="group" aria-label="Plan type">' + types.map(function (t) {
        return '<button class="chip" data-pg="type" data-v="' + e(t) + '" aria-pressed="' + (G.type === t) + '">' + e(t) + '</button>'; }).join("") + '</div>';
    }
    h += '</div>';
    var k = formKind();
    if (k) h += G.out ? preview() : form(k);
    h += history();
    return h;
  }
  function inp(key, label, type, extra) {
    var v = G.f[key] == null ? "" : G.f[key];
    return '<label class="fld">' + label + '<input class="inp" id="pg-' + key + '" data-pgf="' + key + '" type="' + (type || "text") + '" value="' + e(v) + '"' + (extra || "") + '></label>';
  }
  function sel(key, label, opts, extra) {
    var v = G.f[key] == null ? "" : G.f[key];
    return '<label class="fld">' + label + '<select class="inp" id="pg-' + key + '" data-pgf="' + key + '"' + (extra || "") + '>' + opts.map(function (o) {
      var val = Array.isArray(o) ? o[0] : o, txt = Array.isArray(o) ? o[1] : o;
      return '<option value="' + e(val) + '"' + (String(v) === String(val) ? " selected" : "") + '>' + e(txt) + '</option>'; }).join("") + '</select></label>';
  }
  function locFields() {
    if (pdErr) return '<p class="err" role="alert">' + e(pdErr) + '</p>';
    if (!PD) return '<p class="muted small">Loading the Maxicare provider list…</p>';
    var regs = REGION_ORDER.filter(function (r) { return LOC[r]; });
    var provs = G.f.region && LOC[G.f.region] ? Object.keys(LOC[G.f.region]).sort() : [];
    var cities = G.f.prov && provs.indexOf(G.f.prov) > -1 ? Object.keys(LOC[G.f.region][G.f.prov]).sort() : [];
    return '<div class="z1-three">' +
      sel("region", "Region (optional)", [["", "Choose the region"]].concat(regs.map(function (r) { return [r, REGION_NAME[r] || r]; })), ' data-pgr="1"') +
      sel("prov", "Province (optional)", [["", provs.length ? "Choose the province" : "Choose the region first"]].concat(provs.map(function (p) { return [p, title(p)]; })), ' data-pgr="1"' + (provs.length ? "" : " disabled")) +
      sel("city", "City or municipality (optional)", [["", cities.length ? "Choose the city" : "Choose the province first"]].concat(cities.map(function (c) { return [c, title(c)]; })), cities.length ? "" : " disabled") +
      '</div><p class="muted small" style="margin:0">Where the client lives or works. Maya lists the nearest Primary Care Clinics, hospitals, clinics, physicians and dental clinics, and sends a MyMaxicare proposal back if this is missing. Only places with a Maxicare-accredited provider are listed.</p>';
  }
  function specPicker() {
    var specs = ["INTERNAL MEDICINE", "PEDIATRICS", "OBSTETRICS & GYNECOLOGY", "FAMILY MEDICINE", "GENERAL MEDICINE", "GENERAL SURGERY", "E.E.N.T.", "OPHTHALMOLOGY", "OTOLARYNGOLOGY-HEAD AND NECK SURGERY", "DERMATOLOGY", "PSYCHIATRY", "ORTHOPEDIC SURGERY", "UROLOGY", "PHYSICAL MEDICINE AND REHABILITATION", "NEUROSURGERY", "EMERGENCY MEDICINE"];
    return '<fieldset class="z1-box" style="margin:0"><legend class="z1-sect">Doctors to list</legend><div class="z1-flags">' + specs.map(function (s) {
      return '<label class="z1-check"><input type="checkbox" data-pgspec="' + e(s) + '"' + (G.specs.indexOf(s) > -1 ? " checked" : "") + '> ' + e(title(s)) + '</label>'; }).join("") +
      '</div><p class="muted small" style="margin:0">Accredited doctors of these specialties at the hospitals and Primary Care Clinics near the client.</p></fieldset>';
  }
  function contactFields(nameLabel) {
    return '<div class="z1-three">' + inp("name", nameLabel + " *", "text", ' maxlength="120" autocomplete="off"') + inp("email", "Client's email *", "email", ' maxlength="160" autocomplete="off"') + inp("mobile", "Mobile (optional)", "tel", ' maxlength="30" autocomplete="off"') + '</div>';
  }
  function form(k) {
    var h = '<form class="card pad stack" data-pgform="' + k + '" novalidate><h3>3. ' + e(G.co + " " + G.type) + ' details</h3>';
    if (k === "mxi") {
      h += '<div class="z1-three">' + inp("name", "Client's name *", "text", ' maxlength="120" autocomplete="off"') + inp("age", "Age *", "number", ' min="0" max="60" step="1" inputmode="numeric"') + inp("email", "Client's email *", "email", ' maxlength="160" autocomplete="off"') + '</div>' + locFields();
    } else if (k === "mxf") {
      h += '<div class="z1-three">' + inp("name", "Principal's name *", "text", ' maxlength="120" autocomplete="off"') + inp("age", "Principal's age *", "number", ' min="0" max="60" step="1" inputmode="numeric"') + inp("email", "Client's email *", "email", ' maxlength="160" autocomplete="off"') + '</div>' + members() + locFields();
    } else if (k === "mxs") {
      h += '<fieldset class="fld" style="border:0;padding:0;margin:0"><legend style="padding:0">Plan option *</legend><div class="chips" role="group" aria-label="Plan option">' + SME_OPTS.map(function (o) {
        return '<button type="button" class="chip" data-pg="smeopt" data-v="' + e(o.id) + '" aria-pressed="' + (G.f.opt === o.id) + '">' + e(o.n) + "</button>"; }).join("") + "</div></fieldset>" +
        '<div class="z1-three">' + inp("name", "Client name *", "text", ' maxlength="120" autocomplete="off"') + inp("org", "Company name (optional)", "text", ' maxlength="160" autocomplete="off"') + inp("email", "Client's email *", "email", ' maxlength="160" autocomplete="off"') + "</div>";
    } else if (k === "mxp") { // Paolo, 2026-11-25: Maxicare Prepaid asks only the client name (and the email to send to)
      h += '<div class="z1-three">' + inp("name", "Client name *", "text", ' maxlength="120" autocomplete="off"') + inp("email", "Client's email *", "email", ' maxlength="160" autocomplete="off"') + "</div>";
    } else if (k === "mxc" || k === "mxv") {
      h += '<div class="z1-three">' + inp("name", "Client name *", "text", ' maxlength="120" autocomplete="off"') + inp("org", "Company name *", "text", ' maxlength="160" autocomplete="off"') + inp("email", "Client's email *", "email", ' maxlength="160" autocomplete="off"') + "</div>";
    } else {
      h += genericFields();
    }
    if (k === "generic") h += '<label class="fld">Personal note to the client (optional)<textarea class="inp" id="pg-note" data-pgf="note" maxlength="1200" style="min-height:70px">' + e(G.f.note || "") + '</textarea></label>';
    if (G.warn.length) h += '<div class="z1-box" role="status">' + G.warn.map(function (w) { return '<p class="small" style="margin:0">⚠ ' + e(w) + '</p>'; }).join("") + '</div>';
    if (G.err) h += '<p class="err" role="alert">' + e(G.err) + '</p>';
    h += '<div class="actions"><button class="btn pri" type="submit">Generate proposal</button><button class="btn" type="button" data-pg="clear">Clear the form</button></div></form>';
    return h;
  }
  var DEFAULT_SPECS = ["INTERNAL MEDICINE", "PEDIATRICS", "OBSTETRICS & GYNECOLOGY", "FAMILY MEDICINE"];
  var REL = { spouse: "Spouse", child: "Child", parent: "Parent", sibling: "Sibling" };
  function members() {
    var h = '<div class="z1-box"><div class="z1-sect">Family members besides the principal</div>';
    G.members.forEach(function (m, i) {
      h += '<div class="z1-three" style="align-items:end">' +
        '<label class="fld">Member ' + (i + 2) + ' name *<input class="inp" data-pgm="name" data-i="' + i + '" value="' + e(m.name || "") + '" maxlength="120" autocomplete="off"></label>' +
        '<div style="display:flex;gap:8px;align-items:end"><label class="fld" style="flex:1">Age *<input class="inp" type="number" min="0" max="60" step="1" inputmode="numeric" data-pgm="age" data-i="' + i + '" value="' + e(m.age == null ? "" : m.age) + '"></label><button class="btn sm" type="button" data-pg="delm" data-v="' + i + '" aria-label="Remove member ' + (i + 2) + '">Remove</button></div></div>';
    });
    if (!G.members.length) h += '<p class="muted small" style="margin:0">Add the spouse, children, parents or siblings to be covered.</p>';
    if (G.members.length < 9) h += '<div><button class="btn sm" type="button" data-pg="addm">+ Add family member</button></div>';
    return h + '</div>';
  }
  function genericFields() {
    var grp = GROUP_TYPES.indexOf(G.type) > -1;
    var h = '<p class="muted small" style="margin:0">This is the general form. The full ' + e(G.co + " " + G.type) + ' form with rates comes later; for now the client gets a first proposal email confirming what they need, and Karla follows up with the computed rates.</p>';
    if (grp) {
      h += '<div class="z1-three">' + inp("org", (G.type === "Teacher" ? "School or teachers' group" : G.type === "Government" ? "Agency or office" : "Company name") + " *", "text", ' maxlength="160" autocomplete="off"') +
        inp("name", "Contact person *", "text", ' maxlength="120" autocomplete="off"') + inp("position", "Position (optional)", "text", ' maxlength="80"') + '</div>' +
        '<div class="z1-three">' + inp("email", "Contact's email *", "email", ' maxlength="160" autocomplete="off"') + inp("mobile", "Mobile (optional)", "tel", ' maxlength="30"') + inp("industry", "Industry (optional)", "text", ' maxlength="80"') + '</div>' +
        '<div class="z1-three">' + inp("heads", "Employees or members to cover *", "number", ' min="1" max="100000"') + inp("deps", "Dependents to cover (optional)", "number", ' min="0" max="100000"') + inp("avgage", "Average age (optional)", "number", ' min="0" max="80"') + '</div>' +
        '<div class="z1-three">' + inp("budget", "Budget per head a year, ₱ (optional)", "number", ' min="0"') + inp("current", "Current HMO (optional)", "text", ' maxlength="80"') + inp("renewal", "Current plan renews on (optional)", "date") + '</div>' +
        '<div class="z1-three">' + sel("room", "Preferred room (optional)", [["", "No preference"], "Ward", "Semi-Private", "Regular Private", "Large Private"]) + inp("mbl", "Preferred benefit limit, ₱ (optional)", "number", ' min="0"') + sel("mode", "Payment mode", [["", "No preference"], "Annual", "Semi-annual", "Quarterly", "Monthly"]) + '</div>';
    } else {
      h += contactFields("Client's full name") +
        '<div class="z1-three">' + inp("heads", G.type === "Individual" ? "People to cover" : G.type === "Family" ? "Family members to cover *" : "Cards or people to cover *", "number", ' min="1" max="50"' + (G.type === "Individual" ? ' value="1" disabled' : "")) +
        inp("ages", "Ages of the people to cover *", "text", ' maxlength="120" placeholder="e.g. 34, 32, 5"') + inp("budget", "Budget a year, ₱ (optional)", "number", ' min="0"') + '</div>' +
        '<div class="z1-three">' + sel("room", "Preferred room (optional)", [["", "No preference"], "Ward", "Semi-Private", "Regular Private", "Large Private"]) + inp("current", "Current HMO (optional)", "text", ' maxlength="80"') + sel("mode", "Payment mode", [["", "No preference"], "Annual", "Semi-annual", "Quarterly"]) + '</div>';
    }
    h += locFields();
    if (G.co === "Maxicare") h += specPicker();
    return h;
  }

  /* ---------- validation and proposal ---------- */
  var EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
  function need(v, msg) { if (v == null || String(v).trim() === "") throw new Error(msg); return String(v).trim(); }
  function readLoc() {
    if (!G.f.region) return null;
    if (!PD) throw new Error("Wait for the provider list to load, or clear the location.");
    return { region: G.f.region, prov: G.f.prov || "", city: (G.f.prov && G.f.city) || "" };
  }
  function generate() {
    G.err = ""; G.warn = [];
    var k = formKind(), f = G.f, c = {};
    c.name = need(f.name, k === "generic" && GROUP_TYPES.indexOf(G.type) > -1 ? "Enter the contact person." : "Enter the client's name.");
    c.email = need(f.email, "Enter the client's email so the proposal can be sent.");
    if (!EMAIL_RE.test(c.email)) throw new Error("The email address doesn't look right.");
    c.mobile = (f.mobile || "").trim();
    c.loc = readLoc(); c.note = (f.note || "").trim(); c.on = todayIso();
    if (k === "mxp") { finish(k, c); return Promise.resolve(); }
    if (k === "mxc" || k === "mxv") { // Paolo, 2026-11-25: Maxicare Corporate (and MPlus vs Corporate) asks the client name, company name and email
      c.org = need(f.org, "Enter the company name."); c.grp = true;
      finish(k, c); return Promise.resolve();
    }
    if (k === "mxs") { // Paolo, 2026-11-25: Maxicare SME asks only the option, client name, company (optional) and email
      var opt = SME_OPTS.filter(function (o) { return o.id === f.opt; })[0]; if (!opt) throw new Error("Pick the plan option: Starter, MPlus Group, MPlus Small, MPlus or MPlus Rated.");
      c.opt = opt; c.org = (f.org || "").trim(); c.grp = true;
      finish(k, c); return Promise.resolve();
    }
    if (k === "mxi" || k === "mxf") {
      c.plans = PLANS; c.modes = [0, 1, 2]; c.riders = RIDERS;
      var pa = ageYears(f.age, k === "mxi" ? "the client's" : "the principal's");
      c.people = [{ name: c.name, rel: "Principal", age: pa }];
      if (pa.y < 18) G.warn.push("The " + (k === "mxi" ? "client" : "principal") + " is under 18, so the application needs an appointed guardian.");
      if (pa.y === 0) G.warn.push("Babies must be at least 15 days old to enroll.");
      if (k === "mxf") {
        if (!G.members.length) throw new Error("Add at least one family member. For one person, use the Individual form.");
        G.members.forEach(function (m, i) {
          var who = "member " + (i + 2);
          var nm = need(m.name, "Enter " + who + "'s name.").trim();
          var a = ageYears(m.age, nm + "'s");
          c.people.push({ name: nm, rel: "Member " + (i + 2), age: a });
        });
        if (c.people.some(function (x, i) { return i && x.age.y > 21 && x.age.y < pa.y - 15; })) G.warn.push("Children and siblings must be 21 years 5 months or younger; parents and spouses up to 60. Karla should check each member's relationship.");
      }
      c.table = "individual"; if (k === "mxf") c.table = "family";
      c.near = nearby(c.loc);
      c.specs = DEFAULT_SPECS.slice();
      return loadDoctors().then(function () { finish(k, c); });
    }
    // generic
    var grp = GROUP_TYPES.indexOf(G.type) > -1;
    c.grp = grp;
    if (grp) { c.org = need(f.org, "Enter the company or group name."); c.heads = need(f.heads, "Enter how many employees or members to cover."); }
    else { c.heads = G.type === "Individual" ? "1" : need(f.heads, "Enter how many people to cover."); c.ages = need(f.ages, "Enter the ages of the people to cover."); }
    ["position", "industry", "deps", "avgage", "budget", "current", "renewal", "room", "mbl", "mode", "ages"].forEach(function (x) { if (f[x] && !c[x]) c[x] = String(f[x]).trim(); });
    if (G.co === "Maxicare" && c.loc) { c.near = nearby(c.loc); c.specs = G.specs.slice(); return loadDoctors().then(function () { finish(k, c); }); }
    finish(k, c); return Promise.resolve();
  }
  function finish(k, c) {
    var out = k === "generic" ? genericEmail(c) : k === "mxs" ? { subject: "Maxicare SME Plan Proposal" + (c.org ? " for " + c.org : ""), proposal: "" } : k === "mxc" ? { subject: "Maxicare Corporate Plan Proposal for " + c.org, proposal: "" } : k === "mxp" ? { subject: "Maxicare Prepaid Health Cards Proposal", proposal: "" } : k === "mxv" ? { subject: "Maxicare HMO Plan Proposal for " + c.org, proposal: "" } : maxicareEmail(k, c);
    out.to = c.email; out.kind = k; out.co = G.co; out.type = G.type; out.c = c;
    out.files = k === "mxs" ? smeFiles(c.opt) : k === "mxc" ? corpFiles() : k === "mxp" ? prepaidFiles() : k === "mxv" ? mvcFiles() : filesFor(G.co, G.type);
    // Paolo, 2026-11-25: the proposal is saved as a PDF named "Client Name_Client Age_MyMaxicare" and attached second.
    if (k === "mxi" || k === "mxf") out.files.splice(Math.min(1, out.files.length), 0, { gen: "pdf", name: pdfName(c), label: "Your MyMaxicare proposal (PDF)" });
    out.email = emailTemplate(k, c, out.files);
    out.html = k === "generic" ? out.email + "<hr>" + out.proposal : out.email;
    G.out = out; G.draft = null; G.mailErr = "";
    sendToAgent();
    render(); window.scrollTo(0, 0);
  }

  /* email HTML: only tags Outlook keeps (headings, p, lists, tables, b, a, br) */
  function tbl(head, rows) {
    return '<table><thead><tr>' + head.map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + x + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  var MODE_NAME = ["Annual", "Semi-annual", "Quarterly (subject for approval)"];
  function fee(table, bracket, planIdx, mode) { var r = RATES[table][bracket][planIdx]; return mode === 2 ? quarterly(r[0]) : r[mode]; }
  function letterTop(c, greet) {
    return "<p>" + e(longDate(c.on)) + "</p><p>Dear " + e(greet) + ",</p><p>I hope this email finds you well and in good health.</p>" +
      (c.note ? "<p>" + e(c.note).replace(/\n/g, "<br>") + "</p>" : "");
  }
  function signature() {
    return "<p>Should you have any questions or need clarifications, please feel free to contact me at 0977-217-6388 (Viber/WhatsApp/Telegram) or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p><p>Thank you.</p>" + KARLA_SIGNATURE;
  }
  function providersHtml(c) {
    var n = c.near; if (!n) return "";
    var h = "<h2>Accredited providers near you</h2><p>Maxicare-accredited providers in and around " + e(placeName(c.loc)) + " (Maxicare list as of " + e(PD.asOf) + "). The full network is open to you nationwide.</p>";
    ["P", "H", "C", "D"].forEach(function (k) {
      var L = n[k].list; if (!L.length) return;
      h += "<h3>" + KIND[k] + "</h3><ul>" + L.map(function (x) { return "<li>" + e(x.f[1] === "P" ? x.f[0] : title(x.f[0])) + (x.where ? " (" + e(x.where) + ")" : "") + "</li>"; }).join("") + "</ul>";
      if (n[k].inCity > L.length) h += "<p>…and " + (n[k].inCity - L.length) + " more in " + e(c.loc.city ? title(c.loc.city) : placeName(c.loc)) + ".</p>";
    });
    if (DD && c.specs.length) {
      var fac = nearFac(n);
      var docs = doctorsAt(fac, c.specs, 6).filter(function (g) { return g.docs.length; });
      if (docs.length) {
        h += "<h3>Accredited physicians near you</h3><p>At the Primary Care Clinics, hospitals and clinics listed above, nearest first.</p>";
        docs.forEach(function (g) {
          h += "<p><b>" + e(title(g.spec)) + "</b></p><ul>" + g.docs.map(function (d) { return "<li>Dr. " + e(title(d.n)) + (d.sub ? " (" + e(title(d.sub)) + ")" : "") + " · " + e(d.at.map(function (a) { return /^Maxicare PCC/.test(a) ? a : title(a); }).join(", ")) + "</li>"; }).join("") + "</ul>";
        });
        h += "<p>Doctors' schedules change; please confirm with the clinic before your visit.</p>";
      }
    }
    return h;
  }
  function benefitsHtml() {
    return "<h2>What MyMaxicare covers</h2><ul>" +
      "<li><b>In-patient care:</b> room and board, operating room and ICU, doctors' fees, medicines, lab tests and procedures while confined, up to the plan's maximum benefit limit.</li>" +
      "<li><b>Out-patient care:</b> consultations (free and unlimited at Maxicare Primary Care Clinics), lab and diagnostic tests, minor surgery, and more.</li>" +
      "<li><b>Emergency care:</b> at accredited hospitals; at non-accredited hospitals in the Philippines, 80% of bills and doctors' fees in the first 24 hours up to ₱30,000; abroad, up to ₱30,000; ambulance up to ₱2,500 per transfer.</li>" +
      "<li><b>Preventive care and annual check-up:</b> ACU Basic 5 (physical exam, CBC, urinalysis, fecalysis, chest X-ray) after 6 months of membership and payment.</li>" +
      "<li><b>Built in:</b> Group Life with Accidental Death, Dismemberment and Disablement (₱50,000 in years 1–2, ₱100,000 from year 3) and the Maxicare International Assist Program.</li>" +
      "<li><b>Pre-existing conditions:</b> covered from the first year up to the limits below; conditions acquired after you join are covered up to 100% of the limit.</li></ul>" +
      "<p>Fees include 12% VAT. PhilHealth must be filed first; non-PhilHealth members pay the PhilHealth portion.</p>";
  }
  function pecHtml(plans) {
    return "<h3>Pre-existing conditions coverage</h3>" +
      tbl(["Plan", "Dreaded, year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6 and up", "Non-dreaded, year 1", "Year 2 onwards"],
        plans.map(function (p) { return ["<b>" + p.n + "</b>"].concat(p.pecD.map(peso0)).concat([peso0(p.pecN), "100% of MBL"]); })) +
      "<p>Dreaded-condition limits increase each year when the member's loss ratio is below 50%.</p>";
  }
  /* ---------- the MyMaxicare proposal, in the layout of Karla's template (Paolo, 2026-11-25) ----------
     Built as blocks: the PDF pages them A4 with the Maxicare header, and "BREAK" starts a new page.
     Order: cover letter, MyMaxicare Healthcare Benefits Summary (1-9), plan and fees, riders, then
     Accredited providers near you at the end. */
  var PDF_IMG = { logo: "files/pdf/maxicare-logo.png", banner: "files/pdf/consultant-banner.jpg", sig: "files/pdf/karla-signature.jpg", bear: "files/pdf/maxicare-bear.png" };
  function ageLong(a) { return a.y === 0 ? "Under 1 year old" : a.y + (a.y === 1 ? " year old" : " years old"); }
  function chk(items, two) {
    if (!two) return '<ul class="ck">' + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
    var h = Math.ceil(items.length / 2);
    return '<div class="two">' + chk(items.slice(0, h)) + chk(items.slice(h)) + "</div>";
  }
  function sect(n, t) { return '<p class="sh">' + n + ".&nbsp;&nbsp;" + t + "</p>"; }
  var MX_BENEFITS = [
    sect(1, "In-patient care") + chk(["Room and Board Accommodation", "Use of Operating Room, Intensive Care Unit (ICU), Isolation Room and Recovery Room", "Professional fees of attending Physicians, Surgeons, Anesthesiologist and Cardio-pulmonary Specialist (for clearance before surgery and cardiac monitoring during surgery)", "Standard nursing services", "Medicines for In-patient use", "Anesthesia and its administration", "Blood product transfusions and intravenous (IV) fluids, including blood screening and cross matching", "X-ray, laboratory examinations, diagnostic tests, and therapeutic procedures incidental to confinement", "Dressings, conventional casts (plaster of Paris) and sutures", "Oxygen and its administration", "Standard admission kit", "All other items directly related in the medical management of the patient, as deemed medically necessary by the attending affiliated physician"], true),
    sect(2, "Out-patient care") + chk(["Consultations (Free unlimited consultations at Maxicare's Primary Care Centers)", "Treatment of minor injuries", "X-ray, laboratory examinations, routine, diagnostic and therapeutic procedures", "Minor surgery not requiring confinement", "Eye laser therapy for retinal tear / hole / detachment and glaucoma", "Sclerotherapy (for varicose veins)", "Electrocauterization of skin lesions such as plantar warts, flat warts, periungual warts, filiform warts, and molluscum contagiosum, in any part of the body", "Allergy testing", "Tuberculin test", "Speech Therapy (For Stroke patients only)"], true),
    sect(3, "Emergency Care") + '<p class="ctr u">Affiliated Hospital</p>' + chk(["Doctor's services", "Emergency Room fees", "Medicines used for immediate relief and during treatment", "Oxygen, intravenous (IV) fluids and blood products", "Dressings, conventional casts (plaster of Paris) and sutures", "X-rays, laboratory, diagnostic examinations, and other medical services related to the emergency treatment of the patient", "Initial treatment of animal bites shall be covered for the first twenty-four (24) hours from the time of bite subject to MBL (except cost of vaccines)"], true),
    '<p class="ctr u">Non-Affiliated Hospital</p><p><b><i>Within the Philippines</i></b><br>Reimbursement up to 80% of the actual hospital bills and 80% of the Professional fees (based on Maxicare rates) incurred during the first twenty-four (24) hours of treatment up to PHP 30,000.00 / availment / member.</p>' +
      "<p><b><i>Areas without accredited hospitals within the Philippines</i></b><br>Reimbursement of 100% actual costs of the total hospital bills and Professional fees (based on Maxicare rates) up to PHP 30,000.00 / availment / member.</p>" +
      "<p><b><i>Outside the Philippines</i></b><br>Maxicare shall reimburse 100% actual costs up to PHP 30,000.00 / availment / member<br>Ambulance Service up to PHP 2,500.00 per conduction</p>" +
      "<p><b>Ambulance Service</b><br>Maxicare will cover road ambulance service for transfers from an affiliated hospital to another affiliated hospital up to MBL and Php2,500 per conduction if it is from a non-affiliated Hospital to an affiliated Hospital (on reimbursement basis).</p>",
    sect(4, "Preventive Care") + chk(["Passive and active vaccines for treatment of tetanus and animal bites shall be covered up to Php18,000 per member per year", "Periodic monitoring of health problems", "Health education and counseling on diets and exercise", "Health habits &amp; family planning counseling"]),
    sect(5, "Annual Check Up") + "<p style=\"margin:0 0 2px 18px\">Clinic-based Annual Check-Up, consist of five (5) basic routines:</p>" + chk(["History and Physical Exam", "Complete Blood Count (CBC)", "Routine Urinalysis", "Routine Fecalysis", "Chest X-ray (PA and Lateral X-ray)"], true) +
      "<p>The ACU however, may only be availed within the contract period after (1) payment of at least six (6) month worth of membership, and (2) must be a member of at least six (6) months starting from the effectivity date. Members must notify Maxicare's Customer Care Department (CCD) at least one (1) month prior to the preferred schedule. Any request for rescheduling or change of venue must be in writing and shall be allowed only once provided request was forwarded to CCD at least one (1) week prior to the original ACU schedule. Otherwise, ACU entitlement shall be forfeited.</p>",
    sect(6, "Dental Care (Optional)") + chk(["Oral Consultation/ Examination", "Once a year Oral Prophylaxis", "Simple Tooth Extraction", "Oral Incision and drainage", "Unlimited Temporary Fillings, as needed", "Simple Repair and Adjustment of Dentures", "Recementation of Jacket Crowns, Bridges, Inlay and Onlay", "Palliative Treatment of Simple Mouth Sores and Blisters", "Desensitization of Hypersensitive Teeth – up to 2 Teeth per year", "Permanent Fillings – up to 2 Teeth per year", "Gum Treatment for Cases Like Inflammation or Bleeding", "Emergency Dental Treatment"], true),
    sect(7, "Additional Benefits") + chk(["Life Insurance coverage with Accidental Death, Dismemberment &amp; Disablement up to Php50,000", "Initial Treatment within 24 hours from time of bite of Animal bites - subject to MBL (except cost of vaccines)", "Succeeding treatment after 24 hours from time of bite of Animal bites - subject to MBL (except cost of vaccines)", "Vaccines for treatment of tetanus and animal bites (including administration fee but excluding ER Fees) - up to P18,000/member/year (shared limit for OP and IP)", "Chronic Dermatoses - Consultations only", "Scoliosis including necessary procedures, except physical therapy sessions, whether congenital, pre-existing, developmental or acquired - Up to P20,000/member/year (shared limit for OP and IP)<br><i>Note: Physical Therapy sessions shall form part of the Physical therapy/ Occupational therapy limits</i>", "Congenital Conditions except physical therapy sessions and developmental disorders - up to P20,000/member/year (shared limit for OP and IP)<br><i>Note: Physical Therapy sessions shall form part of the Physical therapy/ Occupational therapy limits</i>"], true),
    sect(8, "Maxicare International Assist Program") + '<p class="u" style="margin:0 0 2px 18px">Medical Emergency Assistance</p>' + chk(["Emergency Medical Evacuation", "Emergency Medical Repatriation", "Medical Referral", "Medical Monitoring", "Prescription Assistance", "Foreign Hospital", "Admission Assistance", "Return of Mortal Remains"], true) +
      '<p class="u" style="margin:6px 0 2px 18px">Non-Medical Emergency Assistance</p>' + chk(["Compassionate Visit", "Care of Minor Children", "Emergency Message Transmission", "Lost Luggage or Document Assistance", "Legal and Interpreter Referrals", "Pre-Trip Information", "Mobile App Services"], true),
    sect(9, "Pre-Existing Conditions Coverage") + "<p><b>Pre-Existing Condition</b> is an illness or disease that exists prior to the effective date of the member's coverage to Maxicare, for MYMAXICARE, within the first 12months from the effective date.</p>" +
      chk(["The member has obtained professional advice or treatment prior to the effective date of member's coverage", "The illness or injury was an evident upon medical examination in connection with the member's applications", "The natural history of the illness or injury can be clinically determined to have started prior to the effective date of coverage whether the member is aware of it or not."]) +
      "<p><b>Acquired Condition</b> is an illness or injury considered and can be clinically determined to have manifested/occurred after the effective date of Member's coverage. For MyMaxicare accounts, Acquired Condition is any condition that was not diagnosed, or for which no medical care or advice was rendered, prior to or within 12 months from date of effectivity.</p>" +
      "<p><b>Dreaded Disease/Condition</b> is any condition that is considered to be chronic, progressive, life-threatening and which may entail lifelong therapy wherein complete cure cannot be ensured.</p>",
  ];
  function pecTables() {
    var P = PLANS;
    var h = '<p style="margin-top:8px">ENHANCED COVERAGE FOR DREADED and NON-DREADED CONDITIONS</p>' +
      '<table class="pt"><tr><th class="dk" colspan="7">DREADED PRE-EXISTING CONDITIONS (PEC)</th></tr><tr><th rowspan="2">PLAN TYPE</th><th colspan="6">YEARS OF MEMBERSHIP</th></tr>' +
      "<tr><th>1ST YEAR</th><th>2ND YEAR</th><th>3RD YEAR</th><th>4TH YEAR</th><th>5TH YEAR</th><th>6TH YEAR &amp; UP</th></tr>" +
      P.map(function (p) { return "<tr><td><b>" + p.n + "</b></td>" + p.pecD.map(function (v) { return '<td class="c">' + peso0(v) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
    h += '<div class="two" style="align-items:start"><table class="pt"><tr><th class="dk" colspan="3">NON-DREADED PRE-EXISTING CONDITIONS (PEC)</th></tr><tr><th rowspan="2">PLAN TYPE</th><th colspan="2">YEARS OF MEMBERSHIP</th></tr><tr><th>1ST YEAR</th><th>2ND YEAR ONWARDS</th></tr>' +
      P.map(function (p, i) { return "<tr><td><b>" + p.n + '</b></td><td class="c">' + peso0(p.pecN) + "</td>" + (i ? "" : '<td class="c" rowspan="' + P.length + '"><b>100% MBL</b></td>') + "</tr>"; }).join("") + "</table>" +
      '<div class="note">Note that if the member has:' + chk(["Below 50% Loss Ratio, an increase in coverage will take effect.", "50% and up Loss Ratio, coverage will remain the same from previous year."]) + "</div></div>";
    h += '<table class="pt" style="width:50%"><tr><th class="dk" colspan="2">ACQUIRED DREADED and NON-DREADED CONDITIONS</th></tr><tr><th rowspan="2">PLAN TYPE</th><th>YEARS OF MEMBERSHIP</th></tr><tr><th>1ST YEAR ONWARDS</th></tr>' +
      P.map(function (p, i) { return "<tr><td><b>" + p.n + "</b></td>" + (i ? "" : '<td class="c" rowspan="' + P.length + '"><b>100% MBL</b></td>') + "</tr>"; }).join("") + "</table>";
    return h;
  }
  var PLAN_TINT = ["#F8C9CB", "#C9DCF3", "#E9DFC4", "#E3DDF0"];
  function maxicareEmail(k, c) {
    var fam = k === "mxf", P = c.plans, idx = P.map(function (p) { return PLANS.indexOf(p); });
    var totals = c.modes.map(function () { return idx.map(function () { return 0; }); }), calc = [];
    c.people.forEach(function (m) {
      var b = bracketOf(m.age), fees = c.modes.map(function (mo) { return idx.map(function (pi) { return fee(c.table, b, pi, mo); }); });
      fees.forEach(function (row, mi) { row.forEach(function (v, j) { totals[mi][j] += v; }); });
      calc.push({ name: m.name, y: m.age.y, b: b, age: m.age, fees: fees });
    });
    var B = [];
    // 1. cover letter (Karla's template, word for word)
    B.push('<div class="letter"><p>' + e(longDate(c.on)) + "</p><p>Dear " + e(c.name) + ",</p><p>I hope this email finds you well and in good health.</p>" +
      "<p>For over 37 years, Maxicare has continued its legacy of providing the most comprehensive healthcare benefits through our wide Network of Medical Providers nationwide, composed of 56,000 affiliated Specialists, Fellows, and Diplomats, and more than 1,000 hospitals and clinics nationwide; with our excellent delivery system through superior Customer Service, highlighted by a call center that's accessible 24 hours a day, seven days a week.</p>" +
      "<p>Driven by its vision to serve and provide value to its customers, Maxicare shall remain passionate and dedicated to its mission of helping people achieve a peace of mind while giving the finest healthcare service so they may live their best lives.</p>" +
      "<p>Our HMO (<i>Health Maintenance Organization</i>) covers Inpatient, Outpatient, Emergency, Dental, Life/Accidental Death &amp; Dismemberment, Annual check-up, and other additional benefits. And we are also the first HMO that covers COVID-19 related cases. We have different solutions that can cater to your employee's HMO requirements.</p>" +
      "<p>Please see the attached summary of healthcare benefits plans that we have, and I will be happy to discuss our products and programs in greater detail and how we may link up for an efficient and cost-effective administration of your employee health care requirements at your most convenient time.</p>" +
      '<p>Should you have questions, please feel free to call me at <b>0977-217-6388</b> or email me at <a href="mailto:karlaluansing.maxicare@gmail.com">karlaluansing.maxicare@gmail.com</a>.</p>' +
      "<p>I hope to hear from you soon and looking forward to being your trusted Employee Benefits Solutions Partner.</p>" +
      '<p style="margin-bottom:0">Respectfully Yours,</p><img class="sig" src="' + PDF_IMG.sig + '" alt="Karla Luansing signature"><p>Karla Junesha Luansing<br>Health Benefit Consultant, A465132</p></div>');
    B.push("BANNER", "BREAK");
    // 2. MyMaxicare Healthcare Benefits Summary
    MX_BENEFITS.forEach(function (x) { B.push(x); });
    B.push(pecTables(), "BREAK");
    // 3. plan and membership fees
    var cols = P.length + 1;
    var plan = "<p>This is a full HMO program offering tailored plans with a fixed set of benefits, suitable for individuals and families. It covers extensive benefits for in-patient, out-patient, emergency and preventive care, plus optional dental plan and added features.</p>" +
      '<table class="ft"><colgroup><col style="width:24%">' + P.map(function () { return "<col>"; }).join("") + "</colgroup>" +
      '<tr><td class="lb">AGE ELIGIBILITY:</td><td colspan="' + P.length + '">Principal/Dependent(s): 15 days old – 60 years old<br><i>Note: 15 days old – 17 years old with appointed Guardian</i></td></tr>' +
      '<tr><td class="lb">RENEWAL AGE:</td><td colspan="' + P.length + '"><b>Principal</b>: Up to 65 years old<br><b>Dependent(s)</b>: Up to 65 years old with renewing principal</td></tr>' +
      '<tr><td class="lb">PLAN TYPE:</td>' + idx.map(function (pi) { return '<td class="c" style="background:' + PLAN_TINT[pi] + '"><b>' + PLANS[pi].n + "</b></td>"; }).join("") + "</tr>" +
      '<tr><td class="lb">MAXIMUM BENEFIT LIMIT:<br><span style="font-weight:400">(per illness per year)</span></td>' + idx.map(function (pi) { return '<td class="c" style="background:' + PLAN_TINT[pi] + '">' + (PLANS[pi].mbl / 1000) + "K</td>"; }).join("") + "</tr>" +
      '<tr><td class="lb">ROOM &amp; BOARD:</td>' + idx.map(function (pi) { return '<td class="c" style="background:' + PLAN_TINT[pi] + '">' + PLANS[pi].room + "</td>"; }).join("") + "</tr>" +
      '<tr><td class="lb">TERMS OF PAYMENT:</td><td class="c" colspan="' + P.length + '">Annual, Semi-Annual, and Quarterly</td></tr>';
    var MODE_HEAD = [["ANNUAL MEMBERSHIP FEES (approx.)", "#C00000"], ["SEMI-ANNUAL MEMBERSHIP FEES (approx.)", "#1F3FA6"], ["QUARTERLY MEMBERSHIP FEES (approx.) – SUBJECT FOR APPROVAL", "#7030A0"]];
    c.modes.forEach(function (mo, mi) {
      plan += '<tr class="gap"><td colspan="' + cols + '"></td></tr><tr><td class="mh" colspan="' + cols + '" style="color:' + MODE_HEAD[mo][1] + '">' + MODE_HEAD[mo][0] + "</td></tr>";
      calc.forEach(function (m) {
        plan += '<tr><td class="r">' + (fam ? e(m.name) + ", " : "") + e(ageLong(m.age).toLowerCase().replace(/^u/, "U")) + "</td>" + m.fees[mi].map(function (v, j) { return '<td class="c" style="background:' + PLAN_TINT[idx[j]] + '">' + peso0(v) + "</td>"; }).join("") + "</tr>";
      });
      if (fam) plan += '<tr><td class="r"><b>Total for the family</b></td>' + totals[mi].map(function (v, j) { return '<td class="c" style="background:' + PLAN_TINT[idx[j]] + '"><b>' + peso0(v) + "</b></td>"; }).join("") + "</tr>";
    });
    plan += "</table>";
    if (fam) plan += '<p class="small">Fees are per member based on age today. Dependents may take the same plan as the principal or one plan lower; the table shows everyone on the same plan.</p>';
    B.push(plan);
    B.push('<table class="rt"><tr><th>RIDERS</th><th>Year 1 &amp; 2</th><th>Year 3 Onwards</th></tr>' +
      "<tr><td><b>Group Life ADD&amp;D</b></td><td>₱ 50K (BUILT-IN Coverage)</td><td>₱ 100K (BUILT-IN Coverage)</td></tr>" +
      "<tr><td><b>Standard Dental Benefit</b></td><td>(Optional, Separate Fee)</td><td>(Optional, Separate Fee)</td></tr>" +
      "<tr><td><b>Critical Illness up to 300K</b></td><td>₱ 300K (Optional, Separate Fee)</td><td>₱ 300K (BUILT-IN Coverage)</td></tr>" +
      "<tr><td><b>Daily Hospital Cash Benefit of Php 500</b></td><td>₱ 500 (Optional, Separate Fee)</td><td>₱ 500 (BUILT-IN Coverage)</td></tr></table>");
    B.push('<table class="rt"><tr><th>RIDERS\' FEE' + (fam ? " (per member)" : "") + "</th>" + c.modes.map(function (m) { return "<th>" + ["Annual", "Semi-Annual", "Quarterly"][m] + "</th>"; }).join("") + "</tr>" +
      [["Standard Dental Benefit", RIDERS[0]], ["Critical Illness up to 300K", RIDERS[1]], ["Daily Hospital Cash Benefit of Php 500", RIDERS[2]]].map(function (r) {
        return "<tr><td><b>" + r[0] + "</b></td>" + c.modes.map(function (m) { return "<td>₱ " + r[1].fee[m].toLocaleString("en-PH") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>");
    // 4. accredited providers near the client, at the end (Paolo, 2026-11-25)
    var near = providerBlocks(c); if (near.length) B.push("BREAK");
    near.forEach(function (x) { B.push(x); });
    B.push("BANNER");
    return { subject: "Maxicare " + (fam ? "Family" : "Individual") + " Plan Proposal", blocks: B, proposal: blocksHtml(B), total: fam ? totals : null, calc: calc, modes: c.modes, idx: idx, table: c.table, fam: fam };
  }
  // The same providers list as before, cut into small blocks so the PDF can page it.
  function providerBlocks(c) {
    var n = c.near; if (!n) return [];
    var out = ['<h2 class="ph2">Accredited providers near you</h2><p>Maxicare-accredited providers in and around ' + e(placeName(c.loc)) + " (Maxicare list as of " + e(PD.asOf) + "). The full network is open to you nationwide.</p>"];
    function list(head, items, tail) {
      for (var i = 0; i < items.length; i += 6) out.push((i ? "" : "<h3>" + head + "</h3>") + '<ul class="pl">' + items.slice(i, i + 6).map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>");
      if (tail) out.push("<p>" + tail + "</p>");
    }
    ["P", "H", "C", "D"].forEach(function (k) {
      var L = n[k].list; if (!L.length) return;
      list(KIND[k], L.map(function (x) { return e(x.f[1] === "P" ? x.f[0] : title(x.f[0])) + (x.where ? " (" + e(x.where) + ")" : ""); }),
        n[k].inCity > L.length ? "…and " + (n[k].inCity - L.length) + " more in " + e(c.loc.city ? title(c.loc.city) : placeName(c.loc)) + "." : "");
    });
    if (DD && c.specs.length) {
      var fac = nearFac(n);
      var docs = doctorsAt(fac, c.specs, 6).filter(function (g) { return g.docs.length; });
      if (docs.length) {
        out.push("<h3>Accredited physicians near you</h3><p>At the Primary Care Clinics, hospitals and clinics listed above, nearest first.</p>");
        docs.forEach(function (g) { list(e(title(g.spec)), g.docs.map(function (d) { return "Dr. " + e(title(d.n)) + (d.sub ? " (" + e(title(d.sub)) + ")" : "") + " · " + e(d.at.map(function (a) { return /^Maxicare PCC/.test(a) ? a : title(a); }).join(", ")); })); });
        out.push("<p>Doctors' schedules change; please confirm with the clinic before your visit.</p>");
      }
    }
    return out;
  }
  function blocksHtml(B) {
    return '<div class="pgp">' + B.map(function (x) { return x === "BREAK" ? '<hr class="pgbrk">' : x === "BANNER" ? '<img class="banner" src="' + PDF_IMG.banner + '" alt="Karla Luansing, Health Benefit Consultant, Maxicare">' : x; }).join("") + "</div>";
  }
  function genericEmail(c) {
    var who = c.grp ? c.org : c.name;
    var h = "<h1>" + e(G.co + " " + G.type) + " proposal request</h1><p>What we have noted so far" + (c.grp ? " for " + e(c.org) : "") + ":</p>";
    var rows = [];
    function add(l, v) { if (v != null && String(v).trim() !== "") rows.push(["<b>" + l + "</b>", e(v)]); }
    if (c.grp) { add("Company or group", c.org); add("Contact", c.name + (c.position ? ", " + c.position : "")); add("Industry", c.industry); add("Employees or members", c.heads); add("Dependents", c.deps); add("Average age", c.avgage); add("Current HMO", c.current); add("Current plan renews on", c.renewal ? longDate(c.renewal) : ""); }
    else { add("Name", c.name); add("People to cover", c.heads); add("Ages", c.ages); add("Current HMO", c.current); }
    add("Location", placeName(c.loc)); add("Preferred room", c.room); add("Preferred benefit limit", c.mbl ? peso0(c.mbl) : ""); add("Budget", c.budget ? peso0(c.budget) + (c.grp ? " per head a year" : " a year") : ""); add("Payment mode", c.mode);
    h += tbl(["Details", ""], rows);
    h += "<h2>Next steps</h2><ul><li>I'll prepare the " + e(G.co) + " plan options and rates that fit " + (c.grp ? "your group" : "you") + " and send them within 1 to 2 business days.</li><li>If anything above needs correcting, or you'd like to add " + (c.grp ? "your census (names, birthdates and gender)" : "the birthdates of everyone to be covered") + ", just reply to this email.</li></ul>";
    if (c.near) h += providersHtml(c);
    return { subject: G.co + " " + G.type + " proposal for " + who, proposal: h };
  }

  /* ---------- files to attach, by product type (Paolo, 2026-11-24) ---------- */
  // Paolo, 2026-11-24: Individual and Family plans attach Karla's pubmat first, then the primer with rates and the PCCs and other services guide.
  var MX_FILES = [
    ["files/karla-luansing-maxicare-pubmat.jpg", "Karla Luansing Maxicare Pubmat.jpg", "Maxicare plans and benefits at a glance"],
    ["files/mymaxicare-primer-with-rates.pdf", "MyMaxicare_Primer with Rates.pdf", "MyMaxicare primer with rates"],
    ["files/maxicare-pccs-and-other-services.pdf", "Maxicare_PCCs_and_Other_Services.pdf", "Maxicare Primary Care Clinics and other services"],
  ];
  var FILES = { "Maxicare|Individual": MX_FILES, "Maxicare|Family": MX_FILES };
  // Maxicare SME (Paolo, 2026-11-25): pubmat, PCCs guide, then the option's proposal and setup template. Files with no path aren't uploaded yet.
  var SME_OPTS = [
    { id: "starter", n: "Starter", prop: "Maxicare_SME_Starter Plan_Standard Proposal", tpl: "Maxicare_SME_Starter Plan_Template" },
    { id: "group", n: "MPlus Group", prop: "Maxicare_SME_MPlus-10-19Group Plan_Standard Proposal", tpl: "Maxicare_SME_MPlus Plan_Template" },
    { id: "small", n: "MPlus Small", prop: "Maxicare_SME_MPlus-20-99Small Plan_Standard Proposal", tpl: "Maxicare_SME_MPlus Plan_Template" },
    { id: "mplus", n: "MPlus", prop: "Maxicare_SME_MPlus Plan_Standard Proposal", tpl: "Maxicare_SME_MPlus Plan_Template" },
    { id: "rated", n: "MPlus Rated", prop: "Maxicare_SME_MPlus Plan_Rated Proposal", tpl: "Maxicare_SME_MPlus Plan_Template" },
  ];
  var SME_PATHS = { // file name -> published path, filled in as Paolo uploads them
    "Maxicare_Corporate_Standard Plan": "files/corp/corporate-standard-plan.pdf",
    "Maxicare_Prospective Corporate Account Form (PCAF)": "files/corp/pcaf.pdf",
  };
  var SME_EXT = { "Maxicare_Corporate_Standard Plan": ".pdf", "Maxicare_Corporate Set Up_Template": ".xlsx", "Maxicare_Prospective Corporate Account Form (PCAF)": ".pdf" };
  // Maxicare Corporate (Paolo, 2026-11-25), in his order
  // A file uploaded in Settings > Files and linked to an attachment slot replaces the built-in one (Paolo, 2026-11-25).
  function fromRepo(list) {
    return list.map(function (f) {
      var ss = f.slots || [f.slot || f.label];
      for (var i = 0; i < ss.length; i++) {
        var r = window.Z1Files && window.Z1Files.forSlot(ss[i]);
        if (r) return { repo: r, path: "", name: (f.prefix && r.name.indexOf(f.prefix) !== 0 ? f.prefix : "") + r.name, label: f.label };
      }
      return f;
    });
  }
  window.Z1PG_SLOTS = ["Karla Luansing_Maxicare_HMO Pubmat", "Maxicare_Prepaid Health Cards_2026_Proposal", "OPTION 1_Maxicare_SME_MPlus Plan_Standard Proposal", "OPTION 1_Maxicare_SME_MPlus Plan_Template", "OPTION 2_Maxicare_CORP_Primer", "OPTION 2_Maxicare_Corporate Set Up_Template", "OPTION 2_Maxicare_Corporate_Standard Plan", "OPTION 2_Maxicare_Prospective Corporate Account Form (PCAF)", "Maxicare_Corporate_Standard Plan", "Maxicare_Corporate Set Up_Template", "Maxicare_Prospective Corporate Account Form (PCAF)"]
    .concat(SME_OPTS.map(function (o) { return o.prop; }))
    .concat(SME_OPTS.map(function (o) { return o.tpl; }).filter(function (t, i, a) { return a.indexOf(t) === i; }));
  // For App health (v80): every product's files that still have nothing uploaded, by product.
  window.Z1PG_missing = function () {
    var out = [], add = function (prod, list) { list.forEach(function (f) { if (f.missing && !out.some(function (x) { return x.label === f.label; })) out.push({ prod: prod, label: f.label }); }); };
    try { add("Maxicare Prepaid", prepaidFiles()); add("MPlus vs Corporate", mvcFiles()); add("Maxicare Corporate", corpFiles()); SME_OPTS.forEach(function (o) { add("Maxicare SME " + (o.n || o.prop), smeFiles(o)); }); } catch (err) { /* optional */ }
    return out;
  };
  // Maxicare Prepaid (Paolo, 2026-11-25)
  function prepaidFiles() {
    return fromRepo([
      { path: MX_FILES[0][0], name: "Karla Luansing_Maxicare_HMO Pubmat.jpg", label: "Karla Luansing_Maxicare_HMO Pubmat" },
      { path: "", name: "Maxicare_Prepaid Health Cards_2026_Proposal", label: "Maxicare_Prepaid Health Cards_2026_Proposal", missing: true },
    ]);
  }
  // Maxicare MPlus vs Corporate (Paolo, 2026-11-25), in his order. Each OPTION file has its own attachment slot
  // (Paolo uploaded OPTION-specific copies); if it's empty the SME MPlus or Corporate file is used.
  function mvcFiles() {
    var mp = SME_OPTS.filter(function (o) { return o.id === "mplus"; })[0], X = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    var L = ["OPTION 1_Maxicare_SME_MPlus Plan_Standard Proposal", "OPTION 1_Maxicare_SME_MPlus Plan_Template", "OPTION 2_Maxicare_CORP_Primer", "OPTION 2_Maxicare_Corporate Set Up_Template", "OPTION 2_Maxicare_Corporate_Standard Plan", "OPTION 2_Maxicare_Prospective Corporate Account Form (PCAF)"];
    return fromRepo([
      { path: MX_FILES[0][0], name: "Karla Luansing_Maxicare_HMO Pubmat.jpg", label: "Karla Luansing_Maxicare_HMO Pubmat" },
      { path: MX_FILES[2][0], name: MX_FILES[2][1], label: "Maxicare_PCCs_and_Other_Services" },
      { path: "", name: L[0], label: L[0], slots: [L[0], mp.prop], prefix: "OPTION 1_", missing: true },
      { path: "", name: L[1], label: L[1], slots: [L[1], mp.tpl], prefix: "OPTION 1_", missing: true },
      { path: "", name: L[2], label: L[2], slots: [L[2]], missing: true },
      { path: "files/corp/corporate-set-up-template.xlsx.b64.txt", b64: true, mime: X, name: L[3] + ".xlsx", label: L[3], slots: [L[3], "Maxicare_Corporate Set Up_Template"], prefix: "OPTION 2_" },
      { path: SME_PATHS["Maxicare_Corporate_Standard Plan"], name: L[4] + ".pdf", label: L[4], slots: [L[4], "Maxicare_Corporate_Standard Plan"], prefix: "OPTION 2_" },
      { path: SME_PATHS["Maxicare_Prospective Corporate Account Form (PCAF)"], name: L[5] + ".pdf", label: L[5], slots: [L[5], "Maxicare_Prospective Corporate Account Form (PCAF)"], prefix: "OPTION 2_" },
    ]);
  }
  function corpFiles() {
    return fromRepo([
      { path: MX_FILES[0][0], name: "Karla Luansing_Maxicare_HMO Pubmat.jpg", label: "Karla Luansing_Maxicare_HMO Pubmat" },
      { path: SME_PATHS["Maxicare_Corporate_Standard Plan"] || "", name: "Maxicare_Corporate_Standard Plan" + (SME_EXT["Maxicare_Corporate_Standard Plan"] || ""), label: "Maxicare_Corporate_Standard Plan", missing: !SME_PATHS["Maxicare_Corporate_Standard Plan"] },
      { path: MX_FILES[2][0], name: MX_FILES[2][1], label: "Maxicare_PCCs and Other Services" },
      { path: "files/corp/corporate-set-up-template.xlsx.b64.txt", b64: true, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: "Maxicare_Corporate Set Up_Template.xlsx", label: "Maxicare_Corporate Set Up_Template" },
      { path: SME_PATHS["Maxicare_Prospective Corporate Account Form (PCAF)"] || "", name: "Maxicare_Prospective Corporate Account Form (PCAF)" + (SME_EXT["Maxicare_Prospective Corporate Account Form (PCAF)"] || ""), label: "Maxicare_Prospective Corporate Account Form (PCAF)", missing: !SME_PATHS["Maxicare_Prospective Corporate Account Form (PCAF)"] },
    ]);
  }
  function smeFiles(opt) {
    return fromRepo([
      { path: MX_FILES[0][0], name: "Karla Luansing_Maxicare_HMO Pubmat.jpg", label: "Karla Luansing_Maxicare_HMO Pubmat" },
      { path: MX_FILES[2][0], name: MX_FILES[2][1], label: "Maxicare_PCCs_and_Other_Services" },
      { path: SME_PATHS[opt.prop] || "", name: opt.prop, label: opt.prop, missing: !SME_PATHS[opt.prop] },
      { path: SME_PATHS[opt.tpl] || "", name: opt.tpl, label: opt.tpl, missing: !SME_PATHS[opt.tpl] },
    ]);
  }
  function filesFor(co, type) { return (FILES[co + "|" + type] || []).map(function (f) { return { path: f[0], name: f[1], label: f[2] }; }); }

  /* ---------- email template, by product type ---------- */
  // Karla's email template for Maxicare Individual and Family, word for word as Paolo sent it (2026-11-24).
  var KARLA_SIGNATURE = "<p>All the best,<br><b>Karla Luansing</b><br>Health Benefit Consultant (A465132)<br>Maxicare Healthcare Corporation<br>Maxicare Tower, 203 Salcedo Street,<br>Legazpi Village, Makati City, 1229<br><a href=\"tel:+639772176388\">+63(977)217-6388</a> (Viber/WhatsApp/Telegram)</p>" +
    "<p>Please consider the environment before you print this email</p>" +
    "<p>Disclaimer: The information contained in this communication is intended solely for the use of the individual or entity to whom it is addressed and others authorized to receive it. It may contain confidential or legally privileged information. If you are not the intended recipient you are hereby notified that any disclosure, copying, distribution, or taking any action in reliance on the contents of this information is strictly prohibited and may be unlawful. If you have erroneously received this communication, please notify us immediately by responding to this email and then delete it from your system. Maxicare is neither liable for the improper and incomplete transmission of the information contained in this communication nor for any delay in its receipt.</p>";
  // Paolo, 2026-11-25: always greet the client by name instead of "Sir/Madam".
  // Paolo, 2026-11-25: the template stays fixed; each generated email can be edited before approval (see mailEditor).
  try { localStorage.removeItem("zero1office:mxtemplate:v1"); } catch (err) { /* v62 kept an edited template here */ }
  function mxTemplate(name) { return "<p>Hi " + e(name) + ",</p>" + MX_BODY; }
  var TPL_TAGS = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1, A: 1 };
  function cleanTpl(html) { // keep simple formatting and safe links only
    var box = document.createElement("div"); box.innerHTML = html;
    (function walk(el) {
      [].slice.call(el.childNodes).forEach(function (n) {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        walk(n);
        var tag = n.tagName === "DIV" ? "P" : n.tagName;
        if (!TPL_TAGS[tag]) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|IMG|SVG)$/.test(n.tagName)) n.remove(); else { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); } return; }
        var href = tag === "A" ? n.getAttribute("href") || "" : "";
        var m = document.createElement(tag); while (n.firstChild) m.appendChild(n.firstChild);
        if (tag === "A" && /^(https:\/\/|mailto:)/i.test(href)) m.setAttribute("href", href);
        n.parentNode.replaceChild(m, n);
      });
    })(box);
    return box.innerHTML.replace(/<p><\/p>/g, "").trim();
  }
  var MX_BODY = "<p>Good day!</p>" +
    "<p>For your perusal and consideration, I am pleased to present our proposal for an Individual or Family plan.</p>" +
    "<p>We offer several options with a Maximum Benefit Limit (MBL) of ₱100k, ₱150k, ₱200k, and ₱250k.</p>" +
    "<p>Please note that the MBL is applied per illness, per member, per year.<br>The final diagnosis from your doctor will determine the services charged against your MBL.<br>Any changes to your plan, such as upgrades or downgrades, can be made during your renewal period.</p>" +
    "<p><b>Coverage for Pre-existing Conditions (PEC)</b><br>First Year of Membership: Pre-existing conditions are covered, but with certain limitations depending on the plan you choose.<br>Second Year Onward: Coverage will depend on whether the PEC is considered a dreaded or non-dreaded condition.</p>" +
    "<ul><li><b>Dreaded Conditions:</b> These are severe or long-term illnesses that may not have a cure, such as cancer, chronic kidney disease (CKD), arthritis, or slipped disc. For these conditions, the coverage limitations from the first year will remain the same for the rest of your membership.</li>" +
    "<li><b>Non-dreaded Conditions:</b> These are mild and curable illnesses like migraines, uncomplicated hypertension, or uncomplicated urinary tract infections (UTIs). For these conditions, coverage will be up to your plan's MBL.</li></ul>" +
    "<p><b>Additional Benefits</b><br>As a Maxicare member, you can enjoy free and unlimited consultations and laboratory procedures exclusively at Maxicare Primary Care Clinics (PCCs).<br>These services availed at our PCCs will not be deducted from your MBL.</p>" +
    "<p>You may visit the Maxicare website for the following:<br>Accredited Provider Hospitals/Clinics and Doctors: <a href=\"https://www.maxicare.com.ph/#care-center\">https://www.maxicare.com.ph/#care-center</a><br>Maxicare Primary Care Network (PCN): <a href=\"https://www.maxicare.com.ph/services/visit-locations\">https://www.maxicare.com.ph/services/visit-locations</a></p>" +
    "<p>I'd be happy to discuss our products and programs in greater detail at your most convenient time.<br>When would be a good time to schedule the meeting, this week or next week?</p>" +
    "<p>Should you have any questions or need clarifications, please feel free to contact me at 0977-217-6388 (Viber/WhatsApp/Telegram) or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p>" +
    "<p>I hope to hear from you soon and look forward to the opportunity to partner with you and your family as your trusted Health Benefits Solutions Partner.</p><p>Thank you.</p>" + KARLA_SIGNATURE;
  function prepaidTemplate(name) { return "<p>Dear " + e(name) + ",</p>" + PREPAID_BODY; }
  // Karla's Maxicare Prepaid email, word for word as Paolo sent it (2026-11-25); "Sir/Madam" becomes the client's name.
  var PREPAID_BODY = "<p>Good day!</p>" +
    "<p>Please see the attached updated Maxicare Prepaid Card offerings, featuring the LifesavER and PRIMA variants, for your review and reference.</p>" +
    "<p>To help you better understand the available options, below is a brief overview of each product category:</p>" +
    "<p><b>1. Maxicare LifesavER – Emergency Medical Coverage</b><br>Designed to provide financial protection against unexpected medical emergencies, with benefits depending on the selected variant.</p><ul>" +
    "<li><b>Emergency Coverage:</b> Covers eligible emergency medical expenses, subject to the selected plan's benefit limits, terms, and conditions.</li>" +
    "<li><b>LifesavER Variants:</b> Offer different coverage limits and benefits to accommodate varying healthcare protection needs.</li>" +
    "<li><b>Ideal For:</b> Individuals and families seeking additional financial protection against unforeseen medical emergencies.</li></ul>" +
    "<p><b>2. Maxicare PRIMA – Preventive Healthcare Coverage</b><br>Designed to support proactive health management through access to preventive healthcare services at designated Maxicare Clinics (PCCs).</p><ul>" +
    "<li><b>Outpatient Consultations:</b> Access to eligible medical consultations at participating Maxicare PCCs.</li>" +
    "<li><b>Laboratory and Diagnostic Services:</b> Coverage for eligible laboratory tests and diagnostic procedures, depending on the selected variant.</li>" +
    "<li><b>PRIMA Variants:</b> Offer different preventive healthcare benefits and eligibility requirements based on the selected plan.</li>" +
    "<li><b>Ideal For:</b> Individuals seeking convenient access to routine checkups, medical consultations, and preventive healthcare services.</li></ul>" +
    "<p><b>Important Reminder:</b> LifesavER and PRIMA serve different healthcare needs. LifesavER focuses on eligible medical emergencies, while PRIMA focuses on preventive and outpatient healthcare services. Benefits, coverage limits, eligibility, exclusions, and availment conditions vary by product and variant.</p>" +
    "<p>If you have any questions or need clarifications, please feel free to reach out to me at 0977 217 6388 (Viber/WhatsApp/Telegram) or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p>" +
    "<p>I would be happy to assist you in identifying the most suitable healthcare protection option based on your needs and budget.</p>" +
    "<p>Thank you, and I look forward to assisting you with your healthcare protection needs.</p>" + KARLA_SIGNATURE;
  function mvcTemplate(name) { return "<p>Dear " + e(name) + ",</p>" + MVC_BODY; }
  // Karla's Maxicare MPlus vs Corporate email, word for word as Paolo sent it (2026-11-25); "Sir/Madam" becomes the client's name.
  var MVC_BODY = "<p>Good day!</p>" +
    "<p>For your perusal and consideration, I am pleased to present the different HMO plan that Maxicare can offer:</p>" +
    "<p><b>OPTION 1: MaxicarePlus Plan</b></p><ul>" +
    "<li><b>Target Group:</b> Designed for Small and Medium Enterprises (SMEs) with an initial headcount of 10-99 employees.</li>" +
    "<li><b>Standardized Efficiency:</b> A &quot;boxed-type&quot; offering with competitive, readily available rates and customizable benefit options.</li>" +
    "<li><b>Comprehensive Access:</b> Full HMO coverage with options to include or exclude access to major hospitals.</li>" +
    "<li><b>MBL Structure:</b> The Maximum Benefit Limit (MBL) is applied per illness, per member, per year.</li>" +
    "<li><b>PCC Advantage:</b> Enjoy unlimited consultations and laboratory procedures exclusively at Maxicare Primary Care Clinics (PCCs) without any deduction from your MBL.</li></ul>" +
    "<p><b>Core Benefits Include:</b></p><ul>" +
    "<li><b>Inpatient Care:</b> Access to all accredited hospitals and clinics nationwide, with an option to include or exclude major hospitals (subject to MBL).</li>" +
    "<li><b>Outpatient Care:</b><ul><li>Unlimited consultations and lab procedures at all Maxicare PCCs (no MBL deduction).</li><li>Access to accredited hospitals and clinics nationwide (subject to MBL).</li></ul></li>" +
    "<li><b>Healthway Access:</b> Complementary access to Healthway facilities.</li>" +
    "<li><b>Emergency Care:</b><ul><li>Non-Accredited Hospitals (PH): Reimbursable up to 80% of hospital bills/fees (based on Maxicare rates) for the first 24 hours of treatment, up to ₱30,000 per availment per member per year.</li><li>Areas without Affiliated Hospitals (PH): Reimbursable based on standard rates, subject to MBL.</li><li>International Coverage: Reimbursable up to 100% of actual cost, up to ₱30,000 per availment per member per year.</li></ul></li>" +
    "<li><b>Ambulance Service:</b> Covered for hospital-to-hospital transfers (up to MBL). A ₱2,500 limit applies for transfers from non-affiliated to affiliated hospitals (on a reimbursement basis).</li></ul>" +
    "<p><b>Optional Enhancements:</b></p><ul>" +
    "<li><b>Standard Dental Package:</b> Access to accredited dental clinics and Maxicare Dental Hubs.</li>" +
    "<li><b>Annual Check-Up (ACU):</b> Scheduled APE/ACU packages at selected Maxicare providers.</li>" +
    "<li><b>Daily Hospital Income:</b> A ₱500 daily cash benefit during hospitalization due to accident or illness.</li>" +
    "<li><b>Group Life Insurance:</b> Provides a death/dismemberment benefit of up to ₱100,000.</li></ul>" +
    "<p><b>OPTION 2: Maxicare Corporate Plan</b></p><ul>" +
    "<li><b>Eligibility:</b> Designed for companies with non-standard requirements.</li>" +
    "<li><b>Customization:</b> The plan can be customized according to your company's specific needs and preferences.</li>" +
    "<li><b>Benefit Matching:</b> We can replicate your existing HMO plan (if applicable) and incorporate additional benefits as needed.</li>" +
    "<li><b>Rates &amp; Account Management:</b> Corporate rates are determined/computed by our actuarial department/pricing team.<br>This process requires a Health Benefit Executive (Account Officer) to be assigned to my team and will assist me, your Health Benefit Consultant (Maxicare Agent), in managing your account.</li></ul>" +
    "<p><b>Information/Files Needed for Quotation</b><br>To provide accurate rates, we require the following:</p>" +
    "<p>a) <b>Completed Corporate Set Up Form/Employee Data:</b><br>Please see the attached template for guidance. Initially, names may not be required.<br>However, Position/Designation is crucial if coverage is tier-based, and Age is important to verify eligibility within age limits.</p>" +
    "<p>b) <b>BIR Form 2303 (Certificate of Registration):</b><br>This is needed to determine applicable rates based on your registered business type.</p>" +
    "<p>c) <b>Signed Prospective Corporate Account Form (PCAF):</b><br>Please see the attached form. This is required to formally register this engagement with our Franchising department and assign an Account Officer.<br>The Account Officer will be part of my team and will assist me in managing your account, including coordinating with our actuarial department/pricing team for rates.<br>The PCAF also serves as my authorization to act as your official Health Benefit Consultant (Maxicare Agent) and point-of-contact between you and Maxicare.</p>" +
    "<p><b>Maxicare Policy:</b> This procedure aligns with Maxicare’s policy, which ensures a clear and efficient process by coordinating with only one designated agent per company/account, regardless of the sales channel.</p>" +
    "<p><b>Important Clarification:</b> Please be assured that signing the PCAF is not a binding contract and does not obligate your company to enroll in Maxicare's HMO plan.<br>Its primary purpose is to streamline communication and establish a single point-of-contact between your company and Maxicare during the quotation and negotiation period.<br>Your company retains full discretion to choose your preferred HMO provider.</p>" +
    "<p><b>Process and Timelines</b></p><ul>" +
    "<li><b>File Handling:</b> Once you provide the necessary files, I will share them with our internal teams (including the assigned Account Officer and Actuarial Department) for processing.</li>" +
    "<li><b>Account Officer Assignment:</b> An Account Officer will typically be assigned to my team within 24-48 hours after we submit the signed PCAF. This officer will assist me in managing your account.</li>" +
    "<li><b>Proposal Turnaround Time:</b> The Account Officer will prepare and send the formal proposal in a minimum of 10 working days, provided there are no employees or dependents over the standard age limit.</li></ul>" +
    "<p>Attached is the template for the Employee Benefit Setup. This will be helpful if you have not yet provided details of your current HMO coverage, as it will allow us to provide a more accurate quotation.<br>Please fill this out with your chosen benefit preferences and send your BIR Form 2303 so we can verify your registered business type.<br>Additionally, I’ve attached a sample Standard Corporate HMO plan and a list of add-on benefits for your reference.</p>" +
    "<p>Please note that as a Maxicare member, you can enjoy free and unlimited consultations and laboratory procedures exclusively at Maxicare Primary Care Clinics (PCCs).<br>These services availed at PCCs will not be deducted from your Maximum Benefit Limit (MBL).</p>" +
    "<p><b>List of Accredited Provider Hospitals/Clinics and Doctors</b><br>Working Files: <a href=\"https://docs.google.com/spreadsheets/d/1aOsCNVLq6yVgX11I5e5k23qYom4wIdxaXT27gS6N5YE/edit?gid=2134231315#gid=2134231315\">https://docs.google.com/spreadsheets/d/1aOsCNVLq6yVgX11I5e5k23qYom4wIdxaXT27gS6N5YE/edit?gid=2134231315#gid=2134231315</a><br>Maxicare Website: <a href=\"https://www.maxicare.com.ph/#care-center\">https://www.maxicare.com.ph/#care-center</a></p>" +
    "<p><b>List of Maxicare Primary Care Clinics (PCCs)</b><br>Maxicare Website: <a href=\"https://www.maxicare.com.ph/services/visit-locations\">https://www.maxicare.com.ph/services/visit-locations</a></p>" +
    "<p><b>9 Major Hospitals of Maxicare</b></p><ul>" + ["Asian Hospital and Medical Center", "Cardinal Santos Medical Center", "Cebu Doctors University Hospital", "Chong Hua Hospital", "Davao Doctors Hospital", "Makati Medical Center", "St. Luke's Medical Center - Global City", "St. Luke's Medical Center - Quezon City", "The Medical City"].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" +
    "<p>I'd be happy to discuss our products and programs in greater detail at your most convenient time.<br>When would be a good time to schedule the meeting, this week or next week?</p>" +
    "<p>Should you have any questions or need clarifications, please feel free to contact me at 0977-217-6388 (Viber/WhatsApp/Telegram) or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p>" +
    "<p>I hope to hear from you soon and look forward to the opportunity to partner with your company as your trusted Health Benefits Solutions Partner.</p><p>Thank you.</p>" + KARLA_SIGNATURE;
  function corpTemplate(name) { return "<p>Dear " + e(name) + ",</p>" + CORP_BODY; }
  // Karla's Maxicare Corporate email, word for word as Paolo sent it (2026-11-25); line breaks rebuilt from the pasted text; "Sir/Madam" becomes the client's name.
  var CORP_BODY = "<p>Good day!</p>" +
    "<p>I am pleased to present our standard Corporate Customizable Plan overview for your review.</p>" +
    "<p>To manage expectations regarding rates, please note that we are currently unable to provide baseline or estimated rates upfront. The sample corporate plan overview shared below highlights potential benefits and inclusions that can be added to your coverage. Because corporate HMO plans are fully customizable, our Actuarial and Pricing Team computes the official proposal based on your specific company profile and risk assessment.</p>" +
    "<p>Maxicare Healthcare Corporation is one of the leading HMO providers in the Philippines, delivering comprehensive health maintenance programs to top corporate clients nationwide.</p>" +
    "<p>Below is an overview of our Corporate Plan, along with the details and documentation required for us to prepare a customized proposal, baseline rates, and benefit matrices for your company.</p>" +
    "<p><b>Maxicare Corporate Plan</b></p><ul>" +
    "<li><b>Eligibility:</b> Designed for companies with non-standard benefit requirements and/or 100+ initial principal enrollees.</li>" +
    "<li><b>Customization &amp; Benefit Matching:</b> We can replicate your existing HMO plan (if applicable), incorporate additional benefits as needed or fully customize coverage to align with your company's needs or preferences.</li>" +
    "<li><b>Account Management:</b> Corporate rates are computed by our Actuarial/Pricing Department. A dedicated Health Benefit Executive (Account Manager) to be assigned to support me—your Health Benefit Consultant (Account Officer/Agent)—in managing your account.</li></ul>" +
    "<p><b>Information &amp; Requirements Needed for Quotation</b><br>To assist us in generating an accurate rate proposal, kindly provide the following:</p><ul>" +
    "<li><b>Current HMO Coverage and Benefits Matrix (if applicable):</b> Helps us match your current coverage and propose valuable add-ons from Maxicare.</li>" +
    "<li><b>Latest Utilization Report (if applicable):</b> Helps determine if we can offer preferential or standard rates based on claims history.</li>" +
    "<li><b>Completed Corporate Set-Up Form / Employee Census (Template attached)</b><br>Note: Full names are not required initially. Job Position/Designation and Birth Date/Age are required for tiering and age eligibility.</li>" +
    "<li><b>BIR Form 2303 (Certificate of Registration):</b> Required to classify applicable rates based on your registered line of business.</li>" +
    "<li><b>Signed Prospective Corporate Account Form (PCAF) (Template attached)</b> or kindly complete the account information fields below:<br>Note: The PCAF registers this engagement with our Franchising Department to assign a dedicated Account Manager.<br><b>Important:</b> Signing the PCAF is non-binding and does not obligate your company to enroll with Maxicare. It simply streamlines communication and prevents channel conflicts during the quotation phase.</li></ul>" +
    "<p><b>Account Information Details</b></p><ul>" + [["DTI/SEC Registered Name", "Registered Company Name"], ["Affiliates/Sister Companies to be included", "Please specify if any"], ["Company Head Office Address", "Complete Business Address"], ["Contact Person &amp; Title", "POC's Name and Position"], ["Contact Number", "POC's Mobile Number"], ["Email Address", "POC's Email Address"], ["Nature of Business", "Industry"], ["Existing HMO Provider", "Please specify"], ["Expiry of Current HMO Coverage", "Please specify"], ["Contract Value of Existing HMO", "Please specify"], ["Total No. of Principals / Dependents", "Please specify"]].map(function (x) { return "<li>" + x[0] + ": [" + x[1] + "]</li>"; }).join("") + "</ul>" +
    "<p><b>Process and Timelines</b></p><ul>" +
    "<li><b>File Handling:</b> Once received, I will share your documents with our internal teams (including the assigned Account Manager and Actuarial/Pricing Department) for evaluation.</li>" +
    "<li><b>Account Manager Assignment:</b> Assigned within 2-3 business days upon submission of the signed PCAF and/or complete account details.</li>" +
    "<li><b>Proposal Turnaround:</b> Official proposals are typically generated after 2 weeks upon completion of actuarial evaluation (turnaround may be extended for non-standard customization requests).</li></ul>" +
    "<p>Note: If you have not yet compiled your current HMO coverage details, completing the attached Employee Benefit Set-Up template will help us provide an accurate quotation—especially if you require custom benefits.</p>" +
    "<p><b>Key Maxicare Member Perks</b></p><ul>" +
    "<li><b>Unlimited Consultations &amp; Laboratory Tests:</b> As a Maxicare member, your employees will enjoy unlimited consultations and laboratory procedures exclusively at Maxicare Primary Care Clinics (PCCs) without deducting from their Maximum Benefit Limit (MBL).</li>" +
    "<li><b>Maxicare BEST LIFE Program (Chronic Condition Management):</b> Delivered in partnership with MedGrocer, this program helps eligible members manage diabetes, hypertension, and high cholesterol through ongoing monitoring and medicine support.<ul>" +
    "<li>Teleconsultations: Conducted every three (3) months for ongoing condition management.</li>" +
    "<li>Laboratory Monitoring: Conducted every six (6) months, including relevant tests such as HbA1c, lipid profile, creatinine, SGPT, and urinalysis.</li>" +
    "<li>Prescription &amp; Booking Assistance: Regular prescription renewals and lab test scheduling support.</li>" +
    "<li>Medicine Support (Based on Eligibility):<ul><li>Free Program: Selected maintenance medicines provided at no cost for qualifying members.</li><li>Subsidized Program: Discounts of up to 40% on selected value-brand medicines and up to 10% on selected branded medicines.</li></ul></li></ul></li></ul>" +
    "<p><b>Major Partner Hospitals:</b></p><ul>" + ["Asian Hospital and Medical Center", "Cardinal Santos Medical Center", "Cebu Doctors University Hospital", "Chong Hua Hospital", "Davao Doctors Hospital", "Makati Medical Center", "St. Luke's Medical Center - Global City", "St. Luke's Medical Center - Quezon City", "The Medical City"].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" +
    "<p><b>Useful Links:</b></p><ul>" +
    "<li><a href=\"https://www.maxicare.com.ph/services/visit-locations\">Maxicare Primary Care Clinic Locations</a></li>" +
    "<li><a href=\"https://www.maxicare.com.ph/#care-center\">Accredited Hospitals, Clinics, and Doctors</a></li>" +
    "<li>Working File - List of ACU/PEME Providers</li></ul>" +
    "<p>Should you have any questions or need further clarification, please feel free to reach out to me at 0977-217-6388 (Viber/WhatsApp/Telegram) or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p>" +
    "<p>Thank you, and I look forward to the opportunity to serve as your trusted Health Benefit Solutions Partner.</p>" + KARLA_SIGNATURE;
  function smeTemplate(name) { return "<p>Dear " + e(name) + ",</p>" + SME_BODY; }
  // Karla's MaxicarePlus SME email, word for word as Paolo sent it (2026-11-25); "Sir/Madam" becomes the client's name.
  var SME_BODY = "<p>Good day!</p>" +
    "<p>For your review and consideration, I am pleased to present MaxicarePlus, an HMO plan designed for Small and Medium Enterprises (SMEs) with an initial headcount of 10–99 employees.</p>" +
    "<p><b>MaxicarePlus Plan Highlights</b></p><ul>" +
    "<li><b>Standardized Efficiency:</b> A &quot;boxed-type&quot; offering with competitive, readily available rates and add-ons benefit options.</li>" +
    "<li><b>Comprehensive Access:</b> Full HMO coverage with options to include or exclude access to major hospitals.</li>" +
    "<li><b>Maximum Benefit Limit (MBL):</b> Applied per illness, per member, per year.</li>" +
    "<li><b>Maxicare Clinics (PCCs) Advantage:</b> Enjoy unlimited consultations and laboratory procedures exclusively at Maxicare Clinics (formerly Primary Care Clincs), with no deduction from the member's MBL.</li></ul>" +
    "<p><b>Core Benefits:</b></p><ul>" +
    "<li><b>Inpatient Care:</b> Access to all accredited hospitals and clinics nationwide, with an option to include or exclude major hospitals (subject to MBL).</li>" +
    "<li><b>Outpatient Care:</b><ul><li>Unlimited consultations and lab procedures at all Maxicare PCCs (no MBL deduction).</li><li>Access to accredited hospitals and clinics nationwide (subject to MBL).</li></ul></li>" +
    "<li><b>Healthway Access:</b> Complementary access to Healthway facilities.</li>" +
    "<li><b>Emergency Care:</b><ul><li>Non-Accredited Hospitals (PH): Reimbursable up to 80% of hospital bills/fees (based on Maxicare rates) for the first 24 hours of treatment, up to ₱30,000 per availment per member per year.</li><li>Areas without Affiliated Hospitals (PH): Reimbursable based on standard rates, subject to MBL.</li><li>International Coverage: Reimbursable up to 100% of actual cost, up to ₱30,000 per availment per member per year.</li></ul></li>" +
    "<li><b>Ambulance Service:</b> Covered for hospital-to-hospital transfers (up to MBL). A ₱2,500 limit applies for transfers from non-affiliated to affiliated hospitals (on a reimbursement basis).</li></ul>" +
    "<p><b>Optional Enhancements:</b></p><ul>" +
    "<li><b>Standard Dental Package:</b> Access to accredited dental clinics and Maxicare Dental Hubs.</li>" +
    "<li><b>Annual Check-Up (ACU):</b> Scheduled APE/ACU packages at selected Maxicare providers.</li>" +
    "<li><b>Daily Hospital Income:</b> A ₱500 daily cash benefit during hospitalization due to accident or illness.</li>" +
    "<li><b>Group Life Insurance:</b> Provides a death/dismemberment benefit of up to ₱100,000.</li>" +
    "<li><b>Critical Illness Benefit:</b> A ₱50,000 lump-sum benefit upon diagnosis of a covered critical illness.</li></ul>" +
    "<p><b>Next Steps &amp; Requirements</b></p><ul>" +
    "<li>Attached is the Employee Benefit Setup template. This will be helpful if you have not yet provided details of your current HMO coverage, as it will allow us to provide a more accurate quotation.</li>" +
    "<li>Please fill this out with your chosen benefit preferences and send your BIR Form 2303 so we can verify your registered business type.</li></ul>" +
    "<p><b>💡Make the Most of Maxicare Clinics (PCCs)</b><br>Your employees can enjoy unlimited consultations and laboratory procedures at Maxicare PCCs without deductions from their MBL, helping preserve their benefit limits for other covered medical needs.</p>" +
    "<p><b>QUICK LINKS &amp; RESOURCES</b></p><ul>" +
    "<li>Maxicare Website: <a href=\"https://www.maxicare.com.ph/#care-center\">List of Accredited Provider Hospitals/Clinics and Doctors</a></li>" +
    "<li>Working Files: List of Accredited Provider Hospitals/Clinics and Doctors</li>" +
    "<li>Maxicare Clinics (PCCs): <a href=\"https://www.maxicare.com.ph/services/visit-locations\">(Contact details, Address, and Operating Hours)</a></li>" +
    "<li>Working File: List of ACU/PEME Providers</li></ul>" +
    "<p><b>9 Major Hospitals of Maxicare</b></p><ul>" + ["Asian Hospital and Medical Center", "Cardinal Santos Medical Center", "Cebu Doctors University Hospital", "Chong Hua Hospital", "Davao Doctors Hospital", "Makati Medical Center", "St. Luke's Medical Center - Global City", "St. Luke's Medical Center - Quezon City", "The Medical City"].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" +
    "<p>Should you have any questions or need clarifications, please feel free to reach out to me at 0977-217-6388 (Viber/WhatsApp/Telegram) or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p>" +
    "<p>Thank you, and I look forward to partnering with your organization.</p>" + KARLA_SIGNATURE;
  function emailTemplate(k, c, files) {
    if (k === "mxs") return smeTemplate(c.name);
    if (k === "mxc") return corpTemplate(c.name);
    if (k === "mxp") return prepaidTemplate(c.name);
    if (k === "mxv") return mvcTemplate(c.name);
    if (k === "mxi" || k === "mxf") return mxTemplate(c.name);
    var h = letterTop(c, c.name);
    h += "<p>Thank you for your interest in a <b>" + e(G.co + " " + G.type) + "</b> plan" + (c.grp ? " for " + e(c.org) : "") + ". Below is a summary of what we have noted so far; I'll follow up with the plan options and rates.</p>";
    if (files.length) h += "<p>I've attached:</p><ul>" + files.map(function (f) { return "<li>" + e(f.label) + "</li>"; }).join("") + "</ul>";
    return h + signature();
  }

  /* ---------- checking by the right AI employee ---------- */
  function agentFor(co) {
    var team = (S.team || []).filter(function (x) { return x.d === "Proposals" && x.covers && (x.covers.co || []).indexOf(co) > -1 && (x.covers.prod || []).indexOf("HMO") > -1; });
    team.sort(function (a, b) { return a.covers.co.length * a.covers.prod.length - b.covers.co.length * b.covers.prod.length; });
    var a = team[0] || (S.team || []).filter(function (x) { return x.id === "maya"; })[0];
    return a ? { id: a.id, n: a.n, r: a.r } : { id: "maya", n: "Maya", r: "Proposals Lead · HMO" };
  }
  var checkTimer = null;
  function sendToAgent() {
    var o = G.out; G.review = { agent: agentFor(o.co), status: "checking", checks: [] };
    clearTimeout(checkTimer);
    checkTimer = setTimeout(function () { if (G.out !== o) return; G.review.checks = runChecks(o); G.review.status = G.review.checks.some(function (x) { return x.s === "fail"; }) ? "returned" : "approved"; G.review.at = new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }); if (G.review.status === "approved") queueApproval(o); if (S.view === "propgen") render(); }, 1200);
  }
  // Each check recomputes from the source tables, not from the text of the proposal.
  function runChecks(o) {
    var out = [], c = o.c;
    function add(s, t) { out.push({ s: s, t: t }); }
    if (o.kind === "mxs" || o.kind === "mxc" || o.kind === "mxp" || o.kind === "mxv") return smeChecks(o, add, out);
    if (o.kind !== "generic") {
      var bad = [];
      o.calc.forEach(function (m) {
        var want = bracketOf({ y: m.y });
        if (m.b !== want) bad.push(m.name + ": wrong age bracket");
        o.idx.forEach(function (pi, j) {
          var r = RATES[o.table][want][pi], a = r[0];
          o.modes.forEach(function (mo, mi) {
            var expect = mo === 0 ? a : mo === 1 ? r[1] : Math.round(a * 0.28);
            if (m.fees[mi][j] !== expect) bad.push(m.name + ", " + PLANS[pi].n + ", " + MODE_NAME[mo]);
          });
          if (Math.abs(Math.round(a * 0.54) - r[1]) > 1) bad.push(PLANS[pi].n + " semi-annual rate for " + BRACKETS[want] + " is not 54% of annual");
        });
      });
      add(bad.length ? "fail" : "ok", bad.length ? "Fees don't match the 2026 MyMaxicare " + (o.fam ? "Family" : "Individual") + " rates: " + bad.slice(0, 3).join("; ") : "Fees match the 2026 MyMaxicare " + (o.fam ? "Family" : "Individual") + " rate table for every member's age bracket (" + o.calc.map(function (m) { return BRACKETS[m.b]; }).join(", ") + ").");
      if (o.fam) {
        var tOk = o.total.every(function (row, mi) { return row.every(function (v, j) { return v === o.calc.reduce(function (t, m) { return t + m.fees[mi][j]; }, 0); }); });
        add(tOk ? "ok" : "fail", tOk ? "Family totals add up (" + o.calc.length + " members)." : "Family totals don't add up.");
      }
      add(o.calc.every(function (m) { return m.y >= 0 && m.y <= 60; }) ? "ok" : "fail", "Everyone is within the 15 days to 60 years age limit.");
      if (o.calc.some(function (m) { return m.y < 18; }) && c.people[0].age.y < 18) add("warn", "The principal is a minor, so the application needs an appointed guardian.");
      add(/subject for approval/i.test(o.proposal) ? "ok" : "fail", "Quarterly fees are marked subject for approval.");
    } else {
      add("warn", "This product doesn't have its own form or rates yet, so the email is a first reply and Karla follows up with rates.");
    }
    add(EMAIL_RE.test(o.to) ? "ok" : "fail", "Client email address looks valid (" + o.to + ").");
    if (c.near) {
      // Paolo, 2026-11-25: every proposal lists the nearest PCCs, hospitals, clinics, physicians and dental clinics. Recheck from the data.
      var pl = placeName(c.loc), html = o.proposal || "", miss = [], far = [], got = [];
      ["P", "H", "C", "D"].forEach(function (k) {
        var L = c.near[k].list, nm = KIND[k].replace("Maxicare ", "");
        if (!L.length) { miss.push(nm); return; }
        var shown = L.filter(function (x) { return html.indexOf(e(x.f[1] === "P" ? x.f[0] : title(x.f[0]))) > -1; }).length;
        if (shown < L.length) miss.push(nm + " (" + (L.length - shown) + " not in the proposal)");
        if (c.loc.city && c.near[k].inCity && L[0].where) far.push(nm);
        got.push(L.length + " " + nm.toLowerCase() + (c.near[k].inCity ? " (" + Math.min(c.near[k].inCity, L.length) + " in " + (c.loc.city ? title(c.loc.city) : pl) + ")" : ""));
      });
      var docs = DD && c.specs.length ? doctorsAt(nearFac(c.near), c.specs, 6).reduce(function (t, g) { return t + g.docs.length; }, 0) : 0;
      if (!docs) miss.push("physicians");
      else got.push(docs + " physicians");
      add(miss.length || far.length ? "fail" : "ok", miss.length ? "Missing from the provider list near " + pl + ": " + miss.join(", ") + "." : far.length ? "Not nearest first: " + far.join(", ") + "." :
        "Nearest providers to " + pl + " listed, client's city first: " + got.join(", ") + ".");
    } else if (o.co === "Maxicare") add(o.kind !== "generic" ? "fail" : "warn", "No location given, so I can't list the nearest Primary Care Clinics, hospitals, clinics, physicians and dental clinics. Add the client's region and city.");
    if (o.kind !== "generic") {
      var tOk = o.email === mxTemplate(c.name);
      if (o.edited) {
        add(o.email.indexOf(e(c.name)) > -1 ? "ok" : "warn", o.email.indexOf(e(c.name)) > -1 ? "Email was edited from Karla's Individual and Family template before approval and still greets " + c.name + " by name." : "Email was edited from Karla's template and no longer has " + c.name + "'s name in it.");
        add(/Please consider the environment/.test(o.email) ? "ok" : "warn", /Please consider the environment/.test(o.email) ? "The edited email keeps the line where Karla's signature image goes." : "The edited email dropped \"Please consider the environment…\", so there's no marked spot for Karla's signature image.");
      } else add(tOk ? "ok" : "fail", tOk ? "Email uses Karla's Individual and Family template word for word, greets " + c.name + " by name, and has her signature and disclaimer." : "Email doesn't match Karla's Individual and Family template.");
    } else {
      var gOk = o.email.indexOf(e(c.name)) > -1 && o.email.indexOf("Karla") > -1 && o.files.every(function (f) { return o.email.indexOf(e(f.label)) > -1; });
      add(gOk ? "ok" : "fail", gOk ? "Email has the client's name, Karla's signature" + (o.files.length ? " and the list of attached files." : ".") : "Email is missing the client's name, the signature or the list of files.");
    }
    add(o.files.length ? "ok" : "warn", o.files.length ? o.files.length + " files to attach for " + o.co + " " + o.type + ": " + o.files.map(function (f) { return f.label; }).join(", ") + "." : "No files are set up for " + o.co + " " + o.type + " yet. Attach any files yourself in Outlook.");
    return out;
  }

  function smeChecks(o, add, out) {
    var c = o.c, mvc = o.kind === "mxv", corp = o.kind === "mxc" || mvc, pre = o.kind === "mxp", tOk = o.email === (pre ? prepaidTemplate(c.name) : mvc ? mvcTemplate(c.name) : corp ? corpTemplate(c.name) : smeTemplate(c.name)), tName = pre ? "Karla's Maxicare Prepaid template" : mvc ? "Karla's MPlus vs Corporate template" : corp ? "Karla's Maxicare Corporate template" : "Karla's MaxicarePlus SME template";
    if (pre) add("ok", "Maxicare Prepaid Health Cards (LifesavER and PRIMA) for " + c.name + ".");
    else if (corp) add(c.org ? "ok" : "fail", c.org ? "Company: " + c.org + "." : "No company name.");
    else add(c.opt ? "ok" : "fail", c.opt ? "Plan option: " + c.opt.n + (c.org ? ", for " + c.org : "") + "." : "No plan option picked.");
    if (o.edited) add(o.email.indexOf(e(c.name)) > -1 ? "ok" : "warn", o.email.indexOf(e(c.name)) > -1 ? "Email was edited from " + tName + " before approval and still greets " + c.name + " by name." : "Email was edited and no longer has " + c.name + "'s name in it.");
    else add(tOk ? "ok" : "fail", tOk ? "Email uses " + tName + " word for word and greets " + c.name + " by name instead of Sir/Madam." : "Email doesn't match " + tName + ".");
    add(/Please consider the environment/.test(o.email) ? "ok" : "warn", /Please consider the environment/.test(o.email) ? "Has Karla's signature, the spot for her signature image, and the disclaimer." : "The line where Karla's signature image goes is missing.");
    add(EMAIL_RE.test(o.to) ? "ok" : "fail", "Client email address looks valid (" + o.to + ").");
    var miss = o.files.filter(function (f) { return f.missing; });
    add(miss.length ? "warn" : "ok", o.files.length + " files to attach for " + (pre ? "Maxicare Prepaid" : mvc ? "MPlus vs Corporate" : corp ? "Maxicare Corporate" : c.opt.n) + ": " + o.files.map(function (f) { return f.label; }).join(", ") + "." + (miss.length ? " Upload them in Settings > Files and link them to this attachment, or attach them from your own files in Outlook: " + miss.map(function (f) { return f.label; }).join(", ") + "." : ""));
    return out;
  }
  // Karla's signature image (Paolo, 2026-11-24) goes just above the environment line (moved there 2026-11-25). Outlook drafts made by the connector can't hold
  // images, so the page shows where it goes and the user inserts it from their Outlook signature; the draft text stays image-free.
  var SIG_IMG = "files/karla-luansing-email-signature.jpg";
  function mailEditor(o) {
    var tb = [["bold", "<b>B</b>", "Bold"], ["italic", "<i>I</i>", "Italic"], ["underline", "<u>U</u>", "Underline"], ["insertUnorderedList", "• List", "Bullet list"]];
    return '<div class="stack" style="gap:8px"><p class="muted small" style="margin:0">Edit this client\'s email. It starts from Karla\'s template; the template itself doesn\'t change. Keep "Please consider the environment…": Karla\'s signature image goes just above it.</p>' +
      '<div class="actions" role="toolbar" aria-label="Formatting">' + tb.map(function (b) { return '<button class="btn sm" type="button" data-pgcmd="' + b[0] + '" title="' + b[2] + '" aria-label="' + b[2] + '">' + b[1] + "</button>"; }).join("") + "</div>" +
      '<div class="z1-box pg-mail" style="background:var(--surface);max-height:none"><div id="pgTplEd" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Email to the client" style="outline:none;min-height:240px">' + (G.tplDraft != null ? G.tplDraft : o.email) + "</div></div>" +
      '<div class="actions"><button class="btn pri" data-pg="mailsave">Save the email</button><button class="btn" data-pg="mailcancel">Cancel</button></div></div>';
  }
  function saveMailEdit() {
    var o = G.out, ed = document.getElementById("pgTplEd"); if (!o || !ed) return false;
    var html = cleanTpl(ed.innerHTML);
    if (!html.replace(/<[^>]+>/g, "").trim()) { say("The email can't be empty"); return false; }
    var ap = pgItem(); if (ap && ap.state !== "waiting" && ap.state !== "changes") { say("It's already approved, so the email can't change"); return false; }
    if (html !== o.email) {
      o.email = html; o.edited = true; o.html = o.kind === "generic" ? o.email + "<hr>" + o.proposal : o.email;
      if (G.review) G.review.checks = runChecks(o);
      if (ap) { ap.doc.lines = mailLines(o.email); ap.checks = G.review ? G.review.checks.map(function (x) { return [x.s === "ok" ? "ok" : "watch", x.t]; }) : ap.checks; ap.when = "Edited " + nowLabel() + " today"; }
    }
    G.mailEdit = false; G.tplDraft = null; say("Email saved. Approve it when it's ready.");
  }
  function mailLines(html) { var lines = []; (html.match(/<p>[\s\S]*?<\/p>|<li>[\s\S]*?<\/li>/g) || []).forEach(function (x) { var t = stripTags(x).trim(); if (t && !/^Disclaimer:/.test(t)) lines.push(t); }); return lines; }
  function withSigImage(o) {
    var cut = o.email.indexOf("<p>Please consider the environment");
    if (o.kind === "generic" || cut < 0) return o.email;
    return o.email.slice(0, cut) + '<div class="pg-sig"><img src="' + SIG_IMG + '" alt="Karla Luansing, Health Benefit Consultant, Maxicare email signature" style="max-width:100%;height:auto;display:block;border-radius:6px"><p class="muted small" style="margin:4px 0 8px"><i>Signature image: insert it here in Outlook (Insert > Signature). It isn\'t part of the draft text.</i></p></div>' + o.email.slice(cut);
  }
  /* ---------- preview, review and the Outlook draft ---------- */
  function preview() {
    var o = G.out, rv = G.review, dr = G.draft;
    var h = '<div class="card pad stack"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><h3>4. Checking, files and sending</h3><span class="muted small">' + e(o.co + " " + o.type) + '</span></div>';
    // review
    var who = rv ? rv.agent : agentFor(o.co);
    h += '<div class="z1-box"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>' + e(who.n) + '</b><span class="muted small">' + e(who.r) + '</span><span class="sp" style="flex:1"></span>' +
      (rv.status === "checking" ? '<span class="s s-info">Checking the proposal and email…</span>' : rv.status === "approved" ? '<span class="s s-ok">Checked and approved' + (rv.at ? " at " + e(rv.at) : "") + '</span>' : '<span class="s s-need">Sent back for changes</span>') + '</div>';
    if (rv.checks.length) h += '<ul style="margin:0;padding-left:18px;display:grid;gap:3px;font-size:12.5px">' + rv.checks.map(function (x) { return '<li>' + (x.s === "ok" ? "✓ " : x.s === "warn" ? "⚠ " : "✕ ") + e(x.t) + '</li>'; }).join("") + '</ul>';
    if (G.warn.length) h += G.warn.map(function (w) { return '<p class="small" style="margin:0">⚠ ' + e(w) + ' (not in the email)</p>'; }).join("");
    h += '</div>';
    var ap = pgItem();
    if (rv.status === "approved") h += approvalBox(ap);
    // files
    if (rv.status === "approved") {
      h += '<div class="z1-box"><div class="z1-sect">Files to attach</div>' + (o.files.length ? '<table class="t"><tbody>' + o.files.map(function (f, i) {
        return '<tr><td><b>' + e(f.label) + '</b><br><span class="muted small">' + e(f.name) + '</span></td><td class="r">' + (f.missing ? '<span class="muted small">Not uploaded yet: add it in Settings &gt; Files</span>' : '<button class="btn sm" data-pg="save" data-v="' + i + '">Save file</button>') + '</td></tr>'; }).join("") + '</tbody></table>' : '<p class="small muted" style="margin:0">None set up for this product yet.</p>') + (o.kind !== "generic" ? '<p class="small" style="margin:0">Karla\'s signature image isn\'t attached; it goes in the email from your Outlook signature. <button class="btn sm" data-pg="savesig">Save the signature image</button> to set it up once in Outlook (Settings > Mail > Compose and reply > Email signature).</p>' : '') + '</div>';
      h += '<label class="fld">CC (optional)<input class="inp" id="pg-cc" data-pgf="cc" type="email" maxlength="160" placeholder="e.g. karla@ask-karla.com" value="' + e(G.f.cc || "") + '" autocomplete="off"></label>';
    }
    if (dr && dr.via === "gmail") h += '<div class="z1-box" role="status"><b>The email is in your Gmail Drafts, addressed to ' + e(o.to) + '.</b><span class="small">' + (dr.attached ? dr.attached + " of " + o.files.length + " files are already attached" + (dr.attached < o.files.length ? "; attach the rest from the saved files" : "") : "Attach the " + (o.files.length ? o.files.length + " saved files" : "files")) + (dr.sig ? ", and Karla\'s signature image is in place" : "") + '. Check it, then press Send in Gmail.</span>' + (dr.link ? '<a class="btn sm pri" style="justify-self:start" href="' + e(dr.link) + '" target="_blank" rel="noopener">Open the draft in Gmail</a>' : '') + '</div>';
    else if (dr && dr.box && dr.box !== KARLA_BOX) h += '<div class="z1-box" role="alert"><b>Heads up: this draft is in ' + e(dr.box) + '\'s Outlook, not Karla\'s.</b><span class="small">Proposals go out from ' + KARLA_BOX + '. Before sending, set From to ' + KARLA_BOX + ' in Outlook (you need Send As on her mailbox), or reconnect Microsoft 365 in claude.ai as Karla so drafts land in her Outlook.</span></div>';
    if (dr && dr.via !== "gmail") h += '<div class="z1-box" role="status"><b>The email is in ' + (dr.box === KARLA_BOX ? "Karla\'s Outlook Drafts (" + KARLA_BOX + ")" : "the Outlook Drafts") + ', addressed to ' + e(o.to) + '.</b><span class="small">Open it' + (o.kind !== "generic" ? ", insert Karla\'s signature image just above the line &quot;Please consider the environment&quot; (Insert > Signature)" : "") + ', attach the ' + (o.files.length ? o.files.length + " saved files" : "files") + ', then press Send in Outlook.</span>' + (dr.link ? '<a class="btn sm pri" style="justify-self:start" href="' + e(dr.link) + '" target="_blank" rel="noopener">Open the draft in Outlook</a>' : '') + '</div>';
    if (G.mailErr) h += '<div class="z1-box" role="alert">' + G.mailErr + '</div>';
    h += '<div class="actions">' +
      (dr ? ghlLine() + '<button class="btn pri" data-pg="new">Start a new proposal</button>' : '<span class="small"><b>From ' + KARLA_BOX + '</b> (Outlook)</span>' +
        (rv.status === "approved" && ap && ap.state === "approved" ? '<button class="btn pri" data-pg="draft"' + (G.sending ? " disabled" : "") + '>' + (G.sending ? "Saving the draft…" : mailVia() === "gmail" ? "Create the Gmail draft" : "Create the Outlook draft") + '</button>' : '<span class="small muted">Once approved, the email is saved in these drafts automatically.</span>')) +
      (dr ? "" : '<button class="btn" data-pg="edit">Edit the details</button>') + '<button class="btn" data-pg="copy">Copy the email</button></div>';
    // email template and proposal
    if (o.kind === "mxs" || o.kind === "mxc" || o.kind === "mxp" || o.kind === "mxv") G.tab = "email";
    else h += '<div class="chips" role="group" aria-label="Show" style="margin:0"><button class="chip" data-pg="pgtab" data-v="email" aria-pressed="' + (G.tab !== "proposal") + '">Email template</button><button class="chip" data-pg="pgtab" data-v="proposal" aria-pressed="' + (G.tab === "proposal") + '">Proposal</button></div>';
    h += '<div class="z1-kv"><div><small>To</small><span>' + e(o.to) + '</span></div><div><small>Subject</small><span>' + e(o.subject) + '</span></div>' + (o.total ? '<div><small>Family total, annual</small><span>' + o.total[0].map(peso0).join(" · ") + '</span></div>' : "") + '</div>';
    var canEdit = !dr && (!ap || ap.state === "waiting" || ap.state === "changes");
    if (G.tab !== "proposal" && G.mailEdit && canEdit) return h + mailEditor(o) + '</div>';
    if (G.tab !== "proposal" && canEdit) h += '<div class="actions" style="margin:0"><button class="btn sm" data-pg="mailedit">Edit the email</button><span class="muted small">' + (o.edited ? "Edited by you from Karla's template." : "Starts from Karla's template. You can change it until it's approved.") + "</span></div>";
    h += '<div class="z1-box pg-mail" id="pgMail" style="background:var(--surface);max-height:none">' + (G.tab === "proposal" ? o.proposal : withSigImage(o) + (o.kind === "generic" ? '<p class="muted small"><i>The proposal follows below the signature in the same email.</i></p>' : o.kind === "mxs" ? '<p class="muted small"><i>The ' + e(o.c.opt.n) + ' proposal and the setup template go as attachments 3 and 4.</i></p>' : o.kind === "mxc" ? '<p class="muted small"><i>The Corporate Standard Plan, the Set Up template and the PCAF go as attachments.</i></p>' : o.kind === "mxp" ? '<p class="muted small"><i>The pubmat and the Prepaid Health Cards 2026 proposal go as attachments.</i></p>' : o.kind === "mxv" ? '<p class="muted small"><i>The Option 1 (MPlus) and Option 2 (Corporate) files go as attachments.</i></p>' : '<p class="muted small"><i>The proposal goes as a PDF, the second attachment (' + e(o.files[1] ? o.files[1].name : "") + '). See the Proposal tab.</i></p>')) + '</div></div>';
    return h;
  }
  var MAIL_SERVER = "Microsoft 365", GMAIL_SERVER = "Gmail";
  /* Send with Outlook or Gmail (Paolo, 2026-11-25). The choice is remembered on this device only. */
  // Paolo, 2026-11-25: "All proposals should be sent using karla@ask-karla.com" (Microsoft 365), so drafts are always Outlook.
  var KARLA_BOX = "karla@ask-karla.com";
  function mailVia() { return "outlook"; }
  function setVia(v) { G.via = v === "gmail" ? "gmail" : "outlook"; G.mailErr = ""; try { localStorage.setItem("z1pg-via", G.via); } catch (err) { /* optional */ } }
  function mailError(err, via) {
    var c = err && err.code, sv = via === "gmail" ? "Gmail" : "Microsoft 365", app = via === "gmail" ? "Gmail" : "Outlook";
    if (c === "needs_reauth") return "Your " + sv + " sign-in has expired. Reconnect it in claude.ai Settings, Connectors, then try again.";
    if (c === "server_not_connected" || c === "selection_required") return sv + " isn't connected for you. Add it in claude.ai Settings, Connectors, then try again.";
    if (c === "not_in_manifest") return app + " drafts aren't switched on for this page yet. Ask Paolo to turn on " + sv + " for Zero1Office, or copy the email.";
    if (c === "not_granted" || c === "consent_required") return app + " was turned off for this page. Allow " + sv + " in this page's permissions, then try again.";
    if (c === "approval_required") return "Creating the draft wasn't approved. Try again and allow it when asked.";
    if (c === "blocked_by_policy") return "Your organization's settings don't allow this page to use " + app + ".";
    if (c === "rate_limited") return app + " is busy. Wait a minute, then try again.";
    return "The draft wasn't created" + (err && err.message ? " (" + e(String(err.message).slice(0, 200)) + ")" : "") + ". You can try again or copy the email.";
  }
  // One file's bytes, the same way "Save" gets them.
  function fileBlob(f) {
    if (f.gen === "pdf") return proposalPdf(G.out);
    if ((f.repo || f.b64) && window.Z1Files) return window.Z1Files.blob(f.repo || f);
    return fetch(f.path).then(function (r) { if (!r.ok) throw new Error("missing"); return r.blob(); });
  }
  function b64(blob) {
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { var u = String(r.result); ok(u.slice(u.indexOf(",") + 1)); }; r.onerror = no; r.readAsDataURL(blob); });
  }
  var GMAIL_MAX = 17 * 1024 * 1024; // Gmail allows 25 MB per email, and attachments grow by a third when encoded
  // Gmail drafts can carry the files and the signature image, so attach what fits.
  function gmailParts(o) {
    var list = o.files.slice(), sigAt = o.kind === "generic" ? -1 : o.html.indexOf("<p>Please consider the environment");
    var jobs = list.map(function (f) { return fileBlob(f).then(function (bl) { return { f: f, bl: bl }; }, function () { return null; }); });
    if (sigAt >= 0) jobs.push(fetch(SIG_IMG).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) { return { sig: true, bl: bl }; }, function () { return null; }));
    return Promise.all(jobs).then(function (got) {
      var att = [], total = 0, sig = null, n = 0, chain = Promise.resolve();
      got.forEach(function (g) {
        if (!g || !g.bl || total + g.bl.size > GMAIL_MAX) return;
        total += g.bl.size;
        chain = chain.then(function () { return b64(g.bl); }).then(function (c) {
          if (g.sig) sig = { content: c, filename: "Karla Luansing - MAXICARE Email Signature.jpg", mimeType: g.bl.type || "image/jpeg", inline: true };
          else { att.push({ content: c, filename: g.f.name, mimeType: g.bl.type || "application/octet-stream" }); n++; }
        });
      });
      return chain.then(function () {
        var html = o.html;
        if (sig) { att.push(sig); html = html.slice(0, sigAt) + '<p><img src="cid:att' + (att.length - 1) + '" alt="Karla Luansing, Maxicare" style="max-width:600px;height:auto"></p>' + html.slice(sigAt); }
        return { att: att, html: html, n: n, sig: !!sig };
      });
    });
  }
  function makeDraft() {
    var o = G.out; var ap = pgItem(); if (!o || G.sending || G.draft || !G.review || G.review.status !== "approved" || !ap || ap.state !== "approved") return;
    var cc = (G.f.cc || "").trim(), via = mailVia(), app = via === "gmail" ? "Gmail" : "Outlook", parts = null, box = "";
    if (cc && !EMAIL_RE.test(cc)) { G.mailErr = "The CC address doesn't look right."; render(); return; }
    G.sending = true; G.mailErr = ""; render();
    if (via === "gmail") say("Attaching the files…");
    var cl = window.claude;
    Promise.all([cl && cl.use ? cl.use("mcp") : Promise.resolve(null), via === "gmail" ? gmailParts(o) : null]).then(function (x) {
      var mcp = x[0]; parts = x[1];
      if (!mcp) throw { code: "unavailable_here" };
      if (via === "gmail") {
        var gi = { to: [o.to], subject: o.subject, htmlBody: parts.html };
        if (cc) gi.cc = [cc];
        if (parts.att.length) gi.attachments = parts.att;
        return mcp.callTool(GMAIL_SERVER, "create_draft", gi).catch(function (err) {
          // Too big or refused for the files: try once more with the text only, and attach the files in Gmail.
          var c = err && err.code;
          if (!gi.attachments || /needs_reauth|server_not_connected|selection_required|not_in_manifest|not_granted|consent_required|approval_required|blocked_by_policy|rate_limited/.test(c || "")) throw err;
          parts.n = 0; parts.sig = false; delete gi.attachments; gi.htmlBody = o.html;
          return mcp.callTool(GMAIL_SERVER, "create_draft", gi);
        });
      }
      var input = { to: [o.to], subject: o.subject, body: o.html, bodyType: "html" };
      if (cc) input.cc = [cc];
      // Drafts land in the signed-in Microsoft 365 mailbox; note which one, so a draft outside Karla's is flagged.
      return mcp.callTool(MAIL_SERVER, "get_me", {}).then(function (r) { var me = (r && r.payload) || {}; box = String(me.mail || me.userPrincipalName || "").toLowerCase(); }, function () { box = ""; })
        .then(function () { return mcp.callTool(MAIL_SERVER, "outlook_create_draft", input); });
    }).then(function (res) {
      var p = (res && res.payload) || {}, link = p.viewUrl || p.webLink || p.weblink || p.web_link || "";
      if (via === "gmail" && !link && p.id) link = "https://mail.google.com/mail/#drafts";
      G.sending = false; G.draft = { via: via, link: /^https:\/\//.test(link) ? link : "", attached: parts ? parts.n : 0, sig: parts ? parts.sig : false, box: box };
      log("draft"); ap.state = "sent"; ap.when = "Draft in " + app + " " + nowLabel() + " today"; try { save(); } catch (err) { /* optional */ }
      G.ghlInfo = ghlInfo(o); clearPersonal(); say("Draft ready in " + app); render(); ghlLog();
    }, function (err) {
      G.sending = false;
      G.mailErr = err && err.code === "unavailable_here" ? app + " can't be reached from this view. Open Zero1Office on claude.ai with " + (via === "gmail" ? "Gmail" : "Microsoft 365") + " connected, or copy the email." : mailError(err, via);
      render();
    });
  }

  /* ---------- GoHighLevel (Paolo, 2026-11-25: proposals go into a "Proposals" pipeline) ----------
     After the draft is made, the client goes into GHL: the contact (name and email; the company for group plans), an
     opportunity in the Proposals pipeline at its first stage ("Proposal drafted"), and a short note on the contact.
     Family members' names and ages, and anything about health, never go to GHL. Nothing is kept in this browser:
     the details live in memory until "Start a new proposal". */
  var GHL = "GHL";
  function ghlInfo(o) {
    var c = o.c || {}, val = null;
    try { if (o.calc && o.calc[0]) val = Math.min.apply(null, o.fam && o.total ? o.total[0] : o.calc[0].fees[0]); } catch (err) { val = null; }
    var what = o.co + " " + o.type, who = c.org || c.name || o.to;
    var note = "Proposal drafted in Zero1Office: " + what + (o.subject ? ' ("' + o.subject + '")' : "") + "." +
      (val && isFinite(val) ? " Lowest annual option: " + peso0(val) + "." : "") +
      (c.opt && c.opt.n ? " Option: " + c.opt.n + "." : "") + (G.review && G.review.agent ? " Checked by " + G.review.agent.n + "." : "") +
      " Draft is in the Outlook of " + (G.draft && G.draft.box ? G.draft.box : KARLA_BOX) + ".";
    return { name: String(c.name || "").trim(), email: o.to, org: String(c.org || "").trim(), opp: (who + " · " + what).slice(0, 120), value: val && isFinite(val) ? Math.round(val) : null, note: note };
  }
  function ghlData(r) {
    var p = r && r.payload;
    if (p && typeof p === "object") return p.data || p;
    var out = null;
    if (r && Array.isArray(r.content)) r.content.forEach(function (b) { if (!out && b && b.type === "text") { try { var j = JSON.parse(b.text); out = j && (j.data || j); } catch (err) { /* skip */ } } });
    return out || {};
  }
  function ghlKey(step) { var i = G.ghlInfo || {}; return ("z1pg-" + step + "-" + (i.email || "") + "-" + (i.opp || "")).replace(/[^A-Za-z0-9@._-]/g, "_").slice(0, 120) + "-" + (G.ghlStamp || ""); }
  function ghlLog() {
    var i = G.ghlInfo; if (!i || (G.ghl && G.ghl.state === "busy")) return;
    var cl = window.claude; if (!cl || !cl.use) { G.ghl = { state: "err", msg: "GoHighLevel can't be reached from this view." }; render(); return; }
    if (!G.ghlStamp || (G.ghl && G.ghl.state === "ok")) G.ghlStamp = Date.now().toString(36);
    G.ghl = { state: "busy" }; render();
    var mcp, pipe, stage, loc, contactId;
    function run(op, params, step) { var x = { operationId: op, params: params, reason: "Log a Zero1Office proposal in GoHighLevel" }; if (step) x.idempotencyKey = ghlKey(step); return mcp.callTool(GHL, "execute_operation", x).then(ghlData); }
    cl.use("mcp").then(function (m) {
      mcp = m; if (!mcp) throw { code: "unavailable_here" };
      return run("get-pipelines", {});
    }).then(function (d) {
      var ps = d.pipelines || []; pipe = ps.filter(function (x) { return /^\s*proposals?\s*$/i.test(x.name || ""); })[0];
      if (!pipe) throw { code: "no_pipeline" };
      var st = pipe.stages || []; stage = st.filter(function (x) { return /draft/i.test(x.name || ""); })[0] || st.slice().sort(function (a, b) { return (a.position || 0) - (b.position || 0); })[0];
      loc = pipe.locationId || "";
      var body = { email: i.email, source: "Zero1Office proposal generator" };
      if (i.name) body.name = i.name;
      if (i.org) body.companyName = i.org;
      return run("upsert-contact", { body: body }, "contact");
    }).then(function (d) {
      contactId = d.contact && d.contact.id; if (!contactId) throw { code: "no_contact" };
      var body = { pipelineId: pipe.id, name: i.opp, status: "open", contactId: contactId };
      if (stage) body.pipelineStageId = stage.id;
      if (i.value) body.monetaryValue = i.value;
      return run("create-opportunity", { body: body }, "opp");
    }).then(function () {
      return run("create-note", { path: { contactId: contactId }, body: { body: i.note } }, "note").catch(function () { /* the opportunity is what matters */ });
    }).then(function () {
      var link = loc && /^[A-Za-z0-9]+$/.test(loc) && /^[A-Za-z0-9]+$/.test(contactId) ? "https://app.gohighlevel.com/v2/location/" + loc + "/contacts/detail/" + contactId : "";
      G.ghl = { state: "ok", link: link, stage: stage ? stage.name : "" }; say("Added to GoHighLevel"); render();
    }, function (err) {
      var c = err && err.code;
      G.ghl = { state: "err", msg: c === "no_pipeline" ? "There's no pipeline named “Proposals” in GoHighLevel yet. Create it (Opportunities > Pipelines), then press Try again." :
        c === "needs_reauth" ? "The GoHighLevel sign-in expired. Reconnect GHL in claude.ai Settings, Connectors, then press Try again." :
        c === "server_not_connected" || c === "selection_required" ? "GoHighLevel isn't connected for you. Connect it in claude.ai Settings, Connectors." :
        c === "not_granted" || c === "consent_required" ? "GoHighLevel was turned off for this page. Allow it in the page's permissions, then press Try again." :
        c === "unavailable_here" ? "GoHighLevel can't be reached from this view. Open Zero1Office on claude.ai." :
        c === "no_contact" ? "GoHighLevel didn't return the contact. Press Try again." :
        c === "rate_limited" ? "GoHighLevel is busy. Wait a minute, then press Try again." : "GoHighLevel didn't take it" + (c ? " (" + c + ")" : "") + ". Press Try again." };
      render();
    });
  }
  function ghlLine() {
    var g = G.ghl; if (!G.ghlInfo && !g) return "";
    if (!g || g.state === "busy") return '<span class="small muted" role="status">Adding the client to GoHighLevel…</span>';
    if (g.state === "ok") return '<span class="small" role="status">✓ In GoHighLevel: Proposals pipeline' + (g.stage ? ", " + e(g.stage) : "") + (g.link ? ' · <a href="' + e(g.link) + '" target="_blank" rel="noopener">Open the contact</a>' : "") + '</span>';
    return '<span class="small" role="alert">' + e(g.msg) + '</span><button class="btn sm" data-pg="ghl">Try again</button>';
  }
  function saveFile(i) {
    var f = i === -1 ? { path: SIG_IMG, name: "Karla Luansing - MAXICARE Email Signature.jpg", label: "Signature image" } : G.out && G.out.files[i]; if (!f) return;
    var cl = window.claude;
    if (f.gen === "pdf") say("Making the proposal PDF…");
    Promise.all([cl && cl.use ? cl.use("downloads") : Promise.resolve(null), i === -1 ? fetch(f.path).then(function (r) { if (!r.ok) throw new Error("missing"); return r.blob(); }) : fileBlob(f)])
      .then(function (x) {
        if (!x[0]) { say("Saving files isn't available in this view"); return; }
        return x[0].save({ filename: f.name, data: x[1] }).then(function () { say(f.label + " saved"); }, function (err) { if (err && err.code !== "dismissed" && err.code !== "declined") say("The file wasn't saved"); });
      }, function () { say("That file isn't available right now"); });
  }
  /* ---------- the proposal as a PDF (Paolo, 2026-11-25) ---------- */
  // Name: "Client Name_Client Age_MyMaxicare.pdf" (the principal's name and age for Family plans).
  function pdfName(c) {
    var n = String(c.name || "Client").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
    return n + "_" + c.people[0].age.y + "_MyMaxicare.pdf";
  }
  var PDF_LIB = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js", pdfLib = null;
  function loadPdfLib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    return pdfLib || (pdfLib = new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = PDF_LIB; sc.async = true;
      sc.onload = function () { window.html2pdf ? ok(window.html2pdf) : no(new Error("pdf")); };
      sc.onerror = function () { pdfLib = null; no(new Error("pdf")); };
      document.head.appendChild(sc);
    }));
  }
  // Styles for the proposal (Proposal tab and PDF), following Karla's MyMaxicare template.
  var PDF_CSS = ".pgp{font:11px/1.42 Calibri,Carlito,Arial,Helvetica,sans-serif;color:#111;background:#fff;box-sizing:border-box}" +
    ".pgp p{margin:0 0 7px}.pgp a{color:#0b5cc9}.pgp .small{font-size:10px}.pgp .ctr{text-align:center}.pgp .u{text-decoration:underline;font-weight:700}" +
    ".pgp .letter p{margin:0 0 12px;text-align:justify;line-height:1.6}.pgp .sig{display:block;width:150px;margin:2px 0 -8px}" +
    ".pgp .sh{font-weight:700;margin:10px 0 3px}.pgp .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}" +
    ".pgp ul.ck{list-style:none;margin:0 0 6px;padding-left:18px}.pgp ul.ck li{position:relative;padding-left:16px;margin:0 0 1px}.pgp ul.ck li:before{content:'\\2713';position:absolute;left:0;top:0}" +
    ".pgp table{border-collapse:collapse;width:100%;margin:0 0 10px;font-size:10px}.pgp td,.pgp th{border:1px solid #333;padding:3px 6px;vertical-align:middle;text-align:left}" +
    ".pgp .pt th{background:#fff;text-align:center;font-weight:700;font-size:9.5px}.pgp .pt th.dk{background:#000;color:#fff}.pgp .pt td.c,.pgp .ft td.c{text-align:center}" +
    ".pgp .note{border:1px solid #333;padding:8px 10px;font-size:11px}.pgp .note ul.ck{padding-left:0}" +
    ".pgp .ft td{border:1px solid #9aa3ad}.pgp .ft td.lb{font-weight:700;background:#fff}.pgp .ft td.r{text-align:right}.pgp .ft tr.gap td{border:0;height:6px;padding:0}.pgp .ft td.mh{border:0;font-weight:700;padding:4px 0 2px}" +
    ".pgp .rt th{background:#fff;text-align:center}.pgp .rt td{text-align:center}.pgp .rt td:first-child{text-align:left}" +
    ".pgp h2.ph2{font-size:15px;color:#0b5cc9;margin:6px 0 6px}.pgp h3{font-size:12px;margin:8px 0 3px}.pgp ul.pl{margin:0 0 2px;padding-left:18px}" +
    ".pgp .banner{display:block;width:100%;margin:12px 0}.pgp hr.pgbrk{border:0;border-top:1px dashed #b8c2d0;margin:16px 0}";
  // A4 page at 96 dpi; header logo (and the summary title from page 2), a blue bar at the foot.
  var PG = { w: 794, h: 1122.5, top: 104, side: 64, foot: 46, banner: 132 };
  var PAGE_CSS = ".pgpages{width:" + PG.w + "px;background:#fff}.pgpage{position:relative;width:" + PG.w + "px;height:" + PG.h + "px;overflow:hidden;background:#fff}" +
    ".pgpage .lg{position:absolute;left:" + (PG.side - 6) + "px;top:30px;height:44px}.pgpage .tt{position:absolute;right:" + PG.side + "px;top:30px;text-align:right;color:#0b5cc9;font:16px/1.2 Calibri,Carlito,Arial,sans-serif;text-decoration:underline}" +
    ".pgpage .bar{position:absolute;left:0;right:0;bottom:0;height:14px;background:#2f5fb3}.pgpage .bn{position:absolute;left:0;bottom:0;width:100%}" +
    ".pgpage .bear{position:absolute;right:18px;bottom:14px;height:150px}.pgpage .pc{position:absolute;left:" + PG.side + "px;right:" + PG.side + "px;top:" + PG.top + "px}";
  (function () { var st = document.createElement("style"); st.textContent = PDF_CSS.replace(/\.pgp/g, ".pg-mail .pgp") + ".pg-mail .pgp{padding:18px;border-radius:6px;max-width:820px}"; document.body.appendChild(st); })();
  function paginate(o, host) {
    var pages = [], cur, pc, limit;
    function newPage() {
      cur = document.createElement("div"); cur.className = "pgpage";
      cur.innerHTML = '<img class="lg" src="' + PDF_IMG.logo + '" alt="">' + (pages.length ? '<div class="tt">MyMaxicare Healthcare Benefits<br>Summary</div>' : "") + '<div class="pc pgp"></div><div class="bar"></div>';
      host.appendChild(cur); pages.push(cur); pc = cur.querySelector(".pc"); limit = PG.h - PG.top - PG.foot; cur._banner = false;
    }
    newPage();
    o.blocks.forEach(function (x) {
      if (x === "BREAK") { if (pc.children.length) newPage(); return; }
      if (x === "BANNER") {
        if (pc.offsetHeight + PG.banner + 10 > limit + PG.foot - 14) newPage();
        var bn = document.createElement("img"); bn.className = "bn"; bn.src = PDF_IMG.banner; bn.alt = ""; cur.appendChild(bn);
        cur.querySelector(".bar").remove(); limit = PG.h - PG.top - PG.banner - 14; cur._banner = true; return;
      }
      var d = document.createElement("div"); d.innerHTML = x; pc.appendChild(d);
      if (pc.offsetHeight > limit && pc.children.length > 1) { pc.removeChild(d); newPage(); pc.appendChild(d); }
    });
    pages.forEach(function (p, i) { // the template's bear, where a page has room for it
      var used = p.querySelector(".pc").offsetHeight;
      if (i && !p._banner && PG.h - PG.top - used - 14 > 170) { var b = document.createElement("img"); b.className = "bear"; b.src = PDF_IMG.bear; b.alt = ""; p.appendChild(b); }
    });
    return pages;
  }
  function imagesReady(el) {
    return Promise.all([].slice.call(el.querySelectorAll("img")).map(function (im) { return im.complete ? 0 : new Promise(function (ok) { im.onload = im.onerror = ok; }); }));
  }
  function proposalPdf(o) {
    if (!o.blocks) return Promise.reject(new Error("pdf"));
    return loadPdfLib().then(function (h2p) {
      var box = document.createElement("div");
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = "position:fixed;left:-10000px;top:0;";
      box.innerHTML = "<style>" + PDF_CSS + PAGE_CSS + '</style><div class="pgpages"></div>';
      document.body.appendChild(box);
      var host = box.querySelector(".pgpages"), pages;
      // lay out once images have their sizes, then page it
      var probe = document.createElement("div"); probe.innerHTML = [PDF_IMG.logo, PDF_IMG.banner, PDF_IMG.sig, PDF_IMG.bear].map(function (s) { return '<img src="' + s + '" alt="">'; }).join(""); probe.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden"; box.appendChild(probe);
      return imagesReady(probe).then(function () {
        pages = paginate(o, host); host.style.cssText = "height:" + (pages.length * PG.h - 3) + "px;overflow:hidden"; // no sliver of an extra page
        return imagesReady(host);
      }).then(function () {
        var opt = { margin: 0, filename: o.files.filter(function (f) { return f.gen; })[0].name, image: { type: "jpeg", quality: 0.92 },
          html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css"], before: [], after: [], avoid: [] } }; // pages are already A4-sized, so no break handling
        return h2p().set(opt).from(host).outputPdf("blob");
      }).then(function (b) { box.remove(); return b; }, function (err) { box.remove(); throw err; });
    });
  }
  // PDF preview (Paolo, 2026-11-25): the same A4 pages the PDF is made from, shown before anyone approves
  function previewPdf(o) {
    if (!o || !o.blocks) { say("Generate the proposal first"); return; }
    var old = document.getElementById("pgPrev"); if (old) old.remove();
    var f = o.files.filter(function (x) { return x.gen; })[0], scrim = document.createElement("div");
    scrim.id = "pgPrev"; scrim.setAttribute("role", "dialog"); scrim.setAttribute("aria-modal", "true"); scrim.setAttribute("aria-label", "PDF preview");
    scrim.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(10,20,40,.72);display:flex;flex-direction:column;align-items:center;overflow:auto;padding:14px 10px 40px";
    scrim.innerHTML = "<style>" + PDF_CSS + PAGE_CSS + '#pgPrev .pgpage{box-shadow:0 4px 18px rgba(0,0,0,.35);margin-bottom:16px}#pgPrev .pgpages{background:transparent}</style>' +
      '<div style="position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff;border-radius:10px;padding:8px 12px;margin-bottom:12px;max-width:820px;width:100%;box-shadow:0 2px 10px rgba(0,0,0,.25)"><b style="color:#002C6C">PDF preview</b><span class="muted small" id="pgPrevInfo">' + e(f ? f.name : "") + ' · laying out pages…</span><span style="flex:1"></span><button class="btn sm" type="button" data-pgprevclose>Close ✕</button></div>' +
      '<div id="pgPrevWrap" style="position:relative"><div class="pgpages" style="transform-origin:top left"></div></div>';
    document.body.appendChild(scrim);
    var host = scrim.querySelector(".pgpages"), wrap = scrim.querySelector("#pgPrevWrap");
    var probe = document.createElement("div"); probe.innerHTML = [PDF_IMG.logo, PDF_IMG.banner, PDF_IMG.sig, PDF_IMG.bear].map(function (s) { return '<img src="' + s + '" alt="">'; }).join(""); probe.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden"; scrim.appendChild(probe);
    imagesReady(probe).then(function () {
      var pages = paginate(o, host);
      function fit() { var sc = Math.min(1, (scrim.clientWidth - 20) / PG.w); host.style.transform = "scale(" + sc + ")"; wrap.style.width = PG.w * sc + "px"; wrap.style.height = host.offsetHeight * sc + "px"; }
      fit(); window.addEventListener("resize", fit); scrim._fit = fit;
      var info = scrim.querySelector("#pgPrevInfo"); if (info) info.textContent = (f ? f.name + " · " : "") + pages.length + " page" + (pages.length === 1 ? "" : "s") + " · what the client will get";
      scrim.querySelector("[data-pgprevclose]").focus();
    });
  }
  function closePreview() { var s = document.getElementById("pgPrev"); if (s) { if (s._fit) window.removeEventListener("resize", s._fit); s.remove(); } }
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-pgprev],[data-pgprevclose]"); if (!t) { if (ev.target && ev.target.id === "pgPrev") closePreview(); return; }
    ev.stopPropagation(); ev.preventDefault();
    if (t.hasAttribute("data-pgprevclose")) closePreview(); else previewPdf(G.out);
  }, true);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && document.getElementById("pgPrev")) { ev.stopPropagation(); closePreview(); } }, true);
  // After the draft is made, drop the client's details from the form; the email stays on screen until "Start a new proposal".
  function clearPersonal() { G.f = { region: G.f.region, prov: G.f.prov, city: G.f.city }; G.members = []; }
  function log(status) {
    var h = store(HIST_KEY) || [];
    h.unshift({ at: new Date().toISOString(), co: G.out.co, type: G.out.type, status: status, by: G.review ? G.review.agent.n : "" });
    store(HIST_KEY, h.slice(0, 50));
  }
  function history() {
    var h = store(HIST_KEY) || []; if (!h.length) return "";
    return '<div class="card pad stack"><h3>Proposals from this browser</h3><table class="t"><thead><tr><th>When</th><th>Company</th><th>Type</th><th>Checked by</th><th>Status</th></tr></thead><tbody>' +
      h.slice(0, 10).map(function (x) { return '<tr><td>' + e(new Date(x.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + '</td><td>' + e(x.co) + '</td><td>' + e(x.type) + '</td><td>' + e(x.by || "—") + '</td><td>' + (x.status === "draft" ? "Draft created" : "Sent") + '</td></tr>'; }).join("") +
      '</tbody></table><p class="muted small" style="margin:0">Client names and emails aren\'t kept here; they are in Outlook or Gmail.</p></div>';
  }
  function copyMail() {
    if (!G.out) return;
    var el = document.createElement("div"); el.innerHTML = G.out.html;
    var text = "To: " + G.out.to + "\nSubject: " + G.out.subject + "\n\n" + (el.innerText || el.textContent);
    try {
      if (window.ClipboardItem && navigator.clipboard.write) navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([G.out.html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]).then(function () { say("Email copied"); }, function () { navigator.clipboard.writeText(text).then(function () { say("Email copied"); }, function () { say("Select the text and copy it"); }); });
      else navigator.clipboard.writeText(text).then(function () { say("Email copied"); }, function () { say("Select the text and copy it"); });
    } catch (err) { say("Select the text and copy it"); }
  }

  /* ---------- events ---------- */
  var app = document.getElementById("app");
  app.addEventListener("mousedown", function (ev) { if (ev.target.closest && ev.target.closest("[data-pgcmd]")) ev.preventDefault(); }, true);
  app.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-pgcmd]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    var ed = document.getElementById("pgTplEd"); if (!ed) return; ed.focus();
    var cmd = b.getAttribute("data-pgcmd");
    try { document.execCommand(cmd, false, null); } catch (err) { /* older browsers */ }
    G.tplDraft = ed.innerHTML;
  }, true);
  app.addEventListener("input", function (ev) { if (ev.target && ev.target.id === "pgTplEd") G.tplDraft = ev.target.innerHTML; }, true);
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-pg]"); if (!t) return;
    ev.stopPropagation(); ev.preventDefault();
    var a = t.getAttribute("data-pg"), v = t.getAttribute("data-v");
    if (a === "co") { if (G.co !== v) { reset(); G.co = v; } }
    else if (a === "type") { if (G.type !== v) { var keep = { name: G.f.name, email: G.f.email, region: G.f.region, prov: G.f.prov, city: G.f.city }; reset(true); G.type = v; G.f = keep; } }
    else if (a === "addm") G.members.push({ name: "", age: "" });
    else if (a === "delm") G.members.splice(Number(v), 1);
    else if (a === "clear") { reset(true); }
    else if (a === "edit") { G.out = null; G.review = null; G.draft = null; G.mailErr = ""; G.mailEdit = false; G.tplDraft = null; }
    else if (a === "new") { reset(true); }
    else if (a === "draft") { makeDraft(); return; }
    else if (a === "ghl") { ghlLog(); return; }
    else if (a === "via") { setVia(v); }
    else if (a === "save") { saveFile(Number(v)); return; }
    else if (a === "savesig") { saveFile(-1); return; }
    else if (a === "pgtab") { G.tab = v; }
    else if (a === "smeopt") { G.f.opt = v; G.err = ""; }
    else if (a === "mailedit") { G.mailEdit = true; G.tplDraft = null; G.tab = "email"; }
    else if (a === "mailcancel") { G.mailEdit = false; G.tplDraft = null; }
    else if (a === "mailsave") { if (saveMailEdit() === false) return; }
    else if (a === "copy") { copyMail(); return; }
    render();
    if (a === "type" || a === "co") { var f = document.querySelector("[data-pgform] input"); if (f && a === "type") f.focus(); }
  }, true);
  app.addEventListener("input", function (ev) {
    var t = ev.target; if (!t.getAttribute) return;
    var k = t.getAttribute("data-pgf"), m = t.getAttribute("data-pgm");
    if (k) G.f[k] = t.type === "checkbox" ? t.checked : t.value;
    if (m) G.members[Number(t.getAttribute("data-i"))][m] = t.value;
  }, true);
  app.addEventListener("change", function (ev) {
    var t = ev.target; if (!t.getAttribute) return;
    var k = t.getAttribute("data-pgf"), m = t.getAttribute("data-pgm"), sp = t.getAttribute("data-pgspec");
    if (k) G.f[k] = t.type === "checkbox" ? t.checked : t.value;
    if (m) G.members[Number(t.getAttribute("data-i"))][m] = t.value;
    if (sp) { G.specs = G.specs.filter(function (s) { return s !== sp; }); if (t.checked) G.specs.push(sp); }
    if (t.getAttribute("data-pgr")) {
      if (k === "region") { G.f.prov = ""; G.f.city = ""; }
      if (k === "prov") G.f.city = "";
      var id = t.id; render(); var back = document.getElementById(id); if (back) back.focus();
    }
  }, true);
  app.addEventListener("submit", function (ev) {
    var fm = ev.target; if (!fm.getAttribute || !fm.getAttribute("data-pgform")) return;
    ev.preventDefault(); ev.stopPropagation();
    try { generate().catch(function (err) { G.err = err.message; render(); }); }
    catch (err) { G.err = err.message; render(); var el = document.querySelector("[data-pgform] .err"); if (el) el.scrollIntoView({ block: "center" }); }
  }, true);

  /* ---------- Approvals: every checked proposal waits for your OK before the email is made (Paolo, 2026-11-25) ---------- */
  // Items live in S.data.approvals so they show on the Approvals page and its badge, but they hold the client's name and
  // email, so save() leaves them out of browser storage (and feed notes leave the name out): they last only while the page is open.
  // Paolo, 2026-11-25: "once approved it will automatically saved in the draft". As soon as the proposal is approved
  // (Maya's check passed and you pressed Approve), the email goes into the chosen mailbox's drafts on its own, once per
  // proposal. If that fails, the error shows and the Create draft button stays for a retry. Nothing is ever sent.
  var autoFor = null;
  setInterval(function () {
    var o = G.out; if (!o || G.draft || G.sending || autoFor === o || !G.review || G.review.status !== "approved") return;
    var ap = pgItem(); if (!ap || ap.state !== "approved") return;
    autoFor = o; say("Approved. Saving the email in your " + (mailVia() === "gmail" ? "Gmail" : "Outlook") + " drafts…"); makeDraft();
  }, 800);
  function pgItem() { var o = G.out; return o && o.apId ? (S.data.approvals || []).filter(function (x) { return x.id === o.apId; })[0] || null : null; }
  function stripTags(h) { var d = document.createElement("div"); d.innerHTML = h.replace(/<br\s*\/?>/g, "\n"); return d.textContent; }
  function queueApproval(o) {
    var list = S.data && S.data.approvals; if (!list || o.apId) return;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].pg && list[i].state !== "sent") list.splice(i, 1);
    var lines = mailLines(o.email);
    var table = null;
    if (o.calc && o.c.plans) {
      var names = o.c.plans.map(function (p) { return p.n; });
      table = [[o.fam ? "Family total" : "Payment mode"].concat(names)].concat(o.modes.map(function (mo, mi) {
        return [MODE_NAME[mo]].concat(names.map(function (n, j) { return peso0(o.fam ? o.total[mi][j] : o.calc[0].fees[mi][j]); }));
      }));
    }
    var a = { id: "pg_" + Date.now().toString(36), pg: 1, kind: "Proposal", title: o.subject + " for " + o.c.name, who: G.review.agent.id,
      aud: o.c.name + " (" + o.to + ")", count: 1, when: "Today, " + nowLabel(), state: "waiting",
      doc: { eyebrow: o.co + " " + o.type + " · email to " + o.to, head: o.subject, lines: lines, table: table,
        cta: o.files.length ? "Attachments: " + o.files.map(function (f) { return f.name; }).join(", ") : "No attachments" },
      checks: G.review.checks.map(function (x) { return [x.s === "ok" ? "ok" : "watch", x.t]; }) };
    list.unshift(a); o.apId = a.id;
    var ea = byId(a.who); if (ea) addFeed(ea, "Sent for your OK: " + a.doc.head);
    say("Proposal checked by " + G.review.agent.n + ". It's waiting for your OK in Approvals.");
  }
  function approvalBox(ap) {
    if (!ap) return "";
    var st = ap.state, h = '<div class="z1-box" role="status"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Your approval</b><span class="sp" style="flex:1"></span>' + apState(st) + '</div>';
    if (st === "waiting") h += '<span class="small">Check the ' + (G.out && G.out.blocks ? "PDF" : "email and files") + ', then approve it here or in Approvals. Once it\'s approved you can create the Outlook draft.</span>' + (S.askFor === ap.id
      ? '<form data-form="ask" data-id="' + ap.id + '" class="stack" style="gap:6px"><label class="lbl" for="askText">What should ' + e(nameOf(ap.who)) + ' change?</label><textarea class="inp" id="askText" rows="3" placeholder="e.g. Add the dental rider and use the Gold plan"></textarea><div class="actions"><button class="btn pri sm" type="submit">Send back</button><button class="btn sm" type="button" data-act="askcancel">Cancel</button></div></form>'
      : '<div class="actions"><button class="btn sm pri" data-act="approve" data-id="' + ap.id + '">Approve</button><button class="btn sm" data-act="ask" data-id="' + ap.id + '">Ask for changes</button><button class="btn sm" data-act="decline" data-id="' + ap.id + '">Decline</button>' + (G.out && G.out.blocks ? '<button class="btn sm" type="button" data-pgprev>Preview the PDF</button>' : '') + '</div>');
    else if (st === "changes") h += '<span class="small">You asked for changes' + (ap.note ? ': “' + e(ap.note) + '”' : '') + '. Edit the details and generate it again.</span>';
    else if (st === "declined") h += '<span class="small">You declined this proposal, so no email will be made. Edit the details to start over.</span>';
    else if (st === "approved") h += '<span class="small">' + e(ap.when) + '. Save the files, then create the Outlook or Gmail draft.</span>';
    return h + '</div>';
  }
  (function () {
    if (typeof apItem === "function") {
      var apItem0 = apItem;
      apItem = function (a) {
        var h = apItem0(a); if (!a.pg) return h;
        return h.replace("Pia's pre-send check", e(nameOf(a.who)) + "'s check").replace(/>Approve and send to 1</, ">Approve<")
          .replace(/<button class="btn" data-act="test"[^>]*>[^<]*<\/button>/, "").replace(/>Send now</, ">Create the email draft<")
          .replace(/(<div class="actions"><button class="btn pri" data-act="(?:approve|sendnow)")/, (G.out && G.out.apId === a.id && G.out.blocks ? '<div class="actions" style="margin-bottom:6px"><button class="btn" type="button" data-pgprev>Preview the PDF</button></div>' : "") + "$1");
      };
    }
    if (typeof save === "function") {
      var save0 = save;
      save = function () { var d = S.data, all = d && d.approvals; if (!all) return save0.apply(this, arguments); d.approvals = all.filter(function (x) { return !x.pg; }); try { return save0.apply(this, arguments); } finally { d.approvals = all; } };
    }
    function item(id) { return (S.data.approvals || []).filter(function (x) { return x.id === id; })[0]; }
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-act]"); if (!b || !/^pg_/.test(b.dataset.id || "")) return;
      var act = b.dataset.act, a = item(b.dataset.id); if (!a || ["approve", "sendnow", "test"].indexOf(act) < 0) return;
      ev.stopPropagation(); ev.preventDefault();
      if (act === "approve") { a.state = "approved"; a.when = "Approved " + nowLabel() + " today"; var ea = byId(a.who); if (ea) addFeed(ea, "You approved: " + a.doc.head); render(); say("Approved. Create the Outlook draft from the Proposal generator."); }
      else if (act === "sendnow") { go("propgen"); if (G.out && G.out.apId === a.id) makeDraft(); }
    }, true);
    document.addEventListener("submit", function (ev) {
      var f = ev.target; if (!f || !f.dataset || f.dataset.form !== "ask" || !/^pg_/.test(f.dataset.id || "")) return;
      var a = item(f.dataset.id), t = document.getElementById("askText"); if (a && t) a.note = t.value.trim().slice(0, 300);
    }, true);
  })();

  /* ---------- hook into the page: Today > Proposal generator (moved from Numbers, Paolo 2026-11-25) ---------- */
  (function () {
    var grp = NAV.filter(function (g) { return g[0] === "Today"; })[0] || NAV.filter(function (g) { return g[0] === "Numbers"; })[0];
    if (grp) grp[1].push(["propgen", "Proposal generator"]);
  })();
  VIEWS.propgen = vPropgen;
  var baseProposals = VIEWS.proposals;
  VIEWS.proposals = function () {
    var h = baseProposals();
    return h.replace('<button class="btn sm" data-go="approvals">Open approvals</button>', '<div class="actions" style="margin:0"><button class="btn sm pri" data-go="propgen">Generate a proposal</button><button class="btn sm" data-go="approvals">Open approvals</button></div>');
  };
  if (S.view === "propgen") render();
})();
