#!/usr/bin/env node
// Reads upcoming kids' and family events from the berlin.de state calendar and writes
// data/berlin-events.json. Run twice a day by .github/workflows/berlin-events.yml.
//
//   node scripts/berlin-sync.mjs            (writes the files)
//   node scripts/berlin-sync.mjs --dry-run  (only prints counts)
//
// Gentle on purpose: berlin.de allows automated reading when the program names itself
// (see berlin.de/robots.txt), and it redirects programs that ask too much. So each run reads
// ONE feed (the next 100 kids' events, about 3 to 4 days) plus at most MAX_PAGES new event pages,
// a few seconds apart. Events from earlier runs are kept until they're over, so the list grows.

import { readFile, writeFile } from "node:fs/promises";
import {
  parseRss, parseDetail, toEvent, isForFamilies, addressOf, berlinToday, addDays, CALENDAR, KIDS_CATEGORY, SOURCE_NAME
} from "./berlin-lib.mjs";

const FEED_URL = `${CALENDAR}?rss&c=22&${KIDS_CATEGORY}`;
const MAX_PAGES = 60;   // new event pages per run; the rest come next run
const PAUSE_MS = 4000;  // between requests to berlin.de
const OUT_FILE = new URL("../data/berlin-events.json", import.meta.url);
const PLACES_FILE = new URL("../data/berlin-places.json", import.meta.url);
const GEO_FILE = new URL("../data/geocode-cache.json", import.meta.url);
const USER_AGENT = "MomUp-KidsNearby-EventSync/1.0 (+https://github.com/momup-app/momup-app.github.io)";
const BERLIN_VIEWBOX = "13.08,52.68,13.77,52.33";
const dryRun = process.argv.includes("--dry-run");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, "utf8")); } catch { return fallback; }
}

// One page from berlin.de, after a pause. A redirect means berlin.de didn't give us what we asked
// for (it sends programs it wants to slow down elsewhere), so it counts as a failure, never as data.
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS * attempt);
    try {
      const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" } });
      if (res.status >= 300 && res.status < 400) throw new Error(`redirected (${res.status})`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 3) throw new Error(`${err.message}${err.cause ? " (" + (err.cause.code || err.cause.message) + ")" : ""} for ${url}`);
    }
  }
}

// OpenStreetMap Nominatim: one request per second, results cached for good.
async function geocode(query, cache) {
  if (!query) return null;
  if (query in cache) return cache[query];
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&bounded=1&viewbox=" +
    BERLIN_VIEWBOX + "&q=" + encodeURIComponent(query);
  await sleep(1100);
  let rows;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" } });
    if (!res.ok) return null; // don't cache temporary failures
    rows = await res.json();
  } catch {
    return null;
  }
  cache[query] = rows.length ? { lat: +Number(rows[0].lat).toFixed(5), lng: +Number(rows[0].lon).toFixed(5) } : null;
  return cache[query];
}

async function main() {
  const today = berlinToday();
  const places = await readJson(PLACES_FILE, {});
  const geo = await readJson(GEO_FILE, {});
  const before = await readJson(OUT_FILE, []);

  // 1. The feed: the next 100 kids' events. A repeating event (an exhibition, a weekly group) is kept once, on its next date.
  const items = parseRss(await get(FEED_URL));
  if (!items.length) throw new Error("The berlin.de feed had no events. Nothing changed.");
  const next = new Map();
  for (const item of items) if (!next.has(item.id) && item.date >= today && isForFamilies(item)) next.set(item.id, item);

  // 2. New event pages: place, address, district, organizer. At most MAX_PAGES per run.
  let read = 0, failed = 0, waiting = 0;
  for (const id of next.keys()) {
    if (places[id]) continue;
    if (read + failed >= MAX_PAGES || failed >= 5) { waiting++; continue; } // after 5 failures berlin.de is busy: next run
    try {
      places[id] = parseDetail(await get(`${CALENDAR}?detail=${id}`));
      read++;
    } catch (err) {
      failed++;
      if (failed === 1) console.log("::warning::" + err.message);
    }
  }

  // 3. Map position: the street address, else the place's name, else the postcode.
  const events = new Map();
  let noMap = 0;
  for (const item of next.values()) {
    const d = places[item.id];
    if (!d || (!d.city && !d.street && !d.place)) continue;
    const point = (await geocode(addressOf(d), geo))
      || (d.place && await geocode(d.place + ", Berlin", geo))
      || (d.city && await geocode(d.city, geo));
    if (!point) { noMap++; continue; }
    events.set("berlin-" + item.id, toEvent(item, d, point));
  }
  // Earlier runs' events that aren't in this feed (the feed moved on): keep them until they're over.
  for (const e of before) if (!events.has(e.id) && e.date >= today) events.set(e.id, e);

  const list = [...events.values()].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  // Forget pages of events that are long gone, so the file doesn't grow forever.
  for (const id of next.keys()) if (places[id]) places[id].seen = today;
  for (const id of Object.keys(places)) if (!places[id].seen || places[id].seen < addDays(today, -30)) delete places[id];

  console.log(`${SOURCE_NAME}: ${items.length} in the feed, ${next.size} for families, ${read} new pages read, ` +
    `${failed} failed, ${waiting} left for the next run, ${noMap} without a map position, ${list.length} upcoming events in total ` +
    `(${list.length ? list[0].date + " to " + list[list.length - 1].date : "none"}).`);
  if (dryRun) return;
  await writeFile(OUT_FILE, JSON.stringify(list, null, 1) + "\n");
  await writeFile(PLACES_FILE, JSON.stringify(places, null, 1) + "\n");
  await writeFile(GEO_FILE, JSON.stringify(geo, null, 1) + "\n");
}

main().catch((err) => {
  console.error("::error::" + err.message);
  process.exit(1);
});
