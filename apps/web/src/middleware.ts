import { NextResponse, type NextRequest } from "next/server";

/**
 * Nonce-based Content-Security-Policy.
 *
 * The previous policy needed script-src 'unsafe-inline' because Next.js emits
 * inline bootstrap/hydration scripts. That defeats most of the XSS protection a
 * CSP is there to provide. Instead we mint a fresh random nonce per request and
 * hand it to Next through the `x-nonce` request header — Next then stamps that
 * nonce onto every script tag it generates, so the policy can drop
 * 'unsafe-inline' entirely.
 *
 * Notes:
 * - 'strict-dynamic' lets a nonce-approved script load its own chunks, which is
 *   how the Next.js runtime pulls in route bundles.
 * - style-src keeps 'unsafe-inline': Tailwind/Radix/framer-motion set inline
 *   styles at runtime, and style injection is not an RCE-class risk.
 * - 'wasm-unsafe-eval' + blob: workers are required by pdf.js.
 * - Dev mode keeps 'unsafe-eval' for Fast Refresh.
 */
const isDev = process.env.NODE_ENV !== "production";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // NB: once a nonce is present browsers ignore 'unsafe-inline' entirely, so
    // there is no point listing it. Dev only adds 'unsafe-eval' for Fast Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Would break plain-http://localhost during development.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // Pass the nonce down to the renderer.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on documents only. Static assets, images, the favicon and the
     * prefetch/RSC data requests don't need a policy and skipping them keeps
     * the middleware off the hot path.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
