import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTitle, parseRss, parseDetail, guessAges, guessPrice, guessCategory, categoryOf, isForFamilies, toEvent } from "./berlin-lib.mjs";

test("titles carry the date and time", () => {
  assert.deepEqual(parseTitle("Bilderbuchkino in der Bibliothek (11.10.2026 15:30 - 16:00 Uhr)"),
    { title: "Bilderbuchkino in der Bibliothek", date: "2026-10-11", start: "15:30", end: "16:00" });
  assert.deepEqual(parseTitle("Mauskonzert (11.10.2026 11:00 Uhr)"), { title: "Mauskonzert", date: "2026-10-11", start: "11:00", end: "" });
  assert.deepEqual(parseTitle("Schnitzeljagd (11.10.2026 bis 16:30 Uhr)"), { title: "Schnitzeljagd", date: "2026-10-11", start: "", end: "16:30" });
  assert.deepEqual(parseTitle("Ausstellung „Miniatur“ (12.10.2026)"), { title: "Ausstellung „Miniatur“", date: "2026-10-12", start: "", end: "" });
  assert.equal(parseTitle("No date here"), null);
});

const RSS = `<?xml version="1.0"?><rss><channel><title>Kalender</title>
<item><title><![CDATA[Kindertheater &amp; Lieder (13.10.2026 9:30 - 10:15 Uhr)]]></title>
<link><![CDATA[https://www.berlin.de/land/kalender/index.php?detail=111&ls=0&c=22]]></link>
<content:encoded><![CDATA[<p>Für Kinder von 3 bis 6 Jahren.</p><p>Eintritt frei.</p>]]></content:encoded></item>
<item><title><![CDATA[Broken item]]></title><link><![CDATA[https://example.org]]></link></item>
</channel></rss>`;

test("the feed becomes items, broken ones are skipped", () => {
  const items = parseRss(RSS);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "111");
  assert.equal(items[0].title, "Kindertheater & Lieder");
  assert.equal(items[0].start, "09:30");
  assert.equal(items[0].url, "https://www.berlin.de/land/kalender/index.php?detail=111");
  assert.match(items[0].text, /3 bis 6 Jahren/);
});

const DETAIL = `<p><b>Kategorien:</b> Kinder, Jugendliche
<p><b>Bezirk:</b> Lichtenberg
<h2>Veranstaltungsort</h2>
<div class="locationname cnw_skip_translation"><strong>Museum Lichtenberg im Stadthaus</strong></div>
<div class="street cnw_skip_translation">Türrschmidtstr.  24</div>
<div class="postal-code city cnw_skip_translation">10317 Berlin</div>
<h2>Veranstalter</h2>
<div class="veranstalter cnw_skip_translation"><strong>Fachbereich Museum &amp; Geschichte</strong></div>
<div class="street cnw_skip_translation">Andere Str. 1</div>
<h2>Weitere Informationen</h2><a href="https://example.org/e/1" target="_blank" class="link--homepage">Homepage</a>`;

test("the event page gives place, address, district and organizer", () => {
  assert.deepEqual(parseDetail(DETAIL), {
    place: "Museum Lichtenberg im Stadthaus", street: "Türrschmidtstr. 24", city: "10317 Berlin",
    organizer: "Fachbereich Museum & Geschichte", district: "Lichtenberg", homepage: "https://example.org/e/1"
  });
});

test("ages come from the text, or stay unknown", () => {
  assert.deepEqual(guessAges("Alter: Kinder von 5—8 Jahre"), [5, 8]);
  assert.deepEqual(guessAges("für 4- bis 12-Jährige"), [4, 12]);
  assert.deepEqual(guessAges("Für Kinder ab 6 Jahren"), [6, 12]);
  assert.deepEqual(guessAges("Jugendliche ab 14 Jahren"), [14, 14]);
  assert.deepEqual(guessAges("Kinder bis 3 Jahre"), [0, 3]);
  assert.deepEqual(guessAges("Krabbelgruppe"), [0, 1]);
  assert.equal(guessAges("Ab 18 Jahren"), null);
  assert.equal(guessAges("Ein Nachmittag für alle"), null);
});

test("price: free, a sum, or unknown", () => {
  assert.deepEqual(guessPrice("Der Eintritt ist frei."), { type: "free" });
  assert.deepEqual(guessPrice("\"Zitadellen- & FamilienSonntag\" - kostenfrei"), { type: "free" });
  assert.deepEqual(guessPrice("Eintritt: 4,50 €"), { type: "paid", amount: 4.5, per: "ticket" });
  assert.deepEqual(guessPrice("Anmeldung erforderlich"), { type: "unknown" });
});

test("interest from keywords, sales first", () => {
  assert.equal(guessCategory("Kinderflohmarkt im Hof mit Musik"), "sales");
  assert.equal(guessCategory("Mauskonzert – Kinder spielen für Kinder"), "music");
  assert.equal(guessCategory("Bilderbuchkino in der Bibliothek"), "language");
  assert.equal(guessCategory("Kindertheater aus dem Koffer"), "arts");
  assert.equal(guessCategory("Papa-Kind-Treff"), "other");
  assert.equal(guessCategory("Kindertheater aus dem Koffer – Meister Ton und das Liederwettsingen"), "arts");
});

test("the title decides before the description", () => {
  const text = "Die Veranstaltung findet in der Bibliothek statt. Wir lesen danach ein Buch.";
  assert.equal(categoryOf({ title: "Gaming mit der Switch 2", text }), "stem");
  assert.equal(categoryOf({ title: "Gemeinsam Häkeln", text: "Digitale Anleitungen" }), "arts");
  assert.equal(categoryOf({ title: "Spielenachmittag", text: "Wir lesen Geschichten vor." }), "language");
});

test("things for professionals are left out", () => {
  assert.equal(isForFamilies({ title: "Fachtag Kinderschutz", text: "" }), false);
  assert.equal(isForFamilies({ title: "Trauergruppe nach einem Kindsverlust", text: "" }), false);
  assert.equal(isForFamilies({ title: "Kidsführungen für Kitas und Grundschulen", text: "" }), false);
  assert.equal(isForFamilies({ title: "Bilderbuchkino", text: "Für Kinder ab 3" }), true);
});

test("an event keeps facts and links to berlin.de", () => {
  const item = parseRss(RSS)[0];
  const e = toEvent(item, parseDetail(DETAIL), { lat: 52.51, lng: 13.49 });
  assert.equal(e.id, "berlin-111");
  assert.deepEqual(e.ages, [3, 6]);
  assert.deepEqual(e.price, { type: "free" });
  assert.equal(e.category, "arts"); // "Kindertheater" in the title
  assert.equal(e.address, "Museum Lichtenberg im Stadthaus, Türrschmidtstr. 24, 10317 Berlin");
  assert.deepEqual(e.source, { name: "berlin.de", url: "https://www.berlin.de/land/kalender/index.php?detail=111" });
  assert.equal("description" in e, false); // the text stays on berlin.de
});
