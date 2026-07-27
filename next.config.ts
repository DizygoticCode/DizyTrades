import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_TRADINGVIEW_LAYOUT_URL: process.env.TRADINGVIEW_LAYOUT_URL },
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com; style-src 'self' 'unsafe-inline' https://*.tradingview.com; img-src 'self' data: blob: https://*.tradingview.com; frame-src https://*.tradingview.com; connect-src 'self' https://*.tradingview.com wss://contract.mexc.com; font-src 'self' data: https://*.tradingview.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" }] }];
  },
};

export default nextConfig;
