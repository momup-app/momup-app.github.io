# Accounts setup (Supabase)

Free accounts: people sign up with only their email (we send them a login link, no password), and their saved activities follow them to every device. Until this setup is done, the site works as before and the "Log in" link stays hidden.

What's stored, all in the EU (Frankfurt): the email address, an optional name, the children's ages (never names or photos), an optional postcode, the email-alert choice, and the saved activities. Each person can only read their own data. "Delete my account" removes everything.

## 1. Create the Supabase project (Yuliia, about 5 minutes)

1. Go to [supabase.com](https://supabase.com), click **Start your project**, and sign in with GitHub as **yuliiaux**.
2. Create an organization: name **MomUp**, plan **Free**.
3. **New project**:
   - Name: `momup`
   - Database password: let it generate one, and save it in a password manager
   - Region: **Central EU (Frankfurt)**
4. Wait about 2 minutes until the project is ready.

## 2. Create the tables (1 minute)

1. Left menu: **SQL Editor → New query**.
2. Copy everything from [`supabase/schema.sql`](../supabase/schema.sql), paste it in, and click **Run**.
3. It should say *Success. No rows returned*.

## 3. Login settings

**Authentication → URL Configuration**

- Site URL: `https://momup-app.github.io`
- Redirect URLs → **Add URL**: `https://momup-app.github.io/**`

**Authentication → Sign In / Providers → Email**: leave **Email** turned on.

## 4. Sending the login emails (important)

Supabase's built-in email sender is for testing only. It sends only to the project's team members, and just a few emails per hour. For real parents, connect a free email service:

1. Create a free account at [brevo.com](https://www.brevo.com). It's an EU company, with 300 emails a day free.
2. In Brevo: **Senders, Domains & Dedicated IPs → Senders → Add a sender** with `yuliia.designer.ux@gmail.com`, and confirm the email Brevo sends.
3. In Brevo: **SMTP & API → SMTP → Generate a new SMTP key** and copy it.
4. In Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: `yuliia.designer.ux@gmail.com`, sender name: `MomUp`
   - Host: `smtp-relay.brevo.com`, port: `587`
   - Username: your Brevo login email
   - Password: the SMTP key
5. Optional: **Authentication → Emails → Templates → Magic Link**, to write the login email in German, for example *Subject: Dein Login-Link für Kids Nearby*.

## 5. Connect the website

In Supabase: **Project Settings → API Keys** (or **API**). Send Iana these two values:

- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **Publishable key** (`sb_publishable_…`) or **anon public** key

Both are meant to be public, so they're safe to send. **Never send the `service_role` or "secret" key.**

Iana puts them into [`supabase-config.js`](../supabase-config.js), and the "Log in" link appears on the site.

## 6. Give Iana access

Supabase: **Organization settings → Team → Invite**, with Iana's email and role **Administrator**.

## Before public launch

Name **Supabase** (accounts, EU hosting) and **Brevo** (login emails) on the privacy page (Datenschutzerklärung). Both offer a data processing agreement (AVV/DPA) in their settings.
