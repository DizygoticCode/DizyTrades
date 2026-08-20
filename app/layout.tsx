import type { Metadata, Viewport } from "next";
import { CommandPaletteMounted } from "./command-palette-mounted";
import { HeatmapSettingsPortal } from "./heatmap-settings-portal";
import { ProductNavigation } from "./product-navigation";
import "./globals.css";
import "./responsive-audit.css";
import "./accessibility-audit.css";
import "./brand-rollout.css";
import "./marketing/real-feature-visuals.css";
import "./terminal-visual-fixes.css";
import "./terminal-responsive-polish.css";
import "./terminal-scrollbar-polish.css";
import "./terminal-topbar-polish.css";
import "./heatmap-settings.css";
import "./navigation-shell-cleanup.css";
import "./terminal-responsive-mobile.css";

export const metadata: Metadata = {
  title: "DizyTrades — DizyCharts & DizySignals",
  description:
    "Private MEXC perpetual charting, confluence analysis, paper trading and risk controls.",
  other: {
    "dizytrades-mode": "test",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080a10",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CommandPaletteMounted />
        <HeatmapSettingsPortal />
        <ProductNavigation />
        {children}
      </body>
    </html>
  );
}
