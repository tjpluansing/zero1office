/* Zero1Office: serves uploaded files at /_blob/<id> (photos, logo, resumes, receipts) from the private
   Supabase bucket "files", using the signed-in person's token. Nothing is cached. */
var T = { token: "", url: "", key: "", at: 0 };
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
function ask() {
  if (T.token && Date.now() - T.at < 5 * 60 * 1000) return Promise.resolve(T);
  return self.clients.matchAll({ type: "window" }).then(function (list) {
    if (!list.length) return T;
    return new Promise(function (res) {
      var ch = new MessageChannel(), done = false;
      ch.port1.onmessage = function (ev) { done = true; T = { token: ev.data.token, url: ev.data.url, key: ev.data.key, at: Date.now() }; res(T); };
      list[0].postMessage({ z1: "token" }, [ch.port2]);
      setTimeout(function () { if (!done) res(T); }, 3000);
    });
  });
}
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  var m = u.origin === self.location.origin && /\/_blob\/([0-9a-zA-Z_-]{8,80})$/.exec(u.pathname);
  if (!m || e.request.method !== "GET") return;
  e.respondWith(ask().then(function (t) {
    if (!t.token) return new Response("Sign in again to see this file.", { status: 401 });
    return fetch(t.url + "/storage/v1/object/authenticated/files/" + m[1], { headers: { Authorization: "Bearer " + t.token, apikey: t.key } })
      .then(function (r) {
        if (r.status === 401 || r.status === 400) { T.at = 0; }
        var h = new Headers(r.headers); h.set("Cache-Control", "no-store"); h.delete("set-cookie");
        return new Response(r.body, { status: r.status, headers: h });
      });
  }));
});
