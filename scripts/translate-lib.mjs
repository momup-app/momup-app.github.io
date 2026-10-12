// Pure logic for translating listings (no network, so it's easy to test: translate-lib.test.mjs).
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

function hasOwn(item, lang, field) {
  const v = item[lang] && item[lang][field];
  return typeof v === "string" && v.trim() !== "";
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
    for (const lang of LANGS) {
      const block = { ...(item[lang] || {}) };
      for (const field of FIELDS) {
        const text = original(item, field);
        if (!text || hasOwn(item, lang, field)) continue;
        const cached = cache[textKey(field, text)];
        if (cached && cached[lang]) block[field] = cached[lang];
      }
      if (Object.keys(block).length) next[lang] = block;
    }
    return next;
  });
}

/** Adds checked results from the model to the cache. Skips anything incomplete, so it's asked again next run. */
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

export const INSTRUCTIONS = `You translate short listings about kids' activities and events in Berlin for parents.
Each input item has a key, a field and a text. The text can be in German, English, Russian or Ukrainian.
For every item, return the text in English (en), German (de), Ukrainian (uk) and Russian (ru). If the text is already in one of these languages, return it unchanged for that language.

Rules by field:
- title, description: natural, friendly translation. Keep names of shows, books, brands and people as they are.
- organizer: translate the kind of institution (library, youth office, museum…) and keep its proper name, e.g. "Stadtbibliothek Charlottenburg-Wilmersdorf" → ru "Городская библиотека Шарлоттенбург-Вильмерсдорф (Stadtbibliothek Charlottenburg-Wilmersdorf)". Put the original in parentheses after the translation in uk and ru.
- address: keep the street, house number, postcode and "Berlin" exactly as written, in Latin letters, because people need them to find the place and use maps. Translate only the name of the venue before the street, and in uk and ru add the original venue name in parentheses. Example: "Jugendamt Berlin-Lichtenberg, Große-Leege-Str. 103, 13053 Berlin" → ru "Управление по делам молодёжи Берлин-Лихтенберг (Jugendamt Berlin-Lichtenberg), Große-Leege-Str. 103, 13053 Berlin".
- district: a Berlin district name. Keep it in en and de; write it in Cyrillic letters in uk and ru (e.g. "Lichtenberg" → "Ліхтенберг" / "Лихтенберг").
Never add information that isn't in the text. Return every key you were given.`;
