import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Exposed as a CSS variable (not the body font) so only the PDF editor's
// text-overlay preview uses it — the app's own typography is unchanged.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PDF Tool", template: "%s · PDF Tool" },
  description: "Edit, convert, organize and sign PDF files online.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
