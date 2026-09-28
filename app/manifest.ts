import type { MetadataRoute } from "next";

// Install metadata only: authenticated state and actions stay on the HTTPS server.
// There is deliberately no service worker or offline application shell here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DizyTrades — DizyCharts & DizySignals",
    short_name: "DizyTrades",
    description: "Crypto charts, research and paper-trading tools. Live exchange execution remains disabled.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#080a10",
    theme_color: "#080a10",
    icons: [
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
      { src: "/brand/dizy-mark.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
    ],
  };
}
