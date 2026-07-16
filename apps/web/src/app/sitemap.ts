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
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
