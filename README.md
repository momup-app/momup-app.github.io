# Kids Nearby

Helps parents in Berlin find activities for their kids nearby: classes, clubs, camps and online options, filtered by age, interest, day, price and distance.

Live: [momup-app.github.io](https://momup-app.github.io)

## Features

- Search by Berlin address or postcode, or use your current location
- Filter by child's age, interest, day, in person or online, distance, and free only
- List sorted by distance, with every in-person activity on a map
- Save favorites (kept in your own browser only)
- Share a search: filters are kept in the page link
- German, English and Russian: opens in the browser's language, switch any time with DE | EN | RU
- Free accounts (email login link, no password): saved activities on every device ([setup](docs/accounts-setup.md))
- Mom chat: members start topics and reply to each other live ([setup](docs/chat.md))
- Daily email about new kids' clothes sales & flea markets for parents who opt in ([setup](docs/sales-alerts.md))
- Upcoming events with "Add to calendar", synced every hour from [@momup_app](https://www.instagram.com/momup_app/) posts tagged `#momupevent` ([how it works](docs/instagram-sync.md))

## Run it locally

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly won't load the data, because browsers block `fetch` from `file://`.

## Add an activity

Edit [`data/activities.json`](data/activities.json) (English text, plus translations in the `de` and `ru` fields) and open a pull request, or [suggest one in an issue](https://github.com/momup-app/momup-app.github.io/issues/new?template=add-activity.yml). Current listings are sample data.

## How it's built

Interface text for all languages is in [`i18n.js`](i18n.js).

Plain HTML, CSS and JavaScript. Maps by [Leaflet](https://leafletjs.com) and OpenStreetMap; address lookup by OpenStreetMap Nominatim. Hosted on GitHub Pages.

How this grows into a full service: [docs/system-design.md](docs/system-design.md).
