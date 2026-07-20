import type { MetadataRoute } from "next";

const BASE_URL = process.env.WEB_URL ?? "https://pdftool4u.duckdns.org";

/**
 * sitemap.xml for the public pages. /help is the SEO surface (13 feature
 * guides); the root redirects visitors into the app.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    // /login and /register are intentionally absent: they now ship
    // `X-Robots-Tag: noindex`, and listing a noindexed URL in the sitemap is a
    // contradictory signal that Search Console flags as an error.
  ];
}
