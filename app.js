(function () {
  "use strict";

  var DEFAULT_ORIGIN = { lat: 52.5200, lng: 13.4050, label: "Berlin", exact: false };
  // Berlin bounding box (west, north, east, south) so lookups stay inside the city.
  var BERLIN_VIEWBOX = "13.08,52.68,13.77,52.33";
  var LANGS = ["de", "en", "ru"];
  var LOCALES = { de: "de-DE", en: "en-GB", ru: "ru-RU" };
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var EVENTS_PREVIEW = 4;

  var state = {
    origin: DEFAULT_ORIGIN, activities: [], events: [], saved: loadSaved(), activeId: null,
    lang: pickLang(), status: { key: "statusDefault", vars: {} }, showAllEvents: false
  };
  var els = {
    form: document.getElementById("where"),
    place: document.getElementById("place"),
    locate: document.getElementById("locate"),
    status: document.getElementById("status"),
    filters: document.getElementById("filters"),
    list: document.getElementById("list"),
    count: document.getElementById("count"),
    empty: document.getElementById("empty"),
    eventList: document.getElementById("event-list"),
    eventsCount: document.getElementById("events-count"),
    eventsMore: document.getElementById("events-more"),
    eventsEmpty: document.getElementById("events-empty")
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
    var browser = ((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase().slice(0, 2);
    return LANGS.indexOf(browser) !== -1 ? browser : "en";
  }

  function t(key, vars) {
    var s = window.I18N[state.lang][key];
    if (s == null) s = window.I18N.en[key];
    if (s == null) return key;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ""; });
  }

  // Plural-aware text: picks key_one / key_few / key_many / key_other for the current language.
  function tn(key, n, vars) {
    var form = new Intl.PluralRules(locale()).select(n);
    var dict = window.I18N[state.lang];
    var k = dict[key + "_" + form] != null ? key + "_" + form : key + "_other";
    return t(k, Object.assign({ n: n }, vars));
  }

  // Listing text in the current language, falling back to English.
  function tr(a, field) {
    return (state.lang !== "en" && a[state.lang] && a[state.lang][field]) || a[field];
  }

  function locale() { return LOCALES[state.lang]; }

  function number(n) {
    return n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
      if (o.value) o.textContent = tn("years", Number(o.value));
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
    });
    document.querySelectorAll("a[data-keep-lang]").forEach(function (a) {
      a.href = a.dataset.keepLang + "?lang=" + state.lang;
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

  // ---------- dates (always Berlin time, whatever the visitor's device says) ----------
  function berlinNow() {
    var parts = {};
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { date: parts.year + "-" + parts.month + "-" + parts.day, time: parts.hour + ":" + parts.minute };
  }

  function utcDate(iso) {
    var p = iso.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  function addDays(iso, n) {
    var d = utcDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function isUpcoming(e, now) {
    if (e.date > now.date) return true;
    return e.date === now.date && (e.end || "23:59") > now.time;
  }

  // ---------- storage (saved items stay in this browser only) ----------
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

  function pinIcon(active, isEvent) {
    var cls = "pin" + (isEvent ? " event-pin" : "") + (active ? " active" : "");
    return L.divIcon({ className: "", html: '<div class="' + cls + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
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
    history.replaceState(null, "", "?" + params.toString() + location.hash);
  }

  function applyUrl() {
    var params = new URLSearchParams(location.search);
    var f = els.filters;
    ["age", "category", "day", "format", "radius"].forEach(function (k) { if (params.get(k)) f[k].value = params.get(k); });
    f.free.checked = params.get("free") === "1";
    f.saved.checked = params.get("saved") === "1";
    return params.get("near");
  }

  // ---------- filtering (same rules for activities and events) ----------
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

    state.activities.concat(state.events).forEach(function (a) {
      a.distance = a.format === "in-person" ? kmBetween(state.origin, a) : null;
    });

    var results = state.activities.filter(function (a) { return matches(a, f); }).sort(function (a, b) {
      // In-person by distance first, online after.
      if (a.distance == null && b.distance == null) return tr(a, "title").localeCompare(tr(b, "title"), state.lang);
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });

    var now = berlinNow();
    var upcoming = state.events.filter(function (e) { return isUpcoming(e, now) && matches(e, f); })
      .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });

    els.list.replaceChildren();
    markerLayer.clearLayers();
    markers = {};

    results.forEach(function (a) { els.list.appendChild(card(a)); });
    els.count.textContent = tn("count", results.length);
    els.empty.hidden = results.length > 0;

    renderEvents(upcoming, now);

    var bounds = [];
    function pin(a, isEvent) {
      if (a.format !== "in-person") return;
      var title = tr(a, "title");
      var when = isEvent ? dayLabel(a, now) + ", " + a.start + "–" + a.end : timeText(a);
      var m = L.marker([a.lat, a.lng], { icon: pinIcon(a.id === state.activeId, isEvent), title: title })
        .bindPopup("<b>" + escapeHtml(title) + "</b><br>" + escapeHtml(when) + " &middot; " + escapeHtml(priceText(a.price)))
        .on("click", function () { highlight(a.id, true); });
      m.isEvent = isEvent;
      m.addTo(markerLayer);
      markers[a.id] = m;
      bounds.push([a.lat, a.lng]);
    }
    results.forEach(function (a) { pin(a, false); });
    upcoming.forEach(function (e) { pin(e, true); });
    if (state.origin.exact) bounds.push([state.origin.lat, state.origin.lng]);
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }

  // ---------- activity cards ----------
  function saveButton(a, title) {
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
    return save;
  }

  function badgesFor(a) {
    var badges = el("ul", "badges");
    badges.appendChild(el("li", null, t("ages", { from: a.ages[0], to: a.ages[1] })));
    badges.appendChild(el("li", null, t("cat_" + a.category)));
    badges.appendChild(el("li", a.price.type === "free" ? "free" : null, priceText(a.price)));
    if (a.format === "online") badges.appendChild(el("li", "online", t("online")));
    else badges.appendChild(el("li", null, t("km", { n: number(a.distance) })));
    return badges;
  }

  function selectable(li, id) {
    li.id = "item-" + id;
    li.tabIndex = 0;
    if (id === state.activeId) li.classList.add("active");
    li.addEventListener("click", function () { highlight(id, false); });
    li.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target === li) highlight(id, false); });
  }

  function card(a) {
    var title = tr(a, "title");
    var li = el("li", "item");
    selectable(li, a.id);

    var row = el("div", "row");
    var head = el("div");
    head.appendChild(el("h2", null, title));
    head.appendChild(el("p", "org", tr(a, "organizer")));
    row.appendChild(head);
    row.appendChild(saveButton(a, title));
    li.appendChild(row);

    li.appendChild(el("p", "desc", tr(a, "description")));
    li.appendChild(badgesFor(a));

    var days = a.days.map(function (d) { return t("day_" + d); }).join(", ");
    var address = tr(a, "address");
    li.appendChild(el("p", "meta", days + " · " + timeText(a) + (address ? " · " + address : "")));
    return li;
  }

  // ---------- events ----------
  function dayLabel(e, now) {
    if (e.date === now.date) return t("today");
    if (e.date === addDays(now.date, 1)) return t("tomorrow");
    var s = utcDate(e.date).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    return s.charAt(0).toUpperCase() + s.slice(1); // Russian weekdays come lowercase
  }

  function renderEvents(upcoming, now) {
    var shown = state.showAllEvents ? upcoming : upcoming.slice(0, EVENTS_PREVIEW);
    els.eventList.replaceChildren();
    shown.forEach(function (e) { els.eventList.appendChild(eventCard(e, now)); });
    els.eventList.classList.toggle("collapsed", !state.showAllEvents);
    els.eventsCount.textContent = upcoming.length ? "(" + upcoming.length + ")" : "";
    els.eventsEmpty.hidden = upcoming.length > 0;
    els.eventsMore.hidden = upcoming.length <= EVENTS_PREVIEW;
    els.eventsMore.textContent = state.showAllEvents ? t("showLess") : t("showAll", { n: upcoming.length });
  }

  function eventCard(e, now) {
    var title = tr(e, "title");
    var li = el("li", "event");
    selectable(li, e.id);

    var d = utcDate(e.date);
    var when = el("div", "when");
    var badge = el("div", "date");
    badge.setAttribute("aria-hidden", "true");
    badge.appendChild(el("b", null, String(d.getUTCDate())));
    badge.appendChild(el("small", null, d.toLocaleDateString(locale(), { month: "short", timeZone: "UTC" }).replace(".", "")));
    when.appendChild(badge);
    var day = el("p", "day");
    day.style.margin = "0";
    day.appendChild(el("b", null, dayLabel(e, now)));
    day.appendChild(document.createElement("br"));
    day.appendChild(document.createTextNode(e.start + "–" + e.end));
    when.appendChild(day);
    li.appendChild(when);

    li.appendChild(el("h3", null, title));
    li.appendChild(badgesFor(e));
    var place = tr(e, "address");
    li.appendChild(el("p", "place", (place ? place + " · " : "") + tr(e, "organizer")));
    var desc = tr(e, "description");
    if (desc) li.appendChild(el("p", "desc", desc));

    var acts = el("div", "acts");
    var cal = el("button", null, t("addToCalendar"));
    cal.type = "button";
    cal.addEventListener("click", function (ev) { ev.stopPropagation(); downloadIcs(e); });
    acts.appendChild(cal);
    if (e.link) {
      var post = el("a", null, t("seePost") + " ↗");
      post.href = e.link; post.target = "_blank"; post.rel = "noopener";
      post.addEventListener("click", function (ev) { ev.stopPropagation(); });
      acts.appendChild(post);
    }
    li.appendChild(acts);
    return li;
  }

  // A one-event .ics file that Google, Apple and Outlook calendars can import.
  function downloadIcs(e) {
    function esc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n"); }
    function stamp(date, time) { return date.replace(/-/g, "") + "T" + time.replace(":", "") + "00"; }
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kids Nearby Berlin//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + e.id + "@kids-nearby",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;TZID=Europe/Berlin:" + stamp(e.date, e.start),
      "DTEND;TZID=Europe/Berlin:" + stamp(e.date, e.end),
      "SUMMARY:" + esc(tr(e, "title")),
      "DESCRIPTION:" + esc(tr(e, "description") + (e.link ? "\n" + e.link : "")),
      "LOCATION:" + esc(e.format === "online" ? "Online" : tr(e, "address"))
    ];
    if (e.link) lines.push("URL:" + e.link);
    lines.push("END:VEVENT", "END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = e.id + ".ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  els.eventsMore.addEventListener("click", function () {
    state.showAllEvents = !state.showAllEvents;
    render();
  });

  function highlight(id, fromMap) {
    state.activeId = id;
    document.querySelectorAll(".item.active, .event.active").forEach(function (n) { n.classList.remove("active"); });
    var node = document.getElementById("item-" + id);
    if (node) {
      node.classList.add("active");
      if (fromMap) node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
    Object.keys(markers).forEach(function (k) { markers[k].setIcon(pinIcon(k === id, markers[k].isEvent)); });
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

  function getJson(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + ": " + r.status);
      return r.json();
    });
  }

  Promise.all([
    getJson("data/activities.json"),
    getJson("data/events.json").catch(function () { return []; }) // events are optional
  ])
    .then(function (data) {
      state.activities = data[0];
      state.events = data[1].map(function (e) {
        e.days = [WEEKDAYS[utcDate(e.date).getUTCDay()]]; // lets the day filter work on events
        return e;
      });
      if (near) { els.place.value = near; geocode(near); } else render();
    })
    .catch(function () { setStatus("statusLoadFailed"); });
})();
