/* zero1office add-on: collapsible menu groups (Paolo, 2026-11-27: "Make the TODAY, TEAM, NUMBERS & SETTINGS
   collapsible"). Click a group heading to fold or unfold it. Each person's choice is remembered in this
   browser. While the menu search box has text, every group shows so matches are never hidden. */
(function () {
  if (typeof renderNav !== "function" || window.__z1NavFold) return;
  window.__z1NavFold = true;
  var KEY = "zero1office:navFolded:v1", folded = {};
  try { folded = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (err) { folded = {}; }
  function keep() { try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch (err) { /* private mode */ } }

  var st = document.createElement("style");
  st.textContent = "#nav .grp.z1fold{cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;gap:6px}" +
    "#nav .grp.z1fold:hover{filter:brightness(.97)}#nav .grp.z1fold:focus-visible{outline:2px solid var(--brand);outline-offset:2px}" +
    "#nav .grp.z1fold .z1chev{display:inline-block;transition:transform .15s;font-size:9px}#nav .grp.z1fold[aria-expanded=false] .z1chev{transform:rotate(-90deg)}" +
    "#nav .z1hide{display:none!important}";
  document.head.appendChild(st);

  function apply() {
    var nav = document.getElementById("nav"); if (!nav) return;
    var q = ((document.getElementById("msearch") || {}).value || "").trim();
    var grp = null;
    Array.prototype.forEach.call(nav.children, function (el) {
      if (el.classList.contains("grp")) {
        grp = el.textContent.replace("▼", "").trim();
        var open = q || !folded[grp];
        el.classList.add("z1fold");
        el.setAttribute("role", "button"); el.setAttribute("tabindex", "0"); el.setAttribute("aria-expanded", open ? "true" : "false");
        if (!el.querySelector(".z1chev")) el.insertAdjacentHTML("afterbegin", '<span class="z1chev" aria-hidden="true">▼</span>');
        el.title = open ? "Fold " + grp : "Show " + grp;
        return;
      }
      if (!grp) return;
      el.classList.toggle("z1hide", !q && !!folded[grp]);
    });
  }
  function toggle(el) {
    var name = el.textContent.replace("▼", "").trim();
    if (folded[name]) delete folded[name]; else folded[name] = 1;
    keep(); apply();
  }

  var base = renderNav;
  renderNav = function () { base.apply(this, arguments); apply(); };
  document.addEventListener("click", function (ev) {
    var g = ev.target && ev.target.closest && ev.target.closest("#nav .grp.z1fold"); if (!g) return;
    ev.preventDefault(); toggle(g);
  });
  document.addEventListener("keydown", function (ev) {
    var g = ev.target && ev.target.closest && ev.target.closest("#nav .grp.z1fold"); if (!g || (ev.key !== "Enter" && ev.key !== " ")) return;
    ev.preventDefault(); toggle(g);
  });
  var ms = document.getElementById("msearch"); if (ms) ms.addEventListener("input", function () { setTimeout(apply, 0); });
  apply();
})();
