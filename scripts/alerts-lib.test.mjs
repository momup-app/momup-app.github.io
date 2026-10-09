import { test } from "node:test";
import assert from "node:assert/strict";
import { berlinToday, upcomingSales, salesFor, buildEmail } from "./alerts-lib.mjs";

const EVENTS = [
  { id: "past-sale", date: "2026-10-01", start: "10:00", end: "12:00", category: "sales", ages: [0, 12], title: "Old", price: { type: "free" }, format: "in-person", address: "A" },
  { id: "basar", date: "2026-10-17", start: "10:00", end: "13:00", category: "sales", ages: [0, 12], title: "Kids' Clothes Bazaar", price: { type: "free" }, format: "in-person", address: "Near Boxhagener Platz",
    de: { title: "Kinderkleiderbasar", address: "Nähe Boxhagener Platz" } },
  { id: "teen-swap", date: "2026-11-07", start: "11:00", end: "14:00", category: "sales", ages: [13, 16], title: "Teen <Swap>", price: { type: "paid", amount: 2, per: "person" }, format: "in-person", address: "B" },
  { id: "puppets", date: "2026-10-15", start: "16:00", end: "16:45", category: "arts", ages: [3, 7], title: "Puppets", price: { type: "free" }, format: "in-person", address: "C" },
];

test("Berlin date, not the server's", () => {
  // 23:30 UTC on 8 Oct is already 9 Oct in Berlin (summer time).
  assert.equal(berlinToday(new Date("2026-10-08T23:30:00Z")), "2026-10-09");
});

test("only upcoming sales, soonest first", () => {
  assert.deepEqual(upcomingSales(EVENTS, "2026-10-09").map((e) => e.id), ["basar", "teen-swap"]);
});

test("skips sales already sent and ones that don't fit the kids' ages", () => {
  const sales = upcomingSales(EVENTS, "2026-10-09");
  assert.deepEqual(salesFor({ kids_ages: [] }, sales, new Set()).map((e) => e.id), ["basar", "teen-swap"]);
  assert.deepEqual(salesFor({ kids_ages: [4] }, sales, new Set()).map((e) => e.id), ["basar"]);
  assert.deepEqual(salesFor({ kids_ages: [4, 14] }, sales, new Set(["basar"])).map((e) => e.id), ["teen-swap"]);
  assert.deepEqual(salesFor({ kids_ages: [] }, sales, new Set(["basar", "teen-swap"])), []);
});

test("email in the person's language, with links and escaping", () => {
  const sales = upcomingSales(EVENTS, "2026-10-09");
  const de = buildEmail("de", sales.slice(0, 1));
  assert.equal(de.subject, "Neuer Kinderkleider-Basar in Berlin");
  assert.match(de.text, /Kinderkleiderbasar/);
  assert.match(de.text, /Samstag, 17\. Oktober, 10:00–13:00/);
  assert.match(de.text, /Nähe Boxhagener Platz · Kostenlos/);
  assert.match(de.text, /https:\/\/momup-app\.github\.io\/\?lang=de#item=basar/);
  assert.match(de.text, /account\.html\?lang=de/);

  const en = buildEmail("en", sales);
  assert.equal(en.subject, "2 new kids' clothes sales in Berlin");
  assert.match(en.text, /€2 \/ person/);
  assert.match(en.html, /Teen &lt;Swap&gt;/);
  assert.doesNotMatch(en.html, /Teen <Swap>/);

  assert.match(buildEmail("ru", sales).subject, /Новые детские распродажи в Берлине: 2/);
  assert.equal(buildEmail("fr", sales).subject, "2 new kids' clothes sales in Berlin"); // unknown language → English
});
