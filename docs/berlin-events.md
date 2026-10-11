# Events from berlin.de

Twice a day a GitHub Action ([berlin-events.yml](../.github/workflows/berlin-events.yml)) reads the official **Kalender des Landes Berlin**, category **Kinder, Jugendliche**, and writes the events to [`data/berlin-events.json`](../data/berlin-events.json). The site shows them next to our own events.

## What we take, and what we don't

- **We take only facts:** title, date, time, place and address, district, organizer. Each event links to its page on berlin.de ("via berlin.de" and "Open on berlin.de").
- **We don't copy descriptions.** They belong to the organisers. The script reads them only to guess ages, price and interest.
- **berlin.de's rules for automated programs** ([robots.txt](https://www.berlin.de/robots.txt)): the program must name itself and keep to the allowed pages, and berlin.de may block programs that ask too much. The script sends `MomUp-KidsNearby-EventSync/1.0 (+repository link)`, reads only the calendar feed and event pages, waits 4 seconds between requests, and reads at most 60 new event pages per run.
- **Searching by date is blocked for programs:** when we asked for each of the next 14 days, berlin.de started redirecting us to its general calendar. So the script reads only the plain kids feed, and treats any redirect as a failure, never as data.

## How it works

1. **One feed per run:** the next 100 kids' events, which is about 3 to 4 days ahead. Events from earlier runs are kept until they're over, so the list on the site reaches further than one feed.
2. **One copy per event:** an event that repeats (an exhibition, a weekly group) is kept once, on its next date.
3. **Not for families:** things like professional conferences or support groups are left out (`isForFamilies` in [`scripts/berlin-lib.mjs`](../scripts/berlin-lib.mjs)).
4. **Event pages, read once:** each event's page gives the place, address, district and organizer. It's remembered in `data/berlin-places.json`, so later runs read only new events. After 5 failed pages the run stops asking and tries again next time.
5. **Map position:** OpenStreetMap, from the street address (or the place's name, or the postcode). Positions are cached in `data/geocode-cache.json`. Events that can't be found on the map are skipped.
6. **Guesses from the German text:**
   - **Ages:** from phrases like "5–8 Jahre", "ab 6 Jahren", "Babys". When the text doesn't say, the card shows no age badge, and the age filter keeps the event.
   - **Free:** from "kostenfrei", "Eintritt frei" and similar. Otherwise a price in € if the text names one, or nothing.
   - **Interest:** from keywords, for example "Konzert" → Music, "Bilderbuch" → Languages & reading. Flea markets and bazaars count as **sales**, so they appear in the red sales section and the daily sales email.

## Changing it

- **Pace:** `MAX_PAGES` and `PAUSE_MS` in [`scripts/berlin-sync.mjs`](../scripts/berlin-sync.mjs).
- **More days ahead, officially:** BerlinOnline, which runs the calendar, works with data partners. Asking them (webmaster@berlinonline.net) for a feed or export is the proper way to get more than the next 100 events.
- **Better guesses:** the word lists in [`scripts/berlin-lib.mjs`](../scripts/berlin-lib.mjs), with examples in [`scripts/berlin-lib.test.mjs`](../scripts/berlin-lib.test.mjs).
- **Run it now:** GitHub → **Actions → Import events from berlin.de → Run workflow**.
- **Locally:** `node scripts/berlin-sync.mjs --dry-run` prints the counts without changing files.
