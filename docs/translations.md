# Translated listings

Every listing (our activities, Instagram events and berlin.de events) is shown in the visitor's language: English, German, Ukrainian or Russian.

- After each import, [`scripts/translate-listings.mjs`](../scripts/translate-listings.mjs) sends only the **new** texts to Claude and saves the answers in `data/translations-cache.json`. A text is never translated twice, and texts no listing uses any more are dropped from the file.
- Titles, organizers, descriptions and district names are translated. In addresses, the **street, house number and postcode stay as written** (people need them for maps and street signs); only the venue name is translated, with the original in brackets for Ukrainian and Russian.
- Translations someone wrote by hand in a listing (its `"de"`, `"uk"`, `"ru"` or `"en"` block) always win.
- At most 600 texts per run, so a bad day can't run up the bill. A normal day is a few dozen short texts.

## One-time setup

1. Create an API key at [platform.claude.com](https://platform.claude.com) → **API keys**.
2. In GitHub: the repository → **Settings → Secrets and variables → Actions → New repository secret**. Name: `ANTHROPIC_API_KEY`, value: the key.
3. **Actions → Import events from berlin.de → Run workflow** translates everything that's already listed. After that, it runs by itself with every import.

Without the secret, the imports still work and listings show in their original language.
