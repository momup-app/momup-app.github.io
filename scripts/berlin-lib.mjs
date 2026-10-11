// Turns the berlin.de state event calendar ("Kalender des Landes Berlin", category Kinder, Jugendliche)
// into Kids Nearby events. Pure functions only, so they can be tested without the network.
// Used by scripts/berlin-sync.mjs.

export const SOURCE_NAME = "berlin.de";
export const CALENDAR = "https://www.berlin.de/land/kalender/index.php";
export const KIDS_CATEGORY = "kategorie%5B10%5D=3"; // the "Kinder, Jugendliche" checkbox of the calendar search

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€" };

export function decode(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}

export function stripTags(html) {
  return decode(String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function cdata(block, tag) {
  const m = new RegExp("<" + tag + "[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + tag + ">").exec(block);
  return m ? m[1].trim() : "";
}

// "Bilderbuchkino (11.10.2026 15:30 - 16:00 Uhr)" → title, date, start, end.
// Other forms: "(11.10.2026)", "(11.10.2026 11:00 Uhr)", "(11.10.2026 bis 16:30 Uhr)".
export function parseTitle(raw) {
  const text = decode(raw).trim();
  const m = /\s*\((\d{2})\.(\d{2})\.(\d{4})([^()]*)\)\s*$/.exec(text);
  if (!m) return null;
  const rest = m[4];
  const times = rest.match(/\d{1,2}:\d{2}/g) || [];
  const pad = (t) => t.padStart(5, "0");
  let start = "", end = "";
  if (/^\s*bis\b/.test(rest) && times.length) end = pad(times[0]);
  else {
    if (times[0]) start = pad(times[0]);
    if (times[1]) end = pad(times[1]);
  }
  return { title: text.slice(0, m.index).replace(/\s+/g, " ").trim(), date: `${m[3]}-${m[2]}-${m[1]}`, start, end };
}

// One RSS feed (one day of the calendar) → items. Events that repeat keep their id.
export function parseRss(xml) {
  const items = [];
  for (const block of String(xml).split("<item>").slice(1)) {
    const link = decode(cdata(block, "link"));
    const id = (/detail=(\d+)/.exec(link) || [])[1];
    const t = parseTitle(cdata(block, "title"));
    if (!id || !t) continue;
    items.push({
      id,
      ...t,
      url: `${CALENDAR}?detail=${id}`,
      text: stripTags(cdata(block, "content:encoded") || cdata(block, "description"))
    });
  }
  return items;
}

function divText(html, cls) {
  const m = new RegExp('<div class="' + cls + '[^"]*"[^>]*>([\\s\\S]*?)</div>').exec(html);
  return m ? stripTags(m[1]).replace(/\s+/g, " ").trim() : "";
}

// The event's own page: where it is and who runs it.
export function parseDetail(html) {
  const s = String(html);
  const ortAt = s.indexOf("<h2>Veranstaltungsort</h2>");
  const orgAt = s.indexOf("<h2>Veranstalter</h2>");
  const ort = ortAt >= 0 ? s.slice(ortAt, orgAt > ortAt ? orgAt : undefined) : "";
  const org = orgAt >= 0 ? s.slice(orgAt) : "";
  const district = (/<b>Bezirk:<\/b>\s*([^<\n]+)/.exec(s) || [])[1];
  const home = (/<a href="([^"]+)"[^>]*class="link--homepage"/.exec(s) || [])[1];
  return {
    place: divText(ort, "locationname"),
    street: divText(ort, "street"),
    city: divText(ort, "postal-code"),
    organizer: divText(org, "veranstalter"),
    district: district ? decode(district).trim() : "",
    homepage: home ? decode(home) : ""
  };
}

const AGE = "(\\d{1,2})";
const YEARS = "\\s*-?\\s*(?:J\\.|Jahre|Jahren|jährige[nr]?|Jährige[nr]?)";

// Ages from the German text: "5—8 Jahre", "ab 6 Jahren", "bis 3 Jahre", "Babys"... null when it doesn't say.
export function guessAges(text) {
  const s = String(text || "");
  let m = new RegExp(AGE + "\\s*(?:-\\s*bis|bis|-|–|—)\\s*" + AGE + YEARS, "i").exec(s);
  if (m) return clampAges(+m[1], +m[2]);
  m = new RegExp("\\bab\\s+" + AGE + YEARS, "i").exec(s);
  if (m) return clampAges(+m[1], Math.max(+m[1], 12));
  m = new RegExp("\\bab\\s+" + AGE + "\\s*Monat", "i").exec(s);
  if (m) return clampAges(0, 3);
  m = new RegExp("\\b(?:bis|unter)\\s+" + AGE + YEARS, "i").exec(s);
  if (m) return clampAges(0, +m[1]);
  if (/\bBabys?\b|Krabbel/i.test(s)) return [0, 1];
  if (/Kleinkind/i.test(s)) return [1, 3];
  return null;
}

function clampAges(a, b) {
  if (a > b || a > 16) return null;
  return [Math.max(0, a), Math.min(16, b)];
}

export function guessPrice(text) {
  const s = String(text || "");
  if (/kostenfrei|kostenlos|eintritt\s*(?:ist\s*)?frei|freier\s+eintritt|ohne\s+eintritt|gratis|Teilnahme\s+ist\s+frei/i.test(s)) return { type: "free" };
  const m = /(\d{1,3}(?:,\d{2})?)\s*(?:€|Euro\b|EUR\b)/.exec(s) || /(?:€|EUR)\s*(\d{1,3}(?:,\d{2})?)/.exec(s);
  if (m) return { type: "paid", amount: Number(m[1].replace(",", ".")), per: "ticket" };
  return { type: "unknown" };
}

// First match wins; sales first so a "Kinderflohmarkt" doesn't count as a family event.
const CATEGORIES = [
  ["sales", /flohmarkt|kinderbasar|kleiderbasar|kleiderbörse|kleidertausch|tauschbörse|kindersachenbörse|basar\b/i],
  ["language", /bilderbuch|vorles|lesung|lese|geschichten|märchen|bücher|erzähl|sprach|poesie|dicht|kamishibai|story/i],
  ["arts", /bastel|kunst|mal(?:en|kurs|werkstatt)|zeichn|theater|puppen|kino|film|ausstellung|museum|werkstatt|töpfer|häkel|strick|näh(?:en|kurs)/i],
  ["music", /konzert|musik|lieder|singen|chor\b|orchester|trommel/i],
  ["dance", /tanz|ballett|dance/i],
  ["stem", /technik|robot|programmier|coding|code\b|experiment|forsch|mint\b|wissenschaft|computer|3d-druck|digital|maker|gaming/i],
  ["outdoors", /wald|natur|garten|tierpark|zoo\b|spaziergang|wanderung|draußen|ausflug|park\b/i],
  ["sports", /sport|fußball|schwimm|turn|bewegung|klettern|radfahr|fahrrad|yoga/i]
];

export function guessCategory(text) {
  for (const [cat, re] of CATEGORIES) if (re.test(text)) return cat;
  return "other";
}

// The title says it best; the description only when the title gives no hint.
export function categoryOf(item) {
  const fromTitle = guessCategory(item.title);
  return fromTitle !== "other" ? fromTitle : guessCategory(item.text);
}

// Things in the kids category that aren't for families with kids.
export function isForFamilies(item) {
  return !/senior|trauergruppe|elternabend|fachtag|fachkräfte|konferenz|ausschuss|sitzung|stellenbörse|bewerbung/i.test(item.title + " " + item.text.slice(0, 300))
    && !/für\s+kitas|kitagruppen|schulklassen|für\s+(?:grund)?schulen/i.test(item.title); // offers for groups, not families
}

export function addressOf(d) {
  return [d.street, d.city].filter(Boolean).join(", ");
}

// berlin.de item + its page + map position → an event in data/berlin-events.json.
// Only facts (title, time, place); the description stays on berlin.de, linked from the card.
export function toEvent(item, detail, point) {
  const text = item.title + "\n" + item.text;
  const place = [detail.place, addressOf(detail)].filter(Boolean).join(", ");
  return {
    id: "berlin-" + item.id,
    date: item.date,
    start: item.start,
    end: item.end,
    title: item.title,
    // Left empty when it's the place itself, so the card doesn't say it twice.
    organizer: detail.organizer && detail.organizer !== detail.place ? detail.organizer : "",
    category: categoryOf(item),
    format: "in-person",
    ages: guessAges(text),
    price: guessPrice(text),
    address: place,
    district: detail.district || "",
    lat: point.lat,
    lng: point.lng,
    source: { name: SOURCE_NAME, url: item.url }
  };
}

export function berlinToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
