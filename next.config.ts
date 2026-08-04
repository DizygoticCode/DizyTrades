import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com",
  "style-src 'self' 'unsafe-inline' https://*.tradingview.com",
  "img-src 'self' data: blob: https://*.tradingview.com",
  "frame-src https://*.tradingview.com",
  "connect-src 'self' https://*.tradingview.com wss://api.mexc.com",
  "font-src 'self' data: https://*.tradingview.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

export const productionResponseHeaders = Object.freeze([
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
]);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_TRADINGVIEW_LAYOUT_URL: process.env.TRADINGVIEW_LAYOUT_URL,
  },
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...productionResponseHeaders],
      },
    ];
  },
};

export default nextConfig;
