import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "./globals.css";

// Exposed as a CSS variable (not the body font) so only the PDF editor's
// text-overlay preview uses it — the app's own typography is unchanged.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const SITE_URL = process.env.WEB_URL ?? "https://pdftool4u.duckdns.org";
const SITE_NAME = "PDF Tool";
const TITLE = `${SITE_NAME} — Edit, Convert & Organize PDFs Online`;
const DESCRIPTION =
  "Free online PDF toolkit: merge, split, compress, convert, edit, redact, sign and protect PDF files. Private by design — your files stay in your browser, never on our servers.";

export const metadata: Metadata = {
  // Required so relative OG image / canonical URLs resolve to absolute ones.
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "PDF editor",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "convert PDF",
    "PDF to image",
    "sign PDF",
    "redact PDF",
    "protect PDF",
    "online PDF tool",
  ],
  authors: [{ name: "Mukesh Roy" }],
  creator: "Mukesh Roy",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: { icon: "/icon.svg" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

/** Structured data so search engines can render a rich result for the app. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web browser)",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Merge PDF",
    "Split PDF",
    "Compress PDF",
    "Convert PDF to images and images to PDF",
    "Edit and annotate PDF",
    "Redact PDF",
    "Fill PDF forms",
    "Sign PDF",
    "Password-protect PDF",
    "Add page numbers and watermarks",
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // CSP nonce minted per request in src/middleware.ts. Inline <script> tags
  // must carry it or the policy will (correctly) block them.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        {/* Keyboard users can jump straight past the header nav. Visually
            hidden until it receives focus. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
