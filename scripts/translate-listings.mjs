// Translates every listing into all site languages (en, de, uk, ru) with Google's free translator, so a mom
// who only reads Ukrainian or Russian sees berlin.de and Instagram events in her language too.
// Run after the imports by .github/workflows/berlin-events.yml and instagram-sync.yml. No account or key needed.
// Google's free endpoint is unofficial: if it refuses, the listings stay as they are and the rest waits for the next run.

import { readFile, writeFile } from "node:fs/promises";
import {
  LANGS, missingTexts, applyTranslations, mergeResults, pruneCache,
  splitAddress, withOriginal, composeAddress, readGoogleAnswer,
} from "./translate-lib.mjs";

const FILES = ["activities.json", "events.json", "berlin-events.json"].map((f) => new URL("../data/" + f, import.meta.url));
const CACHE_FILE = new URL("../data/translations-cache.json", import.meta.url);
// The "dict-chrome-ex" address answers scripts; translate.googleapis.com/…client=gtx refuses Node with 429.
const ENDPOINT = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto";
const MAX_TEXTS = 300;  // per run; each text is 4 requests. The rest come next run.
const PAUSE_MS = 250;   // between requests, to stay polite
const MAX_CHARS = 4500; // longer texts are left untranslated

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Refused extends Error {}

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, "utf8")); } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}

// Each data file keeps its own indentation, so a run doesn't reformat the whole file.
async function indentOf(url) {
  const m = (await readFile(url, "utf8")).match(/\n( +)"/);
  return m ? m[1].length / 2 : 1;
}

async function google(text, lang) {
  await sleep(PAUSE_MS);
  const res = await fetch(`${ENDPOINT}&tl=${lang}&q=${encodeURIComponent(text)}`);
  if (res.status === 429 || res.status === 403) throw new Refused(`Google refused (${res.status})`);
  if (!res.ok) throw new Error(`Google answered ${res.status}`);
  return readGoogleAnswer(await res.json());
}

/** One text in all four languages, plus the language Google detected (which keeps the original text). */
async function translateAll(text) {
  const out = {};
  let source = null;
  for (const lang of LANGS) {
    const { text: translated, detected } = await google(text, lang);
    source = source || detected;
    out[lang] = detected === lang ? text : translated || text;
  }
  return { out, source };
}

// German names are what moms see on signs and in Google Maps, so only those keep the original in brackets.
const SIGN_LANGUAGE = "de";

async function translateItem({ field, text }) {
  if (text.length > MAX_CHARS) return null;
  if (field === "address") {
    const parts = splitAddress(text);
    if (!parts) return Object.fromEntries(LANGS.map((l) => [l, text])); // nothing to translate in a bare street address
    const venue = await translateAll(parts.venue);
    return Object.fromEntries(LANGS.map((l) => [l, venue.source === SIGN_LANGUAGE
      ? composeAddress(l, venue.out[l], parts.venue, parts.rest)
      : `${venue.out[l]}, ${parts.rest}`]));
  }
  const all = await translateAll(text);
  if (field === "organizer" && all.source === SIGN_LANGUAGE) {
    return Object.fromEntries(LANGS.map((l) => [l, withOriginal(l, all.out[l], text)]));
  }
  return all.out;
}

async function main() {
  const lists = await Promise.all(FILES.map((f) => readJson(f, [])));
  const all = lists.flat();
  let cache = await readJson(CACHE_FILE, {});

  const todo = missingTexts(all, cache).slice(0, MAX_TEXTS);
  let done = 0;
  for (const item of todo) {
    try {
      const result = await translateItem(item);
      if (result) { cache = mergeResults(cache, [item], [{ key: item.key, ...result }]); done++; }
    } catch (e) {
      if (e instanceof Refused) {
        console.log(`::warning::${e.message}. ${todo.length - done} texts wait for the next run.`);
        break;
      }
      console.log(`::warning::Skipped one text (${e.message}); it's tried again next run.`);
    }
  }
  console.log(todo.length ? `Translated ${done} of ${todo.length} texts.` : "Every listing is already translated.");

  cache = pruneCache(cache, all);
  await Promise.all(FILES.map(async (file, i) => {
    const before = JSON.stringify(lists[i]);
    const after = applyTranslations(lists[i], cache);
    if (JSON.stringify(after) !== before) await writeFile(file, JSON.stringify(after, null, await indentOf(file)) + "\n");
  }));
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
