import type { Metadata } from "next";
import "./globals.css";
import "./brand-rollout.css";
import "./marketing/real-feature-visuals.css";

export const metadata: Metadata = {
  title: "DizyTrades — DizyCharts & DizySignals",
  description:
    "Private MEXC perpetual charting, confluence analysis, paper trading and risk controls.",
  other: {
    "dizytrades-mode": "test",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
