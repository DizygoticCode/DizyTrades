import type { Metadata } from "next";
import MarketingPage from "./marketing/marketing-page";

export const metadata: Metadata = {
  title: "Everything Dizy™ | DizyTrades",
  description: "Discover, analyse, research, simulate, reconcile, replay, review and improve crypto trading decisions in one transparent workspace.",
  openGraph: {
    title: "Everything Dizy™ | DizyTrades",
    description: "One evidence-first crypto workspace for charting, signals, order flow, DizyQuant research, scanning, structure, realistic simulation, owner-only read-only account reconciliation, replay, review, performance, education and recovery.",
    type: "website",
  },
};

export default function Home() {
  return <MarketingPage />;
}
