# Instagram sync

Post an event on [@momup_app](https://www.instagram.com/momup_app/) with the hashtag **#momupevent**, and within an hour it appears under "Upcoming events" on the website, with a link back to the post.

## How to write the post

The first line is the title. Then add one line each for date, place, ages and price. Anything else becomes the description.

**German**

```
Kürbisschnitzen im Garten 🎃
📅 25.10.2026, 14:00–17:00
📍 Prinzessinnengarten, Moritzplatz, 10969 Berlin
👶 5–12 Jahre
💶 8 € pro Kind
Kürbisse und Werkzeug sind da. Bitte warm anziehen!
#momupevent #basteln
```

**English**

```
Bedtime stories live 📖
📅 22.10.2026, 19:00–19:30
📍 Online
👶 3–7
💶 Free
Pajamas on, lights low: two short stories, read live.
#momupevent #stories
```

| Line | Required | Examples that work |
|---|---|---|
| 📅 date and time | yes | `25.10.2026, 14:00–17:00` · `25.10. 14-17 Uhr` · `11.11. ab 17 Uhr` (2 hours) |
| 📍 place | yes | an address or park name in Berlin · `Online` |
| 💶 price | yes | `kostenlos` · `free` · `5 €` · `8 € pro Kind` · `€4,50 / Familie` |
| 👶 ages | no | `3–6` · `ab 2` · `3+` (all ages if left out) |
| #hashtag for the topic | no | `#basteln` `#sport` `#musik` `#tanz` `#mint` `#vorlesen` `#draussen` |

Words work instead of emoji, with a colon: `Datum:`, `Ort:`, `Alter:`, `Preis:` or `When:`, `Where:`, `Ages:`, `Price:`.

- **Change an event:** edit the caption. The site updates within an hour.
- **Cancel an event:** delete the post, or remove `#momupevent` from the caption.
- **Past events** disappear from the site by themselves.
- **Post not showing?** Open the repository's [Actions tab](https://github.com/yuliiaux/kids-nearby/actions), click the latest "Sync events from Instagram" run, and the summary lists every tagged post it couldn't read, and why.

## One-time setup

Meta changes these screens often, so the names may differ slightly.

### 1. Make the account professional

In the Instagram app: **Settings → Account type and tools → Switch to professional account**. Choose **Creator** or **Business**. It's free, and the posts and followers stay the same.

### 2. Create a Meta developer app

1. Go to [developers.facebook.com](https://developers.facebook.com), log in, and register as a developer if asked.
2. **My Apps → Create app**. Name it, for example, "MomUp website".
3. When asked for a use case, choose the **Instagram** one ("Manage messaging & content on Instagram").
4. The app can stay in **Development** mode. Only @momup_app's own posts are read, so no app review is needed.

### 3. Get an access token

1. In the app dashboard, open **Instagram → API setup with Instagram login**.
2. Under **Generate access tokens**, click **Add account** and log in as **@momup_app**. Accept the permission (`instagram_business_basic`, which only reads posts).
3. Click **Generate token** and copy it. It's valid for 60 days, and step 5 keeps it renewed.

Treat the token like a password. Don't post it or send it in a chat.

### 4. Give the token to GitHub

In [the repository](https://github.com/yuliiaux/kids-nearby): **Settings → Secrets and variables → Actions → New repository secret**

- Name: `IG_ACCESS_TOKEN`
- Secret: the token from step 3

### 5. Let GitHub renew the token automatically

1. On GitHub as **yuliiaux**: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Repository access: only `kids-nearby`. Permissions: **Secrets → Read and write**. Choose the longest expiry you're comfortable with.
3. Save it in the repository as a second secret named `REPO_ADMIN_TOKEN`.

The "Refresh Instagram token" workflow then renews the Instagram token on the 1st and 15th of each month. If this GitHub token expires, that workflow fails and GitHub emails you. Make a new one and replace the secret.

### 6. Try it

1. Publish a test post with `#momupevent`. You can archive it afterwards.
2. In the [Actions tab](https://github.com/yuliiaux/kids-nearby/actions), open **Sync events from Instagram → Run workflow**.
3. When it turns green, check the website (refresh the page).

## How it works

```
Instagram post ──(every hour)──► GitHub Action ──► data/events.json ──► website
                                  │
                                  ├─ reads posts via Instagram API
                                  ├─ keeps only #momupevent posts
                                  ├─ reads date, place, ages, price from the caption
                                  └─ finds the address on the map (OpenStreetMap)
```

- Code: [`scripts/parse-caption.mjs`](../scripts/parse-caption.mjs) reads captions, and [`scripts/instagram-sync.mjs`](../scripts/instagram-sync.mjs) runs the sync.
- Events added by hand to `data/events.json` (without `"source": "instagram"`) are never changed by the sync.
- Found addresses are saved in `data/geocode-cache.json`, so each address is looked up once.
- Test without a token: `node scripts/instagram-sync.mjs --fixture scripts/fixtures/sample-media.json --dry-run`
- Run the caption tests: `node --test scripts/`
