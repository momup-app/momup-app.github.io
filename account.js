// Shared account code for every page. Loads Supabase only when supabase-config.js is filled in.
// Exposes window.KNAccount.ready: a promise for { client, session } (session is null when logged out),
// or null when accounts aren't set up yet.
(function () {
  "use strict";

  var cfg = window.KN_SUPABASE || {};
  var enabled = !!(cfg.url && cfg.anonKey);
  var link = document.getElementById("account-link");

  var ready = !enabled ? Promise.resolve(null) : new Promise(function (resolve) {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
    s.onload = function () {
      var client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      client.auth.getSession().then(function (r) {
        resolve({ client: client, session: r.data.session });
      }, function () { resolve({ client: client, session: null }); });
    };
    s.onerror = function () { resolve(null); }; // offline or blocked: the site still works without accounts
    document.head.appendChild(s);
  });

  // Header link: hidden until accounts exist; "Log in" or "My account".
  ready.then(function (acc) {
    if (!link || !acc) return;
    link.hidden = false;
    if (acc.session) {
      link.dataset.i18n = "myAccount";
      link.textContent = window.KN.t(document.documentElement.lang || "en", "myAccount");
    }
  });

  window.KNAccount = { enabled: enabled, ready: ready };
})();
