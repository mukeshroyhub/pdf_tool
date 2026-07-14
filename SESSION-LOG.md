# PDF Tool — Work Session Log

**Date:** 13–14 July 2026
**Repo:** github.com/mukeshroyhub/pdf_tool
**Live app:** https://pdftool-web.onrender.com
**API:** https://pdftool-api-xyd5.onrender.com

This file records everything done in this session so you (or anyone) can pick up
where we left off. Full audit report: `AUDIT-REPORT.md`.

---

## 1. What was done (in order)

1. **Full 15-phase audit** of the repo, live app, and Render deployment.
   Result: strong code, but critical operational gaps. Production readiness ~60%.
   → see `AUDIT-REPORT.md`.

2. **Six security fixes** (implemented, tested, deployed):
   - S1 Guest isolation — each guest now gets a unique throwaway account
     (`guest-<rand>@guest.pdfforge.local`, 100 MB quota) with 24 h auto-cleanup.
     Old shared `guest@pdfforge.local` account deleted from the DB.
   - S2 `multer` upgraded 1.x → 2.x (DoS CVEs).
   - S3 Magic-byte upload validation (`apps/api/src/lib/sniff.ts`) — files whose
     bytes don't match their declared type are rejected.
   - S6 Security headers added to the web app (HSTS, CSP, Permissions-Policy) in
     `apps/web/next.config.ts`.
   - S7 Scheduled token purge in `apps/api/src/index.ts` (boot + every 12 h;
     revoked tokens kept 7 days for reuse-detection).
   - S4 SMTP + Google OAuth env slots added to `render.yaml` (values set in
     dashboard; not yet configured — email verification still cosmetic).

3. **Fixed two deploy-breaking bugs found along the way:**
   - Windows-generated `package-lock.json` omitted Linux native binaries →
     Dockerfiles changed to install fresh (not copy the lockfile).
   - `render.yaml` pointed at the wrong API URL → corrected to the real
     suffixed subdomain `pdftool-api-xyd5.onrender.com`.

4. **Database migrated off the expiring Render free Postgres → Neon**
   (free, no expiry). Data copied with `scripts/migrate-to-neon.mjs`
   (3 users, 16 sessions, 1 file, 9 activities). `render.yaml` updated so the
   blueprint no longer recreates the old DB. Sign-in verified.

5. **Durable file storage → Supabase (S3-compatible).** Refactored
   `apps/api/src/lib/storage.ts` into a driver interface (local disk + S3/R2).
   `STORAGE_DRIVER=s3` in production. Uploads now survive restarts (previously
   lost on every deploy/sleep because Render's free disk is ephemeral).
   Verified live: uploaded a test PDF as guest, it stored + read back from
   Supabase. New dep: `@aws-sdk/client-s3`.

6. **GitHub Actions CI** (`.github/workflows/ci.yml`): on every push/PR to main
   runs install → prisma generate → typecheck → lint (advisory) → test → build.
   Install removes the Windows lockfile first (same Linux-binary reason as #3).

---

## 2. Current live configuration

**Neon** — PostgreSQL database (free, no expiry). Connection string is set as
`DATABASE_URL` on the Render `pdftool-api` service.

**Supabase** — object storage bucket `pdfforge-files`. Render `pdftool-api` env:
- `STORAGE_DRIVER=s3`
- `S3_BUCKET=pdfforge-files`
- `S3_ENDPOINT=https://cpseztzafaclmfmdtwsy.storage.supabase.co/storage/v1/s3`
- `S3_REGION=us-east-1`
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (secret, in dashboard)
- `S3_FORCE_PATH_STYLE=true`

**Render** — two free Docker web services (`pdftool-api`, `pdftool-web`) + the
old `pdftool-db` (now unused, safe to delete once confident). Free tier sleeps
after 15 min idle → first request after idle takes ~30–60 s (the 502s you saw
were just cold starts, not failures).

---

## 3. Outstanding items YOU need to do (I can't)

1. **Revoke the GitHub tokens** — two fine-grained tokens were pasted in chat.
   github.com → Settings → Developer settings → Fine-grained tokens → delete.
   Future pushes use the browser sign-in (Git Credential Manager) already set up.
2. **Rotate the Neon DB password** — it appeared in a screenshot. Neon → project
   → Roles → reset password → update `DATABASE_URL` on Render to match.
3. **Confirm the CI run is green** on the Actions tab (last fix: remove Windows
   lockfile before install). If red, the failing step's log shows what to fix.
4. *(Optional)* Delete the old `pdftool-db` on Render once you trust Neon.

---

## 4. Roadmap — not yet done (from the audit)

**Should have**
- SMTP (free Brevo/Resend) so email verification actually works — env slots are
  already in `render.yaml`, just add values in the dashboard.
- Password protect / unlock PDFs (via `qpdf`) — table-stakes vs competitors.
- E-signatures (draw / type / upload) — the edit pipeline already covers ~80%.
- Prisma migrations instead of `db push --accept-data-loss` on boot.

**Nice to have**
- Dark mode; tool-grid dashboard; branded 404 page.
- Page numbers / headers-footers; crop; metadata editor; ZIP download; flatten.
- Compiled API build (ship `dist/` instead of running `tsx` at runtime).
- Response compression + request logging on the API.

---

## 5. Helper scripts created this session

- `scripts/delete-old-guest.mjs` — removed the legacy shared guest account (done).
- `scripts/migrate-to-neon.mjs` — copied data Render → Neon (done). Re-runnable.

## 6. How to work on this project

Always run commands from the project root:
```
cd "C:\Users\TEI-1420\Downloads\pdf tool\pdfforge"
```
Common commands:
```
npm install            # after pulling changes
npm test               # run the API test suite (72 tests)
npm run typecheck
git add -A && git commit -m "..." && git push   # deploys automatically via Render
```
Pushing to `main` triggers both a Render redeploy and the GitHub Actions CI.
