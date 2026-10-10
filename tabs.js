// App tab bar at the bottom of the screen (phones and the installed app): Home · Chat · Contact · Account.
// Load it at the end of <body>, before the page's own script, so the labels get translated with the page.
(function () {
  "use strict";

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    contact: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  };
  var TABS = [
    { id: "home", href: "./", key: "tabHome" },
    { id: "chat", href: "chat.html", key: "tabChat" },
    { id: "contact", href: "contact.html", key: "navContact" },
    { id: "account", href: "account.html", key: "tabAccount" }
  ];

  var page = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
  if (page === "index") page = "home";

  var nav = document.createElement("nav");
  nav.className = "tabs";
  nav.setAttribute("data-i18n-attr", "aria-label:tabsLabel");
  nav.setAttribute("aria-label", "App");
  TABS.forEach(function (tab) {
    var a = document.createElement("a");
    a.href = tab.href;
    a.dataset.keepLang = tab.href;
    if (tab.id === page) a.setAttribute("aria-current", "page");
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[tab.id] + "</svg>";
    var label = document.createElement("span");
    label.dataset.i18n = tab.key;
    label.textContent = window.KN ? window.KN.t(document.documentElement.lang || "en", tab.key) : tab.key;
    a.appendChild(label);
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
  document.documentElement.classList.add("has-tabs");
})();
