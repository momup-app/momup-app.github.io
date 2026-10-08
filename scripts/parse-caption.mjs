// Turns an Instagram caption written with the event template into an event object.
// See docs/instagram-sync.md for the template. Pure function, no network: easy to test.

export const EVENT_TAG = "momupevent";

// A field line starts with its emoji (colon optional) or its word label (colon required,
// so "Workshop…" isn't read as "Wo:").
function field(emojis, words) {
  return new RegExp(`^(?:(?:${emojis})\\s*:?|(?:${words})\\s*:)\\s*`, "iu");
}
const FIELDS = {
  date: field("📅|🗓|⏰|🕒", "date|datum|wann|when|time|zeit"),
  place: field("📍", "where|wo|ort|adresse|address|place|location"),
  ages: field("👶|🧒|👧|👦", "age|ages|alter"),
  price: field("💶|💰|💵", "price|preis|kosten|eintritt|cost"),
  category: field("🏷", "category|kategorie|thema"),
};

const CATEGORY_WORDS = {
  sports: ["sport", "sports", "fußball", "fussball", "football", "soccer", "schwimmen", "swim", "swimming", "turnen", "yoga"],
  arts: ["kunst", "art", "arts", "basteln", "crafts", "craft", "malen", "painting", "töpfern", "theater", "theatre", "puppentheater"],
  music: ["musik", "music", "singen", "singing", "konzert", "concert"],
  dance: ["tanz", "tanzen", "dance", "dancing", "disco", "kinderdisco"],
  stem: ["mint", "stem", "coding", "programmieren", "robotik", "robotics", "science", "wissenschaft", "experimente"],
  language: ["sprache", "sprachen", "language", "languages", "lesen", "vorlesen", "reading", "story", "stories", "geschichten"],
  outdoors: ["draussen", "draußen", "outdoors", "outdoor", "natur", "nature", "park", "flohmarkt", "laternenumzug", "spaziergang"],
};

const RANGE = "\\s*(?:–|—|-|bis|to)\\s*";

function clean(s) {
  return s.replace(/️/g, "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s{2,}/g, " ").trim();
}

function stripEmoji(s) {
  return s.replace(/[\p{Extended_Pictographic}‍]/gu, "").replace(/\s{2,}/g, " ").trim();
}

function pad(n) { return String(n).padStart(2, "0"); }

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// "12.04.2026", "12.4.26", "12.04." (year taken from the post date), or "2026-04-12".
export function parseDate(text, postedAt) {
  const posted = new Date(postedAt || Date.now());
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: isoDate(+m[1], +m[2], +m[3]), rest: text.replace(m[0], " ") };
  m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (!m) return { date: null, rest: text };
  const day = +m[1], month = +m[2];
  let year;
  if (m[3]) {
    year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  } else {
    // No year: the next time that date comes around after the post.
    year = posted.getUTCFullYear();
    const candidate = Date.UTC(year, month - 1, day);
    if (candidate < posted.getTime() - 86400000) year += 1;
  }
  return { date: isoDate(year, month, day), rest: text.replace(m[0], " ") };
}

// "10:00–12:00", "10-12 Uhr", "10.30 bis 12 Uhr", or a single start time ("ab 15 Uhr" → 2 hours).
export function parseTime(text) {
  const t = "(\\d{1,2})(?:[:.](\\d{2}))?";
  let m = text.match(new RegExp(t + RANGE + t + "\\s*(?:uhr|h)?", "i"));
  if (m) {
    const start = `${pad(+m[1])}:${m[2] || "00"}`, end = `${pad(+m[3])}:${m[4] || "00"}`;
    if (+m[1] < 24 && +m[3] < 24 && start < end) return { start, end };
    return null;
  }
  m = text.match(/(?:ab|from|um|at)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr|h)\b/i) || text.match(/(\d{1,2})[:](\d{2})/);
  if (m && +m[1] < 24) {
    const endHour = Math.min(+m[1] + 2, 23);
    return { start: `${pad(+m[1])}:${m[2] || "00"}`, end: `${pad(endHour)}:${m[2] || "00"}` };
  }
  return null;
}

export function parseAges(text) {
  if (!text) return [0, 16];
  let m = text.match(new RegExp("(\\d{1,2})" + RANGE + "(\\d{1,2})"));
  if (m && +m[1] <= +m[2]) return [+m[1], +m[2]];
  m = text.match(/(?:ab|from)\s*(\d{1,2})|(\d{1,2})\s*\+/i);
  if (m) return [+(m[1] || m[2]), 16];
  return [0, 16];
}

export function parsePrice(text) {
  if (!text) return null;
  if (/kostenlos|gratis|umsonst|eintritt frei|free|^\s*frei\b|^\s*0\s*(€|eur)/i.test(text)) return { type: "free" };
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euro)|€\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  const amount = Number((m[1] || m[2]).replace(",", "."));
  if (amount === 0) return { type: "free" };
  let per = "ticket";
  if (/(pro|per|je|\/)\s*(kind|child)/i.test(text)) per = "child";
  else if (/(pro|per|je|\/)\s*(familie|family)/i.test(text)) per = "family";
  else if (/(pro|per|je|\/)\s*(person)/i.test(text)) per = "person";
  return { type: "paid", amount, per };
}

export function parseCategory(explicit, hashtags) {
  const words = [explicit || "", ...hashtags].join(" ").toLowerCase().split(/[^\p{L}]+/u);
  for (const [category, list] of Object.entries(CATEGORY_WORDS)) {
    if (words.some((w) => list.includes(w))) return category;
  }
  return "other";
}

/**
 * @returns {{ok: true, event: object} | {ok: false, reason: string, skip?: boolean}}
 *   skip=true means "not an event post" (no tag): ignore quietly.
 */
export function parseCaption(caption, { postedAt, id, permalink } = {}) {
  const text = (caption || "").replace(/️/g, "");
  const hashtags = [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase());
  if (!hashtags.includes(EVENT_TAG)) return { ok: false, skip: true, reason: "no #" + EVENT_TAG };

  const fields = {};
  const free = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(#[\p{L}\p{N}_]+\s*)+$/u.test(line)) continue; // hashtag-only line
    const name = Object.keys(FIELDS).find((k) => FIELDS[k].test(line));
    if (name && !fields[name]) fields[name] = clean(line.replace(FIELDS[name], ""));
    else if (!name) free.push(clean(line));
  }

  const title = stripEmoji(free.shift() || "");
  if (!title) return { ok: false, reason: "no title (first line)" };
  if (!fields.date) return { ok: false, reason: "no 📅 date line" };

  const { date, rest } = parseDate(fields.date, postedAt);
  if (!date) return { ok: false, reason: `can't read the date in “${fields.date}”` };
  const time = parseTime(rest);
  if (!time) return { ok: false, reason: `can't read the time in “${fields.date}”` };

  const price = parsePrice(fields.price);
  if (!price) return { ok: false, reason: fields.price ? `can't read the price “${fields.price}”` : "no 💶 price line" };

  const place = fields.place || "";
  const online = /^(online|zoom|live|instagram live)\b/i.test(place);
  if (!place) return { ok: false, reason: "no 📍 place line" };

  return {
    ok: true,
    event: {
      id: "ig-" + (id || date + "-" + title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")),
      date,
      start: time.start,
      end: time.end,
      title,
      organizer: "MomUp",
      category: parseCategory(fields.category, hashtags),
      format: online ? "online" : "in-person",
      ages: parseAges(fields.ages),
      price,
      address: online ? "" : place,
      description: stripEmoji(free.join(" ")),
      link: permalink || "",
      source: "instagram",
    },
  };
}
