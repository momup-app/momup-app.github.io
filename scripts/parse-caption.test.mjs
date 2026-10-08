import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCaption, parseDate, parseTime, parseAges, parsePrice } from "./parse-caption.mjs";

const POSTED = "2026-10-08T09:00:00+0000";

test("German template with emoji", () => {
  const r = parseCaption(
    `Kürbisschnitzen im Garten 🎃
#momupevent #basteln
📅 25.10.2026, 14:00–17:00
📍 Prinzessinnengarten, Moritzplatz, 10969 Berlin
👶 5–12 Jahre
💶 8 € pro Kind
Kürbisse und Werkzeug sind da. Bitte warm anziehen!`,
    { postedAt: POSTED, id: "123", permalink: "https://www.instagram.com/p/abc/" }
  );
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.event, {
    id: "ig-123",
    date: "2026-10-25",
    start: "14:00",
    end: "17:00",
    title: "Kürbisschnitzen im Garten",
    organizer: "MomUp",
    category: "arts",
    format: "in-person",
    ages: [5, 12],
    price: { type: "paid", amount: 8, per: "child" },
    address: "Prinzessinnengarten, Moritzplatz, 10969 Berlin",
    description: "Kürbisse und Werkzeug sind da. Bitte warm anziehen!",
    link: "https://www.instagram.com/p/abc/",
    source: "instagram",
  });
});

test("word labels, no year, hour-only times, free", () => {
  const r = parseCaption(
    `Laternenumzug
Datum: 11.11. 17-18.30 Uhr
Ort: Volkspark am Weinberg
Alter: ab 2
Preis: kostenlos
Laterne mitbringen.
#momupevent #draussen`,
    { postedAt: POSTED }
  );
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.event.date, "2026-11-11");
  assert.equal(r.event.start, "17:00");
  assert.equal(r.event.end, "18:30");
  assert.deepEqual(r.event.ages, [2, 16]);
  assert.deepEqual(r.event.price, { type: "free" });
  assert.equal(r.event.category, "outdoors");
});

test("English labels and online", () => {
  const r = parseCaption(
    `Bedtime stories live 📖
When: 22.10.2026 19:00-19:30
Where: Online (Instagram Live)
Ages: 3-7
Price: free
#momupevent #stories`,
    { postedAt: POSTED }
  );
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.event.format, "online");
  assert.equal(r.event.address, "");
  assert.equal(r.event.category, "language");
});

test("a line starting with 'Workshop' is not read as the place", () => {
  const r = parseCaption(
    `Workshop für Kids
📅 20.10.2026 10:00–11:00
📍 Mauerpark
💶 5€
#momupevent`,
    { postedAt: POSTED }
  );
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.event.title, "Workshop für Kids");
  assert.equal(r.event.address, "Mauerpark");
  assert.deepEqual(r.event.price, { type: "paid", amount: 5, per: "ticket" });
  assert.equal(r.event.category, "other");
});

test("posts without the tag are skipped quietly", () => {
  const r = parseCaption("Lovely day at the park ☀️ #berlin", { postedAt: POSTED });
  assert.equal(r.ok, false);
  assert.equal(r.skip, true);
});

test("tagged posts with missing details explain why", () => {
  assert.match(parseCaption("Party!\n#momupevent", { postedAt: POSTED }).reason, /date/);
  assert.match(parseCaption("Party!\n📅 32.10.2026 10-12\n#momupevent", { postedAt: POSTED }).reason, /date/);
  assert.match(parseCaption("Party!\n📅 20.10.2026\n#momupevent", { postedAt: POSTED }).reason, /time/);
  assert.match(parseCaption("Party!\n📅 20.10.2026 10-12\n📍 Park\n#momupevent", { postedAt: POSTED }).reason, /price/);
  assert.match(parseCaption("Party!\n📅 20.10.2026 10-12\n💶 free\n#momupevent", { postedAt: POSTED }).reason, /place/);
});

test("date without year rolls into next year when already past", () => {
  assert.equal(parseDate("05.01.", "2026-12-20T10:00:00Z").date, "2027-01-05");
  assert.equal(parseDate("24.12.", "2026-12-20T10:00:00Z").date, "2026-12-24");
  assert.equal(parseDate("2026-10-30").date, "2026-10-30");
});

test("small parsers", () => {
  assert.deepEqual(parseTime("ab 15 Uhr"), { start: "15:00", end: "17:00" });
  assert.equal(parseTime("12-10"), null);
  assert.deepEqual(parseAges("3+"), [3, 16]);
  assert.deepEqual(parseAges(""), [0, 16]);
  assert.deepEqual(parsePrice("€ 4,50 / Familie"), { type: "paid", amount: 4.5, per: "family" });
  assert.deepEqual(parsePrice("Eintritt frei"), { type: "free" });
  assert.deepEqual(parsePrice("0 €"), { type: "free" });
});
