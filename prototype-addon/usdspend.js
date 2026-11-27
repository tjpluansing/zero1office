/* zero1office add-on: US dollar amounts on Subscriptions & expenses (Paolo, 2026-11-26: "Under subscriptions & expenses,
   add amount in US dollars then auto convert to amount in Peso").
   The add/edit form gets "Amount (US$)" and "Rate (₱ per US$1)". Typing dollars fills the peso amount (dollars × rate).
   The rate is remembered (S.data.settings.usdRate) and "Today's rate" tries a free public rate service; if that is
   blocked, the saved rate stays and can be typed in. Peso stays the amount every total uses; the dollars and the rate
   used are saved on the record and shown under the peso amount in the tables. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || !VIEWS.spend || window.__z1Usd) return;
  window.__z1Usd = true;
  var DEFAULT_RATE = 58;
  function g(id) { return document.getElementById(id); }
  function num(v) { return parseFloat(String(v == null ? "" : v).replace(/[₱$,\s]/g, "")); }
  function getRate() { var s = S.data.settings || {}; return num(s.usdRate) > 0 ? num(s.usdRate) : DEFAULT_RATE; }
  function setRate(r) { if (!(r > 0)) return; S.data.settings = S.data.settings || {}; S.data.settings.usdRate = r; }
  function fmtUsd(n) { return "US$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function r2(n) { return Math.round(n * 100) / 100; }

  var oldForm = g("spForm"), amtInp = g("sp-amt");
  if (!oldForm || !amtInp) return;
  var amtRow = amtInp.closest(".two");
  var row = document.createElement("div");
  row.className = "two";
  row.innerHTML =
    '<label class="fld" for="sp-usd">Amount (US$)<input class="inp" id="sp-usd" inputmode="decimal" placeholder="e.g. 20"></label>' +
    '<label class="fld" for="sp-rate">Rate (₱ per US$1)<span style="display:flex;gap:6px"><input class="inp" id="sp-rate" inputmode="decimal" style="flex:1"><button type="button" class="btn sm" id="sp-ratebtn" title="Fetch today\'s US dollar to peso rate">Today\'s rate</button></span><span class="muted" id="sp-ratenote" style="font-weight:500;font-size:11px"></span></label>';
  amtRow.parentNode.insertBefore(row, amtRow);

  var form = oldForm.cloneNode(true);
  oldForm.parentNode.replaceChild(form, oldForm);

  function convert() {
    var usd = num(g("sp-usd").value), rate = num(g("sp-rate").value);
    if (usd > 0 && rate > 0) g("sp-amt").value = r2(usd * rate).toFixed(2);
  }
  form.addEventListener("input", function (ev) {
    if (ev.target.id === "sp-usd" || ev.target.id === "sp-rate") { convert(); g("sp-ratenote").textContent = ""; }
    if (ev.target.id === "sp-amt" && num(g("sp-usd").value) > 0) {
      // Peso typed by hand: keep it, and note it no longer matches the dollars.
      g("sp-ratenote").textContent = "Peso amount edited by hand; dollars kept for reference.";
    }
  });
  form.querySelector("#sp-ratebtn").addEventListener("click", function () {
    var note = g("sp-ratenote"), btn = this;
    btn.disabled = true; note.textContent = "Getting today's rate…";
    fetch("https://open.er-api.com/v6/latest/USD").then(function (r) { return r.json(); }).then(function (j) {
      var r = j && j.rates && num(j.rates.PHP);
      if (!(r > 0)) throw new Error("no rate");
      g("sp-rate").value = r2(r).toFixed(2); convert();
      note.textContent = "Today's rate: ₱" + r2(r).toFixed(2) + " per US$1. Your card's rate may differ a little.";
    }).catch(function () {
      note.textContent = "Couldn't reach the rate service from here. Type the rate from your card or bank.";
    }).then(function () { btn.disabled = false; });
  });

  var origOpen = openSp;
  openSp = function (kind, id) {
    origOpen(kind, id);
    var arr = kind === "subs" ? S.data.subs : S.data.expenses, x = id ? arr.filter(function (r) { return r.id === id; })[0] : null;
    g("sp-usd").value = x && x.usd ? x.usd : "";
    g("sp-rate").value = (x && x.usdRate ? x.usdRate : getRate()).toFixed(2);
    g("sp-ratenote").textContent = "";
  };

  form.addEventListener("submit", function (ev) {
    var k = S.spEdit, usd = num(g("sp-usd").value), rate = num(g("sp-rate").value);
    if (!k) { ev.preventDefault(); return; }
    if (usd > 0 && !(rate > 0)) { ev.preventDefault(); g("e-sp").textContent = "Enter the rate (₱ per US$1)."; return; }
    if (usd > 0 && !(num(g("sp-amt").value) > 0)) convert();
    var isS = k.kind === "subs", arr = isS ? S.data.subs : S.data.expenses, before = arr.length, editId = k.id;
    submitSp(ev);
    if (!g("spScrim").hidden) return; // validation failed, form still open
    var rec = editId ? arr.filter(function (r) { return r.id === editId; })[0] : (arr.length > before ? arr[arr.length - 1] : null);
    if (!rec) return;
    if (usd > 0) { rec.usd = r2(usd); rec.usdRate = rate; setRate(rate); } else { delete rec.usd; delete rec.usdRate; }
    save(); render();
  });

  var origView = VIEWS.spend;
  VIEWS.spend = function () {
    var h = origView.apply(this, arguments);
    var recs = (S.data.subs || []).map(function (r) { return ["subs", r]; }).concat((S.data.expenses || []).map(function (r) { return ["exp", r]; }));
    recs.forEach(function (p) {
      var r = p[1]; if (!(r.usd > 0)) return;
      var key = 'data-act="spedit" data-v="' + p[0] + '" data-id="' + r.id + '"', at = h.indexOf(key);
      if (at < 0) return;
      var start = h.lastIndexOf("<tr", at), cell = h.indexOf('<td class="r num">', start);
      if (cell < 0 || cell > at) return;
      var end = h.indexOf("</td>", cell);
      var tag = '<div class="muted small">' + fmtUsd(r.usd) + (r.usdRate ? " @ ₱" + Number(r.usdRate).toFixed(2) : "") + '</div>';
      h = h.slice(0, end) + tag + h.slice(end);
    });
    return h;
  };

  if (S.view === "spend") render();
})();
