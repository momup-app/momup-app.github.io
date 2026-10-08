(function () {
  "use strict";

  var DEFAULT_ORIGIN = { lat: 52.5200, lng: 13.4050, label: "Berlin", exact: false };
  // Berlin bounding box (west, north, east, south) so lookups stay inside the city.
  var BERLIN_VIEWBOX = "13.08,52.68,13.77,52.33";
  var LANGS = ["de", "en"];

  var state = {
    origin: DEFAULT_ORIGIN, activities: [], saved: loadSaved(), activeId: null,
    lang: pickLang(), status: { key: "statusDefault", vars: {} }
  };
  var els = {
    form: document.getElementById("where"),
    place: document.getElementById("place"),
    locate: document.getElementById("locate"),
    status: document.getElementById("status"),
    filters: document.getElementById("filters"),
    list: document.getElementById("list"),
    count: document.getElementById("count"),
    empty: document.getElementById("empty")
  };

  // ---------- language ----------
  // Order: ?lang= in the link, then the visitor's last choice, then the browser language.
  function pickLang() {
    var fromUrl = new URLSearchParams(location.search).get("lang");
    if (LANGS.indexOf(fromUrl) !== -1) return fromUrl;
    try {
      var stored = localStorage.getItem("kn-lang");
      if (LANGS.indexOf(stored) !== -1) return stored;
    } catch (e) {}
    var browser = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return browser.toLowerCase().indexOf("de") === 0 ? "de" : "en";
  }

  function t(key, vars) {
    var s = window.I18N[state.lang][key];
    if (s == null) s = window.I18N.en[key];
    if (s == null) return key;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ""; });
  }

  // Listing text in the current language, falling back to English.
  function tr(a, field) {
    return (state.lang !== "en" && a[state.lang] && a[state.lang][field]) || a[field];
  }

  function number(n) {
    return n.toLocaleString(state.lang === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function translatePage() {
    document.documentElement.lang = state.lang;
    document.title = t("pageTitle");
    document.querySelector('meta[name="description"]').setAttribute("content", t("metaDesc"));
    document.querySelectorAll("[data-i18n]").forEach(function (n) {
      n.textContent = t(n.dataset.i18n, { n: n.dataset.n });
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (n) {
      n.innerHTML = t(n.dataset.i18nHtml); // trusted: our own strings from i18n.js
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (n) {
      n.dataset.i18nAttr.split(",").forEach(function (pair) {
        var parts = pair.split(":");
        n.setAttribute(parts[0], t(parts[1]));
      });
    });
    Array.prototype.forEach.call(els.filters.age.options, function (o) {
      if (o.value) o.textContent = t(o.value === "1" ? "year" : "years", { n: o.value });
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
    });
    showStatus();
  }

  function setLang(lang) {
    state.lang = lang;
    try { localStorage.setItem("kn-lang", lang); } catch (e) {}
    translatePage();
    render();
  }

  function setStatus(key, vars) {
    state.status = { key: key, vars: vars || {} };
    showStatus();
  }
  function showStatus() {
    var vars = Object.assign({}, state.status.vars);
    if (vars.place === "@me") vars.place = t("yourLocation");
    els.status.textContent = t(state.status.key, vars);
  }

  // ---------- storage (saved activities stay in this browser only) ----------
  function loadSaved() {
    try { return new Set(JSON.parse(localStorage.getItem("kn-saved") || "[]")); } catch (e) { return new Set(); }
  }
  function storeSaved() {
    try { localStorage.setItem("kn-saved", JSON.stringify(Array.from(state.saved))); } catch (e) {}
  }

  // ---------- map ----------
  var map = L.map("map", { scrollWheelZoom: false }).setView([DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var markerLayer = L.layerGroup().addTo(map);
  var markers = {};
  var meMarker = null;

  function pinIcon(active) {
    return L.divIcon({ className: "", html: '<div class="pin' + (active ? " active" : "") + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  }

  // ---------- helpers ----------
  function kmBetween(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function priceText(p) {
    if (p.type === "free") return t("free");
    var per = window.I18N[state.lang].per[p.per] || p.per;
    return t("price", { amount: p.amount, per: per });
  }

  function timeText(a) {
    return a.time.replace("Berlin time", t("berlinTime"));
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- filters <-> URL, so parents can share a search ----------
  function readFilters() {
    var f = els.filters;
    return {
      age: f.age.value, category: f.category.value, day: f.day.value,
      format: f.format.value, radius: f.radius.value, free: f.free.checked, saved: f.saved.checked
    };
  }

  function writeUrl(filters) {
    var params = new URLSearchParams();
    Object.keys(filters).forEach(function (k) {
      var v = filters[k];
      if (v === true) params.set(k, "1");
      else if (v) params.set(k, v);
    });
    if (state.origin.exact && state.origin.query) params.set("near", state.origin.query);
    params.set("lang", state.lang);
    history.replaceState(null, "", "?" + params.toString());
  }

  function applyUrl() {
    var params = new URLSearchParams(location.search);
    var f = els.filters;
    ["age", "category", "day", "format", "radius"].forEach(function (k) { if (params.get(k)) f[k].value = params.get(k); });
    f.free.checked = params.get("free") === "1";
    f.saved.checked = params.get("saved") === "1";
    return params.get("near");
  }

  // ---------- filtering ----------
  function matches(a, f) {
    if (f.age) {
      var age = Number(f.age);
      if (age < a.ages[0] || age > a.ages[1]) return false;
    }
    if (f.category && a.category !== f.category) return false;
    if (f.day && a.days.indexOf(f.day) === -1) return false;
    if (f.format && a.format !== f.format) return false;
    if (f.free && a.price.type !== "free") return false;
    if (f.saved && !state.saved.has(a.id)) return false;
    if (f.radius && a.format === "in-person" && a.distance > Number(f.radius)) return false;
    return true;
  }

  function render() {
    var f = readFilters();
    writeUrl(f);

    state.activities.forEach(function (a) {
      a.distance = a.format === "in-person" ? kmBetween(state.origin, a) : null;
    });

    var results = state.activities.filter(function (a) { return matches(a, f); }).sort(function (a, b) {
      // In-person by distance first, online after.
      if (a.distance == null && b.distance == null) return tr(a, "title").localeCompare(tr(b, "title"), state.lang);
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });

    els.list.replaceChildren();
    markerLayer.clearLayers();
    markers = {};

    results.forEach(function (a) { els.list.appendChild(card(a)); });
    els.count.textContent = results.length === 1 ? t("count1") : t("countN", { n: results.length });
    els.empty.hidden = results.length > 0;

    var bounds = [];
    results.forEach(function (a) {
      if (a.format !== "in-person") return;
      var title = tr(a, "title");
      var m = L.marker([a.lat, a.lng], { icon: pinIcon(a.id === state.activeId), title: title })
        .bindPopup("<b>" + escapeHtml(title) + "</b><br>" + escapeHtml(timeText(a)) + " &middot; " + escapeHtml(priceText(a.price)))
        .on("click", function () { highlight(a.id, true); });
      m.addTo(markerLayer);
      markers[a.id] = m;
      bounds.push([a.lat, a.lng]);
    });
    if (state.origin.exact) bounds.push([state.origin.lat, state.origin.lng]);
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function card(a) {
    var title = tr(a, "title");
    var li = el("li", "item");
    li.id = "a-" + a.id;
    li.tabIndex = 0;
    if (a.id === state.activeId) li.classList.add("active");

    var row = el("div", "row");
    var head = el("div");
    head.appendChild(el("h2", null, title));
    head.appendChild(el("p", "org", tr(a, "organizer")));
    row.appendChild(head);

    var isSaved = state.saved.has(a.id);
    var save = el("button", "save", isSaved ? "♥" : "♡");
    save.type = "button";
    save.setAttribute("aria-pressed", String(isSaved));
    save.setAttribute("aria-label", t(isSaved ? "unsave" : "save", { title: title }));
    save.addEventListener("click", function (e) {
      e.stopPropagation();
      if (state.saved.has(a.id)) state.saved.delete(a.id); else state.saved.add(a.id);
      storeSaved();
      render();
    });
    row.appendChild(save);
    li.appendChild(row);

    li.appendChild(el("p", "desc", tr(a, "description")));

    var badges = el("ul", "badges");
    badges.appendChild(el("li", null, t("ages", { from: a.ages[0], to: a.ages[1] })));
    badges.appendChild(el("li", null, t("cat_" + a.category)));
    badges.appendChild(el("li", a.price.type === "free" ? "free" : null, priceText(a.price)));
    if (a.format === "online") badges.appendChild(el("li", "online", t("online")));
    else badges.appendChild(el("li", null, number(a.distance) + " km"));
    li.appendChild(badges);

    var days = a.days.map(function (d) { return t("day_" + d); }).join(", ");
    var address = tr(a, "address");
    li.appendChild(el("p", "meta", days + " · " + timeText(a) + (address ? " · " + address : "")));

    li.addEventListener("click", function () { highlight(a.id, false); });
    li.addEventListener("keydown", function (e) { if (e.key === "Enter") highlight(a.id, false); });
    return li;
  }

  function highlight(id, fromMap) {
    state.activeId = id;
    document.querySelectorAll(".item.active").forEach(function (n) { n.classList.remove("active"); });
    var node = document.getElementById("a-" + id);
    if (node) {
      node.classList.add("active");
      if (fromMap) node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    Object.keys(markers).forEach(function (k) { markers[k].setIcon(pinIcon(k === id)); });
    var m = markers[id];
    if (m && !fromMap) { map.panTo(m.getLatLng()); m.openPopup(); }
  }

  // ---------- location ----------
  function setOrigin(lat, lng, label, query) {
    state.origin = { lat: lat, lng: lng, label: label, exact: true, query: query };
    if (meMarker) meMarker.remove();
    meMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      title: t("you")
    }).addTo(map);
    setStatus("statusSorted", { place: label });
    render();
  }

  function geocode(query) {
    setStatus("statusLooking", { q: query });
    // OpenStreetMap's free geocoder. Fine for light use; see docs/system-design.md for production.
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&bounded=1&viewbox=" + BERLIN_VIEWBOX + "&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { "Accept-Language": state.lang } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows.length) { setStatus("statusNotFound", { q: query }); return; }
        var label = rows[0].display_name.split(",").slice(0, 2).join(",");
        setOrigin(Number(rows[0].lat), Number(rows[0].lon), label, query);
      })
      .catch(function () { setStatus("statusLookupFailed"); });
  }

  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = els.place.value.trim();
    if (q) geocode(q);
  });

  els.locate.addEventListener("click", function () {
    if (!navigator.geolocation) { setStatus("statusNoGeo"); return; }
    setStatus("statusFinding");
    navigator.geolocation.getCurrentPosition(
      function (pos) { setOrigin(pos.coords.latitude, pos.coords.longitude, "@me"); },
      function () { setStatus("statusDenied"); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });

  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { if (b.dataset.lang !== state.lang) setLang(b.dataset.lang); });
  });

  // ---------- start ----------
  for (var age = 1; age <= 16; age++) {
    var o = document.createElement("option");
    o.value = age;
    els.filters.age.appendChild(o);
  }
  var near = applyUrl();
  translatePage();
  els.filters.addEventListener("change", render);

  fetch("data/activities.json")
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      state.activities = rows;
      if (near) { els.place.value = near; geocode(near); } else render();
    })
    .catch(function () { setStatus("statusLoadFailed"); });
})();
