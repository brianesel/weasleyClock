# Deployment guide

This app is a plain **Node.js + Express** server that stores data in a JSON file
(`data/trips.json`). That one detail drives every hosting decision below:

> **The app needs a persistent, writable filesystem.**
> On a "serverless" or ephemeral host, the filesystem resets on every deploy,
> scale event, or idle sleep — which means **your trips and sign-ups would
> silently disappear**. Pick a host with a persistent disk (recommended), or
> move the data into a managed database (see [Scaling past a file](#scaling-past-a-single-file)).

---

## TL;DR — which service should I use?

| If you want…                                  | Use            | Notes |
|-----------------------------------------------|----------------|-------|
| **The easiest path that just works** ⭐        | **Render**     | Free/cheap web service + a persistent disk. Deploy from GitHub in minutes. |
| Generous hobby tier, very fast setup          | **Railway**    | Add a Volume, point it at `/app/data`. Usage-based pricing. |
| Global/edge, scale-to-zero, cheap             | **Fly.io**     | Attach a Volume; a little more CLI/config. |
| Full control / cheapest at scale              | **A VPS** (Hetzner, DigitalOcean, Linode) | You manage the box; run under `pm2` or `systemd` behind Caddy/Nginx. |
| ❌ Avoid unless you switch to a database       | Vercel, Netlify, Cloudflare Workers, AWS Lambda | Serverless = ephemeral filesystem. Sign-ups won't persist. |

**My recommendation:** start on **Render** with a persistent disk. It's the
least fuss for an app this size, has a free tier to try it, and upgrades cleanly
if the trip list ever gets popular.

---

## Before you deploy (any host)

1. **Set a real admin password.** The default is `weasley`. Set the
   `ADMIN_PASSWORD` environment variable in your host's dashboard to a strong,
   unique value. Anyone with it can add/edit/delete trips.
2. **Let the host pick the port.** The server already reads `process.env.PORT`,
   so you don't need to hardcode anything.
3. **Persist the `data/` directory.** Mount a disk/volume there so
   `data/trips.json` survives restarts and deploys.
4. **Use HTTPS.** All the hosts below terminate TLS for you automatically. This
   matters because the admin password is sent with each admin request — over
   plain HTTP it would be exposed.

---

## Option 1 — Render (recommended) ⭐

1. Push this repo to GitHub (already done on your branch).
2. In the [Render dashboard](https://render.com), **New → Web Service**, and
   connect the repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. **Environment → Add Environment Variable:**
   - `ADMIN_PASSWORD` = your strong password
5. **Disks → Add Disk** (this is the important part):
   - **Mount path:** `/opt/render/project/src/data`
   - **Size:** 1 GB is plenty
6. Create the service. Render builds, deploys, and gives you an
   `https://<name>.onrender.com` URL.

There's a `render.yaml` in this repo that captures steps 3–5 as
Infrastructure-as-Code — with it, Render can configure the service and disk
automatically ("Blueprint" deploy).

> Note: on Render's **free** tier the service sleeps after inactivity and cold-
> starts on the next request (a few seconds). Your data on the mounted disk is
> preserved across sleeps. Upgrade to a paid instance to avoid the cold start.

---

## Option 2 — Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Railway auto-detects Node and runs `npm install` + `npm start`.
3. **Variables:** add `ADMIN_PASSWORD`.
4. **Volumes:** add a Volume and set its mount path to `/app/data` (Railway's
   working directory is `/app`).
5. Deploy. Under **Settings → Networking**, generate a public domain.

---

## Option 3 — Fly.io

1. Install the CLI and run `fly launch` in the repo (it detects Node and writes
   a `fly.toml`). Say **no** to deploying immediately so you can add a volume.
2. Create a volume and mount it at `/data`, then tell the app to use it:
   ```bash
   fly volumes create weasley_data --size 1
   ```
   In `fly.toml` add a mount:
   ```toml
   [mounts]
     source = "weasley_data"
     destination = "/data"
   ```
   Then set `DATA_DIR=/data` (see the note in
   [Scaling past a file](#scaling-past-a-single-file) about making the data path
   configurable) or mount the volume at the app's `data/` path instead.
3. `fly secrets set ADMIN_PASSWORD=your-strong-password`
4. `fly deploy`

Keep **one instance** (`min_machines_running = 1`, no autoscaling to multiple
machines) — a single JSON file can't be shared across several machines. See below.

---

## Option 4 — Your own VPS (Hetzner / DigitalOcean / Linode)

Cheapest at scale and full control; you maintain the box.

```bash
# On the server (Ubuntu example)
sudo apt update && sudo apt install -y nodejs npm
git clone <your-repo-url> && cd weasleyClock
npm install
sudo npm install -g pm2

ADMIN_PASSWORD="your-strong-password" pm2 start server.js --name weasley
pm2 save && pm2 startup     # keep it running across reboots
```

Put a reverse proxy in front for HTTPS. **Caddy** is the simplest — a two-line
`Caddyfile` gets you automatic Let's Encrypt certificates:

```
travel.yourdomain.com {
    reverse_proxy localhost:3000
}
```

The `data/trips.json` file lives on the server's normal disk, so it persists.
Take periodic backups (e.g. a nightly `cp data/trips.json` to object storage).

---

## Docker (works on Fly, a VPS, or any container host)

A `Dockerfile` is included. Build and run with the data directory mounted to a
named volume so it persists:

```bash
docker build -t weasley-tracker .
docker run -d -p 3000:3000 \
  -e ADMIN_PASSWORD="your-strong-password" \
  -v weasley_data:/app/data \
  --name weasley weasley-tracker
```

---

## Why NOT Vercel / Netlify / Lambda (for now)

These are excellent, but they run your code in **stateless, ephemeral**
functions. There is no durable local disk — anything written to `data/` is lost
when the function instance is recycled (which happens constantly). You'd lose
sign-ups. They become great options *after* you move storage to a database
(next section).

---

## Scaling past a single file

The JSON file store is deliberately simple and is perfect for a personal travel
tracker with modest traffic. You should graduate to a database when any of these
becomes true:

- You want to run **more than one instance** (horizontal scaling / load
  balancing) — multiple processes can't safely share one JSON file.
- You want to deploy to a **serverless** host (Vercel, Netlify, Lambda).
- Traffic grows enough that concurrent writes become a concern.

Good migration targets, in rough order of least effort:

1. **SQLite** on a persistent disk (e.g. `better-sqlite3`) — a one-file database
   that keeps the "single box, single file" simplicity but adds real
   transactions. Smallest change.
2. **A managed Postgres** — [Neon](https://neon.tech),
   [Supabase](https://supabase.com), or Render/Railway's built-in Postgres.
   Unlocks serverless hosting and multiple instances.

The data layer is isolated in **`db.js`** — every read/write goes through that
one module (`listTrips`, `createTrip`, `addSignup`, etc.). To migrate, you only
need to reimplement those exported functions against your new database; nothing
in `server.js` or the front-end has to change.

> Tip: if you plan to move the data path around (e.g. Fly's `/data` volume),
> make the directory configurable by reading `process.env.DATA_DIR` at the top
> of `db.js` and falling back to the local `data/` folder. It's a two-line change.

---

## Post-deploy checklist

- [ ] `ADMIN_PASSWORD` set to something strong (not `weasley`).
- [ ] Data directory is on a **persistent** disk/volume.
- [ ] Site loads over **HTTPS**.
- [ ] You can log in at `/admin.html` and add a trip.
- [ ] The new trip shows on the home page and the clock behaves.
- [ ] A backup plan exists for `data/trips.json` (or you've moved to a DB).
- [ ] Running a **single instance** (until you move to a database).
