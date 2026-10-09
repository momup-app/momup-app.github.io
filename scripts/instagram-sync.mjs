#!/usr/bin/env node
// Reads @momup_app's recent Instagram posts, turns #momupevent posts into events,
// and updates data/events.json. Run by .github/workflows/instagram-sync.yml every hour.
//
//   IG_ACCESS_TOKEN=... node scripts/instagram-sync.mjs
//   node scripts/instagram-sync.mjs --fixture scripts/fixtures/sample-media.json --dry-run
//
// Events added by hand (no "source": "instagram") are never touched.

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { parseCaption } from "./parse-caption.mjs";

const EVENTS_FILE = new URL("../data/events.json", import.meta.url);
const CACHE_FILE = new URL("../data/geocode-cache.json", import.meta.url);
const MAX_AGE_DAYS = 180; // older posts can't be upcoming events
const MAX_PAGES = 5;
const BERLIN_VIEWBOX = "13.08,52.68,13.77,52.33";
const USER_AGENT = "kids-nearby-sync (https://github.com/momup-app/momup-app.github.io)";

const args = process.argv.slice(2);
const fixture = args.includes("--fixture") ? args[args.indexOf("--fixture") + 1] : null;
const dryRun = args.includes("--dry-run");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, "utf8")); } catch { return fallback; }
}

// ---------- Instagram ----------
async function fetchMedia(token) {
  const posts = [];
  const oldest = Date.now() - MAX_AGE_DAYS * 86400000;
  let url = "https://graph.instagram.com/me/media?fields=id,caption,permalink,timestamp&limit=50&access_token=" + encodeURIComponent(token);
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const e = body.error || {};
      // Never print the URL: it contains the token.
      if (e.code === 190) throw new Error("Instagram token is invalid or expired. Create a new one (docs/instagram-sync.md, step 3).");
      throw new Error(`Instagram API error ${res.status}: ${e.message || "unknown"}`);
    }
    posts.push(...body.data);
    const last = body.data[body.data.length - 1];
    if (!last || Date.parse(last.timestamp) < oldest) break;
    url = body.paging && body.paging.next;
  }
  return posts.filter((p) => Date.parse(p.timestamp) >= oldest);
}

// ---------- geocoding (OpenStreetMap Nominatim: max 1 request per second) ----------
async function geocode(address, cache) {
  const query = /berlin/i.test(address) ? address : address + ", Berlin";
  if (query in cache) return cache[query];
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&bounded=1&viewbox=" +
    BERLIN_VIEWBOX + "&q=" + encodeURIComponent(query);
  await sleep(1100);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" } });
  if (!res.ok) return null; // don't cache temporary failures
  const rows = await res.json();
  cache[query] = rows.length ? { lat: +Number(rows[0].lat).toFixed(5), lng: +Number(rows[0].lon).toFixed(5) } : null;
  return cache[query];
}

// ---------- main ----------
async function main() {
  let posts;
  if (fixture) {
    posts = JSON.parse(await readFile(fixture, "utf8"));
  } else {
    const token = process.env.IG_ACCESS_TOKEN;
    if (!token) {
      console.log("::notice::IG_ACCESS_TOKEN is not set yet, nothing to sync. See docs/instagram-sync.md.");
      return;
    }
    posts = await fetchMedia(token);
  }

  const cache = await readJson(CACHE_FILE, {});
  const synced = [];
  const problems = [];

  for (const post of posts) {
    const r = parseCaption(post.caption, { postedAt: post.timestamp, id: post.id, permalink: post.permalink });
    if (!r.ok) {
      if (!r.skip) problems.push({ post, reason: r.reason });
      continue;
    }
    const event = r.event;
    if (event.format === "in-person") {
      const point = await geocode(event.address, cache);
      if (!point) { problems.push({ post, reason: `can't find “${event.address}” on the map` }); continue; }
      event.lat = point.lat;
      event.lng = point.lng;
    }
    synced.push(event);
  }

  const before = await readJson(EVENTS_FILE, []);
  const manual = before.filter((e) => e.source !== "instagram");
  const oldIds = new Set(before.filter((e) => e.source === "instagram").map((e) => e.id));
  const after = [...manual, ...synced].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const added = synced.filter((e) => !oldIds.has(e.id)).length;
  const removed = [...oldIds].filter((id) => !synced.some((e) => e.id === id)).length;
  const changed = JSON.stringify(before) !== JSON.stringify(after);

  const lines = [
    `### Instagram sync`,
    ``,
    `Read ${posts.length} posts: ${synced.length} events (${added} new, ${removed} removed), ${problems.length} need fixing.`,
  ];
  if (problems.length) {
    lines.push("", "| Post | What to fix |", "|---|---|");
    for (const p of problems) lines.push(`| [${(p.post.caption || "").split("\n")[0].slice(0, 40)}](${p.post.permalink}) | ${p.reason} |`);
  }
  console.log(lines.join("\n"));
  for (const p of problems) console.log(`::warning::${p.post.permalink}: ${p.reason}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");

  if (dryRun) {
    console.log("\n--dry-run: not writing files. Events from Instagram:\n" + JSON.stringify(synced, null, 2));
    return;
  }
  if (changed) await writeFile(EVENTS_FILE, JSON.stringify(after, null, 2) + "\n");
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");
  console.log(changed ? "events.json updated." : "No changes to events.json.");
}

main().catch((err) => {
  console.error("::error::" + err.message);
  process.exit(1);
});
