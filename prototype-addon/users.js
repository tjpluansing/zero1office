/* zero1office add-on: sign-in accounts, profiles, user management and company profile
   (Paolo, 2026-11-27: "Add login. Add profiles. Add User management. Make Paolo and Karla Super Admin.
   Customize pages to be assigned to the user by the Super Admin." then "I want the user management to appear
   under SETTINGS once logged in with a Super Admin Account ... Add change profile picture. Add a separate
   Company Profile so the admin can change the name of the company, address, logo etc.")
   - Accounts live in the shared db collection "z1users" (one doc per @ask-karla.com email). Passwords are kept
     only as salted PBKDF2 hashes. Super Admins add people, set their role and tick the pages they may open.
   - Settings > My profile (everyone): photo, name, job title, mobile, password, the pages they can open.
   - Settings > Users and Settings > Company profile: Super Admins only.
   - The company name and logo (db doc "meta/company") show in the menu and on the sign-in screen.
   The real lock on who can open the app at all is the claude.ai share list; this decides what each person sees. */
(function () {
  if (typeof VIEWS !== "object" || !VIEWS || typeof NAV === "undefined" || !window.Z1Auth || window.Z1Users) return;

  var ITER = 150000, SA = "Super Admin", STAFF = "Staff";
  var ALWAYS = ["profile"], ADMIN_ONLY = ["users", "company"];
  var U = { db: null, assets: null, list: [], loaded: false, company: {}, err: "", fails: 0, waitUntil: 0, edit: null, temp: null, busy: false, ptab: "me" };

  /* ---------- helpers ---------- */
  function keyOf(email) { return String(email).toLowerCase().replace(/[^a-z0-9]/g, "_"); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function unhex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function randHex(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
  function hashPw(pw, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: iter || ITER }, k, 256);
    }).then(hex);
  }
  function makePw(pw) { var salt = randHex(16); return hashPw(pw, salt, ITER).then(function (h) { return { salt: salt, hash: h, iter: ITER }; }); }
  function tempPw() {
    var abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", a = new Uint32Array(12); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return abc[x % abc.length]; }).join("").replace(/(.{4})(?=.)/g, "$1-");
  }
  function pwProblem(pw) { return !pw || pw.length < 10 ? "Use at least 10 characters." : null; }
  function emailOk(em) { return /^[^@\s]+@ask-karla\.com$/.test(em); }
  function today() { return new Date().toISOString(); }
  function blob(id) { return id ? "/_blob/" + encodeURIComponent(id) : ""; }
  function initials(n) { return String(n || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (s) { return s[0].toUpperCase(); }).join(""); }
  function avatar(u, size) {
    size = size || 34;
    var st = "width:" + size + "px;height:" + size + "px;border-radius:50%;flex:none;";
    return u && u.photo ? '<img src="' + esc(blob(u.photo)) + '" alt="" style="' + st + 'object-fit:cover;background:var(--sunken)">'
      : '<span aria-hidden="true" style="' + st + 'display:grid;place-items:center;background:var(--gold,#d6a542);color:#0b2545;font-weight:700;font-size:' + Math.round(size * 0.38) + 'px">' + esc(initials(u && (u.name || u.email))) + "</span>";
  }
  function byEmail(em) { em = String(em || "").toLowerCase(); return U.list.filter(function (u) { return u.email === em; })[0] || null; }
  function supers() { return U.list.filter(function (u) { return u.role === SA && u.status !== "suspended"; }); }
  function meRec() { var m = window.Z1Auth.me(); return m ? byEmail(m.email) : null; }
  function isSA() { var r = meRec(); return !!r && r.role === SA; }
  function nice(iso) { if (!iso) return "never"; var d = new Date(iso); return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) + ", " + d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }); }

  /* The shape addon.js expects for `me`. Super Admins get every billing action; others who have Billing & SOA can view and edit. */
  function toMe(r) {
    var perms = r.role === SA ? ["billing.view", "billing.create", "billing.edit", "billing.delete", "billing.export", "billing.approve"]
      : (r.pages || []).indexOf("billing") > -1 ? ["billing.view", "billing.create", "billing.edit"] : [];
    return { email: r.email, name: r.name || r.email.split("@")[0], role: r.role, perms: perms };
  }

  /* ---------- pages ---------- */
  function catalog() {
    var out = [];
    NAV.forEach(function (g) { g[1].forEach(function (it) { if (ALWAYS.indexOf(it[0]) < 0 && ADMIN_ONLY.indexOf(it[0]) < 0) out.push({ group: g[0], key: it[0], label: it[1] }); }); });
    return out;
  }
  function defaultPages() { var t = NAV.filter(function (g) { return g[0] === "Today"; })[0]; return t ? t[1].map(function (it) { return it[0]; }) : []; }
  function allowed(v) {
    var r = meRec(); if (!r) return true;
    if (r.mustChange) return v === "profile";
    if (ALWAYS.indexOf(v) > -1) return true;
    if (r.role === SA) return true;
    if (ADMIN_ONLY.indexOf(v) > -1) return false;
    var pages = r.pages || [];
    if (pages.indexOf(v) > -1) return true;
    // views that are not in the menu (drawers, sub-pages) follow their menu page
    return !catalog().some(function (c) { return c.key === v; });
  }
  function firstAllowed() {
    var r = meRec(); if (!r || r.mustChange) return "profile";
    var c = catalog().filter(function (x) { return allowed(x.key); })[0];
    return c ? c.key : "profile";
  }

  /* ---------- menu: Settings > My profile, Users, Company profile ---------- */
  (function () {
    var g = NAV.filter(function (x) { return x[0] === "Settings" || x[0] === "Setup"; })[0];
    if (!g) { g = ["Settings", []]; NAV.push(g); }
    [["company", "Company profile"], ["users", "Users"], ["profile", "My profile"]].forEach(function (it) {
      if (!g[1].some(function (x) { return x[0] === it[0]; })) g[1].unshift(it);
    });
  })();

  var baseNav = renderNav;
  renderNav = function () {
    baseNav.apply(this, arguments);
    if (!window.Z1Auth.me() || !U.loaded) return;
    var nav = document.getElementById("nav"); if (!nav) return;
    nav.querySelectorAll("[data-go]").forEach(function (b) { if (!allowed(b.getAttribute("data-go"))) b.remove(); });
    Array.prototype.slice.call(nav.querySelectorAll(".grp")).forEach(function (h) {
      var n = h.nextElementSibling; if (!n || n.classList.contains("grp")) h.remove();
    });
  };
  var baseRender = render;
  render = function () {
    if (window.Z1Auth.me() && U.loaded && !allowed(S.view)) S.view = firstAllowed();
    return baseRender.apply(this, arguments);
  };

  /* ---------- sign-in ---------- */
  function signIn(em, pw) {
    if (!U.db) return Promise.reject(new Error(U.err || "Sign-in works when Zero1Office is opened on claude.ai."));
    if (!U.loaded) return Promise.reject(new Error("Still loading the team list. Try again in a moment."));
    if (Date.now() < U.waitUntil) return Promise.reject(new Error("Too many tries. Wait 30 seconds and try again."));
    var r = byEmail(em);
    var fail = function () { if (++U.fails >= 5) { U.fails = 0; U.waitUntil = Date.now() + 30000; } return null; };
    if (!r || !r.pw || !r.pw.hash) return Promise.resolve(fail());
    if (r.status === "suspended") return Promise.reject(new Error("This account is paused. Ask Paolo or Karla."));
    return hashPw(pw, r.pw.salt, r.pw.iter).then(function (h) {
      if (h !== r.pw.hash) return fail();
      U.fails = 0;
      U.db.doc("z1users/" + keyOf(r.email)).update({ lastLogin: today() }).catch(function () { /* view-only access */ });
      if (r.mustChange) S.view = "profile";
      return toMe(r);
    });
  }

  /* ---------- first-time setup (no accounts yet) ---------- */
  function setupHtml() {
    return '<div><h2>Set up sign-in</h2><p class="muted small">No accounts yet. Create the two Super Admins. Karla changes her temporary password the first time she signs in.</p></div>' +
      '<form id="z1Setup" class="stack" novalidate>' +
      '<label class="fld" for="z1sN1">Your name<input class="inp" id="z1sN1" value="Paolo" maxlength="80"></label>' +
      '<label class="fld" for="z1sE1">Your email<input class="inp" id="z1sE1" type="email" value="paolo@ask-karla.com"></label>' +
      '<label class="fld" for="z1sP1">Your password (10+ characters)<input class="inp" id="z1sP1" type="password" autocomplete="new-password"></label>' +
      '<label class="fld" for="z1sN2">Second Super Admin<input class="inp" id="z1sN2" value="Karla" maxlength="80"></label>' +
      '<label class="fld" for="z1sE2">Their email<input class="inp" id="z1sE2" type="email" value="karla@ask-karla.com"></label>' +
      '<p class="small" style="margin:0">Karla\'s temporary password: <b class="num" id="z1sT">' + esc(U.setupTemp || (U.setupTemp = tempPw())) + '</b> (give it to her privately)</p>' +
      '<span class="err" id="z1sErr" role="alert"></span>' +
      '<button class="btn pri" type="submit" style="justify-content:center;padding:10px">Create accounts</button></form>';
  }
  function showGateState() {
    var card = document.querySelector(".z1-login .card"); if (!card || window.Z1Auth.me()) return;
    var form = document.getElementById("z1LoginForm"), setup = document.getElementById("z1SetupWrap");
    var needSetup = U.loaded && U.db && !U.list.length;
    if (needSetup && !setup) {
      setup = document.createElement("div"); setup.id = "z1SetupWrap"; setup.className = "stack"; setup.innerHTML = setupHtml();
      card.appendChild(setup);
    }
    if (setup) setup.hidden = !needSetup;
    if (form) { form.hidden = needSetup; if (form.previousElementSibling) form.previousElementSibling.hidden = needSetup; }
    var hint = document.getElementById("z1LoginHint");
    if (hint) hint.textContent = !U.db && U.err ? U.err : needSetup ? "" : "Forgot your password or need an account? Ask Paolo or Karla.";
    brand();
  }
  document.addEventListener("submit", function (ev) {
    if (!ev.target || ev.target.id !== "z1Setup") return;
    ev.preventDefault();
    var v = function (id) { return document.getElementById(id).value.trim(); }, err = document.getElementById("z1sErr");
    var e1 = v("z1sE1").toLowerCase(), e2 = v("z1sE2").toLowerCase(), p1 = document.getElementById("z1sP1").value;
    if (!emailOk(e1) || !emailOk(e2)) { err.textContent = "Both emails must end in @ask-karla.com."; return; }
    if (e1 === e2) { err.textContent = "Use two different emails."; return; }
    if (pwProblem(p1)) { err.textContent = pwProblem(p1); return; }
    if (U.list.length) { err.textContent = "Accounts already exist. Reload the page."; return; }
    err.textContent = "Creating…";
    Promise.all([makePw(p1), makePw(U.setupTemp)]).then(function (pw) {
      var a = { email: e1, name: v("z1sN1") || "Paolo", title: "", phone: "", photo: "", role: SA, status: "active", pages: [], pw: pw[0], mustChange: false, created: today(), lastLogin: today() };
      var b = { email: e2, name: v("z1sN2") || "Karla", title: "", phone: "", photo: "", role: SA, status: "active", pages: [], pw: pw[1], mustChange: true, created: today(), lastLogin: "" };
      return U.db.doc("z1users/" + keyOf(e1)).set(a).then(function () { return U.db.doc("z1users/" + keyOf(e2)).set(b); }).then(function () { return a; });
    }).then(function (a) {
      upsertLocal(a); upsertLocal({ email: e2 });
      window.Z1Auth.set(toMe(a)); toast("Accounts created. You're signed in.");
    }, function () { err.textContent = "Couldn't save. You may need edit access to this app."; });
  });

  /* ---------- data ---------- */
  function upsertLocal(r) { var i = U.list.findIndex(function (x) { return x.email === r.email; }); if (i < 0) U.list.push(r); else U.list[i] = Object.assign({}, U.list[i], r); }
  function saveUser(r) { upsertLocal(r); return U.db.doc("z1users/" + keyOf(r.email)).set(r); }
  function afterLoad() {
    var m = window.Z1Auth.me();
    if (m) {
      var r = byEmail(m.email);
      if (!r || r.status === "suspended") { window.Z1Auth.set(null); toast("You were signed out."); return; }
      var fresh = toMe(r);
      if (fresh.name !== m.name || fresh.role !== m.role || fresh.perms.join() !== m.perms.join()) { window.Z1Auth.set(fresh); return; }
      window.Z1Auth.renderMe(); render();
    } else {
      var s = null; try { s = JSON.parse(localStorage.getItem(window.Z1Auth.key) || "null"); } catch (err) { s = null; }
      var r2 = s && s.email ? byEmail(s.email) : null;
      if (r2 && r2.status !== "suspended" && r2.pw) window.Z1Auth.set(toMe(r2));
      else showGateState();
    }
  }
  function boot() {
    var cl = window.claude;
    if (!cl || !cl.use) { U.err = "Sign-in works when Zero1Office is opened on claude.ai."; showGateState(); return; }
    var timer = setTimeout(function () { if (!U.loaded) { U.err = "The team list didn't load. Reload the page."; showGateState(); } }, 10000);
    Promise.all([cl.use("db"), cl.use("assets")]).then(function (x) {
      U.db = x[0]; U.assets = x[1];
      if (!U.db) { clearTimeout(timer); U.err = "Sign-in works when Zero1Office is opened on claude.ai while signed in."; showGateState(); return; }
      U.db.collection("z1users").onSnapshot(function (snap) {
        if (snap.metadata && snap.metadata.fromCache && snap.empty) return; // wait for the server before offering setup
        clearTimeout(timer);
        U.list = snap.docs.map(function (d) { var o = d.data() || {}; o.email = String(o.email || "").toLowerCase(); return o; }).filter(function (o) { return emailOk(o.email); });
        U.loaded = true; afterLoad();
      }, function () { clearTimeout(timer); U.err = "The team list couldn't be read. Reload the page."; showGateState(); });
      U.db.doc("meta/company").onSnapshot(function (d) { U.company = (d.exists && d.data()) || {}; brand(); if (S.view === "company" && !U.busy) render(); }, function () { /* optional */ });
    }, function () { clearTimeout(timer); U.err = "Sign-in works when Zero1Office is opened on claude.ai."; showGateState(); });
  }

  /* ---------- company name and logo in the menu and sign-in screen ---------- */
  function brand() {
    var c = U.company || {};
    var html = c.logo ? '<img src="' + esc(blob(c.logo)) + '" alt="" style="max-height:34px;max-width:120px;object-fit:contain">' : "";
    [document.querySelector("#side .logo"), document.getElementById("z1LoginLogo")].forEach(function (el) {
      if (!el) return;
      var tag = el.querySelector(".z1co");
      if (!c.name && !c.logo) { if (tag) tag.remove(); el.querySelectorAll(".mark,.word").forEach(function (x) { x.hidden = false; }); return; }
      if (!tag) { tag = document.createElement("div"); tag.className = "z1co"; tag.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0"; el.appendChild(tag); }
      tag.innerHTML = html + (c.name ? '<b style="font-size:15px;line-height:1.15;overflow:hidden;text-overflow:ellipsis">' + esc(c.name) + "</b>" : "");
      el.querySelectorAll(".mark,.word").forEach(function (x) { x.hidden = true; });
    });
  }

  /* ---------- sidebar box ---------- */
  function meBox(m) {
    var r = byEmail(m.email) || { name: m.name, email: m.email };
    return '<button type="button" data-go="profile" title="My profile" style="all:unset;cursor:pointer;flex:1;min-width:0;display:flex;align-items:center;gap:8px">' + avatar(r, 30) +
      '<span style="display:grid;min-width:0"><b style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.name) + '</b><small style="color:var(--muted);font-size:11px">' + esc(m.role) + "</small></span></button>" +
      '<button class="btn sm" data-z1="signout">Sign out</button>';
  }

  /* ---------- photo and logo upload ---------- */
  function shrink(file, size) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = size;
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url); c.toBlob(function (b) { b ? res(b) : rej(new Error("Couldn't read that picture.")); }, "image/jpeg", 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Couldn't read that picture.")); };
      img.src = url;
    });
  }
  function upload(file, kind) {
    if (!U.assets) return Promise.reject(new Error("Uploading pictures works when Zero1Office is opened on claude.ai with edit or contributor access."));
    if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) return Promise.reject(new Error("Use a PNG, JPG or WebP picture."));
    if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("That picture is too big. Use one under 8 MB."));
    var body = kind === "photo" && file.type !== "image/svg+xml" ? shrink(file, 320) : Promise.resolve(file);
    return body.then(function (b) { return U.assets.upload(b); }).then(function (r) { return r.id; }, function (e) {
      throw new Error(e && e.code === "not_granted" ? "Your access doesn't allow uploads. Ask Paolo to give you Contributor access." : (e && e.message) || "Upload failed. Try again.");
    });
  }
  function dropAsset(id) { if (id && U.assets) U.assets.delete(id).catch(function () { /* not ours to delete */ }); }
  function pick(accept, fn) {
    var i = document.createElement("input"); i.type = "file"; i.accept = accept; i.style.display = "none";
    i.addEventListener("change", function () { var f = i.files && i.files[0]; i.remove(); if (f) fn(f); });
    document.body.appendChild(i); i.click();
  }

  /* ---------- Settings > My profile ---------- */
  VIEWS.profile = function () {
    var r = meRec();
    if (!r) return '<div class="ph"><div><h2>My profile</h2><p>Loading…</p></div></div>';
    var pages = catalog().filter(function (c) { return allowed(c.key); });
    var groups = {}; pages.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
    return '<div class="ph"><div><h2>My profile</h2><p>Your details as the rest of the team sees them.</p></div></div>' +
      (r.mustChange ? '<div class="card pad" style="margin-bottom:12px;border-color:var(--gold,#d6a542)"><b>Choose your own password first.</b> <span class="muted">You signed in with a temporary password. The other pages open once you change it below.</span></div>' : "") +
      '<div class="card pad stack" style="max-width:760px;margin-bottom:12px"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' + avatar(r, 72) +
      '<div style="min-width:0;flex:1"><h3 style="margin:0">' + esc(r.name || r.email) + '</h3><div class="muted small">' + esc(r.email) + " · " + esc(r.role) + (r.title ? " · " + esc(r.title) : "") + "</div></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-zu="photo">' + (r.photo ? "Change photo" : "Add photo") + "</button>" + (r.photo ? '<button class="btn" data-zu="nophoto">Remove</button>' : "") + "</div></div>" +
      '<form data-form="z1me" class="stack"><div class="two"><label class="fld" for="zu-name">Full name<input class="inp" id="zu-name" maxlength="80" value="' + esc(r.name || "") + '"></label>' +
      '<label class="fld" for="zu-title">Job title<input class="inp" id="zu-title" maxlength="80" placeholder="e.g. Secretary" value="' + esc(r.title || "") + '"></label></div>' +
      '<div class="two"><label class="fld" for="zu-phone">Mobile number<input class="inp" id="zu-phone" type="tel" maxlength="20" placeholder="+63 917 123 4567" value="' + esc(r.phone || "") + '"></label><span></span></div>' +
      '<div><button class="btn pri" type="submit">Save profile</button></div></form></div>' +
      '<div class="card pad stack" style="max-width:760px;margin-bottom:12px"><h3 style="margin:0">Password</h3>' +
      '<form data-form="z1pw" class="stack"><div class="two"><label class="fld" for="zu-old">Current password<input class="inp" id="zu-old" type="password" autocomplete="current-password"></label><span></span></div>' +
      '<div class="two"><label class="fld" for="zu-new">New password (10+ characters)<input class="inp" id="zu-new" type="password" autocomplete="new-password"></label>' +
      '<label class="fld" for="zu-new2">Type it again<input class="inp" id="zu-new2" type="password" autocomplete="new-password"></label></div>' +
      '<p class="small" role="alert" id="zu-pwerr" style="color:var(--bad,#c0392b);margin:0"></p><div><button class="btn pri" type="submit">Change password</button></div></form></div>' +
      '<div class="card pad stack" style="max-width:760px"><h3 style="margin:0">Pages you can open</h3>' +
      (r.role === SA ? '<p class="muted small" style="margin:0">You\'re a Super Admin, so you can open every page, plus Users and Company profile.</p>'
        : r.mustChange ? '<p class="muted small" style="margin:0">They appear once you change your password.</p>'
        : Object.keys(groups).map(function (g) { return '<div><b class="small">' + esc(g) + '</b><div class="muted small">' + groups[g].map(function (c) { return esc(c.label); }).join(", ") + "</div></div>"; }).join("") +
          '<p class="muted small" style="margin:0">A Super Admin chooses your pages. Ask Paolo or Karla if you need another one.</p>') + "</div>";
  };

  /* ---------- Settings > Users ---------- */
  function userForm(r) {
    var isNew = !r, cat = catalog(), groups = [];
    cat.forEach(function (c) { var g = groups.filter(function (x) { return x.name === c.group; })[0]; if (!g) groups.push(g = { name: c.group, items: [] }); g.items.push(c); });
    var pages = r ? r.pages || [] : defaultPages(), sa = r && r.role === SA;
    return '<form class="card pad stack" data-form="z1user" style="margin-bottom:12px"><h3 style="margin:0">' + (isNew ? "Add a user" : "Edit " + esc(r.name || r.email)) + "</h3>" +
      '<div class="two"><label class="fld" for="zx-name">Full name<input class="inp" id="zx-name" maxlength="80" value="' + esc(r ? r.name || "" : "") + '"></label>' +
      '<label class="fld" for="zx-email">Work email<input class="inp" id="zx-email" type="email" placeholder="name@ask-karla.com" value="' + esc(r ? r.email : "") + '"' + (r ? " readonly" : "") + "></label></div>" +
      '<div class="two"><label class="fld" for="zx-title">Job title<input class="inp" id="zx-title" maxlength="80" placeholder="e.g. Secretary" value="' + esc(r ? r.title || "" : "") + '"></label>' +
      '<label class="fld" for="zx-role">Role<select class="inp" id="zx-role"><option' + (sa ? "" : " selected") + ">" + STAFF + "</option><option" + (sa ? " selected" : "") + ">" + SA + "</option></select></label></div>" +
      '<fieldset id="zx-pages" style="border:1px solid var(--line);border-radius:12px;padding:10px 14px"' + (sa ? " disabled" : "") + '><legend class="small" style="padding:0 6px"><b>Pages this person can open</b> ' +
      '<span class="muted">' + (sa ? "Super Admins open every page." : "My profile is always included.") + "</span></legend>" +
      groups.map(function (g) {
        return '<div style="margin:6px 0 10px"><div style="display:flex;align-items:center;gap:10px"><b class="small">' + esc(g.name) + '</b><button type="button" class="btn sm" data-zx="all" data-g="' + esc(g.name) + '">All</button><button type="button" class="btn sm" data-zx="none" data-g="' + esc(g.name) + '">None</button></div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 12px;margin-top:6px">' + g.items.map(function (c) {
            return '<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-pg="' + esc(c.key) + '" data-g="' + esc(g.name) + '"' + (sa || pages.indexOf(c.key) > -1 ? " checked" : "") + "> " + esc(c.label) + "</label>";
          }).join("") + "</div></div>";
      }).join("") + "</fieldset>" +
      (isNew ? '<p class="small" style="margin:0">They get a temporary password after you add them, and choose their own the first time they sign in.</p>' : "") +
      '<p class="small" role="alert" id="zx-err" style="color:var(--bad,#c0392b);margin:0"></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" type="submit">' + (isNew ? "Add user" : "Save changes") + '</button><button class="btn" type="button" data-zx="cancel">Cancel</button></div></form>';
  }
  VIEWS.users = function () {
    if (!isSA()) return '<div class="ph"><div><h2>Users</h2><p>Only Super Admins can manage users.</p></div></div>';
    var me = meRec(), list = U.list.slice().sort(function (a, b) { return (a.email === me.email ? 0 : 1) - (b.email === me.email ? 0 : 1) || (a.role === SA ? 0 : 1) - (b.role === SA ? 0 : 1) || String(a.name).localeCompare(String(b.name)); });
    var editing = U.edit === "new" ? null : U.edit ? byEmail(U.edit) : undefined;
    return '<div class="ph"><div><h2>Users</h2><p>Who can sign in, their role, and the pages each person can open. Only @ask-karla.com emails.</p></div>' +
      (U.edit ? "" : '<button class="btn gold" data-zx="add">+ Add user</button>') + "</div>" +
      (U.temp ? '<div class="card pad stack" style="margin-bottom:12px;border-color:var(--gold,#d6a542)"><b>Temporary password for ' + esc(U.temp.name) + '</b><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><code class="num" style="font-size:18px">' + esc(U.temp.pw) +
        '</code><button class="btn sm" data-zx="copytemp">Copy</button><button class="btn sm" data-zx="hidetemp">Done</button></div><p class="muted small" style="margin:0">Give it to them privately (not by group chat). It is shown only now. They sign in with ' + esc(U.temp.email) + ' and then choose their own password.</p></div>' : "") +
      (U.edit ? userForm(editing) : "") +
      '<div class="card pad"><div class="tblwrap"><table class="t" style="min-width:760px"><tr><th>Person</th><th>Role</th><th>Pages</th><th>Last sign-in</th><th></th></tr>' +
      list.map(function (u) {
        var n = u.role === SA ? "All" : String((u.pages || []).length);
        return '<tr' + (u.status === "suspended" ? ' class="muted"' : "") + '><td><div style="display:flex;align-items:center;gap:10px">' + avatar(u, 32) + '<div style="min-width:0"><b>' + esc(u.name || u.email) + "</b>" + (u.email === me.email ? ' <span class="muted small">(you)</span>' : "") +
          '<div class="muted small">' + esc(u.email) + (u.title ? " · " + esc(u.title) : "") + "</div></div></div></td>" +
          "<td>" + esc(u.role) + (u.status === "suspended" ? ' <span class="muted small">paused</span>' : u.mustChange ? ' <span class="muted small">temporary password</span>' : "") + "</td><td>" + n + '</td><td class="small">' + esc(nice(u.lastLogin)) + "</td>" +
          '<td style="white-space:nowrap;text-align:right"><button class="btn sm" data-zx="edit" data-e="' + esc(u.email) + '">Edit</button> ' +
          (u.email === me.email ? "" : '<button class="btn sm" data-zx="reset" data-e="' + esc(u.email) + '">Reset password</button> <button class="btn sm" data-zx="pause" data-e="' + esc(u.email) + '">' + (u.status === "suspended" ? "Unpause" : "Pause") + '</button> <button class="btn sm danger" data-zx="del" data-e="' + esc(u.email) + '">Remove</button>') + "</td></tr>";
      }).join("") + "</table></div>" +
      (supers().length < 2 ? '<p class="small" style="margin:10px 0 0;color:var(--bad,#c0392b)">Only one active Super Admin. Keep a second one so you are never locked out.</p>' : "") +
      '<p class="muted small" style="margin:10px 0 0">Each person also needs access to this app on claude.ai: Paolo shares it from the Share menu (Contributor lets them upload a profile photo).</p></div>';
  };

  /* ---------- Settings > Company profile ---------- */
  var CO = [["name", "Company name", "e.g. Ask Karla Insurance Agency"], ["legal", "Registered business name", "As on the DTI or SEC papers"], ["address", "Address", "Street, barangay"], ["city", "City and province", "e.g. Makati City, Metro Manila"],
    ["tin", "TIN", "000-000-000-000"], ["phone", "Phone", "+63 2 8000 0000"], ["email", "Email", "hello@ask-karla.com"], ["website", "Website", "https://ask-karla.com"]];
  VIEWS.company = function () {
    if (!isSA()) return '<div class="ph"><div><h2>Company profile</h2><p>Only Super Admins can change the company profile.</p></div></div>';
    var c = U.company || {};
    return '<div class="ph"><div><h2>Company profile</h2><p>Your company\'s details. The name and logo show in the menu and on the sign-in screen for everyone.</p></div></div>' +
      '<div class="card pad stack" style="max-width:760px;margin-bottom:12px"><h3 style="margin:0">Logo</h3><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
      (c.logo ? '<img src="' + esc(blob(c.logo)) + '" alt="Company logo" style="max-height:72px;max-width:220px;object-fit:contain;background:var(--sunken);border-radius:10px;padding:6px">' : '<div class="empty" style="padding:14px 18px">No logo yet</div>') +
      '<div style="display:flex;gap:8px"><button class="btn" data-zc="logo">' + (c.logo ? "Change logo" : "Upload logo") + "</button>" + (c.logo ? '<button class="btn" data-zc="nologo">Remove</button>' : "") + '</div><span class="muted small">PNG with a clear background works best.</span></div></div>' +
      '<form class="card pad stack" data-form="z1co" style="max-width:760px">' +
      (function () { var h = "", f = CO.map(function (x) { return '<label class="fld" for="zc-' + x[0] + '">' + esc(x[1]) + '<input class="inp" id="zc-' + x[0] + '" maxlength="160" placeholder="' + esc(x[2]) + '" value="' + esc(c[x[0]] || "") + '"></label>'; });
        for (var i = 0; i < f.length; i += 2) h += '<div class="two">' + f[i] + (f[i + 1] || "") + "</div>"; return h; })() +
      '<div><button class="btn pri" type="submit">Save company profile</button>' + (c.updated ? ' <span class="muted small">Last saved ' + esc(nice(c.updated)) + (c.by ? " by " + esc(c.by) : "") + "</span>" : "") + "</div></form>";
  };

  /* ---------- events ---------- */
  function rec(email) { return byEmail(email); }
  function guard(fn) { return function () { if (U.busy) return; U.busy = true; Promise.resolve().then(fn).catch(function (e) { toast((e && e.message) || "Couldn't save. Try again."); }).then(function () { U.busy = false; render(); }); }; }

  document.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest && ev.target.closest("[data-zu],[data-zx],[data-zc]"); if (!t) return;
    ev.preventDefault();
    var me = meRec(); if (!me) return;
    var zu = t.getAttribute("data-zu"), zx = t.getAttribute("data-zx"), zc = t.getAttribute("data-zc"), em = t.getAttribute("data-e");
    if (zu === "photo") pick("image/png,image/jpeg,image/webp", function (f) {
      toast("Uploading photo…");
      guard(function () { return upload(f, "photo").then(function (id) { var old = me.photo; me.photo = id; return saveUser(me).then(function () { dropAsset(old); window.Z1Auth.renderMe(); toast("Photo updated."); }); }); })();
    });
    else if (zu === "nophoto") guard(function () { var old = me.photo; me.photo = ""; return saveUser(me).then(function () { dropAsset(old); window.Z1Auth.renderMe(); }); })();
    else if (zc === "logo" && isSA()) pick("image/png,image/jpeg,image/webp,image/svg+xml", function (f) {
      toast("Uploading logo…");
      guard(function () { return upload(f, "logo").then(function (id) { var old = U.company.logo; U.company.logo = id; U.company.updated = today(); U.company.by = me.name; return U.db.doc("meta/company").set(U.company).then(function () { dropAsset(old); brand(); toast("Logo updated."); }); }); })();
    });
    else if (zc === "nologo" && isSA()) guard(function () { var old = U.company.logo; U.company.logo = ""; return U.db.doc("meta/company").set(U.company).then(function () { dropAsset(old); brand(); }); })();
    else if (!isSA()) return;
    else if (zx === "add") { U.edit = "new"; render(); }
    else if (zx === "cancel") { U.edit = null; render(); }
    else if (zx === "edit") { U.edit = em; render(); }
    else if (zx === "all" || zx === "none") document.querySelectorAll('#zx-pages input[data-g="' + CSS.escape(t.getAttribute("data-g")) + '"]').forEach(function (c) { c.checked = zx === "all"; });
    else if (zx === "hidetemp") { U.temp = null; render(); }
    else if (zx === "copytemp" && U.temp) { (navigator.clipboard ? navigator.clipboard.writeText(U.temp.pw) : Promise.reject()).then(function () { toast("Copied."); }, function () { toast("Select the password and copy it."); }); }
    else if (zx === "reset") { var r = rec(em); if (!r) return;
      ask("Reset " + (r.name || r.email) + "'s password?", "Their current password stops working. You'll get a temporary one to give them.", "Reset", guard(function () {
        var pw = tempPw(); return makePw(pw).then(function (h) { r.pw = h; r.mustChange = true; return saveUser(r); }).then(function () { U.temp = { name: r.name || r.email, email: r.email, pw: pw }; });
      })); }
    else if (zx === "pause") { var p = rec(em); if (!p) return;
      if (p.status !== "suspended" && p.role === SA && supers().length < 2) { toast("Keep at least one active Super Admin."); return; }
      guard(function () { p.status = p.status === "suspended" ? "active" : "suspended"; return saveUser(p).then(function () { toast(p.status === "suspended" ? "Paused. They can't sign in." : "Unpaused."); }); })(); }
    else if (zx === "del") { var d = rec(em); if (!d) return;
      if (d.role === SA && supers().length < 2) { toast("Keep at least one active Super Admin."); return; }
      ask("Remove " + (d.name || d.email) + "?", "They won't be able to sign in. Their work in the app stays.", "Remove", guard(function () {
        return U.db.doc("z1users/" + keyOf(d.email)).delete().then(function () { U.list = U.list.filter(function (x) { return x.email !== d.email; }); dropAsset(d.photo); toast("Removed."); });
      })); }
  });
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.id === "zx-role") { var fs = document.getElementById("zx-pages"), sa = ev.target.value === SA; if (fs) { fs.disabled = sa; if (sa) fs.querySelectorAll("input").forEach(function (c) { c.checked = true; }); } }
  });
  document.addEventListener("submit", function (ev) {
    var f = ev.target, kind = f && f.getAttribute && f.getAttribute("data-form"); if (!kind || ["z1me", "z1pw", "z1user", "z1co"].indexOf(kind) < 0) return;
    ev.preventDefault();
    var me = meRec(); if (!me) return;
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
    if (kind === "z1me") {
      var ph = val("zu-phone");
      if (!/^[0-9+() -]{0,20}$/.test(ph)) { toast("Use only numbers, spaces, + and brackets for the mobile number."); return; }
      guard(function () { me.name = val("zu-name").slice(0, 80) || me.name; me.title = val("zu-title").slice(0, 80); me.phone = ph; return saveUser(me).then(function () { window.Z1Auth.set(toMe(me)); toast("Profile saved."); }); })();
    } else if (kind === "z1pw") {
      var old = document.getElementById("zu-old").value, n1 = document.getElementById("zu-new").value, n2 = document.getElementById("zu-new2").value, err = document.getElementById("zu-pwerr");
      if (pwProblem(n1)) { err.textContent = pwProblem(n1); return; }
      if (n1 !== n2) { err.textContent = "The two new passwords don't match."; return; }
      err.textContent = "";
      guard(function () {
        return hashPw(old, me.pw.salt, me.pw.iter).then(function (h) {
          if (h !== me.pw.hash) throw new Error("Your current password is wrong.");
          if (n1 === old) throw new Error("Choose a password different from the current one.");
          return makePw(n1);
        }).then(function (pw) { me.pw = pw; me.mustChange = false; return saveUser(me); }).then(function () { toast("Password changed."); renderNav(); });
      })();
    } else if (kind === "z1user" && isSA()) {
      var isNew = U.edit === "new", email = (isNew ? val("zx-email") : U.edit).toLowerCase(), role = val("zx-role"), e = document.getElementById("zx-err");
      if (!emailOk(email)) { e.textContent = "Use an @ask-karla.com email."; return; }
      if (isNew && byEmail(email)) { e.textContent = "That email already has an account."; return; }
      var cur = isNew ? null : byEmail(email);
      if (cur && cur.email === me.email && role !== SA) { e.textContent = "You can't remove your own Super Admin role. Ask the other Super Admin."; return; }
      if (cur && cur.role === SA && role !== SA && supers().length < 2) { e.textContent = "Keep at least one active Super Admin."; return; }
      var pages = []; document.querySelectorAll("#zx-pages input[data-pg]").forEach(function (c) { if (c.checked) pages.push(c.getAttribute("data-pg")); });
      var r = Object.assign({}, cur || { email: email, phone: "", photo: "", status: "active", created: today(), lastLogin: "" }, { name: val("zx-name").slice(0, 80) || email.split("@")[0], title: val("zx-title").slice(0, 80), role: role === SA ? SA : STAFF, pages: role === SA ? [] : pages });
      guard(function () {
        var pw = isNew ? tempPw() : null;
        return (pw ? makePw(pw).then(function (h) { r.pw = h; r.mustChange = true; }) : Promise.resolve()).then(function () { return saveUser(r); }).then(function () {
          U.edit = null; if (pw) U.temp = { name: r.name, email: r.email, pw: pw }; toast(isNew ? "User added." : "Saved.");
          if (cur && cur.email === me.email) window.Z1Auth.set(toMe(r));
        });
      })();
    } else if (kind === "z1co" && isSA()) {
      var c = Object.assign({}, U.company);
      CO.forEach(function (x) { c[x[0]] = val("zc-" + x[0]).slice(0, 160); });
      if (c.website && !/^https:\/\//.test(c.website)) c.website = "https://" + c.website.replace(/^https?:\/\//, "");
      c.updated = today(); c.by = me.name;
      guard(function () { return U.db.doc("meta/company").set(c).then(function () { U.company = c; brand(); toast("Company profile saved."); }); })();
    }
  });

  window.Z1Users = { signIn: signIn, meBox: meBox, allowed: allowed, company: function () { return U.company; }, list: function () { return U.list.slice(); } };
  boot();
  showGateState();
})();
