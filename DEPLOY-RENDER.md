# Deploying PDF Tool to Render (free tier)

This repo includes a `render.yaml` blueprint that creates everything for you:
a free PostgreSQL database, the API service, and the web app.

## Before you start

- A **GitHub repo** with the **latest** code pushed (Render builds from GitHub,
  so any local change must be pushed first).
- A free **Render account**: https://render.com (sign up with GitHub).

## Steps

### 1. Push the latest code to GitHub
Render builds exactly what's on GitHub. Make sure your newest code (including
`render.yaml` and the Dockerfile changes) is pushed to your repo.

### 2. Create the Blueprint on Render
1. Render Dashboard → **New +** → **Blueprint**.
2. Connect your GitHub account and pick the **pdftool** repo.
3. Render detects `render.yaml` and lists: a database, `pdftool-api`, `pdftool-web`.
4. Click **Apply**. Render creates the database and both services and starts building.

The first build is slow (~10–15 min) because the API image installs LibreOffice
and Tesseract. That's normal.

### 3. Confirm the URLs
`onrender.com` subdomains are globally unique. If `pdftool-api` / `pdftool-web`
were taken, Render adds a suffix, so your real URLs may differ from the defaults.

After both services show **Live**, check each service's URL (top of its page). If
either differs from:
- API: `https://pdftool-api.onrender.com`
- Web: `https://pdftool-web.onrender.com`

then update the env vars to the **real** URLs:
- On **pdftool-api**: set `WEB_URL` and `API_URL` to the real URLs → save.
- On **pdftool-web**: set `API_URL` to the real **API** URL → save, then
  **Manual Deploy → Clear build cache & deploy** (the API URL is baked in at
  build time, so the web app must rebuild).

### 4. Open your app
Visit the **web** URL. Sign up, or click **Continue as guest**. Done — it's live.

## What "free" means here (important)

- **Sleeps when idle:** after 15 minutes of no traffic, services sleep. The next
  visit takes ~30–60 seconds to wake. This applies to both web and API.
- **Database resets:** the free PostgreSQL database **expires 30 days** after
  creation. Fine for a demo; don't store anything you can't lose.
- **Starts empty:** this is a brand-new database — your local files/account are
  not carried over. Create a fresh account (or use guest) on the live site.
- **Instance hours:** 750 free hours/month per workspace across free services.

## Troubleshooting

- **Web loads but login/upload fails** → the web app can't reach the API. Re-check
  step 3: `API_URL` on the web service must be the API's real URL, then rebuild
  the web service with cleared cache.
- **API won't start** → open its Logs. It runs `prisma db push` on boot to create
  tables; if `DATABASE_URL` isn't wired, confirm the database was created by the
  blueprint.
- **Build times out / too slow** → the API image is large (LibreOffice + OCR). If
  the free build struggles, the alternative is the Cloudflare Tunnel option.
