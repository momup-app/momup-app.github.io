# Kids Nearby: system design

## The problem

Parents in Berlin find kids' activities through word of mouth, Kita and school notice boards, WhatsApp and Facebook groups, and a dozen separate studio and Verein websites, often only in German. Nothing answers the simple question: *what can my 7-year-old do near home on a Tuesday after school, and what does it cost?*

The first city is Berlin. Distances are in kilometers, prices in euros, and address search is limited to the city.

## Who uses it

| User | Needs |
|---|---|
| Parent | Find, compare and save activities by age, interest, day, price and distance. Get told when something new fits. |
| Organizer (studio, coach, library, club) | List activities and keep times, prices and open spots up to date. |
| Admin | Approve new listings and remove bad ones. |

## Version 1 (this repository)

A static site on GitHub Pages, at no cost.

```
Browser ──► GitHub Pages: index.html, app.js, data/activities.json
   │
   ├──► OpenStreetMap tiles (map)
   └──► Nominatim (address → coordinates)
```

- **Data:** one JSON file in the repo. New listings arrive as issues or pull requests and are reviewed before merging.
- **Search:** all filtering and distance math runs in the browser. Fine for a few thousand listings.
- **Privacy:** no accounts, no tracking. Saved activities live in `localStorage`.

## Version 2: a real service

When listings pass a few thousand, or organizers want to edit their own, move to:

```
Web app (same UI) ──► API ──► Postgres + PostGIS
                        │
                        ├── Auth (parents, organizers, admins)
                        ├── Moderation queue
                        └── Notification worker ──► email / push
```

**Data model**

- `organizers`: name, contact, verified flag
- `venues`: address, location (PostGIS `geography(Point)`)
- `activities`: organizer, venue (null when online), title, description, category, min/max age, format, price, schedule (days, times, start/end dates), capacity, status (`pending`, `published`, `archived`)
- `saved_activities`: parent, activity
- `alerts`: parent, saved search (age, category, radius, home point), last sent

**Key queries**

- Nearby search: `ST_DWithin(venue.location, :home, :radius)` plus filters, ordered by `ST_Distance`. Index the location with GiST.
- New-match alerts: a nightly job runs each saved search against activities published since its last run.

**Suggested stack:** Supabase (Postgres, PostGIS, auth and row-level security in one), the current front end, and a scheduled function for alerts. It is free to start and needs no server to manage.

## Safety and privacy

This product is about children, so:

- Store **no data about the child**: no name, photo or school. Age is a filter, never saved to a profile.
- Parents' home locations are used for search and not stored, unless they turn on alerts. Then store a rounded point, never the street address.
- Organizers are verified before their listings go live. Show a "verified" badge and let parents report a listing.
- No messaging between strangers and kids. Contact goes to the organizer's public business details only.

### GDPR (DSGVO)

The service runs in Germany, so it has to follow the GDPR from day one:

- **Impressum and Datenschutzerklärung** pages before public launch (required for German websites).
- **Version 1** sets no cookies and has no analytics, so it needs no cookie banner. The privacy page must still name OpenStreetMap (map tiles) and Nominatim (address lookup), which receive the visitor's IP address.
- **Version 2:** host in the EU (for example Supabase's Frankfurt region), sign a data processing agreement (AVV) with each provider, collect only what alerts need, and let parents export or delete their account in one click.
- If traffic grows, self-host map tiles and geocoding so no visitor data leaves our servers.

## Roadmap

1. Real listings for one Berlin neighborhood (for example Prenzlauer Berg), gathered by hand
2. German and English interface
3. Organizer submission form and moderation
4. Parent accounts, saved searches and email alerts
5. Calendar export (.ics) and "spots left" from organizers
6. Every Berlin district, then more German cities
