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
  var isAndroid = /android/i.test(ua);
  // Browsers built into other apps can't install web apps.
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Telegram|musical_ly|Bytedance|TikTok|Line\/|Snapchat|Pinterest|LinkedInApp|; wv\)/i.test(ua);
  var dismissed = false;
  try { dismissed = !!localStorage.getItem(KEY); } catch (e) {}

  var deferred = null, banner = null;

  // For the install page and "Install the app" links.
  window.KNInstall = {
    standalone: standalone, isIOS: isIOS, isAndroid: isAndroid, inApp: inApp,
    canPrompt: function () { return !!deferred; },
    // Resolves true when this app is already installed on the device (Chrome/Edge; elsewhere false).
    isInstalled: function () {
      if (standalone) return Promise.resolve(true);
      if (!navigator.getInstalledRelatedApps) return Promise.resolve(false);
      return navigator.getInstalledRelatedApps().then(function (apps) { return apps.length > 0; }, function () { return false; });
    },
    prompt: function () {
      if (!deferred) return Promise.resolve("unavailable");
      deferred.prompt();
      return deferred.userChoice.then(function (c) { deferred = null; close(true); return c.outcome; });
    }
  };
  // Hide "Install the app" links inside the installed app.
  if (standalone) document.documentElement.classList.add("is-app");

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
      go.addEventListener("click", function () { window.KNInstall.prompt(); });
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

  // No hint banner on the install page itself, inside the app, or after "Not now".
  var quiet = standalone || dismissed || inApp || /install\.html$/.test(location.pathname);

  // Android and desktop Chrome / Edge: the browser offers a real install prompt.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    document.dispatchEvent(new Event("kn-installable"));
    if (!quiet) setTimeout(function () { show("prompt"); }, 2500);
  });
  window.addEventListener("appinstalled", function () {
    close(true);
    document.dispatchEvent(new Event("kn-installed"));
  });

  // iPhone / iPad: explain the two taps.
  if (isIOS && !quiet) setTimeout(function () { show("ios"); }, 2500);
})();
