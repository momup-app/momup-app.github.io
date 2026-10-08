(function () {
  "use strict";

  var DEFAULT_ORIGIN = { lat: 52.5200, lng: 13.4050, label: "Berlin", exact: false };
  // Berlin bounding box (west, north, east, south) so lookups stay inside the city.
  var BERLIN_VIEWBOX = "13.08,52.68,13.77,52.33";
  var CATEGORY_NAMES = {
    sports: "Sports", arts: "Arts & crafts", music: "Music", dance: "Dance",
    stem: "STEM & coding", language: "Languages & reading", outdoors: "Outdoors"
  };

  var state = { origin: DEFAULT_ORIGIN, activities: [], saved: loadSaved(), activeId: null };
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
    if (p.type === "free") return "Free";
    return "€" + p.amount + " / " + p.per;
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
    var qs = params.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
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
      if (a.distance == null && b.distance == null) return a.title.localeCompare(b.title);
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });

    els.list.replaceChildren();
    markerLayer.clearLayers();
    markers = {};

    results.forEach(function (a) { els.list.appendChild(card(a)); });
    els.count.textContent = results.length + (results.length === 1 ? " activity" : " activities");
    els.empty.hidden = results.length > 0;

    var bounds = [];
    results.forEach(function (a) {
      if (a.format !== "in-person") return;
      var m = L.marker([a.lat, a.lng], { icon: pinIcon(a.id === state.activeId), title: a.title })
        .bindPopup("<b>" + escapeHtml(a.title) + "</b><br>" + escapeHtml(a.time) + " &middot; " + escapeHtml(priceText(a.price)))
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
    var li = el("li", "item");
    li.id = "a-" + a.id;
    li.tabIndex = 0;
    if (a.id === state.activeId) li.classList.add("active");

    var row = el("div", "row");
    var head = el("div");
    head.appendChild(el("h2", null, a.title));
    head.appendChild(el("p", "org", a.organizer));
    row.appendChild(head);

    var save = el("button", "save", state.saved.has(a.id) ? "♥" : "♡");
    save.type = "button";
    save.setAttribute("aria-pressed", String(state.saved.has(a.id)));
    save.setAttribute("aria-label", (state.saved.has(a.id) ? "Remove " : "Save ") + a.title);
    save.addEventListener("click", function (e) {
      e.stopPropagation();
      if (state.saved.has(a.id)) state.saved.delete(a.id); else state.saved.add(a.id);
      storeSaved();
      render();
    });
    row.appendChild(save);
    li.appendChild(row);

    li.appendChild(el("p", "desc", a.description));

    var badges = el("ul", "badges");
    badges.appendChild(el("li", null, "Ages " + a.ages[0] + "–" + a.ages[1]));
    badges.appendChild(el("li", null, CATEGORY_NAMES[a.category] || a.category));
    badges.appendChild(el("li", a.price.type === "free" ? "free" : null, priceText(a.price)));
    if (a.format === "online") badges.appendChild(el("li", "online", "Online"));
    else badges.appendChild(el("li", null, a.distance.toFixed(1) + " km"));
    li.appendChild(badges);

    li.appendChild(el("p", "meta", a.days.join(", ") + " · " + a.time + (a.address ? " · " + a.address : "")));

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
      title: "You"
    }).addTo(map);
    els.status.textContent = "Sorted by distance from " + label + ".";
    render();
  }

  function geocode(query) {
    els.status.textContent = "Looking up " + query + "…";
    // OpenStreetMap's free geocoder. Fine for light use; see docs/system-design.md for production.
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&bounded=1&viewbox=" + BERLIN_VIEWBOX + "&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { "Accept-Language": "en" } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows.length) { els.status.textContent = "Couldn't find “" + query + "” in Berlin. Try a postcode, e.g. 10437."; return; }
        var label = rows[0].display_name.split(",").slice(0, 2).join(",");
        setOrigin(Number(rows[0].lat), Number(rows[0].lon), label, query);
      })
      .catch(function () { els.status.textContent = "Location lookup failed. Check your connection and try again."; });
  }

  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = els.place.value.trim();
    if (q) geocode(q);
  });

  els.locate.addEventListener("click", function () {
    if (!navigator.geolocation) { els.status.textContent = "Your browser can't share location. Enter a postcode instead."; return; }
    els.status.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      function (pos) { setOrigin(pos.coords.latitude, pos.coords.longitude, "your location"); },
      function () { els.status.textContent = "Location permission was denied. Enter a postcode instead."; },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });

  // ---------- start ----------
  for (var age = 1; age <= 16; age++) {
    var o = document.createElement("option");
    o.value = age; o.textContent = age + (age === 1 ? " year" : " years");
    els.filters.age.appendChild(o);
  }
  var near = applyUrl();
  els.filters.addEventListener("change", render);

  fetch("data/activities.json")
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      state.activities = rows;
      if (near) { els.place.value = near; geocode(near); } else render();
    })
    .catch(function () {
      els.status.textContent = "Couldn't load activities. If you opened the file directly, run a local server (see README).";
    });
})();
