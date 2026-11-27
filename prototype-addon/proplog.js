/* zero1office add-on: proplog.js — Numbers > Proposals shows what the Proposal generator made.
   Paolo, 2026-11-27: "Under numbers, then proposals, that dashboard is not updating. Up to now, it's open proposals are 0."
   The dashboard only read the built-in PROPOSALS list, which is empty in LIVE, and the generator never wrote to it.
   Now each proposal that passes the check is logged in the shared db doc "meta/proposals" {list:[...]}, its stage follows
   the approval (Waiting for you -> Drafting -> Sent; declined ones are dropped), and the dashboard shows the list.
   Kept per row: client or company name, type, company, plan, lives, yearly premium, stage, owner, date. No emails,
   ages or phone numbers. Works on claude.ai (db capability) and on app.ask-karla.com (app_docs). */
(function () {
  if (typeof PROPOSALS === "undefined" || typeof S === "undefined") return;
  var L = { db: null, list: [], base: PROPOSALS.slice(), ready: false };
  var DOC = "meta/proposals";

  function prodOf(co) { var p = (typeof PROVIDERS !== "undefined" ? PROVIDERS : []).filter(function (x) { return x[0] === co; })[0]; return p ? p[1] : "HMO"; }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
  function dayStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function toRow(r) {
    var at = r.at ? new Date(r.at) : new Date(), days = Math.round((dayStart(at) - dayStart(new Date())) / 864e5);
    var own = r.own || (r.stage === "Comparing" ? "quinn" : prodOf(r.co) === "HMO" ? "maya" : "jade");
    return { n: r.n || "Proposal", type: r.type || "Individual", co: r.co || "", co0: r.co || "", prod: r.prod || prodOf(r.co), plan: r.plan || "",
      m: num(r.m) || 1, prem: num(r.prem), stage: r.stage || "Waiting for you", days: days, due: at, own: own, logId: r.id };
  }
  function apply() {
    PROPOSALS.length = 0;
    L.base.forEach(function (x) { PROPOSALS.push(x); });
    L.list.forEach(function (r) { PROPOSALS.push(toRow(r)); });
    if (S.view === "proposals" || S.view === "home") { try { render(); } catch (e) { /* redraw only */ } }
  }
  function read(d) { var x = d && d.exists ? (typeof d.data === "function" ? d.data() : d.data) : null; return x && Array.isArray(x.list) ? x.list.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; }) : []; }

  // read, change, write back; the change function gets a fresh copy of the list
  var chain = Promise.resolve();
  function edit(fn) {
    chain = chain.then(function () {
      if (!L.db) { fn(L.list); apply(); return; }
      var ref = L.db.doc(DOC);
      return ref.get().then(function (d) {
        var list = read(d); fn(list); list = list.slice(0, 500);
        L.list = list; apply();
        return ref.set({ list: list, at: new Date().toISOString() });
      });
    }).catch(function (err) { try { console.warn("proposals log", err); } catch (e) { /* quiet */ } });
    return chain;
  }

  function premOf(o) {
    try {
      if (o.fam && o.total) return Math.min.apply(null, o.total[0].map(num).filter(Boolean)) || 0;
      if (o.calc && o.calc[0]) return Math.min.apply(null, o.calc[0].fees[0].map(num).filter(Boolean)) || 0;
    } catch (e) { /* no rates */ }
    return 0;
  }
  function planOf(o) {
    var c = o.c || {};
    return o.kind === "mxs" && c.opt ? (c.opt.n || c.opt.name || c.opt.label || c.opt.id || "SME") :
      o.kind === "mxi" || o.kind === "mxf" ? "MyMaxicare" : o.kind === "mxc" ? "Corporate" : o.kind === "mxp" ? "Prepaid Health Cards" :
      o.kind === "mxv" ? "MPlus or Corporate" : (o.subject || "");
  }
  function key(r) { return [r.n, r.co, r.type, r.plan].join("|").toLowerCase(); }

  window.Z1PropLog = {
    // called by propgen.js when a proposal passes the check and waits for approval
    add: function (o, ap) {
      var c = o.c || {}, r = { id: ap.id, at: new Date().toISOString(), n: c.org || c.name || "Proposal", type: o.type, co: o.co, prod: prodOf(o.co),
        plan: planOf(o), m: (c.people && c.people.length) || num(c.heads) || 1, prem: premOf(o), stage: "Waiting for you", own: ap.who || "",
        by: (S.me && (S.me.n || S.me.name)) || "" };
      return edit(function (list) {
        for (var i = list.length - 1; i >= 0; i--) if (key(list[i]) === key(r) && list[i].stage !== "Sent" && list[i].stage !== "Won" && list[i].stage !== "Lost") list.splice(i, 1);
        list.unshift(r);
      });
    },
    stage: function (id, stage) {
      return edit(function (list) {
        for (var i = list.length - 1; i >= 0; i--) if (list[i].id === id) { if (stage) list[i].stage = stage; else list.splice(i, 1); }
      });
    },
    rows: function () { return L.list.slice(); },
  };

  // follow approvals made on the Approvals page (approve, ask for changes, decline)
  var MAP = { waiting: "Waiting for you", changes: "Drafting", approved: "Drafting", sent: "Sent" }, RANK = { "Waiting for you": 1, "Drafting": 2, "Sent": 3 };
  setInterval(function () {
    var aps = (S.data && S.data.approvals) || []; if (!aps.length || !L.list.length) return;
    L.list.forEach(function (r) {
      var ap = aps.filter(function (x) { return x.id === r.id; })[0]; if (!ap) return;
      var want = ap.state === "declined" ? null : MAP[ap.state];
      if (want === undefined || want === r.stage || r.stage === "Won" || r.stage === "Lost") return;
      if (want && (RANK[want] || 0) < (RANK[r.stage] || 0) && ap.state !== "changes") return; // only move forward
      window.Z1PropLog.stage(r.id, want);
    });
  }, 2000);

  (function connect() {
    var cl = window.claude; if (!cl || !cl.use) { L.ready = true; return; }
    cl.use("db").then(function (db) {
      L.db = db; if (!db) return;
      try { db.doc(DOC).onSnapshot(function (d) { L.list = read(d); L.ready = true; apply(); }, function () { L.ready = true; }); }
      catch (e) { db.doc(DOC).get().then(function (d) { L.list = read(d); apply(); }, function () { /* empty stays */ }); }
    }, function () { L.ready = true; });
  })();
})();
