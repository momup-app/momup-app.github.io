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
4. Do the same with [`supabase/002_sales_alerts.sql`](../supabase/002_sales_alerts.sql). It adds the [daily sales email](sales-alerts.md).

## 3. Login settings

**Authentication → URL Configuration**

- Site URL: `https://momup-app.github.io`. A new project starts with `http://localhost:3000` here, so it must be changed. Otherwise the login link sends people to "localhost" and nothing loads.
- Redirect URLs → **Add URL**: `https://momup-app.github.io/**`

**Authentication → Sign In / Providers → Email**: leave **Email** turned on.

## 4. Sending the login emails through Gmail (important)

Supabase's built-in email sender is for testing only. It sends only to the project's team members, and just a few emails per hour. For real parents, the login emails go out through Yuliia's Gmail.

**Google account** (`yuliia.designer.ux@gmail.com`):

1. **myaccount.google.com → Security → 2-Step Verification → Turn on.** Google first asks for a second step, such as a phone number or a passkey. Without 2-Step Verification, app passwords don't exist and Gmail refuses the login.
2. **myaccount.google.com/apppasswords** → name it `Supabase` → **Create**. Copy the 16 letters **without spaces**.

**Supabase: Authentication → Emails → SMTP Settings → Enable custom SMTP**

- Sender email: `yuliia.designer.ux@gmail.com`, sender name: `MomUp`
- Host: `smtp.gmail.com`
- Port: `587` (`465` also works)
- Username: `yuliia.designer.ux@gmail.com`
- Password: the app password from step 2, not the normal Gmail password
- Click **Save**

Supabase then warns that Gmail is meant for personal email. That's only a warning: it's fine while the site is small, and Gmail allows about 500 emails a day.

**If login emails don't arrive:** the site shows "Couldn't send the link" and Supabase logs say *Error sending confirmation email*. That means Gmail refused: check that 2-Step Verification is on, then create a new app password and paste it without spaces.

**Optional:** **Authentication → Emails → Templates** ("Confirm signup" for new people, "Magic Link" for returning ones), to write the emails in German, for example *Subject: Dein Login-Link für Kids Nearby*.

**Later, with a domain like momup.app:** switch to a sending service such as Brevo, Resend or Postmark, so the emails come from `info@momup.app`. Only these SMTP settings change; the website stays the same.

## 5. Connect the website

In Supabase: **Project Settings → API Keys** (or **API**). Send Iana these two values:

- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **Publishable key** (`sb_publishable_…`) or **anon public** key

Both are meant to be public, so they're safe to send. **Never send the `service_role` or "secret" key.**

Iana puts them into [`supabase-config.js`](../supabase-config.js), and the "Log in" link appears on the site.

## 6. Give Iana access

Supabase: **Organization settings → Team → Invite**, with Iana's email and role **Administrator**.

## Before public launch

Name these on the privacy page (Datenschutzerklärung):

- **Supabase** (accounts, hosted in Frankfurt). It offers a data processing agreement (AVV/DPA) in its settings.
- **Google / Gmail**, which sends the login emails and the daily sales email.
- **FormSubmit**, which sends the "Suggest an activity" form to Yuliia's email.

## Family details

Run [`supabase/004_family.sql`](../supabase/004_family.sql) in the SQL Editor (after 002 and 003). It adds **Your kids** (first name and date of birth) and **What other moms can see in the app** to *My account*. Everything is private by default: other members see only what a parent ticks, and never the exact birthday. Until the file has run, *My account* shows the simple age buttons.
