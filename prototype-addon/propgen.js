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
    ["Maxicare", ["Prepaid", "Individual", "Family", "SME", "Corporate"]],
    ["Medicard", ["Prepaid", "Individual", "Family", "SME", "Corporate"]],
    ["Intellicare", ["SME", "Corporate"]],
    ["IMS", ["Group Plan", "Corporate", "Teacher", "Government", "Personnel"]],
    ["KHL", ["Individual", "Corporate"]],
  ];
  var GROUP_TYPES = ["SME", "Corporate", "Group Plan", "Teacher", "Government", "Personnel"];

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
  function nearby(loc) {
    var out = {};
    ["H", "P", "C", "D"].forEach(function (k) {
      var all = PD.f.map(function (f, i) { return { i: i, f: f }; }).filter(function (x) { return x.f[1] === k && PD.regions[x.f[2]] === loc.region; });
      var city = all.filter(function (x) { return x.f[3] === loc.prov && x.f[4] === loc.city; });
      var prov = all.filter(function (x) { return x.f[3] === loc.prov && x.f[4] !== loc.city; });
      var reg = all.filter(function (x) { return x.f[3] !== loc.prov; });
      var pick = city.slice(0, LIMIT[k]).map(function (x) { x.where = ""; return x; });
      [[prov, "province"], [reg, "region"]].forEach(function (g) {
        if (pick.length >= 3) return;
        g[0].slice(0, Math.max(0, Math.min(LIMIT[k], 6) - pick.length)).forEach(function (x) { x.where = title(x.f[4] || x.f[3]); pick.push(x); });
      });
      out[k] = { list: pick, inCity: city.length };
    });
    return out;
  }
  function doctorsAt(facIdx, specs, perSpec) {
    if (!DD) return [];
    var set = {}; facIdx.forEach(function (i) { set[i] = 1; });
    var want = {}; specs.forEach(function (s) { var j = DD.specs.indexOf(s); if (j > -1) want[j] = []; });
    DD.d.forEach(function (d) {
      if (!(d[1] in want) || want[d[1]].length >= perSpec) return;
      var at = d[3].filter(function (i) { return set[i]; });
      if (at.length) want[d[1]].push({ n: d[0], sub: d[2], at: at.map(function (i) { return PD.f[i][0]; }) });
    });
    return Object.keys(want).map(function (j) { return { spec: DD.specs[j], docs: want[j] }; });
  }

  /* ---------- state ---------- */
  var HIST_KEY = "zero1office-proposals:v1"; // company, type, date and status only: no client or member data is kept
  var G = { co: "", type: "", f: {}, members: [], specs: ["INTERNAL MEDICINE", "PEDIATRICS", "OBSTETRICS & GYNECOLOGY"], out: null, err: "", warn: [], sending: false, draft: null, review: null, tab: "email", mailErr: "" };
  function reset(keepPick) { var co = G.co, ty = G.type; G.f = {}; G.members = []; G.out = null; G.err = ""; G.warn = []; G.sending = false; G.draft = null; G.review = null; G.tab = "email"; G.mailErr = ""; if (!keepPick) { G.co = ""; G.type = ""; } else { G.co = co; G.type = ty; } }
  function formKind() { if (G.co === "Maxicare" && G.type === "Individual") return "mxi"; if (G.co === "Maxicare" && G.type === "Family") return "mxf"; return G.type ? "generic" : ""; }

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
      sel("region", "Region *", [["", "Choose the region"]].concat(regs.map(function (r) { return [r, REGION_NAME[r] || r]; })), ' data-pgr="1"') +
      sel("prov", "Province *", [["", provs.length ? "Choose the province" : "Choose the region first"]].concat(provs.map(function (p) { return [p, title(p)]; })), ' data-pgr="1"' + (provs.length ? "" : " disabled")) +
      sel("city", "City or municipality *", [["", cities.length ? "Choose the city" : "Choose the province first"]].concat(cities.map(function (c) { return [c, title(c)]; })), cities.length ? "" : " disabled") +
      '</div><p class="muted small" style="margin:0">Where the client lives or works. Hospitals, clinics and doctors in the proposal are picked from here. Only places with a Maxicare-accredited provider are listed.</p>';
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
    if (!PD) throw new Error("Wait for the provider list to load.");
    return { region: need(G.f.region, "Choose the client's region."), prov: need(G.f.prov, "Choose the client's province."), city: need(G.f.city, "Choose the client's city or municipality.") };
  }
  function generate() {
    G.err = ""; G.warn = [];
    var k = formKind(), f = G.f, c = {};
    c.name = need(f.name, k === "generic" && GROUP_TYPES.indexOf(G.type) > -1 ? "Enter the contact person." : "Enter the client's name.");
    c.email = need(f.email, "Enter the client's email so the proposal can be sent.");
    if (!EMAIL_RE.test(c.email)) throw new Error("The email address doesn't look right.");
    c.mobile = (f.mobile || "").trim();
    c.loc = readLoc(); c.note = (f.note || "").trim(); c.on = todayIso();
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
    if (G.co === "Maxicare") { c.near = nearby(c.loc); c.specs = G.specs.slice(); return loadDoctors().then(function () { finish(k, c); }); }
    finish(k, c); return Promise.resolve();
  }
  function finish(k, c) {
    var out = k === "generic" ? genericEmail(c) : maxicareEmail(k, c);
    out.to = c.email; out.kind = k; out.co = G.co; out.type = G.type; out.c = c;
    out.files = filesFor(G.co, G.type);
    out.email = emailTemplate(k, c, out.files);
    out.html = out.email + "<hr>" + out.proposal;
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
    return "<p>Should you have questions, please feel free to call me at 0977-217-6388 or email me at <a href=\"mailto:karlaluansing.maxicare@gmail.com\">karlaluansing.maxicare@gmail.com</a>.</p>" +
      "<p>I hope to hear from you soon and look forward to being your trusted health benefits partner.</p>" +
      "<p>Respectfully yours,<br><br><b>Karla Junesha Luansing</b><br>Health Benefit Consultant, A465132<br>Ask Karla</p>";
  }
  function providersHtml(c) {
    var n = c.near, h = "<h2>Accredited providers near you</h2><p>Maxicare-accredited providers in and around " + e(title(c.loc.city)) + ", " + e(title(c.loc.prov)) + " (Maxicare list as of " + e(PD.asOf) + "). The full network is open to you nationwide.</p>";
    ["P", "H", "C", "D"].forEach(function (k) {
      var L = n[k].list; if (!L.length) return;
      h += "<h3>" + KIND[k] + "</h3><ul>" + L.map(function (x) { return "<li>" + e(x.f[1] === "P" ? x.f[0] : title(x.f[0])) + (x.where ? " (" + e(x.where) + ")" : "") + "</li>"; }).join("") + "</ul>";
      if (n[k].inCity > L.length) h += "<p>…and " + (n[k].inCity - L.length) + " more in " + e(title(c.loc.city)) + ".</p>";
    });
    if (DD && c.specs.length) {
      var fac = n.H.list.concat(n.P.list).concat(n.C.list).map(function (x) { return x.i; });
      var docs = doctorsAt(fac, c.specs, 6).filter(function (g) { return g.docs.length; });
      if (docs.length) {
        h += "<h3>Accredited doctors at these hospitals and clinics</h3>";
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
  function maxicareEmail(k, c) {
    var fam = k === "mxf", P = c.plans, idx = P.map(function (p) { return PLANS.indexOf(p); });
    var h = "<h1>MyMaxicare " + (fam ? "Family" : "Individual") + " proposal</h1><p>Prepared for " + e(c.name) + (fam ? " and family (" + c.people.length + " members)" : "") + " on " + e(longDate(c.on)) + ". Fees are based on " + (fam ? "each member's" : "your") + " age today.</p>";
    h += "<h2>Plans</h2>" + tbl(["", ""].slice(0, 1).concat(P.map(function (p) { return p.n; })), [
      ["Maximum benefit limit (per illness, per year)"].concat(P.map(function (p) { return peso0(p.mbl); })),
      ["Room and board"].concat(P.map(function (p) { return p.room; })),
    ]);
    var totals = c.modes.map(function () { return idx.map(function () { return 0; }); });
    var rows = [], calc = [];
    c.people.forEach(function (m) {
      calc.push({ name: m.name, y: m.age.y, b: bracketOf(m.age), fees: c.modes.map(function (mo) { return idx.map(function (pi) { return fee(c.table, bracketOf(m.age), pi, mo); }); }) });
      var b = bracketOf(m.age);
      c.modes.forEach(function (mo, mi) {
        rows.push([(mi === 0 ? "<b>" + e(m.name) + "</b><br>" + e(ageText(m.age)) + " (" + BRACKETS[b] + ")" : ""), MODE_NAME[mo]].concat(idx.map(function (pi, j) { var v = fee(c.table, b, pi, mo); totals[mi][j] += v; return peso0(v); })));
      });
    });
    if (fam) c.modes.forEach(function (mo, mi) { rows.push([mi === 0 ? "<b>Total for the family</b>" : "", "<b>" + MODE_NAME[mo] + "</b>"].concat(totals[mi].map(function (v) { return "<b>" + peso0(v) + "</b>"; }))); });
    h += "<h2>Membership fees</h2>" + tbl(["Member", "Payment mode"].concat(P.map(function (p) { return p.n; })), rows);
    h += "<p>Quarterly payment is subject for approval. " + (fam ? "Dependents may take the same plan as the principal or one plan lower; the table shows everyone on the same plan." : "") + "</p>";
    if (c.riders.length) {
      h += "<h3>Optional riders" + (fam ? " (per member)" : "") + "</h3>" + tbl(["Rider"].concat(c.modes.map(function (m) { return MODE_NAME[m]; })).concat(["Note"]),
        c.riders.map(function (r) { return [r.n].concat(c.modes.map(function (m) { return peso0(r.fee[m]); })).concat([r.note]); }));
      if (fam) h += "<p>Each member may add or skip the dental rider.</p>";
      h += "<p>Critical Illness and Daily Hospital Cash become built in from the third year of membership.</p>";
    }
    h += benefitsHtml() + pecHtml(P);
    h += "<h2>Eligibility</h2><ul><li>Principal and dependents: 15 days to 60 years old. Ages 15 days to 17 years need an appointed guardian.</li><li>Renewal: up to 65 years old" + (fam ? " (dependents renew with the principal)" : "") + ".</li>" + (fam ? "<li>Children and siblings: up to 21 years 5 months.</li>" : "") + "</ul>";
    h += "<h2>What to prepare</h2><ul>" + (fam
      ? "<li>Completed MyMaxicare application form</li><li>Principal: government-issued ID; birth certificate if single, single parent, widowed, annulled, divorced or separated; marriage certificate if married</li><li>Adult dependents: valid government ID with birthdate (parents); marriage certificate (spouse)</li><li>Minor dependents: birth certificate</li><li>Foreign applicants: ACR or SRRV</li>"
      : "<li>Completed MyMaxicare application form</li><li>Government-issued ID (birth certificate for minors)</li><li>Foreign applicants: ACR or SRRV</li>") + "</ul>";
    h += providersHtml(c);
    return { subject: "Your MyMaxicare " + (fam ? "Family" : "Individual") + " proposal" + (c.name ? " – " + c.name : ""), proposal: h, total: fam ? totals : null, calc: calc, modes: c.modes, idx: idx, table: c.table, fam: fam };
  }
  function genericEmail(c) {
    var who = c.grp ? c.org : c.name;
    var h = "<h1>" + e(G.co + " " + G.type) + " proposal request</h1><p>What we have noted so far" + (c.grp ? " for " + e(c.org) : "") + ":</p>";
    var rows = [];
    function add(l, v) { if (v != null && String(v).trim() !== "") rows.push(["<b>" + l + "</b>", e(v)]); }
    if (c.grp) { add("Company or group", c.org); add("Contact", c.name + (c.position ? ", " + c.position : "")); add("Industry", c.industry); add("Employees or members", c.heads); add("Dependents", c.deps); add("Average age", c.avgage); add("Current HMO", c.current); add("Current plan renews on", c.renewal ? longDate(c.renewal) : ""); }
    else { add("Name", c.name); add("People to cover", c.heads); add("Ages", c.ages); add("Current HMO", c.current); }
    add("Location", title(c.loc.city) + ", " + title(c.loc.prov)); add("Preferred room", c.room); add("Preferred benefit limit", c.mbl ? peso0(c.mbl) : ""); add("Budget", c.budget ? peso0(c.budget) + (c.grp ? " per head a year" : " a year") : ""); add("Payment mode", c.mode);
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
  function filesFor(co, type) { return (FILES[co + "|" + type] || []).map(function (f) { return { path: f[0], name: f[1], label: f[2] }; }); }

  /* ---------- email template, by product type ---------- */
  function emailTemplate(k, c, files) {
    var h = letterTop(c, c.name);
    if (k === "mxi" || k === "mxf") {
      var fam = k === "mxf";
      h += "<p>Thank you for considering Maxicare. For over 37 years, Maxicare has provided comprehensive healthcare through a network of more than 56,000 accredited doctors and over 1,000 hospitals and clinics nationwide, with customer care open 24/7.</p>" +
        "<p>Below is your <b>MyMaxicare " + (fam ? "Family" : "Individual") + "</b> proposal" + (fam ? " for your family of " + c.people.length : "") + ", with the fees for all four plans, what is covered, and the accredited hospitals, clinics and doctors near " + e(title(c.loc.city)) + ".</p>";
    } else {
      h += "<p>Thank you for your interest in a <b>" + e(G.co + " " + G.type) + "</b> plan" + (c.grp ? " for " + e(c.org) : "") + ". Below is a summary of what we have noted so far; I'll follow up with the plan options and rates.</p>";
    }
    if (files.length) h += "<p>I've attached:</p><ul>" + files.map(function (f) { return "<li>" + e(f.label) + "</li>"; }).join("") + "</ul>";
    if (k !== "generic") h += "<p>When you're ready, just reply with the plan and payment mode you like, fill in the application form, and I'll guide you through enrollment.</p>";
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
    checkTimer = setTimeout(function () { if (G.out !== o) return; G.review.checks = runChecks(o); G.review.status = G.review.checks.some(function (x) { return x.s === "fail"; }) ? "returned" : "approved"; G.review.at = new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }); if (S.view === "propgen") render(); }, 1200);
  }
  // Each check recomputes from the source tables, not from the text of the proposal.
  function runChecks(o) {
    var out = [], c = o.c;
    function add(s, t) { out.push({ s: s, t: t }); }
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
      var hosp = c.near.H.list.length, inCity = c.near.H.inCity;
      add(hosp ? (inCity ? "ok" : "warn") : "fail", hosp ? (inCity ? inCity + " accredited hospitals in " + title(c.loc.city) + "; nearest listed." : "No accredited hospital in " + title(c.loc.city) + "; the nearest ones in the province or region are listed.") : "No accredited hospital found near the client.");
    }
    var tplOk = o.email.indexOf(e(c.name)) > -1 && o.email.indexOf("Karla Junesha Luansing") > -1 && o.files.every(function (f) { return o.email.indexOf(e(f.label)) > -1; });
    add(tplOk ? "ok" : "fail", tplOk ? "Email template has the client's name, Karla's signature and the list of attached files." : "Email template is missing the client's name, the signature or the list of files.");
    add(o.files.length ? "ok" : "warn", o.files.length ? o.files.length + " files to attach for " + o.co + " " + o.type + ": " + o.files.map(function (f) { return f.label; }).join(", ") + "." : "No files are set up for " + o.co + " " + o.type + " yet. Attach any files yourself in Outlook.");
    return out;
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
    // files
    if (rv.status === "approved") {
      h += '<div class="z1-box"><div class="z1-sect">Files to attach</div>' + (o.files.length ? '<table class="t"><tbody>' + o.files.map(function (f, i) {
        return '<tr><td><b>' + e(f.label) + '</b><br><span class="muted small">' + e(f.name) + '</span></td><td class="r"><button class="btn sm" data-pg="save" data-v="' + i + '">Save file</button></td></tr>'; }).join("") + '</tbody></table>' : '<p class="small muted" style="margin:0">None set up for this product yet.</p>') + '</div>';
      h += '<label class="fld">CC (optional)<input class="inp" id="pg-cc" data-pgf="cc" type="email" maxlength="160" placeholder="e.g. karla@ask-karla.com" value="' + e(G.f.cc || "") + '" autocomplete="off"></label>';
    }
    if (dr) h += '<div class="z1-box" role="status"><b>The email is in your Outlook Drafts, addressed to ' + e(o.to) + '.</b><span class="small">Open it, attach the ' + (o.files.length ? o.files.length + " saved files" : "files") + ', then press Send in Outlook.</span>' + (dr.link ? '<a class="btn sm pri" style="justify-self:start" href="' + e(dr.link) + '" target="_blank" rel="noopener">Open the draft in Outlook</a>' : '') + '</div>';
    if (G.mailErr) h += '<div class="z1-box" role="alert">' + G.mailErr + '</div>';
    h += '<div class="actions">' +
      (dr ? '<button class="btn pri" data-pg="new">Start a new proposal</button>' : rv.status === "approved" ? '<button class="btn pri" data-pg="draft"' + (G.sending ? " disabled" : "") + '>' + (G.sending ? "Creating the draft…" : "Create the Outlook draft") + '</button>' : "") +
      (dr ? "" : '<button class="btn" data-pg="edit">Edit the details</button>') + '<button class="btn" data-pg="copy">Copy the email</button></div>';
    // email template and proposal
    h += '<div class="chips" role="group" aria-label="Show" style="margin:0"><button class="chip" data-pg="pgtab" data-v="email" aria-pressed="' + (G.tab !== "proposal") + '">Email template</button><button class="chip" data-pg="pgtab" data-v="proposal" aria-pressed="' + (G.tab === "proposal") + '">Proposal</button></div>';
    h += '<div class="z1-kv"><div><small>To</small><span>' + e(o.to) + '</span></div><div><small>Subject</small><span>' + e(o.subject) + '</span></div>' + (o.total ? '<div><small>Family total, annual</small><span>' + o.total[0].map(peso0).join(" · ") + '</span></div>' : "") + '</div>';
    h += '<div class="z1-box pg-mail" id="pgMail" style="background:var(--surface);max-height:none">' + (G.tab === "proposal" ? o.proposal : o.email + '<p class="muted small"><i>The proposal follows below the signature in the same email.</i></p>') + '</div></div>';
    return h;
  }
  var MAIL_SERVER = "Microsoft 365";
  function mailError(err) {
    var c = err && err.code;
    if (c === "needs_reauth") return "Your Microsoft 365 sign-in has expired. Reconnect it in claude.ai Settings, Connectors, then try again.";
    if (c === "server_not_connected" || c === "selection_required") return "Microsoft 365 isn't connected for you. Add it in claude.ai Settings, Connectors, then try again.";
    if (c === "not_in_manifest" || c === "not_granted" || c === "consent_required") return "Outlook was turned off for this page. Allow Microsoft 365 in this page's permissions, then try again.";
    if (c === "approval_required") return "Creating the draft wasn't approved. Try again and allow it when asked.";
    if (c === "blocked_by_policy") return "Your organization's settings don't allow this page to use Outlook.";
    if (c === "rate_limited") return "Outlook is busy. Wait a minute, then try again.";
    return "The draft wasn't created" + (err && err.message ? " (" + e(String(err.message).slice(0, 200)) + ")" : "") + ". You can try again or copy the email.";
  }
  function makeDraft() {
    var o = G.out; if (!o || G.sending || G.draft || !G.review || G.review.status !== "approved") return;
    var cc = (G.f.cc || "").trim();
    if (cc && !EMAIL_RE.test(cc)) { G.mailErr = "The CC address doesn't look right."; render(); return; }
    G.sending = true; G.mailErr = ""; render();
    var input = { to: [o.to], subject: o.subject, body: o.html, bodyType: "html" };
    if (cc) input.cc = [cc];
    var cl = window.claude;
    (cl && cl.use ? cl.use("mcp") : Promise.resolve(null)).then(function (mcp) {
      if (!mcp) throw { code: "unavailable_here" };
      return mcp.callTool(MAIL_SERVER, "outlook_create_draft", input);
    }).then(function (res) {
      var p = (res && res.payload) || {}, link = p.webLink || p.weblink || p.web_link || "";
      G.sending = false; G.draft = { link: /^https:\/\//.test(link) ? link : "" };
      log("draft"); clearPersonal(); say("Draft ready in Outlook"); render();
    }, function (err) {
      G.sending = false;
      G.mailErr = err && err.code === "unavailable_here" ? "Outlook can't be reached from this view. Open Zero1Office on claude.ai with Microsoft 365 connected, or copy the email." : mailError(err);
      render();
    });
  }
  function saveFile(i) {
    var f = G.out && G.out.files[i]; if (!f) return;
    var cl = window.claude;
    Promise.all([cl && cl.use ? cl.use("downloads") : Promise.resolve(null), fetch(f.path).then(function (r) { if (!r.ok) throw new Error("missing"); return r.blob(); })])
      .then(function (x) {
        if (!x[0]) { say("Saving files isn't available in this view"); return; }
        return x[0].save({ filename: f.name, data: x[1] }).then(function () { say(f.label + " saved"); }, function (err) { if (err && err.code !== "dismissed" && err.code !== "declined") say("The file wasn't saved"); });
      }, function () { say("That file isn't available right now"); });
  }
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
      h.slice(0, 10).map(function (x) { return '<tr><td>' + e(new Date(x.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + '</td><td>' + e(x.co) + '</td><td>' + e(x.type) + '</td><td>' + e(x.by || "—") + '</td><td>' + (x.status === "draft" ? "Draft in Outlook" : "Sent") + '</td></tr>'; }).join("") +
      '</tbody></table><p class="muted small" style="margin:0">Client names and emails aren\'t kept here; they are in Outlook.</p></div>';
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
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-pg]"); if (!t) return;
    ev.stopPropagation(); ev.preventDefault();
    var a = t.getAttribute("data-pg"), v = t.getAttribute("data-v");
    if (a === "co") { if (G.co !== v) { reset(); G.co = v; } }
    else if (a === "type") { if (G.type !== v) { var keep = { name: G.f.name, email: G.f.email, region: G.f.region, prov: G.f.prov, city: G.f.city }; reset(true); G.type = v; G.f = keep; } }
    else if (a === "addm") G.members.push({ name: "", age: "" });
    else if (a === "delm") G.members.splice(Number(v), 1);
    else if (a === "clear") { reset(true); }
    else if (a === "edit") { G.out = null; G.review = null; G.draft = null; G.mailErr = ""; }
    else if (a === "new") { reset(true); }
    else if (a === "draft") { makeDraft(); return; }
    else if (a === "save") { saveFile(Number(v)); return; }
    else if (a === "pgtab") { G.tab = v; }
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

  /* ---------- hook into the page: Numbers > Proposal generator, right after Proposals ---------- */
  (function () {
    var num = NAV.filter(function (g) { return g[0] === "Numbers"; })[0];
    if (!num) return;
    var at = num[1].length; num[1].forEach(function (it, i) { if (it[0] === "proposals") at = i + 1; });
    num[1].splice(at, 0, ["propgen", "Proposal generator"]);
  })();
  VIEWS.propgen = vPropgen;
  var baseProposals = VIEWS.proposals;
  VIEWS.proposals = function () {
    var h = baseProposals();
    return h.replace('<button class="btn sm" data-go="approvals">Open approvals</button>', '<div class="actions" style="margin:0"><button class="btn sm pri" data-go="propgen">Generate a proposal</button><button class="btn sm" data-go="approvals">Open approvals</button></div>');
  };
  if (S.view === "propgen") render();
})();
