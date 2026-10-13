# Translated listings

Every listing (our activities, Instagram events and berlin.de events) is shown in the visitor's language: English, German, Ukrainian or Russian.

- After each import, [`scripts/translate-listings.mjs`](../scripts/translate-listings.mjs) sends only the **new** texts to Google's free translator and saves the answers in `data/translations-cache.json`. A text is never translated twice, and texts no listing uses any more are dropped from the file.
- It's free and needs no account or key. Google offers this address without guarantees: if it refuses one day, the run says so on GitHub, the listings stay in their original language, and the rest is translated on the next run.
- Titles, organizers, descriptions and district names are translated. In addresses, the **street, house number and postcode stay as written** (people need them for maps and street signs); only the venue name in front is translated, with the original in brackets for Ukrainian and Russian. Organizer names get the original in brackets too.
- Translations someone wrote by hand in a listing (its `"de"`, `"uk"`, `"ru"` or `"en"` block) always win.
- At most 300 texts per run. A normal day is a few dozen; the very first run took about 13 minutes for 228 texts.
- In each event window, **🌐 Translate (Google)** opens Google Translate for anything still untranslated.

**Fix a bad translation:** add it by hand to the listing, for example `"uk": { "title": "…" }` in `data/events.json`. Hand translations always win. For berlin.de events, which are re-imported, change the text in `data/translations-cache.json` instead (search for the wrong text).
