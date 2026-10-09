// Installable app: registers the service worker and shows a small "add to home screen" hint.
// Android / desktop Chrome get an Install button; iPhone gets the Share → Add to Home Screen steps,
// because iOS has no install button. Hidden when already installed or after "Not now".
(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  var KEY = "kn-install-dismissed";
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var dismissed = false;
  try { dismissed = !!localStorage.getItem(KEY); } catch (e) {}
  if (standalone || dismissed) return;

  var deferred = null, banner = null;

  function t(key) {
    return window.KN ? window.KN.t(document.documentElement.lang || "en", key) : key;
  }

  function text(tag, cls, key) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    n.dataset.i18n = key; // re-translated when the language changes
    n.textContent = t(key);
    return n;
  }

  function close(remember) {
    if (banner) banner.remove();
    banner = null;
    if (remember) { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
  }

  function show(mode) {
    if (banner) return;
    banner = document.createElement("aside");
    banner.className = "install";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", t("installTitle"));
    var icon = document.createElement("img");
    icon.src = "images/icon.svg"; icon.alt = ""; icon.width = 44; icon.height = 44;
    banner.appendChild(icon);
    var body = document.createElement("div");
    body.appendChild(text("b", null, "installTitle"));
    body.appendChild(text("p", null, mode === "ios" ? "installIos" : "installText"));
    var acts = document.createElement("div");
    acts.className = "install-acts";
    if (mode === "prompt") {
      var go = text("button", "btn", "installBtn");
      go.type = "button";
      go.addEventListener("click", function () {
        deferred.prompt();
        deferred.userChoice.then(function (c) { close(c.outcome !== "accepted"); deferred = null; });
      });
      acts.appendChild(go);
    }
    var later = text("button", "link", "installLater");
    later.type = "button";
    later.addEventListener("click", function () { close(true); });
    acts.appendChild(later);
    body.appendChild(acts);
    banner.appendChild(body);
    document.body.appendChild(banner);
  }

  // Android and desktop Chrome / Edge: the browser offers a real install prompt.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(function () { show("prompt"); }, 2500);
  });
  window.addEventListener("appinstalled", function () { close(true); });

  // iPhone / iPad: explain the two taps.
  if (isIOS) setTimeout(function () { show("ios"); }, 2500);
})();
