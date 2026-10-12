import { test } from "node:test";
import assert from "node:assert/strict";
import { textKey, missingTexts, applyTranslations, mergeResults, pruneCache, chunks } from "./translate-lib.mjs";

const BERLIN = {
  id: "berlin-1",
  title: "Kamishibai in der Bibliothek",
  organizer: "",
  address: "Jugendamt Berlin-Lichtenberg, Große-Leege-Str. 103, 13053 Berlin",
  district: "Lichtenberg",
};
const OURS = {
  id: "act-1",
  title: "Toddler music",
  organizer: "Studio A",
  description: "Songs and drums.",
  de: { title: "Musik für Kleinkinder", organizer: "Studio A", description: "Lieder und Trommeln." },
};
const full = (s) => ({ en: s + " EN", de: s + " DE", uk: s + " UK", ru: s + " RU" });

test("asks for each untranslated text once, and skips empty fields", () => {
  const twin = { ...BERLIN, id: "berlin-2" }; // same texts on another day
  const todo = missingTexts([BERLIN, twin], {});
  assert.deepEqual(todo.map((t) => t.field).sort(), ["address", "district", "title"]);
});

test("nothing to ask when the cache already has every language", () => {
  const cache = {};
  for (const f of ["title", "address", "district"]) cache[textKey(f, BERLIN[f])] = full(f);
  assert.deepEqual(missingTexts([BERLIN], cache), []);
});

test("hand-made translations win over the cache and are kept", () => {
  const cache = {};
  for (const f of ["title", "organizer", "description"]) cache[textKey(f, OURS[f])] = full(f);
  const [out] = applyTranslations([OURS], cache);
  assert.equal(out.de.title, "Musik für Kleinkinder");
  assert.equal(out.uk.title, "title UK");
  assert.equal(out.ru.description, "description RU");
  assert.equal(out.en.organizer, "organizer EN");
});

test("applyTranslations leaves the original listing untouched", () => {
  const before = JSON.stringify(OURS);
  applyTranslations([OURS], { [textKey("title", OURS.title)]: full("t") });
  assert.equal(JSON.stringify(OURS), before);
});

test("incomplete or unknown answers are not cached", () => {
  const asked = [{ key: "a", field: "title", text: "x" }, { key: "b", field: "title", text: "y" }];
  const out = mergeResults({}, asked, [
    { key: "a", ...full("a") },
    { key: "b", en: "only english" },
    { key: "zzz", ...full("z") },
  ]);
  assert.deepEqual(Object.keys(out), ["a"]);
});

test("pruning keeps only texts still in use", () => {
  const keep = textKey("title", BERLIN.title);
  const out = pruneCache({ [keep]: full("k"), old: full("o") }, [BERLIN]);
  assert.deepEqual(Object.keys(out), [keep]);
});

test("chunks splits a list into batches", () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
