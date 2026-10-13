import { test } from "node:test";
import assert from "node:assert/strict";
import { textKey, missingTexts, applyTranslations, mergeResults, pruneCache, chunks, splitAddress, withOriginal, composeAddress, readGoogleAnswer } from "./translate-lib.mjs";

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

test("addresses: only the venue name is translated, the street stays as written", () => {
  const parts = splitAddress("Jugendamt Berlin-Lichtenberg, Große-Leege-Str. 103, 13053 Berlin");
  assert.deepEqual(parts, { venue: "Jugendamt Berlin-Lichtenberg", rest: "Große-Leege-Str. 103, 13053 Berlin" });
  assert.equal(composeAddress("ru", "Управление по делам молодежи", parts.venue, parts.rest),
    "Управление по делам молодежи (Jugendamt Berlin-Lichtenberg), Große-Leege-Str. 103, 13053 Berlin");
  assert.equal(composeAddress("en", "Youth Office", parts.venue, parts.rest), "Youth Office, Große-Leege-Str. 103, 13053 Berlin");
});

test("addresses without a venue name in front are left alone", () => {
  assert.equal(splitAddress("Große-Leege-Str. 103, 13053 Berlin"), null);
  assert.equal(splitAddress("Online"), null);
});

test("the original name is kept in brackets only for Ukrainian and Russian, and only when it changed", () => {
  assert.equal(withOriginal("uk", "Міська бібліотека", "Stadtbibliothek"), "Міська бібліотека (Stadtbibliothek)");
  assert.equal(withOriginal("en", "City library", "Stadtbibliothek"), "City library");
  assert.equal(withOriginal("ru", "Kita", "Kita"), "Kita");
});

test("reads Google's answer, joining sentences", () => {
  const body = [[["Erster Satz. ", "First sentence. "], ["Zweiter.", "Second."]], null, "en"];
  assert.deepEqual(readGoogleAnswer(body), { text: "Erster Satz. Zweiter.", detected: "en" });
  assert.deepEqual(readGoogleAnswer([["Привіт, світ", "de"]]), { text: "Привіт, світ", detected: "de" });
  assert.deepEqual(readGoogleAnswer(null), { text: "", detected: null });
});

test("automatic translations follow the cache; hand-written ones never change", () => {
  const cache = { [textKey("title", OURS.title)]: full("v1"), [textKey("organizer", OURS.organizer)]: full("o") };
  const [first] = applyTranslations([OURS], cache);
  assert.equal(first.uk.title, "v1 UK");
  assert.ok(first.autoTranslated.includes("uk.title"));
  assert.ok(!first.autoTranslated.includes("de.title")); // hand-written German stays hand-written
  const fixed = { ...cache, [textKey("title", OURS.title)]: full("v2") };
  const [second] = applyTranslations([first], fixed);
  assert.equal(second.uk.title, "v2 UK");
  assert.equal(second.de.title, "Musik für Kleinkinder");
});

test("a changed original drops its old automatic translation instead of showing a wrong one", () => {
  const cache = { [textKey("title", OURS.title)]: full("v1") };
  const [first] = applyTranslations([OURS], cache);
  const [changed] = applyTranslations([{ ...first, title: "Brand new title" }], cache);
  assert.equal(changed.uk && changed.uk.title, undefined);
});
