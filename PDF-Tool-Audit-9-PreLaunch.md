# PDF Tool — Audit #9 (Pre-Launch Review)

**Live:** https://pdftool4u.duckdns.org · AWS EC2 Mumbai, Elastic IP 15.206.57.5
**Date:** 20 July 2026 · **Prepared for:** Mukesh Kumar
**Series:** 89 → 92 → 93 → 95 → 96 → 97 → 98 → **98 (code) / pending deploy**

---

## Overall: 98/100 in code — but NOT yet on the live site

This is the one audit where the headline number comes with an asterisk. A large,
high-quality remediation (12 security / accessibility / SEO findings) plus the
LinkedIn launch assets are **written and reviewed but not deployed**. The live
site is still running the previous build. **Do not announce on LinkedIn until the
deploy is live and verified** — the launch traffic should hit the hardened,
SEO-optimised version, not the old one.

---

## 1. Remediation review (the 12 findings)

I reviewed every change in the tree. Engineering quality is **high** — these are
correct, boundary-appropriate fixes, not edge patches.

| # | Finding | Fix | Verdict |
|---|---------|-----|---------|
| 1 | Login form defaulted to GET (password could leak to URL/logs pre-hydration) | `method="post"` + explicit action on every form | ✅ Correct |
| 2 | Auth pages cacheable (shared-machine leak via bfcache) | `no-store` at **both** Next and Caddy layers; hashed assets stay immutable | ✅ Defence in depth |
| 3 | No H1 / ARIA / skip link on most-crawled pages | Polymorphic `CardTitle as="h1"`, skip link, ARIA labels, labelled spinners, `required` fields | ✅ Thorough |
| 4 | `X-Powered-By: Next.js` exposed | `poweredByHeader:false` + Caddy strip | ✅ |
| 5 | CSP had `script-src 'unsafe-inline'` (nullified XSS protection) | **Nonce-based CSP** via new `middleware.ts`, single source, `strict-dynamic` | ✅ Textbook Next 15 pattern |
| 6 | Refresh fired 401 on every cold load | Readable `pf_session` hint cookie; skip refresh when absent | ✅ Set *and* cleared correctly |
| 7 | Missing SEO metadata | Full OG/Twitter/canonical/robots + JSON-LD (nonce'd) | ✅ (see fixes below) |
| 8 | Wasted JS on login page | Auth layout → server component, framer-motion removed, CSS animation, `prefetch={false}` | ✅ Faster + reduced-motion safe |

**Gaps I found and fixed during review:**

- **Metadata contradicted the product** — it claimed "PDF to Word/Excel" (removed
  long ago) and "files auto-deleted" (they persist in-browser). Rewritten to the
  true story: *"Private by design — your files stay in your browser, never on our
  servers."* Your differentiator should sell you, not mislead.
- **Caddy log directory** (`/var/log/caddy`) doesn't exist in the stock image — the
  container would fail to start. Added a `caddy_logs` volume (exists + persists).
- Keyword accuracy: "PDF to Word" → "PDF to image".

**Launch asset added:** a 1200×630 Open Graph image (`opengraph-image.png` +
`twitter-image.png`) so the LinkedIn link preview shows a branded card, not bare
text. Headline: "Edit PDFs online. Your files never leave your browser."

---

## 2. Findings (this audit)

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| F19 | **HIGH** | Remediation + launch assets are committed to the tree but **not deployed**. Live site is the old build. | Deploy before announcing (steps below). |
| F20 | **MEDIUM** | The nonce CSP is the highest-risk change — it can block a script that was silently allowed before. | Post-deploy: DevTools Console must be clean on `/login`, `/dashboard`, and the **editor**. |
| F21 | LOW | HSTS now carries `preload`. Harmless unless you submit to the preload list — but that's a one-way, all-subdomains-HTTPS-forever commitment. | Don't submit to preload list for now; the max-age alone is safe. |
| F22 | LOW | New CSP/header behaviour has no automated test. | Add an E2E header assertion (`no-store`, no `X-Powered-By`, nonce present). |
| F15 | LOW | Rotate `ADMIN_KEY` (shown in a screenshot). | 2 min on the box. |
| F8 | INFO | Mobile/touch pass still pending. | An evening. |

---

## 3. Pre-launch checklist (do in order)

1. **Deploy** — PowerShell: `pnpm typecheck && pnpm --filter @pdfforge/web build`,
   commit, push; then on Mumbai `git pull && docker compose -f docker-compose.oracle.yml up -d --build`.
2. **CSP smoke test** — open `/login`, `/dashboard`, editor with F12 Console.
   Zero "Refused to execute inline script" errors. If any → screenshot to fix.
3. **Sign out / in once** — issues the new `pf_session` cookie.
4. **Verify the link preview** — paste `https://pdftool4u.duckdns.org` into the
   [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) to confirm
   the OG card renders (and to prime LinkedIn's cache before you post).
5. **Submit sitemap** to Google Search Console (`/sitemap.xml`) — launch is the
   right moment to start earning search traffic.
6. **Then post.**

---

## 4. Verdict

**Excellent pre-launch state.** The remediation lifts security to A-grade, fixes
the accessibility and SEO gaps that would have embarrassed a public launch, and
the metadata now tells your genuine privacy story. The only thing between you and
a strong launch is **shipping it** — the code is ready; the live site isn't yet.
Deploy, run the CSP console check, verify the LinkedIn preview, then announce.

*Ninth audit in series. Delivered as Markdown (PDF generator offline this session).*
