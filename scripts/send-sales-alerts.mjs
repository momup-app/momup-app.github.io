#!/usr/bin/env node
// Daily email about new kids' clothes sales. Run by .github/workflows/sales-alerts.yml.
//
//   node scripts/send-sales-alerts.mjs            # send for real
//   node scripts/send-sales-alerts.mjs --dry-run  # work out who gets what, send nothing
//   --preview-dir <dir>   also write each email as HTML (for checking the design)
//
// The repository is public, so its Action logs are too: never print email addresses, only counts.

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { berlinToday, upcomingSales, salesFor, buildEmail, SITE_URL } from "./alerts-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const previewDir = args.includes("--preview-dir") ? args[args.indexOf("--preview-dir") + 1] : null;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

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

async function main() {
  if (!SUPABASE_URL || !KEY) {
    console.log("::notice::Sales alerts are not set up yet (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). See docs/sales-alerts.md.");
    return;
  }
  if (!dryRun && (!GMAIL_USER || !GMAIL_APP_PASSWORD)) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD missing. See docs/sales-alerts.md.");
  }

  const events = JSON.parse(await readFile(new URL("../data/events.json", import.meta.url), "utf8"));
  const sales = upcomingSales(events, berlinToday());
  if (!sales.length) return summary(["### Sales alerts", "", "No upcoming sales: nothing to send."]);

  const recipients = await api("rpc/alert_recipients", { method: "POST", body: JSON.stringify({ topic: "sales" }) });
  const ids = sales.map((e) => `"${e.id.replace(/"/g, "")}"`).join(",");
  const log = await api(`alert_log?select=user_id,item_id&item_id=in.(${encodeURIComponent(ids)})`);
  const sent = new Map();
  for (const row of log) {
    if (!sent.has(row.user_id)) sent.set(row.user_id, new Set());
    sent.get(row.user_id).add(row.item_id);
  }

  let transport = null;
  if (!dryRun) {
    const nodemailer = (await import("nodemailer")).default;
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  if (previewDir) await mkdir(previewDir, { recursive: true });

  let emails = 0, items = 0, failed = 0, n = 0;
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
      await api("alert_log", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(todo.map((e) => ({ user_id: r.user_id, item_id: e.id }))),
      });
      emails += 1; items += todo.length;
      await new Promise((ok) => setTimeout(ok, 1500)); // gentle on Gmail
    } catch (err) {
      failed += 1;
      console.log(`::warning::One email failed: ${String(err.message).slice(0, 160)}`);
    }
  }

  await summary([
    "### Sales alerts" + (dryRun ? " (dry run: nothing sent)" : ""),
    "",
    `Upcoming sales: ${sales.length} · people with sales alerts on: ${recipients.length}`,
    `Emails ${dryRun ? "that would be sent" : "sent"}: ${emails} (${items} sale${items === 1 ? "" : "s"} in total)` + (failed ? ` · failed: ${failed}` : ""),
  ]);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("::error::" + err.message);
  process.exit(1);
});
