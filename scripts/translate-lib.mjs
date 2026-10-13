// Pure logic for translating listings (no network, so it's easy to test: translate-lib.test.mjs).
// The translating itself is done by Google's free translator in translate-listings.mjs.
// Every text is translated once into all site languages and kept in data/translations-cache.json,
// keyed by a hash of the original text. Hand-made translations in a listing always win.

import { createHash } from "node:crypto";

export const LANGS = ["en", "de", "uk", "ru"];
export const FIELDS = ["title", "organizer", "description", "address", "district"];

/** Cache key for one original text. The field is part of it: an address is translated differently from a title. */
export function textKey(field, text) {
  return createHash("sha1").update(field + "\u0000" + text.trim()).digest("hex").slice(0, 16);
}

function original(item, field) {
  const v = item[field];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

// Fields filled in from the cache are listed in "autoTranslated" (e.g. "uk.title"), so they keep following the
// cache. Anything else in a listing's "uk"/"ru"/… block was written by hand and is never replaced.
function isAuto(item, lang, field) {
  return Array.isArray(item.autoTranslated) && item.autoTranslated.includes(lang + "." + field);
}

function hasOwn(item, lang, field) {
  const v = item[lang] && item[lang][field];
  return typeof v === "string" && v.trim() !== "" && !isAuto(item, lang, field);
}

/** Texts that still need translating: [{ key, field, text }], each text once. */
export function missingTexts(items, cache) {
  const todo = new Map();
  for (const item of items) {
    for (const field of FIELDS) {
      const text = original(item, field);
      if (!text) continue;
      const key = textKey(field, text);
      const cached = cache[key];
      const needed = LANGS.some((lang) => !hasOwn(item, lang, field) && !(cached && cached[lang]));
      if (needed && !todo.has(key)) todo.set(key, { key, field, text });
    }
  }
  return [...todo.values()];
}

/** Returns new listings with every language filled in from the cache (the input is left untouched). */
export function applyTranslations(items, cache) {
  return items.map((item) => {
    const next = { ...item };
    const auto = [];
    for (const lang of LANGS) {
      const block = { ...(item[lang] || {}) };
      for (const field of FIELDS) {
        const text = original(item, field);
        if (!text || hasOwn(item, lang, field)) continue;
        const cached = cache[textKey(field, text)];
        if (cached && cached[lang]) {
          block[field] = cached[lang];
          auto.push(lang + "." + field);
        } else if (isAuto(item, lang, field)) {
          delete block[field]; // its text changed and has no translation yet: show the original instead
        }
      }
      if (Object.keys(block).length) next[lang] = block;
      else delete next[lang];
    }
    if (auto.length) next.autoTranslated = auto;
    else delete next.autoTranslated;
    return next;
  });
}

/** Adds checked results to the cache. Skips anything incomplete, so it's asked again next run. */
export function mergeResults(cache, asked, results) {
  const byKey = new Map(asked.map((a) => [a.key, a]));
  const next = { ...cache };
  for (const r of results) {
    if (!byKey.has(r.key)) continue;
    const complete = LANGS.every((lang) => typeof r[lang] === "string" && r[lang].trim());
    if (!complete) continue;
    next[r.key] = Object.fromEntries(LANGS.map((lang) => [lang, r[lang].trim()]));
  }
  return next;
}

/** Drops cache entries no listing uses any more, so the file doesn't grow forever. */
export function pruneCache(cache, items) {
  const used = new Set();
  for (const item of items) {
    for (const field of FIELDS) {
      const text = original(item, field);
      if (text) used.add(textKey(field, text));
    }
  }
  return Object.fromEntries(Object.entries(cache).filter(([k]) => used.has(k)));
}

export function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Addresses: only the venue name is translated. Street, house number and postcode stay as written,
// because moms need them for maps and street signs. "Venue, Street 1, 12345 Berlin" → { venue, rest }.
export function splitAddress(text) {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3 || /\d/.test(parts[0])) return null; // no venue name in front
  return { venue: parts[0], rest: parts.slice(1).join(", ") };
}

// In Ukrainian and Russian, the original name follows in brackets, so it still matches signs and Google Maps.
const KEEP_ORIGINAL = ["uk", "ru"];
export function withOriginal(lang, translated, original) {
  if (!translated || translated === original) return original;
  return KEEP_ORIGINAL.includes(lang) ? `${translated} (${original})` : translated;
}

export function composeAddress(lang, translatedVenue, venue, rest) {
  return `${withOriginal(lang, translatedVenue, venue)}, ${rest}`;
}

/** Text and detected language from Google's free translator. Two answer shapes exist:
 *  clients5 "dict-chrome-ex": [["text", "de"]]   ·   googleapis "gtx": [[["Sentence. ", "Satz. "], …], null, "de"] */
export function readGoogleAnswer(body) {
  const first = Array.isArray(body) ? body[0] : null;
  if (Array.isArray(first) && typeof first[0] === "string") {
    return { text: first[0], detected: typeof first[1] === "string" ? first[1] : null };
  }
  if (typeof first === "string") return { text: first, detected: null };
  const text = (first || []).map((part) => part && part[0]).filter(Boolean).join("");
  return { text, detected: body && typeof body[2] === "string" ? body[2] : null };
}
