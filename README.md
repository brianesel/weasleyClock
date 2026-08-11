# 🧭 Weasley Travel Tracker

A little web app for publishing your travel schedule and letting people see where
you are — and sign up to come along. The home page features a **Weasley-family-style
clock** ([inspiration](https://harrypotter.fandom.com/wiki/Weasley_Clock)) whose hand
points to your current status. As requested, the clock's positions swap *Prison* for
**High Altitude** and add **Scared Shirtless**.

## Features

- **Weasley clock** on the home page — one hand pointing to your live status,
  computed automatically from today's date vs. your trip schedule.
- **Public trip schedule** — anyone can see upcoming destinations, dates, notes,
  and how many spots are open.
- **Sign-ups** — visitors can grab an available spot to join a trip (name, optional
  email + note). Spots-left and capacity are enforced.
- **Admin dashboard** — password-protected page to add / edit / delete trips and
  view or remove sign-ups (including sign-up emails, which are never exposed publicly).

## Clock statuses

`Home` · `Traveling` · `In Transit` · `Work` · `Vacation` ·
**`High Altitude`** · `Lost` · `Mortal Peril` · **`Scared Shirtless`**

Each trip is tagged with one status; while today falls inside a trip's date range,
the clock hand swings to that trip's status. Otherwise it rests on `Home`.

## Getting started

```bash
npm install
npm start
```

Then open:

- **Home / clock:** http://localhost:3000
- **Admin:** http://localhost:3000/admin.html

## Admin password

The default admin password is `weasley`. **Change it** by setting an environment
variable before starting:

```bash
ADMIN_PASSWORD="your-secret" npm start
```

You can also change the port with `PORT=8080 npm start`.

## Optional: seed some sample trips

```bash
npm run seed
```

This writes a few example trips into `data/trips.json` so you can see the app in
action. (Skip it if you'd rather start empty.)

## How data is stored

Trips and sign-ups are kept in a single JSON file at `data/trips.json` — no database
server or native build tools required, so it runs anywhere Node 18+ does. The file is
written atomically. For production you'd typically swap this for a real database, but
the file store keeps the app dependency-light and easy to run.

## Project layout

```
server.js        Express server + REST API
db.js            JSON-file data store (trips, signups)
seed.js          Optional sample-data seeder
public/
  index.html     Home page (clock + trip list + signup)
  app.js         Clock rendering + trip/signup logic
  admin.html     Admin dashboard
  admin.js       Admin CRUD logic
  styles.css     Shared styles
```

## Notes on privacy

The public API (`/api/trips`) returns companion **names and notes** but never their
email addresses. Emails are only visible on the password-protected admin dashboard.
