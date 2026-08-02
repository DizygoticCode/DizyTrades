import type { Metadata } from "next";
import MarketingPage from "./marketing/marketing-page";

export const metadata: Metadata = {
  title: "Everything Dizy™ | DizyTrades",
  description: "Discover, analyse, simulate, replay, review and improve crypto trading decisions in one transparent workspace.",
  openGraph: {
    title: "Everything Dizy™ | DizyTrades",
    description: "One evidence-first crypto workspace for charting, signals, order flow, scanning, structure, paper trading, replay, review, performance, education and recovery.",
    type: "website",
  },
};

export default function Home() {
  return <MarketingPage />;
}
