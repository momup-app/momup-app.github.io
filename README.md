# Kids Nearby

Helps parents in Berlin find activities for their kids nearby: classes, clubs, camps and online options, filtered by age, interest, day, price and distance.

Live: [yuliiaux.github.io/kids-nearby](https://yuliiaux.github.io/kids-nearby)

## Features

- Search by Berlin address or postcode, or use your current location
- Filter by child's age, interest, day, in person or online, distance, and free only
- List sorted by distance, with every in-person activity on a map
- Save favorites (kept in your own browser only)
- Share a search: filters are kept in the page link
- German and English: opens in the browser's language, switch any time with DE | EN
- Upcoming events with "Add to calendar", synced every hour from [@momup_app](https://www.instagram.com/momup_app/) posts tagged `#momupevent` ([how it works](docs/instagram-sync.md))

## Run it locally

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly won't load the data, because browsers block `fetch` from `file://`.

## Add an activity

Edit [`data/activities.json`](data/activities.json) (English text, plus German in the `de` field) and open a pull request, or [suggest one in an issue](https://github.com/yuliiaux/kids-nearby/issues/new?template=add-activity.yml). Current listings are sample data.

## How it's built

Interface text for both languages is in [`i18n.js`](i18n.js).

Plain HTML, CSS and JavaScript. Maps by [Leaflet](https://leafletjs.com) and OpenStreetMap; address lookup by OpenStreetMap Nominatim. Hosted on GitHub Pages.

How this grows into a full service: [docs/system-design.md](docs/system-design.md).
