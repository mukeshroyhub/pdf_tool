import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Pages that must never be stored by a browser, proxy or CDN: they either
 * render authenticated data or handle credentials. Shared browsers would
 * otherwise serve a previous user's page from the back/forward cache.
 */
const NO_STORE_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/callback",
  "/dashboard",
  "/settings",
  "/admin",
  "/files/:path*",
];

const NO_STORE_HEADERS = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  // Keep authenticated pages out of search indexes and link previews.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@pdfforge/shared"],
  // Don't advertise the framework/version — free recon for an attacker.
  poweredByHeader: false,
  // Proxy API calls through Next so the browser talks to a single origin
  // (no CORS in the browser, cookies stay first-party).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // NOTE: Content-Security-Policy is NOT set here. It is issued
          // per-request by src/middleware.ts so each response carries a fresh
          // nonce and the policy can drop script-src 'unsafe-inline'. Setting
          // it in both places would send two CSP headers and browsers enforce
          // the intersection, which is a foot-gun.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()",
          },
          // Cross-origin isolation hardening (Spectre-class side channels).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      // Auth + authenticated app surfaces: never cache, never index.
      ...NO_STORE_PATHS.map((source) => ({ source, headers: NO_STORE_HEADERS })),
      // The API proxy carries user data — same rule.
      { source: "/api/:path*", headers: NO_STORE_HEADERS },
    ];
  },
};

export default nextConfig;
