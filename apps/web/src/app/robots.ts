import type { MetadataRoute } from "next";

const BASE_URL = process.env.WEB_URL ?? "https://pdftool4u.duckdns.org";

/** robots.txt — allow the public pages, keep app/auth surfaces out of indexes. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/help"],
        // Private app surfaces: nothing useful for a crawler, and file URLs
        // are meaningless outside the owner's browser anyway.
        disallow: [
          "/dashboard",
          "/files/",
          "/settings",
          "/admin",
          "/api/",
          "/auth/",
          // Credential surfaces: nothing to index, and keeping them out avoids
          // password-reset links ever showing up in a crawl.
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
