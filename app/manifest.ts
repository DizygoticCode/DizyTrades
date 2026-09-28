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
    icons: [{ src: "/brand/dizy-mark.svg", type: "image/svg+xml", sizes: "any", purpose: "any" }],
  };
}
