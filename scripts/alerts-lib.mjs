// Pure logic for the daily sales email: which events, for whom, and the email text.
// No network here, so it's easy to test (alerts-lib.test.mjs).

export const SITE_URL = "https://momup-app.github.io";

const TEXT = {
  en: {
    subject: (n) => n === 1 ? "New kids' clothes sale in Berlin" : `${n} new kids' clothes sales in Berlin`,
    hello: "Good morning! New kids' clothes sales and flea markets:",
    free: "Free",
    online: "Online",
    per: {},
    open: "Details and map",
    footer: "You get this email because you turned on sales notifications in your Kids Nearby account.",
    off: "Turn notifications off",
  },
  de: {
    subject: (n) => n === 1 ? "Neuer Kinderkleider-Basar in Berlin" : `${n} neue Kinderkleider-Basare in Berlin`,
    hello: "Guten Morgen! Neue Kinderkleider-Basare und Flohmärkte:",
    free: "Kostenlos",
    online: "Online",
    per: { ticket: "Ticket", child: "Kind", family: "Familie", person: "Person", session: "Termin" },
    open: "Details und Karte",
    footer: "Du bekommst diese E-Mail, weil du in deinem Kids-Nearby-Konto Benachrichtigungen zu Basaren eingeschaltet hast.",
    off: "Benachrichtigungen ausschalten",
  },
  uk: {
    subject: (n) => n === 1 ? "Новий дитячий розпродаж у Берліні" : `Нові дитячі розпродажі в Берліні: ${n}`,
    hello: "Доброго ранку! Нові розпродажі дитячого одягу та барахолки:",
    free: "Безкоштовно",
    online: "Онлайн",
    per: { ticket: "квиток", child: "дитина", family: "родина", person: "особа", session: "заняття" },
    open: "Детальніше і карта",
    footer: "Ви отримали цей лист, бо увімкнули сповіщення про розпродажі в акаунті Kids Nearby.",
    off: "Вимкнути сповіщення",
  },
  ru: {
    subject: (n) => n === 1 ? "Новая детская распродажа в Берлине" : `Новые детские распродажи в Берлине: ${n}`,
    hello: "Доброе утро! Новые распродажи детской одежды и барахолки:",
    free: "Бесплатно",
    online: "Онлайн",
    per: { ticket: "билет", child: "ребёнок", family: "семья", person: "человек", session: "занятие" },
    open: "Подробнее и карта",
    footer: "Вы получили это письмо, потому что включили уведомления о распродажах в аккаунте Kids Nearby.",
    off: "Отключить уведомления",
  },
};
const LOCALE = { en: "en-GB", de: "de-DE", uk: "uk-UA", ru: "ru-RU" };

const PUSH = {
  en: { more: (n) => `and ${n} more` },
  de: { more: (n) => `und ${n} weitere` },
  uk: { more: (n) => `і ще ${n}` },
  ru: { more: (n) => `и ещё ${n}` },
};

/** Today's date in Berlin as YYYY-MM-DD. */
export function berlinToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/** Sales events from today on, soonest first. */
export function upcomingSales(events, today) {
  return events
    .filter((e) => e.category === "sales" && e.date >= today && !e.sample) // demo entries never go out
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** The sales this person hasn't been emailed about yet and that fit their kids' ages (if they gave any). */
export function salesFor(recipient, sales, sentIds) {
  const ages = recipient.kids_ages || [];
  return sales.filter((e) => {
    if (sentIds.has(e.id)) return false;
    if (!ages.length || !e.ages) return true; // imported events may not say which ages
    return ages.some((a) => a >= e.ages[0] && a <= e.ages[1]);
  });
}

function tr(e, lang, field) {
  return (e[lang] && e[lang][field]) || e[field];
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function when(e, lang) {
  const d = new Date(e.date + "T12:00:00Z").toLocaleDateString(LOCALE[lang], {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
  const time = e.start && e.end ? `${e.start}–${e.end}` : e.start || (e.end ? `– ${e.end}` : "");
  return d.charAt(0).toUpperCase() + d.slice(1) + (time ? `, ${time}` : "");
}

function price(e, lang) {
  const t = TEXT[lang];
  if (e.price.type === "free") return t.free;
  if (e.price.type === "unknown") return "";
  const per = t.per[e.price.per] || e.price.per;
  return lang === "en" ? `€${e.price.amount} / ${per}` : `${e.price.amount} € / ${per}`;
}

/** Subject, plain text and HTML for one person's email. */
export function buildEmail(lang, events, siteUrl = SITE_URL) {
  if (!TEXT[lang]) lang = "en";
  const t = TEXT[lang];
  const offUrl = `${siteUrl}/account.html?lang=${lang}`;
  const items = events.map((e) => ({
    title: tr(e, lang, "title"),
    when: when(e, lang),
    where: e.format === "online" ? t.online : tr(e, lang, "address"),
    price: price(e, lang),
    desc: tr(e, lang, "description") || "",
    url: `${siteUrl}/?lang=${lang}#item=${encodeURIComponent(e.id)}`,
  }));

  const text = [
    t.hello, "",
    ...items.flatMap((i) => [`• ${i.title}`, `  ${i.when}`, `  ${[i.where, i.price].filter(Boolean).join(" · ")}`, `  ${i.url}`, ""]),
    "—", t.footer, `${t.off}: ${offUrl}`,
  ].join("\n");

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#F7F4FA;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1F1846">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
<p style="margin:0 0 6px;font-weight:800;font-size:20px;color:#5B45B0">MomUp · Kids Nearby</p>
<p style="margin:0 0 20px;font-size:16px">${esc(t.hello)}</p>
${items.map((i) => `<div style="border-left:4px solid #FFD260;background:#F7F4FA;border-radius:12px;padding:14px 16px;margin:0 0 12px">
<p style="margin:0 0 4px;font-weight:700;font-size:17px">${esc(i.title)}</p>
<p style="margin:0;font-size:14px">${esc(i.when)}</p>
<p style="margin:0 0 6px;font-size:14px;color:#6E6984">${esc([i.where, i.price].filter(Boolean).join(" · "))}</p>
${i.desc ? `<p style="margin:0 0 8px;font-size:14px">${esc(i.desc)}</p>` : ""}
<a href="${esc(i.url)}" style="color:#5B45B0;font-weight:700;font-size:14px">${esc(t.open)} →</a></div>`).join("\n")}
<p style="margin:20px 0 0;font-size:12px;color:#6E6984">${esc(t.footer)}<br><a href="${esc(offUrl)}" style="color:#5B45B0">${esc(t.off)}</a></p>
</div></body></html>`;

  return { subject: t.subject(items.length), text, html };
}

/** The lock-screen notification for one person: the first sale, and how many more. */
export function buildPush(lang, events, siteUrl = SITE_URL) {
  if (!TEXT[lang]) lang = "en";
  const first = events[0];
  const day = new Date(first.date + "T12:00:00Z").toLocaleDateString(LOCALE[lang], { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const body = `${day} · ${tr(first, lang, "title")}` + (events.length > 1 ? ` ${PUSH[lang].more(events.length - 1)}` : "");
  const url = events.length === 1
    ? `${siteUrl}/?lang=${lang}#item=${encodeURIComponent(first.id)}`
    : `${siteUrl}/?lang=${lang}&category=sales#sales`;
  return { title: TEXT[lang].subject(events.length), body, url, tag: "momup-sales" };
}
