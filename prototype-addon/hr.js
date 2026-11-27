/* zero1office add-on: HR dashboard (Paolo, 2026-11-27: "I need a dashboard for HR. I'll be initially hiring
   1 secretary. Tailor it to the Philippines. Make it easy to understand and navigate.")
   Team > HR, with five steps: Get ready, Hire, Onboard, Pay, Day to day. Checklists are saved in S.data.hr.
   Rates were checked on 2026-11-27 (sources listed on the Rules tab). Joel (HR & People Lead) works the open
   checklist items; Leo keeps working Team > Applicants. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || typeof NAV === "undefined" || window.Z1HR) return;
  if (!S.data.hr || typeof S.data.hr !== "object") S.data.hr = {};
  var H = S.data.hr;
  if (!H.checks) H.checks = {};
  if (!H.salary) H.salary = 22000;
  if (!H.letter) H.letter = "A";
  var tab = "home";

  (function () {
    var g = NAV.filter(function (x) { return x[0] === "Team"; })[0];
    if (!g || g[1].some(function (it) { return it[0] === "hr"; })) return;
    var at = g[1].length; g[1].forEach(function (it, i) { if (it[0] === "agents") at = i + 1; });
    g[1].splice(at, 0, ["hr", "HR"]);
  })();

  /* ---------------- facts (checked 2026-11-27) ---------------- */
  var WAGE = 755; // NCR non-agriculture daily minimum, Wage Order NCR-28, effective 2026-09-26
  var STEPS = [
    { id: "ready", t: "Get ready", s: "Register Ask Karla as an employer", items: [
      ["bir", "BIR: add withholding tax on compensation to your registration", "Use BIR Form 1905 at your RDO if it isn't on your Certificate of Registration (Form 2303) yet."],
      ["sss", "SSS: register as an employer", "SSS Form R-1 at a branch or the My.SSS portal. You get an SSS employer number."],
      ["ph", "PhilHealth: register as an employer", "PhilHealth Form ER1. You get a PhilHealth Employer Number (PEN)."],
      ["hdmf", "Pag-IBIG: register as an employer", "Employer's Data Form (HQP-PFF-002) and Specimen Signature Form (HQP-PFF-003)."],
      ["dole", "DOLE: register the office (Rule 1020)", "Free, on the DOLE Establishment Report System online."],
      ["contract", "Prepare the employment contract", "Probationary, up to 6 months. Write down the standards for becoming regular and give them on day 1."],
      ["privacy", "Prepare a confidentiality and data privacy agreement", "The secretary will see client details, so they sign before day 1 (Data Privacy Act, RA 10173)."],
      ["payday", "Decide payday and how you pay", "Usually the 15th and 30th, by bank transfer. Wages must be paid at least twice a month."],
    ] },
    { id: "hire", t: "Hire", s: "Find and choose the secretary", items: [
      ["jd", "Approve the job description and salary", "See the suggested job post and pay below."],
      ["post", "Post the job", "JobStreet, Indeed, LinkedIn and local Facebook job groups. Leo tracks every applicant in Team > Applicants."],
      ["screen", "Screen applicants", "Short phone call: availability, pay expectation, work setup, start date."],
      ["test", "Interview and give a short practical test", "For example: draft a follow-up email to an insurer and fix a messy schedule."],
      ["ref", "Check 2 references", "Previous supervisor if possible."],
      ["offer", "Send the job offer", "Salary, start date, probation period, work hours and benefits, in writing."],
    ] },
    { id: "onboard", t: "Onboard", s: "Collect documents and report the new hire", items: [
      ["d_tin", "TIN (or BIR Form 1902 if this is their first job)", ""],
      ["d_sss", "SSS number", "If they have none, they register online for one."],
      ["d_ph", "PhilHealth number (PIN)", ""],
      ["d_hdmf", "Pag-IBIG MID number", ""],
      ["d_2316", "BIR Form 2316 from their previous employer this year", "Needed to compute their tax correctly for the year."],
      ["d_nbi", "NBI clearance", ""],
      ["d_id", "Two valid government IDs", ""],
      ["d_psa", "PSA birth certificate", ""],
      ["d_school", "Diploma or transcript", ""],
      ["d_med", "Medical certificate", "Pre-employment check-up."],
      ["d_bank", "Payroll bank account details", ""],
      ["d_emer", "Emergency contact", ""],
      ["d_sign", "Signed contract and confidentiality agreement", ""],
      ["r_sss", "Report to SSS (Form R-1A)", "Within 30 days of the start date."],
      ["r_ph", "Report to PhilHealth (Form ER2)", "Within 30 days of the start date."],
      ["r_hdmf", "Enroll in Pag-IBIG", "Within 30 days of the start date."],
      ["acct", "Set up their accounts", "Microsoft 365 email, GoHighLevel user, this app (assistant sign-in)."],
      ["orient", "First-day orientation", "House rules, data privacy, who they work with, what Karla approves."],
    ] },
    { id: "keep", t: "Day to day", s: "Probation, reviews and records", items: [
      ["rev3", "Month 3 review", "Check against the standards in the contract. Write it down."],
      ["rev5", "Month 5 review: decide on regular status", "Decide before the 6th month ends. After 6 months they become regular by law."],
      ["file", "Keep a 201 file", "Contract, IDs, documents, reviews, leave records. Keep it locked."],
    ] },
  ];
  var LEAVES = [
    ["Service incentive leave", "5 days with pay a year, after 1 year of work. Unused days are converted to cash."],
    ["Maternity leave", "105 days with pay (+15 days for solo mothers). SSS pays the benefit and the employer advances it."],
    ["Paternity leave", "7 days with pay for a married father, for the first 4 children."],
    ["Solo parent leave", "7 working days with pay a year, after 6 months of work."],
    ["VAWC leave", "Up to 10 days with pay for a woman who is a victim of violence."],
    ["Special leave for women", "Up to 2 months with pay after gynecological surgery (Magna Carta of Women)."],
  ];
  var PAYRULES = [
    ["Regular holiday, not worked", "100% of the daily rate"],
    ["Regular holiday, worked", "200%"],
    ["Special non-working day, not worked", "No pay unless your policy gives it"],
    ["Special non-working day, worked", "130%"],
    ["Overtime on a normal day", "+25% an hour"],
    ["Night shift (10 PM to 6 AM)", "+10% an hour"],
    ["13th month pay", "1/12 of the year's basic pay, by December 24"],
    ["Final pay when someone leaves", "Within 30 days. Certificate of employment within 3 days of asking."],
  ];
  var HOLIDAYS = [
    ["2026-11-30", "Bonifacio Day", "Regular"], ["2026-12-08", "Immaculate Conception", "Special"], ["2026-12-24", "Christmas Eve", "Special"],
    ["2026-12-25", "Christmas Day", "Regular"], ["2026-12-30", "Rizal Day", "Regular"], ["2026-12-31", "Last day of the year", "Special"],
    ["2027-01-01", "New Year's Day", "Regular"], ["2027-02-06", "Chinese New Year", "Special"], ["2027-03-25", "Maundy Thursday", "Regular"],
    ["2027-03-26", "Good Friday", "Regular"], ["2027-03-27", "Black Saturday", "Special"], ["2027-04-09", "Araw ng Kagitingan", "Regular"],
    ["2027-05-01", "Labor Day", "Regular"], ["2027-06-12", "Independence Day", "Regular"], ["2027-08-21", "Ninoy Aquino Day", "Special"],
    ["2027-08-30", "National Heroes Day", "Regular"], ["2027-11-01", "All Saints' Day", "Special"], ["2027-11-02", "All Souls' Day", "Special"],
    ["2027-11-30", "Bonifacio Day", "Regular"], ["2027-12-08", "Immaculate Conception", "Special"], ["2027-12-24", "Christmas Eve", "Special"],
    ["2027-12-25", "Christmas Day", "Regular"], ["2027-12-30", "Rizal Day", "Regular"], ["2027-12-31", "Last day of the year", "Special"],
  ];
  var SOURCES = [
    ["NCR minimum wage (Wage Order NCR-28)", "https://nwpc.dole.gov.ph/ncr/"],
    ["SSS, PhilHealth, Pag-IBIG and tax rates 2026", "https://sweldoph.com/payroll-rates-2026"],
    ["Remittance deadlines 2026", "https://sweldoph.com/guides/payroll-remittance-deadlines-2026"],
    ["Employer registration steps", "https://www.respicio.ph/commentaries/how-to-register-as-an-employer-in-the-philippines"],
    ["2027 holidays (Proclamation No. 1427)", "https://newsinfo.inquirer.net/2303491/list-holidays-special-non-working-days-for-2027"],
    ["Secretary pay benchmark (PayScale, Makati)", "https://www.payscale.com/research/PH/Job=Administrative_Assistant/Salary/e1c45c38/Makati-City"],
  ];

  /* ---------------- pay math ---------------- */
  function peso(n) { return "₱" + Math.round(n).toLocaleString("en-PH"); }
  function pay(sal) {
    sal = Math.max(0, +sal || 0);
    var msc = sal < 5250 ? 5000 : sal >= 34750 ? 35000 : Math.round(sal / 500) * 500;
    var sssEE = msc * 0.05, sssER = msc * 0.10 + (msc < 15000 ? 10 : 30);
    var phBase = Math.min(Math.max(sal, 10000), 100000), phEE = phBase * 0.025, phER = phBase * 0.025;
    var fs = Math.min(sal, 10000), hdEE = fs * (sal <= 1500 ? 0.01 : 0.02), hdER = fs * 0.02;
    var taxable = Math.max(0, sal - sssEE - phEE - hdEE) * 12, tax;
    if (taxable <= 250000) tax = 0;
    else if (taxable <= 400000) tax = (taxable - 250000) * 0.15;
    else if (taxable <= 800000) tax = 22500 + (taxable - 400000) * 0.20;
    else if (taxable <= 2000000) tax = 102500 + (taxable - 800000) * 0.25;
    else if (taxable <= 8000000) tax = 402500 + (taxable - 2000000) * 0.30;
    else tax = 2202500 + (taxable - 8000000) * 0.35;
    tax = tax / 12;
    var thirteenth = sal / 12;
    return { sal: sal, sssEE: sssEE, sssER: sssER, phEE: phEE, phER: phER, hdEE: hdEE, hdER: hdER, tax: tax,
      take: sal - sssEE - phEE - hdEE - tax, cost: sal + sssER + phER + hdER + thirteenth, thirteenth: thirteenth };
  }
  function minMonthly() { return WAGE * 261 / 12; } // 5-day work week

  /* ---------------- dates ---------------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function nice(s) { return MON[+s.slice(5, 7) - 1] + " " + (+s.slice(8, 10)) + ", " + s.slice(0, 4); }
  function hdWindow(letter) {
    var c = (letter || "A").toUpperCase();
    return c <= "D" ? [10, 14] : c <= "L" ? [15, 19] : c <= "Q" ? [20, 24] : [25, 31];
  }
  // Next deadlines from today, for pay already made. They start the month after the first payroll.
  function deadlines() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth(), out = [];
    function at(yy, mm, dd) { var last = new Date(yy, mm + 1, 0).getDate(); return new Date(yy, mm, Math.min(dd, last)); }
    for (var k = 0; k < 3; k++) {
      var yy = y + Math.floor((m + k) / 12), mm = (m + k) % 12, prev = MONL[(mm + 11) % 12];
      var w = hdWindow(H.letter);
      out.push({ d: at(yy, mm, mm === 0 ? 15 : 10), t: "BIR 1601-C for " + prev + " (tax withheld)", who: "BIR" });
      out.push({ d: at(yy, mm, 15), t: "PhilHealth for " + prev + " (11th to 15th if your PEN ends 0 to 4, else 16th to 20th)", who: "PhilHealth" });
      out.push({ d: at(yy, mm, w[1]), t: "Pag-IBIG for " + prev + " (your window: " + w[0] + "th to " + (w[1] === 31 ? "end of month" : w[1] + "th") + ")", who: "Pag-IBIG" });
      out.push({ d: at(yy, mm, 31), t: "SSS for " + prev, who: "SSS" });
    }
    out.push({ d: new Date(y, 11, 24), t: "13th month pay", who: "Pay" });
    out.push({ d: new Date(y + 1, 0, 31), t: "Give the employee BIR Form 2316 and file BIR 1604-C", who: "BIR" });
    out.push({ d: new Date(y + 1, 1, 28), t: "Submit 2316 copies to BIR", who: "BIR" });
    var t0 = new Date(ymd(now) + "T00:00:00");
    return out.filter(function (x) { return x.d >= t0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 8);
  }

  /* ---------------- progress ---------------- */
  function stepDone(st) { return st.items.filter(function (it) { return H.checks[it[0]]; }).length; }
  function nextItems() {
    var out = [];
    STEPS.forEach(function (st) { st.items.forEach(function (it) { if (!H.checks[it[0]]) out.push({ step: st, it: it }); }); });
    return out;
  }
  window.Z1HR = { next: nextItems, steps: STEPS };

  /* ---------------- views ---------------- */
  function tabs() {
    var T = [["home", "Overview"], ["ready", "1. Get ready"], ["hire", "2. Hire"], ["onboard", "3. Onboard"], ["pay", "4. Pay"], ["keep", "5. Day to day"], ["rules", "Rules & holidays"]];
    return '<div class="chips" role="tablist" style="margin-bottom:14px;flex-wrap:wrap">' + T.map(function (t) {
      return '<button class="chip' + (tab === t[0] ? " on" : "") + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-hrtab="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + "</div>";
  }
  function bar(done, all) {
    var p = all ? Math.round(done / all * 100) : 0;
    return '<div style="height:8px;border-radius:6px;background:var(--line,#e5e7eb);overflow:hidden;margin:8px 0 4px"><i style="display:block;height:100%;width:' + p + '%;background:var(--ok,#0E8A60)"></i></div><span class="muted small">' + done + " of " + all + " done</span>";
  }
  function checklist(st) {
    return '<div class="card pad stack">' + st.items.map(function (it) {
      var on = !!H.checks[it[0]];
      return '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-hrchk="' + it[0] + '"' + (on ? " checked" : "") + ' style="margin-top:3px">' +
        '<span><b' + (on ? ' style="text-decoration:line-through;opacity:.6"' : "") + ">" + esc(it[1]) + "</b>" + (it[2] ? '<br><span class="muted small">' + esc(it[2]) + "</span>" : "") + "</span></label>";
    }).join("") + "</div>";
  }
  function home() {
    var nx = nextItems(), p = pay(H.salary), dl = deadlines().slice(0, 4);
    var cards = STEPS.map(function (st, i) {
      return '<button class="card pad" data-hrtab="' + st.id + '" style="text-align:left;cursor:pointer"><span class="muted small">Step ' + (i < 3 ? i + 1 : i + 2) + "</span><h3 style=\"margin:2px 0\">" + esc(st.t) + '</h3><span class="small">' + esc(st.s) + "</span>" + bar(stepDone(st), st.items.length) + "</button>";
    });
    cards.splice(3, 0, '<button class="card pad" data-hrtab="pay" style="text-align:left;cursor:pointer"><span class="muted small">Step 4</span><h3 style="margin:2px 0">Pay</h3><span class="small">Salary, deductions and what it costs you</span>' +
      '<div style="margin-top:8px"><b>' + peso(p.take) + '</b> <span class="muted small">take-home a month</span><br><b>' + peso(p.cost) + '</b> <span class="muted small">your cost a month</span></div></button>');
    return '<div class="card pad" style="margin-bottom:14px;border-color:var(--gold,#D3A13B)"><b>Do this next</b>' +
      (nx.length ? '<p style="margin:6px 0 0">' + esc(nx[0].it[1]) + ' <span class="muted small">(' + esc(nx[0].step.t) + ")</span></p>" + (nx[0].it[2] ? '<p class="muted small" style="margin:2px 0 0">' + esc(nx[0].it[2]) + "</p>" : "") +
        '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm pri" data-hrdone="' + nx[0].it[0] + '">Mark done</button><button class="btn sm" data-hrtab="' + nx[0].step.id + '">Open ' + esc(nx[0].step.t) + "</button></div>"
        : '<p style="margin:6px 0 0">Everything on the list is done.</p>') + "</div>" +
      '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));margin-bottom:14px">' + cards.join("") + "</div>" +
      '<div class="grid2"><div class="card pad"><h3 style="margin:0 0 8px">Coming up</h3>' + dl.map(function (x) {
        return '<div class="row"><span><b class="small">' + esc(x.t) + '</b></span><span class="muted small" style="white-space:nowrap">' + esc(nice(ymd(x.d))) + "</span></div>";
      }).join("") + '<p class="muted small" style="margin:8px 0 0">Monthly remittances start the month after the first payroll.</p></div>' +
      '<div class="card pad"><h3 style="margin:0 0 8px">Next holidays</h3>' + HOLIDAYS.filter(function (h) { return h[0] >= ymd(new Date()); }).slice(0, 4).map(function (h) {
        return '<div class="row"><span class="small"><b>' + esc(h[1]) + '</b> <span class="muted">· ' + esc(h[2]) + '</span></span><span class="muted small">' + esc(nice(h[0])) + "</span></div>";
      }).join("") + '<button class="btn sm" data-hrtab="rules" style="margin-top:8px">All holidays and leave rules</button></div></div>';
  }
  function hireTab(st) {
    var apps = window.Z1Lists && window.Z1Lists.applicants ? window.Z1Lists.applicants.rows() : [];
    var open = apps.filter(function (a) { return a.st !== "Hired" && a.st !== "Not a fit"; });
    return checklist(st) +
      '<div class="grid2" style="margin-top:14px"><div class="card pad stack"><h3 style="margin:0">Suggested pay</h3>' +
      '<p class="small" style="margin:0">Metro Manila minimum is <b>' + peso(WAGE) + ' a day</b>, about <b>' + peso(minMonthly()) + ' a month</b> for a 5-day week. Administrative assistants in Makati average about <b>₱21,000 a month</b>.</p>' +
      '<p class="small" style="margin:0">A fair offer for an experienced secretary is <b>₱20,000 to ₱25,000 a month</b>, plus the 13th month pay. Try different amounts in step 4.</p></div>' +
      '<div class="card pad stack"><h3 style="margin:0">Applicants</h3><p class="small" style="margin:0">' + (apps.length ? open.length + " open, " + apps.length + " in total." : "No applicants yet.") + " " + esc(typeof nn === "function" ? nn("leo") : "Leo") + ' screens and follows up each one.</p><button class="btn sm" data-go="applicants">Open Applicants</button></div></div>' +
      '<div class="card pad stack" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Job post</h3><button class="btn sm" data-hrcopy="1">Copy job post</button></div>' +
      '<pre id="hrJobPost" class="small" style="white-space:pre-wrap;margin:0;font-family:inherit">' + esc(jobPost()) + "</pre></div>";
  }
  function jobPost() {
    return "Secretary / Administrative Assistant (full-time, on-site)\nAsk Karla, licensed health and life insurance agency\n\n" +
      "What you'll do\n- Manage Karla's calendar, calls and emails\n- Prepare and follow up client requirements with insurers (Maxicare, Medicard, Intellicare and others)\n" +
      "- Track statements, payments and receipts\n- Keep client files organized and confidential\n- Greet clients and handle walk-ins\n\n" +
      "What we're looking for\n- At least 1 year as a secretary or admin assistant (insurance or HMO is a plus)\n- Clear written and spoken English and Filipino\n" +
      "- Good with Microsoft 365 (Outlook, Word, Excel)\n- Organized, discreet and reliable\n\n" +
      "What we offer\n- ₱20,000 to ₱25,000 a month, depending on experience\n- 13th month pay, SSS, PhilHealth and Pag-IBIG\n- Monday to Friday, 8 AM to 5 PM\n\n" +
      "To apply, send your CV to karla@ask-karla.com with the subject \"Secretary\".";
  }
  function payTab() {
    var p = pay(H.salary);
    var row = function (a, b, c) { return "<tr><td>" + a + '</td><td class="r num">' + b + '</td><td class="r num">' + c + "</td></tr>"; };
    return '<div class="card pad stack" style="margin-bottom:14px"><label class="fld" for="hrSal" style="max-width:280px">Monthly salary<input class="inp" id="hrSal" type="number" min="0" step="500" value="' + esc(String(H.salary)) + '"></label>' +
      (H.salary < minMonthly() ? '<p class="small" role="alert" style="color:var(--bad,#c0392b);margin:0">This is below the Metro Manila minimum of about ' + peso(minMonthly()) + " a month.</p>" : "") +
      '<div class="tiles"><div class="tile"><span class="k">Take-home pay</span><span class="v">' + peso(p.take) + '</span><span class="h">a month</span></div>' +
      '<div class="tile"><span class="k">Your total cost</span><span class="v">' + peso(p.cost) + '</span><span class="h">a month, with 13th month</span></div>' +
      '<div class="tile"><span class="k">Each payday</span><span class="v">' + peso(p.take / 2) + '</span><span class="h">15th and 30th</span></div></div></div>' +
      '<div class="card pad"><div class="tblwrap"><table class="t"><tr><th>Each month</th><th class="r">Taken from salary</th><th class="r">You also pay</th></tr>' +
      row("SSS (incl. EC)", peso(p.sssEE), peso(p.sssER)) + row("PhilHealth", peso(p.phEE), peso(p.phER)) + row("Pag-IBIG", peso(p.hdEE), peso(p.hdER)) +
      row("Income tax withheld", peso(p.tax), "—") + row("13th month pay (set aside)", "—", peso(p.thirteenth)) + "</table></div>" +
      '<p class="muted small" style="margin:8px 0 0">Rates for 2026: SSS 15% of the salary credit (5% employee, 10% employer, max credit ₱35,000), PhilHealth 5% split in half, Pag-IBIG 2% each on up to ₱10,000. ' +
      "Income tax is zero up to ₱250,000 of taxable pay a year. Check with your accountant before the first payroll.</p></div>";
  }
  function rulesTab() {
    return '<div class="grid2"><div class="card pad"><h3 style="margin:0 0 8px">Leave by law</h3>' + LEAVES.map(function (l) { return '<div class="row" style="align-items:flex-start"><span class="small"><b>' + esc(l[0]) + '</b><br><span class="muted">' + esc(l[1]) + "</span></span></div>"; }).join("") + "</div>" +
      '<div class="card pad"><h3 style="margin:0 0 8px">Pay rules</h3><div class="tblwrap"><table class="t">' + PAYRULES.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join("") + "</table></div></div></div>" +
      '<div class="card pad" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Deadlines</h3>' +
      '<label class="small">Your registered business name starts with <select class="inp" id="hrLetter" style="width:auto;display:inline-block">' + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(function (c) { return "<option" + (H.letter === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label></div>" +
      '<p class="muted small">This sets your Pag-IBIG payment window.</p>' + deadlines().map(function (x) { return '<div class="row"><span class="small"><b>' + esc(x.t) + '</b></span><span class="muted small" style="white-space:nowrap">' + esc(nice(ymd(x.d))) + "</span></div>"; }).join("") + "</div>" +
      '<div class="card pad" style="margin-top:14px"><h3 style="margin:0 0 8px">Holidays</h3><div class="tblwrap"><table class="t"><tr><th>Date</th><th>Holiday</th><th>Type</th></tr>' +
      HOLIDAYS.filter(function (h) { return h[0] >= ymd(new Date()); }).map(function (h) { return "<tr><td class=\"num\">" + esc(nice(h[0])) + "</td><td>" + esc(h[1]) + "</td><td>" + esc(h[2]) + "</td></tr>"; }).join("") + "</table></div>" +
      '<p class="muted small" style="margin:8px 0 0">Eid holidays are announced separately each year.</p></div>' +
      '<div class="card pad" style="margin-top:14px"><h3 style="margin:0 0 8px">Sources (checked Nov 27, 2026)</h3>' + SOURCES.map(function (s) { return '<div class="small"><a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a></div>"; }).join("") +
      '<p class="muted small" style="margin:8px 0 0">A second NCR wage order (NCR-27, ₱780 from Jan 20, 2027) is stopped by a court case. Watch for news before January.</p></div>';
  }

  VIEWS.hr = function () {
    var st = STEPS.filter(function (s) { return s.id === tab; })[0];
    var body = tab === "home" ? home() : tab === "pay" ? payTab() : tab === "rules" ? rulesTab() : tab === "hire" ? hireTab(st) : checklist(st);
    var intro = tab === "home" ? "Everything to hire your first secretary in the Philippines, one step at a time." : st ? st.s + "." : tab === "pay" ? "What the secretary takes home and what it costs you each month." : "Leave, pay rules, deadlines and holidays.";
    return '<div class="ph"><div><h2>HR</h2><p>' + esc(intro) + ' ' + esc(typeof nn === "function" ? nn("joel") : "Joel") + ' keeps this list moving.</p></div><button class="btn sm" data-go="office">Back to the office</button></div>' + tabs() + body;
  };

  document.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest && ev.target.closest("[data-hrtab],[data-hrdone],[data-hrcopy]"); if (!t || S.view !== "hr") return;
    ev.preventDefault();
    if (t.hasAttribute("data-hrtab")) { tab = t.getAttribute("data-hrtab"); render(); window.scrollTo(0, 0); }
    else if (t.hasAttribute("data-hrdone")) { H.checks[t.getAttribute("data-hrdone")] = Date.now(); save(); render(); toast("Marked done."); }
    else if (t.hasAttribute("data-hrcopy")) {
      var txt = jobPost();
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Job post copied."); }, function () {
        var el = document.getElementById("hrJobPost"); if (el) { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
        toast("Select the text and copy it.");
      });
    }
  });
  document.addEventListener("change", function (ev) {
    var c = ev.target; if (!c || S.view !== "hr") return;
    if (c.hasAttribute && c.hasAttribute("data-hrchk")) { var k = c.getAttribute("data-hrchk"); if (c.checked) H.checks[k] = Date.now(); else delete H.checks[k]; save(); render(); }
    else if (c.id === "hrSal") { H.salary = Math.max(0, Math.round(+c.value || 0)); save(); render(); var f = document.getElementById("hrSal"); if (f) f.focus(); }
    else if (c.id === "hrLetter") { H.letter = c.value; save(); render(); }
  });
  if (S.view === "hr") render();
})();
