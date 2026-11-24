/*
 * Live bridge between the 3D office and the zero1office app.
 *
 * The app (same origin) posts {type:"z1-live", agents:{id:{...}}, items:[...]}
 * into this frame. Agents named there swap their sample work for real work:
 * their "now" line, task list and scoreboard come from the app's data, and
 * the "Today in your office" panel gets a "From your trackers" section whose
 * rows open the right app page. Nothing here is stored or sent anywhere else.
 */
(function () {
  "use strict";
  var live = null;
  var lastNow = {};

  function apply(msg) {
    live = msg;
    Object.keys(msg.agents || {}).forEach(function (id) {
      var info = msg.agents[id], a = byId(id);
      if (!a) return;
      if (info.role) a.e.r = info.role;
      if (info.desc) a.e.desc = info.desc;
      a.e.tasks = info.tasks && info.tasks.length ? info.tasks.slice() : [info.now];
      a.e.k = info.k || a.e.k;
      a.e.kg = Math.max(1, info.kg || 1);
      a.kc = info.kc || 0;
      a.e.now = info.now;
      a.live = true;
      if (info.tasks && info.tasks.length && a.duty !== "active") a.duty = "active";
      if (a.duty === "active") a.task = { t: info.now, p: a.task && a.task.t === info.now ? a.task.p : 0.05, len: a.task ? a.task.len : 60 };
      a.queue = (info.tasks || []).slice(0, 5);
      if (lastNow[id] !== info.now) {
        if (lastNow[id] !== undefined && info.say) { try { say(a, info.say, 6000); } catch (e) { /* bubble is optional */ } }
        try { log(a, info.now); } catch (e) { /* feed is optional */ }
        lastNow[id] = info.now;
      }
    });
    try { renderPanel(true); } catch (e) { /* panel not ready yet */ }
  }

  function liveBlock() {
    if (!live) return "";
    var items = live.items || [];
    var h = '<h3>From your trackers</h3>';
    if (!items.length) {
      h += '<div class="row"><span class="t"><b>' + esc(live.empty || "Nothing needs you") + '</b><small>Live from the app</small></span></div>';
      return h;
    }
    return h + items.map(function (it) {
      return '<button class="row" data-live-open="' + esc(it.path) + '">' + (it.who ? face(it.who) : "") +
        '<span class="t"><b>' + esc(it.title) + '</b><small>' + esc(it.sub || "") + '</small></span>' +
        (it.tone === "need" ? '<span class="chip c-need">● ' + esc(it.badge || "Needs you") + '</span>'
          : '<span class="chip c-working">' + esc(it.badge || "Open") + '</span>') + '</button>';
    }).join("");
  }

  var baseHome = VIEWS.home;
  VIEWS.home = function () {
    var h = baseHome();
    var cut = h.indexOf('<div class="rep">');
    return cut > 0 ? h.slice(0, cut) + liveBlock() + h.slice(cut) : liveBlock() + h;
  };

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-live-open]");
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    parent.postMessage({ type: "z1-open", path: el.getAttribute("data-live-open") }, location.origin);
  }, true);

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || ev.source !== parent) return;
    var m = ev.data;
    if (m && m.type === "z1-live") apply(m);
  });

  if (parent !== window) parent.postMessage({ type: "z1-office-ready" }, location.origin);
})();
