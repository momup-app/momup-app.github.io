// Service worker: lets the installed app open without internet.
// Network first, so updates show up right away; the saved copy is only used when offline.
// Only this site's own files are saved. Maps, fonts, Supabase and the form service go straight to the network.

const CACHE = "kids-nearby-v3";
const CORE = [
  "./", "./index.html", "./contact.html", "./account.html", "./install.html", "./chat.html",
  "./styles.css", "./app.js", "./i18n.js", "./account.js", "./pwa.js", "./tabs.js", "./supabase-config.js",
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
