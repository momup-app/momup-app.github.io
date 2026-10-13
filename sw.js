// Service worker: lets the installed app open without internet.
// Network first, so updates show up right away; the saved copy is only used when offline.
// Only this site's own files are saved. Maps, fonts, Supabase and the form service go straight to the network.

const CACHE = "kids-nearby-v16";
const CORE = [
  "./", "./index.html", "./contact.html", "./account.html", "./install.html", "./chat.html",
  "./styles.css", "./app.js", "./i18n.js", "./account.js", "./pwa.js", "./tabs.js", "./welcome.js", "./supabase-config.js", "./push-config.js",
  "./data/activities.json", "./data/events.json",
  "./images/icon.svg", "./images/icon-192.png", "./images/hero.jpg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())
        )
      )
  );
});

// Push notifications (sent by .github/workflows/sales-alerts.yml). The message is JSON:
// { title, body, url, tag }. Tapping it opens the app on that page, or the app's start page.
self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || "MomUp", {
    body: msg.body || "",
    icon: "images/icon-192.png",
    badge: "images/icon-192.png",
    tag: msg.tag || "momup",
    data: { url: msg.url || "./" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    })
  );
});
