# PDFForge

A Sejda-like PDF web application: edit, convert, organize, compress and sign PDF files online.

## Stack

Next.js 15 + React 19 + Tailwind CSS + shadcn/ui on the frontend; Node.js + Express + TypeScript on the backend; Prisma ORM (SQLite in dev, PostgreSQL in production); JWT auth with rotating refresh tokens and Google OAuth; Docker Compose + Nginx for deployment.

## Repository layout

```
apps/api          Express REST API (auth, users; PDF services from Phase 2)
apps/web          Next.js app (login, register, dashboard)
packages/shared   Zod schemas and API types shared by both apps
nginx/            Reverse-proxy config for production
scripts/          Build utilities (SQLite → PostgreSQL provider switch)
```

## Development (offline local mode)

```bash
npm install        # one-time, needs internet
npm run setup      # generates apps/api/.env + creates the SQLite database
npm run dev        # API on :4000, web on :3000
```

After `npm install`, the app runs **fully offline**: SQLite database, local file
storage, no external requests at runtime (no CDNs, no external fonts, no
telemetry). Works the same on Windows, macOS and Linux.

| Feature | Offline behaviour |
| --- | --- |
| Accounts, upload, viewer, editor, organize, merge/split, compress, redact, forms | Fully offline |
| Email verification / password reset | Links print to the API console |
| Google sign-in | Disabled (503) until GOOGLE_* env vars are set |
| Word/Excel/PowerPoint conversion | Needs LibreOffice installed locally |
| OCR | Needs Tesseract installed locally |

Open http://localhost:3000. The web app proxies `/api/*` to the API, so everything is same-origin in the browser.

Without SMTP configured, verification and password-reset emails are printed to the API console — copy the link from there. Without Google credentials, `/api/auth/google` returns 503 and the rest of auth works normally.

## Tests

```bash
npm test          # API integration tests (node:test + supertest)
npm run lint
npm run typecheck
```

## Production

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, JWT secrets, PUBLIC_URL
docker compose up --build
```

Nginx serves everything on port 8080. The API image switches Prisma to PostgreSQL and runs `prisma migrate deploy` on start.

## Auth design

Access tokens are short-lived JWTs held in memory by the web app. Refresh tokens are opaque, stored hashed (SHA-256) in the database, rotated on every use, and delivered in an httpOnly `SameSite=Lax` cookie scoped to `/api/auth`. Token reuse after rotation revokes the whole session family. Password reset and email verification use single-use hashed tokens with short expiries. Login, register and reset endpoints are rate-limited.
