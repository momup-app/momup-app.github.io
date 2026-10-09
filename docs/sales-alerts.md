# Daily sales email

Parents with an account can tick **Notifications → Kids' clothes sales & flea markets** on *My account*. Every morning a GitHub Action checks for upcoming sales they haven't been told about yet. If there are any, it sends **one email** in their language (DE / EN / RU) through Yuliia's Gmail.

- Sales are events with the category `sales`. On Instagram: `#momupevent` plus `#sale`, `#basar`, `#kinderbasar`, `#flohmarkt` or `#kleidertausch`.
- Nobody gets the same sale twice (the `alert_log` table remembers).
- If a parent entered their kids' ages, they only get sales that fit those ages.
- Days without new sales: no email.
- Every email has a link to turn notifications off.

## One-time setup

### 1. Database (Supabase → SQL Editor)

Paste all of [`supabase/002_sales_alerts.sql`](../supabase/002_sales_alerts.sql) and click **Run**. It should say *Success*.

### 2. Three GitHub secrets

In the repository: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API Keys → Secret keys**: create or copy a secret key (`sb_secret_…`). On the older screen it's the **service_role** key. |
| `GMAIL_USER` | `yuliia.designer.ux@gmail.com` |
| `GMAIL_APP_PASSWORD` | the 16-letter Google App password, without spaces (the same one used in Supabase SMTP works) |

The secret key can read all accounts. Put it **only** into this GitHub secret: never into the website, a chat or an email.

### 3. Test it

1. On the site, log in, tick the sales notification, and click **Save**.
2. GitHub → **Actions → Daily sales email → Run workflow**. Leave **Dry run** ticked. The summary shows how many emails *would* be sent.
3. Run it again with **Dry run** unticked: you should get the email.

After that it runs by itself every day at 07:00 UTC (08:00 in Berlin in winter, 09:00 in summer).

## Notes

- Gmail allows about 500 emails a day. When there are more subscribers, switch to an email service (for example Brevo) by changing the SMTP settings in [`scripts/send-sales-alerts.mjs`](../scripts/send-sales-alerts.mjs).
- The repository is public, so the Action logs are too. The script only ever prints counts, never email addresses.
- Name the sales email on the privacy page (Datenschutzerklärung): people opt in with the checkbox and can opt out any time.
