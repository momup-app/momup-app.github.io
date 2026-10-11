#!/usr/bin/env node
// Daily email and phone notification (web push) about new kids' clothes sales.
// Run by .github/workflows/sales-alerts.yml. Each channel runs when its secrets are set.
//
//   node scripts/send-sales-alerts.mjs            # send for real
//   node scripts/send-sales-alerts.mjs --dry-run  # work out who gets what, send nothing
//   --preview-dir <dir>   also write each email as HTML (for checking the design)
//
// The repository is public, so its Action logs are too: never print email addresses or phone addresses, only counts.

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { berlinToday, upcomingSales, salesFor, buildEmail, buildPush, SITE_URL } from "./alerts-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const previewDir = args.includes("--preview-dir") ? args[args.indexOf("--preview-dir") + 1] : null;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, GMAIL_USER, GMAIL_APP_PASSWORD, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;

function headers(extra = {}) {
  const h = { apikey: KEY, "Content-Type": "application/json", ...extra };
  if (KEY.startsWith("eyJ")) h.Authorization = `Bearer ${KEY}`; // older "service_role" keys are JWTs
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: headers(options.headers) });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${path.split("?")[0]}: ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

async function summary(lines) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

// Who already got which sale on one channel (email: alert_log, push: push_log).
async function sentSoFar(table, sales) {
  const ids = sales.map((e) => `"${e.id.replace(/"/g, "")}"`).join(",");
  const rows = await api(`${table}?select=user_id,item_id&item_id=in.(${encodeURIComponent(ids)})`);
  const sent = new Map();
  for (const row of rows) {
    if (!sent.has(row.user_id)) sent.set(row.user_id, new Set());
    sent.get(row.user_id).add(row.item_id);
  }
  return sent;
}

async function remember(table, userId, todo) {
  await api(table, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(todo.map((e) => ({ user_id: userId, item_id: e.id }))),
  });
}

// ---------- email ----------
async function sendEmails(sales) {
  if (!dryRun && (!GMAIL_USER || !GMAIL_APP_PASSWORD)) {
    return ["Email: skipped, GMAIL_APP_PASSWORD isn't set yet (docs/sales-alerts.md)."];
  }
  const recipients = await api("rpc/alert_recipients", { method: "POST", body: JSON.stringify({ topic: "sales" }) });
  const sent = await sentSoFar("alert_log", sales);

  let transport = null;
  if (!dryRun) {
    const nodemailer = (await import("nodemailer")).default;
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  if (previewDir) await mkdir(previewDir, { recursive: true });

  let emails = 0, items = 0, n = 0;
  for (const r of recipients) {
    const todo = salesFor(r, sales, sent.get(r.user_id) || new Set());
    if (!todo.length) continue;
    n += 1;
    const mail = buildEmail(r.language, todo, SITE_URL);
    if (previewDir) await writeFile(`${previewDir}/email-${n}-${r.language}.html`, mail.html);
    if (dryRun) { emails += 1; items += todo.length; continue; }
    try {
      await transport.sendMail({
        from: `"MomUp" <${GMAIL_USER}>`, to: r.email,
        subject: mail.subject, text: mail.text, html: mail.html,
      });
      await remember("alert_log", r.user_id, todo);
      emails += 1; items += todo.length;
      await new Promise((ok) => setTimeout(ok, 1500)); // gentle on Gmail
    } catch (err) {
      failed += 1;
      console.log(`::warning::One email failed: ${String(err.message).slice(0, 160)}`);
    }
  }
  return [`Email: ${recipients.length} with sales alerts on · ${dryRun ? "would send" : "sent"} ${emails} (${items} sale${items === 1 ? "" : "s"})`];
}

// ---------- push to phones ----------
async function sendPushes(sales) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return ["Push: skipped, the VAPID keys aren't set."];
  let phones;
  try {
    phones = await api("rpc/push_recipients", { method: "POST", body: JSON.stringify({ topic: "sales" }) });
  } catch (err) {
    if (/push_recipients/.test(err.message)) return ["Push: skipped, run supabase/005_push.sql first."];
    throw err;
  }
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(SITE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const sent = await sentSoFar("push_log", sales);

  // One message per person, to each of their phones.
  const people = new Map();
  for (const p of phones) {
    if (!people.has(p.user_id)) people.set(p.user_id, { ...p, phones: [] });
    people.get(p.user_id).phones.push({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } });
  }

  let delivered = 0, notified = 0, gone = 0;
  for (const person of people.values()) {
    const todo = salesFor(person, sales, sent.get(person.user_id) || new Set());
    if (!todo.length) continue;
    if (dryRun) { notified += 1; delivered += person.phones.length; continue; }
    const message = JSON.stringify(buildPush(person.language, todo, SITE_URL));
    let ok = 0;
    for (const phone of person.phones) {
      try {
        await webpush.sendNotification(phone, message, { TTL: 12 * 3600, urgency: "normal" });
        ok += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // The phone turned notifications off or the app was removed: forget it.
          await api(`push_subscriptions?endpoint=eq.${encodeURIComponent(phone.endpoint)}`, { method: "DELETE" });
          gone += 1;
        } else {
          failed += 1;
          console.log(`::warning::One push failed: ${err.statusCode || ""} ${String(err.body || err.message).slice(0, 120)}`);
        }
      }
    }
    if (ok) { await remember("push_log", person.user_id, todo); notified += 1; delivered += ok; }
  }
  return [`Push: ${people.size} people with phones on · ${dryRun ? "would notify" : "notified"} ${notified} on ${delivered} phone${delivered === 1 ? "" : "s"}` +
    (gone ? ` · ${gone} old phone${gone === 1 ? "" : "s"} removed` : "")];
}

let failed = 0;

async function main() {
  if (!SUPABASE_URL || !KEY) {
    console.log("::notice::Sales alerts are not set up yet (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). See docs/sales-alerts.md.");
    return;
  }
  const read = (name) => readFile(new URL("../data/" + name, import.meta.url), "utf8").then(JSON.parse, () => []);
  // Our own events plus the flea markets and bazaars imported from berlin.de.
  const events = (await read("events.json")).concat(await read("berlin-events.json"));
  const sales = upcomingSales(events, berlinToday());
  if (!sales.length) return summary(["### Sales alerts", "", "No upcoming sales: nothing to send."]);

  const lines = [...await sendEmails(sales), ...await sendPushes(sales)];
  await summary([
    "### Sales alerts" + (dryRun ? " (dry run: nothing sent)" : ""),
    "",
    `Upcoming sales: ${sales.length}`,
    ...lines.map((l) => "- " + l),
    ...(failed ? [`- Failed: ${failed}`] : []),
  ]);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("::error::" + err.message);
  process.exit(1);
});
